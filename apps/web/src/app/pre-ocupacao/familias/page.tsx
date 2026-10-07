"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

type ComSem = "" | "com" | "sem";

function passaComSem(filtro: ComSem, valor: number): boolean {
  if (filtro === "com") return valor > 0;
  if (filtro === "sem") return valor === 0;
  return true;
}

/** Título de coluna com filtro Todos / Com / Sem. */
function ColunaComSem({ titulo, value, onChange }: { titulo: string; value: ComSem; onChange: (v: ComSem) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span>{titulo}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ComSem)}
        onClick={(e) => e.stopPropagation()}
        className="h-7 rounded-md border px-1 text-xs font-normal bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] outline-none"
        style={{
          borderColor: value ? "var(--via-teal, #1D9E75)" : "var(--shell-input-border)",
          color: value ? "var(--via-teal, #1D9E75)" : undefined,
        }}
      >
        <option value="">Todos</option>
        <option value="com">Com</option>
        <option value="sem">Sem</option>
      </select>
    </div>
  );
}

function contarPor(lista: AtendimentoRelatorio[], campo: "motivo" | "assunto" | "modalidade") {
  const m = new Map<string, number>();
  for (const a of lista) m.set(a[campo], (m.get(a[campo]) ?? 0) + 1);
  return m;
}

/** Gráfico/números dos atendimentos do período (assunto, motivo, modalidade). */
function PainelAtendimentos({ lista, periodo, loading }: { lista: AtendimentoRelatorio[]; periodo: Periodo; loading: boolean }) {
  const porAssunto = contarPor(lista, "assunto");
  const dadosAssunto = Object.entries(ATENDIMENTO_ASSUNTO_LABEL)
    .map(([k, label]) => ({ label, total: porAssunto.get(k) ?? 0 }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
  const porMotivo = contarPor(lista, "motivo");
  const porModalidade = contarPor(lista, "modalidade");
  const familias = new Set(lista.map((a) => a.familia.numero)).size;

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>
            Atendimentos — {periodoLabel(periodo)}
          </p>
          <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
            {lista.length} atendimento(s) em {familias} família(s)
          </p>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Nenhum atendimento no período.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>Por assunto</p>
              <div style={{ width: "100%", height: Math.max(120, dadosAssunto.length * 34) }}>
                <ResponsiveContainer>
                  <BarChart data={dadosAssunto} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={190}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "var(--shell-subtext)" }}
                    />
                    <Tooltip cursor={{ fill: "var(--shell-hover)" }} formatter={(v) => [String(v), "Atendimentos"]} />
                    <Bar dataKey="total" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={18}>
                      <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: "var(--shell-text)" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { titulo: "Por motivo", labels: ATENDIMENTO_MOTIVO_LABEL, mapa: porMotivo },
                { titulo: "Por modalidade", labels: ATENDIMENTO_MODALIDADE_LABEL, mapa: porModalidade },
              ].map((bloco) => (
                <div key={bloco.titulo}>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>{bloco.titulo}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(bloco.labels).map(([k, label]) => (
                      <div key={k} className="rounded-lg border px-2 py-2 text-center" style={{ borderColor: "var(--shell-card-border)" }}>
                        <p className="text-lg font-bold" style={{ color: "var(--shell-text)" }}>{bloco.mapa.get(k) ?? 0}</p>
                        <p className="text-[11px]" style={{ color: "var(--shell-subtext)" }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
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
  const [statusFilter, setStatusFilter] = useState<"" | "EM_DIA" | "COM_PENDENCIA">("");
  const [filtroAtend, setFiltroAtend] = useState<ComSem>("");
  const [filtroDemandas, setFiltroDemandas] = useState<ComSem>("");
  const [filtroFaltas, setFiltroFaltas] = useState<ComSem>("");
  const [atendimentosLista, setAtendimentosLista] = useState<AtendimentoRelatorio[]>([]);
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
      const [res, lista] = await Promise.all([
        apiFetch(`/pre-ocupacao/familias${periodoQuery(periodo)}`),
        apiFetch(`/pre-ocupacao/atendimentos${periodoQuery(periodo)}`),
      ]);
      setDashboard(res.dashboard);
      setItems(res.items);
      setAtendimentosLista(lista);
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
    if (statusFilter && f.status !== statusFilter) return false;
    if (!passaComSem(filtroAtend, f.atendimentos)) return false;
    if (!passaComSem(filtroDemandas, f.demandasTotal)) return false;
    if (!passaComSem(filtroFaltas, f.faltas)) return false;
    if (!q.trim()) return true;
    const term = q.trim().toLowerCase();
    return (
      f.nome.toLowerCase().includes(term) ||
      (f.cpf ?? "").toLowerCase().includes(term) ||
      String(f.numero).includes(term)
    );
  });

  const temFiltro = !!(statusFilter || filtroAtend || filtroDemandas || filtroFaltas || q.trim());
  function limparFiltros() {
    setStatusFilter("");
    setFiltroAtend("");
    setFiltroDemandas("");
    setFiltroFaltas("");
    setQ("");
  }

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
            onClick={limparFiltros}
          >
            <CardBody style={!temFiltro ? { boxShadow: "inset 0 0 0 2px var(--via-teal, #1D9E75)" } : undefined}>
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
            onClick={() => setFiltroAtend((v) => (v === "com" ? "" : "com"))}
          >
            <CardBody style={filtroAtend === "com" ? { boxShadow: "inset 0 0 0 2px #2563eb" } : undefined}>
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

        <PainelAtendimentos lista={atendimentosLista} periodo={periodo} loading={loading} />

        {/* Search */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF ou número da família..."
            className="w-full max-w-md h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
          />
          <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>
            Mostrando {filtered.length} de {items.length} famílias
          </span>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="h-8 px-3 rounded-lg text-xs font-medium border"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              Limpar filtros
            </button>
          )}
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
                  <th className="text-left px-4 py-3 font-medium align-top" style={{ color: "var(--shell-subtext)" }}>
                    <ColunaComSem titulo="Atendimentos" value={filtroAtend} onChange={setFiltroAtend} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium align-top" style={{ color: "var(--shell-subtext)" }}>
                    <ColunaComSem titulo="Demandas" value={filtroDemandas} onChange={setFiltroDemandas} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--shell-subtext)" }}>Status</th>
                  <th className="text-left px-4 py-3 font-medium align-top" style={{ color: "var(--shell-subtext)" }}>
                    <ColunaComSem titulo="Faltas" value={filtroFaltas} onChange={setFiltroFaltas} />
                  </th>
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
