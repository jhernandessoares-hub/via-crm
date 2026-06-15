"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TIPOS_PADRAO_PENDENCIA, type PendenciaPessoa } from "./PendenciasModal";

interface PendenciaItem {
  id: string;
  descricao: string;
  origem: "DOCUMENTO" | "MANUAL";
  tipoDocumento?: string | null;
  participanteNome?: string | null;
  participanteClassificacao?: string | null;
  resolvida: boolean;
}

interface PendenciasPanelProps {
  leadId: string;
  pessoas: PendenciaPessoa[];
  canEdit: boolean;
  /** Sinal para recarregar (incrementado pelo pai após mover etapa). */
  reloadKey?: number;
}

export function PendenciasPanel({ leadId, pessoas, canEdit, reloadKey }: PendenciasPanelProps) {
  const [items, setItems] = useState<PendenciaItem[]>([]);
  const [observacao, setObservacao] = useState("");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pessoaIdx, setPessoaIdx] = useState(0);
  const [docTipo, setDocTipo] = useState(TIPOS_PADRAO_PENDENCIA[0].value);
  const [manualText, setManualText] = useState("");
  const obsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch(`/leads/${leadId}/pendencias`, { method: "GET" });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setObservacao(data?.observacao ?? "");
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (leadId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, reloadKey]);

  function pessoa(): PendenciaPessoa {
    return pessoas[pessoaIdx] ?? pessoas[0] ?? { nome: null, label: "Lead principal" };
  }

  async function addDoc() {
    const t = TIPOS_PADRAO_PENDENCIA.find((x) => x.value === docTipo);
    if (!t) return;
    const p = pessoa();
    try {
      const created = await apiFetch(`/leads/${leadId}/pendencias`, {
        method: "POST",
        body: JSON.stringify({ descricao: t.label, origem: "DOCUMENTO", tipoDocumento: t.value, participanteNome: p.nome, participanteClassificacao: p.classificacao ?? null }),
      });
      setItems((prev) => [...prev, created]);
    } catch (e: any) {
      alert(e?.message || "Erro ao adicionar pendência");
    }
  }

  async function addManual() {
    const d = manualText.trim();
    if (!d) return;
    const p = pessoa();
    try {
      const created = await apiFetch(`/leads/${leadId}/pendencias`, {
        method: "POST",
        body: JSON.stringify({ descricao: d, origem: "MANUAL", participanteNome: p.nome, participanteClassificacao: p.classificacao ?? null }),
      });
      setItems((prev) => [...prev, created]);
      setManualText("");
    } catch (e: any) {
      alert(e?.message || "Erro ao adicionar pendência");
    }
  }

  async function toggleResolvida(it: PendenciaItem) {
    try {
      const updated = await apiFetch(`/leads/${leadId}/pendencias/${it.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolvida: !it.resolvida }),
      });
      setItems((prev) => prev.map((x) => (x.id === it.id ? updated : x)));
    } catch (e: any) {
      alert(e?.message || "Erro ao atualizar pendência");
    }
  }

  async function remove(it: PendenciaItem) {
    try {
      await apiFetch(`/leads/${leadId}/pendencias/${it.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (e: any) {
      alert(e?.message || "Erro ao remover pendência");
    }
  }

  function onObservacaoChange(v: string) {
    setObservacao(v);
    if (obsTimer.current) clearTimeout(obsTimer.current);
    obsTimer.current = setTimeout(() => {
      apiFetch(`/leads/${leadId}/pendencias-observacao`, {
        method: "PATCH",
        body: JSON.stringify({ observacao: v }),
      }).catch(() => {});
    }, 700);
  }

  function pessoaLabel(it: PendenciaItem) {
    return it.participanteNome || "Lead principal";
  }

  const abertas = items.filter((i) => !i.resolvida).length;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-700/60 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
          📋 Pendências de documentação
          {abertas > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">{abertas} em aberto</span>
          )}
          {items.length > 0 && abertas === 0 && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">tudo resolvido</span>
          )}
        </span>
        <span className="text-amber-700 dark:text-amber-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {abertas > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Só é possível sair desta etapa quando todas as pendências estiverem resolvidas.
            </p>
          )}

          {/* Lista */}
          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma pendência registrada.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={it.resolvida}
                      disabled={!canEdit}
                      onChange={() => toggleResolvida(it)}
                      className="h-4 w-4"
                    />
                    <span className={it.resolvida ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}>
                      {it.origem === "DOCUMENTO" ? "📄 " : "📝 "}
                      {it.descricao}
                      <span className="ml-1 text-xs text-slate-400">· {pessoaLabel(it)}</span>
                    </span>
                  </label>
                  {canEdit && (
                    <button type="button" onClick={() => remove(it)} className="text-slate-400 hover:text-red-600" aria-label="Remover">
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Adicionar */}
          {canEdit && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-white/60 p-2 dark:border-neutral-700 dark:bg-neutral-900/40">
              <select
                value={pessoaIdx}
                onChange={(e) => setPessoaIdx(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
              >
                {pessoas.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <select
                  value={docTipo}
                  onChange={(e) => setDocTipo(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
                >
                  {TIPOS_PADRAO_PENDENCIA.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button type="button" onClick={addDoc} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800">
                  + Doc
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
                  placeholder="Outra pendência (texto livre)"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
                />
                <button type="button" onClick={addManual} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800">
                  + Item
                </button>
              </div>
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-900 dark:text-amber-200">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => onObservacaoChange(e.target.value)}
              disabled={!canEdit}
              rows={2}
              placeholder="Anotações livres sobre as pendências"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}
