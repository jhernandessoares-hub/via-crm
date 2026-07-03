"use client";

import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password", "/definir-senha"];
const PUBLIC_PREFIXES = ["/admin", "/s/"];

// Hosts do próprio CRM — em qualquer outro host (domínio custom de site de
// tenant, servido via rewrite no proxy.ts) todas as rotas são públicas.
const APP_HOSTS = (process.env.NEXT_PUBLIC_APP_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isCustomDomain(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".railway.app")) return false;
  return !APP_HOSTS.includes(host);
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (isCustomDomain(window.location.hostname)) {
      setAuthorized(true);
      return;
    }

    if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      setAuthorized(true);
      return;
    }

    // Editor de site: aceita adminToken (admin editando template) ou accessToken (tenant)
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") === "1") {
      const hasAuth = localStorage.getItem("adminToken") || localStorage.getItem("accessToken");
      if (hasAuth) { setAuthorized(true); return; }
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setAuthorized(false);
      startTransition(() => {
        router.replace("/login");
      });
    } else {
      setAuthorized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!authorized) return null;

  return <>{children}</>;
}
