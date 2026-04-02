"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

export default function AdminClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      adminFetch(`/admin/tenants/${id}`),
      adminFetch(`/admin/tenants/${id}/stats`),
    ]).then(([t, s]) => { setTenant(t); setStats(s); }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { if (id) load(); }, [id]);

  async function impersonate() {
    try {
      const data = await adminFetch(`/admin/tenants/${id}/impersonate`, { method: "POST" });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify({ ...data.owner, role: data.owner.role }));
      window.open("/dashboard", "_blank");
      setActionMsg("Sessão de impersonation aberta em nova aba.");
    } catch (e: any) {
      setActionMsg(e?.message || "Erro ao impersonar.");
    }
  }

  async function suspend(doSuspend: boolean) {
    await adminFetch(`/admin/tenants/${id}/${doSuspend ? "suspend" : "activate"}`, { method: "POST" });
    load();
  }

  async function changePlan(plan: string) {
    await adminFetch(`/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
    load();
  }

  async function exportData() {
    const data = await adminFetch(`/admin/tenants/${id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenant-${id}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Carregando...</div>;
  if (!tenant) return <div className="p-8 text-sm text-red-600">Tenant não encontrado.</div>;

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/clientes" className="text-xs text-gray-500 hover:underline">← Clientes</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold">{tenant.nome}</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${tenant.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tenant.ativo ? "Ativo" : "Suspenso"}</span>
          <span className={`text-xs px-2 py-1 rounded-full ${tenant.plan === "PREMIUM" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{tenant.plan}</span>
        </div>
        <p className="text-sm text-gray-400 mt-1">slug: {tenant.slug} · id: {tenant.id}</p>
      </div>

      {actionMsg && <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">{actionMsg}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Leads total", value: stats.leadsTotal },
            { label: "Leads este mês", value: stats.leadsThisMonth },
            { label: "Usuários ativos", value: stats.users },
            { label: "Canais ativos", value: stats.channels },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg bg-white p-4">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="border rounded-lg bg-white p-5 space-y-3">
        <h2 className="font-semibold text-sm">Ações</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={impersonate} className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Acessar como OWNER
          </button>
          <button onClick={() => suspend(!tenant.ativo)} className={`text-sm px-4 py-2 rounded-md ${tenant.ativo ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
            {tenant.ativo ? "Suspender acesso" : "Reativar acesso"}
          </button>
          <select onChange={(e) => changePlan(e.target.value)} value={tenant.plan} className="text-sm border rounded-md px-3 py-2">
            <option value="STARTER">Starter</option>
            <option value="PREMIUM">Premium</option>
          </select>
          <button onClick={exportData} className="text-sm px-4 py-2 rounded-md border hover:bg-gray-50">
            Exportar dados (JSON)
          </button>
        </div>
      </div>

      {/* Users */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b font-semibold text-sm">Usuários ({tenant.users?.length || 0})</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Nome", "E-mail", "Role", "Status", "Criado"].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenant.users?.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2"><span className="text-xs bg-gray-100 rounded px-2 py-0.5">{u.role}</span></td>
                <td className="px-4 py-2"><span className={`text-xs ${u.ativo ? "text-green-600" : "text-red-500"}`}>{u.ativo ? "Ativo" : "Inativo"}</span></td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(u.criadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
