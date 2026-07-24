"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { isSP9 } from "@/lib/sp9";

/**
 * Gate de tela do módulo Planejamento TTS: tenant SP9 E role OWNER/MANAGER.
 * O backend também bloqueia (AddonGuard PLANEJAMENTO_TTS + checagem de role
 * no controller) — isso é só a segunda camada (UX), mesmo padrão do
 * `useSP9Guard` do módulo Pré-Ocupação.
 */
export function usePlanejamentoTtsGuard(): boolean | null {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let ok = false;
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      ok = isSP9(user?.tenantId) && (user?.role === "OWNER" || user?.role === "MANAGER");
    } catch {
      ok = false;
    }
    setAllowed(ok);
    if (!ok) startTransition(() => router.replace("/"));
  }, [router]);

  return allowed;
}
