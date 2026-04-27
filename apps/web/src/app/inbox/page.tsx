"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { Send, MessageSquare, Search, X } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Conversa = {
  leadId: string;
  nome: string;
  telefone: string | null;
  sessaoNome: string | null;
  naoLidos: number;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemDirecao: "in" | "out" | null;
};

type Mensagem = {
  id: string;
  direcao: "in" | "out";
  texto: string | null;
  criadoEm: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function horaFormatada(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function iniciais(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Componentes ───────────────────────────────────────────────────────────────

function ConversaItem({
  conversa,
  ativa,
  onClick,
}: {
  conversa: Conversa;
  ativa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b"
      style={{
        background: ativa ? "var(--brand-accent-muted)" : "transparent",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
        style={{ background: "var(--brand-accent)", color: "#fff" }}
      >
        {iniciais(conversa.nome)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {conversa.nome}
          </span>
          {conversa.ultimaMensagemEm && (
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
              {horaFormatada(conversa.ultimaMensagemEm)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {conversa.ultimaMensagemDirecao === "out" && (
              <span style={{ color: "var(--brand-accent)" }}>Você: </span>
            )}
            {conversa.ultimaMensagem ?? "Sem mensagens"}
          </span>
          {conversa.naoLidos > 0 && (
            <span
              className="text-xs font-bold rounded-full px-1.5 py-0.5 shrink-0"
              style={{ background: "var(--brand-accent)", color: "#fff" }}
            >
              {conversa.naoLidos}
            </span>
          )}
        </div>

        {conversa.sessaoNome && (
          <span
            className="text-xs px-1.5 py-0.5 rounded mt-1 inline-block"
            style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}
          >
            {conversa.sessaoNome}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
      style={{ background: "#ef4444", color: "#fff", maxWidth: 360 }}
    >
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

function horaMsg(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function getDataLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function groupByDate(msgs: Mensagem[]) {
  const groups: { dateKey: string; label: string; msgs: Mensagem[] }[] = [];
  for (const msg of msgs) {
    const key = new Date(msg.criadoEm).toDateString();
    const last = groups[groups.length - 1];
    if (last?.dateKey === key) last.msgs.push(msg);
    else groups.push({ dateKey: key, label: getDataLabel(msg.criadoEm), msgs: [msg] });
  }
  return groups;
}
function DateSeparatorInbox({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3 select-none">
      <span className="text-xs px-3 py-1 rounded-full font-medium shadow-sm"
        style={{ background: "rgba(11,20,26,0.18)", color: "#fff", backdropFilter: "blur(2px)" }}>
        {label}
      </span>
    </div>
  );
}

export default function InboxPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [leadAtivo, setLeadAtivo] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<{ nome: string; sessaoId: string | null; sessaoNome: string | null } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollingListRef = useRef<NodeJS.Timeout | null>(null);
  const pollingMsgRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const chatBg = isDark ? "#0b141a" : "#eae6df";
  const incomingBg = isDark ? "#1f2c34" : "#ffffff";
  const incomingText = isDark ? "#e9edef" : "#111b21";

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  // ── Conversas filtradas ──────────────────────────────────────────────────

  const conversasFiltradas = useMemo(() => {
    let filtered = conversas;
    if (soNaoLidas) filtered = filtered.filter((c) => c.naoLidos > 0);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      filtered = filtered.filter(
        (c) => c.nome.toLowerCase().includes(q) || c.telefone?.includes(q)
      );
    }
    return filtered;
  }, [conversas, busca, soNaoLidas]);

  const totalNaoLidas = useMemo(() => conversas.reduce((s, c) => s + c.naoLidos, 0), [conversas]);

  // ── Polling lista de conversas (8s) ──────────────────────────────────────

  const fetchConversas = useCallback(async () => {
    try {
      const data = await apiFetch("/inbox");
      setConversas(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversas();
    pollingListRef.current = setInterval(fetchConversas, 8000);
    return () => { if (pollingListRef.current) clearInterval(pollingListRef.current); };
  }, [fetchConversas]);

  // ── Polling mensagens da conversa ativa (5s) ─────────────────────────────

  // fetchMensagens NÃO depende de conversas — avatarUrl vem direto da API
  const fetchMensagens = useCallback(async (leadId: string) => {
    try {
      const data = await apiFetch(`/inbox/${leadId}`);
      const novos = data.mensagens ?? [];
      setMensagens((prev) => {
        // Só atualiza se há mudança real — evita re-render desnecessário
        if (prev.length === novos.length && prev[prev.length - 1]?.id === novos[novos.length - 1]?.id) {
          return prev;
        }
        return novos;
      });
      setConversaAtiva({ nome: data.nome, sessaoId: data.sessaoId, sessaoNome: data.sessaoNome });
    } catch {}
  }, []);

  useEffect(() => {
    if (pollingMsgRef.current) clearInterval(pollingMsgRef.current);
    if (!leadAtivo) { setMensagens([]); setConversaAtiva(null); return; }

    setCarregando(true);
    fetchMensagens(leadAtivo).finally(() => setCarregando(false));
    pollingMsgRef.current = setInterval(() => fetchMensagens(leadAtivo), 5000);
    return () => { if (pollingMsgRef.current) clearInterval(pollingMsgRef.current); };
  }, [leadAtivo, fetchMensagens]);

  // ── Scroll automático ────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // ── Selecionar conversa ──────────────────────────────────────────────────

  function selecionarConversa(leadId: string) {
    setLeadAtivo(leadId);
    // Marca como lida (fire-and-forget)
    apiFetch(`/inbox/${leadId}/read`, { method: "POST" }).catch(() => {});
    // Atualiza badge localmente de imediato
    setConversas((prev) => prev.map((c) => c.leadId === leadId ? { ...c, naoLidos: 0 } : c));
  }

  // ── Enviar mensagem ──────────────────────────────────────────────────────

  async function enviar() {
    if (!leadAtivo || !texto.trim() || enviando) return;
    const textoEnviado = texto.trim();
    setEnviando(true);
    setTexto("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      await apiFetch(`/inbox/${leadAtivo}/send`, {
        method: "POST",
        body: JSON.stringify({ text: textoEnviado }),
      });
      // Busca imediata para mostrar a mensagem confirmada
      fetchMensagens(leadAtivo);
    } catch (e: any) {
      setTexto(textoEnviado);
      showToast(e?.message ?? "Erro ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTexto(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Inbox WhatsApp Light">
      <div className="-m-6 flex overflow-hidden" style={{ height: "calc(100vh - 88px)" }}>
        {/* ── Lista de conversas ─────────────────────────────────── */}
        <div
          className="w-80 shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}
        >
          {/* Header com busca e filtro */}
          <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--card-border)" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Conversas
              </span>
              <button
                onClick={() => setSoNaoLidas(!soNaoLidas)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                style={{
                  background: soNaoLidas ? "var(--brand-accent)" : "var(--card-border)",
                  color: soNaoLidas ? "#fff" : "var(--text-muted)",
                }}
              >
                Não lidas
                {totalNaoLidas > 0 && (
                  <span className="rounded-full px-1.5 text-[10px]"
                    style={{ background: soNaoLidas ? "rgba(255,255,255,0.3)" : "var(--brand-accent)", color: "#fff" }}>
                    {totalNaoLidas}
                  </span>
                )}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--page-bg)", color: "var(--text-primary)" }}
              />
              {busca && (
                <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversasFiltradas.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {conversas.length === 0 ? "Nenhuma conversa ainda" : "Nenhuma conversa encontrada"}
              </div>
            ) : (
              conversasFiltradas.map((c) => (
                <ConversaItem
                  key={c.leadId}
                  conversa={c}
                  ativa={c.leadId === leadAtivo}
                  onClick={() => selecionarConversa(c.leadId)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Janela da conversa ─────────────────────────────────── */}
        {leadAtivo && conversaAtiva ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: chatBg }}>
            {/* Header */}
            <div
              className="px-4 py-3 border-b flex items-center gap-3 shrink-0"
              style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: "var(--brand-accent)", color: "#fff" }}
              >
                {iniciais(conversaAtiva.nome)}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {conversaAtiva.nome}
                </p>
                {conversaAtiva.sessaoNome && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    via {conversaAtiva.sessaoNome}
                  </p>
                )}
              </div>
              <div className="ml-auto">
                <a
                  href={`/leads/${leadAtivo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1 rounded-lg border"
                  style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}
                >
                  Ver lead
                </a>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ background: chatBg }}>
              {carregando && mensagens.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm" style={{ color: isDark ? "#8696a0" : "#667781" }}>Carregando...</p>
                </div>
              ) : mensagens.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm" style={{ color: isDark ? "#8696a0" : "#667781" }}>Nenhuma mensagem ainda</p>
                </div>
              ) : (
                groupByDate(mensagens).map((group) => (
                  <div key={group.dateKey}>
                    <DateSeparatorInbox label={group.label} />
                    {group.msgs.map((m) => {
                      const isOut = m.direcao === "out";
                      return (
                        <div key={m.id} className={`flex mb-1 ${isOut ? "justify-end" : "justify-start"}`}>
                          <div style={{
                            maxWidth: "72%",
                            padding: "6px 12px 8px",
                            borderRadius: isOut ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                            background: isOut ? "var(--brand-accent)" : incomingBg,
                            color: isOut ? "#fff" : incomingText,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                            fontSize: 14, lineHeight: 1.45,
                          }}>
                            <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                              {m.texto ?? "[mídia]"}
                            </p>
                            <p style={{ fontSize: 11, textAlign: "right", marginTop: 2, opacity: 0.65, lineHeight: 1 }}>
                              {horaMsg(m.criadoEm)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Campo de envio */}
            <div className="px-3 py-2 flex items-end gap-2"
              style={{ background: isDark ? "#1f2c34" : "#f0f2f5", borderTop: "1px solid var(--card-border)" }}>
              <textarea
                ref={textareaRef}
                rows={1}
                value={texto}
                onChange={handleTextoChange}
                onKeyDown={onKeyDown}
                placeholder="Digite uma mensagem"
                className="flex-1 resize-none text-sm outline-none"
                style={{
                  background: isDark ? "#2a3942" : "#ffffff",
                  color: "var(--text-primary)",
                  borderRadius: 20,
                  padding: "9px 14px",
                  minHeight: 40,
                  maxHeight: 120,
                  overflowY: "hidden",
                  border: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                }}
              />
              <button
                onClick={enviar}
                disabled={enviando || !texto.trim()}
                className="flex items-center justify-center shrink-0 disabled:opacity-40 transition-transform active:scale-95"
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: texto.trim() ? "var(--brand-accent)" : (isDark ? "#2a3942" : "#e2e8f0"),
                  color: texto.trim() ? "#fff" : "var(--text-muted)",
                }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ background: chatBg }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.08)" }}>
              <MessageSquare className="w-7 h-7" style={{ color: "rgba(0,0,0,0.25)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: isDark ? "#8696a0" : "#667781" }}>
              Selecione uma conversa
            </p>
          </div>
        )}
      </div>

      {toastMsg && <Toast msg={toastMsg} onClose={() => setToastMsg(null)} />}
    </AppShell>
  );
}
