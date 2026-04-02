"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

const DAYS = [
  { key: "monday",    label: "Segunda-feira" },
  { key: "tuesday",   label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday",  label: "Quinta-feira" },
  { key: "friday",    label: "Sexta-feira" },
  { key: "saturday",  label: "Sábado" },
  { key: "sunday",    label: "Domingo" },
];

type DaySchedule = { open: string; close: string } | null;
type BusinessHours = {
  timezone: string;
  monday: DaySchedule; tuesday: DaySchedule; wednesday: DaySchedule;
  thursday: DaySchedule; friday: DaySchedule; saturday: DaySchedule; sunday: DaySchedule;
};

const DEFAULT_HOURS: BusinessHours = {
  timezone: "America/Sao_Paulo",
  monday:    { open: "08:00", close: "22:00" },
  tuesday:   { open: "08:00", close: "22:00" },
  wednesday: { open: "08:00", close: "22:00" },
  thursday:  { open: "08:00", close: "22:00" },
  friday:    { open: "08:00", close: "22:00" },
  saturday:  { open: "09:00", close: "18:00" },
  sunday:    null,
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors ${value ? "bg-emerald-500" : "bg-gray-300"}`}>
      <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}

export default function BotSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [autopilotEnabled, setAutopilotEnabled] = useState(true);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [outsideHoursMessage, setOutsideHoursMessage] = useState(
    "Olá! Nosso atendimento está encerrado no momento. Retornaremos assim que possível. 😊"
  );
  const [aiDelayMin, setAiDelayMin] = useState(5);
  const [aiDelayMax, setAiDelayMax] = useState(15);
  const [aiHistoryLimit, setAiHistoryLimit] = useState(8);

  useEffect(() => {
    apiFetch("/tenants/bot-config")
      .then((data: any) => {
        if (!data) return;
        setAutopilotEnabled(data.autopilotEnabled ?? true);
        setOutsideHoursMessage(data.outsideHoursMessage || outsideHoursMessage);
        if (data.businessHours) setBusinessHours({ ...DEFAULT_HOURS, ...data.businessHours });
        setAiDelayMin(data.aiDelayMin ?? 5);
        setAiDelayMax(data.aiDelayMax ?? 15);
        setAiHistoryLimit(data.aiHistoryLimit ?? 8);
      })
      .finally(() => setLoading(false));
  }, []);

  function setDayEnabled(key: string, enabled: boolean) {
    setBusinessHours(prev => ({
      ...prev,
      [key]: enabled ? { open: "08:00", close: "22:00" } : null,
    }));
  }

  function setDayTime(key: string, field: "open" | "close", value: string) {
    setBusinessHours(prev => {
      const day = prev[key as keyof BusinessHours] as DaySchedule;
      if (!day) return prev;
      return { ...prev, [key]: { ...day, [field]: value } };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/tenants/bot-config", {
        method: "PATCH",
        body: JSON.stringify({ autopilotEnabled, businessHours, outsideHoursMessage, aiDelayMin, aiDelayMax, aiHistoryLimit }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <AppShell title="Config. IA">
      <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
    </AppShell>
  );

  return (
    <AppShell title="Config. IA">
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações da IA</h1>
          <p className="text-sm text-gray-400 mt-1">Controle quando e como a IA responde automaticamente.</p>
        </div>

        {/* Toggle master */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">IA ativa</p>
              <p className="text-sm text-gray-400 mt-0.5">Liga ou desliga a IA para todos os leads deste tenant.</p>
            </div>
            <Toggle value={autopilotEnabled} onChange={setAutopilotEnabled} />
          </div>
          {!autopilotEnabled && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              ⚠️ IA desligada. Nenhuma mensagem automática será enviada.
            </div>
          )}
        </div>

        {/* Horário de atendimento */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <p className="text-base font-semibold text-gray-900">Horário de atendimento</p>
            <p className="text-sm text-gray-400 mt-0.5">O bot só responde dentro desses horários.</p>
          </div>

          <div className="space-y-3">
            {DAYS.map(({ key, label }) => {
              const day = businessHours[key as keyof BusinessHours] as DaySchedule;
              const enabled = day !== null;
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-36">
                    <Toggle value={enabled} onChange={(v) => setDayEnabled(key, v)} />
                    <span className="ml-2 text-sm text-gray-700">{label}</span>
                  </div>
                  {enabled && day ? (
                    <div className="flex items-center gap-2">
                      <input type="time" value={day.open} onChange={e => setDayTime(key, "open", e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400" />
                      <span className="text-gray-400 text-sm">até</span>
                      <input type="time" value={day.close} onChange={e => setDayTime(key, "close", e.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400" />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mensagem fora do horário */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Mensagem fora do horário</p>
            <p className="text-sm text-gray-400 mt-0.5">Enviada uma vez quando o lead escreve fora do horário configurado.</p>
          </div>
          <textarea value={outsideHoursMessage} onChange={e => setOutsideHoursMessage(e.target.value)} rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-400 resize-none" />
        </div>

        {/* Comportamento humanizado */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
          <div>
            <p className="text-base font-semibold text-gray-900">Comportamento humanizado</p>
            <p className="text-sm text-gray-400 mt-0.5">Simula tempo de leitura e digitação antes de responder.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Delay mínimo (segundos)</label>
              <input type="number" min={1} max={60} value={aiDelayMin}
                onChange={e => setAiDelayMin(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Delay máximo (segundos)</label>
              <input type="number" min={1} max={120} value={aiDelayMax}
                onChange={e => setAiDelayMax(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400">A IA aguarda um tempo aleatório entre o mínimo e máximo antes de enviar a resposta. Simula leitura + digitação.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Histórico de mensagens consideradas</label>
            <input type="number" min={2} max={30} value={aiHistoryLimit}
              onChange={e => setAiHistoryLimit(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-slate-400" />
            <p className="mt-1.5 text-xs text-gray-400">Quantas mensagens anteriores da conversa a IA leva em conta. Mais mensagens = mais contexto, porém mais lento.</p>
          </div>
        </div>

        {/* Salvar */}
        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="rounded-xl bg-slate-900 px-8 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar configurações"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
