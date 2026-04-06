"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

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
  agentType: AgentType;
  mode: AiAgentMode;
  active: boolean;
  model?: string | null;
  temperature?: number | null;
  isOrchestrator: boolean;
  parentAgentId?: string | null;
  routingKeywords: string[];
  permissions: string[];
  priority: number;
  version: number;
  createdAt: string;
  tools?: AgentTool[];
};

type AgentTool = {
  id: string;
  name: string;
  label: string;
  description: string;
  webhookUrl?: string | null;
  webhookMethod?: string;
  active: boolean;
};

type KbItem = {
  id: string;
  title: string;
  type: string;
  active: boolean;
  agents: Array<{ id: string; agentId: string }>;
  _count?: { teachings: number };
};

const KNOWN_MODELS = [
  "gpt-4o-mini", "gpt-4o", "gpt-4-turbo",
  "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6",
];

const ALL_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: "leads",         label: "Leads",           desc: "quantidade e status dos leads" },
  { key: "calendar",      label: "Agenda",          desc: "eventos do dia" },
  { key: "products",      label: "Produtos",        desc: "total de produtos cadastrados" },
  { key: "manager_queue", label: "Fila gerencial",  desc: "leads aguardando revisão" },
  { key: "ai_agents",     label: "AI Agents",       desc: "agentes ativos" },
  { key: "funnel",        label: "Funil",           desc: "etapas do funil de vendas" },
];

type AgentForm = {
  title: string;
  slug: string;
  description: string;
  objective: string;
  prompt: string;
  agentType: AgentType;
  mode: AiAgentMode;
  active: boolean;
  model: string;
  temperature: number;
  isOrchestrator: boolean;
  parentAgentId: string;
  routingKeywords: string;
  permissions: string[];
};

const EMPTY_FORM: AgentForm = {
  title: "",
  slug: "",
  description: "",
  objective: "",
  prompt: "",
  agentType: "CONVERSACIONAL",
  mode: "AUTOPILOT",
  active: true,
  model: "",
  temperature: 0.7,
  isOrchestrator: false,
  parentAgentId: "",
  routingKeywords: "",
  permissions: [],
};

