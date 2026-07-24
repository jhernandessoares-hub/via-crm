import { apiFetch } from "./api";

// ============ Tipos ============

export type AtividadeStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
export type EntregaveisStatus = "PENDENTE" | "ENTREGUE" | "ACEITO";
export type NfStatus = "PENDENTE" | "EMITIDA";
export type PagamentoStatus = "PENDENTE" | "RECEBIDO";
export type IndicadorSituacao =
  | "NAO_INICIADO"
  | "EM_ANDAMENTO"
  | "ATINGIDO"
  | "PARCIALMENTE_ATINGIDO"
  | "NAO_ATINGIDO";

export type TtsAtividade = {
  id: string;
  ordem: number;
  titulo: string;
  eixo: string;
  indicadorQid: string | null;
  prazoLimite: string | null; // ISO
  responsavel: string | null;
  status: AtividadeStatus;
  observacoes: string | null;
};

export type TtsParcela = {
  id: string;
  numero: number;
  competencia: string; // "YYYY-MM"
  entregaveisAte: string | null;
  aceiteAte: string | null;
  nfEm: string | null;
  receberAte: string | null;
  valor: number;
  entregaveisStatus: EntregaveisStatus;
  nfStatus: NfStatus;
  pagamentoStatus: PagamentoStatus;
  observacoes: string | null;
};

export type TtsIndicador = {
  id: string;
  numero: number;
  atividade: string;
  meta: string;
  metaPercentual: number | null;
  pesoPercentual: number;
  situacao: IndicadorSituacao;
  evidencias: string | null;
};

export type PlanejamentoTtsData = {
  atividades: TtsAtividade[];
  parcelas: TtsParcela[];
  indicadores: TtsIndicador[];
};

// ============ API ============

// Prisma Decimal chega serializado como string no JSON — normaliza para number.
function normalizeParcela(p: any): TtsParcela {
  return { ...p, valor: Number(p.valor) };
}
function normalizeIndicador(i: any): TtsIndicador {
  return {
    ...i,
    metaPercentual: i.metaPercentual == null ? null : Number(i.metaPercentual),
    pesoPercentual: Number(i.pesoPercentual),
  };
}

export async function getPlanejamentoTts(): Promise<PlanejamentoTtsData> {
  const data = await apiFetch("/planejamento-tts");
  return {
    atividades: data?.atividades ?? [],
    parcelas: (data?.parcelas ?? []).map(normalizeParcela),
    indicadores: (data?.indicadores ?? []).map(normalizeIndicador),
  };
}

export async function updateTtsAtividade(
  id: string,
  patch: Partial<Pick<TtsAtividade, "status" | "responsavel" | "observacoes"> & { prazoLimite: string }>,
): Promise<TtsAtividade> {
  return apiFetch(`/planejamento-tts/atividades/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function updateTtsParcela(
  id: string,
  patch: Partial<Pick<TtsParcela, "entregaveisStatus" | "nfStatus" | "pagamentoStatus" | "observacoes">>,
): Promise<TtsParcela> {
  const p = await apiFetch(`/planejamento-tts/parcelas/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return normalizeParcela(p);
}

export async function updateTtsIndicador(
  id: string,
  patch: Partial<Pick<TtsIndicador, "situacao" | "evidencias">>,
): Promise<TtsIndicador> {
  const i = await apiFetch(`/planejamento-tts/indicadores/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return normalizeIndicador(i);
}
