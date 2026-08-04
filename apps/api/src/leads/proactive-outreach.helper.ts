import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';

/**
 * Inicia contato proativo com um lead via WhatsApp Light (Baileys).
 *
 * Função solta (não é um provider NestJS) — mesmo espírito de `lead-numbering.helper.ts`:
 * recebe as dependências como parâmetro para evitar import circular entre módulos.
 * Genérica o bastante para ser reaproveitada por outro caller (ex: tool da Secretária IA)
 * numa etapa futura — hoje só é chamada pelo cadastro manual de lead (`LeadsService.create`).
 *
 * Decisões de produto (não reabrir):
 * - Só WhatsApp Light — nunca WhatsApp Oficial (Meta) aqui, pois não há suporte a message
 *   templates hoje e a Meta rejeitaria por estar fora da janela de 24h.
 * - Lead abordado via contato proativo não passa pela roleta — fica com quem disparou a ação.
 * - Sem sessão conectada → falha com erro claro; o lead em si já foi criado pelo caller,
 *   este helper só cuida do envio da mensagem inicial.
 *
 * @throws Error (não HttpException — este helper é chamado tanto de controller quanto,
 *   futuramente, de dentro da lógica da Secretária IA; cada caller decide como tratar/formatar).
 */
export async function startProactiveOutreach(
  deps: { prisma: PrismaService; ai: AiService; unofficial: WhatsappUnofficialService },
  params: {
    tenantId: string;
    leadId: string;
    nome: string;
    telefone: string;
    interesse?: string;
    sessionId?: string;
    actorUserId: string;
  },
): Promise<{ ok: true; sessionId: string; eventId: string }> {
  const { prisma, ai, unofficial } = deps;
  const { tenantId, leadId, nome, telefone, interesse, sessionId, actorUserId } = params;

  // 1. Resolve a sessão Light conectada
  const session = sessionId
    ? await prisma.whatsappUnofficialSession.findFirst({
        where: { id: sessionId, tenantId, status: 'CONNECTED' },
        select: { id: true },
      })
    : await prisma.whatsappUnofficialSession.findFirst({
        where: { tenantId, status: 'CONNECTED' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

  if (!session) {
    throw new Error('Nenhuma sessão WhatsApp Light conectada para iniciar o contato.');
  }

  // 2. Valida o número ANTES de chamar a IA — não gasta LLM à toa
  const validation = await unofficial.validateNumbers(session.id, [telefone]);
  if (validation[0]?.noWhatsapp) {
    throw new Error('Este número não possui WhatsApp.');
  }

  // 3. Busca o lead atual (status para o prompt + assignedUserId para não sobrescrever)
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedUserId: true, status: true },
  });
  if (!lead) {
    throw new Error('Lead não encontrado.');
  }

  // 4. Resolve o agente padrão do tenant (pode ser null) e o nome de quem disparou a ação
  const [agent, actor] = await Promise.all([
    ai.findDefaultAgentForTenant(tenantId),
    prisma.user.findUnique({ where: { id: actorUserId }, select: { nome: true } }),
  ]);

  // 5. Gera a mensagem de abertura
  const text = (
    await ai.generateFollowUp({
      nome,
      status: lead.status || 'NOVO',
      tenantId,
      agentId: agent?.id,
      leadId,
      isFirstContactKickoff: true,
      interesse,
      corretorNome: actor?.nome ?? null,
    })
  )?.trim();

  if (!text) {
    throw new Error('IA não conseguiu gerar mensagem de abertura.');
  }

  // 6. Cria o LeadEvent ANTES de enviar — garante histórico mesmo em falha de rede
  const event = await prisma.leadEvent.create({
    data: {
      tenantId,
      leadId,
      channel: 'whatsapp.unofficial.out',
      payloadRaw: {
        text,
        sentBy: actorUserId,
        source: 'proactive_outreach',
        sentAt: new Date().toISOString(),
      },
    },
    select: { id: true },
  });

  // 7. Envia — rollback do evento se falhar
  try {
    await unofficial.sendText(session.id, telefone, text);
  } catch (err) {
    await prisma.leadEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }

  // 8. Fixa o canal da conversa e, se ainda não havia responsável, atribui a quem disparou
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      conversaCanal: 'WHATSAPP_LIGHT',
      conversaSessionId: session.id,
      ...(lead.assignedUserId ? {} : { assignedUserId: actorUserId }),
    },
  });

  return { ok: true, sessionId: session.id, eventId: event.id };
}
