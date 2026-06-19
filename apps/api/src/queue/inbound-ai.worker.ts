import { Worker, Job } from 'bullmq';
import { LeadStatus } from '@prisma/client';
import { Logger } from '../logger';

const logger = new Logger('InboundAiWorker');
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../secretary/whatsapp.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { QueueService } from './queue.service';
import { userWantsEvent, userWantsStageNotification, getUserNotifPrefs } from '../users/notification-prefs.helper';
import { resolveWhatsappCreds, sendWhatsappImage } from '../whatsapp/whatsapp-creds';

async function sendImageViaWhatsapp(
  prisma: PrismaService,
  tenantId: string,
  toRaw: string,
  imageUrl: string,
  caption?: string,
) {
  const creds = await resolveWhatsappCreds(prisma, tenantId);
  if (!creds) return;
  await sendWhatsappImage(creds, toRaw, imageUrl, caption);
}

// Pré-filtro por menção: o lead cita o item, então quando o catálogo é grande mantém só os
// candidatos cujas palavras aparecem na conversa (senão devolve a lista inteira até o teto).
function prefilterByMention<T>(
  items: T[],
  text: string,
  fieldsFn: (item: T) => (string | null | undefined)[],
  max: number,
): T[] {
  if (items.length <= max) return items;
  const hay = ' ' + (text || '').toLowerCase() + ' ';
  const scored = items.map((item) => {
    const tokens = fieldsFn(item)
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/[^0-9a-záàâãéêíóôõúç]+/i)
      .filter((t) => t.length >= 4);
    const score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
    return { item, score };
  });
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (matched.length ? matched.map((s) => s.item) : items).slice(0, max);
}

// ── Notification helpers ───────────────────────────────────────────────────

const NOTIFY_EVENT_KEYS = new Set(['new_lead', 'lead_qualified']);

// Notifica o responsável atribuído; se não houver, notifica todos os OWNERs ativos do tenant
async function notifyAssignedUser(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  assignedUserId: string | null | undefined,
  message: string,
  prefCheck?: (userId: string) => Promise<boolean>,
) {
  if (assignedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: assignedUserId, tenantId, ativo: true, whatsappNumber: { not: null } },
      select: { whatsappNumber: true },
    });
    if (user?.whatsappNumber) {
      if (prefCheck && !(await prefCheck(assignedUserId))) {
        logger.log(`🔕 usuário ${assignedUserId} optou por não receber este aviso`);
        return;
      }
      whatsapp.sendMessage(user.whatsappNumber, message, tenantId).catch((err: any) => logger.warn(`Falha ao notificar usuário assignado: ${err?.message}`));
    }
    return;
  }

  // Fallback: sem responsável → notifica todos os OWNERs com WhatsApp cadastrado
  const owners = await prisma.user.findMany({
    where: { tenantId, ativo: true, role: 'OWNER', whatsappNumber: { not: null } },
    select: { id: true, whatsappNumber: true },
  });
  for (const owner of owners) {
    if (!owner.whatsappNumber) continue;
    if (prefCheck && !(await prefCheck(owner.id))) continue;
    whatsapp.sendMessage(owner.whatsappNumber, message, tenantId).catch((err: any) => logger.warn(`Falha ao notificar owner fallback: ${err?.message}`));
  }
}

async function notifyUsersForEvent(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  eventKey: string,
  message: string,
  assignedUserId?: string | null,
) {
  if (!NOTIFY_EVENT_KEYS.has(eventKey)) return;
  // Notifica apenas o responsável; se não houver, não envia
  await notifyAssignedUser(prisma, whatsapp, tenantId, assignedUserId, message);
}

async function notifyUsersForStage(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  stageKey: string,
  message: string,
  assignedUserId?: string | null,
) {
  // Respeita as preferências do usuário: precisa ter 'stage_change' ligado e a etapa selecionada.
  await notifyAssignedUser(prisma, whatsapp, tenantId, assignedUserId, message, (uid) =>
    userWantsStageNotification(prisma, uid, stageKey),
  );
}

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password };
}

// ── Business Hours ─────────────────────────────────────────────────────────

const DAY_KEYS: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

function isWithinBusinessHours(businessHours: any, timezone: string): boolean {
  if (!businessHours) return true; // sem configuração = sempre aberto

  // Se nenhum dia está habilitado (todos null), sem restrição de horário
  const ALL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hasAnyDayEnabled = ALL_DAYS.some(k => businessHours[k] != null);
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
    const weekdayShort = parts.find(p => p.type === 'weekday')?.value?.toLowerCase();
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    // Map short weekday to full key
    const shortToFull: Record<string, string> = {
      sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday',
      thu: 'thursday', fri: 'friday', sat: 'saturday',
    };
    const dayKey = weekdayShort ? shortToFull[weekdayShort] : null;
    if (!dayKey) return true;

    const schedule = businessHours[dayKey];
    if (!schedule) return false; // dia específico fechado

    const [openH, openM] = String(schedule.open || '00:00').split(':').map(Number);
    const [closeH, closeM] = String(schedule.close || '23:59').split(':').map(Number);

    const currentMinutes = hour * 60 + minute;
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } catch {
    return true; // em caso de erro, não bloqueia
  }
}

/**
 * Quantos minutos faltam até a próxima abertura do atendimento (a partir de agora, no tz).
 * Retorna null se não houver nenhum dia com horário configurado nos próximos 7 dias.
 * Usa apenas o delta de minutos no relógio do tz (não constrói Date em fuso) — preciso o
 * suficiente para agendar o job. Só chamado quando já se sabe que está FORA do horário.
 */
