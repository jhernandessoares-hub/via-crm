import { Worker, Job } from 'bullmq';
import { Logger } from '../logger';

const logger = new Logger('WhatsappInboundWorker');
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { WhatsappService } from '../secretary/whatsapp.service';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password };
}

// ──────────────────────────────────────────────
// Helpers (extraídos do WhatsAppController)
// ──────────────────────────────────────────────

function digitsOnly(v: string) {
  return (v || '').replace(/\D/g, '');
}

function telefoneKeyFrom(from: string) {
  let d = digitsOnly(from);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  if (d.length >= 9) return d.slice(-9);
  return d;
}

function safeTrim(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

function extractTextFromMessage(msg: any): { type: string; text: string } {
  const type = String(msg?.type || '').trim() || 'unknown';

  const textBody = msg?.text?.body;
  if (typeof textBody === 'string' && textBody.trim()) return { type, text: textBody.trim() };

  const buttonText = msg?.button?.text;
  if (typeof buttonText === 'string' && buttonText.trim()) return { type, text: buttonText.trim() };

  const iBtnTitle = msg?.interactive?.button_reply?.title;
  if (typeof iBtnTitle === 'string' && iBtnTitle.trim()) return { type, text: iBtnTitle.trim() };

  const iListTitle = msg?.interactive?.list_reply?.title;
  if (typeof iListTitle === 'string' && iListTitle.trim()) return { type, text: iListTitle.trim() };

  const imgCaption = msg?.image?.caption;
  if (typeof imgCaption === 'string' && imgCaption.trim()) return { type, text: imgCaption.trim() };

  const vidCaption = msg?.video?.caption;
  if (typeof vidCaption === 'string' && vidCaption.trim()) return { type, text: vidCaption.trim() };

  const docCaption = msg?.document?.caption;
  if (typeof docCaption === 'string' && docCaption.trim()) return { type, text: docCaption.trim() };

  return { type, text: '' };
}

function summarizeNonText(type: string): string {
  const map: Record<string, string> = {
    audio: '[ÁUDIO]',
    voice: '[ÁUDIO]',
    image: '[IMAGEM]',
    video: '[VÍDEO]',
    document: '[DOCUMENTO]',
    sticker: '[STICKER]',
    reaction: '[REAÇÃO]',
    location: '[LOCALIZAÇÃO]',
    contacts: '[CONTATO]',
    unsupported: '[UNSUPPORTED]',
    unknown: '[MENSAGEM]',
  };
  return map[type] || `[${String(type || 'MENSAGEM').toUpperCase()}]`;
}

function describeUnsupported(msg: any): string {
  const err = msg?.errors?.[0];
  const title = safeTrim(err?.title);
  const code = err?.code != null ? String(err.code) : '';
  if (title && code) return `[UNSUPPORTED] ${title} (code:${code})`;
  if (title) return `[UNSUPPORTED] ${title}`;
  if (code) return `[UNSUPPORTED] (code:${code})`;
  return '[UNSUPPORTED]';
}

function buildMedia(msg: any) {
  if (msg?.audio) {
    return {
      kind: 'audio',
      id: msg.audio.id || null,
      url: msg.audio.url || null,
      mimeType: msg.audio.mime_type || null,
      sha256: msg.audio.sha256 || null,
      fileSize: msg.audio.file_size || null,
      filename: null,
      voice: !!msg.audio.voice,
    };
  }
  if (msg?.image) {
    return {
      kind: 'image',
      id: msg.image.id || null,
      url: msg.image.url || null,
      mimeType: msg.image.mime_type || null,
      sha256: msg.image.sha256 || null,
      fileSize: msg.image.file_size || null,
      filename: null,
      caption: msg.image.caption || null,
    };
  }
  if (msg?.video) {
    return {
      kind: 'video',
      id: msg.video.id || null,
      url: msg.video.url || null,
      mimeType: msg.video.mime_type || null,
      sha256: msg.video.sha256 || null,
      fileSize: msg.video.file_size || null,
      filename: null,
      caption: msg.video.caption || null,
    };
  }
  if (msg?.document) {
    return {
      kind: 'document',
      id: msg.document.id || null,
      url: msg.document.url || null,
      mimeType: msg.document.mime_type || null,
      sha256: msg.document.sha256 || null,
      fileSize: msg.document.file_size || null,
      filename: msg.document.filename || null,
      caption: msg.document.caption || null,
    };
  }
  if (msg?.sticker) {
    return {
      kind: 'sticker',
      id: msg.sticker.id || null,
      url: msg.sticker.url || null,
      mimeType: msg.sticker.mime_type || 'image/webp',
      sha256: msg.sticker.sha256 || null,
      fileSize: msg.sticker.file_size || null,
      filename: null,
    };
  }
  return null;
}

// ──────────────────────────────────────────────
// Resolve tenant by phone_number_id (multi-tenant)
// ──────────────────────────────────────────────

async function resolveTenantForPhoneNumberId(
  prisma: PrismaService,
  phoneNumberId: string | null,
): Promise<{ id: string } | null> {
  // 1) Try to find tenant with this specific phoneNumberId
  if (phoneNumberId) {
    const tenant = await prisma.tenant.findFirst({
      where: { whatsappPhoneNumberId: phoneNumberId, ativo: true },
      select: { id: true },
    });
    if (tenant) return tenant;
  }

  // 2) Fallback: use env-based phoneNumberId to find or upsert default tenant
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (envPhoneId && phoneNumberId && phoneNumberId !== envPhoneId) {
    // payload is for a different phone number not registered in DB
    logger.warn(`phone_number_id=${phoneNumberId} não corresponde a nenhum tenant. Ignorando.`);
    return null;
  }

  const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { slug: tenantSlug, nome: 'VIA CRM DEV', ativo: true },
    select: { id: true },
  });
  return tenant?.id ? tenant : null;
}

