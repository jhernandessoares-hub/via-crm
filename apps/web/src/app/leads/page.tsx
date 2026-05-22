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

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder?: number;
  group?: string | null;
};

const GROUP_LABEL: Record<string, string> = {
  PRE_ATENDIMENTO:    "Pré-atendimento",
  AGENDAMENTO:        "Agendamento",
  PROPOSTAS:          "Propostas",
  NEGOCIACOES:        "Negociações",
  CREDITO_IMOBILIARIO:"Crédito Imobiliário",
  NEGOCIO_FECHADO:    "Negócio Fechado",
  POS_VENDA:          "Pós Venda",
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

const STAGE_BADGE = "bg-slate-100 text-slate-700";

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

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (activeGroup && !visibleStageIds.has(l.stageId ?? "")) return false;
      if (!qq) return true;
      const indicacao = (l.cadastroOrigem as any)?.indicacao ?? "";
      const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1) ?? "";
      return [l.nome, l.nomeCorreto, l.telefone, l.whatsapp, l.observacao, l.origem, l.status, l.perfilImovel, l.stageName, indicacao, String(l.rendaBrutaFamiliar ?? ""), numero]
        .join(" ").toLowerCase().includes(qq);
    });
  }, [leads, q, activeGroup, visibleStageIds]);

  useEffect(() => { setPage(1); }, [q, activeGroup, leads]);

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
            Exportar CSV
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

        <div className="text-sm text-[var(--shell-subtext)]">
          Total: <span className="text-[var(--shell-text)] font-medium">{filtered.length}</span>
        </div>

        <div className="ml-auto">
          <Input
            className="w-64"
            placeholder="Buscar por nome/telefone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
          <Input
            label="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: João Silva"
          />
          <Input
            label="Telefone / WhatsApp"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Ex: (11) 99999-9999"
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--shell-subtext)]">
              Observação (opcional)
            </label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{
                background: "var(--shell-input-bg)",
                color: "var(--shell-input-text)",
                borderColor: "var(--shell-input-border)",
              }}
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
        <div
          className="mt-4 overflow-hidden rounded-xl border"
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
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead.</div>
          ) : (() => {
            const shown = filtered.slice(0, page * PAGE_SIZE);
            const hasMore = shown.length < filtered.length;
            return (
              <>
                {shown.map((l) => {
                  const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                  const stageName = l.stageName || pipelineStages.find((s) => s.id === l.stageId)?.name || "—";
                  return (
                    <div
                      key={l.id}
                      className="grid items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                      style={{ borderColor: "var(--shell-card-border)", gridTemplateColumns: "90px 1.4fr 1.1fr 0.9fr 1fr 0.8fr 1fr 0.9fr 1fr" }}
                    >
                      <div className="text-sm font-mono text-[var(--shell-subtext)] truncate">{numero || "—"}</div>
                      <div className="min-w-0">
                        <Link className="font-medium text-[var(--shell-text)] hover:underline truncate block" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>
                          {displayName(l)}
                        </Link>
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.telefone || l.whatsapp || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.origem ?? undefined}>{l.origem || "—"}</div>
                      <div className="min-w-0">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE} truncate max-w-full`} title={stageName}>{stageName}</span>
                      </div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{l.status || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={l.perfilImovel ?? undefined}>{l.perfilImovel || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate" title={(l.cadastroOrigem as any)?.indicacao ?? undefined}>{(l.cadastroOrigem as any)?.indicacao || "—"}</div>
                      <div className="text-sm text-[var(--shell-subtext)] truncate">{formatRenda(l.rendaBrutaFamiliar)}</div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--shell-card-border)" }}>
                  <span className="text-xs text-[var(--shell-subtext)]">
                    Exibindo {shown.length} de {filtered.length}
                  </span>
                  {hasMore && (
                    <button
                      className="rounded-lg border px-4 py-1.5 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors"
                      style={{ borderColor: "var(--shell-card-border)" }}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Ver mais 10
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* KANBAN */}
      {view === "KANBAN" && (
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-start gap-4 pb-2">
            {visibleStages.map((stage) => {
              const items = groupedKanban[stage.id] ?? [];
              return (
                <div
                  key={stage.id}
                  className="w-[280px] shrink-0 rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}
                >
                  <div
                    className="border-b px-3 py-2 text-sm font-semibold"
                    style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                  >
                    {stage.name}
                    <span className="ml-2 text-xs font-normal text-[var(--shell-subtext)]">
                      ({items.length})
                    </span>
                  </div>
                  <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                    {items.length === 0 ? (
                      <div className="p-2 text-xs text-[var(--shell-subtext)]">Vazio</div>
                    ) : (
                      items.map((l) => {
                        const numero = formatLeadNumber(l.numero, l.reentradaCount ?? 1);
                        return (
                          <div
                            key={l.id}
                            className="rounded-lg border p-2"
                            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                          >
                            {numero && (
                              <div className="text-xs font-mono text-[var(--shell-subtext)] truncate">
                                {numero}
                              </div>
                            )}
                            <div className="text-sm font-medium text-[var(--shell-text)] truncate">
                              <Link
                                className="hover:underline"
                                href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}
                              >
                                {displayName(l)}
                              </Link>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--shell-subtext)] truncate">
                              <span className="truncate">{l.telefone || l.whatsapp || "—"}</span>
                              <span className="opacity-50">·</span>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_BADGE} truncate max-w-[100px]`} title={l.stageName || stage.name}>
                                {l.stageName || stage.name}
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
                          </div>
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
    </AppShell>
  );
}
