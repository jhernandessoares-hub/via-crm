import { Controller, Get, HttpCode, Post, Param, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../secretary/whatsapp.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { Logger } from '../logger';

const logger = new Logger('ChannelsWebhook');

// ─── Normalização por tipo ────────────────────────────────────────────────────

interface NormalizedLead {
  nome: string;
  telefone?: string;
  email?: string;
  origem: string;
  campanha?: string;
  observacao?: string;
}

async function parsePayload(type: string, body: any, config: any): Promise<NormalizedLead | null> {
  try {
    switch (type) {
      case 'META_ADS': {
        const entry = body?.entry?.[0];
        const change = entry?.changes?.find((c: any) => c.field === 'leadgen');
        if (!change) return null;
        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) return null;

        const token = (config as any)?.accessToken;
        if (!token) return null;

        const res = await fetch(
          `https://graph.facebook.com/v20.0/${leadgenId}?fields=field_data,campaign_name,ad_name&access_token=${token}`,
        );
        const data = (await res.json()) as any;
        if (!data?.field_data) return null;

        const get = (names: string[]) => {
          for (const name of names) {
            const f = data.field_data.find((f: any) =>
              names.some((n) => f.name?.toLowerCase().includes(n)),
            );
            if (f) return f.values?.[0] || '';
          }
          return '';
        };

        return {
          nome: get(['full_name', 'name', 'nome']),
          telefone: get(['phone', 'telefone', 'celular', 'whatsapp']),
          email: get(['email']),
          origem: 'Meta Ads',
          campanha: data.campaign_name || data.ad_name || '',
        };
      }

      case 'GOOGLE_ADS':
      case 'YOUTUBE': {
        const cols: any[] = body?.user_column_data || [];
        const get = (ids: string[]) =>
          cols.find((c) => ids.some((id) => c.column_id?.toLowerCase().includes(id.toLowerCase())))
            ?.string_value || '';
        return {
          nome: get(['FULL_NAME', 'NAME']),
          telefone: get(['PHONE_NUMBER', 'PHONE']),
          email: get(['EMAIL']),
          origem: type === 'YOUTUBE' ? 'YouTube' : 'Google Ads',
          campanha: body?.campaign_name || '',
          observacao: body?.gcl_id ? `gclid: ${body.gcl_id}` : '',
        };
      }

      case 'TIKTOK_ADS': {
        const fields: any[] = body?.data?.fields || body?.fields || [];
        const get = (names: string[]) =>
          fields.find((f) => names.some((n) => f.name?.toLowerCase().includes(n)))?.value || '';
        return {
          nome: get(['full_name', 'name', 'nome']),
          telefone: get(['phone', 'telefone']),
          email: get(['email']),
          origem: 'TikTok Ads',
          campanha: body?.data?.ad_name || '',
        };
      }

      case 'PORTAL_ZAP':
      case 'PORTAL_VIVAREAL': {
        const contact = body?.contact || body?.lead?.contact || body;
        return {
          nome: contact?.name || contact?.nome || '',
          telefone: contact?.phone || contact?.telefone || '',
          email: contact?.email || '',
          origem: type === 'PORTAL_ZAP' ? 'ZAP Imóveis' : 'Viva Real',
          observacao: body?.message || body?.mensagem || '',
        };
      }

      case 'PORTAL_OLX': {
        const lead = body?.lead || body;
        return {
          nome: lead?.nome || lead?.name || '',
          telefone: lead?.telefone || lead?.phone || '',
          email: lead?.email || '',
          origem: 'OLX Imóveis',
          observacao: lead?.mensagem || lead?.message || '',
        };
      }

      case 'PORTAL_IMOVELWEB': {
        return {
          nome: body?.name || body?.nome || '',
          telefone: body?.phone || body?.telefone || '',
          email: body?.email || '',
          origem: 'ImovelWeb',
          observacao: body?.message || body?.mensagem || '',
        };
      }

      case 'SITE': {
        return {
          nome: body?.nome || body?.name || '',
          telefone: body?.telefone || body?.phone || body?.whatsapp || '',
          email: body?.email || '',
          origem: body?.origem || body?.source || 'Site',
          campanha: body?.campanha || body?.utm_campaign || '',
          observacao: body?.mensagem || body?.message || body?.observacao || '',
        };
      }

      case 'LANDING_PAGE': {
        return {
          nome: body?.nome || body?.name || '',
          telefone: body?.telefone || body?.phone || body?.whatsapp || '',
          email: body?.email || '',
          origem: 'Landing Page',
          observacao: body?.mensagem || body?.message || '',
        };
      }

      case 'FORMULARIO_INTERNO': {
        return {
          nome: body?.nome || body?.name || '',
          telefone: body?.telefone || body?.phone || body?.whatsapp || '',
          email: body?.email || '',
          origem: 'Formulário Interno',
          observacao: body?.mensagem || body?.message || '',
        };
      }

      default:
        return null;
    }
  } catch (err: any) {
    logger.error('Erro ao parsear payload do canal', { type, error: err?.message });
    return null;
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────

@SkipThrottle()
@Controller('webhooks/channel')
export class ChannelsWebhookController {
  constructor(
    private channels: ChannelsService,
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private pipeline: PipelineService,
  ) {}

  /** Config pública do formulário (para landing page) */
  @Get(':token/config')
  async formConfig(@Param('token') token: string, @Res() res: Response) {
    const config = await this.channels.getFormConfig(token);
    if (!config) return res.sendStatus(404);
    return res.json(config);
  }

  /** Meta webhook verification (GET) */
  @Get(':token')
  async verify(
    @Param('token') token: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const channel = await this.channels.findByToken(token);
    if (!channel) return res.sendStatus(404);

    const expected = (channel.config as any)?.verifyToken;
    if (mode === 'subscribe' && verifyToken === expected) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  /** Recebe lead de qualquer canal */
  @Post(':token')
  @HttpCode(200)
  async receive(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    res.json({ ok: true }); // ACK imediato

    try {
      const channel = await this.channels.findByToken(token);
      if (!channel) return;

      // Verificação HMAC para Meta Ads (LGPD / segurança de origem)
      if (channel.type === 'META_ADS') {
        const appSecret = (channel.config as any)?.appSecret;
        const signature = (req.headers as any)['x-hub-signature-256'] as string | undefined;
        if (appSecret && signature) {
          const expected = 'sha256=' + crypto
            .createHmac('sha256', appSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');
          if (signature !== expected) {
            logger.warn(`Meta HMAC inválido para canal ${channel.id}`);
            return;
          }
        }
      }

      const normalized = await parsePayload(channel.type, req.body, channel.config);
      if (!normalized || !normalized.nome) return;

      // Busca tenant
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: channel.tenantId },
        select: { id: true },
      });
      if (!tenant) return;

      // Normaliza telefone
      const telefone = normalized.telefone?.replace(/\D/g, '') || null;
      const telefoneKey = telefone ? telefone.slice(-9) : null;

      // Busca stage inicial do funil (Pré-atendimento)
      const pipelineId = await this.pipeline.ensureDefaultPipeline(tenant.id);
      const firstStage = await this.prisma.pipelineStage.findFirst({
        where: { tenantId: tenant.id, pipelineId, key: 'NOVO_LEAD' },
        select: { id: true },
      });

      const CLOSED_STAGE_KEYS = ['BASE_FRIA', 'ENTREGA_CONTRATO_REGISTRADO', 'POS_VENDA_IA'];

      // Verifica se lead já existe pelo telefone
      const existing = telefoneKey
        ? await this.prisma.lead.findFirst({
            where: { tenantId: tenant.id, telefoneKey },
            select: {
              id: true,
              nome: true,
              stageId: true,
              stage: { select: { key: true } },
            },
          })
        : null;

      const existingStageKey = existing?.stage?.key ?? null;
      const existingIsClosed = existingStageKey
        ? CLOSED_STAGE_KEYS.includes(existingStageKey)
        : false;

      let leadId: string;
      let isNew = false;

      if (existing && !existingIsClosed) {
        // ── Lead ativo: registra retorno, não duplica ──
        leadId = existing.id;

        const retornoMsg =
          `🔄 Lead retornou via *${normalized.origem}*` +
          (normalized.campanha ? ` — Campanha: ${normalized.campanha}` : '') +
          (normalized.observacao ? `\nMsg: ${normalized.observacao}` : '');

        await this.prisma.leadEvent.create({
          data: {
            tenantId: tenant.id,
            leadId,
            channel: `${channel.type.toLowerCase()}.reentry`,
            payloadRaw: { normalized: normalized as any, raw: req.body, note: retornoMsg },
          },
        });

        // Notifica corretor
        const users = await this.prisma.user.findMany({
          where: { tenantId: tenant.id, ativo: true, whatsappNumber: { not: null } },
          select: { whatsappNumber: true },
        });
        for (const u of users) {
          if (u.whatsappNumber) {
            this.whatsapp.sendMessage(u.whatsappNumber, retornoMsg).catch(() => {});
          }
        }

        logger.log(`Lead duplicado ignorado, retorno registrado: ${existing.nome} via ${channel.type}`);
      } else {
        // ── Lead novo ou re-entrada pós-fechamento ──
        isNew = true;
        const lead = await this.prisma.lead.create({
          data: {
            tenantId: tenant.id,
            nome: normalized.nome.trim(),
            telefone,
            telefoneKey,
            email: normalized.email?.trim() || null,
            origem: normalized.origem,
            status: 'NOVO',
            stageId: firstStage?.id ?? null,
          },
          select: { id: true },
        });
        leadId = lead.id;

        // Notifica usuários
        const users = await this.prisma.user.findMany({
          where: { tenantId: tenant.id, ativo: true, whatsappNumber: { not: null } },
          select: { whatsappNumber: true },
        });
        const reentrada = existing ? '♻️ Re-entrada — ' : '';
        const msg =
          `🔔 ${reentrada}Novo lead via *${normalized.origem}*: *${normalized.nome}*` +
          (telefone ? `\nWhatsApp: ${telefone}` : '') +
          (normalized.campanha ? `\nCampanha: ${normalized.campanha}` : '') +
          (normalized.observacao ? `\nMsg: ${normalized.observacao}` : '');

        for (const u of users) {
          if (u.whatsappNumber) {
            this.whatsapp.sendMessage(u.whatsappNumber, msg).catch(() => {});
          }
        }

        logger.log(`Lead ${existing ? 're-entrada' : 'novo'} via ${channel.type}: ${normalized.nome}`);
      }

      await this.prisma.leadEvent.create({
        data: {
          tenantId: tenant.id,
          leadId,
          channel: `${channel.type.toLowerCase()}.in`,
          payloadRaw: { normalized: normalized as any, raw: req.body },
        },
      });

      if (isNew) await this.channels.incrementLeadCount(channel.id);
    } catch (err: any) {
      logger.error('Erro ao processar lead do canal', { error: err?.message });
    }
  }
}
