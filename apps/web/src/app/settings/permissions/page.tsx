"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { PERMISSION_MODULES, PermissionsConfig, PermissionRole } from "@/lib/permissions";

const ROLE_LABELS: Record<PermissionRole, string> = {
  manager: "Gerente",
  agent: "Corretor",
};

const ROLES: PermissionRole[] = ["manager", "agent"];

export default function PermissionsPage() {
  const [config, setConfig] = useState<PermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/tenants/permissions")
      .then((data: PermissionsConfig) => setConfig(data))
      .catch(() => setError("Erro ao carregar permissões."))
      .finally(() => setLoading(false));
  }, []);

  function toggle(role: PermissionRole, module: string, action: string) {
    if (!config) return;
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev[role]?.[module]?.[action] ?? false;
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [module]: {
            ...prev[role]?.[module],
            [action]: !current,
          },
        },
      };
    });
    setSaved(false);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch("/tenants/permissions", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      setConfig(updated);
      // Atualiza cache local para MANAGER/AGENT
      localStorage.setItem("tenantPermissions", JSON.stringify(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Permissões">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Permissões por papel</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure o que cada membro da equipe pode fazer no sistema.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : saved ? "Salvo ✓" : "Salvar alterações"}
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ROLES.map((role) => (
              <div key={role} className="bg-white border rounded-xl overflow-hidden">
                {/* Header do card */}
                <div className="px-5 py-4 border-b bg-slate-50">
                  <h2 className="font-semibold text-gray-800">{ROLE_LABELS[role]} pode:</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Proprietário sempre tem acesso total.
                  </p>
                </div>

                {/* Módulos */}
                <div className="divide-y">
                  {PERMISSION_MODULES.map((mod) => {
                    const modPerms = config?.[role]?.[mod.key] ?? {};
                    const allOn = mod.actions.every((a) => modPerms[a.key]);
                    const allOff = mod.actions.every((a) => !modPerms[a.key]);

                    return (
                      <div key={mod.key} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">{mod.label}</span>
                          {/* Toggle tudo de uma vez */}
                          {mod.actions.length > 1 && (
                            <button
                              onClick={() => {
                                const newVal = !allOn;
                                mod.actions.forEach((a) => {
                                  setConfig((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      [role]: {
                                        ...prev[role],
                                        [mod.key]: {
                                          ...prev[role]?.[mod.key],
                                          [a.key]: newVal,
                                        },
                                      },
                                    };
                                  });
                                });
                                setSaved(false);
                              }}
                              className="text-[11px] text-gray-400 hover:text-gray-600"
                            >
                              {allOn ? "Desmarcar tudo" : "Marcar tudo"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mod.actions.map((action) => {
                            const enabled = modPerms[action.key] ?? false;
                            return (
                              <button
                                key={action.key}
                                onClick={() => toggle(role, mod.key, action.key)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                                  enabled
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-gray-50 border-gray-200 text-gray-400"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400">
          As permissões entram em vigor na próxima vez que o usuário fizer login ou atualizar a página.
        </p>
      </div>
    </AppShell>
  );
}
