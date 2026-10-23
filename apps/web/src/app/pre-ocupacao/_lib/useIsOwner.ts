"use client";

import { useEffect, useState } from "react";

/**
 * true quando o usuário logado é o Proprietário (OWNER) do tenant.
 * Lê o localStorage só no useEffect (ler durante o render quebra a hidratação);
 * até lá devolve false, então botões de alteração só aparecem depois de confirmar.
 * A API também bloqueia — isto é só a camada de tela.
 */
export function useIsOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    try {
      setIsOwner(JSON.parse(localStorage.getItem("user") || "{}")?.role === "OWNER");
    } catch {
      setIsOwner(false);
    }
  }, []);
  return isOwner;
}
