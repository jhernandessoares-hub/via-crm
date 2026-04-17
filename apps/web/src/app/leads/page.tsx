"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";

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
  nome?: string;
  telefone?: string;
  whatsapp?: string;
  observacao?: string;
  stageId?: string | null;
  stageKey?: string | null;
  stageName?: string | null;
  criadoEm?: string;
};

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const activeGroup = searchParams.get("group");
  const pageTitle = activeGroup ? (GROUP_LABEL[activeGroup] ?? activeGroup) : "Leads";

  const [view, setView] = useState<"LISTA" | "KANBAN">("LISTA");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState("");

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
      return [l.nome, l.telefone, l.whatsapp, l.observacao, l.id]
        .join(" ").toLowerCase().includes(qq);
    });
  }, [leads, q, activeGroup, visibleStageIds]);

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
            {(["LISTA", "KANBAN"] as const).map((v) => (
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
                {v === "LISTA" ? "Lista" : "Kanban"}
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
            className="grid grid-cols-12 gap-2 border-b px-4 py-3 text-xs font-medium"
            style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-subtext)" }}
          >
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Contato</div>
            <div className="col-span-2">Etapa</div>
            <div className="col-span-3 text-right">Info</div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum lead.</div>
          ) : (
            filtered.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 items-center gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-[var(--shell-hover)] transition-colors"
                style={{ borderColor: "var(--shell-card-border)" }}
              >
                <div className="col-span-4">
                  <Link
                    className="font-medium text-[var(--shell-text)] hover:underline"
                    href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}
                  >
                    {l.nome || "Sem nome"}
                  </Link>
                  <div className="text-xs text-[var(--shell-subtext)]">{l.id}</div>
                </div>
                <div className="col-span-3 text-sm text-[var(--shell-subtext)]">
                  {l.telefone || l.whatsapp || "-"}
                </div>
                <div className="col-span-2 text-sm text-[var(--shell-subtext)]">
                  {l.stageName || pipelineStages.find((s) => s.id === l.stageId)?.name || "-"}
                </div>
                <div className="col-span-3 text-right text-xs text-[var(--shell-subtext)]">-</div>
              </div>
            ))
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
                      items.map((l) => (
                        <div
                          key={l.id}
                          className="rounded-lg border p-2"
                          style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                        >
                          <div className="text-sm font-medium text-[var(--shell-text)]">
                            <Link
                              className="hover:underline"
                              href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}
                            >
                              {l.nome || "Sem nome"}
                            </Link>
                          </div>
                          <div className="mt-1 text-xs text-[var(--shell-subtext)]">
                            {l.telefone || l.whatsapp || "-"}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--shell-subtext)]">
                            {l.stageName || stage.name}
                          </div>
                        </div>
                      ))
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
