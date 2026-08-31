import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { Logger } from '../logger';
import { getNextLeadNumber } from '../leads/lead-numbering.helper';
import { resolveTenantFirstStage } from '../pipeline/pipeline.service';

const logger = new Logger('LeadUpsertHelper');

function digitsOnly(v: string) {
  return (v || '').replace(/\D/g, '');
}

async function resolveAssignment(
  prisma: PrismaService,
  tenantId: string,
): Promise<{ branchId: string | null; assignedUserId: string | null }> {
  try {
    const branch = await prisma.branch.findFirst({
      where: { tenantId, ativo: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    const branchId = branch?.id ?? null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { roundRobinConfig: true },
    });
    const cfg = (tenant?.roundRobinConfig ?? {}) as any;
    const roles: string[] = ['AGENT'];
    if (cfg.incluirGerentes) roles.push('MANAGER');
    if (cfg.incluirOwner) roles.push('OWNER');

    const candidates = await prisma.user.findMany({
      where: {
        tenantId,
        ativo: true,
        recebeLeads: true,
        role: { in: roles as any[] },
        ...(branchId ? { branchId } : {}),
      },
      select: { id: true },
    });

    // Fallback: sem candidatos elegíveis → atribui ao OWNER ativo
    if (candidates.length === 0) {
      const owner = await prisma.user.findFirst({
        where: { tenantId, ativo: true, role: 'OWNER' },
        select: { id: true },
      });
      return { branchId, assignedUserId: owner?.id ?? null };
    }

    const withLastLead = await Promise.all(
      candidates.map(async (c) => {
        const last = await prisma.lead.findFirst({
          where: { tenantId, assignedUserId: c.id, deletedAt: null },
          orderBy: { criadoEm: 'desc' },
          select: { criadoEm: true },
        });
        return { id: c.id, lastAt: last?.criadoEm ?? new Date(0) };
      }),
    );

    withLastLead.sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime());

    return { branchId, assignedUserId: withLastLead[0].id };
  } catch (err: any) {
    logger.warn(`resolveAssignment erro: ${err?.message ?? err}`);
    return { branchId: null, assignedUserId: null };
  }
}

export function telefoneKeyFrom(from: string) {
  let d = digitsOnly(from);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  if (d.length >= 9) return d.slice(-9);
  return d;
}

interface UpsertLeadParams {
  tenantId: string;
  from: string;
  text: string;
  type: string;
  sessionId: string | null;
  rawMsg?: any;
  contactName?: string | null;
  avatarUrl?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  transcription?: string | null;
  media?: { url: string; mimeType: string; filename: string | null; kind: string } | null;
}

interface FindOrCreateLeadParams {
  tenantId: string;
  from: string;
  contactName?: string | null;
  avatarUrl?: string | null;
  /** Etapa inicial do lead quando precisa ser criado (não usado se lead já existir). Se ausente, usa a 1ª etapa ativa do pipeline default. */
  stageId?: string | null;
  /** Origem exibida no cadastro do lead (ex: 'WhatsApp Light', 'Campanha WhatsApp'). */
  origem?: string | null;
  /** Canal salvo em conversaCanal/lastEntryChannel. */
  canal?: string | null;
  /** ID da sessão Light salvo em conversaSessionId (quando aplicável). */
  conversaSessionId?: string | null;
  /** Marca a conversa como aberta ao criar (usado no fluxo de inbound; padrão false). */
  conversaAberta?: boolean;
  /** Grava lastInboundAt=now ao criar (só faz sentido quando há mensagem recebida do contato). Padrão true. */
  setLastInboundAt?: boolean;
}

/**
 * Encontra (por telefoneKey, dedup) ou cria um Lead a partir de um telefone de
 * WhatsApp. Cuida de: dedup, resolução de branch + round-robin de atribuição,
 * numeração sequencial e criação do registro (+ LeadTransitionLog inicial).
 *
 * Diferente de `upsertLeadFromWhatsapp`, esta função NÃO cria LeadEvent nem
 * agenda IA/SLA — é usada em contextos onde não houve uma mensagem recebida
 * do contato (ex: criação de lead no momento do disparo de campanha).
 */
