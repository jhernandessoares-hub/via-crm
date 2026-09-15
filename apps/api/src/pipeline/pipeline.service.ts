import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PIPELINE_KEY = 'VENDAS';
const DEFAULT_PIPELINE_NAME = 'VENDAS';

/**
 * Definição única da pipeline padrão (Funil de Vendas) — mesmo modelo já usado
 * de verdade pelo tenant VEX IMOB em produção (25 etapas / 5 grupos), e o mesmo
 * vocabulário de chaves que `DEFAULT_STAGE_TRANSITIONS` abaixo espera. Antes deste
 * arquivo, o bootstrap de tenant novo (aqui) e a matriz de transições permitidas
 * (em leads.service.ts, duplicada 2x) usavam vocabulários diferentes e nunca
 * bateram — isso causava leads presos sem conseguir avançar de etapa em tenants
 * que ficaram no modelo antigo (ver DEFAULT_STAGES_LEGACY).
 */
export const DEFAULT_GROUPS: Array<{ key: string; name: string; order: number; color: string }> = [
  { key: 'PRE_ATENDIMENTO', name: 'Pré-Atendimento', order: 1, color: '#0ea5e9' },
  { key: 'AGENDAMENTO', name: 'Agendamento', order: 2, color: '#f59e0b' },
  { key: 'NEGOCIACOES', name: 'Negociações', order: 3, color: '#8b5cf6' },
  { key: 'NEGOCIO_FECHADO', name: 'Negócio Fechado', order: 4, color: '#10b981' },
  { key: 'POS_VENDA', name: 'Pós Venda', order: 5, color: '#6366f1' },
];

export const DEFAULT_STAGES: Array<{ key: string; name: string; order: number; group: string }> = [
  // PRE_ATENDIMENTO
  { key: 'NOVO_LEAD', name: 'Novo Lead', order: 1, group: 'PRE_ATENDIMENTO' },
  { key: 'EM_CONTATO', name: 'Em Contato', order: 2, group: 'PRE_ATENDIMENTO' },
  { key: 'NAO_QUALIFICADO', name: 'Não Qualificado', order: 3, group: 'PRE_ATENDIMENTO' },
  { key: 'SEM_INTERESSE', name: 'Sem Interesse', order: 4, group: 'PRE_ATENDIMENTO' },
  { key: 'LEAD_POTENCIAL_QUALIFICADO', name: 'Lead Potencial - Qualificado', order: 5, group: 'PRE_ATENDIMENTO' },
  { key: 'ATENDIMENTO_ENCERRADO', name: 'Atendimento Encerrado', order: 6, group: 'PRE_ATENDIMENTO' },
  { key: 'BASE_FRIA_PRE', name: 'Base Fria - Pré Atendimento', order: 7, group: 'PRE_ATENDIMENTO' },

  // AGENDAMENTO
  { key: 'AGUARDANDO_AGENDAMENTO', name: 'Aguardando Agendamento de Visita', order: 8, group: 'AGENDAMENTO' },
  { key: 'AGENDADO_VISITA', name: 'Agendado Visita', order: 9, group: 'AGENDAMENTO' },
  { key: 'REAGENDAMENTO', name: 'Reagendamento', order: 10, group: 'AGENDAMENTO' },
  { key: 'CONFIRMADOS', name: 'Confirmados', order: 11, group: 'AGENDAMENTO' },
  { key: 'NAO_COMPARECEU', name: 'Não Compareceu', order: 12, group: 'AGENDAMENTO' },
  { key: 'VISITA_CANCELADA', name: 'Visita Cancelada', order: 13, group: 'AGENDAMENTO' },
  { key: 'BASE_FRIA_AGENDAMENTO', name: 'Base Fria - Agendamento', order: 14, group: 'AGENDAMENTO' },

  // NEGOCIACOES
  { key: 'CRIACAO_PROPOSTA', name: 'Criação de Proposta', order: 15, group: 'NEGOCIACOES' },
  { key: 'PROPOSTA_ANDAMENTO', name: 'Proposta em Andamento', order: 16, group: 'NEGOCIACOES' },
  { key: 'PROPOSTA_ACEITA', name: 'Proposta Aceita', order: 17, group: 'NEGOCIACOES' },
  { key: 'ANALISE_CREDITO', name: 'Análise de Crédito', order: 18, group: 'NEGOCIACOES' },
  { key: 'FORMALIZACAO', name: 'Formalização', order: 19, group: 'NEGOCIACOES' },
  { key: 'CONTRATO_ASSINADO', name: 'Contrato Assinado', order: 20, group: 'NEGOCIACOES' },
  { key: 'DECLINIO', name: 'Declínio', order: 21, group: 'NEGOCIACOES' },
  { key: 'BASE_FRIA_NEGOCIACOES', name: 'Base Fria - Negociações', order: 22, group: 'NEGOCIACOES' },

  // NEGOCIO_FECHADO
  { key: 'ITBI', name: 'ITBI', order: 23, group: 'NEGOCIO_FECHADO' },
  { key: 'REGISTRO', name: 'Registro', order: 24, group: 'NEGOCIO_FECHADO' },
  { key: 'ENTREGA_CONTRATO', name: 'Entrega de Contrato Registrado', order: 25, group: 'NEGOCIO_FECHADO' },

  // POS_VENDA
  { key: 'POS_VENDA', name: 'Pós Venda', order: 26, group: 'POS_VENDA' },
];

