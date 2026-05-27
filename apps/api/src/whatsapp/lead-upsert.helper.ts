import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { Logger } from '../logger';
import { getNextLeadNumber } from '../leads/lead-numbering.helper';

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

function telefoneKeyFrom(from: string) {
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
        select: { id: true, lastEntryChannel: true },
        orderBy: { criadoEm: 'desc' },
      })
    : null;

  let leadId: string;
  let isReentry: boolean;

  const isSystemMessage = type === 'system';

  if (existingLead) {
    leadId = existingLead.id;
    isReentry = true;
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        // Mensagens de sistema não reiniciam o timer de inbound nem alteram canal
        ...(!isSystemMessage ? { lastInboundAt: now, conversaCanal: canal } : {}),
        ...(sessionId && !isSystemMessage ? { conversaSessionId: sessionId } : {}),
        ...(contactName ? { nomeCorreto: contactName, nomeCorretoOrigem: 'IA' } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        // Reentrada: incrementa contador somente quando o canal muda (não em toda mensagem)
        ...(!isSystemMessage && canal !== existingLead.lastEntryChannel ? { reentradaCount: { increment: 1 }, lastEntryChannel: canal } : {}),
      },
    });
  } else {
    const [firstStageId, assignment] = await Promise.all([
      prisma.pipelineStage
        .findFirst({ where: { tenantId, key: 'NOVO_LEAD' }, select: { id: true } })
        .then((s) => s?.id ?? null),
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
          origem: sessionId ? 'WhatsApp Light' : 'WhatsApp',
          status: 'NOVO',
          lastInboundAt: now,
          stageId: firstStageId,
          conversaCanal: canal,
          lastEntryChannel: canal,
          branchId: assignment.branchId,
          assignedUserId: assignment.assignedUserId,
          ...(sessionId ? { conversaSessionId: sessionId } : {}),
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

    leadId = created.id;
    isReentry = false;
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
  return { leadId, isReentry };
}
