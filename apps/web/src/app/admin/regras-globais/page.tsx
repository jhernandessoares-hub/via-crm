"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

/* ─── Types ─────────────────────────────────────────────────────────── */
type HistoryEntry = {
  id: string;
  key: string;
  previousValue: string;
  newValue: string;
  changedAt: string;
};

type RuleConfig = {
  key: string;
  label: string;
  icon: string;
  description: string;
  impact: string;
  color: "amber" | "red" | "orange";
};

/* ─── Rule definitions ───────────────────────────────────────────────── */
const RULES: RuleConfig[] = [
  {
    key: "globalAgentRules",
    label: "Segurança Global",
    icon: "🛡️",
    description: "Regras de segurança e conduta aplicadas em todos os agentes. Controla escalação automática, privacidade e comportamento em situações de risco.",
    impact: "Afeta o comportamento de segurança de todos os agentes em todos os tenants.",
    color: "amber",
  },
  {
    key: "agentIdentityRules",
    label: "Identidade do Agente",
    icon: "🪪",
    description: "Controla como o agente se identifica na conversa. Impede prefixos de papel, gerencia o uso do nome do lead e evita exposição de dados internos.",
    impact: "Afeta como o agente se apresenta para o lead em todos os atendimentos.",
    color: "red",
  },
  {
    key: "whatsappFormattingRules",
    label: "Formatação WhatsApp",
    icon: "📱",
    description: "Define como o agente formata as mensagens enviadas. Garante compatibilidade com o padrão de negrito e markdown do WhatsApp.",
    impact: "Afeta o formato visual de todas as mensagens enviadas aos leads.",
    color: "orange",
  },
];

const COLOR_MAP = {
  amber: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    icon: "text-amber-600",
    btn: "bg-amber-600 hover:bg-amber-700",
    header: "bg-amber-600",
    textarea: "border-amber-300 focus:border-amber-500",
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-800",
    icon: "text-red-600",
    btn: "bg-red-600 hover:bg-red-700",
    header: "bg-red-600",
    textarea: "border-red-300 focus:border-red-500",
  },
  orange: {
    border: "border-orange-200",
    bg: "bg-orange-50",
    badge: "bg-orange-100 text-orange-800",
    icon: "text-orange-600",
    btn: "bg-orange-600 hover:bg-orange-700",
    header: "bg-orange-600",
    textarea: "border-orange-300 focus:border-orange-500",
  },
};

