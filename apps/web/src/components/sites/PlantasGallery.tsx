"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Grade de plantas do site SIM José Bonifácio com visualizador em tela cheia:
 * navegação entre plantas (setas/teclado/swipe), zoom (+/−, duplo clique, roda
 * do mouse) e arrastar quando ampliada. Fecha só pelo X ou Esc (padrão do
 * projeto: modal não fecha clicando fora).
 */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

export function PlantasGallery({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  const open = index !== null;

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i === null ? i : (i + delta + images.length) % images.length));
      resetZoom();
    },
    [images.length, resetZoom],
  );

  const zoom = useCallback((delta: number) => {
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setIndex(null);
    resetZoom();
  }, [resetZoom]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoom(STEP);
      else if (e.key === "-") zoom(-STEP);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, go, zoom]);

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/25 disabled:opacity-30";

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Ampliar planta ${i + 1}`}
            className="group relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <Image src={src} alt={`Planta ${i + 1}`} fill unoptimized className="object-contain p-1" />
            <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-80 transition group-hover:opacity-100">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
              </svg>
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Planta ${index + 1} de ${images.length}`}
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
        >
          <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
            <span className="text-sm font-medium">
              Planta {index + 1} de {images.length}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className={btn} onClick={() => zoom(-STEP)} disabled={scale <= MIN_SCALE} aria-label="Diminuir zoom">
                −
              </button>
              <button type="button" className={btn} onClick={() => zoom(STEP)} disabled={scale >= MAX_SCALE} aria-label="Aumentar zoom">
                +
              </button>
              <button type="button" className={btn} onClick={close} aria-label="Fechar">
                ×
              </button>
            </div>
          </div>

          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden"
            onWheel={(e) => zoom(e.deltaY < 0 ? STEP : -STEP)}
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start === null || scale !== 1) return;
              const dx = e.changedTouches[0].clientX - start;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[index]}
              alt={`Planta ${index + 1}`}
              draggable={false}
              onDoubleClick={() => (scale > 1 ? resetZoom() : setScale(2))}
              onPointerDown={(e) => {
                if (scale === 1) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setOffset({ x: d.ox + (e.clientX - d.x) / scale, y: d.oy + (e.clientY - d.y) / scale });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              className={`max-h-full max-w-full select-none object-contain transition-transform duration-100 ${
                scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
              style={{ transform: `scale(${scale}) translate(${offset.x}px, ${offset.y}px)`, touchAction: scale > 1 ? "none" : "pan-y" }}
            />

            {images.length > 1 && (
              <>
                <button type="button" className={`${btn} absolute left-3 top-1/2 z-10 -translate-y-1/2`} onClick={() => go(-1)} aria-label="Planta anterior">
                  ‹
                </button>
                <button type="button" className={`${btn} absolute right-3 top-1/2 z-10 -translate-y-1/2`} onClick={() => go(1)} aria-label="Próxima planta">
                  ›
                </button>
              </>
            )}
          </div>

          <p className="relative z-10 px-4 py-3 text-center text-xs text-white/60" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
            Use + e − ou dê dois cliques para ampliar · arraste para mover
          </p>
        </div>
      )}
    </>
  );
}
