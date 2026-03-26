import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PIPELINE_KEY = 'VENDAS';
const DEFAULT_PIPELINE_NAME = 'VENDAS';

const DEFAULT_STAGES: Array<{ key: string; name: string; order: number }> = [
  { key: 'NOVO_LEAD', name: 'Novo Lead', order: 1 },
  { key: 'PRIMEIRO_CONTATO', name: 'Primeiro Contato', order: 2 },
  { key: 'NAO_QUALIFICADO', name: 'Não Qualificado', order: 3 },
  {
    key: 'INTERESSE_QUALIFICACAO_CONFIRMADOS',
    name: 'Interesse e Qualificação Confirmados',
    order: 4,
  },
  { key: 'AGENDAMENTO_VISITA', name: 'Agendamento de Visita', order: 5 },
  { key: 'PROPOSTA', name: 'Proposta', order: 6 },
  {
    key: 'APROVACAO_CREDITO_PROPOSTA',
    name: 'Aprovação de Credito e Proposta',
    order: 7,
  },
  { key: 'CONTRATO', name: 'Contrato', order: 8 },
  {
    key: 'ASSINATURA_CONTRATO',
    name: 'Assinatura de Contrato',
    order: 9,
  },
  { key: 'BANCO', name: 'Banco', order: 10 },
  { key: 'REGISTRO', name: 'Registro', order: 11 },
  {
    key: 'ENTREGA_CONTRATO_REGISTRADO',
    name: 'Entrega de Contrato Registrado',
    order: 12,
  },
  { key: 'POS_VENDA_IA', name: 'Pós Venda - IA', order: 13 },
  { key: 'BASE_FRIA', name: 'Base Fria', order: 14 },
];

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPipeline(tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId ausente');

    const pipeline = await this.prisma.pipeline.upsert({
      where: {
        tenantId_key: {
          tenantId,
          key: DEFAULT_PIPELINE_KEY,
        },
      },
      create: {
        tenantId,
        key: DEFAULT_PIPELINE_KEY,
        name: DEFAULT_PIPELINE_NAME,
        isActive: true,
        stages: {
          create: DEFAULT_STAGES.map((s) => ({
            tenantId,
            key: s.key,
            name: s.name,
            sortOrder: s.order,
            isActive: true,
          })),
        },
      },
      update: {
        name: DEFAULT_PIPELINE_NAME,
        isActive: true,
      },
      select: { id: true },
    });

    const existing = await this.prisma.pipelineStage.findMany({
      where: { tenantId, pipelineId: pipeline.id },
      select: { key: true },
    });

    const existingKeys = new Set(existing.map((x) => x.key));

    const missing = DEFAULT_STAGES.filter((s) => !existingKeys.has(s.key));
    if (missing.length > 0) {
      await this.prisma.pipelineStage.createMany({
        data: missing.map((s) => ({
          tenantId,
          pipelineId: pipeline.id,
          key: s.key,
          name: s.name,
          sortOrder: s.order,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return pipeline.id;
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
      },
    });

    return stages;
  }

  async getStageByIdOrThrow(tenantId: string, stageId: string) {
    if (!stageId) throw new BadRequestException('stageId ausente');

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, tenantId, isActive: true },
      select: { id: true, key: true, name: true, pipelineId: true },
    });

    if (!stage) {
      throw new BadRequestException('Stage inválida (não existe ou não está ativa).');
    }

    return stage;
  }
}