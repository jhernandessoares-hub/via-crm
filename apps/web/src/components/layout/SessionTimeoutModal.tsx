"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  initialSeconds: number;
  onRenew: () => void;
  onLogout: () => void;
}

export function SessionTimeoutModal({ initialSeconds, onRenew, onLogout }: Props) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      onLogoutRef.current();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border shadow-2xl p-6 space-y-4"
        style={{
          background: "var(--shell-card-bg, #fff)",
          borderColor: "var(--shell-card-border, #E5E7EB)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            ⚠️
          </span>
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--shell-text, #111)" }}
          >
            Sessão expirando
          </h2>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: "var(--shell-subtext, #6B7280)" }}>
          Sua sessão vai encerrar em{" "}
          <span className="font-bold tabular-nums" style={{ color: "#EF4444" }}>
            {seconds}s
          </span>
          . Deseja continuar conectado?
        </p>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onLogout}
            className="flex-1 h-10 rounded-xl border text-sm font-medium transition-colors"
            style={{
              borderColor: "var(--shell-card-border, #E5E7EB)",
              color: "var(--shell-subtext, #6B7280)",
              background: "transparent",
            }}
          >
            Sair agora
          </button>
          <button
            onClick={onRenew}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#1D9E75" }}
          >
            Renovar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
