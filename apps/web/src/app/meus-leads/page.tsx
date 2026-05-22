"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useLeadsViewMode } from "@/hooks/useLeadsViewMode";
import { formatLeadNumber } from "@/lib/format-lead-number";

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder?: number;
  group?: string | null;
};

type Lead = {
  id: string;
  numero?: number | null;
  reentradaCount?: number | null;
  nome?: string;
  nomeCorreto?: string | null;
  telefone?: string;
  whatsapp?: string;
  origem?: string | null;
  status?: string | null;
  perfilImovel?: string | null;
  stageId?: string | null;
  stageName?: string | null;
  rendaBrutaFamiliar?: number | null;
  cadastroOrigem?: Record<string, any> | null;
  criadoEm?: string;
};

function formatRenda(v: number | null | undefined): string {
  if (!v) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function displayName(l: Lead): string {
  return l.nomeCorreto || l.nome || "Sem nome";
}

const GROUPS: { key: string; label: string; color: string }[] = [
  { key: "PRE_ATENDIMENTO", label: "Pré-Atendimento",  color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "AGENDAMENTO",     label: "Agendamento",       color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "NEGOCIACOES",     label: "Negociações",        color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "NEGOCIO_FECHADO", label: "Negócio Fechado",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "POS_VENDA",       label: "Pós Venda",         color: "bg-purple-50 text-purple-700 border-purple-200" },
];

const BADGE_COLOR: Record<string, string> = {
  PRE_ATENDIMENTO: "bg-slate-100 text-slate-600",
  AGENDAMENTO:     "bg-blue-100 text-blue-700",
  NEGOCIACOES:     "bg-amber-100 text-amber-700",
  NEGOCIO_FECHADO: "bg-emerald-100 text-emerald-700",
  POS_VENDA:       "bg-purple-100 text-purple-700",
};

const COL = "90px 1.4fr 1.1fr 0.9fr 1fr 0.8fr 1fr 0.9fr 1fr";

const SEL_STYLE: React.CSSProperties = {
  width: "100%", fontSize: 11, padding: "2px 4px", borderRadius: 4,
  border: "1px solid var(--shell-card-border)",
  background: "var(--shell-bg)", color: "var(--shell-text)",
};
const INPUT_STYLE: React.CSSProperties = {
  width: "100%", fontSize: 11, padding: "2px 4px", borderRadius: 4,
  border: "1px solid var(--shell-card-border)",
  background: "var(--shell-bg)", color: "var(--shell-text)",
};

export default function MeusLeadsPage() {
  const [view, setView] = useLeadsViewMode();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState({ etapa: "", status: "", origem: "", interesse: "", indicacao: "" });
  const [numRange, setNumRange] = useState({ min: "", max: "" });
  const [rendaRange, setRendaRange] = useState({ min: "", max: "" });

  const [visibleCount, setVisibleCount] = useState(10);
  const [loadMoreN, setLoadMoreN] = useState(10);

  async function load() {
    setLoading(true);
    try {
      const [stagesData, leadsData] = await Promise.all([
        apiFetch("/pipeline/active/stages"),
        apiFetch("/leads/my"),
      ]);
      setStages(Array.isArray(stagesData) ? stagesData : []);
      const list = Array.isArray(leadsData) ? leadsData : leadsData?.items ?? [];
      setLeads(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stageMap = useMemo(() => {
    const m: Record<string, { name: string; group: string | null }> = {};
    for (const s of stages) m[s.id] = { name: s.name, group: s.group ?? null };
    return m;
  }, [stages]);

  const uniqueValues = useMemo(() => {
    const etapa = new Set<string>(), status = new Set<string>(), origem = new Set<string>();
    const interesse = new Set<string>(), indicacao = new Set<string>();
    for (const l of leads) {
      const sn = l.stageName ?? (l.stageId ? stageMap[l.stageId]?.name : null);
      if (sn) etapa.add(sn);
      if (l.status) status.add(l.status);
      if (l.origem) origem.add(l.origem);
      if (l.perfilImovel) interesse.add(l.perfilImovel);
      const ind = (l.cadastroOrigem as any)?.indicacao;
      if (ind) indicacao.add(ind);
    }
    return {
      etapa: [...etapa].sort(),
      status: [...status].sort(),
      origem: [...origem].sort(),
      interesse: [...interesse].sort(),
      indicacao: [...indicacao].sort(),
    };
  }, [leads, stageMap]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (qq) {
        const ind = (l.cadastroOrigem as any)?.indicacao ?? "";
        const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "";
        if (![l.nome, l.nomeCorreto, l.telefone, l.whatsapp, l.origem, l.status, l.perfilImovel, l.stageName, ind, String(l.rendaBrutaFamiliar ?? ""), num]
          .join(" ").toLowerCase().includes(qq)) return false;
      }
      const sn = l.stageName ?? (l.stageId ? stageMap[l.stageId]?.name : null) ?? "";
      if (colFilters.etapa && sn !== colFilters.etapa) return false;
      if (colFilters.status && l.status !== colFilters.status) return false;
      if (colFilters.origem && l.origem !== colFilters.origem) return false;
      if (colFilters.interesse && l.perfilImovel !== colFilters.interesse) return false;
      if (colFilters.indicacao && (l.cadastroOrigem as any)?.indicacao !== colFilters.indicacao) return false;
      if (numRange.min && (l.numero ?? 0) < parseInt(numRange.min)) return false;
      if (numRange.max && (l.numero ?? 0) > parseInt(numRange.max)) return false;
      if (rendaRange.min && (l.rendaBrutaFamiliar ?? 0) < parseFloat(rendaRange.min.replace(",", "."))) return false;
      if (rendaRange.max && (l.rendaBrutaFamiliar ?? 0) > parseFloat(rendaRange.max.replace(",", "."))) return false;
      return true;
    });
  }, [leads, q, stageMap, colFilters, numRange, rendaRange]);

  const groupedLeads = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const g of GROUPS) map[g.key] = [];
    for (const l of filtered) {
      const group = l.stageId ? stageMap[l.stageId]?.group : null;
      if (group && map[group]) map[group].push(l);
      else map["PRE_ATENDIMENTO"].push(l);
    }
    return map;
  }, [filtered, stageMap]);

  useEffect(() => { setVisibleCount(loadMoreN); }, [q, leads, colFilters, numRange, rendaRange]);

  const activeFilterCount =
    (colFilters.etapa ? 1 : 0) + (colFilters.status ? 1 : 0) + (colFilters.origem ? 1 : 0) +
    (colFilters.interesse ? 1 : 0) + (colFilters.indicacao ? 1 : 0) +
    (numRange.min || numRange.max ? 1 : 0) + (rendaRange.min || rendaRange.max ? 1 : 0);

  function clearFilters() {
    setColFilters({ etapa: "", status: "", origem: "", interesse: "", indicacao: "" });
    setNumRange({ min: "", max: "" });
    setRendaRange({ min: "", max: "" });
  }

  function setCF(k: keyof typeof colFilters, v: string) {
    setColFilters((f) => ({ ...f, [k]: v }));
  }

  function exportCSV() {
    const headers = ["Número", "Nome", "Telefone", "Origem", "Etapa", "Status", "Interesse", "Indicação", "Renda"];
    const rows = filtered.map((l) => {
      const stageInfo = l.stageId ? stageMap[l.stageId] : null;
      const sn = l.stageName ?? stageInfo?.name ?? "—";
      const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "—";
      return [num, displayName(l), l.telefone || l.whatsapp || "—", l.origem || "—", sn,
        l.status || "—", l.perfilImovel || "—", (l.cadastroOrigem as any)?.indicacao || "—",
        l.rendaBrutaFamiliar ? String(l.rendaBrutaFamiliar) : "—",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const tableRows = filtered.map((l) => {
      const stageInfo = l.stageId ? stageMap[l.stageId] : null;
      const sn = l.stageName ?? stageInfo?.name ?? "—";
      const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "—";
      return `<tr><td>${num}</td><td>${displayName(l)}</td><td>${l.telefone || l.whatsapp || "—"}</td>
        <td>${l.origem || "—"}</td><td>${sn}</td><td>${l.status || "—"}</td>
        <td>${l.perfilImovel || "—"}</td><td>${(l.cadastroOrigem as any)?.indicacao || "—"}</td>
        <td>${l.rendaBrutaFamiliar ? formatRenda(l.rendaBrutaFamiliar) : "—"}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Meus Leads</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
      h2{margin-bottom:8px}p{margin-bottom:12px;color:#666}
      table{width:100%;border-collapse:collapse}
      th{background:#f0f0f0;text-align:left;padding:5px 8px;border:1px solid #ccc;font-size:10px;text-transform:uppercase}
      td{padding:4px 8px;border:1px solid #eee}tr:nth-child(even){background:#f9f9f9}
      @media print{body{margin:0}}</style>
    </head><body>
      <h2>Meus Leads</h2>
      <p>${new Date().toLocaleDateString("pt-BR")} · ${filtered.length} leads${activeFilterCount ? ` · ${activeFilterCount} filtro(s)` : ""}</p>
      <table><thead><tr>
        <th>Número</th><th>Nome</th><th>Telefone</th><th>Origem</th><th>Etapa</th>
        <th>Status</th><th>Interesse</th><th>Indicação</th><th>Renda</th>
      </tr></thead><tbody>${tableRows}</tbody></table>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  }

  return (
    <AppShell title="Meus Leads">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--shell-text)]">Meus Leads</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-0.5">
            Leads atribuídos a você · {filtered.length} leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-1 gap-0.5" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
            {(["KANBAN", "LISTA"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className="px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{ background: view === v ? "var(--shell-hover)" : "transparent", color: view === v ? "var(--shell-text)" : "var(--shell-subtext)", fontWeight: view === v ? 600 : 400 }}>
                {v === "KANBAN" ? "Kanban" : "Lista"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={load} loading={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </Button>
        {view === "LISTA" && (
          <span className="text-xs text-[var(--shell-subtext)]">
            Exibindo {Math.min(visibleCount, filtered.length)} de {filtered.length}
          </span>
        )}
        <Input className="w-56" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
        {view === "LISTA" && (
          <>
            <button onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ borderColor: activeFilterCount ? "var(--brand-accent)" : "var(--shell-card-border)", color: activeFilterCount ? "var(--brand-accent)" : "var(--shell-text)", background: showFilters ? "var(--shell-hover)" : "transparent" }}>
              ▼ Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] underline">Limpar filtros</button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={exportCSV} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>↓ Excel</button>
              <button onClick={exportPDF} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>↓ PDF</button>
            </div>
          </>
        )}
      </div>

      {/* KANBAN */}
      {view === "KANBAN" && (
        <div className="mt-5 overflow-x-auto pb-4">
          <div className="flex min-w-max items-start gap-4">
            {GROUPS.map((g) => {
              const items = groupedLeads[g.key] ?? [];
              return (
                <div key={g.key} className="w-[260px] shrink-0 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
                  <div className={`border-b px-3 py-2.5 ${g.color}`}>
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{items.length} leads</div>
                  </div>
                  <div className="max-h-[72vh] overflow-y-auto space-y-2 p-2">
                    {items.length === 0 ? (
                      <p className="p-2 text-xs text-[var(--shell-subtext)]">Nenhum lead</p>
                    ) : items.map((l) => {
                      const stageName = l.stageName ?? (l.stageId ? stageMap[l.stageId]?.name : null) ?? "—";
                      const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                      return (
                        <Link key={l.id} href={`/leads/${l.id}`} className="block rounded-lg border p-3 transition-colors"
                          style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--shell-bg)")}>
                          {numero && <div className="text-xs font-mono text-[var(--shell-subtext)] truncate">{numero}</div>}
                          <div className="text-sm font-medium text-[var(--shell-text)] truncate">{displayName(l)}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--shell-subtext)] truncate">
                            <span className="truncate">{l.telefone || l.whatsapp || "—"}</span>
                            <span className="opacity-50">·</span>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_COLOR[g.key]}`}>{stageName}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {l.origem && <span className="inline-block rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)] truncate max-w-[120px]" title={l.origem}>{l.origem}</span>}
                            {l.status && <span className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{l.status}</span>}
                            {l.perfilImovel && <span className="inline-block rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 truncate max-w-[140px]" title={l.perfilImovel}>{l.perfilImovel}</span>}
                            {(l.cadastroOrigem as any)?.indicacao && <span className="inline-block rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 truncate max-w-[120px]" title={(l.cadastroOrigem as any).indicacao}>{(l.cadastroOrigem as any).indicacao}</span>}
                            {l.rendaBrutaFamiliar && <span className="inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">{formatRenda(l.rendaBrutaFamiliar)}</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA */}
      {view === "LISTA" && (
        <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
          <div className="grid gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)", gridTemplateColumns: COL }}>
            <div>Número</div><div>Nome</div><div>Telefone</div><div>Origem</div>
            <div>Etapa</div><div>Status</div><div>Interesse</div><div>Indicação</div><div>Renda</div>
          </div>

          {showFilters && (
            <div className="grid gap-2 border-b px-4 py-2 items-center"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-hover)", gridTemplateColumns: COL }}>
              <div className="flex gap-1">
                <input style={INPUT_STYLE} placeholder="De" value={numRange.min} onChange={(e) => setNumRange((r) => ({ ...r, min: e.target.value }))} />
                <input style={INPUT_STYLE} placeholder="Até" value={numRange.max} onChange={(e) => setNumRange((r) => ({ ...r, max: e.target.value }))} />
              </div>
              <div /><div />
              <select style={SEL_STYLE} value={colFilters.origem} onChange={(e) => setCF("origem", e.target.value)}>
                <option value="">Todas</option>
                {uniqueValues.origem.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select style={SEL_STYLE} value={colFilters.etapa} onChange={(e) => setCF("etapa", e.target.value)}>
                <option value="">Todas</option>
                {uniqueValues.etapa.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select style={SEL_STYLE} value={colFilters.status} onChange={(e) => setCF("status", e.target.value)}>
                <option value="">Todos</option>
                {uniqueValues.status.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select style={SEL_STYLE} value={colFilters.interesse} onChange={(e) => setCF("interesse", e.target.value)}>
                <option value="">Todos</option>
                {uniqueValues.interesse.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select style={SEL_STYLE} value={colFilters.indicacao} onChange={(e) => setCF("indicacao", e.target.value)}>
                <option value="">Todas</option>
                {uniqueValues.indicacao.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <div className="flex gap-1">
                <input style={INPUT_STYLE} placeholder="De" value={rendaRange.min} onChange={(e) => setRendaRange((r) => ({ ...r, min: e.target.value }))} />
                <input style={INPUT_STYLE} placeholder="Até" value={rendaRange.max} onChange={(e) => setRendaRange((r) => ({ ...r, max: e.target.value }))} />
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead atribuído a você.</div>
          ) : (() => {
            const shown = filtered.slice(0, visibleCount);
            const hasMore = shown.length < filtered.length;
            return (
              <>
                {shown.map((l) => {
                  const stageInfo = l.stageId ? stageMap[l.stageId] : null;
                  const stageName = l.stageName ?? stageInfo?.name ?? "—";
                  const groupKey = stageInfo?.group ?? "PRE_ATENDIMENTO";
                  const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                  return (
                    <div key={l.id} className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                      style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: COL }}>
                      <div className="text-sm font-mono text-[var(--shell-subtext)] truncate">{numero || "—"}</div>
                      <div className="min-w-0"><Link href={`/leads/${l.id}`} className="font-medium text-[var(--shell-text)] hover:underline truncate block">{displayName(l)}</Link></div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.origem ?? undefined}>{l.origem || "—"}</div>
                      <div className="min-w-0"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_COLOR[groupKey]} truncate max-w-full`} title={stageName}>{stageName}</span></div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.status || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.perfilImovel ?? undefined}>{l.perfilImovel || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={(l.cadastroOrigem as any)?.indicacao ?? undefined}>{(l.cadastroOrigem as any)?.indicacao || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{formatRenda(l.rendaBrutaFamiliar)}</div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-end gap-4 border-t px-4 py-3" style={{ borderColor: "var(--shell-card-border)" }}>
                  {hasMore && (
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} value={loadMoreN}
                        onChange={(e) => setLoadMoreN(Math.max(1, parseInt(e.target.value) || 10))}
                        className="w-16 rounded-lg border px-2 py-1 text-sm text-center"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }} />
                      <button onClick={() => setVisibleCount((v) => v + loadMoreN)}
                        className="rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors"
                        style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
                        Ver mais {loadMoreN}
                      </button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </AppShell>
  );
}
