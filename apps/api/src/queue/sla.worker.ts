import { Worker, Job } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';
import { resolveWhatsappCreds, sendWhatsappText } from '../whatsapp/whatsapp-creds';

const logger = new Logger('SlaWorker');

type Urgency = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password };
}

function getInboundChannels(): string[] {
  const raw = (process.env.SLA_INBOUND_CHANNELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return raw.length
    ? raw
    : ['whatsapp.in', 'whatsapp.inbound', 'inbound', 'message.in', 'lead.inbound'];
}

function getActiveConversationMinutes(): number {
  const n = Number(process.env.SLA_ACTIVE_CONVERSATION_MINUTES || 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// ── Business Hours ────────────────────────────────────────────────────────────

function isWithinBusinessHours(businessHours: any, timezone: string): boolean {
  if (!businessHours) return true;

  const ALL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hasAnyDayEnabled = ALL_DAYS.some((k) => businessHours[k] != null);
  if (!hasAnyDayEnabled) return true;

  const tz = timezone || 'America/Sao_Paulo';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const weekdayShort = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    const shortToFull: Record<string, string> = {
      sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday',
      thu: 'thursday', fri: 'friday', sat: 'saturday',
    };
    const dayKey = weekdayShort ? shortToFull[weekdayShort] : null;
    if (!dayKey) return true;

    const schedule = businessHours[dayKey];
    if (!schedule) return false;

    const [openH, openM] = String(schedule.open || '00:00').split(':').map(Number);
    const [closeH, closeM] = String(schedule.close || '23:59').split(':').map(Number);

    const currentMinutes = hour * 60 + minute;
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } catch {
    return true;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function registerSlaDue(
  prisma: PrismaService,
  params: {
    tenantId: string;
    leadId: string;
    jobName: string;
    outcome: 'DUE' | 'BLOCKED';
    reason: string;
    details?: any;
    context?: any;
  },
) {
  await prisma.leadEvent.create({
    data: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      channel: 'sla.due',
      payloadRaw: {
        jobName: params.jobName,
        outcome: params.outcome,
        reason: params.reason,
        details: params.details ?? null,
        context: params.context ?? null,
        dueAt: new Date().toISOString(),
      },
    },
  });

  logger.log(
    `⏰ SLA DUE: ${params.jobName} leadId=${params.leadId} outcome=${params.outcome} reason=${params.reason}`,
  );
}

async function registerBlocked(
  prisma: PrismaService,
  params: {
    tenantId: string;
    leadId: string;
    jobName: string;
    reason: string;
    details?: any;
  },
) {
  await registerSlaDue(prisma, {
    tenantId: params.tenantId,
    leadId: params.leadId,
    jobName: params.jobName,
    outcome: 'BLOCKED',
    reason: params.reason,
    details: params.details ?? null,
  });
}

async function registerAiSuggestion(
  prisma: PrismaService,
  params: {
    tenantId: string;
    leadId: string;
    jobName: string;
    agentId?: string | null;
    agentTitle?: string | null;
    urgency?: Urgency | null;
    text: string;
  },
) {
  await prisma.leadEvent.create({
    data: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      channel: 'ai.suggestion',
      payloadRaw: {
        source: 'sla.worker',
        mode: 'COPILOT',
        jobName: params.jobName,
        agentId: params.agentId ?? null,
        agentTitle: params.agentTitle ?? null,
        urgency: params.urgency ?? null,
        text: params.text,
        createdAt: new Date().toISOString(),
      },
    },
  });

  logger.log(
    `🤖 SLA SUGGESTION [COPILOT]: ${params.jobName} leadId=${params.leadId} urgency=${params.urgency || 'none'}`,
  );
}

async function hasInboundAfterDate(prisma: PrismaService, leadId: string, afterDate: Date) {
  const inboundChannels = getInboundChannels();

  const hit = await prisma.leadEvent.findFirst({
    where: {
      leadId,
      criadoEm: { gt: afterDate },
      OR: [
        { channel: { in: inboundChannels } },
        { channel: { contains: 'inbound', mode: 'insensitive' } },
        { channel: { endsWith: '.in', mode: 'insensitive' } },
      ],
    },
    select: { id: true, channel: true, criadoEm: true },
  });

  return hit ? { ok: true as const, event: hit } : { ok: false as const };
}

async function getLastWhatsappOut(prisma: PrismaService, leadId: string) {
  return prisma.leadEvent.findFirst({
    where: { leadId, channel: 'whatsapp.out' },
    orderBy: { criadoEm: 'desc' },
    select: { id: true, criadoEm: true },
  });
}

// ── Main job handler ────────────────────────────────────────────────────────

async function handleSlaJob(job: Job, prisma: PrismaService, ai: AiService) {
  // SLA temporariamente desativado — reativar quando a lógica for revisada
  if (process.env.SLA_ENABLED !== 'true') {
    logger.log(`⏸ SLA desativado — job ${job.name} ignorado (leadId=${job.data?.leadId})`);
    return;
  }

  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  const urgency: Urgency = job.data?.urgency ?? 'BAIXA';
  const isCritica = urgency === 'CRITICA';

  const jobCreatedAtMs =
    Number.isFinite(Number(job.timestamp)) && Number(job.timestamp) > 0
      ? Number(job.timestamp)
      : Date.now();

  logger.log('🧪 SLA JOB START', { jobId: job.id, jobName: job.name, leadId, urgency });

  // ── Fetch lead ──────────────────────────────────────────────────────────────
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      nome: true,
      telefone: true,
      lastInboundAt: true,
      stageId: true,
      stage: { select: { group: true, key: true } },
    },
  });

  if (!lead) return;

  // ── leadSla checks ──────────────────────────────────────────────────────────
  const leadSla = await prisma.leadSla.findUnique({
    where: { leadId: lead.id },
    select: { isActive: true, frozenUntil: true },
  });

  if (leadSla && leadSla.isActive === false) {
    await registerBlocked(prisma, { tenantId: lead.tenantId, leadId: lead.id, jobName: job.name, reason: 'SLA_INACTIVE' });
    return;
  }

  if (leadSla?.frozenUntil && new Date(leadSla.frozenUntil).getTime() > Date.now()) {
    await registerBlocked(prisma, { tenantId: lead.tenantId, leadId: lead.id, jobName: job.name, reason: 'FROZEN_UNTIL_ACTIVE' });
    return;
  }

  // ── Lead status final ───────────────────────────────────────────────────────
  if (lead.status === 'FECHADO' || lead.status === 'PERDIDO') {
    await registerBlocked(prisma, { tenantId: lead.tenantId, leadId: lead.id, jobName: job.name, reason: 'LEAD_STATUS_FINAL' });
    return;
  }

  // ── PRE_ATENDIMENTO check ──────────────────────────────────────────────────
  if (lead.stage?.group !== 'PRE_ATENDIMENTO') {
    await registerBlocked(prisma, {
      tenantId: lead.tenantId, leadId: lead.id, jobName: job.name,
      reason: 'NOT_PRE_ATENDIMENTO',
      details: { group: lead.stage?.group ?? null, stageKey: lead.stage?.key ?? null },
    });
    return;
  }

  // ── Active conversation check ───────────────────────────────────────────────
  const lastOut = await getLastWhatsappOut(prisma, lead.id);
  logger.log('🧪 LAST OUT', { lastOut: lastOut ?? null });

  if (lastOut) {
    const minutes = getActiveConversationMinutes();
    const windowMs = minutes * 60 * 1000;
    const lastOutMs = new Date(lastOut.criadoEm).getTime();
    const ageMs = Date.now() - lastOutMs;

    if (ageMs >= 0 && ageMs <= windowMs) {
      const inboundCheck = await hasInboundAfterDate(prisma, lead.id, new Date(lastOut.criadoEm));
      logger.log('🧪 INBOUND_AFTER_LAST_OUT?', inboundCheck);

      if (inboundCheck.ok) {
        await registerBlocked(prisma, {
          tenantId: lead.tenantId, leadId: lead.id, jobName: job.name,
          reason: 'ACTIVE_CONVERSATION',
          details: { windowMinutes: minutes, lastWhatsappOutAt: lastOut.criadoEm, inboundEvent: inboundCheck.event },
        });
        return;
      }
    }
  }

  // ── 23h window check ───────────────────────────────────────────────────────
  const lastInboundAt = lead.lastInboundAt ?? null;
  const diffHours = lastInboundAt
    ? (Date.now() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
    : null;

  // ── CRITICA: auto-move to ATENDIMENTO_ENCERRADO when 23h window expires ─────
  if (isCritica) {
    const windowExpired = !lastInboundAt || (diffHours !== null && diffHours >= 22);

    if (windowExpired) {
      const encerradoStage = await prisma.pipelineStage.findFirst({
        where: { tenantId: lead.tenantId, key: 'ATENDIMENTO_ENCERRADO', isActive: true },
        select: { id: true, key: true },
      });

      if (encerradoStage) {
        await prisma.$transaction(async (tx) => {
          await tx.lead.update({
            where: { id: lead.id },
            data: { stageId: encerradoStage.id },
          });
          await tx.leadTransitionLog.create({
            data: {
              tenantId: lead.tenantId,
              leadId: lead.id,
              fromStage: lead.stage?.key ?? null,
              toStage: 'ATENDIMENTO_ENCERRADO',
              changedBy: 'SLA_AUTO',
            },
          });
        });

        logger.log(
          `🚫 SLA CRITICA: lead movido para ATENDIMENTO_ENCERRADO leadId=${lead.id} diffHours=${diffHours?.toFixed(1)}`,
        );

        await registerSlaDue(prisma, {
          tenantId: lead.tenantId,
          leadId: lead.id,
          jobName: job.name,
          outcome: 'DUE',
          reason: 'ATENDIMENTO_ENCERRADO_AUTO',
          details: { diffHours, lastInboundAt: lastInboundAt?.toISOString() ?? null },
        });
      } else {
        logger.warn(`⚠️ SLA CRITICA: stage ATENDIMENTO_ENCERRADO não encontrado para tenant=${lead.tenantId}`);
      }
    }
  }

  // ── Fetch tenant for business hours ───────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: lead.tenantId },
    select: { businessHours: true },
  });

  const bh = tenant?.businessHours as any;
  const tz = bh?.timezone || 'America/Sao_Paulo';
  const withinHours = isWithinBusinessHours(bh, tz);

  // Non-CRITICA: skip if outside business hours
  if (!withinHours && !isCritica) {
    await registerBlocked(prisma, {
      tenantId: lead.tenantId, leadId: lead.id, jobName: job.name,
      reason: 'OUTSIDE_BUSINESS_HOURS',
      details: { timezone: tz, urgency },
    });
    return;
  }

  // ── Register SLA due ───────────────────────────────────────────────────────
  await registerSlaDue(prisma, {
    tenantId: lead.tenantId,
    leadId: lead.id,
    jobName: job.name,
    outcome: 'DUE',
    reason: 'SLA_JOB_DUE',
    details: { jobCreatedAt: new Date(jobCreatedAtMs).toISOString(), urgency },
    context: {
      leadStatus: lead.status,
      stageKey: lead.stage?.key ?? null,
      lastInboundAt: lastInboundAt?.toISOString() ?? null,
      diffHours,
      withinBusinessHours: withinHours,
      urgency,
    },
  });

  // ── Find agent and check mode ──────────────────────────────────────────────
  try {
    const defaultAgent = await ai.findDefaultAgentForTenant(lead.tenantId);

    if (!defaultAgent?.id) {
      logger.log(`⚠️ Nenhum agent ativo para tenant=${lead.tenantId}. Sem mensagem SLA.`);
      return;
    }

    const agentMode: string = (defaultAgent as any).mode ?? 'COPILOT';

    // Build recent conversation context
    const recentEvents = await prisma.leadEvent.findMany({
      where: { leadId: lead.id, channel: { in: ['whatsapp.in', 'whatsapp.out'] } },
      orderBy: { criadoEm: 'desc' },
      take: 6,
      select: { channel: true, payloadRaw: true },
    });
    const conversationLines = [...recentEvents].reverse().map((ev) => {
      const p = ev.payloadRaw as any;
      const text = typeof p?.text === 'string' ? p.text.trim() : (typeof p?.transcription === 'string' ? p.transcription.trim() : '');
      if (!text) return null;
      return ev.channel === 'whatsapp.in' ? `Lead: ${text}` : `Agente: ${text}`;
    }).filter(Boolean).join('\n');

    const suggestion = await ai.generateFollowUp({
      nome: String(lead.nome || 'Cliente').trim() || 'Cliente',
      status: String(lead.status || 'NOVO'),
      tenantId: lead.tenantId,
      agentId: defaultAgent.id,
      leadId: lead.id,
      conversationContext: conversationLines || undefined,
      urgency,
    });

    if (!suggestion || !suggestion.trim()) return;

    const text = suggestion.trim();

    if (agentMode === 'AUTOPILOT') {
      // Send via WhatsApp
      if (!lead.telefone) {
        logger.warn(`⚠️ SLA AUTOPILOT: lead sem telefone leadId=${lead.id}`);
        return;
      }

      const creds = await resolveWhatsappCreds(prisma, lead.tenantId);
      if (!creds) {
        logger.warn(`⚠️ SLA AUTOPILOT: credenciais WhatsApp não resolvidas para tenant=${lead.tenantId}`);
        return;
      }

      await sendWhatsappText(creds, lead.telefone, text);

      await prisma.leadEvent.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: 'whatsapp.out',
          payloadRaw: {
            text,
            type: 'text',
            source: 'sla.worker.autopilot',
            urgency,
            agentId: defaultAgent.id,
            agentTitle: (defaultAgent as any).title ?? null,
            aiAssistanceLabel: '100% IA',
            aiAssistancePercent: 100,
            at: new Date().toISOString(),
          },
        },
      });

      logger.log(`📤 SLA AUTOPILOT SENT: leadId=${lead.id} urgency=${urgency}`);
    } else {
      // COPILOT — save suggestion only
      await registerAiSuggestion(prisma, {
        tenantId: lead.tenantId,
        leadId: lead.id,
        jobName: job.name,
        agentId: defaultAgent.id,
        agentTitle: (defaultAgent as any).title ?? null,
        urgency,
        text,
      });
    }
  } catch (err: any) {
    logger.log(
      `⚠️ Erro ao gerar sugestão SLA leadId=${lead.id}: ${err?.message || err}`,
    );
  }

  logger.log(`⏰ SLA processado leadId=${lead.id} urgency=${urgency}`);
}

export function startSlaWorker(prisma: PrismaService, ai: AiService) {
  logger.log('🚀 SLA Worker boot', {
    inboundChannels: getInboundChannels(),
    activeConversationMinutes: getActiveConversationMinutes(),
    redis: getRedisConnection(),
    mode: 'AUTOPILOT_OR_COPILOT_PER_AGENT',
  });

  const worker = new Worker(
    'sla-queue',
    async (job) => {
      await handleSlaJob(job, prisma, ai);
    },
    {
      connection: getRedisConnection(),
      lockDuration: 60000,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`✅ job completed: ${job.id} (${job.name})`);
  });

  worker.on('failed', (job, err) => {
    logger.log(`❌ job failed: ${job?.id} (${job?.name}) -> ${err?.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`🔴 SLA Worker erro de conexão (Redis indisponível?): ${err?.message}`);
  });

  logger.log('🚀 SLA Worker iniciado (fila: sla-queue)');

  return worker;
}
