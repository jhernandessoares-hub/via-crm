"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { correspondentLogin } from "@/lib/correspondente.service";

export default function CorrespondentLoginPage() {
  const router = useRouter();
  const [email,  setEmail]  = useState("");
  const [senha,  setSenha]  = useState("");
  const [error,  setError]  = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, correspondent } = await correspondentLogin(email, senha);
      localStorage.setItem("corrToken", token);
      localStorage.setItem("corrUser",  JSON.stringify(correspondent));
      router.replace("/correspondente/demandas");
    } catch (err: any) {
      setError(err.message ?? "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-white mb-1">Portal do Correspondente</p>
          <p className="text-sm text-slate-400">VIA CRM</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              placeholder="seu@email.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Senha</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
