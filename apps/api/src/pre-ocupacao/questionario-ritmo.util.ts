/**
 * Proteção do número de WhatsApp no disparo do questionário: quando o envio
 * começa a falhar em sequência (WhatsApp desconectado, restrição), o disparo
 * pausa e a equipe decide quando retomar. Ritmo (quantas por dia, horário) fica
 * a critério da equipe — o worker só respeita o intervalo entre mensagens.
 */

export const FUSO = 'America/Sao_Paulo';

/** Falhas seguidas (sem ser "número sem WhatsApp") que pausam o disparo. */
export const FALHAS_SEGUIDAS_PARA_PAUSAR = 3;

/** Início do dia de hoje em São Paulo, como instante UTC (para contar os envios do dia). */
export function inicioDoDiaSP(d: Date): Date {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t: string) => +(partes.find((p) => p.type === t)?.value ?? 0);
  const inicio = new Date(d.getTime() - (v('hour') * 60 + v('minute')) * 60_000);
  inicio.setUTCSeconds(0, 0);
  return inicio;
}

/** Falha que é do número da família (não indica problema no nosso WhatsApp): não conta para pausar. */
export function falhaDoNumero(erro: string | undefined): boolean {
  return /não tem whatsapp|não possui telefone|sem telefone|número inválido|sem canal de whatsapp/i.test(erro ?? '');
}
