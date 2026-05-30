"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import EnvBanner from "@/components/EnvBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  MeusDadosModal,
  type FullProfile,
} from "@/components/layout/MeusDadosModal";
import { SessionTimeoutModal } from "@/components/layout/SessionTimeoutModal";
import dynamic from "next/dynamic";
import { apiFetch, manualRefreshToken, apiLogout } from "@/lib/api";
import { getPalette, applyPalette } from "@/lib/palettes";
import { useSessionTimer } from "@/hooks/useSessionTimer";

const WelcomeModal = dynamic(
  () => import("@/components/layout/WelcomeModal").then((m) => ({ default: m.WelcomeModal })),
  { ssr: false }
);

type Role = "OWNER" | "MANAGER" | "AGENT" | "PARTNER";

type TenantBranding = {
  brandPalette?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
};

type StoredUser = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: Role;
  branchId: string | null;
};

type Counts = {
  total: number;
  mine: number;
  groups: Record<string, number>;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

function AppShellInner({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modalOpen, setModalOpen] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [pendingDeletions, setPendingDeletions] = useState(0);
  const [branding, setBranding] = useState<TenantBranding>({});
  const [tenantAddons, setTenantAddons] = useState<string[]>([]);
  const [tenantPlan, setTenantPlan] = useState<string>('');
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutModalSeconds, setTimeoutModalSeconds] = useState(10);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    apiFetch("/users/me")
      .then((data) => {
        const p = data as FullProfile & { tenant?: TenantBranding };
        setProfile(p);
        if (!p?.preferences?.welcomeSeen || !p?.preferences?.lgpdAccepted) setWelcomeOpen(true);
        const t = p?.preferences?.theme ?? "light";
        setTheme(t);
        applyTheme(t);
        const b: TenantBranding = {
          brandPalette: (p as any)?.tenant?.brandPalette,
          logoUrl: (p as any)?.tenant?.logoUrl,
          faviconUrl: (p as any)?.tenant?.faviconUrl,
        };
        setBranding(b);
        setTenantAddons((p as any)?.tenant?.addons ?? []);
        setTenantPlan((p as any)?.tenant?.plan ?? '');
        applyPalette(getPalette(b.brandPalette));
        if (b.faviconUrl) {
          let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
          if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
          link.href = b.faviconUrl;
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    function fetchCounts() {
      apiFetch("/leads/counts")
        .then((data) => setCounts(data as Counts))
        .catch(() => null);
      apiFetch("/products/pending-deletions/count")
        .then((data: any) => setPendingDeletions(data?.count ?? 0))
        .catch(() => null);
    }
    fetchCounts();
    const i = setInterval(fetchCounts, 60_000);
    return () => clearInterval(i);
  }, []);

  const handleSessionWarning = useCallback(() => {
    setTimeoutModalSeconds(10);
    setShowTimeoutModal(true);
  }, []);

  const handleSessionExpired = useCallback(async () => {
    setShowTimeoutModal(false);
    await apiLogout();
    window.location.href = "/login";
  }, []);

  const handleRenewSession = useCallback(async () => {
    const newToken = await manualRefreshToken();
    if (newToken) {
      setShowTimeoutModal(false);
    } else {
      await apiLogout();
      window.location.href = "/login";
    }
  }, []);

  const { secondsLeft } = useSessionTimer({
    onWarning: handleSessionWarning,
    onExpired: handleSessionExpired,
    warningAt: 10,
  });

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ preferences: { theme: next } }),
      });
      setProfile((p) => (p ? { ...p, preferences: { theme: next } } : p));
    } catch {
      /* falha silenciosa — UI já refletiu */
    }
  }

  const displayName =
    profile?.apelido?.trim() ||
    (profile?.nome ?? user?.nome ?? "").split(" ")[0] ||
    "";
  const role = (profile?.role ?? user?.role) as Role | undefined;
  const tenantNome = profile?.tenant?.nome ?? null;
  const initials = getInitials(profile?.nome ?? user?.nome ?? "?");

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "var(--shell-bg)",
        color: "var(--shell-text)",
      }}
    >
      <EnvBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar role={role} tenantNome={tenantNome} counts={counts} branding={branding} addons={tenantAddons} plan={tenantPlan} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            title={title}
            displayName={displayName}
            role={role}
            tenantNome={tenantNome}
            initials={initials}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenMeusDados={() => setModalOpen(true)}
            pendingDeletions={pendingDeletions}
            sessionSecondsLeft={secondsLeft}
          />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>

      {showTimeoutModal && (
        <SessionTimeoutModal
          initialSeconds={timeoutModalSeconds}
          onRenew={handleRenewSession}
          onLogout={handleSessionExpired}
        />
      )}

      {welcomeOpen && profile && (
        <WelcomeModal
          profile={profile}
          showWelcome={!profile.preferences?.welcomeSeen}
          showLgpd={!profile.preferences?.lgpdAccepted}
          onDismiss={(updates) => {
            setWelcomeOpen(false);
            setProfile((p) =>
              p ? { ...p, preferences: { ...p.preferences, ...updates } } : p
            );
          }}
        />
      )}

      {modalOpen && profile && (
        <MeusDadosModal
          profile={profile}
          onClose={() => setModalOpen(false)}
          onSaved={(updated) => {
            setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
            if (updated.preferences?.theme) {
              setTheme(updated.preferences.theme);
              applyTheme(updated.preferences.theme);
            }
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
    <Suspense
      fallback={
        <div
          className="min-h-screen"
          style={{ background: "var(--shell-bg)" }}
        />
      }
    >
      <AppShellInner title={title}>{children}</AppShellInner>
    </Suspense>
  );
}
