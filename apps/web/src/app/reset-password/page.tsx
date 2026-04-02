"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) {
      setErr("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErr("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL não configurado");

      const resp = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const j = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(j?.message || "Token inválido ou expirado.");
      }

      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (e: any) {
      setErr(e?.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-sm text-red-600 text-center mt-6">
        Link inválido. Solicite um novo link de recuperação.
        <div className="mt-3">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            Senha redefinida com sucesso! Você será redirecionado para o login em instantes.
          </div>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            Ir para o login agora
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">Nova senha</label>
            <input
              type="password"
              required
              minLength={8}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Confirmar senha</label>
            <input
              type="password"
              required
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a nova senha"
            />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-950 text-white py-2 text-sm hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Redefinir senha"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white border p-6">
        <div className="text-xl font-semibold">Redefinir senha</div>
        <div className="text-sm text-gray-600 mt-1">VIA CRM</div>
        <Suspense fallback={<div className="mt-6 text-sm text-gray-500">Carregando...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
