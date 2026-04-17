"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

const SESSION_ID = "main";

type Tab = "chat" | "biblioteca" | "configuracoes";

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

type Note = {
  id: string;
  title: string | null;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
};

const GENDER_OPTIONS = [
  { value: "FEMININO", label: "Feminino", hint: "Voz: Nova" },
  { value: "MASCULINO", label: "Masculino", hint: "Voz: Onyx" },
  { value: "NEUTRO", label: "Neutro", hint: "Voz: Alloy" },
];

const CATEGORIES = [
  { key: "NOTA",      label: "Nota",      color: "bg-blue-100 text-blue-700" },
  { key: "CONTATO",   label: "Contato",   color: "bg-green-100 text-green-700" },
  { key: "DOCUMENTO", label: "Documento", color: "bg-orange-100 text-orange-700" },
  { key: "SENHA",     label: "Senha",     color: "bg-red-100 text-red-700" },
  { key: "LEMBRETE",  label: "Lembrete",  color: "bg-purple-100 text-purple-700" },
  { key: "OUTRO",     label: "Outro",     color: "bg-gray-100 text-gray-600" },
];

function catColor(cat: string) {
  return CATEGORIES.find((c) => c.key === cat)?.color ?? "bg-gray-100 text-gray-600";
}
function catLabel(cat: string) {
  return CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SecretaryPage() {
  const [tab, setTab] = useState<Tab>("chat");

  // ── Chat ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Biblioteca ────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteCatFilter, setNoteCatFilter] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("NOTA");
  const [savingNote, setSavingNote] = useState(false);

  // ── Configurações ─────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [secretaryNameInput, setSecretaryNameInput] = useState("");
  const [secretaryBotNameInput, setSecretaryBotNameInput] = useState("");
  const [secretaryGenderInput, setSecretaryGenderInput] = useState("FEMININO");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    loadHistory();
    loadProfile();
    const interval = setInterval(refreshMessages, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (tab === "biblioteca") loadNotes();
  }, [tab]);

  // ── Chat functions ────────────────────────────────────────────────────
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await apiFetch(`/secretary/history/all?limit=100`);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch { setMessages([]); }
    finally { setHistoryLoading(false); }
  }

  async function refreshMessages() {
    try {
      const data = await apiFetch(`/secretary/history/all?limit=100`);
      const incoming = Array.isArray(data.messages) ? data.messages : [];
      setMessages((prev) => incoming.length === prev.length ? prev : incoming);
    } catch {}
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed, createdAt: new Date().toISOString() }]);
    setInput("");
    setSending(true);
    try {
      const data = await apiFetch("/secretary/message", {
        method: "POST",
        body: JSON.stringify({ text: trimmed, sessionId: SESSION_ID, skipAudio: muted }),
      });
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.text, createdAt: new Date().toISOString() }]);
      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch(() => {});
      }
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Erro ao obter resposta. Tente novamente.", createdAt: new Date().toISOString() }]);
    } finally { setSending(false); }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
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
    } catch { alert("Não foi possível acessar o microfone."); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  // ── Biblioteca functions ──────────────────────────────────────────────
  async function loadNotes(cat?: string, q?: string) {
    setNotesLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat ?? noteCatFilter) params.set("category", cat ?? noteCatFilter);
      if (q ?? noteSearch) params.set("q", q ?? noteSearch);
      const data = await apiFetch(`/secretary/notes?${params.toString()}`);
      setNotes(Array.isArray(data) ? data : []);
    } catch { setNotes([]); }
    finally { setNotesLoading(false); }
  }

  async function saveNote() {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiFetch("/secretary/notes", {
        method: "POST",
        body: JSON.stringify({ title: noteTitle.trim() || null, content: noteContent.trim(), category: noteCategory }),
      });
      setNotes((prev) => [note, ...prev]);
      setShowNoteForm(false);
      setNoteTitle(""); setNoteContent(""); setNoteCategory("NOTA");
    } catch (e: any) { alert(e?.message || "Erro ao salvar."); }
    finally { setSavingNote(false); }
  }

  async function deleteNote(id: string) {
    if (!confirm("Excluir esta nota?")) return;
    await apiFetch(`/secretary/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
  }

  // ── Profile functions ─────────────────────────────────────────────────
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
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (e: any) { setProfileError(e?.message || "Erro ao salvar."); }
    finally { setSavingProfile(false); }
  }

  // ── Filtered notes ────────────────────────────────────────────────────
  const filteredNotes = notes.filter((n) => {
    const matchCat = !noteCatFilter || n.category === noteCatFilter;
    const matchQ = !noteSearch || (n.title ?? "").toLowerCase().includes(noteSearch.toLowerCase()) || n.content.toLowerCase().includes(noteSearch.toLowerCase());
    return matchCat && matchQ;
  });

  return (
    <AppShell title="Secretária">
      <div className="flex flex-col gap-0" style={{ height: "calc(100vh - 8.5rem)" }}>

        {/* Abas */}
        <div className="flex border-b bg-[var(--shell-card-bg)] mb-3 flex-shrink-0" style={{ borderColor: "var(--shell-card-border)" }}>
          {([
            { key: "chat",         label: "Chat" },
            { key: "biblioteca",   label: `Biblioteca${notes.length > 0 ? ` (${notes.length})` : ""}` },
            { key: "configuracoes", label: "Configurações" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ABA CHAT ── */}
        {tab === "chat" && (
          <div className="flex-1 flex flex-col rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden" style={{ borderColor: "var(--shell-card-border)" }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--shell-bg)]">
              {historyLoading ? (
                <p className="text-center text-xs text-[var(--shell-subtext)] mt-8">Carregando histórico...</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-xs text-[var(--shell-subtext)] mt-8">Nenhuma mensagem ainda. Envie a primeira!</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-slate-900 text-white" : "bg-[var(--shell-card-bg)] border text-[var(--shell-text)]"
                    }`} style={m.role !== "user" ? { borderColor: "var(--shell-card-border)" } : undefined}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <p className={`mt-1 text-[10px] ${m.role === "user" ? "text-slate-400" : "text-[var(--shell-subtext)]"}`}>
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-xl border bg-[var(--shell-card-bg)] px-4 py-2.5 text-sm text-[var(--shell-subtext)]" style={{ borderColor: "var(--shell-card-border)" }}>digitando...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t p-3 flex items-center gap-2 bg-[var(--shell-card-bg)]" style={{ borderColor: "var(--shell-card-border)" }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                rows={2}
                placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                disabled={sending}
                className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-50"
                style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
              />
              <div className="flex flex-col gap-1">
                <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
                  title="Segure para gravar"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors ${recording ? "bg-red-500 text-white" : "bg-[var(--shell-hover)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                  🎙
                </button>
                <button onClick={() => setMuted((v) => !v)}
                  title={muted ? "Áudio silenciado" : "Áudio ativo"}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors ${muted ? "bg-amber-100 text-amber-600 hover:bg-amber-200" : "bg-[var(--shell-hover)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                  {muted ? "🔇" : "🔊"}
                </button>
                <button onClick={() => sendMessage(input)} disabled={sending || !input.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">
                  ↑
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA BIBLIOTECA ── */}
        {tab === "biblioteca" && (
          <div className="flex-1 flex overflow-hidden gap-4">
            {/* Lista */}
            <div className="w-80 flex-shrink-0 flex flex-col gap-3">
              {/* Barra de busca */}
              <div className="flex gap-2">
                <input
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadNotes(noteCatFilter, noteSearch); }}
                  placeholder="Buscar notas..."
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                />
                <button onClick={() => setShowNoteForm(true)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  + Nova
                </button>
              </div>

              {/* Filtro de categorias */}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => { setNoteCatFilter(""); loadNotes("", noteSearch); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${!noteCatFilter ? "bg-slate-900 text-white border-slate-900" : "bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] border-[var(--shell-card-border)] hover:border-gray-400"}`}>
                  Todas
                </button>
                {CATEGORIES.map((c) => (
                  <button key={c.key} onClick={() => { setNoteCatFilter(c.key); loadNotes(c.key, noteSearch); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${noteCatFilter === c.key ? "bg-slate-900 text-white border-slate-900" : "bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] border-[var(--shell-card-border)] hover:border-gray-400"}`}>
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Lista de notas */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {notesLoading ? (
                  <p className="text-center text-xs text-[var(--shell-subtext)] mt-8">Carregando...</p>
                ) : filteredNotes.length === 0 ? (
                  <p className="text-center text-xs text-[var(--shell-subtext)] mt-8">Nenhuma nota encontrada.</p>
                ) : (
                  filteredNotes.map((n) => (
                    <button key={n.id} onClick={() => setSelectedNote(n)}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${selectedNote?.id === n.id ? "border-slate-900 bg-[var(--shell-hover)]" : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] hover:border-gray-300 hover:shadow-sm"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--shell-text)] truncate">{n.title || n.content.slice(0, 40)}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${catColor(n.category)}`}>
                          {catLabel(n.category)}
                        </span>
                      </div>
                      {n.title && (
                        <p className="mt-1 text-xs text-[var(--shell-subtext)] truncate">{n.content.slice(0, 60)}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-[var(--shell-subtext)] opacity-60">{formatDate(n.createdAt)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Detalhe */}
            <div className="flex-1 rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden flex flex-col" style={{ borderColor: "var(--shell-card-border)" }}>
              {selectedNote ? (
                <>
                  <div className="flex items-start justify-between px-6 py-4 border-b" style={{ borderColor: "var(--shell-card-border)" }}>
                    <div>
                      <h2 className="text-base font-semibold text-[var(--shell-text)]">{selectedNote.title || "Sem título"}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${catColor(selectedNote.category)}`}>
                          {catLabel(selectedNote.category)}
                        </span>
                        <span className="text-xs text-[var(--shell-subtext)]">{formatDate(selectedNote.createdAt)}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteNote(selectedNote.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      Excluir
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <p className="text-sm text-[var(--shell-subtext)] whitespace-pre-wrap leading-relaxed">{selectedNote.content}</p>
                    {selectedNote.tags?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {selectedNote.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-[var(--shell-hover)] px-2.5 py-0.5 text-xs text-[var(--shell-subtext)]">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-[var(--shell-subtext)]">Selecione uma nota para visualizar</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA CONFIGURAÇÕES ── */}
        {tab === "configuracoes" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-lg space-y-6">
              {profile && (
                <div className="rounded-xl border bg-[var(--shell-card-bg)] px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)] mb-3">Usuário</p>
                  <div className="text-sm font-medium text-[var(--shell-text)]">{profile.nome}</div>
                  <div className="text-xs text-[var(--shell-subtext)] mt-0.5">{profile.email}</div>
                </div>
              )}

              <div className="rounded-xl border bg-[var(--shell-card-bg)] px-5 py-5 space-y-5" style={{ borderColor: "var(--shell-card-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">Personalidade da secretária</p>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--shell-subtext)]">Nome da secretária</label>
                  <input value={secretaryBotNameInput} onChange={(e) => setSecretaryBotNameInput(e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-slate-400"
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    placeholder='Ex: "Sofia", "Ana"' />
                  <p className="mt-1 text-xs text-[var(--shell-subtext)]">Como a secretária se identifica. Se vazio, usa "Secretária".</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--shell-subtext)]">Como ela deve te chamar</label>
                  <input value={secretaryNameInput} onChange={(e) => setSecretaryNameInput(e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-slate-400"
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    placeholder='Ex: "João", "Dr. Silva", "Chefe"' />
                  <p className="mt-1 text-xs text-[var(--shell-subtext)]">Se vazio, usa o seu nome de cadastro.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--shell-subtext)]">Gênero / Voz</label>
                  <div className="flex gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <button key={g.value} type="button" onClick={() => setSecretaryGenderInput(g.value)}
                        className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                          secretaryGenderInput === g.value ? "border-slate-900 bg-slate-900 text-white" : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                        }`}
                        style={secretaryGenderInput !== g.value ? { borderColor: "var(--shell-card-border)" } : undefined}>
                        <div>{g.label}</div>
                        <div className={`text-[11px] mt-0.5 ${secretaryGenderInput === g.value ? "text-slate-300" : "text-[var(--shell-subtext)]"}`}>{g.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-[var(--shell-card-bg)] px-5 py-5 space-y-4" style={{ borderColor: "var(--shell-card-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--shell-subtext)]">WhatsApp</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--shell-subtext)]">Número vinculado</label>
                  <div className="flex gap-2">
                    <input value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)}
                      className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-slate-400"
                      style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                      placeholder="+55 11 99999-9999" />
                    {whatsappInput && (
                      <button type="button" onClick={() => setWhatsappInput("")}
                        className="rounded-xl border px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                        style={{ borderColor: "var(--shell-card-border)" }}>
                        Remover
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--shell-subtext)]">
                    Vincula seu número para usar a Secretária pelo WhatsApp.
                  </p>
                </div>
              </div>

              {profileError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profileError}</div>
              )}
              {profileSaved && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Configurações salvas.</div>
              )}

              <button onClick={saveProfile} disabled={savingProfile}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {savingProfile ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nova nota */}
      {showNoteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="w-full max-w-md rounded-xl shadow-xl bg-[var(--shell-card-bg)]">
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <h2 className="text-base font-semibold text-[var(--shell-text)]">Nova nota</h2>
              <button onClick={() => setShowNoteForm(false)} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Categoria</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button key={c.key} type="button" onClick={() => setNoteCategory(c.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        noteCategory === c.key ? "bg-slate-900 text-white border-slate-900" : "bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] border-[var(--shell-card-border)] hover:border-gray-400"
                      }`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Título (opcional)</label>
                <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  placeholder="Ex: Contato do arquiteto" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Conteúdo *</label>
                <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={5}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-slate-400 resize-none"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  placeholder="Digite o conteúdo da nota..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <button onClick={() => setShowNoteForm(false)}
                className="rounded-xl border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                style={{ borderColor: "var(--shell-card-border)" }}>
                Cancelar
              </button>
              <button onClick={saveNote} disabled={savingNote || !noteContent.trim()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {savingNote ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
