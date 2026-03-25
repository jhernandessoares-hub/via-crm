"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };

const HIDDEN_ROUTES = ["/secretary", "/login"];
const MIC_PREF_KEY = "secretaryWidget_micEnabled";
const SESSION_KEY = "secretarySessionId";

export default function SecretaryWidget() {
  const pathname = usePathname();

  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SESSION_KEY) ?? undefined;
    }
    return undefined;
  });
  const [recording, setRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);

  // Widget size (resizable)
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(480);

  // Position (bottom/right)
  const [bottom, setBottom] = useState(24);
  const [right, setRight] = useState(24);

  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startRight: 24, startBottom: 24 });
  const resizeRef = useRef({ resizing: false, startX: 0, startY: 0, startW: 320, startH: 480 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check auth and hidden routes
  useEffect(() => {
    if (HIDDEN_ROUTES.includes(pathname)) { setVisible(false); return; }
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    setVisible(!!token);
  }, [pathname]);

  // Load mic preference
  useEffect(() => {
    const saved = localStorage.getItem(MIC_PREF_KEY);
    if (saved !== null) setMicEnabled(saved === "true");
  }, []);

  // Load history when widget opens (once per session)
  useEffect(() => {
    if (!open || historyLoaded || !sessionId) return;

    apiFetch(`/secretary/history?sessionId=${encodeURIComponent(sessionId)}&limit=50`)
      .then((data) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [open, historyLoaded, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!visible) return null;

  function toggleMic() {
    const next = !micEnabled;
    setMicEnabled(next);
    localStorage.setItem(MIC_PREF_KEY, String(next));
  }

  // ── Send message ──────────────────────────────

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch("/secretary/message", {
        method: "POST",
        body: JSON.stringify({ text: trimmed, sessionId }),
      });
      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);

      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch(() => {});
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao obter resposta. Tente novamente." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── File upload ────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const fd = new FormData();
    fd.append("file", file);

    try {
      const data = await apiFetch("/secretary/upload", { method: "POST", body: fd });
      const ref = data.url ? `[Arquivo: ${file.name}](${data.url})` : `[Arquivo: ${file.name}]`;
      sendMessage(ref);
    } catch {
      sendMessage(`[Arquivo: ${file.name}]`);
    }
  }

  // ── Audio recording ───────────────────────────

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

  // ── Drag (header) ─────────────────────────────

  function onHeaderMouseDown(e: React.MouseEvent) {
    // Don't drag when clicking buttons inside header
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startRight: right, startBottom: bottom };

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setRight(Math.max(0, dragRef.current.startRight - dx));
      setBottom(Math.max(0, dragRef.current.startBottom - dy));
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Resize (top-left handle) ──────────────────

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, startW: width, startH: height };

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      // Dragging left → increase width; dragging up → increase height
      const newW = Math.min(600, Math.max(300, resizeRef.current.startW - dx));
      const newH = Math.min(700, Math.max(400, resizeRef.current.startH - dy));
      setWidth(newW);
      setHeight(newH);
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Render ────────────────────────────────────

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-white shadow-lg hover:bg-slate-800 transition-colors"
          style={{ bottom, right }}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-900">
            V
          </span>
          <span className="text-sm font-medium">Precisa de ajuda?</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-white shadow-2xl"
          style={{ width, height, bottom, right }}
        >
          {/* Resize handle — top-left corner */}
          <div
            className="absolute top-0 left-0 z-10 h-4 w-4 cursor-nw-resize"
            onMouseDown={onResizeMouseDown}
            title="Arrastar para redimensionar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className="m-1 text-slate-500 opacity-60">
              <path d="M0 10 L10 0" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 10 L10 4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Header (draggable) */}
          <div
            className="flex cursor-move items-center justify-between bg-slate-900 px-4 py-3 select-none"
            onMouseDown={onHeaderMouseDown}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-900">
                V
              </span>
              <div>
                <div className="text-sm font-semibold text-white">VIA</div>
                <div className="text-[10px] text-slate-400">Arraste para mover</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Mic toggle */}
              <button
                onClick={toggleMic}
                title={micEnabled ? "Desativar microfone" : "Ativar microfone"}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  micEnabled
                    ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                    : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                }`}
              >
                🎤 <span>{micEnabled ? "Voz" : "Voz"}</span>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.length === 0 && (
              <p className="mt-8 text-center text-xs text-gray-400">
                Olá! Como posso ajudar?
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-slate-900 text-white"
                      : "bg-white border text-gray-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl border bg-white px-3 py-2 text-sm text-gray-400">
                  digitando...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 border-t bg-white p-3">
            {/* File upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Enviar arquivo"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-base"
            >
              📎
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              rows={1}
              placeholder={micEnabled ? "Digite ou segure 🎙 para gravar" : "Digite uma mensagem..."}
              disabled={loading}
              className="flex-1 resize-none rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
              style={{ maxHeight: 120, overflowY: "auto" }}
            />

            {/* Mic button (conditional) */}
            {micEnabled && (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                title="Segure para gravar"
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base transition-colors ${
                  recording
                    ? "bg-red-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                🎙
              </button>
            )}

            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
