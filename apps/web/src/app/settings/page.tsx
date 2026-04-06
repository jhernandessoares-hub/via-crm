"use client";
import Link from "next/link";
import AppShell from "@/components/AppShell";

export default function SettingsPage() {
  const items = [
    {
      href: "/settings/whatsapp",
      title: "WhatsApp",
      desc: "Configure seu número de WhatsApp Business",
    },
    {
      href: "/settings/bot",
      title: "Config. IA",
      desc: "Configure o comportamento dos agentes de IA",
    },
    {
      href: "/settings/notifications",
      title: "Notificações",
      desc: "Escolha quais eventos e etapas te notificam pelo WhatsApp",
    },
  ];

  return (
    <AppShell title="Configurações">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Configurações</h1>
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="font-medium text-sm">{item.title}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
