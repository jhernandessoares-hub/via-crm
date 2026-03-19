import { Controller, Get, Post, Query } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sla/delayed')
  async listDelayed() {
    return this.queueService.debugListDelayed();
  }

  // ✅ agenda SLA (2h/10h/22h45/23h-template) para o ÚLTIMO lead do tenant (DEV)
  @Post('sla/seed-latest')
  async seedLatest() {
    const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant?.id) return { ok: false, message: 'Tenant não encontrado' };

    const lead = await this.prisma.lead.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });

    if (!lead?.id) return { ok: false, message: 'Nenhum lead encontrado' };

    await this.queueService.rescheduleSla(lead.id);

    return { ok: true, leadId: lead.id };
  }

  // ✅ agenda um job rápido (default 10s) pra testar o WORKER (IA/text)
  // POST /queue/sla/test-latest?seconds=10
  @Post('sla/test-latest')
  async testLatest(@Query('seconds') seconds?: string) {
    const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant?.id) return { ok: false, message: 'Tenant não encontrado' };

    const lead = await this.prisma.lead.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });

    if (!lead?.id) return { ok: false, message: 'Nenhum lead encontrado' };

    const s = Number(seconds || 10);
    return this.queueService.scheduleTest(lead.id, s);
  }

  // ✅ agenda um job rápido (default 10s) pra testar o TEMPLATE (sla-23h-template)
  // POST /queue/sla/test-template-latest?seconds=10
  @Post('sla/test-template-latest')
  async testTemplateLatest(@Query('seconds') seconds?: string) {
    const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant?.id) return { ok: false, message: 'Tenant não encontrado' };

    const lead = await this.prisma.lead.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    });

    if (!lead?.id) return { ok: false, message: 'Nenhum lead encontrado' };

    const s = Number(seconds || 10);

    // A ideia aqui é só disparar o fluxo do worker com o jobName correto
    await (this.queueService as any)['slaQueue'].add(
      'sla-23h-template',
      { leadId: lead.id },
      {
        delay: Math.max(1, s) * 1000,
        jobId: `sla-${lead.id}-test-template`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { ok: true, leadId: lead.id, seconds: Math.max(1, s) };
  }
}