"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  User,
  Users,
  Filter,
  ChevronDown,
  Building2,
  Bot,
  UserCog,
  Headphones,
  Calendar,
  Megaphone,
  Settings,
  Shield,
  Globe,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { apiLogout } from "@/lib/api";

type Role = "OWNER" | "MANAGER" | "AGENT";

type Counts = {
  total: number;
  mine: number;
  groups: Record<string, number>;
};

interface SidebarProps {
  role: Role | undefined;
  tenantNome: string | null;
  counts: Counts | null;
}

const FUNNEL_GROUPS = [
  { label: "Pré-atendimento", group: "PRE_ATENDIMENTO" },
  { label: "Agendamento", group: "AGENDAMENTO" },
  { label: "Negociações", group: "NEGOCIACOES" },
  { label: "Crédito Imobiliário", group: "CREDITO_IMOBILIARIO" },
  { label: "Negócio Fechado", group: "NEGOCIO_FECHADO" },
  { label: "Pós Venda", group: "POS_VENDA" },
];

export function Sidebar({ role, tenantNome, counts }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentGroup = searchParams.get("group");
  const router = useRouter();

  const [funnelOpen, setFunnelOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFunnelOpen(localStorage.getItem("sidebar_funnel_open") === "true");
  }, []);

  function toggleFunnel() {
    setFunnelOpen((v) => {
      const next = !v;
      localStorage.setItem("sidebar_funnel_open", String(next));
      return next;
    });
  }

  async function logout() {
    await apiLogout();
    router.push("/login");
  }

  function isActive(href: string, mode: "exact" | "prefix" = "exact"): boolean {
    if (currentGroup) return false;
    if (mode === "exact") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const settingsActive =
    !currentGroup &&
    pathname.startsWith("/settings") &&
    pathname !== "/settings/permissions";

  function NavItem({
    href,
    label,
    icon: Icon,
    badge,
    mode = "exact",
  }: {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
    mode?: "exact" | "prefix";
  }) {
    const active = isActive(href, mode);
    return (
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all"
        style={{
          background: active ? "rgba(29, 158, 117, 0.18)" : "transparent",
          color: active ? "#5DCAA5" : "rgba(255,255,255,0.92)",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = "#142450";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon
          className="h-[18px] w-[18px] shrink-0"
          style={{ color: active ? "#5DCAA5" : "#8DA1C9" }}
        />
        <span className="flex-1 truncate">{label}</span>
        {badge !== undefined && badge !== null && (
          <CountBadge n={badge} active={active} />
        )}
      </Link>
    );
  }

  const funnelTotal = counts
    ? Object.values(counts.groups).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <aside
      className="w-64 shrink-0 flex flex-col border-r"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Logo + tenant */}
      <div
        className="px-5 pt-5 pb-4 border-b"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <Link href="/dashboard" className="block">
          <img
            src="/Novo%20modelo%20de%20Logo.png"
            alt="VIA CRM"
            className="w-[72%] h-auto mx-auto block"
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <NavItem href="/dashboard" label="Dashboard" icon={LayoutDashboard} />
        <NavItem
          href="/meus-leads"
          label="Meus Leads"
          icon={User}
          badge={counts?.mine}
        />
        {role !== "AGENT" && (
          <NavItem
            href="/pipeline"
            label="Todos os Leads"
            icon={Users}
            badge={counts?.total}
          />
        )}

        {/* Funil colapsável */}
        <div className="pt-1">
          <button
            type="button"
            onClick={toggleFunnel}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.92)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#142450")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            aria-expanded={funnelOpen}
          >
            <Filter
              className="h-[18px] w-[18px] shrink-0"
              style={{ color: "#8DA1C9" }}
            />
            <span className="flex-1 text-left">Funil de Venda</span>
            {funnelTotal !== undefined && (
              <CountBadge n={funnelTotal} active={false} />
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                funnelOpen ? "rotate-180" : ""
              }`}
              style={{ color: "#8DA1C9" }}
            />
          </button>
          {funnelOpen && (
            <div
              className="mt-1 ml-3 space-y-0.5 border-l pl-3"
              style={{ borderColor: "rgba(26, 42, 85, 0.6)" }}
            >
              {FUNNEL_GROUPS.map(({ label, group }) => {
                const active = pathname === "/leads" && currentGroup === group;
                const n = counts?.groups[group];
                return (
                  <Link
                    key={group}
                    href={`/leads?group=${group}`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
                    style={{
                      background: active ? "rgba(29, 158, 117, 0.18)" : "transparent",
                      color: active ? "#5DCAA5" : "#8DA1C9",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#142450";
                        e.currentTarget.style.color = "#FFFFFF";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#8DA1C9";
                      }
                    }}
                  >
                    <span className="flex-1 truncate">{label}</span>
                    {n !== undefined && n > 0 && (
                      <CountBadge n={n} active={active} />
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <NavItem
          href="/products"
          label="Produtos"
          icon={Building2}
          mode="prefix"
        />
        {role === "OWNER" && (
          <NavItem
            href="/central-agentes"
            label="Central de Agentes"
            icon={Bot}
            mode="prefix"
          />
        )}
        {role === "OWNER" && (
          <NavItem href="/equipe" label="Equipe" icon={UserCog} />
        )}
        <NavItem href="/secretary" label="Secretaria" icon={Headphones} />
        <NavItem href="/calendar" label="Agenda" icon={Calendar} />
        {role === "OWNER" && (
          <NavItem
            href="/channels"
            label="Canais"
            icon={Megaphone}
            mode="prefix"
          />
        )}

        {/* Configurações — ativo em qualquer /settings/* exceto permissões */}
        {role === "OWNER" && (
          <Link
            href="/settings"
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={{
              background: settingsActive ? "rgba(29, 158, 117, 0.18)" : "transparent",
              color: settingsActive ? "#5DCAA5" : "rgba(255,255,255,0.92)",
            }}
            onMouseEnter={(e) => {
              if (!settingsActive) e.currentTarget.style.background = "#142450";
            }}
            onMouseLeave={(e) => {
              if (!settingsActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <Settings
              className="h-[18px] w-[18px] shrink-0"
              style={{ color: settingsActive ? "#5DCAA5" : "#8DA1C9" }}
            />
            <span className="flex-1 truncate">Configurações</span>
          </Link>
        )}
        {role === "OWNER" && (
          <NavItem
            href="/settings/permissions"
            label="Permissões"
            icon={Shield}
          />
        )}
        {role === "OWNER" && (
          <NavItem
            href="/my-site"
            label="Meu Site"
            icon={Globe}
            mode="prefix"
          />
        )}
      </nav>

      {/* Logout */}
      <div
        className="p-3 border-t"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <button
          onClick={logout}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{ color: "rgba(255,255,255,0.92)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#142450")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <LogOut
            className="h-[18px] w-[18px]"
            style={{ color: "#8DA1C9" }}
          />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

function CountBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={
        active
          ? { background: "#1D9E75", color: "#FFFFFF" }
          : { background: "rgba(255,255,255,0.10)", color: "#8DA1C9" }
      }
    >
      {n > 999 ? "999+" : n}
    </span>
  );
}
