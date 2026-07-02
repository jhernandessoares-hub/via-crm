import { Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getNextFamiliaNumber } from './pre-ocupacao-numbering.helper';
import { computeStatusAcompanhamento, countFaltas } from './pre-ocupacao-status.util';

@Injectable()
export class FamiliasService {
  private readonly logger = new Logger('PreOcupacaoFamiliasService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ativa uma família (Lead) no programa Pré-Ocupação. Idempotente: se já existe
   * família ativada para esse lead, retorna a existente em vez de erro — usado
   * também implicitamente por `DemandasService.vincularFamilia()`.
   */
  async ativar(tenantId: string, leadId: string, ativadoPor: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const existing = await this.prisma.preOcupacaoFamilia.findUnique({ where: { leadId } });
    if (existing) return existing;

    const familia = await this.prisma.$transaction(async (tx) => {
      const numero = await getNextFamiliaNumber(tx, tenantId);
      return tx.preOcupacaoFamilia.create({
        data: { tenantId, leadId, numero, ativadoPor: ativadoPor || 'desconhecido' },
      });
    });

    this.logger.log(`Família ativada: lead=${leadId} numero=${familia.numero} tenant=${tenantId}`);
    await this.audit.log({
      tenantId,
      action: 'PRE_OCUPACAO_ATIVAR_FAMILIA',
      resourceType: 'PreOcupacaoFamilia',
      resourceId: familia.id,
      metadata: { leadId, numero: familia.numero, ativadoPor },
    });

    return familia;
  }

  /** Resumo compacto para o painel do Lead. */
  async resumoPorLead(tenantId: string, leadId: string) {
    const familia = await this.prisma.preOcupacaoFamilia.findFirst({ where: { leadId, tenantId } });
    if (!familia) return { ativada: false as const };

    const participacoes = await this.prisma.preOcupacaoAtividadeParticipante.findMany({
      where: { familiaId: familia.id },
      include: {
        atividade: { select: { id: true, categoria: true, dataAgendada: true, titulo: true, local: true } },
      },
      orderBy: { atividade: { dataAgendada: 'desc' } },
    });

    const demandas = await this.prisma.preOcupacaoOcorrencia.findMany({
      where: { familiaId: familia.id, tenantId },
      orderBy: { abertaEm: 'desc' },
    });

    return {
      ativada: true as const,
      familia,
      status: computeStatusAcompanhamento(participacoes),
      faltas: countFaltas(participacoes),
      participacoesRecentes: participacoes.slice(0, 5),
      demandas,
    };
  }

  /** Lista todas as famílias do tenant + dashboard agregado. */
  async listar(tenantId: string, take?: number, skip?: number) {
    const familias = await this.prisma.preOcupacaoFamilia.findMany({
      where: { tenantId },
      include: { lead: { select: { nome: true, nomeCorreto: true, cpf: true } } },
      orderBy: { numero: 'asc' },
    });

    const familiaIds = familias.map((f) => f.id);
    const participantes = familiaIds.length
      ? await this.prisma.preOcupacaoAtividadeParticipante.findMany({
          where: { familiaId: { in: familiaIds } },
          select: { familiaId: true, status: true },
        })
      : [];
    const demandas = familiaIds.length
      ? await this.prisma.preOcupacaoOcorrencia.findMany({
          where: { familiaId: { in: familiaIds } },
          select: { familiaId: true, status: true },
        })
      : [];

    const porFamilia = new Map<string, { status: string }[]>();
    for (const p of participantes) {
      const arr = porFamilia.get(p.familiaId) ?? [];
      arr.push({ status: p.status });
      porFamilia.set(p.familiaId, arr);
    }
    const demandasPorFamilia = new Map<string, { status: string }[]>();
    for (const d of demandas) {
      if (!d.familiaId) continue;
      const arr = demandasPorFamilia.get(d.familiaId) ?? [];
      arr.push({ status: d.status });
      demandasPorFamilia.set(d.familiaId, arr);
    }

    const items = familias.map((f) => {
      const participacoes = porFamilia.get(f.id) ?? [];
      const demandasFamilia = demandasPorFamilia.get(f.id) ?? [];
      return {
        id: f.id,
        numero: f.numero,
        leadId: f.leadId,
        nome: f.lead.nomeCorreto ?? f.lead.nome,
        cpf: f.lead.cpf,
        statusFamilia: f.status, // ATIVA | CONCLUIDA | INATIVA (ciclo de vida no programa)
        status: computeStatusAcompanhamento(participacoes), // EM_DIA | COM_PENDENCIA (acompanhamento)
        faltas: countFaltas(participacoes),
        ativadoEm: f.ativadoEm,
        demandasTotal: demandasFamilia.length,
        demandasAbertas: demandasFamilia.filter((d) => d.status === 'ABERTA').length,
        demandasEncerradas: demandasFamilia.filter((d) => d.status === 'ENCERRADA').length,
      };
    });

    const dashboard = {
      total: items.length,
      emDia: items.filter((i) => i.status === 'EM_DIA').length,
      comPendencia: items.filter((i) => i.status === 'COM_PENDENCIA').length,
    };

    const paginated = typeof take === 'number' ? items.slice(skip ?? 0, (skip ?? 0) + take) : items;

    return { dashboard, items: paginated };
  }

  /** Detalhe completo por ID da família (não do lead). */
  async detalhe(tenantId: string, familiaId: string) {
    const familia = await this.prisma.preOcupacaoFamilia.findFirst({
      where: { id: familiaId, tenantId },
      include: { lead: true },
    });
    if (!familia) throw new NotFoundException('Família não encontrada.');

    const participacoes = await this.prisma.preOcupacaoAtividadeParticipante.findMany({
      where: { familiaId },
      include: { atividade: true, anexos: true },
      orderBy: { atividade: { dataAgendada: 'desc' } },
    });

    const ocorrencias = await this.prisma.preOcupacaoOcorrencia.findMany({
      where: { familiaId, tenantId },
      include: { anexos: true },
      orderBy: { abertaEm: 'desc' },
    });

    return {
      familia,
      status: computeStatusAcompanhamento(participacoes),
      faltas: countFaltas(participacoes),
      participacoes,
      ocorrencias,
    };
  }

  /** Usado por DemandasService para validar que a família pertence ao tenant. */
  async assertFamiliaAccess(tenantId: string, familiaId: string) {
    const familia = await this.prisma.preOcupacaoFamilia.findFirst({ where: { id: familiaId, tenantId } });
    if (!familia) throw new NotFoundException('Família não encontrada.');
    return familia;
  }
}
