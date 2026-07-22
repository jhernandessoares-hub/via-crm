import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinDocumentType, FinEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { finSerialize, parseDateOnly, roundMoney, sumAmortizado, sumMoney } from './fin-shared.util';

@Injectable()
export class FinContratosService {
  constructor(private readonly prisma: PrismaService) {}

  private docTipoFaturavel(tipo: FinEntryType): FinDocumentType {
    return tipo === 'RECEBER' ? 'NF_EMITIDA' : 'NF_RECEBIDA';
  }

  /** valorFaturado = soma das notas fiscais (documento) vinculadas, do tipo compatível com o contrato. */
  private async comFaturamento<T extends { id: string; tipo: FinEntryType; valorTotal: any }>(
    contratos: T[],
  ): Promise<Array<T & { valorFaturado: number; saldoAFaturar: number | null }>> {
    if (contratos.length === 0) return [];
    const docs = await this.prisma.finDocument.findMany({
      where: { contractId: { in: contratos.map((c) => c.id) } },
      select: { contractId: true, tipo: true, valor: true },
    });
    return contratos.map((c) => {
      const tipoDoc = this.docTipoFaturavel(c.tipo);
      const valorFaturado = sumMoney(
        docs.filter((d) => d.contractId === c.id && d.tipo === tipoDoc && d.valor !== null).map((d) => d.valor!),
      );
      const valorTotal = c.valorTotal !== null && c.valorTotal !== undefined ? Number(c.valorTotal) : null;
      return {
        ...c,
        valorFaturado,
        saldoAFaturar: valorTotal !== null ? roundMoney(valorTotal - valorFaturado) : null,
      };
    });
  }

  /**
   * valorRealizado = soma (amortizada) das baixas de todos os títulos vinculados ao contrato.
   * valorEmAberto = soma do saldo restante dos títulos ainda ABERTO/PARCIAL vinculados ao contrato.
   * Reflete cobrança/pagamento real — diferente de valorFaturado (baseado na nota fiscal).
   */
  private async comCobranca<T extends { id: string }>(
    contratos: T[],
  ): Promise<Array<T & { valorRealizado: number; valorEmAberto: number }>> {
    if (contratos.length === 0) return [];
    const entries = await this.prisma.finEntry.findMany({
      where: { contractId: { in: contratos.map((c) => c.id) }, status: { not: 'CANCELADO' } },
      select: {
        contractId: true,
        valor: true,
        status: true,
        payments: { select: { valor: true, desconto: true, jurosMulta: true } },
      },
    });
    return contratos.map((c) => {
      let valorRealizado = 0;
      let valorEmAberto = 0;
      for (const e of entries) {
        if (e.contractId !== c.id) continue;
        const amortizado = sumAmortizado(e.payments);
        valorRealizado = roundMoney(valorRealizado + amortizado);
        if (e.status === 'ABERTO' || e.status === 'PARCIAL') {
          valorEmAberto = roundMoney(valorEmAberto + Math.max(0, e.valor.toNumber() - amortizado));
        }
      }
      return { ...c, valorRealizado, valorEmAberto };
    });
  }

  async list(incluirInativos = false) {
    const contratos = await this.prisma.finContract.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: { createdAt: 'desc' },
      include: {
        contact: { select: { id: true, nome: true } },
        company: { select: { id: true, nome: true } },
        categoria: { select: { id: true, nome: true, parent: { select: { nome: true } } } },
        _count: { select: { documents: true, entries: true } },
      },
    });
    const comFat = await this.comFaturamento(contratos);
    return finSerialize(await this.comCobranca(comFat));
  }

  async get(id: string) {
    const contrato = await this.prisma.finContract.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, nome: true } },
        company: { select: { id: true, nome: true } },
        categoria: { select: { id: true, nome: true, parent: { select: { nome: true } } } },
      },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const [comFat] = await this.comFaturamento([contrato]);
    const [comCob] = await this.comCobranca([comFat]);
    return finSerialize(comCob);
  }

  async create(data: {
    numero?: string;
    descricao: string;
    tipo: FinEntryType;
    contactId?: string;
    companyId?: string;
    categoriaId?: string;
    valorTotal?: number;
    valorRecorrente?: number;
    dataInicio?: string;
    dataFim?: string;
    observacao?: string;
  }) {
    const descricao = (data.descricao || '').trim();
    if (!descricao) throw new BadRequestException('Descrição do contrato é obrigatória');
    const created = await this.prisma.finContract.create({
      data: {
        numero: data.numero?.trim() || null,
        descricao,
        tipo: data.tipo,
        contactId: data.contactId || null,
        companyId: data.companyId || null,
        categoriaId: data.categoriaId || null,
        valorTotal: data.valorTotal !== undefined ? roundMoney(Number(data.valorTotal) || 0) : null,
        valorRecorrente: data.valorRecorrente !== undefined ? roundMoney(Number(data.valorRecorrente) || 0) : null,
        dataInicio: data.dataInicio ? parseDateOnly(data.dataInicio, 'dataInicio') : null,
        dataFim: data.dataFim ? parseDateOnly(data.dataFim, 'dataFim') : null,
        observacao: data.observacao?.trim() || null,
      },
    });
    return finSerialize(created);
  }

  async update(
    id: string,
    data: {
      numero?: string | null;
      descricao?: string;
      contactId?: string | null;
      companyId?: string | null;
      categoriaId?: string | null;
      valorTotal?: number | null;
      valorRecorrente?: number | null;
      dataInicio?: string | null;
      dataFim?: string | null;
      observacao?: string | null;
      ativo?: boolean;
    },
  ) {
    const contrato = await this.prisma.finContract.findUnique({ where: { id } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const updated = await this.prisma.finContract.update({
      where: { id },
      data: {
        ...(data.numero !== undefined ? { numero: data.numero?.trim() || null } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao.trim() } : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId || null } : {}),
        ...(data.companyId !== undefined ? { companyId: data.companyId || null } : {}),
        ...(data.categoriaId !== undefined ? { categoriaId: data.categoriaId || null } : {}),
        ...(data.valorTotal !== undefined
          ? { valorTotal: data.valorTotal === null ? null : roundMoney(Number(data.valorTotal) || 0) }
          : {}),
        ...(data.valorRecorrente !== undefined
          ? { valorRecorrente: data.valorRecorrente === null ? null : roundMoney(Number(data.valorRecorrente) || 0) }
          : {}),
        ...(data.dataInicio !== undefined
          ? { dataInicio: data.dataInicio ? parseDateOnly(data.dataInicio, 'dataInicio') : null }
          : {}),
        ...(data.dataFim !== undefined ? { dataFim: data.dataFim ? parseDateOnly(data.dataFim, 'dataFim') : null } : {}),
        ...(data.observacao !== undefined ? { observacao: data.observacao?.trim() || null } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
      },
    });
    return finSerialize(updated);
  }

  async delete(id: string) {
    const contrato = await this.prisma.finContract.findUnique({
      where: { id },
      include: { _count: { select: { documents: true, entries: true } } },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const emUso = contrato._count.documents > 0 || contrato._count.entries > 0;
    if (emUso) {
      await this.prisma.finContract.update({ where: { id }, data: { ativo: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.finContract.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }
}
