"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useLeadsViewMode } from "@/hooks/useLeadsViewMode";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { ReportModal } from "@/components/ReportModal";

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder?: number;
  group?: string | null;
};

const GROUP_LABEL: Record<string, string> = {
  PRE_ATENDIMENTO:     "Pré-atendimento",
  AGENDAMENTO:         "Agendamento",
  PROPOSTAS:           "Propostas",
  NEGOCIACOES:         "Negociações",
  CREDITO_IMOBILIARIO: "Crédito Imobiliário",
  NEGOCIO_FECHADO:     "Negócio Fechado",
  POS_VENDA:           "Pós Venda",
  DOCUMENTACAO:        "Documentação",
  ESCOLHA_UNIDADE:     "Escolha da Unidade",
  CONTRATO:            "Contrato",
  REGISTRO:            "Registro",
};

type Lead = {
  id: string;
  numero?: number | null;
  reentradaCount?: number | null;
  nome?: string;
  nomeCorreto?: string | null;
  telefone?: string;
  whatsapp?: string;
  observacao?: string;
  origem?: string | null;
  status?: string | null;
  perfilImovel?: string | null;
  stageId?: string | null;
  stageKey?: string | null;
  stageName?: string | null;
  stage?: { name: string; key?: string | null; group?: string | null } | null;
  assignedUserName?: string | null;
  rendaBrutaFamiliar?: number | null;
  cadastroOrigem?: Record<string, any> | null;
  criadoEm?: string;
  conversaAberta?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em Contato",
  QUALIFICADO: "Qualificado",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
};
const STATUS_COLOR: Record<string, string> = {
  NOVO: "bg-slate-100 text-slate-600",
  EM_CONTATO: "bg-blue-100 text-blue-700",
  QUALIFICADO: "bg-green-100 text-green-700",
  PROPOSTA: "bg-amber-100 text-amber-700",
  FECHADO: "bg-emerald-100 text-emerald-700",
};

function formatStatus(s: string | null | undefined) {
  if (!s) return null;
  return { label: STATUS_LABEL[s] ?? s, color: STATUS_COLOR[s] ?? "bg-slate-100 text-slate-600" };
}