/**
 * Nome e cor de exibição de Etapas que NÃO fazem parte do padrão, mas que
 * tenants em produção já usam há tempo (funil da SP9: inscrição CDHU).
 *
 * Isto existe porque o nome bonito dessas Etapas morava em mapas fixos no
 * frontend (GROUP_LABEL_MAP no kanban, GROUP_LABELS no stepper do lead). Ao
 * passar a ler o nome de PipelineGroup, sem esta tabela a SP9 veria a chave
 * crua ("ESCOLHA_UNIDADE") no lugar de "Escolha da Unidade".
 *
 * É só rótulo: não cria, não move e não renomeia nenhum PipelineStage, e não
 * encosta em Lead nem em LeadTransitionLog.
 */
export const KNOWN_GROUP_DISPLAY: Record<string, { name: string; color: string }> = {
  DOCUMENTACAO:        { name: 'Documentação',       color: '#06b6d4' },
  PROPOSTAS:           { name: 'Propostas',          color: '#f59e0b' },
  ESCOLHA_UNIDADE:     { name: 'Escolha da Unidade', color: '#8b5cf6' },
  CONTRATO:            { name: 'Contrato',           color: '#6366f1' },
  REGISTRO:            { name: 'Registro',           color: '#22c55e' },
  CREDITO_IMOBILIARIO: { name: 'Crédito Imobiliário', color: '#14b8a6' },
  BASE_FRIA:           { name: 'Base Fria',          color: '#64748b' },
};

/**
 * Fonte única da matriz de transições permitidas — antes duplicada byte-a-byte
 * em `leads.service.ts` (`getAllowedStageTransitions` e `updateStage`). Qualquer
 * chave de etapa fora deste mapa (pipeline customizado) tem movimento livre —
 * ver `isCustomStage`/`isCustomTransition` em leads.service.ts.
 */
