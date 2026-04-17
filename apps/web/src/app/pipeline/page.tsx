"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder?: number;
  group?: string | null;
};

type Lead = {
  id: string;
  nome?: string;
  telefone?: string;
  whatsapp?: string;
  stageId?: string | null;
  stageName?: string | null;
  criadoEm?: string;
};

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
  const [view, setView] = useState<"KANBAN" | "LISTA">("KANBAN");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

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
    return leads.filter((l) =>
      [l.nome, l.telefone, l.whatsapp].join(" ").toLowerCase().includes(qq)
    );
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
                            <div className="text-sm font-medium text-[var(--shell-text)] truncate">
                              {l.nome || "Sem nome"}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--shell-subtext)] truncate">
                              {l.telefone || l.whatsapp || "Sem telefone"}
                            </div>
                            <div className="mt-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_COLOR[g.key]}`}>
                                {stageName}
                              </span>
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
            className="grid grid-cols-12 gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)" }}
          >
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Telefone</div>
            <div className="col-span-2">Etapa</div>
            <div className="col-span-3">Status</div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead encontrado.</div>
          ) : (
            filtered.map((l) => {
              const stageInfo = l.stageId ? stageMap[l.stageId] : null;
              const stageName = l.stageName ?? stageInfo?.name ?? "—";
              const groupKey = stageInfo?.group ?? "PRE_ATENDIMENTO";
              const groupLabel = GROUPS.find((g) => g.key === groupKey)?.label ?? groupKey;

              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                  style={{ borderColor: "var(--shell-card-border)" }}
                >
                  <div className="col-span-4">
                    <Link href={`/leads/${l.id}`} className="font-medium text-[var(--shell-text)] hover:underline">
                      {l.nome || "Sem nome"}
                    </Link>
                  </div>
                  <div className="col-span-3 text-sm text-[var(--shell-subtext)]">
                    {l.telefone || l.whatsapp || "—"}
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_COLOR[groupKey]}`}>
                      {groupLabel}
                    </span>
                  </div>
                  <div className="col-span-3 text-sm text-[var(--shell-subtext)]">
                    {stageName}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </AppShell>
  );
}
