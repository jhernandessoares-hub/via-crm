"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

type VersionCompare = {
  dev: { version: string; commitSha: string | null; branch: string | null } | null;
  prod: { version: string; commitSha: string | null; branch: string | null } | null;
  match: boolean;
  configured: boolean;
};

export default function AdminSaudePage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [versionCompare, setVersionCompare] = useState<VersionCompare | null>(null);

  const load = () => {
    setLoading(true);
    adminFetch("/admin/health").then(setHealth).catch(() => {}).finally(() => setLoading(false));
    const adminToken = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
    fetch("/admin/saude/version-compare", {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setVersionCompare)
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saúde do Sistema</h1>
          <p className="text-sm text-gray-500 mt-1">Status atual da plataforma</p>
        </div>
        <button onClick={load} className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50">Atualizar</button>
      </div>

      {versionCompare && (
        <div className="border rounded-lg bg-white p-5">
          <div className="text-sm text-gray-500 mb-3">Versão — Dev × Prod</div>
          {!versionCompare.configured ? (
            <div className="text-sm text-gray-400">
              Configure as variáveis <code>DEV_API_URL</code> e <code>PROD_API_URL</code> no serviço web para habilitar a comparação.
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Dev</div>
                <div className="text-xl font-bold">{versionCompare.dev ? `v${versionCompare.dev.version}` : "—"}</div>
                {versionCompare.dev?.commitSha && (
                  <div className="text-xs text-gray-400">{versionCompare.dev.commitSha}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Prod</div>
                <div className="text-xl font-bold">{versionCompare.prod ? `v${versionCompare.prod.version}` : "—"}</div>
                {versionCompare.prod?.commitSha && (
                  <div className="text-xs text-gray-400">{versionCompare.prod.commitSha}</div>
                )}
              </div>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  versionCompare.match ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}
              >
                {versionCompare.match ? "Iguais" : "Divergentes"}
              </span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {health && Object.entries(health).filter(([k]) => k !== "timestamp").map(([key, value]) => (
            <div key={key} className="border rounded-lg bg-white p-5">
              <div className="text-2xl font-bold">{String(value)}</div>
              <div className="text-sm text-gray-500 mt-1 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</div>
            </div>
          ))}
          {health?.timestamp && (
            <div className="col-span-2 text-xs text-gray-400">
              Atualizado em: {new Date(health.timestamp).toLocaleString("pt-BR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
