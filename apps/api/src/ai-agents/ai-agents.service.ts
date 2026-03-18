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
  active?: boolean;
  priority?: number;
  version?: number;
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
  active?: boolean;
  priority?: number;
  version?: number;
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
        active: data.active ?? true,
        priority: data.priority ?? 0,
        version: data.version ?? 1,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.aiAgent.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!agent) {
      throw new NotFoundException('AiAgent não encontrado');
    }

    return agent;
  }

  async update(tenantId: string, id: string, data: UpdateAiAgentInput) {
    await this.findOne(tenantId, id);

    return this.prisma.aiAgent.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.objective !== undefined ? { objective: data.objective } : {}),
        ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
        ...(data.exampleOutput !== undefined
          ? { exampleOutput: data.exampleOutput }
          : {}),
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        ...(data.audience !== undefined ? { audience: data.audience } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.version !== undefined ? { version: data.version } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.aiAgent.delete({
      where: { id },
    });
  }
}