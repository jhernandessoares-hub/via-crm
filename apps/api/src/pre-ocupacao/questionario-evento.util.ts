import { Logger } from '../logger';

const logger = new Logger('PreOcupacaoQuestionarioEvento');

/** Acontecimentos do envio que aparecem no histórico (botão 🕒 do Acompanhamento). */
export type TipoEventoEnvio =
  | 'SELECIONADO'
  | 'AGENDADO'
  | 'AGENDAMENTO_CANCELADO'
  | 'ENVIADO'
  | 'ENTREGUE'
  | 'FALHA'
  | 'ABRIU'
  | 'CPF_CONFIRMADO'
  | 'COMECOU'
  | 'RESPONDEU'
  | 'LINK_CANCELADO'
  | 'VALIDADE_ALTERADA';

export const EVENTO_ENVIO_LABEL: Record<TipoEventoEnvio, string> = {
  SELECIONADO: 'Selecionado para envio',
  AGENDADO: 'Envio agendado',
  AGENDAMENTO_CANCELADO: 'Agendamento cancelado',
  ENVIADO: 'Mensagem enviada pelo WhatsApp',
  ENTREGUE: 'WhatsApp confirmou a entrega no celular',
  FALHA: 'Falha no envio',
  ABRIU: 'Abriu o link',
  CPF_CONFIRMADO: 'CPF confirmado',
  COMECOU: 'Começou a responder',
  RESPONDEU: 'Respondeu e enviou',
  LINK_CANCELADO: 'Link cancelado',
  VALIDADE_ALTERADA: 'Validade do link alterada',
};

/** Nova abertura do link só entra no histórico depois deste intervalo (recarregar a página não conta). */
export const INTERVALO_NOVA_ABERTURA_MS = 30 * 60 * 1000;

type PrismaEventos = {
  preOcupacaoQuestionarioEnvioEvento: {
    create(args: { data: { envioId: string; tipo: string; em?: Date; detalhe?: string | null; por?: string | null } }): Promise<unknown>;
  };
};

/**
 * Grava um acontecimento no histórico do envio. Falha aqui nunca atrapalha o
 * envio nem a resposta da família (mesmo princípio do `AuditService`).
 */
export async function registrarEventoEnvio(
  prisma: PrismaEventos,
  envioId: string,
  tipo: TipoEventoEnvio,
  detalhe?: string | null,
  por?: string | null,
) {
  try {
    await prisma.preOcupacaoQuestionarioEnvioEvento.create({
      // Relógio da API (o mesmo de enviadoEm, linkAbertoEm...) para a ordem não trocar
      data: { envioId, tipo, em: new Date(), detalhe: detalhe ?? null, por: por ?? null },
    });
  } catch (e: any) {
    logger.warn(`Falha ao registrar evento do envio: envio=${envioId} tipo=${tipo} erro=${e?.message || e}`);
  }
}

function dataHoraBR(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

export type EventoHistorico = { tipo: string; titulo: string; em: Date; detalhe: string | null; por: string | null };

/**
 * Linha do tempo do envio: eventos gravados + etapas dos campos do próprio
 * envio que ainda não estão no histórico (envios anteriores ao histórico só
 * têm a última data de cada etapa). Ordenada da mais antiga para a mais nova.
 */
export function montarHistorico(
  envio: {
    criadoEm: Date;
    enviadoPor: string;
    agendadoPara: Date | null;
    enviadoEm: Date | null;
    enviosCount: number;
    linkAbertoEm: Date | null;
    iniciadoEm: Date | null;
    respondidoEm: Date | null;
  },
  eventos: { tipo: string; em: Date; detalhe: string | null; por: string | null }[],
): EventoHistorico[] {
  const titulo = (tipo: string) => EVENTO_ENVIO_LABEL[tipo as TipoEventoEnvio] ?? tipo;
  const lista: EventoHistorico[] = eventos.map((e) => ({ ...e, titulo: titulo(e.tipo) }));
  const tem = (...tipos: string[]) => eventos.some((e) => tipos.includes(e.tipo));
  const add = (tipo: TipoEventoEnvio, em: Date | null, detalhe: string | null = null, por: string | null = null) => {
    if (em) lista.push({ tipo, titulo: titulo(tipo), em, detalhe, por });
  };

  if (!tem('SELECIONADO', 'AGENDADO')) {
    add(
      envio.agendadoPara ? 'AGENDADO' : 'SELECIONADO',
      // criadoEm vem do relógio do banco: nunca depois do primeiro envio
      envio.enviadoEm && envio.enviadoEm < envio.criadoEm ? envio.enviadoEm : envio.criadoEm,
      envio.agendadoPara ? `Para ${dataHoraBR(envio.agendadoPara)}` : null,
      envio.enviadoPor,
    );
  }
  if (!tem('ENVIADO')) {
    add('ENVIADO', envio.enviadoEm, envio.enviosCount > 1 ? `Último de ${envio.enviosCount} envios` : null);
  }
  if (!tem('ABRIU')) add('ABRIU', envio.linkAbertoEm);
  if (!tem('COMECOU')) add('COMECOU', envio.iniciadoEm);
  if (!tem('RESPONDEU')) add('RESPONDEU', envio.respondidoEm);

  return lista.sort((a, b) => a.em.getTime() - b.em.getTime());
}
