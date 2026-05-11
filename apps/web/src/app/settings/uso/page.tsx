'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { MeterCard } from '@/components/MeterCard';
import { useUsage } from '@/lib/use-usage';
import { apiFetch } from '@/lib/api';

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
};

export default function UsoPage() {
  const [role, setRole] = useState<string>('');
  const { usage, loading, error } = useUsage();
  const [fallback, setFallback] = useState('');
  const [savingFallback, setSavingFallback] = useState(false);
  const [savedFallback, setSavedFallback] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setRole(user?.role ?? '');
    } catch {}
  }, []);

  const hasCritical = usage
    ? Object.values(usage).some((u) => u.limit > 0 && u.percent >= 95)
    : false;

  async function saveFallbackMessage() {
    setSavingFallback(true);
    try {
      await apiFetch('/tenants/bot-config', {
        method: 'PATCH',
        body: JSON.stringify({ aiLimitFallbackMessage: fallback }),
      });
      setSavedFallback(true);
      setTimeout(() => setSavedFallback(false), 2000);
    } finally {
      setSavingFallback(false);
    }
  }

  if (role !== 'OWNER' && role !== 'MANAGER') {
    return (
      <AppShell title="Uso e Limites">
        <div className="p-8 text-gray-500">Acesso restrito ao proprietário e gerentes.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Uso e Limites">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Uso e Limites</h1>
            <p className="text-sm text-gray-500 mt-1">Acompanhe o consumo do seu plano</p>
          </div>
          {hasCritical && (
            <span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-3 py-1 rounded-full font-medium">
              Atenção: limite próximo
            </span>
          )}
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {usage && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(usage).map(([key, info]) => (
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
        )}

        {role === 'OWNER' && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Mensagem quando IA pausar por limite</h2>
            <p className="text-xs text-gray-500">Enviada automaticamente ao lead quando o limite mensal de IA for atingido.</p>
            <textarea
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              placeholder="Nossa equipe entrará em contato em breve."
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={saveFallbackMessage}
              disabled={savingFallback || !fallback.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {savedFallback ? 'Salvo!' : savingFallback ? 'Salvando...' : 'Salvar mensagem'}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          Para aumentar seus limites, entre em contato com o suporte ou faça upgrade do plano.
        </p>
      </div>
    </AppShell>
  );
}
