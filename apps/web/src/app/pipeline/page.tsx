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

export default function PipelinePage() {
  const [view, setView] = useLeadsViewMode();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  async function load() {
    setLoading(true);
    try {
      const [stagesData, leadsData] = await Promise.all([
        apiFetch("/pipeline/active/stages"),
        apiFetch("/leads"),
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return leads;
    return leads.filter((l) => {
      const indicacao = (l.cadastroOrigem as any)?.indicacao ?? "";
      return [l.nome, l.nomeCorreto, l.telefone, l.whatsapp, l.origem, l.status, l.perfilImovel, l.stageName, indicacao, String(l.rendaBrutaFamiliar ?? "")]
        .join(" ").toLowerCase().includes(qq);
    });
  }, [leads, q]);

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

  useEffect(() => { setPage(1); }, [q, leads]);

  return (
    <AppShell title="Todos os Leads">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--shell-text)]">Todos os Leads</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-0.5">
            Visão geral por grupo do funil · {filtered.length} leads
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-lg border p-1 gap-0.5"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}
          >
            {(["KANBAN", "LISTA"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-sm rounded-md transition-colors"
                style={{
                  background: view === v ? "var(--shell-hover)" : "transparent",
                  color: view === v ? "var(--shell-text)" : "var(--shell-subtext)",
                  fontWeight: view === v ? 600 : 400,
                }}
              >
                {v === "KANBAN" ? "Kanban" : "Lista"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={load} loading={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </Button>
        <Input
          className="w-64"
          placeholder="Buscar por nome ou telefone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* KANBAN */}
      {view === "KANBAN" && (
        <div className="mt-5 overflow-x-auto pb-4">
          <div className="flex min-w-max items-start gap-4">
            {GROUPS.map((g) => {
              const items = groupedLeads[g.key] ?? [];
              return (
                <div
                  key={g.key}
                  className="w-[260px] shrink-0 flex flex-col rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}
                >
                  <div className={`border-b px-3 py-2.5 ${g.color}`}>
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{items.length} leads</div>
                  </div>
                  <div className="max-h-[72vh] overflow-y-auto space-y-2 p-2">
                    {items.length === 0 ? (
                      <p className="p-2 text-xs text-[var(--shell-subtext)]">Nenhum lead</p>
                    ) : (
                      items.map((l) => {
                        const stageName = l.stageName ?? (l.stageId ? stageMap[l.stageId]?.name : null) ?? "—";
                        const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                        return (
                          <Link
                            key={l.id}
                            href={`/leads/${l.id}`}
                            className="block rounded-lg border p-3 transition-colors"
                            style={{
                              borderColor: "var(--shell-card-border)",
                              background: "var(--shell-bg)",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-hover)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--shell-bg)")}
                          >
                            {numero && (
                              <div className="text-xs font-mono text-[var(--shell-subtext)] truncate">
                                {numero}
                              </div>
                            )}
                            <div className="text-sm font-medium text-[var(--shell-text)] truncate">
                              {displayName(l)}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--shell-subtext)] truncate">
                              <span className="truncate">{l.telefone || l.whatsapp || "—"}</span>
                              <span className="opacity-50">·</span>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_COLOR[g.key]}`}>
                                {stageName}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {l.origem && (
                                <span className="inline-block rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)] truncate max-w-[120px]" title={l.origem}>
                                  {l.origem}
                                </span>
                              )}
                              {l.status && (
                                <span className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                                  {l.status}
                                </span>
                              )}
                              {l.perfilImovel && (
                                <span className="inline-block rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 truncate max-w-[140px]" title={l.perfilImovel}>
                                  {l.perfilImovel}
                                </span>
                              )}
                              {(l.cadastroOrigem as any)?.indicacao && (
                                <span className="inline-block rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 truncate max-w-[120px]" title={(l.cadastroOrigem as any).indicacao}>
                                  {(l.cadastroOrigem as any).indicacao}
                                </span>
                              )}
                              {l.rendaBrutaFamiliar && (
                                <span className="inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                                  {formatRenda(l.rendaBrutaFamiliar)}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA */}
      {view === "LISTA" && (
        <div
          className="mt-5 overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}
        >
          <div
            className="grid gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)", gridTemplateColumns: "90px 1.4fr 1.1fr 0.9fr 1fr 0.8fr 1fr 0.9fr 1fr" }}
          >
            <div>Número</div>
            <div>Nome</div>
            <div>Telefone</div>
            <div>Origem</div>
            <div>Etapa</div>
            <div>Status</div>
            <div>Interesse</div>
            <div>Indicação</div>
            <div>Renda</div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead encontrado.</div>
          ) : (() => {
            const shown = filtered.slice(0, page * PAGE_SIZE);
            const hasMore = shown.length < filtered.length;
            return (
              <>
                {shown.map((l) => {
                  const stageInfo = l.stageId ? stageMap[l.stageId] : null;
                  const stageName = l.stageName ?? stageInfo?.name ?? "—";
                  const groupKey = stageInfo?.group ?? "PRE_ATENDIMENTO";
                  const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                  return (
                    <div
                      key={l.id}
                      className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                      style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: "90px 1.4fr 1.1fr 0.9fr 1fr 0.8fr 1fr 0.9fr 1fr" }}
                    >
                      <div className="text-sm font-mono text-[var(--shell-subtext)] truncate">{numero || "—"}</div>
                      <div className="min-w-0">
                        <Link href={`/leads/${l.id}`} className="font-medium text-[var(--shell-text)] hover:underline truncate block">{displayName(l)}</Link>
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.origem ?? undefined}>{l.origem || "—"}</div>
                      <div className="min-w-0">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_COLOR[groupKey]} truncate max-w-full`} title={stageName}>{stageName}</span>
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.status || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.perfilImovel ?? undefined}>{l.perfilImovel || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={(l.cadastroOrigem as any)?.indicacao ?? undefined}>{(l.cadastroOrigem as any)?.indicacao || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{formatRenda(l.rendaBrutaFamiliar)}</div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--shell-card-border)" }}>
                  <span className="text-xs text-[var(--shell-subtext)]">Exibindo {shown.length} de {filtered.length}</span>
                  {hasMore && (
                    <button className="rounded-lg border px-4 py-1.5 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--shell-card-border)" }} onClick={() => setPage((p) => p + 1)}>
                      Ver mais 10
                    </button>
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
