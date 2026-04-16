import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';
import * as crypto from 'crypto';

function hashToken(token: string): string {
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) throw new Error('WEBHOOK_HMAC_SECRET não configurada');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

const logger = new Logger('ChannelsService');

export const CHANNEL_DEFS: Record<string, { name: string; description: string; origem: string }> = {
  META_ADS:            { name: 'Meta Ads',           description: 'Facebook e Instagram Lead Ads',          origem: 'Meta Ads' },
  GOOGLE_ADS:          { name: 'Google Ads',          description: 'Google Lead Form Extensions',            origem: 'Google Ads' },
  YOUTUBE:             { name: 'YouTube',             description: 'YouTube Lead Forms via Google Ads',       origem: 'YouTube' },
  TIKTOK_ADS:          { name: 'TikTok Ads',          description: 'TikTok Lead Generation',                 origem: 'TikTok Ads' },
  PORTAL_ZAP:          { name: 'ZAP Imóveis',         description: 'Portal ZAP Imóveis',                     origem: 'ZAP Imóveis' },
  PORTAL_VIVAREAL:     { name: 'Viva Real',           description: 'Portal Viva Real',                       origem: 'Viva Real' },
  PORTAL_OLX:          { name: 'OLX Imóveis',         description: 'OLX Pro / OLX Imóveis',                  origem: 'OLX Imóveis' },
  PORTAL_IMOVELWEB:    { name: 'ImovelWeb',           description: 'Portal ImovelWeb',                       origem: 'ImovelWeb' },
  LANDING_PAGE:        { name: 'Landing Page',        description: 'Página hospedada no CRM',                origem: 'Landing Page' },
  FORMULARIO_INTERNO:  { name: 'Formulário Interno',  description: 'Link de formulário para compartilhar',   origem: 'Formulário Interno' },
  SITE:                { name: 'Site Próprio',        description: 'Site externo com snippet de integração', origem: 'Site' },
  WHATSAPP:            { name: 'WhatsApp',            description: 'Leads captados pelo WhatsApp',           origem: 'WhatsApp' },
};

