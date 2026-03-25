"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Message = {
  id: string;
  role: string;
  content: string;
  audioUrl?: string | null;
  createdAt: string;
};

type Session = {
  sessionId: string;
  messageCount: number;
  lastMessageAt: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SecretaryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const data = await apiFetch("/secretary/sessions");
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function openSession(sessionId: string) {
    setSelectedSession(sessionId);
    setHistoryLoading(true);
    try {
      const data = await apiFetch(
        `/secretary/history?sessionId=${encodeURIComponent(sessionId)}&limit=50`,
      );
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function startNewSession() {
    const newId = crypto.randomUUID();
    setSelectedSession(newId);
    setMessages([]);
    setSessions((prev) => [
      { sessionId: newId, messageCount: 0, lastMessageAt: new Date().toISOString() },
      ...prev,
    ]);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const optimisticUser: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    setSending(true);

    try {
      const data = await apiFetch("/secretary/message", {
        method: "POST",
        body: JSON.stringify({ text: trimmed, sessionId: selectedSession ?? undefined }),
      });

      if (!selectedSession) setSelectedSession(data.sessionId);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch(() => {});
      }

      // Refresh sessions list
      loadSessions();
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Erro ao obter resposta. Tente novamente.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "audio.webm");
        try {
          const data = await apiFetch("/secretary/transcribe", { method: "POST", body: fd });
          if (data.text) sendMessage(data.text);
        } catch {}
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert("Não foi possível acessar o microfone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  return (
    <AppShell title="Secretária">
      <div className="flex gap-4" style={{ height: "calc(100vh - 8.5rem)" }}>

        {/* ── Sidebar: sessões ── */}
        <aside className="w-56 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Sessões</h2>
            <button
              onClick={startNewSession}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              + Nova
            </button>
          </div>

          {sessionsLoading ? (
            <p className="text-xs text-gray-400">Carregando...</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma sessão ainda.</p>
          ) : (
            <ul className="space-y-1 overflow-y-auto flex-1">
              {sessions.map((s) => {
                const active = s.sessionId === selectedSession;
                return (
                  <li key={s.sessionId}>
                    <button
                      onClick={() => openSession(s.sessionId)}
                      className={`w-full text-left rounded-md px-3 py-2 text-xs transition ${
                        active
                          ? "bg-slate-900 text-white"
                          : "bg-white border hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <div className="font-medium truncate">
                        {formatSessionDate(s.lastMessageAt)}
                      </div>
                      <div className={`mt-0.5 ${active ? "text-slate-300" : "text-gray-400"}`}>
                        {s.messageCount} mensagem{s.messageCount !== 1 ? "s" : ""}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Painel principal: chat ── */}
        <div className="flex-1 flex flex-col rounded-xl border bg-white overflow-hidden">
          {!selectedSession ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
              Selecione uma sessão ou inicie uma nova conversa.
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {historyLoading ? (
                  <p className="text-center text-xs text-gray-400 mt-8">Carregando histórico...</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 mt-8">
                    Nenhuma mensagem ainda. Envie a primeira!
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-slate-900 text-white"
                            : "bg-white border text-gray-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.role === "user" ? "text-slate-400" : "text-gray-400"
                          }`}
                        >
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {sending && (
                  <div className="flex justify-start">
                    <div className="rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-400">
                      digitando...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-3 flex items-center gap-2 bg-white">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  rows={2}
                  placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                  disabled={sending}
                  className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                />
                <div className="flex flex-col gap-1">
                  <button
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    title="Segure para gravar"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors ${
                      recording
                        ? "bg-red-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    🎙
                  </button>
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={sending || !input.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
