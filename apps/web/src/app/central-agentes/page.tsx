"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Teaching = {
  id: string;
  title: string | null;
  leadMessage: string | null;
  approvedResponse: string;
};

type AgentTool = {
  id: string;
  name: string;
  label: string;
  description: string;
  type: "SYSTEM" | "WEBHOOK";
  webhookUrl: string | null;
  webhookMethod: string;
  active: boolean;
};

type KbLink = {
  knowledgeBase: {
    id: string;
    title: string;
    type: string;
    active: boolean;
    _count: { teachings: number; documents: number };
  };
};

type Agent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  objective: string | null;
  prompt: string;
  agentType: "CONVERSACIONAL" | "OPERACIONAL";
  mode: "COPILOT" | "AUTOPILOT";
  active: boolean;
  isOrchestrator: boolean;
  parentAgentId: string | null;
  routingKeywords: string[];
  permissions: string[];
  knowledgeBases: KbLink[];
  tools: AgentTool[];
  children: Agent[];
};

type Kb = {
  id: string;
  title: string;
  type: string;
  _count: { teachings: number; documents: number };
};

/* ─── Constants ──────────────────────────────────────────────────────── */
const KB_TYPE_LABELS: Record<string, string> = {
  PERSONALIDADE: "Personalidade", REGRAS: "Regras", CREDITO: "Crédito",
  INFORMACAO_GERAL: "Info Geral", PRODUTO: "Produto", MERCADO: "Mercado",
  CUSTOM: "Custom", SKILL: "Skill",
};
const KB_TYPE_COLORS: Record<string, string> = {
  PERSONALIDADE: "bg-purple-100 text-purple-700",
  REGRAS: "bg-red-100 text-red-700",
  SKILL: "bg-emerald-100 text-emerald-700",
  CREDITO: "bg-blue-100 text-blue-700",
  PRODUTO: "bg-orange-100 text-orange-700",
  MERCADO: "bg-yellow-100 text-yellow-700",
  INFORMACAO_GERAL: "bg-slate-100 text-slate-600",
  CUSTOM: "bg-[var(--shell-hover)] text-[var(--shell-subtext)]",
};
const SYSTEM_TOOLS = [
  { name: "criar_evento", label: "Criar evento na agenda", icon: "📅" },
  { name: "excluir_evento", label: "Excluir evento da agenda", icon: "🗑️" },
  { name: "remarcar_evento", label: "Remarcar evento", icon: "🔄" },
  { name: "buscar_lead", label: "Buscar lead por nome/telefone", icon: "🔍" },
  { name: "mover_funil", label: "Mover lead no funil", icon: "➡️" },
  { name: "criar_lead", label: "Criar lead manual", icon: "➕" },
];
const PERMISSIONS = [
  { key: "leads", label: "Leads" },
  { key: "calendar", label: "Agenda" },
  { key: "products", label: "Produtos" },
  { key: "manager_queue", label: "Fila gerencial" },
  { key: "funnel", label: "Funil" },
];

function getUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
}

