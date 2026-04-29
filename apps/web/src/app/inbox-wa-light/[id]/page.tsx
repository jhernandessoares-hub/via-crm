"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import {
  Settings, X, Plus, Send, Wifi, WifiOff, QrCode, Loader2, Trash2,
  RefreshCw, Pause, Play, XCircle, ChevronLeft,
  Smile, AlertTriangle, CheckCircle, Upload, Pencil,
  ExternalLink, Search,
} from "lucide-react";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

// Memoizado fora do componente — evita re-fetch a cada render
const fetchEmojiData = async () => {
  const r = await fetch("https://cdn.jsdelivr.net/npm/@emoji-mart/data");
  return r.json();
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

type InboxStatus = {
  id: string; nome: string;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "QR_PENDING";
  qrCode: string | null; phoneNumber: string | null; pushName: string | null;
};

type Disparo = {
  id: string; nome: string; status: string;
  totalContatos: number; enviados: number; falhas: number; responderam: number;
};

type Modelo = {
  id: string; nome: string; mensagem: string;
  mediaUrl: string | null; mediaType: string | null;
  delayMinSegundos: number; delayMaxSegundos: number;
  _count: { disparos: number };
};

type Conversa = {
  type: "lead" | "campanha";
  leadId: string | null;
  contatoId: string | null;
  nome: string;
  telefone: string | null;
  avatarUrl?: string | null;
  naoLidos: number;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemDirecao: "in" | "out" | null;
};

type ContatoDetail = {
  contatoId: string;
  nome: string;
  telefone: string;
  status: string;
  enviadoEm: string | null;
  mensagemDisparo: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
};

type Msg = { id: string; direcao: "in" | "out"; texto: string | null; criadoEm: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function hora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function horaMsg(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function iniciais(n: string) {
  return n.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function getDataLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function groupByDate(msgs: Msg[]) {
  const groups: { dateKey: string; label: string; msgs: Msg[] }[] = [];
  for (const msg of msgs) {
    const key = new Date(msg.criadoEm).toDateString();
    const last = groups[groups.length - 1];
    if (last?.dateKey === key) last.msgs.push(msg);
    else groups.push({ dateKey: key, label: getDataLabel(msg.criadoEm), msgs: [msg] });
  }
  return groups;
}

const STATUS_COLOR: Record<string, string> = {
  CONNECTED: "#10b981", QR_PENDING: "#6366f1", CONNECTING: "#f59e0b", DISCONNECTED: "#6b7280",
};

// ── Separador de data ─────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3 select-none">
      <span className="text-xs px-3 py-1 rounded-full font-medium shadow-sm"
        style={{ background: "rgba(11,20,26,0.18)", color: "#fff", backdropFilter: "blur(2px)" }}>
        {label}
      </span>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: "error" | "success"; onClose: () => void }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
      style={{ background: type === "error" ? "#ef4444" : "#10b981", color: "#fff", maxWidth: 360 }}
    >
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ModalCriarModelo({
  inboxId, onClose, onSaved,
}: { inboxId: string; onClose: () => void; onSaved: (m: Modelo) => void }) {
  const [form, setForm] = useState({ nome: "", mensagem: "", delayMinSegundos: 5, delayMaxSegundos: 15 });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(v: string) {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.mensagem.length;
    const end = el.selectionEnd ?? start;
    const newMsg = form.mensagem.slice(0, start) + v + form.mensagem.slice(end);
    setForm((f) => ({ ...f, mensagem: newMsg }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); }, 0);
  }

  async function salvar() {
    if (!form.nome.trim() || !form.mensagem.trim()) { setErrMsg("Nome e mensagem são obrigatórios"); return; }
    setSalvando(true);
    setErrMsg(null);
    try {
      const modelo = await apiFetch("/campanhas/modelos", { method: "POST", body: JSON.stringify(form) });
      if (mediaFile) {
        const fd = new FormData();
        fd.append("file", mediaFile);
        await apiFetch(`/campanhas/modelos/${modelo.id}/media`, { method: "POST", body: fd, isFormData: true } as any);
      }
      const full = await apiFetch("/campanhas/modelos");
      onSaved(full.find((m: Modelo) => m.id === modelo.id) ?? modelo);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Erro ao salvar modelo");
      setSalvando(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Criar modelo de campanha" size="lg"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>Cancelar</button>
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--brand-accent)", color: "#fff" }}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar modelo
        </button>
      </>}>
      <div className="space-y-4">
        {errMsg && (
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
            {errMsg}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>NOME DA CAMPANHA</label>
          <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Black Friday 2025" className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>MENSAGEM</label>
          <div className="flex gap-2 mb-2">
            <button onClick={() => insertVar("{{nome}}")}
              className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
              {"{{"+"nome"+"}}"}
            </button>
            <button onClick={() => insertVar("{{telefone}}")}
              className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
              {"{{"+"telefone"+"}}"}
            </button>
            <button onClick={() => setShowEmoji(!showEmoji)} className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--card-border)", color: "var(--text-muted)" }}>
              <Smile className="w-3.5 h-3.5" />
            </button>
          </div>
          {showEmoji && (
            <div className="mb-2">
              <EmojiPicker
                data={fetchEmojiData}
                onEmojiSelect={(e: any) => { insertVar(e.native); setShowEmoji(false); }}
                theme="auto" locale="pt"
              />
            </div>
          )}
          <textarea ref={textRef} value={form.mensagem}
            onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
            placeholder={"Olá {{nome}}, temos uma oferta especial! 🎉"}
            rows={4} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>IMAGEM OU VÍDEO (opcional)</label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm"
            style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
            <Upload className="w-4 h-4" />
            {mediaFile ? mediaFile.name : "Selecionar arquivo"}
            <input type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>INTERVALO ENTRE ENVIOS (segundos)</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Mínimo (≥5s)</label>
              <input type="number" min={5} value={form.delayMinSegundos}
                onChange={(e) => setForm((f) => ({ ...f, delayMinSegundos: Math.max(5, +e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
            </div>
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Máximo</label>
              <input type="number" min={form.delayMinSegundos} value={form.delayMaxSegundos}
                onChange={(e) => setForm((f) => ({ ...f, delayMaxSegundos: Math.max(f.delayMinSegundos, +e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ModalAdicionarLista({
  modelo, inboxId, onClose, onDispatched,
}: { modelo: Modelo; inboxId: string; onClose: () => void; onDispatched: (d: Disparo) => void }) {
  const DDI_OPTIONS = [
    { label: "🇧🇷 +55", value: "55" },
    { label: "🇵🇹 +351", value: "351" },
    { label: "🇺🇸 +1", value: "1" },
  ];
  const [ddi, setDdi] = useState("55");
  const [listaTexto, setListaTexto] = useState("");
  const [validando, setValidando] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState<Array<{ telefone: string; nome?: string; noWhatsapp: boolean }> | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function validar() {
    const linhas = listaTexto.split("\n").filter((l) => l.trim());
    const numeros = linhas.map((l) => {
      const [tel, ...restNome] = l.split(",");
      const digits = tel.trim().replace(/\D/g, "");
      const telefone = digits.startsWith(ddi) ? digits : `${ddi}${digits}`;
      return { telefone, nome: restNome.join(",").trim() || undefined };
    });
    if (numeros.length === 0) return;

    setValidando(true);
    setErrMsg(null);
    try {
      const res = await apiFetch("/campanhas/validate-numbers", {
        method: "POST",
        body: JSON.stringify({ sessionId: inboxId, numeros: numeros.map((n) => n.telefone) }),
      });
      setResultado(numeros.map((n) => ({
        ...n,
        noWhatsapp: res.find((r: any) => r.telefone === n.telefone)?.noWhatsapp ?? false,
      })));
    } catch (e: any) {
      setErrMsg(e?.message ?? "Erro ao validar números");
    } finally {
      setValidando(false);
    }
  }

  async function iniciar() {
    if (!resultado) return;
    const contatos = resultado.filter((r) => !r.noWhatsapp);
    if (contatos.length === 0) { setErrMsg("Nenhum contato válido no WhatsApp"); return; }
    setDisparando(true);
    try {
      const disparo = await apiFetch("/campanhas/disparos", {
        method: "POST",
        body: JSON.stringify({ modeloId: modelo.id, sessionId: inboxId, contatos }),
      });
      onDispatched(disparo);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Erro ao iniciar disparo");
      setDisparando(false);
    }
  }

  const validos = resultado?.filter((r) => !r.noWhatsapp).length ?? 0;
  const invalidos = resultado?.filter((r) => r.noWhatsapp).length ?? 0;

  return (
    <Modal open={true} onClose={onClose} title="Adicionar lista" description={`Modelo: ${modelo.nome}`} size="md">
      {errMsg && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
          {errMsg}
        </div>
      )}
      {!resultado ? (
        <>
          <div className="mb-3">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>DDI PADRÃO</label>
            <div className="flex gap-2">
              {DDI_OPTIONS.map((o) => (
                <button key={o.value} onClick={() => setDdi(o.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                  style={{
                    background: ddi === o.value ? "var(--brand-accent)" : "transparent",
                    color: ddi === o.value ? "#fff" : "var(--text-muted)",
                    borderColor: ddi === o.value ? "var(--brand-accent)" : "var(--card-border)",
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
              NÚMEROS (um por linha: número, nome opcional)
            </label>
            <textarea value={listaTexto} onChange={(e) => setListaTexto(e.target.value)}
              placeholder={"11999999999, João Silva\n21988888888\n31977777777, Maria"}
              rows={6} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
          </div>
          <button onClick={validar} disabled={validando || !listaTexto.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--brand-accent)", color: "#fff" }}>
            {validando ? <><Loader2 className="w-4 h-4 animate-spin" /> Validando...</> : "Validar números"}
          </button>
        </>
      ) : (
        <>
          <div className="flex gap-4 mb-4 p-3 rounded-xl" style={{ background: "var(--shell-bg)" }}>
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: "#10b981" }}>{validos}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>No WhatsApp</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: "#ef4444" }}>{invalidos}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Fora do WhatsApp</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{resultado.length}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total</p>
            </div>
          </div>

          {invalidos > 0 && (
            <div className="mb-3 p-3 rounded-xl border" style={{ borderColor: "#f59e0b", background: "#f59e0b10" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "#f59e0b" }}>Não estão no WhatsApp:</p>
              <div className="space-y-0.5">
                {resultado.filter((r) => r.noWhatsapp).slice(0, 5).map((r) => (
                  <p key={r.telefone} className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {r.telefone}{r.nome ? ` — ${r.nome}` : ""}
                  </p>
                ))}
                {invalidos > 5 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>e mais {invalidos - 5}...</p>}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setResultado(null)} className="flex-1 py-2.5 rounded-lg text-sm border"
              style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
              Editar lista
            </button>
            <button onClick={iniciar} disabled={disparando || validos === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "#10b981", color: "#fff" }}>
              {disparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Iniciar disparo ({validos})
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ModalEditarModelo({
  modelo, onClose, onSaved,
}: { modelo: Modelo; onClose: () => void; onSaved: (m: Modelo) => void }) {
  const [form, setForm] = useState({
    nome: modelo.nome, mensagem: modelo.mensagem,
    delayMinSegundos: modelo.delayMinSegundos, delayMaxSegundos: modelo.delayMaxSegundos,
  });
  const [mediaUrl, setMediaUrl] = useState<string | null>(modelo.mediaUrl);
  const [mediaType, setMediaType] = useState<string | null>(modelo.mediaType);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function insertVar(v: string) {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? form.mensagem.length;
    const end = el.selectionEnd ?? start;
    setForm((f) => ({ ...f, mensagem: f.mensagem.slice(0, start) + v + f.mensagem.slice(end) }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); }, 0);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    setErrMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/campanhas/modelos/${modelo.id}/media`, { method: "POST", body: fd });
      setMediaUrl(res.mediaUrl);
      setMediaType(res.mediaType);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Erro ao enviar mídia");
    } finally {
      setUploadingMedia(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removerMedia() {
    setErrMsg(null);
    try {
      await apiFetch(`/campanhas/modelos/${modelo.id}/media`, { method: "DELETE" });
      setMediaUrl(null); setMediaType(null);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Erro ao remover mídia");
    }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.mensagem.trim()) { setErrMsg("Nome e mensagem são obrigatórios"); return; }
    setSalvando(true); setErrMsg(null);
    try {
      const updated = await apiFetch(`/campanhas/modelos/${modelo.id}`, { method: "PATCH", body: JSON.stringify(form) });
      onSaved({ ...modelo, ...updated, mediaUrl, mediaType });
    } catch (e: any) {
      setErrMsg(e?.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Editar: ${modelo.nome}`} size="lg"
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>Cancelar</button>
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--brand-accent)", color: "#fff" }}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
        </button>
      </>}>
      <div className="space-y-4">
        {errMsg && (
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>{errMsg}</div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>NOME</label>
          <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>MENSAGEM</label>
          <div className="flex gap-2 mb-2">
            <button onClick={() => insertVar("{{nome}}")} className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>{"{{"+"nome"+"}}"}
            </button>
            <button onClick={() => insertVar("{{telefone}}")} className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>{"{{"+"telefone"+"}}"}
            </button>
          </div>
          <textarea ref={textRef} value={form.mensagem}
            onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
            rows={4} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>MÍDIA ANEXADA</label>
          {mediaUrl ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
              {mediaType === "VIDEO"
                ? <video src={mediaUrl} className="w-24 h-16 rounded object-cover shrink-0" controls={false} />
                : <img src={mediaUrl} alt="mídia" className="w-24 h-16 rounded object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{mediaType === "VIDEO" ? "Vídeo" : "Imagem"}</p>
                <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{mediaUrl}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => fileRef.current?.click()} disabled={uploadingMedia}
                  className="px-2 py-1 rounded text-xs" style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
                  {uploadingMedia ? <Loader2 className="w-3 h-3 animate-spin" /> : "Trocar"}
                </button>
                <button onClick={removerMedia} className="px-2 py-1 rounded text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploadingMedia}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm w-full justify-center"
              style={{ borderColor: "var(--card-border)", borderStyle: "dashed", color: "var(--text-muted)" }}>
              {uploadingMedia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploadingMedia ? "Enviando..." : "Adicionar imagem ou vídeo"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Delay mínimo (≥5s)</label>
            <input type="number" min={5} value={form.delayMinSegundos}
              onChange={(e) => setForm((f) => ({ ...f, delayMinSegundos: Math.max(5, +e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
          </div>
          <div className="flex-1">
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Delay máximo</label>
            <input type="number" min={form.delayMinSegundos} value={form.delayMaxSegundos}
              onChange={(e) => setForm((f) => ({ ...f, delayMaxSegundos: Math.max(f.delayMinSegundos, +e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function InboxWALightPage() {
  const { id: inboxId } = useParams<{ id: string }>();
  const router = useRouter();

  const [inboxStatus, setInboxStatus] = useState<InboxStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [activeDisparo, setActiveDisparo] = useState<Disparo | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [leadAtivo, setLeadAtivo] = useState<string | null>(null);
  const [contatoAtivo, setContatoAtivo] = useState<ContatoDetail | null>(null);
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<{ nome: string; telefone: string | null; avatarUrl?: string | null } | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [showCriarModelo, setShowCriarModelo] = useState(false);
  const [showEditModelo, setShowEditModelo] = useState<Modelo | null>(null);
  const [showAddLista, setShowAddLista] = useState<Modelo | null>(null);
  const [qrModal, setQrModal] = useState(false);
  const [qrStatus, setQrStatus] = useState<string>("CONNECTING");
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  const [confirmCancelDisparo, setConfirmCancelDisparo] = useState(false);
  const [confirmDesconectar, setConfirmDesconectar] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const [isDark, setIsDark] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  function showToast(msg: string, type: "error" | "success" = "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
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

  // ── Fetch inicial e polling ───────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiFetch(`/inbox-wa-light/${inboxId}/status`);
      setInboxStatus(s);
      if (qrModal) { setQrStatus(s.status); if (s.status === "CONNECTED") setQrModal(false); }
    } catch {}
  }, [inboxId, qrModal]);

  const fetchModelos = useCallback(async () => {
    try { setModelos(await apiFetch("/campanhas/modelos")); } catch {}
  }, []);

  const fetchActiveDisparo = useCallback(async () => {
    try {
      const d = await apiFetch(`/campanhas/disparos/active/${inboxId}`);
      setActiveDisparo(d);
    } catch {}
  }, [inboxId]);

  const fetchConversas = useCallback(async () => {
    try { setConversas(await apiFetch(`/inbox?sessionId=${inboxId}`)); } catch {}
  }, [inboxId]);

  // fetchMensagens NÃO depende de conversas — avatarUrl vem direto da API agora
  const fetchMensagens = useCallback(async (lId: string) => {
    try {
      const d = await apiFetch(`/inbox/${lId}`);
      const novos: Msg[] = d.mensagens ?? [];
      setMensagens((prev) => {
        // Só atualiza se há mudança real — evita re-render e flickering
        if (prev.length === novos.length && prev[prev.length - 1]?.id === novos[novos.length - 1]?.id) {
          return prev;
        }
        return novos;
      });
      setConversaAtiva({ nome: d.nome, telefone: d.telefone ?? null, avatarUrl: d.avatarUrl ?? null });
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus(); fetchModelos(); fetchActiveDisparo(); fetchConversas();
    const t1 = setInterval(fetchStatus, 8000);
    const t2 = setInterval(fetchActiveDisparo, 8000);
    const t3 = setInterval(fetchConversas, 8000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [fetchStatus, fetchModelos, fetchActiveDisparo, fetchConversas]);

  useEffect(() => {
    if (pollingMsgRef.current) clearInterval(pollingMsgRef.current);
    if (!leadAtivo) { setMensagens([]); setConversaAtiva(null); return; }
    fetchMensagens(leadAtivo);
    pollingMsgRef.current = setInterval(() => fetchMensagens(leadAtivo), 5000);
    return () => { if (pollingMsgRef.current) clearInterval(pollingMsgRef.current); };
  }, [leadAtivo, fetchMensagens]);

  // Polling de mensagens para contato de campanha — verifica se virou lead
  useEffect(() => {
    if (!contatoAtivo) return;
    const t = setInterval(async () => {
      try {
        // Verifica se o contato já respondeu (lead criado)
        const d = await apiFetch(`/inbox/contato/${contatoAtivo.contatoId}`);
        setContatoAtivo(d);
        // Se já tem um lead, recarrega conversas para ele aparecer na lista
        await fetchConversas();
      } catch {}
    }, 8000);
    return () => clearInterval(t);
  }, [contatoAtivo, fetchConversas]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens]);

  // ── QR countdown ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!qrModal || !inboxStatus?.qrCode) { setQrSecondsLeft(null); return; }
    setQrSecondsLeft(55);
    const t = setInterval(() => {
      setQrSecondsLeft((s) => {
        if (s === null || s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qrModal, inboxStatus?.qrCode]);

  // ── Selecionar conversa ──────────────────────────────────────────────────

  function selecionarConversa(c: Conversa) {
    if (c.type === "campanha" && c.contatoId) {
      setLeadAtivo(null);
      setMensagens([]);
      setConversaAtiva(null);
      apiFetch(`/inbox/contato/${c.contatoId}`)
        .then((d) => setContatoAtivo(d))
        .catch(() => {});
    } else if (c.leadId) {
      setContatoAtivo(null);
      setLeadAtivo(c.leadId);
      apiFetch(`/inbox/${c.leadId}/read`, { method: "POST" }).catch(() => {});
      setConversas((prev) => prev.map((x) => x.leadId === c.leadId ? { ...x, naoLidos: 0 } : x));
    }
  }

  // ── Ações ─────────────────────────────────────────────────────────────────

  async function conectar() {
    try {
      await apiFetch(`/inbox-wa-light/${inboxId}/connect`, { method: "POST" });
      setQrModal(true);
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao conectar");
    }
  }

  async function confirmarDesconectar() {
    setConfirmDesconectar(false);
    try {
      await apiFetch(`/inbox-wa-light/${inboxId}/disconnect`, { method: "POST" });
      fetchStatus();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao desconectar");
    }
  }

  async function enviar() {
    if (!leadAtivo || !texto.trim() || enviando) return;
    const textoEnviado = texto.trim();
    setEnviando(true);
    setTexto("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      await apiFetch(`/inbox/${leadAtivo}/send`, {
        method: "POST", body: JSON.stringify({ text: textoEnviado }),
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

  async function disparoAcao(acao: "pause" | "resume" | "cancel") {
    if (!activeDisparo) return;
    if (acao === "cancel") { setConfirmCancelDisparo(true); return; }
    try {
      await apiFetch(`/campanhas/disparos/${activeDisparo.id}/${acao}`, { method: "POST" });
      fetchActiveDisparo();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao executar ação");
    }
  }

  async function confirmarCancelDisparo() {
    if (!activeDisparo) return;
    setConfirmCancelDisparo(false);
    try {
      await apiFetch(`/campanhas/disparos/${activeDisparo.id}/cancel`, { method: "POST" });
      fetchActiveDisparo();
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao cancelar disparo");
    }
  }

  async function excluirModelo(m: Modelo) {
    try {
      await apiFetch(`/campanhas/modelos/${m.id}`, { method: "DELETE" });
      setModelos((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e: any) {
      showToast(e?.message ?? "Erro ao excluir modelo");
    }
  }

  function onDispatched(d: Disparo) {
    setActiveDisparo(d);
    setShowAddLista(null);
    setSidebarOpen(false);
    fetchModelos();
  }

  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTexto(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }

  const pct = activeDisparo?.totalContatos
    ? Math.round((activeDisparo.enviados / activeDisparo.totalContatos) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell title={inboxStatus?.nome ?? "INBOX WA Light"}>
      {/* -m-6 cancela o p-6 do AppShell; h-[calc(100vh-88px)] preenche o restante após o header */}
      <div className="-m-6 flex flex-col overflow-hidden" style={{ height: "calc(100vh - 88px)" }}>

        {/* ── Barra de progresso do disparo ─────────────────────────────── */}
        {activeDisparo && (
          <div className="shrink-0 px-4 py-2 border-b flex items-center gap-3 flex-wrap"
            style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {activeDisparo.nome}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: activeDisparo.status === "RODANDO" ? "#3b82f620" : "#f59e0b20", color: activeDisparo.status === "RODANDO" ? "#3b82f6" : "#f59e0b" }}>
                  {activeDisparo.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                <span>Total: {activeDisparo.totalContatos}</span>
                <span style={{ color: "#3b82f6" }}>Enviados: {activeDisparo.enviados}</span>
                <span style={{ color: "#ef4444" }}>Erros: {activeDisparo.falhas}</span>
                <span style={{ color: "#10b981" }}>Responderam: {activeDisparo.responderam}</span>
                <span className="font-medium" style={{ color: "var(--brand-accent)" }}>{pct}%</span>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: "var(--card-border)" }}>
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--brand-accent)" }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeDisparo.status === "RODANDO" && (
                <button onClick={() => disparoAcao("pause")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: "#f59e0b20", color: "#f59e0b" }}>
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </button>
              )}
              {activeDisparo.status === "PAUSADA" && (
                <button onClick={() => disparoAcao("resume")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: "#3b82f620", color: "#3b82f6" }}>
                  <Play className="w-3.5 h-3.5" /> Retomar
                </button>
              )}
              <button onClick={() => disparoAcao("cancel")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "#ef444420", color: "#ef4444" }}>
                <XCircle className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Área principal ────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Lista de conversas */}
          <div className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
            <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--card-border)" }}>
              <div className="flex items-center gap-2">
                <button onClick={() => router.push("/inbox-wa-light")} className="p-1 rounded" style={{ color: "var(--text-muted)" }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                  {inboxStatus?.nome ?? "Inbox"}
                </span>
                <button
                  onClick={() => setSoNaoLidas(!soNaoLidas)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium"
                  style={{
                    background: soNaoLidas ? "var(--brand-accent)" : "var(--card-border)",
                    color: soNaoLidas ? "#fff" : "var(--text-muted)",
                  }}
                  title="Não lidas"
                >
                  {totalNaoLidas > 0 && (
                    <span className="text-[10px] font-bold">{totalNaoLidas}</span>
                  )}
                  {!soNaoLidas && <span className="text-[10px]">NL</span>}
                  {soNaoLidas && <X className="w-3 h-3" />}
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "var(--text-muted)" }} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-7 pr-6 py-1.5 rounded-lg text-xs border outline-none"
                  style={{ borderColor: "var(--card-border)", background: "var(--page-bg)", color: "var(--text-primary)" }}
                />
                {busca && (
                  <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversasFiltradas.length === 0 ? (
                <div className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  {conversas.length === 0 ? "Sem conversas ainda" : "Nenhuma encontrada"}
                </div>
              ) : conversasFiltradas.map((c) => {
                const isCampanha = c.type === "campanha";
                const ativa = isCampanha
                  ? contatoAtivo?.contatoId === c.contatoId
                  : leadAtivo === c.leadId;
                const temNaoLidos = c.naoLidos > 0;
                const itemKey = isCampanha ? `c-${c.contatoId}` : `l-${c.leadId}`;
                return (
                  <button key={itemKey} onClick={() => selecionarConversa(c)}
                    className="w-full text-left px-3 py-3 flex items-center gap-2.5 transition-colors"
                    style={{
                      background: ativa ? "var(--brand-accent-muted)" : "transparent",
                      borderBottom: "1px solid var(--card-border)",
                    }}>
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt={c.nome}
                          className="w-10 h-10 rounded-full object-cover"
                          style={{ border: ativa ? "2px solid var(--brand-accent)" : "2px solid transparent" }} />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: isCampanha ? "#64748b" : "var(--brand-accent)", color: "#fff" }}>
                          {iniciais(c.nome)}
                        </div>
                      )}
                      {temNaoLidos && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                          style={{ background: "#25d366", borderColor: "var(--shell-bg)" }} />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className="text-sm truncate"
                          style={{ color: "var(--text-primary)", fontWeight: temNaoLidos ? 700 : 500 }}>
                          {c.nome}
                        </span>
                        {c.ultimaMensagemEm && (
                          <span className="text-[10px] shrink-0"
                            style={{ color: temNaoLidos ? "var(--brand-accent)" : "var(--text-muted)", fontWeight: temNaoLidos ? 600 : 400 }}>
                            {hora(c.ultimaMensagemEm)}
                          </span>
                        )}
                      </div>
                      {c.telefone && (
                        <p className="text-[10px] mb-0.5 font-mono" style={{ color: "var(--text-muted)" }}>
                          {c.telefone}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs truncate"
                          style={{ color: temNaoLidos ? "var(--text-primary)" : "var(--text-muted)", fontWeight: temNaoLidos ? 500 : 400 }}>
                          {c.ultimaMensagemDirecao === "out" && (
                            <span style={{ color: "var(--text-muted)" }}>Enviado: </span>
                          )}
                          {c.ultimaMensagem ?? "Sem mensagens"}
                        </span>
                        {temNaoLidos && (
                          <span className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center shrink-0 px-1"
                            style={{ background: "#25d366", color: "#fff" }}>
                            {c.naoLidos > 99 ? "99+" : c.naoLidos}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: chatBg }}>
            {/* ── View de contato de campanha (sem lead ainda) ──────────── */}
            {contatoAtivo && !leadAtivo ? (
              <>
                <div className="px-3 py-2 border-b flex items-center gap-3"
                  style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", minHeight: 56 }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: "#64748b", color: "#fff" }}>
                    {iniciais(contatoAtivo.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {contatoAtivo.nome}
                    </p>
                    <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {contatoAtivo.telefone}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0"
                    style={{
                      background: contatoAtivo.status === "ENVIADO" ? "#3b82f620" : "#ef444420",
                      color: contatoAtivo.status === "ENVIADO" ? "#3b82f6" : "#ef4444",
                    }}>
                    {contatoAtivo.status === "ENVIADO" ? "Aguardando resposta" : contatoAtivo.status}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3" style={{ background: chatBg }}>
                  {contatoAtivo.enviadoEm && (
                    <DateSeparator label={getDataLabel(contatoAtivo.enviadoEm)} />
                  )}
                  {contatoAtivo.mensagemDisparo && (
                    <div className="flex mb-1 justify-end">
                      <div style={{
                        position: "relative", maxWidth: "72%",
                        padding: "6px 12px 8px",
                        borderRadius: "12px 12px 2px 12px",
                        background: "var(--brand-accent)", color: "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        fontSize: 14, lineHeight: 1.45,
                      }}>
                        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                          {contatoAtivo.mensagemDisparo}
                        </p>
                        {contatoAtivo.enviadoEm && (
                          <p style={{ fontSize: 11, textAlign: "right", marginTop: 2, opacity: 0.65, lineHeight: 1 }}>
                            {horaMsg(contatoAtivo.enviadoEm)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-3 py-3 flex items-center justify-center gap-2"
                  style={{ background: isDark ? "#1f2c34" : "#f0f2f5", borderTop: "1px solid var(--card-border)" }}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Aguardando resposta do contato para iniciar conversa
                  </p>
                </div>
              </>
            ) : leadAtivo && conversaAtiva ? (
              <>
                <div className="px-3 py-2 border-b flex items-center gap-3"
                  style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", minHeight: 56 }}>
                  {/* Avatar */}
                  <button onClick={() => conversaAtiva.avatarUrl && setShowPhotoModal(true)}
                    className="shrink-0 rounded-full overflow-hidden"
                    style={{ cursor: conversaAtiva.avatarUrl ? "pointer" : "default" }}>
                    {conversaAtiva.avatarUrl ? (
                      <img src={conversaAtiva.avatarUrl} alt={conversaAtiva.nome}
                        className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "var(--brand-accent)", color: "#fff" }}>
                        {iniciais(conversaAtiva.nome)}
                      </div>
                    )}
                  </button>
                  {/* Nome e telefone */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {conversaAtiva.nome}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {conversaAtiva.telefone ?? "WhatsApp Light"}
                    </p>
                  </div>
                  {/* Ações */}
                  <a href={`/leads/${leadAtivo}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium shrink-0"
                    style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
                    <ExternalLink className="w-3 h-3" /> Ver lead
                  </a>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3"
                  style={{ background: chatBg }}>
                  {groupByDate(mensagens).map((group) => (
                    <div key={group.dateKey}>
                      <DateSeparator label={group.label} />
                      {group.msgs.map((m) => {
                        const isOut = m.direcao === "out";
                        return (
                          <div key={m.id} className={`flex mb-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <div style={{
                              position: "relative",
                              maxWidth: "72%",
                              padding: "6px 12px 8px",
                              borderRadius: isOut ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                              background: isOut ? "var(--brand-accent)" : incomingBg,
                              color: isOut ? "#fff" : incomingText,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                              fontSize: 14,
                              lineHeight: 1.45,
                            }}>
                              <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                                {m.texto ?? "[mídia]"}
                              </p>
                              <p style={{
                                fontSize: 11, textAlign: "right", marginTop: 2,
                                opacity: 0.65, lineHeight: 1,
                              }}>
                                {horaMsg(m.criadoEm)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {mensagens.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm" style={{ color: isDark ? "#8696a0" : "#667781" }}>
                        Nenhuma mensagem ainda
                      </p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="px-3 py-2 flex items-end gap-2"
                  style={{ background: isDark ? "#1f2c34" : "#f0f2f5", borderTop: "1px solid var(--card-border)" }}>
                  <textarea ref={textareaRef} rows={1} value={texto}
                    onChange={handleTextoChange}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
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
                    }} />
                  <button onClick={enviar} disabled={enviando || !texto.trim()}
                    className="flex items-center justify-center disabled:opacity-40 shrink-0 transition-transform active:scale-95"
                    style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: texto.trim() ? "var(--brand-accent)" : (isDark ? "#2a3942" : "#e2e8f0"),
                      color: texto.trim() ? "#fff" : "var(--text-muted)",
                    }}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3"
                style={{ background: chatBg }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.08)" }}>
                  <Send className="w-7 h-7" style={{ color: "rgba(0,0,0,0.25)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: isDark ? "#8696a0" : "#667781" }}>
                  Selecione uma conversa
                </p>
                <p className="text-xs" style={{ color: isDark ? "#667781" : "#aab0b7" }}>
                  {conversas.length > 0 ? `${conversas.length} conversa${conversas.length !== 1 ? "s" : ""}` : "Nenhuma conversa ainda"}
                </p>
              </div>
            )}
          </div>

          {/* ── Sidebar direita ───────────────────────────────────────── */}
          <div className="shrink-0 flex border-l" style={{ borderColor: "var(--card-border)" }}>
            <div className="w-10 flex flex-col items-center py-3 gap-3" style={{ background: "var(--shell-bg)" }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg"
                style={{ color: sidebarOpen ? "var(--brand-accent)" : "var(--text-muted)", background: sidebarOpen ? "var(--brand-accent-muted)" : "transparent" }}>
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {sidebarOpen && (
              <div className="w-72 flex flex-col overflow-hidden border-l" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
                <div className="flex-1 overflow-y-auto p-3 space-y-4">

                  {/* WhatsApp conexão */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                      WhatsApp
                    </p>
                    <div className="p-3 rounded-xl border" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: STATUS_COLOR[inboxStatus?.status ?? "DISCONNECTED"] }} />
                        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {inboxStatus?.status === "CONNECTED"
                            ? (inboxStatus.phoneNumber ?? "Conectado")
                            : inboxStatus?.status === "QR_PENDING" ? "Aguardando QR"
                            : inboxStatus?.status === "CONNECTING" ? "Conectando..."
                            : "Desconectado"}
                        </span>
                        {inboxStatus?.pushName && (
                          <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{inboxStatus.pushName}</span>
                        )}
                      </div>
                      {inboxStatus?.status === "CONNECTED" ? (
                        <button onClick={() => setConfirmDesconectar(true)} className="w-full text-xs py-1.5 rounded-lg border text-center"
                          style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
                          Desconectar
                        </button>
                      ) : inboxStatus?.status === "QR_PENDING" ? (
                        <button onClick={() => setQrModal(true)} className="w-full text-xs py-1.5 rounded-lg text-center"
                          style={{ background: "#6366f1", color: "#fff" }}>
                          Ver QR Code
                        </button>
                      ) : (
                        <button onClick={conectar} className="w-full text-xs py-1.5 rounded-lg text-center"
                          style={{ background: "var(--brand-accent)", color: "#fff" }}>
                          {inboxStatus?.status === "CONNECTING" ? "Ver QR Code" : "Conectar"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Campanhas / Modelos */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        Campanhas
                      </p>
                      <button onClick={() => setShowCriarModelo(true)} className="p-1 rounded" style={{ color: "var(--brand-accent)" }}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {modelos.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>Nenhum modelo criado</p>
                    ) : (
                      <div className="space-y-2">
                        {modelos.map((m) => (
                          <div key={m.id} className="p-3 rounded-xl border"
                            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--text-primary)" }}>{m.nome}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m._count.disparos}x</span>
                                <button onClick={() => setShowEditModelo(m)} className="p-0.5 rounded"
                                  style={{ color: "var(--text-muted)" }} title="Editar modelo">
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button onClick={() => excluirModelo(m)} className="p-0.5 rounded"
                                  style={{ color: "#ef4444" }} title="Excluir modelo">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] mb-2 line-clamp-2" style={{ color: "var(--text-muted)" }}>{m.mensagem}</p>
                            <button
                              onClick={() => setShowAddLista(m)}
                              disabled={inboxStatus?.status !== "CONNECTED"}
                              className="w-full text-xs py-1.5 rounded-lg font-medium disabled:opacity-40"
                              style={{ background: "var(--brand-accent)", color: "#fff" }}>
                              Adicionar lista
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────── */}
      {showCriarModelo && (
        <ModalCriarModelo inboxId={inboxId!} onClose={() => setShowCriarModelo(false)}
          onSaved={(m) => { setModelos((prev) => [m, ...prev.filter((x) => x.id !== m.id)]); setShowCriarModelo(false); }} />
      )}

      {showAddLista && (
        <ModalAdicionarLista modelo={showAddLista} inboxId={inboxId!}
          onClose={() => setShowAddLista(null)} onDispatched={onDispatched} />
      )}

      {showEditModelo && (
        <ModalEditarModelo modelo={showEditModelo} onClose={() => setShowEditModelo(null)}
          onSaved={(m) => { setModelos((prev) => prev.map((x) => x.id === m.id ? m : x)); setShowEditModelo(null); }} />
      )}

      {/* Modal foto do contato */}
      {showPhotoModal && conversaAtiva?.avatarUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setShowPhotoModal(false)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img src={conversaAtiva.avatarUrl} alt={conversaAtiva.nome}
              className="rounded-2xl object-cover shadow-2xl"
              style={{ maxWidth: "min(360px, 90vw)", maxHeight: "min(360px, 90vh)" }} />
            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 rounded-b-2xl"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              <p className="text-white font-semibold text-sm">{conversaAtiva.nome}</p>
              {conversaAtiva.telefone && <p className="text-white/70 text-xs">{conversaAtiva.telefone}</p>}
            </div>
            <button onClick={() => setShowPhotoModal(false)}
              className="absolute top-2 right-2 p-1.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal QR Code */}
      <Modal open={qrModal && !!inboxStatus} onClose={() => setQrModal(false)}
        title="Escanear QR Code"
        description="WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo"
        size="sm">
        <div className="text-center">
          {qrStatus === "CONNECTED" ? (
            <div className="py-6">
              <Wifi className="w-12 h-12 mx-auto mb-2" style={{ color: "#10b981" }} />
              <p className="font-semibold" style={{ color: "#10b981" }}>Conectado!</p>
            </div>
          ) : inboxStatus?.qrCode ? (
            <div>
              <img src={inboxStatus.qrCode} alt="QR" className="w-48 h-48 mx-auto rounded-xl" />
              {qrSecondsLeft !== null && qrSecondsLeft > 0 && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  Expira em {qrSecondsLeft}s
                </p>
              )}
              {qrSecondsLeft === 0 && (
                <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
                  QR expirado — clique em Reconectar para gerar um novo
                </div>
              )}
            </div>
          ) : (
            <div className="py-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" style={{ color: "var(--brand-accent)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Gerando QR Code...</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal confirmar cancelar disparo */}
      <Modal open={confirmCancelDisparo} onClose={() => setConfirmCancelDisparo(false)}
        title="Cancelar disparo" size="sm"
        footer={<>
          <button onClick={() => setConfirmCancelDisparo(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>
            Voltar
          </button>
          <button onClick={confirmarCancelDisparo}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#ef4444", color: "#fff" }}>
            Cancelar disparo
          </button>
        </>}>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          Tem certeza que deseja cancelar o disparo <strong>{activeDisparo?.nome}</strong>? Esta ação não pode ser desfeita.
        </p>
      </Modal>

      {/* Modal confirmar desconectar */}
      <Modal open={confirmDesconectar} onClose={() => setConfirmDesconectar(false)}
        title="Desconectar WhatsApp" size="sm"
        footer={<>
          <button onClick={() => setConfirmDesconectar(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-muted)" }}>
            Cancelar
          </button>
          <button onClick={confirmarDesconectar}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#ef4444", color: "#fff" }}>
            Desconectar
          </button>
        </>}>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          O número será desconectado e você precisará escanear um novo QR Code para reconectar.
        </p>
      </Modal>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </AppShell>
  );
}
