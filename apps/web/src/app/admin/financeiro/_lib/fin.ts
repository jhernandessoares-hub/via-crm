import { adminFetch } from "@/lib/admin-api";

// ---------- Tipos ----------

export type FinEntryType = "PAGAR" | "RECEBER";
export type FinEntryStatus = "ABERTO" | "PARCIAL" | "PAGO" | "CANCELADO";
export type FinDocumentType = "CONTRATO" | "NF_EMITIDA" | "NF_RECEBIDA" | "GUIA_IMPOSTO" | "COMPROVANTE" | "BOLETO" | "OUTRO";
export type FinTxStatus = "PENDENTE" | "CONCILIADO" | "IGNORADO";

export interface FinCategoria {
  id: string;
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  parentId: string | null;
  ordem: number;
  sistema: boolean;
  ativo: boolean;
  children: FinCategoria[];
}

export interface FinConta {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  saldoInicial: number;
  saldoInicialData: string;
  ativo: boolean;
  saldoAtual: number;
  companyId: string | null;
}

export type FinPixKeyType = "CPF_CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
export type FinContactBankAccountType = "CORRENTE" | "POUPANCA";

export interface FinContato {
  id: string;
  nome: string;
  documento: string | null;
  tipo: "CLIENTE" | "FORNECEDOR" | "AMBOS";
  observacao: string | null;
  ativo: boolean;
  chavePix: string | null;
  tipoChavePix: FinPixKeyType | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: FinContactBankAccountType | null;
  _count?: { entries: number; documents: number };
}

export const PIX_TIPO_LABEL: Record<FinPixKeyType, string> = {
  CPF_CNPJ: "CPF/CNPJ",
  EMAIL: "E-mail",
  TELEFONE: "Telefone",
  ALEATORIA: "Aleatória",
};

export interface FinEmpresa {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  ativo: boolean;
  _count?: { bankAccounts: number; entries: number; documents: number; contracts: number };
}

export interface FinContrato {
  id: string;
  numero: string | null;
  descricao: string;
  tipo: FinEntryType;
  contactId: string | null;
  contact?: { id: string; nome: string } | null;
  companyId: string | null;
  company?: { id: string; nome: string } | null;
  categoriaId: string | null;
  categoria?: { id: string; nome: string; parent?: { nome: string } | null } | null;
  valorTotal: number | null;
  valorRecorrente: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  observacao: string | null;
  ativo: boolean;
  valorFaturado: number;
  saldoAFaturar: number | null;
  valorRealizado: number;
  valorEmAberto: number;
  _count?: { documents: number; entries: number };
}

export interface FinPayment {
  id: string;
  valor: number;
  desconto: number;
  jurosMulta: number;
  dataPagamento: string;
  bankAccountId: string;
  observacao?: string | null;
  bankTransactionId?: string | null;
}

export interface FinDocumentoResumo {
  id: string;
  tipo: FinDocumentType;
  numero: string | null;
  filename: string;
}

export interface FinEntry {
  id: string;
  tipo: FinEntryType;
  descricao: string;
  categoriaId: string;
  categoria?: { id: string; nome: string; parent?: { nome: string } | null };
  contactId: string | null;
  contact?: {
    id: string;
    nome: string;
    chavePix: string | null;
    tipoChavePix: FinPixKeyType | null;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    tipoConta: FinContactBankAccountType | null;
  } | null;
  tenantId: string | null;
  tenantNome?: string | null;
  companyId: string | null;
  company?: { id: string; nome: string } | null;
  contractId: string | null;
  contract?: { id: string; descricao: string } | null;
  competencia: string;
  vencimento: string;
  valor: number;
  status: FinEntryStatus;
  parcelaNum: number | null;
  parcelaTotal: number | null;
  observacao: string | null;
  recurringRuleId?: string | null;
  payments: FinPayment[];
  documents: FinDocumentoResumo[];
  valorPago: number;
  saldo: number;
  vencido: boolean;
}

export interface FinDocumento {
  id: string;
  tipo: FinDocumentType;
  numero: string | null;
  descricao: string | null;
  valor: number | null;
  dataEmissao: string | null;
  contact?: { id: string; nome: string } | null;
  companyId: string | null;
  company?: { id: string; nome: string } | null;
  contractId: string | null;
  contract?: { id: string; descricao: string } | null;
  filename: string;
  mimeType: string;
  createdAt: string;
  entries: { id: string; tipo: FinEntryType; descricao: string; status: FinEntryStatus; valor: number; vencimento: string }[];
}

