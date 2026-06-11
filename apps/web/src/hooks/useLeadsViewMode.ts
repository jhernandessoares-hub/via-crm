"use client";

import { useEffect, useState } from "react";

export type LeadsViewMode = "KANBAN" | "LISTA";

const STORAGE_KEY = "leads_view_mode";
const DEFAULT_MODE: LeadsViewMode = "LISTA";

/**
 * Hook compartilhado entre as três telas de leads (`/meus-leads`, `/pipeline`,
 * `/leads`) para persistir a preferência de visualização (Kanban ou Lista) em
 * `localStorage`.
 *
 * Padrões obrigatórios (ver CLAUDE.md → "Decisões técnicas"):
 *  - Estado inicial sempre = DEFAULT_MODE (evita mismatch de hidratação SSR/CSR).
 *  - `localStorage` lido apenas dentro de `useEffect` (client only).
 *  - `try/catch` em torno do `setItem` para não quebrar em modos restritos.
 */
export function useLeadsViewMode(): [LeadsViewMode, (mode: LeadsViewMode) => void] {
  const [mode, setMode] = useState<LeadsViewMode>(DEFAULT_MODE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "KANBAN" || saved === "LISTA") {
        setMode(saved);
      }
    } catch {
      // localStorage indisponível (modo privado, etc) — mantém o default.
    }
  }, []);

  const update = (next: LeadsViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignora falha de persistência — o estado em memória continua válido.
    }
  };

  return [mode, update];
}
