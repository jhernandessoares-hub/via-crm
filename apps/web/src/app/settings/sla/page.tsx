"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Mode = "AUTOPILOT" | "COPILOT";

type ChannelCfg = {
  enabled: boolean;
  mode: Mode;
  respeitarHorario: boolean;
  tentativasHoras: number[];
  encerrarAoFim24h?: boolean;
  maxTentativas?: number;
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`}
    >
      <div className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// Converte horas → {valor, unidade} para exibição amigável (dias quando múltiplo de 24).
function fromHours(h: number): { valor: number; unidade: "horas" | "dias" } {
  if (h >= 24 && h % 24 === 0) return { valor: h / 24, unidade: "dias" };
  return { valor: h, unidade: "horas" };
}
function toHours(valor: number, unidade: "horas" | "dias"): number {
  const v = Math.max(1, Math.round(valor || 1));
  return unidade === "dias" ? v * 24 : v;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--shell-divider)" }}>
      <div className="text-sm text-[var(--shell-text)] flex-1">{label}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ChannelForm({ cfg, onChange, oficial }: { cfg: ChannelCfg; onChange: (c: ChannelCfg) => void; oficial: boolean }) {
  const set = (patch: Partial<ChannelCfg>) => onChange({ ...cfg, ...patch });

  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6 space-y-1">
      <Row label="Ligar o SLA neste canal">
        <Toggle value={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>

      <Row label="Modo">
        <div className="flex gap-2">
          {(["AUTOPILOT", "COPILOT"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ mode: m })}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={cfg.mode === m
                ? { borderColor: "#1D9E75", background: "#E6F7F1", color: "#1D9E75" }
                : { borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
            >
              {m === "AUTOPILOT" ? "IA tenta sozinha" : "Só sugere ao corretor"}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Respeitar horário de atendimento">
        <Toggle value={cfg.respeitarHorario} onChange={(v) => set({ respeitarHorario: v })} />
      </Row>

      {oficial && (
        <Row label="Encerrar atendimento ao fim da janela de 24h (Meta)">
          <Toggle value={!!cfg.encerrarAoFim24h} onChange={(v) => set({ encerrarAoFim24h: v })} />
        </Row>
      )}

      {!oficial && (
        <Row label="Nº máximo de tentativas">
          <input
            type="number"
            min={1}
            value={cfg.maxTentativas ?? 4}
            onChange={(e) => set({ maxTentativas: Math.max(1, Number(e.target.value) || 1) })}
            className="w-20 rounded-lg border px-3 py-1.5 text-sm text-right"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          />
        </Row>
      )}

      {/* Cadência de tentativas */}
      <div className="pt-4">
        <p className="text-sm font-medium text-[var(--shell-text)]">Cadência de tentativas</p>
        <p className="text-xs text-[var(--shell-subtext)] mt-0.5 mb-3">
          Quando tentar contato, contado a partir da última mensagem do lead.
        </p>
        <div className="space-y-2">
          {cfg.tentativasHoras.map((h, i) => {
            const { valor, unidade } = fromHours(h);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-[var(--shell-subtext)] w-16">{i + 1}ª tentativa</span>
                <input
                  type="number"
                  min={1}
                  value={valor}
                  onChange={(e) => {
                    const next = [...cfg.tentativasHoras];
                    next[i] = toHours(Number(e.target.value), unidade);
                    set({ tentativasHoras: next });
                  }}
                  className="w-20 rounded-lg border px-3 py-1.5 text-sm text-right"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                />
                <select
                  value={unidade}
                  onChange={(e) => {
                    const next = [...cfg.tentativasHoras];
                    next[i] = toHours(valor, e.target.value as "horas" | "dias");
                    set({ tentativasHoras: next });
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                >
                  <option value="horas">horas</option>
                  <option value="dias">dias</option>
                </select>
                <button
                  type="button"
                  onClick={() => set({ tentativasHoras: cfg.tentativasHoras.filter((_, j) => j !== i) })}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => set({ tentativasHoras: [...cfg.tentativasHoras, 24] })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar tentativa
        </button>
      </div>
    </div>
  );
}

export default function SlaSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"oficial" | "light">("oficial");
  const [oficial, setOficial] = useState<ChannelCfg | null>(null);
  const [light, setLight] = useState<ChannelCfg | null>(null);

  useEffect(() => {
    apiFetch("/tenants/sla-config")
      .then((d: any) => {
        if (d?.oficial) setOficial(d.oficial);
        if (d?.light) setLight(d.light);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/tenants/sla-config", {
        method: "PATCH",
        body: JSON.stringify({ oficial, light }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !oficial || !light) {
    return (
      <AppShell title="Config. SLA">
        <div className="flex items-center justify-center h-64 text-[var(--shell-subtext)]">Carregando...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Config. SLA">
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Config. SLA</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">
            Reativação automática de leads parados. Oficial e Light são configurados de forma independente —
            o oficial respeita a janela de 24h da Meta; o Light não tem essa limitação.
          </p>
        </div>

        {/* Abas */}
        <div className="flex gap-2">
          {([["oficial", "WhatsApp Oficial"], ["light", "WhatsApp Light"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={tab === key
                ? { background: "#1D9E75", color: "#fff" }
                : { background: "var(--shell-hover)", color: "var(--shell-subtext)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "oficial"
          ? <ChannelForm cfg={oficial} onChange={setOficial} oficial />
          : <ChannelForm cfg={light} onChange={setLight} oficial={false} />}

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar configurações"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
