"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LoginResp = {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    tenantId: string;
    nome: string;
    email: string;
    role: "OWNER" | "MANAGER" | "AGENT";
    branchId: string | null;
  };
};

const FEATURES = [
  {
    icon: "💬",
    title: "WhatsApp com IA",
    desc: "Atendimento automático 24h com agentes inteligentes treinados para o seu negócio.",
  },
  {
    icon: "🎯",
    title: "Funil de Vendas Visual",
    desc: "Kanban completo com SLA automático e distribuição de leads por roleta.",
  },
  {
    icon: "🤖",
    title: "Secretária IA",
    desc: "Assistente pessoal por voz e texto que agenda, busca leads e move o funil.",
  },
  {
    icon: "📊",
    title: "Multi-tenant",
    desc: "Plataforma SaaS completa para imobiliárias de todos os tamanhos.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL não configurado");

      const resp = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, email, senha }),
      });

      const j = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(j?.message || "Login inválido");

      const data = j as LoginResp;
      localStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro no login");
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
        {/* Círculos decorativos */}
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #1D9E75, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #5DCAA5, transparent)" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <img
            src="/Novo%20modelo%20de%20Logo.png"
            alt="VIA CRM"
            className="w-48 h-auto"
          />
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-10">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              O CRM imobiliário
              <br />
              <span style={{ color: "#5DCAA5" }}>mais completo</span> do Brasil.
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "#8DA1C9" }}>
              Gerencie leads, automatize o atendimento via WhatsApp com IA e feche
              mais negócios — tudo em um só lugar.
            </p>
          </div>

          {/* Feature list */}
          <div className="grid grid-cols-1 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ background: "rgba(29, 158, 117, 0.15)", border: "1px solid rgba(29, 158, 117, 0.25)" }}
                >
                  {f.icon}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{f.title}</div>
                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8DA1C9" }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs" style={{ color: "#4A5A7A" }}>
          © {new Date().getFullYear()} VIA CRM · Todos os direitos reservados
        </div>
      </div>

      {/* ── Painel direito — Formulário ──────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
        {/* Logo mobile (só aparece em telas pequenas) */}
        <div className="lg:hidden mb-8">
          <img src="/Novo%20modelo%20de%20Logo.png" alt="VIA CRM" className="w-40 h-auto mx-auto" />
        </div>

        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Bem-vindo de volta</h2>
            <p className="text-sm text-gray-500 mt-1">Entre com suas credenciais para continuar</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Tenant */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Identificador da empresa
              </label>
              <input
                name="tenant"
                id="tenant"
                className="w-full h-11 rounded-xl border border-gray-200 px-4 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="ex: minha-imobiliaria"
                autoComplete="off"
              />
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input
                type="email"
                name="email"
                id="email"
                className="w-full h-11 rounded-xl border border-gray-200 px-4 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="username"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#1D9E75" }}
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showSenha ? "text" : "password"}
                  name="senha"
                  id="senha"
                  className="w-full h-11 rounded-xl border border-gray-200 px-4 pr-11 text-sm outline-none transition-all focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/20"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showSenha ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7c1.06 0 2.08.18 3.03.51M17.5 12a5.5 5.5 0 01-7.07 5.24M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
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
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
