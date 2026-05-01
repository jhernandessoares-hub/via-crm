"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  Clock,
  File,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Mic,
  MoreVertical,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
  Upload,
  UserRoundCheck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import {
  canSendToConversation,
  conversationKey,
  isTrackedConversation,
  normalizeWhatsappValidation,
  sendWaLightAttachment,
  sendWaLightAudio,
  sendWaLightText,
  type WaLightCampaignModel,
  type WaLightCampaignRun,
  type WaLightConversation,
  type WaLightConversationDetail,
  type WaLightInboxStatus,
  type WaLightMessage,
  type WaLightStatus,
  type WaLightValidatedNumber,
} from "@/lib/wa-light";

const STATUS_COLOR: Record<WaLightStatus, string> = {
  CONNECTED: "#10b981",
  QR_PENDING: "#6366f1",
  CONNECTING: "#f59e0b",
  DISCONNECTED: "#6b7280",
};

const STATUS_LABEL: Record<WaLightStatus, string> = {
  CONNECTED: "Conectado",
  QR_PENDING: "Aguardando QR",
  CONNECTING: "Conectando",
  DISCONNECTED: "Desconectado",
};

function initials(name: string) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatListTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", weekday: "long" });
}

function groupMessages(messages: WaLightMessage[]) {
  const groups: Array<{ key: string; label: string; items: WaLightMessage[] }> = [];
  for (const message of messages) {
    const key = new Date(message.criadoEm).toDateString();
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(message);
    else groups.push({ key, label: dateLabel(message.criadoEm), items: [message] });
  }
  return groups;
}

function Toast({
  msg,
  type,
  onClose,
}: {
  msg: string;
  type: "error" | "success";
  onClose: () => void;
}) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex max-w-[380px] items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
      style={{ background: type === "error" ? "#ef4444" : "#10b981", color: "#fff" }}
    >
      <span className="flex-1">{msg}</span>
      <button type="button" onClick={onClose} className="opacity-75 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: WaLightStatus }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: STATUS_COLOR[status] }}
    />
  );
}

function ConversationAvatar({
  name,
  avatarUrl,
  tracked,
}: {
  name: string;
  avatarUrl?: string | null;
  tracked?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
          style={{ background: tracked ? "#64748b" : "var(--brand-accent)", color: "#fff" }}
        >
          {initials(name)}
        </div>
      )}
      {tracked && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2"
          style={{ background: "#f59e0b", borderColor: "var(--shell-bg)", color: "#fff" }}
          title="Conversa acompanhada por campanha"
        >
          <LinkIcon className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}

