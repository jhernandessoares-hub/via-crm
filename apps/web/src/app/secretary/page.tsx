"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// Sessão única contínua — sem múltiplas sessões
const SESSION_ID = "main";

type Message = {
  id: string;
  role: string;
  content: string;
  audioUrl?: string | null;
  createdAt: string;
};

type UserProfile = {
  id: string;
  nome: string;
  email: string;
  role: string;
  whatsappNumber: string | null;
  secretaryName: string | null;
  secretaryBotName: string | null;
  secretaryGender: string;
};

const GENDER_OPTIONS = [
  { value: "FEMININO", label: "Feminino", hint: "Voz: Nova" },
  { value: "MASCULINO", label: "Masculino", hint: "Voz: Onyx" },
  { value: "NEUTRO", label: "Neutro", hint: "Voz: Alloy" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SecretaryPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [secretaryNameInput, setSecretaryNameInput] = useState("");
  const [secretaryBotNameInput, setSecretaryBotNameInput] = useState("");
  const [secretaryGenderInput, setSecretaryGenderInput] = useState("FEMININO");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    loadHistory();
    loadProfile();

    // Polling a cada 8s para capturar mensagens chegadas pelo WhatsApp
    const interval = setInterval(refreshMessages, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await apiFetch(
        `/secretary/history?sessionId=${SESSION_ID}&limit=100`,
      );
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshMessages() {
    try {
      const data = await apiFetch(
        `/secretary/history?sessionId=${SESSION_ID}&limit=100`,
      );
      const incoming = Array.isArray(data.messages) ? data.messages : [];
      setMessages((prev) => {
        if (incoming.length === prev.length) return prev;
        return incoming;
      });
    } catch {}
  }

  async function loadProfile() {
    try {
      const data = await apiFetch("/users/me");
      setProfile(data);
      setWhatsappInput(data.whatsappNumber ?? "");
      setSecretaryNameInput(data.secretaryName ?? "");
      setSecretaryBotNameInput(data.secretaryBotName ?? "");
      setSecretaryGenderInput(data.secretaryGender ?? "FEMININO");
    } catch {}
  }

  async function saveProfile() {
    setProfileError(null);
    setSavingProfile(true);
    try {
      const data = await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          whatsappNumber: whatsappInput.trim() || null,
          secretaryName: secretaryNameInput.trim() || null,
          secretaryBotName: secretaryBotNameInput.trim() || null,
          secretaryGender: secretaryGenderInput,
        }),
      });
      setProfile(data);
      setSettingsOpen(false);
    } catch (e: any) {
      setProfileError(e?.message || "Erro ao salvar.");
    } finally {
      setSavingProfile(false);
    }
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
        body: JSON.stringify({ text: trimmed, sessionId: SESSION_ID, skipAudio: muted }),
      });

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
    } catch {
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
          const data = await apiFetch("/secretary/transcribe", {
            method: "POST",
            body: fd,
          });
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
      <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 8.5rem)" }}>

        {/* Barra superior */}
        <div className="flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            {messages.length > 0
              ? `${messages.length} mensagens — histórico de 7 dias`
              : "Inicie uma conversa"}
          </p>
          <button
            onClick={() => {
              setWhatsappInput(profile?.whatsappNumber ?? "");
              setSecretaryNameInput(profile?.secretaryName ?? "");
              setSecretaryBotNameInput(profile?.secretaryBotName ?? "");
              setSecretaryGenderInput(profile?.secretaryGender ?? "FEMININO");
              setProfileError(null);
              setSettingsOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            ⚙ Configurações
          </button>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col rounded-xl border bg-white overflow-hidden">
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {historyLoading ? (
              <p className="text-center text-xs text-gray-400 mt-8">
                Carregando histórico...
              </p>
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
                onClick={() => setMuted((v) => !v)}
                title={muted ? "Áudio silenciado (clique para ativar)" : "Áudio ativo (clique para silenciar)"}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors ${
                  muted
                    ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {muted ? "🔇" : "🔊"}
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
        </div>
      </div>

      {/* Modal configurações */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Configurações da Secretária
              </h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {profile && (
                <div className="rounded-md bg-gray-50 border px-3 py-2 text-sm text-gray-700">
                  <div className="font-medium">{profile.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{profile.email}</div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Nome da secretária
                </label>
                <input
                  value={secretaryBotNameInput}
                  onChange={(e) => setSecretaryBotNameInput(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder='Ex: "Sofia", "Ana", "Assistente"'
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Como a secretária se identifica. Se vazio, usa "Secretária".
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Gênero / Voz
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setSecretaryGenderInput(g.value)}
                      className={`flex-1 rounded-md border py-2 text-xs font-medium transition ${
                        secretaryGenderInput === g.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <div>{g.label}</div>
                      <div className={`text-[10px] mt-0.5 ${secretaryGenderInput === g.value ? "text-slate-300" : "text-gray-400"}`}>
                        {g.hint}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Como a secretária deve te chamar
                </label>
                <input
                  value={secretaryNameInput}
                  onChange={(e) => setSecretaryNameInput(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder='Ex: "João", "Dr. Silva", "Chefe"'
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Se vazio, usa o seu nome de cadastro.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Número WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    value={whatsappInput}
                    onChange={(e) => setWhatsappInput(e.target.value)}
                    className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="+55 11 99999-9999"
                  />
                  {whatsappInput && (
                    <button
                      type="button"
                      onClick={() => setWhatsappInput("")}
                      title="Remover número"
                      className="rounded-md border px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Vincula seu número para usar a Secretária pelo WhatsApp. Remova para volcar ao fluxo de lead.
                </p>
              </div>

              {profileError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {profileError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingProfile ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
