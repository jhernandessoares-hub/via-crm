'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../_admin-shell';
import { adminFetch } from '@/lib/admin-api';

type PlanTier = 'STARTER' | 'PRO' | 'BUSINESS';

interface PlanConfig {
  tier: PlanTier;
  limits: Record<string, number>;
  prices: { months3: number; months6: number; months12: number };
  active: boolean;
}

interface AddonConfig {
  key: string;
  name: string;
  description: string;
  prices: { months3: number; months6: number; months12: number };
  requiresTier: string | null;
  active: boolean;
}

const TIER_LABELS: Record<PlanTier, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const LIMIT_LABELS: Record<string, string> = {
  maxUsers: 'Usuários',
  monthlyAiLeads: 'Leads IA / mês',
  monthlyAiMessages: 'Mensagens IA / mês (-1 = ilimitado)',
  maxWaSessions: 'Sessões WA Light',
  maxSites: 'Sites',
  maxKnowledgeBases: 'Bases de Conhecimento (-1 = ilimitado)',
  maxIngestChannels: 'Canais Ingest',
  monthlyCampaigns: 'Campanhas / mês',
  monthlyCampaignContacts: 'Contatos por campanha / mês',
  monthlyDocClassifications: 'Classificações de docs / mês (-1 = ilimitado)',
};

function reais(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PlanEditor({ plan, onSaved }: { plan: PlanConfig; onSaved: () => void }) {
  const [limits, setLimits] = useState<Record<string, number>>({ ...plan.limits });
  const [prices, setPrices] = useState({ ...plan.prices });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await adminFetch(`/admin/plans/${plan.tier}`, {
        method: 'PATCH',
        body: JSON.stringify({ limits, prices }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300">Limites</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(limits).map(([key, val]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">{LIMIT_LABELS[key] ?? key}</label>
            <input
              type="number"
              value={val}
              onChange={(e) => setLimits((p) => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white"
            />
          </div>
        ))}
      </div>

      <h3 className="font-semibold text-gray-700 dark:text-gray-300 pt-2">Preços (em centavos)</h3>
      <div className="grid grid-cols-3 gap-3">
        {(['months3', 'months6', 'months12'] as const).map((period) => (
          <div key={period} className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">
              {period === 'months3' ? '3 meses' : period === 'months6' ? '6 meses' : '12 meses'}
              <span className="ml-1 text-gray-400">({reais(prices[period])}/mês)</span>
            </label>
            <input
              type="number"
              value={prices[period]}
              onChange={(e) => setPrices((p) => ({ ...p, [period]: parseInt(e.target.value) || 0 }))}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white"
            />
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
      >
        {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </div>
  );
}

export default function PlanosAdminPage() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [addons, setAddons] = useState<AddonConfig[]>([]);
  const [activeTab, setActiveTab] = useState<string>('STARTER');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const [p, a] = await Promise.all([
        adminFetch('/admin/plans'),
        adminFetch('/admin/addons'),
      ]);
      setPlans(p);
      setAddons(a);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const tabs = [
    ...(['STARTER', 'PRO', 'BUSINESS'] as PlanTier[]).map((t) => ({ id: t, label: TIER_LABELS[t] })),
    { id: 'ADDONS', label: 'Add-ons' },
  ];

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Planos e Preços</h1>
          <p className="text-sm text-gray-500 mt-1">Configure limites e preços por plano</p>
        </div>

        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="h-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />}

        {!loading && activeTab !== 'ADDONS' && (() => {
          const plan = plans.find((p) => p.tier === activeTab);
          if (!plan) return <p className="text-gray-500">Plano não encontrado.</p>;
          return <PlanEditor plan={plan} onSaved={loadData} />;
        })()}

        {!loading && activeTab === 'ADDONS' && (
          <div className="space-y-6">
            {addons.map((addon) => (
              <div key={addon.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{addon.name}</h3>
                    <p className="text-sm text-gray-500">{addon.description}</p>
                    {addon.requiresTier && (
                      <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full mt-1 inline-block">
                        Requer {addon.requiresTier}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['months3', 'months6', 'months12'] as const).map((period) => (
                    <div key={period} className="text-sm">
                      <span className="text-gray-500 text-xs">
                        {period === 'months3' ? '3m' : period === 'months6' ? '6m' : '12m'}:
                      </span>{' '}
                      <span className="font-medium">{reais(addon.prices[period])}/mês</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
