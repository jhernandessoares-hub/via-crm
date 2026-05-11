'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../_admin-shell';
import { adminFetch } from '@/lib/admin-api';

interface TenantUsage {
  id: string;
  nome: string;
  plan: string;
  counters: Array<{ key: string; value: number; periodYearMonth: string | null }>;
}

const MONTHLY_KEYS = ['monthlyAiLeads', 'monthlyAiMessages', 'monthlyCampaigns', 'monthlyCampaignContacts', 'monthlyDocClassifications'];

export default function UsageAdminPage() {
  const [tenants, setTenants] = useState<TenantUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminFetch('/admin/usage')
      .then(setTenants)
      .finally(() => setLoading(false));
  }, []);

  function currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getMonthlyValue(counters: TenantUsage['counters'], key: string) {
    const period = currentPeriod();
    return counters.find((c) => c.key === key && c.periodYearMonth === period)?.value ?? 0;
  }

  const filtered = tenants.filter((t) => t.nome.toLowerCase().includes(search.toLowerCase()));

  const PLAN_BADGE: Record<string, string> = {
    STARTER: 'bg-gray-100 text-gray-600',
    PRO: 'bg-blue-100 text-blue-700',
    BUSINESS: 'bg-purple-100 text-purple-700',
  };

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de Uso</h1>
            <p className="text-sm text-gray-500 mt-1">Consumo mensal por tenant</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar tenant..."
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
        </div>

        {loading && <div className="h-60 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />}

        {!loading && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Tenant</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Plano</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">IA Leads</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">IA Msgs</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Campanhas</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Contatos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{t.nome}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[t.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{getMonthlyValue(t.counters, 'monthlyAiLeads').toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">{getMonthlyValue(t.counters, 'monthlyAiMessages').toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">{getMonthlyValue(t.counters, 'monthlyCampaigns').toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">{getMonthlyValue(t.counters, 'monthlyCampaignContacts').toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum tenant encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
