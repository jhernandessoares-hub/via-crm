import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { registrarEventoEnvio } from './questionario-evento.util';

const logger = new Logger('PreOcupacaoQuestionarioEntrega');

/**
 * Aviso do WhatsApp sobre uma mensagem enviada (Light: messages.update;
 * Oficial: statuses do webhook), aplicado ao envio do questionário que tem
 * esse id de mensagem. Mensagem que não é de questionário: não faz nada.
 *
 * - ENTREGUE: grava entregueEm (a família só conta como "Recebeu" a partir daqui).
 *   Se antes tinha chegado um aviso de erro, o envio volta a ENVIADO.
 * - ERRO: o WhatsApp recusou a entrega → FALHA, só se a família ainda não abriu o link.
 *
 * Nunca lança: roda dentro dos listeners de mensagem, que não podem quebrar.
 */
export async function registrarAvisoEntregaQuestionario(
  prisma: PrismaService,
  waMessageId: string,
  aviso: 'ENTREGUE' | 'ERRO',
  detalhe?: string | null,
) {
  try {
    const envios = await prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: { waMessageId },
      select: { id: true, entregueEm: true, statusEnvio: true, entregaErro: true, linkAbertoEm: true, respondidoEm: true },
    });
    for (const e of envios) {
      if (aviso === 'ENTREGUE') {
        if (e.entregueEm) continue;
        const desfazErro = e.statusEnvio === 'FALHA' && !!e.entregaErro;
        await prisma.preOcupacaoQuestionarioEnvio.update({
          where: { id: e.id },
          data: {
            entregueEm: new Date(),
            ...(desfazErro ? { statusEnvio: 'ENVIADO', entregaErro: null, ultimoEnvioErro: null } : {}),
          },
        });
        await registrarEventoEnvio(prisma, e.id, 'ENTREGUE', detalhe ?? null);
      } else {
        if (e.entregueEm || e.linkAbertoEm || e.respondidoEm || e.statusEnvio !== 'ENVIADO') continue;
        const erro = `WhatsApp recusou a entrega${detalhe ? `: ${detalhe}` : ''}`.slice(0, 500);
        await prisma.preOcupacaoQuestionarioEnvio.update({
          where: { id: e.id },
          data: { statusEnvio: 'FALHA', entregaErro: erro, ultimoEnvioErro: erro },
        });
        await registrarEventoEnvio(prisma, e.id, 'FALHA', erro);
      }
    }
  } catch (e: any) {
    logger.warn(`Falha ao registrar aviso de entrega: msg=${waMessageId} aviso=${aviso} erro=${e?.message || e}`);
  }
}

const LINK_QUESTIONARIO_RE = /\/portal\/questionario\/([0-9a-f]{64})/i;

type EventoSaida = { id: string; leadId: string; channel: string; sourceRef: string | null; criadoEm: Date; payloadRaw: unknown };

function textoDoEvento(payload: any): string {
  const t = payload?.text;
  return [typeof t === 'string' ? t : t?.body, payload?.message, payload?.body].filter((x) => typeof x === 'string').join('\n');
}

/**
 * Acha, na conversa do lead (WhatsApp Light ou Oficial), a mensagem que levou o
 * link deste envio: pelo id da mensagem quando o envio já guardou, senão pelo
 * token do link (o hash tem que bater com o tokenHash atual — reenvio troca o token).
 */
export function acharMensagemDoEnvio(
  envio: { leadId: string; tokenHash: string | null; waMessageId: string | null },
  eventos: EventoSaida[],
  hash: (token: string) => string,
): EventoSaida | null {
  const doLead = eventos.filter((e) => e.leadId === envio.leadId);
  if (envio.waMessageId) {
    const id = envio.waMessageId;
    return doLead.find((e) => e.sourceRef === id || (e.payloadRaw as any)?.messageId === id) ?? null;
  }
  if (!envio.tokenHash) return null;
  return (
    doLead.find((e) => {
      const token = LINK_QUESTIONARIO_RE.exec(textoDoEvento(e.payloadRaw))?.[1];
      return !!token && hash(token) === envio.tokenHash;
    }) ?? null
  );
}

