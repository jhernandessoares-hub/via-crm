"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { PERMISSION_MODULES, FIELD_VISIBILITY_FIELDS, PermissionsConfig, PermissionRole } from "@/lib/permissions";
import { isSP9 } from "@/lib/sp9";

const ROLE_LABELS: Record<PermissionRole, string> = {
  manager: "Gerente",
  agent: "Corretor",
  partner: "Externo Consultivo",
};

const ROLES: PermissionRole[] = ["manager", "agent", "partner"];

/** Módulos exclusivos do tenant SP9 — escondidos dos demais tenants. */
const SP9_ONLY_MODULES = new Set(["pre_ocupacao", "pos_ocupacao"]);

export default function PermissionsPage() {
  const [config, setConfig] = useState<PermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setTenantId(user?.tenantId ?? null);
    } catch {
      setTenantId(null);
    }
    apiFetch("/tenants/permissions")
      .then((data: PermissionsConfig) => setConfig(data))
      .catch(() => setError("Erro ao carregar permissões."))
      .finally(() => setLoading(false));
  }, []);

  const visibleModules = PERMISSION_MODULES.filter(
    (mod) => !SP9_ONLY_MODULES.has(mod.key) || isSP9(tenantId),
  );

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

  function toggleFieldVisibility(fieldKey: string) {
    setConfig((prev) => {
      if (!prev) return prev;
      const current = prev.fieldVisibility?.partner?.[fieldKey] ?? true;
      return {
        ...prev,
        fieldVisibility: {
          partner: { ...(prev.fieldVisibility?.partner ?? {}), [fieldKey]: !current },
        },
      };
    });
    setSaved(false);
  }

  function setDocAccess(level: "none" | "view" | "download") {
    setConfig((prev) => (prev ? { ...prev, documentAccess: { partner: level } } : prev));
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                    {visibleModules.map((mod) => {
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

        {!loading && (
          <Card className="overflow-hidden">
            <CardHeader>
              <h2 className="font-semibold text-[var(--shell-text)]">
                Visibilidade de dados — Externo Consultivo
              </h2>
              <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
                Escolha quais dados o Externo Consultivo enxerga. Campos desligados ficam
                <strong> ocultos e esfumaçados</strong> (na lista, no lead e nos relatórios) — o dado nem
                chega ao navegador dele. Nome, número e nome confirmado do lead são sempre visíveis.
              </p>
            </CardHeader>
            <CardBody className="space-y-5">
              {(["lead", "espelho"] as const).map((group) => {
                const fields = FIELD_VISIBILITY_FIELDS.filter((f) => f.group === group);
                if (fields.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)] mb-2">
                      {group === "lead" ? "Dados do lead" : "Espelho / unidade"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {fields.map((f) => {
                        const visible = config?.fieldVisibility?.partner?.[f.key] ?? true;
                        return (
                          <button
                            key={f.key}
                            onClick={() => toggleFieldVisibility(f.key)}
                            title={visible ? "Visível — clique para ocultar" : "Oculto — clique para liberar"}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                              visible
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "border-[var(--shell-card-border)] text-[var(--shell-subtext)]"
                            }`}
                            style={!visible ? { background: "var(--shell-bg)" } : undefined}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${visible ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`} />
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Documentos do lead — 3 níveis */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)] mb-2">
                  Documentos do lead
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: "download", label: "Baixar", desc: "Vê e baixa os arquivos" },
                    { key: "view", label: "Só visualizar", desc: "Vê na tela, sem baixar" },
                    { key: "none", label: "Sem acesso", desc: "Não vê os documentos" },
                  ] as const).map((opt) => {
                    const current = config?.documentAccess?.partner ?? "none";
                    const active = current === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setDocAccess(opt.key)}
                        title={opt.desc}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                          active
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "border-[var(--shell-card-border)] text-[var(--shell-subtext)]"
                        }`}
                        style={!active ? { background: "var(--shell-bg)" } : undefined}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        <p className="text-xs text-[var(--shell-subtext)]">
          As permissões entram em vigor na próxima vez que o usuário fizer login ou atualizar a página.
        </p>
      </div>
    </AppShell>
  );
}
