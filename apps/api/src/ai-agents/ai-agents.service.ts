import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiAgentMode } from '@prisma/client';

type CreateAiAgentInput = {
  tenantId: string;
  title: string;
  slug: string;
  description?: string;
  objective?: string;
  prompt: string;
  exampleOutput?: string;
  mode?: AiAgentMode;
  audience?: string;
  permissions?: string[];
  active?: boolean;
  version?: number;
  model?: string | null;
  temperature?: number | null;
  isOrchestrator?: boolean;
  parentAgentId?: string | null;
  routingKeywords?: string[];
};

type UpdateAiAgentInput = {
  title?: string;
  slug?: string;
  description?: string | null;
  objective?: string | null;
  prompt?: string;
  exampleOutput?: string | null;
  mode?: AiAgentMode;
  audience?: string | null;
  permissions?: string[];
  active?: boolean;
  version?: number;
  model?: string | null;
  temperature?: number | null;
  isOrchestrator?: boolean;
  parentAgentId?: string | null;
  routingKeywords?: string[];
};

const AGENT_INCLUDE = {
  knowledgeBases: {
    include: {
      knowledgeBase: {
        select: {
          id: true,
          title: true,
          type: true,
          active: true,
          priority: true,
          _count: { select: { teachings: true, documents: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  tools: {
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class AiAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAiAgentInput) {
    return this.prisma.aiAgent.create({
      data: {
        tenantId: data.tenantId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        objective: data.objective,
        prompt: data.prompt,
        exampleOutput: data.exampleOutput,
        mode: data.mode ?? 'COPILOT',
        audience: data.audience,
        permissions: data.permissions ?? [],
        active: data.active ?? true,
        version: data.version ?? 1,
        model: data.model ?? null,
        temperature: data.temperature ?? null,
        isOrchestrator: data.isOrchestrator ?? false,
        parentAgentId: data.parentAgentId ?? null,
        routingKeywords: data.routingKeywords ?? [],
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.aiAgent.findMany({
      where: { tenantId },
      include: AGENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findHierarchy(tenantId: string) {
    const agents = await this.prisma.aiAgent.findMany({
      where: { tenantId },
      include: AGENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    // Build tree: orchestrators at root, others as children
    const map = new Map(agents.map((a) => [a.id, { ...a, children: [] as any[] }]));

    const roots: any[] = [];
    for (const agent of map.values()) {
      if (agent.parentAgentId && map.has(agent.parentAgentId)) {
        map.get(agent.parentAgentId)!.children.push(agent);
      } else {
        roots.push(agent);
      }
    }

    return roots;
  }

  async findOne(tenantId: string, id: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id, tenantId },
      include: AGENT_INCLUDE,
    });

    if (!agent) throw new NotFoundException('AiAgent não encontrado');
    return agent;
  }

  async update(tenantId: string, id: string, data: UpdateAiAgentInput) {
    await this.findOne(tenantId, id);

    return this.prisma.aiAgent.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.objective !== undefined && { objective: data.objective }),
        ...(data.prompt !== undefined && { prompt: data.prompt }),
        ...(data.exampleOutput !== undefined && { exampleOutput: data.exampleOutput }),
        ...(data.mode !== undefined && { mode: data.mode }),
        ...(data.audience !== undefined && { audience: data.audience }),
        ...(data.permissions !== undefined && { permissions: data.permissions }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.isOrchestrator !== undefined && { isOrchestrator: data.isOrchestrator }),
        ...(data.parentAgentId !== undefined && { parentAgentId: data.parentAgentId }),
        ...(data.routingKeywords !== undefined && { routingKeywords: data.routingKeywords }),
      },
      include: AGENT_INCLUDE,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    // Desvincula filhos antes de remover
    await this.prisma.aiAgent.updateMany({
      where: { tenantId, parentAgentId: id },
      data: { parentAgentId: null },
    });

    return this.prisma.aiAgent.delete({ where: { id } });
  }

  // ── KB linking ────────────────────────────────────────────────
  async linkKb(tenantId: string, agentId: string, knowledgeBaseId: string) {
    await this.findOne(tenantId, agentId);
    return this.prisma.agentKnowledgeBase.upsert({
      where: { agentId_knowledgeBaseId: { agentId, knowledgeBaseId } },
      create: { agentId, knowledgeBaseId, tenantId },
      update: {},
    });
  }

  async unlinkKb(tenantId: string, agentId: string, knowledgeBaseId: string) {
    await this.findOne(tenantId, agentId);
    return this.prisma.agentKnowledgeBase.deleteMany({
      where: { agentId, knowledgeBaseId },
    });
  }

  async listKbs(tenantId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        title: true,
        type: true,
        active: true,
        priority: true,
        _count: { select: { teachings: true, documents: true } },
      },
      orderBy: [{ type: 'asc' }, { priority: 'asc' }],
    });
  }

  // ── Tools ─────────────────────────────────────────────────────
  async createTool(tenantId: string, agentId: string, data: {
    name: string;
    label: string;
    description: string;
    webhookUrl?: string;
    webhookMethod?: string;
    active?: boolean;
  }) {
    await this.findOne(tenantId, agentId);
    return this.prisma.agentTool.create({
      data: {
        tenantId,
        agentId,
        name: data.name.toLowerCase().replace(/\s+/g, '_'),
        label: data.label,
        description: data.description,
        type: 'WEBHOOK',
        webhookUrl: data.webhookUrl ?? null,
        webhookMethod: data.webhookMethod ?? 'POST',
        active: data.active ?? true,
      },
    });
  }

  async updateTool(tenantId: string, agentId: string, toolId: string, data: {
    label?: string;
    description?: string;
    webhookUrl?: string;
    webhookMethod?: string;
    active?: boolean;
  }) {
    await this.findOne(tenantId, agentId);
    return this.prisma.agentTool.update({
      where: { id: toolId },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
        ...(data.webhookMethod !== undefined && { webhookMethod: data.webhookMethod }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async deleteTool(tenantId: string, agentId: string, toolId: string) {
    await this.findOne(tenantId, agentId);
    return this.prisma.agentTool.delete({ where: { id: toolId } });
  }
}
