import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { resolveWhatsappCreds, WhatsappCreds } from './whatsapp-creds';

type MediaKind = 'image' | 'video' | 'audio' | 'document';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsAppActionsController {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ aceita string | null | undefined
  private digitsOnly(v?: string | null) {
    return String(v || '').replace(/\D/g, '');
  }

  private async resolveCredsForTenant(tenantId?: string): Promise<WhatsappCreds> {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new BadRequestException('WhatsApp não configurado para este tenant.');
    return creds;
  }

  private ensureCloudinaryEnv() {
    // Cloudinary é inicializado uma única vez em main.ts via initCloudinary()
    const hasParts =
      !!process.env.CLOUDINARY_CLOUD_NAME &&
      !!process.env.CLOUDINARY_API_KEY &&
      !!process.env.CLOUDINARY_API_SECRET;

    if (!hasParts) {
      throw new BadRequestException(
        'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET).',
      );
    }
  }

  private async callMetaSend(body: any, tenantId?: string) {
    const { token, phoneNumberId, version } = await this.resolveCredsForTenant(tenantId);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      throw new BadRequestException({
        message: 'Erro ao enviar WhatsApp',
        status: resp.status,
        data,
      });
    }

    return data;
  }

  private async callMetaMarkRead(messageId: string, tenantId?: string) {
    const { token, phoneNumberId, version } = await this.resolveCredsForTenant(tenantId);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      throw new BadRequestException({
        message: 'Erro ao marcar como lida',
        status: resp.status,
        data,
      });
    }

    return data;
  }

  private inferKind(mime?: string | null): MediaKind {
    const m = String(mime || '').toLowerCase();

    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';

    return 'document';
  }

  private cloudinaryResourceTypeFor(kind: MediaKind) {
    if (kind === 'image') return 'image';
    if (kind === 'video' || kind === 'audio') return 'video';
    return 'raw';
  }

  private async uploadToCloudinary(params: {
    buffer: Buffer;
    tenantSlug: string;
    leadId: string;
    filename?: string | null;
    mimeType?: string | null;
    kind: MediaKind;
  }) {
    this.ensureCloudinaryEnv();

    const { buffer, tenantSlug, leadId, filename, kind } = params;

    const folder = `via-crm/${tenantSlug}/leads/${leadId}`;
    const resourceType = this.cloudinaryResourceTypeFor(kind);

    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          overwrite: false,
          filename_override: filename || undefined,
          use_filename: true,
          unique_filename: true,
        },
        (err, res) => {
          if (err) return reject(err);
          resolve(res);
        },
      );

      stream.end(buffer);
    });

    return {
      url: result?.secure_url || result?.url,
      publicId: result?.public_id || null,
      bytes: result?.bytes || null,
      resourceType: result?.resource_type || null,
      originalFilename: result?.original_filename || null,
    };
  }

  // =========================
  // 1) ENVIAR TEXTO
  // =========================
  @Post('send-text')
  async sendTextToLead(
    @Body()
    body: {
      leadId: string;
      text: string;
    },
  ) {
    const leadId = String(body?.leadId || '').trim();
    const text = String(body?.text || '').trim();

    if (!leadId) throw new BadRequestException('leadId é obrigatório.');
    if (!text) throw new BadRequestException('text é obrigatório.');

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, tenantId: true, telefone: true },
    });

    if (!lead) throw new BadRequestException('Lead não encontrado.');

    const to = this.digitsOnly(lead.telefone);
    if (!to) {
      throw new BadRequestException(
        'Lead sem telefone válido para envio (telefone nulo/vazio).',
      );
    }

    const result = await this.callMetaSend({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }, lead.tenantId);

    const providerMessageId = result?.messages?.[0]?.id || null;

    await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'whatsapp.out',
        isReentry: false,
        payloadRaw: {
          to,
          type: 'text',
          text,
          provider: 'meta',
          messageId: providerMessageId,
          result,
        },
      },
    });

    return { ok: true, messageId: providerMessageId };
  }

  // =========================
  // 2) ENVIAR MÍDIA (upload + cloudinary + meta)
  // =========================
  @Post('send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendMediaToLead(
    // ✅ tipagem simples pra não travar TS no teu projeto
    @UploadedFile() file: any,
    @Body()
    body: {
      leadId: string;
      caption?: string;
    },
  ) {
    const leadId = String(body?.leadId || '').trim();
    const caption = String(body?.caption || '').trim();

    if (!leadId) throw new BadRequestException('leadId é obrigatório.');
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie o arquivo no campo "file".');
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { tenant: { select: { slug: true } } },
    });

    if (!lead) throw new BadRequestException('Lead não encontrado.');

    const to = this.digitsOnly(lead.telefone);
    if (!to) {
      throw new BadRequestException(
        'Lead sem telefone válido para envio (telefone nulo/vazio).',
      );
    }

    const tenantSlug = lead.tenant?.slug || 'via-crm-dev';
    const kind = this.inferKind(file.mimetype);

    const uploaded = await this.uploadToCloudinary({
      buffer: file.buffer,
      tenantSlug,
      leadId: lead.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      kind,
    });

    if (!uploaded?.url) {
      throw new BadRequestException('Falha ao obter URL pública do Cloudinary.');
    }

    const base: any = {
      messaging_product: 'whatsapp',
      to,
      type: kind,
    };

    if (kind === 'image') {
      base.image = { link: uploaded.url, caption: caption || undefined };
    } else if (kind === 'video') {
      base.video = { link: uploaded.url, caption: caption || undefined };
    } else if (kind === 'audio') {
      base.audio = { link: uploaded.url };
    } else {
      base.document = {
        link: uploaded.url,
        caption: caption || undefined,
        filename: file.originalname || undefined,
      };
    }

    const result = await this.callMetaSend(base, lead.tenantId);
    const providerMessageId = result?.messages?.[0]?.id || null;

    await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'whatsapp.out',
        isReentry: false,
        payloadRaw: {
          to,
          type: kind,
          text: caption ? caption : `[${kind.toUpperCase()}]`,
          media: {
            kind,
            url: uploaded.url,
            publicId: uploaded.publicId,
            fileSize: uploaded.bytes,
            filename: file.originalname || null,
            mimeType: file.mimetype || null,
          },
          provider: 'meta',
          messageId: providerMessageId,
          result,
        },
      },
    });

    return { ok: true, messageId: providerMessageId, kind, url: uploaded.url };
  }

  // =========================
  // 3) REAÇÃO (emoji) em mensagem específica
  // =========================
  @Post('react')
  async reactToMessage(
    @Body()
    body: {
      leadId: string;
      messageId: string; // wamid...
      emoji: string; // "❤️"
    },
  ) {
    const leadId = String(body?.leadId || '').trim();
    const messageId = String(body?.messageId || '').trim();
    const emoji = String(body?.emoji || '').trim();

    if (!leadId) throw new BadRequestException('leadId é obrigatório.');
    if (!messageId) throw new BadRequestException('messageId é obrigatório.');
    if (!emoji) throw new BadRequestException('emoji é obrigatório.');

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, tenantId: true, telefone: true },
    });

    if (!lead) throw new BadRequestException('Lead não encontrado.');

    const to = this.digitsOnly(lead.telefone);
    if (!to) {
      throw new BadRequestException(
        'Lead sem telefone válido para envio (telefone nulo/vazio).',
      );
    }

    const result = await this.callMetaSend({
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    }, lead.tenantId);

    const providerMessageId = result?.messages?.[0]?.id || null;

    await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'whatsapp.out',
        isReentry: false,
        payloadRaw: {
          to,
          type: 'reaction',
          text: '[REAÇÃO]',
          reaction: { messageId, emoji },
          provider: 'meta',
          messageId: providerMessageId,
          result,
        },
      },
    });

    return { ok: true, messageId: providerMessageId };
  }

  // =========================
  // 4) MARCAR COMO LIDA (opcional)
  // =========================
  @Post('mark-read')
  async markRead(
    @Body()
    body: {
      leadId: string;
      messageId: string;
    },
  ) {
    const leadId = String(body?.leadId || '').trim();
    const messageId = String(body?.messageId || '').trim();

    if (!leadId) throw new BadRequestException('leadId é obrigatório.');
    if (!messageId) throw new BadRequestException('messageId é obrigatório.');

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, tenantId: true },
    });

    if (!lead) throw new BadRequestException('Lead não encontrado.');

    const result = await this.callMetaMarkRead(messageId, lead.tenantId);

    await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'system.whatsapp',
        isReentry: false,
        payloadRaw: {
          type: 'mark_read',
          messageId,
          provider: 'meta',
          result,
        },
      },
    });

    return { ok: true };
  }
}