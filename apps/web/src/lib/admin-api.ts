const API = process.env.NEXT_PUBLIC_API_URL || "";

export async function adminFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `Erro ${res.status}`);
  }
  return json;
}
