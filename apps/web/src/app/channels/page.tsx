"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/* ─── Types ─────────────────────────────────────────────────────────── */

type Channel = {
  type: string;
  name: string;
  description: string;
  id: string | null;
  active: boolean;
  webhookToken: string | null;
  config: Record<string, string> | null;
  monthlyBudget: number | null;
  leadsCount: number;
  lastLeadAt: string | null;
  configured: boolean;
};

type ChannelStat = {
  type: string;
  name: string;
  origem: string;
  configured: boolean;
  active: boolean;
  budget: number | null;
  hoje: number;
  semana: number;
  mes: number;
  total: number;
  fechados: number;
  cpl: number | null;
  convRate: number;
};

type Stats = {
  geral: {
    hoje: number;
    semana: number;
    mes: number;
    total: number;
    fechados: number;
    convRate: number;
    totalBudget: number;
    cpl: number | null;
  };
  canais: ChannelStat[];
  semOrigem: number;
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

const CHANNEL_ICONS: Record<string, string> = {
  META_ADS: "📘",
  GOOGLE_ADS: "🔵",
  YOUTUBE: "▶️",
  TIKTOK_ADS: "🎵",
  PORTAL_ZAP: "🏠",
  PORTAL_VIVAREAL: "🏡",
  PORTAL_OLX: "🟠",
  PORTAL_IMOVELWEB: "🏘️",
  LANDING_PAGE: "🖥️",
  FORMULARIO_INTERNO: "📋",
  SITE: "🌐",
  WHATSAPP: "💬",
};

const CONFIG_FIELDS: Record<string, { key: string; label: string; type: string; hint?: string }[]> = {
  META_ADS: [
    { key: "accessToken", label: "Page Access Token", type: "password", hint: "Token de acesso da Página do Facebook" },
    { key: "verifyToken", label: "Verify Token", type: "text", hint: "Token para verificação do webhook" },
    { key: "adAccountId", label: "Ad Account ID", type: "text", hint: "ID da conta de anúncios (sem act_)" },
  ],
  GOOGLE_ADS: [
    { key: "googleKey", label: "Google Key", type: "text", hint: "Chave enviada pelo Google para verificação" },
  ],
  YOUTUBE: [
    { key: "googleKey", label: "Google Key", type: "text", hint: "Chave enviada pelo Google para verificação" },
  ],
  TIKTOK_ADS: [
    { key: "appSecret", label: "App Secret", type: "password", hint: "Segredo do app TikTok para validar assinaturas" },
  ],
  PORTAL_ZAP: [],
  PORTAL_VIVAREAL: [],
  PORTAL_OLX: [
    { key: "token", label: "Token OLX", type: "password", hint: "Token de autenticação do OLX Pro" },
  ],
  PORTAL_IMOVELWEB: [],
  LANDING_PAGE: [
    { key: "formTitle", label: "Título do Formulário", type: "text", hint: "Ex: Solicite uma visita" },
    { key: "formSubtitle", label: "Subtítulo", type: "text", hint: "Texto abaixo do título" },
    { key: "primaryColor", label: "Cor principal (hex)", type: "text", hint: "#0f172a" },
    { key: "thankYouMessage", label: "Mensagem de obrigado", type: "text", hint: "Exibida após envio" },
  ],
  FORMULARIO_INTERNO: [
    { key: "formTitle", label: "Título do Formulário", type: "text", hint: "Ex: Cadastre seu interesse" },
    { key: "formSubtitle", label: "Subtítulo", type: "text" },
    { key: "primaryColor", label: "Cor principal (hex)", type: "text", hint: "#0f172a" },
  ],
  SITE: [],
  WHATSAPP: [],
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ─── Mini bar chart ─────────────────────────────────────────────────── */

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d) => (
        <div key={d.label} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-[10px] text-[var(--shell-subtext)] font-medium">{fmt(d.value)}</span>
          <div
            className="w-full rounded-t"
            style={{ height: `${(d.value / max) * 64}px`, backgroundColor: d.color, minHeight: d.value > 0 ? 4 : 0 }}
          />
          <span className="text-[10px] text-[var(--shell-subtext)] truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4" style={{ borderColor: "var(--shell-card-border)" }}>
      <p className="text-xs text-[var(--shell-subtext)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--shell-text)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--shell-subtext)]">{sub}</p>}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function ChannelsPage() {
  const [tab, setTab] = useState<"dashboard" | "canais">("dashboard");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Channel | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [fetchingCost, setFetchingCost] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [ch, st] = await Promise.all([
        apiFetch("/channels"),
        apiFetch("/channels/stats"),
      ]);
      setChannels(Array.isArray(ch) ? ch : []);
      setStats(st);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }

  function openModal(ch: Channel) {
    setModal(ch);
    setConfigValues(ch.config || {});
    setBudget(ch.monthlyBudget != null ? String(ch.monthlyBudget) : "");
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    try {
      await apiFetch(`/channels/${modal.type}`, {
        method: "PUT",
        body: JSON.stringify({
          active: true,
          config: Object.keys(configValues).length > 0 ? configValues : null,
          monthlyBudget: budget !== "" ? parseFloat(budget) : null,
        }),
      });
      setModal(null);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(ch: Channel) {
    try {
      if (!ch.configured) { openModal(ch); return; }
      await apiFetch(`/channels/${ch.type}`, {
        method: "PUT",
        body: JSON.stringify({ active: !ch.active }),
      });
      await load();
    } catch {}
  }

  async function remove(ch: Channel) {
    if (!confirm(`Desconectar ${ch.name}?`)) return;
    try {
      await apiFetch(`/channels/${ch.type}`, { method: "DELETE" });
      await load();
    } catch {}
  }

  async function fetchCost(type: string) {
    setFetchingCost(type);
    try {
      const data = await apiFetch(`/channels/${type}/fetch-cost`, { method: "POST" });
      if (data.cost != null) {
        alert(`Custo atualizado: ${fmtBrl(data.cost)}`);
        await load();
      } else {
        alert("Não foi possível obter o custo automaticamente. Configure o Ad Account ID e o Access Token.");
      }
    } catch {
      alert("Erro ao buscar custo.");
    } finally {
      setFetchingCost(null);
    }
  }

  function copyWebhook(ch: Channel) {
    if (!ch.webhookToken) return;
    const url = `${API_BASE}/webhooks/channel/${ch.webhookToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(ch.type + "_wh");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function copyFormLink(ch: Channel) {
    if (!ch.webhookToken) return;
    const url = `${window.location.origin}/lp/${ch.webhookToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(ch.type + "_lp");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const canAutoFetch = (type: string) => ["META_ADS", "GOOGLE_ADS", "YOUTUBE"].includes(type);

  /* ── Dashboard ── */
  const renderDashboard = () => {
    if (!stats) return <p className="text-sm text-[var(--shell-subtext)] text-center py-12">Carregando...</p>;
    const { geral, canais, semOrigem } = stats;

    const chartData = canais
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((c, i) => ({
        label: c.name,
        value: c.total,
        color: ["#0f172a","#1d4ed8","#7c3aed","#db2777","#ea580c","#16a34a","#0891b2","#ca8a04"][i % 8],
      }));

    return (
      <div className="space-y-6">
        {/* KPIs gerais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Leads hoje" value={fmt(geral.hoje)} />
          <KpiCard label="Leads este mês" value={fmt(geral.mes)} />
          <KpiCard label="Total de leads" value={fmt(geral.total)} />
          <KpiCard label="Negócios fechados" value={fmt(geral.fechados)} sub={`${geral.convRate.toFixed(1)}% conversão`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Investimento/mês" value={fmtBrl(geral.totalBudget)} />
          <KpiCard
            label="CPL geral"
            value={geral.cpl != null ? fmtBrl(geral.cpl) : "—"}
            sub="custo por lead"
          />
          <KpiCard label="Leads sem origem" value={fmt(semOrigem)} />
          <KpiCard label="Canais ativos" value={String(canais.filter((c) => c.active).length)} />
        </div>

        {/* Gráfico */}
        {chartData.length > 0 && (
          <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4" style={{ borderColor: "var(--shell-card-border)" }}>
            <p className="text-sm font-medium text-[var(--shell-subtext)] mb-4">Leads por canal (total)</p>
            <BarChart data={chartData} />
          </div>
        )}

        {/* Tabela por canal */}
        <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden" style={{ borderColor: "var(--shell-card-border)" }}>
          <table className="w-full text-xs">
            <thead className="bg-[var(--shell-bg)] border-b" style={{ borderColor: "var(--shell-card-border)" }}>
              <tr>
                <th className="text-left px-4 py-3 text-[var(--shell-subtext)] font-medium">Canal</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Hoje</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Semana</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Mês</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Total</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Invest./mês</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">CPL</th>
                <th className="text-right px-4 py-3 text-[var(--shell-subtext)] font-medium">Conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
              {canais.map((c) => (
                <tr key={c.type} className="hover:bg-[var(--shell-hover)]">
                  <td className="px-4 py-3 font-medium text-[var(--shell-text)] flex items-center gap-2">
                    <span>{CHANNEL_ICONS[c.type] || "📡"}</span>
                    {c.name}
                    {!c.active && <span className="text-[var(--shell-subtext)] font-normal">(inativo)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">{c.hoje}</td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">{c.semana}</td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">{c.mes}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--shell-text)]">{c.total}</td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">
                    {c.budget != null ? fmtBrl(c.budget) : <span className="text-[var(--shell-subtext)] opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">
                    {c.cpl != null ? fmtBrl(c.cpl) : <span className="text-[var(--shell-subtext)] opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--shell-subtext)]">{c.convRate.toFixed(1)}%</td>
                </tr>
              ))}
              {canais.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-[var(--shell-subtext)]">
                    Nenhum canal com dados ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /* ── Canais grid ── */
  const renderCanais = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {channels.map((ch) => (
        <div
          key={ch.type}
          className={`rounded-xl border bg-[var(--shell-card-bg)] p-4 flex flex-col gap-3 ${
            ch.active ? "" : "opacity-70"
          }`}
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{CHANNEL_ICONS[ch.type] || "📡"}</span>
              <div>
                <p className="text-sm font-semibold text-[var(--shell-text)]">{ch.name}</p>
                <p className="text-xs text-[var(--shell-subtext)]">{ch.description}</p>
              </div>
            </div>
            <button
              onClick={() => toggleActive(ch)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                ch.active ? "bg-slate-900" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${
                  ch.active ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Stats */}
          {ch.configured && (
            <div className="flex gap-4 text-xs text-[var(--shell-subtext)]">
              <span>{ch.leadsCount} leads</span>
              {ch.monthlyBudget != null && (
                <span>Invest: {fmtBrl(ch.monthlyBudget)}</span>
              )}
              {ch.lastLeadAt && <span>Último: {fmtDate(ch.lastLeadAt)}</span>}
            </div>
          )}

          {/* Webhook URL */}
          {ch.configured && ch.webhookToken && !["LANDING_PAGE", "FORMULARIO_INTERNO"].includes(ch.type) && (
            <button
              onClick={() => copyWebhook(ch)}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] text-left"
              style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
            >
              <span className="flex-1 font-mono truncate text-[10px]">
                {API_BASE}/webhooks/channel/{ch.webhookToken.slice(0, 10)}...
              </span>
              <span className="shrink-0">{copied === ch.type + "_wh" ? "✅" : "📋"}</span>
            </button>
          )}

          {/* Landing Page link */}
          {ch.configured && ch.webhookToken && ["LANDING_PAGE", "FORMULARIO_INTERNO"].includes(ch.type) && (
            <button
              onClick={() => copyFormLink(ch)}
              className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100 text-left"
            >
              <span className="flex-1 truncate text-[10px]">
                /lp/{ch.webhookToken.slice(0, 10)}...
              </span>
              <span className="shrink-0">{copied === ch.type + "_lp" ? "✅" : "🔗 Copiar link"}</span>
            </button>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => openModal(ch)}
              className="flex-1 rounded-md border px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
              style={{ borderColor: "var(--shell-card-border)" }}
            >
              {ch.configured ? "Configurar" : "Conectar"}
            </button>
            {ch.configured && canAutoFetch(ch.type) && (
              <button
                onClick={() => fetchCost(ch.type)}
                disabled={fetchingCost === ch.type}
                className="rounded-md border px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] disabled:opacity-50"
                style={{ borderColor: "var(--shell-card-border)" }}
                title="Buscar custo automaticamente"
              >
                {fetchingCost === ch.type ? "..." : "💰"}
              </button>
            )}
            {ch.configured && (
              <button
                onClick={() => remove(ch)}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
              >
                Remover
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <AppShell title="Canais">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--shell-card-border)" }}>
        {(["dashboard", "canais"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
            }`}
          >
            {t === "dashboard" ? "Dashboard" : "Canais"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--shell-subtext)] text-center py-12">Carregando...</p>
      ) : tab === "dashboard" ? (
        renderDashboard()
      ) : (
        renderCanais()
      )}

      {/* Modal configuração */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="w-full max-w-md rounded-xl shadow-xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--shell-card-bg)" }}>
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{CHANNEL_ICONS[modal.type] || "📡"}</span>
                <h2 className="text-base font-semibold text-[var(--shell-text)]">{modal.name}</h2>
              </div>
              <button onClick={() => setModal(null)} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl">×</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Webhook URL */}
              {modal.webhookToken && !["LANDING_PAGE", "FORMULARIO_INTERNO"].includes(modal.type) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">URL do Webhook</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${API_BASE}/webhooks/channel/${modal.webhookToken}`}
                      className="flex-1 rounded-md border px-3 py-2 text-xs font-mono outline-none text-[var(--shell-subtext)]"
                      style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    />
                    <button
                      onClick={() => copyWebhook(modal)}
                      className="rounded-md border px-3 py-2 text-xs hover:bg-[var(--shell-hover)]"
                      style={{ borderColor: "var(--shell-card-border)" }}
                    >
                      {copied === modal.type + "_wh" ? "✅" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--shell-subtext)]">Cole esta URL no painel do canal.</p>
                </div>
              )}

              {/* Landing page link */}
              {modal.webhookToken && ["LANDING_PAGE", "FORMULARIO_INTERNO"].includes(modal.type) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Link público do formulário</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/lp/${modal.webhookToken}`}
                      className="flex-1 rounded-md border px-3 py-2 text-xs font-mono outline-none"
                      style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    />
                    <button
                      onClick={() => copyFormLink(modal)}
                      className="rounded-md border px-3 py-2 text-xs hover:bg-[var(--shell-hover)]"
                      style={{ borderColor: "var(--shell-card-border)" }}
                    >
                      {copied === modal.type + "_lp" ? "✅" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--shell-subtext)]">Compartilhe este link. Não requer login.</p>
                </div>
              )}

              {/* Config fields */}
              {(CONFIG_FIELDS[modal.type] || []).map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">{field.label}</label>
                  <input
                    type={field.type}
                    value={configValues[field.key] || ""}
                    onChange={(e) => setConfigValues((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    placeholder={field.hint}
                  />
                  {field.hint && <p className="mt-1 text-[11px] text-[var(--shell-subtext)]">{field.hint}</p>}
                </div>
              ))}

              {/* Orçamento mensal */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">
                  Investimento mensal (R$)
                  {canAutoFetch(modal.type) && (
                    <span className="ml-2 text-blue-500">— ou busque automaticamente após salvar</span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  placeholder="0,00"
                />
              </div>

              {(CONFIG_FIELDS[modal.type] || []).length === 0 && !modal.webhookToken && (
                <p className="text-sm text-[var(--shell-subtext)]">
                  Este canal não requer configuração extra. Após conectar, copie a URL do webhook e cole no portal.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <button onClick={() => setModal(null)} className="rounded-md border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]" style={{ borderColor: "var(--shell-card-border)" }}>
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Salvando..." : modal.configured ? "Salvar" : "Conectar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
