"use client";

import { useEffect, useState } from "react";

/**
 * Externo Consultivo (Verificadora) só consulta as atividades; o backend também bloqueia.
 * Lido no efeito porque localStorage não existe no primeiro render.
 */
export function usePodeLancar(): boolean {
  const [pode, setPode] = useState(false);
  useEffect(() => {
    try {
      setPode(JSON.parse(localStorage.getItem("user") || "{}")?.role !== "PARTNER");
    } catch {
      setPode(false);
    }
  }, []);
  return pode;
}