export const DEFAULT_STAGE_TRANSITIONS: Record<string, string[]> = {
  NOVO_LEAD: ['EM_CONTATO'],

  EM_CONTATO: ['NAO_QUALIFICADO', 'SEM_INTERESSE', 'LEAD_POTENCIAL_QUALIFICADO'],

  NAO_QUALIFICADO: ['ATENDIMENTO_ENCERRADO'],

  // Lead disse que não quer agora, mas pode voltar: encerra ou volta pro contato.
  SEM_INTERESSE: ['ATENDIMENTO_ENCERRADO', 'EM_CONTATO'],

  LEAD_POTENCIAL_QUALIFICADO: [
    'AGUARDANDO_AGENDAMENTO',
    'AGENDADO_VISITA',
    'ATENDIMENTO_ENCERRADO',
  ],

  ATENDIMENTO_ENCERRADO: ['BASE_FRIA_PRE'],

  BASE_FRIA_PRE: ['NOVO_LEAD'],

  AGUARDANDO_AGENDAMENTO: ['AGENDADO_VISITA', 'VISITA_CANCELADA'],

  AGENDADO_VISITA: ['CONFIRMADOS', 'REAGENDAMENTO', 'VISITA_CANCELADA'],

  REAGENDAMENTO: ['CONFIRMADOS', 'VISITA_CANCELADA'],

  CONFIRMADOS: ['CRIACAO_PROPOSTA', 'NAO_COMPARECEU', 'VISITA_CANCELADA'],

  NAO_COMPARECEU: ['REAGENDAMENTO', 'VISITA_CANCELADA'],

  VISITA_CANCELADA: ['AGUARDANDO_AGENDAMENTO', 'BASE_FRIA_AGENDAMENTO'],

  BASE_FRIA_AGENDAMENTO: ['AGUARDANDO_AGENDAMENTO'],

  CRIACAO_PROPOSTA: ['PROPOSTA_ANDAMENTO'],

  PROPOSTA_ANDAMENTO: ['PROPOSTA_ACEITA', 'DECLINIO'],

  PROPOSTA_ACEITA: ['ANALISE_CREDITO', 'FORMALIZACAO'],

  ANALISE_CREDITO: ['FORMALIZACAO', 'DECLINIO'],

  FORMALIZACAO: ['CONTRATO_ASSINADO', 'DECLINIO'],

  CONTRATO_ASSINADO: ['ITBI'],

  DECLINIO: ['BASE_FRIA_NEGOCIACOES'],

  BASE_FRIA_NEGOCIACOES: ['CRIACAO_PROPOSTA'],

  ITBI: ['REGISTRO'],

  REGISTRO: ['ENTREGA_CONTRATO'],

  ENTREGA_CONTRATO: ['POS_VENDA'],

  POS_VENDA: [],
};

/**
 * Resolve o id do Pipeline ATIVO e real do tenant (bootstrap idempotente: cria o
 * pipeline genérico `VENDAS` na primeira vez, preserva qualquer customização já
 * feita nas vezes seguintes — ex.: pipeline SP9, que reaproveita este mesmo
 * registro com stages totalmente customizadas). Standalone (não depende de DI)
 * para poder ser reaproveitada fora do NestJS (ex.: workers, helpers de WhatsApp).
 */
export async function resolveTenantPipelineId(prisma: PrismaService, tenantId: string): Promise<string> {
  if (!tenantId) throw new BadRequestException('tenantId ausente');

  const existing = await prisma.pipeline.findUnique({
    where: { tenantId_key: { tenantId, key: DEFAULT_PIPELINE_KEY } },
    select: { id: true },
  });

  if (existing) {
    // Pipeline já existe (padrão, customizado, ou qualquer coisa entre os dois) —
    // NUNCA injeta stage nova nem mexe no que já está lá. Só garante que os
    // grupos que o tenant já usa tenham um PipelineGroup correspondente
    // (metadado puro, não altera PipelineStage nem Lead).
    await ensureGroupsBackfilled(prisma, tenantId, existing.id);
    return existing.id;
  }

  // Pipeline ainda não existe para este tenant: bootstrap com o modelo padrão
  // completo (25 etapas / 5 grupos) — única vez que isso roda para o tenant.
  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId,
      key: DEFAULT_PIPELINE_KEY,
      name: DEFAULT_PIPELINE_NAME,
      isActive: true,
      groups: {
        create: DEFAULT_GROUPS.map((g) => ({
          tenantId,
          key: g.key,
          name: g.name,
          color: g.color,
          sortOrder: g.order,
          isActive: true,
        })),
      },
      stages: {
        create: DEFAULT_STAGES.map((s) => ({
          tenantId,
          key: s.key,
          name: s.name,
          sortOrder: s.order,
          group: s.group,
          isActive: true,
        })),
      },
    },
    select: { id: true },
  });

  // Seed das linhas do grafo "Fluxo" — mesma regra de DEFAULT_STAGE_TRANSITIONS,
  // agora como dado editável por tenant (aba Fluxo da tela /settings/pipeline).
  const createdStages = await prisma.pipelineStage.findMany({
    where: { tenantId, pipelineId: pipeline.id },
    select: { id: true, key: true },
  });
  const idByKey = new Map(createdStages.map((s) => [s.key, s.id]));
  const transitionRows: Array<{ tenantId: string; pipelineId: string; fromStageId: string; toStageId: string }> = [];
  for (const [fromKey, toKeys] of Object.entries(DEFAULT_STAGE_TRANSITIONS)) {
    const fromId = idByKey.get(fromKey);
    if (!fromId) continue;
    for (const toKey of toKeys) {
      const toId = idByKey.get(toKey);
      if (!toId) continue;
      transitionRows.push({ tenantId, pipelineId: pipeline.id, fromStageId: fromId, toStageId: toId });
    }
  }
  if (transitionRows.length > 0) {
    await prisma.pipelineTransition.createMany({ data: transitionRows, skipDuplicates: true });
  }

  return pipeline.id;
}