@Injectable()
export class ChannelsService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    const configured = await this.prisma.channel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    return Object.entries(CHANNEL_DEFS).map(([type, def]) => {
      const ch = configured.find((c) => c.type === type);
      return {
        type,
        ...def,
        id: ch?.id ?? null,
        active: ch?.active ?? false,
        webhookToken: ch?.webhookToken ?? null,
        config: ch?.config ?? null,
        monthlyBudget: ch?.monthlyBudget ?? null,
        leadsCount: ch?.leadsCount ?? 0,
        lastLeadAt: ch?.lastLeadAt ?? null,
        configured: !!ch,
      };
    });
  }

  async getStats(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const configured = await this.prisma.channel.findMany({ where: { tenantId } });

    // Geral
    const [totalHoje, totalSemana, totalMes, totalGeral, totalFechados] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, criadoEm: { gte: startOfToday } } }),
      this.prisma.lead.count({ where: { tenantId, criadoEm: { gte: startOfWeek } } }),
      this.prisma.lead.count({ where: { tenantId, criadoEm: { gte: startOfMonth } } }),
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId, status: 'FECHADO' } }),
    ]);

    const totalBudget = configured.reduce((s, c) => s + (c.monthlyBudget ?? 0), 0);
    const cplGeral = totalBudget > 0 && totalMes > 0 ? totalBudget / totalMes : null;
    const convRateGeral = totalGeral > 0 ? (totalFechados / totalGeral) * 100 : 0;

    // Por canal (inclui WhatsApp sempre)
    const allDefs = { ...CHANNEL_DEFS };
    const channelStats = await Promise.all(
      Object.entries(allDefs).map(async ([type, def]) => {
        const ch = configured.find((c) => c.type === type);
        const origem = def.origem;

        const [hoje, semana, mes, total, fechados] = await Promise.all([
          this.prisma.lead.count({ where: { tenantId, origem, criadoEm: { gte: startOfToday } } }),
          this.prisma.lead.count({ where: { tenantId, origem, criadoEm: { gte: startOfWeek } } }),
          this.prisma.lead.count({ where: { tenantId, origem, criadoEm: { gte: startOfMonth } } }),
          this.prisma.lead.count({ where: { tenantId, origem } }),
          this.prisma.lead.count({ where: { tenantId, origem, status: 'FECHADO' } }),
        ]);

        const budget = ch?.monthlyBudget ?? null;
        const cpl = budget && mes > 0 ? budget / mes : null;
        const convRate = total > 0 ? (fechados / total) * 100 : 0;

        return {
          type,
          name: def.name,
          origem,
          configured: !!ch,
          active: ch?.active ?? false,
          webhookToken: ch?.webhookToken ?? null,
          budget,
          hoje, semana, mes, total, fechados,
          cpl, convRate,
        };
      }),
    );

    // Leads sem origem definida (entrada manual, etc)
    const semOrigem = await this.prisma.lead.count({ where: { tenantId, origem: null } });

    return {
      geral: {
        hoje: totalHoje,
        semana: totalSemana,
        mes: totalMes,
        total: totalGeral,
        fechados: totalFechados,
        convRate: convRateGeral,
        totalBudget,
        cpl: cplGeral,
      },
      canais: channelStats.filter((c) => c.total > 0 || c.configured),
      semOrigem,
    };
  }

  async fetchMetaCost(channelId: string): Promise<number | null> {
    const ch = await this.prisma.channel.findFirst({ where: { id: channelId } });
    if (!ch) return null;

    const config = ch.config as any;
    const token = config?.accessToken;
    const accountId = config?.adAccountId;
    if (!token || !accountId) return null;

    try {
      const url = `https://graph.facebook.com/v20.0/act_${accountId}/insights?fields=spend&date_preset=this_month&access_token=${token}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      const spend = parseFloat(data?.data?.[0]?.spend || '0');
      if (isNaN(spend)) return null;

      await this.prisma.channel.update({
        where: { id: channelId },
        data: { monthlyBudget: spend },
      });
      return spend;
    } catch (err: any) {
      logger.error('Erro ao buscar custo Meta Ads', { error: err?.message });
      return null;
    }
  }

  async fetchGoogleCost(channelId: string): Promise<number | null> {
    const ch = await this.prisma.channel.findFirst({ where: { id: channelId } });
    if (!ch) return null;
    // Google Ads API requires OAuth — por ora retorna null, campo manual
    return null;
  }

  async upsert(tenantId: string, type: string, data: { active?: boolean; config?: any; monthlyBudget?: number | null }) {
    if (!CHANNEL_DEFS[type]) throw new NotFoundException('Tipo de canal inválido.');

    const existing = await this.prisma.channel.findFirst({ where: { tenantId, type } });

    if (existing) {
      // Migra hash se ainda não tiver (canais criados antes do hardening)
      const hashUpdate = existing.webhookTokenHash ? {} : { webhookTokenHash: hashToken(existing.webhookToken) };
      return this.prisma.channel.update({
        where: { id: existing.id },
        data: {
          ...(data.active !== undefined && { active: data.active }),
          ...(data.config !== undefined && { config: data.config }),
          ...(data.monthlyBudget !== undefined && { monthlyBudget: data.monthlyBudget }),
          ...hashUpdate,
        },
      });
    }

    // Novo canal: gera token e armazena hash imediatamente
    const token = crypto.randomBytes(24).toString('hex');
    return this.prisma.channel.create({
      data: {
        tenantId,
        type,
        name: CHANNEL_DEFS[type].name,
        active: data.active ?? true,
        config: data.config ?? null,
        monthlyBudget: data.monthlyBudget ?? null,
        webhookToken: token,
        webhookTokenHash: hashToken(token),
      },
    });
  }

  async remove(tenantId: string, type: string) {
    const ch = await this.prisma.channel.findFirst({ where: { tenantId, type } });
    if (!ch) throw new NotFoundException('Canal não encontrado.');
    return this.prisma.channel.delete({ where: { id: ch.id } });
  }

  async findByToken(webhookToken: string) {
    const hash = hashToken(webhookToken);
    // Lookup por hash (seguro) com fallback para plaintext (canais antigos não migrados)
    const byHash = await this.prisma.channel.findFirst({ where: { webhookTokenHash: hash, active: true } });
    if (byHash) return byHash;
    return this.prisma.channel.findFirst({ where: { webhookToken, active: true } });
  }

  async getFormConfig(webhookToken: string) {
    const hash = hashToken(webhookToken);
    const ch = await this.prisma.channel.findFirst({
      where: { OR: [{ webhookTokenHash: hash }, { webhookToken }] },
    });
    if (!ch) return null;
    const config = (ch.config as any) || {};
    return {
      type: ch.type,
      name: ch.name,
      formTitle: config.formTitle || ch.name,
      formSubtitle: config.formSubtitle || 'Preencha seus dados e entraremos em contato.',
      primaryColor: config.primaryColor || '#0f172a',
      thankYouMessage: config.thankYouMessage || 'Obrigado! Em breve entraremos em contato.',
      fields: config.formFields || [
        { key: 'nome', label: 'Nome completo', type: 'text', required: true },
        { key: 'telefone', label: 'WhatsApp', type: 'tel', required: true },
        { key: 'email', label: 'E-mail', type: 'email', required: false },
        { key: 'mensagem', label: 'Mensagem', type: 'textarea', required: false },
      ],
    };
  }

  async incrementLeadCount(channelId: string) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { leadsCount: { increment: 1 }, lastLeadAt: new Date() },
    });
  }
}
