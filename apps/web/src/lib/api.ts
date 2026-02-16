const API_URL = process.env.NEXT_PUBLIC_API_URL;

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

  // Só seta Content-Type se tiver body (evita conflito em GET)
  if (options.body && !("Content-Type" in (headers as any))) {
    (headers as any)["Content-Type"] = "application/json";
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

  // Auto logout no 401
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      text ||
      `Erro na requisição (${res.status})`;
    throw new Error(msg);
  }

  return data ?? {};
}