/**
 * Garante que todo valor de `PipelineStage.group` já usado pelo tenant (seja o
 * modelo padrão, um pipeline customizado como a SP9, ou qualquer outro) tenha um
 * `PipelineGroup` correspondente — sem alterar nenhuma `PipelineStage` nem mover
 * nenhum lead. Roda de forma preguiçosa (idempotente) sempre que a estrutura da
 * pipeline é lida, para que tenants já existentes ganhem os registros de Etapa
 * automaticamente, sem script de migração separado.
 */
async function ensureGroupsBackfilled(prisma: PrismaService, tenantId: string, pipelineId: string): Promise<void> {
  const [stages, existingGroups] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { tenantId, pipelineId, group: { not: null } },
      select: { group: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.pipelineGroup.findMany({
      where: { tenantId, pipelineId },
      select: { key: true },
    }),
  ]);

  const existingKeys = new Set(existingGroups.map((g) => g.key));
  const firstSortOrderByGroup = new Map<string, number>();
  for (const s of stages) {
    if (!s.group || existingKeys.has(s.group)) continue;
    if (!firstSortOrderByGroup.has(s.group)) {
      firstSortOrderByGroup.set(s.group, s.sortOrder);
    }
  }

  if (firstSortOrderByGroup.size === 0) return;

  const byKey = new Map(DEFAULT_GROUPS.map((g) => [g.key, g]));
  const toCreate = [...firstSortOrderByGroup.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key, sortOrder]) => {
      const known = byKey.get(key) ?? KNOWN_GROUP_DISPLAY[key];
      return {
        tenantId,
        pipelineId,
        key,
        name: known?.name ?? key,
        color: known?.color ?? null,
        sortOrder,
        isActive: true,
      };
    });

  await prisma.pipelineGroup.createMany({ data: toCreate, skipDuplicates: true });
}

/**
 * Busca a primeira etapa ativa (menor sortOrder) do pipeline REAL do tenant —
 * sempre filtrando por pipelineId, nunca só por tenantId, pra não pegar stage de
 * um pipeline diferente/inativo (bug já visto no passado: leads presos numa stage
 * genérica de um pipeline que não era mais o ativo, ver scripts/fix-sp9-leads-stage.ts).
 */
