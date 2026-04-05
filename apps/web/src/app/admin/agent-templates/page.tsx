"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

const EMPTY = {
  title: "", slug: "", description: "", objective: "", prompt: "",
  exampleOutput: "", mode: "COPILOT", audience: "", model: "",
  temperature: "", isOrchestrator: false, active: true, routingKeywords: "",
};

export default function AgentTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | "edit" | "push" | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [editing, setEditing] = useState<any>(null);
  const [pushTarget, setPushTarget] = useState<any>(null);
  const [pushAll, setPushAll] = useState(true);
  const [pushForce, setPushForce] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    adminFetch("/admin/agent-templates").then(setTemplates).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setEditing(null); setModal("create"); setMsg(""); };
  const openEdit = (t: any) => {
    setForm({
      title: t.title, slug: t.slug, description: t.description || "",
      objective: t.objective || "", prompt: t.prompt, exampleOutput: t.exampleOutput || "",
      mode: t.mode, audience: t.audience || "", model: t.model || "",
      temperature: t.temperature ?? "", isOrchestrator: t.isOrchestrator, active: t.active,
      routingKeywords: (t.routingKeywords || []).join(", "),
    });
    setEditing(t);
    setModal("edit");
    setMsg("");
  };

  const openPush = async (t: any) => {
    setPushTarget(t);
    setPushAll(true);
    setPushForce(false);
    setSelectedTenants([]);
    setMsg("");
    const data = await adminFetch("/admin/tenants?limit=200").catch(() => ({ tenants: [] }));
    setTenants(data.tenants || []);
    setModal("push");
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const body = {
        ...form,
        temperature: form.temperature !== "" ? Number(form.temperature) : null,
        routingKeywords: form.routingKeywords ? form.routingKeywords.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      };
      if (editing) {
        await adminFetch(`/admin/agent-templates/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await adminFetch("/admin/agent-templates", { method: "POST", body: JSON.stringify(body) });
      }
      setModal(null);
      load();
    } catch (e: any) {
      setMsg(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover template? Os agentes existentes serão desvinculados.")) return;
    await adminFetch(`/admin/agent-templates/${id}`, { method: "DELETE" });
    load();
  };

  const push = async () => {
    setSaving(true);
    setMsg("");
    try {
      const result = await adminFetch(`/admin/agent-templates/${pushTarget.id}/push`, {
        method: "POST",
        body: JSON.stringify({
          all: pushAll,
          tenantIds: pushAll ? undefined : selectedTenants,
          force: pushForce,
        }),
      });
      setMsg(`Criados: ${result.created} | Atualizados: ${result.updated} | Ignorados: ${result.skipped}`);
    } catch (e: any) {
      setMsg(e.message || "Erro ao distribuir.");
    } finally {
      setSaving(false);
    }
  };

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Templates padrão distribuídos aos tenants</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/agent-templates/outdated" className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
            Ver desatualizados
          </Link>
          <button onClick={openCreate} className="rounded-md bg-slate-950 text-white px-4 py-2 text-sm hover:bg-slate-900">
            + Novo template
          </button>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Título", "Slug", "Modo", "Modelo", "Tenants", "Status", "Ações"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum template cadastrado.</td></tr>
            ) : templates.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{t.title}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.slug}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.mode === "AUTOPILOT" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {t.mode}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.model || "padrão"}</td>
                <td className="px-4 py-3 text-gray-500">{t._count?.agents ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {t.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(t)} className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => openPush(t)} className="text-xs text-green-600 hover:underline">Distribuir</button>
                    <button onClick={() => remove(t.id)} className="text-xs text-red-500 hover:underline">Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal criar/editar */}
      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">{editing ? "Editar template" : "Novo template"}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Título *</label>
                  <input value={form.title} onChange={(e) => f("title", e.target.value)}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Slug *</label>
                  <input value={form.slug} onChange={(e) => f("slug", e.target.value)}
                    disabled={!!editing}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Descrição</label>
                <input value={form.description} onChange={(e) => f("description", e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Objetivo</label>
                <input value={form.objective} onChange={(e) => f("objective", e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Prompt *</label>
                <textarea value={form.prompt} onChange={(e) => f("prompt", e.target.value)} rows={6}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Exemplo de output</label>
                <textarea value={form.exampleOutput} onChange={(e) => f("exampleOutput", e.target.value)} rows={3}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Modo</label>
                  <select value={form.mode} onChange={(e) => f("mode", e.target.value)}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="COPILOT">COPILOT</option>
                    <option value="AUTOPILOT">AUTOPILOT</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Modelo IA</label>
                  <input value={form.model} onChange={(e) => f("model", e.target.value)} placeholder="padrão"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Temperature</label>
                  <input value={form.temperature} onChange={(e) => f("temperature", e.target.value)} type="number" step="0.1" min="0" max="2"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Keywords de roteamento (separadas por vírgula)</label>
                <input value={form.routingKeywords} onChange={(e) => f("routingKeywords", e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={(e) => f("active", e.target.checked)} />
                  Ativo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isOrchestrator} onChange={(e) => f("isOrchestrator", e.target.checked)} />
                  Orquestrador
                </label>
              </div>
              {msg && <p className="text-sm text-red-500">{msg}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-slate-950 text-white rounded-md hover:bg-slate-900 disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal distribuir */}
      {modal === "push" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">Distribuir: {pushTarget?.title}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={pushAll} onChange={() => setPushAll(true)} />
                  Todos os tenants ativos
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={!pushAll} onChange={() => setPushAll(false)} />
                  Selecionar tenants
                </label>
              </div>
              {!pushAll && (
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {tenants.map((t: any) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedTenants.includes(t.id)}
                        onChange={(e) => setSelectedTenants(e.target.checked ? [...selectedTenants, t.id] : selectedTenants.filter((x) => x !== t.id))} />
                      {t.nome} <span className="text-gray-400 text-xs">({t.slug})</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm border-t pt-3">
                <input type="checkbox" checked={pushForce} onChange={(e) => setPushForce(e.target.checked)} />
                <span>Forçar atualização em agents customizados</span>
              </label>
              {msg && <p className="text-sm font-medium text-green-600">{msg}</p>}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Fechar</button>
              <button onClick={push} disabled={saving || (!pushAll && selectedTenants.length === 0)}
                className="px-4 py-2 text-sm bg-slate-950 text-white rounded-md hover:bg-slate-900 disabled:opacity-50">
                {saving ? "Distribuindo..." : "Distribuir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
