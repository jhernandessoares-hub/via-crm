const API = process.env.NEXT_PUBLIC_API_URL || "";

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  // FormData: o browser define o Content-Type com boundary — não sobrescrever
  const hasBody = typeof init.body !== "undefined" && init.body !== null;
  const isFD = hasBody && isFormDataBody(init.body);
  if (hasBody && !isFD && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  if (!hasBody && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  if (isFD && "Content-Type" in headers) {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `Erro ${res.status}`);
  }
  return json;
}
