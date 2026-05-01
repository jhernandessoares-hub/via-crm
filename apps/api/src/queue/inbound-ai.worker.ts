import { Worker, Job } from 'bullmq';
import { LeadStatus } from '@prisma/client';
import { Logger } from '../logger';

const logger = new Logger('InboundAiWorker');
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../secretary/whatsapp.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
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

// ── Notification helpers ───────────────────────────────────────────────────

const NOTIFY_EVENT_KEYS = new Set(['new_lead', 'lead_qualified']);

// Notifica o responsável atribuído; se não houver, notifica todos os OWNERs ativos do tenant
async function notifyAssignedUser(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  assignedUserId: string | null | undefined,
  message: string,
) {
  if (assignedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: assignedUserId, tenantId, ativo: true, whatsappNumber: { not: null } },
      select: { whatsappNumber: true },
    });
    if (user?.whatsappNumber) {
      whatsapp.sendMessage(user.whatsappNumber, message, tenantId).catch((err: any) => logger.warn(`Falha ao notificar usuário assignado: ${err?.message}`));
    }
    return;
  }

  // Fallback: sem responsável → notifica todos os OWNERs com WhatsApp cadastrado
  const owners = await prisma.user.findMany({
    where: { tenantId, ativo: true, role: 'OWNER', whatsappNumber: { not: null } },
    select: { whatsappNumber: true },
  });
  for (const owner of owners) {
    if (owner.whatsappNumber) {
      whatsapp.sendMessage(owner.whatsappNumber, message, tenantId).catch((err: any) => logger.warn(`Falha ao notificar owner fallback: ${err?.message}`));
    }
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
  const STAGE_NOTIFY_KEYS = new Set(['INTERESSE_QUALIFICACAO_CONFIRMADOS', 'NAO_QUALIFICADO', 'AGENDAMENTO_VISITA']);
  if (!STAGE_NOTIFY_KEYS.has(stageKey)) return;
  await notifyAssignedUser(prisma, whatsapp, tenantId, assignedUserId, message);
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
  whatsapp: WhatsappService,
  lead: { id: string; tenantId: string; telefone: string | null },
  productId: string,
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

  for (const img of images) {
    const caption = img.customLabel || img.title || productWithImages?.title || undefined;
    try {
      await sendImageViaWhatsapp(prisma, lead.tenantId, lead.telefone, img.url, caption);
      await prisma.leadEvent.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: 'whatsapp.out',
          payloadRaw: {
            type: 'image',
            media: {
              url: img.url,
              mimeType: 'image/jpeg',
              filename: caption || 'foto-produto.jpg',
            },
            caption,
            source: 'agent-tool.enviar_fotos_produto',
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

  logger.log(`📸 FERRAMENTA: ${images.length} foto(s) enviada(s) leadId=${lead.id}`);
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
      lastInboundAt: true,
      assignedUserId: true,
      conversaCanal: true,
      conversaSessionId: true,
    },
  });
  if (!lead) return;

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
        if (toolName === 'enviar_fotos_produto' && whatsapp) {
          const productId =
            args.productId ||
            (await prisma.lead.findUnique({ where: { id: lead.id }, select: { produtoInteresseId: true } }))
              ?.produtoInteresseId;
          if (productId) {
            return sendImagesForProduct(prisma, whatsapp, lead, productId);
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
    const [leadWithQual, stages, products] = await Promise.all([
      prisma.lead.findUnique({
        where: { id: lead.id },
        select: {
          stageId: true,
          nomeCorreto: true,
          rendaBrutaFamiliar: true,
          fgts: true,
          valorEntrada: true,
          estadoCivil: true,
          dataNascimento: true,
          tempoProcurandoImovel: true,
          conversouComCorretor: true,
          qualCorretorImobiliaria: true,
          perfilImovel: true,
          produtoInteresseId: true,
          resumoLead: true,
        },
      }),
      prisma.pipelineStage.findMany({
        where: { tenantId: lead.tenantId, isActive: true },
        select: { id: true, key: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.product.findMany({
        where: { tenantId: lead.tenantId, status: 'ACTIVE' },
        select: { id: true, title: true, type: true },
        take: 20,
      }),
    ]);

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
      availableProducts: products.map((p) => ({
        id: p.id,
        title: p.title,
        standard: String(p.type ?? ''),
      })),
    });

    // Aplica campos de qualificação
    const u = analysis.updates ?? {};
    const updateData: any = {};
    if (u.nomeCorreto !== undefined) {
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
    if (u.tempoProcurandoImovel !== undefined) updateData.tempoProcurandoImovel = u.tempoProcurandoImovel;
    if (u.conversouComCorretor !== undefined) updateData.conversouComCorretor = u.conversouComCorretor;
    if (u.qualCorretorImobiliaria !== undefined) updateData.qualCorretorImobiliaria = u.qualCorretorImobiliaria;
    if (u.perfilImovel !== undefined) updateData.perfilImovel = u.perfilImovel;
    if (u.produtoInteresseId !== undefined) updateData.produtoInteresseId = u.produtoInteresseId;
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

    // Notificação para o corretor (throttle: no máximo 1 a cada 30 minutos)
    if (analysis.notifyBroker && analysis.notifyMessage) {
      const recentNotify = await prisma.leadEvent.findFirst({
        where: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: 'ai.broker_notify',
          criadoEm: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        select: { id: true },
      });

      if (!recentNotify) {
        await prisma.leadEvent.create({
          data: {
            tenantId: lead.tenantId,
            leadId: lead.id,
            channel: 'ai.broker_notify',
            payloadRaw: {
              message: analysis.notifyMessage,
              source: 'assistente-operacional',
              at: new Date().toISOString(),
            },
          },
        });

        // Envia WhatsApp para usuários que querem notificação de lead qualificado
        if (whatsapp) {
          // Mescla dados já salvos com os atualizados agora
          const mergedQual = { ...currentQualification, ...updateData };

          const fmt = (v: any) => (v !== null && v !== undefined ? String(v) : null);
          const fmtBool = (v: any) => (v === true ? 'Sim' : v === false ? 'Não' : null);
          const fmtMoney = (v: any) => (v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null);
          const fmtDate = (v: any) => {
            if (!v) return null;
            try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return null; }
          };
          const produtoNome = mergedQual.produtoInteresseId
            ? (products.find((p) => p.id === mergedQual.produtoInteresseId)?.title ?? mergedQual.produtoInteresseId)
            : null;

          const linhas: string[] = [
            `🎯 *Lead qualificado: ${lead.nomeCorreto ?? lead.nome}*`,
            `📱 WhatsApp: ${lead.telefone || '—'}`,
            '',
          ];

          if (mergedQual.rendaBrutaFamiliar != null) linhas.push(`💰 Renda bruta: ${fmtMoney(mergedQual.rendaBrutaFamiliar)}`);
          if (mergedQual.fgts != null) linhas.push(`🏦 FGTS: ${fmtMoney(mergedQual.fgts)}`);
          if (mergedQual.valorEntrada != null) linhas.push(`💵 Entrada: ${fmtMoney(mergedQual.valorEntrada)}`);
          if (mergedQual.perfilImovel) linhas.push(`🏠 Perfil: ${fmt(mergedQual.perfilImovel)}`);
          if (produtoNome) linhas.push(`📋 Interesse: ${produtoNome}`);
          if (mergedQual.estadoCivil) linhas.push(`💍 Estado civil: ${fmt(mergedQual.estadoCivil)}`);
          if (mergedQual.dataNascimento) linhas.push(`🎂 Nascimento: ${fmtDate(mergedQual.dataNascimento)}`);
          if (mergedQual.tempoProcurandoImovel) linhas.push(`⏱ Procurando há: ${fmt(mergedQual.tempoProcurandoImovel)}`);
          if (mergedQual.conversouComCorretor != null) linhas.push(`🤝 Conversou c/ corretor: ${fmtBool(mergedQual.conversouComCorretor)}`);
          if (mergedQual.qualCorretorImobiliaria) linhas.push(`🏢 Corretor anterior: ${fmt(mergedQual.qualCorretorImobiliaria)}`);

          if (mergedQual.resumoLead) {
            linhas.push('', `📝 *Resumo IA:*`, mergedQual.resumoLead);
          }

          const qualMsg = linhas.join('\n');
          await notifyUsersForEvent(prisma, whatsapp, lead.tenantId, 'lead_qualified', qualMsg, lead.assignedUserId);
        }

        logger.log(`📢 ASSISTENTE OPERACIONAL: notificou corretor leadId=${lead.id}`);
      } else {
        logger.log(`🔕 ASSISTENTE OPERACIONAL: notificação suprimida (throttle 30min) leadId=${lead.id}`);
      }
    }
  } catch (opErr: any) {
    logger.log(
      `⚠️ Assistente Operacional erro leadId=${lead.id}: ${opErr?.message || opErr}`,
    );
  }
}

// ── Worker bootstrap ───────────────────────────────────────────────────────

export function startInboundAiWorker(
  prisma: PrismaService,
  ai: AiService,
  whatsapp?: WhatsappService,
  unofficialService?: WhatsappUnofficialService,
) {
  logger.log('🧠 Inbound AI Worker boot', { redis: getRedisConnection() });

  const worker = new Worker(
    'inbound-ai-queue',
    async (job) => {
      await handleInboundAiJob(job, prisma, ai, whatsapp, unofficialService);
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
