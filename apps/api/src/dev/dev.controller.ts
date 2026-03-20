import { Controller, ForbiddenException, Param, Post } from '@nestjs/common';
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
}
