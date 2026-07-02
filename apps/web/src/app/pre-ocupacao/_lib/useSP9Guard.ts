"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { isSP9 } from "@/lib/sp9";

/**
 * Gate de tela compartilhado por todas as páginas do módulo Pré-Ocupação.
 * Mesmo bloco de proteção usado na stub original (`/pre-ocupacao`, antes da
 * Fase 4): tenants que não são SP9 são redirecionados pra fora. O backend
 * também bloqueia via `AddonGuard` — isso é só a segunda camada (UX).
 *
 * Retorna `null` enquanto verifica (evita flash de conteúdo) e `true`/`false`
 * depois.
 */
export function useSP9Guard(): boolean | null {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let ok = false;
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      ok = isSP9(user?.tenantId);
    } catch {
      ok = false;
    }
    setAllowed(ok);
    if (!ok) startTransition(() => router.replace("/"));
  }, [router]);

  return allowed;
}
