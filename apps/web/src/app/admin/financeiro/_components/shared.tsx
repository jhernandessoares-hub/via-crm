"use client";

import { useEffect, useState } from "react";
import { maskMoney, moneyToMask, parseMoney } from "@/lib/format";
import { inputCls } from "../_lib/fin";

/** Input de moeda BRL: digitação em centavos, retorna number via onValue. */
export function MoneyInput({
  value,
  onValue,
  placeholder = "0,00",
  className,
  disabled,
}: {
  value: number | null | undefined;
  onValue: (n: number | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(moneyToMask(value));

  // Sincroniza quando o valor externo muda (ex.: abrir modal com registro)
  useEffect(() => {
    setText(moneyToMask(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined || value === null ? "" : Math.round((value as number) * 100)]);

  return (
    <div className={`relative ${className || ""}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        className={`${inputCls} pl-9 text-right`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const masked = maskMoney(e.target.value);
          setText(masked);
          onValue(masked ? parseMoney(masked) : undefined);
        }}
      />
    </div>
  );
}

/** Toast simples no padrão do projeto (canto inferior direito, some em 4s). */
export function Toast({ msg, onClose, error }: { msg: string; onClose: () => void; error?: boolean }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-[80] max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        error ? "bg-red-600" : "bg-slate-800"
      }`}
    >
      {msg}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const show = (msg: string, error = false) => setToast({ msg, error });
  const node = toast ? <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} /> : null;
  return { showToast: show, toastNode: node };
}

/** Overlay + card de modal no padrão admin. Fecha SOMENTE via botões (regra do projeto). */
export function AdminModal({
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <div className={`max-h-[90vh] w-full ${width} overflow-auto rounded-2xl bg-white p-6 shadow-xl`}>
        <h3 className="mb-4 text-lg font-semibold text-slate-800">{title}</h3>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Banner de erro dismissível (padrão ia/provedores). */
export function ErrorBanner({ error, onClose }: { error: string; onClose: () => void }) {
  if (!error) return null;
  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{error}</span>
      <button onClick={onClose} className="ml-4 text-red-400 hover:text-red-600">
        ✕
      </button>
    </div>
  );
}

/** Cabeçalho de página padrão do módulo. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Botão que abre o seletor de arquivo (input escondido — padrão do projeto). */
export function FileButton({
  accept,
  onSelect,
  busy,
  label,
  className,
}: {
  accept: string;
  onSelect: (file: File) => void;
  busy?: boolean;
  label: string;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  return (
    <label className={className} style={{ cursor: busy ? "wait" : "pointer" }}>
      <input
        key={key}
        type="file"
        accept={accept}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onSelect(f);
            setKey((k) => k + 1); // permite reenviar o mesmo arquivo
          }
        }}
      />
      {busy ? "Enviando..." : label}
    </label>
  );
}