/**
 * "Recebeu" = a família recebeu a mensagem. Envios que ainda esperam a entrega
 * olham a conversa do lead: se a mensagem do link já tem ✓✓ (entregue/lida),
 * grava a entrega. Corrige os envios feitos antes do aviso de entrega existir e
 * qualquer aviso que se perdeu. Idempotente e nunca lança.
 */
export async function conferirEntregaPelaConversa(
  prisma: PrismaService,
  tenantId: string,
  questionarioId: string,
  hash: (token: string) => string,
) {
  try {
    const pendentes = await prisma.preOcupacaoQuestionarioEnvio.findMany({
      where: {
        questionarioId,
        tenantId,
        teste: false,
        statusEnvio: 'ENVIADO',
        entregueEm: null,
        linkAbertoEm: null,
        respondidoEm: null,
        enviadoEm: { not: null },
      },
      select: { id: true, tokenHash: true, waMessageId: true, canalEnvio: true, enviadoEm: true, familia: { select: { leadId: true } } },
    });
    const comLead = pendentes.filter((p) => p.familia && p.enviadoEm);
    if (!comLead.length) return;

    const desde = new Date(Math.min(...comLead.map((p) => p.enviadoEm!.getTime())) - 5 * 60 * 1000);
    const eventos = await prisma.leadEvent.findMany({
      where: {
        tenantId,
        channel: { in: ['whatsapp.unofficial.out', 'whatsapp.out'] },
        leadId: { in: Array.from(new Set(comLead.map((p) => p.familia!.leadId))) },
        criadoEm: { gte: desde },
      },
      select: { id: true, leadId: true, channel: true, sourceRef: true, criadoEm: true, payloadRaw: true },
    });

    for (const p of comLead) {
      const ev = acharMensagemDoEnvio({ leadId: p.familia!.leadId, tokenHash: p.tokenHash, waMessageId: p.waMessageId }, eventos, hash);
      if (!ev) continue;
      const payload = ev.payloadRaw as any;
      // Saiu pelo WhatsApp Oficial: o aviso de entrega dele nunca foi guardado na
      // conversa. Só registra o canal, para a tela mostrar e a equipe reenviar pelo Light.
      if (ev.channel === 'whatsapp.out') {
        if (p.canalEnvio === 'WHATSAPP_OFICIAL') continue;
        await prisma.preOcupacaoQuestionarioEnvio.update({
          where: { id: p.id },
          data: { canalEnvio: 'WHATSAPP_OFICIAL', ...(!p.waMessageId && payload?.messageId ? { waMessageId: String(payload.messageId) } : {}) },
        });
        continue;
      }
      const entregue = payload?.waMessageStatus === 'DELIVERED' || payload?.waMessageStatus === 'READ';
      if (!entregue && p.waMessageId) continue; // já ligado e sem ✓✓ ainda: nada a fazer
      const entregueEm = entregue ? (payload?.waMessageStatusAt ? new Date(payload.waMessageStatusAt) : ev.criadoEm) : null;
      await prisma.preOcupacaoQuestionarioEnvio.update({
        where: { id: p.id },
        data: {
          ...(!p.waMessageId && ev.sourceRef ? { waMessageId: ev.sourceRef } : {}),
          ...(!p.canalEnvio ? { canalEnvio: 'WHATSAPP_LIGHT' } : {}),
          ...(entregueEm ? { entregueEm } : {}),
        },
      });
      if (entregueEm) await registrarEventoEnvio(prisma, p.id, 'ENTREGUE', 'Confirmação lida da conversa do lead');
    }
  } catch (e: any) {
    logger.warn(`Falha ao conferir entrega pela conversa: questionario=${questionarioId} erro=${e?.message || e}`);
  }
}
