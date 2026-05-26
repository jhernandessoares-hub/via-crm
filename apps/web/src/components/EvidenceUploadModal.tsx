"use client";

import { useRef, useState } from "react";

interface EvidenceUploadModalProps {
  isOpen: boolean;
  stageName: string;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
}

export function EvidenceUploadModal({
  isOpen,
  stageName,
  onClose,
  onConfirm,
}: EvidenceUploadModalProps) {
  const [phase, setPhase] = useState<"confirm" | "upload">("confirm");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase("confirm");
    setFile(null);
    setDragging(false);
    setLoading(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileChange(f: File) {
    setFile(f);
    setError(null);
  }

  async function handleSubmit() {
    if (!file) {
      setError("Selecione um arquivo para continuar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(file);
      reset();
    } catch (e: any) {
      setError(e?.message || "Erro ao enviar evidência.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Evidência obrigatória
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Para mover para{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {stageName}
            </span>{" "}
            é necessário anexar uma evidência (print, documento ou e-mail).
          </p>
        </div>

        {/* Phase: confirm */}
        {phase === "confirm" && (
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setPhase("upload")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sim, tenho a evidência
            </button>
          </div>
        )}

        {/* Phase: upload */}
        {phase === "upload" && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFileChange(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
                dragging
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-950"
                  : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50 dark:border-neutral-700 dark:bg-neutral-800"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChange(f);
                }}
              />
              {file ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  📎 {file.name}
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Arraste o arquivo ou clique para selecionar
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    PDF, imagem ou documento
                  </p>
                </>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!file || loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Confirmar transição"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
