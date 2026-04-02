"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Role = "OWNER" | "MANAGER" | "AGENT";

type StoredUser = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: Role;
  branchId: string | null;
};

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentGroup = searchParams.get("group");
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    router.push("/login");
  }

  // Link normal — ativo quando pathname bate e não há group param
  const linkClass = (href: string) =>
    `block rounded-md px-3 py-2 text-sm hover:bg-slate-900 ${
      pathname === href && !currentGroup ? "bg-slate-900" : ""
    }`;

  // Subitem do funil — ativo quando pathname=/leads e group bate
  const groupLinkClass = (group: string) =>
    `block rounded-md px-3 py-1.5 text-[13px] text-slate-300 hover:bg-slate-900 hover:text-slate-100 ${
      pathname === "/leads" && currentGroup === group
        ? "bg-slate-900 text-slate-100"
        : ""
    }`;

  const FUNNEL_GROUPS = [
    { label: "Pré-atendimento",     group: "PRE_ATENDIMENTO" },
    { label: "Agendamento",         group: "AGENDAMENTO" },
    { label: "Negociações",          group: "NEGOCIACOES" },
    { label: "Crédito Imobiliário", group: "CREDITO_IMOBILIARIO" },
    { label: "Negócio Fechado",     group: "NEGOCIO_FECHADO" },
    { label: "Pós Venda",           group: "POS_VENDA" },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar escura */}
      <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-lg font-semibold tracking-wide">VIA CRM</div>
          <div className="text-xs text-slate-400 mt-1">Painel administrativo</div>
        </div>

        <nav className="p-3 space-y-1 text-sm">
          <Link className={linkClass("/dashboard")} href="/dashboard">
            Dashboard
          </Link>

          {/* Funil de Venda */}
          <div className="pt-1">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Funil de Venda
            </div>
            <div className="space-y-0.5">
              {FUNNEL_GROUPS.map(({ label, group }) => (
                <Link
                  key={group}
                  href={`/leads?group=${group}`}
                  className={groupLinkClass(group)}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <Link className={linkClass("/products")} href="/products">
            Produtos
          </Link>

          <Link className={linkClass("/central-agentes")} href="/central-agentes">
            Central de Agentes
          </Link>

          <Link className={linkClass("/secretary")} href="/secretary">
            Secretaria
          </Link>

          <Link className={linkClass("/calendar")} href="/calendar">
            Agenda
          </Link>

          <Link className={linkClass("/channels")} href="/channels">
            Canais
          </Link>

          <Link className={linkClass("/settings/bot")} href="/settings/bot">
            Config. IA
          </Link>

          <Link className={linkClass("/settings")} href="/settings">
            Configurações
          </Link>

        </nav>

        <div className="mt-auto p-3 border-t border-slate-800">
          <button
            onClick={logout}
            className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-slate-900"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Área clara */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b flex items-center px-6">
          <div className="text-sm text-gray-600">
            <span className="text-gray-900 font-medium">{title}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <span className="text-xs text-gray-700">
                <b>{user.role}</b> — {user.nome}
              </span>
            ) : null}

            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}