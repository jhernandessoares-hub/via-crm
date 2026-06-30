"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import PipelineStepper, { PipelineStage } from "@/components/pipeline-stepper";
import { EvidenceUploadModal } from "@/components/EvidenceUploadModal";
import { PendenciasModal, type PendenciaDraft, type PendenciaPessoa } from "@/components/PendenciasModal";
import { PendenciasPanel } from "@/components/PendenciasPanel";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import QuickReplies from "@/components/leads/QuickReplies";
import { apiFetch } from "@/lib/api";
import {
  listCorrespondents, listCreditRequests, createCreditRequest, cancelCreditRequest,
  CREDIT_STATUS_LABEL, CREDIT_STATUS_COLOR,
  type Correspondent, type CreditRequest,
} from "@/lib/correspondente.service";
import { formatLeadNumber } from "@/lib/format-lead-number";
import { maskPhone, maskCPF, isValidCPF } from "@/lib/format";
import { unlinkUnit, listMedia, listObraUpdates, DevMedia, DevObraUpdate } from "@/lib/developments.service";
import { MaskedField } from "@/components/MaskedValue";

type Role = "OWNER" | "MANAGER" | "AGENT" | "PARTNER";

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

type UnitReservaHistory = {
  id: string;
  leadId?: string | null;
  leadNome?: string | null;
  statusAnterior: string;
  finalPrice?: number | null;
  propostaPagamento?: string | null;
  desvinculadoPor?: string | null;
  createdAt: string;
};

type DevUnit = {
  id: string;
  nome: string;
  status: string;
  andar?: number | null;
  areaM2?: number | null;
  quartos?: number | null;
  valorVenda?: number | null;
  finalPrice?: number | null;
  propostaPagamento?: string | null;
  propostaObs?: string | null;
  comprador?: string | null;
  soldAt?: string | null;
  leadId?: string | null;
  developmentId?: string;
  development?: { id: string; nome: string };
  tower?: { nome: string } | null;
  reservaHistory?: UnitReservaHistory[];
};

type Development = {
  id: string;
  nome: string;
};

type WaSession = {
  id: string;
  nome: string;
  status: string;
  phoneNumber: string | null;
  pushName: string | null;
};

type CanalOut = { type: "light"; sessionId: string } | { type: "oficial" };

type Lead = {
  id: string;
  numero?: number | null;
  reentradaCount?: number | null;
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
  stageGroup?: string | null;
  developmentUnits?: DevUnit[];
  conversaCanal?: string | null;
  conversaSessionId?: string | null;
  conversaAberta?: boolean;
  // Qualificação IA
  nomeCorreto?: string | null;
  nomeCorretoOrigem?: string | null; // "IA" | "MANUAL"
  cpf?: string | null;
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
  empreendimentoInteresseId?: string | null;
  interesseOrigem?: string | null;
  empreendimentoInteresse?: { id: string; nome: string; capaUrl?: string | null } | null;
  produtoInteresse?: { id: string; title: string; coverUrl?: string | null } | null;
  resumoLead?: string | null;
  cadastroOrigem?: {
    codigoOcorrencia?: string | null;
    grupoMcmv?: string | null;
    faixaRenda?: string | null;
    indicacao?: string | null;
    [key: string]: unknown;
  } | null;
  // Externo Consultivo: chaves de FIELD_VISIBILITY ocultas (backend já removeu o dado).
  restrictedFields?: string[];
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

type LeadCalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  eventType: string;
  status: string;
  color: string;
  visibility: string;
  userId: string;
  user: { id: string; nome: string; apelido?: string | null; role: string };
};

type StatusEvidence = {
  id: string;
  fromStage: string | null;
  toStage: string;
  motivo: string | null;
  changedByName: string | null;
  createdAt: string;
  document: { id: string; nome: string; filename: string | null; mimeType: string | null } | null;
};

type LeadTransition = {
  id: string;
  fromStage: string | null;
  toStage: string;
  cascade: boolean;
  changedByName: string | null;
  createdAt: string;
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
  // —S& NOVO: outbound texto pode estar —Sescondido⬝ no request/payload
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
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div
        className="w-full max-w-4xl rounded-xl bg-[var(--shell-card-bg)] shadow-lg overflow-hidden"
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
      const mt = String(m?.mimeType || "").toLowerCase();
      const looksPdf =
        mt.indexOf("pdf") >= 0 ||
        String(filename || "").toLowerCase().endsWith(".pdf") ||
        kind === "document";

      if (looksPdf) {
        // Tenta URL direta primeiro (igual ao fluxo de JPEG) — funciona para assets públicos
        const directSrc = publicUrl || blobUrl;
        if (directSrc) {
          try {
            const resp = await fetch(directSrc);
            if (resp.ok) {
              const b = await resp.blob();
              const finalBlob = b.type.includes("pdf") ? b : new Blob([b], { type: "application/pdf" });
              onOpenModal("document", filename, URL.createObjectURL(finalBlob), "application/pdf");
              return;
            }
          } catch { /* cai no proxy abaixo */ }
        }
        // Fallback: proxy autenticado do backend
        const blob0 = await authFetchBlob(downloadUrl);
        const isPdfBlob = String((blob0 as any)?.type || "").toLowerCase().indexOf("pdf") >= 0;
        const blob = isPdfBlob ? blob0 : new Blob([blob0], { type: "application/pdf" });
        onOpenModal("document", filename, URL.createObjectURL(blob), "application/pdf");
        return;
      }

      // Para imagem/vídeo/áudio: usa o src já resolvido (publicUrl ou blobUrl)
      if (!effectiveSrc && needsAuthBlob) await ensureBlob();
      onOpenModal(kind, filename, publicUrl || blobUrl || effectiveSrc, m?.mimeType || undefined);
    } catch (e: any) {
      setLoadErr(e?.message || "Falha ao carregar arquivo.");
    }
  };

  const onDownload = async () => {
    try {
      await downloadWithAuth(downloadUrl, filename);
    } catch {
      // Backend falhou — tenta fetch direto e cria blob (evita navigation guard)
      if (publicUrl) {
        try {
          const resp = await fetch(publicUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objUrl), 100);
            setLoadErr(null);
            return;
          }
        } catch { /* ignora */ }
      }
      setLoadErr("Falha ao baixar arquivo.");
    }
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
            {loading ? "⏳ Carregando..." : "—x Carregar preview"}
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

      {loadErr && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{loadErr}</div>
      )}
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

// ─── Espelho Selector Modal ───────────────────────────────────────────────────

const AGENDA_TYPE_LABEL: Record<string, string> = {
  VISITA: "Visita", TAREFA: "Tarefa", CAPTACAO: "Captação",
  REUNIAO: "Reunião", FOLLOW_UP: "Follow-up",
};
const AGENDA_TYPE_COLOR: Record<string, string> = {
  VISITA: "bg-emerald-100 text-emerald-700",
  TAREFA: "bg-blue-100 text-blue-700",
  CAPTACAO: "bg-amber-100 text-amber-700",
  REUNIAO: "bg-purple-100 text-purple-700",
  FOLLOW_UP: "bg-gray-100 text-gray-600",
};
const AGENDA_STATUS_LABEL: Record<string, string> = {
  AGENDADO: "Agendado", CONFIRMADO: "Confirmado", REALIZADO: "Realizado",
  NO_SHOW: "No-show", CANCELADO: "Cancelado",
};

const ESPELHO_STATUS_COLOR: Record<string, string> = {
  DISPONIVEL: "#22c55e", PROPOSTA: "#f97316", RESERVADO: "#f59e0b",
  VENDIDO: "#ef4444", BLOQUEADO: "#9ca3af",
};
const ESPELHO_STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível", PROPOSTA: "Proposta", RESERVADO: "Reservado",
  VENDIDO: "Vendido", BLOQUEADO: "Bloqueado",
};

