"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Sun, Moon, ChevronDown } from "lucide-react";
import { apiLogout } from "@/lib/api";

type Role = "OWNER" | "MANAGER" | "AGENT";
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
};

interface HeaderProps {
  title: string;
  displayName: string;
  role: Role | undefined;
  tenantNome: string | null;
  initials: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenMeusDados: () => void;
  pendingDeletions?: number;
}

export function Header({
  title,
  displayName,
  role,
  tenantNome,
  initials,
  theme,
  onToggleTheme,
  onOpenMeusDados,
  pendingDeletions = 0,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function logout() {
    await apiLogout();
    router.push("/login");
  }

  return (
    <header
      className="h-16 shrink-0 border-b"
      style={{
        background: "var(--shell-header-bg)",
        borderColor: "var(--shell-header-border)",
      }}
    >
      <div className="flex h-full items-center px-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <span style={{ color: "var(--shell-subtext)" }}>VIA CRM</span>
          <span style={{ color: "var(--shell-subtext)", opacity: 0.4 }}>/</span>
          <span
            className="font-semibold"
            style={{ color: "var(--shell-text)" }}
          >
            {title}
          </span>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {/* Nome do tenant */}
          {tenantNome && (
            <span
              className="hidden sm:block text-xs font-semibold mr-2 px-2.5 py-1 rounded-md"
              style={{
                color: "var(--shell-subtext)",
                background: "var(--shell-hover)",
              }}
            >
              {tenantNome}
            </span>
          )}

          {/* Toggle tema */}
          <button
            onClick={onToggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--shell-subtext)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--shell-hover)";
              e.currentTarget.style.color = "var(--via-teal)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--shell-subtext)";
            }}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            aria-label="Alternar tema"
          >
            {theme === "dark" ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </button>

          {/* Notificações */}
          <a
            href="/products"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--shell-subtext)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--shell-hover)";
              e.currentTarget.style.color = "var(--via-teal)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--shell-subtext)";
            }}
            title={pendingDeletions > 0 ? `${pendingDeletions} solicitação(ões) de exclusão pendente(s)` : "Notificações"}
            aria-label="Notificações"
          >
            <Bell className="h-[18px] w-[18px]" />
            {pendingDeletions > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                {pendingDeletions > 9 ? "9+" : pendingDeletions}
              </span>
            )}
          </a>

          <div
            className="w-px h-6 mx-2"
            style={{ background: "var(--shell-divider)" }}
          />

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-lg h-10 pl-1.5 pr-3 transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: "var(--via-teal)" }}
              >
                {initials}
              </span>
              <div className="hidden sm:block text-left leading-tight">
                {role && (
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--shell-subtext)" }}
                  >
                    {ROLE_LABEL[role]}
                  </div>
                )}
                {displayName && (
                  <div
                    className="text-xs font-semibold"
                    style={{ color: "var(--shell-text)" }}
                  >
                    {displayName}
                  </div>
                )}
              </div>
              <ChevronDown
                className="h-3.5 w-3.5"
                style={{ color: "var(--shell-subtext)" }}
              />
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-12 w-56 rounded-xl border shadow-xl py-1.5 z-50"
                style={{
                  background: "var(--shell-card-bg)",
                  borderColor: "var(--shell-card-border)",
                }}
                role="menu"
              >
                {tenantNome && (
                  <div
                    className="px-4 py-2.5 border-b"
                    style={{ borderColor: "var(--shell-divider)" }}
                  >
                    <div
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--shell-subtext)" }}
                    >
                      Empresa
                    </div>
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--shell-text)" }}
                    >
                      {tenantNome}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenMeusDados();
                  }}
                  className="w-full text-left px-4 py-2 text-sm transition-colors"
                  style={{ color: "var(--shell-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  role="menuitem"
                >
                  Meus Dados
                </button>
                <div
                  className="border-t my-1"
                  style={{ borderColor: "var(--shell-divider)" }}
                />
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  role="menuitem"
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
