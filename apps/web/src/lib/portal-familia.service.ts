const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type DemandaTipo =
  | "DUVIDA"
  | "DENUNCIA"
  | "RECLAMACAO"
  | "SUGESTAO"
  | "ACOLHIMENTO"
  | "SOLICITACAO"
  | "ELOGIO"
  | "OUTRO";

export const DEMANDA_TIPO_LABEL: Record<DemandaTipo, string> = {
  DUVIDA: "Dúvida",
  DENUNCIA: "Denúncia",
  RECLAMACAO: "Reclamação",
  SUGESTAO: "Sugestão",
  ACOLHIMENTO: "Acolhimento",
  SOLICITACAO: "Solicitação",
  ELOGIO: "Elogio",
  OUTRO: "Outro",
};

export type PortalDemandaAndamento = {
  id: string;
  texto: string;
  criadoPor?: string | null;
  criadoEm: string;
  anexos: { id: string; url: string; nome: string }[];
};

export type PortalDemanda = {
  id: string;
  numero: number;
  titulo: string;
  tipo: DemandaTipo;
  status: "ABERTA" | "ENCERRADA";
  observacoes?: string | null;
  abertaEm: string;
  encerradaEm?: string | null;
  resolucao?: string | null;
  anexos: { id: string; url: string; nome: string }[];
  andamentos?: PortalDemandaAndamento[];
};

export type PortalFamiliaSession = {
  familia: { numero: number; status: string };
  lead: { nome: string; numero: number | null };
};

function tokenKey(slug: string) {
  return `portalFamiliaToken_${slug}`;
}

export function getPortalToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(tokenKey(slug));
}

export function setPortalToken(slug: string, token: string) {
  if (typeof window !== "undefined") localStorage.setItem(tokenKey(slug), token);
}

export function clearPortalToken(slug: string) {
  if (typeof window !== "undefined") localStorage.removeItem(tokenKey(slug));
}

async function portalFetch(slug: string, path: string, opts?: RequestInit) {
  const token = getPortalToken(slug);
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(opts?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearPortalToken(slug);
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export async function portalLogin(slug: string, cpf: string, telefoneFinal: string) {
  const data = await portalFetch(slug, `/pre-ocupacao-portal/${slug}/login`, {
    method: "POST",
    body: JSON.stringify({ cpf, telefoneFinal }),
  });
  setPortalToken(slug, data.token);
  return data as { token: string; familia: { nome: string; numero: number } };
}

export async function portalLogout(slug: string) {
  try {
    await portalFetch(slug, `/pre-ocupacao-portal/logout`, { method: "POST" });
  } finally {
    clearPortalToken(slug);
  }
}

export async function portalMe(slug: string): Promise<PortalFamiliaSession> {
  return portalFetch(slug, `/pre-ocupacao-portal/me`);
}

export async function portalListarDemandas(slug: string): Promise<PortalDemanda[]> {
  const data = await portalFetch(slug, `/pre-ocupacao-portal/demandas`);
  return Array.isArray(data) ? data : [];
}

export async function portalDetalheDemanda(slug: string, id: string): Promise<PortalDemanda> {
  return portalFetch(slug, `/pre-ocupacao-portal/demandas/${id}`);
}

export async function portalCriarDemanda(
  slug: string,
  body: { tipo: DemandaTipo; tituloPersonalizado?: string; observacoes?: string },
): Promise<PortalDemanda> {
  return portalFetch(slug, `/pre-ocupacao-portal/demandas`, { method: "POST", body: JSON.stringify(body) });
}

export async function portalAdicionarAndamento(slug: string, id: string, texto: string, file?: File | null) {
  const fd = new FormData();
  if (texto) fd.set("texto", texto);
  if (file) fd.set("file", file);
  return portalFetch(slug, `/pre-ocupacao-portal/demandas/${id}/andamentos`, { method: "POST", body: fd });
}
