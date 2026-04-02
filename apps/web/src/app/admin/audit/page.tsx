"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

export default function AdminAuditPage() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminFetch(`/admin/audit-logs?page=${p}&limit=50`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">Todas as ações registradas na plataforma</p>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Ação", "Tenant", "Usuário", "Recurso", "Data"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : data?.logs?.map((log: any) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-2"><span className="text-xs font-mono bg-gray-100 rounded px-2 py-0.5">{log.action}</span></td>
                <td className="px-4 py-2 text-xs text-gray-500">{log.tenantId?.slice(0, 8) || "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{log.userId?.slice(0, 8) || log.platformAdminId?.slice(0, 8) || "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{log.resourceType || "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-400">{new Date(log.createdAt).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
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
