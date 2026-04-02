"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
};

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Primeiro tenta branch (OWNER/MANAGER)
        const data = await apiFetch("/leads/branch");
        setLeads(data);
      } catch {
        // Se falhar, tenta my (AGENT)
        try {
          const data = await apiFetch("/leads/my");
          setLeads(data);
        } catch {
          setLeads([]);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <AppShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-500">Total de Leads</div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? "..." : leads.length}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-500">Em Atendimento</div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? "..." : leads.length}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-gray-500">Contratos</div>
          <div className="text-2xl font-semibold text-gray-900">
            0
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="text-sm font-medium text-gray-900">
          Últimos Leads
        </div>

        <div className="mt-4 space-y-2">
          {loading && <div>Carregando...</div>}

          {!loading && leads.length === 0 && (
            <div className="text-sm text-gray-500">
              Nenhum lead encontrado.
            </div>
          )}

          {!loading &&
            leads.slice(0, 5).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">{lead.nome}</div>
                  <div className="text-gray-500">{lead.telefone}</div>
                </div>
                <span className="text-gray-400 text-xs">→</span>
              </Link>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
