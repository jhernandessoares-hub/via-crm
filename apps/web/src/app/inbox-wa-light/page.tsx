"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { Smartphone, Plus, Wifi, WifiOff, Loader2, MessageSquare, Pencil, Trash2, X } from "lucide-react";

type Inbox = {
  id: string;
  nome: string;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "QR_PENDING";
  phoneNumber: string | null;
  pushName: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  CONNECTED: "#10b981", QR_PENDING: "#6366f1", CONNECTING: "#f59e0b", DISCONNECTED: "#6b7280",
};
const STATUS_LABEL: Record<string, string> = {
  CONNECTED: "Conectado", QR_PENDING: "Aguardando QR", CONNECTING: "Conectando...", DISCONNECTED: "Desconectado",
};

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function InboxWALightListPage() {
  const router = useRouter();
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Inbox | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<Inbox | null>(null);
  const [nome, setNome] = useState("");
  const [nomeEdit, setNomeEdit] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  async function fetchInboxes() {
    try { setInboxes(await apiFetch("/inbox-wa-light")); } catch {}
  }

  useEffect(() => {
    fetchInboxes().finally(() => setLoading(false));
    const t = setInterval(fetchInboxes, 6000);
    return () => clearInterval(t);
  }, []);

  async function criar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const inbox = await apiFetch("/inbox-wa-light", { method: "POST", body: JSON.stringify({ nome: nome.trim() }) });
      router.push(`/inbox-wa-light/${inbox.id}`);
    } catch (e: unknown) {
      showToast(errorMessage(e, "Erro ao criar inbox"));
      setSalvando(false);
    }
  }

  async function editar() {
    if (!showEdit || !nomeEdit.trim()) return;
    setSalvando(true);
    try {
      await apiFetch(`/inbox-wa-light/${showEdit.id}`, { method: "PATCH", body: JSON.stringify({ nome: nomeEdit.trim() }) });
      setShowEdit(null);
      fetchInboxes();
    } catch (e: unknown) {
      showToast(errorMessage(e, "Erro ao renomear inbox"));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExcluir() {
    if (!confirmExcluir) return;
    setExcluindo(true);
    try {
      await apiFetch(`/inbox-wa-light/${confirmExcluir.id}`, { method: "DELETE" });
      setConfirmExcluir(null);
      fetchInboxes();
    } catch (e: unknown) {
      showToast(errorMessage(e, "Erro ao excluir inbox"));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <AppShell title="INBOX WA Light">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>INBOX WA Light</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Cada inbox conecta um número WhatsApp via QR Code</p>
          </div>
          <button onClick={() => { setNome(""); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--brand-accent)", color: "#fff" }}>
            <Plus className="w-4 h-4" /> Criar INBOX WA Light
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : inboxes.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum inbox criado ainda</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {inboxes.map((inbox) => (
              <div key={inbox.id} className="p-4 rounded-xl border flex items-center gap-4"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${STATUS_COLOR[inbox.status]}20` }}>
                  {inbox.status === "CONNECTED"
                    ? <Wifi className="w-5 h-5" style={{ color: STATUS_COLOR[inbox.status] }} />
                    : inbox.status === "CONNECTING"
                    ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: STATUS_COLOR[inbox.status] }} />
                    : <WifiOff className="w-5 h-5" style={{ color: STATUS_COLOR[inbox.status] }} />}
                </div>

                <button className="flex-1 min-w-0 text-left" onClick={() => router.push(`/inbox-wa-light/${inbox.id}`)}>
                  <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{inbox.nome}</p>
                  <p className="text-xs mt-0.5" style={{ color: STATUS_COLOR[inbox.status] }}>
                    {STATUS_LABEL[inbox.status]}
                    {inbox.phoneNumber && ` • ${inbox.phoneNumber}${inbox.pushName ? ` (${inbox.pushName})` : ""}`}
                  </p>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => { setShowEdit(inbox); setNomeEdit(inbox.nome); }}
                    className="p-2 rounded-lg" style={{ color: "var(--text-muted)" }} title="Renomear">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirmExcluir(inbox)}
                    className="p-2 rounded-lg" style={{ color: "#ef4444" }} title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => router.push(`/inbox-wa-light/${inbox.id}`)}
                    className="p-2 rounded-lg" style={{ color: "var(--brand-accent)" }} title="Abrir">
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="Criar INBOX WA Light"
        description="Este inbox permitirá conectar apenas um número WhatsApp via QR Code."
        size="sm"
        footer={<>
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>Cancelar</button>
          <button onClick={criar} disabled={salvando || !nome.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--brand-accent)", color: "#fff" }}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Criar
          </button>
        </>}>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
          placeholder="Ex: WhatsApp Vendas Indiretas"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
      </Modal>

      {/* Modal editar */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)}
        title="Renomear inbox" size="sm"
        footer={<>
          <button onClick={() => setShowEdit(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>Cancelar</button>
          <button onClick={editar} disabled={salvando || !nomeEdit.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--brand-accent)", color: "#fff" }}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </>}>
        <input autoFocus value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && editar()}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
      </Modal>

      {/* Modal confirmar exclusão */}
      <Modal open={!!confirmExcluir} onClose={() => setConfirmExcluir(null)}
        title="Excluir inbox" size="sm"
        footer={<>
          <button onClick={() => setConfirmExcluir(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>
            Cancelar
          </button>
          <button onClick={confirmarExcluir} disabled={excluindo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "#ef4444", color: "#fff" }}>
            {excluindo && <Loader2 className="w-4 h-4 animate-spin" />} Excluir
          </button>
        </>}>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          Tem certeza que deseja excluir o inbox <strong>{confirmExcluir?.nome}</strong>? Esta ação não pode ser desfeita.
        </p>
      </Modal>

      {toastMsg && <Toast msg={toastMsg} onClose={() => setToastMsg(null)} />}
    </AppShell>
  );
}
