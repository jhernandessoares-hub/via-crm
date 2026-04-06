"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type AiAgentMode = "COPILOT" | "AUTOPILOT";
type AgentType = "CONVERSACIONAL" | "OPERACIONAL";

type AiAgent = {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  description?: string | null;
  objective?: string | null;
  prompt: string;
  mode: AiAgentMode;
  agentType: AgentType;
  permissions: string[];
  active: boolean;
  priority: number;
  version: number;
  createdAt: string;
};

type KbItem = {
  id: string;
  title: string;
  type: string;
  active: boolean;
  agents: Array<{ id: string; agentId: string }>;
  _count?: { teachings: number };
};

const ALL_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: "leads",         label: "Leads",           desc: "quantidade e status dos leads" },
  { key: "calendar",      label: "Agenda",          desc: "eventos do dia" },
  { key: "products",      label: "Produtos",        desc: "total de produtos cadastrados" },
  { key: "manager_queue", label: "Fila do Gerente", desc: "leads aguardando revisão" },
  { key: "ai_agents",     label: "AI Agents",       desc: "agentes ativos" },
  { key: "funnel",        label: "Funil de Vendas", desc: "etapas do funil" },
];

type AgentForm = {
  title: string;
  slug: string;
  description: string;
  objective: string;
  prompt: string;
  agentType: AgentType;
  mode: AiAgentMode;
  permissions: string[];
  active: boolean;
  priority: string;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const EMPTY_FORM: AgentForm = {
  title: "",
  slug: "",
  description: "",
  objective: "",
  prompt: "",
  agentType: "CONVERSACIONAL",
  mode: "COPILOT",
  permissions: [],
  active: true,
  priority: "0",
};

function toSlug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function agentToForm(a: AiAgent): AgentForm {
  return {
    title: a.title ?? "",
    slug: a.slug ?? "",
    description: a.description ?? "",
    objective: a.objective ?? "",
    prompt: a.prompt ?? "",
    agentType: a.agentType ?? "CONVERSACIONAL",
    mode: a.mode ?? "COPILOT",
    permissions: Array.isArray(a.permissions) ? a.permissions : [],
    active: a.active ?? true,
    priority: String(a.priority ?? 0),
  };
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function AiAgentsPage() {
  const [tenantId, setTenantId] = useState("");

  // Agents list
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Panel state
  const [selectedAgent, setSelectedAgent] = useState<AiAgent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // KBs
  const [kbs, setKbs] = useState<KbItem[]>([]);
  const [kbsLoading, setKbsLoading] = useState(false);
  const [kbLinking, setKbLinking] = useState<string | null>(null);

  // Bootstrap: read tenantId from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setTenantId(JSON.parse(raw).tenantId || "");
    } catch {}
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadAgents();
    loadKbs();
  }, [tenantId]);

  // ── Loaders ──────────────────────────────────

  async function loadAgents() {
    setLoading(true);
    setListError(null);
    try {
      const data = await apiFetch(`/ai-agents/${tenantId}`);
      setAgents(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setListError(e?.message || "Erro ao carregar agentes.");
    } finally {
      setLoading(false);
    }
  }

  async function loadKbs() {
    setKbsLoading(true);
    try {
      const data = await apiFetch("/knowledge-base");
      setKbs(Array.isArray(data) ? data : []);
    } catch {
      setKbs([]);
    } finally {
      setKbsLoading(false);
    }
  }

  // ── Panel actions ─────────────────────────────

  function openNew() {
    setSelectedAgent(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
  }

  function openAgent(agent: AiAgent) {
    setSelectedAgent(agent);
    setIsNew(false);
    setForm(agentToForm(agent));
    setFormError(null);
    setConfirmDelete(false);
  }

  async function saveAgent() {
    setFormError(null);
    if (!form.title.trim()) { setFormError("Informe o nome do agente."); return; }
    if (!form.slug.trim()) { setFormError("Informe o slug."); return; }

    setSaving(true);
    try {
      if (isNew) {
        const created: AiAgent = await apiFetch("/ai-agents", {
          method: "POST",
          body: JSON.stringify({
            tenantId,
            title: form.title.trim(),
            slug: form.slug.trim(),
            description: form.description.trim() || undefined,
            objective: form.objective.trim() || undefined,
            prompt: form.prompt.trim(),
            agentType: form.agentType,
            mode: form.agentType === "OPERACIONAL" ? "COPILOT" : form.mode,
            permissions: form.permissions,
            active: form.active,
            priority: Number(form.priority || 0),
          }),
        });
        await loadAgents();
        setIsNew(false);
        setSelectedAgent(created);
        setForm(agentToForm(created));
      } else if (selectedAgent) {
        const updated: AiAgent = await apiFetch(
          `/ai-agents/${tenantId}/${selectedAgent.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: form.title.trim(),
              slug: form.slug.trim(),
              description: form.description.trim() || null,
              objective: form.objective.trim() || null,
              prompt: form.prompt.trim(),
              agentType: form.agentType,
              mode: form.agentType === "OPERACIONAL" ? "COPILOT" : form.mode,
              permissions: form.permissions,
              active: form.active,
              priority: Number(form.priority || 0),
            }),
          },
        );
        await loadAgents();
        setSelectedAgent(updated);
        setForm(agentToForm(updated));
      }
    } catch (e: any) {
      setFormError(e?.message || "Erro ao salvar agente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent() {
    if (!selectedAgent) return;
    setDeleting(true);
    try {
      await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}`, {
        method: "DELETE",
      });
      await loadAgents();
      setSelectedAgent(null);
      setIsNew(false);
      setConfirmDelete(false);
    } catch (e: any) {
      setFormError(e?.message || "Erro ao excluir agente.");
      setDeleting(false);
    }
  }

  function togglePermission(key: string) {
    setForm((prev) => {
      const has = prev.permissions.includes(key);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== key)
          : [...prev.permissions, key],
      };
    });
  }

  async function toggleKb(kb: KbItem) {
    if (!selectedAgent) return;
    const linked = kb.agents.some((a) => a.agentId === selectedAgent.id);
    setKbLinking(kb.id);
    try {
      if (linked) {
        await apiFetch(
          `/knowledge-base/${kb.id}/agents/${selectedAgent.id}`,
          { method: "DELETE" },
        );
      } else {
        await apiFetch(
          `/knowledge-base/${kb.id}/agents/${selectedAgent.id}`,
          { method: "POST" },
        );
      }
      await loadKbs();
    } catch {}
    finally {
      setKbLinking(null);
    }
  }

  // ── Derived ───────────────────────────────────

  const linkedKbs = selectedAgent
    ? kbs.filter((kb) => kb.agents.some((a) => a.agentId === selectedAgent.id))
    : [];

  const totalTeachings = linkedKbs.reduce(
    (acc, kb) => acc + (kb._count?.teachings ?? 0),
    0,
  );

  const panelOpen = isNew || !!selectedAgent;

  // ── Render ────────────────────────────────────

  return (
    <AppShell title="AI Agents">
      <div className="flex gap-6" style={{ minHeight: "calc(100vh - 8.5rem)" }}>

        {/* ── Sidebar de agentes ────────────────────── */}
        <aside className="w-60 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Agentes</h2>
            <button
              onClick={openNew}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              + Novo
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-gray-400 mt-4">Carregando...</p>
          ) : listError ? (
            <p className="text-xs text-red-500 mt-4">{listError}</p>
          ) : agents.length === 0 ? (
            <p className="text-xs text-gray-400 mt-4">Nenhum agente criado ainda.</p>
          ) : (
            <ul className="space-y-1 overflow-y-auto">
              {agents.map((agent) => {
                const selected = !isNew && selectedAgent?.id === agent.id;
                return (
                  <li key={agent.id}>
                    <button
                      onClick={() => openAgent(agent)}
                      className={`w-full text-left rounded-md px-3 py-2.5 text-sm transition ${
                        selected
                          ? "bg-slate-900 text-white"
                          : "bg-white border hover:bg-gray-50 text-gray-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{agent.title}</span>
                        <span
                          className={`h-2 w-2 flex-shrink-0 rounded-full ${
                            agent.active ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                          title={agent.active ? "Ativo" : "Inativo"}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          agent.agentType === "OPERACIONAL"
                            ? selected ? "bg-purple-700 text-purple-100" : "bg-purple-100 text-purple-700"
                            : selected ? "bg-slate-600 text-slate-200" : "bg-gray-100 text-gray-500"
                        }`}>
                          {agent.agentType === "OPERACIONAL" ? "Operacional" : "Conv."}
                        </span>
                        {agent.agentType !== "OPERACIONAL" && (
                          <span className={`text-xs truncate ${selected ? "text-slate-300" : "text-gray-400"}`}>
                            {agent.mode}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Painel direito ────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!panelOpen ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Selecione um agente ou clique em "+ Novo".
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl">

              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  {isNew ? "Novo Agente" : selectedAgent?.title}
                </h2>
                {!isNew && selectedAgent && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Excluir agente
                  </button>
                )}
              </div>

              {/* Confirm delete */}
              {confirmDelete && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-4">
                  <p className="text-sm text-red-700 flex-1">
                    Confirmar exclusão de <b>{selectedAgent?.title}</b>? Esta ação não pode ser desfeita.
                  </p>
                  <button
                    onClick={deleteAgent}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Excluindo..." : "Excluir"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* ── Formulário ── */}
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Nome <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={form.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setForm((p) => ({
                          ...p,
                          title,
                          slug: isNew ? toSlug(title) : p.slug,
                        }));
                      }}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="Ex: Ana — Atendente"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Slug <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={form.slug}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, slug: e.target.value }))
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
                      placeholder="ana-atendente"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Descrição
                  </label>
                  <input
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Breve descrição do agente"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Objetivo
                  </label>
                  <input
                    value={form.objective}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, objective: e.target.value }))
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Ex: Qualificar leads de crédito consignado"
                  />
                </div>

                {form.agentType === "OPERACIONAL" && (
                  <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700">
                    <b>Agente Operacional</b> — opera em segundo plano, nunca fala com o lead.
                    Use o prompt para definir regras de qualificação, mudança de etapa e quando notificar o corretor.
                    O sistema complementa automaticamente com as instruções de formato JSON.
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {form.agentType === "OPERACIONAL" ? "Prompt operacional" : "Prompt direto"}{" "}
                    <span className="font-normal text-gray-400">
                      {form.agentType === "OPERACIONAL"
                        ? "(regras de análise, qualificação e ações no CRM)"
                        : "(sobrepõe a KB de Personalidade quando preenchido)"}
                    </span>
                  </label>
                  <textarea
                    value={form.prompt}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, prompt: e.target.value }))
                    }
                    rows={5}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Você é Ana, atendente da empresa X. Seu tom é..."
                  />
                </div>

                <div className="grid grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Tipo
                    </label>
                    <select
                      value={form.agentType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          agentType: e.target.value as AgentType,
                        }))
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="CONVERSACIONAL">Conversacional</option>
                      <option value="OPERACIONAL">Operacional</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Modo
                    </label>
                    {form.agentType === "OPERACIONAL" ? (
                      <div className="w-full rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-400">
                        Automático
                      </div>
                    ) : (
                    <select
                      value={form.mode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          mode: e.target.value as AiAgentMode,
                        }))
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="COPILOT">COPILOT</option>
                      <option value="AUTOPILOT">AUTOPILOT</option>
                    </select>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Prioridade
                    </label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, priority: e.target.value }))
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                  <div className="pb-0.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, active: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Ativo</span>
                    </label>
                  </div>
                </div>

                {formError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={saveAgent}
                    disabled={saving}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving
                      ? "Salvando..."
                      : isNew
                      ? "Criar agente"
                      : "Salvar alterações"}
                  </button>
                </div>
              </div>

              {/* ── KBs vinculadas (só após salvar) ── */}
              {!isNew && selectedAgent && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Bases de Conhecimento vinculadas
                  </h3>

                  {kbsLoading ? (
                    <p className="text-xs text-gray-400">Carregando KBs...</p>
                  ) : kbs.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhuma KB cadastrada.</p>
                  ) : (
                    <ul className="divide-y">
                      {kbs.map((kb) => {
                        const linked = kb.agents.some(
                          (a) => a.agentId === selectedAgent.id,
                        );
                        const toggling = kbLinking === kb.id;
                        return (
                          <li
                            key={kb.id}
                            className="flex items-center gap-3 py-2.5"
                          >
                            <input
                              type="checkbox"
                              checked={linked}
                              disabled={toggling}
                              onChange={() => toggleKb(kb)}
                              className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-800">
                                {kb.title}
                              </span>
                              <span className="ml-2 text-xs text-gray-400">
                                {kb.type}
                              </span>
                              {!kb.active && (
                                <span className="ml-2 text-xs text-gray-400 italic">
                                  inativa
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {toggling ? (
                                "..."
                              ) : linked && (kb._count?.teachings ?? 0) > 0 ? (
                                <>
                                  {kb._count!.teachings} ensinamento
                                  {kb._count!.teachings !== 1 ? "s" : ""}
                                </>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* ── Módulos com acesso ── */}
              {!isNew && selectedAgent && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Módulos com acesso
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Dados injetados no contexto da IA ao responder.
                    Se nenhum for selecionado, todos os módulos são liberados.
                  </p>
                  <ul className="divide-y">
                    {ALL_PERMISSIONS.map((perm) => {
                      const checked = form.permissions.includes(perm.key);
                      return (
                        <li key={perm.key} className="flex items-center gap-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(perm.key)}
                            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-800">{perm.label}</span>
                            <span className="ml-2 text-xs text-gray-400">{perm.desc}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={saveAgent}
                      disabled={saving}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {saving ? "Salvando..." : "Salvar permissões"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Resumo de ensinamentos ── */}
              {!isNew && selectedAgent && linkedKbs.length > 0 && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Ensinamentos por KB
                  </h3>
                  <ul className="divide-y">
                    {linkedKbs.map((kb) => (
                      <li
                        key={kb.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <span className="text-gray-700">{kb.title}</span>
                        <span className="text-xs text-gray-400">
                          {kb._count?.teachings ?? 0} ensinamento
                          {(kb._count?.teachings ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 pt-2 border-t flex justify-between text-xs font-medium text-gray-700">
                    <span>Total</span>
                    <span>{totalTeachings}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
