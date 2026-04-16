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

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data?.accessToken) {
      localStorage.setItem("accessToken", data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function clearSession() {
  if (typeof window === "undefined") return;
  if (!window.__loggingOut) {
    window.__loggingOut = true;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
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

  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const isFD = hasBody && isFormDataBody(options.body);

  if (hasBody && !isFD && !("Content-Type" in (headers as any))) {
    (headers as any)["Content-Type"] = "application/json";
  }

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

  // Token expirado — tenta refresh automático (uma vez)
  if (res.status === 401 && typeof window !== "undefined") {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;

      if (newToken) {
        onTokenRefreshed(newToken);
        // Retentar a requisição original com o novo token
        (headers as any)["Authorization"] = `Bearer ${newToken}`;
        const retryRes = await fetch(`${API_URL}${path}`, { ...options, headers });
        const retryText = await retryRes.text();
        const retryData = retryText ? safeJsonParse(retryText) : null;

        if (!retryRes.ok) {
          const msg =
            (retryData && (retryData.message || retryData.error)) ||
            retryText ||
            `Erro na requisição (${retryRes.status})`;
          throw new Error(msg);
        }

        return retryData !== null ? retryData : retryText ? { ok: true, text: retryText } : {};
      } else {
        // Descartar subscribers pendentes antes de redirecionar
        refreshSubscribers = [];
        clearSession();
        throw new Error("Sessão expirada. Faça login novamente.");
      }
    } else {
      // Outra requisição já está fazendo refresh — aguarda
      const newToken = await new Promise<string>((resolve) => {
        refreshSubscribers.push(resolve);
      });
      (headers as any)["Authorization"] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_URL}${path}`, { ...options, headers });
      const retryText = await retryRes.text();
      const retryData = retryText ? safeJsonParse(retryText) : null;

      if (!retryRes.ok) {
        const msg =
          (retryData && (retryData.message || retryData.error)) ||
          retryText ||
          `Erro na requisição (${retryRes.status})`;
        throw new Error(msg);
      }

      return retryData !== null ? retryData : retryText ? { ok: true, text: retryText } : {};
    }
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      text ||
      `Erro na requisição (${res.status})`;
    throw new Error(msg);
  }

  if (data !== null) return data;
  return text ? { ok: true, text } : {};
}
