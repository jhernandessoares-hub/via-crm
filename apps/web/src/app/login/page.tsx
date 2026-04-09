"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL nao configurado");

      const resp = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, email, senha }),
      });

      const j = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(j?.message || "Login invalido");
      }

      const data = j as LoginResp;

      localStorage.setItem("accessToken", data.accessToken);
      if ((data as { refreshToken?: string }).refreshToken) {
        localStorage.setItem("refreshToken", (data as { refreshToken?: string }).refreshToken ?? "");
      }
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-6">
        <div className="flex items-center gap-4">
          <Image
            src="/logo-via.svg"
            alt="VIA CRM"
            width={240}
            height={78}
            className="h-16 w-auto"
          />
          <div>
            <div className="text-xl font-semibold">Entrar</div>
            <div className="mt-1 text-sm text-gray-600">VIA CRM (DEV)</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs text-gray-600">Tenant</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              placeholder="via-crm-dev"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">E-mail</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Senha</label>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="123456"
            />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-950 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center">
            <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