function MessageMedia({ message }: { message: WaLightMessage }) {
  const src = message.mediaUrl;
  const type = String(message.mediaType || "").toLowerCase();
  if (!src) return null;

  if (type.includes("image")) {
    return <img src={src} alt={message.filename || "Imagem"} className="mb-2 max-h-72 rounded-md object-contain" />;
  }

  if (type.includes("video")) {
    return <video src={src} controls className="mb-2 max-h-72 w-full rounded-md" />;
  }

  if (type.includes("audio")) {
    return (
      <audio controls className="mb-2 w-64 max-w-full">
        <source src={src} type={message.mimeType || "audio/ogg"} />
      </audio>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs"
      style={{ background: "rgba(255,255,255,0.16)", color: "inherit" }}
    >
      <File className="h-4 w-4" />
      <span className="truncate">{message.filename || "Arquivo"}</span>
    </a>
  );
}

function MessageBubble({ message, incomingBg, incomingText }: {
  message: WaLightMessage;
  incomingBg: string;
  incomingText: string;
}) {
  const outgoing = message.direcao === "out";

  return (
    <div className={`mb-1 flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[74%] rounded-lg px-3 py-2 text-sm shadow-sm"
        style={{
          background: outgoing ? "var(--brand-accent)" : incomingBg,
          color: outgoing ? "#fff" : incomingText,
          borderBottomRightRadius: outgoing ? 2 : 12,
          borderBottomLeftRadius: outgoing ? 12 : 2,
        }}
      >
        <MessageMedia message={message} />
        {message.texto && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.texto}</p>
        )}
        {!message.texto && !message.mediaUrl && <p className="opacity-80">[mensagem]</p>}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          <span>{formatMessageTime(message.criadoEm)}</span>
          {outgoing && <span>{message.status === "READ" ? "✓✓" : "✓"}</span>}
        </div>
      </div>
    </div>
  );
}

function CampaignModelModal({
  model,
  onClose,
  onSaved,
}: {
  model?: WaLightCampaignModel | null;
  onClose: () => void;
  onSaved: (model: WaLightCampaignModel) => void;
}) {
  const [form, setForm] = useState({
    nome: model?.nome ?? "",
    mensagem: model?.mensagem ?? "",
    delayMinSegundos: model?.delayMinSegundos ?? 8,
    delayMaxSegundos: model?.delayMaxSegundos ?? 24,
  });
  const [mediaUrl, setMediaUrl] = useState<string | null>(model?.mediaUrl ?? null);
  const [mediaType, setMediaType] = useState<string | null>(model?.mediaType ?? null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(value: string) {
    const el = textRef.current;
    if (!el) {
      setForm((prev) => ({ ...prev, mensagem: prev.mensagem + value }));
      return;
    }
    const start = el.selectionStart ?? form.mensagem.length;
    const end = el.selectionEnd ?? start;
    const next = form.mensagem.slice(0, start) + value + form.mensagem.slice(end);
    setForm((prev) => ({ ...prev, mensagem: next }));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    }, 0);
  }

  async function save() {
    if (!form.nome.trim() || !form.mensagem.trim()) {
      setError("Nome e mensagem são obrigatórios.");
      return;
    }
    if (form.delayMaxSegundos < form.delayMinSegundos) {
      setError("O delay máximo precisa ser maior ou igual ao mínimo.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch(model ? `/campanhas/modelos/${model.id}` : "/campanhas/modelos", {
        method: model ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });

      let finalModel: WaLightCampaignModel = {
        ...(model ?? {}),
        ...saved,
        mediaUrl,
        mediaType,
      };

      if (mediaFile) {
        const fd = new FormData();
        fd.append("file", mediaFile);
        const media = await apiFetch(`/campanhas/modelos/${saved.id}/media`, {
          method: "POST",
          body: fd,
        });
        finalModel = { ...finalModel, mediaUrl: media.mediaUrl, mediaType: media.mediaType };
      }

      onSaved(finalModel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMedia() {
    if (!model?.id) {
      setMediaFile(null);
      setMediaUrl(null);
      setMediaType(null);
      return;
    }

    try {
      await apiFetch(`/campanhas/modelos/${model.id}/media`, { method: "DELETE" });
      setMediaFile(null);
      setMediaUrl(null);
      setMediaType(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao remover mídia.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={model ? "Editar modelo de campanha" : "Criar modelo de campanha"}
      description="Mensagem, variáveis, mídia opcional e intervalo de disparo."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--brand-accent)", color: "#fff" }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar modelo
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Nome
          </label>
          <input
            value={form.nome}
            onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            placeholder="Ex: Reativação Abril"
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Mensagem
            </label>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => insertVar("{{nome}}")} className="rounded px-2 py-1 text-xs font-mono" style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
                {"{{nome}}"}
              </button>
              <button type="button" onClick={() => insertVar("{{telefone}}")} className="rounded px-2 py-1 text-xs font-mono" style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}>
                {"{{telefone}}"}
              </button>
            </div>
          </div>
          <textarea
            ref={textRef}
            value={form.mensagem}
            onChange={(event) => setForm((prev) => ({ ...prev, mensagem: event.target.value }))}
            rows={5}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
            placeholder="Olá {{nome}}, tudo bem? Tenho uma oportunidade para te mostrar."
            style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Mídia opcional
          </label>
          {mediaUrl || mediaFile ? (
            <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
              <ImageIcon className="h-5 w-5 shrink-0" style={{ color: "var(--brand-accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{mediaFile?.name ?? mediaUrl}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{mediaType ?? mediaFile?.type ?? "Mídia anexada"}</p>
              </div>
              <button type="button" onClick={removeMedia} className="rounded p-2" style={{ color: "#ef4444" }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm" style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
              <Upload className="h-4 w-4" />
              Adicionar imagem ou vídeo
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Delay mínimo</label>
            <input
              type="number"
              min={5}
              value={form.delayMinSegundos}
              onChange={(event) => setForm((prev) => ({ ...prev, delayMinSegundos: Math.max(5, Number(event.target.value) || 5) }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Delay máximo</label>
            <input
              type="number"
              min={form.delayMinSegundos}
              value={form.delayMaxSegundos}
              onChange={(event) => setForm((prev) => ({ ...prev, delayMaxSegundos: Math.max(prev.delayMinSegundos, Number(event.target.value) || prev.delayMinSegundos) }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddListModal({
  model,
  inboxId,
  onClose,
  onDispatched,
}: {
  model: WaLightCampaignModel;
  inboxId: string;
  onClose: () => void;
  onDispatched: (run: WaLightCampaignRun) => void;
}) {
  const [ddi, setDdi] = useState("55");
  const [rawList, setRawList] = useState("");
  const [validating, setValidating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<WaLightValidatedNumber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = result?.filter((item) => item.existsOnWhatsapp && !item.invalidFormat && !item.duplicate) ?? [];
  const unavailable = result?.filter((item) => !item.existsOnWhatsapp || item.invalidFormat || item.duplicate) ?? [];

  function parseList() {
    return rawList
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [phone, ...nameParts] = line.split(",");
        const digits = phone.replace(/\D/g, "");
        const telefone = digits.startsWith(ddi) ? digits : `${ddi}${digits}`;
        return { telefone, nome: nameParts.join(",").trim() || undefined };
      });
  }

  async function validate() {
    const numbers = parseList();
    if (numbers.length === 0) return;

    setValidating(true);
    setError(null);
    try {
      const response = await apiFetch("/campanhas/validate-numbers", {
        method: "POST",
        body: JSON.stringify({ sessionId: inboxId, numeros: numbers.map((item) => item.telefone) }),
      });
      setResult(normalizeWhatsappValidation(numbers, response));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao validar números.");
    } finally {
      setValidating(false);
    }
  }

  async function dispatch() {
    if (valid.length === 0) return;
    setDispatching(true);
    setError(null);
    try {
      const run = await apiFetch("/campanhas/disparos", {
        method: "POST",
        body: JSON.stringify({
          modeloId: model.id,
          sessionId: inboxId,
          contatos: valid,
          source: "INBOX_WA_LIGHT",
          createTrackedConversations: true,
          leadOnReply: {
            stage: "Pré atendimento",
            status: "NOVO LEAD",
            preserveSessionId: true,
          },
        }),
      });
      onDispatched(run);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar disparo.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Adicionar lista" description={`Modelo: ${model.nome}`} size="lg">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>
            {error}
          </div>
        )}

        {!result ? (
          <>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                DDI padrão
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["55", "Brasil +55"],
                  ["351", "Portugal +351"],
                  ["1", "EUA +1"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDdi(value)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium"
                    style={{
                      background: ddi === value ? "var(--brand-accent)" : "transparent",
                      color: ddi === value ? "#fff" : "var(--text-muted)",
                      borderColor: ddi === value ? "var(--brand-accent)" : "var(--card-border)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Lista de contatos
              </label>
              <textarea
                value={rawList}
                onChange={(event) => setRawList(event.target.value)}
                rows={8}
                className="w-full resize-none rounded-lg border px-3 py-2 font-mono text-sm outline-none"
                placeholder={"11999999999, João Silva\n21988888888\n31977777777, Maria"}
                style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
              />
            </div>

            <button
              type="button"
              onClick={validate}
              disabled={validating || !rawList.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--brand-accent)", color: "#fff" }}
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validar números
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--shell-bg)" }}>
                <p className="text-2xl font-bold" style={{ color: "#10b981" }}>{valid.length}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>No WhatsApp</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--shell-bg)" }}>
                <p className="text-2xl font-bold" style={{ color: "#ef4444" }}>{unavailable.length}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Revisar</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--shell-bg)" }}>
                <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{result.length}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total</p>
              </div>
            </div>

            {unavailable.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "#f59e0b", background: "#f59e0b10" }}>
                <p className="mb-2 text-xs font-semibold" style={{ color: "#f59e0b" }}>Números que precisam de verificação</p>
                <div className="space-y-1">
                  {unavailable.map((item) => (
                    <p key={`${item.telefone}-${item.nome ?? ""}`} className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {item.telefone}{item.nome ? ` - ${item.nome}` : ""}{" "}
                      {item.duplicate ? "(duplicado)" : item.invalidFormat ? "(formato inválido)" : "(fora do WhatsApp)"}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setResult(null)} className="flex-1 rounded-lg border py-2.5 text-sm" style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
                Editar lista
              </button>
              <button
                type="button"
                onClick={dispatch}
                disabled={dispatching || valid.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: "#10b981", color: "#fff" }}
              >
                {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Iniciar disparo ({valid.length})
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function InboxWALightPage() {
  const { id: inboxIdParam } = useParams<{ id: string }>();
  const inboxId = String(inboxIdParam || "");
  const router = useRouter();

  const [status, setStatus] = useState<WaLightInboxStatus | null>(null);
  const [conversations, setConversations] = useState<WaLightConversation[]>([]);
  const [models, setModels] = useState<WaLightCampaignModel[]>([]);
  const [activeRun, setActiveRun] = useState<WaLightCampaignRun | null>(null);
  const [activeConversation, setActiveConversation] = useState<WaLightConversation | null>(null);
  const [conversationDetail, setConversationDetail] = useState<WaLightConversationDetail | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "tracked" | "leads">("all");
  const [rightOpen, setRightOpen] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  const [showModelModal, setShowModelModal] = useState<WaLightCampaignModel | null | "new">(null);
  const [showListModal, setShowListModal] = useState<WaLightCampaignModel | null>(null);
  const [confirmCancelRun, setConfirmCancelRun] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const activeKey = activeConversation ? conversationKey(activeConversation) : null;
  const chatBg = isDark ? "#0b141a" : "#eae6df";
  const incomingBg = isDark ? "#1f2c34" : "#fff";
  const incomingText = isDark ? "#e9edef" : "#111b21";

  function showToast(msg: string, type: "error" | "success" = "error") {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 4200);
  }

  const fetchStatus = useCallback(async () => {
    try {
      const next = await apiFetch(`/inbox-wa-light/${inboxId}/status`);
      setStatus(next);
      if (next.status === "CONNECTED") setQrOpen(false);
    } catch {}
  }, [inboxId]);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await apiFetch(`/inbox?sessionId=${inboxId}&includeAll=true`);
      setConversations(Array.isArray(data) ? data : data.items ?? []);
    } catch {}
  }, [inboxId]);

  const fetchModels = useCallback(async () => {
    try {
      setModels(await apiFetch("/campanhas/modelos"));
    } catch {}
  }, []);

  const fetchActiveRun = useCallback(async () => {
    try {
      setActiveRun(await apiFetch(`/campanhas/disparos/active/${inboxId}`));
    } catch {
      setActiveRun(null);
    }
  }, [inboxId]);

  const fetchConversationDetail = useCallback(async (conversation: WaLightConversation) => {
    setLoadingDetail(true);
    try {
      if (conversation.leadId) {
        const detail = await apiFetch(`/inbox/${conversation.leadId}`);
        setConversationDetail({
          ...detail,
          leadId: conversation.leadId,
          tracked: isTrackedConversation(conversation),
          campaignId: conversation.campaignId ?? null,
          mensagens: detail.mensagens ?? [],
        });
        return;
      }

      if (conversation.contatoId) {
        const detail = await apiFetch(`/inbox/contato/${conversation.contatoId}`);
        setConversationDetail({
          nome: detail.nome,
          telefone: detail.telefone,
          tracked: true,
          campaignId: conversation.campaignId ?? null,
          mensagens: detail.mensagemDisparo
            ? [{
                id: `campaign-${detail.contatoId}`,
                direcao: "out",
                texto: detail.mensagemDisparo,
                criadoEm: detail.enviadoEm ?? new Date().toISOString(),
                mediaUrl: detail.mediaUrl,
                mediaType: detail.mediaType,
              }]
            : [],
        });
        return;
      }

      const chatRef = conversation.chatId ?? conversation.remoteJid ?? conversation.telefone;
      const detail = await apiFetch(`/inbox-wa-light/${inboxId}/conversations/${encodeURIComponent(String(chatRef))}`);
      setConversationDetail({ ...detail, mensagens: detail.mensagens ?? [] });
    } catch (err: unknown) {
      setConversationDetail({
        nome: conversation.nome,
        telefone: conversation.telefone,
        avatarUrl: conversation.avatarUrl,
        leadId: conversation.leadId ?? null,
        tracked: isTrackedConversation(conversation),
        mensagens: [],
      });
      if (!conversation.leadId && !conversation.contatoId) {
        showToast(err instanceof Error ? err.message : "Não foi possível carregar o histórico da conversa.");
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [inboxId]);

  useEffect(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains("dark"));
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConversations();
    fetchModels();
    fetchActiveRun();
    const statusTimer = window.setInterval(fetchStatus, 7000);
    const conversationTimer = window.setInterval(fetchConversations, 5000);
    const runTimer = window.setInterval(fetchActiveRun, 7000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(conversationTimer);
      window.clearInterval(runTimer);
    };
  }, [fetchActiveRun, fetchConversations, fetchModels, fetchStatus]);

  useEffect(() => {
      if (!activeConversation) {
      setConversationDetail(null);
      return;
    }

    fetchConversationDetail(activeConversation);
    const timer = window.setInterval(() => fetchConversationDetail(activeConversation), 5000);
    return () => window.clearInterval(timer);
  }, [activeConversation, fetchConversationDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationDetail?.mensagens.length, activeKey]);

  useEffect(() => {
    if (!qrOpen || !status?.qrCode) {
      setQrSecondsLeft(null);
      return;
    }
    setQrSecondsLeft(55);
    const timer = window.setInterval(() => {
      setQrSecondsLeft((current) => {
        if (current === null || current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [qrOpen, status?.qrCode]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [audioUrl]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.naoLidos <= 0) return false;
      if (filter === "tracked" && !isTrackedConversation(conversation)) return false;
      if (filter === "leads" && !conversation.leadId) return false;
      if (!q) return true;
      return [conversation.nome, conversation.telefone, conversation.ultimaMensagem]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [conversations, filter, search]);

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + Number(conversation.naoLidos || 0), 0),
    [conversations],
  );

  const activeProgress = activeRun?.totalContatos
    ? Math.round((activeRun.enviados / activeRun.totalContatos) * 100)
    : 0;

  function selectConversation(conversation: WaLightConversation) {
    setActiveConversation(conversation);
    if (conversation.leadId) {
      apiFetch(`/inbox/${conversation.leadId}/read`, { method: "POST" }).catch(() => {});
    }
    setConversations((current) => current.map((item) => (
      conversationKey(item) === conversationKey(conversation) ? { ...item, naoLidos: 0 } : item
    )));
  }

  async function connect() {
    try {
      await apiFetch(`/inbox-wa-light/${inboxId}/connect`, { method: "POST" });
      await fetchStatus();
      setQrOpen(true);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao conectar.");
    }
  }

  async function disconnect() {
    setConfirmDisconnect(false);
    try {
      await apiFetch(`/inbox-wa-light/${inboxId}/disconnect`, { method: "POST" });
      await fetchStatus();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao desconectar.");
    }
  }

  async function sendText() {
    const trimmed = text.trim();
    if (!activeConversation || !trimmed || sending || !canSendToConversation(activeConversation)) return;

    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      await sendWaLightText(inboxId, activeConversation, trimmed);
      await fetchConversationDetail(activeConversation);
      await fetchConversations();
    } catch (err: unknown) {
      setText(trimmed);
      showToast(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!activeConversation || sending || !canSendToConversation(activeConversation)) return;
    setSending(true);
    try {
      await sendWaLightAttachment(inboxId, activeConversation, file);
      await fetchConversationDetail(activeConversation);
      await fetchConversations();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao enviar arquivo.");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function stopStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function startRecording() {
    if (recording) return;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stopStream();
      };
      recorder.start();
      setRecording(true);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Não foi possível acessar o microfone.");
      stopStream();
    }
  }

  function stopRecording() {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } finally {
      setRecording(false);
    }
  }

  function discardAudio() {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  async function sendAudio() {
    if (!activeConversation || !audioBlob || sending) return;
    setSending(true);
    try {
      await sendWaLightAudio(inboxId, activeConversation, audioBlob);
      discardAudio();
      await fetchConversationDetail(activeConversation);
      await fetchConversations();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao enviar áudio.");
    } finally {
      setSending(false);
    }
  }

  async function runAction(action: "pause" | "resume" | "cancel") {
    if (!activeRun) return;
    if (action === "cancel") {
      setConfirmCancelRun(true);
      return;
    }

    try {
      await apiFetch(`/campanhas/disparos/${activeRun.id}/${action}`, { method: "POST" });
      await fetchActiveRun();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao executar ação.");
    }
  }

  async function confirmCancelCampaignRun() {
    if (!activeRun) return;
    setConfirmCancelRun(false);
    try {
      await apiFetch(`/campanhas/disparos/${activeRun.id}/cancel`, { method: "POST" });
      await fetchActiveRun();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao cancelar disparo.");
    }
  }

  async function deleteModel(model: WaLightCampaignModel) {
    try {
      await apiFetch(`/campanhas/modelos/${model.id}`, { method: "DELETE" });
      setModels((current) => current.filter((item) => item.id !== model.id));
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erro ao excluir modelo.");
    }
  }

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 132)}px`;
    }
  }

  return (
    <AppShell title={status?.nome ?? "INBOX WA Light"}>
      <div className="-m-6 flex overflow-hidden" style={{ height: "calc(100vh - 88px)" }}>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) sendFile(file);
          }}
        />

        <aside className="flex w-[360px] shrink-0 flex-col border-r" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
          <div className="border-b px-3 py-3" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
            <div className="mb-3 flex items-center gap-2">
              <button type="button" onClick={() => router.push("/inbox-wa-light")} className="rounded-lg p-2" style={{ color: "var(--text-muted)" }}>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{status?.nome ?? "INBOX WA Light"}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  <StatusDot status={status?.status ?? "DISCONNECTED"} />
                  <span>{STATUS_LABEL[status?.status ?? "DISCONNECTED"]}</span>
                  {status?.phoneNumber && <span className="truncate">- {status.phoneNumber}</span>}
                </div>
              </div>
              <button type="button" onClick={() => setRightOpen((open) => !open)} className="rounded-lg p-2" style={{ color: rightOpen ? "var(--brand-accent)" : "var(--text-muted)" }}>
                <Settings className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar ou começar uma conversa"
                className="w-full rounded-lg border py-2 pl-9 pr-8 text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--page-bg)", color: "var(--text-primary)" }}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1 overflow-x-auto">
              {[
                ["all", "Todas"],
                ["unread", `Não lidas${unreadTotal ? ` ${unreadTotal}` : ""}`],
                ["tracked", "Acompanhadas"],
                ["leads", "Leads"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value as typeof filter)}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    background: filter === value ? "var(--brand-accent)" : "var(--page-bg)",
                    color: filter === value ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                <WifiOff className="mb-3 h-8 w-8 opacity-40" />
                {conversations.length === 0 ? "Nenhuma conversa carregada para esta sessão." : "Nenhuma conversa encontrada."}
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const tracked = isTrackedConversation(conversation);
                const selected = activeKey === conversationKey(conversation);
                return (
                  <button
                    key={conversationKey(conversation)}
                    type="button"
                    onClick={() => selectConversation(conversation)}
                    className="flex w-full items-center gap-3 border-b px-3 py-3 text-left"
                    style={{
                      borderColor: "var(--card-border)",
                      background: selected ? "var(--brand-accent-muted)" : "transparent",
                    }}
                  >
                    <ConversationAvatar name={conversation.nome} avatarUrl={conversation.avatarUrl} tracked={tracked} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{conversation.nome}</p>
                        <span className="shrink-0 text-[11px]" style={{ color: conversation.naoLidos > 0 ? "var(--brand-accent)" : "var(--text-muted)" }}>
                          {formatListTime(conversation.ultimaMensagemEm)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs" style={{ color: conversation.naoLidos > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {conversation.ultimaMensagemDirecao === "out" && "Você: "}
                          {conversation.ultimaMensagem ?? conversation.telefone ?? "Sem mensagens"}
                        </p>
                        {conversation.naoLidos > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold" style={{ background: "#25d366", color: "#fff" }}>
                            {conversation.naoLidos > 99 ? "99+" : conversation.naoLidos}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        {tracked && !conversation.leadId && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#f59e0b20", color: "#f59e0b" }}>
                            Campanha
                          </span>
                        )}
                        {tracked && conversation.leadId && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#10b98120", color: "#10b981" }}>
                            Campanha com resposta
                          </span>
                        )}
                        {!tracked && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#10b98120", color: "#10b981" }}>
                            Lead
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: chatBg }}>
          {activeRun && (
            <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{activeRun.nome}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#3b82f620", color: "#3b82f6" }}>{activeRun.status}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{activeProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--card-border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${activeProgress}%`, background: "var(--brand-accent)" }} />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {activeRun.status === "RODANDO" && (
                    <button type="button" onClick={() => runAction("pause")} className="rounded-lg p-2" style={{ color: "#f59e0b", background: "#f59e0b20" }}>
                      <Pause className="h-4 w-4" />
                    </button>
                  )}
                  {activeRun.status === "PAUSADA" && (
                    <button type="button" onClick={() => runAction("resume")} className="rounded-lg p-2" style={{ color: "#3b82f6", background: "#3b82f620" }}>
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => runAction("cancel")} className="rounded-lg p-2" style={{ color: "#ef4444", background: "#ef444420" }}>
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeConversation && conversationDetail ? (
            <>
              <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
                <ConversationAvatar
                  name={conversationDetail.nome}
                  avatarUrl={conversationDetail.avatarUrl}
                  tracked={isTrackedConversation(activeConversation)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{conversationDetail.nome}</p>
                  <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {conversationDetail.telefone ?? activeConversation.telefone ?? "WhatsApp Light"}
                    {isTrackedConversation(activeConversation) && " - acompanhado por campanha"}
                  </p>
                </div>
                {activeConversation.leadId && (
                  <a
                    href={`/leads/${activeConversation.leadId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--brand-accent-muted)", color: "var(--brand-accent)" }}
                  >
                    <UserRoundCheck className="h-3.5 w-3.5" />
                    Ver Lead
                  </a>
                )}
                <button type="button" className="rounded-lg p-2" style={{ color: "var(--text-muted)" }}>
                  <MoreVertical className="h-4 w-4" />
                </button>
              </header>

              <section className="flex-1 overflow-y-auto px-4 py-4">
                {loadingDetail && conversationDetail.mensagens.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : conversationDetail.mensagens.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center" style={{ color: isDark ? "#8696a0" : "#667781" }}>
                    <Send className="h-8 w-8 opacity-40" />
                    <p className="text-sm">Nenhuma mensagem nesta conversa.</p>
                  </div>
                ) : (
                  groupMessages(conversationDetail.mensagens).map((group) => (
                    <div key={group.key}>
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full px-3 py-1 text-xs font-medium shadow-sm" style={{ background: "rgba(11,20,26,0.18)", color: "#fff" }}>
                          {group.label}
                        </span>
                      </div>
                      {group.items.map((message) => (
                        <MessageBubble key={message.id} message={message} incomingBg={incomingBg} incomingText={incomingText} />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </section>

              {audioUrl && (
                <div className="shrink-0 border-t px-4 py-2" style={{ borderColor: "var(--card-border)", background: isDark ? "#1f2c34" : "#f0f2f5" }}>
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: isDark ? "#2a3942" : "#fff" }}>
                    <audio controls className="min-w-0 flex-1">
                      <source src={audioUrl} />
                    </audio>
                    <button type="button" onClick={discardAudio} className="rounded-lg p-2" style={{ color: "#ef4444" }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={sendAudio} disabled={sending} className="rounded-lg p-2 disabled:opacity-50" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <footer className="flex shrink-0 items-end gap-2 px-4 py-3" style={{ background: isDark ? "#1f2c34" : "#f0f2f5", borderTop: "1px solid var(--card-border)" }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50" style={{ color: "var(--text-muted)" }}>
                  <Paperclip className="h-5 w-5" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendText();
                    }
                  }}
                  rows={1}
                  placeholder={canSendToConversation(activeConversation) ? "Digite uma mensagem" : "Conversa sem destino de envio"}
                  disabled={!canSendToConversation(activeConversation)}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-[20px] px-4 py-2.5 text-sm outline-none disabled:opacity-60"
                  style={{ background: isDark ? "#2a3942" : "#fff", color: "var(--text-primary)" }}
                />
                {text.trim() ? (
                  <button type="button" onClick={sendText} disabled={sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={sending || !canSendToConversation(activeConversation)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                    style={{ background: recording ? "#ef4444" : "var(--brand-accent)", color: "#fff" }}
                  >
                    {recording ? <CircleStop className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
              </footer>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center" style={{ color: isDark ? "#8696a0" : "#667781" }}>
              <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                <Wifi className="h-9 w-9 opacity-40" />
              </div>
              <p className="text-base font-medium">Selecione uma conversa</p>
              <p className="max-w-sm text-sm">Após conectar o QR Code, esta tela deve carregar as conversas da sessão como no WhatsApp Web.</p>
            </div>
          )}
        </main>

        {rightOpen && (
          <aside className="flex w-[330px] shrink-0 flex-col border-l" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
            <div className="flex-1 overflow-y-auto p-4">
              <section className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Conexão</p>
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
                  <div className="mb-3 flex items-center gap-2">
                    <StatusDot status={status?.status ?? "DISCONNECTED"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {status?.status ? STATUS_LABEL[status.status] : "Carregando"}
                      </p>
                      <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {status?.phoneNumber ?? status?.pushName ?? "Nenhum número conectado"}
                      </p>
                    </div>
                  </div>
                  {status?.status === "CONNECTED" ? (
                    <button type="button" onClick={() => setConfirmDisconnect(true)} className="w-full rounded-lg border py-2 text-xs font-medium" style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
                      Desconectar
                    </button>
                  ) : status?.status === "QR_PENDING" ? (
                    <button type="button" onClick={() => setQrOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium" style={{ background: "#6366f1", color: "#fff" }}>
                      <QrCode className="h-4 w-4" />
                      Ver QR Code
                    </button>
                  ) : (
                    <button type="button" onClick={connect} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                      <RefreshCw className="h-4 w-4" />
                      Conectar
                    </button>
                  )}
                </div>
              </section>

              {activeConversation && (
                <section className="mb-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Acompanhamento</p>
                  <div className="rounded-lg border p-3" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
                    {isTrackedConversation(activeConversation) ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2" style={{ color: "#f59e0b" }}>
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-semibold">Conversa de campanha</span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          Se o contato responder, o backend deve criar o lead em Pré atendimento / NOVO LEAD e preservar este inbox como origem.
                        </p>
                        {activeConversation.leadId ? (
                          <a href={`/leads/${activeConversation.leadId}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                            <UserRoundCheck className="h-4 w-4" />
                            Ver Lead
                          </a>
                        ) : (
                          <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "#f59e0b14", color: "#f59e0b" }}>
                            Aguardando resposta para virar lead.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Conversa normal do WhatsApp Light.
                      </p>
                    )}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Campanhas</p>
                  <button type="button" onClick={() => setShowModelModal("new")} className="rounded p-1" style={{ color: "var(--brand-accent)" }}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {models.length === 0 ? (
                  <p className="rounded-lg py-6 text-center text-sm" style={{ background: "var(--shell-bg)", color: "var(--text-muted)" }}>
                    Nenhum modelo criado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {models.map((model) => (
                      <div key={model.id} className="rounded-lg border p-3" style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)" }}>
                        <div className="mb-1 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{model.nome}</p>
                            <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>{model.mensagem}</p>
                          </div>
                          <button type="button" onClick={() => setShowModelModal(model)} className="rounded p-1" style={{ color: "var(--text-muted)" }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => deleteModel(model)} className="rounded p-1" style={{ color: "#ef4444" }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          <Clock className="h-3.5 w-3.5" />
                          {model.delayMinSegundos}s - {model.delayMaxSegundos}s
                          {model.mediaUrl && <span>+ mídia</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowListModal(model)}
                          disabled={status?.status !== "CONNECTED"}
                          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium disabled:opacity-40"
                          style={{ background: "var(--brand-accent)", color: "#fff" }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Adicionar lista
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        )}
      </div>

      <Modal open={qrOpen && !!status} onClose={() => setQrOpen(false)} title="Escanear QR Code" description="WhatsApp > Dispositivos conectados > Conectar dispositivo" size="sm">
        <div className="text-center">
          {status?.status === "CONNECTED" ? (
            <div className="py-8">
              <Wifi className="mx-auto mb-2 h-12 w-12" style={{ color: "#10b981" }} />
              <p className="font-semibold" style={{ color: "#10b981" }}>Conectado</p>
            </div>
          ) : status?.qrCode ? (
            <div>
              <img src={status.qrCode} alt="QR Code" className="mx-auto h-56 w-56 rounded-lg" />
              {qrSecondsLeft !== null && qrSecondsLeft > 0 && (
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Expira em {qrSecondsLeft}s</p>
              )}
              {qrSecondsLeft === 0 && (
                <button type="button" onClick={connect} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                  <RefreshCw className="h-4 w-4" />
                  Reconectar e gerar novo QR
                </button>
              )}
            </div>
          ) : (
            <div className="py-8">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" style={{ color: "var(--brand-accent)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Gerando QR Code...</p>
            </div>
          )}
        </div>
      </Modal>

      {showModelModal && (
        <CampaignModelModal
          model={showModelModal === "new" ? null : showModelModal}
          onClose={() => setShowModelModal(null)}
          onSaved={(saved) => {
            setModels((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            setShowModelModal(null);
            showToast("Modelo salvo.", "success");
          }}
        />
      )}

      {showListModal && (
        <AddListModal
          model={showListModal}
          inboxId={inboxId}
          onClose={() => setShowListModal(null)}
          onDispatched={(run) => {
            setActiveRun(run);
            setShowListModal(null);
            setRightOpen(false);
            fetchConversations();
            showToast("Disparo iniciado.", "success");
          }}
        />
      )}

      <Modal
        open={confirmCancelRun}
        onClose={() => setConfirmCancelRun(false)}
        title="Cancelar disparo"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setConfirmCancelRun(false)} className="rounded-lg px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>Voltar</button>
            <button type="button" onClick={confirmCancelCampaignRun} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "#ef4444", color: "#fff" }}>Cancelar disparo</button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          Tem certeza que deseja cancelar o disparo <strong>{activeRun?.nome}</strong>?
        </p>
      </Modal>

      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Desconectar WhatsApp"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setConfirmDisconnect(false)} className="rounded-lg px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>Cancelar</button>
            <button type="button" onClick={disconnect} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "#ef4444", color: "#fff" }}>Desconectar</button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          O número será desconectado desta sessão. Para voltar a usar, será necessário escanear um novo QR Code.
        </p>
      </Modal>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </AppShell>
  );
}
