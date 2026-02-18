"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Lead = {
  id: string;
  nome?: string;
  telefone?: string;
  whatsapp?: string;
  observacao?: string;
  status?: string;
  criadoEm?: string;
  needsManagerReview?: boolean;
  queuePriority?: number;
  assignedUserId?: string | null;
  branchId?: string | null;
};

type LeadEvent = {
  id: string;
  channel?: string;
  criadoEm?: string;
  payloadRaw?: any;
};

function formatTime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function pickText(ev: LeadEvent): string {
  const p = ev.payloadRaw || {};
  if (typeof p.text === "string" && p.text.trim()) return p.text.trim();
  if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  return "";
}

function isOutgoing(ev: LeadEvent) {
  const ch = (ev.channel || "").toLowerCase();

  if (ch.startsWith("whatsapp.out")) return true;
  if (ch.startsWith("ai.")) return true;
  if (ch.startsWith("system.")) return true;
  if (ch === "crm.note") return true;

  if (ch === "form" || ch.startsWith("whatsapp.in")) return false;

  return true;
}

function Bubble({ ev }: { ev: LeadEvent }) {
  const outgoing = isOutgoing(ev);
  const text = pickText(ev);
  const ch = ev.channel || "event";

  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm border",
          outgoing
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-white border-gray-200 text-gray-900",
        ].join(" ")}
      >
        <div className="text-[11px] text-gray-500 flex items-center justify-between gap-2">
          <span className="font-mono">{ch}</span>
          <span>{formatTime(ev.criadoEm)}</span>
        </div>

        {text ? (
          <div className="mt-1 whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="mt-1 text-xs text-gray-600">
            (sem texto) <span className="font-mono text-[11px]">id:{ev.id}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadDetailChatPage() {
  const params = useParams();
  const id = String((params as any)?.id || "");

  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // evita chamadas concorrentes do polling
  const inFlightRef = useRef(false);

  async function loadLead() {
    const l = await apiFetch(`/leads/${id}`, { method: "GET" });
    setLead(l);
  }

  async function loadEvents() {
    const ev = await apiFetch(`/leads/${id}/events`, { method: "GET" });
    setEvents(Array.isArray(ev) ? ev : ev?.items ?? []);
  }

  async function loadAll() {
    setErr(null);

    setLoadingLead(true);
    setLoadingEvents(true);

    try {
      await Promise.all([loadLead(), loadEvents()]);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
      setLead(null);
      setEvents([]);
    } finally {
      setLoadingLead(false);
      setLoadingEvents(false);
    }
  }

  // primeira carga
  useEffect(() => {
    if (id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // polling só de events (não mexe no lead, pra não piscar)
  useEffect(() => {
    if (!id) return;

    const intervalMs = 2500;

    const tick = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        await loadEvents();
      } catch {
        // sem spam de erro no polling
      } finally {
        inFlightRef.current = false;
      }
    };

    const t = setInterval(tick, intervalMs);

    // faz 1 atualização rápida logo após abrir a página
    tick();

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const orderedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const ta = a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
      const tb = b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
      return ta - tb;
    });
  }, [events]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [orderedEvents.length]);

  async function sendNote() {
    const msg = text.trim();
    if (!msg) return;

    setSending(true);
    setErr(null);

    try {
      await apiFetch(`/leads/${id}/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: msg,
        }),
      });

      setText("");

      // puxa events imediatamente após enviar (sem esperar polling)
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell title="Atendimento">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 lg:col-span-1">
          <div className="text-sm font-semibold text-gray-900">Lead</div>

          {loadingLead ? (
            <div className="mt-3 text-sm text-gray-600">Carregando...</div>
          ) : lead ? (
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">Nome</div>
                <div className="font-medium text-gray-900">{lead.nome || "—"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Telefone</div>
                <div className="text-gray-900">{lead.telefone || "—"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Status</div>
                <div className="text-gray-900">{lead.status || "NOVO"}</div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-600">Não carregou.</div>
          )}

          <button
            className="mt-4 w-full rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            onClick={loadAll}
            disabled={loadingLead || loadingEvents}
          >
            Atualizar
          </button>

          {err && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white overflow-hidden lg:col-span-2 flex flex-col h-[70vh]">
          <div className="border-b bg-gray-50 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">Chat</div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {loadingEvents ? (
              <div className="text-sm text-gray-600">Carregando histórico...</div>
            ) : orderedEvents.length === 0 ? (
              <div className="text-sm text-gray-600">Sem mensagens ainda.</div>
            ) : (
              orderedEvents.map((ev) => <Bubble key={ev.id} ev={ev} />)
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t bg-white p-3">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border p-2 text-sm"
                placeholder="Digite mensagem..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendNote();
                  }
                }}
              />
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={sendNote}
                disabled={sending || !text.trim()}
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
