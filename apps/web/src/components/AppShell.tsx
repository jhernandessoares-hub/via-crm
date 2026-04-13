"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import EnvBanner from "@/components/EnvBanner";
import { apiFetch } from "@/lib/api";

type Role = "OWNER" | "MANAGER" | "AGENT";

type StoredUser = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: Role;
  branchId: string | null;
};

type FullProfile = {
  id: string;
  nome: string;
  email: string;
  apelido: string | null;
  preferences: { theme?: "light" | "dark" } | null;
  role: Role;
  branchId: string | null;
  tenant: { nome: string };
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Modal Meus Dados ──────────────────────────────────────────────────────────
function MeusDadosModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: FullProfile;
  onClose: () => void;
  onSaved: (updated: Partial<FullProfile>) => void;
}) {
  const [nome, setNome] = useState(profile.nome);
  const [email, setEmail] = useState(profile.email);
  const [apelido, setApelido] = useState(profile.apelido ?? "");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(profile.preferences?.theme ?? "light");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    if (novaSenha && novaSenha !== confirmarSenha) {
      setErr("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      setErr("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        nome,
        email,
        apelido: apelido.trim() || null,
        preferences: { theme },
      };
      if (novaSenha) {
        body.senhaAtual = senhaAtual;
        body.novaSenha = novaSenha;
      }

      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify(body) });

      // Aplicar tema imediatamente
      applyTheme(theme);

      setOk(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      onSaved({ nome, email, apelido: apelido.trim() || null, preferences: { theme } });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === "dark";
  const modalBg = isDark ? "#1e293b" : "#ffffff";
  const modalBorder = isDark ? "#334155" : "#e5e7eb";
  const modalText = isDark ? "#f1f5f9" : "#111827";
  const modalSubtext = isDark ? "#94a3b8" : "#6b7280";
  const inputBg = isDark ? "#0f172a" : "#f9fafb";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl my-8 mx-4"
        style={{ background: modalBg, color: modalText, borderColor: modalBorder }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: modalBorder }}>
          <h2 className="text-base font-semibold">Meus Dados</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-lg leading-none hover:opacity-70"
            style={{ color: modalSubtext }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-xs font-medium" style={{ color: modalSubtext }}>Nome completo</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          {/* Apelido */}
          <div>
            <label className="text-xs font-medium" style={{ color: modalSubtext }}>
              Apelido <span className="font-normal opacity-60">(exibido no topo — opcional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Ex: João"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium" style={{ color: modalSubtext }}>E-mail</label>
            <input
              type="email"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Troca de senha */}
          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: modalBorder }}>
            <p className="text-xs font-medium" style={{ color: modalSubtext }}>
              Trocar senha <span className="font-normal opacity-60">(deixe em branco para manter)</span>
            </p>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              placeholder="Senha atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              placeholder="Nova senha (mín. 6 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              style={{ background: inputBg, color: modalText, borderColor: modalBorder }}
              placeholder="Confirmar nova senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {/* Tema */}
          <div>
            <label className="text-xs font-medium" style={{ color: modalSubtext }}>Tema do sistema</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className="flex-1 rounded-md border py-2 text-sm font-medium transition-colors"
                style={
                  theme === "light"
                    ? { background: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }
                    : { background: inputBg, color: modalText, borderColor: modalBorder }
                }
              >
                Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className="flex-1 rounded-md border py-2 text-sm font-medium transition-colors"
                style={
                  theme === "dark"
                    ? { background: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }
                    : { background: inputBg, color: modalText, borderColor: modalBorder }
                }
              >
                Escuro
              </button>
            </div>
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}
          {ok && <p className="text-sm text-emerald-600">Dados salvos com sucesso!</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border py-2 text-sm"
              style={{ background: inputBg, borderColor: modalBorder, color: modalSubtext }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md py-2 text-sm text-white disabled:opacity-60"
              style={{ background: "#0f172a" }}
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Aplica tema no <html> ─────────────────────────────────────────────────────
function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// ── Shell principal ───────────────────────────────────────────────────────────
function AppShellInner({
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
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Carregar usuário do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  // Buscar perfil completo (tenant.nome, apelido, preferences)
  useEffect(() => {
    apiFetch("/users/me")
      .then((data) => {
        const p = data as FullProfile;
        setProfile(p);
        // Aplicar tema salvo
        const theme = p?.preferences?.theme ?? "light";
        applyTheme(theme);
      })
      .catch(() => null);
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    router.push("/login");
  }

  // Nome de exibição: apelido ou primeiro nome
  const displayName = profile?.apelido?.trim() || (profile?.nome ?? user?.nome ?? "").split(" ")[0];
  const role = (profile?.role ?? user?.role) as Role | undefined;
  const tenantNome = profile?.tenant?.nome ?? null;
  const initials = getInitials(profile?.nome ?? user?.nome ?? "?");

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-2 text-sm hover:bg-slate-900 ${
      pathname === href && !currentGroup ? "bg-slate-900" : ""
    }`;

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
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--shell-bg)", color: "var(--shell-text)" }}
    >
      <EnvBanner />
      <div className="flex flex-1">
        {/* Sidebar escura */}
        <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col">
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="text-lg font-semibold tracking-wide">VIA CRM</div>
            {tenantNome ? (
              <div className="text-xs text-slate-300 mt-0.5 font-medium truncate" title={tenantNome}>
                {tenantNome}
              </div>
            ) : (
              <div className="text-xs text-slate-400 mt-1">Painel administrativo</div>
            )}
          </div>

          <nav className="p-3 space-y-1 text-sm">
            <Link className={linkClass("/dashboard")} href="/dashboard">
              Dashboard
            </Link>

            <Link className={linkClass("/pipeline")} href="/pipeline">
              Todos os Leads
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

            {role === "OWNER" && (
              <Link className={linkClass("/central-agentes")} href="/central-agentes">
                Central de Agentes
              </Link>
            )}

            {role === "OWNER" && (
              <Link className={linkClass("/equipe")} href="/equipe">
                Equipe
              </Link>
            )}

            <Link className={linkClass("/secretary")} href="/secretary">
              Secretaria
            </Link>

            <Link className={linkClass("/calendar")} href="/calendar">
              Agenda
            </Link>

            {role === "OWNER" && (
              <Link className={linkClass("/channels")} href="/channels">
                Canais
              </Link>
            )}

            {role === "OWNER" && (
              <Link className={linkClass("/settings/bot")} href="/settings/bot">
                Config. IA
              </Link>
            )}

            {role === "OWNER" && (
              <Link className={linkClass("/settings")} href="/settings">
                Configurações
              </Link>
            )}

            {role === "OWNER" && (
              <Link className={linkClass("/settings/permissions")} href="/settings/permissions">
                Permissões
              </Link>
            )}

            {role === "OWNER" && (
              <Link className={linkClass("/my-site")} href="/my-site">
                Meu Site
              </Link>
            )}
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

        {/* Área principal */}
        <div className="flex-1 flex flex-col">
          {/* Topbar */}
          <header
            className="h-14 border-b flex items-center px-6"
            style={{
              background: "var(--shell-header-bg)",
              borderColor: "var(--shell-header-border)",
            }}
          >
            {/* Título da página */}
            <div className="text-sm" style={{ color: "var(--shell-subtext)" }}>
              <span className="font-medium" style={{ color: "var(--shell-text)" }}>{title}</span>
            </div>

            {/* Info do usuário + dropdown */}
            <div className="ml-auto flex items-center gap-3" ref={dropdownRef}>
              {/* Empresa + role + nome */}
              <div className="text-right hidden sm:block">
                {tenantNome && (
                  <div className="text-[11px] font-semibold leading-none" style={{ color: "var(--shell-subtext)" }}>
                    {tenantNome}
                  </div>
                )}
                <div className="text-xs mt-0.5" style={{ color: "var(--shell-text)" }}>
                  {role && <span className="font-semibold">{ROLE_LABEL[role]}</span>}
                  {displayName && <span className="ml-1">— {displayName}</span>}
                </div>
              </div>

              {/* Avatar / botão de dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full h-8 px-2 border text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    background: "var(--shell-bg)",
                    borderColor: "var(--shell-header-border)",
                    color: "var(--shell-text)",
                  }}
                  title="Minha conta"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white"
                  >
                    {initials}
                  </span>
                  <svg className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div
                    className="absolute right-0 top-10 w-44 rounded-lg border shadow-lg py-1 z-50"
                    style={{
                      background: "var(--shell-header-bg)",
                      borderColor: "var(--shell-header-border)",
                    }}
                  >
                    <button
                      onClick={() => { setDropdownOpen(false); setModalOpen(true); }}
                      className="w-full text-left px-4 py-2 text-sm hover:opacity-70 transition-opacity"
                      style={{ color: "var(--shell-text)" }}
                    >
                      Meus Dados
                    </button>
                    <div className="border-t my-1" style={{ borderColor: "var(--shell-header-border)" }} />
                    <button
                      onClick={logout}
                      className="w-full text-left px-4 py-2 text-sm text-red-500 hover:opacity-70 transition-opacity"
                    >
                      Sair
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="p-6">{children}</main>
        </div>
      </div>

      {/* Modal Meus Dados */}
      {modalOpen && profile && (
        <MeusDadosModal
          profile={profile}
          onClose={() => setModalOpen(false)}
          onSaved={(updated) => {
            setProfile((prev) => prev ? { ...prev, ...updated } : prev);
          }}
        />
      )}
    </div>
  );
}

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <AppShellInner title={title}>{children}</AppShellInner>
    </Suspense>
  );
}
