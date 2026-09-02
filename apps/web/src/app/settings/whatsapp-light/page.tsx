"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { Smartphone, Plus, Wifi, WifiOff, Loader2, QrCode, Trash2, RefreshCw, AlertTriangle, SearchCheck } from "lucide-react";

type Session = {
  id: string;
  nome: string;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "QR_PENDING";
  phoneNumber: string | null;
  pushName: string | null;
  lastDisconnectedAt: string | null;
};

type RecoverResult = {
  totalLeads: number;
  ok: number;
  skipped: number;
  errored: number;
  totalInserted: number;
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type SessionStatus = Session & { qrCode: string | null };

const STATUS_LABEL: Record<Session["status"], string> = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Conectando...",
  CONNECTED: "Conectado",
  QR_PENDING: "Aguardando QR",
};

const STATUS_COLOR: Record<Session["status"], string> = {
  DISCONNECTED: "#6b7280",
  CONNECTING: "#f59e0b",
  CONNECTED: "#10b981",
  QR_PENDING: "#6366f1",
};

export default function WhatsappLightPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [qrModal, setQrModal] = useState<string | null>(null); // sessionId
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<Session["status"]>("CONNECTING");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [aviso, setAviso] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [recoverModal, setRecoverModal] = useState<Session | null>(null);
  const [recoverSince, setRecoverSince] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState<RecoverResult | null>(null);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setRole(user?.role ?? null);
    } catch {}
  }, []);

  const canRecover = role === "OWNER" || role === "MANAGER";

  function abrirRecuperar(s: Session) {
    setRecoverResult(null);
    setRecoverError(null);
    setRecoverSince(s.lastDisconnectedAt ? toLocalInputValue(s.lastDisconnectedAt) : "");
    setRecoverModal(s);
  }

  async function confirmarRecuperar() {
    if (!recoverModal) return;
    setRecovering(true);
    setRecoverError(null);
    try {
      const result = await apiFetch(`/whatsapp-unofficial/${recoverModal.id}/recover-missed-messages`, {
        method: "POST",
        body: JSON.stringify({ since: recoverSince ? new Date(recoverSince).toISOString() : undefined }),
      });
      setRecoverResult(result);
    } catch (e: any) {
      setRecoverError(e?.message ?? "Erro ao buscar mensagens perdidas");
    } finally {
      setRecovering(false);
    }
  }

  async function fetchSessions() {
    try {
      const data = await apiFetch("/whatsapp-unofficial");
      setSessions(data);
    } catch {}
  }

  useEffect(() => {
    fetchSessions().finally(() => setLoading(false));
    const t = setInterval(fetchSessions, 5000);
    return () => clearInterval(t);
  }, []);

  // Polling QR quando modal aberto
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!qrModal) { setQrCode(null); return; }

    const poll = async () => {
      try {
        const data: SessionStatus = await apiFetch(`/whatsapp-unofficial/${qrModal}/status`);
        setQrStatus(data.status);
        setQrCode(data.qrCode ?? null);
        if (data.status === "CONNECTED") {
          setQrModal(null);
          fetchSessions();
        }
      } catch {}
    };

    poll();
    pollingRef.current = setInterval(poll, 3000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [qrModal]);

  async function criar() {
    if (!novoNome.trim()) return;
    setCriando(true);
    try {
      const session = await apiFetch("/whatsapp-unofficial", {
        method: "POST",
        body: JSON.stringify({ nome: novoNome.trim() }),
      });
      setNovoNome("");
      setSessions((prev) => [...prev, session]);
      setQrModal(session.id);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao criar sessão");
    } finally {
      setCriando(false);
    }
  }

  async function conectar(id: string) {
    await apiFetch(`/whatsapp-unofficial/${id}/connect`, { method: "POST" });
    setQrModal(id);
  }

  async function desconectar(id: string) {
    if (!confirm("Desconectar esta sessão?")) return;
    await apiFetch(`/whatsapp-unofficial/${id}/disconnect`, { method: "POST" });
    fetchSessions();
  }

  async function remover(id: string) {
    if (!confirm("Remover esta sessão permanentemente?")) return;
    await apiFetch(`/whatsapp-unofficial/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <AppShell title="WhatsApp Light">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            WhatsApp Light
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Conecte números via QR Code sem precisar de conta Meta Business.
          </p>
        </div>

        {/* Aviso de risco */}
        {aviso && (
          <div
            className="flex items-start gap-3 p-4 rounded-xl border"
            style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.08)" }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
            <div className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              <strong>Atenção:</strong> O WhatsApp Light usa o protocolo não oficial do WhatsApp Web.
              Isso viola os termos de serviço da Meta e pode resultar no <strong>ban do número</strong>.
              Recomendamos usar um <strong>número secundário</strong>, não o número principal do negócio.
            </div>
            <button onClick={() => setAviso(false)} className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
              Entendi
            </button>
          </div>
        )}

        {/* Formulário novo número */}
        <div
          className="p-4 rounded-xl border flex items-center gap-3"
          style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
        >
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            placeholder="Nome do número (ex: Vendas, Suporte)"
            className="flex-1 px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
          />
          <button
            onClick={criar}
            disabled={criando || !novoNome.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: "var(--brand-accent)", color: "#fff" }}
          >
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>

        {/* Lista de sessões */}
        {loading ? (
          <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>
            <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhum número conectado ainda
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border flex items-center gap-4"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${STATUS_COLOR[s.status]}20` }}
                >
                  {s.status === "CONNECTED" ? (
                    <Wifi className="w-5 h-5" style={{ color: STATUS_COLOR[s.status] }} />
                  ) : s.status === "CONNECTING" ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: STATUS_COLOR[s.status] }} />
                  ) : s.status === "QR_PENDING" ? (
                    <QrCode className="w-5 h-5" style={{ color: STATUS_COLOR[s.status] }} />
                  ) : (
                    <WifiOff className="w-5 h-5" style={{ color: STATUS_COLOR[s.status] }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {s.nome}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium" style={{ color: STATUS_COLOR[s.status] }}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    {s.phoneNumber && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        • {s.phoneNumber}{s.pushName ? ` (${s.pushName})` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {s.status === "DISCONNECTED" && (
                    <button
                      onClick={() => conectar(s.id)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: "var(--brand-accent)", color: "#fff" }}
                    >
                      Conectar
                    </button>
                  )}
                  {s.status === "QR_PENDING" && (
                    <button
                      onClick={() => setQrModal(s.id)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: "#6366f1", color: "#fff" }}
                    >
                      Ver QR
                    </button>
                  )}
                  {s.status === "CONNECTED" && canRecover && s.lastDisconnectedAt && (
                    <button
                      onClick={() => abrirRecuperar(s)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium"
                      style={{ borderColor: "#6366f1", color: "#6366f1" }}
                    >
                      <SearchCheck className="w-3.5 h-3.5" />
                      Buscar mensagens perdidas
                    </button>
                  )}
                  {s.status === "CONNECTED" && (
                    <button
                      onClick={() => desconectar(s.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}
                    >
                      Desconectar
                    </button>
                  )}
                  {s.status === "CONNECTING" && (
                    <button
                      onClick={() => setQrModal(s.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => remover(s.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "#ef4444" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Buscar mensagens perdidas */}
      {recoverModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div
            className="rounded-2xl p-8 max-w-sm w-full mx-4"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
          >
            <SearchCheck className="w-8 h-8 mb-3" style={{ color: "#6366f1" }} />
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              Buscar mensagens perdidas
            </h2>

            {recoverResult ? (
              <div className="py-2 text-sm space-y-3" style={{ color: "var(--text-primary)" }}>
                {recoverResult.totalInserted > 0 ? (
                  <p>
                    <strong>{recoverResult.totalInserted}</strong> mensage{recoverResult.totalInserted === 1 ? "m" : "ns"} recuperada{recoverResult.totalInserted === 1 ? "" : "s"} em{" "}
                    <strong>{recoverResult.ok}</strong> conversa{recoverResult.ok === 1 ? "" : "s"}.
                  </p>
                ) : (
                  <p>Nenhuma mensagem perdida encontrada nesse período.</p>
                )}
                {recoverResult.skipped > 0 && (
                  <p style={{ color: "var(--text-muted)" }}>
                    {recoverResult.skipped} conversa{recoverResult.skipped === 1 ? "" : "s"} sem histórico suficiente pra buscar (pulada{recoverResult.skipped === 1 ? "" : "s"}).
                  </p>
                )}
                {recoverResult.errored > 0 && (
                  <p style={{ color: "#ef4444" }}>
                    {recoverResult.errored} conversa{recoverResult.errored === 1 ? "" : "s"} deu erro ao buscar.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                  Detectamos que "{recoverModal.nome}" ficou desconectado. Vamos buscar de novo no WhatsApp as
                  mensagens desse período em todas as conversas. Pode levar alguns minutos.
                </p>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                  Buscar desde
                </label>
                <input
                  type="datetime-local"
                  value={recoverSince}
                  onChange={(e) => setRecoverSince(e.target.value)}
                  disabled={recovering}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none mb-2"
                  style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
                />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Preenchido automaticamente com o momento da queda — pode adiantar a data se quiser buscar mais pra trás.
                </p>
              </>
            )}

            {recoverError && (
              <p className="text-sm mt-3" style={{ color: "#ef4444" }}>{recoverError}</p>
            )}

            <div className="flex items-center gap-3 mt-6">
              {!recoverResult && (
                <button
                  onClick={confirmarRecuperar}
                  disabled={recovering || !recoverSince}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "#6366f1", color: "#fff" }}
                >
                  {recovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchCheck className="w-4 h-4" />}
                  {recovering ? "Buscando..." : "Buscar"}
                </button>
              )}
              <button
                onClick={() => setRecoverModal(null)}
                disabled={recovering}
                className="text-sm px-4 py-2"
                style={{ color: "var(--text-muted)" }}
              >
                {recoverResult ? "Fechar" : "Cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR Code */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div
            className="rounded-2xl p-8 max-w-sm w-full mx-4 text-center"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
            <QrCode className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--brand-accent)" }} />
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              Escanear QR Code
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Abra o WhatsApp no celular → Menu → Dispositivos vinculados → Vincular dispositivo
            </p>

            {qrStatus === "CONNECTED" ? (
              <div className="py-8 text-center">
                <Wifi className="w-12 h-12 mx-auto mb-2" style={{ color: "#10b981" }} />
                <p className="font-semibold" style={{ color: "#10b981" }}>Conectado!</p>
              </div>
            ) : qrCode ? (
              <img
                src={qrCode}
                alt="QR Code"
                className="w-48 h-48 mx-auto rounded-xl"
              />
            ) : (
              <div className="py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: "var(--brand-accent)" }} />
                <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
                  {qrStatus === "CONNECTING" ? "Gerando QR Code..." : STATUS_LABEL[qrStatus]}
                </p>
              </div>
            )}

            <button
              onClick={() => setQrModal(null)}
              className="mt-6 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
