"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRequirePermission } from "@/lib/permissions";

export default function SettingsPage() {
  const guard = useRequirePermission((can) => can("settings", "view"));
  const [role, setRole] = useState("");

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setRole(user?.role ?? "");
    } catch {}
  }, []);

  const isOwner = role === "OWNER";
  const isManagerOrOwner = role === "OWNER" || role === "MANAGER";

  const items = [
    {
      href: "/settings/uso",
      title: "Uso e Limites",
      desc: "Acompanhe o consumo do seu plano",
      show: isManagerOrOwner,
    },
    {
      href: "/settings/whatsapp",
      title: "WhatsApp",
      desc: "Configure seu número de WhatsApp Business",
      show: isOwner,
    },
    {
      href: "/settings/bot",
      title: "Config. IA",
      desc: "Configure o comportamento dos agentes de IA",
      show: isOwner,
    },
    {
      href: "/settings/notifications",
      title: "Notificações",
      desc: "Escolha quais eventos e etapas te notificam pelo WhatsApp",
      show: true,
    },
    {
      href: "/settings/branding",
      title: "Personalização",
      desc: "Logo, favicon e paleta de cores da sua imobiliária",
      show: isOwner,
    },
  ].filter((i) => i.show);

  if (guard !== "allowed") {
    return (
      <AppShell title="Configurações">
        <div className="max-w-xl mx-auto p-2 text-sm text-[var(--shell-subtext)]">
          {guard === "checking" ? "Carregando..." : "Você não tem permissão para acessar esta área."}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configurações">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-[var(--shell-text)]">Configurações</h1>
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] rounded-lg p-4 hover:bg-[var(--shell-hover)] transition-colors"
            >
              <div className="font-medium text-sm text-[var(--shell-text)]">{item.title}</div>
              <div className="text-xs text-[var(--shell-subtext)] mt-0.5">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
