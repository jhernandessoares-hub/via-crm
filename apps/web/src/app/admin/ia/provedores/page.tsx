"use client";

import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/admin-api";

type ModelConfig = {
  function: string;
  label: string;
  restrictions: string[] | null;
  modelName: string | null;
  providerLabel: string | null;
  modelLabel: string | null;
};

type AvailableModel = {
  value: string;
  label: string;
  provider: string;
};

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI:     "bg-green-100 text-green-800",
  Anthropic:  "bg-orange-100 text-orange-800",
  Google:     "bg-blue-100 text-blue-800",
};

export default function ProvedoresPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal de edição
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        adminFetch("/admin/ai/model-configs"),
        adminFetch("/admin/ai/models"),
      ]);
      setConfigs(c);
      setModels(m);
    } catch {
      setError("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (cfg: ModelConfig) => {
    setEditing(cfg);
    setSelectedModel(cfg.modelName ?? "");
  };

  const save = async () => {
    if (!editing || !selectedModel) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/ai/model-configs/${editing.function}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: selectedModel }),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async (fn: string) => {
    try {
      await adminFetch(`/admin/ai/model-configs/${fn}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Erro ao remover configuração.");
    }
  };

  // Modelos disponíveis para a função sendo editada (respeitando restrições)
  const availableModels = editing
    ? models.filter((m) => !editing.restrictions || editing.restrictions.includes(m.provider))
    : [];

  const groupedModels = availableModels.reduce<Record<string, AvailableModel[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  if (loading) return <div className="p-8 text-slate-500">Carregando...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Provedores de IA</h1>
      <p className="text-sm text-slate-500 mb-8">
        Define qual modelo é usado em cada função do sistema. As chaves de API continuam no <code className="bg-slate-100 px-1 rounded">.env</code>.
      </p>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-5 py-3 text-left">Função</th>
              <th className="px-5 py-3 text-left">Provider</th>
              <th className="px-5 py-3 text-left">Modelo</th>
              <th className="px-5 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {configs.map((cfg) => (
              <tr key={cfg.function} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div className="font-medium text-slate-700">{cfg.label}</div>
                  {cfg.restrictions && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      Só aceita: {cfg.restrictions.join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  {cfg.providerLabel ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PROVIDER_COLORS[cfg.providerLabel] ?? "bg-slate-100 text-slate-600"}`}>
                      {cfg.providerLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Padrão (env)</span>
                  )}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-slate-600">
                  {cfg.modelLabel ?? <span className="text-slate-400 font-sans">—</span>}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => openEdit(cfg)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {cfg.modelName ? "Trocar" : "Configurar"}
                    </button>
                    {cfg.modelName && (
                      <button
                        onClick={() => clear(cfg.function)}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Funções sem modelo configurado usam <strong>OPENAI_MODEL</strong> do ambiente (fallback: gpt-4o-mini).
      </p>

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800 mb-1">Trocar modelo</h3>
            <p className="text-sm text-slate-500 mb-5">{editing.label}</p>

            {editing.restrictions && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Esta função só aceita modelos <strong>{editing.restrictions.join(" ou ")}</strong>.
              </div>
            )}

            <div className="space-y-1 mb-5">
              {Object.entries(groupedModels).map(([provider, provModels]) => (
                <div key={provider}>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 pt-3 pb-1">
                    {provider}
                  </div>
                  {provModels.map((m) => (
                    <label
                      key={m.value}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedModel === m.value ? "bg-slate-800 text-white" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={m.value}
                        checked={selectedModel === m.value}
                        onChange={() => setSelectedModel(m.value)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className={`ml-auto font-mono text-xs ${selectedModel === m.value ? "text-slate-300" : "text-slate-400"}`}>
                        {m.value}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !selectedModel}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
