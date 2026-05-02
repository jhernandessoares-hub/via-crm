"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PipelineStepper, { PipelineStage } from "@/components/pipeline-stepper";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import {
  listCorrespondents, listCreditRequests, createCreditRequest, cancelCreditRequest,
  CREDIT_STATUS_LABEL, CREDIT_STATUS_COLOR,
  type Correspondent, type CreditRequest,
} from "@/lib/correspondente.service";

type Role = "OWNER" | "MANAGER" | "AGENT";

type StoredUser = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: Role;
  branchId: string | null;
};

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

type Lead = {
  id: string;
  nome?: string;
  telefone?: string;
  whatsapp?: string;
  observacao?: string;
  status?: string;
  origem?: string | null;
  criadoEm?: string;
  assignedUserId?: string | null;
  branchId?: string | null;
  telefoneKey?: string | null;
  avatarUrl?: string | null;
  // Qualificação IA
  nomeCorreto?: string | null;
  nomeCorretoOrigem?: string | null; // "IA" | "MANUAL"
  rendaBrutaFamiliar?: number | null;
  fgts?: number | null;
  valorEntrada?: number | null;
  estadoCivil?: string | null;
  dataNascimento?: string | null;
  tempoProcurandoImovel?: string | null;
  conversouComCorretor?: boolean | null;
  qualCorretorImobiliaria?: string | null;
  perfilImovel?: string | null;
  produtoInteresseId?: string | null;
  resumoLead?: string | null;
};

const TIPOS_DOCUMENTO = [
  { value: "RG", label: "RG" },
  { value: "CNH", label: "CNH" },
  { value: "CPF", label: "CPF" },
  { value: "COMP_RENDA", label: "Comprovante de renda" },
  { value: "COMP_ENDERECO", label: "Comprovante de endereço" },
  { value: "FGTS", label: "Extrato FGTS" },
  { value: "DECL_IR", label: "Declaração de IR" },
  { value: "CERT_ESTADO_CIVIL", label: "Certidão (nasc./casamento)" },
  { value: "CONTRATO_TRABALHO", label: "Contrato de trabalho" },
  { value: "OUTRO", label: "Outro" },
];

type LeadDocumentItem = {
  id: string;
  tipo: string;
  nome: string;
  status: string;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  tamanho?: number | null;
  criadoEm: string;
};

type LeadEvent = {
  id: string;
  channel?: string;
  criadoEm?: string;
  payloadRaw?: any;
};

type AiSuggestedAttachment = {
  kind?: "image" | "video" | "document" | "audio";
  url?: string;
  title?: string | null;
  mimeType?: string | null;
  filename?: string | null;
};

function normalizeTextForAiScore(input: string) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function calcAiUsagePercent(currentText: string, suggestionText: string) {
  const current = normalizeTextForAiScore(currentText);
  const suggested = normalizeTextForAiScore(suggestionText);

  if (!suggested) return 0;
  if (!current) return 0;
  if (current === suggested) return 100;

  const currentWords = current ? current.split(" ").filter(Boolean) : [];
  const suggestedWords = suggested ? suggested.split(" ").filter(Boolean) : [];

  if (!currentWords.length || !suggestedWords.length) return 0;

  const suggestedSet = new Set(suggestedWords);
  let hits = 0;

  for (const w of currentWords) {
    if (suggestedSet.has(w)) hits++;
  }

  const ratio = hits / Math.max(currentWords.length, suggestedWords.length);

  if (ratio >= 0.95) return 100;
  if (ratio >= 0.8) return 90;
  if (ratio >= 0.65) return 75;
  if (ratio >= 0.5) return 60;
  if (ratio >= 0.25) return 40;
  if (ratio > 0) return 10;
  return 0;
}

function aiParticipationLabelFromPercent(percent: number) {
  if (percent >= 100) return "100% IA";
  if (percent >= 90) return "90% IA";
  if (percent >= 75) return "75% IA";
  if (percent >= 60) return "60% IA";
  if (percent >= 40) return "40% IA";
  if (percent >= 10) return "10% IA";
  return "Humano";
}

function getAiParticipationLabel(ev: LeadEvent) {
  const ch = String(ev.channel || "").toLowerCase();
  const p = ev.payloadRaw || {};

  if (ch === "ai.suggestion") return "100% IA";

  if (typeof p?.aiAssistanceLabel === "string" && p.aiAssistanceLabel.trim()) {
    return p.aiAssistanceLabel.trim();
  }

  const percent =
    typeof p?.aiAssistancePercent === "number"
      ? p.aiAssistancePercent
      : typeof p?.aiAssistancePercent === "string"
        ? Number(p.aiAssistancePercent)
        : NaN;

  if (!Number.isNaN(percent)) {
    return aiParticipationLabelFromPercent(percent);
  }

  return "Humano";
}

// =========================
// PRODUTOS DISPONÍVEIS (MVP)
// =========================
type ProductMediaImage = {
  id: string;
  url: string;
  title?: string | null;
  label?: string | null;
  customLabel?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
  createdAt?: string;
};

type ProductMediaVideo = {
  id: string;
  url: string;
  title?: string | null;
  sortOrder?: number;
  createdAt?: string;
};

type ProductMediaDoc = {
  id: string;
  url: string;
  title?: string | null;
  type?: string | null;
  category?: string | null;
  visibility?: string | null;
  createdAt?: string;
};

type Product = {
  id: string;
  title?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  origin?: string | null;
  type?: string | null;
  status?: string | null;
  price?: any;
  description?: string | null;
  images?: ProductMediaImage[];
  videos?: ProductMediaVideo[];
  documents?: ProductMediaDoc[];
};

type ProductTab = "IMAGENS" | "DOCUMENTOS" | "VIDEOS";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL as string) ||
  (process.env.NEXT_PUBLIC_API_URL as string) ||
  "http://localhost:3000";

function safeFileNameBase(input: string) {
  const s = String(input || "").trim();
  const cleaned = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return cleaned || "arquivo";
}

function getAccessToken(): string | null {
  const isJwt = (s: string) => {
    const v = (s || "").trim();
    if (!v) return false;
    // padrão JWT: a.b.c (base64url)
    return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(v);
  };

  // 1) chaves comuns diretas
  try {
    const directKeys = [
      "token",
      "accessToken",
      "access_token",
      "acessToken",
      "acess_token",
      "jwt",
      "authToken",
      "authorization",
      "via-crm.token",
      "viacrm.token",
      "crm.token",
    ];
    for (const k of directKeys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        const s = String(raw).trim();
        if (isJwt(s)) return s;
      }
    }
  } catch (e) {
    console.warn("[getAccessToken] falha ao ler chaves diretas do localStorage", e);
  }

  // 2) dentro do "user" (várias estruturas)
  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      const candidates = [
        u && u.accessToken,
        u && u.access_token,
        u && u.token,
        u && u.jwt,
        u && u.acessToken,
        u && u.acess_token,
        u && u.session && u.session.accessToken,
        u && u.session && u.session.token,
      ];
      for (const t of candidates) {
        if (typeof t === "string" && isJwt(t)) return t.trim();
      }

      // varre qualquer string dentro do objeto "user"
      const flat = JSON.stringify(u || {});
      const m = flat.match(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
      if (m && m[0] && isJwt(m[0])) return m[0].trim();
    }
  } catch (e) {
    console.warn("[getAccessToken] falha ao ler user do localStorage", e);
  }

  // 3) fallback: varrer TUDO no localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k);
      if (!v) continue;
      const s = String(v).trim();
      if (isJwt(s)) return s;

      // se for JSON com token dentro
      const mm = s.match(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
      if (mm && mm[0] && isJwt(mm[0])) return mm[0].trim();
    }
  } catch (e) {
    console.warn("[getAccessToken] falha ao varrer localStorage", e);
  }

  return null;
}

