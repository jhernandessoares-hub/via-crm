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
      setSent(true);
    } catch {
      setErr("Erro ao processar a solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

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
              Recupere o acesso
              <br />
              <span style={{ color: "#5DCAA5" }}>de forma segura.</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "#8DA1C9" }}>
              Enviaremos um link para o seu e-mail cadastrado. O link expira em 1 hora por segurança.
            </p>
          </div>

          <div className="flex items-start gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: "rgba(29, 158, 117, 0.15)", border: "1px solid rgba(29, 158, 117, 0.25)" }}
            >
              🔒
            </span>
            <div>
              <div className="text-sm font-semibold text-white">Processo seguro</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8DA1C9" }}>
                O link de recuperação é único e expira automaticamente após 1 hora.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: "rgba(29, 158, 117, 0.15)", border: "1px solid rgba(29, 158, 117, 0.25)" }}
            >
              📧
            </span>
            <div>
              <div className="text-sm font-semibold text-white">Verifique o spam</div>
              <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8DA1C9" }}>
                Se não encontrar o e-mail na caixa de entrada, confira a pasta de spam ou lixo eletrônico.
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
            <h2 className="text-2xl font-bold text-gray-900">Esqueceu sua senha?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Digite seu e-mail e enviaremos um link para recuperação.
            </p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <p className="font-semibold mb-1">E-mail enviado!</p>
                <p>Se esse endereço estiver cadastrado, você receberá o link em breve. Verifique também a pasta de spam.</p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center w-full h-11 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "#1D9E75" }}
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  required
                  className="w-full h-11 rounded-xl border border-gray-200 px-4 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
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
                {loading ? "Enviando..." : "Enviar link de recuperação"}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm font-medium hover:underline"
                  style={{ color: "#1D9E75" }}
                >
                  Voltar para o login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
