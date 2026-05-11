'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';

export interface UsageInfo {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  willResetAt?: string | null;
}

export type UsageMap = Record<string, UsageInfo>;

export function useUsage(intervalMs = 60_000) {
  const [usage, setUsage] = useState<UsageMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await apiFetch('/tenants/usage');
      setUsage(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar uso');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => clearInterval(id);
  }, [fetch, intervalMs]);

  const hasWarning = usage
    ? Object.values(usage).some((u) => u.limit > 0 && u.percent >= 80)
    : false;

  const hasCritical = usage
    ? Object.values(usage).some((u) => u.limit > 0 && u.percent >= 95)
    : false;

  const isAtLimit = (key: string) => {
    const u = usage?.[key];
    return u ? u.limit > 0 && u.used >= u.limit : false;
  };

  return { usage, loading, error, hasWarning, hasCritical, isAtLimit, refresh: fetch };
}
