"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import { FinEmpresa, cardCls, finApi, fmtCompetencia, inputCls, mesAtualStr, selectCls, thCls } from "../_lib/fin";
import { ErrorBanner, PageHeader } from "../_components/shared";

interface DreData {
  meses: string[];
  grupos: {
    id: string;
    nome: string;
    tipo: "RECEITA" | "DESPESA";
    categorias: { id: string; nome: string; valores: number[]; total: number }[];
    subtotal: number[];
    total: number;
  }[];
  receitas: number[];
  despesas: number[];
  resultado: number[];
  resultadoAcumulado: number[];
  totais: { receitas: number; despesas: number; resultado: number };
}

function inicioDoAno(): string {
  return `${new Date().getFullYear()}-01`;
}

export default function DrePage() {
  const [de, setDe] = useState(inicioDoAno());
  const [ate, setAte] = useState(mesAtualStr());
  const [empresas, setEmpresas] = useState<FinEmpresa[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState<DreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!de || !ate) return;
    setLoading(true);
    adminFetch(`/admin/financeiro/dre?de=${de}&ate=${ate}${companyId ? `&companyId=${companyId}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [de, ate, companyId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { finApi.empresas().then(setEmpresas).catch(() => {}); }, []);

  const meses = data?.meses || [];
  const num = (v: number) => (v === 0 ? <span className="text-slate-300">—</span> : formatBRL(v));

  return (
    <div className="p-8">
      <PageHeader
        title="DRE Gerencial"
        subtitle="Regime de competência — todos os títulos não cancelados, pagos ou não, no mês da competência"
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">De (mês)</label>
          <input type="month" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Até (mês)</label>
          <input type="month" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select className={selectCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={{ width: 160 }}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
        {data && (
          <div className="ml-auto flex gap-4 text-sm">
            <span className="text-slate-500">Receitas: <b className="text-emerald-700">{formatBRL(data.totais.receitas)}</b></span>
            <span className="text-slate-500">Despesas: <b className="text-red-700">{formatBRL(data.totais.despesas)}</b></span>
            <span className="text-slate-500">Resultado: <b className={data.totais.resultado < 0 ? "text-red-600" : "text-emerald-700"}>{formatBRL(data.totais.resultado)}</b></span>
          </div>
        )}
      </div>

      <div className={`${cardCls} overflow-x-auto`}>
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando...</div>
        ) : !data || data.grupos.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">Sem lançamentos no período selecionado.</div>
        ) : (
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${thCls} sticky left-0 bg-slate-50`} style={{ minWidth: 220 }}>Categoria</th>
                {meses.map((m) => (
                  <th key={m} className={`${thCls} text-right whitespace-nowrap`}>{fmtCompetencia(m + "-01")}</th>
                ))}
                <th className={`${thCls} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(["RECEITA", "DESPESA"] as const).map((tipo) => {
                const grupos = data.grupos.filter((g) => g.tipo === tipo);
                if (grupos.length === 0) return null;
                return grupos.map((g) => (
                  <GrupoRows key={g.id} grupo={g} meses={meses} num={num} />
                ));
              })}
              {/* Linhas de totalização */}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="sticky left-0 bg-slate-50 px-4 py-2.5 text-emerald-800">Total de Receitas</td>
                {data.receitas.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right text-emerald-800">{num(v)}</td>
                ))}
                <td className="px-4 py-2.5 text-right text-emerald-800">{formatBRL(data.totais.receitas)}</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="sticky left-0 bg-slate-50 px-4 py-2.5 text-red-800">Total de Despesas</td>
                {data.despesas.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-right text-red-800">{num(v)}</td>
                ))}
                <td className="px-4 py-2.5 text-right text-red-800">{formatBRL(data.totais.despesas)}</td>
              </tr>
              <tr className="border-t-2 border-slate-300 bg-white text-base font-bold">
                <td className="sticky left-0 bg-white px-4 py-3 text-slate-800">Resultado</td>
                {data.resultado.map((v, i) => (
                  <td key={i} className={`px-4 py-3 text-right ${v < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatBRL(v)}</td>
                ))}
                <td className={`px-4 py-3 text-right ${data.totais.resultado < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {formatBRL(data.totais.resultado)}
                </td>
              </tr>
              <tr className="text-xs text-slate-500">
                <td className="sticky left-0 bg-white px-4 py-2">Resultado acumulado</td>
                {data.resultadoAcumulado.map((v, i) => (
                  <td key={i} className={`px-4 py-2 text-right ${v < 0 ? "text-red-500" : ""}`}>{formatBRL(v)}</td>
                ))}
                <td className="px-4 py-2" />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function GrupoRows({
  grupo,
  meses,
  num,
}: {
  grupo: DreData["grupos"][number];
  meses: string[];
  num: (v: number) => React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-50/60 font-semibold">
        <td className="sticky left-0 bg-slate-50 px-4 py-2 text-slate-700">{grupo.nome}</td>
        {grupo.subtotal.map((v, i) => (
          <td key={i} className="px-4 py-2 text-right text-slate-700">{num(v)}</td>
        ))}
        <td className="px-4 py-2 text-right text-slate-800">{num(grupo.total)}</td>
      </tr>
      {grupo.categorias.map((c) => (
        <tr key={c.id} className="hover:bg-slate-50">
          <td className="sticky left-0 bg-white px-4 py-1.5 pl-8 text-slate-500">{c.nome}</td>
          {c.valores.map((v, i) => (
            <td key={i} className="px-4 py-1.5 text-right text-slate-500">{num(v)}</td>
          ))}
          <td className="px-4 py-1.5 text-right text-slate-600">{num(c.total)}</td>
        </tr>
      ))}
    </>
  );
}
