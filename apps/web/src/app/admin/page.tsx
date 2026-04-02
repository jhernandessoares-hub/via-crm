"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

export default function AdminDashboard() {
  const [health, setHealth] = useState<any>(null);
  const [tenants, setTenants] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch("/admin/health"),
      adminFetch("/admin/tenants?limit=5"),
    ]).then(([h, t]) => { setHealth(h); setTenants(t); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Carregando...</div>;

  const stats = [
    { label: "Tenants ativos", value: health?.tenants ?? "—" },
    { label: "Leads totais", value: health?.leads ?? "—" },
    { label: "Audit logs", value: health?.auditLogs ?? "—" },
  ];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral da plataforma</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border rounded-lg bg-white p-5">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="border rounded-lg bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Clientes recentes</h2>
          <Link href="/admin/clientes" className="text-xs text-blue-600 hover:underline">Ver todos</Link>
        </div>
        <div className="divide-y">
          {tenants?.tenants?.map((t: any) => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between text-sm">
              <div>
                <Link href={`/admin/clientes/${t.id}`} className="font-medium hover:underline">{t.nome}</Link>
                <span className="ml-2 text-xs text-gray-400">{t.slug}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.plan === "PREMIUM" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{t.plan}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.ativo ? "Ativo" : "Suspenso"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
