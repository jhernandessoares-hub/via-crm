"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

export default function AdminClientesPage() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p = 1) => {
    setLoading(true);
    adminFetch(`/admin/tenants?page=${p}&limit=20`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  async function suspend(id: string, doSuspend: boolean) {
    await adminFetch(`/admin/tenants/${id}/${doSuspend ? "suspend" : "activate"}`, { method: "POST" });
    load(page);
  }

  async function changePlan(id: string, plan: string) {
    await adminFetch(`/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
    load(page);
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total ?? 0} tenant(s) cadastrados</p>
        </div>
        <Link href="/admin/clientes/novo" className="rounded-md bg-slate-950 text-white px-4 py-2 text-sm hover:bg-slate-900">
          + Novo cliente
        </Link>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Nome", "Slug", "Plano", "Status", "Leads", "Usuários", "Ações"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : data?.tenants?.map((t: any) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clientes/${t.id}`} className="font-medium hover:underline">{t.nome}</Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.slug}</td>
                <td className="px-4 py-3">
                  <select value={t.plan} onChange={(e) => changePlan(t.id, e.target.value)}
                    className="text-xs border rounded px-2 py-1">
                    <option value="STARTER">Starter</option>
                    <option value="PREMIUM">Premium</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {t.ativo ? "Ativo" : "Suspenso"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{t._count?.leads ?? 0}</td>
                <td className="px-4 py-3 text-gray-600">{t._count?.users ?? 0}</td>
                <td className="px-4 py-3 space-x-2">
                  <Link href={`/admin/clientes/${t.id}`} className="text-xs text-blue-600 hover:underline">Ver</Link>
                  <button onClick={() => suspend(t.id, t.ativo)} className={`text-xs ${t.ativo ? "text-red-600 hover:underline" : "text-green-600 hover:underline"}`}>
                    {t.ativo ? "Suspender" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > data.limit && (
          <div className="px-4 py-3 border-t flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="text-xs px-3 py-1 border rounded disabled:opacity-40">Anterior</button>
            <span className="text-xs text-gray-500 py-1">Página {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={data.tenants.length < data.limit} className="text-xs px-3 py-1 border rounded disabled:opacity-40">Próxima</button>
          </div>
        )}
      </div>
    </div>
  );
}
