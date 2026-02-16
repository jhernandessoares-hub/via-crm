"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type LeadStatus =
  | "NOVO"
  | "EM_CONTATO"
  | "QUALIFICADO"
  | "PROPOSTA"
  | "FECHADO"
  | "PERDIDO";

type Lead = {
  id: string;
  nome?: string;
  telefone?: string;
  whatsapp?: string;
  observacao?: string;
  status?: LeadStatus;
  criadoEm?: string;
  needsManagerReview?: boolean;
  queuePriority?: number;
};

const STATUS_ORDER: LeadStatus[] = [
  "NOVO",
  "EM_CONTATO",
  "QUALIFICADO",
  "PROPOSTA",
  "FECHADO",
  "PERDIDO",
];

const STATUS_LABEL: Record<LeadStatus, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em contato",
  QUALIFICADO: "Qualificado",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

function normalizeStatus(s?: string): LeadStatus {
  const up = (s || "NOVO").toUpperCase();
  if (STATUS_ORDER.includes(up as LeadStatus)) return up as LeadStatus;
  return "NOVO";
}

function Badge({ status }: { status: LeadStatus }) {
  const cls =
    status === "FECHADO"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "PERDIDO"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function LeadsPage() {
  const [view, setView] = useState<"LISTA" | "KANBAN">("LISTA");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "TODOS">("TODOS");

  // form novo lead
  const [openForm, setOpenForm] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadLeads() {
    setErro(null);
    setLoading(true);

    try {
      const data = await apiFetch("/leads/branch", { method: "GET" });
      setLeads(Array.isArray(data) ? data : data?.items ?? []);
    } catch {
      try {
        const data = await apiFetch("/leads/my", { method: "GET" });
        setLeads(Array.isArray(data) ? data : data?.items ?? []);
      } catch (e: any) {
        setErro(e?.message || "Erro ao carregar leads");
        setLeads([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return leads
      .map((l) => ({ ...l, status: normalizeStatus(l.status) }))
      .filter((l) => {
        if (statusFilter !== "TODOS" && l.status !== statusFilter) return false;

        if (!qq) return true;

        const blob = [l.nome || "", l.telefone || "", l.whatsapp || "", l.observacao || "", l.id || ""]
          .join(" ")
          .toLowerCase();

        return blob.includes(qq);
      });
  }, [leads, q, statusFilter]);

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      NOVO: [],
      EM_CONTATO: [],
      QUALIFICADO: [],
      PROPOSTA: [],
      FECHADO: [],
      PERDIDO: [],
    };
    for (const l of filtered) {
      const st = normalizeStatus(l.status);
      map[st].push({ ...l, status: st });
    }
    return map;
  }, [filtered]);

  return (
    <AppShell title="Leads">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <div className="text-sm text-gray-600">Lista e Kanban (visual)</div>
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

        <div className="flex items-center gap-2 ml-auto">
          <input
            className="w-64 rounded-md border bg-white p-2 text-sm"
            placeholder="Buscar por nome/telefone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-md border bg-white p-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="TODOS">Todos</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Modal simples: Novo Lead */}
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
        <div className="mt-4 rounded-xl border bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-4 py-3 text-xs font-medium text-gray-600">
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Contato</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3 text-right">Info</div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">Nenhum lead.</div>
          ) : (
            filtered.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 items-center"
              >
                <div className="col-span-4">
                  <Link className="font-medium text-gray-900 hover:underline" href={`/leads/${l.id}`}>
                    {l.nome || "Sem nome"}
                  </Link>
                  <div className="text-xs text-gray-500">{l.id}</div>
                </div>

                <div className="col-span-3 text-sm text-gray-700">
                  {l.telefone || l.whatsapp || "-"}
                </div>

                <div className="col-span-2">
                  <Badge status={normalizeStatus(l.status)} />
                </div>

                <div className="col-span-3 text-right text-xs text-gray-500">
                  {l.needsManagerReview ? (
                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                      Manager Review
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {STATUS_ORDER.map((st) => (
            <div key={st} className="rounded-xl border bg-white overflow-hidden">
              <div className="border-b bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                {STATUS_LABEL[st]}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({grouped[st].length})
                </span>
              </div>

              <div className="p-2 space-y-2">
                {grouped[st].length === 0 ? (
                  <div className="text-xs text-gray-500 p-2">Vazio</div>
                ) : (
                  grouped[st].map((l) => (
                    <div key={l.id} className="rounded-lg border p-2 bg-white">
                      <div className="text-sm font-medium text-gray-900">
                        <Link className="hover:underline" href={`/leads/${l.id}`}>
                          {l.nome || "Sem nome"}
                        </Link>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {l.telefone || l.whatsapp || "-"}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge status={normalizeStatus(l.status)} />
                        {l.needsManagerReview ? (
                          <span className="text-[11px] rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                            Review
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
