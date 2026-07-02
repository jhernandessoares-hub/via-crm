"use client";

import { useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { isSP9 } from "@/lib/sp9";

/**
 * `/pre-ocupacao` não é mais uma tela em si — é só o ponto de entrada do
 * grupo. Redireciona para a primeira tela (Famílias) quando o tenant é SP9,
 * ou para fora do módulo caso contrário. Gate real de dados fica em cada
 * subtela (o backend também bloqueia via AddonGuard).
 */
export default function PreOcupacaoPage() {
  const router = useRouter();

  useEffect(() => {
    let allowed = false;
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      allowed = isSP9(user?.tenantId);
    } catch {
      allowed = false;
    }
    startTransition(() => {
      router.replace(allowed ? "/pre-ocupacao/familias" : "/");
    });
  }, [router]);

  return null;
}