// Modal unificado para definir/alterar o interesse do lead: lista imóveis do catálogo + empreendimentos.
function InteresseSelectorModal({ leadId, current, onClose, onDone }: {
  leadId: string;
  current: { type: "produto" | "empreendimento"; id: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{
    products: { id: string; title: string; local: string | null; coverUrl: string | null }[];
    developments: { id: string; nome: string; local: string | null; coverUrl: string | null }[];
  }>({ products: [], developments: [] });

  useEffect(() => {
    apiFetch(`/leads/interest-options`).then((d) => setOpts(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function pick(body: { produtoInteresseId: string | null; empreendimentoInteresseId: string | null }) {
    setSaving(true);
    try {
      await apiFetch(`/leads/${leadId}/qualification`, { method: "PATCH", body: JSON.stringify(body) });
      onDone();
    } catch {
      setSaving(false);
    }
  }

  const qq = q.trim().toLowerCase();
  const devs = opts.developments.filter((d) => !qq || `${d.nome} ${d.local ?? ""}`.toLowerCase().includes(qq));
  const prods = opts.products.filter((p) => !qq || `${p.title} ${p.local ?? ""}`.toLowerCase().includes(qq));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-[var(--shell-card-bg)] shadow-2xl" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
          <div className="text-base font-bold text-[var(--shell-text)]">Definir interesse</div>
          <button type="button" onClick={onClose} className="text-lg text-[var(--shell-subtext)] hover:text-[var(--shell-text)]">✕</button>
        </div>
        <div className="border-b px-5 py-3" style={{ borderColor: "var(--shell-card-border)" }}>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar imóvel ou empreendimento..."
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="px-2 py-6 text-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
          ) : (
            <>
              {current && (
                <button
                  type="button" disabled={saving}
                  onClick={() => pick({ produtoInteresseId: null, empreendimentoInteresseId: null })}
                  className="w-full rounded-lg border px-3 py-2 text-left text-sm text-red-600 hover:bg-[var(--shell-hover)] disabled:opacity-50"
                  style={{ borderColor: "var(--shell-card-border)" }}
                >
                  🗑 Remover interesse atual
                </button>
              )}
              {devs.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Empreendimentos</div>
                  <div className="space-y-1">
                    {devs.map((d) => (
                      <button
                        key={d.id} type="button" disabled={saving}
                        onClick={() => pick({ empreendimentoInteresseId: d.id, produtoInteresseId: null })}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--shell-hover)] disabled:opacity-50 ${current?.type === "empreendimento" && current.id === d.id ? "bg-[var(--shell-hover)]" : ""}`}
                      >
                        {d.coverUrl ? <img src={d.coverUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" /> : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-[var(--shell-bg)] text-sm">🏢</div>}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[var(--shell-text)]">{d.nome}</div>
                          {d.local && <div className="truncate text-xs text-[var(--shell-subtext)]">{d.local}</div>}
                        </div>
                        {current?.type === "empreendimento" && current.id === d.id && <span className="ml-auto text-xs text-emerald-600">atual</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {prods.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Imóveis do catálogo</div>
                  <div className="space-y-1">
                    {prods.map((p) => (
                      <button
                        key={p.id} type="button" disabled={saving}
                        onClick={() => pick({ produtoInteresseId: p.id, empreendimentoInteresseId: null })}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--shell-hover)] disabled:opacity-50 ${current?.type === "produto" && current.id === p.id ? "bg-[var(--shell-hover)]" : ""}`}
                      >
                        {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded object-cover" /> : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-[var(--shell-bg)] text-sm">🏠</div>}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[var(--shell-text)]">{p.title}</div>
                          {p.local && <div className="truncate text-xs text-[var(--shell-subtext)]">{p.local}</div>}
                        </div>
                        {current?.type === "produto" && current.id === p.id && <span className="ml-auto text-xs text-emerald-600">atual</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {devs.length === 0 && prods.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-[var(--shell-subtext)]">Nenhuma opção encontrada.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EspelhoSelectorModal({ devId, leadId, trocandoUnitId, trocandoUnitNome, linkStatus = "PROPOSTA", viewOnly = false, onClose, onDone }: {
  devId: string; leadId: string;
  trocandoUnitId?: string; trocandoUnitNome?: string;
  linkStatus?: "PROPOSTA" | "RESERVADO";
  viewOnly?: boolean;
  onClose: () => void; onDone: () => void;
}) {
  const [dev, setDev] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Set<string>>(
    new Set(["DISPONIVEL", "PROPOSTA", "RESERVADO", "VENDIDO", "BLOQUEADO"])
  );

  useEffect(() => {
    apiFetch(`/developments/${devId}`).then(setDev).finally(() => setLoading(false));
  }, [devId]);

  function toggleStatus(s: string) {
    const next = new Set(filterStatus);
    if (next.has(s)) next.delete(s); else next.add(s);
    setFilterStatus(next);
  }

  async function confirmSelection() {
    if (!confirming || saving) return;
    setSaving(true);
    try {
      if (trocandoUnitId) {
        await apiFetch(`/developments/${devId}/units/${trocandoUnitId}/unlink`, { method: "PATCH" });
      }
      await apiFetch(`/developments/${devId}/units/${confirming.id}`, {
        method: "PATCH",
        body: JSON.stringify({ leadId, status: linkStatus }),
      });
      onDone();
    } catch (e: any) {
      alert(e?.message ?? "Erro ao vincular unidade");
      setSaving(false);
    }
  }

  const isVertical = dev?.tipo === "VERTICAL";
  const allDisponivel = (dev?.towers ?? []).flatMap((t: any) => t.units).filter((u: any) => u.status === "DISPONIVEL").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-5xl mx-4 rounded-2xl bg-[var(--shell-card-bg)] flex flex-col shadow-2xl" style={{ maxHeight: "88vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--shell-card-border)] shrink-0">
          <div>
            <h3 className="text-base font-bold text-[var(--shell-text)]">
              {trocandoUnitId ? `Trocar unidade — DE: ${trocandoUnitNome ?? "unidade anterior"}` : "Espelho de Vendas — Selecionar unidade"}
            </h3>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
              {viewOnly
                ? "Visualização do espelho (somente leitura)"
                : trocandoUnitId
                ? "Clique em uma unidade Disponível para selecionar a nova unidade (PARA)"
                : linkStatus === "RESERVADO"
                ? "Clique em uma unidade Disponível para RESERVAR para o lead"
                : "Clique em uma unidade Disponível para vincular como PROPOSTA"}
              {" · "}<span className="text-green-600 font-semibold">{allDisponivel} disponíveis</span>
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-2xl leading-none shrink-0">×</button>
        </div>

        {/* Legenda / filtros */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--shell-card-border)] shrink-0 flex-wrap">
          {Object.entries(ESPELHO_STATUS_LABEL).map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggleStatus(k)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs border transition-opacity ${filterStatus.has(k) ? "opacity-100 border-[var(--shell-card-border)]" : "opacity-30 border-transparent"}`}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: ESPELHO_STATUS_COLOR[k] }} />
              {l}
            </button>
          ))}
        </div>

        {/* Grade */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loading && <p className="text-center text-sm text-[var(--shell-subtext)] py-16">Carregando espelho...</p>}
          {!loading && !dev && <p className="text-center text-sm text-red-500 py-16">Erro ao carregar empreendimento.</p>}
          {!loading && dev && (
            <div className="space-y-8">
              {(dev.towers as any[]).map((tower: any) => {
                const units = (tower.units as any[]).filter((u: any) => filterStatus.has(u.status));
                if (units.length === 0) return null;

                if (isVertical) {
                  const byFloor = new Map<number, any[]>();
                  for (const u of units) {
                    const f = u.andar ?? 0;
                    if (!byFloor.has(f)) byFloor.set(f, []);
                    byFloor.get(f)!.push(u);
                  }
                  const floors = Array.from(byFloor.entries()).sort(([a], [b]) => b - a);
                  return (
                    <div key={tower.id}>
                      <p className="text-sm font-bold text-[var(--shell-text)] mb-3">{tower.nome}</p>
                      <div className="space-y-1">
                        {floors.map(([floor, fu]) => (
                          <div key={floor} className="flex items-center gap-1.5">
                            <span className="w-8 text-[10px] text-right text-[var(--shell-subtext)] shrink-0">{floor}º</span>
                            <div className="flex gap-1 flex-wrap">
                              {(fu as any[]).sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)).map((u: any) => {
                                const isDisp = u.status === "DISPONIVEL";
                                const isConfirming = confirming?.id === u.id;
                                return (
                                  <button key={u.id} type="button"
                                    disabled={!isDisp || viewOnly}
                                    onClick={viewOnly ? undefined : () => setConfirming(u)}
                                    title={`${u.nome} — ${ESPELHO_STATUS_LABEL[u.status] ?? u.status}${u.valorVenda ? ` — R$ ${u.valorVenda.toLocaleString("pt-BR")}` : ""}`}
                                    style={{ backgroundColor: isConfirming ? "#16a34a" : ESPELHO_STATUS_COLOR[u.status] }}
                                    className={`h-8 min-w-[40px] px-1 rounded text-[10px] font-bold text-white transition-all ${isDisp && !viewOnly ? "hover:scale-110 hover:shadow-md cursor-pointer" : "cursor-default opacity-70"} ${isConfirming ? "ring-2 ring-white scale-110" : ""}`}>
                                    {u.nome.replace(/[^0-9A-Za-z]/g, "") || u.nome}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={tower.id}>
                    <p className="text-sm font-bold text-[var(--shell-text)] mb-3">{tower.nome}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(units as any[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((u: any) => {
                        const isDisp = u.status === "DISPONIVEL";
                        const isConfirming = confirming?.id === u.id;
                        return (
                          <button key={u.id} type="button"
                            disabled={!isDisp || viewOnly}
                            onClick={viewOnly ? undefined : () => setConfirming(u)}
                            title={`${u.nome} — ${ESPELHO_STATUS_LABEL[u.status] ?? u.status}${u.valorVenda ? ` — R$ ${u.valorVenda.toLocaleString("pt-BR")}` : ""}`}
                            style={{ backgroundColor: isConfirming ? "#16a34a" : ESPELHO_STATUS_COLOR[u.status] }}
                            className={`h-10 min-w-[56px] px-2 rounded text-[10px] font-bold text-white transition-all ${isDisp && !viewOnly ? "hover:scale-110 hover:shadow-md cursor-pointer" : "cursor-default opacity-70"} ${isConfirming ? "ring-2 ring-white scale-110" : ""}`}>
                            {u.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmação */}
        {confirming && (
          <div className="shrink-0 border-t border-[var(--shell-card-border)] px-6 py-4 flex items-center justify-between gap-4 bg-green-50 dark:bg-green-900/20">
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                {trocandoUnitId ? `Trocar PARA: ${confirming.nome}` : `Vincular: ${confirming.nome}`}
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                {confirming.valorVenda && confirming.valorVenda.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                {confirming.areaM2 && ` · ${confirming.areaM2} m²`}
                {confirming.quartos && ` · ${confirming.quartos} quartos`}
                {confirming.andar && ` · ${confirming.andar}º andar`}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setConfirming(null)}
                className="rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors">
                Cancelar
              </button>
              <button type="button" disabled={saving} onClick={confirmSelection}
                className="rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors">
                {saving ? "Salvando..." : trocandoUnitId ? "Confirmar troca" : "Confirmar vínculo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DevMediaModal({
  devId, devNome, onClose,
  prepareAttachmentFromUrl, onSendMultiple, insertIntoChat, handleCopyLink,
}: {
  devId: string; devNome: string; onClose: () => void;
  prepareAttachmentFromUrl: (kind: "image" | "video" | "document", url: string, name: string) => Promise<void>;
  onSendMultiple: (urls: string[], kind: "image" | "document") => Promise<void>;
  insertIntoChat: (s: string) => void;
  handleCopyLink: (url: string) => Promise<void>;
}) {
  type Tab = "FOTO_COMERCIAL" | "PANFLETO" | "BOOK" | "OBRA";
  const [tab, setTab] = useState<Tab>("FOTO_COMERCIAL");
  const [media, setMedia] = useState<DevMedia[]>([]);
  const [obra, setObra] = useState<DevObraUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ items: string[]; idx: number } | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkNotice] = useState<string | null>(null);

  function toggleSelect(url: string) {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  async function sendSelected() {
    if (selectedUrls.size === 0 || bulkSending) return;
    setBulkSending(true);
    const kind: "image" | "document" = (tab === "FOTO_COMERCIAL" || tab === "OBRA") ? "image" : "document";
    await onSendMultiple(Array.from(selectedUrls), kind);
    // onSendMultiple fecha o modal (setDevMediaModal(null)) — não precisa de mais ação aqui
    setBulkSending(false);
  }

  useEffect(() => {
    setLoading(true);
    setSelectedUrls(new Set());
    if (tab === "OBRA") {
      listObraUpdates(devId).then(r => { setObra(r); setLoading(false); }).catch(() => setLoading(false));
    } else {
      listMedia(devId, tab).then(r => { setMedia(r); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [devId, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "FOTO_COMERCIAL", label: "Fotos" },
    { key: "PANFLETO", label: "Panfletos" },
    { key: "BOOK", label: "Book" },
    { key: "OBRA", label: "Evolução de Obra" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-[var(--shell-card-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--shell-card-border)] px-6 py-4">
          <div>
            <div className="text-xs text-[var(--shell-subtext)] uppercase tracking-wide font-semibold">Mídia do Empreendimento</div>
            <div className="text-base font-bold text-[var(--shell-text)]">{devNome}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-[var(--shell-bg)] text-[var(--shell-subtext)] transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[var(--shell-card-border)] px-6">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-4 py-3 text-sm font-medium transition-colors border-b-2"
              style={{
                borderColor: tab === t.key ? "var(--brand-accent)" : "transparent",
                color: tab === t.key ? "var(--brand-accent)" : "var(--shell-subtext)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[var(--shell-subtext)] text-sm">Carregando...</div>
          )}

          {!loading && tab !== "OBRA" && (
            <>
              {media.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-[var(--shell-subtext)] text-sm">
                  Nenhum arquivo nesta categoria.
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-[var(--shell-subtext)]">
                      Clique na caixa para selecionar · Clique na foto para ampliar
                    </span>
                    {selectedUrls.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedUrls(new Set())}
                        className="text-xs text-[var(--shell-subtext)] underline"
                      >
                        Limpar seleção
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {media.map((item, idx) => {
                      const isImage = tab === "FOTO_COMERCIAL";
                      const allUrls = media.map(m => m.url);
                      const isSelected = selectedUrls.has(item.url);
                      return (
                        <div
                          key={item.id}
                          className={`relative rounded-xl border overflow-hidden bg-[var(--shell-bg)] transition-all ${isSelected ? "border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)]/30" : "border-[var(--shell-card-border)]"}`}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => toggleSelect(item.url)}
                            className="absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors shadow-sm"
                            style={{
                              backgroundColor: isSelected ? "var(--brand-accent)" : "rgba(255,255,255,0.9)",
                              borderColor: isSelected ? "var(--brand-accent)" : "#d1d5db",
                            }}
                          >
                            {isSelected && <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                          </button>

                          {isImage ? (
                            <button type="button" className="w-full" onClick={() => setLightbox({ items: allUrls, idx })}>
                              <img src={item.url} alt={item.titulo ?? ""} className="w-full h-36 object-cover hover:opacity-90 transition-opacity" />
                            </button>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-36 gap-2">
                              <span className="text-4xl">📄</span>
                              <a href={item.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline">Abrir</a>
                            </div>
                          )}
                          {item.titulo && (
                            <div className="px-2 py-1 text-[11px] text-[var(--shell-text)] truncate">{item.titulo}</div>
                          )}
                          <div className="flex gap-1 p-2 border-t border-[var(--shell-card-border)]">
                            <button
                              type="button"
                              onClick={() => prepareAttachmentFromUrl(isImage ? "image" : "document", item.url, item.titulo || "arquivo")}
                              className="flex-1 rounded px-2 py-1 text-[10px] font-semibold text-white transition-colors"
                              style={{ background: "var(--brand-accent)" }}
                              title="Preparar 1 arquivo para envio"
                            >
                              Enviar 1
                            </button>
                            <button
                              type="button"
                              onClick={() => insertIntoChat(item.url)}
                              className="flex-1 rounded px-2 py-1 text-[10px] font-semibold bg-[var(--shell-bg)] text-[var(--shell-text)] border border-[var(--shell-card-border)] transition-colors hover:bg-[var(--shell-card-bg)]"
                              title="Inserir link no chat"
                            >
                              Link
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(item.url)}
                              className="rounded px-2 py-1 text-[10px] font-semibold bg-[var(--shell-bg)] text-[var(--shell-text)] border border-[var(--shell-card-border)] transition-colors hover:bg-[var(--shell-card-bg)]"
                              title="Copiar link"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {!loading && tab === "OBRA" && (
            <>
              {obra.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-[var(--shell-subtext)] text-sm">
                  Nenhuma atualização de obra cadastrada.
                </div>
              ) : (
                <>
                  {selectedUrls.size > 0 && (
                    <div className="mb-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedUrls(new Set())}
                        className="text-xs text-[var(--shell-subtext)] underline"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  )}
                  <div className="space-y-4">
                    {obra.map(update => {
                      const allFotoUrls = update.fotos.map(f => f.url);
                      return (
                        <div key={update.id} className="rounded-xl border border-[var(--shell-card-border)] p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="text-sm font-semibold text-[var(--shell-text)]">
                                {update.titulo ?? new Date(update.dataAtualizacao).toLocaleDateString("pt-BR")}
                              </div>
                              <div className="text-xs text-[var(--shell-subtext)]">
                                {new Date(update.dataAtualizacao).toLocaleDateString("pt-BR")}
                              </div>
                              {update.observacoes && (
                                <div className="mt-1 text-xs text-[var(--shell-text)] leading-relaxed">{update.observacoes}</div>
                              )}
                            </div>
                            {update.percentualAvanco != null && (
                              <div className="flex flex-col items-center gap-1 ml-4">
                                <div className="text-lg font-bold text-[var(--brand-accent)]">{update.percentualAvanco}%</div>
                                <div className="text-[10px] text-[var(--shell-subtext)]">avanço</div>
                              </div>
                            )}
                          </div>
                          {update.fotos.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                              {update.fotos.map((foto, fIdx) => {
                                const isSelected = selectedUrls.has(foto.url);
                                return (
                                  <div
                                    key={foto.id}
                                    className={`relative rounded-lg overflow-hidden border transition-all ${isSelected ? "border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)]/30" : "border-[var(--shell-card-border)]"}`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleSelect(foto.url)}
                                      className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border-2 shadow-sm transition-colors"
                                      style={{
                                        backgroundColor: isSelected ? "var(--brand-accent)" : "rgba(255,255,255,0.9)",
                                        borderColor: isSelected ? "var(--brand-accent)" : "#d1d5db",
                                      }}
                                    >
                                      {isSelected && <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                                    </button>
                                    <button type="button" className="w-full" onClick={() => setLightbox({ items: allFotoUrls, idx: fIdx })}>
                                      <img src={foto.url} alt={foto.legenda ?? ""} className="w-full h-24 object-cover hover:opacity-90 transition-opacity" />
                                    </button>
                                    <div className="flex gap-1 p-1 bg-[var(--shell-bg)]">
                                      <button
                                        type="button"
                                        onClick={() => prepareAttachmentFromUrl("image", foto.url, foto.legenda || "foto-obra")}
                                        className="flex-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                                        style={{ background: "var(--brand-accent)" }}
                                      >
                                        Enviar 1
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyLink(foto.url)}
                                        className="rounded px-1 py-0.5 text-[10px] font-semibold bg-[var(--shell-bg)] text-[var(--shell-text)] border border-[var(--shell-card-border)]"
                                      >
                                        📋
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer de envio em lote */}
        {(selectedUrls.size > 0 || bulkNotice) && (
          <div className="sticky bottom-0 border-t border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-6 py-4 flex items-center gap-3 rounded-b-2xl">
            {bulkNotice ? (
              <span className="flex-1 text-sm font-semibold text-green-600">{bulkNotice}</span>
            ) : (
              <>
                <span className="flex-1 text-sm text-[var(--shell-text)]">
                  <span className="font-bold">{selectedUrls.size}</span> arquivo(s) selecionado(s)
                </span>
                <button
                  type="button"
                  disabled={bulkSending}
                  onClick={sendSelected}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: "var(--brand-accent)" }}
                >
                  {bulkSending ? "Enviando..." : `Enviar ${selectedUrls.size} selecionada(s)`}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white text-2xl font-bold z-[61] rounded-full w-10 h-10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
          {lightbox.idx > 0 && (
            <button
              type="button"
              onClick={() => setLightbox(l => l ? { ...l, idx: l.idx - 1 } : null)}
              className="absolute left-4 text-white text-3xl font-bold z-[61] rounded-full w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              ‹
            </button>
          )}
          <img
            src={lightbox.items[lightbox.idx]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
          />
          {lightbox.idx < lightbox.items.length - 1 && (
            <button
              type="button"
              onClick={() => setLightbox(l => l ? { ...l, idx: l.idx + 1 } : null)}
              className="absolute right-4 text-white text-3xl font-bold z-[61] rounded-full w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              ›
            </button>
          )}
          <div className="absolute bottom-4 text-white text-sm opacity-70">
            {lightbox.idx + 1} / {lightbox.items.length}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [prevGroupLastStageId, setPrevGroupLastStageId] = useState<string | null>(null);
  const [currentStageRequiresEvidence, setCurrentStageRequiresEvidence] = useState(false);
  const [currentStageRequiresReason, setCurrentStageRequiresReason] = useState(false);
  const [currentStageRequiresPendencias, setCurrentStageRequiresPendencias] = useState(false);
  const [currentStageUnitAction, setCurrentStageUnitAction] = useState<string | null>(null);
  const [statusEvidences, setStatusEvidences] = useState<StatusEvidence[]>([]);
  const [evidencesOpen, setEvidencesOpen] = useState(false);
  const [transitions, setTransitions] = useState<LeadTransition[]>([]);
  const [leadCampanhas, setLeadCampanhas] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState<{ url: string; mime: string; nome: string } | null>(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null);
  const [pendenciasModalOpen, setPendenciasModalOpen] = useState(false);
  const [pendenciasReloadKey, setPendenciasReloadKey] = useState(0);
  const [participantes, setParticipantes] = useState<{ nome: string; classificacao?: string | null }[]>([]);
  const pendenciaPessoas = useMemo<PendenciaPessoa[]>(() => {
    const principal: PendenciaPessoa = { nome: null, label: "Lead principal" };
    const extras: PendenciaPessoa[] = participantes.map((p) => ({
      nome: p.nome,
      label: p.classificacao ? `${p.nome} (${p.classificacao})` : p.nome,
      classificacao: p.classificacao ?? null,
    }));
    return [principal, ...extras];
  }, [participantes]);
  const [unitConfirm, setUnitConfirm] = useState<{ stage: PipelineStage; message: string } | null>(null);
  // Venda avulsa (imóvel sem unidade de empreendimento): captura valor + data
  const [vendaModal, setVendaModal] = useState<{ stage: PipelineStage } | null>(null);
  const [vendaValor, setVendaValor] = useState("");
  const [vendaData, setVendaData] = useState("");
  // Ingresso na Base Fria: modal opcional com agenda + mensagem programada
  const [baseFriaModal, setBaseFriaModal] = useState<{ stage: PipelineStage } | null>(null);
  const [bfAgendaData, setBfAgendaData] = useState("");
  const [bfMsgData, setBfMsgData] = useState("");
  const [bfMsgTexto, setBfMsgTexto] = useState("");
  const [bfMsgSessionId, setBfMsgSessionId] = useState("");
  const [bfSalvarTemplate, setBfSalvarTemplate] = useState(false);
  const [bfSessions, setBfSessions] = useState<{ id: string; nome: string; status: string; phoneNumber: string | null }[]>([]);
  const [bfSaving, setBfSaving] = useState(false);

  // (preparação pro futuro) etapa —Sfinal⬝ pode sugerir minimizar chat

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dismissedAiSuggestionIds, setDismissedAiSuggestionIds] = useState<string[]>([]);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [tenantAiEnabled, setTenantAiEnabled] = useState(true);
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

  const [prodTab, setProdTab] = useState<"catalogo" | "empreendimentos">("catalogo");
  const [prodOpen, setProdOpen] = useState(false);
  const [waLightSessions, setWaLightSessions] = useState<WaSession[]>([]);
  const [waOficialConfigured, setWaOficialConfigured] = useState(false);
  const [selectedCanalOut, setSelectedCanalOut] = useState<CanalOut | null>(null);
  const [pendingCanalChange, setPendingCanalChange] = useState<CanalOut | null>(null);
  const [savingCanal, setSavingCanal] = useState(false);
  const [desvinculandoUnitId, setDesvinculandoUnitId] = useState<string | null>(null);
  const [trocandoUnit, setTrocandoUnit] = useState<string | null>(null);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [selectedDevId, setSelectedDevId] = useState<string>("");
  const [espelhoModal, setEspelhoModal] = useState<{ devId: string; trocandoUnitId?: string; trocandoUnitNome?: string } | null>(null);
  const [devInteresseConfirm, setDevInteresseConfirm] = useState<{ devId: string; devNome: string; action: "espelho" | "midia" } | null>(null);
  const [devInteresseSaving, setDevInteresseSaving] = useState(false);
  const [interesseModalOpen, setInteresseModalOpen] = useState(false);
  const [devMediaModal, setDevMediaModal] = useState<{ devId: string; devNome: string } | null>(null);
  const [devUnits, setDevUnits] = useState<DevUnit[]>([]);
  const [devUnitsLoading, setDevUnitsLoading] = useState(false);
  const [propostaModal, setPropostaModal] = useState<{ unit: DevUnit; devId: string } | null>(null);
  const [propostaForm, setPropostaForm] = useState({ valor: "", pagamento: "FINANCIAMENTO", obs: "" });
  const [propostaSaving, setPropostaSaving] = useState(false);

  const [agendaEvents, setAgendaEvents] = useState<LeadCalendarEvent[]>([]);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [editingAgendaEvent, setEditingAgendaEvent] = useState<LeadCalendarEvent | null>(null);
  const [agendaEditForm, setAgendaEditForm] = useState({ title: "", startAt: "", endAt: "", status: "", visibility: "" });
  const [agendaEditSaving, setAgendaEditSaving] = useState(false);
  const [agendaEditError, setAgendaEditError] = useState<string | null>(null);
  const [currentAgendaUserId, setCurrentAgendaUserId] = useState("");
  const [currentAgendaUserRole, setCurrentAgendaUserRole] = useState("");

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachQueue, setAttachQueue] = useState<File[]>([]);
  const [attachFiles, setAttachFiles] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [attachSendProgress, setAttachSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [attachSending, setAttachSending] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [attachPreviewUrl, setAttachPreviewUrl] = useState<string | null>(null);

  const [hasNewInbound, setHasNewInbound] = useState(false);
  const lastInboundIdRef = useRef<string | null>(null);

  const [qualOpen, setQualOpen] = useState(false);
  const [leadInfoOpen, setLeadInfoOpen] = useState(false);
  const [origemEditField, setOrigemEditField] = useState<string | null>(null);
  const [origemEditValue, setOrigemEditValue] = useState('');
  const [savingOrigemField, setSavingOrigemField] = useState(false);

  // TEMP-EDIT-TEL-CPF (temporário — remover depois): edição inline de telefone / CPF no card do lead
  const [contactEditField, setContactEditField] = useState<null | 'telefone' | 'cpf'>(null);
  const [contactEditValue, setContactEditValue] = useState('');
  const [savingContactField, setSavingContactField] = useState(false);
  const [contactFieldErr, setContactFieldErr] = useState<string | null>(null);

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
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showCanalModal, setShowCanalModal] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showEndConvDialog, setShowEndConvDialog] = useState(false);
  const pendingNavRef = useRef<string | null>(null);

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
      setPrevGroupLastStageId(data?.prevGroupLastStageId ?? null);
      setCurrentStageRequiresEvidence(Boolean(data?.currentRequiresEvidence));
      setCurrentStageRequiresReason(Boolean(data?.currentRequiresReason));
      setCurrentStageRequiresPendencias(Boolean(data?.currentRequiresPendencias));
      setCurrentStageUnitAction(data?.currentUnitAction ?? null);
    } catch {
      setAllowedStages([]);
      setPrevGroupLastStageId(null);
      setCurrentStageRequiresEvidence(false);
      setCurrentStageRequiresReason(false);
      setCurrentStageRequiresPendencias(false);
      setCurrentStageUnitAction(null);
    }
  }

  async function loadStatusEvidences(leadId: string) {
    try {
      const data = await apiFetch("/leads/" + leadId + "/status-evidences", { method: "GET" });
      setStatusEvidences(Array.isArray(data) ? data : []);
    } catch {
      setStatusEvidences([]);
    }
  }

  async function loadTransitions(leadId: string) {
    try {
      const data = await apiFetch("/leads/" + leadId + "/transitions", { method: "GET" });
      setTransitions(Array.isArray(data) ? data : []);
    } catch {
      setTransitions([]);
    }
  }

  async function loadLeadCampanhas(leadId: string) {
    try {
      const data = await apiFetch("/leads/" + leadId + "/campanhas", { method: "GET" });
      setLeadCampanhas(Array.isArray(data) ? data : []);
    } catch {
      setLeadCampanhas([]);
    }
  }

  async function openStatusEvidenceDoc(docId: string, nome: string) {
    try {
      const blob = await authFetchBlob(absApiUrl(`/leads/${id}/documents/${docId}/view`));
      const url = URL.createObjectURL(blob);
      setEvidencePreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, mime: blob.type || "", nome };
      });
    } catch (e: any) {
      alert(e?.message || "Não foi possível abrir a evidência.");
    }
  }

  function closeEvidencePreview() {
    setEvidencePreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
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

  async function loadParticipantes() {
    if (!id) return;
    try {
      const data = await apiFetch(`/leads/${id}/participantes`);
      setParticipantes(Array.isArray(data) ? data.map((p: any) => ({ nome: p.nome, classificacao: p.classificacao ?? null })) : []);
    } catch {
      setParticipantes([]);
    }
  }

  async function loadLead() {
    const l = await apiFetch("/leads/" + id, { method: "GET" });
    setLead(l);
    setNomeConfirmadoEdit(l?.nomeCorreto ?? "");
    await loadAllowedStages(id);
    await loadStatusEvidences(id);
    await loadTransitions(id);
    await loadLeadCampanhas(id);
    return l;
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

  async function loadDevelopments() {
    try {
      const data = await apiFetch("/developments");
      setDevelopments(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
  }

  async function loadDevUnits(devId: string) {
    if (!devId) { setDevUnits([]); return; }
    setDevUnitsLoading(true);
    try {
      const data = await apiFetch(`/developments/${devId}`);
      const allUnits: DevUnit[] = [];
      for (const tower of data?.towers ?? []) {
        for (const unit of tower?.units ?? []) {
          allUnits.push({ ...unit, developmentId: devId });
        }
      }
      setDevUnits(allUnits);
    } catch { setDevUnits([]); }
    finally { setDevUnitsLoading(false); }
  }

  async function confirmarProposta() {
    if (!propostaModal || !lead) return;
    setPropostaSaving(true);
    try {
      const valor = propostaForm.valor ? parseFloat(propostaForm.valor.replace(/\./g, "").replace(",", ".")) : null;
      await apiFetch(`/developments/${propostaModal.devId}/units/${propostaModal.unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          leadId: lead.id,
          status: "PROPOSTA",
          finalPrice: valor,
          propostaPagamento: propostaForm.pagamento,
          propostaObs: propostaForm.obs || null,
        }),
      });
      setPropostaModal(null);
      await loadDevUnits(selectedDevId);
      await loadLead();
    } catch (e: any) {
      alert(e?.message || "Erro ao registrar proposta");
    } finally {
      setPropostaSaving(false);
    }
  }

  async function loadWaChannels() {
    try {
      const [sessions, waConfig] = await Promise.all([
        apiFetch("/inbox-wa-light").catch(() => []),
        apiFetch("/tenants/whatsapp-settings").catch(() => null),
      ]);
      const list: WaSession[] = Array.isArray(sessions) ? sessions : [];
      setWaLightSessions(list);
      const hasOficial = !!(waConfig?.whatsappPhoneNumberId && waConfig?.whatsappTokenConfigured);
      setWaOficialConfigured(hasOficial);
      // Auto-seleciona: Oficial tem prioridade quando configurado, Light como fallback
      setSelectedCanalOut(prev => {
        if (prev) return prev;
        if (hasOficial) return { type: "oficial" };
        const connected = list.find(s => s.status === "CONNECTED");
        if (connected) return { type: "light", sessionId: connected.id };
        return null;
      });
    } catch {}
  }

  async function loadAgendaEvents() {
    if (!id) return;
    try {
      const data = await apiFetch(`/calendar/events?leadId=${id}`);
      setAgendaEvents(Array.isArray(data) ? data : []);
    } catch {
      setAgendaEvents([]);
    }
  }

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentAgendaUserId(u.id || u.sub || "");
      setCurrentAgendaUserRole(u.role || "AGENT");
    } catch {}
  }, []);

  const AGENDA_ROLE_LEVEL: Record<string, number> = { OWNER: 4, MANAGER: 3, AGENT: 2, PARTNER: 1 };

  function canEditAgendaEvent(ev: LeadCalendarEvent): boolean {
    if (ev.userId === currentAgendaUserId) return true;
    return (AGENDA_ROLE_LEVEL[currentAgendaUserRole] ?? 0) > (AGENDA_ROLE_LEVEL[ev.user?.role] ?? 0);
  }

  function toAgendaInputDateTime(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openAgendaEdit(ev: LeadCalendarEvent) {
    setAgendaEditError(null);
    setEditingAgendaEvent(ev);
    setAgendaEditForm({
      title: ev.title,
      startAt: toAgendaInputDateTime(ev.startAt),
      endAt: ev.endAt ? toAgendaInputDateTime(ev.endAt) : "",
      status: ev.status,
      visibility: ev.visibility,
    });
  }

  async function saveAgendaEdit() {
    if (!editingAgendaEvent) return;
    if (!agendaEditForm.title.trim()) { setAgendaEditError("Título obrigatório."); return; }
    setAgendaEditSaving(true);
    setAgendaEditError(null);
    try {
      await apiFetch(`/calendar/events/${editingAgendaEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: agendaEditForm.title.trim(),
          startAt: new Date(agendaEditForm.startAt).toISOString(),
          endAt: agendaEditForm.endAt ? new Date(agendaEditForm.endAt).toISOString() : undefined,
          status: agendaEditForm.status,
          visibility: agendaEditForm.visibility,
        }),
      });
      setEditingAgendaEvent(null);
      loadAgendaEvents();
    } catch (e: any) {
      setAgendaEditError(e?.message || "Erro ao salvar.");
    } finally {
      setAgendaEditSaving(false);
    }
  }

  async function loadAll() {
    setErr(null);
    setLoadingLead(true);
    setLoadingEvents(true);
    try {
      const [,,,,,,,, aiStatus] = await Promise.all([loadLead(), loadEvents(), loadProducts({ silent: true }), loadTeamMembers(), loadDocuments(), loadCreditData(), loadDevelopments(), loadWaChannels(), apiFetch("/tenants/ai-status").catch(() => null)]);
      if (aiStatus) setTenantAiEnabled((aiStatus as any).autopilotEnabled ?? true);
      loadAgendaEvents();
      loadParticipantes();
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

  // Ao abrir o lead, marca como lido → limpa a notificação "Aguardando resposta" do sininho.
  useEffect(() => {
    if (!id) return;
    apiFetch(`/leads/${id}/mark-read`, { method: "POST" }).catch(() => null);
  }, [id]);

  // Interceptor de navegação: pergunta se quer encerrar conversa aberta.
  // Externo Consultivo (PARTNER) é só consulta — não conversa, não encerra; navega livre.
  useEffect(() => {
    if (!lead?.conversaAberta) return;
    if (user?.role === "PARTNER") return;

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a');
      if (!link) return;
      // blob: URLs são downloads programáticos — nunca são navegação para fora do lead
      if (link.href.startsWith('blob:')) return;
      try {
        const url = new URL(link.href);
        if (url.pathname.startsWith(`/leads/${id}`)) return;
      } catch { return; }
      e.preventDefault();
      e.stopPropagation();
      pendingNavRef.current = link.href;
      setShowExitDialog(true);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [lead?.conversaAberta, id, user?.role]);

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

  async function saveOrigemField(field: string, value: string) {
    if (!lead) return;
    setSavingOrigemField(true);
    try {
      const updated = { ...(lead.cadastroOrigem ?? {}), [field]: value.trim() || null };
      await apiFetch(`/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cadastroOrigem: updated }),
      });
      setLead((prev) => prev ? { ...prev, cadastroOrigem: updated } : prev);
      setOrigemEditField(null);
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar.');
    } finally {
      setSavingOrigemField(false);
    }
  }

  // TEMP-EDIT-TEL-CPF (temporário — remover depois)
  function startContactEdit(field: 'telefone' | 'cpf') {
    if (!lead) return;
    // Externo Consultivo não edita dados de contato (campo pode estar oculto)
    if (user?.role === "PARTNER") return;
    setContactFieldErr(null);
    setContactEditField(field);
    if (field === 'telefone') setContactEditValue(maskPhone(lead.telefone ?? ''));
    else setContactEditValue(maskCPF(lead.cpf ?? ''));
  }

  async function saveContactField() {
    if (!lead || !contactEditField) return;
    const field = contactEditField;
    const digits = contactEditValue.replace(/\D/g, '');

    if (field === 'cpf' && digits.length > 0 && !isValidCPF(contactEditValue)) {
      setContactFieldErr('CPF inválido');
      return;
    }

    setSavingContactField(true);
    setContactFieldErr(null);
    try {
      const value = digits || null;
      const updated = await apiFetch(`/leads/${lead.id}/qualification`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      setLead((prev) => prev ? {
        ...prev,
        [field]: updated?.[field] ?? value,
        ...(field === 'telefone' ? { telefoneKey: updated?.telefoneKey ?? prev.telefoneKey } : {}),
      } : prev);
      setContactEditField(null);
    } catch (err: any) {
      setContactFieldErr(err?.message || 'Erro ao salvar.');
    } finally {
      setSavingContactField(false);
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
      if (ch === "ai.qual_settle") continue;
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

  const lastInboundAt = useMemo(() => {
    const lastIn = [...orderedEvents]
      .reverse()
      .find((e) => String(e.channel || "").toLowerCase().startsWith("whatsapp.in"));
    return lastIn?.criadoEm || null;
  }, [orderedEvents]);

  const lastInboundMs = useMemo(() => parseIsoToMs(lastInboundAt), [lastInboundAt]);

  const lastInboundAgoLabel = useMemo(() => {
    if (!lastInboundMs) return "—";
    return formatAgo(nowTick - lastInboundMs);
  }, [nowTick, lastInboundMs]);

  // Contato de ORIGEM: canal por onde o lead entrou (1ª mensagem de WhatsApp).
  const origemContatoLabel = useMemo(() => {
    const firstWa = orderedEvents.find((e) => String(e.channel || "").toLowerCase().includes("whatsapp"));
    if (firstWa) {
      return String(firstWa.channel || "").toLowerCase().includes("unofficial") ? "WhatsApp Light" : "WhatsApp Oficial";
    }
    return (lead as any)?.origem || null;
  }, [orderedEvents, lead]);

  // Contato ATUAL: canal/número por onde a conversa continua (= seletor de resposta).
  const atualContatoLabel = useMemo(() => {
    if (!lead?.conversaCanal) return null;
    if (lead.conversaCanal === "WHATSAPP_OFICIAL") return "WhatsApp Oficial";
    const s = waLightSessions.find((x) => x.id === lead.conversaSessionId);
    return s ? `${s.nome}${s.phoneNumber ? ` · ${s.phoneNumber}` : ""}` : "WhatsApp Light";
  }, [lead?.conversaCanal, lead?.conversaSessionId, waLightSessions]);

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

    if (!lead?.conversaCanal) {
      if (!selectedCanalOut) {
        alert("Defina o canal de saída antes de enviar.");
        return;
      }
      if (selectedCanalOut.type === "light") {
        const session = waLightSessions.find(s => s.id === selectedCanalOut.sessionId);
        if (session && session.status !== "CONNECTED") {
          alert("Canal desconectado. Verifique o canal no cadastro do WhatsApp.");
          return;
        }
      }
    } else if (lead.conversaCanal === "WHATSAPP_LIGHT" && lead.conversaSessionId) {
      const session = waLightSessions.find(s => s.id === lead.conversaSessionId);
      if (session && session.status !== "CONNECTED") {
        alert("Canal desconectado. Verifique o canal no cadastro do WhatsApp.");
        return;
      }
    }

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
          ...((!lead?.conversaCanal && selectedCanalOut?.type === "light") ? { sessionId: selectedCanalOut.sessionId } : {}),
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

    if (!lead?.conversaCanal) {
      if (!selectedCanalOut) {
        alert("Defina o canal de saída antes de enviar.");
        return;
      }
      if (selectedCanalOut.type === "light") {
        const session = waLightSessions.find(s => s.id === selectedCanalOut.sessionId);
        if (session && session.status !== "CONNECTED") {
          alert("Canal desconectado. Verifique o canal no cadastro do WhatsApp.");
          return;
        }
      }
    } else if (lead.conversaCanal === "WHATSAPP_LIGHT" && lead.conversaSessionId) {
      const session = waLightSessions.find(s => s.id === lead.conversaSessionId);
      if (session && session.status !== "CONNECTED") {
        alert("Canal desconectado. Verifique o canal no cadastro do WhatsApp.");
        return;
      }
    }

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
          // —R NÒO colocar Content-Type aqui (FormData precisa do boundary automático)
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

  async function queueMediaSend(urls: string[], kind: "image" | "document") {
    const ext = kind === "image" ? "jpg" : "pdf";
    const mime = kind === "image" ? "image/jpeg" : "application/pdf";
    const items: Array<{ file: File; previewUrl: string }> = [];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], `midia-${items.length + 1}.${ext}`, { type: blob.type || mime });
        items.push({ file, previewUrl: url });
      } catch { /* skip */ }
    }
    if (items.length === 0) return;
    setDevMediaModal(null);
    setAttachFile(null);
    setAttachQueue([]);
    setAttachFiles(items);
    setAttachSendProgress(null);
    setAttachErr(null);
    requestAnimationFrame(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); });
  }

  async function sendAllAttachFiles() {
    const items = attachFiles;
    if (items.length === 0) return;
    setAttachErr(null);
    for (let i = 0; i < items.length; i++) {
      setAttachSendProgress({ current: i + 1, total: items.length });
      const r = await sendAttachmentFile(items[i].file);
      if (!r.ok) {
        setAttachErr(r.error);
        setAttachSendProgress(null);
        return;
      }
      setHasNewInbound(false);
      await loadEvents({ silent: true });
    }
    setAttachFiles([]);
    setAttachSendProgress(null);
    setAttachErr(null);
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
        <div className="mb-4">
          {pipelineStages.length ? (() => {
            const currentStageId = (lead as any)?.stageId || null;
            // Se não veio ?group= na URL, usa o grupo da etapa atual do lead
            const effectiveGroup = currentGroup || (lead as any)?.stageGroup || null;

            async function moveToStage(stageId: string, extra?: Record<string, any>) {
              try {
                setMovingStage(true);
                await apiFetch("/leads/" + id + "/stage", {
                  method: "PATCH",
                  body: JSON.stringify({ stageId, ...(extra ?? {}) }),
                });
                const updatedLead = await loadLead();

                // Usa o stageGroup real do lead após a movimentação (inclui cascade)
                const actualGroup = updatedLead?.stageGroup ?? null;
                if (actualGroup && actualGroup !== effectiveGroup) {
                  router.replace(`/leads/${id}?group=${actualGroup}`);
                }
              } catch (e: any) {
                alert(e?.message || "Erro ao mover etapa");
              } finally {
                setMovingStage(false);
              }
            }

            function proceedSelectStage(stage: PipelineStage) {
              // Ao ENTRAR numa etapa que exige pendências (ex.: Docs Pendente): abre o
              // modal de pendências, que cria os itens antes de mover.
              if (stage.requiresPendencias) {
                setPendingStage(stage);
                setPendenciasModalOpen(true);
                return;
              }
              // Abre o modal ao ENTRAR num status que exige evidência/justificativa
              // ou ao SAIR de um (ex.: reativar lead suspenso/excluído). Os flags
              // current* vêm do backend (allowed-stage-transitions), determinísticos.
              const needsDocument = Boolean(stage.requiresEvidence) || currentStageRequiresEvidence;
              const needsReason = Boolean(stage.requiresReason) || currentStageRequiresReason;
              if (needsDocument || needsReason) {
                setPendingStage(stage);
                setEvidenceModalOpen(true);
              } else {
                moveToStage(stage.id);
              }
            }

            async function handlePendenciasConfirm(payload: { items: PendenciaDraft[]; observacao: string }) {
              if (!pendingStage || !id) return;
              // Cria as pendências e grava a observação ANTES de mover (o backend exige ≥1).
              for (const it of payload.items) {
                await apiFetch(`/leads/${id}/pendencias`, { method: "POST", body: JSON.stringify(it) });
              }
              await apiFetch(`/leads/${id}/pendencias-observacao`, {
                method: "PATCH",
                body: JSON.stringify({ observacao: payload.observacao }),
              });
              await moveToStage(pendingStage.id);
              setPendenciasReloadKey((k) => k + 1);
              setPendenciasModalOpen(false);
              setPendingStage(null);
            }

            function unitLabel(u: any) {
              return [u?.development?.nome, u?.tower?.nome, u?.nome].filter(Boolean).join(" · ");
            }

            // Antes de mover: avisa quando a unidade vinculada vai mudar de status pela etapa.
            function handleSelectStage(stage: PipelineStage) {
              // Ingresso na Base Fria: abre modal opcional (agenda / mensagem programada).
              // Cobre BASE_FRIA (padrão) e BASE_FRIA_PRE/AGENDAMENTO/NEGOCIACOES (v2).
              // Só intercepta quando a etapa não exige evidência/justificativa/pendência
              // (caso contrário, segue o fluxo normal desses modais).
              if (stage.key?.startsWith("BASE_FRIA")) {
                const needsDocument = Boolean(stage.requiresEvidence) || currentStageRequiresEvidence;
                const needsReason = Boolean(stage.requiresReason) || currentStageRequiresReason;
                if (!needsDocument && !needsReason && !stage.requiresPendencias) {
                  setBfAgendaData("");
                  setBfMsgData("");
                  setBfMsgTexto("");
                  setBfMsgSessionId("");
                  setBfSalvarTemplate(false);
                  apiFetch("/inbox-wa-light")
                    .then((d) => setBfSessions(Array.isArray(d) ? d.filter((s: any) => s.status === "CONNECTED") : []))
                    .catch(() => setBfSessions([]));
                  setBaseFriaModal({ stage });
                  return;
                }
              }
              const units = (lead as any)?.developmentUnits ?? [];
              const reservedUnit = units.find((u: any) => u.status === "RESERVADO");
              const propostaUnit = units.find((u: any) => u.status === "PROPOSTA");
              const willPropose = !!reservedUnit && (stage.unitAction === "PROPOSTA" || stage.advancesToGroup === "ESCOLHA_UNIDADE");
              const willSell = !!propostaUnit && stage.unitAction === "VENDA";
              // Venda avulsa: etapa de VENDA e lead sem NENHUMA unidade de empreendimento.
              const isAvulsoSale = stage.unitAction === "VENDA" && units.length === 0;

              if (willPropose) {
                setUnitConfirm({
                  stage,
                  message: `Este lead tem a unidade ${unitLabel(reservedUnit)} reservada. Ao avançar para a Escolha da Unidade, ela passará para Proposta.`,
                });
                return;
              }
              if (willSell) {
                setUnitConfirm({
                  stage,
                  message: `A unidade ${unitLabel(propostaUnit)} será marcada como Vendida ao confirmar o contrato.`,
                });
                return;
              }
              if (isAvulsoSale) {
                setVendaValor("");
                setVendaData(new Date().toISOString().slice(0, 10));
                setVendaModal({ stage });
                return;
              }
              proceedSelectStage(stage);
            }

            async function handleBaseFriaConfirm() {
              if (!baseFriaModal) return;
              const baseFria: any = {};
              if (bfAgendaData) baseFria.agenda = { dataHora: new Date(bfAgendaData).toISOString() };
              if (bfMsgData && bfMsgTexto.trim() && bfMsgSessionId) {
                baseFria.mensagemProgramada = {
                  dataHora: new Date(bfMsgData).toISOString(),
                  texto: bfMsgTexto.trim(),
                  sessionId: bfMsgSessionId,
                  salvarTemplate: bfSalvarTemplate,
                };
              }
              setBfSaving(true);
              try {
                await moveToStage(baseFriaModal.stage.id, Object.keys(baseFria).length ? { baseFria } : undefined);
                setBaseFriaModal(null);
              } finally {
                setBfSaving(false);
              }
            }

            async function handleEvidenceConfirm(payload: { file?: File; motivo?: string }) {
              if (!pendingStage || !id) return;
              let evidenceDocumentId: string | undefined;

              if (payload.file) {
                const docRes = await apiFetch(`/leads/${id}/documents`, {
                  method: "POST",
                  body: JSON.stringify({ tipo: "EVIDENCIA_TRANSICAO", nome: `Evidência — ${pendingStage.name}` }),
                });
                if (!docRes?.id) {
                  throw new Error("Não foi possível registrar a evidência. Tente novamente.");
                }
                const uploadForm = new FormData();
                uploadForm.append("file", payload.file);
                await apiFetch(`/leads/${id}/documents/${docRes.id}/upload`, {
                  method: "POST",
                  body: uploadForm,
                });
                evidenceDocumentId = docRes.id;
              }

              // Só move após upload (quando há arquivo) confirmado; backend valida a regra.
              await apiFetch("/leads/" + id + "/stage", {
                method: "PATCH",
                body: JSON.stringify({ stageId: pendingStage.id, evidenceDocumentId, motivo: payload.motivo }),
              });
              const updatedLead = await loadLead();
              const actualGroup = updatedLead?.stageGroup ?? null;
              if (actualGroup && actualGroup !== effectiveGroup) {
                router.replace(`/leads/${id}?group=${actualGroup}`);
              }
              await loadStatusEvidences(id);
              setEvidenceModalOpen(false);
              setPendingStage(null);
            }

            return (
              <>
                {(lead as any)?.passouBaseFria && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                      ❄️ Reativado da Base Fria — atendimento manual (IA desligada)
                    </span>
                  </div>
                )}
                <PipelineStepper
                  stages={pipelineStages}
                  currentStageId={currentStageId}
                  currentGroup={effectiveGroup}
                  allowedStageIds={allowedStages.map((s) => s.id)}
                  prevGroupActualStageId={prevGroupLastStageId}
                  previousStageName={(lead as any)?.stageKey === "BASE_FRIA" ? (lead as any)?.previousStageName : null}
                  disabled={movingStage || user?.role === "PARTNER"}
                  onSelectStage={handleSelectStage}
                />
                {baseFriaModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <div className="w-full max-w-md rounded-xl border p-5 shadow-xl" style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}>
                      <h2 className="text-lg font-semibold text-[var(--shell-text)]">Mover para Base Fria</h2>
                      <p className="mt-1 text-sm text-[var(--shell-subtext)]">
                        Opcional: agende um retorno e/ou programe uma mensagem de reaquecimento. Pode confirmar sem preencher nada.
                      </p>

                      <label className="mt-4 block text-sm font-medium text-[var(--shell-text)]">📅 Agendar retorno</label>
                      <input
                        type="datetime-local"
                        value={bfAgendaData}
                        onChange={(e) => setBfAgendaData(e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                      />

                      <label className="mt-4 block text-sm font-medium text-[var(--shell-text)]">💬 Mensagem programada (WhatsApp Light)</label>
                      <input
                        type="datetime-local"
                        value={bfMsgData}
                        onChange={(e) => setBfMsgData(e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                      />
                      <textarea
                        value={bfMsgTexto}
                        onChange={(e) => setBfMsgTexto(e.target.value)}
                        placeholder="Texto da mensagem (use {{nome}} se quiser)"
                        rows={3}
                        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                      />
                      <select
                        value={bfMsgSessionId}
                        onChange={(e) => setBfMsgSessionId(e.target.value)}
                        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)", color: "var(--shell-text)" }}
                      >
                        <option value="">Sessão de WhatsApp (para a mensagem programada)…</option>
                        {bfSessions.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.phoneNumber ? ` · ${s.phoneNumber}` : ""}</option>)}
                      </select>
                      <label className="mt-2 flex items-center gap-2 text-sm text-[var(--shell-subtext)]">
                        <input type="checkbox" checked={bfSalvarTemplate} onChange={(e) => setBfSalvarTemplate(e.target.checked)} />
                        Salvar a mensagem como modelo reutilizável
                      </label>
                      {bfMsgData && (!bfMsgTexto.trim() || !bfMsgSessionId) && (
                        <p className="mt-1 text-xs text-amber-600">Para programar a mensagem, preencha texto e sessão.</p>
                      )}

                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          onClick={() => setBaseFriaModal(null)}
                          disabled={bfSaving}
                          className="rounded-lg border px-4 py-1.5 text-sm font-medium hover:bg-[var(--shell-hover)]"
                          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleBaseFriaConfirm}
                          disabled={bfSaving}
                          className="rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          style={{ background: "var(--brand-accent)" }}
                        >
                          {bfSaving ? "Movendo…" : "Mover para Base Fria"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <EvidenceUploadModal
                  isOpen={evidenceModalOpen}
                  stageName={pendingStage?.name ?? ""}
                  isOwner={user?.role === "OWNER"}
                  needsDocument={Boolean(pendingStage?.requiresEvidence) || currentStageRequiresEvidence}
                  needsReason={Boolean(pendingStage?.requiresReason) || currentStageRequiresReason}
                  onClose={() => { setEvidenceModalOpen(false); setPendingStage(null); }}
                  onConfirm={handleEvidenceConfirm}
                />
                <PendenciasModal
                  isOpen={pendenciasModalOpen}
                  stageName={pendingStage?.name ?? ""}
                  pessoas={pendenciaPessoas}
                  onClose={() => { setPendenciasModalOpen(false); setPendingStage(null); }}
                  onConfirm={handlePendenciasConfirm}
                />
                {unitConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Unidade vinculada</h2>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{unitConfirm.message}</p>
                      <div className="mt-5 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setUnitConfirm(null)}
                          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => { const s = unitConfirm.stage; setUnitConfirm(null); proceedSelectStage(s); }}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Confirmar e avançar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {vendaModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registrar venda</h2>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Confirme os dados da venda deste imóvel. O valor é opcional — se ficar em branco, usamos o preço do imóvel.
                      </p>
                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Valor da venda (R$)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={vendaValor}
                            onChange={(e) => setVendaValor(e.target.value)}
                            placeholder="Ex.: 450.000,00"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Data da venda</span>
                          <input
                            type="date"
                            value={vendaData}
                            onChange={(e) => setVendaData(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100"
                          />
                        </label>
                      </div>
                      <div className="mt-5 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setVendaModal(null)}
                          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const s = vendaModal.stage;
                            const valor = vendaValor.trim();
                            const data = vendaData;
                            setVendaModal(null);
                            moveToStage(s.id, {
                              ...(valor ? { valorVenda: valor } : {}),
                              ...(data ? { dataVenda: data } : {}),
                            });
                          }}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Confirmar venda
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
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
                <button
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                  onClick={() => setLeadInfoOpen((o) => !o)}
                >
                  <span className="shrink-0">Lead</span>
                  {formatLeadNumber(lead?.numero, lead?.reentradaCount ?? 1) && (
                    <span className="text-[var(--shell-subtext)] font-mono text-sm font-normal shrink-0">
                      - {formatLeadNumber(lead?.numero, lead?.reentradaCount ?? 1)}
                    </span>
                  )}
                  {!leadInfoOpen && lead && (
                    <span className="text-[var(--shell-text)] font-normal truncate ml-1">
                      {lead.nomeCorreto || lead.nome || ""}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[var(--shell-subtext)]">{leadInfoOpen ? "▲" : "▼"}</span>
                </button>
                {leadInfoOpen && (
                  <label className="text-xs text-[var(--shell-subtext)] flex items-center gap-2 select-none shrink-0">
                    <input type="checkbox" checked={debugOn} onChange={(e) => setDebugOn(e.target.checked)} />
                    Debug
                  </label>
                )}
              </div>

              {leadInfoOpen && loadingLead ? (
                <div className="mt-3 text-sm text-[var(--shell-subtext)]">Carregando...</div>
              ) : leadInfoOpen && lead ? (
                <div className="mt-3 space-y-2 text-sm">
                  {/* Par 1: Nome da fonte + Nome confirmado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--shell-subtext)]">Nome da fonte</div>
                      <div className="font-medium text-[var(--shell-text)] truncate" title={lead.nome ?? undefined}>{lead.nome || "—"}</div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs text-[var(--shell-subtext)] mb-1">Nome confirmado</div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--shell-text)] truncate" title={lead.nomeCorreto ?? undefined}>
                          {lead.nomeCorreto || "não confirmado"}
                        </span>
                        {lead.nomeCorretoOrigem === "IA" && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700">IA</span>
                        )}
                        {lead.nomeCorretoOrigem === "MANUAL" && (
                          <span className="inline-flex items-center rounded-full bg-[var(--shell-hover)] border border-[var(--shell-card-border)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)]">Manual</span>
                        )}
                        <button
                          className="ml-auto text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)] shrink-0"
                          title="Editar nome confirmado"
                          onClick={() => { setNomeConfirmadoEdit(lead.nomeCorreto ?? ""); setNomeModalOpen(true); }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Par 2: Telefone + CPF — TEMP-EDIT-TEL-CPF (edição inline temporária; remover depois, voltar a somente-leitura) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--shell-subtext)]">Telefone</div>
                      {contactEditField === 'telefone' ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            autoFocus
                            inputMode="numeric"
                            className="flex-1 min-w-0 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)]"
                            value={contactEditValue}
                            onChange={(e) => setContactEditValue(maskPhone(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveContactField(); if (e.key === 'Escape') { setContactEditField(null); setContactFieldErr(null); } }}
                            disabled={savingContactField}
                          />
                          <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={saveContactField} disabled={savingContactField}>✓</button>
                          <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => { setContactEditField(null); setContactFieldErr(null); }} disabled={savingContactField}>✕</button>
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1 cursor-pointer" onClick={() => startContactEdit('telefone')}>
                          <span className="text-[var(--shell-text)] truncate"><MaskedField field="lead.telefone">{lead.telefone ? maskPhone(lead.telefone) : "—"}</MaskedField></span>
                          <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)] shrink-0">✏️</span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs text-[var(--shell-subtext)]">CPF</div>
                      {contactEditField === 'cpf' ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            autoFocus
                            inputMode="numeric"
                            className="flex-1 min-w-0 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)] font-mono"
                            value={contactEditValue}
                            onChange={(e) => setContactEditValue(maskCPF(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveContactField(); if (e.key === 'Escape') { setContactEditField(null); setContactFieldErr(null); } }}
                            disabled={savingContactField}
                          />
                          <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={saveContactField} disabled={savingContactField}>✓</button>
                          <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => { setContactEditField(null); setContactFieldErr(null); }} disabled={savingContactField}>✕</button>
                        </div>
                      ) : (
                        <div className="group flex items-center gap-1 cursor-pointer" onClick={() => startContactEdit('cpf')}>
                          <span className="text-sm text-[var(--shell-text)] truncate font-mono">
                            <MaskedField field="lead.cpf">
                              {lead.cpf
                                ? lead.cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') || lead.cpf
                                : "—"}
                            </MaskedField>
                          </span>
                          <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)] shrink-0">✏️</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {contactFieldErr ? (
                    <div className="text-[11px] text-red-600">{contactFieldErr}</div>
                  ) : null}

                  {/* Status */}
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--shell-subtext)]">Status</div>
                    <div className="text-[var(--shell-text)]">{lead.status || "NOVO"}</div>
                  </div>

                  {/* Par 3: Origem + Indicação */}
                  {(lead.origem || (lead.cadastroOrigem as any)?.indicacao) && (() => {
                    const indKey = 'indicacao' as const;
                    const indVal = (lead.cadastroOrigem as any)?.[indKey] as string | null | undefined;
                    const isEditingInd = origemEditField === indKey;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {lead.origem && (
                          <div className="min-w-0">
                            <div className="text-xs text-[var(--shell-subtext)]">Origem</div>
                            <div className="text-[var(--shell-text)] truncate">{lead.origem}</div>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--shell-subtext)]">Indicação</div>
                          {isEditingInd ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                autoFocus
                                className="flex-1 min-w-0 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)]"
                                value={origemEditValue}
                                onChange={(e) => setOrigemEditValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveOrigemField(indKey, origemEditValue); if (e.key === 'Escape') setOrigemEditField(null); }}
                                disabled={savingOrigemField}
                              />
                              <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveOrigemField(indKey, origemEditValue)} disabled={savingOrigemField}>✓</button>
                              <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => setOrigemEditField(null)} disabled={savingOrigemField}>✕</button>
                            </div>
                          ) : (
                            <div className="group flex items-center gap-1 cursor-pointer" onClick={() => { setOrigemEditField(indKey); setOrigemEditValue(indVal ?? ''); }}>
                              <span className="text-sm text-[var(--shell-text)] truncate">{indVal || <span className="italic text-[var(--shell-subtext)]">—</span>}</span>
                              <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)] shrink-0">✏️</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Par 4: Grupo + Faixa de Renda */}
                  {(lead.cadastroOrigem as any)?.grupoMcmv || (lead.cadastroOrigem as any)?.faixaRenda ? (() => {
                    const grupoKey = 'grupoMcmv' as const;
                    const faixaKey = 'faixaRenda' as const;
                    const grupoVal = (lead.cadastroOrigem as any)?.[grupoKey] as string | null | undefined;
                    const faixaVal = (lead.cadastroOrigem as any)?.[faixaKey] as string | null | undefined;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--shell-subtext)]">Grupo</div>
                          {origemEditField === grupoKey ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input autoFocus className="flex-1 min-w-0 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)]" value={origemEditValue} onChange={(e) => setOrigemEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveOrigemField(grupoKey, origemEditValue); if (e.key === 'Escape') setOrigemEditField(null); }} disabled={savingOrigemField} />
                              <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveOrigemField(grupoKey, origemEditValue)} disabled={savingOrigemField}>✓</button>
                              <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => setOrigemEditField(null)} disabled={savingOrigemField}>✕</button>
                            </div>
                          ) : (
                            <div className="group flex items-center gap-1 cursor-pointer" onClick={() => { setOrigemEditField(grupoKey); setOrigemEditValue(grupoVal ?? ''); }}>
                              <span className="text-sm text-[var(--shell-text)] truncate">{grupoVal || <span className="italic text-[var(--shell-subtext)]">—</span>}</span>
                              <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)] shrink-0">✏️</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--shell-subtext)]">Faixa de Renda (SM)</div>
                          {origemEditField === faixaKey ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input autoFocus className="flex-1 min-w-0 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)]" value={origemEditValue} onChange={(e) => setOrigemEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveOrigemField(faixaKey, origemEditValue); if (e.key === 'Escape') setOrigemEditField(null); }} disabled={savingOrigemField} />
                              <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveOrigemField(faixaKey, origemEditValue)} disabled={savingOrigemField}>✓</button>
                              <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => setOrigemEditField(null)} disabled={savingOrigemField}>✕</button>
                            </div>
                          ) : (
                            <div className="group flex items-center gap-1 cursor-pointer" onClick={() => { setOrigemEditField(faixaKey); setOrigemEditValue(faixaVal ?? ''); }}>
                              <span className="text-sm text-[var(--shell-text)] truncate">{faixaVal || <span className="italic text-[var(--shell-subtext)]">—</span>}</span>
                              <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)] shrink-0">✏️</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })() : null}

                  {/* Ocorrência — linha inteira */}
                  {(lead.cadastroOrigem as any)?.codigoOcorrencia || origemEditField === 'codigoOcorrencia' ? (() => {
                    const ocKey = 'codigoOcorrencia' as const;
                    const ocVal = (lead.cadastroOrigem as any)?.[ocKey] as string | null | undefined;
                    return (
                      <div>
                        <div className="text-xs text-[var(--shell-subtext)]">Ocorrência</div>
                        {origemEditField === ocKey ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input autoFocus className="flex-1 rounded border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-2 py-1 text-sm text-[var(--shell-text)]" value={origemEditValue} onChange={(e) => setOrigemEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveOrigemField(ocKey, origemEditValue); if (e.key === 'Escape') setOrigemEditField(null); }} disabled={savingOrigemField} />
                            <button className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveOrigemField(ocKey, origemEditValue)} disabled={savingOrigemField}>✓</button>
                            <button className="rounded border px-2 py-1 text-xs text-[var(--shell-subtext)]" onClick={() => setOrigemEditField(null)} disabled={savingOrigemField}>✕</button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-1 cursor-pointer" onClick={() => { setOrigemEditField(ocKey); setOrigemEditValue(ocVal ?? ''); }}>
                            <span className="text-sm text-[var(--shell-text)]">{ocVal}</span>
                            <span className="hidden group-hover:inline text-[10px] text-[var(--shell-subtext)]">✏️</span>
                          </div>
                        )}
                      </div>
                    );
                  })() : null}

                  {/* Responsável — select para OWNER/MANAGER */}
                  <div>
                    <div className="text-xs text-[var(--shell-subtext)] mb-1">Responsável</div>
                    {user?.role === "OWNER" || user?.role === "MANAGER" ? (
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
                        {teamMembers.filter((m) => m.role !== "PARTNER").map((m) => (
                          <option key={m.id} value={m.id}>{m.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-[var(--shell-text)]">
                        <MaskedField field="lead.responsavel">
                          {teamMembers.find((m) => m.id === lead.assignedUserId)?.nome ?? "—"}
                        </MaskedField>
                      </div>
                    )}
                  </div>

                </div>
              ) : leadInfoOpen ? (
                <div className="mt-3 text-sm text-[var(--shell-subtext)]">Não carregou.</div>
              ) : null}

              {leadInfoOpen && (
                <button
                  className="mt-4 w-full rounded-md border bg-[var(--shell-card-bg)] px-3 py-2 text-sm hover:bg-[var(--shell-bg)]"
                  onClick={loadAll}
                  disabled={loadingLead || loadingEvents}
                >
                  Atualizar
                </button>
              )}

              {leadInfoOpen && user?.role === "OWNER" && lead && (
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

              {leadInfoOpen && err ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
              ) : null}

              {leadInfoOpen && debugOn ? (
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
                      <div className="font-mono break-all">{lastFetchAt || "—"}</div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-[11px] text-[var(--shell-subtext)]">events shape</div>
                      <div className="font-mono break-all">{lastEventsShape || "—"}</div>
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
              // Externo Consultivo: campo oculto (valor já nulo no backend) deve aparecer borrado,
              // não colapsar. `restrictedFields` é a fonte de verdade enviada pelo backend.
              const isHidden = (k: string) => lead.restrictedFields?.includes(k) ?? false;
              const hasAnyQual = !!(
                lead.rendaBrutaFamiliar != null || lead.fgts != null ||
                lead.valorEntrada != null || lead.estadoCivil || lead.dataNascimento ||
                lead.tempoProcurandoImovel || lead.conversouComCorretor != null ||
                lead.qualCorretorImobiliaria || lead.perfilImovel || lead.resumoLead ||
                lead.empreendimentoInteresse || lead.produtoInteresse ||
                isHidden('lead.financeiro') || isHidden('lead.estadoCivil') || isHidden('lead.resumo')
              );

              const qualCount = [
                lead.rendaBrutaFamiliar != null,
                lead.fgts != null,
                lead.valorEntrada != null,
                !!lead.estadoCivil,
                !!lead.dataNascimento,
                !!lead.tempoProcurandoImovel,
                lead.conversouComCorretor != null,
                !!lead.qualCorretorImobiliaria,
                !!lead.perfilImovel,
                !!lead.resumoLead,
                !!(lead.empreendimentoInteresse || lead.produtoInteresse),
              ].filter(Boolean).length;

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
                          {qualCount > 0 ? `${qualCount} ${qualCount === 1 ? "info" : "infos"}` : "Coletado"}
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

                      {(fmtCurrency(lead.rendaBrutaFamiliar) || isHidden('lead.financeiro')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Renda bruta familiar</div>
                          <div className="text-[var(--shell-text)]">
                            <MaskedField field="lead.financeiro">{fmtCurrency(lead.rendaBrutaFamiliar)}</MaskedField>
                          </div>
                        </div>
                      )}

                      {(fmtCurrency(lead.fgts) || isHidden('lead.financeiro')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">FGTS</div>
                          <div className="text-[var(--shell-text)]">
                            <MaskedField field="lead.financeiro">{fmtCurrency(lead.fgts)}</MaskedField>
                          </div>
                        </div>
                      )}

                      {(fmtCurrency(lead.valorEntrada) || isHidden('lead.financeiro')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Valor de entrada</div>
                          <div className="text-[var(--shell-text)]">
                            <MaskedField field="lead.financeiro">{fmtCurrency(lead.valorEntrada)}</MaskedField>
                          </div>
                        </div>
                      )}

                      {(lead.estadoCivil || isHidden('lead.estadoCivil')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Estado civil</div>
                          <div className="text-[var(--shell-text)]">
                            <MaskedField field="lead.estadoCivil">{lead.estadoCivil ? (estadoCivilLabels[lead.estadoCivil] ?? lead.estadoCivil) : null}</MaskedField>
                          </div>
                        </div>
                      )}

                      {(fmtDate(lead.dataNascimento) || isHidden('lead.estadoCivil')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Data de nascimento</div>
                          <div className="text-[var(--shell-text)]">
                            <MaskedField field="lead.estadoCivil">{fmtDate(lead.dataNascimento)}</MaskedField>
                          </div>
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

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-[var(--shell-subtext)]">Interesse{lead.interesseOrigem === "MANUAL" && <span className="ml-1 text-amber-600" title="Editado manualmente">✎ editado</span>}</div>
                          {user?.role !== "PARTNER" && (
                            <button type="button" onClick={() => setInteresseModalOpen(true)} className="text-xs font-medium hover:underline" style={{ color: "var(--brand-accent)" }}>
                              {(lead.empreendimentoInteresse || lead.produtoInteresse) ? "Alterar" : "Definir"}
                            </button>
                          )}
                        </div>
                        {lead.empreendimentoInteresse ? (
                          <div className="mt-0.5 flex items-center gap-2">
                            {lead.empreendimentoInteresse.capaUrl && (
                              <img src={lead.empreendimentoInteresse.capaUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                            )}
                            <span className="text-[var(--shell-text)] text-sm font-medium">{lead.empreendimentoInteresse.nome}</span>
                            <span className="rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)]">Empreendimento</span>
                          </div>
                        ) : lead.produtoInteresse ? (
                          <div className="mt-0.5 flex items-center gap-2">
                            {lead.produtoInteresse.coverUrl && (
                              <img src={lead.produtoInteresse.coverUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                            )}
                            <span className="text-[var(--shell-text)] text-sm font-medium">{lead.produtoInteresse.title}</span>
                            <span className="rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] text-[var(--shell-subtext)]">Imóvel</span>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-sm text-[var(--shell-subtext)]">—</div>
                        )}
                      </div>

                      {(lead.resumoLead || isHidden('lead.resumo')) && (
                        <div>
                          <div className="text-xs text-[var(--shell-subtext)]">Resumo</div>
                          <div className="rounded-md border bg-[var(--shell-bg)] p-2 text-xs text-[var(--shell-text)] leading-relaxed whitespace-pre-wrap">
                            <MaskedField field="lead.resumo">{lead.resumoLead}</MaskedField>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Produtos Disponíveis */}
            <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
              <button
                type="button"
                onClick={() => setProdOpen(v => !v)}
                className="flex w-full items-center justify-between gap-2"
              >
                <div className="text-sm font-semibold text-[var(--shell-text)]">Produtos Disponíveis</div>
                <div className="flex items-center gap-2">
                  {(lead?.developmentUnits ?? []).length > 0 && !prodOpen && (
                    <span className="rounded-full bg-[var(--brand-accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {(lead?.developmentUnits ?? []).length}
                    </span>
                  )}
                  <svg
                    className={`h-4 w-4 text-[var(--shell-subtext)] transition-transform ${prodOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  ><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </div>
              </button>

              {/* Vinculado a este lead — sempre visível no topo */}
              {(lead?.developmentUnits ?? []).length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Vinculado a este lead</div>
                  {(lead?.developmentUnits ?? []).map(u => {
                    const statusMap: Record<string, { border: string; bg: string; badge: string; label: string }> = {
                      PROPOSTA:  { border: "border-orange-200", bg: "bg-orange-50",  badge: "bg-orange-500",  label: "Proposta" },
                      RESERVADO: { border: "border-amber-200",  bg: "bg-amber-50",   badge: "bg-amber-400",   label: "Reservado" },
                      VENDIDO:   { border: "border-red-200",    bg: "bg-red-50",     badge: "bg-red-500",     label: "Vendido" },
                      BLOQUEADO: { border: "border-gray-200",   bg: "bg-gray-50",    badge: "bg-gray-400",    label: "Bloqueado" },
                      DISPONIVEL:{ border: "border-green-200",  bg: "bg-green-50",   badge: "bg-green-500",   label: "Disponível" },
                    };
                    const s = statusMap[u.status] ?? statusMap.DISPONIVEL;
                    const isDesvinculando = desvinculandoUnitId === u.id;
                    const isTrocando = trocandoUnit === u.id;
                    return (
                      <div key={u.id} className={`rounded-lg border ${s.border} ${s.bg} px-3 py-2 text-xs`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0">
                            <span className={`shrink-0 inline-block rounded-full ${s.badge} px-2 py-0.5 text-[10px] font-bold text-white`}>{s.label}</span>
                            <MaskedField field="unit.identificacao">
                              <span className="font-semibold text-[var(--shell-text)]">{u.development?.nome}</span>
                              {u.tower?.nome && <span className="text-[var(--shell-subtext)]">{"\u00b7 " + u.tower.nome}</span>}
                              <span className="text-[var(--shell-subtext)]">{"\u2014 " + u.nome}</span>
                            </MaskedField>
                            {u.finalPrice && (
                              <MaskedField field="unit.valores"><span className="font-medium text-[var(--shell-text)]">{"· R$ " + u.finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></MaskedField>
                            )}
                          </div>
                        </div>
                        {prodOpen && (<>
                          {user?.role !== "PARTNER" && (
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const devId = u.developmentId;
                                if (!devId) return;
                                const unitLabel = [u.development?.nome, u.tower?.nome, u.nome].filter(Boolean).join(" · ");
                                setEspelhoModal({ devId, trocandoUnitId: u.id, trocandoUnitNome: unitLabel });
                              }}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium border hover:bg-[var(--shell-hover)] transition-colors"
                              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                            >
                              Trocar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDesvinculandoUnitId(isDesvinculando ? null : u.id)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Desvincular
                            </button>
                          </div>
                          )}
                        {u.propostaPagamento && <div className="mt-1 text-[var(--shell-subtext)]">{"Pagamento: " + u.propostaPagamento.replace(/_/g, " ")}</div>}
                        {u.propostaObs && <div className="text-[var(--shell-subtext)]">{"Obs: " + u.propostaObs}</div>}
                        {u.soldAt && <div className="text-[var(--shell-subtext)]">{"Vendido em: " + new Date(u.soldAt).toLocaleDateString("pt-BR")}</div>}
                        {(u.reservaHistory ?? []).length > 0 && (
                          <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--shell-card-border)" }}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)] mb-1">Histórico</div>
                            {(u.reservaHistory ?? []).map(h => (
                              <div key={h.id} className="text-[10px] text-[var(--shell-subtext)] flex flex-wrap gap-x-2">
                                <span><MaskedField field="lead.historicoDatas">{new Date(h.createdAt).toLocaleDateString("pt-BR")}</MaskedField></span>
                                <span className="font-medium">{h.statusAnterior}</span>
                                {h.leadNome && <span>{"\u2192 " + h.leadNome}</span>}
                                {h.finalPrice && <span>{"R$ " + h.finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</span>}
                                {h.desvinculadoPor && <span>{"por " + h.desvinculadoPor}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          {u.development?.id && (
                            <button
                              type="button"
                              onClick={() => { setEspelhoModal({ devId: u.development!.id }); }}
                              className="rounded-md border px-2 py-1 text-[10px] font-medium hover:bg-[var(--shell-hover)] transition-colors"
                              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                            >
                              Ver no espelho →
                            </button>
                          )}
                        </div>
                        </>)}
                        {isDesvinculando && (
                          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 flex items-center gap-2">
                            <span className="text-[10px] text-red-700 flex-1">Desvincular unidade? O status volta para Disponível e o histórico é preservado no espelho.</span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await unlinkUnit(u.developmentId!, u.id);
                                  setLead((prev: any) => prev ? {
                                    ...prev,
                                    developmentUnits: (prev.developmentUnits ?? []).filter((x: any) => x.id !== u.id),
                                  } : prev);
                                } catch {
                                  alert("Erro ao desvincular unidade");
                                } finally {
                                  setDesvinculandoUnitId(null);
                                }
                              }}
                              className="rounded px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDesvinculandoUnitId(null)}
                              className="rounded px-2 py-0.5 text-[10px] text-[var(--shell-subtext)] hover:opacity-80"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
              {prodOpen && (
              <div className="mt-3 flex gap-1 rounded-lg border p-1" style={{ background: "var(--shell-bg)" }}>
                {(["catalogo", "empreendimentos"] as const).map((t) => (
                  <button key={t} type="button"
                    onClick={() => setProdTab(t)}
                    className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      background: prodTab === t ? "var(--brand-accent-muted)" : "transparent",
                      color: prodTab === t ? "var(--brand-accent)" : "var(--shell-subtext)",
                      fontWeight: prodTab === t ? 600 : 400,
                    }}>
                    {t === "catalogo" ? "Catálogo de Produtos" : "Gestão de Empreendimento"}
                  </button>
                ))}
              </div>
              )}

              {prodOpen && <>
              {prodTab === "catalogo" && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded-md border bg-[var(--shell-card-bg)] px-3 py-1.5 text-xs hover:bg-[var(--shell-bg)]"
                    onClick={() => loadProducts()}
                    disabled={productsLoading}
                  >
                    {productsLoading ? "Carregando..." : "Recarregar"}
                  </button>
                </div>
              )}
              {/* Aba Catálogo */}
              {prodTab === "catalogo" && (
                <div>
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
                            {meta ? " - " + meta : ""}
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
                        <div className="text-xs text-[var(--shell-subtext)]">—</div>
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
              )}

              {/* Aba Gestão de Empreendimento */}
              {prodTab === "empreendimentos" && (
                <div className="mt-3 space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Selecionar empreendimento</div>
                  <select
                    className="w-full rounded-md border bg-[var(--shell-card-bg)] p-2 text-sm"
                    value={selectedDevId}
                    onChange={(e) => setSelectedDevId(e.target.value)}
                  >
                    <option value="">(Selecione um empreendimento)</option>
                    {developments.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                  {selectedDevId && (
                    <div className="flex gap-2">
                      {(() => {
                        // Reserva na Documentação (RESERVA) e proposta na Escolha (PROPOSTA); OWNER sempre.
                        const canReserva = currentStageUnitAction === "RESERVA";
                        const canProposta = currentStageUnitAction === "PROPOSTA" || lead?.stageGroup === "ESCOLHA_UNIDADE";
                        // Externo Consultivo é só consulta — nunca vincula/reserva unidade.
                        const canOpenEspelho = (canReserva || canProposta || user?.role === "OWNER") && user?.role !== "PARTNER";
                        const label = canReserva && !canProposta ? "🏗️ Abrir Espelho (Reservar)" : "🏗️ Abrir Espelho";
                        return (
                          <button
                            type="button"
                            disabled={!canOpenEspelho}
                            onClick={() => setEspelhoModal({ devId: selectedDevId })}
                            title={canOpenEspelho ? undefined : "Disponível nas etapas Documentação (reserva) e Escolha da Unidade (proposta)"}
                            className="flex-1 rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: "var(--brand-accent)" }}
                          >
                            {label}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => {
                          const dev = developments.find(d => d.id === selectedDevId);
                          const devNome = dev?.nome ?? "Empreendimento";
                          // Só pede confirmação se for um empreendimento diferente do já salvo
                          if (lead?.empreendimentoInteresseId === selectedDevId) {
                            setDevMediaModal({ devId: selectedDevId, devNome });
                          } else {
                            setDevInteresseConfirm({ devId: selectedDevId, devNome, action: "midia" });
                          }
                        }}
                        className="flex-1 rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors"
                        style={{ background: "#6366f1" }}
                      >
                        🖼️ Ver Mídia
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>}
            </div>

            {/* Documentos */}
            {lead && (
              <a
                href={`/leads/${lead.id}/documentos`}
                className="mt-4 flex w-full items-center justify-between rounded-xl border bg-[var(--shell-card-bg)] px-4 py-3 text-sm font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-bg)]"
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--shell-subtext)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Cadastro e Documentos
                  {documents.length > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {documents.length} {documents.length === 1 ? "arquivo" : "arquivos"}
                    </span>
                  )}
                </span>
                <svg className="h-4 w-4 text-[var(--shell-subtext)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </a>
            )}

            {/* Evidências de Status — só aparece quando há evidência/justificativa registrada */}
            {statusEvidences.length > 0 && (
              <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEvidencesOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 border-b border-[var(--shell-card-border)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📎</span>
                    <span className="text-sm font-semibold text-[var(--shell-text)]">Evidências de Status</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{statusEvidences.length}</span>
                  </div>
                  <span className="text-[var(--shell-subtext)]">{evidencesOpen ? "▲" : "▼"}</span>
                </button>

                {evidencesOpen && (
                  <ul className="divide-y divide-[var(--shell-card-border)]">
                    {statusEvidences.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--shell-text)]">
                            {ev.fromStage ? `${ev.fromStage} → ` : ""}{ev.toStage}
                          </div>
                          {ev.motivo && (
                            <div className="mt-0.5 text-[var(--shell-subtext)]">{ev.motivo}</div>
                          )}
                          <div className="mt-0.5 text-xs text-[var(--shell-subtext)]">
                            {ev.changedByName ? `${ev.changedByName} · ` : ""}
                            {new Date(ev.createdAt).toLocaleString("pt-BR")}
                          </div>
                        </div>
                        {ev.document && (
                          <button
                            type="button"
                            onClick={() => openStatusEvidenceDoc(ev.document!.id, ev.document!.filename || ev.document!.nome)}
                            className="shrink-0 rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--shell-text)] hover:bg-[var(--shell-bg)]"
                          >
                            Ver evidência
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Análise de Crédito */}
            {lead && (
              <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden">
                <div className={`flex items-center justify-between px-4 py-3 ${creditOpen ? "border-b border-[var(--shell-card-border)]" : ""}`}>
                  <button type="button" onClick={() => setCreditOpen((o) => !o)}
                    className="flex items-center gap-2 text-left">
                    <span className="text-sm">💳</span>
                    <span className="text-sm font-semibold text-[var(--shell-text)]">Análise de Crédito</span>
                    {creditRequests.length > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{creditRequests.length}</span>
                    )}
                    <span className="text-[var(--shell-subtext)] text-xs">{creditOpen ? "▲" : "▼"}</span>
                  </button>
                  <button onClick={() => { setCreditOpen(true); setShowCreditForm((p) => !p); }}
                    className="ml-2 shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors">
                    + Enviar para Correspondente
                  </button>
                </div>

                {creditOpen && (<>
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
                </>)}
              </div>
            )}

            {/* Pendências: aparece na etapa Docs Pendente (requiresNow) e permanece
                como histórico enquanto o lead tiver pendências registradas. */}
            {user?.role !== "PARTNER" && id && (
              <PendenciasPanel
                leadId={id}
                pessoas={pendenciaPessoas}
                canEdit={true}
                requiresNow={currentStageRequiresPendencias}
                reloadKey={pendenciasReloadKey}
              />
            )}

            {/* Agenda */}
            <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4" style={{ borderColor: "var(--shell-card-border)" }}>
              <button
                type="button"
                onClick={() => setAgendaOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2"
              >
                <span className="text-sm font-semibold text-[var(--shell-text)]">Agenda</span>
                <div className="flex items-center gap-2">
                  {agendaEvents.length > 0 && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      {agendaEvents.length}
                    </span>
                  )}
                  <svg
                    className={`h-4 w-4 text-[var(--shell-subtext)] transition-transform ${agendaOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {agendaOpen && (
                <div className="mt-3 space-y-2">
                  {agendaEvents.length === 0 ? (
                    <p className="text-xs text-[var(--shell-subtext)]">Nenhum evento agendado.</p>
                  ) : (
                    agendaEvents.slice(0, 5).map((ev) => {
                      const editable = canEditAgendaEvent(ev);
                      return (
                        <div
                          key={ev.id}
                          className={`rounded-lg border p-2.5 text-xs space-y-0.5 ${editable ? "cursor-pointer hover:bg-[var(--shell-hover)] transition" : ""}`}
                          style={{ borderColor: "var(--shell-card-border)" }}
                          onClick={() => editable && openAgendaEdit(ev)}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${AGENDA_TYPE_COLOR[ev.eventType] ?? "bg-gray-100 text-gray-600"}`}>
                              {AGENDA_TYPE_LABEL[ev.eventType] ?? ev.eventType}
                            </span>
                            {ev.visibility === "PRIVATE" && (
                              <span className="text-[10px] text-[var(--shell-subtext)]">🔒</span>
                            )}
                            <span className="font-medium text-[var(--shell-text)] truncate flex-1">{ev.title}</span>
                            <span className="text-[10px] font-medium text-[var(--shell-subtext)] shrink-0">
                              👤 {ev.user?.apelido || (ev.user?.nome?.trim().split(" ")[0]) || "—"}
                            </span>
                            {editable && (
                              <span className="text-[10px] text-blue-500 shrink-0">✏️</span>
                            )}
                          </div>
                          <div className="text-[var(--shell-subtext)]">
                            {new Date(ev.startAt).toLocaleString("pt-BR", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </div>
                          <div className="text-[var(--shell-subtext)]">
                            {AGENDA_STATUS_LABEL[ev.status] ?? ev.status}
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={`/calendar?leadId=${id}&leadName=${encodeURIComponent(lead?.nomeCorreto ?? lead?.nome ?? "")}`}
                      className="flex-1 rounded-md border py-1.5 text-center text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition"
                      style={{ borderColor: "var(--shell-card-border)" }}
                    >
                      + Novo evento
                    </a>
                    {agendaEvents.length > 5 && (
                      <a
                        href={`/calendar?leadId=${id}&leadName=${encodeURIComponent(lead?.nomeCorreto ?? lead?.nome ?? "")}`}
                        className="text-xs text-[var(--shell-subtext)] underline hover:text-[var(--shell-text)]"
                      >
                        Ver tudo
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Painel SLA */}
            {slaData && (
              <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4">
                <button
                  type="button"
                  onClick={() => setSlaOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--shell-text)]">SLA</span>
                    <span
                      title={slaData.slaEnabled && slaData.slaInScope ? "SLA ativo neste canal" : "SLA inativo para este lead"}
                      className={`inline-block h-2 w-2 rounded-full ${
                        slaData.slaEnabled && slaData.slaInScope ? "bg-emerald-500" : "bg-[var(--shell-card-border)]"
                      }`}
                    />
                    {slaLoading && <span className="text-xs text-[var(--shell-subtext)]">atualizando...</span>}
                  </div>
                  <svg
                    className={`h-4 w-4 text-[var(--shell-subtext)] transition-transform ${slaOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {slaOpen && (
                  <div className="mt-3">
                    {/* Etapa + canal + status do SLA */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--shell-hover)] text-[var(--shell-subtext)]">
                        {slaData.stageName ?? slaData.stageGroup ?? 'Sem etapa'}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        slaData.canal === 'light' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {slaData.canal === 'light' ? 'WhatsApp Light' : 'WhatsApp Oficial'}
                      </span>
                      {!slaData.slaEnabled ? (
                        <span className="text-xs text-[var(--shell-subtext)]">SLA desligado neste canal</span>
                      ) : !slaData.slaInScope ? (
                        <span className="text-xs text-[var(--shell-subtext)]">Fora das etapas configuradas</span>
                      ) : (
                        <span className="text-xs text-emerald-600">
                          SLA ativo · {slaData.slaMode === 'AUTOPILOT' ? 'IA tenta sozinha' : 'Sugere ao corretor'}
                        </span>
                      )}
                    </div>

                    {/* Janela 23h — só faz sentido no WhatsApp Oficial (Meta) */}
                    {slaData.canal === 'oficial' && slaData.lastInboundAt && (
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

                    {/* Próximas tentativas da cadência */}
                    {slaData.scheduledJobs?.length > 0 ? (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-[var(--shell-subtext)] mb-1">Próximas tentativas</div>
                        <div className="space-y-1">
                          {slaData.scheduledJobs.map((job: any) => (
                            <div key={job.jobId} className="flex items-center justify-between rounded border px-2 py-1 text-xs text-[var(--shell-subtext)] bg-[var(--shell-bg)] border-[var(--shell-card-border)]">
                              <span className="font-medium">{(job.attemptIndex ?? 0) + 1}ª tentativa</span>
                              <span>
                                {new Date(job.scheduledFor).toLocaleString('pt-BR', {
                                  day: '2-digit', month: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : slaData.slaEnabled && slaData.slaInScope ? (
                      <div className="text-xs text-[var(--shell-subtext)] mb-3">Nenhuma tentativa agendada (lead ativo ou já respondeu)</div>
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
              </div>
            )}

            {/* Campanhas do lead — entre o SLA e o Histórico */}
            {leadCampanhas.length > 0 && (
              <div className="rounded-xl border bg-[var(--shell-card-bg)] p-4" style={{ borderColor: "var(--shell-card-border)" }}>
                <div className="mb-2 flex items-center gap-2">
                  <span>📣</span>
                  <span className="text-sm font-semibold text-[var(--shell-text)]">Campanhas</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{leadCampanhas.length}</span>
                </div>
                <div className="space-y-2">
                  {leadCampanhas.map((c) => {
                    const statusColor: Record<string, string> = {
                      PENDENTE: "bg-slate-100 text-slate-600",
                      ENVIADO: "bg-blue-100 text-blue-700",
                      RESPONDEU: "bg-emerald-100 text-emerald-700",
                      FALHA: "bg-red-100 text-red-700",
                    };
                    const statusLabel: Record<string, string> = {
                      PENDENTE: "Pendente",
                      ENVIADO: "Enviado",
                      RESPONDEU: "Respondeu",
                      FALHA: "Falha",
                    };
                    const quando = c.respondeuEm || c.enviadoEm || c.criadoEm;
                    return (
                      <div key={c.id} className="rounded-lg border p-2.5" style={{ borderColor: "var(--shell-card-border)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--shell-text)]" title={c.nome}>
                            {c.mediaType === "VIDEO" ? "🎬 " : c.mediaType === "IMAGE" ? "🖼️ " : ""}{c.nome}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[c.status] ?? "bg-slate-100 text-slate-600"}`}>
                            {statusLabel[c.status] ?? c.status}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--shell-subtext)]">
                          {c.enviadoEm && <span>📤 {new Date(c.enviadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                          {c.respondeuEm && <span>💬 Respondeu {new Date(c.respondeuEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                          {!c.enviadoEm && !c.respondeuEm && quando && <span>{new Date(quando).toLocaleDateString("pt-BR")}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Histórico de Movimentações — botão que abre popup de consulta (abaixo do SLA) */}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex w-full items-center justify-between rounded-xl border bg-[var(--shell-card-bg)] px-4 py-3 text-sm font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-bg)]"
            >
              <span className="flex items-center gap-2">
                <span>🕑</span>
                Histórico de Movimentações
                {transitions.length > 0 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{transitions.length}</span>
                )}
              </span>
              <svg className="h-4 w-4 text-[var(--shell-subtext)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>

            {/* Modal de edição inline de evento da agenda */}
            {editingAgendaEvent && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                <div className="w-full max-w-sm rounded-xl shadow-xl bg-[var(--shell-card-bg)]">
                  <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
                    <div>
                      <h2 className="text-base font-semibold text-[var(--shell-text)]">Editar evento</h2>
                      <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{AGENDA_TYPE_LABEL[editingAgendaEvent.eventType] ?? editingAgendaEvent.eventType}</p>
                    </div>
                    <button type="button" onClick={() => setEditingAgendaEvent(null)} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl leading-none">×</button>
                  </div>

                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Título</label>
                      <input
                        value={agendaEditForm.title}
                        onChange={(e) => setAgendaEditForm((p) => ({ ...p, title: e.target.value }))}
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-slate-400"
                        style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Início</label>
                        <input
                          type="datetime-local"
                          value={agendaEditForm.startAt}
                          onChange={(e) => setAgendaEditForm((p) => ({ ...p, startAt: e.target.value }))}
                          className="w-full rounded-md border px-2 py-2 text-xs outline-none focus:border-slate-400"
                          style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Fim</label>
                        <input
                          type="datetime-local"
                          value={agendaEditForm.endAt}
                          onChange={(e) => setAgendaEditForm((p) => ({ ...p, endAt: e.target.value }))}
                          className="w-full rounded-md border px-2 py-2 text-xs outline-none focus:border-slate-400"
                          style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Status</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(["AGENDADO","CONFIRMADO","REALIZADO","NO_SHOW","CANCELADO"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAgendaEditForm((p) => ({ ...p, status: s }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                              agendaEditForm.status === s
                                ? "bg-slate-800 text-white"
                                : "bg-[var(--shell-hover)] text-[var(--shell-subtext)] hover:opacity-80"
                            }`}
                          >
                            {AGENDA_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--shell-subtext)]">Visibilidade</span>
                      <div className="flex rounded-lg border overflow-hidden text-xs" style={{ borderColor: "var(--shell-card-border)" }}>
                        <button type="button" onClick={() => setAgendaEditForm((p) => ({ ...p, visibility: "PUBLIC" }))}
                          className={`px-3 py-1.5 transition ${agendaEditForm.visibility === "PUBLIC" ? "bg-blue-600 text-white font-medium" : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                          🌐 Público
                        </button>
                        <button type="button" onClick={() => setAgendaEditForm((p) => ({ ...p, visibility: "PRIVATE" }))}
                          className={`px-3 py-1.5 transition ${agendaEditForm.visibility === "PRIVATE" ? "bg-slate-600 text-white font-medium" : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                          🔒 Privado
                        </button>
                      </div>
                    </div>

                    {agendaEditError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{agendaEditError}</div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--shell-card-border)" }}>
                    <button type="button" onClick={() => setEditingAgendaEvent(null)}
                      className="rounded-md border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                      style={{ borderColor: "var(--shell-card-border)" }}>
                      Cancelar
                    </button>
                    <button type="button" onClick={saveAgendaEdit} disabled={agendaEditSaving}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                      {agendaEditSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* CHAT */}
          <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden lg:col-span-2 flex flex-col h-full lg:sticky lg:top-4">
            <div className="border-b bg-[var(--shell-bg)] px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => lead?.avatarUrl && setShowAvatarModal(true)}
                  className="h-9 w-9 rounded-full border bg-[var(--shell-card-bg)] flex items-center justify-center overflow-hidden shrink-0"
                  style={{ cursor: lead?.avatarUrl ? "pointer" : "default" }}
                >
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
                </button>

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
                    <span>{"Início: " + (startedAt ? formatDateOnly(startedAt) : "—")}</span>
                    <span>
                      {"Último inbound: " +
                        (lastInboundAt ? formatTime(lastInboundAt) : "—") +
                        " - há " +
                        lastInboundAgoLabel}
                    </span>
                    {lead?.telefone ? <span>{"Tel: " + lead.telefone}</span> : null}
                    {origemContatoLabel ? (
                      <span title="Canal por onde este lead entrou">{"📥 Origem: " + origemContatoLabel}</span>
                    ) : null}
                    {atualContatoLabel ? (
                      <span title="Canal por onde a conversa continua agora">{"➡️ Atual: " + atualContatoLabel}</span>
                    ) : null}
                    {/* Canal de saída — seletor unificado (= contato atual) */}
                    {waLightSessions.length === 0 && !waOficialConfigured ? (
                      <span className="text-amber-600">
                        Nenhum número WA cadastrado.{" "}
                        <a href="/inbox-wa-light" className="underline">Cadastrar</a>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 flex-wrap">
                        <select
                          value={(() => {
                            // Mudança pendente tem prioridade sempre
                            if (pendingCanalChange) {
                              return pendingCanalChange.type === "light" ? pendingCanalChange.sessionId : "__oficial__";
                            }
                            if (lead?.conversaCanal === "WHATSAPP_OFICIAL") return "__oficial__";
                            if (lead?.conversaCanal === "WHATSAPP_LIGHT" && lead.conversaSessionId) return lead.conversaSessionId;
                            // Sem canal gravado: usa auto-seleção
                            return selectedCanalOut?.type === "light" ? selectedCanalOut.sessionId
                              : selectedCanalOut?.type === "oficial" ? "__oficial__" : "";
                          })()}
                          onChange={(e) => {
                            const v = e.target.value;
                            const newVal: CanalOut | null = v === "__oficial__" ? { type: "oficial" } : v ? { type: "light", sessionId: v } : null;
                            if (newVal) { setPendingCanalChange(newVal); setShowCanalModal(true); }
                          }}
                          className="rounded border bg-[var(--shell-card-bg)] px-2 py-1 text-xs"
                          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                        >
                          <option value="">(Selecione...)</option>
                          {waLightSessions.map(s => (
                            <option key={s.id} value={s.id}>
                              {"📱 " + s.nome + (s.phoneNumber ? ` (${s.phoneNumber})` : "") + (s.status !== "CONNECTED" ? " • " + (s.status === "DISCONNECTED" ? "Desconectado" : s.status === "QR_PENDING" ? "Aguardando QR" : s.status) : "")}
                            </option>
                          ))}
                          {waOficialConfigured && (
                            <option value="__oficial__">✅ WhatsApp Oficial (Meta)</option>
                          )}
                        </select>
                        {pendingCanalChange && (
                          <span className="text-xs text-amber-600 font-medium">Troca pendente — confirme no popup</span>
                        )}
                      </span>
                    )}
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
              {(lead as any)?.conversaRestricted ? (
                <div className="flex h-full items-center justify-center">
                  <div className="select-none rounded-lg border border-dashed border-[var(--shell-card-border)] px-6 py-4 text-center text-sm font-medium text-[var(--shell-subtext)]">
                    Permissão Não Concedida
                  </div>
                </div>
              ) : loadingEvents ? (
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

            {!(lead as any)?.conversaRestricted && user?.role !== "PARTNER" && (
            <div className="border-t bg-[var(--shell-card-bg)] p-3 space-y-3">
              {/* PAINEL DA IA */}
              {tenantAiEnabled && <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
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
              </div>}

              {/* MULTI-FILE PREVIEW (de empreendimento) */}
              {attachFiles.length > 0 && (
                <div className="rounded-lg border bg-[var(--shell-bg)] p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-[var(--shell-text)]">
                      📎 {attachFiles.length} arquivo(s) pronto(s) para enviar
                    </div>
                    <button
                      type="button"
                      className="text-xs text-[var(--shell-subtext)] hover:text-red-500"
                      disabled={!!attachSendProgress}
                      onClick={() => { setAttachFiles([]); setAttachSendProgress(null); setAttachErr(null); }}
                    >
                      Cancelar tudo
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {attachFiles.map((item, idx) => (
                      <div key={idx} className="relative group">
                        {item.file.type.startsWith("image/") ? (
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="w-full h-14 object-cover rounded border bg-[var(--shell-card-bg)]"
                          />
                        ) : (
                          <div className="w-full h-14 flex flex-col items-center justify-center rounded border bg-[var(--shell-card-bg)] gap-0.5">
                            <span className="text-lg">📄</span>
                            <span className="text-[9px] text-[var(--shell-subtext)] truncate w-full text-center px-1">{item.file.name}</span>
                          </div>
                        )}
                        {!attachSendProgress && (
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setAttachFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {attachErr && (
                    <div className="mb-2 rounded border border-red-200 bg-red-50 p-1.5 text-xs text-red-700">{attachErr}</div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
                      disabled={!!attachSendProgress || attachFiles.length === 0}
                      onClick={sendAllAttachFiles}
                    >
                      {attachSendProgress
                        ? `Enviando ${attachSendProgress.current} de ${attachSendProgress.total}...`
                        : `Enviar ${attachFiles.length} arquivo(s)`}
                    </button>
                  </div>
                </div>
              )}

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
                          // Drena fila de multi-envio
                          setAttachQueue(prev => {
                            if (prev.length === 0) return prev;
                            const [next, ...rest] = prev;
                            setAttachFile(next);
                            const notice = rest.length === 0
                              ? "Último arquivo pronto. Clique em \"Enviar anexo\"."
                              : `Mais ${rest.length + 1} arquivo(s). Próximo pronto para enviar.`;
                            setProductsNotice(notice);
                            setTimeout(() => setProductsNotice(null), 3000);
                            return rest;
                          });
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

                  {/* —S& ANEXO AO LADO DO MICROFONE */}
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

                {lead?.conversaAberta && (
                  <div className="flex items-center justify-end pb-1">
                    <button
                      onClick={() => setShowEndConvDialog(true)}
                      className="text-xs text-amber-600 hover:text-amber-800 border border-amber-300 rounded-md px-2 py-1 bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      🔒 Encerrar conversa
                    </button>
                  </div>
                )}

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

                <QuickReplies onInsert={insertIntoChat} />

                <button
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                  onClick={sendText}
                  disabled={sending || !text.trim()}
                >
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {!audioSupported ? (
                <div className="text-[11px] text-[var(--shell-subtext)]">—a—️ Seu navegador não suporta gravação (MediaRecorder). Teste no Chrome/Edge.</div>
              ) : null}
            </div>
            )}

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
          >
          <div
            className="bg-[var(--shell-card-bg)] rounded-xl shadow-xl p-6 w-full max-w-sm mx-4"
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

      {espelhoModal && (
        <EspelhoSelectorModal
          devId={espelhoModal.devId}
          leadId={id}
          trocandoUnitId={espelhoModal.trocandoUnitId}
          trocandoUnitNome={espelhoModal.trocandoUnitNome}
          linkStatus={currentStageUnitAction === "RESERVA" ? "RESERVADO" : "PROPOSTA"}
          viewOnly={user?.role === "PARTNER"}
          onClose={() => setEspelhoModal(null)}
          onDone={() => { setEspelhoModal(null); loadLead(); }}
        />
      )}

      {/* Modal unificado: definir/alterar interesse (imóvel do catálogo ou empreendimento) */}
      {interesseModalOpen && lead && (
        <InteresseSelectorModal
          leadId={id}
          current={
            lead.empreendimentoInteresse
              ? { type: "empreendimento", id: lead.empreendimentoInteresse.id }
              : lead.produtoInteresse
              ? { type: "produto", id: lead.produtoInteresse.id }
              : null
          }
          onClose={() => setInteresseModalOpen(false)}
          onDone={async () => {
            await loadLead();
            setInteresseModalOpen(false);
          }}
        />
      )}

      {/* Popup de confirmação: registrar empreendimento como interesse antes de abrir espelho/mídia */}
      {devInteresseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-2xl">
            <div className="mb-1 text-base font-bold text-[var(--shell-text)]">Definir como produto de interesse</div>
            <p className="mb-5 text-sm text-[var(--shell-subtext)] leading-relaxed">
              <span className="font-semibold text-[var(--shell-text)]">{devInteresseConfirm.devNome}</span> será registrado
              como empreendimento de interesse deste lead. Para alterar, basta selecionar outro empreendimento ou
              produto do catálogo.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={devInteresseSaving}
                onClick={async () => {
                  setDevInteresseSaving(true);
                  try {
                    await apiFetch(`/leads/${id}/qualification`, {
                      method: "PATCH",
                      body: JSON.stringify({ empreendimentoInteresseId: devInteresseConfirm.devId, produtoInteresseId: null }),
                    });
                    await loadLead();
                    const { devId, devNome, action } = devInteresseConfirm;
                    setDevInteresseConfirm(null);
                    if (action === "espelho") setEspelhoModal({ devId });
                    else setDevMediaModal({ devId, devNome });
                  } catch {
                    setDevInteresseSaving(false);
                  }
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: "var(--brand-accent)" }}
              >
                {devInteresseSaving ? "Salvando..." : "Confirmar"}
              </button>
              <button
                type="button"
                disabled={devInteresseSaving}
                onClick={() => setDevInteresseConfirm(null)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-[var(--shell-bg)] text-[var(--shell-text)] border border-[var(--shell-card-border)] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de mídia do empreendimento */}
      {devMediaModal && (
        <DevMediaModal
          devId={devMediaModal.devId}
          devNome={devMediaModal.devNome}
          onClose={() => setDevMediaModal(null)}
          prepareAttachmentFromUrl={prepareAttachmentFromUrl}
          onSendMultiple={queueMediaSend}
          insertIntoChat={insertIntoChat}
          handleCopyLink={handleCopyLink}
        />
      )}

      {/* Modal: Encerrou essa conversa? (ao sair da página) */}
      {showExitDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Encerrou essa conversa?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Esta conversa ainda está aberta. Deseja encerrá-la antes de sair?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowExitDialog(false);
                  if (pendingNavRef.current) {
                    startTransition(() => router.push(pendingNavRef.current!));
                  }
                }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Não, só sair
              </button>
              <button
                onClick={async () => {
                  await apiFetch(`/leads/${id}/end-conversation`, { method: 'POST' });
                  setShowExitDialog(false);
                  if (pendingNavRef.current) {
                    startTransition(() => router.push(pendingNavRef.current!));
                  }
                }}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600"
              >
                Sim, encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmação de encerrar conversa (pelo botão na área de mensagem) */}
      {showEndConvDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Encerrar conversa?</h3>
            <p className="text-sm text-gray-600 mb-6">
              O lead sairá da seção de conversas abertas. Quando o lead mandar uma nova mensagem, a conversa será reaberta automaticamente.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEndConvDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await apiFetch(`/leads/${id}/end-conversation`, { method: 'POST' });
                  setShowEndConvDialog(false);
                  setLead((prev) => prev ? { ...prev, conversaAberta: false } : prev);
                }}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600"
              >
                Sim, encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCanalModal && pendingCanalChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" style={{ background: "var(--shell-card-bg)", border: "1px solid var(--shell-card-border)" }}>
            <h2 className="text-base font-bold mb-3" style={{ color: "var(--shell-text)" }}>⚠️ Confirmar troca de canal</h2>
            <p className="text-sm mb-2" style={{ color: "var(--shell-subtext)" }}>
              {lead?.conversaCanal ? (
                <>
                  Este cliente entrou em contato pelo{" "}
                  <strong style={{ color: "var(--shell-text)" }}>
                    {lead.conversaCanal === "WHATSAPP_OFICIAL"
                      ? "WhatsApp Oficial (Meta)"
                      : (() => { const s = waLightSessions.find(x => x.id === lead.conversaSessionId); return s ? `${s.nome}${s.phoneNumber ? ` · ${s.phoneNumber}` : ""}` : "WhatsApp Light"; })()}
                  </strong>.{" "}
                </>
              ) : null}
              Ao confirmar, as próximas mensagens serão enviadas pelo{" "}
              <strong style={{ color: "var(--shell-text)" }}>
                {pendingCanalChange.type === "oficial"
                  ? "WhatsApp Oficial (Meta)"
                  : (() => { const s = waLightSessions.find(x => x.id === pendingCanalChange.sessionId); return s ? `${s.nome}${s.phoneNumber ? ` · ${s.phoneNumber}` : ""}` : "WhatsApp Light"; })()}
              </strong>.
            </p>
            <p className="text-sm mb-5" style={{ color: "var(--shell-subtext)" }}>
              O cliente poderá receber mensagens de um número novo e talvez desconhecido para ele.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setPendingCanalChange(null); setShowCanalModal(false); }}
                className="rounded px-4 py-2 text-sm font-semibold hover:opacity-80"
                style={{ background: "var(--shell-sidebar-bg)", color: "var(--shell-subtext)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingCanal}
                onClick={async () => {
                  if (!pendingCanalChange) return;
                  setSavingCanal(true);
                  try {
                    const body: Record<string, string | null> = {
                      conversaCanal: pendingCanalChange.type === "light" ? "WHATSAPP_LIGHT" : "WHATSAPP_OFICIAL",
                      conversaSessionId: pendingCanalChange.type === "light" ? pendingCanalChange.sessionId : null,
                    };
                    await apiFetch(`/leads/${id}/canal`, { method: "PATCH", body: JSON.stringify(body) });
                    setLead((prev: any) => prev ? { ...prev, ...body } : prev);
                    setPendingCanalChange(null);
                    setShowCanalModal(false);
                  } catch {
                    alert("Erro ao alterar canal");
                  } finally {
                    setSavingCanal(false);
                  }
                }}
                className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#dc2626" }}
              >
                {savingCanal ? "Salvando..." : "Confirmar troca"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAvatarModal && lead?.avatarUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setShowAvatarModal(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={lead.avatarUrl}
              alt={lead.nomeCorreto ?? lead.nome ?? "avatar"}
              className="rounded-2xl object-cover shadow-2xl"
              style={{ maxWidth: "min(360px, 90vw)", maxHeight: "min(360px, 90vh)" }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 rounded-b-2xl px-4 py-3"
              style={{ background: "rgba(0,0,0,0.6)" }}
            >
              <p className="text-sm font-semibold text-white">{lead.nomeCorreto ?? lead.nome}</p>
              {(lead.telefone || (lead as any).restrictedFields?.includes("lead.telefone")) && (
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  <MaskedField field="lead.telefone">{lead.telefone || "—"}</MaskedField>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAvatarModal(false)}
              className="absolute right-2 top-2 rounded-full p-1.5"
              style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Popup — Histórico de Movimentações (somente consulta) */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-[var(--shell-card-border)] px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <span>🕑</span> Histórico de Movimentações
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="divide-y divide-[var(--shell-card-border)] overflow-y-auto">
              {transitions.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  Nenhuma movimentação registrada.
                </li>
              )}
              {transitions.map((t) => (
                <li key={t.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {t.fromStage ? `${t.fromStage} → ` : ""}{t.toStage}
                    </span>
                    {t.cascade && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-neutral-800 dark:text-slate-400">automático</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t.cascade ? "Sistema" : (t.changedByName || "—")} · <MaskedField field="lead.historicoDatas">{new Date(t.createdAt).toLocaleString("pt-BR")}</MaskedField>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex justify-end border-t border-[var(--shell-card-border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup — Visualização de evidência (imagem/PDF) na mesma tela */}
      {evidencePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
        >
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-[var(--shell-card-border)] px-5 py-3">
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {evidencePreview.nome || "Evidência"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={evidencePreview.url}
                  download={evidencePreview.nome || "evidencia"}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800"
                >
                  Baixar
                </a>
                <button
                  type="button"
                  onClick={closeEvidencePreview}
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-neutral-950 p-3">
              {evidencePreview.mime.startsWith("image/") ? (
                <img src={evidencePreview.url} alt={evidencePreview.nome} className="mx-auto max-h-[78vh] object-contain" />
              ) : evidencePreview.mime === "application/pdf" ? (
                <iframe src={evidencePreview.url} title={evidencePreview.nome} className="h-[78vh] w-full rounded-md bg-white" />
              ) : (
                <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                  Pré-visualização não disponível para este tipo de arquivo.
                  <div className="mt-3">
                    <a href={evidencePreview.url} download={evidencePreview.nome || "evidencia"} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Baixar arquivo
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
