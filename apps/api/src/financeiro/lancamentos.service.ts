import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinEntryStatus, FinEntryType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinCadastrosService } from './cadastros.service';
import {
  addMonthsClamped,
  assertPositiveMoney,
  finSerialize,
  parseCompetencia,
  parseDateOnly,
  roundMoney,
  sumMoney,
} from './fin-shared.util';

const PAGE_SIZE_DEFAULT = 50;

export interface ListLancamentosQuery {
  tipo?: FinEntryType;
  status?: string; // ABERTO | PARCIAL | PAGO | CANCELADO | VENCIDO (computado)
  de?: string;
  ate?: string;
  categoriaId?: string;
  contactId?: string;
  tenantId?: string;
  busca?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class FinLancamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cadastros: FinCadastrosService,
  ) {}

  private hoje(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  async list(query: ListLancamentosQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || PAGE_SIZE_DEFAULT));
    const hoje = this.hoje();

    const where: Prisma.FinEntryWhereInput = {};
    if (query.tipo) where.tipo = query.tipo;
    if (query.categoriaId) where.categoriaId = query.categoriaId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.de || query.ate) {
      where.vencimento = {
        ...(query.de ? { gte: parseDateOnly(query.de, 'de') } : {}),
        ...(query.ate ? { lte: parseDateOnly(query.ate, 'ate') } : {}),
      };
    }
    if (query.busca?.trim()) {
      where.OR = [
        { descricao: { contains: query.busca.trim(), mode: 'insensitive' } },
        { observacao: { contains: query.busca.trim(), mode: 'insensitive' } },
        { contact: { nome: { contains: query.busca.trim(), mode: 'insensitive' } } },
      ];
    }
    if (query.status === 'VENCIDO') {
      where.status = { in: ['ABERTO', 'PARCIAL'] };
      where.vencimento = { ...(where.vencimento as object), lt: hoje };
    } else if (query.status) {
      where.status = query.status as FinEntryStatus;
    } else {
      where.status = { not: 'CANCELADO' };
    }

    const [total, items] = await Promise.all([
      this.prisma.finEntry.count({ where }),
      this.prisma.finEntry.findMany({
        where,
        orderBy: [{ vencimento: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          categoria: { select: { id: true, nome: true, parent: { select: { nome: true } } } },
          contact: { select: { id: true, nome: true } },
          payments: { select: { id: true, valor: true, dataPagamento: true, bankAccountId: true } },
          documents: { select: { id: true, tipo: true, numero: true, filename: true } },
        },
      }),
    ]);

    // Nome do tenant nas mensalidades
    const tenantIds = [...new Set(items.map((i) => i.tenantId).filter(Boolean))] as string[];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, nome: true } })
      : [];
    const tenantNome = new Map(tenants.map((t) => [t.id, t.nome]));

    const mapped = items.map((e) => {
      const valorPago = sumMoney(e.payments.map((p) => p.valor));
      const vencido = (e.status === 'ABERTO' || e.status === 'PARCIAL') && e.vencimento < hoje;
      return {
        ...finSerialize(e),
        valorPago,
        saldo: roundMoney(e.valor.toNumber() - valorPago),
        vencido,
        tenantNome: e.tenantId ? tenantNome.get(e.tenantId) || null : null,
      };
    });

    // Totalizadores do filtro (sem paginação)
    const allForTotals = await this.prisma.finEntry.findMany({
      where,
      select: { valor: true, payments: { select: { valor: true } } },
    });
    const totalValor = sumMoney(allForTotals.map((e) => e.valor));
    const totalPago = sumMoney(allForTotals.flatMap((e) => e.payments.map((p) => p.valor)));

    return {
      items: mapped,
      total,
      page,
      pageSize,
      totais: { valor: totalValor, pago: totalPago, saldo: roundMoney(totalValor - totalPago) },
    };
  }

  async create(
    data: {
      tipo: FinEntryType;
      descricao: string;
      categoriaId: string;
      contactId?: string;
      tenantId?: string;
      competencia: string;
      vencimento: string;
      valor: number;
      parcelas?: number;
      observacao?: string;
    },
    adminId?: string,
  ) {
    const descricao = (data.descricao || '').trim();
    if (!descricao) throw new BadRequestException('Descrição é obrigatória');
    const valor = assertPositiveMoney(data.valor, 'valor');
    const tipoCategoria = data.tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
    await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);

    const competencia = parseCompetencia(data.competencia);
    const vencimento = parseDateOnly(data.vencimento, 'vencimento');
    const parcelas = Math.min(120, Math.max(1, Math.floor(Number(data.parcelas) || 1)));

    const base = {
      tipo: data.tipo,
      categoriaId: data.categoriaId,
      contactId: data.contactId || null,
      tenantId: data.tenantId || null,
      observacao: data.observacao?.trim() || null,
      createdBy: adminId || null,
    };

    let created;
    if (parcelas === 1) {
      created = await this.prisma.finEntry.create({
        data: { ...base, descricao, competencia, vencimento, valor },
      });
    } else {
      // Divide em centavos: última parcela absorve a diferença de arredondamento
      const centavos = Math.round(valor * 100);
      const baseParcela = Math.floor(centavos / parcelas);
      const groupId = randomUUID();
      const rows = Array.from({ length: parcelas }, (_, i) => {
        const cents = i === parcelas - 1 ? centavos - baseParcela * (parcelas - 1) : baseParcela;
        return {
          ...base,
          descricao: `${descricao} (${i + 1}/${parcelas})`,
          competencia: addMonthsClamped(competencia, i),
          vencimento: addMonthsClamped(vencimento, i),
          valor: cents / 100,
          parcelaNum: i + 1,
          parcelaTotal: parcelas,
          parcelaGroupId: groupId,
        };
      });
      await this.prisma.finEntry.createMany({ data: rows });
      created = await this.prisma.finEntry.findMany({
        where: { parcelaGroupId: groupId },
        orderBy: { parcelaNum: 'asc' },
      });
    }

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_CREATE_ENTRY',
      resourceType: 'FinEntry',
      resourceId: Array.isArray(created) ? created[0]?.parcelaGroupId ?? undefined : created.id,
      metadata: { tipo: data.tipo, descricao, valor, parcelas },
    });

    return finSerialize(created);
  }

  async update(
    id: string,
    data: {
      descricao?: string;
      categoriaId?: string;
      contactId?: string | null;
      competencia?: string;
      vencimento?: string;
      valor?: number;
      observacao?: string | null;
    },
    adminId?: string,
  ) {
    const entry = await this.prisma.finEntry.findUnique({
      where: { id },
      include: { payments: { select: { valor: true } } },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    if (entry.status === 'CANCELADO') throw new BadRequestException('Lançamento cancelado não pode ser editado');

    const isPago = entry.status === 'PAGO';
    const tentandoCamposBloqueados =
      data.valor !== undefined || data.vencimento !== undefined || data.competencia !== undefined;
    if (isPago && tentandoCamposBloqueados) {
      throw new BadRequestException(
        'Lançamento pago: só é possível alterar descrição, categoria, contraparte e observação',
      );
    }

    const patch: Prisma.FinEntryUpdateInput = {};
    if (data.descricao !== undefined) {
      const d = data.descricao.trim();
      if (!d) throw new BadRequestException('Descrição é obrigatória');
      patch.descricao = d;
    }
    if (data.categoriaId !== undefined) {
      const tipoCategoria = entry.tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
      await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);
      patch.categoria = { connect: { id: data.categoriaId } };
    }
    if (data.contactId !== undefined) {
      patch.contact = data.contactId ? { connect: { id: data.contactId } } : { disconnect: true };
    }
    if (data.competencia !== undefined) patch.competencia = parseCompetencia(data.competencia);
    if (data.vencimento !== undefined) patch.vencimento = parseDateOnly(data.vencimento, 'vencimento');
    if (data.observacao !== undefined) patch.observacao = data.observacao?.trim() || null;
    if (data.valor !== undefined) {
      const novoValor = assertPositiveMoney(data.valor, 'valor');
      const valorPago = sumMoney(entry.payments.map((p) => p.valor));
      if (novoValor < valorPago) {
        throw new BadRequestException(
          `Valor não pode ser menor que o já pago (R$ ${valorPago.toFixed(2)}) — estorne as baixas antes`,
        );
      }
      patch.valor = novoValor;
      // Recalcula status com o novo valor
      patch.status = valorPago >= novoValor ? 'PAGO' : valorPago > 0 ? 'PARCIAL' : 'ABERTO';
    }

    const updated = await this.prisma.finEntry.update({ where: { id }, data: patch });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPDATE_ENTRY',
      resourceType: 'FinEntry',
      resourceId: id,
      metadata: { campos: Object.keys(data) },
    });

    return finSerialize(updated);
  }

  async cancelar(id: string, adminId?: string) {
    const entry = await this.prisma.finEntry.findUnique({
      where: { id },
      include: { _count: { select: { payments: true } } },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    if (entry.status === 'CANCELADO') throw new BadRequestException('Lançamento já está cancelado');
    if (entry._count.payments > 0) {
      throw new BadRequestException('Lançamento com baixas não pode ser cancelado — estorne os pagamentos antes');
    }
    const updated = await this.prisma.finEntry.update({ where: { id }, data: { status: 'CANCELADO' } });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_CANCEL_ENTRY',
      resourceType: 'FinEntry',
      resourceId: id,
      metadata: { descricao: entry.descricao, valor: entry.valor.toNumber() },
    });

    return finSerialize(updated);
  }

  async baixar(
    id: string,
    data: { bankAccountId: string; dataPagamento: string; valor: number; observacao?: string },
    adminId?: string,
  ) {
    const entry = await this.prisma.finEntry.findUnique({
      where: { id },
      include: { payments: { select: { valor: true } } },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    if (entry.status === 'CANCELADO' || entry.status === 'PAGO') {
      throw new BadRequestException(`Lançamento ${entry.status === 'PAGO' ? 'já pago' : 'cancelado'} não aceita baixa`);
    }

    const conta = await this.prisma.finBankAccount.findUnique({ where: { id: data.bankAccountId } });
    if (!conta || !conta.ativo) throw new BadRequestException('Conta bancária inválida ou inativa');

    const valor = assertPositiveMoney(data.valor, 'valor');
    const valorPago = sumMoney(entry.payments.map((p) => p.valor));
    const saldo = roundMoney(entry.valor.toNumber() - valorPago);
    if (valor > saldo + 0.005) {
      throw new BadRequestException(`Valor da baixa (R$ ${valor.toFixed(2)}) maior que o saldo (R$ ${saldo.toFixed(2)})`);
    }

    const dataPagamento = parseDateOnly(data.dataPagamento, 'dataPagamento');

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.finPayment.create({
        data: {
          entryId: id,
          bankAccountId: data.bankAccountId,
          dataPagamento,
          valor,
          observacao: data.observacao?.trim() || null,
          createdBy: adminId || null,
        },
      });
      await this.recomputeStatus(tx, id);
      return created;
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_PAYMENT',
      resourceType: 'FinPayment',
      resourceId: payment.id,
      metadata: { entryId: id, valor, dataPagamento: data.dataPagamento },
    });

    const updated = await this.prisma.finEntry.findUnique({
      where: { id },
      include: { payments: true },
    });
    return finSerialize(updated);
  }

  async estornarPagamento(paymentId: string, adminId?: string) {
    const payment = await this.prisma.finPayment.findUnique({
      where: { id: paymentId },
      include: { entry: { select: { id: true, descricao: true } } },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado');

    await this.prisma.$transaction(async (tx) => {
      // Desfaz conciliação se houver — a linha do extrato volta a PENDENTE
      if (payment.bankTransactionId) {
        await tx.finBankTransaction.update({
          where: { id: payment.bankTransactionId },
          data: { status: 'PENDENTE' },
        });
      }
      await tx.finPayment.delete({ where: { id: paymentId } });
      await this.recomputeStatus(tx, payment.entryId);
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_PAYMENT_REVERSAL',
      resourceType: 'FinPayment',
      resourceId: paymentId,
      metadata: {
        entryId: payment.entryId,
        valor: payment.valor.toNumber(),
        desconciliou: Boolean(payment.bankTransactionId),
      },
    });

    const updated = await this.prisma.finEntry.findUnique({
      where: { id: payment.entryId },
      include: { payments: true },
    });
    return finSerialize(updated);
  }

  /** Recalcula o status do título dentro da transação da baixa/estorno. */
  async recomputeStatus(tx: Prisma.TransactionClient, entryId: string) {
    const entry = await tx.finEntry.findUnique({
      where: { id: entryId },
      include: { payments: { select: { valor: true } } },
    });
    if (!entry || entry.status === 'CANCELADO') return;
    const valorPago = sumMoney(entry.payments.map((p) => p.valor));
    const valor = entry.valor.toNumber();
    const status: FinEntryStatus = valorPago >= valor - 0.005 && entry.payments.length > 0 ? 'PAGO' : valorPago > 0 ? 'PARCIAL' : 'ABERTO';
    if (status !== entry.status) {
      await tx.finEntry.update({ where: { id: entryId }, data: { status } });
    }
  }
}
