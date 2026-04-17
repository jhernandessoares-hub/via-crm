"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
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

const FUNNEL_COLORS = ["#38BDF8","#818CF8","#F59E0B","#FB923C","#1D9E75","#A3E635"];
const ORIGIN_COLORS = ["#1D9E75","#2563EB","#7C3AED","#BE123C","#F59E0B","#38BDF8","#F87171","#A3E635"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Component ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const from = new Date(year, month, 1, 0, 0, 0).toISOString();
    const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    apiFetch(`/leads/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((d) => setData(d as DashData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    if (isCurrentMonth) return;
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const cards = data?.cards;
  const funnelMax = data ? Math.max(...data.funil.map((f) => f.count), 1) : 1;

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">

        {/* ── Seletor de período ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--shell-text)]">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="h-8 w-8 flex items-center justify-center rounded-lg border text-[var(--shell-subtext)] transition-colors hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--shell-card-border)" }}
            >‹</button>
            <span className="text-sm font-semibold text-[var(--shell-text)] min-w-[130px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className="h-8 w-8 flex items-center justify-center rounded-lg border text-[var(--shell-subtext)] transition-colors hover:bg-[var(--shell-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--shell-card-border)" }}
            >›</button>
          </div>
        </div>

        {/* ── Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Leads no período", value: loading ? "…" : cards?.totalPeriodo ?? 0, color: "var(--brand-accent)" },
            { label: "Leads ativos", value: loading ? "…" : cards?.ativos ?? 0, color: "#38BDF8" },
            { label: "Fechados", value: loading ? "…" : cards?.fechados ?? 0, color: "#1D9E75" },
            { label: "Perdidos", value: loading ? "…" : cards?.perdidos ?? 0, color: "#F87171" },
            { label: "Taxa de conversão", value: loading ? "…" : `${cards?.taxaConversao ?? 0}%`, color: "#818CF8" },
          ].map((c) => (
            <Card key={c.label}>
              <CardBody className="py-4">
                <p className="text-xs text-[var(--shell-subtext)]">{c.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* ── Funil + Origem ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Funil */}
          <Card>
            <CardHeader>
              <CardTitle>Funil de Vendas</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {loading ? (
                <div className="h-40 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
              ) : data?.funil.map((item, i) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--shell-subtext)]">{item.label}</span>
                    <span className="text-xs font-semibold text-[var(--shell-text)]">{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--shell-card-border)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${funnelMax > 0 ? Math.max((item.count / funnelMax) * 100, item.count > 0 ? 4 : 0) : 0}%`,
                        background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Origem */}
          <Card>
            <CardHeader>
              <CardTitle>Origem dos Leads</CardTitle>
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="h-40 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
              ) : !data?.origens.length ? (
                <div className="h-40 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.origens}
                      dataKey="count"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {data.origens.map((_, i) => (
                        <Cell key={i} fill={ORIGIN_COLORS[i % ORIGIN_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v} leads`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── Agenda + IA ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Próximos eventos */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Próximos eventos</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {loading ? (
                <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
              ) : !data?.agenda.length ? (
                <div className="text-sm text-[var(--shell-subtext)]">Nenhum evento agendado.</div>
              ) : data.agenda.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ background: "var(--brand-accent)" }}
                  >
                    {EVENT_LABEL[ev.eventType]?.[0] ?? "E"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--shell-text)] truncate">{ev.title}</p>
                    <p className="text-xs text-[var(--shell-subtext)]">
                      {EVENT_LABEL[ev.eventType]} · {formatDateTime(ev.startAt)}
                      {ev.leadNome && ` · ${ev.leadNome}`}
                    </p>
                  </div>
                  {ev.responsavel && (
                    <span className="text-xs text-[var(--shell-subtext)] shrink-0">{ev.responsavel}</span>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* IA */}
          <Card>
            <CardHeader>
              <CardTitle>Inteligência Artificial</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col items-center justify-center gap-4 py-6">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white"
                style={{ background: "var(--brand-accent)" }}
              >
                {loading ? "…" : data?.ia.execucoes ?? 0}
              </div>
              <p className="text-sm text-center text-[var(--shell-subtext)]">
                Conversas respondidas pela IA no período
              </p>
            </CardBody>
          </Card>
        </div>

        {/* ── Leads recentes ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Leads recentes no período</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-[var(--shell-subtext)]">Carregando...</div>
            ) : !data?.recentes.length ? (
              <div className="p-4 text-sm text-[var(--shell-subtext)]">Nenhum lead no período.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
                {data.recentes.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--shell-hover)]"
                  >
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
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ background: STATUS_COLOR[lead.status] ?? "#8DA1C9" }}
                    >
                      {STATUS_LABEL[lead.status] ?? lead.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

      </div>
    </AppShell>
  );
}
