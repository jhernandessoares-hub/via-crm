/** Rótulos de exibição das categorias de sessão do Trabalho Técnico Social. */
export const PRE_OCUPACAO_CATEGORIA_LABEL: Record<string, string> = {
  ORGANIZACAO_CONDOMINIAL: 'Organização Condominial, Governança e Sustentabilidade Financeira',
  EDUCACAO_AMBIENTAL_PATRIMONIAL: 'Educação Ambiental, Patrimonial e Prevenção de Riscos',
  CONVIVENCIA_COMUNITARIA: 'Convivência Comunitária, Identidade Territorial e Adaptação à Verticalização',
  GERACAO_RENDA: 'Geração de Renda, Inclusão Produtiva e Desenvolvimento Territorial',
};

/**
 * Status de acompanhamento da família — calculado, não persistido.
 *
 * Regra (definida no briefing): um participante com status `PENDENTE` em
 * qualquer sessão marca a família como "Com pendência". `FALTOU` não conta.
 * `AGUARDANDO_PREENCHIMENTO`/`CONCLUIDA` também não contam.
 *
 * Nota: hoje nenhum worker transiciona automaticamente
 * `AGUARDANDO_PREENCHIMENTO` → `PENDENTE` após o vencimento de
 * `prazoPreenchimentoDias` — isso ficaria a cargo de um futuro job (fora do
 * escopo desta fase, que é só o CRUD/API do módulo).
 */
export function computeStatusAcompanhamento(
  participantes: { status: string }[],
): 'EM_DIA' | 'COM_PENDENCIA' {
  return participantes.some((p) => p.status === 'PENDENTE') ? 'COM_PENDENCIA' : 'EM_DIA';
}

export function countFaltas(participantes: { status: string }[]): number {
  return participantes.filter((p) => p.status === 'FALTOU').length;
}
