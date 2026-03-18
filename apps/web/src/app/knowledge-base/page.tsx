"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type KnowledgeBaseType =
  | "PERSONALIDADE"
  | "FINANCIAMENTO"
  | "PRODUTO"
  | "REGRAS"
  | "MERCADO";

type KnowledgeBaseAudience = "ATENDIMENTO" | "INTERNO" | "AMBOS";

type KnowledgeBaseItem = {
  id: string;
  tenantId: string;
  title: string;
  type: KnowledgeBaseType;
  prompt: string;
  links: string[];
  whatAiUnderstood?: string | null;
  exampleOutput?: string | null;
  tags: string[];
  audience: KnowledgeBaseAudience;
  active: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type CreateForm = {
  title: string;
  type: KnowledgeBaseType;
  prompt: string;
  linksText: string;
  whatAiUnderstood: string;
  exampleOutput: string;
  tagsText: string;
  audience: KnowledgeBaseAudience;
  active: boolean;
  priority: string;
  version: string;
};

function typeLabel(type: KnowledgeBaseType) {
  if (type === "PERSONALIDADE") return "Personalidade";
  if (type === "FINANCIAMENTO") return "Financiamento";
  if (type === "PRODUTO") return "Produto";
  if (type === "REGRAS") return "Regras";
  return "Mercado";
}

function audienceLabel(audience: KnowledgeBaseAudience) {
  if (audience === "ATENDIMENTO") return "Atendimento";
  if (audience === "INTERNO") return "Interno";
  return "Ambos";
}

function buildStringArrayFromLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStringArrayFromComma(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formFromItem(item: KnowledgeBaseItem): CreateForm {
  return {
    title: item.title ?? "",
    type: item.type,
    prompt: item.prompt ?? "",
    linksText: Array.isArray(item.links) ? item.links.join("\n") : "",
    whatAiUnderstood: item.whatAiUnderstood ?? "",
    exampleOutput: item.exampleOutput ?? "",
    tagsText: Array.isArray(item.tags) ? item.tags.join(", ") : "",
    audience: item.audience,
    active: item.active,
    priority: String(item.priority ?? 0),
    version: String(item.version ?? 1),
  };
}

const INITIAL_FORM: CreateForm = {
  title: "",
  type: "PERSONALIDADE",
  prompt: "",
  linksText: "",
  whatAiUnderstood: "",
  exampleOutput: "",
  tagsText: "",
  audience: "AMBOS",
  active: true,
  priority: "0",
  version: "1",
};

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<CreateForm>(INITIAL_FORM);

  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBaseItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function loadItems(searchValue?: string) {
    try {
      setLoading(true);
      setError("");

      const query = searchValue?.trim()
        ? `/knowledge-base?search=${encodeURIComponent(searchValue.trim())}`
        : "/knowledge-base";

      const data = await apiFetch(query);

      if (Array.isArray(data)) {
        setItems(data);
        return;
      }

      if (data && Array.isArray(data.value)) {
        setItems(data.value);
        return;
      }

      setItems([]);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar base de conhecimento.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  const totalAtivos = useMemo(() => {
    return items.filter((item) => item.active).length;
  }, [items]);

  function resetFormAndClose() {
    setForm(INITIAL_FORM);
    setCreateError("");
    setShowCreate(false);
    setEditingId(null);
  }

  async function handleCreateOrUpdate() {
    try {
      setCreateError("");

      if (!form.title.trim()) {
        setCreateError("Informe o título.");
        return;
      }

      if (!form.prompt.trim()) {
        setCreateError("Informe o prompt.");
        return;
      }

      setSaving(true);

      const payload = {
        title: form.title.trim(),
        type: form.type,
        prompt: form.prompt.trim(),
        links: buildStringArrayFromLines(form.linksText),
        whatAiUnderstood: form.whatAiUnderstood.trim() || undefined,
        exampleOutput: form.exampleOutput.trim() || undefined,
        tags: buildStringArrayFromComma(form.tagsText),
        audience: form.audience,
        active: form.active,
        priority: Number(form.priority || 0),
        version: Number(form.version || 1),
      };

      if (editingId) {
        await apiFetch(`/knowledge-base/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/knowledge-base", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetFormAndClose();
      await loadItems(search);
    } catch (err: any) {
      setCreateError(
        err?.message ||
          (editingId
            ? "Erro ao atualizar base de conhecimento."
            : "Erro ao criar base de conhecimento.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setDeleteError("");

      if (deleteConfirmText.trim() !== deleteTarget.title.trim()) {
        setDeleteError("Digite o título exato da base para confirmar a exclusão.");
        return;
      }

      setDeleting(true);

      await apiFetch(`/knowledge-base/${deleteTarget.id}`, {
        method: "DELETE",
      });

      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleteError("");
      await loadItems(search);
    } catch (err: any) {
      setDeleteError(err?.message || "Erro ao excluir base de conhecimento.");
    } finally {
      setDeleting(false);
    }
  }

  function startCreate() {
    if (showCreate && !editingId) {
      resetFormAndClose();
      return;
    }

    setCreateError("");
    setEditingId(null);
    setForm(INITIAL_FORM);
    setShowCreate(true);
  }

  function startEdit(item: KnowledgeBaseItem) {
    setCreateError("");
    setEditingId(item.id);
    setForm(formFromItem(item));
    setShowCreate(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  return (
    <AppShell title="Base do Conhecimento">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Base do Conhecimento</h1>
            <p className="mt-1 text-sm text-gray-600">
              Gerencie as bases usadas pelos AI Agents.
            </p>
          </div>

          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showCreate && !editingId ? "Fechar criação" : "Criar"}
          </button>
        </div>

        {showCreate ? (
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? "Editar Base de Conhecimento" : "Nova Base de Conhecimento"}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {editingId
                  ? "Atualize os dados abaixo e salve as alterações."
                  : "Preencha os dados abaixo para cadastrar uma nova base."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Ex: Tom de atendimento popular"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as KnowledgeBaseType,
                    }))
                  }
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
                  onChange={(e) => setForm((prev) => ({ ...prev, prompt: e.target.value }))}
                  rows={5}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Descreva o conhecimento principal que a IA deve usar."
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Links (1 por linha)
                </label>
                <textarea
                  value={form.linksText}
                  onChange={(e) => setForm((prev) => ({ ...prev, linksText: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder={"https://site1.com\nhttps://site2.com"}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  O que a IA entendeu
                </label>
                <textarea
                  value={form.whatAiUnderstood}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whatAiUnderstood: e.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Resumo interno do entendimento esperado da IA."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Exemplo de resposta
                </label>
                <textarea
                  value={form.exampleOutput}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, exampleOutput: e.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="Exemplo de saída esperada."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tags (separadas por vírgula)
                </label>
                <input
                  value={form.tagsText}
                  onChange={(e) => setForm((prev) => ({ ...prev, tagsText: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="atendimento, whatsapp, popular"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Audiência</label>
                <select
                  value={form.audience}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      audience: e.target.value as KnowledgeBaseAudience,
                    }))
                  }
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
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  min={0}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Versão</label>
                <input
                  type="number"
                  value={form.version}
                  onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  min={1}
                />
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                  />
                  Base ativa
                </label>
              </div>
            </div>

            {createError ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleCreateOrUpdate}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? editingId
                    ? "Salvando alterações..."
                    : "Salvando..."
                  : editingId
                  ? "Salvar alterações"
                  : "Salvar base"}
              </button>

              <button
                type="button"
                onClick={resetFormAndClose}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

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

        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadItems(search);
                }
              }}
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
              onClick={() => {
                setSearch("");
                loadItems("");
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </div>

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

                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.prompt}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Prioridade: {item.priority}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Versão: {item.version}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Links: {item.links?.length || 0}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">
                          Tags: {item.tags?.length || 0}
                        </span>
                      </div>

                      {item.tags?.length ? (
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
                      ) : null}
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

        {deleteTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h2>
                <p className="mt-2 text-sm text-gray-700">
                  Você está prestes a excluir esta base de conhecimento:
                </p>
                <div className="mt-3 rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  <b>{deleteTarget.title}</b>
                </div>
                <p className="mt-3 text-sm text-red-600">
                  Esta ação não pode ser desfeita.
                </p>
                <p className="mt-3 text-sm text-gray-700">
                  Para confirmar, digite o título exato da base:
                </p>
              </div>

              <div className="mt-3">
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder={deleteTarget.title}
                />
              </div>

              {deleteError ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {deleteError}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>

                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}