function toSlug(s: string) {
  return s.toLowerCase().normalize("NFD")
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
    mode: a.mode ?? "AUTOPILOT",
    active: a.active ?? true,
    model: a.model ?? "",
    temperature: a.temperature ?? 0.7,
    isOrchestrator: a.isOrchestrator ?? false,
    parentAgentId: a.parentAgentId ?? "",
    routingKeywords: Array.isArray(a.routingKeywords) ? a.routingKeywords.join(", ") : "",
    permissions: Array.isArray(a.permissions) ? a.permissions : [],
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AiAgentsPage() {
  const [tenantId, setTenantId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<AiAgent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [kbs, setKbs] = useState<KbItem[]>([]);
  const [kbsLoading, setKbsLoading] = useState(false);
  const [kbLinking, setKbLinking] = useState<string | null>(null);

  // Tools
  const [newTool, setNewTool] = useState({ name: "", label: "", description: "", webhookUrl: "", webhookMethod: "POST" });
  const [savingTool, setSavingTool] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);

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
    } catch { setKbs([]); }
    finally { setKbsLoading(false); }
  }

  function openNew() {
    setSelectedAgent(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
    setToolError(null);
  }

  function openAgent(agent: AiAgent) {
    setSelectedAgent(agent);
    setIsNew(false);
    setForm(agentToForm(agent));
    setFormError(null);
    setConfirmDelete(false);
    setToolError(null);
  }

  async function saveAgent() {
    setFormError(null);
    if (!form.title.trim()) { setFormError("Informe o nome do agente."); return; }
    if (!form.slug.trim()) { setFormError("Informe o slug."); return; }

    const isOperacional = form.agentType === "OPERACIONAL";
    const keywords = form.routingKeywords
      .split(",").map(s => s.trim()).filter(Boolean);

    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      objective: form.objective.trim() || null,
      prompt: form.prompt.trim(),
      agentType: form.agentType,
      mode: isOperacional ? "COPILOT" : form.mode,
      active: form.active,
      model: form.model.trim() || null,
      temperature: form.temperature,
      isOrchestrator: isOperacional ? false : form.isOrchestrator,
      parentAgentId: form.parentAgentId || null,
      routingKeywords: keywords,
      permissions: form.permissions,
    };

    setSaving(true);
    try {
      if (isNew) {
        const created: AiAgent = await apiFetch("/ai-agents", {
          method: "POST",
          body: JSON.stringify({ tenantId, ...payload }),
        });
        await loadAgents();
        setIsNew(false);
        setSelectedAgent(created);
        setForm(agentToForm(created));
      } else if (selectedAgent) {
        const updated: AiAgent = await apiFetch(
          `/ai-agents/${tenantId}/${selectedAgent.id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
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
      await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}`, { method: "DELETE" });
      await loadAgents();
      setSelectedAgent(null);
      setIsNew(false);
      setConfirmDelete(false);
    } catch (e: any) {
      setFormError(e?.message || "Erro ao excluir agente.");
      setDeleting(false);
    }
  }

  async function toggleKb(kb: KbItem) {
    if (!selectedAgent) return;
    const linked = kb.agents.some((a) => a.agentId === selectedAgent.id);
    setKbLinking(kb.id);
    try {
      await apiFetch(
        `/knowledge-base/${kb.id}/agents/${selectedAgent.id}`,
        { method: linked ? "DELETE" : "POST" },
      );
      await loadKbs();
    } catch {}
    finally { setKbLinking(null); }
  }

  async function saveTool() {
    if (!selectedAgent) return;
    setToolError(null);
    if (!newTool.name.trim() || !newTool.label.trim() || !newTool.description.trim()) {
      setToolError("Nome, label e descrição são obrigatórios.");
      return;
    }
    setSavingTool(true);
    try {
      await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}/tools`, {
        method: "POST",
        body: JSON.stringify({
          name: newTool.name.toLowerCase().replace(/\s+/g, "_"),
          label: newTool.label,
          description: newTool.description,
          webhookUrl: newTool.webhookUrl || undefined,
          webhookMethod: newTool.webhookMethod,
        }),
      });
      setNewTool({ name: "", label: "", description: "", webhookUrl: "", webhookMethod: "POST" });
      const updated = await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}`);
      setSelectedAgent(updated);
    } catch (e: any) {
      setToolError(e?.message || "Erro ao salvar tool.");
    } finally {
      setSavingTool(false);
    }
  }

  async function deleteTool(toolId: string) {
    if (!selectedAgent) return;
    try {
      await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}/tools/${toolId}`, { method: "DELETE" });
      const updated = await apiFetch(`/ai-agents/${tenantId}/${selectedAgent.id}`);
      setSelectedAgent(updated);
    } catch {}
  }

  function togglePermission(key: string) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  }

  const linkedKbs = selectedAgent
    ? kbs.filter((kb) => kb.agents.some((a) => a.agentId === selectedAgent.id))
    : [];

  const parentAgents = agents.filter(
    (a) => a.isOrchestrator && a.id !== selectedAgent?.id
  );

  const panelOpen = isNew || !!selectedAgent;
  const isOperacional = form.agentType === "OPERACIONAL";

  return (
    <AppShell title="AI Agents">
      <div className="flex gap-6" style={{ minHeight: "calc(100vh - 8.5rem)" }}>

        {/* ── Sidebar ── */}
        <aside className="w-60 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Agentes</h2>
            <button onClick={openNew}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              + Novo
            </button>
          </div>

          {loading ? <p className="text-xs text-gray-400 mt-4">Carregando...</p>
            : listError ? <p className="text-xs text-red-500 mt-4">{listError}</p>
            : agents.length === 0 ? <p className="text-xs text-gray-400 mt-4">Nenhum agente criado ainda.</p>
            : (
              <ul className="space-y-1 overflow-y-auto">
                {agents.map((agent) => {
                  const sel = !isNew && selectedAgent?.id === agent.id;
                  const isOp = agent.agentType === "OPERACIONAL";
                  return (
                    <li key={agent.id}>
                      <button onClick={() => openAgent(agent)}
                        className={`w-full text-left rounded-md px-3 py-2.5 text-sm transition ${
                          sel ? "bg-slate-900 text-white" : "bg-white border hover:bg-gray-50 text-gray-800"
                        }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{agent.title}</span>
                          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${agent.active ? "bg-emerald-500" : "bg-gray-300"}`} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            isOp
                              ? sel ? "bg-purple-700 text-purple-100" : "bg-purple-100 text-purple-700"
                              : sel ? "bg-slate-600 text-slate-200" : "bg-gray-100 text-gray-500"
                          }`}>
                            {isOp ? "Operacional" : "Conv."}
                          </span>
                          {!isOp && (
                            <span className={`text-xs truncate ${sel ? "text-slate-300" : "text-gray-400"}`}>
                              {agent.isOrchestrator ? "Orquestrador" : agent.mode}
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

        {/* ── Painel direito ── */}
        <div className="flex-1 overflow-y-auto">
          {!panelOpen ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Selecione um agente ou clique em "+ Novo".
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl pb-10">

              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  {isNew ? "Novo Agente" : selectedAgent?.title}
                </h2>
                {!isNew && selectedAgent && (
                  <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700">
                    Excluir agente
                  </button>
                )}
              </div>

              {confirmDelete && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-4">
                  <p className="text-sm text-red-700 flex-1">
                    Confirmar exclusão de <b>{selectedAgent?.title}</b>?
                  </p>
                  <button onClick={deleteAgent} disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {deleting ? "Excluindo..." : "Excluir"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">
                    Cancelar
                  </button>
                </div>
              )}

              {/* ── Identificação ── */}
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificação</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Título <span className="text-red-400">*</span></label>
                    <input value={form.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setForm((p) => ({ ...p, title, slug: isNew ? toSlug(title) : p.slug }));
                      }}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="Ex: Ana — Atendimento" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Slug <span className="text-red-400">*</span> <span className="font-normal text-gray-400">identificador único</span></label>
                    <input value={form.slug}
                      onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                      className="w-full rounded-md border px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
                      placeholder="ana-atendimento" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Descrição <span className="font-normal text-gray-400">resumo curto — visível no organograma</span></label>
                  <input value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Ex: Primeiro contato com leads do WhatsApp" />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Objetivo</label>
                  <textarea value={form.objective}
                    onChange={(e) => setForm((p) => ({ ...p, objective: e.target.value }))}
                    rows={2}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Descreva o objetivo detalhado deste agente, quando ele deve ser acionado e o que deve fazer." />
                </div>
              </div>

              {/* ── Comportamento ── */}
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comportamento</h3>

                {/* Tipo toggle */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                  <div className="flex rounded-md border overflow-hidden w-fit">
                    {(["CONVERSACIONAL", "OPERACIONAL"] as AgentType[]).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setForm((p) => ({ ...p, agentType: t }))}
                        className={`px-5 py-2 text-xs font-medium transition ${
                          form.agentType === t
                            ? t === "OPERACIONAL" ? "bg-purple-600 text-white" : "bg-slate-900 text-white"
                            : "bg-white text-gray-500 hover:bg-gray-50"
                        }`}>
                        {t === "CONVERSACIONAL" ? "Conversacional" : "Operacional"}
                      </button>
                    ))}
                  </div>
                  {isOperacional && (
                    <p className="mt-1.5 text-xs text-purple-600">
                      Opera em segundo plano — nunca fala diretamente com o lead.
                    </p>
                  )}
                </div>

                {/* Modo — só para conversacional */}
                {!isOperacional && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Modo</label>
                    <div className="flex gap-3">
                      {(["COPILOT", "AUTOPILOT"] as AiAgentMode[]).map((m) => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={form.mode === m}
                            onChange={() => setForm((p) => ({ ...p, mode: m }))}
                            className="accent-slate-900" />
                          <span className="text-sm text-gray-700">
                            {m === "COPILOT" ? "🧑‍✈️ Copilot — sugere" : "⚡ Autopilot — age"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.active}
                      onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 accent-slate-900" />
                    <span className="text-sm text-gray-700">Ativo</span>
                  </label>

                  {!isOperacional && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.isOrchestrator}
                        onChange={(e) => setForm((p) => ({ ...p, isOrchestrator: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 accent-slate-900" />
                      <span className="text-sm text-gray-700">Orquestrador</span>
                    </label>
                  )}
                </div>

                {!isOperacional && !form.isOrchestrator && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Agente pai</label>
                    <select value={form.parentAgentId}
                      onChange={(e) => setForm((p) => ({ ...p, parentAgentId: e.target.value }))}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400">
                      <option value="">Nenhum</option>
                      {parentAgents.map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!isOperacional && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Palavras-chave de roteamento</label>
                    <input value={form.routingKeywords}
                      onChange={(e) => setForm((p) => ({ ...p, routingKeywords: e.target.value }))}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="Ex: preço, visita, renda" />
                    <p className="mt-1 text-xs text-gray-400">Separadas por vírgula. O orquestrador usa essas palavras para rotear a mensagem.</p>
                  </div>
                )}
              </div>

              {/* ── Modelo de IA ── */}
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modelo de IA</h3>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Modelo de IA</label>
                  <div className="flex items-center gap-2">
                    <input value={form.model}
                      onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                      list="models-list"
                      className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="gpt-4o-mini" />
                    {form.model && KNOWN_MODELS.includes(form.model) && (
                      <span className="text-xs text-emerald-600 font-medium whitespace-nowrap">✓ Tecnologia ativada</span>
                    )}
                  </div>
                  <datalist id="models-list">
                    {KNOWN_MODELS.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Temperature ({form.temperature.toFixed(1)})
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Preciso (0)</span>
                    <input type="range" min={0} max={1} step={0.1}
                      value={form.temperature}
                      onChange={(e) => setForm((p) => ({ ...p, temperature: parseFloat(e.target.value) }))}
                      className="flex-1 accent-slate-900" />
                    <span className="text-xs text-gray-400">Criativo (1)</span>
                  </div>
                </div>
              </div>

              {/* ── Acesso a dados do CRM ── */}
              {!isOperacional && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Acesso a dados do CRM</h3>
                  <p className="text-xs text-gray-400 mb-3">Dados injetados no contexto da IA ao responder. Se nenhum selecionado, todos são liberados.</p>
                  <ul className="divide-y">
                    {ALL_PERMISSIONS.map((perm) => (
                      <li key={perm.key} className="flex items-center gap-3 py-2.5">
                        <input type="checkbox" checked={form.permissions.includes(perm.key)}
                          onChange={() => togglePermission(perm.key)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-slate-900" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-800">{perm.label}</span>
                          <span className="ml-2 text-xs text-gray-400">{perm.desc}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Prompt ── */}
              <div className="rounded-xl border bg-white p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {isOperacional ? "Prompt operacional" : "Prompt / Personalidade"}
                </h3>
                {isOperacional && (
                  <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700">
                    <b>Agente Operacional</b> — define regras de qualificação, mudança de etapa e quando notificar o corretor.
                    O sistema complementa automaticamente com as instruções de formato JSON.
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">{form.prompt.length} chars</span>
                </div>
                <textarea value={form.prompt}
                  onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))}
                  rows={12}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400 font-mono"
                  placeholder={isOperacional
                    ? "Defina as regras de qualificação, quando mover etapas e quando notificar o corretor..."
                    : "Você é Ana, atendente da empresa X. Seu tom é..."} />
              </div>

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={saveAgent} disabled={saving}
                  className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "Salvando..." : isNew ? "Criar agente" : "Salvar alterações"}
                </button>
              </div>

              {/* ── KBs ── */}
              {!isNew && selectedAgent && (
                <div className="rounded-xl border bg-white p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Bases de Conhecimento</h3>
                  {kbsLoading ? <p className="text-xs text-gray-400">Carregando...</p>
                    : kbs.length === 0 ? <p className="text-xs text-gray-400">Nenhuma KB cadastrada.</p>
                    : (
                      <ul className="divide-y">
                        {kbs.map((kb) => {
                          const linked = kb.agents.some((a) => a.agentId === selectedAgent.id);
                          const toggling = kbLinking === kb.id;
                          return (
                            <li key={kb.id} className="flex items-center gap-3 py-2.5">
                              <input type="checkbox" checked={linked} disabled={toggling}
                                onChange={() => toggleKb(kb)}
                                className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-slate-900" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-gray-800">{kb.title}</span>
                                <span className="ml-2 text-xs text-gray-400">{kb.type}</span>
                                {!kb.active && <span className="ml-2 text-xs text-gray-400 italic">inativa</span>}
                              </div>
                              <span className="text-xs text-gray-400">
                                {toggling ? "..." : linked && (kb._count?.teachings ?? 0) > 0
                                  ? `${kb._count!.teachings} ensinamento${kb._count!.teachings !== 1 ? "s" : ""}`
                                  : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                </div>
              )}

              {/* ── Tools ── */}
              {!isNew && selectedAgent && (
                <div className="rounded-xl border bg-white p-5 space-y-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ferramentas (Tools)</h3>

                  {(selectedAgent.tools ?? []).length > 0 && (
                    <ul className="divide-y">
                      {(selectedAgent.tools ?? []).map((tool) => (
                        <li key={tool.id} className="flex items-start justify-between py-2.5 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800">{tool.label}</span>
                              <span className="text-xs font-mono text-gray-400">{tool.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${tool.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                                {tool.active ? "ativa" : "inativa"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
                            {tool.webhookUrl && (
                              <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{tool.webhookMethod} {tool.webhookUrl}</p>
                            )}
                          </div>
                          <button onClick={() => deleteTool(tool.id)}
                            className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">
                            Remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-gray-600">Nova ferramenta</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newTool.name} onChange={(e) => setNewTool(p => ({ ...p, name: e.target.value }))}
                        className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        placeholder="nome_funcao" />
                      <input value={newTool.label} onChange={(e) => setNewTool(p => ({ ...p, label: e.target.value }))}
                        className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        placeholder="Label visível" />
                    </div>
                    <input value={newTool.description} onChange={(e) => setNewTool(p => ({ ...p, description: e.target.value }))}
                      className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                      placeholder="Descrição (instrui a IA sobre quando usar)" />
                    <div className="grid grid-cols-3 gap-2">
                      <select value={newTool.webhookMethod} onChange={(e) => setNewTool(p => ({ ...p, webhookMethod: e.target.value }))}
                        className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-slate-400">
                        <option>POST</option>
                        <option>GET</option>
                      </select>
                      <input value={newTool.webhookUrl} onChange={(e) => setNewTool(p => ({ ...p, webhookUrl: e.target.value }))}
                        className="col-span-2 rounded-md border px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        placeholder="https://webhook.url (opcional)" />
                    </div>
                    {toolError && <p className="text-xs text-red-600">{toolError}</p>}
                    <button onClick={saveTool} disabled={savingTool}
                      className="rounded-md bg-slate-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                      {savingTool ? "Adicionando..." : "Adicionar ferramenta"}
                    </button>
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
