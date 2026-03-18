import { Worker, Job } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  return { host, port };
}

function getInboundChannels(): string[] {
  const raw = (process.env.SLA_INBOUND_CHANNELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return raw.length
    ? raw
    : [
        'whatsapp.in',
        'whatsapp.inbound',
        'inbound',
        'message.in',
        'lead.inbound',
      ];
}

function getActiveConversationMinutes(): number {
  const n = Number(process.env.SLA_ACTIVE_CONVERSATION_MINUTES || 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function getWhatsappSafetyWindowHours(): number {
  const n = Number(process.env.SLA_WHATSAPP_WINDOW_HOURS || 23);
  return Number.isFinite(n) && n > 0 ? n : 23;
}

function checkWhatsappWindow(lastInboundAt: Date | null) {
  if (!lastInboundAt) {
    return {
      allowed: false as const,
      reason: 'WHATSAPP_WINDOW_EXPIRED' as const,
      details: {
        lastInboundAt: null,
        windowHours: getWhatsappSafetyWindowHours(),
      },
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - lastInboundAt.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const windowHours = getWhatsappSafetyWindowHours();

  if (diffHours > windowHours) {
    return {
      allowed: false as const,
      reason: 'WHATSAPP_WINDOW_EXPIRED' as const,
      details: {
        lastInboundAt: lastInboundAt.toISOString(),
        now: now.toISOString(),
        diffHours,
        windowHours,
      },
    };
  }

  return { allowed: true as const, reason: null, details: null };
}

function getWhatsappTemplateConfig() {
  const templateName =
    process.env.WHATSAPP_TEMPLATE_NAME || process.env.META_TEMPLATE_NAME;

  const language =
    process.env.WHATSAPP_TEMPLATE_LANG ||
    process.env.META_TEMPLATE_LANG ||
    'pt_BR';

  return { templateName, language };
}

function sanitizeTemplateParamText(input: string) {
  const s = (input || '').toString().replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 60) : s;
}

/**
 * REGRA ATUAL:
 * - SLA continua sem enviar WhatsApp automático
 * - agora o SLA pode gerar SUGESTÃO de IA (copilot)
 * - a sugestão fica registrada em LeadEvent
 */
async function registerSlaDue(prisma: PrismaService, params: {
  tenantId: string;
  leadId: string;
  jobName: string;
  outcome: 'DUE' | 'BLOCKED';
  reason: string;
  details?: any;
  context?: any;
}) {
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

  console.log(
    `⏰ SLA DUE: ${params.jobName} leadId=${params.leadId} outcome=${params.outcome} reason=${params.reason}`,
  );
}

async function registerBlocked(prisma: PrismaService, params: {
  tenantId: string;
  leadId: string;
  jobName: string;
  reason: string;
  details?: any;
}) {
  await registerSlaDue(prisma, {
    tenantId: params.tenantId,
    leadId: params.leadId,
    jobName: params.jobName,
    outcome: 'BLOCKED',
    reason: params.reason,
    details: params.details ?? null,
  });
}

async function registerAiSuggestion(prisma: PrismaService, params: {
  tenantId: string;
  leadId: string;
  jobName: string;
  agentId?: string | null;
  agentTitle?: string | null;
  text: string;
}) {
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
        text: params.text,
        createdAt: new Date().toISOString(),
      },
    },
  });

  console.log(
    `🤖 AI SUGGESTION: ${params.jobName} leadId=${params.leadId} agentId=${params.agentId || 'none'}`,
  );
}

async function hasInboundAfterDate(prisma: PrismaService, leadId: string, afterDate: Date) {
  const inboundChannels = getInboundChannels();

  const hitByList = await prisma.leadEvent.findFirst({
    where: {
      leadId,
      criadoEm: { gt: afterDate },
      channel: { in: inboundChannels },
    },
    select: { id: true, channel: true, criadoEm: true },
  });

  if (hitByList)
    return { ok: true as const, event: hitByList, mode: 'list' as const };

  const hitByContains = await prisma.leadEvent.findFirst({
    where: {
      leadId,
      criadoEm: { gt: afterDate },
      OR: [
        { channel: { contains: 'inbound', mode: 'insensitive' } },
        { channel: { endsWith: '.in', mode: 'insensitive' } },
      ],
    },
    select: { id: true, channel: true, criadoEm: true },
  });

  if (hitByContains)
    return {
      ok: true as const,
      event: hitByContains,
      mode: 'fallback' as const,
    };

  return { ok: false as const };
}

