"use client";

import { useEffect, useRef, useState } from "react";

const BARS = 28;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Indicador de gravação: ponto vermelho pulsando, cronômetro e barras que reagem ao volume da voz. */
export default function RecordingIndicator({ stream }: { stream: MediaStream | null }) {
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const historyRef = useRef<number[]>(Array(BARS).fill(0.08));

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!stream) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;

      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (now - last < 70) return;
        last = now;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        const level = Math.min(1, Math.max(0.08, (peak / 128) * 2.2));
        const h = historyRef.current;
        h.push(level);
        if (h.length > BARS) h.shift();
        setLevels([...h]);
      };
      raf = requestAnimationFrame(tick);
    } catch {}

    return () => {
      cancelAnimationFrame(raf);
      try {
        ctx?.close();
      } catch {}
    };
  }, [stream]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:bg-red-950/30 dark:border-red-900">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
      </span>
      <span className="text-sm font-medium text-red-700 tabular-nums">Gravando {fmt(seconds)}</span>
      <div className="flex h-8 flex-1 items-center justify-end gap-[3px]" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-red-500 transition-[height] duration-75"
            style={{ height: `${Math.round(l * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