function absApiUrl(pathOrUrl: string) {
  const s = String(pathOrUrl || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (!s.startsWith("/")) return API_BASE + "/" + s;
  return API_BASE + s;
}

async function authFetchBlob(url: string) {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Sem token no navegador. Faça login novamente no CRM para habilitar preview/baixar.");
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const msg = ("Falha ao baixar (" + res.status + ") " + (txt || "").slice(0, 180)).trim();
    throw new Error(msg);
  }

  const blob = await res.blob();
  return blob;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

async function downloadWithAuth(url: string, filename?: string) {
  const safeName = filename && filename.trim() ? filename.trim() : "arquivo";
  const blob = await authFetchBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

function formatTime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatDateOnly(iso?: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatAgo(msAgo: number) {
  if (!isFinite(msAgo) || msAgo < 0) return "-";
  const sec = Math.floor(msAgo / 1000);
  if (sec < 60) return String(sec) + "s";
  const min = Math.floor(sec / 60);
  if (min < 60) return String(min) + "min";
  const hr = Math.floor(min / 60);
  if (hr < 24) return String(hr) + "h " + String(min % 60) + "min";
  const day = Math.floor(hr / 24);
  return String(day) + "d " + String(hr % 24) + "h";
}

function parseIsoToMs(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isFinite(t) ? t : null;
}

function isOutgoing(ev: LeadEvent) {
  const ch = String(ev.channel || "").toLowerCase();
  if (ch.startsWith("whatsapp.out") || ch === "whatsapp.unofficial.out") return true;
  if (ch.startsWith("ai.")) return true;
  if (ch.startsWith("system.")) return true;
  if (ch === "crm.note") return true;
  if (ch === "form" || ch.startsWith("whatsapp.in") || ch === "whatsapp.unofficial.in") return false;
  return true;
}

function getMessageId(ev: LeadEvent): string | null {
  const p = ev.payloadRaw || {};
  if (typeof p.messageId === "string" && p.messageId.trim()) return p.messageId.trim();
  const outId = p?.metaResponse?.messages?.[0]?.id;
  if (typeof outId === "string" && outId.trim()) return outId.trim();
  return null;
}

function extractReaction(ev: LeadEvent): { emoji: string; targetMessageId: string } | null {
  const p = ev.payloadRaw || {};
  if (p.type !== "reaction") return null;
  const emoji = p?.rawMsg?.reaction?.emoji;
  const target = p?.rawMsg?.reaction?.message_id;
  if (typeof emoji === "string" && emoji.trim() && typeof target === "string" && target.trim()) {
    return { emoji: emoji.trim(), targetMessageId: target.trim() };
  }
  return null;
}

function extractLocation(ev: LeadEvent): { lat: number; lng: number } | null {
  const p = ev.payloadRaw || {};
  if (p.type !== "location") return null;
  const lat = p?.rawMsg?.location?.latitude;
  const lng = p?.rawMsg?.location?.longitude;
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  return null;
}


function getEventSortTime(ev: LeadEvent): number {
  const p = ev.payloadRaw || {};

  const rawTimestamp = p?.rawMsg?.timestamp;

  if (typeof rawTimestamp === "string" && rawTimestamp.trim()) {
    const n = Number(rawTimestamp);
    if (!Number.isNaN(n) && n > 0) {
      return n * 1000; // timestamp da Meta vem em segundos
    }

    const parsed = new Date(rawTimestamp).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (ev.criadoEm) {
    const created = new Date(ev.criadoEm).getTime();
    if (!Number.isNaN(created) && created > 0) {
      return created;
    }
  }

  return 0;
}

/**
 * ⬦ NOVO: tenta achar o texto OUTBOUND em varios formatos comuns.
 * (Seu backend pode estar salvando o request/payload em chaves diferentes.)
 */
function pickOutboundTextFromPayload(p: any): string {
  const candidates = [
    p?.text?.body,
    p?.text,
    p?.message,
    p?.rawMsg?.text?.body,
    p?.rawRequest?.text?.body,
    p?.request?.text?.body,
    p?.metaRequest?.text?.body,
    p?.payload?.text?.body,
    p?.input?.text,
    p?.data?.text?.body,
    p?.body?.text?.body,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  try {
    const s = JSON.stringify(p || {});
    const m = s.match(/"text"\s*:\s*\{\s*"body"\s*:\s*"([^"]+)"/);
    if (m && m[1]) return String(m[1]).trim();
  } catch {}

  return "";
}

function pickText(ev: LeadEvent): string {
  const p = ev.payloadRaw || {};
  if (p.type === "reaction") return "";
  if (typeof p.text === "string" && p.text.trim()) return p.text.trim();
  if (typeof p?.text?.body === "string" && p.text.body.trim()) return p.text.body.trim();
  if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
  if (p.type === "sticker") return "";
  if (p.type === "image") return "";
  if (p.type === "video") return "";
  if (p.type === "audio") return "";
  if (p.type === "document") return "";
  if (p.type === "location") return "";
  if (p.type === "unsupported" && p?.rawMsg?.unsupported?.type === "video_note") return "";
  if (p.type === "unsupported") return "";
  // �S& NOVO: outbound texto pode estar �Sescondido⬝ no request/payload
  const outText = pickOutboundTextFromPayload(p);
  if (outText) return outText;
  return "";
}

function hasRenderableMedia(ev: LeadEvent) {
  const p = ev.payloadRaw || {};
  const t = String(p.type || "").toLowerCase();
  if (t === "location") return true;
  if (p?.media?.url) return true;
  if (t === "image" || t === "video" || t === "audio" || t === "document" || t === "sticker") return true;
  return false;
}

function isGhostEvent(ev: LeadEvent) {
  if (!ev?.id) return false;
  if (String(ev.id).startsWith("local-")) return true;

  const ch = String(ev.channel || "").toLowerCase();
  if (ch.startsWith("sla.")) return true;

  const p = ev.payloadRaw || {};
  const t = String(p?.type || "").toLowerCase();
  const text = pickText(ev);
  const media = hasRenderableMedia(ev);

  if (ch.startsWith("whatsapp.out") && !text && !media) return true;
  if (t === "status" || t === "ack" || t === "delivery" || t === "read") return true;

  if (ch.startsWith("whatsapp.out")) {
    const msgId = p?.metaResponse?.messages?.[0]?.id;
    const isJustMeta = !!msgId && !text && !p?.media?.url && !p?.rawMsg && !p?.message && !p?.text;
    if (isJustMeta) return true;
  }

  return false;
}

function mergeEventsById(prev: LeadEvent[], incoming: LeadEvent[]) {
  const map = new Map<string, LeadEvent>();
  for (const e of prev || []) {
    if (e?.id) map.set(e.id, e);
  }
  for (const e of incoming || []) {
    if (!e?.id) continue;
    const old = map.get(e.id);
    map.set(e.id, { ...old, ...e, payloadRaw: e.payloadRaw ?? old?.payloadRaw });
  }
  return Array.from(map.values());
}

function LocationBlock({ ev }: { ev: LeadEvent }) {
  const loc = extractLocation(ev);
  if (!loc) return null;
  const lat = loc.lat;
  const lng = loc.lng;
  const mapsUrl = "https://www.google.com/maps?q=" + encodeURIComponent(String(lat) + "," + String(lng));

  return (
    <div className="mt-2 rounded-lg border bg-[var(--shell-card-bg)] p-2">
      <div className="text-xs text-[var(--shell-subtext)] font-medium">Localização</div>
      <div className="mt-1 text-[11px] text-[var(--shell-subtext)] font-mono break-all">
        {lat}, {lng}
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
      >
        Abrir no Google Maps
      </a>
    </div>
  );
}

type MediaModalState =
  | { open: true; kind: string; title: string; src: string; mimeType?: string }
  | { open: false };

function MediaModal({ state, onClose }: { state: MediaModalState; onClose: () => void }) {
  if (!state.open) return null;

  const k = String(state.kind || "").toLowerCase();
  const src = state.src;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-xl bg-[var(--shell-card-bg)] shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold text-[var(--shell-text)] truncate">{state.title || "Mídia"}</div>
          <button className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-1 text-sm hover:bg-[var(--shell-bg)]" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="p-4">
          {k === "image" || k === "sticker" ? (
            <img src={src} alt={state.title} className="max-h-[70vh] w-auto mx-auto rounded-lg border" />
          ) : k === "video" ? (
            <video controls playsInline preload="metadata" className="max-h-[70vh] w-full rounded-lg border">
              <source src={src} type={state.mimeType || "video/mp4"} />
              <source src={src} />
            </video>
          ) : k === "audio" ? (
            <audio controls className="w-full">
              <source src={src} type={state.mimeType || "audio/ogg"} />
            </audio>
          ) : (
            <iframe src={src} className="w-full h-[70vh] rounded-lg border" title={state.title} />
          )}
        </div>
      </div>
    </div>
  );
}

function MediaBlock({
  ev,
  leadId,
  onOpenModal,
}: {
  ev: LeadEvent;
  leadId: string;
  onOpenModal: (kind: string, title: string, src: string, mimeType?: string) => void;
}) {
  const p = ev.payloadRaw || {};
  const type = String(p.type || "").toLowerCase();

  if (type === "location") return <LocationBlock ev={ev} />;

  const mediaFromPayload = () => {
    if (p?.media) {
      const u = p?.media?.url ? String(p.media.url) : "";
      return {
        kind: String(p.media.kind || type || ""),
        url: u,
        mimeType: p.media.mimeType || p.media.mime_type || "",
        filename: p.media.filename || "",
        id: p.media.id || "",
      };
    }

    const raw = p?.rawMsg || {};
    const pick = (k: "image" | "video" | "audio" | "document" | "sticker") => {
      const obj = raw?.[k] || {};
      const url = obj?.url || null;
      const id = obj?.id || null;
      const mimeType = obj?.mime_type || obj?.mimeType || "";
      const filename = obj?.filename || obj?.file_name || "";
      return { url, id, mimeType, filename };
    };

    if (type === "image") {
      const x = pick("image");
      return { kind: "image", url: x.url ? String(x.url) : "", mimeType: x.mimeType, filename: x.filename, id: x.id };
    }

    if (type === "video") {
      const x = pick("video");
      return { kind: "video", url: x.url ? String(x.url) : "", mimeType: x.mimeType, filename: x.filename, id: x.id };
    }

    if (type === "audio") {
      const legacy = p.audioUrl || p?.audio?.url || p.mediaUrl || null;
      if (legacy) return { kind: "audio", url: String(legacy), mimeType: p.mimeType || "audio/ogg", filename: "", id: "" };
      const x = pick("audio");
      return { kind: "audio", url: x.url ? String(x.url) : "", mimeType: x.mimeType, filename: x.filename, id: x.id };
    }

    if (type === "document") {
      const x = pick("document");
      return {
        kind: "document",
        url: x.url ? String(x.url) : "",
        mimeType: x.mimeType,
        filename: x.filename,
        id: x.id,
      };
    }

    if (type === "sticker") {
      const x = pick("sticker");
      return {
        kind: "sticker",
        url: x.url ? String(x.url) : "",
        mimeType: x.mimeType || "image/webp",
        filename: "",
        id: x.id,
      };
    }

    return null;
  };

  const m = mediaFromPayload();
  const kind = String(m?.kind || type || "").toLowerCase();

  const filename =
    typeof m?.filename === "string" && m.filename.trim()
      ? m.filename.trim()
      : kind === "image"
        ? "imagem-" + ev.id + ".jpg"
        : kind === "video"
          ? "video-" + ev.id + ".mp4"
          : kind === "audio"
            ? "audio-" + ev.id + ".ogg"
            : kind === "document"
              ? "documento-" + ev.id + ".pdf"
              : "arquivo-" + ev.id;

  const rawUrl = m?.url ? String(m.url).trim() : "";
  const isHttp = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
  const publicUrl = isHttp ? rawUrl : "";

  const downloadUrl = absApiUrl(
    "/leads/" + encodeURIComponent(leadId) + "/events/" + encodeURIComponent(ev.id) + "/download",
  );

  const needsAuthBlob = !publicUrl;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  async function ensureBlob() {
    if (!needsAuthBlob) return;
    if (blobUrl) return;

    setLoading(true);
    setLoadErr(null);
    try {
      const blob = await authFetchBlob(downloadUrl);
      const u = URL.createObjectURL(blob);
      setBlobUrl(u);
    } catch (e: any) {
      setLoadErr(e?.message || "Falha ao carregar mídia");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (needsAuthBlob && (kind === "image" || kind === "video" || kind === "audio" || kind === "document" || kind === "sticker")) {
      ensureBlob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id, leadId, kind]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }
    };
  }, [blobUrl]);

  const effectiveSrc = publicUrl || blobUrl || "";
  const canOpen = !!effectiveSrc;
  const canDownload = true;

  const openModal = async () => {
    try {
      // �S& Para PDF/documentos: SEMPRE abrir via blob do /download com Bearer
      const mt = String(m?.mimeType || "").toLowerCase();
      const looksPdf =
        mt.indexOf("pdf") >= 0 ||
        String(filename || "").toLowerCase().endsWith(".pdf") ||
        kind === "document";

      if (looksPdf) {
        const blob0 = await authFetchBlob(downloadUrl);

        // �S& Se o backend não manda Content-Type correto, o iframe fica branco.
        const isPdfBlob = String((blob0 as any)?.type || "").toLowerCase().indexOf("pdf") >= 0;
        const blob = isPdfBlob ? blob0 : new Blob([blob0], { type: "application/pdf" });

        const objectUrl = URL.createObjectURL(blob);
        onOpenModal("document", filename, objectUrl, "application/pdf");
        return;
      }

      // �S& Para imagem/vídeo/áudio: usa o src já resolvido (publicUrl ou blobUrl)
      if (!effectiveSrc && needsAuthBlob) await ensureBlob();
      onOpenModal(kind, filename, publicUrl || blobUrl || effectiveSrc, m?.mimeType || undefined);
    } catch (e: any) {
      // fallback: tenta abrir do jeito que der
      onOpenModal(kind, filename, publicUrl || blobUrl || effectiveSrc, m?.mimeType || undefined);
    }
  };

  const onDownload = async () => {
    if (publicUrl) {
      try {
        const res = await fetch(publicUrl);
        if (res.ok) {
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
          return;
        }
      } catch {}
    }
    await downloadWithAuth(downloadUrl, filename);
  };

  const PreviewControl = () => {
    if (!needsAuthBlob) return null;
    return (
      <div className="mt-2">
        {loadErr ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{loadErr}</div>
        ) : null}

        {!blobUrl ? (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
            onClick={ensureBlob}
            disabled={loading}
            title="Carrega o preview via /download com token"
          >
            {loading ? "⏳ Carregando..." : "�x Carregar preview"}
          </button>
        ) : null}
      </div>
    );
  };

  if (kind === "sticker") {
    return (
      <div className="mt-2">
        {effectiveSrc ? <img src={effectiveSrc} alt="Sticker" className="max-h-40 w-auto rounded-lg border" /> : null}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={!canOpen}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          >
            Baixar
          </button>
        </div>

        <PreviewControl />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="mt-2 space-y-2">
        {effectiveSrc ? (
          <audio controls className="w-full">
            <source src={effectiveSrc} type={m?.mimeType || "audio/ogg"} />
            Seu navegador não suporta áudio.
          </audio>
        ) : null}

        {typeof p.transcription === "string" && p.transcription.trim() ? (
          <div className="rounded-lg border bg-[var(--shell-card-bg)] p-2 text-xs text-[var(--shell-text)]">
            <div className="text-[11px] text-[var(--shell-subtext)] mb-1">Transcrição</div>
            <div className="whitespace-pre-wrap">{p.transcription.trim()}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={!canOpen}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
          >
            Baixar
          </button>
        </div>

        <PreviewControl />
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="mt-2">
        {effectiveSrc ? (
          <button type="button" onClick={openModal} title="Abrir imagem" className="block">
            <img
              src={effectiveSrc}
              alt="Imagem"
              className="max-h-80 w-auto rounded-lg border cursor-pointer hover:opacity-95"
            />
          </button>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={!canOpen}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
          >
            Baixar
          </button>
        </div>

        <PreviewControl />
      </div>
    );
  }

  if (kind === "video") {
    const safeVideoType =
      typeof m?.mimeType === "string" && m.mimeType.trim().toLowerCase().startsWith("video/")
        ? m.mimeType.trim()
        : "video/mp4";

    return (
      <div className="mt-2">
        {effectiveSrc ? (
          <video controls playsInline preload="metadata" className="max-h-80 w-full rounded-lg border">
            <source src={effectiveSrc} type={safeVideoType} />
            <source src={effectiveSrc} />
            Seu navegador não suporta vídeo.
          </video>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={!canOpen}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
          >
            Baixar
          </button>
        </div>

        <PreviewControl />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openModal}
          disabled={!canOpen}
          className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)] disabled:opacity-60"
          title="Abrir"
        >
          Abrir {filename}
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
          title="Baixar"
        >
          Baixar
        </button>
      </div>

      <PreviewControl />
    </div>
  );
}

function Bubble({
  ev,
  reactions,
  leadId,
  onOpenModal,
}: {
  ev: LeadEvent;
  reactions: string[];
  leadId: string;
  onOpenModal: (kind: string, title: string, src: string, mimeType?: string) => void;
}) {
  const outgoing = isOutgoing(ev);
  const ch = String(ev.channel || "event");
  const p = ev.payloadRaw || {};
  const isAiSuggestion = ch === "ai.suggestion";
  const aiParticipationLabel = getAiParticipationLabel(ev);
  const isWaOut = String(ch || "").toLowerCase().startsWith("whatsapp.out") || ch === "whatsapp.unofficial.out";
  const channelDisplay = isWaOut ? ch + " • " + aiParticipationLabel : ch;

  const rawText = pickText(ev);

  const type = String(p?.type || "").toLowerCase();
  const isVideoNote = type === "unsupported" && p?.rawMsg?.unsupported?.type === "video_note";
  const showText = rawText.trim().length > 0;
  const showMedia = hasRenderableMedia(ev);

  return (
    <div className={"w-full flex " + (isAiSuggestion ? "justify-start" : outgoing ? "justify-end" : "justify-start")}>
      <div className="relative max-w-[80%] min-w-[140px]">
        <div
          className={[
            "rounded-2xl px-3 py-2 text-sm border shadow-sm",
            isAiSuggestion
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : outgoing
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-[var(--shell-card-bg)] border-[var(--shell-card-border)] text-[var(--shell-text)]",
          ].join(" ")}
        >
          <div className="text-[11px] text-[var(--shell-subtext)] flex items-center justify-between gap-2">
            <span className="font-mono">{channelDisplay}</span>
            <span>{formatTime(ev.criadoEm)}</span>
          </div>

          {isAiSuggestion ? (
            <div className="mt-2 inline-flex items-center rounded-md border border-amber-300 bg-[var(--shell-card-bg)] px-2 py-1 text-[11px] font-semibold text-amber-800">
              Sugestão da IA
            </div>
          ) : null}

          {showText ? <div className="mt-2 whitespace-pre-wrap break-words">{rawText}</div> : null}

          {isVideoNote ? (
            <div className="mt-2 rounded-lg border bg-amber-50 p-2 text-xs text-amber-900">
              <div className="font-semibold">Vídeo circular (video_note)</div>
              <div className="mt-1 text-[11px] text-amber-800">
                Esse tipo não é suportado pela API do WhatsApp Cloud, então não dá para tocar aqui.
              </div>
            </div>
          ) : null}

          {showMedia ? <MediaBlock ev={ev} leadId={leadId} onOpenModal={onOpenModal} /> : null}

          {!showText && !showMedia ? (
            <div className="mt-2 text-[11px] text-red-600 break-all">
              {"sem texto visível | type=" + String(type || "vazio") + " | id=" + ev.id}
            </div>
          ) : null}
        </div>

        {reactions.length > 0 ? (
          <div className="absolute -bottom-3 right-2 flex gap-1">
            {reactions.slice(0, 6).map((r, idx) => (
              <span key={idx} className="bg-[var(--shell-card-bg)] border rounded-full px-2 py-0.5 text-xs shadow">
                {r}
              </span>
            ))}
            {reactions.length > 6 ? (
              <span className="bg-[var(--shell-card-bg)] border rounded-full px-2 py-0.5 text-xs shadow">
                {"+" + String(reactions.length - 6)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LeadDetailChatPage() {
  const params = useParams();
  const id = String((params as any)?.id || "");
  const searchParams = useSearchParams();
  const currentGroup = searchParams.get("group");
  const router = useRouter();

  const [user, setUser] = useState<StoredUser | null>(null);


  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [pipelineErr, setPipelineErr] = useState<string | null>(null);
  const [movingStage, setMovingStage] = useState(false);
  const [allowedStages, setAllowedStages] = useState<PipelineStage[]>([]);

  // (preparação pro futuro) etapa �Sfinal⬝ pode sugerir minimizar chat

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dismissedAiSuggestionIds, setDismissedAiSuggestionIds] = useState<string[]>([]);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [aiTeachNotice, setAiTeachNotice] = useState<string | null>(null);
  const [manualAiSuggestionText, setManualAiSuggestionText] = useState("");
  const [manualAiResponseFormat, setManualAiResponseFormat] = useState<string | null>(null);
  const [suggestionModifiedBy, setSuggestionModifiedBy] = useState<string | null>(null);
  const [aiActionLoading, setAiActionLoading] = useState<string | null>(null);
  const [aiPanelState, setAiPanelState] = useState<null | "discarded" | "sent">(null);

  // Teaching modal
  const [teachModalOpen, setTeachModalOpen] = useState(false);
  const [teachKbs, setTeachKbs] = useState<Array<{ id: string; title: string; type: string; active: boolean; agents: Array<{ agentId: string }> }>>([]);
  const [teachSelectedKbId, setTeachSelectedKbId] = useState("");
  const [teachLeadMessage, setTeachLeadMessage] = useState("");
  const teachLeadMessageRef = useRef<HTMLTextAreaElement>(null);
  const [teachResponse, setTeachResponse] = useState("");
  const teachResponseRef = useRef<HTMLTextAreaElement>(null);
  const [teachReplacedName, setTeachReplacedName] = useState("");
  const [teachTitle, setTeachTitle] = useState("");
  const [teachGeneratingTitle, setTeachGeneratingTitle] = useState(false);
  const [teachSaving, setTeachSaving] = useState(false);
  const [teachError, setTeachError] = useState("");
  const [teachReplaceMode, setTeachReplaceMode] = useState(false);
  const [teachExistingList, setTeachExistingList] = useState<Array<{
    id: string; title: string; createdAt: string; createdBy: string;
    leadMessage?: string | null; lead?: { nome?: string | null; telefone?: string | null } | null;
  }>>([]);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [mediaModal, setMediaModal] = useState<MediaModalState>({ open: false });
  const openMediaModal = (kind: string, title: string, src: string, mimeType?: string) => {
    setMediaModal({ open: true, kind, title, src, mimeType });
  };

  const [debugOn, setDebugOn] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [lastPollError, setLastPollError] = useState<string | null>(null);
  const [lastEventsShape, setLastEventsShape] = useState<string>("");
  const [lastEventsRaw, setLastEventsRaw] = useState<any>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [audioSupported, setAudioSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordErr, setRecordErr] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [productsLoading, setProductsLoading] = useState(false);
  const [productsErr, setProductsErr] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsQuery, setProductsQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productTab, setProductTab] = useState<ProductTab | null>(null);
  const [productsNotice, setProductsNotice] = useState<string | null>(null);

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachSending, setAttachSending] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null);

  const [hasNewInbound, setHasNewInbound] = useState(false);
  const lastInboundIdRef = useRef<string | null>(null);

  const [qualOpen, setQualOpen] = useState(false);

  // Atribuição manual
  const [teamMembers, setTeamMembers] = useState<{ id: string; nome: string; role: string }[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Documentos do lead
  const [documents, setDocuments] = useState<LeadDocumentItem[]>([]);
  const [docsOpen, setDocsOpen] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [newDocTipo, setNewDocTipo] = useState("RG");
  const [newDocNome, setNewDocNome] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  // Nome confirmado — modal
  const [nomeModalOpen, setNomeModalOpen] = useState(false);
  const [nomeConfirmadoEdit, setNomeConfirmadoEdit] = useState<string>("");
  const [savingNomeConfirmado, setSavingNomeConfirmado] = useState(false);

  // SLA panel
  const [slaData, setSlaData] = useState<any>(null);

  // Análise de Crédito
  const [creditRequests,    setCreditRequests]    = useState<CreditRequest[]>([]);
  const [correspondents,    setCorrespondents]    = useState<Correspondent[]>([]);
  const [showCreditForm,    setShowCreditForm]    = useState(false);
  const [creditForm,        setCreditForm]        = useState({ correspondentId: "", valorImovel: "", valorCredito: "", rendaMensal: "", tipoFinanciamento: "SBPE", observacoes: "" });
  const [savingCredit,      setSavingCredit]      = useState(false);
  const [slaLoading, setSlaLoading] = useState(false);

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // SLA polling (30s)
  useEffect(() => {
    if (!id) return;

    const fetchSla = async () => {
      setSlaLoading(true);
      try {
        const data = await apiFetch(`/leads/${id}/sla`);
        setSlaData(data);
      } catch {
        // silently ignore errors
      } finally {
        setSlaLoading(false);
      }
    };

    fetchSla();
    const t = setInterval(fetchSla, 30000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (lead) setAutopilotEnabled(!(lead as any).botPaused);
  }, [lead]);

  useEffect(() => {
    try {
      if (attachPreviewUrl) URL.revokeObjectURL(attachPreviewUrl);
    } catch {}

    if (!attachFile) {
      setAttachPreviewUrl(null);
      return;
    }

    try {
      const u = URL.createObjectURL(attachFile);
      setAttachPreviewUrl(u);
    } catch {
      setAttachPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachFile]);

  useEffect(() => {
    return () => {
      try {
        if (attachPreviewUrl) URL.revokeObjectURL(attachPreviewUrl);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachPreviewUrl]);

  async function loadAllowedStages(leadId: string) {
    try {
      const data = await apiFetch("/leads/" + leadId + "/allowed-stage-transitions", { method: "GET" });
      const list: PipelineStage[] = Array.isArray(data?.allowedStages) ? data.allowedStages : [];
      setAllowedStages(list);
    } catch {
      setAllowedStages([]);
    }
  }

  async function loadCreditData() {
    if (!id) return;
    try {
      const [reqs, corrs] = await Promise.all([listCreditRequests(id), listCorrespondents()]);
      setCreditRequests(reqs);
      setCorrespondents(corrs);
    } catch { /* silencioso */ }
  }

  async function loadDocuments() {
    if (!id) return;
    setLoadingDocs(true);
    try {
      const data = await apiFetch(`/leads/${id}/documents`);
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadLead() {
    const l = await apiFetch("/leads/" + id, { method: "GET" });
    setLead(l);
    setNomeConfirmadoEdit(l?.nomeCorreto ?? "");
    await loadAllowedStages(id);
  }

  async function loadEvents(opts?: { silent?: boolean }) {
    const ev = await apiFetch("/leads/" + id + "/events", { method: "GET" });
    const list: LeadEvent[] = (Array.isArray(ev) ? ev : ev?.items ?? ev?.value ?? ev?.data ?? []) || [];
    const shape = Array.isArray(ev)
      ? "array"
      : ev?.items
        ? "object.items"
        : ev?.value
          ? "object.value"
          : ev?.data
            ? "object.data"
            : ev && typeof ev === "object"
              ? "object.keys(" + Object.keys(ev).slice(0, 8).join(",") + ")"
              : typeof ev;

    setLastEventsShape(shape);
    setLastEventsRaw(ev);
    setEvents((prev) => mergeEventsById(prev, Array.isArray(list) ? list : []));
    setLastFetchAt(new Date().toISOString());

    if (!opts?.silent) setLoadingEvents(false);
  }

  async function loadProducts(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setProductsLoading(true);
      setProductsErr(null);
      setProductsNotice(null);
    }
    try {
      const r = await apiFetch("/products", { method: "GET" });
      const list: Product[] = Array.isArray(r) ? r : r?.items ?? r?.value ?? r?.data ?? [];
      const arr = Array.isArray(list) ? list : [];
      setProducts(arr);
      setProductTab(null);
    } catch (e: any) {
      setProductsErr(e?.message || "Erro ao carregar produtos");
    } finally {
      if (!opts?.silent) setProductsLoading(false);
    }
  }

  async function loadTeamMembers() {
    try {
      const data = await apiFetch("/users");
      setTeamMembers(Array.isArray(data) ? data.map((m: any) => ({ id: m.id, nome: m.nome, role: m.role })) : []);
    } catch { /* silently ignore */ }
  }

  async function loadAll() {
    setErr(null);
    setLoadingLead(true);
    setLoadingEvents(true);
    try {
      await Promise.all([loadLead(), loadEvents(), loadProducts({ silent: true }), loadTeamMembers(), loadDocuments(), loadCreditData()]);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
      setLead(null);
      setEvents([]);
    } finally {
      setLoadingLead(false);
      setLoadingEvents(false);
    }
  }

  async function loadPipelineStages() {
    setLoadingPipeline(true);
    setPipelineErr(null);
    try {
      const r = await apiFetch("/pipeline/active/stages", { method: "GET" });
      const arr: PipelineStage[] = Array.isArray(r) ? r : r?.items ?? r?.value ?? r?.data ?? [];
      setPipelineStages(Array.isArray(arr) ? arr : []);
    } catch (e: any) {
      setPipelineErr(e?.message || "Erro ao carregar pipeline");
    } finally {
      setLoadingPipeline(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadAll();
      loadPipelineStages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const intervalMs = 2000;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      setPollCount((n) => n + 1);
      try {
        await loadEvents({ silent: true });
        setLastPollError(null);
      } catch (e: any) {
        setLastPollError(e?.message || "poll error");
      } finally {
        inFlight = false;
      }
    };

    const t = setInterval(tick, intervalMs);
    tick();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

const orderedEvents = useMemo(() => {
  return [...events].sort((a, b) => {
    const ta = getEventSortTime(a);
    const tb = getEventSortTime(b);
    return ta - tb;
  });
}, [events]);

  const latestAiSuggestion = useMemo(() => {
    const found = [...orderedEvents]
      .reverse()
      .find((e) => String(e.channel || "").toLowerCase() === "ai.suggestion");

    if (!found) return null;
    if (dismissedAiSuggestionIds.includes(found.id)) return null;

    return found;
  }, [orderedEvents, dismissedAiSuggestionIds]);

  const latestAiSuggestionText = useMemo(() => {
    if (!latestAiSuggestion) return "";
    return pickText(latestAiSuggestion);
  }, [latestAiSuggestion]);

  const activeAiSuggestionText = manualAiSuggestionText || latestAiSuggestionText;
  const latestAiPayload = latestAiSuggestion?.payloadRaw || {};

  // Quando uma nova sugestão chega do worker, reseta o estado do painel
  const latestAiSuggestionId = latestAiSuggestion?.id ?? null;
  useEffect(() => {
    if (latestAiSuggestionId) setAiPanelState(null);
  }, [latestAiSuggestionId]);

  const latestAiSuggestedAttachments = useMemo(() => {
    const arr = latestAiPayload?.suggestedAttachments;
    return Array.isArray(arr) ? (arr as AiSuggestedAttachment[]) : [];
  }, [latestAiPayload]);

  const latestAiSuggestedAudioScript = useMemo(() => {
    const s =
      latestAiPayload?.audioScript ||
      latestAiPayload?.suggestedAudioScript ||
      latestAiPayload?.audio?.script ||
      "";
    return typeof s === "string" ? s.trim() : "";
  }, [latestAiPayload]);

  const latestAiResponseFormat = useMemo(() => {
    const v =
      latestAiPayload?.responseFormat ||
      latestAiPayload?.suggestionType ||
      (latestAiSuggestedAudioScript ? "AUDIO" : "TEXT");
    return String(v || "TEXT").toUpperCase();
  }, [latestAiPayload, latestAiSuggestedAudioScript]);

const activeAiResponseFormat = String(
  manualAiResponseFormat || latestAiResponseFormat || "TEXT",
).toUpperCase();

const aiUsagePercent = useMemo(() => {
  if (activeAiSuggestionText && !text.trim()) return 100;
  return calcAiUsagePercent(text, activeAiSuggestionText);
}, [text, activeAiSuggestionText]);

function useAiSuggestionInField() {
  if (!activeAiSuggestionText) return;
  setText(activeAiSuggestionText);
  requestAnimationFrame(() => {
    try {
      textAreaRef.current?.focus();
    } catch {}
  });
}


async function sendAiSuggestionNow() {
  if (!activeAiSuggestionText) return;
  await sendProvidedText(activeAiSuggestionText);
  // Limpa o painel após envio bem-sucedido
  setManualAiSuggestionText("");
  setManualAiResponseFormat(null);
  setSuggestionModifiedBy(null);
  if (latestAiSuggestion?.id) {
    setDismissedAiSuggestionIds((prev) =>
      Array.from(new Set([...prev, latestAiSuggestion.id])),
    );
  }
  setAiPanelState("sent");
}
function discardAiSuggestion() {
  setManualAiSuggestionText("");
  setManualAiResponseFormat(null);
  setSuggestionModifiedBy(null);
  if (latestAiSuggestion?.id) {
    setDismissedAiSuggestionIds((prev) =>
      Array.from(new Set([...prev, latestAiSuggestion.id])),
    );
  }
  setAiPanelState("discarded");
}

  async function openTeachingModal() {
    if (!activeAiSuggestionText) return;

    // Captura as últimas 4 mensagens WhatsApp (in + out) formatadas como conversa
    const whatsappEvts = orderedEvents.filter((e) => {
      const ch = String(e.channel || "").toLowerCase();
      return ch === "whatsapp.in" || ch === "whatsapp.out";
    });
    const agentLabel = (latestAiPayload as any)?.agentTitle?.trim() || "Atendente";
    const last4 = whatsappEvts.slice(-4);
    const conversationLines = last4.map((e) => {
      const ch = String(e.channel || "").toLowerCase();
      const isInbound = ch === "whatsapp.in";
      const text = isInbound
        ? String(e.payloadRaw?.text || e.payloadRaw?.body || e.payloadRaw?.message || "").trim()
        : pickOutboundTextFromPayload(e.payloadRaw);
      const speaker = isInbound ? "Lead" : agentLabel;
      return `${speaker}: "${text}"`;
    });
    const lastLeadMsg = conversationLines.join("\n");

    setTeachLeadMessage(lastLeadMsg);
    setTeachResponse(activeAiSuggestionText);
    setTeachTitle("");
    setTeachSelectedKbId("");
    setTeachError("");
    setTeachReplaceMode(false);
    setTeachExistingList([]);
    setTeachReplacedName("");
    setTeachModalOpen(true);

    // Load KBs
    try {
      const data = await apiFetch("/knowledge-base");
      const allKbs = Array.isArray(data) ? data : [];
      const agentId = (latestAiPayload as any)?.agentId;
      const byAgent = agentId
        ? allKbs.filter((kb: any) => kb.agents?.some((a: any) => a.agentId === agentId))
        : allKbs;
      const active = (byAgent.length > 0 ? byAgent : allKbs).filter((kb: any) => kb.active);
      setTeachKbs(active);

      if (active.length > 0) {
        setTeachSelectedKbId(active[0].id);
        generateTeachTitle(active[0].id, lastLeadMsg, activeAiSuggestionText);
      }
    } catch {
      setTeachKbs([]);
    }
  }

  async function generateTeachTitle(kbId: string, leadMessage: string, approvedResponse: string) {
    if (!kbId) return;
    setTeachGeneratingTitle(true);
    try {
      const data = await apiFetch(`/knowledge-base/${kbId}/teachings/generate-title`, {
        method: "POST",
        body: JSON.stringify({ leadMessage, approvedResponse }),
      });
      setTeachTitle(data?.title || "");
    } catch {
      setTeachTitle("");
    } finally {
      setTeachGeneratingTitle(false);
    }
  }

  async function submitTeaching() {
    if (!teachSelectedKbId || !teachResponse.trim()) {
      setTeachError("Selecione uma base de conhecimento e informe a resposta aprovada.");
      return;
    }
    setTeachSaving(true);
    setTeachError("");

    // Check count first
    try {
      const listData = await apiFetch(`/knowledge-base/${teachSelectedKbId}/teachings`);
      if ((listData?.count ?? 0) >= 30) {
        setTeachExistingList(listData?.teachings || []);
        setTeachReplaceMode(true);
        setTeachSaving(false);
        return;
      }
    } catch {
      setTeachError("Erro ao verificar ensinamentos existentes.");
      setTeachSaving(false);
      return;
    }

    try {
      await apiFetch(`/knowledge-base/${teachSelectedKbId}/teachings`, {
        method: "POST",
        body: JSON.stringify({
          leadId: id,
          leadMessage: teachLeadMessage || undefined,
          approvedResponse: teachResponse.trim(),
          title: teachTitle.trim() || undefined,
        }),
      });
      // Se a resposta foi editada, atualiza o texto sugerido no painel
      const edited = teachResponse.trim();
      if (edited && edited !== activeAiSuggestionText) {
        const userName = (() => {
          try { return JSON.parse(localStorage.getItem("user") || "{}").nome || null; } catch { return null; }
        })();
        // Restaura o nome real no painel (o banco guarda [nome do lead], o painel mostra o nome real)
        const panelText = teachReplacedName
          ? edited.split("[nome do lead]").join(teachReplacedName)
          : edited;
        setManualAiSuggestionText(panelText);
        setSuggestionModifiedBy(userName);
      }
      setTeachModalOpen(false);
      setAiTeachNotice("Ensinamento salvo com sucesso!");
      setTimeout(() => setAiTeachNotice(null), 3000);
    } catch (err: any) {
      setTeachError(err?.message || "Erro ao salvar ensinamento.");
    } finally {
      setTeachSaving(false);
    }
  }

  async function confirmReplaceTeaching(teachingId: string) {
    setTeachSaving(true);
    setTeachError("");
    try {
      await apiFetch(`/knowledge-base/${teachSelectedKbId}/teachings/${teachingId}`, {
        method: "PUT",
        body: JSON.stringify({
          leadId: id,
          leadMessage: teachLeadMessage || undefined,
          approvedResponse: teachResponse.trim(),
          title: teachTitle.trim() || undefined,
        }),
      });
      // Se a resposta foi editada, atualiza o texto sugerido no painel
      const edited = teachResponse.trim();
      if (edited && edited !== activeAiSuggestionText) {
        const userName = (() => {
          try { return JSON.parse(localStorage.getItem("user") || "{}").nome || null; } catch { return null; }
        })();
        // Restaura o nome real no painel (o banco guarda [nome do lead], o painel mostra o nome real)
        const panelText = teachReplacedName
          ? edited.split("[nome do lead]").join(teachReplacedName)
          : edited;
        setManualAiSuggestionText(panelText);
        setSuggestionModifiedBy(userName);
      }
      setTeachModalOpen(false);
      setAiTeachNotice("Ensinamento substituído com sucesso!");
      setTimeout(() => setAiTeachNotice(null), 3000);
    } catch (err: any) {
      setTeachError(err?.message || "Erro ao substituir ensinamento.");
    } finally {
      setTeachSaving(false);
    }
  }

  async function saveNomeConfirmado() {
    if (!lead) return;
    setSavingNomeConfirmado(true);
    try {
      const nome = nomeConfirmadoEdit.trim() || null;
      await apiFetch(`/leads/${lead.id}/qualification`, {
        method: "PATCH",
        body: JSON.stringify({ nomeCorreto: nome }),
      });
      setLead((prev) => prev ? { ...prev, nomeCorreto: nome, nomeCorretoOrigem: nome ? "MANUAL" : null } : prev);
      setNomeModalOpen(false);
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar nome confirmado.");
    } finally {
      setSavingNomeConfirmado(false);
    }
  }

  async function handleAddDocument() {
    if (!lead || !newDocNome.trim()) return;
    setSavingDoc(true);
    try {
      const doc = await apiFetch(`/leads/${lead.id}/documents`, {
        method: "POST",
        body: JSON.stringify({ tipo: newDocTipo, nome: newDocNome.trim() }),
      });
      setDocuments((prev) => [...prev, doc]);
      setNewDocNome("");
      setNewDocTipo("RG");
      setAddingDoc(false);
    } catch (err: any) {
      alert(err?.message || "Erro ao adicionar documento.");
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleUploadDocument(docId: string, file: File) {
    if (!lead) return;
    setUploadingDocId(docId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const updated = await apiFetch(`/leads/${lead.id}/documents/${docId}/upload`, {
        method: "POST",
        body: formData,
      });
      setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
    } catch (err: any) {
      alert(err?.message || "Erro ao fazer upload.");
    } finally {
      setUploadingDocId(null);
    }
  }

  async function handleDeleteDocument(docId: string) {
    if (!lead || !confirm("Remover este documento?")) return;
    try {
      await apiFetch(`/leads/${lead.id}/documents/${docId}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      alert(err?.message || "Erro ao remover documento.");
    }
  }

  async function requestAiPanelSuggestion(
  mode: "REGENERATE" | "SHORTEN" | "IMPROVE" | "VARIATE",
) {
  if (!user?.tenantId || !lead?.nome || !lead?.status) {
    setErr("Não consegui gerar nova sugestão porque faltam dados do lead ou usuário.");
    return;
  }

  setAiActionLoading(mode);
  setErr(null);

  // Filtra eventos de WhatsApp para contexto e última mensagem do lead
  const whatsappEvents = orderedEvents.filter((e) => {
    const ch = String(e.channel || "").toLowerCase();
    return ch === "whatsapp.in" || ch === "whatsapp.out";
  });

  const conversationContext = whatsappEvents
    .slice(-8)
    .map((ev) => {
      const ch = String(ev.channel || "").toLowerCase();
      const txt = pickText(ev);
      if (!txt) return null;
      return ch === "whatsapp.in" ? `Lead: ${txt}` : `Corretor: ${txt}`;
    })
    .filter(Boolean)
    .join("\n");

  // Última mensagem real enviada pelo lead
  const lastLeadEvent = [...whatsappEvents]
    .reverse()
    .find((e) => String(e.channel || "").toLowerCase() === "whatsapp.in");
  const lastLeadMessage = lastLeadEvent ? pickText(lastLeadEvent) ?? "" : "";

  try {
    const generated = await apiFetch("/ai/generate-follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: lead.nomeCorreto ?? lead.nome,
        status: lead.status,
        tenantId: user.tenantId,
        leadId: id,
        agentId: (latestAiPayload as any)?.agentId ?? undefined,
        lastLeadMessage: lastLeadMessage || undefined,
        previousSuggestion: activeAiSuggestionText || undefined,
        conversationContext: conversationContext || undefined,
        mode,
      }),
    });

    const nextText =
      typeof generated === "string"
        ? generated.trim()
        : typeof generated?.text === "string"
        ? generated.text.trim()
        : typeof generated?.message === "string"
        ? generated.message.trim()
        : "";

    if (!nextText) throw new Error("A IA não retornou texto nessa nova sugestão.");

    setManualAiSuggestionText(nextText);
    setManualAiResponseFormat("TEXT");
    setAiPanelState(null);
    setDismissedAiSuggestionIds([]);
  } catch (e: any) {
    setErr(e?.message || "Erro ao gerar nova sugestão da IA");
  } finally {
    setAiActionLoading(null);
  }
}

  async function toggleAutopilot(nextValue: boolean) {
    setAutopilotEnabled(nextValue);
    await apiFetch(`/leads/${id}/bot-paused`, {
      method: "PATCH",
      body: JSON.stringify({ botPaused: !nextValue }),
    });
    setLead((prev: any) => prev ? { ...prev, botPaused: !nextValue } : prev);
  }

  async function useSuggestedAttachment(att: AiSuggestedAttachment) {
    const kind = String(att?.kind || "").toLowerCase();
    const url = String(att?.url || "").trim();
    const title = String(att?.title || att?.filename || "anexo").trim();

    if (!url) return;

    if (kind === "image" || kind === "video" || kind === "document") {
      try {
        await prepareAttachmentFromUrl(kind as "image" | "video" | "document", url, title);
      } catch (e: any) {
        setErr(e?.message || "Falha ao preparar anexo sugerido");
      }
      return;
    }

    insertIntoChat(url);
  }

  const viewEvents = useMemo(() => {
    const reactionsMap: Record<string, string[]> = {};
    const normal: LeadEvent[] = [];

    for (const ev of orderedEvents) {
      const r = extractReaction(ev);
      if (r) {
        if (!reactionsMap[r.targetMessageId]) reactionsMap[r.targetMessageId] = [];
        reactionsMap[r.targetMessageId].push(r.emoji);
        continue;
      }

      const ch = String(ev?.channel || "").toLowerCase();
      if (ch.startsWith("system.")) continue;
      if (ch === "ai.suggestion") continue;
      if (ch === "stage.changed") continue;
      if (ch === "ai.broker_notify") continue;
      if (ch === "bot.outside_hours") continue;
      if (isGhostEvent(ev)) continue;
      normal.push(ev);
    }

    return normal.map((ev) => {
      const msgId = getMessageId(ev);
      const reactions = msgId ? reactionsMap[msgId] || [] : [];
      return { ev, reactions };
    });
  }, [orderedEvents]);

  const lastVisibleEvent = useMemo(() => {
    if (!orderedEvents.length) return null;
    return orderedEvents[orderedEvents.length - 1];
  }, [orderedEvents]);

  const startedAt = useMemo(() => {
    if (!orderedEvents.length) return null;
    const first = orderedEvents[0];
    return first?.criadoEm || null;
  }, [orderedEvents]);

  const leadNumberLabel = useMemo(() => {
    if (!lead?.id) return "�";
    return lead.id.replaceAll("-", "").slice(0, 6).toUpperCase();
  }, [lead?.id]);

  const lastInboundAt = useMemo(() => {
    const lastIn = [...orderedEvents]
      .reverse()
      .find((e) => String(e.channel || "").toLowerCase().startsWith("whatsapp.in"));
    return lastIn?.criadoEm || null;
  }, [orderedEvents]);

  const lastInboundMs = useMemo(() => parseIsoToMs(lastInboundAt), [lastInboundAt]);

  const lastInboundAgoLabel = useMemo(() => {
    if (!lastInboundMs) return "�";
    return formatAgo(nowTick - lastInboundMs);
  }, [nowTick, lastInboundMs]);

  useEffect(() => {
    try {
      const lastInbound = [...orderedEvents]
        .reverse()
        .find((e) => String(e.channel || "").toLowerCase().startsWith("whatsapp.in"));

      if (!lastInbound?.id) return;

      if (!lastInboundIdRef.current) {
        lastInboundIdRef.current = lastInbound.id;
        return;
      }

      if (lastInbound.id !== lastInboundIdRef.current) {
        lastInboundIdRef.current = lastInbound.id;
        setHasNewInbound(true);

        try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = 440;
            g.gain.value = 0.02;
            o.start();
            setTimeout(() => {
              o.stop();
              (ctx as any).close?.();
            }, 140);
          }
        } catch {}
      }
    } catch {}
  }, [orderedEvents]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [viewEvents.length]);

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setText((t) => String(t || "") + emoji);
      setEmojiOpen(false);
      return;
    }

    const start = (el as any).selectionStart ?? text.length;
    const end = (el as any).selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);

    setText(next);

    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + emoji.length;
        (el as any).setSelectionRange(pos, pos);
      } catch {}
    });

    setEmojiOpen(false);
  }

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof (window as any).MediaRecorder !== "undefined";
    setAudioSupported(!!ok);
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
      } catch {}
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  function stopStream() {
    const s = mediaStreamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
      mediaStreamRef.current = null;
    }
  }

  async function startRecording() {
    setRecordErr(null);

    if (!audioSupported) {
      setRecordErr("Seu navegador não suporta gravação de áudio.");
      return;
    }

    if (audioUrl) {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch {}
    }

    setAudioUrl(null);
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const anyWin = window as any;
      const MR = anyWin.MediaRecorder as typeof MediaRecorder;

      let mimeType = "";
      const candidates = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/webm;codecs=opus", "audio/webm"];
      for (const c of candidates) {
        try {
          if (MR && (MR as any).isTypeSupported?.(c)) {
            mimeType = c;
            break;
          }
        } catch {}
      }

      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onstop = () => {
        try {
          const blob = new Blob(audioChunksRef.current, { type: (rec as any).mimeType || "audio/webm" });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        } catch (e: any) {
          setRecordErr(e?.message || "Falha ao finalizar áudio.");
        } finally {
          stopStream();
        }
      };

      rec.start();
      setRecording(true);
    } catch (e: any) {
      setRecordErr(e?.message || "Falha ao acessar microfone.");
      stopStream();
      setRecording(false);
    }
  }

  async function stopRecording() {
    setRecordErr(null);
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch (e: any) {
      setRecordErr(e?.message || "Falha ao parar gravação.");
    } finally {
      setRecording(false);
    }
  }

  function discardRecordedAudio() {
    setRecordErr(null);
    setAudioBlob(null);
    if (audioUrl) {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch {}
    }
    setAudioUrl(null);
  }

    async function sendProvidedText(message: string) {
    const msg = String(message || "").trim();
    if (!msg) return;

    setSending(true);
    setErr(null);

    // Quando editado via modal, compara o texto enviado com a sugestão original da IA.
    // Quando editado direto no painel, aiUsagePercent já faz essa comparação.
    const finalPercent = suggestionModifiedBy
      ? calcAiUsagePercent(msg, latestAiSuggestionText)
      : (aiUsagePercent ?? 0);
    const finalLabel = (() => {
      if (finalPercent >= 100) return "100% IA";
      const percentLabel = aiParticipationLabelFromPercent(finalPercent);
      if (!suggestionModifiedBy) return percentLabel;
      if (finalPercent <= 0) return `Editado por ${suggestionModifiedBy}`;
      return `${percentLabel} • Editado por ${suggestionModifiedBy}`;
    })();

    try {
      await apiFetch("/leads/" + id + "/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: msg,
          aiAssistancePercent: finalPercent,
          aiAssistanceLabel: finalLabel,
        }),
      });
      setText("");
      setHasNewInbound(false);
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function sendText() {
    await sendProvidedText(text);
  }

  async function sendRecordedAudio() {
    if (!audioBlob) return;

    setSending(true);
    setErr(null);

    try {
      const fd = new FormData();
      const mime = String(audioBlob.type || "").toLowerCase();
      const ext = mime.indexOf("ogg") >= 0 ? "ogg" : "webm";

      const file = new File([audioBlob], "audio-" + Date.now() + "." + ext, { type: audioBlob.type || ("audio/" + ext) });
      fd.append("file", file);

      const token = getAccessToken();
      if (!token) throw new Error("Sem token no navegador. Faça login novamente.");

      const url = absApiUrl("/leads/" + encodeURIComponent(id) + "/send-whatsapp-audio");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          // �R NÒO colocar Content-Type aqui (FormData precisa do boundary automático)
        },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(("Falha ao enviar áudio (" + res.status + ") " + (txt || "").slice(0, 200)).trim());
      }

      discardRecordedAudio();
      setHasNewInbound(false);
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar áudio");
    } finally {
      setSending(false);
    }
  }

  async function sendAttachmentFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);

    try {
      const r = await apiFetch("/leads/" + id + "/send-whatsapp-attachment", { method: "POST", body: fd });
      return { ok: true as const, data: r };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "Falha ao enviar anexo" };
    }
  }

  async function prepareAttachmentFromUrl(kind: "image" | "video" | "document", url: string, filenameBase: string) {
    const safeBase = safeFileNameBase(filenameBase || "midia");
    const ext = kind === "image" ? "jpg" : kind === "video" ? "mp4" : "pdf";
    const filename = safeBase + "." + ext;

    setProductsNotice("Preparando anexo...");
    setAttachErr(null);

    const res = await fetch(url);
    if (!res.ok) throw new Error("Falha ao baixar mídia do produto (" + res.status + ")");

    const blob = await res.blob();
    const file = new File([blob], filename, {
      type: blob.type || (kind === "image" ? "image/jpeg" : kind === "video" ? "video/mp4" : "application/pdf"),
    });

    setAttachFile(file);
    setProductsNotice("Anexo pronto confira e clique em Enviar anexo⬝ no chat.");
    setTimeout(() => setProductsNotice(null), 2500);

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function pushOptimisticOutgoingMedia(_file: File) {
    // propositalmente vazio: evita mensagem fantasma⬝
  }


  const filteredProducts = useMemo(() => {
    const q = productsQuery.trim().toLowerCase();
    const base = Array.isArray(products) ? products : [];
    if (!q) return base.slice(0, 50);

    const hits = base.filter((p) => {
      const hay = [p?.title, p?.city, p?.neighborhood, p?.origin, p?.type, p?.status].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });

    return hits.slice(0, 50);
  }, [products, productsQuery]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return (products || []).find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  function insertIntoChat(s: string) {
    const snippet = String(s || "").trim();
    if (!snippet) return;

    setText((prev) => {
      const cur = prev || "";
      if (!cur.trim()) return snippet;
      return cur + "\n" + snippet;
    });

    requestAnimationFrame(() => {
      try {
        inputRef.current?.focus();
      } catch {}
    });
  }

  function buildProductSummary(p: Product) {
    const parts: string[] = [];
    const title = p.title ? String(p.title) : "Produto";
    parts.push("*" + title + "*");

    const loc = [p.city, p.neighborhood].filter(Boolean).join(" - ");
    if (loc) parts.push(loc);

    if (p.description && String(p.description).trim()) {
      parts.push("");
      parts.push(String(p.description).trim());
    }

    if (!p.description || !String(p.description).trim()) {
      parts.push("");
      parts.push("Resumo: (adicione uma descrição no cadastro do produto para deixar este texto perfeito).");
    }

    return parts.join("\n");
  }

  async function handleCopyLink(url: string) {
    const ok = await copyToClipboard(url);
    setProductsNotice(ok ? "Link copiado." : "Não consegui copiar. (Seu navegador bloqueou)");
    setTimeout(() => setProductsNotice(null), 1500);
  }

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  function autoGrow() {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  useEffect(() => {
    autoGrow();
  }, [text]);

  return (
    <AppShell title="Lead">
      <div className="h-screen flex flex-col overflow-hidden">
            {/* STEPPER DO FUNIL (ETAPA 4) */}
        <div className="mb-4 rounded-xl border bg-[var(--shell-card-bg)] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-[var(--shell-subtext)]">Funil</div>

            {(lead as any)?.stageKey === "BASE_FRIA" && (lead as any)?.previousStageName ? (
              <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-800">
                Etapa anterior: {(lead as any).previousStageName}
              </div>
            ) : null}
          </div>

          {pipelineStages.length ? (() => {
            const currentStageId = (lead as any)?.stageId || null;

            async function moveToStage(stageId: string) {
              try {
                setMovingStage(true);
                await apiFetch("/leads/" + id + "/stage", {
                  method: "PATCH",
                  body: JSON.stringify({ stageId }),
                });
                await loadLead();

                const newStage = pipelineStages.find((s) => s.id === stageId);
                if (newStage?.group && newStage.group !== currentGroup) {
                  router.replace(`/leads/${id}?group=${newStage.group}`);
                }
              } catch (e: any) {
                alert(e?.message || "Erro ao mover etapa");
              } finally {
                setMovingStage(false);
              }
            }

            return (
              <PipelineStepper
                stages={pipelineStages}
                currentStageId={currentStageId}
                currentGroup={currentGroup}
                allowedStageIds={allowedStages.map((s) => s.id)}
                disabled={movingStage}
                onSelectStage={(stage) => moveToStage(stage.id)}
              />
            );
          })() : loadingPipeline ? (
            <div className="text-sm text-[var(--shell-subtext)]">Carregando funil...</div>
          ) : pipelineErr ? (
            <div className="text-sm text-red-700">{pipelineErr}</div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3 items-stretch h-[calc(100vh-220px)] overflow-hidden">
          {/* ESQUERDA */}
          <div className="space-y-4 lg:col-span-1 overflow-y-auto pr-1">
            {/* Lead */}
            <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
              <div className="text-sm font-semibold text-[var(--shell-text)] flex items-center justify-between gap-2">
                <span>Lead</span>
                <label className="text-xs text-[var(--shell-subtext)] flex items-center gap-2 select-none">
                  <input type="checkbox" checked={debugOn} onChange={(e) => setDebugOn(e.target.checked)} />
                  Debug
                </label>
              </div>

              {loadingLead ? (
                <div className="mt-3 text-sm text-[var(--shell-subtext)]">Carregando...</div>
              ) : lead ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-[var(--shell-subtext)]">Nome da fonte</div>
                    <div className="font-medium text-[var(--shell-text)]">{lead.nome || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--shell-subtext)] mb-1">Nome confirmado</div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--shell-text)]">
                        {lead.nomeCorreto || <span className="text-[var(--shell-subtext)] italic text-xs">não confirmado</span>}
                      </span>
                      {lead.nomeCorretoOrigem === "IA" && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">IA</span>
                      )}
                      {lead.nomeCorretoOrigem === "MANUAL" && (
                        <span className="inline-flex items-center rounded-full bg-[var(--shell-hover)] border border-[var(--shell-card-border)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)]">Manual</span>
                      )}
                      <button
                        className="ml-auto text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)]"
                        title="Editar nome confirmado"
                        onClick={() => { setNomeConfirmadoEdit(lead.nomeCorreto ?? ""); setNomeModalOpen(true); }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--shell-subtext)]">Telefone</div>
                    <div className="text-[var(--shell-text)]">{lead.telefone || "�"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--shell-subtext)]">Status</div>
                    <div className="text-[var(--shell-text)]">{lead.status || "NOVO"}</div>
                  </div>

                  {lead.origem && (
                    <div>
                      <div className="text-xs text-[var(--shell-subtext)]">Origem</div>
                      <div className="text-[var(--shell-text)]">{lead.origem}</div>
                    </div>
                  )}

                  {/* Responsável — select para OWNER/MANAGER */}
                  <div>
                    <div className="text-xs text-[var(--shell-subtext)] mb-1">Responsável</div>
                    {user?.role !== "AGENT" ? (
                      <select
                        className="w-full rounded border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-2 py-1.5 text-sm text-[var(--shell-text)] disabled:opacity-60"
                        value={lead.assignedUserId ?? ""}
                        disabled={assignLoading}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          if (!val) return;
                          setAssignLoading(true);
                          try {
                            await apiFetch(`/leads/${lead.id}/assign`, {
                              method: "POST",
                              body: JSON.stringify({ assignedUserId: val }),
                            });
                            setLead((prev) => prev ? { ...prev, assignedUserId: val } : prev);
                          } catch (err: any) {
                            alert(err?.message || "Erro ao atribuir.");
                          } finally {
                            setAssignLoading(false);
                          }
                        }}
                      >
                        <option value="">— Sem responsável —</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-[var(--shell-text)]">
                        {teamMembers.find((m) => m.id === lead.assignedUserId)?.nome ?? "—"}
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--shell-subtext)]">Não carregou.</div>
              )}

              <button
                className="mt-4 w-full rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
                onClick={loadAll}
                disabled={loadingLead || loadingEvents}
              >
                Atualizar
              </button>

              {user?.role === "OWNER" && lead && (
                <button
                  className="mt-2 w-full rounded-md border border-red-200 bg-[var(--shell-card-bg)] px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm(`Excluir o lead "${lead.nome}"? Esta ação não pode ser desfeita.`)) return;
                    try {
                      await apiFetch("/leads/" + id, { method: "DELETE" });
                      router.push("/leads");
                    } catch (e: any) {
                      alert(e?.message || "Erro ao excluir lead");
                    }
                  }}
                >
                  Excluir lead
                </button>
              )}

              {err ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
              ) : null}

              {debugOn ? (
                <div className="mt-4 rounded-lg border bg-[var(--shell-bg)] p-3 text-xs text-[var(--shell-text)] space-y-2">
                  <div className="font-semibold text-[var(--shell-text)]">Debug (Front)</div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-[var(--shell-subtext)]">events (state)</div>
                      <div className="font-mono">{events.length}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[var(--shell-subtext)]">viewEvents (render)</div>
                      <div className="font-mono">{viewEvents.length}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[var(--shell-subtext)]">pollCount</div>
                      <div className="font-mono">{pollCount}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-[var(--shell-subtext)]">lastFetchAt</div>
                      <div className="font-mono break-all">{lastFetchAt || "�"}</div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-[11px] text-[var(--shell-subtext)]">events shape</div>
                      <div className="font-mono break-all">{lastEventsShape || "�"}</div>
                    </div>

                    {lastPollError ? (
                      <div className="col-span-2">
                        <div className="text-[11px] text-[var(--shell-subtext)]">lastPollError</div>
                        <div className="font-mono text-red-700 break-all">{lastPollError}</div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-[11px] text-[var(--shell-subtext)]">last visible event (ordered)</div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-[var(--shell-card-bg)] p-2 text-[11px] leading-snug">
                      {JSON.stringify(lastVisibleEvent, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="text-[11px] text-[var(--shell-subtext)]">raw /events response (shape)</div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-[var(--shell-card-bg)] p-2 text-[11px] leading-snug">
                      {JSON.stringify(lastEventsRaw, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Qualificação IA */}
            {lead && (() => {
              const hasAnyQual = !!(
                lead.rendaBrutaFamiliar != null || lead.fgts != null ||
                lead.valorEntrada != null || lead.estadoCivil || lead.dataNascimento ||
                lead.tempoProcurandoImovel || lead.conversouComCorretor != null ||
                lead.qualCorretorImobiliaria || lead.perfilImovel || lead.resumoLead
              );

              const fmtCurrency = (v?: number | null) =>
                v != null ? "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : null;

              const fmtDate = (v?: string | null) => {
                if (!v) return null;
                try {
                  return new Date(v).toLocaleDateString("pt-BR");
                } catch { return v; }
              };

              const estadoCivilLabels: Record<string, string> = {
                SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", UNIAO_ESTAVEL: "União Estável",
                DIVORCIADO: "Divorciado(a)", VIUVO: "Viúvo(a)",
              };

              const perfilLabels: Record<string, string> = {
                POPULAR: "Popular", MEDIO: "Médio", ALTO_PADRAO: "Alto Padrão", LUXO: "Luxo",
              };

              return (
                <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setQualOpen((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--shell-text)]">Qualificação IA</span>
                      {hasAnyQual && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          Coletado
                        </span>
                      )}
                    </div>
                    <span className="text-[var(--shell-subtext)] text-xs">{qualOpen ? "▲" : "▼"}</span>
                  </button>

                  {qualOpen && (
                    <div className="mt-3 space-y-2 text-sm">
                      {!hasAnyQual && (
                        <div className="text-xs text-[var(--shell-subtext)] italic">
                          Nenhum dado coletado ainda. A IA preenche automaticamente durante a conversa.
                        </div>
                      )}

                      {fmtCurrency(lead.rendaBrutaFamiliar) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Renda bruta familiar</div>
                          <div className="text-[var(--shell-text)]">{fmtCurrency(lead.rendaBrutaFamiliar)}</div>
                        </div>
                      )}

                      {fmtCurrency(lead.fgts) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">FGTS</div>
                          <div className="text-[var(--shell-text)]">{fmtCurrency(lead.fgts)}</div>
                        </div>
                      )}

                      {fmtCurrency(lead.valorEntrada) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Valor de entrada</div>
                          <div className="text-[var(--shell-text)]">{fmtCurrency(lead.valorEntrada)}</div>
                        </div>
                      )}

                      {lead.estadoCivil && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Estado civil</div>
                          <div className="text-[var(--shell-text)]">{estadoCivilLabels[lead.estadoCivil] ?? lead.estadoCivil}</div>
                        </div>
                      )}

                      {fmtDate(lead.dataNascimento) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Data de nascimento</div>
                          <div className="text-[var(--shell-text)]">{fmtDate(lead.dataNascimento)}</div>
                        </div>
                      )}

                      {lead.tempoProcurandoImovel && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Tempo buscando imóvel</div>
                          <div className="text-[var(--shell-text)]">{lead.tempoProcurandoImovel}</div>
                        </div>
                      )}

                      {lead.conversouComCorretor != null && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Conversou com corretor antes?</div>
                          <div className="text-[var(--shell-text)]">{lead.conversouComCorretor ? "Sim" : "Não"}</div>
                        </div>
                      )}

                      {lead.qualCorretorImobiliaria && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Corretor/Imobiliária anterior</div>
                          <div className="text-[var(--shell-text)]">{lead.qualCorretorImobiliaria}</div>
                        </div>
                      )}

                      {lead.perfilImovel && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Perfil do imóvel</div>
                          <div className="text-[var(--shell-text)]">{perfilLabels[lead.perfilImovel] ?? lead.perfilImovel}</div>
                        </div>
                      )}

                      {lead.resumoLead && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Resumo</div>
                          <div className="rounded-md border bg-[var(--shell-bg)] p-2 text-xs text-[var(--shell-text)] leading-relaxed whitespace-pre-wrap">
                            {lead.resumoLead}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Documentos */}
            {lead && (
              <a
                href={`/leads/${lead.id}/documentos`}
                className="mt-4 flex w-full items-center justify-between rounded-xl border bg-[var(--shell-card-bg)] px-4 py-3 text-sm font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-bg)]"
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--shell-subtext)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Cadastro e Documentos
                </span>
                <svg className="h-4 w-4 text-[var(--shell-subtext)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </a>
            )}

            {/* Análise de Crédito */}
            {lead && (
              <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--shell-card-border)]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">💳</span>
                    <span className="text-sm font-semibold text-[var(--shell-text)]">Análise de Crédito</span>
                    {creditRequests.length > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{creditRequests.length}</span>
                    )}
                  </div>
                  <button onClick={() => setShowCreditForm((p) => !p)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors">
                    + Enviar para Correspondente
                  </button>
                </div>

                {/* Formulário de nova solicitação */}
                {showCreditForm && (
                  <div className="px-4 py-4 border-b border-[var(--shell-card-border)] bg-blue-50/50 space-y-3">
                    <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nova Solicitação</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs text-[var(--shell-subtext)]">Correspondente *</label>
                        <select value={creditForm.correspondentId}
                          onChange={(e) => setCreditForm((p) => ({ ...p, correspondentId: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--shell-card-border)] bg-white px-3 py-2 text-sm text-[var(--shell-text)]">
                          <option value="">Selecione...</option>
                          {correspondents.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}{c.empresa ? ` — ${c.empresa}` : ""}</option>
                          ))}
                        </select>
                      </div>
                      {[
                        { k: "valorImovel",  l: "Valor do Imóvel (R$)" },
                        { k: "valorCredito", l: "Crédito Solicitado (R$)" },
                        { k: "rendaMensal",  l: "Renda Mensal (R$)" },
                      ].map(({ k, l }) => (
                        <div key={k} className="space-y-1">
                          <label className="text-xs text-[var(--shell-subtext)]">{l}</label>
                          <input type="number" value={(creditForm as any)[k]}
                            onChange={(e) => setCreditForm((p) => ({ ...p, [k]: e.target.value }))}
                            className="w-full rounded-lg border border-[var(--shell-card-border)] bg-white px-3 py-2 text-sm" />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <label className="text-xs text-[var(--shell-subtext)]">Tipo de Financiamento</label>
                        <select value={creditForm.tipoFinanciamento}
                          onChange={(e) => setCreditForm((p) => ({ ...p, tipoFinanciamento: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--shell-card-border)] bg-white px-3 py-2 text-sm">
                          <option value="SBPE">SBPE</option>
                          <option value="MINHA_CASA_MINHA_VIDA">Minha Casa Minha Vida</option>
                          <option value="FGTS">FGTS</option>
                          <option value="CONSORCIO">Consórcio</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs text-[var(--shell-subtext)]">Observações</label>
                        <textarea value={creditForm.observacoes}
                          onChange={(e) => setCreditForm((p) => ({ ...p, observacoes: e.target.value }))}
                          rows={2} className="w-full rounded-lg border border-[var(--shell-card-border)] bg-white px-3 py-2 text-sm resize-none" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowCreditForm(false)}
                        className="rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]">
                        Cancelar
                      </button>
                      <button
                        disabled={savingCredit || !creditForm.correspondentId}
                        onClick={async () => {
                          setSavingCredit(true);
                          try {
                            await createCreditRequest(lead.id, {
                              correspondentId:  creditForm.correspondentId,
                              valorImovel:      creditForm.valorImovel ? parseFloat(creditForm.valorImovel) : undefined,
                              valorCredito:     creditForm.valorCredito ? parseFloat(creditForm.valorCredito) : undefined,
                              rendaMensal:      creditForm.rendaMensal ? parseFloat(creditForm.rendaMensal) : undefined,
                              tipoFinanciamento: creditForm.tipoFinanciamento || undefined,
                              observacoes:      creditForm.observacoes || undefined,
                            } as any);
                            setShowCreditForm(false);
                            setCreditForm({ correspondentId: "", valorImovel: "", valorCredito: "", rendaMensal: "", tipoFinanciamento: "SBPE", observacoes: "" });
                            await loadCreditData();
                          } finally { setSavingCredit(false); }
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                        {savingCredit ? "Enviando..." : "Enviar"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de solicitações */}
                {creditRequests.length > 0 ? (
                  <div className="divide-y divide-[var(--shell-card-border)]">
                    {creditRequests.map((cr) => (
                      <div key={cr.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: CREDIT_STATUS_COLOR[cr.status] + "22", color: CREDIT_STATUS_COLOR[cr.status] }}>
                          {CREDIT_STATUS_LABEL[cr.status]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--shell-text)]">{cr.correspondent.nome}</p>
                          {cr.correspondent.empresa && <p className="text-[10px] text-[var(--shell-subtext)]">{cr.correspondent.empresa}</p>}
                          {cr.parecer && <p className="text-[11px] text-[var(--shell-subtext)] mt-0.5 italic">"{cr.parecer}"</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-[var(--shell-subtext)]">{new Date(cr.createdAt).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <button onClick={async () => { await cancelCreditRequest(lead.id, cr.id); await loadCreditData(); }}
                          className="text-[10px] text-red-400 hover:text-red-600" title="Cancelar">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  !showCreditForm && (
                    <div className="px-4 py-4 text-xs text-center text-[var(--shell-subtext)]">
                      Nenhuma solicitação enviada ainda.
                    </div>
                  )
                )}
              </div>
            )}

            {/* Painel SLA */}
            {slaData && (
              <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm font-semibold text-[var(--shell-text)]">SLA</div>
                  {slaLoading && <span className="text-xs text-[var(--shell-subtext)]">atualizando...</span>}
                </div>

                {/* Stage group badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    slaData.stageGroup === 'PRE_ATENDIMENTO'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-[var(--shell-hover)] text-[var(--shell-subtext)]'
                  }`}>
                    {slaData.stageName ?? slaData.stageGroup ?? 'Sem etapa'}
                  </span>
                  {slaData.stageGroup !== 'PRE_ATENDIMENTO' && (
                    <span className="text-xs text-[var(--shell-subtext)]">SLA inativo nesta etapa</span>
                  )}
                </div>

                {/* 23h window */}
                {slaData.lastInboundAt && (
                  <div className={`rounded-md border p-2 mb-3 text-xs ${
                    slaData.windowExpired
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : slaData.windowRemainingMinutes < 120
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}>
                    <div className="font-medium mb-0.5">Janela WhatsApp (23h)</div>
                    {slaData.windowExpired ? (
                      <div>Janela expirada</div>
                    ) : (
                      <div>
                        Fecha em{' '}
                        {slaData.windowRemainingMinutes >= 60
                          ? `${Math.floor(slaData.windowRemainingMinutes / 60)}h ${slaData.windowRemainingMinutes % 60}min`
                          : `${slaData.windowRemainingMinutes}min`}
                        {' '}· {new Date(slaData.windowCloseAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                )}

                {/* Scheduled jobs */}
                {slaData.scheduledJobs?.length > 0 ? (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-[var(--shell-subtext)] mb-1">Agendados</div>
                    <div className="space-y-1">
                      {slaData.scheduledJobs.map((job: any) => {
                        const urgencyColor: Record<string, string> = {
                          BAIXA: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                          MEDIA: 'text-blue-700 bg-blue-50 border-blue-200',
                          ALTA: 'text-amber-700 bg-amber-50 border-amber-200',
                          CRITICA: 'text-red-700 bg-red-50 border-red-200',
                        };
                        const color = urgencyColor[job.urgency] ?? 'text-[var(--shell-subtext)] bg-[var(--shell-bg)] border-[var(--shell-card-border)]';
                        return (
                          <div key={job.jobId} className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${color}`}>
                            <span className="font-medium">{job.name}</span>
                            <span>
                              {new Date(job.scheduledFor).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : slaData.stageGroup === 'PRE_ATENDIMENTO' ? (
                  <div className="text-xs text-[var(--shell-subtext)] mb-3">Nenhum SLA agendado</div>
                ) : null}

                {/* Recent history */}
                {slaData.history?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--shell-subtext)] mb-1">Histórico recente</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {slaData.history.slice(0, 8).map((ev: any) => {
                        const p = ev.payload || {};
                        const isBlocked = p.outcome === 'BLOCKED';
                        const isDue = p.outcome === 'DUE';
                        const isSuggestion = ev.channel === 'ai.suggestion';
                        return (
                          <div key={ev.id} className="flex items-start gap-1.5 text-xs text-[var(--shell-subtext)]">
                            <span className="mt-0.5 shrink-0">
                              {isSuggestion ? '🤖' : isDue ? '⏰' : isBlocked ? '⛔' : '•'}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="font-medium">
                                {isSuggestion ? 'Sugestão IA' : p.reason ?? p.outcome ?? ev.channel}
                              </span>
                              {' · '}
                              <span className="text-[var(--shell-subtext)]">
                                {new Date(ev.criadoEm).toLocaleString('pt-BR', {
                                  day: '2-digit', month: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Produtos Disponíveis */}
            <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--shell-text)]">Produtos Disponíveis</div>
                <button
                  type="button"
                  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                  onClick={() => loadProducts()}
                  disabled={productsLoading}
                >
                  {productsLoading ? "Carregando..." : "Recarregar"}
                </button>
              </div>

              {productsErr ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{productsErr}</div>
              ) : null}

              {productsNotice ? (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  {productsNotice}
                </div>
              ) : null}

              <div className="mt-3">
                <input
                  value={productsQuery}
                  onChange={(e) => setProductsQuery(e.target.value)}
                  placeholder="Buscar por título/cidade/bairro..."
                  className="w-full rounded-md border p-2 text-sm"
                />
                <div className="mt-1 text-[11px] text-[var(--shell-subtext)]">Mostrando até 50 resultados. Total carregado: {products.length}</div>
              </div>

              <div className="mt-3 grid gap-2">
                <select
                  className="w-full rounded-md border bg-[var(--shell-card-bg)] p-2 text-sm"
                  value={selectedProductId}
                  onChange={(e) => {
                    const v = e.target.value || "";
                    setSelectedProductId(v);
                    setProductTab(null);
                  }}
                  disabled={productsLoading}
                >
                  <option value="">(Selecione um produto)</option>
                  {filteredProducts.map((p) => {
                    const t = p?.title ? String(p.title) : p.id;
                    const meta = [p?.city, p?.neighborhood].filter(Boolean).join(" - ");
                    return (
                      <option key={p.id} value={p.id}>
                        {t}
                        {meta ? " - " + meta : ""}
                      </option>
                    );
                  })}
                </select>

                {selectedProduct ? (
                  <div className="rounded-lg border bg-[var(--shell-bg)] p-3 text-xs text-[var(--shell-text)]">
                    <div className="font-semibold text-[var(--shell-text)] truncate">{selectedProduct.title || "Produto"}</div>
                    <div className="mt-1 text-[11px] text-[var(--shell-subtext)]">
                      {selectedProduct.city ? <span>{selectedProduct.city}</span> : null}
                      {selectedProduct.neighborhood ? <span>{" - " + selectedProduct.neighborhood}</span> : null}
                    </div>

                    <div className="mt-3 rounded-md border bg-[var(--shell-card-bg)] p-2">
                      <div className="text-[11px] text-[var(--shell-subtext)] mb-1">Resumo</div>
                      <div className="text-xs whitespace-pre-wrap text-[var(--shell-text)]">{buildProductSummary(selectedProduct)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                          onClick={() => insertIntoChat(buildProductSummary(selectedProduct))}
                          title="Insere o resumo no campo de mensagem"
                        >
                          Inserir resumo no chat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-[var(--shell-bg)] p-3 text-xs text-[var(--shell-subtext)]">
                    Selecione um produto para ver imagens/documentos/vídeos.
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {(["IMAGENS", "DOCUMENTOS", "VIDEOS"] as ProductTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProductTab(t)}
                      className={[
                        "rounded-md border px-3 py-2 text-xs font-semibold",
                        productTab === t ? "bg-slate-900 text-white border-slate-900" : "bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)]",
                      ].join(" ")}
                      disabled={!selectedProduct}
                    >
                      {t === "IMAGENS" ? "Imagens" : t === "DOCUMENTOS" ? "Documentos" : "Vídeos"}
                    </button>
                  ))}
                </div>

                <div className="mt-2">
                  {!selectedProduct ? (
                    <div className="text-xs text-[var(--shell-subtext)]">�</div>
                  ) : productTab === null ? (
                    <div className="text-xs text-[var(--shell-subtext)]">
                      Clique em <b>Imagens</b>, <b>Documentos</b> ou <b>Vídeos</b> para mostrar o conteúdo.
                    </div>
                  ) : productTab === "IMAGENS" ? (
                    (selectedProduct.images || []).length === 0 ? (
                      <div className="text-xs text-[var(--shell-subtext)]">Sem imagens neste produto.</div>
                    ) : (
                      <div className="space-y-2">
                        {(selectedProduct.images || [])
                          .slice()
                          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .slice(0, 20)
                          .map((img) => {
                            const url = String(img.url || "");
                            const nameBase = img.title || img.label || "imagem-" + img.id;
                            return (
                              <div key={img.id} className="rounded-lg border bg-[var(--shell-card-bg)] p-2">
                                <div className="text-xs font-semibold text-[var(--shell-text)] truncate">
                                  {img.title || img.label || "Imagem"}
                                  {img.isPrimary ? " = (capa)" : ""}
                                </div>

                                <div className="mt-1 text-[11px] text-[var(--shell-subtext)] break-all">{url}</div>

                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer noopener" className="mt-2 block">
                                    <img src={url} alt="img" className="h-28 w-full object-cover rounded-md border" />
                                  </a>
                                ) : null}

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={() => insertIntoChat(url)}
                                    disabled={!url}
                                    title="Insere o link no campo de mensagem"
                                  >
                                    Inserir link no chat
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={async () => {
                                      if (!url) return;
                                      try {
                                        await prepareAttachmentFromUrl("image", url, nameBase);
                                      } catch (e: any) {
                                        setProductsNotice("Falha ao preparar anexo: " + (e?.message || "erro"));
                                        setTimeout(() => setProductsNotice(null), 2500);
                                      }
                                    }}
                                    disabled={!url}
                                    title="Prepara o anexo para você revisar e enviar no chat"
                                  >
                                    Enviar imagem
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={() => handleCopyLink(url)}
                                    disabled={!url}
                                    title="Copiar link"
                                  >
                                    Copiar link
                                  </button>

                                  <a
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                  >
                                    Abrir
                                  </a>
                                </div>
                              </div>
                            );
                          })}

                        {(selectedProduct.images || []).length > 20 ? (
                          <div className="text-[11px] text-[var(--shell-subtext)]">Mostrando 20 primeiras imagens.</div>
                        ) : null}
                      </div>
                    )
                  ) : productTab === "DOCUMENTOS" ? (
                    (selectedProduct.documents || []).length === 0 ? (
                      <div className="text-xs text-[var(--shell-subtext)]">Sem documentos neste produto.</div>
                    ) : (
                      <div className="space-y-2">
                        {(selectedProduct.documents || [])
                          .slice()
                          .sort((a, b) => {
                            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                            return tb - ta;
                          })
                          .slice(0, 20)
                          .map((doc) => {
                            const url = String(doc.url || "");
                            const base = safeFileNameBase(doc.title || doc.type || "documento-" + doc.id);
                            const filename = base + ".pdf";

                            return (
                              <div key={doc.id} className="rounded-lg border bg-[var(--shell-card-bg)] p-2">
                                <div className="text-xs font-semibold text-[var(--shell-text)] truncate">{doc.title || doc.type || "Documento"}</div>

                                <div className="mt-1 text-[11px] text-[var(--shell-subtext)]">
                                  {doc.type ? <span>{doc.type}</span> : null}
                                  {doc.category ? <span>{" - " + doc.category}</span> : null}
                                  {doc.visibility ? <span>{" - " + doc.visibility}</span> : null}
                                </div>

                                <div className="mt-1 text-[11px] text-[var(--shell-subtext)] break-all">{url}</div>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={() => insertIntoChat(url)}
                                    disabled={!url}
                                    title="Insere o link no campo de mensagem"
                                  >
                                    Inserir link no chat
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={async () => {
                                      if (!url) return;
                                      try {
                                        await prepareAttachmentFromUrl("document", url, base);
                                      } catch (e: any) {
                                        setProductsNotice("Falha ao preparar anexo: " + (e?.message || "erro"));
                                        setTimeout(() => setProductsNotice(null), 2500);
                                      }
                                    }}
                                    disabled={!url}
                                    title="Prepara o documento para você revisar e enviar no chat"
                                  >
                                    Enviar documento
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={() => handleCopyLink(url)}
                                    disabled={!url}
                                    title="Copiar link"
                                  >
                                    Copiar link
                                  </button>

                                  <a className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" href={url} target="_blank" rel="noreferrer noopener">
                                    Abrir
                                  </a>

                                  <button type="button" className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" onClick={() => downloadWithAuth(url, filename)} disabled={!url}>
                                    Baixar
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                        {(selectedProduct.documents || []).length > 20 ? (
                          <div className="text-[11px] text-[var(--shell-subtext)]">Mostrando 20 primeiros documentos.</div>
                        ) : null}
                      </div>
                    )
                  ) : (selectedProduct.videos || []).length === 0 ? (
                    <div className="text-xs text-[var(--shell-subtext)]">Sem vídeos neste produto.</div>
                  ) : (
                    <div className="space-y-2">
                      {(selectedProduct.videos || [])
                        .slice()
                        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                        .slice(0, 20)
                        .map((v) => {
                          const url = String(v.url || "");
                          const name = safeFileNameBase(v.title || "video-" + v.id) + ".mp4";

                          return (
                            <div key={v.id} className="rounded-lg border bg-[var(--shell-card-bg)] p-2">
                              <div className="text-xs font-semibold text-[var(--shell-text)] truncate">{v.title || "Vídeo"}</div>
                              <div className="mt-1 text-[11px] text-[var(--shell-subtext)] break-all">{url}</div>

                              {url ? (
                                <video controls preload="metadata" className="mt-2 max-h-40 w-full rounded-md border">
                                  <source src={url} />
                                </video>
                              ) : null}

                              <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" onClick={() => insertIntoChat(url)} disabled={!url}>
                                  Inserir link no chat
                                </button>

                                <button
                                  type="button"
                                  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                  onClick={async () => {
                                    if (!url) return;
                                    try {
                                      await prepareAttachmentFromUrl("video", url, v.title || "video-" + v.id);
                                    } catch (e: any) {
                                      setProductsNotice("Falha ao preparar anexo: " + (e?.message || "erro"));
                                      setTimeout(() => setProductsNotice(null), 2500);
                                    }
                                  }}
                                  disabled={!url}
                                >
                                  Enviar vídeo
                                </button>

                                <button type="button" className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" onClick={() => handleCopyLink(url)} disabled={!url}>
                                  Copiar link
                                </button>

                                <a className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" href={url} target="_blank" rel="noreferrer noopener">
                                  Abrir
                                </a>

                                <button type="button" className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]" onClick={() => downloadWithAuth(url, name)} disabled={!url}>
                                  Baixar
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {(selectedProduct.videos || []).length > 20 ? (
                        <div className="text-[11px] text-[var(--shell-subtext)]">Mostrando 20 primeiros vídeos.</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CHAT */}
          <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden lg:col-span-2 flex flex-col h-full lg:sticky lg:top-4">
            <div className="border-b bg-[var(--shell-bg)] px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full border bg-[var(--shell-card-bg)] flex items-center justify-center overflow-hidden shrink-0">
                  {lead?.avatarUrl ? (
                    <img src={lead.avatarUrl} alt="avatar" className="h-9 w-9 object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-[var(--shell-subtext)]">
                      {String((lead?.nomeCorreto ?? lead?.nome) || "HC")
                        .split(" ")
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--shell-text)] truncate flex items-center gap-2">
                    <span>{lead?.nomeCorreto ?? lead?.nome ?? "Chat"}</span>
                    {hasNewInbound ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        Nova mensagem
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px] text-[var(--shell-subtext)] flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-mono">{"Nº " + leadNumberLabel}</span>
                    <span>{"Inicio: " + (startedAt ? formatDateOnly(startedAt) : "�")}</span>
                    <span>
                      {"Ultimo inbound: " +
                        (lastInboundAt ? formatTime(lastInboundAt) : "�") +
                        " - há " +
                        lastInboundAgoLabel}
                    </span>
                    {lead?.telefone ? <span>{"Tel: " + lead.telefone}</span> : null}
                  </div>
                </div>
              </div>

              {debugOn ? (
                <div className="text-[11px] text-[var(--shell-subtext)] font-mono shrink-0">
                  {"events:" + events.length + " | render:" + viewEvents.length}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-5">
              {loadingEvents ? (
                <div className="text-sm text-[var(--shell-subtext)]">Carregando historico...</div>
              ) : viewEvents.length === 0 ? (
                <div className="text-sm text-[var(--shell-subtext)]">Sem mensagens ainda.</div>
              ) : (
                viewEvents.map(({ ev, reactions }) => (
                  <Bubble key={ev.id} ev={ev} reactions={reactions} leadId={id} onOpenModal={openMediaModal} />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t bg-[var(--shell-card-bg)] p-3 space-y-3">
              {/* PAINEL DA IA */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-amber-900">Painel da IA</div>
                    <div className="text-[11px] text-amber-800">
                      Copilot para este lead. Quando o Autopilot estiver ON, a IA só deve agir no disparo configurado.
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-amber-900">IA Autopilot</span>
                    <button
                      type="button"
                      onClick={() => toggleAutopilot(!autopilotEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${autopilotEnabled ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"}`}
                    >
                      <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-[var(--shell-card-bg)] shadow-md transition-transform duration-200 ${autopilotEnabled ? "translate-x-6" : "translate-x-0"}`} />
                    </button>
                    <span className={`text-xs font-semibold ${autopilotEnabled ? "text-emerald-700" : "text-[var(--shell-subtext)]"}`}>
                      {autopilotEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>

                {latestAiSuggestion ? (
                  <div className="rounded-xl border border-amber-300 bg-[var(--shell-card-bg)] p-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Sugestão da IA
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--shell-subtext)]">
                          {formatTime(latestAiSuggestion.criadoEm)}
                          {latestAiPayload?.agentTitle ? " • " + String(latestAiPayload.agentTitle) : ""}
                          {latestAiPayload?.jobName ? " • " + String(latestAiPayload.jobName) : ""}
                        </div>
                      </div>

                      <div className="rounded-md border bg-[var(--shell-bg)] px-2 py-1 text-[11px] text-[var(--shell-subtext)]">
                        {aiUsagePercent}% IA
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-[var(--shell-subtext)]">Formato sugerido</div>
                      <div className="mt-1 text-sm font-medium text-[var(--shell-text)]">{activeAiResponseFormat}</div>
                    </div>

{activeAiSuggestionText ? (
  <div className={`rounded-lg border p-3 ${suggestionModifiedBy ? "bg-amber-50 border-amber-200" : "bg-[var(--shell-bg)]"}`}>
    <div className="flex items-center gap-2">
      {suggestionModifiedBy ? (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          Modificado por {suggestionModifiedBy}
        </span>
      ) : (
        <span className="text-[11px] font-semibold text-[var(--shell-subtext)]">Texto sugerido</span>
      )}
    </div>
    <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--shell-text)]">
      {activeAiSuggestionText}
    </div>
  </div>
) : null}

                    {latestAiSuggestedAudioScript ? (
                      <div className="rounded-lg border bg-[var(--shell-card-bg)] p-3">
                        <div className="text-[11px] font-semibold text-[var(--shell-subtext)]">Roteiro de áudio sugerido</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--shell-text)]">
                          {latestAiSuggestedAudioScript}
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--shell-subtext)]">
                          Estrutura pronta para áudio. O envio automático de áudio fica para a próxima etapa.
                        </div>
                      </div>
                    ) : null}

                    {latestAiSuggestedAttachments.length > 0 ? (
                      <div className="rounded-lg border bg-[var(--shell-card-bg)] p-3">
                        <div className="text-[11px] font-semibold text-[var(--shell-subtext)]">Mídias / documentos sugeridos</div>

                        <div className="mt-2 space-y-2">
                          {latestAiSuggestedAttachments.map((att, idx) => {
                            const kind = String(att?.kind || "document").toLowerCase();
                            const title =
                              String(att?.title || att?.filename || (kind === "image" ? "Imagem" : kind === "video" ? "Vídeo" : kind === "audio" ? "Áudio" : "Documento"));

                            return (
                              <div key={idx} className="rounded-md border bg-[var(--shell-bg)] p-2">
                                <div className="text-xs font-semibold text-[var(--shell-text)]">{title}</div>
                                <div className="mt-1 text-[11px] text-[var(--shell-subtext)] break-all">{String(att?.url || "")}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                    onClick={() => useSuggestedAttachment(att)}
                                  >
                                    Usar sugestão
                                  </button>

                                  {att?.url ? (
                                    <a
                                      className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                                      href={String(att.url)}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                    >
                                      Abrir
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
<button
  type="button"
  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("REGENERATE")}
  disabled={!!aiActionLoading}
>
  {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
</button>

<button
  type="button"
  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("SHORTEN")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "SHORTEN" ? "Encurtando..." : "Encurtar"}
</button>

<button
  type="button"
  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("IMPROVE")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "IMPROVE" ? "Melhorando..." : "Melhorar"}
</button>

<button
  type="button"
  className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("VARIATE")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "VARIATE" ? "Variando..." : "Variar"}
</button>
                      <button
                        type="button"
                        className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                        onClick={useAiSuggestionInField}
                        disabled={!activeAiSuggestionText}
                      >
                        Usar no campo
                      </button>

                      <button
                        type="button"
                        className="rounded-md border bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-700 disabled:opacity-60"
                        onClick={sendAiSuggestionNow}
                        disabled={sending || !activeAiSuggestionText}
                      >
                        {sending ? "Enviando..." : "Enviar"}
                      </button>

                      <button
                        type="button"
                        className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                        onClick={discardAiSuggestion}
                      >
                        Descartar
                      </button>

                      <button
                        type="button"
                        className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)]"
                        onClick={openTeachingModal}
                        disabled={!activeAiSuggestionText}
                      >
                        Salvar como ensinamento
                      </button>
                    </div>

                    {aiTeachNotice ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                        {aiTeachNotice}
                      </div>
                    ) : null}
                  </div>
                ) : aiPanelState === "sent" ? (
                  <div className="rounded-lg border border-dashed border-emerald-300 bg-[var(--shell-card-bg)] p-3 space-y-2">
                    <div className="text-xs text-[var(--shell-subtext)]">Aguardando próxima mensagem do lead...</div>
                    <button
                      type="button"
                      className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
                      onClick={() => requestAiPanelSuggestion("REGENERATE")}
                      disabled={!!aiActionLoading}
                    >
                      {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
                    </button>
                  </div>
                ) : aiPanelState === "discarded" ? (
                  <div className="rounded-lg border border-dashed border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 space-y-2">
                    <div className="text-xs text-[var(--shell-subtext)]">Sugestão descartada.</div>
                    <button
                      type="button"
                      className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-xs hover:bg-[var(--shell-bg)] disabled:opacity-60"
                      onClick={() => requestAiPanelSuggestion("REGENERATE")}
                      disabled={!!aiActionLoading}
                    >
                      {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-[var(--shell-card-bg)] p-3 text-xs text-[var(--shell-subtext)]">
                    Nenhuma sugestão de IA pendente para este lead no momento.
                  </div>
                )}
              </div>

              {/* PREVIEW DO ANEXO */}
              {attachFile ? (
                <div className="rounded-lg border bg-[var(--shell-bg)] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                     <div className="text-xs font-semibold text-[var(--shell-text)]">📎 Anexo pronto</div>
                      <div className="mt-1 text-xs text-[var(--shell-subtext)] truncate">{attachFile.name}</div>
                      <div className="mt-1 text-[11px] text-[var(--shell-subtext)]">
                        {String(attachFile.type || "arquivo").toLowerCase() +
                          " - " +
                          (attachFile.size / 1024).toFixed(1) +
                          " KB"}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-md border bg-[var(--shell-card-bg)] px-2 py-1 text-xs hover:bg-[var(--shell-bg)]"
                      onClick={() => {
                        setAttachErr(null);
                        setAttachFile(null);
                        try {
                          if (filePickerRef.current) filePickerRef.current.value = "";
                        } catch {}
                      }}
                      title="Remover anexo"
                    >
                      Remover
                    </button>
                  </div>

                  {attachPreviewUrl && String(attachFile.type || "").toLowerCase().startsWith("image/") ? (
                    <div className="mt-2">
                      <img src={attachPreviewUrl} alt="preview" className="max-h-56 w-auto rounded-md border" />
                    </div>
                  ) : null}

                  {attachPreviewUrl && String(attachFile.type || "").toLowerCase() === "application/pdf" ? (
                    <div className="mt-2">
                      <iframe src={attachPreviewUrl} className="w-full h-56 rounded-md border bg-[var(--shell-card-bg)]" title="preview-pdf" />
                    </div>
                  ) : null}

                  {attachErr ? (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{attachErr}</div>
                  ) : null}

                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
                      disabled={!attachFile || attachSending}
                      onClick={async () => {
                        if (!attachFile) return;
                        setAttachSending(true);
                        setAttachErr(null);

                        pushOptimisticOutgoingMedia(attachFile);

                        const r = await sendAttachmentFile(attachFile);
                        if (!r.ok) {
                          setAttachErr(r.error);
                        } else {
                          setAttachFile(null);
                          try {
                            if (filePickerRef.current) filePickerRef.current.value = "";
                          } catch {}
                          setHasNewInbound(false);
                          await loadEvents({ silent: true });
                        }

                        setAttachSending(false);
                      }}
                    >
                      {attachSending ? "Enviando..." : "Enviar anexo"}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Áudio gravado */}
              {audioUrl ? (
                <div className="rounded-lg border bg-[var(--shell-bg)] p-2">
                  <div className="text-xs text-[var(--shell-subtext)] flex items-center justify-between gap-2">
                    <span className="font-medium">Áudio gravado</span>
                    <button
                      type="button"
                      className="rounded-md border bg-[var(--shell-card-bg)] px-2 py-1 text-xs hover:bg-[var(--shell-bg)]"
                      onClick={discardRecordedAudio}
                      title="Descartar áudio"
                    >
                      Descartar
                    </button>
                  </div>

                  <audio controls className="mt-2 w-full">
                    <source src={audioUrl} />
                    Seu navegador não suporta áudio.
                  </audio>

                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                      onClick={sendRecordedAudio}
                      disabled={sending}
                      title="Enviar áudio"
                    >
                      {sending ? "Enviando..." : "Enviar áudio"}
                    </button>
                  </div>

                  <div className="mt-2 text-[11px] text-[var(--shell-subtext)]">
                    Obs: o envio real depende do backend criar o endpoint{" "}
                    <span className="font-mono">POST /leads/:id/send-whatsapp-audio</span>.
                  </div>
                </div>
              ) : null}

              {recordErr ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{recordErr}</div>
              ) : null}

              <div className="flex gap-2 items-end">
                <div className="flex gap-2 items-center">
                  {!audioUrl ? (
                    recording ? (
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border bg-red-50 hover:bg-red-100 flex items-center justify-center"
                        title="Parar"
                        onClick={stopRecording}
                      >
                        ⏹️
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="h-10 w-10 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center"
                        title="Gravar áudio"
                        onClick={startRecording}
                        disabled={!audioSupported}
                      >
                        🎤
                      </button>
                    )
                  ) : (
                    <button type="button" className="h-10 w-10 rounded-md border bg-[var(--shell-bg)] flex items-center justify-center" title="Áudio pronto" disabled>
                      📎
                    </button>
                  )}

                  {/* �S& ANEXO AO LADO DO MICROFONE */}
                  <div>
                    <input
                      ref={filePickerRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        setAttachErr(null);
                        setAttachFile(f);
                      }}
                    />

                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center"
                      title="Anexar"
                      onClick={() => {
                        setAttachErr(null);
                        try {
                          if (filePickerRef.current) filePickerRef.current.click();
                        } catch {}
                      }}
                    >
                      📎
                    </button>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] flex items-center justify-center"
                      title="Emoji"
                      onClick={() => setEmojiOpen((v) => !v)}
                    >
                      😂
                    </button>

                    {emojiOpen ? (
                      <div className="absolute bottom-12 left-0 z-20 w-56 rounded-lg border bg-[var(--shell-card-bg)] shadow p-2">
                        <div className="text-[11px] text-[var(--shell-subtext)] mb-2">Inserir emoji</div>
                        <div className="flex flex-wrap gap-2">
                          {["👍","❤️","😂","🙏","🔥","👏","😮","😢","😡","✅","📌","⭐"].map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="h-9 w-9 rounded-md border bg-[var(--shell-card-bg)] hover:bg-[var(--shell-bg)] text-lg"
                              onClick={() => insertEmoji(em)}
                              title={em}
                            >
                              {em}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="rounded-md border bg-[var(--shell-card-bg)] px-2 py-1 text-xs hover:bg-[var(--shell-bg)]"
                            onClick={() => setEmojiOpen(false)}
                          >
                            Fechar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <textarea
                  ref={textAreaRef}
                  className="flex-1 rounded-md border p-2 text-sm resize-none"
                  placeholder={recording ? "Gravando... (pare para enviar)" : "Digite mensagem... (Enter envia / Shift+Enter quebra linha)"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onInput={autoGrow}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  disabled={sending}
                  rows={1}
                />

                <button
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                  onClick={sendText}
                  disabled={sending || !text.trim()}
                >
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {!audioSupported ? (
                <div className="text-[11px] text-[var(--shell-subtext)]">�a�️ Seu navegador não suporta gravação (MediaRecorder). Teste no Chrome/Edge.</div>
              ) : null}
            </div>

            {/* MODAL DE MÍDIA */}
            <MediaModal
              state={mediaModal}
              onClose={() => {
                try {
                  if ((mediaModal as any)?.open && (mediaModal as any)?.src?.startsWith("blob:")) {
                    URL.revokeObjectURL((mediaModal as any).src);
                  }
                } catch {}
                setMediaModal({ open: false });
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Teaching Modal ── */}
      {teachModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-[var(--shell-card-bg)] shadow-xl flex flex-col max-h-[90vh]">
            {!teachReplaceMode ? (
              <>
                <div className="px-5 pt-5 pb-4 border-b">
                  <h2 className="text-base font-semibold text-[var(--shell-text)]">Salvar como ensinamento</h2>
                  <p className="mt-1 text-xs text-[var(--shell-subtext)]">
                    Este exemplo será injetado no prompt da IA como resposta aprovada.
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                  {/* KB selector */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--shell-subtext)]">
                      Base de Conhecimento
                    </label>
                    {teachKbs.length === 0 ? (
                      <p className="text-xs text-[var(--shell-subtext)]">Carregando bases...</p>
                    ) : (
                      <select
                        value={teachSelectedKbId}
                        onChange={(e) => {
                          setTeachSelectedKbId(e.target.value);
                          if (e.target.value) {
                            generateTeachTitle(e.target.value, teachLeadMessage, teachResponse);
                          }
                        }}
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="">Selecione...</option>
                        {teachKbs.map((kb) => (
                          <option key={kb.id} value={kb.id}>
                            {kb.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--shell-subtext)]">
                      Título{" "}
                      <span className="font-normal text-[var(--shell-subtext)]">(gerado pela IA)</span>
                    </label>
                    <input
                      value={teachGeneratingTitle ? "" : teachTitle}
                      onChange={(e) => setTeachTitle(e.target.value)}
                      disabled={teachGeneratingTitle}
                      placeholder={teachGeneratingTitle ? "Gerando título..." : "Ex: Resposta sobre prazo de entrega"}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-[var(--shell-bg)] disabled:text-[var(--shell-subtext)]"
                    />
                  </div>

                  {/* Lead message — somente leitura */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--shell-subtext)]">
                      Mensagem do lead{" "}
                      <span className="font-normal text-[var(--shell-subtext)]">(contexto/gatilho)</span>
                    </label>
                    <textarea
                      ref={teachLeadMessageRef}
                      value={teachLeadMessage}
                      readOnly
                      rows={4}
                      placeholder="O que o lead perguntou ou disse..."
                      className="w-full rounded-md border bg-[var(--shell-bg)] px-3 py-2 text-sm text-[var(--shell-subtext)] outline-none"
                    />
                  </div>

                  {/* Approved response */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-sm font-medium text-[var(--shell-subtext)]">
                        Resposta aprovada{" "}
                        <span className="font-normal text-[var(--shell-subtext)]">(editável)</span>
                      </label>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => {
                          const ta = teachResponseRef.current;
                          if (!ta) return;
                          const { selectionStart, selectionEnd, value } = ta;
                          if (selectionStart === selectionEnd) return;
                          const word = value.slice(selectionStart, selectionEnd);
                          setTeachReplacedName(word);
                          // Substitui na resposta aprovada
                          const nextResponse =
                            value.slice(0, selectionStart) +
                            "[nome do lead]" +
                            value.slice(selectionEnd);
                          setTeachResponse(nextResponse);
                          // Substitui todas as ocorrências da palavra no campo de contexto
                          setTeachLeadMessage((prev) =>
                            prev.split(word).join("[nome do lead]")
                          );
                          // Reposiciona cursor na resposta
                          requestAnimationFrame(() => {
                            ta.focus();
                            const pos = selectionStart + "[nome do lead]".length;
                            ta.setSelectionRange(pos, pos);
                          });
                        }}
                      >
                        Substituir por [nome do lead]
                      </button>
                    </div>
                    <textarea
                      ref={teachResponseRef}
                      value={teachResponse}
                      onChange={(e) => setTeachResponse(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <p className="mt-1 text-xs text-[var(--shell-subtext)]">
                      Dica: selecione um nome próprio na resposta e clique em{" "}
                      <span className="font-medium text-[var(--shell-subtext)]">Substituir por [nome do lead]</span>{" "}
                      — o nome será substituído nos dois campos automaticamente.
                    </p>
                  </div>

                  {teachError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {teachError}
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 border-t flex gap-2">
                  <button
                    type="button"
                    onClick={submitTeaching}
                    disabled={teachSaving || !teachSelectedKbId || !teachResponse.trim()}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {teachSaving ? "Salvando..." : "Salvar ensinamento"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeachModalOpen(false)}
                    disabled={teachSaving}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 pt-5 pb-4 border-b">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Limite atingido
                    </span>
                    <h2 className="text-base font-semibold text-[var(--shell-text)]">
                      Esta base já tem 30 ensinamentos
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-[var(--shell-subtext)]">
                    Selecione qual ensinamento deseja substituir pelo novo:
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 divide-y">
                  {teachExistingList.map((t) => (
                    <div key={t.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--shell-text)]">{t.title}</p>
                          <p className="mt-0.5 text-xs text-[var(--shell-subtext)]">
                            {new Date(t.createdAt).toLocaleString("pt-BR")} · {t.createdBy}
                            {t.lead?.nome && ` · Lead: ${t.lead.nome}`}
                          </p>
                          {t.leadMessage && (
                            <p className="mt-1 text-xs text-[var(--shell-subtext)] line-clamp-2 italic">
                              "{t.leadMessage}"
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => confirmReplaceTeaching(t.id)}
                          disabled={teachSaving}
                          className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          {teachSaving ? "..." : "Substituir"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {teachError && (
                  <div className="mx-5 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {teachError}
                  </div>
                )}

                <div className="px-5 py-4 border-t flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTeachReplaceMode(false)}
                    disabled={teachSaving}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-60"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeachModalOpen(false)}
                    disabled={teachSaving}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Modal — Nome confirmado */}
      {nomeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={() => setNomeModalOpen(false)}
        >
          <div
            className="bg-[var(--shell-card-bg)] rounded-xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--shell-text)] mb-1">Nome confirmado</h3>
            <p className="text-xs text-[var(--shell-subtext)] mb-3">
              O nome original é <span className="font-medium">{lead?.nome}</span>. Informe o nome real confirmado na conversa.
            </p>
            <input
              type="text"
              autoFocus
              className="w-full rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm text-[var(--shell-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
              placeholder="Nome real do lead..."
              value={nomeConfirmadoEdit}
              onChange={(e) => setNomeConfirmadoEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveNomeConfirmado(); if (e.key === "Escape") setNomeModalOpen(false); }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-bg)]"
                onClick={() => setNomeModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={saveNomeConfirmado}
                disabled={savingNomeConfirmado}
              >
                {savingNomeConfirmado ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
