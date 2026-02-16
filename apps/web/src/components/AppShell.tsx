"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  const canSeeManagerQueue = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "MANAGER";
  }, [user]);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    router.push("/login");
  }

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-2 hover:bg-slate-900 ${
      pathname === href ? "bg-slate-900" : ""
    }`;

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

          <Link className={linkClass("/leads")} href="/leads">
            Leads
          </Link>

          {canSeeManagerQueue ? (
            <Link className={linkClass("/manager-queue")} href="/manager-queue">
              Fila do Gerente
            </Link>
          ) : null}
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