function minutesUntilNextOpen(businessHours: any, timezone: string): number | null {
  if (!businessHours) return null;
  const tz = timezone || 'America/Sao_Paulo';
  const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortToFull: Record<string, string> = {
    sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday',
  };
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const weekdayShort = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const todayKey = weekdayShort ? shortToFull[weekdayShort] : null;
    if (!todayKey) return null;
    const todayIdx = DOW.indexOf(todayKey);
    const currentMinutes = hour * 60 + minute;

    for (let d = 0; d < 8; d++) {
      const sched = businessHours[DOW[(todayIdx + d) % 7]];
      if (!sched) continue;
      const [oh, om] = String(sched.open || '00:00').split(':').map(Number);
      const deltaMin = d * 1440 + (oh * 60 + om) - currentMinutes;
      if (deltaMin > 0) return deltaMin;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function registerAiSuggestion(
  prisma: PrismaService,
  params: {
    tenantId: string;
    leadId: string;
    agentId?: string | null;
    agentTitle?: string | null;
    text: string;
    source: string;
    mode: 'COPILOT' | 'AUTOPILOT';
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
        mode: params.mode,
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

  logger.log(
    `🤖 INBOUND AI [${params.mode}]: leadId=${params.leadId} agentId=${params.agentId || 'none'}`,
  );
}

async function sendImagesForProduct(
  prisma: PrismaService,
  lead: { id: string; tenantId: string; telefone: string | null; conversaCanal?: string | null; conversaSessionId?: string | null },
  productId: string,
  unofficialService?: WhatsappUnofficialService,
): Promise<string> {
  const productWithImages = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      title: true,
      images: {
        where: { publishSite: true },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        take: 6,
        select: { id: true, url: true, title: true, customLabel: true, isPrimary: true },
      },
    },
  });

  const images = productWithImages?.images ?? [];
  if (images.length === 0 || !lead.telefone) {
    logger.warn(`⚠️ Produto sem imagens públicas leadId=${lead.id} productId=${productId}`);
    return 'nenhuma imagem disponível';
  }

  // Idempotência: evita reenviar as fotos do MESMO produto ao MESMO lead em curto intervalo
  // (cobre retry do job, chamada dupla da ferramenta na mesma geração, jobs concorrentes).
  const DEDUP_WINDOW_MS = 3 * 60 * 1000;
  const recentOut = await prisma.leadEvent.findMany({
    where: {
      leadId: lead.id,
      channel: { in: ['whatsapp.out', 'whatsapp.unofficial.out'] },
      criadoEm: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    select: { payloadRaw: true },
    take: 100,
  });
  const jaEnviou = recentOut.some((e) => {
    const p = e.payloadRaw as any;
    return p?.source === 'agent-tool.enviar_fotos_produto' && p?.productId === productId;
  });
  if (jaEnviou) {
    logger.log(`📸 FERRAMENTA: fotos do produto ${productId} já enviadas há pouco — pulando (leadId=${lead.id})`);
    return 'as fotos deste imóvel já foram enviadas há instantes';
  }

  const isLight = lead.conversaCanal === 'WHATSAPP_LIGHT' && !!lead.conversaSessionId && !!unofficialService;

  for (const img of images) {
    const caption = img.customLabel || img.title || productWithImages?.title || undefined;
    try {
      if (isLight) {
        await unofficialService!.sendImage(lead.conversaSessionId!, lead.telefone, img.url, caption);
      } else {
        await sendImageViaWhatsapp(prisma, lead.tenantId, lead.telefone, img.url, caption);
      }
      await prisma.leadEvent.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: isLight ? 'whatsapp.unofficial.out' : 'whatsapp.out',
          payloadRaw: {
            type: 'image',
            media: {
              url: img.url,
              mimeType: 'image/jpeg',
              filename: caption || 'foto-produto.jpg',
            },
            caption,
            source: 'agent-tool.enviar_fotos_produto',
            productId,
            aiAssistanceLabel: '100% IA',
            aiAssistancePercent: 100,
            at: new Date().toISOString(),
          },
        },
      });
    } catch (imgErr: any) {
      logger.warn(`⚠️ Erro ao enviar imagem leadId=${lead.id}: ${imgErr?.message}`);
    }
  }

  logger.log(`📸 FERRAMENTA: ${images.length} foto(s) enviada(s) leadId=${lead.id} canal=${isLight ? 'LIGHT' : 'OFICIAL'}`);
  return `${images.length} foto(s) enviada(s)`;
}

async function sendOutsideHoursMessage(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  leadId: string,
  telefone: string,
  message: string,
) {
  // Verifica se já enviou msg fora de horário nas últimas 8h para este lead
  const recent = await prisma.leadEvent.findFirst({
    where: {
      tenantId,
      leadId,
      channel: 'bot.outside_hours',
      criadoEm: { gte: new Date(Date.now() - 8 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (recent) return; // já enviou recentemente, não reenvia

  await whatsapp.sendMessage(telefone, message);

  await prisma.leadEvent.create({
    data: {
      tenantId,
      leadId,
      channel: 'bot.outside_hours',
      payloadRaw: { text: message, sentAt: new Date().toISOString() },
    },
  });

  logger.log(`🕐 BOT FORA DE HORÁRIO: leadId=${leadId}`);
}

// ── Escalation handler ────────────────────────────────────────────────────────

const ESCALATE_PATTERN = /^\[ESCALATE:([^\]]+)\]\s*/;

/**
 * Verifica se a resposta contém um marcador [ESCALATE:motivo].
 * Se sim: remove o marcador do texto, pausa o bot, notifica responsável via WhatsApp
 * e registra um evento lead.escalated.
 *
 * Retorna o texto limpo (sem o marcador).
 */
async function handleEscalation(
  prisma: PrismaService,
  whatsapp: WhatsappService | undefined,
  lead: { id: string; tenantId: string; nome: string | null; nomeCorreto?: string | null; telefone: string | null; assignedUserId?: string | null },
  rawText: string,
): Promise<{ text: string; escalated: boolean; reason: string | null }> {
  const match = rawText.match(ESCALATE_PATTERN);
  if (!match) return { text: rawText, escalated: false, reason: null };

  const reason = match[1].trim();
  const cleanText = rawText.replace(ESCALATE_PATTERN, '').trim();

  logger.log(`🚨 ESCALAÇÃO DETECTADA: leadId=${lead.id} reason=${reason}`);

  try {
    // Pausa o bot para este lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: { botPaused: true },
    });

    // Registra evento de escalação
    await prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'lead.escalated',
        payloadRaw: {
          reason,
          autoEscalated: true,
          escalatedAt: new Date().toISOString(),
          botPaused: true,
        },
      },
    });

    // Notifica responsável pelo lead + owners/managers do tenant via WhatsApp
    if (whatsapp) {
      const reasonLabels: Record<string, string> = {
        insistencia_fora_escopo: 'insistência em assunto fora do escopo',
        ameaca: 'ameaça ou intimidação',
        assedio: 'assédio moral ou sexual',
      };
      const reasonLabel = reasonLabels[reason] ?? reason;
      const leadNome = (lead.nomeCorreto ?? lead.nome)?.trim() || 'Lead sem nome';
      const urgencyMsg =
        `⚠️ *ATENÇÃO URGENTE — ${leadNome}*\n\n` +
        `O lead gerou um alerta de *${reasonLabel}* durante o atendimento.\n\n` +
        `O bot foi pausado automaticamente. Acesse o CRM para revisar a conversa e retomar o atendimento manualmente.`;

      // Busca usuários notificáveis: assignedUser prioritário + owners/managers com whatsappNumber
      const usersToNotify = await prisma.user.findMany({
        where: {
          tenantId: lead.tenantId,
          ativo: true,
          whatsappNumber: { not: null },
          OR: [
            { id: lead.assignedUserId ?? '' },
            { role: { in: ['OWNER', 'MANAGER'] } },
          ],
        },
        select: { whatsappNumber: true, nome: true },
        distinct: ['whatsappNumber'],
      });

      for (const u of usersToNotify) {
        if (u.whatsappNumber) {
          whatsapp.sendMessage(u.whatsappNumber, urgencyMsg).catch((err: any) => logger.error(`Falha crítica ao notificar escalação para ${u.whatsappNumber}: ${err?.message}`));
        }
      }
    }
  } catch (err: any) {
    logger.warn(`⚠️ Erro ao processar escalação leadId=${lead.id}: ${err?.message}`);
  }

  return { text: cleanText, escalated: true, reason };
}

