import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  // Por padrão, se não souber a filial, cai em TRIAGEM.
  // (Hoje fixo para o tenant VIA - Empresa Teste; depois vamos resolver por tenant.)
  private readonly TRIAGEM_BRANCH_ID = 'dd34ed95-0a1e-47d6-83db-70eeff987799';

  async ingestLead(data: { tenantId: string; channel: string; payload: any }) {
    const { tenantId, channel, payload } = data;

    const telefoneRaw: string | null = payload.telefone ?? null;
    const telefoneKey = makeTelefoneKey(telefoneRaw);

    const email: string | null = payload.email ?? null;
    const nome: string = payload.nome ?? 'Sem nome';

    // branchId vindo do payload (futuro: meta/site/campaign). Se não vier, TRIAGEM.
    const branchId: string = payload.branchId ?? this.TRIAGEM_BRANCH_ID;

    // 1) procurar lead existente pela chave
    const existingLead = telefoneKey
      ? await this.prisma.lead.findFirst({
          where: { tenantId, telefoneKey },
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

            // se reentrada: vai pro gerente e topo da fila
            needsManagerReview: true,
            queuePriority: 1,

            // branch: só define se ainda estiver vazio
            branchId: existingLead.branchId ?? branchId,
          },
        })
      : await this.prisma.lead.create({
          data: {
            tenantId,
            branchId,
            nome,
            telefone: telefoneRaw,
            telefoneKey,
            email,
            origem: channel,
            needsManagerReview: false,
            queuePriority: 9999,
          },
        });

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

    // 4) Gancho de notificação (ainda não envia nada, só deixa pronto)
    // TODO: notifyManagerOnReentry(lead.id, event.id);

    console.log('Lead:', lead.id, 'Event:', event.id, 'Reentry:', isReentry);

    return { lead, event };
  }
}
