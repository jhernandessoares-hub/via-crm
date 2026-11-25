import { Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getNextFamiliaNumber } from './pre-ocupacao-numbering.helper';
import { computeStatusAcompanhamento, countFaltas, faltaEmAberto, montarPendencias } from './pre-ocupacao-status.util';
import { AtendimentosService, periodoWhere } from './atendimentos.service';

@Injectable()
export class FamiliasService {
  private readonly logger = new Logger('PreOcupacaoFamiliasService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly atendimentos: AtendimentosService,
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

  /** Questionários publicados do tenant + os envios reais (não os de teste) das famílias informadas. */
  private async questionariosEnvios(tenantId: string, familiaIds: string[]) {
    const questionarios = await this.prisma.preOcupacaoQuestionario.findMany({
      where: { tenantId, status: 'PUBLICADO' },
      select: { id: true, titulo: true },
      orderBy: { criadoEm: 'asc' },
    });
    const envios =
      questionarios.length && familiaIds.length
        ? await this.prisma.preOcupacaoQuestionarioEnvio.findMany({
            where: {
              tenantId,
              teste: false,
              questionarioId: { in: questionarios.map((q) => q.id) },
              familiaId: { in: familiaIds },
            },
            select: {
              familiaId: true,
              questionarioId: true,
              statusEnvio: true,
              agendadoPara: true,
              linkAbertoEm: true,
              iniciadoEm: true,
              respondidoEm: true,
              entregueEm: true,
            },
          })
        : [];
    return { questionarios, envios };
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

    const { questionarios, envios } = await this.questionariosEnvios(tenantId, [familia.id]);
    const pendencias = montarPendencias({
      statusFamilia: familia.status,
      participacoes,
      questionariosPublicados: questionarios,
      envios,
    });

    return {
      ativada: true as const,
      familia,
      status: computeStatusAcompanhamento(pendencias),
      pendencias,
      faltas: countFaltas(participacoes),
      participacoesRecentes: participacoes.slice(0, 5),
      demandas,
    };
  }

  /**
   * Empreendimento/Unidade vinculados ao lead (compra), quando existir. Um lead
   * pode ter mais de uma unidade (ex: histórico de troca) — prioriza VENDIDO >
   * RESERVADO > PROPOSTA > demais status.
   */
  private async buscarUnidadesPorLead(tenantId: string, leadIds: string[]) {
    const unidades = leadIds.length
      ? await this.prisma.developmentUnit.findMany({
          where: { tenantId, leadId: { in: leadIds }, ativo: true },
          select: { leadId: true, nome: true, status: true, development: { select: { nome: true } } },
        })
      : [];
    const statusPrioridade: Record<string, number> = { VENDIDO: 0, RESERVADO: 1, PROPOSTA: 2 };
    const unidadePorLead = new Map<string, { empreendimento: string; unidade: string; prioridade: number }>();
    for (const u of unidades) {
      if (!u.leadId) continue;
      const prioridade = statusPrioridade[u.status] ?? 3;
      const atual = unidadePorLead.get(u.leadId);
      if (!atual || prioridade < atual.prioridade) {
        unidadePorLead.set(u.leadId, { empreendimento: u.development.nome, unidade: u.nome, prioridade });
      }
    }
    return unidadePorLead;
  }

  /**
   * Lista todas as famílias do tenant + dashboard agregado. `periodo` (YYYY-MM-DD)
   * filtra a contagem de atendimentos (por `inicioEm`) e de demandas (por
   * `dataAtendimento`) — a lista de famílias é sempre completa. Só entram
   * demandas vinculadas a uma família.
   */
  async listar(tenantId: string, take?: number, skip?: number, periodo?: { de?: string; ate?: string }) {
    const familias = await this.prisma.preOcupacaoFamilia.findMany({
      where: { tenantId },
      include: { lead: { select: { nome: true, nomeCorreto: true, cpf: true } } },
      orderBy: { numero: 'asc' },
    });

    const familiaIds = familias.map((f) => f.id);
    const leadIds = familias.map((f) => f.leadId);
    const participantes = familiaIds.length
      ? await this.prisma.preOcupacaoAtividadeParticipante.findMany({
          where: { familiaId: { in: familiaIds } },
          select: {
            familiaId: true,
            status: true,
            reposicaoEm: true,
            atividade: { select: { id: true, titulo: true, categoria: true, dataAgendada: true } },
          },
        })
      : [];
    const { questionarios, envios } = await this.questionariosEnvios(tenantId, familiaIds);
    const dataDemanda = periodoWhere(periodo?.de, periodo?.ate);
    const demandas = familiaIds.length
      ? await this.prisma.preOcupacaoOcorrencia.findMany({
          where: {
            tenantId,
            familiaId: { in: familiaIds },
            ...(dataDemanda ? { dataAtendimento: dataDemanda } : {}),
          },
          select: { familiaId: true, status: true, tipo: true },
        })
      : [];

    const unidadePorLead = await this.buscarUnidadesPorLead(tenantId, leadIds);
    const atendimentosPorFamilia = await this.atendimentos.contarPorFamilia(tenantId, periodo?.de, periodo?.ate);

    const porFamilia = new Map<string, typeof participantes>();
    for (const p of participantes) {
      const arr = porFamilia.get(p.familiaId) ?? [];
      arr.push(p);
      porFamilia.set(p.familiaId, arr);
    }
    const enviosPorFamilia = new Map<string, typeof envios>();
    for (const e of envios) {
      if (!e.familiaId) continue;
      const arr = enviosPorFamilia.get(e.familiaId) ?? [];
      arr.push(e);
      enviosPorFamilia.set(e.familiaId, arr);
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
      const unidadeInfo = unidadePorLead.get(f.leadId);
      const pendencias = montarPendencias({
        statusFamilia: f.status,
        participacoes,
        questionariosPublicados: questionarios,
        envios: enviosPorFamilia.get(f.id) ?? [],
      });
      return {
        id: f.id,
        numero: f.numero,
        leadId: f.leadId,
        nome: f.lead.nomeCorreto ?? f.lead.nome,
        cpf: f.lead.cpf,
        empreendimento: unidadeInfo?.empreendimento ?? null,
        unidade: unidadeInfo?.unidade ?? null,
        statusFamilia: f.status, // ATIVA | CONCLUIDA | INATIVA (ciclo de vida no programa)
        status: computeStatusAcompanhamento(pendencias), // EM_DIA | COM_PENDENCIA (acompanhamento)
        pendencias,
        faltas: countFaltas(participacoes),
        faltasAbertas: participacoes.filter(faltaEmAberto).length,
        ativadoEm: f.ativadoEm,
        demandasTotal: demandasFamilia.length,
        demandasAbertas: demandasFamilia.filter((d) => d.status === 'ABERTA').length,
        demandasEncerradas: demandasFamilia.filter((d) => d.status === 'ENCERRADA').length,
        atendimentos: atendimentosPorFamilia.get(f.id) ?? 0,
        contatosTotal: (atendimentosPorFamilia.get(f.id) ?? 0) + demandasFamilia.length,
      };
    });

    const demandasPorTipo: Record<string, number> = {};
    for (const d of demandas) {
      const k = d.tipo ?? 'OUTRO';
      demandasPorTipo[k] = (demandasPorTipo[k] ?? 0) + 1;
    }
    // Quantas famílias ativas devem cada questionário e cada falta (independe do período)
    const ativas = items.filter((i) => i.statusFamilia === 'ATIVA');
    const pendenciasAtivas = ativas.flatMap((i) => i.pendencias);
    const questionariosResumo = questionarios.map((q) => {
      const devem = pendenciasAtivas.filter((p) => p.tipo === 'QUESTIONARIO' && p.id === q.id);
      return {
        id: q.id,
        titulo: q.titulo,
        total: ativas.length,
        pendentes: devem.length,
        responderam: ativas.length - devem.length,
        naoEnviados: devem.filter((p) => p.tipo === 'QUESTIONARIO' && p.situacao === 'NAO_ENVIADO').length,
      };
    });
    const faltasPorSessao = new Map<string, { id: string; titulo: string; data: Date; familias: number }>();
    for (const p of pendenciasAtivas) {
      if (p.tipo !== 'FALTA') continue;
      const atual = faltasPorSessao.get(p.id) ?? { id: p.id, titulo: p.titulo, data: p.data, familias: 0 };
      atual.familias += 1;
      faltasPorSessao.set(p.id, atual);
    }

    const totalAtendimentos = items.reduce((acc, i) => acc + i.atendimentos, 0);
    const dashboard = {
      total: items.length,
      emDia: items.filter((i) => i.status === 'EM_DIA').length,
      comPendencia: items.filter((i) => i.status === 'COM_PENDENCIA').length,
      pendencias: {
        familiasSemResponder: ativas.filter((i) => i.pendencias.some((p) => p.tipo === 'QUESTIONARIO')).length,
        questionarios: questionariosResumo,
        familiasComFalta: ativas.filter((i) => i.faltasAbertas > 0).length,
        faltasPorSessao: [...faltasPorSessao.values()].sort((a, b) => b.data.getTime() - a.data.getTime()),
      },
      atendimentos: totalAtendimentos,
      demandas: demandas.length,
      demandasAbertas: demandas.filter((d) => d.status === 'ABERTA').length,
      demandasEncerradas: demandas.filter((d) => d.status === 'ENCERRADA').length,
      demandasPorTipo,
      contatosTotal: totalAtendimentos + demandas.length,
      familiasComContato: items.filter((i) => i.contatosTotal > 0).length,
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

    const { questionarios, envios } = await this.questionariosEnvios(tenantId, [familiaId]);
    const pendencias = montarPendencias({
      statusFamilia: familia.status,
      participacoes,
      questionariosPublicados: questionarios,
      envios,
    });

    const unidadeInfo = (await this.buscarUnidadesPorLead(tenantId, [familia.leadId])).get(familia.leadId);

    return {
      familia,
      empreendimento: unidadeInfo?.empreendimento ?? null,
      unidade: unidadeInfo?.unidade ?? null,
      status: computeStatusAcompanhamento(pendencias),
      pendencias,
      faltas: countFaltas(participacoes),
      faltasAbertas: participacoes.filter(faltaEmAberto).length,
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
