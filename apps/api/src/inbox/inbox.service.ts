import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { Logger } from '../logger';

const logger = new Logger('InboxService');

const LIGHT_CHANNELS_IN = ['whatsapp.unofficial.in'];
const LIGHT_CHANNELS_OUT = ['whatsapp.unofficial.out'];
const LIGHT_CHANNELS_ALL = [...LIGHT_CHANNELS_IN, ...LIGHT_CHANNELS_OUT];

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unofficial: WhatsappUnofficialService,
  ) {}

  // ── Lista de conversas ────────────────────────────────────────────────────

  async listConversas(tenantId: string, userId: string, role: string, branchId: string | null, sessionId?: string) {
    const whereRole: any = { tenantId, deletedAt: null, conversaCanal: 'WHATSAPP_LIGHT' };
    if (sessionId) whereRole.conversaSessionId = sessionId;
    if (role === 'AGENT') whereRole.assignedUserId = userId;
    else if (role === 'MANAGER' && branchId) whereRole.branchId = branchId;

    const leads = await this.prisma.lead.findMany({
      where: whereRole,
      select: {
        id: true,
        nome: true,
        nomeCorreto: true,
        telefone: true,
        lastInboundAt: true,
        assignedUserId: true,
        conversaSessionId: true,
        avatarUrl: true,
        lastReadAt: true,
        conversaSession: { select: { nome: true, phoneNumber: true } },
        events: {
          where: { channel: { in: LIGHT_CHANNELS_ALL } },
          orderBy: { criadoEm: 'desc' },
          take: 1,
          select: { channel: true, criadoEm: true, payloadRaw: true },
        },
      },
      orderBy: { lastInboundAt: { sort: 'desc', nulls: 'last' } },
    });

    // Calcula naoLidos em 2 queries (em vez de 2N), incluindo lastReadAt como cutoff
    const leadIds = leads.map(l => l.id);
    const naoLidosMap = new Map<string, number>();

    if (leadIds.length > 0) {
      const [lastOuts, allIns] = await Promise.all([
        this.prisma.leadEvent.findMany({
          where: { leadId: { in: leadIds }, channel: { in: LIGHT_CHANNELS_OUT } },
          select: { leadId: true, criadoEm: true },
          orderBy: { criadoEm: 'desc' },
        }),
        this.prisma.leadEvent.findMany({
          where: { leadId: { in: leadIds }, channel: { in: LIGHT_CHANNELS_IN } },
          select: { leadId: true, criadoEm: true },
        }),
      ]);

      // Último out por lead (já ordenado desc, primeira ocorrência é o mais recente)
      const lastOutMap = new Map<string, Date>();
      for (const ev of lastOuts) {
        if (!lastOutMap.has(ev.leadId)) lastOutMap.set(ev.leadId, ev.criadoEm);
      }

      // Mapa de lastReadAt por lead
      const lastReadMap = new Map<string, Date | null>(
        leads.map(l => [l.id, l.lastReadAt ?? null]),
      );

      // Conta mensagens inbound não lidas (após lastOut ou lastReadAt, o que for mais recente)
      for (const ev of allIns) {
        const lastOut = lastOutMap.get(ev.leadId) ?? null;
        const lastRead = lastReadMap.get(ev.leadId) ?? null;
        let cutoff: Date | null = null;
        if (lastOut && lastRead) cutoff = lastOut > lastRead ? lastOut : lastRead;
        else cutoff = lastOut ?? lastRead;

        if (!cutoff || ev.criadoEm > cutoff) {
          naoLidosMap.set(ev.leadId, (naoLidosMap.get(ev.leadId) ?? 0) + 1);
        }
      }
    }

    const leadEntries = leads.map((lead) => {
      const ultimaMensagem = lead.events[0] ?? null;
      const texto = ultimaMensagem ? extractText(ultimaMensagem.payloadRaw) : null;

      return {
        type: 'lead' as const,
        leadId: lead.id,
        contatoId: null as string | null,
        nome: lead.nomeCorreto ?? lead.nome,
        telefone: lead.telefone,
        avatarUrl: lead.avatarUrl ?? null,
        lastInboundAt: lead.lastInboundAt,
        sessaoNome: lead.conversaSession?.nome ?? null,
        naoLidos: naoLidosMap.get(lead.id) ?? 0,
        ultimaMensagem: texto,
        ultimaMensagemEm: ultimaMensagem?.criadoEm?.toISOString() ?? null,
        ultimaMensagemDirecao: ultimaMensagem
          ? (LIGHT_CHANNELS_IN.includes(ultimaMensagem.channel) ? 'in' : 'out')
          : null,
      };
    });

    // ── Contatos de campanha sem lead (ainda não responderam) ─────────────
    type ConversaEntry = {
      type: 'lead' | 'campanha';
      leadId: string | null;
      contatoId: string | null;
      nome: string;
      telefone: string | null;
      avatarUrl: string | null;
      lastInboundAt: Date | null;
      sessaoNome: string | null;
      naoLidos: number;
      ultimaMensagem: string | null;
      ultimaMensagemEm: string | null;
      ultimaMensagemDirecao: 'in' | 'out' | null;
    };
    let campanhaEntries: ConversaEntry[] = [];

    if (sessionId) {
      const disparos = await this.prisma.campanhaDisparo.findMany({
        where: { sessionId, tenantId },
        select: {
          id: true,
          modelo: { select: { mensagem: true } },
        },
      });

      if (disparos.length > 0) {
        const disparoMsgMap = new Map(disparos.map(d => [d.id, d.modelo?.mensagem ?? null]));
        const contatos = await this.prisma.campanhaContato.findMany({
          where: {
            disparoId: { in: disparos.map(d => d.id) },
            status: { in: ['ENVIADO', 'FALHA'] },
            leadId: null,
          },
          select: { id: true, telefone: true, nome: true, enviadoEm: true, disparoId: true },
          orderBy: { enviadoEm: { sort: 'desc', nulls: 'last' } },
        });

        campanhaEntries = contatos.map(c => ({
          type: 'campanha' as const,
          leadId: null,
          contatoId: c.id,
          nome: c.nome || c.telefone,
          telefone: c.telefone,
          avatarUrl: null,
          lastInboundAt: c.enviadoEm,
          sessaoNome: null,
          naoLidos: 0,
          ultimaMensagem: disparoMsgMap.get(c.disparoId) ?? null,
          ultimaMensagemEm: c.enviadoEm?.toISOString() ?? null,
          ultimaMensagemDirecao: 'out' as 'in' | 'out' | null,
        }));
      }
    }

    // Merge leads + campanha-only contacts, ordenados por mensagem mais recente
    const merged = [...leadEntries, ...campanhaEntries];
    merged.sort((a, b) => {
      const aT = a.ultimaMensagemEm ? new Date(a.ultimaMensagemEm).getTime() : 0;
      const bT = b.ultimaMensagemEm ? new Date(b.ultimaMensagemEm).getTime() : 0;
      return bT - aT;
    });
    return merged;
  }

  // ── Detalhe de contato de campanha (sem lead) ─────────────────────────────

  async getCampanhaContato(tenantId: string, contatoId: string) {
    const contato = await this.prisma.campanhaContato.findFirst({
      where: { id: contatoId },
      select: {
        id: true, telefone: true, nome: true, enviadoEm: true, status: true,
        disparo: {
          select: {
            tenantId: true,
            modelo: { select: { mensagem: true, mediaUrl: true, mediaType: true } },
          },
        },
      },
    });

    if (!contato || contato.disparo.tenantId !== tenantId) {
      throw new NotFoundException('Contato não encontrado');
    }

    return {
      contatoId: contato.id,
      nome: contato.nome || contato.telefone,
      telefone: contato.telefone,
      status: contato.status,
      enviadoEm: contato.enviadoEm,
      mensagemDisparo: contato.disparo.modelo?.mensagem ?? null,
      mediaUrl: contato.disparo.modelo?.mediaUrl ?? null,
      mediaType: contato.disparo.modelo?.mediaType ?? null,
    };
  }

  // ── Mensagens de uma conversa ─────────────────────────────────────────────

  async getMensagens(tenantId: string, leadId: string, userId: string, role: string, branchId: string | null, cursor?: string) {
    const lead = await this.assertAccess(tenantId, leadId, userId, role, branchId);

    const where: any = { leadId, channel: { in: LIGHT_CHANNELS_ALL } };
    if (cursor) where.criadoEm = { lt: new Date(cursor) };

    const events = await this.prisma.leadEvent.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 50,
      select: { id: true, channel: true, criadoEm: true, payloadRaw: true },
    });

    const ordered = [...events].reverse();

    return {
      leadId: lead.id,
      nome: lead.nomeCorreto ?? lead.nome,
      telefone: lead.telefone,
      avatarUrl: lead.avatarUrl ?? null,
      sessaoId: lead.conversaSessionId,
      sessaoNome: lead.conversaSession?.nome ?? null,
      mensagens: ordered.map((ev) => ({
        id: ev.id,
        direcao: LIGHT_CHANNELS_IN.includes(ev.channel) ? 'in' : 'out',
        texto: extractText(ev.payloadRaw),
        criadoEm: ev.criadoEm,
      })),
      hasMore: events.length === 50,
      nextCursor: events.length === 50 ? ordered[0]?.criadoEm?.toISOString() : null,
    };
  }

  // ── Envio de mensagem ─────────────────────────────────────────────────────

  async enviar(tenantId: string, leadId: string, userId: string, role: string, branchId: string | null, text: string) {
    const lead = await this.assertAccess(tenantId, leadId, userId, role, branchId);

    if (!lead.conversaSessionId) throw new NotFoundException('Lead sem sessão WhatsApp Light ativa');
    if (!lead.telefone) throw new NotFoundException('Lead sem telefone cadastrado');

    // Cria o evento ANTES de enviar — garante histórico mesmo em falha de rede
    const event = await this.prisma.leadEvent.create({
      data: {
        tenantId,
        leadId,
        channel: 'whatsapp.unofficial.out',
        payloadRaw: {
          text,
          sentBy: userId,
          source: 'inbox',
          sentAt: new Date().toISOString(),
        },
      },
      select: { id: true, criadoEm: true },
    });

    try {
      await this.unofficial.sendText(lead.conversaSessionId, lead.telefone, text);
      logger.log(`Mensagem enviada via inbox leadId=${leadId} sessionId=${lead.conversaSessionId}`);
      return { ok: true, messageId: event.id, criadoEm: event.criadoEm };
    } catch (err) {
      // Rollback: remove o evento se o envio falhou
      await this.prisma.leadEvent.delete({ where: { id: event.id } }).catch(() => {});
      throw err;
    }
  }

  // ── Marcar como lida ──────────────────────────────────────────────────────

  async marcarLida(tenantId: string, leadId: string, userId: string, role: string, branchId: string | null) {
    await this.assertAccess(tenantId, leadId, userId, role, branchId);
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertAccess(tenantId: string, leadId: string, userId: string, role: string, branchId: string | null) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: {
        id: true, nome: true, nomeCorreto: true, telefone: true,
        assignedUserId: true, branchId: true,
        conversaSessionId: true, avatarUrl: true,
        conversaSession: { select: { nome: true } },
      },
    });
    if (!lead) throw new NotFoundException('Conversa não encontrada');

    if (role === 'AGENT' && lead.assignedUserId !== userId) {
      throw new ForbiddenException('Sem acesso a esta conversa');
    }
    if (role === 'MANAGER' && branchId && lead.branchId !== branchId) {
      throw new ForbiddenException('Sem acesso a esta conversa');
    }

    return lead;
  }
}

function extractText(payloadRaw: any): string | null {
  if (!payloadRaw || typeof payloadRaw !== 'object') return null;
  const p = payloadRaw as any;
  if (typeof p.text === 'string') return p.text;
  if (typeof p.body === 'string') return p.body;
  return null;
}
