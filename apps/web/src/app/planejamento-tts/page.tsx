"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  getPlanejamentoTts,
  updateTtsAtividade,
  updateTtsIndicador,
  updateTtsParcela,
  type PlanejamentoTtsData,
} from "@/lib/planejamento-tts.service";
import { usePlanejamentoTtsGuard } from "./_lib/useGuard";
import OverviewTab from "./_components/OverviewTab";
import AtividadesTab from "./_components/AtividadesTab";
import FaturamentoTab from "./_components/FaturamentoTab";
import IndicadoresTab from "./_components/IndicadoresTab";

type TabKey = "overview" | "atividades" | "faturamento" | "indicadores";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Visão geral" },
  { key: "atividades", label: "Atividades" },
  { key: "faturamento", label: "Faturamento" },
  { key: "indicadores", label: "Indicadores (QID)" },
];

export default function PlanejamentoTtsPage() {
  const guard = usePlanejamentoTtsGuard();
  const [tab, setTab] = useState<TabKey>("overview");
  const [data, setData] = useState<PlanejamentoTtsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setData(await getPlanejamentoTts());
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar o planejamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guard === true) carregar();
  }, [guard, carregar]);

  const onUpdateAtividade = useCallback(
    async (id: string, patch: any) => {
      if (!data) return;
      setSaving(true);
      try {
        const atualizada = await updateTtsAtividade(id, patch);
        setData((d) =>
          d ? { ...d, atividades: d.atividades.map((a) => (a.id === id ? { ...a, ...atualizada } : a)) } : d,
        );
      } catch (e: any) {
        setErro(e?.message || "Erro ao salvar atividade.");
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  const onUpdateParcela = useCallback(
    async (id: string, patch: any) => {
      if (!data) return;
      setSaving(true);
      try {
        const atualizada = await updateTtsParcela(id, patch);
        setData((d) => (d ? { ...d, parcelas: d.parcelas.map((p) => (p.id === id ? { ...p, ...atualizada } : p)) } : d));
      } catch (e: any) {
        setErro(e?.message || "Erro ao salvar parcela.");
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  const onUpdateIndicador = useCallback(
    async (id: string, patch: any) => {
      if (!data) return;
      setSaving(true);
      try {
        const atualizado = await updateTtsIndicador(id, patch);
        setData((d) =>
          d ? { ...d, indicadores: d.indicadores.map((i) => (i.id === id ? { ...i, ...atualizado } : i)) } : d,
        );
      } catch (e: any) {
        setErro(e?.message || "Erro ao salvar indicador.");
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  if (guard !== true) {
    return (
      <AppShell title="Planejamento TTS">
        <div className="p-6 text-sm text-[var(--shell-subtext)]">Verificando acesso...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Planejamento TTS">
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--shell-text)]">Planejamento TTS — Residencial José Bonifácio</h1>
          <p className="text-xs text-[var(--shell-subtext)]">
            Contrato SP9 × Valure · vigência 24/06/2026 a 28/02/2027 · entrega prevista: dez/2026 (a confirmar)
          </p>
        </div>

        <div className="flex gap-1 border-b border-[var(--shell-card-border)] overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-[var(--brand-accent)] text-[var(--shell-text)] font-semibold"
                  : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {erro && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {erro}{" "}
            <button className="underline" onClick={carregar}>
              Tentar de novo
            </button>
          </div>
        )}

        {loading || !data ? (
          <div className="p-6 text-sm text-[var(--shell-subtext)]">Carregando planejamento...</div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "atividades" && (
              <AtividadesTab atividades={data.atividades} onUpdate={onUpdateAtividade} saving={saving} />
            )}
            {tab === "faturamento" && (
              <FaturamentoTab parcelas={data.parcelas} onUpdate={onUpdateParcela} saving={saving} />
            )}
            {tab === "indicadores" && (
              <IndicadoresTab indicadores={data.indicadores} onUpdate={onUpdateIndicador} saving={saving} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
