"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) {
      setAuthorized(true);
      return;
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