function formatDateTime(s: string | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function displayName(l: Lead): string {
  return l.nomeCorreto || l.nome || "Sem nome";
}

const STAGE_BADGE = "bg-slate-100 text-slate-700";
const SP9_GROUPS = new Set(["DOCUMENTACAO", "ESCOLHA_UNIDADE", "CONTRATO", "REGISTRO"]);
const COL = "90px 1.4fr 1.1fr 0.9fr 1fr 0.8fr 1fr 0.9fr 1fr 1.2fr";

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const activeGroup = searchParams.get("group");
  const pageTitle = activeGroup ? (GROUP_LABEL[activeGroup] ?? activeGroup) : "Leads";

  const [view, setView] = useLeadsViewMode();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState({ etapa: "", status: "", origem: "", interesse: "", indicacao: "" });
  const [numRange, setNumRange] = useState({ min: "", max: "" });
  const [visibleCount, setVisibleCount] = useState(10);
  const [loadMoreN, setLoadMoreN] = useState(10);
  const [reportOpen, setReportOpen] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadStages() {
    try {
      const data = await apiFetch("/pipeline/active/stages", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.value ?? [];
      const normalized = Array.isArray(list)
        ? list
            .slice()
            .sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0))
            .map((s) => ({
              id: String(s.id),
              key: String(s.key),
              name: String(s.name),
              sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : undefined,
              group: s.group ?? null,
            }))
        : [];
      setPipelineStages(normalized);
    } catch (e: any) {
      setPipelineStages([]);
      setErro((prev) => prev || e?.message || "Erro ao carregar etapas do pipeline");
    }
  }

  async function loadLeads() {
    setErro(null);
    setLoading(true);
    try {
      const data = await apiFetch("/leads", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.items ?? [];
      setLeads(list);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStages();
    loadLeads();
    const interval = setInterval(() => loadLeads(), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function createLead() {
    setErro(null);
    setSaving(true);
    try {
      await apiFetch("/leads", {
        method: "POST",
        body: JSON.stringify({ nome, telefone, observacao }),
      });
      setOpenForm(false);
      setNome("");
      setTelefone("");
      setObservacao("");
      await loadLeads();
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar lead");
    } finally {
      setSaving(false);
    }
  }

  const activeFilterCount =
    (colFilters.etapa ? 1 : 0) + (colFilters.status ? 1 : 0) + (colFilters.origem ? 1 : 0) +
    (colFilters.interesse ? 1 : 0) + (colFilters.indicacao ? 1 : 0) +
    (numRange.min || numRange.max ? 1 : 0);

  function clearFilters() {
    setColFilters({ etapa: "", status: "", origem: "", interesse: "", indicacao: "" });
    setNumRange({ min: "", max: "" });
  }

  function setCF(k: keyof typeof colFilters, v: string) {
    setColFilters((f) => ({ ...f, [k]: v }));
  }

  function getStageName(l: Lead): string {
    return l.stage?.name ?? l.stageName ?? pipelineStages.find((s) => s.id === l.stageId)?.name ?? "—";
  }

  function exportCSVFiltered() {
    const headers = ["Número", "Nome", "Telefone", "Origem", "Etapa", "Status", "Interesse", "Indicação", "Responsável", "Criado em"];
    const rows = filtered.map((l) => {
      const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "—";
      return [
        num,
        displayName(l),
        l.telefone || l.whatsapp || "—",
        l.origem || "—",
        getStageName(l),
        STATUS_LABEL[l.status ?? ""] || l.status || "—",
        l.perfilImovel || "—",
        (l.cadastroOrigem as any)?.indicacao || "—",
        l.assignedUserName || "—",
        formatDateTime(l.criadoEm),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const tableRows = filtered.map((l) => {
      const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "—";
      return `<tr><td>${num}</td><td>${displayName(l)}</td><td>${l.telefone || l.whatsapp || "—"}</td>
        <td>${l.origem || "—"}</td><td>${getStageName(l)}</td>
        <td>${STATUS_LABEL[l.status ?? ""] || l.status || "—"}</td>
        <td>${l.perfilImovel || "—"}</td><td>${(l.cadastroOrigem as any)?.indicacao || "—"}</td>
        <td>${l.assignedUserName || "—"}</td><td>${formatDateTime(l.criadoEm)}</td></tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Leads</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h2{margin-bottom:8px}p{margin-bottom:12px;color:#666}
      table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:5px 8px;border:1px solid #ccc;font-size:10px;text-transform:uppercase}
      td{padding:4px 8px;border:1px solid #eee}tr:nth-child(even){background:#f9f9f9}@media print{body{margin:0}}</style>
    </head><body>
      <h2>Relatório de Leads${activeGroup ? ` — ${pageTitle}` : ""}</h2>
      <p>${new Date().toLocaleDateString("pt-BR")} · ${filtered.length} leads${activeFilterCount ? ` · ${activeFilterCount} filtro(s)` : ""}</p>
      <table><thead><tr><th>Número</th><th>Nome</th><th>Telefone</th><th>Origem</th><th>Etapa</th>
        <th>Status</th><th>Interesse</th><th>Indicação</th><th>Responsável</th><th>Criado em</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  }

  async function exportLeads() {
    const token = localStorage.getItem("accessToken");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const resp = await fetch(`${apiUrl}/leads/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visibleStages = useMemo(() => {
    if (!activeGroup) return pipelineStages;
    return pipelineStages.filter((s) => s.group === activeGroup);
  }, [pipelineStages, activeGroup]);

  const visibleStageIds = useMemo(
    () => new Set(visibleStages.map((s) => s.id)),
    [visibleStages]
  );

  const isGroupedPipeline = useMemo(
    () => leads.some((l) => SP9_GROUPS.has(l.stage?.group ?? "")),
    [leads]
  );

  const uniqueValues = useMemo(() => {
    const etapa = new Set<string>(), status = new Set<string>(), origem = new Set<string>();
    const interesse = new Set<string>(), indicacao = new Set<string>();
    for (const l of leads) {
      const sn = l.stage?.name ?? l.stageName ?? pipelineStages.find((s) => s.id === l.stageId)?.name;
      if (isGroupedPipeline) {
        const g = l.stage?.group;
        if (g) etapa.add(GROUP_LABEL[g] ?? g);
        if (sn) status.add(sn);
      } else {
        if (sn) etapa.add(sn);
        if (l.status) status.add(l.status);
      }
      if (l.origem) origem.add(l.origem);
      if (l.perfilImovel) interesse.add(l.perfilImovel);
      const ind = (l.cadastroOrigem as any)?.indicacao;
      if (ind) indicacao.add(ind);
    }
    return { etapa: [...etapa].sort(), status: [...status].sort(), origem: [...origem].sort(), interesse: [...interesse].sort(), indicacao: [...indicacao].sort() };
  }, [leads, pipelineStages, isGroupedPipeline]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (activeGroup && !visibleStageIds.has(l.stageId ?? "")) return false;
      if (qq) {
        const ind = (l.cadastroOrigem as any)?.indicacao ?? "";
        const num = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "";
        const sn = l.stage?.name ?? l.stageName ?? "";
        if (![l.nome, l.nomeCorreto, l.telefone, l.whatsapp, l.observacao, l.origem, l.status, l.perfilImovel, sn, ind, num, l.assignedUserName]
          .join(" ").toLowerCase().includes(qq)) return false;
      }
      const sn = l.stage?.name ?? l.stageName ?? pipelineStages.find((s) => s.id === l.stageId)?.name ?? "";
      if (isGroupedPipeline) {
        const gl = GROUP_LABEL[l.stage?.group ?? ""] ?? l.stage?.group ?? "";
        if (colFilters.etapa && gl !== colFilters.etapa) return false;
        if (colFilters.status && sn !== colFilters.status) return false;
      } else {
        if (colFilters.etapa && sn !== colFilters.etapa) return false;
        if (colFilters.status && l.status !== colFilters.status) return false;
      }
      if (colFilters.origem && l.origem !== colFilters.origem) return false;
      if (colFilters.interesse && l.perfilImovel !== colFilters.interesse) return false;
      if (colFilters.indicacao && (l.cadastroOrigem as any)?.indicacao !== colFilters.indicacao) return false;
      if (numRange.min && (l.numero ?? 0) < parseInt(numRange.min)) return false;
      if (numRange.max && (l.numero ?? 0) > parseInt(numRange.max)) return false;
      return true;
    });
  }, [leads, q, activeGroup, visibleStageIds, pipelineStages, colFilters, numRange, isGroupedPipeline]);

  useEffect(() => { setVisibleCount(loadMoreN); }, [q, activeGroup, leads, colFilters, numRange]);

  const pendingLeads = useMemo(() => filtered.filter((l) => l.conversaAberta), [filtered]);
  const normalLeads  = useMemo(() => filtered.filter((l) => !l.conversaAberta), [filtered]);

  const groupedKanban = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of visibleStages) map[stage.id] = [];
    const firstStageId = visibleStages[0]?.id;
    for (const l of filtered) {
      const targetStageId = l.stageId && map[l.stageId] ? l.stageId : firstStageId;
      if (targetStageId) map[targetStageId].push(l);
    }
    return map;
  }, [filtered, visibleStages]);

  const S: React.CSSProperties = {
    width: "100%", fontSize: 11, padding: "2px 4px", borderRadius: 4,
    border: "1px solid var(--shell-card-border)",
    background: "var(--shell-bg)", color: "var(--shell-text)",
  };

  return (
    <AppShell title={pageTitle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--shell-text)]">{pageTitle}</h1>
          <div className="text-sm text-[var(--shell-subtext)]">
            {activeGroup ? `Funil · ${pageTitle}` : "Lista e Kanban (visual)"}
          </div>
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

          <Button variant="outline" size="sm" onClick={exportLeads}>
            Exportar CSV (todos)
          </Button>

          <Button size="sm" onClick={() => setOpenForm(true)}>
            Novo Lead
          </Button>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={loadLeads} loading={loading}>
          {loading ? "Atualizando..." : "Atualizar"}
        </Button>

        {view === "LISTA" ? (
          <>
            <span className="text-xs text-[var(--shell-subtext)]">
              Exibindo {Math.min(visibleCount, filtered.length)} de {filtered.length}
            </span>
            <input
              type="number" min={1} value={loadMoreN}
              onChange={(e) => setLoadMoreN(Math.max(1, parseInt(e.target.value) || 10))}
              className="w-16 rounded-lg border px-2 py-1 text-sm text-center"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
            />
            {visibleCount < filtered.length && (
              <button
                onClick={() => setVisibleCount((v) => v + loadMoreN)}
                className="rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors"
                style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
              >
                Ver mais {loadMoreN}
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-[var(--shell-subtext)]">
            Total: <span className="text-[var(--shell-text)] font-medium">{filtered.length}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Input className="w-56" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          {view === "LISTA" && (
            <>
              <button onClick={() => setShowFilters((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ borderColor: activeFilterCount ? "var(--brand-accent)" : "var(--shell-card-border)", color: activeFilterCount ? "var(--brand-accent)" : "var(--shell-text)", background: showFilters ? "var(--shell-hover)" : "transparent" }}>
                ▼ Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] underline">Limpar</button>
              )}
              <button onClick={exportCSVFiltered} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>↓ Excel</button>
              <button onClick={exportPDF} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>↓ PDF</button>
              <button onClick={() => setReportOpen(true)} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)] transition-colors" style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}>↓ Relatório</button>
            </>
          )}
        </div>
      </div>

      {/* Modal novo lead */}
      <Modal
        open={openForm}
        onClose={() => setOpenForm(false)}
        title="Novo Lead"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
            <Button loading={saving} onClick={createLead}>
              {saving ? "Salvando..." : "Salvar lead"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João Silva" />
          <Input label="Telefone / WhatsApp" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: (11) 99999-9999" />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--shell-subtext)]">Observação (opcional)</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: quer apartamento 2 quartos..."
            />
          </div>
        </div>
      </Modal>

      {/* LISTA */}
      {view === "LISTA" && (
        <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
          {/* Cabeçalho */}
          <div className="grid gap-2 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)", gridTemplateColumns: COL }}>
            <div>Número</div><div>Nome</div><div>Telefone</div><div>Origem</div>
            <div>Etapa</div><div>Status</div><div>Interesse</div><div>Indicação</div>
            <div>Responsável</div><div>Criado em</div>
          </div>

          {/* Filtros */}
          {showFilters && (
            <div className="grid gap-2 border-b px-4 py-2 items-center"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-hover)", gridTemplateColumns: COL }}>
              <div className="flex gap-1">
                <input style={S} placeholder="De" value={numRange.min} onChange={(e) => setNumRange((r) => ({ ...r, min: e.target.value }))} />
                <input style={S} placeholder="Até" value={numRange.max} onChange={(e) => setNumRange((r) => ({ ...r, max: e.target.value }))} />
              </div>
              <div /><div />
              <select style={S} value={colFilters.origem} onChange={(e) => setCF("origem", e.target.value)}><option value="">Todas</option>{uniqueValues.origem.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <select style={S} value={colFilters.etapa} onChange={(e) => setCF("etapa", e.target.value)}><option value="">Todas</option>{uniqueValues.etapa.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <select style={S} value={colFilters.status} onChange={(e) => setCF("status", e.target.value)}><option value="">Todos</option>{uniqueValues.status.map((v) => <option key={v} value={v}>{isGroupedPipeline ? v : (STATUS_LABEL[v] ?? v)}</option>)}</select>
              <select style={S} value={colFilters.interesse} onChange={(e) => setCF("interesse", e.target.value)}><option value="">Todos</option>{uniqueValues.interesse.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <select style={S} value={colFilters.indicacao} onChange={(e) => setCF("indicacao", e.target.value)}><option value="">Todas</option>{uniqueValues.indicacao.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <div /><div />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead.</div>
          ) : (
            <>
              {/* Seção: Conversas Abertas */}
              {pendingLeads.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                    <span>💬 Conversas abertas ({pendingLeads.length})</span>
                  </div>
                  {pendingLeads.map((l) => {
                    const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                    const stageName = getStageName(l);
                    const etapaText = isGroupedPipeline
                      ? (GROUP_LABEL[l.stage?.group ?? ""] ?? l.stage?.group ?? "—")
                      : stageName;
                    const st = isGroupedPipeline ? null : formatStatus(l.status);
                    return (
                      <div key={l.id} className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-amber-100 transition-colors bg-amber-50 border-l-4 border-l-amber-400"
                        style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: COL }}>
                        <div className="text-sm font-mono text-[var(--shell-subtext)] truncate">{numero || "—"}</div>
                        <div className="min-w-0">
                          <Link className="font-medium text-[var(--shell-text)] hover:underline truncate block" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>{displayName(l)}</Link>
                        </div>
                        <div className="text-sm text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                        <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.origem ?? undefined}>{l.origem || "—"}</div>
                        <div className="min-w-0">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE} truncate max-w-full`} title={etapaText}>{etapaText}</span>
                        </div>
                        <div className="min-w-0">
                          {isGroupedPipeline ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE}`}>{stageName}</span>
                          ) : st ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{st.label}</span>
                          ) : (
                            <span className="text-sm text-[var(--shell-subtext)]">—</span>
                          )}
                        </div>
                        <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.perfilImovel ?? undefined}>{l.perfilImovel || "—"}</div>
                        <div className="text-sm text-[var(--shell-subtext)] truncate" title={(l.cadastroOrigem as any)?.indicacao ?? undefined}>{(l.cadastroOrigem as any)?.indicacao || "—"}</div>
                        <div className="text-sm text-[var(--shell-subtext)] truncate">{l.assignedUserName || "—"}</div>
                        <div className="text-xs text-[var(--shell-subtext)] truncate whitespace-nowrap">{formatDateTime(l.criadoEm)}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Separador entre seções */}
              {pendingLeads.length > 0 && (
                <div className="h-3 border-b-2" style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-sidebar-bg, #f3f4f6)" }} />
              )}

              {/* Seção: Leads normais */}
              <div>
                <div className="px-4 py-2 text-xs font-semibold border-b"
                  style={{ color: "var(--shell-subtext)", borderColor: "var(--shell-card-border)" }}>
                  Leads ({normalLeads.length})
                </div>
                {normalLeads.slice(0, Math.max(0, visibleCount - pendingLeads.length)).map((l) => {
                  const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                  const stageName = getStageName(l);
                  const etapaText = isGroupedPipeline
                    ? (GROUP_LABEL[l.stage?.group ?? ""] ?? l.stage?.group ?? "—")
                    : stageName;
                  const st = isGroupedPipeline ? null : formatStatus(l.status);
                  return (
                    <div key={l.id} className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                      style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: COL }}>
                      <div className="text-sm font-mono text-[var(--shell-subtext)] truncate">{numero || "—"}</div>
                      <div className="min-w-0">
                        <Link className="font-medium text-[var(--shell-text)] hover:underline truncate block" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>{displayName(l)}</Link>
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.origem ?? undefined}>{l.origem || "—"}</div>
                      <div className="min-w-0">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE} truncate max-w-full`} title={etapaText}>{etapaText}</span>
                      </div>
                      <div className="min-w-0">
                        {isGroupedPipeline ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE}`}>{stageName}</span>
                        ) : st ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{st.label}</span>
                        ) : (
                          <span className="text-sm text-[var(--shell-subtext)]">—</span>
                        )}
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.perfilImovel ?? undefined}>{l.perfilImovel || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={(l.cadastroOrigem as any)?.indicacao ?? undefined}>{(l.cadastroOrigem as any)?.indicacao || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.assignedUserName || "—"}</div>
                      <div className="text-xs text-[var(--shell-subtext)] truncate whitespace-nowrap">{formatDateTime(l.criadoEm)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* KANBAN */}
      {view === "KANBAN" && (
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-start gap-4 pb-2">
            {visibleStages.map((stage) => {
              const items = groupedKanban[stage.id] ?? [];
              return (
                <div key={stage.id} className="w-[280px] shrink-0 rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
                  <div className="border-b px-3 py-2 text-sm font-semibold"
                    style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}>
                    {stage.name}
                    <span className="ml-2 text-xs font-normal text-[var(--shell-subtext)]">({items.length})</span>
                  </div>
                  <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                    {items.length === 0 ? (
                      <div className="p-2 text-xs text-[var(--shell-subtext)]">Vazio</div>
                    ) : (
                      (() => {
                        const pendingInStage = items.filter((l) => l.conversaAberta);
                        const normalInStage  = items.filter((l) => !l.conversaAberta);
                        return [...pendingInStage, ...normalInStage].map((l) => {
                          const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                          const st = isGroupedPipeline ? null : formatStatus(l.status);
                          const stageName = getStageName(l);
                          return (
                            <div key={l.id} className={`rounded-lg border p-2 ${l.conversaAberta ? "border-l-4 border-l-amber-400 bg-amber-50" : ""}`}
                              style={{ borderColor: l.conversaAberta ? undefined : "var(--shell-card-border)", background: l.conversaAberta ? undefined : "var(--shell-bg)" }}>
                              {numero && <div className="text-xs font-mono text-[var(--shell-subtext)] truncate">{numero}</div>}
                              <div className="text-sm font-medium text-[var(--shell-text)] truncate">
                                <Link className="hover:underline" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>{displayName(l)}</Link>
                              </div>
                              <div className="mt-1 text-xs text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {l.origem && (
                                  <span className="inline-block rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)] truncate max-w-[120px]" title={l.origem}>{l.origem}</span>
                                )}
                                {isGroupedPipeline ? (
                                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] ${STAGE_BADGE}`}>{stageName}</span>
                                ) : st && (
                                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] ${st.color}`}>{st.label}</span>
                                )}
                                {l.perfilImovel && (
                                  <span className="inline-block rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 truncate max-w-[140px]" title={l.perfilImovel}>{l.perfilImovel}</span>
                                )}
                                {l.assignedUserName && (
                                  <span className="inline-block rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700 truncate max-w-[120px]" title={l.assignedUserName}>👤 {l.assignedUserName}</span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        leads={filtered}
        stages={pipelineStages}
      />
    </AppShell>
  );
}