async function getLastWhatsappOut(prisma: PrismaService, leadId: string) {
  return prisma.leadEvent.findFirst({
    where: { leadId, channel: 'whatsapp.out' },
    orderBy: { criadoEm: 'desc' },
    select: { id: true, criadoEm: true },
  });
}

/**
 * Mantido no arquivo, mas o SLA worker não envia texto automático.
 */
async function sendWhatsappText(to: string, text: string) {
  const version =
    process.env.WHATSAPP_VERSION ||
    process.env.WHATSAPP_API_VERSION ||
    process.env.META_GRAPH_VERSION ||
    'v20.0';

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_ID ||
    process.env.META_PHONE_NUMBER_ID ||
    process.env.PHONE_NUMBER_ID;

  const token =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    process.env.ACCESS_TOKEN;

  if (!phoneNumberId) {
    throw new Error(
      'WHATSAPP_PHONE_NUMBER_ID não definido no .env (ou var equivalente)',
    );
  }
  if (!token) {
    throw new Error(
      'WHATSAPP_ACCESS_TOKEN não definido no .env (ou var equivalente)',
    );
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: text,
      preview_url: false,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `Erro WhatsApp send (${res.status}): ${JSON.stringify(data)}`,
    );
  }

  return data;
}

/**
 * Mantido no arquivo, mas o SLA worker não envia template automático nesta etapa.
 */
async function sendWhatsappTemplate(to: string, params?: { name?: string | null }) {
  const version =
    process.env.WHATSAPP_VERSION ||
    process.env.WHATSAPP_API_VERSION ||
    process.env.META_GRAPH_VERSION ||
    'v20.0';

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_ID ||
    process.env.META_PHONE_NUMBER_ID ||
    process.env.PHONE_NUMBER_ID;

  const token =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    process.env.ACCESS_TOKEN;

  if (!phoneNumberId) {
    throw new Error(
      'WHATSAPP_PHONE_NUMBER_ID não definido no .env (ou var equivalente)',
    );
  }
  if (!token) {
    throw new Error(
      'WHATSAPP_ACCESS_TOKEN não definido no .env (ou var equivalente)',
    );
  }

  const { templateName, language } = getWhatsappTemplateConfig();
  if (!templateName) {
    throw new Error(
      'WHATSAPP_TEMPLATE_NAME não definido no .env (ou META_TEMPLATE_NAME)',
    );
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const nameParam = sanitizeTemplateParamText(params?.name || 'Cliente');

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: nameParam }],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `Erro WhatsApp template (${res.status}): ${JSON.stringify(data)}`,
    );
  }

  return data;
}

function isTemplateJob(jobName: string) {
  return jobName === 'sla-23h-template';
}

