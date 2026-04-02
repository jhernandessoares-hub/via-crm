"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

export default function AdminSaudePage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminFetch("/admin/health").then(setHealth).catch(() => {}).finally(() => setLoading(false));
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
