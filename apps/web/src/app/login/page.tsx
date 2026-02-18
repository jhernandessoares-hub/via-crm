"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LoginResp = {
  accessToken: string;
  user: {
    id: string;
    tenantId: string;
    nome: string;
    email: string;
    role: "OWNER" | "MANAGER" | "AGENT";
    branchId: string | null;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState("via-crm-dev");
  const [email, setEmail] = useState("jhernandes_soares@hotmail.com");
  const [senha, setSenha] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const resp = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ backend aceita tenantId (slug ou uuid) e senha/password
        body: JSON.stringify({ tenantId: tenant, email, senha }),
      });

      const j = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(j?.message || "Login inválido");
      }

      const data = j as LoginResp;

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Erro no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white border p-6">
        <div className="text-xl font-semibold">Entrar</div>
        <div className="text-sm text-gray-600 mt-1">VIA CRM (DEV)</div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs text-gray-600">Tenant</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="via-crm-dev"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">E-mail</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Senha</label>
            <input
              type="password"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="123456"
            />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-950 text-white py-2 text-sm hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
