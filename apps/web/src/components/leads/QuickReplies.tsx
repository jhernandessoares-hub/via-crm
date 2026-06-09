"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Template = {
  id: string;
  title: string;
  content: string;
};

type Props = {
  /** Insere o texto da mensagem no campo de digitação */
  onInsert: (text: string) => void;
};

export default function QuickReplies({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // editing: null = lista; "new" = criando; id = editando
  const [editing, setEditing] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  async function loadTemplates() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch("/message-templates");
      setTemplates(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar mensagens.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next && !loaded) loadTemplates();
      if (!next) resetForm();
      return next;
    });
  }

  function resetForm() {
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setErr(null);
  }

  function startCreate() {
    setEditing("new");
    setFormTitle("");
    setFormContent("");
    setErr(null);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  function startEdit(t: Template) {
    setEditing(t.id);
    setFormTitle(t.title);
    setFormContent(t.content);
    setErr(null);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  async function saveForm() {
    const title = formTitle.trim();
    const content = formContent.trim();
    if (!title || !content) {
      setErr("Preencha título e mensagem.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (editing === "new") {
        const created = await apiFetch("/message-templates", {
          method: "POST",
          body: JSON.stringify({ title, content }),
        });
        setTemplates((prev) => [...prev, created]);
      } else if (editing) {
        const updated = await apiFetch(`/message-templates/${editing}`, {
          method: "PATCH",
          body: JSON.stringify({ title, content }),
        });
        setTemplates((prev) => prev.map((t) => (t.id === editing ? updated : t)));
      }
      resetForm();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta mensagem padrão?")) return;
    try {
      await apiFetch(`/message-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir.");
    }
  }

  function pick(t: Template) {
    onInsert(t.content);
    setOpen(false);
    resetForm();
  }

  // Fecha ao apertar Esc
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        resetForm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        className="h-10 w-10 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center"
        title="Mensagens padrão"
        onClick={toggleOpen}
      >
        💬
      </button>

      {open ? (
        <>
          {/* overlay transparente para fechar ao clicar fora (dropdown de seleção) */}
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); resetForm(); }} />

          <div className="absolute bottom-12 left-0 z-40 w-80 rounded-lg border bg-[var(--shell-card-bg)] shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Mensagens padrão</div>
              {editing === null ? (
                <button
                  type="button"
                  className="h-7 w-7 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center text-lg leading-none"
                  title="Nova mensagem"
                  onClick={startCreate}
                >
                  +
                </button>
              ) : null}
            </div>

            {err ? (
              <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {err}
              </div>
            ) : null}

            {/* FORMULÁRIO (criar/editar) */}
            {editing !== null ? (
              <div className="space-y-2">
                <input
                  ref={titleInputRef}
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="Título (ex: Saudação inicial)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={80}
                />
                <textarea
                  className="w-full rounded-md border p-2 text-sm resize-none"
                  placeholder="Texto da mensagem..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-1.5 text-xs hover:bg-[var(--shell-bg)]"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-60"
                    onClick={saveForm}
                    disabled={saving || !formTitle.trim() || !formContent.trim()}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ) : (
              /* LISTA */
              <div className="max-h-72 overflow-y-auto space-y-1">
                {loading ? (
                  <div className="py-4 text-center text-xs text-[var(--shell-subtext)]">Carregando...</div>
                ) : templates.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--shell-subtext)]">
                    Nenhuma mensagem padrão ainda.
                    <br />
                    Clique em <span className="font-semibold">+</span> para criar.
                  </div>
                ) : (
                  templates.map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-start gap-2 rounded-md border p-2 hover:bg-[var(--shell-bg)]"
                    >
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => pick(t)}
                        title="Inserir no campo de mensagem"
                      >
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-[var(--shell-subtext)] line-clamp-2 whitespace-pre-wrap break-words">
                          {t.content}
                        </div>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center text-xs"
                          title="Editar"
                          onClick={() => startEdit(t)}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-md border bg-[var(--shell-card-bg)] hover:bg-red-50 flex items-center justify-center text-xs"
                          title="Excluir"
                          onClick={() => remove(t.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
