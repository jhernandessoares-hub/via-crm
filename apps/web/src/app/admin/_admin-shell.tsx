"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import EnvBanner from "@/components/EnvBanner";

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
  { href: "/admin/clientes", label: "Clientes" },
  {
    group: "IA",
    items: [
      { href: "/admin/ia/provedores", label: "Provedores" },
      { href: "/admin/agent-templates", label: "Agent Templates" },
      { href: "/admin/regras-globais", label: "🛡️ Regras Globais" },
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
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-400 hover:bg-slate-800"
      >
        {label}
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
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

  useEffect(() => {
    setAdminToken(localStorage.getItem("adminToken"));
    try {
      const raw = localStorage.getItem("adminUser");
      setAdmin(raw ? (JSON.parse(raw) as AdminUser) : null);
    } catch {
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    if (adminToken === undefined) return; // ainda carregando
    if (!isLoginRoute && !adminToken) {
      router.push("/admin/login");
    }
  }, [adminToken, isLoginRoute, router]);

  if (isLoginRoute) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <EnvBanner />
      <div className="flex flex-1">
      <aside className="flex w-56 flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-700 px-4 py-5">
          <div className="text-xs uppercase tracking-widest text-slate-400">VIA CRM</div>
          <div className="mt-0.5 text-sm font-semibold">Admin</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-4">
          {navItems.map((item) => {
            if (isNavGroup(item)) {
              const groupActive = item.items.some((i) => pathname.startsWith(i.href));
              return (
                <NavGroup key={item.group} label={item.group} defaultOpen={groupActive}>
                  {item.items.map((sub) => {
                    const active = pathname.startsWith(sub.href);
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`block rounded-md px-3 py-1.5 text-sm ${active ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
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
                className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-700 px-4 py-4 text-xs text-slate-400">
          <div>{admin?.nome || "Admin"}</div>
          <button
            onClick={() => {
              localStorage.removeItem("adminToken");
              localStorage.removeItem("adminUser");
              router.push("/admin/login");
            }}
            className="mt-1 text-slate-500 hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
