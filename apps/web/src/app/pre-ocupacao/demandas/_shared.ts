import { OCORRENCIA_LOCAL_LABEL } from "../_lib/constants";

export type Anexo = { id: string; url: string; nome: string; mimeType: string | null; criadoEm: string; criadoPor: string | null };
export type Andamento = { id: string; texto: string; criadoEm: string; criadoPor: string | null; anexos?: Anexo[] };

export type Ocorrencia = {
  id: string;
  numero: number;
  titulo: string;
  tipo: string | null;
  local: string | null;
  localDescricao: string | null;
  dataAtendimento: string;
  horario: string | null;
  origem: string;
  status: string;
  avaliacao: string | null;
  observacoes: string | null;
  resolucao: string | null;
  semResposta: boolean;
  criadoPor: string | null;
  abertaEm: string;
  encerradaEm: string | null;
  familiaId: string | null;
  familia: {
    id: string;
    numero: number;
    leadId: string;
    lead: { nome: string; nomeCorreto: string | null; cpf: string | null; numero: number | null; reentradaCount: number | null };
  } | null;
  anexos: Anexo[];
  andamentos?: Andamento[];
};

export function localDisplay(o: Pick<Ocorrencia, "local" | "localDescricao">): string {
  if (!o.local) return "—";
  if (o.local === "OUTRO" && o.localDescricao) return o.localDescricao;
  return OCORRENCIA_LOCAL_LABEL[o.local] ?? o.local;
}

/** Dias em aberto: abertaEm -> encerradaEm (se já encerrada) ou até agora. */
export function diasEmAberto(o: Pick<Ocorrencia, "abertaEm" | "encerradaEm">): number {
  const inicio = new Date(o.abertaEm).getTime();
  const fim = o.encerradaEm ? new Date(o.encerradaEm).getTime() : Date.now();
  return Math.max(0, Math.ceil((fim - inicio) / 86400000));
}