function pickEventText(payloadRaw: any): string {
  const p = payloadRaw || {};

  const candidates = [
    // Transcrição de áudio tem prioridade sobre '[ÁUDIO]'
    typeof p?.transcription === 'string' ? p.transcription : '',
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
    where: { leadId, channel: { in: ['whatsapp.in', 'whatsapp.unofficial.in'] } },
    orderBy: { criadoEm: 'desc' },
    select: { id: true, criadoEm: true, payloadRaw: true },
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
      channel: { in: ['whatsapp.in', 'whatsapp.out', 'whatsapp.unofficial.in', 'whatsapp.unofficial.out'] },
    },
    orderBy: { criadoEm: 'desc' },
    take: limit,
    select: { channel: true, criadoEm: true, payloadRaw: true },
  });

  const ordered = [...events].reverse();

  const lines = ordered
    .map((ev) => {
      const ch = String(ev.channel || '').toLowerCase();
      const text = pickEventText(ev.payloadRaw);
      if (!text) return null;
      if (ch === 'whatsapp.in' || ch === 'whatsapp.unofficial.in') return `Lead: ${text}`;
      if (ch === 'whatsapp.out' || ch === 'whatsapp.unofficial.out') return `Agente: ${text}`;
      return null;
    })
    .filter(Boolean);

  return lines.join('\n');
}

// ── Core job handler ───────────────────────────────────────────────────────

