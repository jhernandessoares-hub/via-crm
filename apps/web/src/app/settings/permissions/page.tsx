"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
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
        [role]: { ...prev[role], [module]: { ...prev[role]?.[module], [action]: !current } },
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
            <h1 className="text-xl font-semibold text-[var(--shell-text)]">Permissões por papel</h1>
            <p className="text-sm text-[var(--shell-subtext)] mt-0.5">
              Configure o que cada membro da equipe pode fazer no sistema.
            </p>
          </div>
          <Button onClick={save} loading={saving} disabled={loading}>
            {saving ? "Salvando..." : saved ? "Salvo ✓" : "Salvar alterações"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ROLES.map((role) => (
              <Card key={role} className="overflow-hidden">
                <CardHeader>
                  <h2 className="font-semibold text-[var(--shell-text)]">{ROLE_LABELS[role]} pode:</h2>
                  <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
                    Proprietário sempre tem acesso total.
                  </p>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
                    {PERMISSION_MODULES.map((mod) => {
                      const modPerms = config?.[role]?.[mod.key] ?? {};
                      const allOn = mod.actions.every((a) => modPerms[a.key]);

                      return (
                        <div key={mod.key} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-[var(--shell-text)]">{mod.label}</span>
                            {mod.actions.length > 1 && (
                              <button
                                onClick={() => {
                                  const newVal = !allOn;
                                  mod.actions.forEach((a) => {
                                    setConfig((prev) => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        [role]: { ...prev[role], [mod.key]: { ...prev[role]?.[mod.key], [a.key]: newVal } },
                                      };
                                    });
                                  });
                                  setSaved(false);
                                }}
                                className="text-[11px] text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
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
                                      : "border-[var(--shell-card-border)] text-[var(--shell-subtext)]"
                                  }`}
                                  style={!enabled ? { background: "var(--shell-bg)" } : undefined}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`} />
                                  {action.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--shell-subtext)]">
          As permissões entram em vigor na próxima vez que o usuário fizer login ou atualizar a página.
        </p>
      </div>
    </AppShell>
  );
}
