"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import { cardCls, fmtCompetencia, fmtDate } from "./_lib/fin";
import { CHART, brlAxis } from "./_lib/chart";
import { ErrorBanner, PageHeader, useToast } from "./_components/shared";

interface DashboardData {
  mes: string;
  kpis: {
    aReceberMes: number;
    aPagarMes: number;
    vencidosReceber: number;
    vencidosPagar: number;
    saldoContas: number;
    recebidoMes: number;
    pagoMes: number;
  };
  grafico6Meses: { mes: string; receitas: number; despesas: number }[];
  projecao30Dias: { data: string; saldoProjetado: number }[];
  proximosVencimentos: { id: string; tipo: string; descricao: string; vencimento: string; saldo: number; contactNome: string | null }[];
  mensalidades: { competencia: string; total: number; geradas: number; pendentes: number };
}

export default function FinanceiroDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gerando, setGerando] = useState(false);
  const { showToast, toastNode } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/financeiro/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await adminFetch("/admin/financeiro/recorrencias/gerar", { method: "POST", body: JSON.stringify({}) });
      showToast(`${r.geradas} título(s) gerado(s)`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGerando(false);
    }
  };

  if (loading && !data) {
    return <div className="p-8 text-slate-500">Carregando visão geral...</div>;
  }

  const k = data?.kpis;
  const vencidosTotal = (k?.vencidosReceber || 0) + (k?.vencidosPagar || 0);
  const grafico = (data?.grafico6Meses || []).map((m) => ({ ...m, nome: `${m.mes.slice(5, 7)}/${m.mes.slice(2, 4)}` }));
  const projecao = (data?.projecao30Dias || []).map((p) => ({ ...p, dia: fmtDate(p.data).slice(0, 5) }));

  return (
    <div className="p-8">
      <PageHeader
        title="Financeiro VEXCIA"
        subtitle={`Visão geral de ${data ? fmtCompetencia(data.mes + "-01") : ""} — caixa único da holding`}
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      {data && data.mensalidades.pendentes > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            {data.mensalidades.pendentes} mensalidade(s)/recorrência(s) da competência {fmtCompetencia(data.mensalidades.competencia + "-01")} ainda não gerada(s).
          </span>
          <button
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={gerando}
            onClick={gerar}
          >
            {gerando ? "Gerando..." : "Gerar agora"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="A receber no mês"
          value={formatBRL(k?.aReceberMes || 0)}
          hint={`${formatBRL(k?.recebidoMes || 0)} já recebido`}
          href="/admin/financeiro/contas-a-receber"
          accent="text-emerald-700"
        />
        <KpiCard
          label="A pagar no mês"
          value={formatBRL(k?.aPagarMes || 0)}
          hint={`${formatBRL(k?.pagoMes || 0)} já pago`}
          href="/admin/financeiro/contas-a-pagar"
          accent="text-slate-800"
        />
        <KpiCard
          label="Vencidos"
          value={formatBRL(vencidosTotal)}
          hint={vencidosTotal > 0 ? `${formatBRL(k?.vencidosReceber || 0)} a receber · ${formatBRL(k?.vencidosPagar || 0)} a pagar` : "Nada vencido 🎉"}
          href="/admin/financeiro/contas-a-pagar"
          accent={vencidosTotal > 0 ? "text-red-600" : "text-emerald-700"}
        />
        <KpiCard
          label="Saldo em contas"
          value={formatBRL(k?.saldoContas || 0)}
          hint="Todas as contas ativas"
          href="/admin/financeiro/configuracoes"
          accent={(k?.saldoContas || 0) < 0 ? "text-red-600" : "text-slate-800"}
        />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        {/* Receitas × Despesas (realizado, 6 meses) */}
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Receitas × Despesas (realizado)</h2>
          <p className="mb-4 text-xs text-slate-400">Baixas dos últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={grafico} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="nome" tick={CHART.tick} stroke={CHART.axis} tickLine={false} />
              <YAxis tick={CHART.tick} stroke={CHART.axis} tickLine={false} tickFormatter={brlAxis} />
              <RechartsTooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, name: any) => [formatBRL(Number(v)), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receitas" name="Receitas" fill={CHART.entrada} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="despesas" name="Despesas" fill={CHART.saida} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Projeção de saldo 30 dias */}
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Saldo projetado — próximos 30 dias</h2>
          <p className="mb-4 text-xs text-slate-400">Saldo atual + títulos em aberto por vencimento (vencidos contam como hoje)</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={projecao} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.saldo} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={CHART.saldo} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="dia" tick={CHART.tick} stroke={CHART.axis} tickLine={false} minTickGap={24} />
              <YAxis tick={CHART.tick} stroke={CHART.axis} tickLine={false} tickFormatter={brlAxis} />
              <RechartsTooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => [formatBRL(Number(v)), "Saldo projetado"]} />
              <Area type="monotone" dataKey="saldoProjetado" stroke={CHART.saldo} strokeWidth={2} fill="url(#saldoGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Próximos vencimentos */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Próximos vencimentos (7 dias)</h2>
          <Link href="/admin/financeiro/fluxo-de-caixa" className="text-xs text-slate-500 hover:text-slate-800">
            Ver fluxo de caixa →
          </Link>
        </div>
        {(data?.proximosVencimentos || []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Nenhum vencimento nos próximos 7 dias.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data!.proximosVencimentos.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                <span>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${v.tipo === "RECEBER" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {v.tipo === "RECEBER" ? "Receber" : "Pagar"}
                  </span>
                  <span className="font-medium text-slate-700">{v.descricao}</span>
                  {v.contactNome && <span className="ml-2 text-xs text-slate-400">{v.contactNome}</span>}
                </span>
                <span className="whitespace-nowrap text-slate-600">
                  {fmtDate(v.vencimento)} · <b>{formatBRL(v.saldo)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {toastNode}
    </div>
  );
}

function KpiCard({ label, value, hint, href, accent }: { label: string; value: string; hint: string; href: string; accent: string }) {
  return (
    <Link href={href} className={`${cardCls} block px-4 py-3 transition-shadow hover:shadow-md`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{hint}</div>
    </Link>
  );
}