async function handleSlaJob(job: Job, prisma: PrismaService, ai: AiService) {
  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  const jobCreatedAtMs =
    Number.isFinite(Number(job.timestamp)) && Number(job.timestamp) > 0
      ? Number(job.timestamp)
      : Date.now();

  console.log('🧪 SLA JOB START', {
    jobId: job.id,
    jobName: job.name,
    leadId,
  });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      nome: true,
      telefone: true,
      lastInboundAt: true,
    },
  });

  if (!lead) return;

  const leadSla = await prisma.leadSla.findUnique({
    where: { leadId: lead.id },
    select: {
      isActive: true,
      frozenUntil: true,
    },
  });

  if (leadSla && leadSla.isActive === false) {
    await registerBlocked(prisma, {
      tenantId: lead.tenantId,
      leadId: lead.id,
      jobName: job.name,
      reason: 'SLA_INACTIVE',
    });
    return;
  }

  if (
    leadSla?.frozenUntil &&
    new Date(leadSla.frozenUntil).getTime() > Date.now()
  ) {
    await registerBlocked(prisma, {
      tenantId: lead.tenantId,
      leadId: lead.id,
      jobName: job.name,
      reason: 'FROZEN_UNTIL_ACTIVE',
    });
    return;
  }

  if (lead.status === 'FECHADO' || lead.status === 'PERDIDO') {
    await registerBlocked(prisma, {
      tenantId: lead.tenantId,
      leadId: lead.id,
      jobName: job.name,
      reason: 'LEAD_STATUS_FINAL',
    });
    return;
  }

  const lastOut = await getLastWhatsappOut(prisma, lead.id);
  let inboundAfterOutResult: any = null;

  console.log('🧪 LAST OUT', lastOut);

  if (lastOut) {
    const minutes = getActiveConversationMinutes();
    const windowMs = minutes * 60 * 1000;

    const lastOutMs = new Date(lastOut.criadoEm).getTime();
    const ageMs = Date.now() - lastOutMs;

    if (ageMs >= 0 && ageMs <= windowMs) {
      inboundAfterOutResult = await hasInboundAfterDate(
        prisma,
        lead.id,
        new Date(lastOut.criadoEm),
      );

      console.log('🧪 INBOUND_AFTER_LAST_OUT?', inboundAfterOutResult);

      if (inboundAfterOutResult.ok) {
        await registerBlocked(prisma, {
          tenantId: lead.tenantId,
          leadId: lead.id,
          jobName: job.name,
          reason: 'ACTIVE_CONVERSATION',
          details: {
            windowMinutes: minutes,
            lastWhatsappOutAt: lastOut.criadoEm,
            inboundEvent: inboundAfterOutResult.event,
          },
        });
        return;
      }
    }
  }

  const windowCheck = checkWhatsappWindow(lead.lastInboundAt ?? null);

  await registerSlaDue(prisma, {
    tenantId: lead.tenantId,
    leadId: lead.id,
    jobName: job.name,
    outcome: 'DUE',
    reason: isTemplateJob(job.name) ? 'TEMPLATE_JOB_DUE' : 'SLA_JOB_DUE',
    details: {
      jobCreatedAt: new Date(jobCreatedAtMs).toISOString(),
    },
    context: {
      leadStatus: lead.status,
      lastInboundAt: lead.lastInboundAt ?? null,
      hadRecentWhatsappOut: !!lastOut,
      lastWhatsappOutAt: lastOut?.criadoEm ?? null,
      inboundAfterLastOut: inboundAfterOutResult?.ok ?? false,
      whatsappWindow: windowCheck,
      note: 'COPILOT_SUGGESTION_ONLY',
    },
  });

  try {
    const defaultAgent = await ai.findDefaultAgentForTenant(lead.tenantId);

    if (!defaultAgent?.id) {
      console.log(
        `⚠️ Nenhum agent ativo encontrado para tenant=${lead.tenantId}. Sugestão de IA não gerada.`,
      );
      return;
    }

    const suggestion = await ai.generateFollowUp({
      nome: String(lead.nome || 'Cliente').trim() || 'Cliente',
      status: String(lead.status || 'NOVO'),
      tenantId: lead.tenantId,
      agentId: defaultAgent.id,
      leadId: lead.id,
    });

    if (suggestion && suggestion.trim()) {
      await registerAiSuggestion(prisma, {
        tenantId: lead.tenantId,
        leadId: lead.id,
        jobName: job.name,
        agentId: defaultAgent.id,
        agentTitle: defaultAgent.title,
        text: suggestion.trim(),
      });
    }
  } catch (err: any) {
    console.log(
      `⚠️ Erro ao gerar sugestão de IA no SLA worker leadId=${lead.id}: ${err?.message || err}`,
    );
  }

  console.log(`⏰ SLA DUE registrado leadId=${lead.id}`);
}

export function startSlaWorker(prisma: PrismaService, ai: AiService) {
  const templateConfig = getWhatsappTemplateConfig();
  if (!templateConfig.templateName) {
    console.warn(
      '⚠️ SLA Worker: WHATSAPP_TEMPLATE_NAME (ou META_TEMPLATE_NAME) não definido — ' +
      'jobs sla-23h-template vão falhar ao tentar enviar o template.',
    );
  }

  console.log('🧪 SLA Worker boot', {
    inboundChannels: getInboundChannels(),
    activeConversationMinutes: getActiveConversationMinutes(),
    whatsappWindowHours: getWhatsappSafetyWindowHours(),
    template: templateConfig,
    redis: getRedisConnection(),
    mode: 'COPILOT_SUGGESTION_ONLY',
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
    console.log(`✅ job completed: ${job.id} (${job.name})`);
  });

  worker.on('failed', (job, err) => {
    console.log(`❌ job failed: ${job?.id} (${job?.name}) -> ${err?.message}`);
  });

  console.log('🚀 SLA Worker iniciado (fila: sla-queue)');

  return worker;
}