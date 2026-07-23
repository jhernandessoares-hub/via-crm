import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinImportFormat, FinTxStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinLancamentosService } from './lancamentos.service';
import { FinCadastrosService } from './cadastros.service';
import { finSerialize, parseDateOnly, roundMoney, sumAmortizado } from './fin-shared.util';
import { parseOfx } from './parsers/ofx.parser';
import { parsePlanilha } from './parsers/planilha.parser';
import { ParsedTransaction } from './parsers/parser.types';

const MATCH_PAYMENT_DIAS = 3;
const MATCH_ENTRY_DIAS = 5;

@Injectable()
export class FinConciliacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lancamentos: FinLancamentosService,
    private readonly cadastros: FinCadastrosService,
  ) {}

  // ---------- Importação ----------

  async importar(
    bankAccountId: string,
    file: { buffer: Buffer; originalname: string; size: number },
    adminId?: string,
  ) {
    if (!file?.buffer) throw new BadRequestException('Envie um arquivo no campo "file"');
    const conta = await this.prisma.finBankAccount.findUnique({ where: { id: bankAccountId } });
    if (!conta || !conta.ativo) throw new BadRequestException('Conta bancária inválida ou inativa');

    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    let formato: FinImportFormat;
    let parsed: ParsedTransaction[];
    if (ext === 'ofx') {
      formato = 'OFX';
      parsed = parseOfx(file.buffer);
    } else if (ext === 'csv') {
      formato = 'CSV';
      parsed = parsePlanilha(file.buffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      formato = 'XLSX';
      parsed = parsePlanilha(file.buffer);
    } else {
      throw new BadRequestException('Extensão não suportada — envie .ofx, .csv, .xls ou .xlsx');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const imp = await tx.finBankStatementImport.create({
        data: {
          bankAccountId,
          formato,
          filename: file.originalname,
          totalLinhas: parsed.length,
          importadas: 0,
          duplicadas: 0,
          createdBy: adminId || null,
        },
      });

      const rows = parsed.map((t) => ({
        importId: imp.id,
        bankAccountId,
        data: parseDateOnly(t.data, 'data'),
        valor: t.valor,
        descricao: t.descricao.slice(0, 500),
        fitId: t.fitId || null,
        hash: this.txHash(bankAccountId, t),
      }));

      // Dedup também dentro do próprio arquivo (mesmo hash em 2 linhas)
      const seen = new Set<string>();
      const uniqueRows = rows.filter((r) => (seen.has(r.hash) ? false : (seen.add(r.hash), true)));

      const createResult = await tx.finBankTransaction.createMany({
        data: uniqueRows,
        skipDuplicates: true, // unique [bankAccountId, hash] — reimportar o mesmo extrato não duplica
      });

      const importadas = createResult.count;
      const duplicadas = parsed.length - importadas;
      await tx.finBankStatementImport.update({
        where: { id: imp.id },
        data: { importadas, duplicadas },
      });

      return { importId: imp.id, totalLinhas: parsed.length, importadas, duplicadas };
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_IMPORT_STATEMENT',
      resourceType: 'FinBankStatementImport',
      resourceId: result.importId,
      metadata: { bankAccountId, filename: file.originalname, ...result },
    });

    return result;
  }

  private txHash(bankAccountId: string, t: ParsedTransaction): string {
    const key = t.fitId
      ? `${bankAccountId}|${t.fitId}`
      : `${bankAccountId}|${t.data}|${t.valor.toFixed(2)}|${t.descricao.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    return createHash('sha256').update(key).digest('hex');
  }

  async listImportacoes(bankAccountId?: string) {
    const imports = await this.prisma.finBankStatementImport.findMany({
      where: bankAccountId ? { bankAccountId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { bankAccount: { select: { id: true, nome: true } } },
    });
    return finSerialize(imports);
  }

  // ---------- Transações + sugestões ----------

  async listTransacoes(query: { bankAccountId: string; status?: FinTxStatus; de?: string; ate?: string }) {
    if (!query.bankAccountId) throw new BadRequestException('bankAccountId é obrigatório');
    const where: Prisma.FinBankTransactionWhereInput = { bankAccountId: query.bankAccountId };
    if (query.status) where.status = query.status;
    if (query.de || query.ate) {
      where.data = {
        ...(query.de ? { gte: parseDateOnly(query.de, 'de') } : {}),
        ...(query.ate ? { lte: parseDateOnly(query.ate, 'ate') } : {}),
      };
    }

    const txs = await this.prisma.finBankTransaction.findMany({
      where,
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        payment: {
          select: {
            id: true,
            valor: true,
            dataPagamento: true,
            entry: { select: { id: true, descricao: true, tipo: true } },
          },
        },
      },
    });

    const result: any[] = [];
    for (const tx of txs) {
      const base = finSerialize(tx);
      if (tx.status === 'PENDENTE') {
        base.sugestao = await this.sugerirMatch(tx);
      }
      result.push(base);
    }
    return result;
  }

  /**
   * Sugestão automática — NUNCA concilia sozinha; só quando há exatamente 1 candidato:
   * (a) baixa sem vínculo, mesma conta, valor idêntico, sinal compatível, ±3 dias;
   * (b) senão título ABERTO/PARCIAL com saldo restante idêntico, ±5 dias do vencimento.
   */
  private async sugerirMatch(tx: {
    id: string;
    bankAccountId: string;
    data: Date;
    valor: Prisma.Decimal;
  }): Promise<any | null> {
    const abs = roundMoney(Math.abs(tx.valor.toNumber()));
    const tipo = tx.valor.toNumber() < 0 ? 'PAGAR' : 'RECEBER';
    const dayMs = 24 * 60 * 60 * 1000;

    // (a) baixa existente sem conciliação
    const payments = await this.prisma.finPayment.findMany({
      where: {
        bankTransactionId: null,
        bankAccountId: tx.bankAccountId,
        valor: abs,
        dataPagamento: {
          gte: new Date(tx.data.getTime() - MATCH_PAYMENT_DIAS * dayMs),
          lte: new Date(tx.data.getTime() + MATCH_PAYMENT_DIAS * dayMs),
        },
        entry: { tipo },
      },
      take: 2,
      include: { entry: { select: { id: true, descricao: true, tipo: true, vencimento: true } } },
    });
    if (payments.length === 1) {
      return { kind: 'payment', payment: finSerialize(payments[0]) };
    }
    if (payments.length > 1) return null; // ambíguo — decisão humana

    // (b) título em aberto com saldo restante idêntico
    const entries = await this.prisma.finEntry.findMany({
      where: {
        tipo,
        status: { in: ['ABERTO', 'PARCIAL'] },
        vencimento: {
          gte: new Date(tx.data.getTime() - MATCH_ENTRY_DIAS * dayMs),
          lte: new Date(tx.data.getTime() + MATCH_ENTRY_DIAS * dayMs),
        },
      },
      take: 20,
      include: {
        payments: { select: { valor: true, desconto: true, jurosMulta: true } },
        contact: { select: { nome: true } },
      },
    });
    const candidatos = entries.filter((e) => roundMoney(e.valor.toNumber() - sumAmortizado(e.payments)) === abs);
    if (candidatos.length === 1) {
      const e = candidatos[0];
      return {
        kind: 'entry',
        entry: finSerialize({
          id: e.id,
          descricao: e.descricao,
          tipo: e.tipo,
          vencimento: e.vencimento,
          valor: e.valor,
          contactNome: e.contact?.nome ?? null,
        }),
      };
    }
    return null;
  }

  // ---------- Ações de conciliação ----------

  /** { paymentId } vincula baixa existente; { entryId } baixa o título e concilia numa transação. */
  async conciliar(txId: string, data: { paymentId?: string; entryId?: string }, adminId?: string) {
    const tx = await this.prisma.finBankTransaction.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    if (tx.status !== 'PENDENTE') throw new BadRequestException('Transação não está pendente');
    if (!data.paymentId && !data.entryId) throw new BadRequestException('Informe paymentId ou entryId');

    await this.prisma.$transaction(async (ptx) => {
      let paymentId = data.paymentId;

      if (data.entryId) {
        // Baixa o título com a data e o valor da linha do extrato
        const entry = await ptx.finEntry.findUnique({
          where: { id: data.entryId },
          include: { payments: { select: { valor: true, desconto: true, jurosMulta: true } } },
        });
        if (!entry) throw new NotFoundException('Lançamento não encontrado');
        if (entry.status === 'CANCELADO' || entry.status === 'PAGO') {
          throw new BadRequestException('Lançamento não está em aberto');
        }
        const tipoEsperado = tx.valor.toNumber() < 0 ? 'PAGAR' : 'RECEBER';
        if (entry.tipo !== tipoEsperado) {
          throw new BadRequestException(
            `Sinal da transação (${tipoEsperado === 'PAGAR' ? 'saída' : 'entrada'}) não combina com o tipo do lançamento`,
          );
        }
        const abs = roundMoney(Math.abs(tx.valor.toNumber()));
        const saldo = roundMoney(entry.valor.toNumber() - sumAmortizado(entry.payments));
        if (abs > saldo + 0.005) {
          throw new BadRequestException(
            `Valor da transação (R$ ${abs.toFixed(2)}) maior que o saldo do título (R$ ${saldo.toFixed(2)})`,
          );
        }
        const payment = await ptx.finPayment.create({
          data: {
            entryId: data.entryId,
            bankAccountId: tx.bankAccountId,
            dataPagamento: tx.data,
            valor: abs,
            observacao: 'Baixa via conciliação bancária',
            createdBy: adminId || null,
          },
        });
        await this.lancamentos.recomputeStatus(ptx, data.entryId);
        paymentId = payment.id;
      } else {
        const payment = await ptx.finPayment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new NotFoundException('Baixa não encontrada');
        if (payment.bankTransactionId) throw new BadRequestException('Baixa já conciliada com outra transação');
        if (payment.bankAccountId !== tx.bankAccountId) {
          throw new BadRequestException('Baixa pertence a outra conta bancária');
        }
      }

      await ptx.finPayment.update({
        where: { id: paymentId },
        data: { bankTransactionId: txId },
      });
      await ptx.finBankTransaction.update({ where: { id: txId }, data: { status: 'CONCILIADO' } });
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_RECONCILE',
      resourceType: 'FinBankTransaction',
      resourceId: txId,
      metadata: { via: data.entryId ? 'entry' : 'payment', paymentId: data.paymentId, entryId: data.entryId },
    });

    return { reconciled: true };
  }

  /** Linha órfã → cria título já PAGO + baixa vinculada (tarifas, despesas de cartão, etc.). */
  async criarLancamento(
    txId: string,
    data: { categoriaId: string; descricao?: string; contactId?: string; contractId?: string },
    adminId?: string,
  ) {
    const tx = await this.prisma.finBankTransaction.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    if (tx.status !== 'PENDENTE') throw new BadRequestException('Transação não está pendente');

    const tipo = tx.valor.toNumber() < 0 ? 'PAGAR' : 'RECEBER';
    const tipoCategoria = tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
    await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);

    const abs = roundMoney(Math.abs(tx.valor.toNumber()));
    const competencia = new Date(Date.UTC(tx.data.getUTCFullYear(), tx.data.getUTCMonth(), 1));

    const entry = await this.prisma.$transaction(async (ptx) => {
      const created = await ptx.finEntry.create({
        data: {
          tipo,
          descricao: data.descricao?.trim() || tx.descricao,
          categoriaId: data.categoriaId,
          contactId: data.contactId || null,
          contractId: data.contractId || null,
          competencia,
          vencimento: tx.data,
          valor: abs,
          status: 'PAGO',
          observacao: 'Criado a partir da conciliação bancária',
          createdBy: adminId || null,
        },
      });
      await ptx.finPayment.create({
        data: {
          entryId: created.id,
          bankAccountId: tx.bankAccountId,
          dataPagamento: tx.data,
          valor: abs,
          bankTransactionId: txId,
          createdBy: adminId || null,
        },
      });
      await ptx.finBankTransaction.update({ where: { id: txId }, data: { status: 'CONCILIADO' } });
      return created;
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_RECONCILE',
      resourceType: 'FinBankTransaction',
      resourceId: txId,
      metadata: { via: 'criar-lancamento', entryId: entry.id, valor: abs },
    });

    return finSerialize(entry);
  }

  async ignorar(txId: string) {
    const tx = await this.prisma.finBankTransaction.findUnique({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    if (tx.status !== 'PENDENTE') throw new BadRequestException('Só transações pendentes podem ser ignoradas');
    await this.prisma.finBankTransaction.update({ where: { id: txId }, data: { status: 'IGNORADO' } });
    return { ignored: true };
  }

  /** CONCILIADO → desfaz vínculo (a baixa permanece); IGNORADO → volta a PENDENTE. */
  async desfazer(txId: string, adminId?: string) {
    const tx = await this.prisma.finBankTransaction.findUnique({
      where: { id: txId },
      include: { payment: { select: { id: true } } },
    });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    if (tx.status === 'PENDENTE') throw new BadRequestException('Transação já está pendente');

    await this.prisma.$transaction(async (ptx) => {
      if (tx.payment) {
        await ptx.finPayment.update({ where: { id: tx.payment.id }, data: { bankTransactionId: null } });
      }
      await ptx.finBankTransaction.update({ where: { id: txId }, data: { status: 'PENDENTE' } });
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_RECONCILE',
      resourceType: 'FinBankTransaction',
      resourceId: txId,
      metadata: { via: 'desfazer', statusAnterior: tx.status },
    });

    return { undone: true };
  }
}
