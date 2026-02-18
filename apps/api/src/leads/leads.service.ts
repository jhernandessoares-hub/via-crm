import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // =============================
  // HELPERS (telefone / key)
  // =============================

  private digitsOnly(v: string): string {
    return (v || '').replace(/\D/g, '');
  }

  // Mesma lógica do webhook
  private telefoneKeyFrom(input: string): string {
    let d = this.digitsOnly(input);

    if (d.startsWith('55') && d.length > 11) d = d.slice(2);

    if (d.length > 11) d = d.slice(-11);

    if (d.length >= 9) return d.slice(-9);

    return d;
  }

  // =============================
  // CRUD BÁSICO
  // =============================

  async create(tenantId: string, body: any) {
    const telefoneRaw = body?.telefone ? String(body.telefone) : '';
    const telefoneDigits = this.digitsOnly(telefoneRaw);

    let telefoneKey: string | null = null;

    if (telefoneDigits) {
      telefoneKey = this.telefoneKeyFrom(telefoneDigits);
    }

    return this.prisma.lead.create({
      data: {
        tenantId,
        nome: body.nome,
        telefone: telefoneDigits || null,
        telefoneKey,
        email: body.email || null,
        origem: body.origem || null,
        observacao: body.observacao || null,
        status: 'NOVO',
      },
    });
  }

  async list(tenantId: string, status?: LeadStatus) {
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async getById(user: any, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    return lead;
  }

  async listEvents(user: any, id: string) {
    return this.prisma.leadEvent.findMany({
      where: {
        leadId: id,
        tenantId: user.tenantId,
      },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async createEvent(user: any, id: string, body: any) {
    return this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId: id,
        channel: body.channel || 'crm.note',
        payloadRaw: body.payloadRaw || {},
      },
    });
  }

  async updateStatus(tenantId: string, id: string, status: LeadStatus) {
    return this.prisma.lead.update({
      where: { id },
      data: { status },
    });
  }

  async assignLead(id: string, assignedUserId: string, user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.lead.update({
      where: { id },
      data: { assignedUserId },
    });
  }

  // =============================
  // MANAGER QUEUE
  // =============================

  async getManagerQueue(user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        needsManagerReview: true,
      },
      orderBy: { lastInboundAt: 'desc' },
    });
  }

  async getMyLeads(user: any, status?: LeadStatus) {
    return this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        assignedUserId: user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async getBranchLeads(user: any, branchId?: string, status?: LeadStatus) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async managerDecision(id: string, dto: any, user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    await this.prisma.lead.update({
      where: { id },
      data: {
        needsManagerReview: false,
      },
    });

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId: id,
        channel: 'system.manager_decision',
        payloadRaw: dto,
      },
    });

    return { ok: true };
  }

  // =============================
  // 🚀 ENVIO REAL WHATSAPP
  // =============================

  private normalizeToE164(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');

    if (digits.startsWith('55')) return digits;

    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }

    return digits;
  }

  private pickMessage(input: any): string {
    // Aceita string direto
    if (typeof input === 'string') return input;

    // Aceita vários formatos de payload
    const candidates = [
      input?.message,
      input?.mensagem,
      input?.text,
      input?.body,
      input?.content,
      input?.data?.message,
      input?.data?.text,
    ];

    const found = candidates.find(
      (v) => typeof v === 'string' && v.trim().length > 0,
    );

    return (found || '').trim();
  }

  private async sendMetaMessage(toRaw: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    const safeText = (text || '').trim();
    if (!safeText) {
      throw new Error('Mensagem vazia: informe "message" no body.');
    }

    if (!token || !phoneNumberId) {
      throw new Error(
        'Config faltando: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Railway/ambiente.',
      );
    }

    const to = this.normalizeToE164(toRaw);

    if (!to || to.length < 8) {
      throw new Error(`Telefone inválido para envio: "${toRaw}"`);
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: safeText },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data: any = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        const metaMsg =
          data?.error?.message ||
          data?.message ||
          'Erro desconhecido retornado pela Meta';

        throw new Error(`Erro ao enviar WhatsApp (Meta): ${metaMsg}`);
      }

      return { to, metaResponse: data };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Timeout ao enviar WhatsApp (Meta). Tente novamente.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Agora aceita: string OU body inteiro
  async sendWhatsappMessage(user: any, leadId: string, input: any) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId: user.tenantId,
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    if (!lead.telefone) {
      throw new Error('Lead não possui telefone cadastrado');
    }

    const text = this.pickMessage(input);

    const result = await this.sendMetaMessage(lead.telefone, text);

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        channel: 'whatsapp.out',
        payloadRaw: {
          to: result.to,
          text,
          metaResponse: result.metaResponse,
        },
      },
    });

    return { ok: true };
  }
}
