"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import {
  ATENDIMENTO_ASSUNTO_LABEL,
  ATENDIMENTO_MODALIDADE_LABEL,
  ATENDIMENTO_MOTIVO_LABEL,
  ATENDIMENTO_ORIGEM_LABEL,
  formatDate,
  intervaloDoMes,
} from "../_lib/constants";

type FamiliaItem = {
  id: string;
  numero: number;
  leadId: string;
  nome: string;
  cpf: string | null;
  empreendimento: string | null;
  unidade: string | null;
  statusFamilia: string;
  status: "EM_DIA" | "COM_PENDENCIA";
  faltas: number;
  ativadoEm: string;
  demandasTotal: number;
  demandasAbertas: number;
  demandasEncerradas: number;
  atendimentos: number;
};

type Dashboard = { total: number; emDia: number; comPendencia: number; atendimentos: number };

type Periodo = { de: string; ate: string };

type AtendimentoRelatorio = {
  id: string;
  inicioEm: string;
  motivo: string;
  assunto: string;
  modalidade: string;
  descricao: string | null;
  origem: string;
  atendidoPorNome: string | null;
  familia: { numero: number; lead: { nome: string; nomeCorreto: string | null; cpf: string | null } };
};

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function periodoLabel(p: Periodo): string {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  if (p.de && p.ate) return `${fmt(p.de)} a ${fmt(p.ate)}`;
  if (p.de) return `a partir de ${fmt(p.de)}`;
  if (p.ate) return `até ${fmt(p.ate)}`;
  return "todo o período";
}

function periodoSufixo(p: Periodo): string {
  return p.de || p.ate ? `${p.de || "inicio"}_a_${p.ate || "hoje"}` : new Date().toISOString().slice(0, 10);
}

