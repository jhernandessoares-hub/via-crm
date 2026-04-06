"use client";
import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/admin-api";

const QUEUE_LABELS: Record<string, string> = {
  sla: "SLA",
  inboundAi: "IA Inbound",
  whatsappInbound: "WhatsApp Inbound",
  whatsappMedia: "WhatsApp Mídia",
  reminder: "Lembretes",
};

function StatusBadge({ count, type }: { count: number; type: "waiting" | "active" | "delayed" | "failed" }) {
  const styles = {
    waiting: "bg-gray-100 text-gray-600",
    active: "bg-blue-100 text-blue-700",
    delayed: "bg-yellow-100 text-yellow-700",
    failed: count > 0 ? "bg-red-100 text-red-700 font-semibold" : "bg-gray-100 text-gray-400",
  };
  const labels = { waiting: "aguardando", active: "ativo", delayed: "agendado", failed: "com falha" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${styles[type]}`}>
      {count} {labels[type]}
    </span>
  );
}

export default function AdminFilasPage() {
  const [status, setStatus] = useState<any>(null);
  const [stuck, setStuck] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingStuck, setLoadingStuck] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [recoverResult, setRecoverResult] = useState<any>(null);

  const loadStatus = useCallback(() => {
    setLoadingStatus(true);
    adminFetch("/admin/queue/status")
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  const loadStuck = useCallback(() => {
    setLoadingStuck(true);
    adminFetch("/admin/queue/stuck-leads?windowMinutes=120")
      .then(setStuck)
      .catch(() => {})
      .finally(() => setLoadingStuck(false));
  }, []);

  useEffect(() => {
    loadStatus();
    loadStuck();
  }, [loadStatus, loadStuck]);

  const handleRecover = async (tenantId?: string) => {
    const key = tenantId || "all";
    setRecovering(key);
    setRecoverResult(null);
    try {
      const url = tenantId
        ? `/admin/queue/recover?tenantId=${tenantId}`
        : "/admin/queue/recover";
      const result = await adminFetch(url, { method: "POST" });
      setRecoverResult({ ...result, tenantId: tenantId || "todos" });
      // Recarrega dados após recuperação
      setTimeout(() => { loadStatus(); loadStuck(); }, 1500);
    } catch {
      setRecoverResult({ error: true });
    } finally {
      setRecovering(null);
    }
  };

  const totalFailed = status
    ? Object.values(status as Record<string, any>).reduce(
        (acc: number, q: any) => acc + (q.failed || 0),
        0
      )
    : 0;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoramento de Filas</h1>
          <p className="text-sm text-gray-500 mt-1">Status em tempo real das filas BullMQ</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { loadStatus(); loadStuck(); }}
            className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            Atualizar
          </button>
          <button
            onClick={() => handleRecover()}
            disabled={recovering === "all"}
            className="text-sm px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
          >
            {recovering === "all" ? "Recuperando..." : "Reprocessar Tudo"}
          </button>
        </div>
      </div>

      {/* Resultado da recuperação */}
      {recoverResult && (
        <div className={`p-4 rounded-lg border text-sm ${recoverResult.error ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
          {recoverResult.error
            ? "Erro ao recuperar filas."
            : `Recuperação concluída — ${recoverResult.retriedFailed} jobs retentados, ${recoverResult.rescheduled} leads reagendados (tenant: ${recoverResult.tenantId})`}
        </div>
      )}

      {/* Status das filas */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Status das Filas</h2>
        {loadingStatus ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {status &&
              Object.entries(status as Record<string, any>).map(([key, q]: [string, any]) => {
                const hasFailed = q.failed > 0;
                return (
                  <div
                    key={key}
                    className={`border rounded-lg bg-white p-4 flex items-center justify-between ${hasFailed ? "border-red-300 bg-red-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${q.active > 0 ? "bg-green-500" : hasFailed ? "bg-red-500" : "bg-gray-300"}`} />
                      <span className="text-sm font-medium">{QUEUE_LABELS[key] || key}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <StatusBadge count={q.waiting} type="waiting" />
                      <StatusBadge count={q.active} type="active" />
                      <StatusBadge count={q.delayed} type="delayed" />
                      <StatusBadge count={q.failed} type="failed" />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {totalFailed > 0 && (
          <p className="text-xs text-red-600 mt-2">
            {totalFailed} job(s) com falha detectado(s). Use "Reprocessar Tudo" para tentar recuperar.
          </p>
        )}
      </div>

      {/* Leads travados */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Leads sem Resposta da IA</h2>
            <p className="text-xs text-gray-400 mt-0.5">Mensagens recebidas nas últimas 2 horas sem resposta da IA</p>
          </div>
          {stuck?.total > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
              {stuck.total} travado{stuck.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="border rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Lead", "Tenant", "Última Mensagem", "Há quanto tempo", "Ação"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingStuck ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Carregando...</td>
                </tr>
              ) : !stuck?.leads?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Nenhum lead travado nas últimas 2 horas
                  </td>
                </tr>
              ) : (
                stuck.leads.map((lead: any) => (
                  <tr key={lead.leadId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lead.leadNome}</div>
                      <div className="text-xs text-gray-400">{lead.telefone || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{lead.tenantNome || "—"}</div>
                      <div className="text-xs text-gray-400">{lead.tenantSlug}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-sm text-gray-600 truncate">{lead.lastMessage || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${lead.minutesAgo > 60 ? "text-red-600" : "text-yellow-600"}`}>
                        {lead.minutesAgo < 60
                          ? `${lead.minutesAgo} min`
                          : `${Math.floor(lead.minutesAgo / 60)}h${lead.minutesAgo % 60 > 0 ? ` ${lead.minutesAgo % 60}min` : ""}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRecover(lead.tenantId)}
                        disabled={recovering === lead.tenantId}
                        className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                      >
                        {recovering === lead.tenantId ? "..." : "Reprocessar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
