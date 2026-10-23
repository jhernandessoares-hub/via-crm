"use client";

import { useRef } from "react";

/** Acha o ancestral que rola (o <main> do AppShell); cai para a janela. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

const btn =
  "pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity shadow-sm";
const btnStyle = {
  background: "var(--shell-card-bg)",
  border: "1px solid var(--shell-card-border)",
  color: "var(--shell-subtext)",
} as const;

/** Botões discretos no canto direito: um no alto (vai ao topo) e um embaixo (vai ao fim). */
export function ScrollEdgeButtons() {
  const ref = useRef<HTMLDivElement>(null);

  function go(to: "top" | "bottom") {
    const sp = scrollParent(ref.current);
    if (sp) {
      sp.scrollTo({ top: to === "top" ? 0 : sp.scrollHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: to === "top" ? 0 : document.body.scrollHeight, behavior: "smooth" });
    }
  }

  return (
    <div ref={ref} className="pointer-events-none fixed right-4 top-20 bottom-4 z-30 flex flex-col justify-between">
      <button type="button" aria-label="Ir para o topo" title="Ir para o topo" onClick={() => go("top")} className={btn} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /><path d="M6 20h12" /></svg>
      </button>
      <button type="button" aria-label="Ir para o fim" title="Ir para o fim" onClick={() => go("bottom")} className={btn} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12" /><path d="M6 9l6 6 6-6" /></svg>
      </button>
    </div>
  );
}
