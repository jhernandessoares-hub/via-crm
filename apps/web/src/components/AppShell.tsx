"use client";

import { Suspense, useEffect, useState } from "react";
import EnvBanner from "@/components/EnvBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  MeusDadosModal,
  type FullProfile,
} from "@/components/layout/MeusDadosModal";
import { apiFetch } from "@/lib/api";
import { getPalette, applyPalette } from "@/lib/palettes";

type Role = "OWNER" | "MANAGER" | "AGENT";

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
  const [branding, setBranding] = useState<TenantBranding>({});

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
        const t = p?.preferences?.theme ?? "light";
        setTheme(t);
        applyTheme(t);
        // Aplica paleta e favicon do tenant
        const b: TenantBranding = {
          brandPalette: (p as any)?.tenant?.brandPalette,
          logoUrl: (p as any)?.tenant?.logoUrl,
          faviconUrl: (p as any)?.tenant?.faviconUrl,
        };
        setBranding(b);
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
    }
    fetchCounts();
    const i = setInterval(fetchCounts, 60_000);
    return () => clearInterval(i);
  }, []);

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
        <Sidebar role={role} tenantNome={tenantNome} counts={counts} branding={branding} />
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
          />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>

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