/* ─── History Modal ──────────────────────────────────────────────────── */
function HistoryModal({ ruleKey, label, onClose }: { ruleKey: string; label: string; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    adminFetch(`/admin/platform-config/${ruleKey}/history`)
      .then((d: any) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ruleKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">Histórico — {label}</p>
            <p className="text-xs text-gray-400 mt-0.5">Últimas 20 alterações registradas</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma alteração registrada ainda.</p>
          ) : history.map((h) => (
            <div key={h.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div>
                  <p className="text-xs font-medium text-gray-700">
                    {new Date(h.changedAt).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {h.newValue.slice(0, 80)}{h.newValue.length > 80 ? "..." : ""}
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{expanded === h.id ? "▲" : "▼"}</span>
              </button>
              {expanded === h.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1">VALOR ANTERIOR</p>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white border border-gray-200 rounded p-2 max-h-32 overflow-y-auto">{h.previousValue || "(vazio)"}</pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1">NOVO VALOR</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white border border-gray-200 rounded p-2 max-h-32 overflow-y-auto">{h.newValue}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Rule Card ──────────────────────────────────────────────────────── */
function RuleCard({
  rule,
  value,
  onSaved,
}: {
  rule: RuleConfig;
  value: string;
  onSaved: (key: string, newValue: string) => void;
}) {
  const c = COLOR_MAP[rule.color];

  // Fluxo: idle → warning → editing → confirming
  const [step, setStep] = useState<"idle" | "warning" | "editing" | "confirming">("idle");
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // sync quando value externo muda
  useEffect(() => { setDraft(value); }, [value]);

  function handleEdit() {
    setDraft(value);
    setSavedMsg(null);
    setStep("warning");
  }

  function handleAcknowledge() {
    setStep("editing");
  }

  function handleCancel() {
    setDraft(value);
    setStep("idle");
    setSavedMsg(null);
  }

  function handleRequestSave() {
    setConfirmChecked(false);
    setStep("confirming");
  }

  async function handleConfirmSave() {
    setSaving(true);
    try {
      await adminFetch("/admin/platform-config", {
        method: "PATCH",
        body: JSON.stringify({ [rule.key]: draft }),
      });
      onSaved(rule.key, draft);
      setSavedMsg("Salvo com sucesso.");
      setStep("idle");
    } catch (e: any) {
      setSavedMsg(`Erro: ${e.message || "falha ao salvar"}`);
      setStep("editing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={`rounded-2xl border ${c.border} bg-white shadow-sm overflow-hidden`}>
        {/* Header */}
        <div className={`px-6 py-4 ${c.bg} border-b ${c.border} flex items-start justify-between`}>
          <div className="flex items-start gap-3">
            <span className={`text-2xl ${c.icon}`}>{rule.icon}</span>
            <div>
              <p className="font-semibold text-gray-900">{rule.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 max-w-lg">{rule.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => setShowHistory(true)}
              className="text-xs text-gray-400 hover:text-gray-700 underline"
            >
              Histórico
            </button>
            {step === "idle" && (
              <button
                onClick={handleEdit}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium text-white ${c.btn}`}
              >
                Editar
              </button>
            )}
            {step === "editing" && (
              <button
                onClick={handleCancel}
                className="rounded-lg border px-4 py-1.5 text-xs hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Step: idle — mostra preview */}
          {step === "idle" && (
            <div>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg border border-gray-200 p-4 max-h-40 overflow-y-auto">
                {value || "(não configurado — usando valor padrão do sistema)"}
              </pre>
              {savedMsg && (
                <p className="text-xs text-emerald-600 mt-2">{savedMsg}</p>
              )}
            </div>
          )}

          {/* Step: warning — primeiro alerta */}
          {step === "warning" && (
            <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-5 space-y-4`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">⚠️</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Atenção antes de editar</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Qualquer alteração nesta regra afeta <strong>todos os clientes (tenants) da plataforma</strong> imediatamente após salvar.
                  </p>
                  <p className={`text-xs mt-2 font-medium ${c.icon}`}>
                    {rule.impact}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("idle")}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Voltar
                </button>
                <button
                  onClick={handleAcknowledge}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium text-white ${c.btn}`}
                >
                  Tenho ciência, quero editar
                </button>
              </div>
            </div>
          )}

          {/* Step: editing — editor */}
          {step === "editing" && (
            <div className="space-y-3">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={10}
                className={`w-full rounded-lg border ${c.textarea} bg-gray-50 px-4 py-3 text-sm font-mono outline-none resize-y`}
              />
              {savedMsg && (
                <p className="text-xs text-red-600">{savedMsg}</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleRequestSave}
                  disabled={draft === value}
                  className={`rounded-lg px-6 py-2 text-sm font-medium text-white ${c.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {/* Step: confirming — segunda confirmação */}
          {step === "confirming" && (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl">🔴</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Confirmar salvamento</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Você está prestes a salvar uma alteração em <strong>{rule.label}</strong>. Esta ação não pode ser desfeita automaticamente — mas o histórico ficará registrado.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={e => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 shrink-0"
                />
                <span className="text-xs text-gray-700">
                  Confirmo que revisei as alterações e entendo que elas serão aplicadas a <strong>todos os tenants da plataforma</strong> imediatamente.
                </span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("editing")}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Voltar ao editor
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={!confirmChecked || saving}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? "Salvando..." : "Confirmar e Salvar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <HistoryModal
          ruleKey={rule.key}
          label={rule.label}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function RegrasGlobaisPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/admin/platform-config")
      .then((d: any) => setValues(d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(key: string, newValue: string) {
    setValues(prev => ({ ...prev, [key]: newValue }));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">🛡️ Regras Globais</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurações que afetam todos os agentes de todos os tenants da plataforma. Alterações entram em vigor imediatamente.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {RULES.map(rule => (
              <RuleCard
                key={rule.key}
                rule={rule}
                value={values[rule.key] ?? ""}
                onSaved={handleSaved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
