"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import EnvBanner from "@/components/EnvBanner";
import { VersionBadge } from "@/components/VersionBadge";
import { applyTheme, getStoredTheme, setStoredTheme, ADMIN_THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

type AdminUser = {
  nome?: string;
};

type NavLeaf = { href: string; label: string; exact?: boolean };
type NavGroup2 = { group: string; items: NavLeaf[] };
type NavItem = NavLeaf | NavGroup2;

function isNavGroup(item: NavItem): item is NavGroup2 {
  return "group" in item;
}

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/site", label: "Gerenciador de Sites" },
  { href: "/admin/leads-vendas", label: "📥 Leads de Vendas" },
  { href: "/admin/clientes", label: "Clientes" },
  {
    group: "IA",
    items: [
      { href: "/admin/ia/provedores", label: "Provedores" },
      { href: "/admin/agent-templates", label: "Agent Templates" },
      { href: "/admin/regras-globais", label: "🛡️ Regras Globais" },
    ],
  },
  {
    group: "Planos",
    items: [
      { href: "/admin/planos", label: "Planos e Preços" },
      { href: "/admin/usage", label: "Dashboard de Uso" },
    ],
  },
  {
    group: "Financeiro",
    items: [
      { href: "/admin/financeiro", label: "Visão Geral", exact: true },
      { href: "/admin/financeiro/contas-a-pagar", label: "Contas a Pagar" },
      { href: "/admin/financeiro/contas-a-receber", label: "Contas a Receber" },
      { href: "/admin/financeiro/documentos-fiscais", label: "Documentos Fiscais" },
      { href: "/admin/financeiro/contratos", label: "Contratos" },
      { href: "/admin/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa" },
      { href: "/admin/financeiro/conciliacao", label: "Conciliação" },
      { href: "/admin/financeiro/dre", label: "DRE" },
      { href: "/admin/financeiro/balancete", label: "Balancete" },
      { href: "/admin/financeiro/configuracoes", label: "Configurações" },
    ],
  },
  { href: "/admin/correspondentes", label: "💳 Correspondentes" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/filas", label: "Filas & IA" },
  { href: "/admin/saude", label: "Saúde do Sistema" },
];

function NavGroup({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-[var(--sidebar-hover)]"
        style={{ color: "var(--sidebar-text-muted)" }}
      >
        {label}
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="ml-2 mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === "/admin/login";

  // Lê localStorage apenas no cliente (useEffect), evitando disparo do router antes da inicialização
  const [adminToken, setAdminToken] = useState<string | null | undefined>(undefined);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    setAdminToken(token);
    try {
      const raw = localStorage.getItem("adminUser");
      setAdmin(raw ? (JSON.parse(raw) as AdminUser) : null);
    } catch {
      setAdmin(null);
    }
    if (!isLoginRoute && !token) {
      router.push("/admin/login");
    }
  }, [isLoginRoute, router]);

  useEffect(() => {
    const t = getStoredTheme(ADMIN_THEME_STORAGE_KEY) ?? "light";
    setTheme(t);
    applyTheme(t);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    setStoredTheme(ADMIN_THEME_STORAGE_KEY, next);
  }

  if (isLoginRoute) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--shell-bg)", color: "var(--shell-text)" }}>
      <EnvBanner />
      <div className="flex flex-1">
      <aside className="flex w-56 flex-col" style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}>
        <div className="border-b px-4 py-5" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="text-xs uppercase tracking-widest" style={{ color: "var(--sidebar-text-muted)" }}>VIA CRM</div>
          <div className="mt-0.5 text-sm font-semibold">Admin</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-4">
          {navItems.map((item) => {
            if (isNavGroup(item)) {
              const groupActive = item.items.some((i) => pathname.startsWith(i.href));
              return (
                <NavGroup key={item.group} label={item.group} defaultOpen={groupActive}>
                  {item.items.map((sub) => {
                    const active = sub.exact ? pathname === sub.href : pathname.startsWith(sub.href);
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className="block rounded-md px-3 py-1.5 text-sm"
                        style={active
                          ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-text)" }
                          : { color: "var(--sidebar-text-muted)" }}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </NavGroup>
              );
            }
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href) && item.href !== "/admin";
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm"
                style={active
                  ? { background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-text)" }
                  : { color: "var(--sidebar-text)" }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-4 py-4 text-xs" style={{ borderColor: "var(--sidebar-border)", color: "var(--sidebar-text-muted)" }}>
          <div>{admin?.nome || "Admin"}</div>
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => {
                localStorage.removeItem("adminToken");
                localStorage.removeItem("adminUser");
                router.push("/admin/login");
              }}
              className="hover:text-white"
            >
              Sair
            </button>
            <button
              onClick={toggleTheme}
              className="hover:text-white"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-2">
            <VersionBadge />
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
