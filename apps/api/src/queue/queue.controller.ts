import { Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@UseGuards(JwtAuthGuard)
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
  async seedLatest(@Req() req: any) {
    requireOwner(req);
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
  async testLatest(@Req() req: any, @Query('seconds') seconds?: string) {
    requireOwner(req);
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

  // ✅ reprocessa jobs com falha na fila inbound-ai-queue
  // POST /queue/inbound-ai/retry-failed
  @Post('inbound-ai/retry-failed')
  async retryFailedInboundAi(@Req() req: any) {
    requireOwner(req);
    return this.queueService.retryFailedInboundAiJobs();
  }

  // ✅ reagenda IA para leads que receberam mensagem sem resposta na última janela
  // POST /queue/inbound-ai/reschedule?tenantId=xxx&windowMinutes=60
  // POST /queue/inbound-ai/reschedule?tenantSlug=minha-imobiliaria&windowMinutes=60
  @Post('inbound-ai/reschedule')
  async rescheduleInboundAi(
    @Req() req: any,
    @Query('tenantId') tenantId?: string,
    @Query('tenantSlug') tenantSlug?: string,
    @Query('windowMinutes') windowMinutes?: string,
  ) {
    requireOwner(req);
    let resolvedTenantId = tenantId;

    if (!resolvedTenantId && tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });
      if (!tenant) return { ok: false, message: `Tenant com slug "${tenantSlug}" não encontrado` };
      resolvedTenantId = tenant.id;
    }

    if (!resolvedTenantId) return { ok: false, message: 'Informe tenantId ou tenantSlug' };

    const minutes = windowMinutes ? Number(windowMinutes) : 60;
    return this.queueService.rescheduleInboundAiForRecentLeads(this.prisma, resolvedTenantId, minutes);
  }

  // ✅ agenda um job rápido (default 10s) pra testar o TEMPLATE (sla-23h-template)
  // POST /queue/sla/test-template-latest?seconds=10
  @Post('sla/test-template-latest')
  async testTemplateLatest(@Req() req: any, @Query('seconds') seconds?: string) {
    requireOwner(req);
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