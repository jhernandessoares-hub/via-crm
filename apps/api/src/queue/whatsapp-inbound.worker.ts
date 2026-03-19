import { Worker, Job } from 'bullmq';
import { Logger } from '../logger';

const logger = new Logger('WhatsappInboundWorker');
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  return { host, port };
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
// Core processing (extraído de processPayload)
// ──────────────────────────────────────────────

async function processPayload(
  payload: any,
  prisma: PrismaService,
  queueService: QueueService,
) {
  try {
    const entriesCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
    logger.log(`📩 WhatsApp Webhook processando (entries=${entriesCount})`);
  } catch {}

  const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { slug: tenantSlug, nome: 'VIA CRM DEV', ativo: true },
    select: { id: true },
  });

  if (!tenant?.id) {
    throw new Error(`Falha ao obter/criar tenant para slug="${tenantSlug}"`);
  }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  if (!entries.length) return;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

      if (!messages.length) continue;

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

          let leadId: string;
          let isReentry: boolean;

          try {
            // Fast path: new lead
            const created = await prisma.lead.create({
              data: {
                tenantId: tenant.id,
                nome: contactName || 'Lead WhatsApp',
                telefone: digitsOnly(from) || null,
                telefoneKey: telefoneKey || null,
                status: 'NOVO',
                lastInboundAt: now,
                needsManagerReview: false,
                queuePriority: 9999,
              },
              select: { id: true },
            });

            leadId = created.id;
            isReentry = false;

            await prisma.leadTransitionLog.create({
              data: {
                tenantId: tenant.id,
                leadId,
                fromStage: null,
                toStage: 'NOVO',
                changedBy: 'SYSTEM',
              },
            });
          } catch (err: any) {
            // P2002: lead já existe (race condition entre requests concorrentes)
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              const existing = await prisma.lead.findFirst({
                where: { tenantId: tenant.id, telefoneKey },
                select: { id: true },
              });
              if (!existing) throw err;
              leadId = existing.id;
            } else {
              throw err;
            }
            isReentry = true;
          }

          if (isReentry) {
            await prisma.lead.update({
              where: { id: leadId },
              data: { lastInboundAt: now, needsManagerReview: true, queuePriority: 1 },
            });
          }

          const media = buildMedia(msg);
          const safeMedia = media && media.id ? JSON.parse(JSON.stringify(media)) : null;

          const createdEvent = await prisma.leadEvent.create({
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

          if (safeMedia?.id) {
            await queueService.enqueueWhatsappMediaResolve(createdEvent.id);
          }

          await prisma.leadSla.upsert({
            where: { leadId },
            create: { tenantId: tenant.id, leadId, lastInboundAt: now, frozenUntil: null, isActive: true },
            update: { lastInboundAt: now, frozenUntil: null, isActive: true },
          });

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
) {
  const worker = new Worker(
    'whatsapp-inbound-queue',
    async (job: Job) => {
      await processPayload(job.data?.payload, prisma, queueService);
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
