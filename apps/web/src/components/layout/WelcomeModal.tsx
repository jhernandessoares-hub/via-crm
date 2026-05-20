"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import {
  ClipboardList,
  CalendarDays,
  Bot,
  Home,
  Users,
  GitBranch,
  Settings,
  MessageCircle,
  Cpu,
  UserCog,
  Sparkles,
} from "lucide-react";

type Role = "OWNER" | "MANAGER" | "AGENT";

type FeatureCard = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const AGENT_FEATURES: FeatureCard[] = [
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Meus Leads",
    description: "Acompanhe e gerencie todos os leads atribuídos a você.",
  },
  {
    icon: <CalendarDays className="h-5 w-5" />,
    title: "Agenda",
    description: "Organize seus compromissos e receba lembretes automáticos.",
  },
  {
    icon: <Bot className="h-5 w-5" />,
    title: "Assistente Virtual",
    description: "Peça ajuda ao seu assistente pessoal via WhatsApp.",
  },
  {
    icon: <Home className="h-5 w-5" />,
    title: "Catalogo de Imoveis",
    description: "Consulte o portfolio completo de produtos disponíveis.",
  },
];

const MANAGER_EXTRA: FeatureCard[] = [
  {
    icon: <Users className="h-5 w-5" />,
    title: "Todos os Leads",
    description: "Visão completa de todos os leads da sua filial.",
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: "Funil de Vendas",
    description: "Acompanhe o pipeline e monitore o progresso das negociações.",
  },
];

const OWNER_EXTRA: FeatureCard[] = [
  {
    icon: <Settings className="h-5 w-5" />,
    title: "Configurações",
    description: "Personalize o CRM de acordo com as necessidades da sua imobiliária.",
  },
  {
    icon: <MessageCircle className="h-5 w-5" />,
    title: "WhatsApp",
    description: "Configure seus canais de comunicação e automações.",
  },
  {
    icon: <Cpu className="h-5 w-5" />,
    title: "Agentes de IA",
    description: "Automatize o atendimento com inteligência artificial.",
  },
  {
    icon: <UserCog className="h-5 w-5" />,
    title: "Equipe",
    description: "Gerencie colaboradores, roles e permissões de acesso.",
  },
];

function getFeatures(role: Role): FeatureCard[] {
  if (role === "OWNER") return [...AGENT_FEATURES, ...MANAGER_EXTRA, ...OWNER_EXTRA];
  if (role === "MANAGER") return [...AGENT_FEATURES, ...MANAGER_EXTRA];
  return AGENT_FEATURES;
}

function getRoleLabel(role: Role): string {
  if (role === "OWNER") return "Proprietário";
  if (role === "MANAGER") return "Gerente";
  return "Corretor";
}

interface Props {
  userName: string;
  tenantNome: string;
  role: Role;
  currentPreferences: Record<string, unknown> | null;
  onDismiss: (updatedPreferences: Record<string, unknown>) => void;
}

export function WelcomeModal({ userName, tenantNome, role, currentPreferences, onDismiss }: Props) {
  const [loading, setLoading] = useState(false);
  const features = getFeatures(role);
  const roleLabel = getRoleLabel(role);
  const firstName = userName.trim().split(" ")[0];

  async function handleStart() {
    setLoading(true);
    const mergedPreferences = { ...(currentPreferences ?? {}), welcomeSeen: true };
    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ preferences: mergedPreferences }),
      });
    } catch {
      // falha silenciosa
    } finally {
      setLoading(false);
      onDismiss(mergedPreferences);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(13, 27, 62, 0.65)" }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl my-8 overflow-hidden"
        style={{
          background: "var(--shell-card-bg)",
          borderColor: "var(--shell-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative px-8 pt-8 pb-6 text-center overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0D1B3E 0%, #1D9E75 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(circle at 20% 50%, #8DC63F 0%, transparent 50%), radial-gradient(circle at 80% 20%, #5DCAA5 0%, transparent 40%)",
            }}
          />
          <div className="relative z-10">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">
              Bem-vindo ao VIA CRM, {firstName}!
            </h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
              {tenantNome}
            </p>
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {roleLabel}
            </div>
          </div>
        </div>
        <div className="px-8 py-6">
          <p className="text-sm text-center mb-6" style={{ color: "var(--shell-subtext)" }}>
            Aqui estão as funcionalidades disponíveis para o seu perfil. Explore cada uma delas para tirar o máximo do sistema.
          </p>
          <div className={`grid gap-3 ${features.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border p-4 flex flex-col gap-2 transition-colors"
                style={{
                  borderColor: "var(--shell-card-border)",
                  background: "var(--shell-bg)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(29,158,117,0.12)",
                    color: "#1D9E75",
                  }}
                >
                  {feature.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>
                    {feature.title}
                  </p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--shell-subtext)" }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button
              size="lg"
              onClick={handleStart}
              loading={loading}
              className="w-full sm:w-auto min-w-[200px]"
            >
              Começar a usar
            </Button>
            <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
              Este painel não aparecerá novamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