async function handleInboundAiJob(
  job: Job,
  prisma: PrismaService,
  ai: AiService,
  whatsapp?: WhatsappService,
  unofficialService?: WhatsappUnofficialService,
  queue?: QueueService,
) {
  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  const jobStartAt = Date.now();
  logger.log('🧠 INBOUND AI JOB START', { jobId: job.id, leadId, data: job.data });

  // ── Nível 1: SaaS global ─────────────────────────────────────────────────
  const saasAutopilot = process.env.AUTOPILOT_ENABLED !== 'false';
  if (!saasAutopilot) {
    logger.log(`⏸ AUTOPILOT desligado globalmente (AUTOPILOT_ENABLED=false)`);
    return;
  }

  // ── Busca lead + tenant ───────────────────────────────────────────────────
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      nomeCorreto: true,
      telefone: true,
      status: true,
      botPaused: true,
      passouBaseFria: true,
      lastInboundAt: true,
      assignedUserId: true,
      conversaCanal: true,
      conversaSessionId: true,
    },
  });
  if (!lead) return;

  // Lead reativado pela Base Fria: por padrão a IA NÃO assume (corretor atende).
  // Se o tenant ligar "Reassumir leads da Base Fria", a IA volta a responder normal.
  if (lead.passouBaseFria) {
    const tcfg = await prisma.tenant.findUnique({
      where: { id: lead.tenantId },
      select: { aiReassumirBaseFria: true },
    });
    if (!tcfg?.aiReassumirBaseFria) {
      logger.log(`❄️ Lead passou pela Base Fria — IA suprimida, agendando base-fria-settle leadId=${lead.id}`);
      await queue?.scheduleBaseFriaSettle(lead.id).catch((e: any) =>
        logger.warn(`Falha ao agendar base-fria-settle leadId=${lead.id}: ${e?.message ?? e}`),
      );
      return;
    }
    logger.log(`❄️→🤖 Reassumir Base Fria ligado — IA responde normalmente leadId=${lead.id}`);
  }

  const assignedUser = lead.assignedUserId
    ? await prisma.user.findUnique({
        where: { id: lead.assignedUserId },
        select: { nome: true, apelido: true },
      })
    : null;
  const corretorNome = assignedUser?.apelido || assignedUser?.nome || null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: lead.tenantId },
    select: {
      id: true,
      autopilotEnabled: true,
      businessHours: true,
      outsideHoursMessage: true,
      aiDelayMin: true,
      aiDelayMax: true,
      aiTypingEnabled: true,
      aiHistoryLimit: true,
    },
  });
  if (!tenant) return;

  // ── Nível 2: Tenant autopilot ─────────────────────────────────────────────
  if (!tenant.autopilotEnabled) {
    logger.log(`⏸ AUTOPILOT desligado para tenant=${lead.tenantId}`);
    return;
  }

  // ── Nível 3: Horário de atendimento ───────────────────────────────────────
  const bh = tenant.businessHours as any;
  const tz = bh?.timezone || 'America/Sao_Paulo';
  if (!isWithinBusinessHours(bh, tz)) {
    logger.log(`🕐 Fora do horário de atendimento — tenant=${lead.tenantId}`);
    const msg = tenant.outsideHoursMessage ||
      'Olá! Nosso atendimento está encerrado no momento. Retornaremos assim que possível. 😊';
    if (whatsapp && lead.telefone) {
      await sendOutsideHoursMessage(prisma, whatsapp, lead.tenantId, lead.id, lead.telefone, msg);
    }
    // Reagenda a resposta real da IA para a próxima abertura do atendimento, para
    // não deixar a mensagem do lead sem resposta. +1min de margem após a abertura.
    const minsUntilOpen = minutesUntilNextOpen(bh, tz);
    if (queue && minsUntilOpen && minsUntilOpen > 0) {
      await queue
        .scheduleInboundAiAt(lead.id, minsUntilOpen * 60 + 60)
        .catch((e: any) => logger.warn(`Falha ao reagendar p/ abertura leadId=${lead.id}: ${e?.message ?? e}`));
      logger.log(`🕐 IA reagendada p/ abertura (~${minsUntilOpen}min) leadId=${lead.id}`);
    }
    return;
  }

  // ── Nível 4: Bot pausado por lead ─────────────────────────────────────────
  if (lead.botPaused) {
    logger.log(`⏸ Bot pausado para leadId=${lead.id} — corretor atende manualmente`);
    return;
  }

  // ── Nível 5: Cooldown — evita spam se bot já respondeu recentemente ────────
  const cooldownMinutes = Number(process.env.AI_INBOUND_COOLDOWN_MINUTES || 10);
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const recentOut = await prisma.leadEvent.findFirst({
    where: {
      leadId: lead.id,
      channel: { in: ['whatsapp.out', 'whatsapp.unofficial.out'] },
      criadoEm: { gte: new Date(Date.now() - cooldownMs) },
    },
    select: { id: true, criadoEm: true },
  });

  if (recentOut) {
    // Só bloqueia se não houve inbound APÓS o último outbound
    const inboundAfterOut = await prisma.leadEvent.findFirst({
      where: {
        leadId: lead.id,
        channel: { in: ['whatsapp.in', 'whatsapp.unofficial.in'] },
        criadoEm: { gt: recentOut.criadoEm },
      },
      select: { id: true },
    });

    if (!inboundAfterOut) {
      logger.log(
        `⏸ COOLDOWN: bot já respondeu há menos de ${cooldownMinutes}min, sem nova msg do lead (leadId=${lead.id})`,
      );
      return;
    }
  }

  // ── Busca agente ──────────────────────────────────────────────────────────
  const lastInbound = await getLastInboundEvent(prisma, lead.id);
  if (!lastInbound) {
    logger.log(`⚠️ INBOUND AI: último inbound não encontrado para leadId=${lead.id}`);
    return;
  }

  const historyLimit = tenant.aiHistoryLimit ?? 8;
  const lastLeadMessage = pickEventText(lastInbound.payloadRaw);
  const recentConversation = await getRecentConversationContext(prisma, lead.id, historyLimit);
  const minutesSinceLastInbound = formatMinutesSince(lastInbound.criadoEm);

  // ── Roteamento via Orquestrador ───────────────────────────────────────────
  let selectedAgent: any = null;

  const orchestrator = await prisma.aiAgent.findFirst({
    where: { tenantId: lead.tenantId, isOrchestrator: true, active: true },
    select: { id: true, title: true, slug: true, prompt: true, model: true, temperature: true },
  });

  if (orchestrator?.prompt) {
    const childAgents = await (prisma.aiAgent.findMany as any)({
      where: { tenantId: lead.tenantId, parentAgentId: orchestrator.id, active: true },
      select: { id: true, slug: true, title: true, description: true, objective: true, model: true, temperature: true, mode: true, agentType: true },
    }) as any[];

    // Apenas agentes CONVERSACIONAL falam diretamente com o lead
    const conversationalAgents = childAgents.filter(
      (a: any) => a.agentType !== 'OPERACIONAL',
    );

    if (conversationalAgents.length > 0) {
      // Busca etapa atual do lead para passar ao orquestrador
      const leadStage = await prisma.lead.findUnique({
        where: { id: lead.id },
        select: {
          stageId: true,
          nomeCorreto: true, rendaBrutaFamiliar: true, fgts: true,
          estadoCivil: true, perfilImovel: true, resumoLead: true,
        },
      });
      const stageKey = leadStage?.stageId
        ? (await prisma.pipelineStage.findUnique({ where: { id: leadStage.stageId }, select: { key: true } }))?.key ?? null
        : null;

      const qual: Record<string, any> = {};
      if (leadStage) {
        const { stageId: _s, ...fields } = leadStage;
        for (const [k, v] of Object.entries(fields)) {
          if (v !== null && v !== undefined) qual[k] = v;
        }
      }

      const routing = await ai.runOrchestrator({
        orchestratorPrompt: orchestrator.prompt,
        conversation: recentConversation,
        leadNome: (lead.nomeCorreto ?? lead.nome) || 'Lead',
        leadStatus: lead.status || 'NOVO',
        currentStageKey: stageKey,
        qualification: qual,
        childAgents: conversationalAgents,
      });

      if (routing.agentId) {
        selectedAgent = conversationalAgents.find(a => a.id === routing.agentId) ?? null;
        logger.log(`🎯 ORQUESTRADOR roteou para: ${routing.agentSlug} (leadId=${lead.id})`);
      }
    }
  }

  // Fallback se orquestrador não encontrado ou não roteou
  if (!selectedAgent) {
    selectedAgent = await ai.findDefaultAgentForTenant(lead.tenantId);
  }

  if (!selectedAgent?.id) {
    logger.log(`⚠️ INBOUND AI: nenhum agent ativo encontrado para tenant=${lead.tenantId}`);
    return;
  }

  // ── Nível 5: Modo do agente ───────────────────────────────────────────────
  const agentMode = (selectedAgent as any).mode ?? 'COPILOT';

  const conversationContext = [
    `Tempo desde a última mensagem do lead: ${minutesSinceLastInbound}.`,
    recentConversation ? `Histórico recente real da conversa:\n${recentConversation}` : '',
  ].filter(Boolean).join('\n\n');

  const AI_TIMEOUT_MS = 30_000;
  try {
    const aiCallPromise = ai.generateFollowUp({
      nome: String((lead.nomeCorreto ?? lead.nome) || 'Cliente').trim() || 'Cliente',
      status: String(lead.status || 'NOVO'),
      tenantId: lead.tenantId,
      agentId: selectedAgent.id,
      leadId: lead.id,
      lastLeadMessage,
      conversationContext,
      corretorNome,
      agentModel: (selectedAgent as any).model ?? undefined,
      agentTemperature: (selectedAgent as any).temperature ?? undefined,
      onToolCall: async (toolName, args) => {
        if (toolName === 'enviar_fotos_produto') {
          const productId =
            args.productId ||
            (await prisma.lead.findUnique({ where: { id: lead.id }, select: { produtoInteresseId: true } }))
              ?.produtoInteresseId;
          if (productId) {
            return sendImagesForProduct(prisma, lead, productId, unofficialService);
          }
          return 'produto de interesse não identificado';
        }
        return 'ferramenta não reconhecida';
      },
    } as any);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`IA timeout após ${AI_TIMEOUT_MS / 1000}s para leadId=${lead.id}`)), AI_TIMEOUT_MS),
    );
    const suggestion = await Promise.race([aiCallPromise, timeoutPromise]);

    if (!suggestion || !suggestion.trim()) {
      logger.log(`⚠️ INBOUND AI: suggestion vazia para leadId=${lead.id}`);
      return;
    }

    // ── Escalation check — deve acontecer antes de enviar ─────────────────────
    const escalation = await handleEscalation(prisma, whatsapp, lead, suggestion.trim());
    const finalText = escalation.text;

    if (!finalText) {
      // Escalação consumiu todo o texto — não envia mensagem vazia
      return;
    }

    const isLight = lead.conversaCanal === 'WHATSAPP_LIGHT';
    const canSend = isLight
      ? !!(unofficialService && lead.conversaSessionId && lead.telefone)
      : !!(whatsapp && lead.telefone);

    if (agentMode === 'AUTOPILOT' && canSend) {
      // Delay humanizado: descontamos o tempo já gasto desde o início do job
      const elapsedMs = Date.now() - jobStartAt;
      const minMs = (tenant.aiDelayMin ?? 5) * 1000;
      const maxMs = (tenant.aiDelayMax ?? 15) * 1000;
      const targetMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const remainingMs = Math.max(0, targetMs - elapsedMs);
      if (remainingMs > 0) {
        await new Promise((r) => setTimeout(r, remainingMs));
      }

      let metaResponse: any = null;
      if (isLight) {
        await unofficialService!.sendText(lead.conversaSessionId!, lead.telefone!, finalText);
      } else {
        metaResponse = await whatsapp!.sendMessage(lead.telefone!, finalText);
      }
      logger.log(`⚡ AUTOPILOT ENVIOU [${isLight ? 'LIGHT' : 'OFICIAL'}]: leadId=${lead.id}${escalation.escalated ? ' [ESCALATED]' : ''}`);

      await prisma.leadEvent.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: isLight ? 'whatsapp.unofficial.out' : 'whatsapp.out',
          payloadRaw: {
            text: finalText,
            source: 'inbound-ai.worker',
            mode: 'AUTOPILOT',
            agentId: selectedAgent.id,
            agentTitle: selectedAgent.title,
            aiAssistanceLabel: '100% IA',
            aiAssistancePercent: 100,
            escalated: escalation.escalated,
            escalationReason: escalation.reason ?? null,
            sentAt: new Date().toISOString(),
            metaResponse: metaResponse ?? null,
          },
        },
      });

      // Atualiza status para EM_CONTATO se ainda for NOVO
      if (lead.status === 'NOVO') {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'EM_CONTATO' },
        });
      }
    } else {
      // Salva como sugestão para o corretor aprovar
      await registerAiSuggestion(prisma, {
        tenantId: lead.tenantId,
        leadId: lead.id,
        agentId: selectedAgent.id,
        agentTitle: selectedAgent.title,
        text: finalText,
        source: 'inbound-ai.worker',
        mode: 'COPILOT',
        responseFormat: 'TEXT',
        audioScript: null,
        suggestedAttachments: [],
      });
    }
  } catch (err: any) {
    logger.error(
      `⚠️ Erro ao gerar suggestion no inbound-ai worker leadId=${lead.id}: ${err?.message || err}`,
    );
    throw err;
  }

  // ── Assistente Operacional (análise silenciosa pós-resposta) ────────────
  try {
    const [leadWithQual, stages] = await Promise.all([
      prisma.lead.findUnique({
        where: { id: lead.id },
        select: {
          stageId: true,
          nomeCorreto: true,
          nomeCorretoOrigem: true,
          rendaBrutaFamiliar: true,
          fgts: true,
          valorEntrada: true,
          estadoCivil: true,
          dataNascimento: true,
          perfilImovel: true,
          produtoInteresseId: true,
          empreendimentoInteresseId: true,
          interesseOrigem: true,
          resumoLead: true,
          cidade: true,
          observacao: true,
        },
      }),
      prisma.pipelineStage.findMany({
        where: { tenantId: lead.tenantId, isActive: true },
        select: { id: true, key: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    // Trava: se o lead já tem interesse real definido (IA ou MANUAL), não rebusca catálogo/empreendimentos.
    // O lead normalmente cita o interesse nas primeiras mensagens — depois disso é só ruído e custo.
    const interesseDefinido = !!(leadWithQual?.produtoInteresseId || leadWithQual?.empreendimentoInteresseId);

    let availableProducts: { id: string; title: string; standard?: string | null }[] = [];
    let availableDevelopments: { id: string; nome: string; cidade?: string | null }[] = [];
    if (!interesseDefinido) {
      const [products, developments] = await Promise.all([
        prisma.product.findMany({
          where: { tenantId: lead.tenantId, status: 'ACTIVE' },
          select: { id: true, title: true, type: true, city: true, neighborhood: true },
        }),
        prisma.development.findMany({
          where: { tenantId: lead.tenantId },
          select: { id: true, nome: true, cidade: true },
        }),
      ]);
      // Safeguard de escala: como o lead cita o item, pré-filtra por menção quando o catálogo é grande.
      const MAX_CANDIDATES = 40;
      availableProducts = prefilterByMention(
        products,
        recentConversation,
        (p) => [p.title, p.city, p.neighborhood],
        MAX_CANDIDATES,
      ).map((p) => ({
        id: p.id,
        title: p.title,
        standard: [String(p.type ?? ''), p.neighborhood, p.city].filter(Boolean).join(' · '),
      }));
      availableDevelopments = prefilterByMention(
        developments,
        recentConversation,
        (d) => [d.nome, d.cidade],
        MAX_CANDIDATES,
      ).map((d) => ({ id: d.id, nome: d.nome, cidade: d.cidade }));
    }

    const currentStage = leadWithQual?.stageId
      ? stages.find((s) => s.id === leadWithQual.stageId)
      : null;
    const currentStageKey = currentStage?.key ?? null;

    const { stageId: _sid, ...qualFields } = leadWithQual ?? {};
    const currentQualification: Record<string, any> = {};
    for (const [k, v] of Object.entries(qualFields)) {
      if (v !== null && v !== undefined) currentQualification[k] = v;
    }

    const analysis = await ai.runOperationalAnalysis({
      tenantId: lead.tenantId,
      leadId: lead.id,
      leadNome: (lead.nomeCorreto ?? lead.nome) || 'Lead',
      leadStatus: lead.status || 'NOVO',
      currentStageKey,
      conversation: recentConversation,
      currentQualification,
      availableStages: stages.map((s) => ({ key: s.key, name: s.name })),
      availableProducts,
      availableDevelopments,
    });

    // Aplica campos de qualificação
    const u = analysis.updates ?? {};
    const updateData: any = {};
    if (u.nomeCorreto !== undefined && leadWithQual?.nomeCorretoOrigem !== 'MANUAL') {
      updateData.nomeCorreto = u.nomeCorreto;
      updateData.nomeCorretoOrigem = u.nomeCorreto ? 'IA' : null;
    }
    if (u.rendaBrutaFamiliar !== undefined) updateData.rendaBrutaFamiliar = u.rendaBrutaFamiliar;
    if (u.fgts !== undefined) updateData.fgts = u.fgts;
    if (u.valorEntrada !== undefined) updateData.valorEntrada = u.valorEntrada;
    if (u.estadoCivil !== undefined) updateData.estadoCivil = u.estadoCivil;
    if (u.dataNascimento !== undefined) {
      updateData.dataNascimento = u.dataNascimento ? new Date(u.dataNascimento) : null;
    }
    if (u.perfilImovel !== undefined) updateData.perfilImovel = u.perfilImovel;
    // Interesse real (produto OU empreendimento) — mutuamente exclusivos. Só preenche quando ainda
    // não estava definido e a origem não é MANUAL. Valida o ID contra os candidatos (evita alucinação).
    if (!interesseDefinido && leadWithQual?.interesseOrigem !== 'MANUAL') {
      const validProductIds = new Set(availableProducts.map((p) => p.id));
      const validDevIds = new Set(availableDevelopments.map((d) => d.id));
      if (u.produtoInteresseId && validProductIds.has(u.produtoInteresseId)) {
        updateData.produtoInteresseId = u.produtoInteresseId;
        updateData.empreendimentoInteresseId = null;
        updateData.interesseOrigem = 'IA';
      } else if (u.empreendimentoInteresseId && validDevIds.has(u.empreendimentoInteresseId)) {
        updateData.empreendimentoInteresseId = u.empreendimentoInteresseId;
        updateData.produtoInteresseId = null;
        updateData.interesseOrigem = 'IA';
      }
    }
    if (u.resumoLead !== undefined) updateData.resumoLead = u.resumoLead;

    if (Object.keys(updateData).length > 0) {
      await prisma.lead.update({
        where: { id: lead.id, tenantId: lead.tenantId },
        data: updateData,
      });
      logger.log(
        `🤖 ASSISTENTE OPERACIONAL: ${Object.keys(updateData).length} campo(s) atualizado(s) leadId=${lead.id}`,
      );
    }

    // Mapeamento stageKey → status do lead
    const STAGE_TO_STATUS: Record<string, LeadStatus> = {
      NOVO_LEAD: LeadStatus.NOVO,
      PRIMEIRO_CONTATO: LeadStatus.EM_CONTATO,
      INTERESSE_QUALIFICACAO_CONFIRMADOS: LeadStatus.QUALIFICADO,
      PROPOSTA: LeadStatus.PROPOSTA,
      APROVACAO_CREDITO_PROPOSTA: LeadStatus.PROPOSTA,
      CONTRATO: LeadStatus.FECHADO,
      ASSINATURA_CONTRATO: LeadStatus.FECHADO,
      ENTREGA_CONTRATO_REGISTRADO: LeadStatus.FECHADO,
    };

    // Move de etapa se identificado
    if (analysis.stageKey) {
      const targetStage = stages.find((s) => s.key === analysis.stageKey);
      if (targetStage && targetStage.id !== leadWithQual?.stageId) {
        const newStatus = STAGE_TO_STATUS[analysis.stageKey];
        await prisma.lead.update({
          where: { id: lead.id, tenantId: lead.tenantId },
          data: {
            stageId: targetStage.id,
            ...(newStatus ? { status: newStatus } : {}),
          },
        });
        await prisma.leadEvent.create({
          data: {
            tenantId: lead.tenantId,
            leadId: lead.id,
            channel: 'stage.changed',
            payloadRaw: {
              fromStageKey: currentStageKey,
              toStageKey: analysis.stageKey,
              toStageName: targetStage.name,
              source: 'assistente-operacional',
              at: new Date().toISOString(),
            },
          },
        });
        logger.log(`🔄 ASSISTENTE OPERACIONAL: etapa → ${analysis.stageKey} leadId=${lead.id}`);

        // Notifica usuários que querem saber desta etapa
        if (whatsapp) {
          const stageMsg = `📍 *${lead.nomeCorreto ?? lead.nome}* avançou para *${targetStage.name}*\nWhatsApp: ${lead.telefone || '—'}`;
          await notifyUsersForStage(prisma, whatsapp, lead.tenantId, analysis.stageKey, stageMsg, lead.assignedUserId);
        }
      }
    }

    // Em vez de notificar a cada mensagem, (re)arma o cronômetro de "conversa assentou".
    // Quando o lead ficar em silêncio pela janela, o worker de qualificação (qual-settle)
    // avalia renda × faixa do produto e manda UM resumo consolidado ao corretor.
    if (queue) {
      await queue
        .scheduleQualSettle(lead.id)
        .catch((e: any) => logger.warn(`Falha ao agendar qual-settle leadId=${lead.id}: ${e?.message ?? e}`));
    }
  } catch (opErr: any) {
    logger.log(
      `⚠️ Assistente Operacional erro leadId=${lead.id}: ${opErr?.message || opErr}`,
    );
  }
}

// ── Qualificação: avaliação quando a conversa assenta ──────────────────────
// Dispara após o lead ficar em silêncio pela janela (debounce no QueueService).
// Avalia renda × faixa do produto de interesse e manda UM resumo ao corretor.
async function handleQualSettleJob(
  job: Job,
  prisma: PrismaService,
  whatsapp?: WhatsappService,
) {
  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, tenantId: true, nome: true, nomeCorreto: true, telefone: true,
      assignedUserId: true, deletedAt: true,
      rendaBrutaFamiliar: true, fgts: true, valorEntrada: true, perfilImovel: true,
      estadoCivil: true, dataNascimento: true, resumoLead: true,
      produtoInteresseId: true, empreendimentoInteresseId: true,
    },
  });
  if (!lead || lead.deletedAt) return;

  const renda = lead.rendaBrutaFamiliar;
  const temProduto = !!(lead.produtoInteresseId || lead.empreendimentoInteresseId);

  // Nada coletado ainda → o aviso de "novo lead" já cobriu; não há resumo de qualificação.
  if (renda == null && !temProduto) {
    logger.log(`⏳ qual-settle: lead sem dados de qualificação — sem aviso leadId=${lead.id}`);
    return;
  }

  // Faixa de renda do produto de interesse (campos já existem em Product).
  let interesseNome: string | null = null;
  let minIncome: number | null = null;
  let maxIncome: number | null = null;
  let temFaixa = false;
  if (lead.produtoInteresseId) {
    const p = await prisma.product.findUnique({
      where: { id: lead.produtoInteresseId },
      select: { title: true, minBuyerIncome: true, buyerIncomeLimit: true },
    });
    interesseNome = p?.title ?? null;
    minIncome = p?.minBuyerIncome != null ? Number(p.minBuyerIncome) : null;
    maxIncome = p?.buyerIncomeLimit != null ? Number(p.buyerIncomeLimit) : null;
    temFaixa = minIncome != null || maxIncome != null;
  } else if (lead.empreendimentoInteresseId) {
    const d = await prisma.development.findUnique({
      where: { id: lead.empreendimentoInteresseId },
      select: { nome: true },
    });
    interesseNome = d?.nome ?? null;
  }

  // Veredito objetivo: renda × faixa do produto.
  type Verdict = 'QUALIFICADO' | 'RENDA_INCOMPATIVEL' | 'INCOMPLETO';
  let verdict: Verdict;
  const faltas: string[] = [];
  let semFaixaAviso = false;
  if (renda == null) {
    verdict = 'INCOMPLETO';
    faltas.push('renda');
  } else if (!temProduto) {
    verdict = 'INCOMPLETO';
    faltas.push('imóvel de interesse');
  } else if (temFaixa) {
    const acimaMin = minIncome == null || renda >= minIncome;
    const abaixoMax = maxIncome == null || renda <= maxIncome;
    verdict = acimaMin && abaixoMax ? 'QUALIFICADO' : 'RENDA_INCOMPATIVEL';
  } else {
    // Tem renda + produto, mas produto sem faixa cadastrada → qualifica e avisa.
    verdict = 'QUALIFICADO';
    semFaixaAviso = true;
  }

  // Dedup: não reenvia se veredito + renda + produto não mudaram desde o último settle.
  const signature = `${verdict}|${renda ?? ''}|${lead.produtoInteresseId ?? lead.empreendimentoInteresseId ?? ''}`;
  const lastSettle = await prisma.leadEvent.findFirst({
    where: { tenantId: lead.tenantId, leadId: lead.id, channel: 'ai.qual_settle' },
    orderBy: { criadoEm: 'desc' },
    select: { payloadRaw: true },
  });
  if (lastSettle && (lastSettle.payloadRaw as any)?.signature === signature) {
    logger.log(`🔁 qual-settle: sem mudança desde o último aviso leadId=${lead.id}`);
    return;
  }

  const fmtMoney = (v: any) => (v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null);
  const fmtDate = (v: any) => { if (!v) return null; try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return null; } };
  const nome = lead.nomeCorreto ?? lead.nome;

  const header =
    verdict === 'QUALIFICADO' ? `🎯 *Lead qualificado: ${nome}*`
    : verdict === 'RENDA_INCOMPATIVEL' ? `⚠️ *Renda incompatível: ${nome}*`
    : `⏳ *Lead incompleto: ${nome}*`;

  const linhas: string[] = [header, `📱 WhatsApp: ${lead.telefone || '—'}`, ''];
  if (renda != null) linhas.push(`💰 Renda bruta: ${fmtMoney(renda)}`);
  if (lead.fgts != null) linhas.push(`🏦 FGTS: ${fmtMoney(lead.fgts)}`);
  if (lead.valorEntrada != null) linhas.push(`💵 Entrada: ${fmtMoney(lead.valorEntrada)}`);
  if (interesseNome) linhas.push(`📋 Interesse: ${interesseNome}`);
  if (temFaixa) {
    const faixa = [
      minIncome != null ? `mín ${fmtMoney(minIncome)}` : null,
      maxIncome != null ? `máx ${fmtMoney(maxIncome)}` : null,
    ].filter(Boolean).join(' / ');
    linhas.push(`📊 Faixa do imóvel: ${faixa}`);
  }
  if (lead.perfilImovel) linhas.push(`🏠 Perfil: ${lead.perfilImovel}`);
  if (lead.estadoCivil) linhas.push(`💍 Estado civil: ${lead.estadoCivil}`);
  if (lead.dataNascimento) linhas.push(`🎂 Nascimento: ${fmtDate(lead.dataNascimento)}`);

  if (verdict === 'RENDA_INCOMPATIVEL') {
    linhas.push('', '⚠️ A renda informada não atende à faixa exigida pelo imóvel de interesse.');
  }
  if (verdict === 'INCOMPLETO') {
    linhas.push('', `⏳ O lead parou de responder. Falta: ${faltas.join(', ')}.`);
  }
  if (semFaixaAviso) {
    linhas.push('', 'ℹ️ Imóvel de interesse sem faixa de renda cadastrada — confira o cadastro.');
  }
  if (lead.resumoLead) {
    linhas.push('', '📝 *Resumo IA:*', lead.resumoLead);
  }

  const msg = linhas.join('\n');
  if (whatsapp) {
    await notifyAssignedUser(prisma, whatsapp, lead.tenantId, lead.assignedUserId, msg, (uid) =>
      userWantsEvent(prisma, uid, 'lead_qualified'),
    );

    // Broadcast: OWNERs com "receber todos os qualificados do tenant" ligado recebem
    // os leads QUALIFICADOS de toda a equipe (não só os seus). Inclui o responsável na msg.
    if (verdict === 'QUALIFICADO') {
      const owners = await prisma.user.findMany({
        where: { tenantId: lead.tenantId, ativo: true, role: 'OWNER', whatsappNumber: { not: null } },
        select: { id: true, whatsappNumber: true },
      });
      if (owners.length) {
        const responsavel = lead.assignedUserId
          ? await prisma.user.findUnique({ where: { id: lead.assignedUserId }, select: { apelido: true, nome: true } })
          : null;
        const responsavelNome = responsavel?.apelido || responsavel?.nome || 'Sem responsável';
        const msgOwner = `${msg}\n\n👤 Atendido por: ${responsavelNome}`;
        for (const owner of owners) {
          if (owner.id === lead.assignedUserId) continue; // já notificado como responsável
          const prefs = await getUserNotifPrefs(prisma, owner.id);
          if (!prefs.allTenantQualified) continue;
          whatsapp
            .sendMessage(owner.whatsappNumber!, msgOwner, lead.tenantId)
            .catch((err: any) => logger.warn(`Falha ao notificar owner (allTenantQualified): ${err?.message}`));
        }
      }
    }
  }

  await prisma.leadEvent.create({
    data: {
      tenantId: lead.tenantId,
      leadId: lead.id,
      channel: 'ai.qual_settle',
      payloadRaw: { verdict, signature, at: new Date().toISOString() },
    },
  });

  logger.log(`📢 qual-settle: ${verdict} → corretor leadId=${lead.id}`);
}

