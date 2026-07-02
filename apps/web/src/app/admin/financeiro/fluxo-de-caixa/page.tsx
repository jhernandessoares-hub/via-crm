"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import { cardCls, fmtCompetencia, fmtDate, hojeStr, inputCls, selectCls, thCls } from "../_lib/fin";
import { CHART, brlAxis } from "../_lib/chart";
import { ErrorBanner, PageHeader } from "../_components/shared";

interface FluxoSerie {
  data: string;
  entradaRealizada: number;
  saidaRealizada: number;
  entradaPrevista: number;
  saidaPrevista: number;
  saldoAcumulado: number;
}

interface FluxoData {
  de: string;
  ate: string;
  granularidade: "dia" | "mes";
  saldoInicial: number;
  serie: FluxoSerie[];
}

function primeiroDiaDoMes(): string {
  return `${hojeStr().slice(0, 7)}-01`;
}

function ultimoDiaDoMes(): string {
  const h = new Date();
  const last = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  return `${hojeStr().slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export default function FluxoDeCaixaPage() {
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(ultimoDiaDoMes());
  const [gran, setGran] = useState<"dia" | "mes">("dia");
  const [data, setData] = useState<FluxoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!de || !ate) return;
    setLoading(true);
    adminFetch(`/admin/financeiro/fluxo-caixa?de=${de}&ate=${ate}&granularidade=${gran}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [de, ate, gran]);

  useEffect(() => { load(); }, [load]);

  const serie = (data?.serie || []).map((s) => ({
    ...s,
    nome: gran === "dia" ? fmtDate(s.data).slice(0, 5) : fmtCompetencia(s.data + "-01"),
    saidaRealizadaNeg: -s.saidaRealizada,
    saidaPrevistaNeg: -s.saidaPrevista,
  }));

  const totalEntradas = serie.reduce((a, s) => a + s.entradaRealizada + s.entradaPrevista, 0);
  const totalSaidas = serie.reduce((a, s) => a + s.saidaRealizada + s.saidaPrevista, 0);
  const saldoFinal = serie.length > 0 ? serie[serie.length - 1].saldoAcumulado : data?.saldoInicial || 0;

  return (
    <div className="p-8">
      <PageHeader title="Fluxo de Caixa" subtitle="Realizado (baixas) + previsto (títulos em aberto por vencimento), com saldo acumulado" />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">De</label>
          <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Até</label>
          <input type="date" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Visão</label>
          <select className={selectCls} value={gran} onChange={(e) => setGran(e.target.value as "dia" | "mes")}>
            <option value="dia">Por dia (até 92 dias)</option>
            <option value="mes">Por mês</option>
          </select>
        </div>
        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-slate-500">Saldo inicial: <b className="text-slate-700">{formatBRL(data?.saldoInicial || 0)}</b></span>
          <span className="text-slate-500">Entradas: <b style={{ color: CHART.entrada }}>{formatBRL(totalEntradas)}</b></span>
          <span className="text-slate-500">Saídas: <b style={{ color: CHART.saida }}>{formatBRL(totalSaidas)}</b></span>
          <span className="text-slate-500">Saldo final: <b className={saldoFinal < 0 ? "text-red-600" : "text-slate-800"}>{formatBRL(saldoFinal)}</b></span>
        </div>
      </div>

      <div className={`${cardCls} mb-4 p-5`}>
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={serie} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} stackOffset="sign" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="nome" tick={CHART.tick} stroke={CHART.axis} tickLine={false} minTickGap={20} />
              <YAxis tick={CHART.tick} stroke={CHART.axis} tickLine={false} tickFormatter={brlAxis} />
              <RechartsTooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: any, name: any) => [formatBRL(Math.abs(Number(v))), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="entradaRealizada" name="Entrada realizada" stackId="entrada" fill={CHART.entrada} maxBarSize={26} />
              <Bar
                dataKey="entradaPrevista"
                name="Entrada prevista"
                stackId="entrada"
                fill={CHART.entrada}
                fillOpacity={CHART.previstoOpacity}
                stroke={CHART.entrada}
                strokeDasharray="3 3"
                maxBarSize={26}
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="saidaRealizadaNeg" name="Saída realizada" stackId="saida" fill={CHART.saida} maxBarSize={26} />
              <Bar
                dataKey="saidaPrevistaNeg"
                name="Saída prevista"
                stackId="saida"
                fill={CHART.saida}
                fillOpacity={CHART.previstoOpacity}
                stroke={CHART.saida}
                strokeDasharray="3 3"
                maxBarSize={26}
                radius={[0, 0, 4, 4]}
              />
              <Line type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado" stroke={CHART.saldo} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela (canal de alívio de contraste dos "previstos" + leitura exata) */}
      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>{gran === "dia" ? "Dia" : "Mês"}</th>
              <th className={`${thCls} text-right`}>Entrada realizada</th>
              <th className={`${thCls} text-right`}>Entrada prevista</th>
              <th className={`${thCls} text-right`}>Saída realizada</th>
              <th className={`${thCls} text-right`}>Saída prevista</th>
              <th className={`${thCls} text-right`}>Saldo acumulado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
            {serie.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sem movimentação no período.</td></tr>
            ) : (
              serie
                .filter((s) => s.entradaRealizada || s.entradaPrevista || s.saidaRealizada || s.saidaPrevista || gran === "mes")
                .map((s) => (
                  <tr key={s.data} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{gran === "dia" ? fmtDate(s.data) : fmtCompetencia(s.data + "-01")}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{s.entradaRealizada ? formatBRL(s.entradaRealizada) : "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{s.entradaPrevista ? formatBRL(s.entradaPrevista) : "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{s.saidaRealizada ? formatBRL(s.saidaRealizada) : "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{s.saidaPrevista ? formatBRL(s.saidaPrevista) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${s.saldoAcumulado < 0 ? "text-red-600" : "text-slate-800"}`}>
                      {formatBRL(s.saldoAcumulado)}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
