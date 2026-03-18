import { Worker, Job } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  return { host, port };
}

async function registerAiSuggestion(
  prisma: PrismaService,
  params: {
    tenantId: string;
    leadId: string;
    agentId?: string | null;
    agentTitle?: string | null;
    text: string;
    source: string;
    responseFormat?: string | null;
    audioScript?: string | null;
    suggestedAttachments?: any[] | null;
  },
) {
  await prisma.leadEvent.create({
    data: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      channel: 'ai.suggestion',
      payloadRaw: {
        source: params.source,
        mode: 'COPILOT',
        agentId: params.agentId ?? null,
        agentTitle: params.agentTitle ?? null,
        text: params.text,
        responseFormat: params.responseFormat ?? 'TEXT',
        audioScript: params.audioScript ?? null,
        suggestedAttachments: params.suggestedAttachments ?? [],
        createdAt: new Date().toISOString(),
      },
    },
  });

  console.log(
    `🤖 INBOUND AI SUGGESTION: leadId=${params.leadId} agentId=${params.agentId || 'none'}`,
  );
}

function pickEventText(payloadRaw: any): string {
  const p = payloadRaw || {};

  const candidates = [
    typeof p?.text === 'string' ? p.text : '',
    typeof p?.text?.body === 'string' ? p.text.body : '',
    typeof p?.message === 'string' ? p.message : '',
    typeof p?.body === 'string' ? p.body : '',
    typeof p?.caption === 'string' ? p.caption : '',
    typeof p?.rawMsg?.text?.body === 'string' ? p.rawMsg.text.body : '',
    typeof p?.rawMsg?.image?.caption === 'string' ? p.rawMsg.image.caption : '',
    typeof p?.rawMsg?.video?.caption === 'string' ? p.rawMsg.video.caption : '',
    typeof p?.interactive?.button_reply?.title === 'string'
      ? p.interactive.button_reply.title
      : '',
    typeof p?.interactive?.list_reply?.title === 'string'
      ? p.interactive.list_reply.title
      : '',
  ];

  const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
  return found ? found.trim() : '';
}

function formatMinutesSince(dateValue?: Date | string | null): string {
  if (!dateValue) return 'tempo não identificado';

  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return 'tempo não identificado';

  const diffMs = Date.now() - dt.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'menos de 1 minuto';
  if (diffMinutes === 1) return '1 minuto';
  if (diffMinutes < 60) return `${diffMinutes} minutos`;

  const hours = Math.floor(diffMinutes / 60);
  if (hours === 1) return '1 hora';
  if (hours < 24) return `${hours} horas`;

  const days = Math.floor(hours / 24);
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

async function getLastInboundEvent(prisma: PrismaService, leadId: string) {
  return prisma.leadEvent.findFirst({
    where: {
      leadId,
      channel: 'whatsapp.in',
    },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      criadoEm: true,
      payloadRaw: true,
    },
  });
}

async function getRecentConversationContext(
  prisma: PrismaService,
  leadId: string,
  limit = 8,
) {
  const events = await prisma.leadEvent.findMany({
    where: {
      leadId,
      channel: {
        in: ['whatsapp.in', 'whatsapp.out'],
      },
    },
    orderBy: { criadoEm: 'desc' },
    take: limit,
    select: {
      channel: true,
      criadoEm: true,
      payloadRaw: true,
    },
  });

  const ordered = [...events].reverse();

  const lines = ordered
    .map((ev) => {
      const ch = String(ev.channel || '').toLowerCase();
      const text = pickEventText(ev.payloadRaw);
      if (!text) return null;

      if (ch === 'whatsapp.in') return `Lead: ${text}`;
      if (ch === 'whatsapp.out') return `Corretor: ${text}`;
      return null;
    })
    .filter(Boolean);

  return lines.join('\n');
}

async function handleInboundAiJob(job: Job, prisma: PrismaService, ai: AiService) {
  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  console.log('🧠 INBOUND AI JOB START', {
    jobId: job.id,
    jobName: job.name,
    leadId,
    data: job.data,
  });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      telefone: true,
      status: true,
      lastInboundAt: true,
    },
  });

  if (!lead) return;

  const lastInbound = await getLastInboundEvent(prisma, lead.id);
  if (!lastInbound) {
    console.log(`⚠️ INBOUND AI: último inbound não encontrado para leadId=${lead.id}`);
    return;
  }

  const defaultAgent = await ai.findDefaultAgentForTenant(lead.tenantId);

  if (!defaultAgent?.id) {
    console.log(
      `⚠️ INBOUND AI: nenhum agent ativo encontrado para tenant=${lead.tenantId}`,
    );
    return;
  }

  const lastLeadMessage = pickEventText(lastInbound.payloadRaw);
  const recentConversation = await getRecentConversationContext(prisma, lead.id, 8);
  const minutesSinceLastInbound = formatMinutesSince(lastInbound.criadoEm);

  const conversationContextParts = [
    `Tempo desde a última mensagem do lead: ${minutesSinceLastInbound}.`,
    recentConversation ? `Histórico recente real da conversa:\n${recentConversation}` : '',
  ].filter(Boolean);

  const conversationContext = conversationContextParts.join('\n\n');

  try {
    const suggestion = await ai.generateFollowUp({
      nome: String(lead.nome || 'Cliente').trim() || 'Cliente',
      status: String(lead.status || 'NOVO'),
      tenantId: lead.tenantId,
      agentId: defaultAgent.id,
      leadId: lead.id,
      lastLeadMessage,
      conversationContext,
    });

    if (!suggestion || !suggestion.trim()) {
      console.log(`⚠️ INBOUND AI: suggestion vazia para leadId=${lead.id}`);
      return;
    }

    await registerAiSuggestion(prisma, {
      tenantId: lead.tenantId,
      leadId: lead.id,
      agentId: defaultAgent.id,
      agentTitle: defaultAgent.title,
      text: suggestion.trim(),
      source: 'inbound-ai.worker',
      responseFormat: 'TEXT',
      audioScript: null,
      suggestedAttachments: [],
    });
  } catch (err: any) {
    console.log(
      `⚠️ Erro ao gerar suggestion no inbound-ai worker leadId=${lead.id}: ${err?.message || err}`,
    );
  }
}

export function startInboundAiWorker(prisma: PrismaService, ai: AiService) {
  console.log('🧠 Inbound AI Worker boot', {
    redis: getRedisConnection(),
    mode: 'COPILOT_ONLY',
  });

  const worker = new Worker(
    'inbound-ai-queue',
    async (job) => {
      await handleInboundAiJob(job, prisma, ai);
    },
    {
      connection: getRedisConnection(),
      lockDuration: 60000,
    },
  );

  worker.on('completed', (job) => {
    console.log(`✅ inbound-ai job completed: ${job.id} (${job.name})`);
  });

  worker.on('failed', (job, err) => {
    console.log(`❌ inbound-ai job failed: ${job?.id} (${job?.name}) -> ${err?.message}`);
  });

  console.log('🚀 Inbound AI Worker iniciado (fila: inbound-ai-queue)');

  return worker;
}
