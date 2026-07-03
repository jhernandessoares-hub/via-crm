"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sp9_cookie_consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function aceitar() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-slate-600">
          Usamos cookies para melhorar sua experiência neste site. Ao continuar navegando, você concorda com o uso de
          cookies.
        </p>
        <button
          onClick={aceitar}
          className="shrink-0 rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Aceitar
        </button>
      </div>
    </div>
  );
}
