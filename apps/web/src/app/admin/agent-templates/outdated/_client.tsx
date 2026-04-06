"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

export default function OutdatedAgentsPage() {
  const [report, setReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    adminFetch("/admin/agent-templates/outdated-tenants").then(setReport).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const pushToTenant = async (templateId: string, tenantId: string, force = false) => {
    const key = `${templateId}-${tenantId}`;
    setPushing(key);
    try {
      const result = await adminFetch(`/admin/agent-templates/${templateId}/push`, {
        method: "POST",
        body: JSON.stringify({ tenantIds: [tenantId], force }),
      });
      setMsg((p) => ({ ...p, [key]: `OK — criados: ${result.created}, atualizados: ${result.updated}` }));
      load();
    } catch (e: any) {
      setMsg((p) => ({ ...p, [key]: e.message || "Erro" }));
    } finally {
      setPushing(null);
    }
  };

  const total = report.reduce((acc, r) => acc + r.canUpdate.length + r.customized.length, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents Desatualizados</h1>
          <p className="text-sm text-gray-500 mt-1">{total} agent(s) com versão anterior ao template</p>
        </div>
        <Link href="/admin/agent-templates" className="text-sm text-blue-600 hover:underline">← Voltar</Link>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Carregando...</div>
      ) : report.length === 0 ? (
        <div className="text-center text-gray-400 py-12 border rounded-lg bg-white">Todos os agents estão atualizados.</div>
      ) : report.map((r) => (
        <div key={r.template.id} className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <div>
              <span className="font-semibold">{r.template.title}</span>
              <span className="ml-2 text-xs text-gray-400 font-mono">{r.template.slug}</span>
            </div>
            <span className="text-xs text-gray-400">Atualizado em: {new Date(r.template.updatedAt).toLocaleString("pt-BR")}</span>
          </div>

          {r.canUpdate.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-green-700 bg-green-50 border-b">
                Podem receber atualização ({r.canUpdate.length})
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {r.canUpdate.map((a: any) => {
                    const key = `${r.template.id}-${a.tenantId}`;
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{a.tenant.nome}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{a.tenant.slug}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          Sincronizado em: {a.syncedAt ? new Date(a.syncedAt).toLocaleString("pt-BR") : "nunca"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {msg[key] ? (
                            <span className="text-xs text-green-600">{msg[key]}</span>
                          ) : (
                            <button onClick={() => pushToTenant(r.template.id, a.tenantId)}
                              disabled={pushing === key}
                              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50">
                              {pushing === key ? "Atualizando..." : "Atualizar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {r.customized.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-orange-700 bg-orange-50 border-b border-t">
                Customizados pelo tenant ({r.customized.length}) — não recebem atualização automática
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {r.customized.map((a: any) => {
                    const key = `${r.template.id}-${a.tenantId}`;
                    return (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{a.tenant.nome}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{a.tenant.slug}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          Sincronizado em: {a.syncedAt ? new Date(a.syncedAt).toLocaleString("pt-BR") : "nunca"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {msg[key] ? (
                            <span className="text-xs text-green-600">{msg[key]}</span>
                          ) : (
                            <button onClick={() => pushToTenant(r.template.id, a.tenantId, true)}
                              disabled={pushing === key}
                              className="text-xs border border-orange-400 text-orange-600 px-3 py-1 rounded hover:bg-orange-50 disabled:opacity-50"
                              title="Sobrescreve as customizações do tenant">
                              {pushing === key ? "Forçando..." : "Forçar atualização"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
