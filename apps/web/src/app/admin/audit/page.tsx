"use client";
import { Fragment, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

// Rótulos legíveis das ações (espelha o union AuditAction em apps/api/src/audit/audit.service.ts)
const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Entrou no sistema",
  LOGIN_FAILED: "Falha de login",
  TOKEN_REFRESH: "Renovou sessão",
  CREATE_LEAD: "Criou lead",
  VIEW_LEAD: "Visualizou lead",
  DELETE_LEAD: "Excluiu lead",
  EXPORT_DATA: "Exportou dados",
  UPDATE_QUALIFICATION: "Atualizou qualificação",
  MOVE_PIPELINE: "Moveu etapa do funil",
  CREATE_USER: "Criou usuário",
  UPDATE_USER: "Editou usuário",
  PASSWORD_RESET_REQUESTED: "Solicitou troca de senha",
  PASSWORD_RESET_COMPLETED: "Trocou a senha",
  PLATFORM_ADMIN_LOGIN: "Login admin da plataforma",
  PLATFORM_CREATE_TENANT: "Criou tenant",
  PLATFORM_SUSPEND_TENANT: "Suspendeu tenant",
  PLATFORM_ACTIVATE_TENANT: "Ativou tenant",
  PLATFORM_CHANGE_PLAN: "Alterou plano",
  PLATFORM_IMPERSONATE: "Acessou como tenant (impersonate)",
  PLATFORM_EXPORT_TENANT_DATA: "Exportou dados do tenant",
  PLATFORM_UPDATE_TENANT: "Editou tenant",
  PLATFORM_CREATE_USER: "Criou usuário (admin)",
  PLATFORM_UPDATE_USER: "Editou usuário (admin)",
  PLATFORM_TOGGLE_USER: "Ativou/desativou usuário",
  PLATFORM_RESET_USER_PASSWORD: "Redefiniu senha de usuário",
  PLATFORM_DELETE_USER: "Removeu usuário",
  PLATFORM_CREATE_AGENT_TEMPLATE: "Criou template de agente",
  PLATFORM_UPDATE_AGENT_TEMPLATE: "Editou template de agente",
  PLATFORM_DELETE_AGENT_TEMPLATE: "Removeu template de agente",
  PLATFORM_PUSH_AGENT_TEMPLATE: "Publicou template de agente",
  PLATFORM_QUEUE_RECOVER: "Recuperou fila",
  PLATFORM_UPDATE_CONFIG: "Alterou config global",
  PLAN_UPDATED: "Atualizou plano",
  ADDON_UPDATED: "Atualizou add-on",
  TENANT_PLAN_CHANGED: "Mudou plano do tenant",
  TENANT_LIMITS_OVERRIDE: "Ajustou limites do tenant",
  TENANT_ADDON_ADDED: "Adicionou add-on",
  TENANT_ADDON_REMOVED: "Removeu add-on",
  LEAD_MERGE: "Mesclou leads",
  ASSIGN_LEAD: "Atribuiu responsável",
  UNIT_STATUS_CHANGED: "Alterou status de unidade",
  UNLINK_UNIT: "Desvinculou unidade",
};
const ACTIONS = Object.keys(ACTION_LABELS);
const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

// Tipo do alvo (resourceType) em português
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  lead: "Lead",
  unit: "Unidade",
  developmentunit: "Unidade",
  tenant: "Tenant",
  user: "Usuário",
  planconfig: "Plano",
  addonconfig: "Add-on",
};
const resourceTypeLabel = (t?: string | null) =>
  t ? RESOURCE_TYPE_LABELS[t.toLowerCase()] ?? t : "";

export default function AdminAuditPage() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filtros
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Lista de tenants para o dropdown
  useEffect(() => {
    adminFetch(`/admin/tenants?page=1&limit=500`)
      .then((d) => setTenants(d?.tenants ?? []))
      .catch(() => {});
  }, []);

  const load = (p = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(p), limit: "50" });
    if (tenantId) qs.set("tenantId", tenantId);
    if (action) qs.set("action", action);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    adminFetch(`/admin/audit-logs?${qs.toString()}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Mudar filtro volta pra página 1 e recarrega
  useEffect(() => {
    if (page === 1) load(1);
    else setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, action, from, to]);

  const clearFilters = () => {
    setTenantId("");
    setAction("");
    setFrom("");
    setTo("");
  };

  const hasFilters = tenantId || action || from || to;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">Todas as ações registradas na plataforma</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500">Tenant</label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="text-sm border rounded px-2 py-1.5 min-w-[180px]"
          >
            <option value="">Todos os tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500">Ação</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="text-sm border rounded px-2 py-1.5 min-w-[180px]"
          >
            <option value="">Todas as ações</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{actionLabel(a)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-sm border rounded px-2 py-1.5"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500">Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-sm border rounded px-2 py-1.5"
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-2 border rounded text-gray-600 hover:bg-gray-50"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["", "Ação", "Tenant", "Usuário", "O quê / Onde", "Data"].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : !data?.logs?.length ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum registro encontrado</td></tr>
            ) : data.logs.map((log: any) => {
              const expanded = expandedId === log.id;
              return (
                <Fragment key={log.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 text-gray-400 text-xs w-6">{expanded ? "▾" : "▸"}</td>
                    <td className="px-4 py-2">
                      <div className="text-xs font-medium text-gray-800">{actionLabel(log.action)}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{log.action}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {log.tenantNome ? (
                        <div>
                          <div>{log.tenantNome}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{log.tenantId?.slice(0, 8)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-mono">{log.tenantId?.slice(0, 8) || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {log.userNome ? (
                        <div>
                          <div>{log.userNome}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{log.userId?.slice(0, 8)}</div>
                        </div>
                      ) : log.platformAdminNome ? (
                        <div>
                          <div>{log.platformAdminNome} <span className="text-[10px] text-amber-600">(admin)</span></div>
                          <div className="text-[10px] text-gray-400 font-mono">{log.platformAdminId?.slice(0, 8)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-mono">{(log.userId || log.platformAdminId)?.slice(0, 8) || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {log.resourceLabel ? (
                        <div>
                          <div className="font-medium">{log.resourceLabel}</div>
                          <div className="text-[10px] text-gray-400">{resourceTypeLabel(log.resourceType)}</div>
                        </div>
                      ) : log.resourceType ? (
                        <span className="text-gray-500">{resourceTypeLabel(log.resourceType)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{new Date(log.createdAt).toLocaleString("pt-BR")}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-gray-50/60">
                      <td></td>
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid gap-2 text-xs">
                          <div className="flex gap-2">
                            <span className="font-medium text-gray-500 w-28">Resource ID</span>
                            <span className="font-mono text-gray-700">{log.resourceId || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-medium text-gray-500 w-28">IP</span>
                            <span className="font-mono text-gray-700">{log.ipAddress || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-medium text-gray-500 w-28">Detalhes</span>
                            {log.metadata ? (
                              <pre className="font-mono text-[11px] text-gray-700 bg-white border rounded p-2 overflow-x-auto max-w-full whitespace-pre-wrap">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {data && data.total > 50 && (
          <div className="px-4 py-3 border-t flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="text-xs px-3 py-1 border rounded disabled:opacity-40">Anterior</button>
            <span className="text-xs text-gray-500 py-1">Página {page} · {data.total} registros</span>
            <button onClick={() => setPage(p => p + 1)} disabled={data.logs.length < 50} className="text-xs px-3 py-1 border rounded disabled:opacity-40">Próxima</button>
          </div>
        )}
      </div>
    </div>
  );
}
