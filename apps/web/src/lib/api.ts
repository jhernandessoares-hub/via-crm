const API_URL = process.env.NEXT_PUBLIC_API_URL;

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isFormDataBody(body: any): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL não configurado no .env.local");
  }

  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  // ✅ Só seta Content-Type automaticamente se:
  // - tem body
  // - e NÃO é FormData (upload)
  // - e o caller não setou Content-Type manualmente
  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const isFD = hasBody && isFormDataBody(options.body);

  if (hasBody && !isFD && !("Content-Type" in (headers as any))) {
    (headers as any)["Content-Type"] = "application/json";
  }

  // ✅ Se for FormData e alguém setou Content-Type na mão, removemos
  // (senão quebra o boundary)
  if (isFD && "Content-Type" in (headers as any)) {
    delete (headers as any)["Content-Type"];
  }

  if (token) {
    (headers as any)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  // Auto logout no 401 (guard contra múltiplos redirects simultâneos)
  if (res.status === 401 && typeof window !== "undefined") {
    if (!window.__loggingOut) {
      window.__loggingOut = true;
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      text ||
      `Erro na requisição (${res.status})`;
    throw new Error(msg);
  }

  // ✅ Se veio JSON, retorna JSON. Se não veio, retorna texto (ou objeto vazio).
  // Isso evita "Unexpected token -" quando o body/response não é JSON.
  if (data !== null) return data;

  // Para respostas OK que não são JSON (raras), retorna um objeto simples
  // (mantém compatibilidade com chamadas existentes)
  return text ? { ok: true, text } : {};
}