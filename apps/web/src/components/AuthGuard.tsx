"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];
const PUBLIC_PREFIXES = ["/admin", "/s/"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
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
      router.replace("/login");
    } else {
      setAuthorized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!authorized) return null;

  return <>{children}</>;
}
