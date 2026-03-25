import { Controller, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints temporários de desenvolvimento.
 * Bloqueados em produção (NODE_ENV === 'production').
 */
@Controller('dev')
export class DevController {
  constructor(private readonly prisma: PrismaService) {}

  private guardDev() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Endpoint disponível apenas em desenvolvimento.');
    }
  }

  @Post('reset-lead/:id')
  async resetLead(@Param('id') id: string) {
    this.guardDev();

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!lead) {
      throw new ForbiddenException(`Lead ${id} não encontrado.`);
    }

    const [deletedEvents] = await this.prisma.$transaction([
      this.prisma.leadEvent.deleteMany({ where: { leadId: id } }),
      this.prisma.lead.update({
        where: { id },
        data: { status: 'NOVO' },
      }),
    ]);

    return {
      ok: true,
      leadId: id,
      eventsDeleted: deletedEvents.count,
      status: 'NOVO',
    };
  }

  @Get('agent-kbs/:agentId')
  async getAgentKbs(@Param('agentId') agentId: string) {
    this.guardDev();

    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        title: true,
        prompt: true,
        active: true,
        knowledgeBases: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            createdAt: true,
            knowledgeBase: {
              select: {
                id: true,
                title: true,
                type: true,
                active: true,
                priority: true,
                prompt: true,
                _count: { select: { teachings: true } },
              },
            },
          },
        },
      },
    });

    if (!agent) throw new NotFoundException(`Agent ${agentId} não encontrado.`);

    return {
      agentId: agent.id,
      agentTitle: agent.title,
      agentPrompt: agent.prompt || '(vazio)',
      agentActive: agent.active,
      kbs: agent.knowledgeBases.map((link) => ({
        linkId: link.id,
        kbId: link.knowledgeBase.id,
        title: link.knowledgeBase.title,
        type: link.knowledgeBase.type,
        active: link.knowledgeBase.active,
        priority: link.knowledgeBase.priority,
        hasPrompt: !!link.knowledgeBase.prompt?.trim(),
        teachingsCount: link.knowledgeBase._count.teachings,
      })),
    };
  }

  @Post('clear-agent-prompt/:id')
  async clearAgentPrompt(@Param('id') id: string) {
    this.guardDev();

    const agent = await this.prisma.aiAgent.findUnique({
      where: { id },
      select: { id: true, title: true, prompt: true },
    });

    if (!agent) throw new NotFoundException(`Agent ${id} não encontrado.`);

    await this.prisma.aiAgent.update({
      where: { id },
      data: { prompt: '' },
    });

    return { ok: true, agentId: id, title: agent.title, promptAnterior: agent.prompt };
  }
}
