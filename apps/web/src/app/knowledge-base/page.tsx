"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type KnowledgeBaseType =
  | "PERSONALIDADE"
  | "FINANCIAMENTO"
  | "PRODUTO"
  | "REGRAS"
  | "MERCADO";

type KnowledgeBaseAudience = "ATENDIMENTO" | "INTERNO" | "AMBOS";

type KbDocument = {
  id: string;
  url: string;
  title?: string | null;
  extractedText?: string | null;
  createdAt: string;
};

type KbVideo = {
  id: string;
  url: string;
  title?: string | null;
  description?: string | null;
  createdAt: string;
};

type KbLink = {
  id: string;
  url: string;
  title?: string | null;
  description?: string | null;
  createdAt: string;
};

type KnowledgeBaseItem = {
  id: string;
  tenantId: string;
  title: string;
  type: KnowledgeBaseType;
  prompt: string;
  whatAiUnderstood?: string | null;
  exampleOutput?: string | null;
  tags: string[];
  audience: KnowledgeBaseAudience;
  active: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  documents: KbDocument[];
  videos: KbVideo[];
  kbLinks: KbLink[];
};

type MainForm = {
  title: string;
  type: KnowledgeBaseType;
  prompt: string;
  whatAiUnderstood: string;
  exampleOutput: string;
  tagsText: string;
  audience: KnowledgeBaseAudience;
  active: boolean;
  priority: string;
  version: string;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function typeLabel(type: KnowledgeBaseType) {
  const map: Record<KnowledgeBaseType, string> = {
    PERSONALIDADE: "Personalidade",
    FINANCIAMENTO: "Financiamento",
    PRODUTO: "Produto",
    REGRAS: "Regras",
    MERCADO: "Mercado",
  };
  return map[type] ?? type;
}

function audienceLabel(audience: KnowledgeBaseAudience) {
  if (audience === "ATENDIMENTO") return "Atendimento";
  if (audience === "INTERNO") return "Interno";
  return "Ambos";
}

function buildTags(value: string) {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function formFromItem(item: KnowledgeBaseItem): MainForm {
  return {
    title: item.title ?? "",
    type: item.type,
    prompt: item.prompt ?? "",
    whatAiUnderstood: item.whatAiUnderstood ?? "",
    exampleOutput: item.exampleOutput ?? "",
    tagsText: Array.isArray(item.tags) ? item.tags.join(", ") : "",
    audience: item.audience,
    active: item.active,
    priority: String(item.priority ?? 0),
    version: String(item.version ?? 1),
  };
}

const INITIAL_FORM: MainForm = {
  title: "",
  type: "PERSONALIDADE",
  prompt: "",
  whatAiUnderstood: "",
  exampleOutput: "",
  tagsText: "",
  audience: "AMBOS",
  active: true,
  priority: "0",
  version: "1",
};

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeBaseItem | null>(null);
  const [form, setForm] = useState<MainForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBaseItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Media sections state (only in edit mode)
  const [docTitle, setDocTitle] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoForm, setVideoForm] = useState({ url: "", title: "", description: "" });
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const [linkForm, setLinkForm] = useState({ url: "", title: "", description: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  // ──────────────────────────────────────────────
  // Data loading
  // ──────────────────────────────────────────────

  async function loadItems(searchValue?: string) {
    try {
      setLoading(true);
      setError("");

      const query = searchValue?.trim()
        ? `/knowledge-base?search=${encodeURIComponent(searchValue.trim())}`
        : "/knowledge-base";

      const data = await apiFetch(query);
      setItems(Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : []);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar base de conhecimento.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function reloadEditingItem(id: string) {
    try {
      const data = await apiFetch(`/knowledge-base/${id}`);
      setEditingItem(data);
      // Sync in list too
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
    } catch (_) {}
  }

  useEffect(() => {
    loadItems();
  }, []);

  const totalAtivos = useMemo(() => items.filter((i) => i.active).length, [items]);

  // ──────────────────────────────────────────────
  // Main form
  // ──────────────────────────────────────────────

  function startCreate() {
    if (showForm && !editingItem) {
      resetAndClose();
      return;
    }
    setFormError("");
    setEditingItem(null);
    setForm(INITIAL_FORM);
    setShowForm(true);
  }

  function startEdit(item: KnowledgeBaseItem) {
    setFormError("");
    setEditingItem(item);
    setForm(formFromItem(item));
    setShowForm(true);
    resetMediaForms();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetAndClose() {
    setForm(INITIAL_FORM);
    setFormError("");
    setShowForm(false);
    setEditingItem(null);
    resetMediaForms();
  }

  function resetMediaForms() {
    setDocTitle("");
    setDocError("");
    setVideoForm({ url: "", title: "", description: "" });
    setVideoError("");
    setEditingVideoId(null);
    setLinkForm({ url: "", title: "", description: "" });
    setLinkError("");
    setEditingLinkId(null);
  }

  async function handleSave() {
    setFormError("");

    if (!form.title.trim()) { setFormError("Informe o título."); return; }
    if (!form.prompt.trim()) { setFormError("Informe o prompt."); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        prompt: form.prompt.trim(),
        whatAiUnderstood: form.whatAiUnderstood.trim() || undefined,
        exampleOutput: form.exampleOutput.trim() || undefined,
        tags: buildTags(form.tagsText),
        audience: form.audience,
        active: form.active,
        priority: Number(form.priority || 0),
        version: Number(form.version || 1),
      };

      let saved: KnowledgeBaseItem;
      if (editingItem) {
        saved = await apiFetch(`/knowledge-base/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setEditingItem(saved);
        setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      } else {
        saved = await apiFetch("/knowledge-base", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setItems((prev) => [saved, ...prev]);
        // Switch to edit mode so media sections are available
        setEditingItem(saved);
        setForm(formFromItem(saved));
      }
    } catch (err: any) {
      setFormError(err?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ──────────────────────────────────────────────
  // Delete
  // ──────────────────────────────────────────────

  function openDeleteModal(item: KnowledgeBaseItem) {
    setDeleteTarget(item);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== deleteTarget.title.trim()) {
      setDeleteError("Digite o título exato para confirmar.");
      return;
    }

    setDeleting(true);
    try {
      await apiFetch(`/knowledge-base/${deleteTarget.id}`, { method: "DELETE" });
      if (editingItem?.id === deleteTarget.id) resetAndClose();
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.message || "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  // ──────────────────────────────────────────────
  // Documents
  // ──────────────────────────────────────────────

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingItem) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setDocError("");
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (docTitle.trim()) fd.append("title", docTitle.trim());

      await apiFetch(`/knowledge-base/${editingItem.id}/documents`, {
        method: "POST",
        body: fd,
      });
      setDocTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setDocError(err?.message || "Erro ao enviar PDF.");
    } finally {
      setDocUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!editingItem) return;
    try {
      await apiFetch(`/knowledge-base/${editingItem.id}/documents/${docId}`, { method: "DELETE" });
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setDocError(err?.message || "Erro ao remover documento.");
    }
  }

  // ──────────────────────────────────────────────
  // Videos
  // ──────────────────────────────────────────────

  async function handleSaveVideo() {
    if (!editingItem) return;
    setVideoError("");

    if (!videoForm.url.trim()) { setVideoError("URL do vídeo é obrigatória."); return; }

    setVideoSaving(true);
    try {
      if (editingVideoId) {
        await apiFetch(`/knowledge-base/${editingItem.id}/videos/${editingVideoId}`, {
          method: "PATCH",
          body: JSON.stringify({
            url: videoForm.url.trim(),
            title: videoForm.title.trim() || null,
            description: videoForm.description.trim() || null,
          }),
        });
      } else {
        await apiFetch(`/knowledge-base/${editingItem.id}/videos`, {
          method: "POST",
          body: JSON.stringify({
            url: videoForm.url.trim(),
            title: videoForm.title.trim() || undefined,
            description: videoForm.description.trim() || undefined,
          }),
        });
      }
      setVideoForm({ url: "", title: "", description: "" });
      setEditingVideoId(null);
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setVideoError(err?.message || "Erro ao salvar vídeo.");
    } finally {
      setVideoSaving(false);
    }
  }

  async function handleDeleteVideo(videoId: string) {
    if (!editingItem) return;
    try {
      await apiFetch(`/knowledge-base/${editingItem.id}/videos/${videoId}`, { method: "DELETE" });
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setVideoError(err?.message || "Erro ao remover vídeo.");
    }
  }

  function startEditVideo(v: KbVideo) {
    setEditingVideoId(v.id);
    setVideoForm({ url: v.url, title: v.title ?? "", description: v.description ?? "" });
    setVideoError("");
  }

  // ──────────────────────────────────────────────
  // Links
  // ──────────────────────────────────────────────

  async function handleSaveLink() {
    if (!editingItem) return;
    setLinkError("");

    if (!linkForm.url.trim()) { setLinkError("URL do link é obrigatória."); return; }

    setLinkSaving(true);
    try {
      if (editingLinkId) {
        await apiFetch(`/knowledge-base/${editingItem.id}/links/${editingLinkId}`, {
          method: "PATCH",
          body: JSON.stringify({
            url: linkForm.url.trim(),
            title: linkForm.title.trim() || null,
            description: linkForm.description.trim() || null,
          }),
        });
      } else {
        await apiFetch(`/knowledge-base/${editingItem.id}/links`, {
          method: "POST",
          body: JSON.stringify({
            url: linkForm.url.trim(),
            title: linkForm.title.trim() || undefined,
            description: linkForm.description.trim() || undefined,
          }),
        });
      }
      setLinkForm({ url: "", title: "", description: "" });
      setEditingLinkId(null);
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setLinkError(err?.message || "Erro ao salvar link.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleDeleteLink(linkId: string) {
    if (!editingItem) return;
    try {
      await apiFetch(`/knowledge-base/${editingItem.id}/links/${linkId}`, { method: "DELETE" });
      await reloadEditingItem(editingItem.id);
    } catch (err: any) {
      setLinkError(err?.message || "Erro ao remover link.");
    }
  }

  function startEditLink(l: KbLink) {
    setEditingLinkId(l.id);
    setLinkForm({ url: l.url, title: l.title ?? "", description: l.description ?? "" });
    setLinkError("");
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  return (
    <AppShell title="Base do Conhecimento">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Base do Conhecimento</h1>
            <p className="mt-1 text-sm text-gray-600">Gerencie as bases usadas pelos AI Agents.</p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showForm && !editingItem ? "Fechar" : "Criar"}
          </button>
        </div>

        {/* Form panel */}
        {showForm && (
          <div className="rounded-xl border bg-white p-4 space-y-6">
            {/* Main fields */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                {editingItem ? "Editar Base de Conhecimento" : "Nova Base de Conhecimento"}
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Ex: Tom de atendimento popular"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as KnowledgeBaseType }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="PERSONALIDADE">Personalidade</option>
                    <option value="FINANCIAMENTO">Financiamento</option>
                    <option value="PRODUTO">Produto</option>
                    <option value="REGRAS">Regras</option>
                    <option value="MERCADO">Mercado</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Prompt</label>
                  <textarea
                    value={form.prompt}
                    onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))}
                    rows={5}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Descreva o conhecimento principal que a IA deve usar."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">O que a IA entendeu</label>
                  <textarea
                    value={form.whatAiUnderstood}
                    onChange={(e) => setForm((p) => ({ ...p, whatAiUnderstood: e.target.value }))}
                    rows={4}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Resumo interno do entendimento esperado."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Exemplo de resposta</label>
                  <textarea
                    value={form.exampleOutput}
                    onChange={(e) => setForm((p) => ({ ...p, exampleOutput: e.target.value }))}
                    rows={4}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Exemplo de saída esperada."
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tags (separadas por vírgula)</label>
                  <input
                    value={form.tagsText}
                    onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="atendimento, whatsapp, popular"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Audiência</label>
                  <select
                    value={form.audience}
                    onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value as KnowledgeBaseAudience }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="ATENDIMENTO">Atendimento</option>
                    <option value="INTERNO">Interno</option>
                    <option value="AMBOS">Ambos</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Prioridade</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    min={0}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Versão</label>
                  <input
                    type="number"
                    value={form.version}
                    onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    min={1}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                    />
                    Base ativa
                  </label>
                </div>
              </div>

              {formError && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Salvando..." : editingItem ? "Salvar alterações" : "Salvar base"}
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Media sections — only in edit mode */}
            {editingItem && (
              <>
                <hr />

                {/* ── PDFs ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Documentos PDF ({editingItem.documents?.length ?? 0})
                  </h3>

                  {editingItem.documents?.length > 0 && (
                    <div className="mb-3 divide-y rounded-lg border">
                      {editingItem.documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">
                              {doc.title || "Sem título"}
                            </span>
                            {doc.extractedText && (
                              <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
                                texto extraído
                              </span>
                            )}
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-xs text-slate-500 hover:underline"
                            >
                              abrir
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="ml-3 shrink-0 text-xs text-red-500 hover:text-red-700"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-gray-600">Título (opcional)</label>
                      <input
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="Ex: Memorial descritivo"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Arquivo PDF</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleDocUpload}
                        disabled={docUploading}
                        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-60"
                      />
                    </div>
                    {docUploading && <span className="text-xs text-gray-500">Enviando...</span>}
                  </div>

                  {docError && (
                    <p className="mt-2 text-xs text-red-600">{docError}</p>
                  )}
                </div>

                <hr />

                {/* ── Vídeos ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Vídeos ({editingItem.videos?.length ?? 0})
                  </h3>

                  {editingItem.videos?.length > 0 && (
                    <div className="mb-3 divide-y rounded-lg border">
                      {editingItem.videos.map((v) => (
                        <div key={v.id} className="px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {v.title && <p className="font-medium text-gray-800">{v.title}</p>}
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-xs text-slate-500 hover:underline"
                              >
                                {v.url}
                              </a>
                              {v.description && (
                                <p className="mt-0.5 text-xs text-gray-600">{v.description}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => startEditVideo(v)}
                                className="text-xs text-slate-500 hover:text-slate-700"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVideo(v.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">URL do vídeo *</label>
                      <input
                        value={videoForm.url}
                        onChange={(e) => setVideoForm((p) => ({ ...p, url: e.target.value }))}
                        placeholder="https://youtube.com/..."
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Título</label>
                      <input
                        value={videoForm.title}
                        onChange={(e) => setVideoForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Ex: Tour do empreendimento"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Descrição</label>
                      <input
                        value={videoForm.description}
                        onChange={(e) => setVideoForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Ex: Apresentação completa"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  {videoError && <p className="mt-2 text-xs text-red-600">{videoError}</p>}

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveVideo}
                      disabled={videoSaving}
                      className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                      {videoSaving ? "Salvando..." : editingVideoId ? "Salvar edição" : "Adicionar vídeo"}
                    </button>
                    {editingVideoId && (
                      <button
                        type="button"
                        onClick={() => { setEditingVideoId(null); setVideoForm({ url: "", title: "", description: "" }); }}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                      >
                        Cancelar edição
                      </button>
                    )}
                  </div>
                </div>

                <hr />

                {/* ── Links ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Links ({editingItem.kbLinks?.length ?? 0})
                  </h3>

                  {editingItem.kbLinks?.length > 0 && (
                    <div className="mb-3 divide-y rounded-lg border">
                      {editingItem.kbLinks.map((l) => (
                        <div key={l.id} className="px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {l.title && <p className="font-medium text-gray-800">{l.title}</p>}
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-xs text-slate-500 hover:underline"
                              >
                                {l.url}
                              </a>
                              {l.description && (
                                <p className="mt-0.5 text-xs text-gray-600">{l.description}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => startEditLink(l)}
                                className="text-xs text-slate-500 hover:text-slate-700"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLink(l.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">URL *</label>
                      <input
                        value={linkForm.url}
                        onChange={(e) => setLinkForm((p) => ({ ...p, url: e.target.value }))}
                        placeholder="https://site.com/pagina"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Título</label>
                      <input
                        value={linkForm.title}
                        onChange={(e) => setLinkForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Ex: Site do empreendimento"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Descrição</label>
                      <input
                        value={linkForm.description}
                        onChange={(e) => setLinkForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Ex: Página oficial com plantas"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  {linkError && <p className="mt-2 text-xs text-red-600">{linkError}</p>}

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveLink}
                      disabled={linkSaving}
                      className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                      {linkSaving ? "Salvando..." : editingLinkId ? "Salvar edição" : "Adicionar link"}
                    </button>
                    {editingLinkId && (
                      <button
                        type="button"
                        onClick={() => { setEditingLinkId(null); setLinkForm({ url: "", title: "", description: "" }); }}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                      >
                        Cancelar edição
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Total</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{items.length}</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Ativas</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{totalAtivos}</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Busca atual</div>
            <div className="mt-2 text-sm font-medium text-gray-900">
              {search.trim() ? search.trim() : "Sem filtro"}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loadItems(search); }}
              placeholder="Buscar por título, prompt, entendimento, exemplo ou tag"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={() => loadItems(search)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => { setSearch(""); loadItems(""); }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-medium text-gray-900">Itens cadastrados</div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-gray-600">Carregando...</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-600">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">Nenhuma base de conhecimento encontrada.</div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
                        <span className="rounded-full border px-2 py-0.5 text-xs text-gray-700">
                          {typeLabel(item.type)}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-xs text-gray-700">
                          {audienceLabel(item.audience)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            item.active
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-gray-200 bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.active ? "Ativa" : "Inativa"}
                        </span>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 line-clamp-3">
                        {item.prompt}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Prioridade: {item.priority}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Versão: {item.version}
                        </span>
                        {item.documents?.length > 0 && (
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">
                            {item.documents.length} PDF{item.documents.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {item.videos?.length > 0 && (
                          <span className="rounded-md bg-purple-50 px-2 py-1 text-xs text-purple-700">
                            {item.videos.length} vídeo{item.videos.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {item.kbLinks?.length > 0 && (
                          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            {item.kbLinks.length} link{item.kbLinks.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {item.tags?.length > 0 && (
                          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {item.tags.length} tag{item.tags.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      {item.tags?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span
                              key={`${item.id}-${tag}`}
                              className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteModal(item)}
                        className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h2>
              <p className="mt-2 text-sm text-gray-700">
                Você está prestes a excluir esta base de conhecimento:
              </p>
              <div className="mt-3 rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-900">
                <b>{deleteTarget.title}</b>
              </div>
              <p className="mt-3 text-sm text-red-600">Esta ação não pode ser desfeita.</p>
              <p className="mt-3 text-sm text-gray-700">
                Para confirmar, digite o título exato da base:
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mt-3 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder={deleteTarget.title}
              />
              {deleteError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
