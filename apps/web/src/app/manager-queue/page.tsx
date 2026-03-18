"use client";

import AppShell from "@/components/AppShell";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  telefoneKey?: string | null;
  origem?: string | null;
  status: string;
  needsManagerReview: boolean;
  queuePriority: number;
  lastInboundAt?: string | null;
  events?: any[];
};

const DECISIONS = [
  { value: "KEEP_AGENT_REENTRY", label: "Manter corretor e reentrada (sobe na fila)" },
  {
    value: "AI_ROUTE_OTHER_IF_AVAILABLE_AFTER_QUALIFICATION",
    label: "Ativar IA e rotear outro se houver (após qualificação)",
  },
  { value: "KEEP_CLOSED", label: "Manter fechado sem novo atendimento" },
  {
    value: "AI_ROUTE_ANY_AFTER_QUALIFICATION",
    label: "Ativar IA e rotear qualquer corretor (após qualificação)",
  },
] as const;

type DecisionValue = (typeof DECISIONS)[number]["value"];

type TreatedItem = {
  leadId: string;
  leadName: string;
  telefoneKey?: string | null;
  decision: DecisionValue;
  decisionLabel: string;
  reasonId: string;
  reasonLabel: string;
  justification?: string | null;
  createdAt: string; // ISO
};

const TREATED_KEY = "managerQueue.treated.v1";
const TREATED_MAX = 30;

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default function ManagerQueuePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [queue, setQueue] = useState<Lead[]>([]);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // ✅ Histórico local (tratados)
  const [treated, setTreated] = useState<TreatedItem[]>([]);

  function goLead(leadId: string) {
    router.push(`/leads/${leadId}`);
  }

  function loadTreatedFromStorage() {
    const raw = typeof window !== "undefined" ? localStorage.getItem(TREATED_KEY) : null;
    const parsed = safeJsonParse<TreatedItem[]>(raw);
    setTreated(Array.isArray(parsed) ? parsed : []);
  }

  function saveTreatedToStorage(next: TreatedItem[]) {
    setTreated(next);
    try {
      localStorage.setItem(TREATED_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function clearTreated() {
    saveTreatedToStorage([]);
  }

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      const q = await apiFetch("/leads/manager-queue", { method: "GET" });
      const qq: Lead[] = Array.isArray(q) ? q : [];
      setQueue(qq);
    } catch (e: any) {
      setErr(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTreatedFromStorage();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Fila do Gerente">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fila do Gerente</h1>
          <div className="text-sm text-gray-600">Leads aguardando aprovação</div>
        </div>

        <button
          onClick={loadAll}
          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <b>Erro:</b> <span>{err}</span>
        </div>
      ) : null}

      {/* ✅ Agora: Esquerda = Fila | Direita = Tratados */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* COLUNA ESQUERDA: FILA */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">
              Leads na fila ({queue.length})
            </h3>
            {loading ? <span className="text-xs text-gray-500">Carregando…</span> : null}
          </div>

          {queue.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              Nenhum lead em{" "}
              <code className="rounded bg-gray-100 px-1">needsManagerReview=true</code>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            {queue.map((l) => (
              <div
                key={l.id}
                className={[
                  "rounded-lg border px-3 py-2",
                  selectedLeadId === l.id ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white",
                ].join(" ")}
              >
                <button
                  onClick={() => setSelectedLeadId(l.id)}
                  className="w-full text-left"
                  type="button"
                >
                  <div className="text-sm text-gray-900">
                    <b>{l.nome}</b> — {l.origem || "(sem origem)"}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    telefoneKey: {l.telefoneKey || "-"} | status: {l.status} | priority:{" "}
                    {l.queuePriority}
                  </div>
                </button>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => goLead(l.id)}
                    className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                    title="Abrir o histórico do lead"
                  >
                    Abrir lead
                  </button>

                  {selectedLeadId === l.id ? (
                    <span className="text-[11px] text-gray-500 self-center">Selecionado</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA DIREITA: TRATADOS (HISTÓRICO LOCAL) */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900">
              Tratados (histórico) ({treated.length})
            </h3>

            <button
              type="button"
              onClick={clearTreated}
              className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
              disabled={treated.length === 0}
              title="Limpar histórico local desta máquina"
            >
              Limpar
            </button>
          </div>

          {treated.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              Ainda não há tratados nesta máquina (localStorage).
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {treated.map((t) => (
                <div
                  key={`${t.leadId}-${t.createdAt}`}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="text-sm text-gray-900">
                    <b>{t.leadName}</b>
                    {t.telefoneKey ? (
                      <span className="text-gray-500"> — {t.telefoneKey}</span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-xs text-gray-600">
                    <div>
                      <span className="font-medium text-gray-700">Motivo:</span>{" "}
                      {t.reasonLabel}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Decisão:</span>{" "}
                      {t.decisionLabel}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono mt-1">
                      {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => goLead(t.leadId)}
                      className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                    >
                      Abrir lead
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}