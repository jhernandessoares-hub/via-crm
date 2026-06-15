"use client";

import { useState } from "react";

// Tipos de documento padrão (espelha TIPOS_PADRAO de leads/[id]/documentos/page.tsx)
export const TIPOS_PADRAO_PENDENCIA: { value: string; label: string }[] = [
  { value: "RG_CNH", label: "RG / CNH" },
  { value: "CPF", label: "CPF" },
  { value: "COMP_RESIDENCIA", label: "Comprovante de Residência" },
  { value: "COMP_RENDA", label: "Comprovante de Renda" },
  { value: "FGTS", label: "Extrato FGTS" },
  { value: "DECL_IR", label: "Declaração de IR" },
  { value: "CERT_ESTADO_CIVIL", label: "Certidão (nasc./casamento)" },
  { value: "CONTRATO_TRABALHO", label: "Contrato de Trabalho" },
  { value: "OUTRO", label: "Outro" },
];

export interface PendenciaDraft {
  descricao: string;
  origem: "DOCUMENTO" | "MANUAL";
  tipoDocumento?: string | null;
  participanteNome?: string | null;
  participanteClassificacao?: string | null;
}

// Pessoa a quem a pendência se refere. nome=null → lead principal.
export interface PendenciaPessoa {
  nome: string | null;
  label: string;
  classificacao?: string | null;
}

interface PendenciasModalProps {
  isOpen: boolean;
  stageName: string;
  pessoas: PendenciaPessoa[];
  onClose: () => void;
  onConfirm: (payload: { items: PendenciaDraft[]; observacao: string }) => Promise<void>;
}

export function PendenciasModal({ isOpen, stageName, pessoas, onClose, onConfirm }: PendenciasModalProps) {
  const [items, setItems] = useState<PendenciaDraft[]>([]);
  const [observacao, setObservacao] = useState("");
  const [pessoaIdx, setPessoaIdx] = useState(0);
  const [docTipo, setDocTipo] = useState(TIPOS_PADRAO_PENDENCIA[0].value);
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setItems([]);
    setObservacao("");
    setPessoaIdx(0);
    setDocTipo(TIPOS_PADRAO_PENDENCIA[0].value);
    setManualText("");
    setLoading(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pessoa(): PendenciaPessoa {
    return pessoas[pessoaIdx] ?? pessoas[0] ?? { nome: null, label: "Lead principal" };
  }

  function addDoc() {
    const t = TIPOS_PADRAO_PENDENCIA.find((x) => x.value === docTipo);
    if (!t) return;
    const p = pessoa();
    setItems((prev) => [
      ...prev,
      { descricao: t.label, origem: "DOCUMENTO", tipoDocumento: t.value, participanteNome: p.nome, participanteClassificacao: p.classificacao ?? null },
    ]);
    setError(null);
  }

  function addManual() {
    const d = manualText.trim();
    if (!d) return;
    const p = pessoa();
    setItems((prev) => [
      ...prev,
      { descricao: d, origem: "MANUAL", participanteNome: p.nome, participanteClassificacao: p.classificacao ?? null },
    ]);
    setManualText("");
    setError(null);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function pessoaLabel(it: PendenciaDraft) {
    if (!it.participanteNome) return "Lead principal";
    return it.participanteNome;
  }

  async function handleSubmit() {
    if (items.length === 0) {
      setError("Adicione ao menos uma pendência para continuar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({ items, observacao: observacao.trim() });
      reset();
    } catch (e: any) {
      setError(e?.message || "Erro ao registrar as pendências.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pendências de documentação</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Para mover para <span className="font-medium text-slate-700 dark:text-slate-200">{stageName}</span>, registre o que está
            faltando e de quem. Você poderá acompanhar e dar baixa depois.
          </p>
        </div>

        <div className="space-y-4">
          {/* A quem se refere */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">A quem se refere</label>
            <select
              value={pessoaIdx}
              onChange={(e) => setPessoaIdx(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
            >
              {pessoas.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Documento faltando */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Documento faltando</label>
            <div className="flex gap-2">
              <select
                value={docTipo}
                onChange={(e) => setDocTipo(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
              >
                {TIPOS_PADRAO_PENDENCIA.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addDoc}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Pendência manual */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Outra pendência (texto livre)</label>
            <div className="flex gap-2">
              <input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                placeholder="Ex.: assinatura do cônjuge no contrato"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={addManual}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Lista de pendências adicionadas */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Pendências registradas ({items.length})
            </p>
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-400 dark:border-neutral-700">
                Nenhuma pendência adicionada ainda.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((it, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-neutral-700">
                    <span className="text-slate-700 dark:text-slate-200">
                      {it.origem === "DOCUMENTO" ? "📄 " : "📝 "}
                      {it.descricao}
                      <span className="ml-1 text-xs text-slate-400">· {pessoaLabel(it)}</span>
                    </span>
                    <button type="button" onClick={() => removeItem(idx)} className="ml-2 text-slate-400 hover:text-red-600" aria-label="Remover">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Observação */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Anotações livres sobre as pendências"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
            />
          </div>

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
              disabled={loading || items.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Registrando..." : "Registrar e mover"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
