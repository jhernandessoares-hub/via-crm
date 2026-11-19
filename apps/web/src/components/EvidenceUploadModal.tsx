"use client";

import { useRef, useState } from "react";

// Tipos de documento de evidência (aparecem no cartão "Evidências de Status" do lead).
const DOC_TIPOS = [
  "Contrato de financiamento registrado",
  "Contrato de financiamento assinado",
  "Matrícula / certidão do imóvel",
  "E-mail",
  "Print / captura de tela",
  "Comprovante",
  "Outro",
] as const;

// Sugestão automática conforme o status de destino.
function defaultDocTipo(stageName: string): string {
  const s = (stageName || "").toLowerCase();
  if (s === "registrado") return "Contrato de financiamento registrado";
  if (s.includes("contrato assinado")) return "Contrato de financiamento assinado";
  return "";
}

interface EvidenceUploadModalProps {
  isOpen: boolean;
  stageName: string;
  isOwner?: boolean;
  needsDocument?: boolean; // status exige evidência (documento)
  needsReason?: boolean;   // status exige justificativa em texto
  onClose: () => void;
  onConfirm: (payload: { file?: File; motivo?: string; docLabel?: string }) => Promise<void>;
}

export function EvidenceUploadModal({
  isOpen,
  stageName,
  isOwner = false,
  needsDocument = true,
  needsReason = false,
  onClose,
  onConfirm,
}: EvidenceUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [motivo, setMotivo] = useState("");
  const [docTipo, setDocTipo] = useState(""); // "" = usa a sugestão automática do status
  const [docDesc, setDocDesc] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Regras: documento é obrigatório só para não-OWNER quando o status exige evidência.
  // Justificativa é obrigatória (de todos) quando o status exige motivo.
  // OWNER em status só-evidência (sem motivo): precisa de documento OU justificativa.
  const fileRequired = needsDocument && !isOwner;
  const motivoRequired = needsReason;
  const ownerNeedsOne = needsDocument && !needsReason && isOwner;
  // Campo de justificativa aparece quando exigido, ou para o OWNER poder substituir o documento.
  const showMotivo = needsReason || (needsDocument && isOwner);
  const showFile = needsDocument;

  const tipoEfetivo = docTipo || defaultDocTipo(stageName);
  const descObrigatoria = tipoEfetivo === "Outro";
  // Nome final do documento: "Tipo — descrição" (descrição é opcional, salvo em "Outro").
  const docLabel = file
    ? [tipoEfetivo === "Outro" ? "" : tipoEfetivo, docDesc.trim()].filter(Boolean).join(" — ") || undefined
    : undefined;

  function reset() {
    setFile(null);
    setDocTipo("");
    setDocDesc("");
    setMotivo("");
    setDragging(false);
    setLoading(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSubmit =
    (!motivoRequired || motivo.trim().length > 0) &&
    (!fileRequired || !!file) &&
    (!ownerNeedsOne || !!file || motivo.trim().length > 0) &&
    (!file || !descObrigatoria || docDesc.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) {
      setError("Preencha os campos obrigatórios para continuar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({ file: file ?? undefined, motivo: motivo.trim() || undefined, docLabel });
      reset();
    } catch (e: any) {
      setError(e?.message || "Erro ao registrar a movimentação.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const title = needsReason ? "Justificativa do status" : "Evidência obrigatória";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Para mover para{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">{stageName}</span>
            {needsReason && needsDocument && !isOwner
              ? " anexe um documento e descreva o motivo."
              : needsReason
              ? " descreva o motivo."
              : isOwner
              ? " anexe um documento ou informe uma justificativa."
              : " é necessário anexar uma evidência (print, documento ou e-mail)."}
          </p>
        </div>

        <div className="space-y-4">
          {/* Justificativa */}
          {showMotivo && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Justificativa{motivoRequired ? "" : " (opcional)"}
              </label>
              <textarea
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setError(null); }}
                rows={3}
                placeholder="Descreva o motivo desta mudança de status"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
              />
            </div>
          )}

          {/* Drop zone */}
          {showFile && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) { setFile(f); setError(null); }
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
                  if (f) { setFile(f); setError(null); }
                }}
              />
              {file ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">📎 {file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {fileRequired ? "Arraste o arquivo ou clique para selecionar" : "Anexar arquivo" + (isOwner ? " (opcional)" : "")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">PDF, imagem ou documento</p>
                </>
              )}
            </div>
          )}

          {/* O que é o documento — aparece no cartão "Evidências de Status" */}
          {showFile && file && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Que documento é este?
                </label>
                <select
                  value={tipoEfetivo}
                  onChange={(e) => { setDocTipo(e.target.value); setError(null); }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
                >
                  <option value="">Selecione…</option>
                  {DOC_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Descrição{descObrigatoria ? "" : " (opcional)"}
                </label>
                <input
                  type="text"
                  value={docDesc}
                  onChange={(e) => { setDocDesc(e.target.value); setError(null); }}
                  placeholder={descObrigatoria ? "Digite o que é o documento" : "Ex.: registrado em cartório em 12/11"}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

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
              disabled={loading || !canSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Confirmar transição"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
