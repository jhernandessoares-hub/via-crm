/**
 * "Cobrar resposta": lembrete pelo WhatsApp para quem recebeu o questionário e ainda não
 * terminou. SEM link novo: a família usa o link que já recebeu (gerar outro faria o
 * anterior parar de abrir). O texto muda conforme a situação; no máximo 1 cobrança a
 * cada 24h por família.
 */

/** Situações em que dá para cobrar. */
export const SITUACOES_COBRAVEIS = ['RECEBEU', 'ABRIU', 'RESPONDENDO'] as const;
export type SituacaoCobravel = (typeof SITUACOES_COBRAVEIS)[number];

export const INTERVALO_COBRANCA_MS = 24 * 60 * 60 * 1000;

const SE_NAO_ABRIR = 'Se o link não abrir, responda aqui que mandamos outro.';

export function mensagemCobranca(nome: string, titulo: string, situacao: SituacaoCobravel): string {
  switch (situacao) {
    case 'RESPONDENDO':
      return (
        `Olá, ${nome}! Você ainda não finalizou o preenchimento do questionário "${titulo}". ` +
        `Suas respostas já estão salvas: é só tocar no link da mensagem anterior e continuar de onde parou. ${SE_NAO_ABRIR}`
      );
    case 'ABRIU':
      return (
        `Olá, ${nome}! Você abriu o questionário "${titulo}", mas ainda não começou a responder. ` +
        `Leva poucos minutos e ajuda muito a equipe a conhecer sua família. É só tocar no link da mensagem anterior. ${SE_NAO_ABRIR}`
      );
    case 'RECEBEU':
    default:
      return (
        `Olá, ${nome}! Ainda não recebemos suas respostas do questionário "${titulo}". ` +
        `É só tocar no link da mensagem anterior para responder. ${SE_NAO_ABRIR}`
      );
  }
}

/** Libera a cobrança só se a última foi há mais de 24h; devolve quanto falta (em horas, arredondado para cima). */
export function podeCobrar(ultimaCobrancaEm: Date | null | undefined, agora = new Date()): { pode: boolean; faltamHoras: number; haHoras: number } {
  if (!ultimaCobrancaEm) return { pode: true, faltamHoras: 0, haHoras: 0 };
  const passou = agora.getTime() - ultimaCobrancaEm.getTime();
  if (passou >= INTERVALO_COBRANCA_MS) return { pode: true, faltamHoras: 0, haHoras: Math.floor(passou / 3_600_000) };
  return { pode: false, faltamHoras: Math.ceil((INTERVALO_COBRANCA_MS - passou) / 3_600_000), haHoras: Math.floor(passou / 3_600_000) };
}
