"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

const EVENTS = [
  {
    key: "new_lead",
    label: "Novo lead",
    desc: "Avisa quando um lead novo chega pelo WhatsApp",
  },
  {
    key: "lead_qualified",
    label: "Lead qualificado pela IA",
    desc: "Avisa quando a IA identificar um lead com perfil qualificado",
  },
  {
    key: "stage_change",
    label: "Mudança de etapa (ver abaixo)",
    desc: "Avisa quando um lead avança para uma etapa selecionada",
  },
];

const STAGES = [
  { key: "NOVO_LEAD", name: "Novo Lead" },
  { key: "PRIMEIRO_CONTATO", name: "Primeiro Contato" },
  { key: "NAO_QUALIFICADO", name: "Não Qualificado" },
  { key: "INTERESSE_QUALIFICACAO_CONFIRMADOS", name: "Interesse e Qualificação Confirmados" },
  { key: "AGENDAMENTO_VISITA", name: "Agendamento de Visita" },
  { key: "PROPOSTA", name: "Proposta" },
  { key: "APROVACAO_CREDITO_PROPOSTA", name: "Aprovação de Crédito e Proposta" },
  { key: "CONTRATO", name: "Contrato" },
  { key: "ASSINATURA_CONTRATO", name: "Assinatura de Contrato" },
  { key: "BANCO", name: "Banco" },
  { key: "REGISTRO", name: "Registro" },
  { key: "ENTREGA_CONTRATO_REGISTRADO", name: "Entrega de Contrato Registrado" },
  { key: "POS_VENDA_IA", name: "Pós Venda - IA" },
  { key: "BASE_FRIA", name: "Base Fria" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-emerald-500" : "bg-gray-300"}`}
    >
      <div
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

export default function NotificationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [events, setEvents] = useState<string[]>(["new_lead"]);
  const [stages, setStages] = useState<string[]>([]);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/users/me/notifications"),
      apiFetch("/users/me"),
    ]).then(([notif, me]: any[]) => {
      if (notif) {
        setEvents(notif.events ?? ["new_lead"]);
        setStages(notif.stages ?? []);
      }
      if (me) setWhatsappNumber(me.whatsappNumber || null);
    }).finally(() => setLoading(false));
  }, []);

  function toggleEvent(key: string) {
    setEvents((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]
    );
  }

  function toggleStage(key: string) {
    setStages((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/users/me/notifications", {
        method: "PATCH",
        body: JSON.stringify({ events, stages }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Notificações">
        <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
      </AppShell>
    );
  }

  const stageChangeEnabled = events.includes("stage_change");

  return (
    <AppShell title="Notificações">
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure o que você quer receber pelo WhatsApp da sua secretária.
          </p>
        </div>

        {/* Aviso de WhatsApp não configurado */}
        {!whatsappNumber && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ Você ainda não cadastrou seu número de WhatsApp.{" "}
            <a href="/settings/whatsapp" className="underline font-medium">
              Configurar agora
            </a>{" "}
            para receber notificações.
          </div>
        )}

        {/* Eventos */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
          <div>
            <p className="text-base font-semibold text-gray-900">Eventos</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Escolha quais eventos disparam uma mensagem para você.
            </p>
          </div>

          <div className="space-y-4">
            {EVENTS.map((ev) => (
              <div key={ev.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{ev.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ev.desc}</p>
                </div>
                <Toggle
                  value={events.includes(ev.key)}
                  onChange={() => toggleEvent(ev.key)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Etapas do funil */}
        <div
          className={`rounded-2xl border bg-white p-6 space-y-4 transition-opacity ${
            stageChangeEnabled ? "border-gray-200 opacity-100" : "border-gray-100 opacity-40 pointer-events-none"
          }`}
        >
          <div>
            <p className="text-base font-semibold text-gray-900">Etapas do funil</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Receba notificação quando um lead avançar para estas etapas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STAGES.map((stage) => (
              <label
                key={stage.key}
                className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={stages.includes(stage.key)}
                  onChange={() => toggleStage(stage.key)}
                  className="h-4 w-4 rounded border-gray-300 accent-emerald-500"
                />
                <span className="text-sm text-gray-700">{stage.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Salvar */}
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