export async function resolveTenantFirstStage(
  prisma: PrismaService,
  tenantId: string,
): Promise<{ id: string; pipelineId: string } | null> {
  const pipelineId = await resolveTenantPipelineId(prisma, tenantId);
  return prisma.pipelineStage.findFirst({
    where: { tenantId, pipelineId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, pipelineId: true },
  });
}

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPipeline(tenantId: string) {
    return resolveTenantPipelineId(this.prisma, tenantId);
  }

  async getActiveStages(tenantId: string) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);

    const stages = await this.prisma.pipelineStage.findMany({
      where: {
        tenantId,
        pipelineId,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        sortOrder: true,
        group: true,
        requiresEvidence: true,
        requiresReason: true,
        requiresPendencias: true,
        unitAction: true,
        ownerOnly: true,
      },
    });

    return stages;
  }

  /**
   * Etapas (nome + cor) do funil do tenant, para a UI parar de depender de mapas
   * fixos por chave de grupo (kanban em /pipeline e o stepper dentro do lead
   * tinham GROUP_LABEL_MAP/GROUP_COLOR_MAP hardcoded). Liberado para todos os
   * papéis — é só metadado de exibição, sem dado de lead.
   */
  async getActiveGroups(tenantId: string) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    return this.prisma.pipelineGroup.findMany({
      where: { tenantId, pipelineId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, name: true, color: true, sortOrder: true },
    });
  }

  async getStageByIdOrThrow(tenantId: string, stageId: string) {
    if (!stageId) throw new BadRequestException('stageId ausente');

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, tenantId, isActive: true },
      select: { id: true, key: true, name: true, group: true, pipelineId: true, ownerOnly: true, requiresEvidence: true, requiresReason: true, requiresPendencias: true, unitAction: true, advancesToGroup: true, returnsToGroup: true },
    });

    if (!stage) {
      throw new BadRequestException('Stage inválida (não existe ou não está ativa).');
    }

    return stage;
  }

  /**
   * Estrutura completa da pipeline do tenant — Etapas (PipelineGroup) com os
   * Status (PipelineStage) aninhados dentro, ordenados. Usado pela tela
   * /settings/pipeline. Mostra a pipeline REAL do tenant como ela está hoje
   * (não força ninguém para o modelo padrão) — apenas garante que todo `group`
   * já em uso tenha um registro de Etapa correspondente (ver ensureGroupsBackfilled).
   */
  async getStructure(tenantId: string) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    await ensureGroupsBackfilled(this.prisma, tenantId, pipelineId);

    const [groups, stages, transitions] = await Promise.all([
      this.prisma.pipelineGroup.findMany({
        where: { tenantId, pipelineId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.pipelineStage.findMany({
        where: { tenantId, pipelineId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.pipelineTransition.findMany({
        where: { tenantId, pipelineId },
        select: { id: true, fromStageId: true, toStageId: true },
      }),
    ]);

    const ungrouped = stages.filter((s) => !s.group);

    return {
      pipelineId,
      groups: groups.map((g) => ({
        ...g,
        stages: stages.filter((s) => s.group === g.key),
      })),
      ungrouped,
      transitions,
    };
  }

  /**
   * Atribui um Status hoje "sem etapa" (group nulo — pipeline legado) a uma
   * Etapa. Não afeta nenhum Lead — só passa a marcar a que grupo aquele status
   * pertence, pra ele parar de aparecer na lista "sem etapa" da tela.
   */
  async assignStageToGroup(tenantId: string, stageId: string, groupId: string) {
    const stage = await this.getStageOrThrow(tenantId, stageId);
    const group = await this.getGroupOrThrow(tenantId, groupId);

    const maxOrder = await this.prisma.pipelineStage.aggregate({
      where: { tenantId, pipelineId: stage.pipelineId, group: group.key },
      _max: { sortOrder: true },
    });

    return this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { group: group.key, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    });
  }

  /**
   * Salva a posição dos Status no canvas da aba "Fluxo". Só grava posX/posY —
   * não toca em grupo, ordem, nem em lead nenhum.
   */
  async saveStagePositions(tenantId: string, positions: Array<{ stageId: string; posX: number; posY: number }>) {
    if (!Array.isArray(positions) || positions.length === 0) return { updated: 0 };

    const ids = positions.map((p) => p.stageId);
    const owned = await this.prisma.pipelineStage.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));

    const updates = positions
      .filter((p) => ownedIds.has(p.stageId) && Number.isFinite(p.posX) && Number.isFinite(p.posY))
      .map((p) =>
        this.prisma.pipelineStage.update({
          where: { id: p.stageId },
          data: { posX: p.posX, posY: p.posY },
        }),
      );

    if (updates.length === 0) return { updated: 0 };
    await this.prisma.$transaction(updates);
    return { updated: updates.length };
  }

  async listTransitions(tenantId: string) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    return this.prisma.pipelineTransition.findMany({ where: { tenantId, pipelineId } });
  }

  async createTransition(tenantId: string, data: { fromStageId: string; toStageId: string }) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    if (data.fromStageId === data.toStageId) {
      throw new BadRequestException('Um status não pode transicionar para ele mesmo.');
    }
    await this.getStageOrThrow(tenantId, data.fromStageId);
    await this.getStageOrThrow(tenantId, data.toStageId);

    return this.prisma.pipelineTransition.upsert({
      where: {
        tenantId_fromStageId_toStageId: {
          tenantId,
          fromStageId: data.fromStageId,
          toStageId: data.toStageId,
        },
      },
      create: { tenantId, pipelineId, fromStageId: data.fromStageId, toStageId: data.toStageId },
      update: {},
    });
  }

  async deleteTransition(tenantId: string, transitionId: string) {
    const transition = await this.prisma.pipelineTransition.findFirst({ where: { id: transitionId, tenantId } });
    if (!transition) throw new BadRequestException('Transição não encontrada.');
    await this.prisma.pipelineTransition.delete({ where: { id: transition.id } });
  }

  async createGroup(tenantId: string, data: { name: string; sortOrder?: number; color?: string }) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    const key = slugifyGroupKey(data.name);

    const clash = await this.prisma.pipelineGroup.findFirst({
      where: { tenantId, pipelineId, isActive: true, key },
      select: { name: true },
    });
    if (clash) {
      throw new BadRequestException(`Já existe uma etapa chamada "${clash.name}".`);
    }

    const maxOrder = await this.prisma.pipelineGroup.aggregate({
      where: { tenantId, pipelineId },
      _max: { sortOrder: true },
    });

    return this.prisma.pipelineGroup.create({
      data: {
        tenantId,
        pipelineId,
        key,
        name: data.name,
        color: data.color ? normalizeHexColor(data.color) : null,
        sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        isActive: true,
      },
    });
  }

  /**
   * Cor da Etapa (hex #RRGGBB) escolhida na tela. Passar null limpa e volta pra
   * cor automática. Puramente visual — não muda nenhuma regra de funil.
   */
  async setGroupColor(tenantId: string, groupId: string, color: string | null) {
    const group = await this.getGroupOrThrow(tenantId, groupId);
    return this.prisma.pipelineGroup.update({
      where: { id: group.id },
      data: { color: color ? normalizeHexColor(color) : null },
    });
  }

  async renameGroup(tenantId: string, groupId: string, name: string) {
    const group = await this.getGroupOrThrow(tenantId, groupId);
    return this.prisma.pipelineGroup.update({
      where: { id: group.id },
      data: { name },
    });
  }

  async reorderGroup(tenantId: string, groupId: string, sortOrder: number) {
    const group = await this.getGroupOrThrow(tenantId, groupId);
    return this.prisma.pipelineGroup.update({
      where: { id: group.id },
      data: { sortOrder },
    });
  }

  async deleteGroup(tenantId: string, groupId: string) {
    const group = await this.getGroupOrThrow(tenantId, groupId);

    const stagesInGroup = await this.prisma.pipelineStage.count({
      where: { tenantId, pipelineId: group.pipelineId, group: group.key, isActive: true },
    });

    if (stagesInGroup > 0) {
      throw new BadRequestException('Essa etapa ainda tem status dentro dela. Remova ou mova os status antes de excluir a etapa.');
    }

    await this.prisma.pipelineGroup.update({
      where: { id: group.id },
      data: { isActive: false },
    });
  }

  private async getGroupOrThrow(tenantId: string, groupId: string) {
    const group = await this.prisma.pipelineGroup.findFirst({
      where: { id: groupId, tenantId, isActive: true },
    });
    if (!group) throw new BadRequestException('Etapa não encontrada.');
    return group;
  }

  async createStage(tenantId: string, data: { name: string; groupId: string }) {
    const pipelineId = await this.ensureDefaultPipeline(tenantId);
    const group = await this.getGroupOrThrow(tenantId, data.groupId);

    // Impede status duplicado no mesmo funil. Sem esta trava, quem tinha status
    // "sem etapa" acabava recriando o mesmo status à mão dentro de uma Etapa em
    // vez de mover o original — ficando com dois status de mesmo nome, um com
    // leads dentro e outro vazio.
    const existing = await this.prisma.pipelineStage.findMany({
      where: { tenantId, pipelineId, isActive: true },
      select: { name: true, group: true },
    });
    const wanted = normalizeName(data.name);
    const clash = existing.find((s) => normalizeName(s.name) === wanted);
    if (clash) {
      throw new BadRequestException(
        clash.group
          ? `Já existe um status "${clash.name}" no seu funil. Mova ou renomeie o existente em vez de criar outro.`
          : `Já existe um status "${clash.name}" no seu funil, hoje em "Sem etapa". Use o botão de mover nele em vez de criar outro.`,
      );
    }

    const key = await this.uniqueStageKey(tenantId, pipelineId, data.name);

    const maxOrder = await this.prisma.pipelineStage.aggregate({
      where: { tenantId, pipelineId, group: group.key },
      _max: { sortOrder: true },
    });

    return this.prisma.pipelineStage.create({
      data: {
        tenantId,
        pipelineId,
        key,
        name: data.name,
        group: group.key,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        isActive: true,
      },
    });
  }

  async renameStage(tenantId: string, stageId: string, name: string) {
    const stage = await this.getStageOrThrow(tenantId, stageId);
    return this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { name },
    });
  }

  async reorderStage(tenantId: string, stageId: string, sortOrder: number) {
    const stage = await this.getStageOrThrow(tenantId, stageId);
    return this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { sortOrder },
    });
  }

  /**
   * Reescreve a ordem dos Status de uma Etapa de uma vez (arrastar e soltar na
   * tela). `reorderStage` troca dois vizinhos e não serve para soltar um item em
   * posição arbitrária. Só mexe em `sortOrder` — nenhum lead sai do lugar.
   */
  async reorderStages(tenantId: string, groupId: string, orderedStageIds: string[]) {
    if (!Array.isArray(orderedStageIds) || orderedStageIds.length === 0) {
      throw new BadRequestException('Nenhum status para reordenar.');
    }
    const group = await this.getGroupOrThrow(tenantId, groupId);

    const owned = await this.prisma.pipelineStage.findMany({
      where: { id: { in: orderedStageIds }, tenantId, pipelineId: group.pipelineId, group: group.key },
      select: { id: true },
    });
    if (owned.length !== orderedStageIds.length) {
      throw new BadRequestException('Só dá para reordenar status que já estão dentro desta etapa.');
    }

    await this.prisma.$transaction(
      orderedStageIds.map((id, i) =>
        this.prisma.pipelineStage.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
    );
    return { reordered: orderedStageIds.length };
  }

  async deactivateStage(tenantId: string, stageId: string) {
    const stage = await this.getStageOrThrow(tenantId, stageId);

    const leadsInStage = await this.prisma.lead.count({
      where: { tenantId, stageId: stage.id, deletedAt: null },
    });

    if (leadsInStage > 0) {
      throw new BadRequestException(`Essa etapa ainda tem ${leadsInStage} lead(s) nela. Mova os leads antes de removê-la.`);
    }

    return this.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { isActive: false },
    });
  }

  private async getStageOrThrow(tenantId: string, stageId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, tenantId, isActive: true },
    });
    if (!stage) throw new BadRequestException('Status não encontrado.');
    return stage;
  }

  private async uniqueStageKey(tenantId: string, pipelineId: string, name: string): Promise<string> {
    const base = slugifyGroupKey(name);
    let key = base;
    let suffix = 2;
    while (
      await this.prisma.pipelineStage.findFirst({
        where: { tenantId, pipelineId, key },
        select: { id: true },
      })
    ) {
      key = `${base}_${suffix++}`;
    }
    return key;
  }
}

/** Nome comparável (sem acento, sem caixa, sem espaço duplicado) — só pra detectar duplicata. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyGroupKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'ETAPA';
}

/** Aceita só #RGB / #RRGGBB e devolve sempre em #rrggbb minúsculo. */
function normalizeHexColor(input: string): string {
  const v = String(input).trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(v);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-f]{6}$/.test(v)) {
    throw new BadRequestException('Cor inválida. Use o formato #RRGGBB.');
  }
  return v;
}
