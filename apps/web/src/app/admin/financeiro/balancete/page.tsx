"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import { FinEmpresa, cardCls, finApi, hojeStr, inputCls, selectCls, thCls } from "../_lib/fin";
import { ErrorBanner, PageHeader } from "../_components/shared";

interface BalanceteData {
  de: string;
  ate: string;
  grupos: {
    id: string;
    nome: string;
    tipo: "RECEITA" | "DESPESA";
    categorias: { id: string; nome: string; previsto: number; realizado: number; emAberto: number; percentual: number | null }[];
    previsto: number;
    realizado: number;
    emAberto: number;
    percentual: number | null;
  }[];
}

function primeiroDiaDoMes(): string {
  return `${hojeStr().slice(0, 7)}-01`;
}

function ultimoDiaDoMes(): string {
  const h = new Date();
  const last = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  return `${hojeStr().slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export default function BalancetePage() {
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(ultimoDiaDoMes());
  const [empresas, setEmpresas] = useState<FinEmpresa[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState<BalanceteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!de || !ate) return;
    setLoading(true);
    adminFetch(`/admin/financeiro/balancete?de=${de}&ate=${ate}${companyId ? `&companyId=${companyId}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [de, ate, companyId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { finApi.empresas().then(setEmpresas).catch(() => {}); }, []);

  const num = (v: number) => (v === 0 ? <span className="text-slate-300">—</span> : formatBRL(v));

  return (
    <div className="p-8">
      <PageHeader
        title="Balancete Gerencial"
        subtitle="Previsto (competência no período) × realizado (baixas no período), por categoria"
      />
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select className={selectCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={{ width: 160 }}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Carregando...</div>
        ) : !data || data.grupos.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">Sem lançamentos no período selecionado.</div>
        ) : (
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={thCls}>Categoria</th>
                <th className={`${thCls} text-right`}>Previsto</th>
                <th className={`${thCls} text-right`}>Realizado</th>
                <th className={`${thCls} text-right`}>Em aberto</th>
                <th className={`${thCls} text-right`}>% realizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.grupos.map((g) => (
                <GrupoBalancete key={g.id} grupo={g} num={num} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function GrupoBalancete({ grupo, num }: { grupo: BalanceteData["grupos"][number]; num: (v: number) => React.ReactNode }) {
  return (
    <>
      <tr className="bg-slate-50/60 font-semibold">
        <td className="px-4 py-2 text-slate-700">
          {grupo.nome}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${grupo.tipo === "RECEITA" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {grupo.tipo === "RECEITA" ? "Receita" : "Despesa"}
          </span>
        </td>
        <td className="px-4 py-2 text-right text-slate-700">{num(grupo.previsto)}</td>
        <td className="px-4 py-2 text-right text-slate-700">{num(grupo.realizado)}</td>
        <td className="px-4 py-2 text-right text-slate-700">{num(grupo.emAberto)}</td>
        <td className="px-4 py-2 text-right text-slate-700">{grupo.percentual !== null ? `${grupo.percentual}%` : "—"}</td>
      </tr>
      {grupo.categorias.map((c) => (
        <tr key={c.id} className="hover:bg-slate-50">
          <td className="px-4 py-1.5 pl-8 text-slate-500">{c.nome}</td>
          <td className="px-4 py-1.5 text-right text-slate-500">{num(c.previsto)}</td>
          <td className="px-4 py-1.5 text-right text-slate-500">{num(c.realizado)}</td>
          <td className="px-4 py-1.5 text-right text-slate-500">{num(c.emAberto)}</td>
          <td className="px-4 py-1.5 text-right">
            {c.percentual !== null ? (
              <span className="inline-flex items-center gap-2">
                <span className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-slate-400"
                    style={{ width: `${Math.min(100, c.percentual)}%` }}
                  />
                </span>
                <span className="text-slate-500">{c.percentual}%</span>
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
