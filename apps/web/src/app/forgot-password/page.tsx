"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL não configurado");

      await fetch(`${apiUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Sempre mostra confirmação (não revela se email existe)
      setSent(true);
    } catch {
      setErr("Erro ao processar a solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white border p-6">
        <div className="text-xl font-semibold">Recuperar senha</div>
        <div className="text-sm text-gray-600 mt-1">VIA CRM</div>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha em
              breve. Verifique também a pasta de spam.
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-blue-600 hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs text-gray-600">E-mail</label>
              <input
                type="email"
                required
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>

            {err ? <div className="text-sm text-red-600">{err}</div> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-slate-950 text-white py-2 text-sm hover:bg-slate-900 disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-xs text-blue-600 hover:underline">
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
