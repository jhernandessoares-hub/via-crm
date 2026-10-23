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
