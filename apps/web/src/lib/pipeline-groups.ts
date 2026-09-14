"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

/**
 * Etapas do funil do tenant (nome + cor), definidas em /settings/pipeline.
 *
 * Antes disso, kanban (/pipeline) e o stepper dentro do lead tinham mapas fixos
 * por chave de grupo (GROUP_LABEL_MAP / GROUP_COLOR_MAP / GROUP_BADGE_MAP), então
 * uma Etapa criada pelo cliente saía sem nome bonito e sem cor. Agora tudo lê daqui.
 */
export type PipelineGroupInfo = {
  id: string;
  key: string;
  name: string;
  color: string | null;
  sortOrder: number;
};

/** Paleta oferecida na escolha de cor da Etapa e usada como cor automática. */
export const GROUP_PALETTE = [
  "#0ea5e9", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#84cc16",
];

/** Cor escolhida pelo OWNER; sem escolha, cai numa cor estável pela posição da Etapa. */
export function groupColor(color: string | null | undefined, index: number): string {
  return color || GROUP_PALETTE[index % GROUP_PALETTE.length];
}

/** Mesma cor com transparência — `alpha` em hex de 2 dígitos (ex.: "14" ≈ 8%). */
export function tint(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;
}

// Cache no módulo: a lista de Etapas muda raramente e várias telas pedem a mesma
// coisa (kanban, lead, meus-leads). Evita uma requisição por componente montado.
let cache: PipelineGroupInfo[] | null = null;
let inFlight: Promise<PipelineGroupInfo[]> | null = null;

export function invalidatePipelineGroups() {
  cache = null;
  inFlight = null;
}

export async function fetchPipelineGroups(): Promise<PipelineGroupInfo[]> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = apiFetch("/pipeline/active/groups")
      .then((g: PipelineGroupInfo[]) => {
        cache = Array.isArray(g) ? g : [];
        return cache;
      })
      .catch(() => {
        inFlight = null;
        return [];
      });
  }
  return inFlight;
}

/** Devolve as Etapas do tenant + atalhos de nome e cor por chave de grupo. */
export function usePipelineGroups() {
  const [groups, setGroups] = useState<PipelineGroupInfo[]>(cache ?? []);

  useEffect(() => {
    let alive = true;
    fetchPipelineGroups().then((g) => {
      if (alive) setGroups(g);
    });
    return () => {
      alive = false;
    };
  }, []);

  // useCallback porque estes entram em dependência de useMemo nas telas que
  // consomem o hook — sem identidade estável, tudo recalcularia a cada render.

  /** Nome da Etapa como o cliente batizou; cai na própria chave se não achar. */
  const groupName = useCallback(
    (key: string | null | undefined) => (key ? groups.find((g) => g.key === key)?.name : null) ?? key ?? "—",
    [groups],
  );

  /** Cor da Etapa escolhida na tela de configuração. */
  const colorOf = useCallback(
    (key: string | null | undefined) => {
      if (!key) return GROUP_PALETTE[0];
      const i = groups.findIndex((g) => g.key === key);
      return groupColor(groups[i]?.color, i >= 0 ? i : 0);
    },
    [groups],
  );

  return { groups, groupName, colorOf };
}
