"use client";

/**
 * Botão simples de upload de arquivo único. Não existe um componente de
 * upload genérico já pronto no frontend (o upload de documentos de lead usa
 * um fluxo mais elaborado embutido em `leads/[id]/page.tsx`, arquivo fora de
 * escopo desta fase). Implementado aqui como input de arquivo + callback —
 * quem chama monta o `FormData` e faz o POST via `apiFetch`.
 */

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";

export function FileUploadButton({
  label = "Selecionar arquivo",
  accept,
  disabled,
  onSelect,
}: {
  label?: string;
  accept?: string;
  disabled?: boolean;
  onSelect: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      await onSelect(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {busy ? "Enviando..." : label}
      </button>
      {fileName && !busy && (
        <span className="text-xs truncate max-w-[160px]" style={{ color: "var(--shell-subtext)" }}>
          {fileName}
        </span>
      )}
    </div>
  );
}
