/** Rótulos e tipos do módulo de Questionários (espelho do backend). */

export type PerguntaTipo =
  | "INFO"
  | "ACEITE"
  | "CPF"
  | "CONTADOR"
  | "MOEDA"
  | "TELEFONE"
  | "CAMPOS"
  | "ESCOLHA_UNICA"
  | "ESCOLHA_MULTIPLA"
  | "TEXTO_CURTO"
  | "TEXTO_LONGO"
  | "ESCALA"
  | "NUMERO"
  | "DATA";

export const PERGUNTA_TIPO_LABEL: Record<PerguntaTipo, string> = {
  ESCOLHA_UNICA: "Escolha única",
  ESCOLHA_MULTIPLA: "Múltipla escolha",
  TEXTO_CURTO: "Texto curto",
  TEXTO_LONGO: "Texto longo",
  ESCALA: "Nota / escala",
  NUMERO: "Número",
  DATA: "Data",
  INFO: "Tela de leitura",
  ACEITE: "Concordância (LGPD)",
  CPF: "CPF (confere com o cadastro)",
  CONTADOR: "Contador (− / +)",
  MOEDA: "Valor em R$",
  TELEFONE: "Telefone",
  CAMPOS: "Vários campos",
};

/** Tipos que o editor simples não configura (vêm da carga do questionário). */
export const TIPOS_AVANCADOS: PerguntaTipo[] = ["INFO", "ACEITE", "CPF", "CONTADOR", "MOEDA", "TELEFONE", "CAMPOS"];

export type OpcaoRica = { label: string; complemento?: "TEXTO" | "VALOR"; rotuloComplemento?: string; exclusiva?: boolean; numero?: number; alerta?: string };

export function opcaoLabel(o: string | OpcaoRica): string {
  return typeof o === "string" ? o : o.label;
}

export const QUESTIONARIO_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADO: "Publicado",
  ENCERRADO: "Encerrado",
};

export const QUESTIONARIO_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning"> = {
  RASCUNHO: "warning",
  PUBLICADO: "success",
  ENCERRADO: "neutral",
};

export type Situacao = "AGENDADO" | "AGUARDANDO_ENVIO" | "FALHA" | "RECEBEU" | "ABRIU" | "RESPONDENDO" | "RESPONDEU";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  AGENDADO: "Agendado",
  AGUARDANDO_ENVIO: "Na fila de envio",
  FALHA: "Envio falhou",
  RECEBEU: "Recebeu",
  ABRIU: "Abriu o link",
  RESPONDENDO: "Respondendo",
  RESPONDEU: "Respondeu",
};

export const SITUACAO_VARIANT: Record<Situacao, "neutral" | "error" | "info" | "indigo" | "success" | "warning"> = {
  AGENDADO: "warning",
  AGUARDANDO_ENVIO: "neutral",
  FALHA: "error",
  RECEBEU: "info",
  ABRIU: "indigo",
  RESPONDENDO: "warning",
  RESPONDEU: "success",
};

export type Pergunta = {
  id?: string;
  enunciado: string;
  tipo: PerguntaTipo;
  opcoes?: (string | OpcaoRica)[] | null;
  chave?: string | null;
  config?: Record<string, any> | null;
  escalaMin?: number | null;
  escalaMax?: number | null;
  obrigatoria: boolean;
};

export type Questionario = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: "RASCUNHO" | "PUBLICADO" | "ENCERRADO";
  mensagemEnvio: string;
  validadeDias: number;
  criadoPor: string;
  criadoEm: string;
  publicadoEm: string | null;
  encerradoEm: string | null;
  perguntas: Pergunta[];
  totalEnvios: number;
};

export function csvEscape(v: string): string {
  return `"${(v ?? "").replace(/"/g, '""')}"`;
}

/** Baixa um CSV (separador ";", BOM UTF-8 pro Excel abrir com acento). */
export function baixarCsv(nomeArquivo: string, linhas: string[][]) {
  const conteudo = "﻿" + linhas.map((l) => l.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugArquivo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
