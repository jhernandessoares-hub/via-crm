import { SituacaoEnvio, situacaoEnvio } from './questionario-pergunta.util';

/** Rótulos de exibição das categorias de sessão do Trabalho Técnico Social. */
export const PRE_OCUPACAO_CATEGORIA_LABEL: Record<string, string> = {
  REUNIAO_ORIENTACAO: 'Reunião de Informação e Orientação',
  ORGANIZACAO_CONDOMINIAL: 'Organização Condominial, Governança e Sustentabilidade Financeira',
  EDUCACAO_AMBIENTAL_PATRIMONIAL: 'Educação Ambiental, Patrimonial e Prevenção de Riscos',
  CONVIVENCIA_COMUNITARIA: 'Convivência Comunitária, Identidade Territorial e Adaptação à Verticalização',
  GERACAO_RENDA: 'Geração de Renda, Inclusão Produtiva e Desenvolvimento Territorial',
};

export type PendenciaFamilia =
  | { tipo: 'QUESTIONARIO'; id: string; titulo: string; situacao: SituacaoEnvio | 'NAO_ENVIADO' }
  | { tipo: 'FALTA'; id: string; titulo: string; data: Date };

type ParticipacaoPendencia = {
  status: string;
  reposicaoEm?: Date | null;
  atividade: { id: string; titulo: string | null; categoria: string; dataAgendada: Date };
};

type EnvioPendencia = Parameters<typeof situacaoEnvio>[0] & { questionarioId: string };

export type SituacaoPresenca = 'PRESENTE' | 'FALTOU' | 'REPOSICAO' | 'SEM_LANCAMENTO';

export function situacaoPresenca(p: { status: string; reposicaoEm?: Date | null }): SituacaoPresenca {
  if (p.status === 'CONCLUIDA') return 'PRESENTE';
  if (p.status === 'FALTOU') return p.reposicaoEm ? 'REPOSICAO' : 'FALTOU';
  return 'SEM_LANCAMENTO';
}

/** Falta que ainda conta: faltou e não fez a reposição. */
export function faltaEmAberto(p: { status: string; reposicaoEm?: Date | null }): boolean {
  return p.status === 'FALTOU' && !p.reposicaoEm;
}

/**
 * Pendências da família no programa — calculadas na hora, não persistidas.
 *  - QUESTIONARIO: todo questionário PUBLICADO que a família ainda não respondeu,
 *    inclusive o que ainda não foi enviado a ela (encerrado/rascunho não conta);
 *  - FALTA: faltou a uma sessão e ainda não fez a reposição.
 * Só família ATIVA tem pendência.
 */
export function montarPendencias(args: {
  statusFamilia: string;
  participacoes: ParticipacaoPendencia[];
  questionariosPublicados: { id: string; titulo: string }[];
  envios: EnvioPendencia[];
}): PendenciaFamilia[] {
  if (args.statusFamilia !== 'ATIVA') return [];
  const envioPorQuestionario = new Map(args.envios.map((e) => [e.questionarioId, e]));

  const pendencias: PendenciaFamilia[] = [];
  for (const q of args.questionariosPublicados) {
    const envio = envioPorQuestionario.get(q.id);
    const situacao = envio ? situacaoEnvio(envio) : 'NAO_ENVIADO';
    if (situacao !== 'RESPONDEU') pendencias.push({ tipo: 'QUESTIONARIO', id: q.id, titulo: q.titulo, situacao });
  }
  for (const p of args.participacoes) {
    if (!faltaEmAberto(p)) continue;
    pendencias.push({
      tipo: 'FALTA',
      id: p.atividade.id,
      titulo: p.atividade.titulo || PRE_OCUPACAO_CATEGORIA_LABEL[p.atividade.categoria] || p.atividade.categoria,
      data: p.atividade.dataAgendada,
    });
  }
  return pendencias;
}

/** Status de acompanhamento da família: qualquer pendência em aberto tira do "Em dia". */
export function computeStatusAcompanhamento(pendencias: PendenciaFamilia[]): 'EM_DIA' | 'COM_PENDENCIA' {
  return pendencias.length > 0 ? 'COM_PENDENCIA' : 'EM_DIA';
}

/** Total de faltas, com ou sem reposição. */
export function countFaltas(participantes: { status: string }[]): number {
  return participantes.filter((p) => p.status === 'FALTOU').length;
}