// ──────────────────────────────────────────────
// Core processing (extraído de processPayload)
// ──────────────────────────────────────────────

async function processPayload(
  payload: any,
  prisma: PrismaService,
  queueService: QueueService,
  whatsappService?: WhatsappService,
) {
  try {
    const entriesCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
    logger.log(`📩 WhatsApp Webhook processando (entries=${entriesCount})`);
  } catch {}

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  if (!entries.length) return;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

      if (!messages.length) continue;

      // Resolve tenant by phone_number_id from Meta metadata
      const phoneNumberId: string | null = value?.metadata?.phone_number_id || null;
      const tenant = await resolveTenantForPhoneNumberId(prisma, phoneNumberId);
      if (!tenant) {
        logger.warn(`Nenhum tenant encontrado para phone_number_id=${phoneNumberId}. Ignorando change.`);
        continue;
      }

      for (const msg of messages) {
        try {
          const now = new Date();
          const from = String(msg?.from || '');
          const telefoneKey = telefoneKeyFrom(from);
          const contactName = String(contacts?.[0]?.profile?.name || '').trim() || null;

          const { type, text: extractedText } = extractTextFromMessage(msg);
          const finalText =
            extractedText && extractedText.trim()
              ? extractedText.trim()
              : type === 'unsupported'
                ? describeUnsupported(msg)
                : summarizeNonText(type);

          // ── Roteamento: usuário interno → secretária ──────────────────
          if (whatsappService) {
            const audioId = msg?.audio?.id || msg?.voice?.id || null;
            const isUser = await whatsappService.tryHandleAsUser(
              from, type, extractedText, audioId,
            );
            if (isUser) continue; // não cria lead, secretária já respondeu
          }
          // ─────────────────────────────────────────────────────────────

          let leadId: string;
          let isReentry: boolean;

          // Busca lead existente pelo telefoneKey ANTES de tentar criar
          const existingLead = telefoneKey
            ? await prisma.lead.findFirst({
                where: { tenantId: tenant.id, telefoneKey, deletedAt: null },
                select: { id: true },
                orderBy: { criadoEm: 'desc' },
              })
            : null;

          if (existingLead) {
            leadId = existingLead.id;
            isReentry = true;
          } else {
            // Novo lead
            const firstStageId = await prisma.pipelineStage
              .findFirst({ where: { tenantId: tenant.id, key: 'NOVO_LEAD' }, select: { id: true } })
              .then((s) => s?.id ?? null);

            const created = await prisma.$transaction(async (tx) => {
              const c = await tx.lead.create({
                data: {
                  tenantId: tenant.id,
                  nome: contactName || 'Lead WhatsApp',
                  telefone: digitsOnly(from) || null,
                  telefoneKey: telefoneKey || null,
                  origem: 'WhatsApp',
                  status: 'NOVO',
                  lastInboundAt: now,
                  stageId: firstStageId,
                },
                select: { id: true },
              });
              await tx.leadTransitionLog.create({
                data: {
                  tenantId: tenant.id,
                  leadId: c.id,
                  fromStage: null,
                  toStage: 'NOVO',
                  changedBy: 'SYSTEM',
                },
              });
              return c;
            });

            leadId = created.id;
            isReentry = false;

            // Notifica usuários do tenant com WhatsApp cadastrado
            if (whatsappService) {
              const usersToNotify = await prisma.user.findMany({
                where: { tenantId: tenant.id, ativo: true, whatsappNumber: { not: null } },
                select: { whatsappNumber: true, nome: true },
              });
              const nome = contactName || 'Novo lead';
              const notifMsg = `🔔 Novo lead chegou: *${nome}*${from ? `\nWhatsApp: ${from}` : ''}`;
              for (const u of usersToNotify) {
                if (u.whatsappNumber) {
                  whatsappService.sendMessage(u.whatsappNumber, notifMsg).catch(() => {});
                }
              }
            }
          }

          const media = buildMedia(msg);
          const safeMedia = media && media.id ? JSON.parse(JSON.stringify(media)) : null;

          // isReentry update + leadEvent + leadSla em transação
          const createdEvent = await prisma.$transaction(async (tx) => {
            if (isReentry) {
              await tx.lead.update({
                where: { id: leadId },
                data: { lastInboundAt: now },
              });
            }

            const ev = await tx.leadEvent.create({
              data: {
                tenantId: tenant.id,
                leadId,
                channel: 'whatsapp.in',
                isReentry,
                payloadRaw: {
                  from,
                  type,
                  text: finalText,
                  messageId: msg?.id || null,
                  transcription: null,
                  media: safeMedia,
                  errors: msg?.errors ?? null,
                  rawMsg: msg,
                },
              },
              select: { id: true },
            });

            await tx.leadSla.upsert({
              where: { leadId },
              create: { tenantId: tenant.id, leadId, lastInboundAt: now, frozenUntil: null, isActive: true },
              update: { lastInboundAt: now, frozenUntil: null, isActive: true },
            });

            return ev;
          });

          if (safeMedia?.id) {
            await queueService.enqueueWhatsappMediaResolve(createdEvent.id);
          }

          // Reações não disparam IA nem atualizam SLA — são só feedback do lead
          if (type === 'reaction') {
            logger.log(`💬 Reação recebida (leadId=${leadId}) — sem resposta IA`);
            continue;
          }

          await queueService.rescheduleSla(leadId);
          await queueService.scheduleInboundAi(leadId, { isFirstReply: !isReentry });
        } catch (e: any) {
          logger.error('Erro ao processar mensagem do webhook', { error: (e as any)?.message || String(e) });
          throw e; // propaga para BullMQ acionar retry
        }
      }
    }
  }
}

// ──────────────────────────────────────────────
// Worker bootstrap
// ──────────────────────────────────────────────

export function startWhatsappInboundWorker(
  prisma: PrismaService,
  queueService: QueueService,
  whatsappService?: WhatsappService,
) {
  const worker = new Worker(
    'whatsapp-inbound-queue',
    async (job: Job) => {
      await processPayload(job.data?.payload, prisma, queueService, whatsappService);
    },
    {
      connection: getRedisConnection(),
      lockDuration: 60000,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`✅ whatsapp-inbound completed: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `❌ whatsapp-inbound failed: jobId=${job?.id} attempt=${job?.attemptsMade} -> ${err?.message}`,
    );
  });

  worker.on('error', (err) => {
    logger.error(`🔴 WhatsApp Inbound Worker erro de conexão (Redis indisponível?): ${err?.message}`);
  });

  logger.log('🚀 WhatsApp Inbound Worker iniciado (fila: whatsapp-inbound-queue)');

  return worker;
}
