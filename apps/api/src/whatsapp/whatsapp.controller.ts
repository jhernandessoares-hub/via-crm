import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Response } from 'express';

@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(private readonly prisma: PrismaService) {}

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

    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length > 11) d = d.slice(-11);
    if (d.length >= 9) return d.slice(-9);

    return d;
  }

  private async sendMessage(to: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      console.log('❌ WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurado.');
      return;
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log('📤 Resposta enviada:', data);
    } catch (error) {
      console.log('❌ Erro ao enviar mensagem:', error);
    }
  }

  // ====== RECEIVE ======
  @Post()
  async receive(@Req() req: any) {
    const payload = req.body;

    console.log('📩 WhatsApp Webhook recebido:', JSON.stringify(payload, null, 2));

    const tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'via-crm-dev';

    const tenant = await this.prisma.tenant.upsert({
      where: { slug: tenantSlug },
      update: {},
      create: {
        slug: tenantSlug,
        nome: 'VIA CRM DEV',
        ativo: true,
      },
      select: { id: true, slug: true },
    });

    if (!tenant?.id) {
      throw new BadRequestException(
        `Falha ao obter/criar tenant para slug="${tenantSlug}"`,
      );
    }

    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: true, ignored: true };
    }

    for (const msg of messages) {
      try {
        const from = String(msg?.from || '');
        const text = String(msg?.text?.body || '');
        const contactName =
          String(contacts?.[0]?.profile?.name || '').trim() || null;

        const telefoneKey = this.telefoneKeyFrom(from);

        const existing = await this.prisma.lead.findFirst({
          where: {
            tenantId: tenant.id,
            telefoneKey,
          },
          select: { id: true },
        });

        let leadId: string;

        if (!existing) {
          const created = await this.prisma.lead.create({
            data: {
              tenantId: tenant.id,
              nome: contactName || 'Lead WhatsApp',
              telefone: this.digitsOnly(from) || null,
              telefoneKey: telefoneKey || null,
              status: 'NOVO',
              lastInboundAt: new Date(),
              needsManagerReview: false,
              queuePriority: 9999,
            },
            select: { id: true },
          });

          leadId = created.id;
        } else {
          await this.prisma.lead.update({
            where: { id: existing.id },
            data: {
              lastInboundAt: new Date(),
              needsManagerReview: true,
              queuePriority: 1,
            },
          });

          leadId = existing.id;
        }

        await this.prisma.leadEvent.create({
          data: {
            tenantId: tenant.id,
            leadId,
            channel: 'whatsapp.in',
            isReentry: !!existing,
            payloadRaw: { from, text },
          },
        });

        // 🔥 RESPOSTA AUTOMÁTICA (TESTE)
        const replyText = `Recebi sua mensagem: "${text}"`;

        await this.sendMessage(from, replyText);

        await this.prisma.leadEvent.create({
          data: {
            tenantId: tenant.id,
            leadId,
            channel: 'whatsapp.out',
            isReentry: false,
            payloadRaw: { to: from, text: replyText },
          },
        });
      } catch (e) {
        console.log('⚠️ Erro ao processar mensagem:', e?.message || e);
      }
    }

    return { ok: true };
  }
}
