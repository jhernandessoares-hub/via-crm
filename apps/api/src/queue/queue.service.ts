import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private slaQueue: Queue;
  private whatsappMediaQueue: Queue;
  private inboundAiQueue: Queue;
  private whatsappInboundQueue: Queue;
  reminderQueue: Queue;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;

    this.slaQueue = new Queue('sla-queue', {
      connection: { host, port, password },
    });

    // ✅ fila para resolver mídia do WhatsApp (Cloudinary)
    this.whatsappMediaQueue = new Queue('whatsapp-media-queue', {
      connection: { host, port, password },
    });

    // ✅ NOVA: fila para inbound da IA em tempo real
    this.inboundAiQueue = new Queue('inbound-ai-queue', {
      connection: { host, port, password },
    });

    // ✅ fila durável para processar payloads de webhook recebidos
    this.whatsappInboundQueue = new Queue('whatsapp-inbound-queue', {
      connection: { host, port, password },
    });

    // ✅ fila para lembretes de eventos do calendário (repeatable job)
    this.reminderQueue = new Queue('reminder-queue', {
      connection: { host, port, password },
    });
  }

  async scheduleReminderRepeat() {
    // Remove agendamentos antigos antes de recriar (evita duplicatas após restart)
    await this.reminderQueue.removeRepeatable('reminder-check', { pattern: '*/5 * * * *' });
    await this.reminderQueue.add(
      'reminder-check',
      {},
      { repeat: { pattern: '*/5 * * * *' }, removeOnComplete: true, removeOnFail: false },
    );
  }

  // =============================
  // CONFIG SLA TIMES (ms)
  // =============================

  private SLA_2H = 2 * 60 * 60 * 1000;
  private SLA_10H = 10 * 60 * 60 * 1000;
  private SLA_18H = 18 * 60 * 60 * 1000;
  private SLA_23H = 23 * 60 * 60 * 1000;

  // ✅ LEGACY (mantidos para cancelSlaJobs cancela jobs antigos em fila)
  private SLA_22H45 = (22 * 60 + 45) * 60 * 1000;
  private SLA_23H_TEMPLATE = 23 * 60 * 60 * 1000;

  // =============================
  // CONFIG INBOUND AI (ms)
  // =============================

  private getInboundFirstReplyDelayMs() {
    const seconds = Number(process.env.AI_INBOUND_FIRST_REPLY_SECONDS || 90); // 1m30s
    return Math.max(5, seconds) * 1000;
  }

  private getInboundFollowupReplyDelayMs() {
    const seconds = Number(process.env.AI_INBOUND_REPLY_SECONDS || 15); // 15s
    return Math.max(3, seconds) * 1000;
  }

  // =============================
  // WHATSAPP INBOUND: enqueue webhook payload
  // =============================

  async enqueueWebhookPayload(payload: any) {
    await this.whatsappInboundQueue.add(
      'whatsapp-inbound',
      { payload },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false, // manter jobs com falha para diagnóstico
      },
    );
  }

  // =============================
  // WHATSAPP MEDIA: enqueue resolve
  // =============================

  async enqueueWhatsappMediaResolve(eventId: string) {
    await this.whatsappMediaQueue.add(
      'whatsapp-media.resolve',
      { eventId },
      {
        jobId: `wa-media-${eventId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { ok: true, eventId };
  }

  // =============================
  // INBOUND AI: agendar resposta em tempo real
  // =============================

  async scheduleInboundAi(
    leadId: string,
    opts?: {
      isFirstReply?: boolean;
      delaySeconds?: number;
    },
  ) {
    const isFirstReply = !!opts?.isFirstReply;

    const delay =
      typeof opts?.delaySeconds === 'number' && Number.isFinite(opts.delaySeconds)
        ? Math.max(1, opts.delaySeconds) * 1000
        : isFirstReply
          ? this.getInboundFirstReplyDelayMs()
          : this.getInboundFollowupReplyDelayMs();

    await this.cancelInboundAiJobs(leadId);

    await this.inboundAiQueue.add(
      'inbound-ai',
      {
        leadId,
        isFirstReply,
      },
      {
        delay,
        jobId: `inbound-ai-${leadId}`,
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return {
      ok: true,
      leadId,
      isFirstReply,
      delayMs: delay,
    };
  }

  async cancelInboundAiJobs(leadId: string) {
    const ids = [
      `inbound-ai-${leadId}`,
      `inbound-ai-${leadId}-test`,
    ];

    for (const id of ids) {
      const job = await this.inboundAiQueue.getJob(id);
      if (job) await job.remove();
    }
  }

  async scheduleInboundAiTest(leadId: string, seconds = 10) {
    const delay = Math.max(1, Number(seconds || 10)) * 1000;

    await this.cancelInboundAiJobs(leadId);

    await this.inboundAiQueue.add(
      'inbound-ai',
      {
        leadId,
        isFirstReply: false,
        testMode: true,
      },
      {
        delay,
        jobId: `inbound-ai-${leadId}-test`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { ok: true, leadId, seconds };
  }

  // =============================
  // AGENDAR SLA INICIAL
  // =============================

  async scheduleInitialSla(leadId: string) {
    await this.scheduleAllStages(leadId);
  }

  // =============================
  // REAGENDAR (quando inbound)
  // =============================

  async rescheduleSla(leadId: string) {
    // SLA só é agendado para leads em PRE_ATENDIMENTO
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { stage: { select: { group: true } } },
    });

    if (!lead) return;

    if (lead.stage?.group !== 'PRE_ATENDIMENTO') {
      await this.cancelSlaJobs(leadId); // cancela jobs anteriores se lead saiu do grupo
      return;
    }

    await this.cancelSlaJobs(leadId);
    await this.scheduleAllStages(leadId);
  }

  // =============================
  // TESTE: agendar em X segundos (texto/IA)
  // =============================

  async scheduleTest(leadId: string, seconds = 10) {
    const delay = Math.max(1, Number(seconds || 10)) * 1000;

    await this.slaQueue.add(
      'sla-test',
      { leadId },
      {
        delay,
        jobId: `sla-${leadId}-test`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { ok: true, leadId, seconds };
  }

  // =============================
  // TESTE: agendar TEMPLATE em X segundos
  // =============================

  async scheduleTemplateTest(leadId: string, seconds = 10) {
    const delay = Math.max(1, Number(seconds || 10)) * 1000;

    await this.slaQueue.add(
      'sla-23h-template',
      { leadId },
      {
        delay,
        jobId: `sla-${leadId}-test-template`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { ok: true, leadId, seconds };
  }

  // =============================
  // CANCELAR JOBS EXISTENTES (NOVOS + LEGACY)
  // =============================

  async cancelSlaJobs(leadId: string) {
    const ids = [
      // ✅ ATIVOS
      `sla-${leadId}-2h`,
      `sla-${leadId}-10h`,
      `sla-${leadId}-18h`,
      `sla-${leadId}-23h`,

      // ✅ LEGACY (cancela jobs antigos ainda em fila)
      `sla-${leadId}-22h45`,
      `sla-${leadId}-23h-template`,

      // testes
      `sla-${leadId}-test`,
      `sla-${leadId}-test-template`,
    ];

    for (const id of ids) {
      const job = await this.slaQueue.getJob(id);
      if (job) await job.remove();
    }
  }

  // =============================
  // DEBUG: LISTAR DELAYED
  // =============================

  async debugListDelayed(limit = 50) {
    const jobs = await this.slaQueue.getDelayed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      delay: j.opts.delay,
      timestamp: j.timestamp,
    }));
  }

  async debugListInboundAiDelayed(limit = 50) {
    const jobs = await this.inboundAiQueue.getDelayed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      delay: j.opts.delay,
      timestamp: j.timestamp,
    }));
  }

  async getQueuesStatus() {
    const [sla, inboundAi, whatsappInbound, whatsappMedia, reminder] = await Promise.all([
      Promise.all([
        this.slaQueue.getWaitingCount(),
        this.slaQueue.getActiveCount(),
        this.slaQueue.getDelayedCount(),
        this.slaQueue.getFailedCount(),
      ]),
      Promise.all([
        this.inboundAiQueue.getWaitingCount(),
        this.inboundAiQueue.getActiveCount(),
        this.inboundAiQueue.getDelayedCount(),
        this.inboundAiQueue.getFailedCount(),
      ]),
      Promise.all([
        this.whatsappInboundQueue.getWaitingCount(),
        this.whatsappInboundQueue.getActiveCount(),
        this.whatsappInboundQueue.getDelayedCount(),
        this.whatsappInboundQueue.getFailedCount(),
      ]),
      Promise.all([
        this.whatsappMediaQueue.getWaitingCount(),
        this.whatsappMediaQueue.getActiveCount(),
        this.whatsappMediaQueue.getDelayedCount(),
        this.whatsappMediaQueue.getFailedCount(),
      ]),
      Promise.all([
        this.reminderQueue.getWaitingCount(),
        this.reminderQueue.getActiveCount(),
        this.reminderQueue.getDelayedCount(),
        this.reminderQueue.getFailedCount(),
      ]),
    ]);

    const toObj = ([waiting, active, delayed, failed]: number[]) => ({ waiting, active, delayed, failed });

    return {
      sla: toObj(sla),
      inboundAi: toObj(inboundAi),
      whatsappInbound: toObj(whatsappInbound),
      whatsappMedia: toObj(whatsappMedia),
      reminder: toObj(reminder),
    };
  }

  async retryAllFailedJobs(): Promise<{ retried: number; byQueue: Record<string, number> }> {
    const queues = [
      { name: 'inboundAi', queue: this.inboundAiQueue },
      { name: 'whatsappInbound', queue: this.whatsappInboundQueue },
      { name: 'whatsappMedia', queue: this.whatsappMediaQueue },
      { name: 'sla', queue: this.slaQueue },
    ];

    const byQueue: Record<string, number> = {};
    let total = 0;

    for (const { name, queue } of queues) {
      const failedJobs = await queue.getFailed(0, 100);
      let count = 0;
      for (const job of failedJobs) {
        try {
          await job.retry();
          count++;
        } catch {
          // job expirado, ignorar
        }
      }
      byQueue[name] = count;
      total += count;
    }

    return { retried: total, byQueue };
  }

  async retryFailedInboundAiJobs(): Promise<{ retried: number; leadIds: string[] }> {
    const failedJobs = await this.inboundAiQueue.getFailed(0, 100);
    const leadIds: string[] = [];

    for (const job of failedJobs) {
      try {
        await job.retry();
        if (job.data?.leadId) leadIds.push(job.data.leadId);
      } catch {
        // job pode ter expirado, ignorar
      }
    }

    return { retried: failedJobs.length, leadIds };
  }

  async rescheduleInboundAiForRecentLeads(
    prisma: any,
    tenantId: string,
    windowMinutes = 60,
  ): Promise<{ scheduled: number; leadIds: string[] }> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Busca leads do tenant que receberam mensagem recentemente mas não têm resposta da IA depois
    const recentInbound = await prisma.leadEvent.findMany({
      where: {
        tenantId,
        channel: 'whatsapp.in',
        criadoEm: { gte: since },
        lead: { deletedAt: null, botPaused: false },
      },
      select: { leadId: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
      distinct: ['leadId'],
    });

    const leadIds: string[] = [];

    for (const ev of recentInbound) {
      // Verifica se já existe job ativo ou se houve resposta da IA depois
      const existingJob = await this.inboundAiQueue.getJob(`inbound-ai-${ev.leadId}`);
      if (existingJob) continue;

      const aiResponse = await prisma.leadEvent.findFirst({
        where: {
          leadId: ev.leadId,
          channel: { in: ['whatsapp.out', 'ai.suggestion'] },
          criadoEm: { gte: ev.criadoEm },
        },
        select: { id: true },
      });
      if (aiResponse) continue;

      // Sem resposta e sem job — reagenda com delay imediato (5s)
      await this.scheduleInboundAi(ev.leadId, { delaySeconds: 5 });
      leadIds.push(ev.leadId);
    }

    return { scheduled: leadIds.length, leadIds };
  }

  // =============================
  // AGENDAR TODOS ESTÁGIOS
  // =============================

  private async scheduleAllStages(leadId: string) {
    await this.slaQueue.add(
      'sla-2h',
      { leadId, urgency: 'BAIXA' },
      {
        delay: this.SLA_2H,
        jobId: `sla-${leadId}-2h`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await this.slaQueue.add(
      'sla-10h',
      { leadId, urgency: 'MEDIA' },
      {
        delay: this.SLA_10H,
        jobId: `sla-${leadId}-10h`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await this.slaQueue.add(
      'sla-18h',
      { leadId, urgency: 'ALTA' },
      {
        delay: this.SLA_18H,
        jobId: `sla-${leadId}-18h`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await this.slaQueue.add(
      'sla-23h',
      { leadId, urgency: 'CRITICA' },
      {
        delay: this.SLA_23H,
        jobId: `sla-${leadId}-23h`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  // Retorna os jobs SLA ativos/agendados para um lead (para painel em tempo real)
  async getLeadSlaJobs(leadId: string) {
    const ids = [
      `sla-${leadId}-2h`,
      `sla-${leadId}-10h`,
      `sla-${leadId}-18h`,
      `sla-${leadId}-23h`,
    ];

    const result: Array<{
      jobId: string | undefined;
      name: string;
      urgency: string | null;
      scheduledFor: Date;
      state: string;
      delayMs: number;
    }> = [];

    for (const id of ids) {
      const job = await this.slaQueue.getJob(id);
      if (!job) continue;
      const state = await job.getState();
      const scheduledFor = new Date(job.timestamp + (job.opts.delay || 0));
      result.push({
        jobId: job.id,
        name: job.name,
        urgency: job.data.urgency ?? null,
        scheduledFor,
        state,
        delayMs: job.opts.delay || 0,
      });
    }

    return result;
  }

  async redisHealthCheck(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;
    const client = new Redis({ host, port, password, connectTimeout: 3000, lazyConnect: true, maxRetriesPerRequest: 0 });
    try {
      await client.connect();
      const start = Date.now();
      await client.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    } finally {
      client.disconnect();
    }
  }

  async onModuleDestroy() {
    await this.slaQueue.close();
    await this.whatsappMediaQueue.close();
    await this.inboundAiQueue.close();
    await this.whatsappInboundQueue.close();
    await this.reminderQueue.close();
  }
}