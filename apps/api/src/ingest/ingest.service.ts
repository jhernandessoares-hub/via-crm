import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Logger } from '../logger';

const logger = new Logger('IngestService');

function onlyDigits(s: string) {
  return (s || '').replace(/\D/g, '');
}

// Regra: telefoneKey = últimos 8 ou 9 dígitos (sem DDI/DDD).
// Se tiver 9 (celular), fica 9. Se tiver 8 (fixo), fica 8.
function makeTelefoneKey(raw: string | null): string | null {
  if (!raw) return null;
  const d = onlyDigits(raw);
  if (!d) return null;
  if (d.length >= 9) return d.slice(-9);
  if (d.length >= 8) return d.slice(-8);
  return d; // fallback
}

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async resolveDefaultBranchId(tenantId: string): Promise<string | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, ativo: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    return branch?.id ?? null;
  }

  // Roleta: retorna o userId do próximo responsável pelo lead
  async roundRobinAssign(tenantId: string, branchId: string | null): Promise<string | null> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { roundRobinConfig: true },
      });

      const cfg = (tenant?.roundRobinConfig ?? {}) as any;
      const incluirGerentes: boolean = cfg.incluirGerentes ?? false;
      const incluirOwner: boolean    = cfg.incluirOwner    ?? false;

      // Roles elegíveis
      const roles: string[] = ['AGENT'];
      if (incluirGerentes) roles.push('MANAGER');
      if (incluirOwner)    roles.push('OWNER');

      // Candidatos: ativos, recebeLeads=true, role elegível, mesma filial (se houver)
      const candidates = await this.prisma.user.findMany({
        where: {
          tenantId,
          ativo: true,
          recebeLeads: true,
          role: { in: roles as any[] },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
      });

      if (candidates.length === 0) return null;

      // Para cada candidato, buscar a data do último lead atribuído
      const withLastLead = await Promise.all(
        candidates.map(async (c) => {
          const last = await this.prisma.lead.findFirst({
            where: { tenantId, assignedUserId: c.id, deletedAt: null },
            orderBy: { criadoEm: 'desc' },
            select: { criadoEm: true },
          });
          return { id: c.id, lastAt: last?.criadoEm ?? new Date(0) };
        }),
      );

      // Ordena por quem recebeu lead há mais tempo (ou nunca recebeu)
      withLastLead.sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime());

      return withLastLead[0].id;
    } catch (err) {
      logger.log(`roundRobinAssign erro: ${err?.message ?? err}`);
      return null;
    }
  }

  async ingestLead(data: { tenantId: string; channel: string; payload: any }) {
    const { tenantId, channel, payload } = data;

    const telefoneRaw: string | null = payload.telefone ?? null;
    const telefoneKey = makeTelefoneKey(telefoneRaw);

    const email: string | null = payload.email ?? null;
    const nome: string = payload.nome ?? 'Sem nome';

    // branchId vindo do payload ou resolução automática pela primeira branch ativa do tenant
    const branchId: string | null = payload.branchId ?? await this.resolveDefaultBranchId(tenantId);

    // 1) procurar lead existente pela chave
    const existingLead = telefoneKey
      ? await this.prisma.lead.findFirst({
          where: { tenantId, telefoneKey, deletedAt: null },
        })
      : null;

    const isReentry = !!existingLead;

    // 2) cria ou atualiza lead (sem apagar dados antigos)
    const lead = existingLead
      ? await this.prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            // mantém histórico: só completa se vier algo
            nome: nome ?? existingLead.nome,

            // REGRA NOVA: mantém SEMPRE o primeiro telefone exibido
            // só preenche se ainda não existir telefone salvo
            telefone: existingLead.telefone ?? telefoneRaw,

            telefoneKey: telefoneKey ?? existingLead.telefoneKey,
            email: email ?? existingLead.email,
            origem: channel,

            // branch: só define se ainda estiver vazio
            branchId: existingLead.branchId ?? branchId,
          },
        })
      : await (async () => {
          const assignedUserId = await this.roundRobinAssign(tenantId, branchId);
          return this.prisma.lead.create({
            data: {
              tenantId,
              branchId,
              nome,
              telefone: telefoneRaw,
              telefoneKey,
              email,
              origem: channel,
              ...(assignedUserId ? { assignedUserId } : {}),
            },
          });
        })();

    // 3) SEMPRE cria um evento (histórico)
    const event = await this.prisma.leadEvent.create({
      data: {
        tenantId,
        leadId: lead.id,
        channel,
        isReentry,
        payloadRaw: payload,
      },
    });

    logger.log(`Lead: ${lead.id} Event: ${event.id} Reentry: ${isReentry}`);

    // Notifica por email o responsável se for lead novo com assignedUserId
    if (!isReentry && (lead as any).assignedUserId) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: (lead as any).assignedUserId },
          select: { email: true, nome: true },
        });
        if (user) await this.email.sendNewLeadNotification(user.email, user.nome, lead.nome, channel);
      } catch { /* não quebra o fluxo */ }
    }

    return { lead, event };
  }

}
