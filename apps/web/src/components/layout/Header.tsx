"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Sun, Moon, ChevronDown, Trash2, MessageCircle } from "lucide-react";
import { apiLogout } from "@/lib/api";

type PendingReplyLead = {
  id: string;
  nome: string;
  nomeCorreto: string | null;
  telefone: string | null;
  lastInboundAt: string;
};

type Role = "OWNER" | "MANAGER" | "AGENT" | "PARTNER";
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
  PARTNER: "Parceiro",
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
  pendingReplies?: PendingReplyLead[];
  sessionSecondsLeft?: number | null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

function formatSessionTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  pendingReplies = [],
  sessionSecondsLeft,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) {
        setNotifsOpen(false);
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
          <div className="relative" ref={notifsRef}>
            <button
              onClick={() => setNotifsOpen((v) => !v)}
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
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell className="h-[18px] w-[18px]" />
              {(pendingDeletions + pendingReplies.length) > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                  {(pendingDeletions + pendingReplies.length) > 9 ? "9+" : (pendingDeletions + pendingReplies.length)}
                </span>
              )}
            </button>

            {notifsOpen && (
              <div
                className="absolute right-0 top-12 w-72 rounded-xl border shadow-xl py-1.5 z-50"
                style={{
                  background: "var(--shell-card-bg)",
                  borderColor: "var(--shell-card-border)",
                }}
              >
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--shell-divider)" }}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>
                    Notificações
                  </span>
                  {(pendingDeletions + pendingReplies.length) > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {(pendingDeletions + pendingReplies.length) > 9 ? "9+" : (pendingDeletions + pendingReplies.length)}
                    </span>
                  )}
                </div>

                {pendingDeletions === 0 && pendingReplies.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 px-4">
                    <Bell className="h-8 w-8" style={{ color: "var(--shell-subtext)", opacity: 0.4 }} />
                    <span className="text-sm text-center" style={{ color: "var(--shell-subtext)" }}>
                      Sem notificações no momento
                    </span>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {pendingDeletions > 0 && (
                      <button
                        onClick={() => { setNotifsOpen(false); router.push("/products"); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--shell-text)" }}>
                            Exclusão de produto pendente
                          </div>
                          <div className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                            {pendingDeletions} solicitação{pendingDeletions > 1 ? "ões" : ""} aguardando aprovação
                          </div>
                        </div>
                      </button>
                    )}

                    {pendingReplies.length > 0 && pendingDeletions > 0 && (
                      <div className="mx-4 border-t" style={{ borderColor: "var(--shell-divider)" }} />
                    )}

                    {pendingReplies.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => { setNotifsOpen(false); router.push(`/leads/${lead.id}`); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                          <MessageCircle className="h-4 w-4 text-teal-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--shell-text)" }}>
                            {lead.nomeCorreto ?? lead.nome}
                          </div>
                          <div className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                            Aguardando resposta · {formatRelativeTime(lead.lastInboundAt)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Badge de sessão */}
          {sessionSecondsLeft !== null && sessionSecondsLeft !== undefined && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded-md tabular-nums"
              style={{
                color:
                  sessionSecondsLeft > 180
                    ? "var(--shell-subtext)"
                    : sessionSecondsLeft > 60
                    ? "#F59E0B"
                    : "#EF4444",
                background:
                  sessionSecondsLeft > 180
                    ? "var(--shell-hover)"
                    : sessionSecondsLeft > 60
                    ? "rgba(245,158,11,0.1)"
                    : "rgba(239,68,68,0.1)",
                animation: sessionSecondsLeft <= 60 ? "pulse 1s infinite" : "none",
              }}
              title="Tempo restante de sessão"
            >
              🔒 {formatSessionTime(sessionSecondsLeft)}
            </span>
          )}

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