function periodoQuery(p: Periodo): string {
  const qs = new URLSearchParams();
  if (p.de) qs.set("de", p.de);
  if (p.ate) qs.set("ate", p.ate);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function salvarCsv(linhas: string[][], nomeArquivo: string) {
  const csv = linhas.map((r) => r.map((v) => csvEscape(String(v))).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function baixarRelatorio(items: FamiliaItem[], periodo: Periodo) {
  const header = [
    "Nº",
    "Família",
    "CPF",
    "Empreendimento",
    "Unidade",
    "Incluída em",
    `Atendimentos (${periodoLabel(periodo)})`,
    "Demandas (total)",
    "Demandas abertas",
    "Demandas encerradas",
    "Status",
    "Faltas",
  ];
  const rows = items.map((f) => [
    String(f.numero).padStart(4, "0"),
    f.nome,
    f.cpf || "",
    f.empreendimento || "",
    f.unidade || "",
    formatDate(f.ativadoEm),
    String(f.atendimentos),
    String(f.demandasTotal),
    String(f.demandasAbertas),
    String(f.demandasEncerradas),
    f.status === "EM_DIA" ? "Em dia" : "Com pendência",
    String(f.faltas),
  ]);
  salvarCsv([header, ...rows], `familias-pre-ocupacao-${periodoSufixo(periodo)}.csv`);
}

/** Uma linha por atendimento do período — evidência detalhada para a Verificadora. */
async function baixarAtendimentos(periodo: Periodo) {
  const lista: AtendimentoRelatorio[] = await apiFetch(`/pre-ocupacao/atendimentos${periodoQuery(periodo)}`);
  const header = ["Data", "Hora", "Nº família", "Família", "CPF", "Modalidade", "Motivo", "Assunto", "Descrição", "Atendido por", "Registro"];
  const rows = lista.map((a) => {
    const d = new Date(a.inicioEm);
    return [
      d.toLocaleDateString("pt-BR"),
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      String(a.familia.numero).padStart(4, "0"),
      a.familia.lead.nomeCorreto ?? a.familia.lead.nome,
      a.familia.lead.cpf || "",
      ATENDIMENTO_MODALIDADE_LABEL[a.modalidade] ?? a.modalidade,
      ATENDIMENTO_MOTIVO_LABEL[a.motivo] ?? a.motivo,
      ATENDIMENTO_ASSUNTO_LABEL[a.assunto] ?? a.assunto,
      a.descricao || "",
      a.atendidoPorNome || "",
      ATENDIMENTO_ORIGEM_LABEL[a.origem] ?? a.origem,
    ];
  });
  salvarCsv([header, ...rows], `atendimentos-pre-ocupacao-${periodoSufixo(periodo)}.csv`);
}

const PERIODO_ATALHOS: { label: string; value: () => Periodo }[] = [
  { label: "Este mês", value: () => intervaloDoMes(0) },
  { label: "Mês passado", value: () => intervaloDoMes(-1) },
  { label: "Todo o período", value: () => ({ de: "", ate: "" }) },
];

export default function FamiliasPage() {
  const guard = useSP9Guard();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [items, setItems] = useState<FamiliaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "EM_DIA" | "COM_PENDENCIA" | "COM_ATENDIMENTO">("");
  const [periodo, setPeriodo] = useState<Periodo>({ de: "", ate: "" });
  const [baixandoAtendimentos, setBaixandoAtendimentos] = useState(false);

  useEffect(() => {
    if (guard !== true) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, periodo.de, periodo.ate]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/pre-ocupacao/familias${periodoQuery(periodo)}`);
      setDashboard(res.dashboard);
      setItems(res.items);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar famílias");
    } finally {
      setLoading(false);
    }
  }

  async function onBaixarAtendimentos() {
    setBaixandoAtendimentos(true);
    try {
      await baixarAtendimentos(periodo);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao baixar atendimentos");
    } finally {
      setBaixandoAtendimentos(false);
    }
  }

  const filtered = items.filter((f) => {
    if (statusFilter === "COM_ATENDIMENTO") {
      if (f.atendimentos === 0) return false;
    } else if (statusFilter && f.status !== statusFilter) {
      return false;
    }
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return (
      f.nome.toLowerCase().includes(term) ||
      (f.cpf ?? "").toLowerCase().includes(term) ||
      String(f.numero).includes(term)
    );
  });

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Famílias">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
              Famílias
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              Trabalho Técnico Social — acompanhamento das famílias no Pré-Ocupação.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => baixarRelatorio(filtered, periodo)}
              disabled={items.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
              style={{ color: "var(--shell-text)" }}
            >
              Baixar relatório
            </button>
            <button
              onClick={onBaixarAtendimentos}
              disabled={baixandoAtendimentos || !dashboard?.atendimentos}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
              style={{ color: "var(--shell-text)" }}
            >
              {baixandoAtendimentos ? "Gerando..." : "Baixar atendimentos"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>

        {/* Período — vale para o card/coluna Atendimentos e para os relatórios */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            De
            <input
              type="date"
              value={periodo.de}
              max={periodo.ate || undefined}
              onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
              className="block mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
            />
          </label>
          <label className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Até
            <input
              type="date"
              value={periodo.ate}
              min={periodo.de || undefined}
              onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
              className="block mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
            />
          </label>
          {PERIODO_ATALHOS.map((atalho) => {
            const v = atalho.value();
            const ativo = periodo.de === v.de && periodo.ate === v.ate;
            return (
              <button
                key={atalho.label}
                onClick={() => setPeriodo(v)}
                className="h-10 px-3 rounded-lg text-sm font-medium border"
                style={{
                  borderColor: ativo ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
                  color: ativo ? "var(--via-teal, #1D9E75)" : "var(--shell-text)",
                }}
              >
                {atalho.label}
              </button>
            );
          })}
        </div>

        {/* Dashboard cards — clicáveis, filtram a listagem */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter("")}
          >
            <CardBody style={statusFilter === "" ? { boxShadow: "inset 0 0 0 2px var(--via-teal, #1D9E75)" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Total no Pré-Ocupação
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--shell-text)" }}>
                {dashboard?.total ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "EM_DIA" ? "" : "EM_DIA"))}
          >
            <CardBody style={statusFilter === "EM_DIA" ? { boxShadow: "inset 0 0 0 2px #16a34a" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Em dia
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#16a34a" }}>
                {dashboard?.emDia ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "COM_PENDENCIA" ? "" : "COM_PENDENCIA"))}
          >
            <CardBody style={statusFilter === "COM_PENDENCIA" ? { boxShadow: "inset 0 0 0 2px #dc2626" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Com pendência
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#dc2626" }}>
                {dashboard?.comPendencia ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
            onClick={() => setStatusFilter((s) => (s === "COM_ATENDIMENTO" ? "" : "COM_ATENDIMENTO"))}
          >
            <CardBody style={statusFilter === "COM_ATENDIMENTO" ? { boxShadow: "inset 0 0 0 2px #2563eb" } : undefined}>
              <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Atendimentos
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "#2563eb" }}>
                {dashboard?.atendimentos ?? "—"}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--shell-subtext)" }}>
                {periodoLabel(periodo)}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF ou número da família..."
            className="w-full max-w-md h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Nº</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Família</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>CPF</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Empreendimento</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Unidade</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Incluída em</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Atendimentos</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Demandas</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Status</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Faltas</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-8" style={{ color: "var(--shell-subtext)" }}>
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8" style={{ color: "var(--shell-subtext)" }}>
                      Nenhuma família encontrada.
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => startTransition(() => router.push(`/pre-ocupacao/familias/${f.id}`))}
                    className="border-b cursor-pointer transition-colors hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)" }}
                  >
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {String(f.numero).padStart(4, "0")}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--shell-text)" }}>
                      {f.nome}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {f.cpf || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {f.empreendimento || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {f.unidade || "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-subtext)" }}>
                      {formatDate(f.ativadoEm)}
                    </td>
                    <td className="px-4 py-3" style={{ color: f.atendimentos > 0 ? "#2563eb" : "var(--shell-text)" }}>
                      {f.atendimentos}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {f.demandasTotal}
                      {f.demandasTotal > 0 && (
                        <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                          {" "}({f.demandasAbertas} abertas, {f.demandasEncerradas} encerradas)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={f.status === "EM_DIA" ? "success" : "error"}>
                        {f.status === "EM_DIA" ? "Em dia" : "Com pendência"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--shell-text)" }}>
                      {f.faltas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
