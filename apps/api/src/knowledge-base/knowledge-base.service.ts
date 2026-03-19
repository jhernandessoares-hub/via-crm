import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, body: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: {
        tenantId,
        title: body.title,
        type: body.type as any,
        prompt: body.prompt,
        links: body.links ?? [],
        whatAiUnderstood: body.whatAiUnderstood ?? null,
        exampleOutput: body.exampleOutput ?? null,
        tags: body.tags ?? [],
        audience: (body.audience as any) ?? 'AMBOS',
        active: body.active ?? true,
        priority: body.priority ?? 0,
        version: body.version ?? 1,
      },
    });
  }

  async findAll(tenantId: string, search?: string) {
    return this.prisma.knowledgeBase.findMany({
      where: {
        tenantId,
        ...(search && search.trim()
          ? {
              OR: [
                { title: { contains: search.trim(), mode: 'insensitive' } },
                { prompt: { contains: search.trim(), mode: 'insensitive' } },
                { whatAiUnderstood: { contains: search.trim(), mode: 'insensitive' } },
                { exampleOutput: { contains: search.trim(), mode: 'insensitive' } },
                { tags: { has: search.trim() } },
              ],
            }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      throw new NotFoundException('Knowledge base não encontrada.');
    }

    return item;
  }

  async update(tenantId: string, id: string, body: UpdateKnowledgeBaseDto) {
    const existing = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Knowledge base não encontrada.');
    }

    const data: Prisma.KnowledgeBaseUpdateInput = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.type !== undefined) data.type = body.type as any;
    if (body.prompt !== undefined) data.prompt = body.prompt;
    if (body.links !== undefined) data.links = body.links;
    if (body.whatAiUnderstood !== undefined) data.whatAiUnderstood = body.whatAiUnderstood;
    if (body.exampleOutput !== undefined) data.exampleOutput = body.exampleOutput;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.audience !== undefined) data.audience = body.audience as any;
    if (body.active !== undefined) data.active = body.active;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.version !== undefined) data.version = body.version;

    return this.prisma.knowledgeBase.update({
      where: { id: existing.id },
      data,
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.knowledgeBase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Knowledge base não encontrada.');
    }

    await this.prisma.knowledgeBase.delete({ where: { id: existing.id } });

    return { success: true, id: existing.id };
  }

  async attachToAgent(tenantId: string, agentId: string, knowledgeBaseId: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, tenantId },
      select: { id: true },
    });

    if (!agent) {
      throw new NotFoundException('AI Agent não encontrado.');
    }

    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, tenantId },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base não encontrada.');
    }

    return this.prisma.agentKnowledgeBase.upsert({
      where: { agentId_knowledgeBaseId: { agentId, knowledgeBaseId } },
      update: {},
      create: { tenantId, agentId, knowledgeBaseId },
    });
  }

  async detachFromAgent(tenantId: string, agentId: string, knowledgeBaseId: string) {
    const link = await this.prisma.agentKnowledgeBase.findFirst({
      where: { tenantId, agentId, knowledgeBaseId },
      select: { id: true },
    });

    if (!link) {
      throw new NotFoundException('Vínculo entre agent e knowledge base não encontrado.');
    }

    await this.prisma.agentKnowledgeBase.delete({ where: { id: link.id } });

    return { success: true, id: link.id, agentId, knowledgeBaseId };
  }
}