export interface FinBankTx {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  fitId: string | null;
  status: FinTxStatus;
  payment?: {
    id: string;
    valor: number;
    dataPagamento: string;
    entry: { id: string; descricao: string; tipo: FinEntryType };
  } | null;
  sugestao?:
    | { kind: "payment"; payment: FinPayment & { entry: { id: string; descricao: string; tipo: FinEntryType; vencimento: string } } }
    | { kind: "entry"; entry: { id: string; descricao: string; tipo: FinEntryType; vencimento: string; valor: number; contactNome: string | null } }
    | null;
}

export interface FinMensalidade {
  tenantId: string;
  nome: string;
  slug: string;
  plan: string;
  tenantAtivo: boolean;
  regra: { id: string; valor: number; diaVencimento: number; ativo: boolean } | null;
}

export interface FinRecorrencia {
  id: string;
  tipo: FinEntryType;
  descricao: string;
  categoriaId: string;
  categoria?: { id: string; nome: string; parent?: { nome: string } | null };
  contact?: { id: string; nome: string } | null;
  tenantId: string | null;
  valor: number;
  diaVencimento: number;
  ativo: boolean;
  _count?: { entries: number };
}

// ---------- API ----------

const BASE = "/admin/financeiro";

export const finApi = {
  categorias: (incluirInativas = false): Promise<FinCategoria[]> =>
    adminFetch(`${BASE}/categorias${incluirInativas ? "?incluirInativas=true" : ""}`),
  contas: (incluirInativas = false): Promise<FinConta[]> =>
    adminFetch(`${BASE}/contas-bancarias${incluirInativas ? "?incluirInativas=true" : ""}`),
  contatos: (incluirInativos = false): Promise<FinContato[]> =>
    adminFetch(`${BASE}/contatos${incluirInativos ? "?incluirInativos=true" : ""}`),
  empresas: (incluirInativas = false): Promise<FinEmpresa[]> =>
    adminFetch(`${BASE}/empresas${incluirInativas ? "?incluirInativas=true" : ""}`),
  contratos: (incluirInativos = false): Promise<FinContrato[]> =>
    adminFetch(`${BASE}/contratos${incluirInativos ? "?incluirInativos=true" : ""}`),
  lancamentos: (params: Record<string, string | number | undefined>): Promise<{
    items: FinEntry[];
    total: number;
    page: number;
    pageSize: number;
    totais: { valor: number; pago: number; saldo: number };
  }> => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return adminFetch(`${BASE}/lancamentos${qs ? `?${qs}` : ""}`);
  },
  documentos: (params: Record<string, string | undefined>): Promise<FinDocumento[]> => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return adminFetch(`${BASE}/documentos${qs ? `?${qs}` : ""}`);
  },
};

// ---------- Labels / estilos compartilhados ----------

export const STATUS_LABEL: Record<FinEntryStatus, string> = {
  ABERTO: "Em aberto",
  PARCIAL: "Parcial",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};

export const STATUS_STYLE: Record<string, string> = {
  ABERTO: "bg-blue-50 text-blue-700 border border-blue-200",
  PARCIAL: "bg-amber-50 text-amber-700 border border-amber-200",
  PAGO: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CANCELADO: "bg-slate-100 text-slate-500 border border-slate-200",
  VENCIDO: "bg-red-50 text-red-700 border border-red-200",
};

export const DOC_TIPO_LABEL: Record<FinDocumentType, string> = {
  CONTRATO: "Contrato",
  NF_EMITIDA: "NF emitida",
  NF_RECEBIDA: "NF recebida",
  GUIA_IMPOSTO: "Guia de imposto",
  COMPROVANTE: "Comprovante",
  BOLETO: "Boleto",
  OUTRO: "Outro",
};

export const DOC_TIPO_STYLE: Record<FinDocumentType, string> = {
  CONTRATO: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  NF_EMITIDA: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  NF_RECEBIDA: "bg-blue-50 text-blue-700 border border-blue-200",
  GUIA_IMPOSTO: "bg-purple-50 text-purple-700 border border-purple-200",
  COMPROVANTE: "bg-teal-50 text-teal-700 border border-teal-200",
  BOLETO: "bg-amber-50 text-amber-700 border border-amber-200",
  OUTRO: "bg-slate-100 text-slate-600 border border-slate-200",
};

/** "2026-07-15" → "15/07/2026" (sem criar Date — evita fuso) */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** "2026-07" → "07/2026" */
export function fmtCompetencia(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : s;
}

/** Data de hoje em "YYYY-MM-DD" (local) */
export function hojeStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mês corrente em "YYYY-MM" */
export function mesAtualStr(): string {
  return hojeStr().slice(0, 7);
}

// Classes padrão do painel admin (slate)
export const cardCls = "rounded-xl border border-slate-200 bg-white";
export const btnPrimary =
  "rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
export const btnSecondary =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50";
export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500/20 placeholder:text-slate-400";
export const selectCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500";
export const thCls = "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
