import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private slaQueue: Queue;
  private whatsappMediaQueue: Queue;
  private inboundAiQueue: Queue;
  private whatsappInboundQueue: Queue;

  constructor() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);

    this.slaQueue = new Queue('sla-queue', {
      connection: { host, port },
    });

    // ✅ fila para resolver mídia do WhatsApp (Cloudinary)
    this.whatsappMediaQueue = new Queue('whatsapp-media-queue', {
      connection: { host, port },
    });

    // ✅ NOVA: fila para inbound da IA em tempo real
    this.inboundAiQueue = new Queue('inbound-ai-queue', {
      connection: { host, port },
    });

    // ✅ fila durável para processar payloads de webhook recebidos
    this.whatsappInboundQueue = new Queue('whatsapp-inbound-queue', {
      connection: { host, port },
    });
  }

  // =============================
  // CONFIG SLA TIMES (ms)
  // =============================

  private SLA_2H = 2 * 60 * 60 * 1000;
  private SLA_10H = 10 * 60 * 60 * 1000;

  // ✅ ÚLTIMA IA LIVRE (antes do bloqueio de 23h)
  private SLA_22H45 = (22 * 60 + 45) * 60 * 1000; // 22h45m

  // ✅ TEMPLATE META (23h)
  private SLA_23H_TEMPLATE = 23 * 60 * 60 * 1000;

  // =============================
  // CONFIG INBOUND AI (ms)
  // =============================

  private getInboundFirstReplyDelayMs() {
    const seconds = Number(process.env.AI_INBOUND_FIRST_REPLY_SECONDS || 90); // 1m30s
    return Math.max(5, seconds) * 1000;
  }

  private getInboundFollowupReplyDelayMs() {
    const seconds = Number(process.env.AI_INBOUND_REPLY_SECONDS || 10); // 10s
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
        removeOnComplete: true,
        removeOnFail: true,
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
        removeOnComplete: true,
        removeOnFail: true,
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
        removeOnFail: true,
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
        removeOnFail: true,
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
        removeOnFail: true,
      },
    );

    return { ok: true, leadId, seconds };
  }

  // =============================
  // CANCELAR JOBS EXISTENTES (NOVOS + LEGACY)
  // =============================

  async cancelSlaJobs(leadId: string) {
    const ids = [
      // ✅ NOVOS
      `sla-${leadId}-2h`,
      `sla-${leadId}-10h`,
      `sla-${leadId}-22h45`,
      `sla-${leadId}-23h-template`,

      // ✅ LEGACY
      `sla-${leadId}-23h`,

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

  // =============================
  // AGENDAR TODOS ESTÁGIOS
  // =============================

  private async scheduleAllStages(leadId: string) {
    await this.slaQueue.add(
      'sla-2h',
      { leadId },
      {
        delay: this.SLA_2H,
        jobId: `sla-${leadId}-2h`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    await this.slaQueue.add(
      'sla-10h',
      { leadId },
      {
        delay: this.SLA_10H,
        jobId: `sla-${leadId}-10h`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    await this.slaQueue.add(
      'sla-22h45',
      { leadId },
      {
        delay: this.SLA_22H45,
        jobId: `sla-${leadId}-22h45`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    await this.slaQueue.add(
      'sla-23h-template',
      { leadId },
      {
        delay: this.SLA_23H_TEMPLATE,
        jobId: `sla-${leadId}-23h-template`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async onModuleDestroy() {
    await this.slaQueue.close();
    await this.whatsappMediaQueue.close();
    await this.inboundAiQueue.close();
    await this.whatsappInboundQueue.close();
  }
}