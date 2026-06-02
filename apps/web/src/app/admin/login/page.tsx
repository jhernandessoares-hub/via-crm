"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const resp = await fetch(`${apiUrl}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.message || "Login invalido");

      localStorage.setItem("adminToken", data.accessToken);
      localStorage.setItem("adminUser", JSON.stringify(data.admin));
      router.push("/admin");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8">
        <div className="flex items-center gap-4">
          <Image
            src="/Novo%20modelo%20de%20Logo.png"
            alt="VIA CRM"
            width={240}
            height={78}
            unoptimized
            className="h-16 w-auto"
          />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">VIA CRM</div>
            <h1 className="mt-1 text-2xl font-bold">Painel Admin</h1>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">E-mail</label>
            <input
              type="email"
              required
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Senha</label>
            <div className="relative mt-1">
              <input
                type={showSenha ? "text" : "password"}
                required
                className="w-full rounded-md border px-3 py-2 pr-9 text-sm"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowSenha((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showSenha ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7c1.06 0 2.08.18 3.03.51M17.5 12a5.5 5.5 0 01-7.07 5.24M3 3l18 18" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-950 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
