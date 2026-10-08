"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, ChevronDown, ChevronUp, MessageSquareText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import MaskedValue from "@/components/MaskedValue";

type LeadComment = {
  id: string;
  userId: string | null;
  autorNome: string | null;
  texto: string;
  criadoEm: string;
  editadoEm: string | null;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Comentários internos da equipe sobre o lead (nunca enviados ao cliente).
 * Cartão fixo na coluna esquerda, acima das abas: mostra o mais recente e
 * expande para a lista completa.
 */
export default function LeadCommentsCard({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<LeadComment[]>([]);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; texto: string } | null>(null);
  const [deleting, setDeleting] = useState<LeadComment | null>(null);
  const [me, setMe] = useState<{ id: string | null; role: string | null }>({ id: null, role: null });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      setMe({ id: u?.id ?? u?.sub ?? null, role: u?.role ?? null });
    } catch {}
  }, []);

  async function load() {
    try {
      const r = await apiFetch(`/leads/${leadId}/comments`);
      setItems(Array.isArray(r?.items) ? r.items : []);
      setHidden(!!r?.hidden);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar comentários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  function grow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  async function add() {
    const texto = draft.trim();
    if (!texto || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const c = await apiFetch(`/leads/${leadId}/comments`, { method: "POST", body: JSON.stringify({ texto }) });
      setItems((prev) => [c, ...prev]);
      setDraft("");
      requestAnimationFrame(() => {
        grow(inputRef.current);
        inputRef.current?.focus();
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar comentário");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const texto = editing.texto.trim();
    if (!texto) return;
    setSaving(true);
    try {
      const c = await apiFetch(`/leads/${leadId}/comments/${editing.id}`, { method: "PATCH", body: JSON.stringify({ texto }) });
      setItems((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      setEditing(null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao editar comentário");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      await apiFetch(`/leads/${leadId}/comments/${deleting.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao apagar comentário");
    } finally {
      setSaving(false);
    }
  }

  const canChange = (c: LeadComment) =>
    me.role === "OWNER" || me.role === "MANAGER" || (!!c.userId && c.userId === me.id);

  const visible = expanded ? items : items.slice(0, 1);

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--shell-text)]">
          <MessageSquareText className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
          Comentários
          {items.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ background: "var(--brand-accent)" }}
            >
              {items.length}
            </span>
          )}
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 text-xs font-semibold hover:underline"
            style={{ color: "var(--brand-accent)" }}
          >
            {expanded ? (
              <>
                Recolher <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Ver todos <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      {hidden ? (
        <div className="mt-2 text-xs">
          <MaskedValue visible={false} width="10rem">{null}</MaskedValue>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="mt-2 text-xs text-[var(--shell-subtext)]">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="mt-1.5 text-xs text-[var(--shell-subtext)]">
              Nenhum comentário ainda. Anote aqui algo importante sobre este lead — só a equipe vê.
            </div>
          ) : (
            <div className={"mt-2 space-y-2 " + (expanded ? "max-h-60 overflow-y-auto pr-1" : "")}>
              {visible.map((c) => (
                <div
                  key={c.id}
                  className="group rounded-lg border px-2.5 py-2"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                >
                  <div className="whitespace-pre-wrap break-words text-sm text-[var(--shell-text)]">{c.texto}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--shell-subtext)]">
                      {(c.autorNome || "—") + " · " + fmt(c.criadoEm) + (c.editadoEm ? " · editado" : "")}
                    </span>
                    {canChange(c) && (
                      <span className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => setEditing({ id: c.id, texto: c.texto })}
                          className="rounded p-1 text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Apagar"
                          onClick={() => setDeleting(c)}
                          className="rounded p-1 text-[var(--shell-subtext)] hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                grow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  add();
                }
              }}
              readOnly={saving}
              placeholder="Escreva um comentário... (Enter salva)"
              className="flex-1 resize-none rounded-md border bg-[var(--shell-card-bg)] p-2 text-sm text-[var(--shell-text)]"
              style={{ borderColor: "var(--shell-card-border)" }}
            />
            <button
              type="button"
              onClick={add}
              disabled={saving || !draft.trim()}
              title="Adicionar comentário"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--brand-accent)" }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {err && <div className="mt-1.5 text-xs text-red-600">{err}</div>}
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar comentário"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-md border px-3 py-2 text-sm text-[var(--shell-text)]"
              style={{ borderColor: "var(--shell-card-border)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving || !editing?.texto.trim()}
              className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand-accent)" }}
            >
              Salvar
            </button>
          </>
        }
      >
        <textarea
          autoFocus
          rows={5}
          value={editing?.texto ?? ""}
          onChange={(e) => setEditing((prev) => (prev ? { ...prev, texto: e.target.value } : prev))}
          className="w-full resize-y rounded-md border bg-[var(--shell-card-bg)] p-2 text-sm text-[var(--shell-text)]"
          style={{ borderColor: "var(--shell-card-border)" }}
        />
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Apagar comentário?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded-md border px-3 py-2 text-sm text-[var(--shell-text)]"
              style={{ borderColor: "var(--shell-card-border)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={saving}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Apagar
            </button>
          </>
        }
      >
        <div className="whitespace-pre-wrap break-words rounded-md border p-2 text-sm text-[var(--shell-text)]" style={{ borderColor: "var(--shell-card-border)" }}>
          {deleting?.texto}
        </div>
      </Modal>
    </div>
  );
}
