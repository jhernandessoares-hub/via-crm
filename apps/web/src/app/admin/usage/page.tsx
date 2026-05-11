'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../_admin-shell';
import { adminFetch } from '@/lib/admin-api';
import { MeterCard } from '@/components/MeterCard';

interface TenantUsage {
  id: string;
  nome: string;
  plan: string;
  addons: string[];
  usage: Record<string, { used: number; limit: number; remaining: number; percent: number; willResetAt?: string | null }>;
}

const LABEL_MAP: Record<string, string> = {
  totalUsers: 'Usuários',
  monthlyAiLeads: 'Leads atendidos pela IA / mês',
  monthlyAiMessages: 'Mensagens IA / mês',
  maxWaSessions: 'Sessões WhatsApp Light',
  maxSites: 'Sites publicados',
  maxKnowledgeBases: 'Bases de Conhecimento',
  maxIngestChannels: 'Canais de entrada',
  monthlyCampaigns: 'Campanhas / mês',
  monthlyCampaignContacts: 'Contatos de campanha / mês',
  monthlyDocClassifications: 'Classificações de documentos / mês',
  waSessionsConnected: 'Sessões WA conectadas',
  sitesPublished: 'Sites publicados',
};

const PLAN_BADGE: Record<string, string> = {
  STARTER: 'bg-gray-100 text-gray-600',
  PRO: 'bg-blue-100 text-blue-700',
  BUSINESS: 'bg-purple-100 text-purple-700',
};

export default function UsageAdminPage() {
  const [tenants, setTenants] = useState<TenantUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    adminFetch('/admin/usage')
      .then((data) => {
        setTenants(data);
        // Expande o primeiro por padrão se houver só um
        if (data.length === 1) setExpanded(new Set([data[0].id]));
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filtered = tenants.filter((t) => t.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de Uso</h1>
            <p className="text-sm text-gray-500 mt-1">Consumo e limites por tenant</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar tenant..."
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </div>

        {loading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">Nenhum tenant encontrado.</div>
        )}

        {!loading && (
          <div className="space-y-4">
            {filtered.map((t) => {
              const isOpen = expanded.has(t.id);
              const hasCritical = Object.values(t.usage).some((u) => u.limit > 0 && u.percent >= 95);

              return (
                <div key={t.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  {/* Header */}
                  <div
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => toggleExpand(t.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900 dark:text-white">{t.nome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[t.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.plan}
                      </span>
                      {t.addons.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          +{t.addons.join(', ')}
                        </span>
                      )}
                      {hasCritical && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                          ⚠ Limite crítico
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 text-sm">{isOpen ? '▾' : '▸'}</span>
                  </div>

                  {/* MeterCards */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {Object.entries(t.usage).map(([key, info]) => (
                          <MeterCard
                            key={key}
                            label={LABEL_MAP[key] ?? key}
                            used={info.used}
                            limit={info.limit}
                            remaining={info.remaining}
                            percent={info.percent}
                            willResetAt={info.willResetAt}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
