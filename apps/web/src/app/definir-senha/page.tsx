"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { isPasswordStrong } from "@/lib/password";

function DefinirSenhaForm() {
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
    if (!isPasswordStrong(password)) { setErr("A senha não atende aos requisitos de segurança."); return; }
    if (password !== confirm) { setErr("As senhas não coincidem."); return; }
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
      if (!resp.ok) throw new Error(j?.message || "Convite inválido ou expirado.");
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar senha.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 mt-2">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Convite inválido ou expirado. Peça ao seu administrador para reenviar o convite.
        </div>
        <Link
          href="/login"
          className="flex items-center justify-center w-full h-11 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#1D9E75" }}
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 mt-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <p className="font-semibold mb-1">Senha criada com sucesso!</p>
          <p>Use seu e-mail e o identificador da empresa para entrar. Você será redirecionado para o login em instantes.</p>
        </div>
        <Link
          href="/login"
          className="flex items-center justify-center w-full h-11 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#1D9E75" }}
        >
          Ir para o login agora
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 mt-2">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Senha de acesso</label>
        <input
          type="password"
          required
          className="w-full h-11 rounded-xl border border-gray-200 px-4 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Crie uma senha forte"
          autoComplete="new-password"
        />
        {password && <PasswordStrengthMeter password={password} />}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Confirmar senha</label>
        <input
          type="password"
          required
          className="w-full h-11 rounded-xl border border-gray-200 px-4 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repita a senha"
          autoComplete="new-password"
        />
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
        style={{ background: loading ? "#178862" : "#1D9E75" }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#178862"; }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "#1D9E75"; }}
      >
        {loading ? "Salvando..." : "Criar senha e acessar"}
      </button>
    </form>
  );
}

export default function DefinirSenhaPage() {
  return (
    <div className="min-h-screen flex">

      {/* ── Painel esquerdo — Marketing ─────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0D1B3E 0%, #0a2240 60%, #0D2E1A 100%)" }}
      >
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #1D9E75, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #5DCAA5, transparent)" }}
        />

        <div className="relative z-10">
          <img src="/Novo%20modelo%20de%20Logo.png" alt="VIA CRM" className="w-48 h-auto" />
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Bem-vindo ao
              <br />
              <span style={{ color: "#5DCAA5" }}>VIA CRM.</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "#8DA1C9" }}>
              Crie sua senha de acesso para começar a gerenciar seus leads. Use pelo menos 8 caracteres, combinando letras maiúsculas, minúsculas e números.
            </p>
          </div>

          <div className="flex items-start gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: "rgba(29, 158, 117, 0.15)", border: "1px solid rgba(29, 158, 117, 0.25)" }}
            >
              🔐
            </span>
            <div>
              <div className="text-sm font-semibold text-white">Sua senha é só sua</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8DA1C9" }}>
                Ninguém mais tem acesso à senha que você criar — nem o administrador.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: "rgba(29, 158, 117, 0.15)", border: "1px solid rgba(29, 158, 117, 0.25)" }}
            >
              ✅
            </span>
            <div>
              <div className="text-sm font-semibold text-white">Acesso imediato</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8DA1C9" }}>
                Depois de criar a senha, é só entrar com o identificador da empresa e seu e-mail.
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs" style={{ color: "#4A5A7A" }}>
          © {new Date().getFullYear()} VIA CRM · Todos os direitos reservados
        </div>
      </div>

      {/* ── Painel direito — Formulário ──────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
        <div className="lg:hidden mb-8">
          <img src="/Novo%20modelo%20de%20Logo.png" alt="VIA CRM" className="w-40 h-auto mx-auto" />
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Crie sua senha de acesso</h2>
            <p className="text-sm text-gray-500 mt-1">Defina a senha para acessar sua conta no VIA CRM.</p>
          </div>

          <Suspense fallback={<div className="text-sm text-gray-500">Carregando...</div>}>
            <DefinirSenhaForm />
          </Suspense>

          <div className="text-center mt-6">
            <Link
              href="/login"
              className="text-sm font-medium hover:underline"
              style={{ color: "#1D9E75" }}
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
