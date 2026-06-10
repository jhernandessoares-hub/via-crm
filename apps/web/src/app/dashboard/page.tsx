"use client";

import { useEffect, useMemo, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { formatLeadNumber } from "@/lib/format-lead-number";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

type DashData = {
  cards: { totalPeriodo: number; ativos: number; fechados: number; perdidos: number; taxaConversao: number };
  funil: { key: string; label: string; count: number }[];
  origens: { nome: string; count: number }[];
  recentes: {
    id: string; nome: string; telefone: string | null; origem: string | null;
    status: string; stageName: string | null; stageGroup: string | null;
    responsavel: string | null; criadoEm: string;
  }[];
  ia: { execucoes: number };
  agenda: {
    id: string; title: string; startAt: string; eventType: string;
    status: string; leadNome: string | null; leadId: string | null; responsavel: string | null;
  }[];
};

type Bucket = { qtd: number; valor: number };
type Periodo = { numVendas: number; valorVendido: number; ticketMedio: number };
type Mensal = { mes: string; vendas: number; vgv: number };
type Corretor = { nome: string; vendas: number; vgv: number };
type EmpreendimentoBlock = {
  espelho: { total: number; disponivel: Bucket; proposta: Bucket; reservado: Bucket; vendido: Bucket; bloqueado: Bucket };
  carteira: { vso: number; vgvEstoque: number };
  periodo: Periodo;
  mensal: Mensal[];
  porEmpreendimento: { nome: string; totalUnidades: number; vendidas: number; vsoPct: number; vgvVendido: number; vgvDisponivel: number }[];
  porCorretor: Corretor[];
};
type AvulsoBlock = { periodo: Periodo; mensal: Mensal[]; porCorretor: Corretor[] };
type VendasReport = {
  developments: { id: string; nome: string }[];
  empreendimento: EmpreendimentoBlock | null;
  avulso: AvulsoBlock | null;
};
type UnidadeRow = {
  unitId: string | null; leadId: string | null;
  numero: number | null; reentradaCount: number | null; cpf: string | null;
  empreendimento: string; torreUnidade: string; comprador: string | null; valor: number;
  corretor: string | null; etapa: string | null; leadStatus: string | null; data: string | null;
};

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const STATUS_LABEL: Record<string, string> = {
  NOVO: "Novo", EM_CONTATO: "Em Contato", QUALIFICADO: "Qualificado",
  PROPOSTA: "Proposta", FECHADO: "Fechado", PERDIDO: "Perdido",
};
const STATUS_COLOR: Record<string, string> = {
  NOVO: "#8DA1C9", EM_CONTATO: "#38BDF8", QUALIFICADO: "#818CF8",
  PROPOSTA: "#F59E0B", FECHADO: "#1D9E75", PERDIDO: "#F87171",
};
const EVENT_LABEL: Record<string, string> = {
  VISITA: "Visita", TAREFA: "Tarefa", CAPTACAO: "Captação",
  REUNIAO: "Reunião", FOLLOW_UP: "Follow-up",
};
const FUNNEL_COLORS = ["#38BDF8","#818CF8","#F59E0B","#FB923C","#1D9E75"];
const ORIGIN_COLORS = ["#1D9E75","#2563EB","#7C3AED","#BE123C","#F59E0B","#38BDF8","#F87171","#A3E635"];

// Status do espelho (resumo gerencial). Total não abre drill-down.
// Cada status tem fundo colorido próprio (cor cheia + texto branco).
const ESPELHO_CARDS: { key: string; label: string; color: string; drill: boolean }[] = [
  { key: "TOTAL",      label: "Total",      color: "#475569", drill: false }, // slate
  { key: "DISPONIVEL", label: "Disponível", color: "#10B981", drill: true },  // emerald
  { key: "PROPOSTA",   label: "Proposta",   color: "#F59E0B", drill: true },  // amber
  { key: "RESERVADO",  label: "Reservado",  color: "#0EA5E9", drill: true },  // sky
  { key: "VENDIDO",    label: "Vendido",    color: "#2563EB", drill: true },  // blue
  { key: "BLOQUEADO",  label: "Bloqueado",  color: "#EF4444", drill: true },  // red
];
const DRILL_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível", PROPOSTA: "Proposta", RESERVADO: "Reservado",
  VENDIDO: "Vendido", BLOQUEADO: "Bloqueado",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function brl(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Funil visual
function FunnelChart({ data }: { data: { key: string; label: string; count: number }[] }) {
  const filtered = data;
  const total = filtered[0]?.count ?? 0;
  const max = Math.max(...filtered.map((d) => d.count), 1);

  return (
    <div className="w-full space-y-0">
      <div className="flex items-center justify-center mb-3">
        <span className="text-xs text-[var(--shell-subtext)] mr-1">Total de entradas:</span>
        <span className="text-sm font-bold text-[var(--shell-text)]">{total}</span>
      </div>
      {filtered.map((item, i) => {
        const barPct = Math.max((item.count / max) * 100, item.count > 0 ? 10 : 3);
        const totalPct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
        return (
          <div key={item.key}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--shell-subtext)] text-right shrink-0" style={{ width: 120 }}>
                {item.label}
              </span>
              <div className="flex-1 flex justify-center">
                <div className="h-8 rounded-sm flex items-center justify-center transition-all duration-500"
                  style={{ width: `${barPct}%`, background: color, minWidth: 32 }}>
                  <span className="text-[11px] font-bold text-white px-1">{item.count}</span>
                </div>
              </div>
              <span className="text-xs font-semibold shrink-0" style={{ width: 36, color, textAlign: "right" }}>
                {totalPct}%
              </span>
            </div>
            {i < filtered.length - 1 && (
              <div className="flex justify-center my-0.5">
                <div className="h-2 w-px" style={{ background: "var(--shell-card-border)" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão OPERACIONAL (dashboard de leads — conteúdo original)
// ─────────────────────────────────────────────────────────────────────────────
function OperacionalView({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/leads/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((d) => setData(d as DashData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [from, to]);

  const cards = data?.cards;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Leads no período", value: loading ? "…" : cards?.totalPeriodo ?? 0, color: "var(--brand-accent)" },
          { label: "Leads ativos",     value: loading ? "…" : cards?.ativos ?? 0,       color: "#38BDF8" },
          { label: "Fechados",         value: loading ? "…" : cards?.fechados ?? 0,     color: "#1D9E75" },
          { label: "Perdidos",         value: loading ? "…" : cards?.perdidos ?? 0,     color: "#F87171" },
          { label: "Taxa de conversão",value: loading ? "…" : `${cards?.taxaConversao ?? 0}%`, color: "#818CF8" },
        ].map((c) => (
          <Card key={c.label}>
            <CardBody className="py-4">
              <p className="text-xs text-[var(--shell-subtext)]">{c.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Funil de Vendas</CardTitle></CardHeader>
          <CardBody className="flex items-center justify-center py-4">
            {loading
              ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
              : <div className="w-full"><FunnelChart data={data?.funil ?? []} /></div>}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Próximos eventos</CardTitle></CardHeader>
          <CardBody className="space-y-2 p-3">
            {loading
              ? <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
              : !data?.agenda.length
              ? <div className="text-sm text-[var(--shell-subtext)]">Nenhum evento agendado.</div>
              : data.agenda.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                    style={{ background: "var(--brand-accent)" }}>
                    {EVENT_LABEL[ev.eventType]?.[0] ?? "E"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--shell-text)] truncate text-xs">{ev.title}</p>
                    <p className="text-[11px] text-[var(--shell-subtext)]">
                      {EVENT_LABEL[ev.eventType]} · {formatDateTime(ev.startAt)}
                    </p>
                    {ev.leadNome && <p className="text-[11px] text-[var(--shell-subtext)] truncate">{ev.leadNome}</p>}
                  </div>
                </div>
              ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Leads recentes no período</CardTitle></CardHeader>
          <CardBody className="p-0">
            {loading
              ? <div className="p-4 text-sm text-[var(--shell-subtext)]">Carregando...</div>
              : !data?.recentes.length
              ? <div className="p-4 text-sm text-[var(--shell-subtext)]">Nenhum lead no período.</div>
              : (
                <div className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
                  {data.recentes.map((lead) => (
                    <Link key={lead.id} href={`/leads/${lead.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--shell-hover)] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--shell-text)] truncate">{lead.nome}</p>
                        <p className="text-xs text-[var(--shell-subtext)] truncate">
                          {lead.origem || "Sem origem"} · {formatDate(lead.criadoEm)}
                          {lead.stageName && ` · ${lead.stageName}`}
                        </p>
                      </div>
                      {lead.responsavel && (
                        <span className="text-xs text-[var(--shell-subtext)] shrink-0">{lead.responsavel}</span>
                      )}
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: STATUS_COLOR[lead.status] ?? "#8DA1C9" }}>
                        {STATUS_LABEL[lead.status] ?? lead.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Origem dos Leads</CardTitle></CardHeader>
          <CardBody>
            {loading
              ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
              : !data?.origens.length
              ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Sem dados no período</div>
              : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={data.origens} dataKey="count" nameKey="nome" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                        {data.origens.map((_, i) => (<Cell key={i} fill={ORIGIN_COLORS[i % ORIGIN_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} leads`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {data.origens.slice(0, 5).map((o, i) => (
                      <div key={o.nome} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }} />
                        <span className="flex-1 truncate text-[var(--shell-subtext)]">{o.nome}</span>
                        <span className="font-semibold text-[var(--shell-text)]">{o.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down em tela cheia — lista de unidades de um status
// ─────────────────────────────────────────────────────────────────────────────
function DrillView({ status, source, dev, from, to, periodLabel, onBack }: {
  status: string; source: string | null; dev: string | null; from: string; to: string; periodLabel: string; onBack: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<UnidadeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isAvulso = source === "avulso";

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ status, from, to });
    if (source) qs.set("source", source);
    if (dev) qs.set("developmentId", dev);
    apiFetch(`/reports/vendas/unidades?${qs.toString()}`)
      .then((r) => setRows((r as UnidadeRow[]) || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [status, source, dev, from, to]);

  const isSold = status === "VENDIDO";
  const col1 = isAvulso ? "Imóvel" : "Empreendimento";
  const col2 = isAvulso ? "Produto" : "Unidade";

  function exportCsv() {
    const header = ["Nº Lead", "CPF", col1, col2, "Comprador", "Valor", "Etapa", "Status", "Corretor", ...(isSold ? ["Data"] : [])];
    const lines = rows.map((r) => [
      formatLeadNumber(r.numero, r.reentradaCount), r.cpf ?? "", r.empreendimento, r.torreUnidade,
      r.comprador ?? "", String(r.valor ?? 0), r.etapa ?? "", r.leadStatus ? (STATUS_LABEL[r.leadStatus] ?? r.leadStatus) : "",
      r.corretor ?? "", ...(isSold ? [r.data ? new Date(r.data).toLocaleDateString("pt-BR") : ""] : []),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas-${isAvulso ? "avulso-" : ""}${status.toLowerCase()}-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openLead(leadId: string | null) {
    if (!leadId) return;
    startTransition(() => router.push(`/leads/${leadId}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1 rounded-lg border px-3 h-9 text-sm font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors"
            style={{ borderColor: "var(--shell-card-border)" }}>
            ← Voltar
          </button>
          <h1 className="text-xl font-bold text-[var(--shell-text)]">
            {isAvulso ? "Vendas avulsas" : (DRILL_LABEL[status] ?? status)}
            <span className="ml-2 text-sm font-normal text-[var(--shell-subtext)]">
              {loading ? "…" : `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`}
            </span>
          </h1>
        </div>
        <button onClick={exportCsv} disabled={loading || rows.length === 0}
          className="rounded-lg px-4 h-9 text-sm font-medium text-white disabled:opacity-40 transition-colors"
          style={{ background: "var(--brand-accent)" }}>
          Extrair relatório (CSV)
        </button>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum registro neste status.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--shell-subtext)] border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                    <th className="px-3 py-2 font-medium">Nº</th>
                    <th className="px-3 py-2 font-medium">CPF</th>
                    <th className="px-3 py-2 font-medium">{col1}</th>
                    <th className="px-3 py-2 font-medium">{col2}</th>
                    <th className="px-3 py-2 font-medium">Comprador</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Etapa</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Corretor</th>
                    {isSold && <th className="px-3 py-2 font-medium">Data</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={(r.unitId ?? r.leadId ?? i) + "-" + i}
                      onClick={() => openLead(r.leadId)}
                      className={`border-b transition-colors ${r.leadId ? "cursor-pointer hover:bg-[var(--shell-hover)]" : ""}`}
                      style={{ borderColor: "var(--shell-card-border)" }}>
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--shell-subtext)]">{formatLeadNumber(r.numero, r.reentradaCount) || "—"}</td>
                      <td className="px-3 py-2.5 text-[var(--shell-subtext)]">{r.cpf || "—"}</td>
                      <td className="px-3 py-2.5 text-[var(--shell-text)]">{r.empreendimento}</td>
                      <td className="px-3 py-2.5 text-[var(--shell-text)]">{r.torreUnidade || "—"}</td>
                      <td className="px-3 py-2.5 text-[var(--shell-text)]">{r.comprador || <span className="text-[var(--shell-subtext)]">—</span>}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-[var(--shell-text)]">{brl(r.valor)}</td>
                      <td className="px-3 py-2.5 text-[var(--shell-subtext)]">{r.etapa || "—"}</td>
                      <td className="px-3 py-2.5">
                        {r.leadStatus ? (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                            style={{ background: STATUS_COLOR[r.leadStatus] ?? "#8DA1C9" }}>
                            {STATUS_LABEL[r.leadStatus] ?? r.leadStatus}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--shell-subtext)]">{r.corretor || "—"}</td>
                      {isSold && <td className="px-3 py-2.5 text-[var(--shell-subtext)]">{r.data ? new Date(r.data).toLocaleDateString("pt-BR") : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// Subcomponentes reutilizados pelas seções Gestão e Avulso
function MensalChart({ data }: { data: Mensal[] }) {
  if (!data.length) return <div className="h-56 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Sem vendas no período</div>;
  return (
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-card-border)" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--shell-subtext)" }}
          tickFormatter={(m: string) => { const [y, mo] = m.split("-"); return `${mo}/${y.slice(2)}`; }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--shell-subtext)" }}
          tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
        <Tooltip formatter={(v: any, name: any) => name === "vgv" ? [brl(Number(v)), "VGV"] : [v, "Vendas"]}
          labelFormatter={(m: any) => { const [y, mo] = String(m).split("-"); return `${MONTHS[Number(mo) - 1]} ${y}`; }} />
        <Bar dataKey="vgv" fill="#2563EB" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CorretorRanking({ data }: { data: Corretor[] }) {
  if (!data.length) return <div className="text-sm text-[var(--shell-subtext)]">Sem vendas no período</div>;
  const max = Math.max(...data.map((c) => c.vgv), 1);
  return (
    <div className="space-y-2">
      {data.map((c) => (
        <div key={c.nome}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[var(--shell-text)] truncate font-medium">{c.nome}</span>
            <span className="text-[var(--shell-subtext)] shrink-0 ml-2">{c.vendas} · {brl(c.vgv)}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--shell-bg)" }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max((c.vgv / max) * 100, 4)}%`, background: "#2563EB" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FinanceCard({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-xs text-[var(--shell-subtext)]">{label}</p>
        <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão GERENCIAL (vendas / espelho consolidado)
// ─────────────────────────────────────────────────────────────────────────────
function GerencialView({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [rep, setRep] = useState<VendasReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDev, setSelectedDev] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (selectedDev !== "all") qs.set("developmentId", selectedDev);
    apiFetch(`/reports/vendas?${qs.toString()}`)
      .then((r) => setRep(r as VendasReport))
      .catch(() => setRep(null))
      .finally(() => setLoading(false));
  }, [from, to, selectedDev]);

  function openDrill(status: string, source: "empreendimento" | "avulso") {
    const qs = new URLSearchParams({ drill: status, src: source });
    if (source === "empreendimento" && selectedDev !== "all") qs.set("dev", selectedDev);
    startTransition(() => router.push(`/dashboard?${qs.toString()}`));
  }

  const emp = rep?.empreendimento;
  const avu = rep?.avulso;
  const devs = rep?.developments ?? [];
  const showDevSelector = devs.length >= 2;
  const showEmpTable = emp && selectedDev === "all" && (emp.porEmpreendimento.length > 1);

  const bucketFor = (key: string): Bucket | null => {
    if (!emp) return null;
    switch (key) {
      case "DISPONIVEL": return emp.espelho.disponivel;
      case "PROPOSTA": return emp.espelho.proposta;
      case "RESERVADO": return emp.espelho.reservado;
      case "VENDIDO": return emp.espelho.vendido;
      case "BLOQUEADO": return emp.espelho.bloqueado;
      default: return null;
    }
  };

  if (loading && !rep) {
    return <div className="py-16 text-center text-sm text-[var(--shell-subtext)]">Carregando...</div>;
  }

  if (!emp && !avu) {
    return (
      <Card>
        <CardBody className="py-16 text-center">
          <p className="text-sm text-[var(--shell-subtext)]">Nenhuma venda registrada ainda.</p>
          <p className="text-xs text-[var(--shell-subtext)] mt-1">
            Cadastre um empreendimento em Gestão ou registre a venda de um imóvel avulso para ver os números aqui.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Seção GESTÃO (empreendimentos) ── */}
      {emp && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full" style={{ background: "#2563EB" }} />
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--shell-text)]">Gestão — Empreendimentos</h2>
            </div>
            {showDevSelector && (
              <select value={selectedDev} onChange={(e) => setSelectedDev(e.target.value)}
                className="rounded-lg border px-3 h-8 text-xs font-medium text-[var(--shell-text)]"
                style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-input-bg)" }}>
                <option value="all">Todos os empreendimentos</option>
                {devs.map((d) => (<option key={d.id} value={d.id}>{d.nome}</option>))}
              </select>
            )}
          </div>

          {/* Cards financeiros */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <FinanceCard label="Valor vendido" value={brl(emp.periodo.valorVendido)} color="#2563EB" />
            <FinanceCard label="Nº de vendas" value={emp.periodo.numVendas} color="#1D9E75" />
            <FinanceCard label="Ticket médio" value={brl(emp.periodo.ticketMedio)} color="#818CF8" />
            <FinanceCard label="VSO da carteira" value={`${emp.carteira.vso}%`} color="#F59E0B" />
            <FinanceCard label="VGV em estoque" value={brl(emp.carteira.vgvEstoque)} color="#38BDF8" />
          </div>

          {/* Espelho consolidado (clicável) */}
          <div>
            <p className="text-xs text-[var(--shell-subtext)] mb-2">
              Espelho · <span className="text-[var(--shell-text)] font-medium">Vendido</span> no período · demais status = carteira atual. Clique para ver as unidades.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {ESPELHO_CARDS.map((s) => {
                const isTotal = s.key === "TOTAL";
                const bucket = bucketFor(s.key);
                const qtd = isTotal ? emp.espelho.total : (bucket?.qtd ?? 0);
                const valor = isTotal ? null : (bucket?.valor ?? 0);
                const clickable = s.drill;
                return (
                  <div key={s.key}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => openDrill(s.key, "empreendimento") : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter") openDrill(s.key, "empreendimento"); } : undefined}
                    className={`rounded-xl p-3 text-white shadow-sm transition-all ${clickable ? "cursor-pointer hover:brightness-110 hover:shadow-lg hover:-translate-y-0.5" : ""}`}
                    style={{ background: s.color }}>
                    <span className="text-xs font-medium text-white/85">{s.label}</span>
                    <p className="text-3xl font-extrabold mt-1 leading-none">{qtd}</p>
                    {valor != null && <p className="text-[11px] text-white/85 mt-1">{brl(valor)}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evolução mensal + Ranking por corretor */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Evolução de vendas (VGV)</CardTitle></CardHeader>
              <CardBody><MensalChart data={emp.mensal} /></CardBody>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Ranking por corretor</CardTitle></CardHeader>
              <CardBody><CorretorRanking data={emp.porCorretor} /></CardBody>
            </Card>
          </div>

          {/* Tabela por empreendimento (só quando "Todos" e há mais de um) */}
          {showEmpTable && (
            <Card>
              <CardHeader><CardTitle>Por empreendimento</CardTitle></CardHeader>
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--shell-subtext)] border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                        <th className="px-4 py-2 font-medium">Empreendimento</th>
                        <th className="px-4 py-2 font-medium text-right">Unidades</th>
                        <th className="px-4 py-2 font-medium text-right">Vendidas</th>
                        <th className="px-4 py-2 font-medium text-right">VSO</th>
                        <th className="px-4 py-2 font-medium text-right">VGV vendido</th>
                        <th className="px-4 py-2 font-medium text-right">VGV disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.porEmpreendimento.map((d) => (
                        <tr key={d.nome} className="border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                          <td className="px-4 py-2.5 text-[var(--shell-text)]">{d.nome}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--shell-text)]">{d.totalUnidades}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--shell-text)]">{d.vendidas}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--shell-subtext)]">{d.vsoPct}%</td>
                          <td className="px-4 py-2.5 text-right font-medium text-[var(--shell-text)]">{brl(d.vgvVendido)}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--shell-subtext)]">{brl(d.vgvDisponivel)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
        </section>
      )}

      {/* ── Seção AVULSO (produtos) ── */}
      {avu && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-1 rounded-full" style={{ background: "#1D9E75" }} />
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--shell-text)]">Imóveis avulsos — Produtos</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div
              role="button" tabIndex={0}
              onClick={() => openDrill("VENDIDO", "avulso")}
              onKeyDown={(e) => { if (e.key === "Enter") openDrill("VENDIDO", "avulso"); }}
              className="rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-card-bg)" }}>
              <p className="text-xs text-[var(--shell-subtext)]">Valor vendido (clique para a lista)</p>
              <p className="text-xl font-bold mt-1" style={{ color: "#2563EB" }}>{brl(avu.periodo.valorVendido)}</p>
            </div>
            <FinanceCard label="Nº de vendas" value={avu.periodo.numVendas} color="#1D9E75" />
            <FinanceCard label="Ticket médio" value={brl(avu.periodo.ticketMedio)} color="#818CF8" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Evolução de vendas avulsas (VGV)</CardTitle></CardHeader>
              <CardBody><MensalChart data={avu.mensal} /></CardBody>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Ranking por corretor</CardTitle></CardHeader>
              <CardBody><CorretorRanking data={avu.porCorretor} /></CardBody>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const now = new Date();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, userRole } = usePermissions();
  const canGerencial = userRole === "OWNER" || can("relatorios", "view");

  const [mode, setMode] = useState<"geral" | "mes" | "ano" | "custom">("geral");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(toDateInput(now));
  const [tab, setTab] = useState<"gerencial" | "operacional">("operacional");

  // Aba persistida; default = Gerencial para quem tem permissão.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("dashboard_tab") : null;
    if (saved === "gerencial" || saved === "operacional") setTab(saved);
    else setTab(canGerencial ? "gerencial" : "operacional");
  }, [canGerencial]);

  function selectTab(t: "gerencial" | "operacional") {
    setTab(t);
    try { localStorage.setItem("dashboard_tab", t); } catch {}
  }

  const { fromISO, toISO } = useMemo(() => {
    if (mode === "geral") {
      // Sem recorte de data — abrange tudo.
      return {
        fromISO: new Date(Date.UTC(1970, 0, 1)).toISOString(),
        toISO: new Date(Date.UTC(2999, 11, 31, 23, 59, 59)).toISOString(),
      };
    }
    if (mode === "ano") {
      // Últimos 12 meses.
      return {
        fromISO: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0).toISOString(),
        toISO: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString(),
      };
    }
    if (mode === "mes") {
      return {
        fromISO: new Date(year, month, 1, 0, 0, 0).toISOString(),
        toISO: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      };
    }
    return {
      fromISO: new Date(customFrom + "T00:00:00").toISOString(),
      toISO: new Date(customTo + "T23:59:59").toISOString(),
    };
  }, [mode, year, month, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (mode === "geral") return "geral";
    if (mode === "ano") return "ultimo-ano";
    return `${fromISO.slice(0, 10)}_a_${toISO.slice(0, 10)}`;
  }, [mode, fromISO, toISO]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (year === now.getFullYear() && month === now.getMonth()) return;
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const effectiveTab = canGerencial ? tab : "operacional";
  const drillStatus = searchParams.get("drill");
  const drillSrc = searchParams.get("src");
  const drillDev = searchParams.get("dev");
  const drillActive = canGerencial && effectiveTab === "gerencial" && !!drillStatus;

  const inputStyle: React.CSSProperties = {
    background: "var(--shell-input-bg)",
    border: "1px solid var(--shell-card-border)",
    color: "var(--shell-text)",
    borderRadius: "8px",
    padding: "0 10px",
    height: "32px",
    fontSize: "13px",
    outline: "none",
  };

  // Drill-down ocupa a tela inteira (sem seletor de período/abas).
  if (drillActive && drillStatus) {
    return (
      <AppShell title="Dashboard">
        <DrillView
          status={drillStatus.toUpperCase()}
          source={drillSrc}
          dev={drillDev}
          from={fromISO}
          to={toISO}
          periodLabel={periodLabel}
          onBack={() => startTransition(() => router.push("/dashboard"))}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">

        {/* Cabeçalho: título + abas + seletor de período */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--shell-text)]">Dashboard</h1>
            {canGerencial && (
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--shell-card-border)" }}>
                {(["gerencial", "operacional"] as const).map((t) => (
                  <button key={t} onClick={() => selectTab(t)}
                    className="px-3 h-8 text-xs font-medium transition-colors"
                    style={{
                      background: effectiveTab === t ? "var(--brand-accent)" : "var(--shell-input-bg)",
                      color: effectiveTab === t ? "#fff" : "var(--shell-subtext)",
                    }}>
                    {t === "gerencial" ? "Gerencial" : "Operacional"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--shell-card-border)" }}>
              {([
                ["geral", "Geral"],
                ["mes", "Mês atual"],
                ["ano", "Último ano"],
                ["custom", "Personalizado"],
              ] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 h-8 text-xs font-medium transition-colors"
                  style={{
                    background: mode === m ? "var(--brand-accent)" : "var(--shell-input-bg)",
                    color: mode === m ? "#fff" : "var(--shell-subtext)",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {mode === "mes" ? (
              <>
                <button onClick={prevMonth}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors"
                  style={{ borderColor: "var(--shell-card-border)" }}>‹</button>
                <span className="text-sm font-semibold text-[var(--shell-text)] min-w-[130px] text-center">
                  {MONTHS[month]} {year}
                </span>
                <button onClick={nextMonth} disabled={isCurrentMonth}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: "var(--shell-card-border)" }}>›</button>
              </>
            ) : mode === "custom" ? (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)} style={inputStyle} />
                <span className="text-xs text-[var(--shell-subtext)]">até</span>
                <input type="date" value={customTo} min={customFrom} max={toDateInput(now)}
                  onChange={(e) => setCustomTo(e.target.value)} style={inputStyle} />
              </div>
            ) : mode === "ano" ? (
              <span className="text-sm font-semibold text-[var(--shell-text)]">Últimos 12 meses</span>
            ) : (
              <span className="text-sm font-semibold text-[var(--shell-text)]">Todo o período</span>
            )}
          </div>
        </div>

        {effectiveTab === "gerencial"
          ? <GerencialView from={fromISO} to={toISO} />
          : <OperacionalView from={fromISO} to={toISO} />}

      </div>
    </AppShell>
  );
}
