const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type CreditStatus = "EM_ANALISE" | "COM_PENDENCIA" | "APROVADO" | "REPROVADO" | "CONDICIONADO";

export const CREDIT_STATUS_LABEL: Record<CreditStatus, string> = {
  EM_ANALISE:    "Em Análise",
  COM_PENDENCIA: "Com Pendência",
  APROVADO:      "Aprovado",
  REPROVADO:     "Reprovado",
  CONDICIONADO:  "Condicionado",
};

export const CREDIT_STATUS_COLOR: Record<CreditStatus, string> = {
  EM_ANALISE:    "#f59e0b",
  COM_PENDENCIA: "#8b5cf6",
  APROVADO:      "#22c55e",
  REPROVADO:     "#ef4444",
  CONDICIONADO:  "#3b82f6",
};

export type Correspondent = {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  empresa?: string | null;
  creci?: string | null;
  ativo: boolean;
};

export type CreditRequest = {
  id: string;
  tenantId: string;
  leadId: string;
  correspondentId: string;
  valorImovel?: number | null;
  valorCredito?: number | null;
  rendaMensal?: number | null;
  tipoFinanciamento?: string | null;
  observacoes?: string | null;
  status: CreditStatus;
  parecer?: string | null;
  respondedAt?: string | null;
  createdAt: string;
  correspondent: { id: string; nome: string; email: string; empresa?: string | null; telefone?: string | null };
  lead?: { id: string; nome: string; nomeCorreto?: string | null; telefone?: string | null; email?: string | null; rendaBrutaFamiliar?: number | null };
  tenant?: { id: string; nome: string };
};

// ── Tenant helpers ────────────────────────────────────────────────────────────

import { apiFetch } from "./api";

export async function listCorrespondents(): Promise<Correspondent[]> {
  const data = await apiFetch("/correspondents");
  return Array.isArray(data) ? data : [];
}

export async function listCreditRequests(leadId: string): Promise<CreditRequest[]> {
  const data = await apiFetch(`/leads/${leadId}/credit-requests`);
  return Array.isArray(data) ? data : [];
}

export async function createCreditRequest(leadId: string, body: Partial<CreditRequest> & { correspondentId: string }): Promise<CreditRequest> {
  return apiFetch(`/leads/${leadId}/credit-requests`, { method: "POST", body: JSON.stringify(body) });
}

export async function cancelCreditRequest(leadId: string, requestId: string): Promise<void> {
  await apiFetch(`/leads/${leadId}/credit-requests/${requestId}`, { method: "DELETE" });
}

// ── Correspondent portal helpers (uses own token) ─────────────────────────────

function corrFetch(path: string, opts?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("corrToken") : null;
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message ?? r.statusText); }
    return r.json();
  });
}

export async function correspondentLogin(email: string, senha: string) {
  return corrFetch("/correspondent/auth/login", { method: "POST", body: JSON.stringify({ email, senha }) });
}

export async function correspondentMe() {
  return corrFetch("/correspondent/auth/me");
}

export async function listMyDemands(): Promise<CreditRequest[]> {
  const data = await corrFetch("/correspondent/demands");
  return Array.isArray(data) ? data : [];
}

export async function getDemand(id: string): Promise<CreditRequest> {
  return corrFetch(`/correspondent/demands/${id}`);
}

export async function updateDemandStatus(id: string, body: { status: CreditStatus; parecer?: string }): Promise<CreditRequest> {
  return corrFetch(`/correspondent/demands/${id}/status`, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

import { adminFetch } from "./admin-api";

export async function adminListCorrespondents(): Promise<Correspondent[]> {
  const data = await adminFetch("/admin/correspondents");
  return Array.isArray(data) ? data : [];
}

export async function adminCreateCorrespondent(body: Partial<Correspondent> & { senha: string }): Promise<Correspondent> {
  return adminFetch("/admin/correspondents", { method: "POST", body: JSON.stringify(body) });
}

export async function adminUpdateCorrespondent(id: string, body: Partial<Correspondent> & { senha?: string }): Promise<Correspondent> {
  return adminFetch(`/admin/correspondents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function adminDeleteCorrespondent(id: string): Promise<void> {
  await adminFetch(`/admin/correspondents/${id}`, { method: "DELETE" });
}
