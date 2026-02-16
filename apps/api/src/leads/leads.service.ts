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
  // CRUD BÁSICO
  // =============================

  async create(tenantId: string, body: any) {
    return this.prisma.lead.create({
      data: {
        tenantId,
        nome: body.nome,
        telefone: body.telefone || null,
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

  async updateStatus(
    tenantId: string,
    id: string,
    status: LeadStatus,
  ) {
    return this.prisma.lead.update({
      where: { id },
      data: { status },
    });
  }

  async assignLead(
    id: string,
    assignedUserId: string,
    user: any,
  ) {
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

  async getBranchLeads(
    user: any,
    branchId?: string,
    status?: LeadStatus,
  ) {
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

  private async sendMetaMessage(to: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error(
        'WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado',
      );
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('Erro Meta:', data);
      throw new Error('Erro ao enviar mensagem WhatsApp');
    }

    return data;
  }

  async sendWhatsappMessage(
    user: any,
    leadId: string,
    text: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId: user.tenantId,
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    if (!lead.telefone)
      throw new Error('Lead não possui telefone cadastrado');

    const telefone = lead.telefone.replace(/\D/g, '');

    const result = await this.sendMetaMessage(telefone, text);

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        channel: 'whatsapp.out',
        payloadRaw: {
          to: telefone,
          text,
          metaResponse: result,
        },
      },
    });

    return { ok: true };
  }
}
