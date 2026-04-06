"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
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
      const data = await apiFetch("/leads/branch", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.items ?? [];
      setLeads(list);
    } catch {
      try {
        const data = await apiFetch("/leads/my", { method: "GET" });
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setLeads(list);
      } catch (e: any) {
        setErro(e?.message || "Erro ao carregar leads");
        setLeads([]);
      }
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

  // Etapas visíveis: todas ou só as do grupo ativo
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

    const result = leads.filter((l) => {
      // quando grupo ativo, só mostra leads cuja etapa pertence ao grupo
      if (activeGroup && !visibleStageIds.has(l.stageId ?? "")) return false;

      if (!qq) return true;

      const blob = [l.nome || "", l.telefone || "", l.whatsapp || "", l.observacao || "", l.id || ""]
        .join(" ")
        .toLowerCase();

      return blob.includes(qq);
    });

    return result;
  }, [leads, q, activeGroup, visibleStageIds]);

  const groupedKanban = useMemo(() => {
    const map: Record<string, Lead[]> = {};

    for (const stage of visibleStages) {
      map[stage.id] = [];
    }

    const firstStageId = visibleStages[0]?.id;

    for (const l of filtered) {
      const targetStageId = l.stageId && map[l.stageId] ? l.stageId : firstStageId;

      if (targetStageId) {
        map[targetStageId].push(l);
      }
    }

    return map;
  }, [filtered, visibleStages]);

  return (
    <AppShell title={pageTitle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{pageTitle}</h1>
          <div className="text-sm text-gray-600">
            {activeGroup ? `Funil · ${pageTitle}` : "Lista e Kanban (visual)"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-white p-1">
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${view === "LISTA" ? "bg-gray-100" : ""}`}
              onClick={() => setView("LISTA")}
            >
              Lista
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md ${view === "KANBAN" ? "bg-gray-100" : ""}`}
              onClick={() => setView("KANBAN")}
            >
              Kanban
            </button>
          </div>

          <button
            className="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={exportLeads}
          >
            Exportar CSV
          </button>

          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
            onClick={() => setOpenForm(true)}
          >
            Novo Lead
          </button>
        </div>
      </div>

      {erro ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={loadLeads}
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>

        <div className="text-sm text-gray-600">
          Total: <span className="text-gray-900 font-medium">{filtered.length}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            className="w-64 rounded-md border bg-white p-2 text-sm"
            placeholder="Buscar por nome/telefone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

        </div>
      </div>

      {openForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-900">Novo Lead</div>
              <button
                className="rounded-md px-2 py-1 text-sm hover:bg-gray-100"
                onClick={() => setOpenForm(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <input
                  className="mt-1 w-full rounded-md border p-2"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Telefone / WhatsApp</label>
                <input
                  className="mt-1 w-full rounded-md border p-2"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: (11) 99999-9999"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Observação (opcional)</label>
                <textarea
                  className="mt-1 w-full rounded-md border p-2"
                  rows={3}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: quer apartamento 2 quartos..."
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setOpenForm(false)}
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={saving}
                onClick={createLead}
              >
                {saving ? "Salvando..." : "Salvar lead"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {view === "LISTA" ? (
        <div className="mt-4 overflow-hidden rounded-xl border bg-white">
          <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-4 py-3 text-xs font-medium text-gray-600">
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Contato</div>
            <div className="col-span-2">Etapa</div>
            <div className="col-span-3 text-right">Info</div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">Nenhum lead.</div>
          ) : (
            filtered.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 items-center gap-2 border-b px-4 py-3 last:border-b-0"
              >
                <div className="col-span-4">
                  <Link className="font-medium text-gray-900 hover:underline" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>
                    {l.nome || "Sem nome"}
                  </Link>
                  <div className="text-xs text-gray-500">{l.id}</div>
                </div>

                <div className="col-span-3 text-sm text-gray-700">
                  {l.telefone || l.whatsapp || "-"}
                </div>

                <div className="col-span-2 text-sm text-gray-700">
                  {l.stageName || pipelineStages.find((s) => s.id === l.stageId)?.name || "-"}
                </div>

                <div className="col-span-3 text-right text-xs text-gray-500">
                  <span>-</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-start gap-4 pb-2">
            {visibleStages.map((stage) => {
              const items = groupedKanban[stage.id] ?? [];

              return (
                <div
                  key={stage.id}
                  className="w-[280px] shrink-0 rounded-xl border bg-white overflow-hidden"
                >
                  <div className="border-b bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                    {stage.name}
                    <span className="ml-2 text-xs font-normal text-gray-500">({items.length})</span>
                  </div>

                  <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
                    {items.length === 0 ? (
                      <div className="p-2 text-xs text-gray-500">Vazio</div>
                    ) : (
                      items.map((l) => (
                        <div key={l.id} className="rounded-lg border bg-white p-2">
                          <div className="text-sm font-medium text-gray-900">
                            <Link className="hover:underline" href={`/leads/${l.id}${activeGroup ? `?group=${activeGroup}` : ""}`}>
                              {l.nome || "Sem nome"}
                            </Link>
                          </div>

                          <div className="mt-1 text-xs text-gray-600">
                            {l.telefone || l.whatsapp || "-"}
                          </div>

                          <div className="mt-1 text-[11px] text-gray-500">
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