// Base Fria — após o silêncio, notifica o corretor com as mensagens recebidas (sem IA).
async function handleBaseFriaSettleJob(
  job: Job,
  prisma: PrismaService,
  whatsapp?: WhatsappService,
) {
  const leadId = job.data?.leadId as string | undefined;
  if (!leadId) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, tenantId: true, nome: true, nomeCorreto: true, telefone: true,
      assignedUserId: true, deletedAt: true, passouBaseFria: true,
    },
  });
  if (!lead || lead.deletedAt || !lead.passouBaseFria) return;

  // Marco da reativação: pega as mensagens recebidas desde então.
  const reactivated = await prisma.leadEvent.findFirst({
    where: { tenantId: lead.tenantId, leadId: lead.id, channel: 'base_fria.reactivated' },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  });
  const since = reactivated?.criadoEm ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const inboundEvents = await prisma.leadEvent.findMany({
    where: {
      tenantId: lead.tenantId,
      leadId: lead.id,
      channel: { in: ['whatsapp.unofficial.in', 'whatsapp.in'] },
      criadoEm: { gte: since },
    },
    orderBy: { criadoEm: 'asc' },
    take: 20,
    select: { id: true, payloadRaw: true, criadoEm: true },
  });
  if (inboundEvents.length === 0) {
    logger.log(`❄️ base-fria-settle: sem mensagens recebidas leadId=${lead.id}`);
    return;
  }

  // Dedup: não reenvia se a última mensagem é a mesma do último aviso.
  const lastEventId = inboundEvents[inboundEvents.length - 1].id;
  const lastSettle = await prisma.leadEvent.findFirst({
    where: { tenantId: lead.tenantId, leadId: lead.id, channel: 'base_fria.settle' },
    orderBy: { criadoEm: 'desc' },
    select: { payloadRaw: true },
  });
  if (lastSettle && (lastSettle.payloadRaw as any)?.lastEventId === lastEventId) {
    logger.log(`🔁 base-fria-settle: sem mensagens novas leadId=${lead.id}`);
    return;
  }

  const nome = lead.nomeCorreto ?? lead.nome;
  const mensagens = inboundEvents
    .map((e) => (e.payloadRaw as any)?.text)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .slice(-5);

  const linhas: string[] = [
    `❄️ *Lead respondeu (Base Fria): ${nome}*`,
    `📱 WhatsApp: ${lead.telefone || '—'}`,
    '',
    'Este lead voltou a responder após a campanha de reaquecimento. A IA não está atendendo — assuma a conversa.',
  ];
  if (mensagens.length) {
    linhas.push('', '💬 *Mensagens recebidas:*', ...mensagens.map((m) => `• ${m}`));
  }
  const msg = linhas.join('\n');

  if (whatsapp) {
    await notifyAssignedUser(prisma, whatsapp, lead.tenantId, lead.assignedUserId, msg, (uid) =>
      userWantsEvent(prisma, uid, 'lead_qualified'),
    );
  }

  await prisma.leadEvent.create({
    data: {
      tenantId: lead.tenantId,
      leadId: lead.id,
      channel: 'base_fria.settle',
      payloadRaw: { lastEventId, at: new Date().toISOString() },
    },
  });

  logger.log(`📢 base-fria-settle → corretor leadId=${lead.id}`);
}

