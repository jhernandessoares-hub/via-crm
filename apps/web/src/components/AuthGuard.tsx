"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.replace("/login");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
