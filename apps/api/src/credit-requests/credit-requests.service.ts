import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_FULL = {
  correspondent: { select: { id: true, nome: true, email: true, empresa: true, telefone: true } },
  lead: { select: { id: true, nome: true, nomeCorreto: true, telefone: true, email: true, rendaBrutaFamiliar: true } },
};

@Injectable()
export class CreditRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tenant: enviar lead para correspondente ──────────────────────────────────

  async createForLead(tenantId: string, leadId: string, body: any) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const correspondent = await this.prisma.correspondent.findUnique({ where: { id: body.correspondentId } });
    if (!correspondent || !correspondent.ativo) throw new NotFoundException('Correspondente não encontrado');

    // Permite múltiplas solicitações por lead (cada uma para um correspondente diferente)
    return this.prisma.creditRequest.create({
      data: {
        tenantId,
        leadId,
        correspondentId:  body.correspondentId,
        valorImovel:      body.valorImovel ?? null,
        valorCredito:     body.valorCredito ?? null,
        rendaMensal:      body.rendaMensal ?? null,
        tipoFinanciamento: body.tipoFinanciamento ?? null,
        observacoes:      body.observacoes ?? null,
        status: 'EM_ANALISE',
      },
      include: INCLUDE_FULL,
    });
  }

  async listForLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    return this.prisma.creditRequest.findMany({
      where: { leadId, tenantId },
      include: INCLUDE_FULL,
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelRequest(tenantId: string, requestId: string) {
    const req = await this.prisma.creditRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!req) throw new NotFoundException('Solicitação não encontrada');
    await this.prisma.creditRequest.delete({ where: { id: requestId } });
    return { ok: true };
  }

  // ── Correspondente: ver e atualizar suas demandas ─────────────────────────────

  async listForCorrespondent(correspondentId: string) {
    return this.prisma.creditRequest.findMany({
      where: { correspondentId },
      include: {
        ...INCLUDE_FULL,
        tenant: { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOneForCorrespondent(correspondentId: string, requestId: string) {
    const req = await this.prisma.creditRequest.findFirst({
      where: { id: requestId, correspondentId },
      include: {
        ...INCLUDE_FULL,
        tenant: { select: { id: true, nome: true } },
      },
    });
    if (!req) throw new NotFoundException('Demanda não encontrada');
    return req;
  }

  async updateStatus(correspondentId: string, requestId: string, body: { status: string; parecer?: string }) {
    const req = await this.prisma.creditRequest.findFirst({ where: { id: requestId, correspondentId } });
    if (!req) throw new NotFoundException('Demanda não encontrada');

    const allowed = ['EM_ANALISE', 'COM_PENDENCIA', 'APROVADO', 'REPROVADO', 'CONDICIONADO'];
    if (!allowed.includes(body.status)) throw new ForbiddenException('Status inválido');

    const isResponse = ['APROVADO', 'REPROVADO', 'CONDICIONADO'].includes(body.status);
    return this.prisma.creditRequest.update({
      where: { id: requestId },
      data: {
        status:      body.status,
        parecer:     body.parecer ?? null,
        respondedAt: isResponse ? new Date() : null,
      },
      include: INCLUDE_FULL,
    });
  }
}
