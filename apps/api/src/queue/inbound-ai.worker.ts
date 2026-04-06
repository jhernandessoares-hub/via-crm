import { Worker, Job } from 'bullmq';
import { Logger } from '../logger';

const logger = new Logger('InboundAiWorker');
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../secretary/whatsapp.service';
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

async function notifyUsersForEvent(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  eventKey: string,
  message: string,
) {
  const users = await prisma.user.findMany({
    where: { tenantId, ativo: true, whatsappNumber: { not: null } },
    select: { whatsappNumber: true, notificationSettings: true },
  });

  for (const u of users) {
    if (!u.whatsappNumber) continue;
    const settings = (u.notificationSettings as any) || {};
    const events: string[] = settings.events ?? ['new_lead'];
    if (!events.includes(eventKey)) continue;
    whatsapp.sendMessage(u.whatsappNumber, message, tenantId).catch(() => {});
  }
}

async function notifyUsersForStage(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  tenantId: string,
  stageKey: string,
  message: string,
) {
  const users = await prisma.user.findMany({
    where: { tenantId, ativo: true, whatsappNumber: { not: null } },
    select: { whatsappNumber: true, notificationSettings: true },
  });

  for (const u of users) {
    if (!u.whatsappNumber) continue;
    const settings = (u.notificationSettings as any) || {};
    const stages: string[] = settings.stages ?? [];
    if (!stages.includes(stageKey)) continue;
    whatsapp.sendMessage(u.whatsappNumber, message, tenantId).catch(() => {});
  }
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
    where: { leadId, channel: 'whatsapp.in' },
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
    where: { leadId, channel: { in: ['whatsapp.in', 'whatsapp.out'] } },
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
      if (ch === 'whatsapp.in') return `Lead: ${text}`;
      if (ch === 'whatsapp.out') return `Agente: ${text}`;
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
      telefone: true,
      status: true,
      botPaused: true,
      lastInboundAt: true,
    },
  });
  if (!lead) return;

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
        leadNome: lead.nome || 'Lead',
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

  try {
    const suggestion = await ai.generateFollowUp({
      nome: String(lead.nome || 'Cliente').trim() || 'Cliente',
      status: String(lead.status || 'NOVO'),
      tenantId: lead.tenantId,
      agentId: selectedAgent.id,
      leadId: lead.id,
      lastLeadMessage,
      conversationContext,
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

    if (!suggestion || !suggestion.trim()) {
      logger.log(`⚠️ INBOUND AI: suggestion vazia para leadId=${lead.id}`);
      return;
    }

    if (agentMode === 'AUTOPILOT' && whatsapp && lead.telefone) {
      // Delay humanizado: descontamos o tempo já gasto desde o início do job
      const elapsedMs = Date.now() - jobStartAt;
      const minMs = (tenant.aiDelayMin ?? 5) * 1000;
      const maxMs = (tenant.aiDelayMax ?? 15) * 1000;
      const targetMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const remainingMs = Math.max(0, targetMs - elapsedMs);
      if (remainingMs > 0) {
        await new Promise((r) => setTimeout(r, remainingMs));
      }

      // Envia primeiro para capturar o wamid da Meta (necessário para exibir reações no chat)
      const metaResponse = await whatsapp.sendMessage(lead.telefone, suggestion.trim());
      logger.log(`⚡ AUTOPILOT ENVIOU: leadId=${lead.id}`);

      await prisma.leadEvent.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          channel: 'whatsapp.out',
          payloadRaw: {
            text: suggestion.trim(),
            source: 'inbound-ai.worker',
            mode: 'AUTOPILOT',
            agentId: selectedAgent.id,
            agentTitle: selectedAgent.title,
            aiAssistanceLabel: '100% IA',
            aiAssistancePercent: 100,
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
        text: suggestion.trim(),
        source: 'inbound-ai.worker',
        mode: 'COPILOT',
        responseFormat: 'TEXT',
        audioScript: null,
        suggestedAttachments: [],
      });
    }
  } catch (err: any) {
    logger.log(
      `⚠️ Erro ao gerar suggestion no inbound-ai worker leadId=${lead.id}: ${err?.message || err}`,
    );
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
      leadNome: lead.nome || 'Lead',
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
      if (u.nomeCorreto) updateData.nome = u.nomeCorreto;
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

    // Move de etapa se identificado
    if (analysis.stageKey) {
      const targetStage = stages.find((s) => s.key === analysis.stageKey);
      if (targetStage && targetStage.id !== leadWithQual?.stageId) {
        await prisma.lead.update({
          where: { id: lead.id, tenantId: lead.tenantId },
          data: { stageId: targetStage.id },
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
          const stageMsg = `📍 *${lead.nome}* avançou para *${targetStage.name}*\nWhatsApp: ${lead.telefone || '—'}`;
          await notifyUsersForStage(prisma, whatsapp, lead.tenantId, analysis.stageKey, stageMsg);
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
          const qualMsg = `🎯 *Lead qualificado: ${lead.nome}*\n${analysis.notifyMessage}`;
          await notifyUsersForEvent(prisma, whatsapp, lead.tenantId, 'lead_qualified', qualMsg);
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
) {
  logger.log('🧠 Inbound AI Worker boot', { redis: getRedisConnection() });

  const worker = new Worker(
    'inbound-ai-queue',
    async (job) => {
      await handleInboundAiJob(job, prisma, ai, whatsapp);
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
