"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

/* ─── Types ─────────────────────────────────────────────────────────── */
type TemplateTool = {
  id: string; name: string; label: string; description: string;
  type: "SYSTEM" | "WEBHOOK"; webhookUrl: string | null; webhookMethod: string; active: boolean;
};
type Template = {
  id: string; title: string; slug: string; description: string | null;
  objective: string | null; prompt: string; exampleOutput: string | null;
  mode: "COPILOT" | "AUTOPILOT"; audience: string | null; permissions: string[];
  active: boolean; model: string | null; temperature: number | null;
  isOrchestrator: boolean; routingKeywords: string[];
  tools: TemplateTool[]; _count: { agents: number };
};

/* ─── Constants ──────────────────────────────────────────────────────── */
const KNOWN_MODELS = ["gpt-4o", "gpt-4o-mini", "claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5-20251001"];
const PERMISSIONS = [
  { key: "leads", label: "Leads" },
  { key: "calendar", label: "Agenda" },
  { key: "products", label: "Produtos" },
  { key: "manager_queue", label: "Fila gerencial" },
  { key: "funnel", label: "Funil" },
];
const SYSTEM_TOOLS = [
  { name: "criar_evento", label: "Criar evento na agenda", icon: "📅" },
  { name: "excluir_evento", label: "Excluir evento da agenda", icon: "🗑️" },
  { name: "remarcar_evento", label: "Remarcar evento", icon: "🔄" },
  { name: "buscar_lead", label: "Buscar lead por nome/telefone", icon: "🔍" },
  { name: "mover_funil", label: "Mover lead no funil", icon: "➡️" },
  { name: "criar_lead", label: "Criar lead manual", icon: "➕" },
];

const EMPTY_TEMPLATE: Omit<Template, "id" | "_count"> = {
  title: "", slug: "", description: null, objective: null, prompt: "",
  exampleOutput: null, mode: "COPILOT", audience: null, permissions: [],
  active: true, model: null, temperature: 0.7, isOrchestrator: false,
  routingKeywords: [], tools: [],
};

