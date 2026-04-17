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
  ChevronLeft,
  ChevronRight,
  Building2,
  Bot,
  UserCog,
  Headphones,
  Calendar,
  Megaphone,
  Settings,
  Shield,
  Globe,
  Palette,
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

type Branding = {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  brandPalette?: string | null;
};

interface SidebarProps {
  role: Role | undefined;
  tenantNome: string | null;
  counts: Counts | null;
  branding?: Branding;
}

const FUNNEL_GROUPS = [
  { label: "Pré-atendimento", group: "PRE_ATENDIMENTO" },
  { label: "Agendamento", group: "AGENDAMENTO" },
  { label: "Negociações", group: "NEGOCIACOES" },
  { label: "Crédito Imobiliário", group: "CREDITO_IMOBILIARIO" },
  { label: "Negócio Fechado", group: "NEGOCIO_FECHADO" },
  { label: "Pós Venda", group: "POS_VENDA" },
];

export function Sidebar({ role, tenantNome, counts, branding }: SidebarProps) {
  const logoSrc = branding?.logoUrl || "/Novo%20modelo%20de%20Logo.png";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentGroup = searchParams.get("group");
  const router = useRouter();

  const [funnelOpen, setFunnelOpen] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFunnelOpen(localStorage.getItem("sidebar_funnel_open") === "true");
    setCollapsed(localStorage.getItem("sidebar_collapsed") === "true");
  }, []);

  function toggleFunnel() {
    setFunnelOpen((v) => {
      const next = !v;
      localStorage.setItem("sidebar_funnel_open", String(next));
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar_collapsed", String(next));
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
        title={collapsed ? label : undefined}
        className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all"
        style={{
          background: active ? "var(--brand-accent-muted)" : "transparent",
          color: active ? "var(--brand-accent)" : "var(--sidebar-text)",
          justifyContent: collapsed ? "center" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = "var(--sidebar-hover)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon
          className="h-[18px] w-[18px] shrink-0"
          style={{ color: active ? "var(--brand-accent)" : "var(--sidebar-text-muted)" }}
        />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && badge !== undefined && badge !== null && (
          <CountBadge n={badge} active={active} />
        )}
        {collapsed && badge !== undefined && badge !== null && badge > 0 && (
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full"
            style={{ background: "var(--brand-accent)" }}
          />
        )}
      </Link>
    );
  }

  const funnelTotal = counts
    ? Object.values(counts.groups).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <aside
      className="shrink-0 flex flex-col border-r transition-all duration-200"
      style={{
        width: collapsed ? "64px" : "256px",
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Logo + toggle */}
      <div
        className="px-3 pt-4 pb-3 border-b flex items-center"
        style={{ borderColor: "var(--sidebar-border)", justifyContent: collapsed ? "center" : "space-between" }}
      >
        {!collapsed && (
          <Link href="/dashboard" className="block flex-1">
            <img src={logoSrc} alt="VIA CRM" className="w-[72%] h-auto mx-auto block" />
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" title="Dashboard">
            <img src={logoSrc} alt="VIA CRM" className="w-9 h-9 object-contain" />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Minimizar menu"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--sidebar-text-muted)", marginLeft: collapsed ? 0 : "4px" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sidebar-hover)";
            e.currentTarget.style.color = "var(--brand-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--sidebar-text-muted)";
          }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        <NavItem href="/dashboard" label="Dashboard" icon={LayoutDashboard} />
        <NavItem href="/meus-leads" label="Meus Leads" icon={User} badge={counts?.mine} />
        {role !== "AGENT" && (
          <NavItem href="/pipeline" label="Todos os Leads" icon={Users} badge={counts?.total} />
        )}

        {/* Funil colapsável */}
        {!collapsed && (
          <div className="pt-1">
            <button
              type="button"
              onClick={toggleFunnel}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ color: "var(--sidebar-text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-expanded={funnelOpen}
            >
              <Filter className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--sidebar-text-muted)" }} />
              <span className="flex-1 text-left">Funil de Venda</span>
              {funnelTotal !== undefined && <CountBadge n={funnelTotal} active={false} />}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${funnelOpen ? "rotate-180" : ""}`}
                style={{ color: "var(--sidebar-text-muted)" }}
              />
            </button>
            {funnelOpen && (
              <div
                className="mt-1 ml-3 space-y-0.5 border-l pl-3"
                style={{ borderColor: "var(--sidebar-funnel-border)" }}
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
                        background: active ? "var(--brand-accent-muted)" : "transparent",
                        color: active ? "var(--brand-accent)" : "var(--sidebar-text-muted)",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "var(--sidebar-hover)";
                          e.currentTarget.style.color = "var(--sidebar-text)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--sidebar-text-muted)";
                        }
                      }}
                    >
                      <span className="flex-1 truncate">{label}</span>
                      {n !== undefined && n > 0 && <CountBadge n={n} active={active} />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Funil compacto */}
        {collapsed && (
          <Link
            href="/leads"
            title="Funil de Venda"
            className="flex items-center justify-center rounded-lg py-2 transition-colors relative"
            style={{ color: "var(--sidebar-text)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Filter className="h-[18px] w-[18px]" style={{ color: "var(--sidebar-text-muted)" }} />
            {funnelTotal !== undefined && funnelTotal > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full" style={{ background: "var(--brand-accent)" }} />
            )}
          </Link>
        )}

        <NavItem href="/products" label="Produtos" icon={Building2} mode="prefix" />
        {role === "OWNER" && <NavItem href="/central-agentes" label="Central de Agentes" icon={Bot} mode="prefix" />}
        {role === "OWNER" && <NavItem href="/equipe" label="Equipe" icon={UserCog} />}
        <NavItem href="/secretary" label="Secretaria" icon={Headphones} />
        <NavItem href="/calendar" label="Agenda" icon={Calendar} />
        {role === "OWNER" && <NavItem href="/channels" label="Canais" icon={Megaphone} mode="prefix" />}

        {role === "OWNER" && (
          <Link
            href="/settings"
            title={collapsed ? "Configurações" : undefined}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all"
            style={{
              background: settingsActive ? "var(--brand-accent-muted)" : "transparent",
              color: settingsActive ? "var(--brand-accent)" : "var(--sidebar-text)",
              justifyContent: collapsed ? "center" : undefined,
            }}
            onMouseEnter={(e) => { if (!settingsActive) e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { if (!settingsActive) e.currentTarget.style.background = "transparent"; }}
          >
            <Settings
              className="h-[18px] w-[18px] shrink-0"
              style={{ color: settingsActive ? "var(--brand-accent)" : "var(--sidebar-text-muted)" }}
            />
            {!collapsed && <span className="flex-1 truncate">Configurações</span>}
          </Link>
        )}
        {role === "OWNER" && <NavItem href="/settings/permissions" label="Permissões" icon={Shield} />}
        {role === "OWNER" && <NavItem href="/my-site" label="Meu Site" icon={Globe} mode="prefix" />}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <button
          onClick={logout}
          title={collapsed ? "Sair" : undefined}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{ color: "var(--sidebar-text)", justifyContent: collapsed ? "center" : undefined }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <LogOut className="h-[18px] w-[18px]" style={{ color: "var(--sidebar-text-muted)" }} />
          {!collapsed && <span>Sair</span>}
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
          ? { background: "var(--brand-accent)", color: "#FFFFFF" }
          : { background: "rgba(128,128,128,0.15)", color: "var(--sidebar-text-muted)" }
      }
    >
      {n > 999 ? "999+" : n}
    </span>
  );
}
