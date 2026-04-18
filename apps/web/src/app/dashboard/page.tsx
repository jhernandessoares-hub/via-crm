"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

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

// Etapas do funil sem Pós-venda
const FUNIL_KEYS = ["PRE_ATENDIMENTO","AGENDAMENTO","NEGOCIACOES","CREDITO_IMOBILIARIO","NEGOCIO_FECHADO"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Funil visual
function FunnelChart({ data }: { data: { key: string; label: string; count: number }[] }) {
  const filtered = data.filter((d) => FUNIL_KEYS.includes(d.key));
  const total = filtered[0]?.count ?? 0; // topo = entrada total
  const max = Math.max(...filtered.map((d) => d.count), 1);

  return (
    <div className="w-full space-y-0">
      {/* Total de entrada */}
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
            {/* Linha da etapa */}
            <div className="flex items-center gap-2">
              {/* Label à esquerda — largura fixa para não truncar */}
              <span className="text-xs text-[var(--shell-subtext)] text-right shrink-0" style={{ width: 120 }}>
                {item.label}
              </span>

              {/* Barra centrada */}
              <div className="flex-1 flex justify-center">
                <div
                  className="h-8 rounded-sm flex items-center justify-center transition-all duration-500"
                  style={{ width: `${barPct}%`, background: color, minWidth: 32 }}
                >
                  <span className="text-[11px] font-bold text-white px-1">{item.count}</span>
                </div>
              </div>

              {/* Percentual do total à direita */}
              <span className="text-xs font-semibold shrink-0" style={{ width: 36, color, textAlign: "right" }}>
                {totalPct}%
              </span>
            </div>

            {/* Separador entre etapas */}
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

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const now = new Date();
  const [mode, setMode] = useState<"mes" | "custom">("mes");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(toDateInput(now));
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let from: string, to: string;
    if (mode === "mes") {
      from = new Date(year, month, 1, 0, 0, 0).toISOString();
      to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    } else {
      from = new Date(customFrom + "T00:00:00").toISOString();
      to = new Date(customTo + "T23:59:59").toISOString();
    }
    apiFetch(`/leads/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((d) => setData(d as DashData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, month, mode, customFrom, customTo]);

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
  const cards = data?.cards;

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

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">

        {/* ── Seletor de período ─────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-[var(--shell-text)]">Dashboard</h1>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle modo */}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--shell-card-border)" }}>
              {(["mes", "custom"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 h-8 text-xs font-medium transition-colors"
                  style={{
                    background: mode === m ? "var(--brand-accent)" : "var(--shell-input-bg)",
                    color: mode === m ? "#fff" : "var(--shell-subtext)",
                  }}>
                  {m === "mes" ? "Mês" : "Personalizado"}
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
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={inputStyle} />
                <span className="text-xs text-[var(--shell-subtext)]">até</span>
                <input type="date" value={customTo} min={customFrom} max={toDateInput(now)}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={inputStyle} />
              </div>
            )}
          </div>
        </div>

        {/* ── Cards ──────────────────────────────────────────────────── */}
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

        {/* ── Linha 2: Funil | Próximos eventos ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Funil de Vendas — 3/5 */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Funil de Vendas</CardTitle>
            </CardHeader>
            <CardBody className="flex items-center justify-center py-4">
              {loading
                ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
                : <div className="w-full"><FunnelChart data={data?.funil ?? []} /></div>
              }
            </CardBody>
          </Card>

          {/* Próximos eventos — 2/5 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Próximos eventos</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 p-3">
              {loading
                ? <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
                : !data?.agenda.length
                ? <div className="text-sm text-[var(--shell-subtext)]">Nenhum evento agendado.</div>
                : data.agenda.map((ev) => (
                  <div key={ev.id}
                    className="flex items-start gap-2 rounded-lg border p-2.5 text-sm"
                    style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                  >
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
                ))
              }
            </CardBody>
          </Card>
        </div>

        {/* ── Linha 3: Leads recentes | Origem dos Leads ────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Leads recentes — 3/5 */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Leads recentes no período</CardTitle>
            </CardHeader>
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
                )
              }
            </CardBody>
          </Card>

          {/* Origem dos Leads — 2/5 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Origem dos Leads</CardTitle>
            </CardHeader>
            <CardBody>
              {loading
                ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
                : !data?.origens.length
                ? <div className="h-48 flex items-center justify-center text-sm text-[var(--shell-subtext)]">Sem dados no período</div>
                : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data.origens} dataKey="count" nameKey="nome"
                          cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                          {data.origens.map((_, i) => (
                            <Cell key={i} fill={ORIGIN_COLORS[i % ORIGIN_COLORS.length]} />
                          ))}
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
                )
              }
            </CardBody>
          </Card>
        </div>

      </div>
    </AppShell>
  );
}
