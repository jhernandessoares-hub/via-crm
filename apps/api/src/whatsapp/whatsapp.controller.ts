// C:\Users\User\Documents\via-crm\apps\api\src\whatsapp\whatsapp.controller.ts

import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import type { Response } from 'express';

// OBS:
// Este controller salva:
// - texto extraído (quando existir)
// - marcador [ÁUDIO]/[IMAGEM]/[DOCUMENTO]/etc
// - mídia (quando existir) em payloadRaw.media (com id)
// - transcription (quando existir)
// - E MUITO IMPORTANTE: rawMsg + errors (pra diagnosticar "unsupported")
//
// ✅ Correção PRD:
// - URL da Meta (lookaside) NÃO é pública (dá 401)
// - então a mídia deve ser resolvida via Graph API e enviada ao Cloudinary por worker
// - aqui: salvamos event e enfileiramos resolução quando houver media.id

@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  // ====== META VERIFY ======
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'via-crm-dev';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  private digitsOnly(v: string) {
    return (v || '').replace(/\D/g, '');
  }

  private telefoneKeyFrom(from: string) {
    let d = this.digitsOnly(from);

    // Remove 55 se vier com país
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);

    // Garante no máximo 11 dígitos (DDD + número)
    if (d.length > 11) d = d.slice(-11);

    // Para chave, usamos os últimos 9 dígitos (padrão mobile BR)
    if (d.length >= 9) return d.slice(-9);

    return d;
  }

  private safeTrim(v: any): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  // ========= EXTRAÇÃO ROBUSTA DE TEXTO =========
  private extractTextFromMessage(msg: any): { type: string; text: string } {
    const type = String(msg?.type || '').trim() || 'unknown';

    const textBody = msg?.text?.body;
    if (typeof textBody === 'string' && textBody.trim()) {
      return { type, text: textBody.trim() };
    }

    const buttonText = msg?.button?.text;
    if (typeof buttonText === 'string' && buttonText.trim()) {
      return { type, text: buttonText.trim() };
    }

    const iBtnTitle = msg?.interactive?.button_reply?.title;
    if (typeof iBtnTitle === 'string' && iBtnTitle.trim()) {
      return { type, text: iBtnTitle.trim() };
    }

    const iListTitle = msg?.interactive?.list_reply?.title;
    if (typeof iListTitle === 'string' && iListTitle.trim()) {
      return { type, text: iListTitle.trim() };
    }

    const imgCaption = msg?.image?.caption;
    if (typeof imgCaption === 'string' && imgCaption.trim()) {
      return { type, text: imgCaption.trim() };
    }

    const vidCaption = msg?.video?.caption;
    if (typeof vidCaption === 'string' && vidCaption.trim()) {
      return { type, text: vidCaption.trim() };
    }

    const docCaption = msg?.document?.caption;
    if (typeof docCaption === 'string' && docCaption.trim()) {
      return { type, text: docCaption.trim() };
    }

    return { type, text: '' };
  }

  private summarizeNonText(type: string): string {
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

  private describeUnsupported(msg: any): string {
    const err = msg?.errors?.[0];
    const title = this.safeTrim(err?.title);
    const code = err?.code != null ? String(err.code) : '';
    if (title && code) return `[UNSUPPORTED] ${title} (code:${code})`;
    if (title) return `[UNSUPPORTED] ${title}`;
    if (code) return `[UNSUPPORTED] (code:${code})`;
    return '[UNSUPPORTED]';
  }

  private buildMedia(msg: any) {
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

  // ✅ processamento pesado isolado (pra permitir ACK imediato no POST)
  private async processPayload(payload: any) {
    // log curto (evita JSON.stringify gigante no webhook)
    try {
      const entriesCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
      console.log(`📩 WhatsApp Webhook recebido (entries=${entriesCount})`);
    } catch {}

    const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

    const tenant = await this.prisma.tenant.upsert({
      where: { slug: tenantSlug },
      update: {},
      create: {
        slug: tenantSlug,
        nome: 'VIA CRM DEV',
        ativo: true,
      },
      select: { id: true },
    });

    if (!tenant?.id) {
      throw new BadRequestException(
        `Falha ao obter/criar tenant para slug="${tenantSlug}"`,
      );
    }

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    if (!entries.length) return;

    // ✅ processar TODOS entries e changes
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value;

        // IMPORTANTE:
        // - inbound chega em value.messages
        // - status (entregue/lido) chega em value.statuses
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

        if (!messages.length) {
          // Se quiser, dá pra registrar status, mas por padrão ignoramos pra não poluir o chat
          continue;
        }

        for (const msg of messages) {
          try {
            const now = new Date();

            const from = String(msg?.from || '');
            const telefoneKey = this.telefoneKeyFrom(from);

            const contactName =
              String(contacts?.[0]?.profile?.name || '').trim() || null;

            const { type, text: extractedText } = this.extractTextFromMessage(msg);

            const finalText =
              extractedText && extractedText.trim()
                ? extractedText.trim()
                : type === 'unsupported'
                  ? this.describeUnsupported(msg)
                  : this.summarizeNonText(type);

            let leadId: string;
            let isReentry: boolean;

            try {
              // Fast path: new lead
              const created = await this.prisma.lead.create({
                data: {
                  tenantId: tenant.id,
                  nome: contactName || 'Lead WhatsApp',
                  telefone: this.digitsOnly(from) || null,
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

              await this.prisma.leadTransitionLog.create({
                data: {
                  tenantId: tenant.id,
                  leadId,
                  fromStage: null,
                  toStage: 'NOVO',
                  changedBy: 'SYSTEM',
                },
              });
            } catch (err: any) {
              // P2002 = unique constraint violation: lead already exists (race condition)
              if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                const existing = await this.prisma.lead.findFirst({
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
              await this.prisma.lead.update({
                where: { id: leadId },
                data: {
                  lastInboundAt: now,
                  needsManagerReview: true,
                  queuePriority: 1,
                },
              });
            }

            const media = this.buildMedia(msg);

            // Só guardar/enfileirar se tiver id (pois lookaside/url não é público)
            const safeMedia =
              media && media.id ? JSON.parse(JSON.stringify(media)) : null;

            const createdEvent = await this.prisma.leadEvent.create({
              data: {
                tenantId: tenant.id,
                leadId,
                channel: 'whatsapp.in',
                isReentry,
                payloadRaw: {
                  from,
                  type,
                  text: finalText, // <= UI usa isso no pickText
                  messageId: msg?.id || null, // <= para reação/thread e debug
                  transcription: null,
                  media: safeMedia,
                  errors: msg?.errors ?? null,
                  rawMsg: msg,
                },
              },
              select: { id: true },
            });

            if (safeMedia?.id) {
              await this.queueService.enqueueWhatsappMediaResolve(createdEvent.id);
            }

            await this.prisma.leadSla.upsert({
              where: { leadId },
              create: {
                tenantId: tenant.id,
                leadId,
                lastInboundAt: now,
                frozenUntil: null,
                isActive: true,
              },
              update: {
                lastInboundAt: now,
                frozenUntil: null,
                isActive: true,
              },
            });

            await this.queueService.rescheduleSla(leadId);
             const isFirstReply = !isReentry;

              await this.queueService.scheduleInboundAi(leadId, {
              isFirstReply,
             });
          } catch (e: any) {
            console.log('⚠️ Erro ao processar mensagem:', e?.message || e);
          }
        }
      }
    }
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: any, @Res() res: Response) {
    const payload = req.body;

    // ✅ ACK imediato (não segurar o webhook)
    res.status(200).json({ ok: true });

    // ✅ processar depois (mantém a mesma lógica, só não trava o webhook)
    setImmediate(async () => {
      try {
        await this.processPayload(payload);
      } catch (e: any) {
        console.log('⚠️ Erro no processamento async do webhook:', e?.message || e);
      }
    });

    // importante: não retornar nada porque estamos usando @Res()
    return;
  }
}