/**
 * Regras da Assembleia de Instalação: quórum de instalação e apuração de cada item.
 * 1 voto por unidade (peso 1) — decisão SP9. Funções puras, sem banco.
 */

export type Quorum = 'MAIORIA_PRESENTES' | 'MAIORIA_ABSOLUTA' | 'DOIS_TERCOS';
export type TipoItem = 'APROVACAO' | 'ELEICAO' | 'ESCOLHA';

export const OPCOES_APROVACAO = ['Sim', 'Não', 'Abstenção'];
export const ABSTENCAO = 'Abstenção';

export const QUORUM_LABEL: Record<Quorum, string> = {
  MAIORIA_PRESENTES: 'Maioria dos votos dos presentes',
  MAIORIA_ABSOLUTA: 'Maioria absoluta (mais da metade de todas as unidades)',
  DOIS_TERCOS: '2/3 de todas as unidades',
};

/**
 * Art. 1.352: em 1ª convocação precisa da maioria das unidades presentes; em 2ª
 * convocação (a partir do horário dela) instala com qualquer número.
 */
export function quorumInstalacao(totalUnidades: number, presentes: number, agora: Date, segundaConvocacao: Date) {
  const minimoPrimeira = Math.floor(totalUnidades / 2) + 1;
  const emSegunda = agora >= segundaConvocacao;
  return {
    minimoPrimeira,
    emSegunda,
    instalada: emSegunda ? presentes > 0 : presentes >= minimoPrimeira,
  };
}

/** Votos que o vencedor precisa ter para o item ser aprovado. */
export function votosNecessarios(quorum: Quorum, totalUnidades: number, votosValidos: number): number {
  if (quorum === 'DOIS_TERCOS') return Math.ceil((totalUnidades * 2) / 3);
  if (quorum === 'MAIORIA_ABSOLUTA') return Math.floor(totalUnidades / 2) + 1;
  return Math.floor(votosValidos / 2) + 1;
}

export type ResultadoItem = {
  contagem: { opcao: string; votos: number }[];
  totalVotos: number;
  abstencoes: number;
  votosValidos: number;
  totalUnidades: number;
  presentes: number;
  necessarios: number;
  vencedor: string | null;
  empate: boolean;
  aprovado: boolean;
  resumo: string;
};

/**
 * Apuração de um item. Abstenção conta como presença mas não entra nos votos válidos.
 * - APROVACAO: aprovado quando "Sim" atinge o necessário e supera o "Não".
 * - ELEICAO/ESCOLHA: vence a opção mais votada; empate não elege ninguém.
 */
export function apurarItem(
  item: { tipo: TipoItem; quorum: Quorum; opcoes: string[] },
  votos: string[],
  totalUnidades: number,
  presentes: number,
): ResultadoItem {
  const contagem = item.opcoes.map((opcao) => ({ opcao, votos: votos.filter((v) => v === opcao).length }));
  const abstencoes = votos.filter((v) => v === ABSTENCAO).length;
  const votosValidos = votos.length - abstencoes;
  const necessarios = votosNecessarios(item.quorum, totalUnidades, votosValidos);

  const disputa = contagem.filter((c) => c.opcao !== ABSTENCAO).sort((a, b) => b.votos - a.votos);
  const primeiro = disputa[0];
  const empate = !!primeiro && primeiro.votos > 0 && disputa.length > 1 && disputa[1].votos === primeiro.votos;
  let vencedor: string | null = !primeiro || primeiro.votos === 0 || empate ? null : primeiro.opcao;
  let aprovado: boolean;

  if (item.tipo === 'APROVACAO') {
    const sim = contagem.find((c) => c.opcao === 'Sim')?.votos ?? 0;
    const nao = contagem.find((c) => c.opcao === 'Não')?.votos ?? 0;
    aprovado = sim > nao && sim >= necessarios;
    vencedor = aprovado ? 'Sim' : sim === nao ? null : 'Não';
  } else {
    aprovado = !!vencedor && primeiro.votos >= necessarios;
  }

  const resumo =
    item.tipo === 'APROVACAO'
      ? aprovado
        ? `Aprovado (${contagem[0]?.votos ?? 0} votos a favor; eram necessários ${necessarios}).`
        : `Não aprovado (eram necessários ${necessarios} votos a favor).`
      : empate
        ? 'Empate: nenhuma opção venceu.'
        : aprovado
          ? `${vencedor} (${primeiro.votos} votos; eram necessários ${necessarios}).`
          : `Nenhuma opção atingiu o quórum (eram necessários ${necessarios} votos).`;

  return { contagem, totalVotos: votos.length, abstencoes, votosValidos, totalUnidades, presentes, necessarios, vencedor, empate, aprovado, resumo };
}

/** Lista de opções de um item salvo (Json) — sempre string[]. */
export function opcoesDoItem(tipo: TipoItem, opcoes: unknown): string[] {
  if (tipo === 'APROVACAO') return OPCOES_APROVACAO;
  const lista = Array.isArray(opcoes) ? opcoes.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
  return lista.includes(ABSTENCAO) ? lista : [...lista, ABSTENCAO];
}
