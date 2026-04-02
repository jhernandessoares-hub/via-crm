"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
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
      if (!resp.ok) throw new Error(data?.message || "Login inválido");
      localStorage.setItem("adminToken", data.accessToken);
      localStorage.setItem("adminUser", JSON.stringify(data.admin));
      router.push("/admin");
    } catch (e: any) {
      setErr(e?.message || "Erro no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">VIA CRM</div>
          <h1 className="text-2xl font-bold mt-1">Painel Admin</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">E-mail</label>
            <input type="email" required className="mt-1 w-full border rounded-md px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Senha</label>
            <input type="password" required className="mt-1 w-full border rounded-md px-3 py-2 text-sm" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-md bg-slate-950 text-white py-2 text-sm hover:bg-slate-900 disabled:opacity-60">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