/* ─── Organogram Node ───────────────────────────────────────────────── */
function OrgNode({ agent, selectedId, onSelect, depth = 0 }: {
  agent: Agent; selectedId: string | null;
  onSelect: (a: Agent) => void; depth?: number;
}) {
  const sel = selectedId === agent.id;
  return (
    <div className="flex flex-col items-center select-none">
      {depth > 0 && <div className="w-px h-8 bg-slate-200" />}
      <button
        onClick={() => onSelect(agent)}
        className={`group relative rounded-2xl border-2 p-4 w-52 text-left transition-all duration-150 ${
          sel ? "border-slate-900 bg-slate-900 shadow-lg scale-105"
          : agent.isOrchestrator ? "border-slate-600 bg-slate-800 shadow-md hover:scale-102"
          : "border-slate-200 bg-[var(--shell-card-bg)] shadow-sm hover:border-slate-400 hover:shadow-md"
        }`}
      >
        {agent.isOrchestrator && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 whitespace-nowrap shadow">
            ORQUESTRADOR
          </div>
        )}
        <div className="flex items-start justify-between">
          <p className={`text-sm font-semibold leading-snug ${sel || agent.isOrchestrator ? "text-white" : "text-[var(--shell-text)]"}`}>
            {agent.title}
          </p>
          <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${agent.active ? "bg-emerald-400" : "bg-[var(--shell-card-border)]"}`} />
        </div>
        <p className={`mt-1 text-xs ${sel || agent.isOrchestrator ? "text-slate-300" : "text-[var(--shell-subtext)]"}`}>
          {(agent as any).agentType === "OPERACIONAL"
            ? "🔧 Operacional"
            : agent.mode === "AUTOPILOT" ? "⚡ Autopilot" : "🤝 Copilot"}
        </p>
        <div className={`mt-3 flex gap-3 text-[11px] ${sel || agent.isOrchestrator ? "text-slate-300" : "text-[var(--shell-subtext)]"}`}>
          <span>📚 {agent.knowledgeBases.length} KB</span>
          <span>🔧 {agent.tools.length} tools</span>
        </div>
        {agent.routingKeywords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {agent.routingKeywords.slice(0, 3).map(kw => (
              <span key={kw} className={`rounded-full px-2 py-0.5 text-[10px] ${sel || agent.isOrchestrator ? "bg-[var(--shell-card-bg)]/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                {kw}
              </span>
            ))}
            {agent.routingKeywords.length > 3 && (
              <span className={`text-[10px] ${sel || agent.isOrchestrator ? "text-slate-400" : "text-[var(--shell-subtext)]"}`}>+{agent.routingKeywords.length - 3}</span>
            )}
          </div>
        )}
      </button>
      {agent.children.length > 0 && (
        <>
          <div className="w-px h-8 bg-slate-200" />
          {agent.children.length > 1 && (
            <div className="border-t-2 border-slate-200" style={{ width: `${agent.children.length * 224 + (agent.children.length - 1) * 32 - 56}px` }} />
          )}
          <div className="flex gap-8">
            {agent.children.map(child => (
              <OrgNode key={child.id} agent={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Side Panel ─────────────────────────────────────────────────────── */
function Panel({ agent, isNew, allAgents, allKbs, tenantId, onSave, onDelete, onClose }: {
  agent: Agent | null; isNew: boolean;
  allAgents: Agent[]; allKbs: Kb[]; tenantId: string;
  onSave: () => void; onDelete?: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"config" | "kb" | "tools">("config");
  const [title, setTitle] = useState(agent?.title ?? "");
  const [slug, setSlug] = useState(agent?.slug ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [objective, setObjective] = useState(agent?.objective ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [agentType, setAgentType] = useState<"CONVERSACIONAL" | "OPERACIONAL">((agent as any)?.agentType ?? "CONVERSACIONAL");
  const [mode, setMode] = useState<"COPILOT" | "AUTOPILOT">(agent?.mode ?? "COPILOT");
  const [active, setActive] = useState(agent?.active ?? true);
  const [model, setModel] = useState((agent as any)?.model ?? "");
  const [temperature, setTemperature] = useState<number>((agent as any)?.temperature ?? 0.7);
  const [isOrchestrator, setIsOrchestrator] = useState(agent?.isOrchestrator ?? false);
  const [parentId, setParentId] = useState(agent?.parentAgentId ?? "");
  const [keywords, setKeywords] = useState(agent?.routingKeywords?.join(", ") ?? "");
  const [permissions, setPermissions] = useState<string[]>(agent?.permissions ?? []);
  const [linkedKbs, setLinkedKbs] = useState<string[]>(agent?.knowledgeBases.map(l => l.knowledgeBase.id) ?? []);
  const [tools, setTools] = useState<AgentTool[]>(agent?.tools ?? []);
  const [saving, setSaving] = useState(false);

  // KB create form
  const [showKbForm, setShowKbForm] = useState(false);
  const [kbTitle, setKbTitle] = useState("");
  const [kbType, setKbType] = useState("SKILL");
  const [kbPrompt, setKbPrompt] = useState("");
  const [savingKb, setSavingKb] = useState(false);

  // Tool form
  const [showToolForm, setShowToolForm] = useState(false);
  const [editingTool, setEditingTool] = useState<AgentTool | null>(null);
  const [toolLabel, setToolLabel] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const [toolUrl, setToolUrl] = useState("");
  const [toolMethod, setToolMethod] = useState("POST");
  const [savingTool, setSavingTool] = useState(false);

  // Teaching management
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null);
  const [teachings, setTeachings] = useState<Record<string, Teaching[]>>({});
  const [loadingTeachings, setLoadingTeachings] = useState<string | null>(null);
  const [showTeachingForm, setShowTeachingForm] = useState(false);
  const [editingTeaching, setEditingTeaching] = useState<Teaching | null>(null);
  const [teachingKbId, setTeachingKbId] = useState<string | null>(null);
  const [teachingTitle, setTeachingTitle] = useState("");
  const [teachingQuestion, setTeachingQuestion] = useState("");
  const [teachingAnswer, setTeachingAnswer] = useState("");
  const [savingTeaching, setSavingTeaching] = useState(false);

  function togglePerm(k: string) {
    setPermissions(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  }

  async function toggleKb(kbId: string) {
    if (!agent) return;
    if (linkedKbs.includes(kbId)) {
      await apiFetch(`/ai-agents/${tenantId}/${agent.id}/kb/${kbId}`, { method: "DELETE" });
      setLinkedKbs(p => p.filter(x => x !== kbId));
    } else {
      await apiFetch(`/ai-agents/${tenantId}/${agent.id}/kb/${kbId}`, { method: "POST" });
      setLinkedKbs(p => [...p, kbId]);
    }
  }

  async function createKb() {
    if (!agent || !kbTitle.trim() || !kbPrompt.trim()) return;
    setSavingKb(true);
    try {
      const kb = await apiFetch("/knowledge-base", {
        method: "POST",
        body: JSON.stringify({ title: kbTitle.trim(), type: kbType, prompt: kbPrompt.trim(), audience: "AMBOS", active: true }),
      });
      await apiFetch(`/ai-agents/${tenantId}/${agent.id}/kb/${kb.id}`, { method: "POST" });
      setLinkedKbs(p => [...p, kb.id]);
      setShowKbForm(false);
      setKbTitle(""); setKbPrompt(""); setKbType("SKILL");
      onSave();
    } catch (e: any) { alert(e?.message || "Erro ao criar."); }
    finally { setSavingKb(false); }
  }

  function openToolForm(t?: AgentTool) {
    if (t) {
      setEditingTool(t);
      setToolLabel(t.label); setToolName(t.name);
      setToolDesc(t.description); setToolUrl(t.webhookUrl ?? "");
      setToolMethod(t.webhookMethod);
    } else {
      setEditingTool(null);
      setToolLabel(""); setToolName(""); setToolDesc(""); setToolUrl(""); setToolMethod("POST");
    }
    setShowToolForm(true);
  }

  async function saveTool() {
    if (!agent || !toolLabel.trim() || !toolDesc.trim()) return;
    setSavingTool(true);
    try {
      if (editingTool) {
        const updated = await apiFetch(`/ai-agents/${tenantId}/${agent.id}/tools/${editingTool.id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: toolLabel, description: toolDesc, webhookUrl: toolUrl || null, webhookMethod: toolMethod }),
        });
        setTools(p => p.map(t => t.id === editingTool.id ? updated : t));
      } else {
        const created = await apiFetch(`/ai-agents/${tenantId}/${agent.id}/tools`, {
          method: "POST",
          body: JSON.stringify({ name: toolName, label: toolLabel, description: toolDesc, webhookUrl: toolUrl || null, webhookMethod: toolMethod }),
        });
        setTools(p => [...p, created]);
      }
      setShowToolForm(false);
    } catch (e: any) { alert(e?.message || "Erro ao salvar tool."); }
    finally { setSavingTool(false); }
  }

  async function deleteTool(toolId: string) {
    if (!agent || !confirm("Excluir tool?")) return;
    await apiFetch(`/ai-agents/${tenantId}/${agent.id}/tools/${toolId}`, { method: "DELETE" });
    setTools(p => p.filter(t => t.id !== toolId));
  }

  async function toggleToolActive(tool: AgentTool) {
    if (!agent) return;
    const updated = await apiFetch(`/ai-agents/${tenantId}/${agent.id}/tools/${tool.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !tool.active }),
    });
    setTools(p => p.map(t => t.id === tool.id ? updated : t));
  }

  async function deleteKb(kbId: string) {
    if (!confirm("Excluir esta base de conhecimento permanentemente?")) return;
    await apiFetch(`/knowledge-base/${kbId}`, { method: "DELETE" });
    setLinkedKbs(p => p.filter(x => x !== kbId));
    onSave(); // recarrega lista de KBs disponíveis
  }

  async function toggleKbExpand(kbId: string) {
    if (expandedKbId === kbId) { setExpandedKbId(null); return; }
    setExpandedKbId(kbId);
    if (!teachings[kbId]) {
      setLoadingTeachings(kbId);
      try {
        const list = await apiFetch(`/knowledge-base/${kbId}/teachings`);
        setTeachings(p => ({ ...p, [kbId]: Array.isArray(list) ? list : [] }));
      } finally { setLoadingTeachings(null); }
    }
  }

  function openTeachingForm(kbId: string, t?: Teaching) {
    setTeachingKbId(kbId);
    setExpandedKbId(kbId);
    if (t) {
      setEditingTeaching(t);
      setTeachingTitle(t.title ?? "");
      setTeachingQuestion(t.leadMessage ?? "");
      setTeachingAnswer(t.approvedResponse);
    } else {
      setEditingTeaching(null);
      setTeachingTitle(""); setTeachingQuestion(""); setTeachingAnswer("");
    }
    setShowTeachingForm(true);
  }

  async function saveTeaching() {
    if (!teachingKbId || !teachingAnswer.trim()) return;
    setSavingTeaching(true);
    try {
      if (editingTeaching) {
        const updated = await apiFetch(`/knowledge-base/${teachingKbId}/teachings/${editingTeaching.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: teachingTitle || undefined, leadMessage: teachingQuestion || undefined, approvedResponse: teachingAnswer }),
        });
        setTeachings(p => ({ ...p, [teachingKbId]: p[teachingKbId].map(t => t.id === editingTeaching.id ? updated : t) }));
      } else {
        const created = await apiFetch(`/knowledge-base/${teachingKbId}/teachings`, {
          method: "POST",
          body: JSON.stringify({ title: teachingTitle || undefined, leadMessage: teachingQuestion || undefined, approvedResponse: teachingAnswer }),
        });
        setTeachings(p => ({ ...p, [teachingKbId]: [...(p[teachingKbId] ?? []), created] }));
      }
      setShowTeachingForm(false);
      setEditingTeaching(null); setTeachingTitle(""); setTeachingQuestion(""); setTeachingAnswer("");
    } catch (e: any) { alert(e?.message || "Erro ao salvar."); }
    finally { setSavingTeaching(false); }
  }

  async function deleteTeaching(kbId: string, teachingId: string) {
    if (!confirm("Excluir ensinamento?")) return;
    await apiFetch(`/knowledge-base/${kbId}/teachings/${teachingId}`, { method: "DELETE" });
    setTeachings(p => ({ ...p, [kbId]: p[kbId].filter(t => t.id !== teachingId) }));
  }

  async function save() {
    if (!title.trim() || !slug.trim()) return alert("Título e slug obrigatórios.");
    setSaving(true);
    try {
      const isOp = agentType === "OPERACIONAL";
      const body = {
        title: title.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || null,
        objective: objective.trim() || null,
        prompt: prompt.trim(),
        agentType,
        mode: isOp ? "AUTOPILOT" : mode,
        active,
        isOrchestrator: isOp ? false : isOrchestrator,
        model: model.trim() || null,
        temperature: temperature ?? null,
        parentAgentId: isOp ? null : (parentId || null),
        routingKeywords: isOp ? [] : keywords.split(",").map(s => s.trim()).filter(Boolean),
        permissions: isOp ? [] : permissions,
      };
      if (isNew) {
        await apiFetch("/ai-agents", { method: "POST", body: JSON.stringify({ ...body, tenantId }) });
      } else {
        await apiFetch(`/ai-agents/${tenantId}/${agent!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      onSave();
    } catch (e: any) { alert(e?.message || "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  const parents = allAgents.filter(a => a.id !== agent?.id && !a.parentAgentId);
  const unlinkedKbs = allKbs.filter(k => !linkedKbs.includes(k.id));
  const linkedKbData = allKbs.filter(k => linkedKbs.includes(k.id));

  return (
    <div className="flex flex-col h-full bg-[var(--shell-card-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-[var(--shell-card-bg)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--shell-text)]">{isNew ? "Novo Agente" : agent?.title}</h2>
          {!isNew && agent && (
            <p className="text-xs text-[var(--shell-subtext)] font-mono mt-0.5">{agent.slug}</p>
          )}
        </div>
        <button onClick={onClose} className="rounded-full h-8 w-8 flex items-center justify-center text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-subtext)] text-xl">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-[var(--shell-card-bg)] px-6">
        {(["config", "kb", "tools"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)]"}`}>
            {t === "config" ? "Configuração" : t === "kb" ? `Conhecimento ${linkedKbs.length > 0 ? `(${linkedKbs.length})` : ""}` : `Tools ${tools.length > 0 ? `(${tools.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Config ── */}
        {tab === "config" && (
          <div className="divide-y divide-gray-100">

            {/* Identificação */}
            <div className="px-8 py-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">Identificação</p>
              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Título *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Ex: Secretaria Pessoal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">
                  Slug * <span className="font-normal text-[var(--shell-subtext)] text-xs ml-1">identificador único</span>
                </label>
                <input value={slug} onChange={e => setSlug(e.target.value)}
                  className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm font-mono outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="secretaria-pessoal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">
                  Descrição <span className="font-normal text-[var(--shell-subtext)] text-xs ml-1">resumo curto — visível no organograma</span>
                </label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Assistente pessoal do corretor" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Objetivo</label>
                <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 resize-none transition-all"
                  placeholder="Descreva o objetivo detalhado deste agente, quando ele deve ser acionado e o que deve fazer." />
              </div>
            </div>

            {/* Comportamento */}
            <div className="px-8 py-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">Comportamento</p>

              {/* Tipo: Conversacional / Operacional */}
              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Tipo</label>
                <div className="flex rounded-xl border border-[var(--shell-card-border)] overflow-hidden w-fit">
                  {(["CONVERSACIONAL", "OPERACIONAL"] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setAgentType(t)}
                      className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                        agentType === t
                          ? t === "OPERACIONAL" ? "bg-purple-600 text-white" : "bg-slate-900 text-white"
                          : "bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] hover:bg-[var(--shell-bg)]"
                      }`}>
                      {t === "CONVERSACIONAL" ? "Conversacional" : "Operacional"}
                    </button>
                  ))}
                </div>
                {agentType === "OPERACIONAL" && (
                  <p className="mt-2 text-xs text-purple-600">
                    Opera em segundo plano — nunca fala diretamente com o lead.
                  </p>
                )}
              </div>

              {agentType === "CONVERSACIONAL" && (
              <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Modo</label>
                  <select value={mode} onChange={e => setMode(e.target.value as any)}
                    className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 bg-[var(--shell-card-bg)]">
                    <option value="COPILOT">🤝 Copilot — sugere</option>
                    <option value="AUTOPILOT">⚡ Autopilot — age</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-3 pb-1">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${active ? "bg-slate-900" : "bg-[var(--shell-card-border)]"}`}
                      onClick={() => setActive(!active)}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-sm text-[var(--shell-subtext)]">Ativo</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${isOrchestrator ? "bg-amber-500" : "bg-[var(--shell-card-border)]"}`}
                      onClick={() => setIsOrchestrator(!isOrchestrator)}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${isOrchestrator ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-sm text-[var(--shell-subtext)]">Orquestrador</span>
                  </label>
                </div>
              </div>

              {isOrchestrator && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <p className="font-semibold mb-1">Como funciona o Orquestrador</p>
                  <p className="text-xs leading-relaxed text-blue-700">
                    O Orquestrador analisa a conversa e decide qual agente sub responde. Seu prompt define as regras de roteamento. Os agentes filhos aparecem listados automaticamente para o modelo de IA escolher o mais adequado.
                  </p>
                </div>
              )}

              {!isOrchestrator && (
                <div>
                  <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Agente pai</label>
                  <select value={parentId} onChange={e => setParentId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 bg-[var(--shell-card-bg)]">
                    <option value="">— Raiz (sem pai) —</option>
                    {parents.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Palavras-chave de roteamento</label>
                <input value={keywords} onChange={e => setKeywords(e.target.value)}
                  className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Ex: preço, visita, renda" />
                <p className="mt-1.5 text-xs text-[var(--shell-subtext)]">Separadas por vírgula. O orquestrador usa essas palavras para rotear a mensagem.</p>
              </div>
              </> /* end agentType === CONVERSACIONAL */
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Modelo de IA</label>
                  <input
                    list="ai-models"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                    placeholder="gpt-4o-mini (padrão)"
                  />
                  <datalist id="ai-models">
                    <option value="">— Padrão do sistema (gpt-4o-mini) —</option>
                    <optgroup label="OpenAI">
                      <option value="gpt-4o" />
                      <option value="gpt-4o-mini" />
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="claude-opus-4-6" />
                      <option value="claude-sonnet-4-6" />
                      <option value="claude-sonnet-4-5" />
                      <option value="claude-haiku-4-5-20251001" />
                    </optgroup>
                  </datalist>
                  {(() => {
                    const KNOWN_MODELS = ["gpt-4o", "gpt-4o-mini", "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5-20251001"];
                    if (!model.trim()) return <p className="mt-1 text-xs text-[var(--shell-subtext)]">Deixe vazio para usar o padrão do sistema.</p>;
                    if (KNOWN_MODELS.includes(model.trim())) return (
                      <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                        <span>✓</span> Tecnologia ativada
                      </p>
                    );
                    return (
                      <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                        <span>⚠</span> Modelo não reconhecido — verifique o nome exato
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--shell-subtext)] mb-2">Temperature ({temperature})</label>
                  <input type="range" min={0} max={1} step={0.05} value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                    className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-[var(--shell-subtext)] mt-1">
                    <span>Preciso (0)</span><span>Criativo (1)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Permissões — só para Conversacional */}
            {agentType === "CONVERSACIONAL" && (
            <div className="px-8 py-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">Acesso a dados do CRM</p>
              <div className="grid grid-cols-2 gap-2.5">
                {PERMISSIONS.map(p => (
                  <button key={p.key} onClick={() => togglePerm(p.key)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all text-left ${
                      permissions.includes(p.key)
                        ? "border-slate-900 bg-slate-900 text-white font-medium"
                        : "border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:border-[var(--shell-card-border)] hover:bg-[var(--shell-bg)]"
                    }`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      permissions.includes(p.key) ? "border-white bg-[var(--shell-card-bg)]" : "border-[var(--shell-card-border)]"
                    }`}>
                      {permissions.includes(p.key) && <div className="w-2 h-2 rounded-sm bg-slate-900" />}
                    </div>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Prompt */}
            <div className="px-8 py-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">Prompt / Personalidade</p>
                <span className="text-xs text-[var(--shell-subtext)]">{prompt.length} chars</span>
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={10}
                className="w-full rounded-xl border border-[var(--shell-card-border)] px-4 py-3 text-sm font-mono outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 resize-y transition-all leading-relaxed"
                placeholder="Você é uma assistente especialista em imóveis da imobiliária [Nome]..." />
            </div>

          </div>
        )}

        {/* ── Conhecimento ── */}
        {tab === "kb" && (
          <div className="p-6 space-y-4">
            {isNew ? (
              <p className="text-sm text-[var(--shell-subtext)] text-center py-8">Salve o agente primeiro para vincular conhecimento.</p>
            ) : (
              <>
                {/* KBs vinculadas */}
                {linkedKbData.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--shell-subtext)] uppercase tracking-wide">Vinculados</p>
                    {linkedKbData.map(kb => (
                      <div key={kb.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                          <button onClick={() => toggleKbExpand(kb.id)} className="flex items-center gap-3 flex-1 text-left">
                            <span className={`text-xs transition-transform ${expandedKbId === kb.id ? "rotate-90" : ""}`}>▶</span>
                            <div>
                              <p className="text-sm font-medium text-[var(--shell-text)]">{kb.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${KB_TYPE_COLORS[kb.type] || "bg-[var(--shell-hover)] text-[var(--shell-subtext)]"}`}>
                                  {KB_TYPE_LABELS[kb.type] || kb.type}
                                </span>
                                <span className="text-[11px] text-[var(--shell-subtext)]">
                                  {teachings[kb.id]?.length ?? kb._count.teachings} ensinamentos · {kb._count.documents} docs
                                </span>
                              </div>
                            </div>
                          </button>
                          <button onClick={() => toggleKb(kb.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 ml-2">Remover</button>
                        </div>

                        {/* Expanded content */}
                        {expandedKbId === kb.id && (
                          <div className="border-t border-slate-200 bg-[var(--shell-card-bg)] p-4 space-y-3">
                            {loadingTeachings === kb.id ? (
                              <p className="text-xs text-[var(--shell-subtext)] text-center py-2">Carregando...</p>
                            ) : (
                              <>
                                {/* Teaching list */}
                                {(teachings[kb.id] ?? []).length === 0 && !showTeachingForm && (
                                  <p className="text-xs text-[var(--shell-subtext)] text-center py-2">Nenhum ensinamento ainda.</p>
                                )}
                                {(teachings[kb.id] ?? []).map(t => (
                                  <div key={t.id} className="rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-bg)] p-3 space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-semibold text-[var(--shell-subtext)]">{t.title || "Sem título"}</p>
                                      <div className="flex gap-1 shrink-0">
                                        <button onClick={() => openTeachingForm(kb.id, t)} className="text-[11px] text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)] px-1">✏️</button>
                                        <button onClick={() => deleteTeaching(kb.id, t.id)} className="text-[11px] text-red-300 hover:text-red-600 px-1">×</button>
                                      </div>
                                    </div>
                                    {t.leadMessage && <p className="text-[11px] text-blue-500 italic">"{t.leadMessage}"</p>}
                                    <p className="text-xs text-[var(--shell-subtext)] whitespace-pre-wrap">{t.approvedResponse}</p>
                                  </div>
                                ))}

                                {/* Teaching form */}
                                {showTeachingForm && teachingKbId === kb.id ? (
                                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
                                    <p className="text-xs font-medium text-slate-700">{editingTeaching ? "Editar ensinamento" : "Novo ensinamento"}</p>
                                    <input value={teachingTitle} onChange={e => setTeachingTitle(e.target.value)}
                                      className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs outline-none focus:border-slate-400"
                                      placeholder="Título (opcional)" />
                                    <input value={teachingQuestion} onChange={e => setTeachingQuestion(e.target.value)}
                                      className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs outline-none focus:border-slate-400"
                                      placeholder="Situação / pergunta do lead (opcional)" />
                                    <textarea value={teachingAnswer} onChange={e => setTeachingAnswer(e.target.value)} rows={4}
                                      className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none"
                                      placeholder="Resposta aprovada / instrução para o agente *" />
                                    <div className="flex gap-2">
                                      <button onClick={() => { setShowTeachingForm(false); setEditingTeaching(null); }}
                                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-card-bg)]">Cancelar</button>
                                      <button onClick={saveTeaching} disabled={savingTeaching || !teachingAnswer.trim()}
                                        className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                                        {savingTeaching ? "Salvando..." : "Salvar"}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => openTeachingForm(kb.id)}
                                    className="w-full rounded-lg border border-dashed border-[var(--shell-card-border)] py-2 text-xs text-[var(--shell-subtext)] hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                                    + Adicionar ensinamento
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Criar nova base */}
                {showKbForm ? (
                  <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 space-y-3">
                    <p className="text-sm font-medium text-emerald-800">Nova base de conhecimento</p>
                    <div>
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Título</label>
                      <input value={kbTitle} onChange={e => setKbTitle(e.target.value)} className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm outline-none focus:border-emerald-400" placeholder="Ex: Script de abordagem inicial" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Tipo</label>
                      <select value={kbType} onChange={e => setKbType(e.target.value)} className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm outline-none">
                        {Object.entries(KB_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Conteúdo / Instrução</label>
                      <textarea value={kbPrompt} onChange={e => setKbPrompt(e.target.value)} rows={4}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm outline-none resize-none focus:border-emerald-400"
                        placeholder="Descreva como o agente deve agir nessa situação..." />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowKbForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-card-bg)]">Cancelar</button>
                      <button onClick={createKb} disabled={savingKb} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        {savingKb ? "Criando..." : "Criar e vincular"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowKbForm(true)} className="w-full rounded-xl border-2 border-dashed border-[var(--shell-card-border)] py-3 text-sm text-[var(--shell-subtext)] hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                    + Criar nova base de conhecimento
                  </button>
                )}

                {/* Vincular existente */}
                {unlinkedKbs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--shell-subtext)] uppercase tracking-wide">Disponíveis para vincular</p>
                    {unlinkedKbs.map(kb => (
                      <div key={kb.id} className="flex items-center gap-2 rounded-xl border border-[var(--shell-card-border)] px-4 py-3 hover:border-slate-300 hover:bg-[var(--shell-bg)] transition-colors">
                        <button onClick={() => toggleKb(kb.id)} className="flex-1 text-left">
                          <p className="text-sm font-medium text-[var(--shell-subtext)]">{kb.title}</p>
                          <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${KB_TYPE_COLORS[kb.type] || "bg-[var(--shell-hover)] text-[var(--shell-subtext)]"}`}>
                            {KB_TYPE_LABELS[kb.type] || kb.type}
                          </span>
                        </button>
                        <span onClick={() => toggleKb(kb.id)} className="text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-800">+ Vincular</span>
                        <button onClick={() => deleteKb(kb.id)} className="text-xs text-red-300 hover:text-red-600 px-1 ml-1" title="Excluir base">🗑️</button>
                      </div>
                    ))}
                  </div>
                )}

                {linkedKbData.length === 0 && unlinkedKbs.length === 0 && !showKbForm && (
                  <p className="text-sm text-[var(--shell-subtext)] text-center py-4">Nenhuma base disponível.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tools ── */}
        {tab === "tools" && (
          <div className="p-6 space-y-5">
            {/* Tools do sistema */}
            <div>
              <p className="text-xs font-medium text-[var(--shell-subtext)] uppercase tracking-wide mb-2">Tools do sistema</p>
              <div className="space-y-2">
                {SYSTEM_TOOLS.map(t => {
                  const existing = tools.find(x => x.name === t.name && x.type === "SYSTEM");
                  return (
                    <div key={t.name} className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] px-4 py-3">
                      <span className="text-lg">{t.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[var(--shell-text)]">{t.label}</p>
                        <p className="text-[11px] font-mono text-[var(--shell-subtext)]">{t.name}</p>
                      </div>
                      <span className="text-[11px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 font-medium">Sistema</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Webhook tools */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-[var(--shell-subtext)] uppercase tracking-wide">Seus tools (webhook)</p>
                {!isNew && (
                  <button onClick={() => openToolForm()} className="text-xs rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800">
                    + Novo tool
                  </button>
                )}
              </div>

              {isNew && (
                <p className="text-sm text-[var(--shell-subtext)] text-center py-4">Salve o agente para criar tools personalizados.</p>
              )}

              {!isNew && showToolForm && (
                <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 space-y-3 mb-3">
                  <p className="text-sm font-medium text-blue-800">{editingTool ? "Editar tool" : "Novo tool via webhook"}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Nome (snake_case)</label>
                      <input value={toolName} onChange={e => setToolName(e.target.value)} disabled={!!editingTool}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs font-mono outline-none focus:border-blue-400 disabled:bg-[var(--shell-hover)]" placeholder="consultar_tabela" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Label</label>
                      <input value={toolLabel} onChange={e => setToolLabel(e.target.value)}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Consultar tabela de preços" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Descrição <span className="font-normal text-[var(--shell-subtext)]">(o AI lê isso para decidir quando usar)</span></label>
                    <textarea value={toolDesc} onChange={e => setToolDesc(e.target.value)} rows={2}
                      className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm outline-none resize-none focus:border-blue-400"
                      placeholder="Use quando o usuário perguntar sobre preços ou tabela de vendas" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">URL do webhook</label>
                      <input value={toolUrl} onChange={e => setToolUrl(e.target.value)}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm font-mono outline-none focus:border-blue-400" placeholder="https://..." />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Método</label>
                      <select value={toolMethod} onChange={e => setToolMethod(e.target.value)} className="w-full rounded-lg border border-[var(--shell-card-border)] px-2 py-2 text-sm outline-none">
                        <option>POST</option><option>GET</option><option>PUT</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowToolForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-card-bg)]">Cancelar</button>
                    <button onClick={saveTool} disabled={savingTool} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {savingTool ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              )}

              {!isNew && tools.filter(t => t.type === "WEBHOOK").length === 0 && !showToolForm && (
                <div className="rounded-xl border-2 border-dashed border-[var(--shell-card-border)] py-6 text-center">
                  <p className="text-sm text-[var(--shell-subtext)]">Nenhum tool personalizado ainda.</p>
                  <p className="text-xs text-[var(--shell-subtext)] mt-1">Tools via webhook permitem o agente chamar APIs externas.</p>
                </div>
              )}

              {tools.filter(t => t.type === "WEBHOOK").map(tool => (
                <div key={tool.id} className="flex items-start gap-3 rounded-xl border border-[var(--shell-card-border)] px-4 py-3">
                  <span className="text-lg mt-0.5">🔧</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[var(--shell-text)]">{tool.label}</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleToolActive(tool)} className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${tool.active ? "bg-emerald-100 text-emerald-700" : "bg-[var(--shell-hover)] text-[var(--shell-subtext)]"}`}>
                          {tool.active ? "Ativo" : "Inativo"}
                        </button>
                        <button onClick={() => openToolForm(tool)} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)] px-1">✏️</button>
                        <button onClick={() => deleteTool(tool.id)} className="text-xs text-red-300 hover:text-red-600 px-1">×</button>
                      </div>
                    </div>
                    <p className="text-[11px] font-mono text-[var(--shell-subtext)] mt-0.5">{tool.name}</p>
                    <p className="text-xs text-[var(--shell-subtext)] mt-1">{tool.description}</p>
                    {tool.webhookUrl && (
                      <p className="text-[10px] font-mono text-blue-400 truncate mt-1">{tool.webhookMethod} {tool.webhookUrl}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-6 py-4 flex justify-between items-center bg-[var(--shell-card-bg)]">
        {!isNew && onDelete ? (
          <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50">Excluir agente</button>
        ) : <div />}
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-bg)]">Fechar</button>
          {tab === "config" && (
            <button onClick={save} disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Salvando..." : isNew ? "Criar agente" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function CentralAgentesPage() {
  const [tree, setTree] = useState<Agent[]>([]);
  const [flat, setFlat] = useState<Agent[]>([]);
  const [kbs, setKbs] = useState<Kb[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tenantId, setTenantId] = useState("");
  useEffect(() => {
    const u = getUser();
    if (u?.tenantId) setTenantId(u.tenantId);
  }, []);

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  async function load() {
    setLoading(true);
    try {
      const [h, f, k] = await Promise.all([
        apiFetch("/ai-agents/hierarchy"),
        apiFetch(`/ai-agents/${tenantId}`),
        apiFetch("/ai-agents/kbs"),
      ]);
      setTree(Array.isArray(h) ? h : []);
      setFlat(Array.isArray(f) ? f : []);
      setKbs(Array.isArray(k) ? k : []);
    } finally { setLoading(false); }
  }

  async function deleteAgent() {
    if (!selected || !confirm(`Excluir "${selected.title}"?`)) return;
    await apiFetch(`/ai-agents/${tenantId}/${selected.id}`, { method: "DELETE" });
    setSelected(null); setIsNew(false);
    await load();
  }

  function openNew() { setSelected(null); setIsNew(true); }
  function openEdit(a: Agent) { setSelected(a); setIsNew(false); }
  function closePanel() { setSelected(null); setIsNew(false); }

  const panelOpen = isNew || selected !== null;

  return (
    <AppShell title="Central de Agentes">
      <div className="flex -m-6 h-[calc(100vh-56px)] overflow-hidden">

        {/* ── Organograma ── */}
        <div className={`flex-1 overflow-auto bg-[var(--shell-bg)] transition-all ${panelOpen ? "" : ""}`}>
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-xl font-bold text-[var(--shell-text)]">Organograma de Agentes</h1>
                <p className="text-sm text-[var(--shell-subtext)] mt-0.5">Clique em um agente para configurar</p>
              </div>
              <button onClick={openNew} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 shadow-sm">
                + Novo Agente
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <p className="text-[var(--shell-subtext)]">Carregando agentes...</p>
              </div>
            ) : tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="text-5xl">🤖</div>
                <p className="text-[var(--shell-subtext)] font-medium">Nenhum agente criado ainda</p>
                <button onClick={openNew} className="rounded-xl border-2 border-dashed border-[var(--shell-card-border)] px-8 py-3 text-sm text-[var(--shell-subtext)] hover:border-slate-400 hover:text-slate-600">
                  Criar primeiro agente
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-16 items-start">
                {tree.map(root => (
                  <OrgNode key={root.id} agent={root} selectedId={selected?.id ?? null} onSelect={openEdit} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Painel lateral ── */}
        {panelOpen && (
          <div className="w-[600px] shrink-0 border-l shadow-2xl flex flex-col bg-[var(--shell-card-bg)] overflow-hidden">
            <Panel
              key={selected?.id ?? "new"}
              agent={selected}
              isNew={isNew}
              allAgents={flat}
              allKbs={kbs}
              tenantId={tenantId}
              onSave={async () => { await load(); if (isNew) closePanel(); }}
              onDelete={!isNew ? deleteAgent : undefined}
              onClose={closePanel}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
