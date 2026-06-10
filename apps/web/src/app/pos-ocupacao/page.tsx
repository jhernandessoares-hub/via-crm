"use client";

import { useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import NaoContratado from "@/components/NaoContratado";
import { isSP9 } from "@/lib/sp9";

export default function PosOcupacaoPage() {
  const router = useRouter();

  useEffect(() => {
    let allowed = false;
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      allowed = isSP9(user?.tenantId);
    } catch {
      allowed = false;
    }
    if (!allowed) startTransition(() => router.replace("/"));
  }, [router]);

  return (
    <AppShell title="Pós-Ocupação">
      <NaoContratado title="Pós-Ocupação — não contratado" />
    </AppShell>
  );
}
