"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PipelineStepper, { PipelineStage } from "@/components/pipeline-stepper";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Role = "OWNER" | "MANAGER" | "AGENT";

type StoredUser = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  role: Role;
  branchId: string | null;
};

type Reason = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

const DECISIONS = [
  { value: "KEEP_AGENT_REENTRY", label: "Manter corretor e reentrada (sobe na fila)" },
  {
    value: "AI_ROUTE_OTHER_IF_AVAILABLE_AFTER_QUALIFICATION",
    label: "Ativar IA e rotear outro se houver (após qualificação)",
  },
  { value: "KEEP_CLOSED", label: "Manter fechado sem novo atendimento" },
  {
    value: "AI_ROUTE_ANY_AFTER_QUALIFICATION",
    label: "Ativar IA e rotear qualquer corretor (após qualificação)",
  },
] as const;

type DecisionValue = (typeof DECISIONS)[number]["value"];

type TreatedItem = {
  leadId: string;
  leadName: string;
  telefoneKey?: string | null;
  decision: DecisionValue;
  decisionLabel: string;
  reasonId: string;
  reasonLabel: string;
  justification?: string | null;
  createdAt: string;
};

const TREATED_KEY = "managerQueue.treated.v1";
const TREATED_MAX = 30;

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
  criadoEm?: string;
  needsManagerReview?: boolean;
  queuePriority?: number;
  assignedUserId?: string | null;
  branchId?: string | null;
  telefoneKey?: string | null;
  avatarUrl?: string | null;
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
  if (ch.startsWith("whatsapp.out")) return true;
  if (ch.startsWith("ai.")) return true;
  if (ch.startsWith("system.")) return true;
  if (ch === "crm.note") return true;
  if (ch === "form" || ch.startsWith("whatsapp.in")) return false;
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
    <div className="mt-2 rounded-lg border bg-white p-2">
      <div className="text-xs text-gray-700 font-medium">Localização</div>
      <div className="mt-1 text-[11px] text-gray-600 font-mono break-all">
        {lat}, {lng}
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
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
        className="w-full max-w-4xl rounded-xl bg-white shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold text-gray-900 truncate">{state.title || "Mídia"}</div>
          <button className="rounded-md border bg-white px-3 py-1 text-sm hover:bg-gray-50" onClick={onClose}>
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
      const legacy = p.audioUrl || p?.audio?.url || null;
      if (legacy) return { kind: "audio", url: String(legacy), mimeType: "audio/ogg", filename: "", id: "" };
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
            className="mt-2 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
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
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
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
          <div className="rounded-lg border bg-white p-2 text-xs text-gray-800">
            <div className="text-[11px] text-gray-500 mb-1">Transcrição</div>
            <div className="whitespace-pre-wrap">{p.transcription.trim()}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openModal}
            disabled={!canOpen}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
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
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
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
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
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
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          title="Abrir"
        >
          Abrir {filename}
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
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
  const channelDisplay = String(ch || "").toLowerCase().startsWith("whatsapp.out")
    ? ch + " • " + aiParticipationLabel
    : ch;

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
                : "bg-white border-gray-200 text-gray-900",
          ].join(" ")}
        >
          <div className="text-[11px] text-gray-500 flex items-center justify-between gap-2">
            <span className="font-mono">{channelDisplay}</span>
            <span>{formatTime(ev.criadoEm)}</span>
          </div>

          {isAiSuggestion ? (
            <div className="mt-2 inline-flex items-center rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800">
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
              <span key={idx} className="bg-white border rounded-full px-2 py-0.5 text-xs shadow">
                {r}
              </span>
            ))}
            {reactions.length > 6 ? (
              <span className="bg-white border rounded-full px-2 py-0.5 text-xs shadow">
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

  const [user, setUser] = useState<StoredUser | null>(null);

  const canManagerDecide = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "MANAGER";
  }, [user]);

  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [pipelineErr, setPipelineErr] = useState<string | null>(null);
  const [movingStage, setMovingStage] = useState(false);

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

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerReasons, setManagerReasons] = useState<Reason[]>([]);
  const [managerLoadingReasons, setManagerLoadingReasons] = useState(false);
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [managerErr, setManagerErr] = useState<string | null>(null);

  const [decision, setDecision] = useState<DecisionValue>("KEEP_AGENT_REENTRY");
  const [reasonId, setReasonId] = useState<string>("");
  const [justification, setJustification] = useState<string>("");

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

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? (JSON.parse(raw) as StoredUser) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem("lead.autopilot.v1." + id);
      setAutopilotEnabled(raw === "1");
    } catch {
      setAutopilotEnabled(false);
    }
  }, [id]);

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

  async function loadLead() {
    const l = await apiFetch("/leads/" + id, { method: "GET" });
    setLead(l);
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

  async function loadAll() {
    setErr(null);
    setLoadingLead(true);
    setLoadingEvents(true);
    try {
      await Promise.all([loadLead(), loadEvents(), loadProducts({ silent: true })]);
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

    const intervalMs = 5000;
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
        nome: lead.nome,
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

  function toggleAutopilot(nextValue: boolean) {
    if (nextValue) {
      const ok = window.confirm(
        "Ao ativar o Autopilot, a IA poderá responder automaticamente este lead quando as regras permitirem. Deseja continuar?",
      );
      if (!ok) return;
    }

    setAutopilotEnabled(nextValue);

    try {
      localStorage.setItem("lead.autopilot.v1." + id, nextValue ? "1" : "0");
    } catch {}
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

  async function loadManagerReasons() {
    setManagerErr(null);
    setManagerLoadingReasons(true);

    try {
      const r = await apiFetch("/config/manager-reasons", { method: "GET" });
      const rr: Reason[] = Array.isArray(r) ? r : [];
      rr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const active = rr.filter((x) => x.active !== false);
      setManagerReasons(active);

      if (!reasonId && active.length) setReasonId(active[0].id);

      if (!active.length) {
        setManagerErr("Nenhum motivo ativo encontrado. Cadastre motivos para o tenant (manager_decision_reasons).");
      }
    } catch (e: any) {
      setManagerErr(e?.message || "Erro ao carregar motivos");
    } finally {
      setManagerLoadingReasons(false);
    }
  }

  function openManagerModal() {
    setManagerErr(null);
    setManagerOpen(true);
    if (canManagerDecide && managerReasons.length === 0 && !managerLoadingReasons) loadManagerReasons();
  }

  function closeManagerModal() {
    setManagerOpen(false);
    setManagerErr(null);
    setManagerSubmitting(false);
  }

  function pushTreatedToStorage(item: TreatedItem) {
    try {
      const raw = localStorage.getItem(TREATED_KEY);
      const parsed = safeJsonParse<TreatedItem[]>(raw);
      const current = Array.isArray(parsed) ? parsed : [];
      const next = [item, ...current].slice(0, TREATED_MAX);
      localStorage.setItem(TREATED_KEY, JSON.stringify(next));
    } catch {}
  }

  async function submitManagerDecision() {
    if (!canManagerDecide) return;
    if (!reasonId) {
      setManagerErr("Selecione um motivo.");
      return;
    }

    setManagerErr(null);
    setManagerSubmitting(true);

    try {
      await apiFetch("/leads/" + id + "/manager-decision", {
        method: "POST",
        body: JSON.stringify({
          decision,
          reasonId,
          justification: (justification || "").trim() ? (justification || "").trim() : null,
        }),
      });

      const leadName = lead?.nome || id;
      const decisionLabel = DECISIONS.find((d) => d.value === decision)?.label || decision;
      const reasonLabel = managerReasons.find((r) => r.id === reasonId)?.label || reasonId;

      pushTreatedToStorage({
        leadId: id,
        leadName,
        telefoneKey: lead?.telefoneKey ?? null,
        decision,
        decisionLabel,
        reasonId,
        reasonLabel,
        justification: (justification || "").trim() ? (justification || "").trim() : null,
        createdAt: new Date().toISOString(),
      });

      closeManagerModal();
      await Promise.all([loadLead(), loadEvents({ silent: true })]);
    } catch (e: any) {
      setManagerErr(e?.message || "Erro ao enviar decisão");
    } finally {
      setManagerSubmitting(false);
    }
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
        {/* MODAL DECISÃO DO GERENTE */}
        {managerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <div className="text-sm font-semibold text-gray-900">Decisão do Gerente</div>
                <button
                  type="button"
                  onClick={closeManagerModal}
                  className="rounded-md px-2 py-1 text-sm hover:bg-gray-100"
                >
                  Fechar
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-lg border bg-gray-50 p-3">
                  <div className="text-xs text-gray-600">Lead</div>
                  <div className="text-sm font-medium text-gray-900">{lead?.nome || "�"}</div>
                  <div className="mt-1 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="font-mono">ID: {id}</span>
                    {lead?.telefone ? <span>Tel: {lead.telefone}</span> : null}
                    {lead?.status ? <span>Status: {lead.status}</span> : null}
                    {lead?.needsManagerReview ? (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                        needsManagerReview=true
                      </span>
                    ) : (
                      <span className="text-gray-500">needsManagerReview=false</span>
                    )}
                  </div>
                </div>

                {managerErr ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{managerErr}</div>
                ) : null}

                <div className="grid gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Motivo</label>
                    <div className="mt-1">
                      <select
                        className="w-full rounded-md border bg-white p-2 text-sm"
                        value={reasonId}
                        onChange={(e) => setReasonId(e.target.value)}
                        disabled={managerLoadingReasons || managerSubmitting}
                      >
                        {managerReasons.length === 0 ? (
                          <option value="">(Sem motivos)</option>
                        ) : (
                          managerReasons.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.sortOrder}. {r.label}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={loadManagerReasons}
                        disabled={managerLoadingReasons || managerSubmitting}
                      >
                        {managerLoadingReasons ? "Carregando..." : "Recarregar motivos"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Decisão</label>
                    <div className="mt-1">
                      <select
                        className="w-full rounded-md border bg-white p-2 text-sm"
                        value={decision}
                        onChange={(e) => setDecision(e.target.value as DecisionValue)}
                        disabled={managerSubmitting}
                      >
                        {DECISIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-900">Justificativa (opcional)</label>
                    <textarea
                      className="mt-1 w-full rounded-md border bg-white p-2 text-sm"
                      rows={4}
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Opcional..."
                      disabled={managerSubmitting}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded-md border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                      onClick={closeManagerModal}
                      disabled={managerSubmitting}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                      onClick={submitManagerDecision}
                      disabled={managerSubmitting || managerLoadingReasons || !reasonId}
                    >
                      {managerSubmitting ? "Enviando..." : "Confirmar decisão"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

            {/* STEPPER DO FUNIL (ETAPA 4) */}
        <div className="mb-4 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-gray-700">Funil</div>

            {(lead as any)?.stageKey === "BASE_FRIA" && (lead as any)?.previousStageName ? (
              <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-800">
                Etapa anterior: {(lead as any).previousStageName}
              </div>
            ) : null}
          </div>

          {pipelineStages.length ? (
            <PipelineStepper
              stages={pipelineStages}
              currentStageId={(lead as any)?.stageId || null}
              currentStageKey={(lead as any)?.stageKey || null}
              disabled={movingStage}
              onSelectStage={async (stage) => {
                try {
                  setMovingStage(true);
                  await apiFetch("/leads/" + id + "/stage", {
                    method: "PATCH",
                    body: JSON.stringify({ stageId: stage.id }),
                  });

                  await loadLead();
                } catch (e: any) {
                  alert(e?.message || "Erro ao mover etapa");
                } finally {
                  setMovingStage(false);
                }
              }}
            />
          ) : loadingPipeline ? (
            <div className="text-sm text-gray-600">Carregando funil...</div>
          ) : pipelineErr ? (
            <div className="text-sm text-red-700">{pipelineErr}</div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3 items-stretch h-[calc(100vh-220px)] overflow-hidden">
          {/* ESQUERDA */}
          <div className="space-y-4 lg:col-span-1 overflow-y-auto pr-1">
            {/* Lead */}
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-gray-900 flex items-center justify-between gap-2">
                <span>Lead</span>
                <label className="text-xs text-gray-600 flex items-center gap-2 select-none">
                  <input type="checkbox" checked={debugOn} onChange={(e) => setDebugOn(e.target.checked)} />
                  Debug
                </label>
              </div>

              {loadingLead ? (
                <div className="mt-3 text-sm text-gray-600">Carregando...</div>
              ) : lead ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Nome</div>
                    <div className="font-medium text-gray-900">{lead.nome || "�"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Telefone</div>
                    <div className="text-gray-900">{lead.telefone || "�"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <div className="text-gray-900">{lead.status || "NOVO"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Manager Review</div>
                    <div className="text-gray-900">
                      {lead.needsManagerReview ? (
                        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          needsManagerReview=true
                        </span>
                      ) : (
                        <span className="text-gray-500">�</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-600">Não carregou.</div>
              )}

              <button
                className="mt-4 w-full rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                onClick={loadAll}
                disabled={loadingLead || loadingEvents}
              >
                Atualizar
              </button>

              {canManagerDecide ? (
                lead?.needsManagerReview ? (
                  <button
                    className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                    onClick={openManagerModal}
                    disabled={loadingLead || !lead}
                    title="Somente OWNER/MANAGER (apenas em reentrada)"
                  >
                    Decisão do Gerente
                  </button>
                ) : (
                  <div className="mt-3 text-[11px] text-gray-500">(Sem decisão do gerente � este lead não está em reentrada)</div>
                )
              ) : (
                <div className="mt-3 text-[11px] text-gray-500">(Sem permissão de gerente)</div>
              )}

              {err ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
              ) : null}

              {debugOn ? (
                <div className="mt-4 rounded-lg border bg-gray-50 p-3 text-xs text-gray-800 space-y-2">
                  <div className="font-semibold text-gray-900">Debug (Front)</div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-gray-500">events (state)</div>
                      <div className="font-mono">{events.length}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-gray-500">viewEvents (render)</div>
                      <div className="font-mono">{viewEvents.length}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-gray-500">pollCount</div>
                      <div className="font-mono">{pollCount}</div>
                    </div>

                    <div>
                      <div className="text-[11px] text-gray-500">lastFetchAt</div>
                      <div className="font-mono break-all">{lastFetchAt || "�"}</div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-[11px] text-gray-500">events shape</div>
                      <div className="font-mono break-all">{lastEventsShape || "�"}</div>
                    </div>

                    {lastPollError ? (
                      <div className="col-span-2">
                        <div className="text-[11px] text-gray-500">lastPollError</div>
                        <div className="font-mono text-red-700 break-all">{lastPollError}</div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-[11px] text-gray-500">last visible event (ordered)</div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-white p-2 text-[11px] leading-snug">
                      {JSON.stringify(lastVisibleEvent, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="text-[11px] text-gray-500">raw /events response (shape)</div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-white p-2 text-[11px] leading-snug">
                      {JSON.stringify(lastEventsRaw, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Produtos Disponíveis */}
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">Produtos Disponíveis</div>
                <button
                  type="button"
                  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                <div className="mt-1 text-[11px] text-gray-500">Mostrando até 50 resultados. Total carregado: {products.length}</div>
              </div>

              <div className="mt-3 grid gap-2">
                <select
                  className="w-full rounded-md border bg-white p-2 text-sm"
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
                  <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-800">
                    <div className="font-semibold text-gray-900 truncate">{selectedProduct.title || "Produto"}</div>
                    <div className="mt-1 text-[11px] text-gray-600">
                      {selectedProduct.city ? <span>{selectedProduct.city}</span> : null}
                      {selectedProduct.neighborhood ? <span>{" - " + selectedProduct.neighborhood}</span> : null}
                    </div>

                    <div className="mt-3 rounded-md border bg-white p-2">
                      <div className="text-[11px] text-gray-500 mb-1">Resumo</div>
                      <div className="text-xs whitespace-pre-wrap text-gray-900">{buildProductSummary(selectedProduct)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                          onClick={() => insertIntoChat(buildProductSummary(selectedProduct))}
                          title="Insere o resumo no campo de mensagem"
                        >
                          Inserir resumo no chat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
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
                        productTab === t ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-gray-50",
                      ].join(" ")}
                      disabled={!selectedProduct}
                    >
                      {t === "IMAGENS" ? "Imagens" : t === "DOCUMENTOS" ? "Documentos" : "Vídeos"}
                    </button>
                  ))}
                </div>

                <div className="mt-2">
                  {!selectedProduct ? (
                    <div className="text-xs text-gray-600">�</div>
                  ) : productTab === null ? (
                    <div className="text-xs text-gray-600">
                      Clique em <b>Imagens</b>, <b>Documentos</b> ou <b>Vídeos</b> para mostrar o conteúdo.
                    </div>
                  ) : productTab === "IMAGENS" ? (
                    (selectedProduct.images || []).length === 0 ? (
                      <div className="text-xs text-gray-600">Sem imagens neste produto.</div>
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
                              <div key={img.id} className="rounded-lg border bg-white p-2">
                                <div className="text-xs font-semibold text-gray-900 truncate">
                                  {img.title || img.label || "Imagem"}
                                  {img.isPrimary ? " = (capa)" : ""}
                                </div>

                                <div className="mt-1 text-[11px] text-gray-500 break-all">{url}</div>

                                {url ? (
                                  <a href={url} target="_blank" rel="noreferrer noopener" className="mt-2 block">
                                    <img src={url} alt="img" className="h-28 w-full object-cover rounded-md border" />
                                  </a>
                                ) : null}

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                    onClick={() => insertIntoChat(url)}
                                    disabled={!url}
                                    title="Insere o link no campo de mensagem"
                                  >
                                    Inserir link no chat
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                    onClick={() => handleCopyLink(url)}
                                    disabled={!url}
                                    title="Copiar link"
                                  >
                                    Copiar link
                                  </button>

                                  <a
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                          <div className="text-[11px] text-gray-500">Mostrando 20 primeiras imagens.</div>
                        ) : null}
                      </div>
                    )
                  ) : productTab === "DOCUMENTOS" ? (
                    (selectedProduct.documents || []).length === 0 ? (
                      <div className="text-xs text-gray-600">Sem documentos neste produto.</div>
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
                              <div key={doc.id} className="rounded-lg border bg-white p-2">
                                <div className="text-xs font-semibold text-gray-900 truncate">{doc.title || doc.type || "Documento"}</div>

                                <div className="mt-1 text-[11px] text-gray-600">
                                  {doc.type ? <span>{doc.type}</span> : null}
                                  {doc.category ? <span>{" - " + doc.category}</span> : null}
                                  {doc.visibility ? <span>{" - " + doc.visibility}</span> : null}
                                </div>

                                <div className="mt-1 text-[11px] text-gray-500 break-all">{url}</div>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                    onClick={() => insertIntoChat(url)}
                                    disabled={!url}
                                    title="Insere o link no campo de mensagem"
                                  >
                                    Inserir link no chat
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                    onClick={() => handleCopyLink(url)}
                                    disabled={!url}
                                    title="Copiar link"
                                  >
                                    Copiar link
                                  </button>

                                  <a className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" href={url} target="_blank" rel="noreferrer noopener">
                                    Abrir
                                  </a>

                                  <button type="button" className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" onClick={() => downloadWithAuth(url, filename)} disabled={!url}>
                                    Baixar
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                        {(selectedProduct.documents || []).length > 20 ? (
                          <div className="text-[11px] text-gray-500">Mostrando 20 primeiros documentos.</div>
                        ) : null}
                      </div>
                    )
                  ) : (selectedProduct.videos || []).length === 0 ? (
                    <div className="text-xs text-gray-600">Sem vídeos neste produto.</div>
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
                            <div key={v.id} className="rounded-lg border bg-white p-2">
                              <div className="text-xs font-semibold text-gray-900 truncate">{v.title || "Vídeo"}</div>
                              <div className="mt-1 text-[11px] text-gray-500 break-all">{url}</div>

                              {url ? (
                                <video controls preload="metadata" className="mt-2 max-h-40 w-full rounded-md border">
                                  <source src={url} />
                                </video>
                              ) : null}

                              <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" onClick={() => insertIntoChat(url)} disabled={!url}>
                                  Inserir link no chat
                                </button>

                                <button
                                  type="button"
                                  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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

                                <button type="button" className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" onClick={() => handleCopyLink(url)} disabled={!url}>
                                  Copiar link
                                </button>

                                <a className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" href={url} target="_blank" rel="noreferrer noopener">
                                  Abrir
                                </a>

                                <button type="button" className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50" onClick={() => downloadWithAuth(url, name)} disabled={!url}>
                                  Baixar
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {(selectedProduct.videos || []).length > 20 ? (
                        <div className="text-[11px] text-gray-500">Mostrando 20 primeiros vídeos.</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CHAT */}
          <div className="rounded-xl border bg-white overflow-hidden lg:col-span-2 flex flex-col h-full lg:sticky lg:top-4">
            <div className="border-b bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full border bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {lead?.avatarUrl ? (
                    <img src={lead.avatarUrl} alt="avatar" className="h-9 w-9 object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-700">
                      {String(lead?.nome || "HC")
                        .split(" ")
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                    <span>{lead?.nome ? lead.nome : "Chat"}</span>
                    {hasNewInbound ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        Nova mensagem
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px] text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
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
                <div className="text-[11px] text-gray-600 font-mono shrink-0">
                  {"events:" + events.length + " | render:" + viewEvents.length}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-5">
              {loadingEvents ? (
                <div className="text-sm text-gray-600">Carregando historico...</div>
              ) : viewEvents.length === 0 ? (
                <div className="text-sm text-gray-600">Sem mensagens ainda.</div>
              ) : (
                viewEvents.map(({ ev, reactions }) => (
                  <Bubble key={ev.id} ev={ev} reactions={reactions} leadId={id} onOpenModal={openMediaModal} />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t bg-white p-3 space-y-3">
              {/* PAINEL DA IA */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-amber-900">Painel da IA</div>
                    <div className="text-[11px] text-amber-800">
                      Copilot para este lead. Quando o Autopilot estiver ON, a IA só deve agir no disparo configurado.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">Autopilot</span>
                    <button
                      type="button"
                      onClick={() => toggleAutopilot(!autopilotEnabled)}
                      className={[
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                        autopilotEnabled
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-gray-300 bg-white text-gray-700",
                      ].join(" ")}
                    >
                      {autopilotEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {latestAiSuggestion ? (
                  <div className="rounded-xl border border-amber-300 bg-white p-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Sugestão da IA
                        </div>
                        <div className="mt-2 text-[11px] text-gray-500">
                          {formatTime(latestAiSuggestion.criadoEm)}
                          {latestAiPayload?.agentTitle ? " • " + String(latestAiPayload.agentTitle) : ""}
                          {latestAiPayload?.jobName ? " • " + String(latestAiPayload.jobName) : ""}
                        </div>
                      </div>

                      <div className="rounded-md border bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
                        {aiUsagePercent}% IA
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-gray-500">Formato sugerido</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{activeAiResponseFormat}</div>
                    </div>

{activeAiSuggestionText ? (
  <div className={`rounded-lg border p-3 ${suggestionModifiedBy ? "bg-amber-50 border-amber-200" : "bg-gray-50"}`}>
    <div className="flex items-center gap-2">
      {suggestionModifiedBy ? (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          Modificado por {suggestionModifiedBy}
        </span>
      ) : (
        <span className="text-[11px] font-semibold text-gray-500">Texto sugerido</span>
      )}
    </div>
    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
      {activeAiSuggestionText}
    </div>
  </div>
) : null}

                    {latestAiSuggestedAudioScript ? (
                      <div className="rounded-lg border bg-white p-3">
                        <div className="text-[11px] font-semibold text-gray-500">Roteiro de áudio sugerido</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                          {latestAiSuggestedAudioScript}
                        </div>
                        <div className="mt-2 text-[11px] text-gray-500">
                          Estrutura pronta para áudio. O envio automático de áudio fica para a próxima etapa.
                        </div>
                      </div>
                    ) : null}

                    {latestAiSuggestedAttachments.length > 0 ? (
                      <div className="rounded-lg border bg-white p-3">
                        <div className="text-[11px] font-semibold text-gray-500">Mídias / documentos sugeridos</div>

                        <div className="mt-2 space-y-2">
                          {latestAiSuggestedAttachments.map((att, idx) => {
                            const kind = String(att?.kind || "document").toLowerCase();
                            const title =
                              String(att?.title || att?.filename || (kind === "image" ? "Imagem" : kind === "video" ? "Vídeo" : kind === "audio" ? "Áudio" : "Documento"));

                            return (
                              <div key={idx} className="rounded-md border bg-gray-50 p-2">
                                <div className="text-xs font-semibold text-gray-900">{title}</div>
                                <div className="mt-1 text-[11px] text-gray-500 break-all">{String(att?.url || "")}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                    onClick={() => useSuggestedAttachment(att)}
                                  >
                                    Usar sugestão
                                  </button>

                                  {att?.url ? (
                                    <a
                                      className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("REGENERATE")}
  disabled={!!aiActionLoading}
>
  {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
</button>

<button
  type="button"
  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("SHORTEN")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "SHORTEN" ? "Encurtando..." : "Encurtar"}
</button>

<button
  type="button"
  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("IMPROVE")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "IMPROVE" ? "Melhorando..." : "Melhorar"}
</button>

<button
  type="button"
  className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
  onClick={() => requestAiPanelSuggestion("VARIATE")}
  disabled={!!aiActionLoading || !activeAiSuggestionText}
>
  {aiActionLoading === "VARIATE" ? "Variando..." : "Variar"}
</button>
                      <button
                        type="button"
                        className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                        className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                        onClick={discardAiSuggestion}
                      >
                        Descartar
                      </button>

                      <button
                        type="button"
                        className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50"
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
                  <div className="rounded-lg border border-dashed border-emerald-300 bg-white p-3 space-y-2">
                    <div className="text-xs text-gray-500">Aguardando próxima mensagem do lead...</div>
                    <button
                      type="button"
                      className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => requestAiPanelSuggestion("REGENERATE")}
                      disabled={!!aiActionLoading}
                    >
                      {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
                    </button>
                  </div>
                ) : aiPanelState === "discarded" ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3 space-y-2">
                    <div className="text-xs text-gray-500">Sugestão descartada.</div>
                    <button
                      type="button"
                      className="rounded-md border bg-white px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => requestAiPanelSuggestion("REGENERATE")}
                      disabled={!!aiActionLoading}
                    >
                      {aiActionLoading === "REGENERATE" ? "Gerando..." : "Regenerar"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-white p-3 text-xs text-gray-600">
                    Nenhuma sugestão de IA pendente para este lead no momento.
                  </div>
                )}
              </div>

              {/* PREVIEW DO ANEXO */}
              {attachFile ? (
                <div className="rounded-lg border bg-gray-50 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                     <div className="text-xs font-semibold text-gray-900">📎 Anexo pronto</div>
                      <div className="mt-1 text-xs text-gray-700 truncate">{attachFile.name}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {String(attachFile.type || "arquivo").toLowerCase() +
                          " - " +
                          (attachFile.size / 1024).toFixed(1) +
                          " KB"}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
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
                      <iframe src={attachPreviewUrl} className="w-full h-56 rounded-md border bg-white" title="preview-pdf" />
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
                <div className="rounded-lg border bg-gray-50 p-2">
                  <div className="text-xs text-gray-700 flex items-center justify-between gap-2">
                    <span className="font-medium">Áudio gravado</span>
                    <button
                      type="button"
                      className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
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

                  <div className="mt-2 text-[11px] text-gray-500">
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
                        className="h-10 w-10 rounded-md border bg-white hover:bg-gray-50 flex items-center justify-center"
                        title="Gravar áudio"
                        onClick={startRecording}
                        disabled={!audioSupported}
                      >
                        🎤
                      </button>
                    )
                  ) : (
                    <button type="button" className="h-10 w-10 rounded-md border bg-gray-50 flex items-center justify-center" title="Áudio pronto" disabled>
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
                      className="h-10 w-10 rounded-md border bg-white hover:bg-gray-50 flex items-center justify-center"
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
                      className="h-10 w-10 rounded-md border bg-white hover:bg-gray-50 flex items-center justify-center"
                      title="Emoji"
                      onClick={() => setEmojiOpen((v) => !v)}
                    >
                      😂
                    </button>

                    {emojiOpen ? (
                      <div className="absolute bottom-12 left-0 z-20 w-56 rounded-lg border bg-white shadow p-2">
                        <div className="text-[11px] text-gray-500 mb-2">Inserir emoji</div>
                        <div className="flex flex-wrap gap-2">
                          {["👍","❤️","😂","🙏","🔥","👏","😮","😢","😡","✅","📌","⭐"].map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="h-9 w-9 rounded-md border bg-white hover:bg-gray-50 text-lg"
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
                            className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
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
                <div className="text-[11px] text-gray-500">�a�️ Seu navegador não suporta gravação (MediaRecorder). Teste no Chrome/Edge.</div>
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
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            {!teachReplaceMode ? (
              <>
                <div className="px-5 pt-5 pb-4 border-b">
                  <h2 className="text-base font-semibold text-gray-900">Salvar como ensinamento</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Este exemplo será injetado no prompt da IA como resposta aprovada.
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                  {/* KB selector */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Base de Conhecimento
                    </label>
                    {teachKbs.length === 0 ? (
                      <p className="text-xs text-gray-500">Carregando bases...</p>
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
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Título{" "}
                      <span className="font-normal text-gray-400">(gerado pela IA)</span>
                    </label>
                    <input
                      value={teachGeneratingTitle ? "" : teachTitle}
                      onChange={(e) => setTeachTitle(e.target.value)}
                      disabled={teachGeneratingTitle}
                      placeholder={teachGeneratingTitle ? "Gerando título..." : "Ex: Resposta sobre prazo de entrega"}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>

                  {/* Lead message — somente leitura */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Mensagem do lead{" "}
                      <span className="font-normal text-gray-400">(contexto/gatilho)</span>
                    </label>
                    <textarea
                      ref={teachLeadMessageRef}
                      value={teachLeadMessage}
                      readOnly
                      rows={4}
                      placeholder="O que o lead perguntou ou disse..."
                      className="w-full rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none"
                    />
                  </div>

                  {/* Approved response */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Resposta aprovada{" "}
                        <span className="font-normal text-gray-400">(editável)</span>
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
                    <p className="mt-1 text-xs text-gray-400">
                      Dica: selecione um nome próprio na resposta e clique em{" "}
                      <span className="font-medium text-gray-500">Substituir por [nome do lead]</span>{" "}
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
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
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
                    <h2 className="text-base font-semibold text-gray-900">
                      Esta base já tem 30 ensinamentos
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Selecione qual ensinamento deseja substituir pelo novo:
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 divide-y">
                  {teachExistingList.map((t) => (
                    <div key={t.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{t.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {new Date(t.createdAt).toLocaleString("pt-BR")} · {t.createdBy}
                            {t.lead?.nome && ` · Lead: ${t.lead.nome}`}
                          </p>
                          {t.leadMessage && (
                            <p className="mt-1 text-xs text-gray-600 line-clamp-2 italic">
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
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeachModalOpen(false)}
                    disabled={teachSaving}
                    className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
