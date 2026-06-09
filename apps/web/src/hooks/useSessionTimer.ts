"use client";

import { useEffect, useRef, useState } from "react";

function parseTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface UseSessionTimerOptions {
  onWarning?: () => void;
  onExpired?: () => void;
  warningAt?: number;
}

export function useSessionTimer({
  onWarning,
  onExpired,
  warningAt = 10,
}: UseSessionTimerOptions = {}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const stateRef = useRef({ warned: false, expired: false, lastExp: 0 });
  const onWarningRef = useRef(onWarning);
  const onExpiredRef = useRef(onExpired);
  onWarningRef.current = onWarning;
  onExpiredRef.current = onExpired;

  useEffect(() => {
    function readExp(): number | null {
      if (typeof window === "undefined") return null;
      const token = localStorage.getItem("accessToken");
      if (!token) return null;
      return parseTokenExp(token);
    }

    function tick() {
      const exp = readExp();
      if (!exp) {
        setSecondsLeft(null);
        return;
      }

      // Reseta flags quando o token é renovado (novo exp)
      if (exp !== stateRef.current.lastExp) {
        stateRef.current = { warned: false, expired: false, lastExp: exp };
      }

      const left = Math.floor((exp - Date.now()) / 1000);
      setSecondsLeft(left > 0 ? left : 0);

      if (left <= warningAt && left > 0 && !stateRef.current.warned) {
        stateRef.current.warned = true;
        onWarningRef.current?.();
      }

      if (left <= 0 && !stateRef.current.expired) {
        stateRef.current.expired = true;
        onExpiredRef.current?.();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [warningAt]);

  return { secondsLeft };
}