export async function findOrCreateLeadByPhone(
  prisma: PrismaService,
  params: FindOrCreateLeadParams,
): Promise<{ leadId: string; isNew: boolean; assignedUserId: string | null }> {
  const { tenantId, from, contactName, avatarUrl, stageId, origem, canal, conversaSessionId, conversaAberta, setLastInboundAt } = params;
  const now = new Date();
  const telefoneKey = telefoneKeyFrom(from);

  const existingLead = telefoneKey
    ? await prisma.lead.findFirst({
        where: { tenantId, telefoneKey, deletedAt: null },
        select: { id: true },
        orderBy: { criadoEm: 'desc' },
      })
    : null;

  if (existingLead) {
    return { leadId: existingLead.id, isNew: false, assignedUserId: null };
  }

  const [resolvedStage, assignment] = await Promise.all([
    stageId
      ? prisma.pipelineStage.findFirst({ where: { id: stageId, tenantId }, select: { id: true, pipelineId: true } })
      : resolveTenantFirstStage(prisma, tenantId),
    resolveAssignment(prisma, tenantId),
  ]);

  const created = await prisma.$transaction(async (tx) => {
    const numero = await getNextLeadNumber(tx, tenantId);
    const c = await tx.lead.create({
      data: {
        tenantId,
        numero,
        nome: contactName || digitsOnly(from) || 'Lead WhatsApp',
        telefone: digitsOnly(from) || null,
        telefoneKey: telefoneKey || null,
        origem: origem || 'WhatsApp',
        status: 'NOVO',
        ...(setLastInboundAt !== false ? { lastInboundAt: now } : {}),
        stageId: resolvedStage?.id ?? null,
        pipelineId: resolvedStage?.pipelineId ?? null,
        conversaCanal: canal ?? null,
        lastEntryChannel: canal ?? null,
        branchId: assignment.branchId,
        assignedUserId: assignment.assignedUserId,
        conversaAberta: conversaAberta ?? false,
        ...(conversaSessionId ? { conversaSessionId } : {}),
        ...(contactName ? { nomeCorreto: contactName, nomeCorretoOrigem: 'IA' } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      select: { id: true },
    });
    await tx.leadTransitionLog.create({
      data: { tenantId, leadId: c.id, fromStage: null, toStage: 'NOVO', changedBy: 'SYSTEM' },
    });
    return c;
  });

  return { leadId: created.id, isNew: true, assignedUserId: assignment.assignedUserId };
}

export async function upsertLeadFromWhatsapp(
  prisma: PrismaService,
  queue: QueueService,
  params: UpsertLeadParams,
) {
  const { tenantId, from, text, type, sessionId, rawMsg, contactName, avatarUrl, mediaUrl, mimeType, transcription, media } = params;
  const now = new Date();
  const telefoneKey = telefoneKeyFrom(from);
  const canal = sessionId ? 'WHATSAPP_LIGHT' : 'WHATSAPP_OFICIAL';
  const channel = sessionId ? 'whatsapp.unofficial.in' : 'whatsapp.in';

  const existingLead = telefoneKey
    ? await prisma.lead.findFirst({
        where: { tenantId, telefoneKey, deletedAt: null },
        select: { id: true, lastEntryChannel: true, nomeCorretoOrigem: true, incorporadoEmLeadId: true },
        orderBy: { criadoEm: 'desc' },
      })
    : null;

  let leadId: string;
  let isReentry: boolean;
  let assignedUserId: string | null = null;

  const isSystemMessage = type === 'system';

  // ── Redirect: lead incorporado → encaminhar para o lead pai ───────────────
  if (existingLead?.incorporadoEmLeadId) {
    const parentLeadId = existingLead.incorporadoEmLeadId;

    // Encontra o participante cujo telefone corresponde ao remetente
    const participantes = await prisma.leadParticipante.findMany({
      where: { leadId: parentLeadId },
      select: { id: true, telefone: true },
    });
    const participante = participantes.find(
      (p) => p.telefone && telefoneKeyFrom(p.telefone) === telefoneKey,
    );

    await prisma.leadEvent.create({
      data: {
        tenantId,
        leadId: parentLeadId,
        channel,
        isReentry: true,
        leadParticipanteId: participante?.id ?? null,
        payloadRaw: {
          from, type, text,
          rawMsg: rawMsg ?? null,
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(mimeType ? { mimeType } : {}),
          ...(transcription ? { transcription } : {}),
          ...(media ? { media } : {}),
        },
      },
    });

    if (!isSystemMessage) {
      const AI_SILENT_TYPES_SET = new Set(['reaction', 'system', 'sticker', 'poll', 'edited', 'unknown']);
      const isConversaAberta = !AI_SILENT_TYPES_SET.has(type);
      await prisma.lead.update({
        where: { id: parentLeadId },
        data: {
          lastInboundAt: now,
          ...(sessionId ? { conversaCanal: canal, conversaSessionId: sessionId } : {}),
          // Mensagem de pessoa incorporada também tem que "subir" o lead pai pra
          // seção de conversas abertas — mesma regra do fluxo normal (não incorporado).
          ...(isConversaAberta ? { conversaAberta: true } : {}),
        },
      });
      await prisma.leadSla.upsert({
        where: { leadId: parentLeadId },
        create: { tenantId, leadId: parentLeadId, lastInboundAt: now, frozenUntil: null, isActive: true },
        update: { lastInboundAt: now, frozenUntil: null, isActive: true },
      });
      await queue.rescheduleSla(parentLeadId);
      await queue.scheduleInboundAi(parentLeadId, { isFirstReply: false });
    }

    logger.log(`Inbound incorporado: source=${existingLead.id} → parent=${parentLeadId} participante=${participante?.id ?? 'null'}`);
    return { leadId: parentLeadId, isReentry: true, assignedUserId: null };
  }

  if (existingLead) {
    leadId = existingLead.id;
    isReentry = true;
    const AI_SILENT_TYPES_SET = new Set(['reaction', 'system', 'sticker', 'poll', 'edited', 'unknown']);
    const isConversaAberta = !AI_SILENT_TYPES_SET.has(type);
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        // Mensagens de sistema não reiniciam o timer de inbound nem alteram canal
        ...(!isSystemMessage ? { lastInboundAt: now, conversaCanal: canal } : {}),
        ...(sessionId && !isSystemMessage ? { conversaSessionId: sessionId } : {}),
        ...(contactName && existingLead.nomeCorretoOrigem !== 'MANUAL' ? { nomeCorreto: contactName, nomeCorretoOrigem: 'IA' } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        // Reentrada: incrementa contador somente quando o canal muda (não em toda mensagem)
        ...(!isSystemMessage && canal !== existingLead.lastEntryChannel ? { reentradaCount: { increment: 1 }, lastEntryChannel: canal } : {}),
        // Marca conversa aberta para mensagens reais (não silenciosas)
        ...(isConversaAberta ? { conversaAberta: true } : {}),
      },
    });
  } else {
    const AI_SILENT_TYPES_NEW = new Set(['reaction', 'system', 'sticker', 'poll', 'edited', 'unknown']);
    const created = await findOrCreateLeadByPhone(prisma, {
      tenantId,
      from,
      contactName,
      avatarUrl,
      origem: sessionId ? 'WhatsApp Light' : 'WhatsApp',
      canal,
      conversaSessionId: sessionId,
      conversaAberta: !AI_SILENT_TYPES_NEW.has(type),
      setLastInboundAt: true,
    });

    leadId = created.leadId;
    isReentry = false;
    assignedUserId = created.assignedUserId;
  }

  await prisma.leadEvent.create({
    data: {
      tenantId,
      leadId,
      channel,
      isReentry,
      payloadRaw: {
        from, type, text,
        rawMsg: rawMsg ?? null,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(transcription ? { transcription } : {}),
        ...(media ? { media } : {}),
      },
    },
  });

  if (!isSystemMessage) {
    await prisma.leadSla.upsert({
      where: { leadId },
      create: { tenantId, leadId, lastInboundAt: now, frozenUntil: null, isActive: true },
      update: { lastInboundAt: now, frozenUntil: null, isActive: true },
    });
  }

  // Não aciona IA para tipos silenciosos (reações, sistema, sticker, enquete, editada)
  const AI_SILENT_TYPES = new Set(['reaction', 'system', 'sticker', 'poll', 'edited', 'unknown']);
  if (!AI_SILENT_TYPES.has(type)) {
    // Detecta possível auto-reply: resposta em menos de 3s após um outbound
    // (humanos não conseguem ler + responder nesse intervalo)
    const AUTO_REPLY_THRESHOLD_MS = 3000;
    const recentOutbound = await prisma.leadEvent.findFirst({
      where: {
        leadId,
        channel: { in: ['whatsapp.unofficial.out', 'whatsapp.out'] },
        criadoEm: { gte: new Date(now.getTime() - AUTO_REPLY_THRESHOLD_MS) },
      },
      select: { id: true },
    });

    if (recentOutbound) {
      logger.log(`⚡ Possível auto-reply detectado (< 3s após outbound) — IA não acionada leadId=${leadId}`);
    } else {
      await queue.rescheduleSla(leadId);
      await queue.scheduleInboundAi(leadId, { isFirstReply: !isReentry });
    }
  }

  logger.log(`Lead ${isReentry ? 'atualizado' : 'criado'} — id=${leadId} canal=${canal}`);
  return { leadId, isReentry, assignedUserId };
}
