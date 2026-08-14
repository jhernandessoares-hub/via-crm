"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
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

type PipelineStageOption = { id: string; name: string; key: string };

const STATUS_OPTIONS = [
  { key: "NOVO", label: "Novo" },
  { key: "EM_CONTATO", label: "Em contato" },
  { key: "QUALIFICADO", label: "Qualificado" },
  { key: "PROPOSTA", label: "Proposta" },
  { key: "FECHADO", label: "Fechado" },
  { key: "PERDIDO", label: "Perdido" },
];

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

function isChecked(current: string[] | null, id: string) {
  return current === null || current.includes(id);
}

function toggleItem(current: string[] | null, allIds: string[], id: string): string[] | null {
  const base = current === null ? [...allIds] : [...current];
  const idx = base.indexOf(id);
  if (idx >= 0) base.splice(idx, 1);
  else base.push(id);
  if (base.length === allIds.length) return null;
  return base;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-[var(--shell-card-border)] accent-emerald-500"
      />
      <span className="text-sm text-[var(--shell-text)]">{label}</span>
    </label>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`}
    >
      <div className={`absolute top-1 h-4 w-4 rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${value ? "translate-x-7" : "translate-x-1"}`} />
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
  const [aiReassumirBaseFria, setAiReassumirBaseFria] = useState(false);
  const [aiAllowedStageIds, setAiAllowedStageIds] = useState<string[] | null>(null);
  const [aiAllowedStatuses, setAiAllowedStatuses] = useState<string[] | null>(null);
  const [stages, setStages] = useState<PipelineStageOption[]>([]);

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
        setAiReassumirBaseFria(data.aiReassumirBaseFria ?? false);
        setAiAllowedStageIds(Array.isArray(data.aiAllowedStageIds) ? data.aiAllowedStageIds : null);
        setAiAllowedStatuses(Array.isArray(data.aiAllowedStatuses) ? data.aiAllowedStatuses : null);
      })
      .finally(() => setLoading(false));

    apiFetch("/pipeline/active/stages")
      .then((data: any) => setStages(Array.isArray(data) ? data : []))
      .catch(() => setStages([]));
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
        body: JSON.stringify({
          autopilotEnabled, businessHours, outsideHoursMessage, aiDelayMin, aiDelayMax, aiHistoryLimit,
          aiReassumirBaseFria, aiAllowedStageIds, aiAllowedStatuses,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <AppShell title="Config. IA">
      <div className="flex items-center justify-center h-64 text-[var(--shell-subtext)]">Carregando...</div>
    </AppShell>
  );

  return (
    <AppShell title="Config. IA">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Configurações da IA</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">Controle quando e como a IA responde automaticamente.</p>
        </div>

        {/* Toggle master */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-[var(--shell-text)]">IA ativa</p>
                <p className="text-sm text-[var(--shell-subtext)] mt-0.5">Liga ou desliga a IA para todos os leads deste tenant.</p>
              </div>
              <Toggle value={autopilotEnabled} onChange={setAutopilotEnabled} />
            </div>
            {!autopilotEnabled && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                IA desligada. Nenhuma mensagem automática será enviada.
              </div>
            )}
          </CardBody>
        </Card>

        {/* Horário de atendimento */}
        <Card>
          <CardHeader>
            <CardTitle>Horário de atendimento</CardTitle>
            <CardDescription>O bot só responde dentro desses horários.</CardDescription>
          </CardHeader>
          <CardBody className="space-y-3">
            {DAYS.map(({ key, label }) => {
              const day = businessHours[key as keyof BusinessHours] as DaySchedule;
              const enabled = day !== null;
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-44 shrink-0">
                    <Toggle value={enabled} onChange={(v) => setDayEnabled(key, v)} />
                    <span className="text-sm text-[var(--shell-text)]">{label}</span>
                  </div>
                  {enabled && day ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={day.open}
                        onChange={e => setDayTime(key, "open", e.target.value)}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                      />
                      <span className="text-sm text-[var(--shell-subtext)]">até</span>
                      <input
                        type="time"
                        value={day.close}
                        onChange={e => setDayTime(key, "close", e.target.value)}
                        className="rounded-lg border px-3 py-1.5 text-sm"
                        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-[var(--shell-subtext)]">Fechado</span>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Mensagem fora do horário */}
        <Card>
          <CardHeader>
            <CardTitle>Mensagem fora do horário</CardTitle>
            <CardDescription>Enviada uma vez quando o lead escreve fora do horário configurado.</CardDescription>
          </CardHeader>
          <CardBody>
            <textarea
              value={outsideHoursMessage}
              onChange={e => setOutsideHoursMessage(e.target.value)}
              rows={4}
              className="w-full rounded-xl border px-4 py-3 text-sm resize-none"
              style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
            />
          </CardBody>
        </Card>

        {/* Reassumir leads da Base Fria */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-[var(--shell-text)]">Reassumir leads da Base Fria</p>
                <p className="text-sm text-[var(--shell-subtext)] mt-0.5">
                  Quando um lead responde a uma campanha de reaquecimento da Base Fria, a IA volta a
                  responder automaticamente. Desligado (padrão): a IA fica de fora e o corretor é
                  notificado para assumir a conversa.
                </p>
              </div>
              <Toggle value={aiReassumirBaseFria} onChange={setAiReassumirBaseFria} />
            </div>
          </CardBody>
        </Card>

        {/* Etapas e status em que a IA responde */}
        <Card>
          <CardHeader>
            <CardTitle>Etapas e status em que a IA responde</CardTitle>
            <CardDescription>
              Desmarque uma etapa ou status para impedir que a IA responda automaticamente
              leads que estejam nessa condição. O corretor continua podendo atender manualmente.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-[var(--shell-text)]">Etapas do funil</p>
                <button
                  type="button"
                  className="text-xs text-emerald-600 hover:underline"
                  onClick={() => setAiAllowedStageIds(aiAllowedStageIds === null ? [] : null)}
                >
                  {aiAllowedStageIds === null ? "Desmarcar todas" : "Selecionar todas"}
                </button>
              </div>
              {stages.length === 0 ? (
                <p className="text-sm text-[var(--shell-subtext)]">Nenhuma etapa ativa encontrada.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {stages.map((stage) => (
                    <Checkbox
                      key={stage.id}
                      label={stage.name}
                      checked={isChecked(aiAllowedStageIds, stage.id)}
                      onChange={() =>
                        setAiAllowedStageIds(
                          toggleItem(aiAllowedStageIds, stages.map((s) => s.id), stage.id)
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-[var(--shell-text)]">Status do lead</p>
                <button
                  type="button"
                  className="text-xs text-emerald-600 hover:underline"
                  onClick={() => setAiAllowedStatuses(aiAllowedStatuses === null ? [] : null)}
                >
                  {aiAllowedStatuses === null ? "Desmarcar todos" : "Selecionar todos"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {STATUS_OPTIONS.map((status) => (
                  <Checkbox
                    key={status.key}
                    label={status.label}
                    checked={isChecked(aiAllowedStatuses, status.key)}
                    onChange={() =>
                      setAiAllowedStatuses(
                        toggleItem(aiAllowedStatuses, STATUS_OPTIONS.map((s) => s.key), status.key)
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Comportamento humanizado */}
        <Card>
          <CardHeader>
            <CardTitle>Comportamento humanizado</CardTitle>
            <CardDescription>Simula tempo de leitura e digitação antes de responder.</CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--shell-subtext)]">Delay mínimo (segundos)</label>
                <input
                  type="number" min={1} max={60} value={aiDelayMin}
                  onChange={e => setAiDelayMin(Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--shell-subtext)]">Delay máximo (segundos)</label>
                <input
                  type="number" min={1} max={120} value={aiDelayMax}
                  onChange={e => setAiDelayMax(Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--shell-subtext)]">A IA aguarda um tempo aleatório entre o mínimo e máximo antes de enviar a resposta.</p>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--shell-subtext)]">Histórico de mensagens consideradas</label>
              <input
                type="number" min={2} max={30} value={aiHistoryLimit}
                onChange={e => setAiHistoryLimit(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
              />
              <p className="text-xs text-[var(--shell-subtext)]">Quantas mensagens anteriores a IA leva em conta. Mais mensagens = mais contexto, porém mais lento.</p>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
