"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
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
        const data = await apiFetch("/leads/branch");
        setLeads(data);
      } catch {
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

  const stats = [
    { label: "Total de Leads", value: loading ? "..." : leads.length },
    { label: "Em Atendimento", value: loading ? "..." : leads.length },
    { label: "Contratos", value: "0" },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <div className="text-sm text-[var(--shell-subtext)]">{s.label}</div>
              <div className="text-2xl font-semibold text-[var(--shell-text)] mt-1">
                {s.value}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardBody>
          <CardTitle className="mb-4">Últimos Leads</CardTitle>

          {loading && (
            <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
          )}

          {!loading && leads.length === 0 && (
            <div className="text-sm text-[var(--shell-subtext)]">
              Nenhum lead encontrado.
            </div>
          )}

          {!loading && (
            <div className="space-y-2">
              {leads.slice(0, 5).map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--shell-card-border)] p-3 text-sm hover:bg-[var(--shell-hover)] transition-colors"
                >
                  <div>
                    <div className="font-medium text-[var(--shell-text)]">{lead.nome}</div>
                    <div className="text-[var(--shell-subtext)]">{lead.telefone}</div>
                  </div>
                  <span className="text-[var(--shell-subtext)] text-xs">→</span>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </AppShell>
  );
}