/* ─── Panel ──────────────────────────────────────────────────────────── */
function Panel({ template, isNew, onSave, onDelete, onClose }: {
  template: Template | null; isNew: boolean;
  onSave: () => void; onDelete?: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"config" | "tools">("config");
  const [title, setTitle] = useState(template?.title ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [objective, setObjective] = useState(template?.objective ?? "");
  const [prompt, setPrompt] = useState(template?.prompt ?? "");
  const [mode, setMode] = useState<"COPILOT" | "AUTOPILOT">(template?.mode ?? "COPILOT");
  const [active, setActive] = useState(template?.active ?? true);
  const [model, setModel] = useState(template?.model ?? "");
  const [temperature, setTemperature] = useState(template?.temperature ?? 0.7);
  const [isOrchestrator, setIsOrchestrator] = useState(template?.isOrchestrator ?? false);
  const [keywords, setKeywords] = useState(template?.routingKeywords?.join(", ") ?? "");
  const [permissions, setPermissions] = useState<string[]>(template?.permissions ?? []);
  const [tools, setTools] = useState<TemplateTool[]>(template?.tools ?? []);
  const [saving, setSaving] = useState(false);

  // Tool form
  const [showToolForm, setShowToolForm] = useState(false);
  const [editingTool, setEditingTool] = useState<TemplateTool | null>(null);
  const [toolLabel, setToolLabel] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const [toolUrl, setToolUrl] = useState("");
  const [toolMethod, setToolMethod] = useState("POST");
  const [savingTool, setSavingTool] = useState(false);

  function togglePerm(k: string) {
    setPermissions(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  }

  function openToolForm(t?: TemplateTool) {
    if (t) {
      setEditingTool(t); setToolLabel(t.label); setToolName(t.name);
      setToolDesc(t.description); setToolUrl(t.webhookUrl ?? ""); setToolMethod(t.webhookMethod);
    } else {
      setEditingTool(null); setToolLabel(""); setToolName(""); setToolDesc(""); setToolUrl(""); setToolMethod("POST");
    }
    setShowToolForm(true);
  }

  async function saveTool() {
    if (!template || !toolLabel.trim() || !toolDesc.trim()) return;
    setSavingTool(true);
    try {
      if (editingTool) {
        const updated = await adminFetch(`/admin/agent-templates/${template.id}/tools/${editingTool.id}`, {
          method: "PATCH",
          body: JSON.stringify({ label: toolLabel, description: toolDesc, webhookUrl: toolUrl || null, webhookMethod: toolMethod }),
        });
        setTools(p => p.map(t => t.id === editingTool.id ? updated : t));
      } else {
        const created = await adminFetch(`/admin/agent-templates/${template.id}/tools`, {
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
    if (!template || !confirm("Excluir tool?")) return;
    await adminFetch(`/admin/agent-templates/${template.id}/tools/${toolId}`, { method: "DELETE" });
    setTools(p => p.filter(t => t.id !== toolId));
  }

  async function toggleToolActive(tool: TemplateTool) {
    if (!template) return;
    const updated = await adminFetch(`/admin/agent-templates/${template.id}/tools/${tool.id}`, {
      method: "PATCH", body: JSON.stringify({ active: !tool.active }),
    });
    setTools(p => p.map(t => t.id === tool.id ? updated : t));
  }

  async function save() {
    if (!title.trim() || !slug.trim()) return alert("Título e slug obrigatórios.");
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim() || null,
        objective: objective.trim() || null,
        prompt: prompt.trim(),
        mode, active, isOrchestrator,
        model: model.trim() || null,
        temperature: temperature ?? null,
        routingKeywords: keywords.split(",").map((s: string) => s.trim()).filter(Boolean),
        permissions,
      };
      if (isNew) {
        await adminFetch("/admin/agent-templates", { method: "POST", body: JSON.stringify(body) });
      } else {
        await adminFetch(`/admin/agent-templates/${template!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      onSave();
    } catch (e: any) { alert(e?.message || "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{isNew ? "Novo Template" : template?.title}</h2>
          {!isNew && template && <p className="text-xs text-gray-400 font-mono mt-0.5">{template.slug}</p>}
        </div>
        <button onClick={onClose} className="rounded-full h-8 w-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 text-xl">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white px-6">
        {(["config", "tools"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}>
            {t === "config" ? "Configuração" : `Tools ${tools.filter(x => x.type === "WEBHOOK").length > 0 ? `(${tools.filter(x => x.type === "WEBHOOK").length})` : ""}`}
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
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Identificação</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Título *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Ex: Qualificação Padrão" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug * <span className="font-normal text-gray-400 text-xs ml-1">identificador único</span>
                </label>
                <input value={slug} onChange={e => setSlug(e.target.value)} disabled={!isNew}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-mono outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="qualificacao-padrao" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição <span className="font-normal text-gray-400 text-xs ml-1">resumo curto</span>
                </label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Assistente de qualificação de leads" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Objetivo</label>
                <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 resize-none transition-all"
                  placeholder="Descreva o objetivo detalhado deste agente." />
              </div>
            </div>

            {/* Comportamento */}
            <div className="px-8 py-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Comportamento</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Modo</label>
                  <select value={mode} onChange={e => setMode(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white">
                    <option value="COPILOT">🤝 Copilot — sugere</option>
                    <option value="AUTOPILOT">⚡ Autopilot — age</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-3 pb-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${active ? "bg-slate-900" : "bg-gray-200"}`} onClick={() => setActive(!active)}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-sm text-gray-700">Ativo</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${isOrchestrator ? "bg-amber-500" : "bg-gray-200"}`} onClick={() => setIsOrchestrator(!isOrchestrator)}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOrchestrator ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-sm text-gray-700">Orquestrador</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Palavras-chave de roteamento</label>
                <input value={keywords} onChange={e => setKeywords(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                  placeholder="Ex: preço, visita, renda" />
                <p className="mt-1.5 text-xs text-gray-400">Separadas por vírgula.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Modelo de IA</label>
                  <input list="ai-models-tpl" value={model} onChange={e => setModel(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition-all"
                    placeholder="gpt-4o-mini (padrão)" />
                  <datalist id="ai-models-tpl">
                    <option value="gpt-4o" /><option value="gpt-4o-mini" />
                    <option value="claude-opus-4-6" /><option value="claude-sonnet-4-6" />
                    <option value="claude-sonnet-4-5" /><option value="claude-haiku-4-5-20251001" />
                  </datalist>
                  {!model.trim() ? (
                    <p className="mt-1 text-xs text-gray-400">Deixe vazio para usar o padrão do sistema.</p>
                  ) : KNOWN_MODELS.includes(model.trim()) ? (
                    <p className="mt-1 text-xs text-green-600 flex items-center gap-1"><span>✓</span> Tecnologia ativada</p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-600 flex items-center gap-1"><span>⚠</span> Modelo não reconhecido — verifique o nome exato</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Temperature ({temperature})</label>
                  <input type="range" min={0} max={1} step={0.05} value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Preciso (0)</span><span>Criativo (1)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Permissões */}
            <div className="px-8 py-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Acesso a dados do CRM</p>
              <div className="grid grid-cols-2 gap-2.5">
                {PERMISSIONS.map(p => (
                  <button key={p.key} onClick={() => togglePerm(p.key)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all text-left ${permissions.includes(p.key) ? "border-slate-900 bg-slate-900 text-white font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${permissions.includes(p.key) ? "border-white bg-white" : "border-gray-300"}`}>
                      {permissions.includes(p.key) && <div className="w-2 h-2 rounded-sm bg-slate-900" />}
                    </div>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div className="px-8 py-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Prompt / Personalidade</p>
                <span className="text-xs text-gray-400">{prompt.length} chars</span>
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={10}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-mono outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 resize-y transition-all leading-relaxed"
                placeholder="Você é uma assistente especialista em imóveis da imobiliária [Nome]..." />
            </div>
          </div>
        )}

        {/* ── Tools ── */}
        {tab === "tools" && (
          <div className="p-6 space-y-5">
            {/* System tools */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tools do sistema</p>
              <div className="space-y-2">
                {SYSTEM_TOOLS.map(t => (
                  <div key={t.name} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
                    <span className="text-lg">{t.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{t.label}</p>
                      <p className="text-[11px] font-mono text-gray-400">{t.name}</p>
                    </div>
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 font-medium">Sistema</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Webhook tools */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Seus tools (webhook)</p>
                {!isNew && (
                  <button onClick={() => openToolForm()} className="text-xs rounded-lg bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800">+ Novo tool</button>
                )}
              </div>

              {isNew && <p className="text-sm text-gray-400 text-center py-4">Salve o template para criar tools personalizados.</p>}

              {!isNew && showToolForm && (
                <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 space-y-3 mb-3">
                  <p className="text-sm font-medium text-blue-800">{editingTool ? "Editar tool" : "Novo tool via webhook"}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nome (snake_case)</label>
                      <input value={toolName} onChange={e => setToolName(e.target.value)} disabled={!!editingTool}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-400 disabled:bg-gray-100" placeholder="consultar_tabela" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                      <input value={toolLabel} onChange={e => setToolLabel(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" placeholder="Consultar tabela de preços" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descrição <span className="font-normal text-gray-400">(o AI lê isso para decidir quando usar)</span></label>
                    <textarea value={toolDesc} onChange={e => setToolDesc(e.target.value)} rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none resize-none focus:border-blue-400"
                      placeholder="Use quando o usuário perguntar sobre preços" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">URL do webhook</label>
                      <input value={toolUrl} onChange={e => setToolUrl(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-400" placeholder="https://..." />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Método</label>
                      <select value={toolMethod} onChange={e => setToolMethod(e.target.value)} className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm outline-none">
                        <option>POST</option><option>GET</option><option>PUT</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowToolForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-white">Cancelar</button>
                    <button onClick={saveTool} disabled={savingTool} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {savingTool ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              )}

              {!isNew && tools.filter(t => t.type === "WEBHOOK").length === 0 && !showToolForm && (
                <div className="rounded-xl border-2 border-dashed border-gray-200 py-6 text-center">
                  <p className="text-sm text-gray-400">Nenhum tool personalizado ainda.</p>
                  <p className="text-xs text-gray-300 mt-1">Tools via webhook permitem o agente chamar APIs externas.</p>
                </div>
              )}

              {tools.filter(t => t.type === "WEBHOOK").map(tool => (
                <div key={tool.id} className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 mb-2">
                  <span className="text-lg mt-0.5">🔧</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{tool.label}</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleToolActive(tool)} className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${tool.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {tool.active ? "Ativo" : "Inativo"}
                        </button>
                        <button onClick={() => openToolForm(tool)} className="text-xs text-gray-400 hover:text-gray-700 px-1">✏️</button>
                        <button onClick={() => deleteTool(tool.id)} className="text-xs text-red-300 hover:text-red-600 px-1">×</button>
                      </div>
                    </div>
                    <p className="text-[11px] font-mono text-gray-400 mt-0.5">{tool.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{tool.description}</p>
                    {tool.webhookUrl && <p className="text-[10px] font-mono text-blue-400 truncate mt-1">{tool.webhookMethod} {tool.webhookUrl}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-6 py-4 flex justify-between items-center bg-white">
        {!isNew && onDelete ? (
          <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50">Excluir template</button>
        ) : <div />}
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Fechar</button>
          {tab === "config" && (
            <button onClick={save} disabled={saving} className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50">
              {saving ? "Salvando..." : isNew ? "Criar template" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Push Modal ─────────────────────────────────────────────────────── */
function PushModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const [pushAll, setPushAll] = useState(true);
  const [pushForce, setPushForce] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    adminFetch("/admin/tenants?limit=200").then((d: any) => setTenants(d.tenants || [])).catch(() => {});
  }, []);

  async function push() {
    setSaving(true); setMsg("");
    try {
      const result = await adminFetch(`/admin/agent-templates/${template.id}/push`, {
        method: "POST",
        body: JSON.stringify({ all: pushAll, tenantIds: pushAll ? undefined : selected, force: pushForce }),
      });
      setMsg(`Criados: ${result.created} | Atualizados: ${result.updated} | Ignorados: ${result.skipped}`);
    } catch (e: any) { setMsg(e.message || "Erro."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg">Distribuir: {template.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={pushAll} onChange={() => setPushAll(true)} /> Todos os tenants ativos
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={!pushAll} onChange={() => setPushAll(false)} /> Selecionar tenants
            </label>
          </div>
          {!pushAll && (
            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
              {tenants.map((t: any) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(t.id)}
                    onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(x => x !== t.id))} />
                  {t.nome} <span className="text-gray-400 text-xs">({t.slug})</span>
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm border-t pt-3 cursor-pointer">
            <input type="checkbox" checked={pushForce} onChange={e => setPushForce(e.target.checked)} />
            Forçar atualização em agents customizados
          </label>
          {msg && <p className="text-sm font-medium text-green-600">{msg}</p>}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Fechar</button>
          <button onClick={push} disabled={saving || (!pushAll && selected.length === 0)}
            className="px-4 py-2 text-sm bg-slate-950 text-white rounded-md hover:bg-slate-900 disabled:opacity-50">
            {saving ? "Distribuindo..." : "Distribuir"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function AgentTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [pushTarget, setPushTarget] = useState<Template | null>(null);

  // Global safety rules
  const [globalRules, setGlobalRules] = useState("");
  const [globalRulesLoading, setGlobalRulesLoading] = useState(true);
  const [globalRulesSaving, setGlobalRulesSaving] = useState(false);
  const [globalRulesMsg, setGlobalRulesMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [globalRulesOpen, setGlobalRulesOpen] = useState(false);

  const load = () => {
    setLoading(true);
    adminFetch("/admin/agent-templates").then((d: any) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    adminFetch("/admin/platform-config")
      .then((d: any) => { setGlobalRules(d?.globalAgentRules ?? ""); })
      .catch(() => {})
      .finally(() => setGlobalRulesLoading(false));
  }, []);

  async function saveGlobalRules() {
    setGlobalRulesSaving(true);
    setGlobalRulesMsg(null);
    try {
      await adminFetch("/admin/platform-config", {
        method: "PATCH",
        body: JSON.stringify({ globalAgentRules: globalRules }),
      });
      setGlobalRulesMsg({ type: "ok", text: "Regras globais salvas com sucesso." });
    } catch (e: any) {
      setGlobalRulesMsg({ type: "err", text: e.message || "Erro ao salvar." });
    } finally {
      setGlobalRulesSaving(false);
    }
  }

  const openCreate = () => { setSelected(null); setIsNew(true); };
  const openEdit = (t: Template) => { setSelected(t); setIsNew(false); };

  const remove = async (id: string) => {
    if (!confirm("Remover template? Os agentes existentes serão desvinculados.")) return;
    await adminFetch(`/admin/agent-templates/${id}`, { method: "DELETE" });
    setSelected(null); load();
  };

  const panelOpen = isNew || selected !== null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Lista */}
      <div className={`flex flex-col ${panelOpen ? "w-96 shrink-0" : "flex-1"} border-r bg-white overflow-hidden`}>
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold">Agent Templates</h1>
            <p className="text-xs text-gray-400 mt-0.5">{templates.length} template(s)</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGlobalRulesOpen(o => !o)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
            >
              🛡️ Regras Globais
            </button>
            <Link href="/admin/agent-templates/outdated" className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50">Desatualizados</Link>
            <button onClick={openCreate} className="rounded-lg bg-slate-950 text-white px-3 py-1.5 text-xs hover:bg-slate-900">+ Novo</button>
          </div>
        </div>

        {/* Global Rules panel */}
        {globalRulesOpen && (
          <div className="border-b bg-amber-50 px-6 py-4 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-amber-900">🛡️ Regras Globais de Segurança</p>
                <p className="text-xs text-amber-700 mt-0.5">Aplicadas em TODOS os agentes de TODOS os tenants. Sobrepõem o prompt do agente.</p>
              </div>
              <button onClick={() => setGlobalRulesOpen(false)} className="text-amber-400 hover:text-amber-700 text-lg">×</button>
            </div>

            <div className="rounded-md border border-amber-200 bg-white p-3 mb-2 text-xs text-amber-800 space-y-1">
              <p className="font-medium">Como funciona a escalação automática:</p>
              <p>Quando a IA detecta ameaça, assédio ou insistência fora do escopo, ela inclui <code className="bg-amber-100 px-1 rounded">[ESCALATE:motivo]</code> na resposta. O sistema remove esse marcador antes de enviar ao lead, pausa o bot e envia uma notificação urgente via WhatsApp para os responsáveis do tenant.</p>
            </div>

            {globalRulesLoading ? (
              <div className="text-xs text-amber-600 py-2">Carregando...</div>
            ) : (
              <>
                <textarea
                  value={globalRules}
                  onChange={e => setGlobalRules(e.target.value)}
                  rows={12}
                  placeholder="Deixe vazio para usar as regras padrão do sistema..."
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-mono outline-none focus:border-amber-500 resize-y"
                />
                <div className="flex items-center justify-between mt-2">
                  {globalRulesMsg ? (
                    <p className={`text-xs ${globalRulesMsg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                      {globalRulesMsg.text}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">Vazio = usa regras padrão de segurança do sistema</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGlobalRules("")}
                      className="rounded-lg border px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
                    >
                      Resetar padrão
                    </button>
                    <button
                      onClick={saveGlobalRules}
                      disabled={globalRulesSaving}
                      className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {globalRulesSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Carregando...</div>
          ) : templates.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">Nenhum template cadastrado.</div>
          ) : templates.map(t => (
            <div key={t.id} onClick={() => openEdit(t)}
              className={`px-6 py-4 cursor-pointer transition-colors ${selected?.id === t.id ? "bg-slate-50 border-l-2 border-slate-900" : "hover:bg-gray-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{t.slug}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-1 truncate">{t.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.mode === "AUTOPILOT" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {t.mode}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {t.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                <span>👥 {t._count.agents} tenants</span>
                <span>🔧 {t.tools.filter(x => x.type === "WEBHOOK").length} tools</span>
              </div>
              <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => setPushTarget(t)} className="text-[11px] text-green-600 hover:underline">Distribuir</button>
                <button onClick={() => remove(t.id)} className="text-[11px] text-red-400 hover:underline">Remover</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel */}
      {panelOpen && (
        <div className="flex-1 overflow-hidden">
          <Panel
            template={selected}
            isNew={isNew}
            onSave={() => { load(); if (isNew) { setIsNew(false); setSelected(null); } else load(); }}
            onDelete={selected ? () => remove(selected.id) : undefined}
            onClose={() => { setSelected(null); setIsNew(false); }}
          />
        </div>
      )}

      {/* Push Modal */}
      {pushTarget && <PushModal template={pushTarget} onClose={() => setPushTarget(null)} />}
    </div>
  );
}