// ── Worker bootstrap ───────────────────────────────────────────────────────

export function startInboundAiWorker(
  prisma: PrismaService,
  ai: AiService,
  whatsapp?: WhatsappService,
  unofficialService?: WhatsappUnofficialService,
  queue?: QueueService,
) {
  logger.log('🧠 Inbound AI Worker boot', { redis: getRedisConnection() });

  const worker = new Worker(
    'inbound-ai-queue',
    async (job) => {
      if (job.name === 'qual-settle') {
        await handleQualSettleJob(job, prisma, whatsapp);
      } else if (job.name === 'base-fria-settle') {
        await handleBaseFriaSettleJob(job, prisma, whatsapp);
      } else {
        await handleInboundAiJob(job, prisma, ai, whatsapp, unofficialService, queue);
      }
    },
    {
      connection: getRedisConnection(),
      lockDuration: 60000,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`✅ inbound-ai job completed: ${job.id} (${job.name})`);
  });

  worker.on('failed', (job, err) => {
    logger.log(`❌ inbound-ai job failed: ${job?.id} (${job?.name}) -> ${err?.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`🔴 Inbound AI Worker erro de conexão (Redis indisponível?): ${err?.message}`);
  });

  logger.log('🚀 Inbound AI Worker iniciado (fila: inbound-ai-queue)');

  return worker;
}
