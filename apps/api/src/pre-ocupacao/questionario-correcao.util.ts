/**
 * "Reenviar para corrigir": a família que já respondeu recebe um link novo, já preenchido,
 * e a nova resposta substitui a anterior (que fica só como histórico).
 */

/** "2ª", "3ª"… */
export const ordinalResposta = (rodada: number) => `${rodada}ª`;

/** Mensagem do WhatsApp quando o questionário é reenviado para correção. */
export function mensagemCorrecao(nome: string, titulo: string, rodada: number, link: string): string {
  return (
    `Olá, ${nome}! Esta é a sua ${ordinalResposta(rodada)} resposta do questionário "${titulo}". ` +
    'Ela vai substituir as respostas que você enviou antes. As respostas anteriores já vêm preenchidas: ' +
    'é só conferir, corrigir o que precisar e enviar de novo.\n\n' +
    `Toque no link: ${link}`
  );
}

/** Agradecimento ao concluir: na correção deixa claro que substituiu a anterior. */
export function mensagemObrigado(nome: string, titulo: string, rodada: number): string {
  return rodada > 1
    ? `Obrigado, ${nome}! Suas respostas do questionário "${titulo}" foram atualizadas e substituem as anteriores.`
    : `Obrigado, ${nome}! Recebemos suas respostas do questionário "${titulo}".`;
}

type RespostaArquivo = {
  perguntaId: string;
  instancia: number;
  valorTexto: string | null;
  valorNumero: number | null;
  valorData: Date | string | null;
  valorOpcoes: string[];
  extras: unknown;
};

/** Cópia das respostas para o histórico (JSON), na mesma forma da tabela de respostas. */
export function copiaDasRespostas(respostas: RespostaArquivo[]): RespostaArquivo[] {
  return respostas.map((r) => ({
    perguntaId: r.perguntaId,
    instancia: r.instancia,
    valorTexto: r.valorTexto,
    valorNumero: r.valorNumero,
    valorData: r.valorData instanceof Date ? r.valorData.toISOString() : r.valorData,
    valorOpcoes: r.valorOpcoes ?? [],
    extras: r.extras ?? null,
  }));
}

/**
 * Na correção, só abre demanda para alerta (sigilo / atendimento reservado) que a família
 * NÃO tinha marcado na resposta anterior — o que já estava marcado já virou demanda.
 * As chaves são "perguntaId|opção".
 */
export function alertasNovos(atuais: string[], anteriores: string[]): string[] {
  const ja = new Set(anteriores);
  return atuais.filter((a) => !ja.has(a));
}
