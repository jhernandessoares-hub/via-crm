"use client";

import { useState } from "react";
import {
  Sparkles,
  ClipboardList,
  Calendar,
  Bot,
  Home,
  Users,
  TrendingUp,
  Settings,
  MessageSquare,
  Brain,
  Building2,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { FullProfile } from "@/components/layout/MeusDadosModal";

type Role = "OWNER" | "MANAGER" | "AGENT" | "PARTNER";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
  PARTNER: "Parceiro",
};

const ROLE_COLOR: Record<Role, string> = {
  OWNER:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  MANAGER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  AGENT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PARTNER: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

type Card = { icon: React.ReactNode; title: string; description: string };

function getCards(role: Role): Card[] {
  const agent: Card[] = [
    {
      icon: <ClipboardList className="w-6 h-6 text-blue-600" />,
      title: "Meus Leads",
      description: "Acompanhe os contatos atribuídos a você",
    },
    {
      icon: <Calendar className="w-6 h-6 text-emerald-600" />,
      title: "Agenda",
      description: "Gerencie seus compromissos e lembretes",
    },
    {
      icon: <Bot className="w-6 h-6 text-violet-600" />,
      title: "Assistente Virtual",
      description: "Peça ajuda à secretária IA pelo WhatsApp",
    },
    {
      icon: <Home className="w-6 h-6 text-orange-600" />,
      title: "Catálogo de Imóveis",
      description: "Consulte o portfólio completo de produtos",
    },
  ];

  const manager: Card[] = [
    ...agent,
    {
      icon: <Users className="w-6 h-6 text-sky-600" />,
      title: "Todos os Leads",
      description: "Visão completa dos leads da filial",
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-pink-600" />,
      title: "Funil de Vendas",
      description: "Acompanhe o pipeline da sua equipe",
    },
  ];

  const owner: Card[] = [
    ...manager,
    {
      icon: <MessageSquare className="w-6 h-6 text-green-600" />,
      title: "WhatsApp",
      description: "Configure seus canais de atendimento",
    },
    {
      icon: <Brain className="w-6 h-6 text-indigo-600" />,
      title: "Agentes de IA",
      description: "Automatize o atendimento com inteligência artificial",
    },
    {
      icon: <Building2 className="w-6 h-6 text-amber-600" />,
      title: "Empreendimentos",
      description: "Gerencie lançamentos, torres e espelho de vendas",
    },
    {
      icon: <Settings className="w-6 h-6 text-slate-600" />,
      title: "Configurações",
      description: "Personalize permissões, equipe e integrações",
    },
  ];

  const partner: Card[] = [
    {
      icon: <ClipboardList className="w-6 h-6 text-blue-600" />,
      title: "Meus Leads",
      description: "Acompanhe os contatos que você indicou",
    },
    {
      icon: <Home className="w-6 h-6 text-orange-600" />,
      title: "Catálogo de Imóveis",
      description: "Consulte o portfólio completo de produtos",
    },
  ];

  if (role === "AGENT") return agent;
  if (role === "MANAGER") return manager;
  if (role === "PARTNER") return partner;
  return owner;
}

interface Props {
  profile: FullProfile;
  showWelcome: boolean;
  showLgpd: boolean;
  onDismiss: (updates: { welcomeSeen?: boolean; lgpdAccepted?: boolean }) => void;
}

export function WelcomeModal({ profile, showWelcome, showLgpd, onDismiss }: Props) {
  const [step, setStep] = useState<1 | 2>(showWelcome ? 1 : 2);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [lgpdChecked, setLgpdChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const role = profile.role as Role;
  const firstName =
    profile.apelido?.trim() || profile.nome.split(" ")[0] || "Bem-vindo";
  const cards = getCards(role);
  const cols =
    role === "OWNER" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";

  async function finish(acceptedLgpd: boolean) {
    setLoading(true);
    const updates: { welcomeSeen?: boolean; lgpdAccepted?: boolean } = {};
    if (dontShowAgain) updates.welcomeSeen = true;
    if (acceptedLgpd) updates.lgpdAccepted = true;

    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: { ...profile.preferences, ...updates },
        }),
      });
    } catch {
      // falha silenciosa — não bloqueia o usuário
    }
    setLoading(false);
    onDismiss(updates);
  }

  function handleAdvance() {
    if (showLgpd) {
      setStep(2);
    } else {
      finish(false);
    }
  }

  /* ── STEP 1: Boas-vindas ── */
  if (step === 1) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
          {/* Header gradiente */}
          <div className="relative bg-gradient-to-r from-[#0d1b3e] to-[#1a6b6b] px-8 pt-8 pb-10 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/20 rounded-xl p-2">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Bem-vindo ao</p>
                <h1 className="text-2xl font-bold leading-tight">VIA CRM</h1>
              </div>
            </div>

            <p className="text-white/90 text-lg font-medium">
              Olá, <span className="text-white font-bold">{firstName}</span>! 👋
            </p>
            <p className="text-white/70 text-sm mt-1">
              {profile.tenant?.nome ?? "Sua imobiliária"} está pronta para você.
            </p>

            <span
              className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold ${ROLE_COLOR[role]}`}
            >
              {ROLE_LABEL[role]}
            </span>
          </div>

          {/* Cards de funcionalidades */}
          <div className="px-8 py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Com o seu acesso você pode:
            </p>
            <div className={`grid ${cols} gap-3`}>
              {cards.map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col gap-2 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2 w-fit shadow-sm">
                    {card.icon}
                  </div>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-tight">
                    {card.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded accent-[#0d1b3e] cursor-pointer"
              />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Não mostrar novamente
              </span>
            </label>

            <button
              onClick={handleAdvance}
              disabled={loading}
              className="bg-[#0d1b3e] hover:bg-[#1a2d5a] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {showLgpd ? "Avançar →" : loading ? "Aguarde..." : "Começar →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STEP 2: LGPD ── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d1b3e] to-[#1a3a6b] px-8 pt-7 pb-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 rounded-xl p-2">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wide font-medium">
                Obrigatório
              </p>
              <h2 className="text-xl font-bold">Termos e Privacidade (LGPD)</h2>
            </div>
          </div>
          <p className="text-white/70 text-sm mt-1">
            Leia atentamente antes de continuar.
          </p>
        </div>

        {/* Conteúdo LGPD */}
        <div className="px-8 py-6 max-h-64 overflow-y-auto space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            Em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)</strong>,
            ao utilizar o VIA CRM você concorda com os seguintes termos:
          </p>
          <ul className="space-y-2 list-none">
            {[
              "Os dados de leads e clientes são coletados e armazenados exclusivamente para fins de gestão imobiliária autorizada.",
              "É proibido divulgar, compartilhar ou utilizar dados pessoais de terceiros fora do contexto profissional desta imobiliária.",
              "O acesso às informações do sistema é restrito aos membros autorizados pelo responsável do tenant.",
              "É vedado exportar, copiar ou transmitir dados pessoais para sistemas ou pessoas não autorizadas.",
              "Em caso de desligamento, os dados devem ser tratados como confidenciais e o acesso será revogado.",
              "O descumprimento pode acarretar responsabilidades civis e penais nos termos da LGPD.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lgpdChecked}
              onChange={(e) => setLgpdChecked(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0d1b3e] cursor-pointer mt-0.5 shrink-0"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Li e concordo com os termos de uso e política de privacidade em
              conformidade com a LGPD.
            </span>
          </label>

          <div className="flex items-center justify-between">
            {showWelcome && (
              <button
                onClick={() => setStep(1)}
                className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                ← Voltar
              </button>
            )}
            <div className={showWelcome ? "" : "ml-auto"}>
              <button
                onClick={() => finish(true)}
                disabled={!lgpdChecked || loading}
                className="bg-[#0d1b3e] hover:bg-[#1a2d5a] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Aguarde..." : "Aceitar e começar →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
