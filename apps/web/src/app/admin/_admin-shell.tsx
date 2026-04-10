"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type AdminUser = {
  nome?: string;
};

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/site", label: "Gerenciador de Sites" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/agent-templates", label: "Agent Templates" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/filas", label: "Filas & IA" },
  { href: "/admin/saude", label: "Saúde do Sistema" },
  { href: "/admin/regras-globais", label: "🛡️ Regras Globais" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === "/admin/login";
  const adminToken = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  let admin: AdminUser | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("adminUser");
      admin = raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      admin = null;
    }
  }

  useEffect(() => {
    if (!isLoginRoute && !adminToken) {
      router.push("/admin/login");
    }
  }, [adminToken, isLoginRoute, router]);

  if (isLoginRoute) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-700 px-4 py-5">
          <div className="text-xs uppercase tracking-widest text-slate-400">VIA CRM</div>
          <div className="mt-0.5 text-sm font-semibold">Admin</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-4">
          {navItems.map((item) => {
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
  );
}
