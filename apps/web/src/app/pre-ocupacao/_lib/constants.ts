/**
 * Rótulos de exibição dos enums do módulo Pré-Ocupação (espelho do backend —
 * `apps/api/src/pre-ocupacao/pre-ocupacao-status.util.ts` e schema.prisma).
 * Mantidos aqui em vez de importados porque o frontend não compartilha
 * pacote de tipos com a API.
 */

export const CATEGORIA_LABEL: Record<string, string> = {
  DIAGNOSTICO: "Diagnóstico Social",
  MAPEAMENTO: "Mapeamento Socioeconômico",
  EDUCACAO: "Educação Ambiental e Convívio",
  PLANO_MUDANCA: "Plano de Mudança",
  MONITORAMENTO: "Monitoramento Pós-Mudança",
  GESTAO_DOCUMENTACAO: "Gestão de Documentação",
};

export const CATEGORIA_OPTIONS = Object.entries(CATEGORIA_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const AVALIACAO_LABEL: Record<string, string> = {
  PESSIMO: "Péssimo",
  RUIM: "Ruim",
  BOM: "Bom",
  EXCELENTE: "Excelente",
};

export const AVALIACAO_OPTIONS = Object.entries(AVALIACAO_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const AVALIACAO_EMOJI: Record<string, string> = {
  PESSIMO: "😞",
  RUIM: "😕",
  BOM: "🙂",
  EXCELENTE: "😄",
};

export const PARTICIPANTE_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_PREENCHIMENTO: "Aguardando preenchimento",
  PENDENTE: "Pendente",
  CONCLUIDA: "Concluída",
  FALTOU: "Faltou",
};

export const OCORRENCIA_STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  ENCERRADA: "Encerrada",
};

export const OCORRENCIA_ORIGEM_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  WHATSAPP: "WhatsApp",
  SITE: "Site",
};

export const OCORRENCIA_TIPO_LABEL: Record<string, string> = {
  DUVIDA: "Dúvida",
  DENUNCIA: "Denúncia",
  RECLAMACAO: "Reclamação",
  SUGESTAO: "Sugestão",
  ACOLHIMENTO: "Acolhimento",
  SOLICITACAO: "Solicitação",
  ELOGIO: "Elogio",
  OUTRO: "Outro",
};

export const OCORRENCIA_TIPO_OPTIONS = Object.entries(OCORRENCIA_TIPO_LABEL).map(([value, label]) => ({
  value,
  label,
}));

/** Label do campo de descrição contextual, conforme o tipo escolhido. */
export const OCORRENCIA_TIPO_PERGUNTA: Record<string, string> = {
  DUVIDA: "Qual a dúvida?",
  DENUNCIA: "Qual a denúncia?",
  RECLAMACAO: "Qual a reclamação?",
  SUGESTAO: "Qual a sugestão?",
  ACOLHIMENTO: "Qual o motivo do acolhimento?",
  SOLICITACAO: "Qual a solicitação?",
  ELOGIO: "Conte o elogio",
  OUTRO: "Descreva",
};

export const OCORRENCIA_LOCAL_LABEL: Record<string, string> = {
  PLANTAO: "Plantão",
  ONLINE: "Online",
  OUTRO: "Outro",
};

export const OCORRENCIA_LOCAL_OPTIONS = Object.entries(OCORRENCIA_LOCAL_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const ANEXO_TIPO_LABEL: Record<string, string> = {
  LISTA_PRESENCA: "Lista de presença",
  FOTO: "Foto",
  VIDEO: "Vídeo",
};

export const ENTREGAVEL_STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONSOLIDADO: "Consolidado",
  ENVIADO: "Enviado",
};

export const FAMILIA_STATUS_LABEL: Record<string, string> = {
  ATIVA: "Ativa",
  CONCLUIDA: "Concluída",
  INATIVA: "Inativa",
};

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

export function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR");
}

const MES_LABEL: Record<string, string> = {
  "01": "Janeiro",
  "02": "Fevereiro",
  "03": "Março",
  "04": "Abril",
  "05": "Maio",
  "06": "Junho",
  "07": "Julho",
  "08": "Agosto",
  "09": "Setembro",
  "10": "Outubro",
  "11": "Novembro",
  "12": "Dezembro",
};

/** Formata competência "YYYY-MM" como "Julho/2026". */
export function formatCompetencia(competencia: string | null | undefined): string {
  if (!competencia) return "—";
  const [ano, mes] = competencia.split("-");
  return `${MES_LABEL[mes] ?? mes}/${ano}`;
}

/** Competência (YYYY-MM) do mês atual — usado como default no seletor. */
export function competenciaAtual(): string {
  const now = new Date();
  const mes = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${mes}`;
}
