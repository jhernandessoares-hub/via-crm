"use client";

import { useEffect, useState, useCallback, startTransition, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { FamiliaSearchInput, type FamiliaSearchResult } from "../_lib/FamiliaSearchInput";
import {
  AVALIACAO_LABEL,
  AVALIACAO_EMOJI,
  OCORRENCIA_STATUS_LABEL,
  OCORRENCIA_TIPO_LABEL,
  OCORRENCIA_TIPO_OPTIONS,
  OCORRENCIA_TIPO_PERGUNTA,
  OCORRENCIA_LOCAL_OPTIONS,
  formatDateTime,
} from "../_lib/constants";
import { type Ocorrencia, localDisplay, diasEmAberto } from "./_shared";

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function baixarRelatorio(items: Ocorrencia[]) {
  const header = [
    "Número", "Título", "Tipo", "Status", "Família", "Lead", "Local do atendimento",
    "Aberta em", "Encerrada em", "Dias em aberto", "Aberta por", "Avaliação", "Resolução",
  ];
  const rows = items.map((o) => [
    String(o.numero),
    o.titulo,
    o.tipo ? (OCORRENCIA_TIPO_LABEL[o.tipo] ?? o.tipo) : "",
    OCORRENCIA_STATUS_LABEL[o.status] ?? o.status,
    o.familia ? (o.familia.lead.nomeCorreto ?? o.familia.lead.nome) : "Sem família",
    o.familia ? formatLeadNumber(o.familia.lead.numero, o.familia.lead.reentradaCount) : "",
    localDisplay(o),
    formatDateTime(o.abertaEm),
    formatDateTime(o.encerradaEm),
    String(diasEmAberto(o)),
    o.criadoPor || "",
    o.avaliacao ? (AVALIACAO_LABEL[o.avaliacao] ?? o.avaliacao) : "",
    o.resolucao || "",
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => csvEscape(String(v))).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `demandas-pre-ocupacao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DemandasPageInner() {
  const guard = useSP9Guard();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ABERTA" | "ENCERRADA">("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [caixaEntrada, setCaixaEntrada] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [contadores, setContadores] = useState<{ abertas: number; encerradas: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (statusFilter) qs.set("status", statusFilter);
      if (tipoFilter) qs.set("tipo", tipoFilter);
      if (dataDe) qs.set("dataDe", dataDe);
      if (dataAte) qs.set("dataAte", dataAte);
      if (caixaEntrada) qs.set("semFamilia", "true");
      const res = await apiFetch(`/pre-ocupacao/demandas?${qs.toString()}`);
      setItems(res);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar demandas");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, tipoFilter, dataDe, dataAte, caixaEntrada]);

  const loadContadores = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (dataDe) qs.set("dataDe", dataDe);
      if (dataAte) qs.set("dataAte", dataAte);
      const res = await apiFetch(`/pre-ocupacao/demandas/contadores?${qs.toString()}`);
      setContadores(res);
    } catch {
      setContadores(null);
    }
  }, [dataDe, dataAte]);

  useEffect(() => {
    if (guard !== true) return;
    setShowAll(false);
    load();
  }, [guard, load]);

  useEffect(() => {
    if (guard !== true) return;
    loadContadores();
  }, [guard, loadContadores]);

  // Query param vindo da tela de Família (criar demanda pré-vinculada).
  useEffect(() => {
    if (guard !== true) return;
    if (searchParams.get("criar") === "1") setCreateOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  if (guard === null) return null;

  const familiaIdParam = searchParams.get("familiaId") || undefined;
  const leadIdParam = searchParams.get("leadId") || undefined;

  return (
    <AppShell title="Pré-Ocupação — Demandas">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Demandas
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Ocorrências do Pré-Ocupação — atendimentos, solicitações e triagem.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => baixarRelatorio(items)}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
              style={{ color: "var(--shell-text)" }}
            >
              Baixar relatório
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
            >
              + Criar demanda
            </button>
          </div>
        </div>

        {/* Mini dashboard — clicável, filtra por status */}
        <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "ABERTA" ? "" : "ABERTA"))}
          >
            <CardBody style={statusFilter === "ABERTA" ? { boxShadow: "inset 0 0 0 2px #f59e0b" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Abertas {dataDe || dataAte ? "(no período)" : ""}
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#b45309" }}>
                {contadores?.abertas ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "ENCERRADA" ? "" : "ENCERRADA"))}
          >
            <CardBody style={statusFilter === "ENCERRADA" ? { boxShadow: "inset 0 0 0 2px #16a34a" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Encerradas {dataDe || dataAte ? "(no período)" : ""}
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#15803d" }}>
                {contadores?.encerradas ?? "—"}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF ou número da família..."
            className="flex-1 min-w-[240px] h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          >
            <option value="">Todos os status</option>
            <option value="ABERTA">Abertas</option>
            <option value="ENCERRADA">Encerradas</option>
          </select>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          >
            <option value="">Todos os tipos</option>
            {OCORRENCIA_TIPO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <label className="text-xs" style={{ color: "var(--shell-subtext)" }}>Aberta de</label>
            <input
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.target.value)}
              className="h-10 rounded-lg border px-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
            <label className="text-xs" style={{ color: "var(--shell-subtext)" }}>até</label>
            <input
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.target.value)}
              className="h-10 rounded-lg border px-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          </div>
          <button
            onClick={() => setCaixaEntrada((v) => !v)}
            className="h-10 px-4 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: caixaEntrada ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
              background: caixaEntrada ? "var(--via-teal-soft, #e6f5ef)" : "transparent",
              color: caixaEntrada ? "var(--via-teal, #1D9E75)" : "var(--shell-text)",
            }}
          >
            📥 Caixa de entrada (sem família)
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div className="space-y-2">
          {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
          {!loading && items.length === 0 && (
            <Card>
              <CardBody className="text-center py-8">
                <p style={{ color: "var(--shell-subtext)" }}>Nenhuma demanda encontrada.</p>
              </CardBody>
            </Card>
          )}
          {!loading && (showAll ? items : items.slice(0, 20)).map((o) => (
            <Card
              key={o.id}
              className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
              onClick={() => startTransition(() => router.push(`/pre-ocupacao/demandas/${o.id}`))}
            >
              <CardBody className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: "var(--shell-text)" }}>
                    #{o.numero} — {o.titulo}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                    {o.familia
                      ? `${o.familia.lead.nomeCorreto ?? o.familia.lead.nome} (lead #${formatLeadNumber(o.familia.lead.numero, o.familia.lead.reentradaCount) || "—"})`
                      : "Sem família vinculada"}
                    {" · "}
                    Aberta em {formatDateTime(o.abertaEm)}
                  </p>
                  {o.status === "ENCERRADA" && o.avaliacao && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                      Avaliação: {AVALIACAO_EMOJI[o.avaliacao] ?? ""} {AVALIACAO_LABEL[o.avaliacao] ?? o.avaliacao}
                      {o.resolucao ? ` — ${o.resolucao}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    variant={o.status === "ABERTA" ? "warning" : "default"}
                    style={{ fontSize: "13px", fontWeight: 700, padding: "4px 12px" }}
                  >
                    {OCORRENCIA_STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                  {!o.familiaId && <Badge variant="info">Sem família</Badge>}
                  <span className="text-[11px]" style={{ color: "var(--shell-subtext)" }}>
                    {o.status === "ABERTA" ? `Aberta há ${diasEmAberto(o)}d` : `Ficou aberta ${diasEmAberto(o)}d`}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))}
          {!loading && !showAll && items.length > 20 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              Ver todas ({items.length}) — mostrando as últimas 20
            </button>
          )}
        </div>
      </div>

      {createOpen && (
        <CriarDemandaModal
          initialFamiliaId={familiaIdParam}
          initialLeadId={leadIdParam}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            showToast("Demanda criada com sucesso.");
            load();
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
          style={{ background: "#16a34a", color: "#fff" }}
        >
          {toast}
        </div>
      )}
    </AppShell>
  );
}

export default function DemandasPage() {
  return (
    <Suspense fallback={null}>
      <DemandasPageInner />
    </Suspense>
  );
}

// ─── Criar Demanda ──────────────────────────────────────────────────────────

function CriarDemandaModal({
  initialFamiliaId,
  initialLeadId,
  onClose,
  onCreated,
}: {
  initialFamiliaId?: string;
  initialLeadId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tipo, setTipo] = useState("");
  const [tituloPersonalizado, setTituloPersonalizado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [local, setLocal] = useState("");
  const [localDescricao, setLocalDescricao] = useState("");
  const [familia, setFamilia] = useState<FamiliaSearchResult | null>(null);
  const [familiaIdLocked, setFamiliaIdLocked] = useState<string | undefined>(initialFamiliaId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!tipo) {
      setError("Selecione o tipo da demanda.");
      return;
    }
    if (tipo === "OUTRO" && !tituloPersonalizado.trim()) {
      setError("Dê um nome pra essa demanda quando escolher \"Outro\".");
      return;
    }
    if (local === "OUTRO" && !localDescricao.trim()) {
      setError("Descreva o local quando escolher \"Outro\".");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const familiaId = familiaIdLocked ?? familia?.id;
      await apiFetch("/pre-ocupacao/demandas", {
        method: "POST",
        body: JSON.stringify({
          familiaId,
          tipo,
          tituloPersonalizado: tipo === "OUTRO" ? tituloPersonalizado.trim() : undefined,
          local: local || undefined,
          localDescricao: local === "OUTRO" ? localDescricao.trim() : undefined,
          observacoes: observacoes.trim() || undefined,
          origem: "MANUAL",
        }),
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar demanda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Criar demanda"
      description="Registre uma nova ocorrência do Pré-Ocupação. Vincular a uma família é opcional. Data e horário do atendimento são gravados automaticamente."
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--via-teal, #1D9E75)", color: "#fff" }}
          >
            {loading ? "Criando..." : "Criar demanda"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Tipo *</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          >
            <option value="">Selecione...</option>
            {OCORRENCIA_TIPO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {tipo === "OUTRO" && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Dê um nome pra essa demanda *</label>
            <input
              type="text"
              value={tituloPersonalizado}
              onChange={(e) => setTituloPersonalizado(e.target.value)}
              placeholder="Ex.: Problema com o portão da unidade"
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
            {tipo ? OCORRENCIA_TIPO_PERGUNTA[tipo] : "Qual a demanda?"}
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Local do atendimento</label>
            <select
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
            >
              <option value="">Selecione...</option>
              {OCORRENCIA_LOCAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {local === "OUTRO" && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Descreva onde</label>
              <input
                type="text"
                value={localDescricao}
                onChange={(e) => setLocalDescricao(e.target.value)}
                className="w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
              />
            </div>
          )}
        </div>

        {familiaIdLocked ? (
          <div className="rounded-lg p-3" style={{ border: "2px solid #2563eb", background: "#eff6ff" }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "#1e40af" }}>Família já vinculada</p>
              <button
                type="button"
                onClick={() => setFamiliaIdLocked(undefined)}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "#dbeafe", color: "#1d4ed8" }}
              >
                Trocar
              </button>
            </div>
          </div>
        ) : (
          <FamiliaSearchInput
            label="Vincular a uma família (opcional — busque entre as famílias já ativadas no Pré-Ocupação)"
            value={familia}
            onChange={setFamilia}
          />
        )}

        {error && <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </Modal>
  );
}
