import { apiFetch } from "@/lib/api";

export type WaLightStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "QR_PENDING";
export type WaLightDirection = "in" | "out";
export type WaLightMediaKind = "image" | "video" | "audio" | "document" | "sticker";

export type WaLightInboxStatus = {
  id: string;
  nome: string;
  status: WaLightStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  pushName: string | null;
};

export type WaLightCampaignModel = {
  id: string;
  nome: string;
  mensagem: string;
  mediaUrl: string | null;
  mediaType: string | null;
  delayMinSegundos: number;
  delayMaxSegundos: number;
  _count?: { disparos: number };
};

export type WaLightCampaignRun = {
  id: string;
  nome: string;
  status: string;
  totalContatos: number;
  enviados: number;
  falhas: number;
  responderam: number;
};

export type WaLightConversation = {
  type?: "lead" | "campanha" | "whatsapp";
  chatId?: string | null;
  remoteJid?: string | null;
  leadId: string | null;
  contatoId: string | null;
  campaignId?: string | null;
  disparoId?: string | null;
  tracked?: boolean;
  leadStatus?: string | null;
  leadStage?: string | null;
  nome: string;
  telefone: string | null;
  avatarUrl?: string | null;
  naoLidos: number;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemDirecao: WaLightDirection | null;
};

export type WaLightContactDetail = {
  contatoId: string;
  nome: string;
  telefone: string;
  status: string;
  enviadoEm: string | null;
  mensagemDisparo: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  leadId?: string | null;
};

export type WaLightMessage = {
  id: string;
  direcao: WaLightDirection;
  texto: string | null;
  criadoEm: string;
  mediaUrl?: string | null;
  mediaType?: WaLightMediaKind | string | null;
  mimeType?: string | null;
  filename?: string | null;
  status?: string | null;
};

export type WaLightConversationDetail = {
  nome: string;
  telefone: string | null;
  avatarUrl?: string | null;
  leadId?: string | null;
  leadStatus?: string | null;
  leadStage?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  tracked?: boolean;
  mensagens: WaLightMessage[];
};

export type WaLightValidatedNumber = {
  telefone: string;
  nome?: string;
  existsOnWhatsapp: boolean;
  invalidFormat?: boolean;
  duplicate?: boolean;
};

export function normalizeWhatsappValidation(
  requested: Array<{ telefone: string; nome?: string }>,
  response: Array<Record<string, unknown>>,
): WaLightValidatedNumber[] {
  const seen = new Set<string>();

  return requested.map((item) => {
    const match = response.find((row) => String(row.telefone ?? "") === item.telefone);
    const noWhatsapp = Boolean(match?.noWhatsapp);
    const existsOnWhatsapp =
      typeof match?.existsOnWhatsapp === "boolean"
        ? Boolean(match.existsOnWhatsapp)
        : typeof match?.isWhatsapp === "boolean"
          ? Boolean(match.isWhatsapp)
          : !noWhatsapp;
    const duplicate = seen.has(item.telefone);
    seen.add(item.telefone);

    return {
      ...item,
      existsOnWhatsapp,
      invalidFormat: Boolean(match?.invalidFormat),
      duplicate,
    };
  });
}

export function conversationKey(c: WaLightConversation) {
  return c.leadId ?? c.contatoId ?? c.chatId ?? c.remoteJid ?? c.telefone ?? c.nome;
}

export function isTrackedConversation(c: WaLightConversation) {
  return Boolean(c.tracked || c.campaignId || c.disparoId || c.contatoId || c.type === "campanha");
}

export function canSendToConversation(c: WaLightConversation | null) {
  return Boolean(c?.leadId || c?.chatId || c?.remoteJid || c?.telefone);
}

export async function sendWaLightText(inboxId: string, conversation: WaLightConversation, text: string) {
  if (conversation.leadId) {
    return apiFetch(`/inbox/${conversation.leadId}/send`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  return apiFetch(`/inbox-wa-light/${inboxId}/send`, {
    method: "POST",
    body: JSON.stringify({
      text,
      chatId: conversation.chatId ?? conversation.remoteJid ?? null,
      telefone: conversation.telefone,
      contatoId: conversation.contatoId,
    }),
  });
}

export async function sendWaLightAttachment(inboxId: string, conversation: WaLightConversation, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  if (conversation.chatId) fd.append("chatId", conversation.chatId);
  if (conversation.remoteJid) fd.append("remoteJid", conversation.remoteJid);
  if (conversation.telefone) fd.append("telefone", conversation.telefone);
  if (conversation.contatoId) fd.append("contatoId", conversation.contatoId);

  if (conversation.leadId) {
    return apiFetch(`/leads/${conversation.leadId}/send-whatsapp-attachment`, {
      method: "POST",
      body: fd,
    });
  }

  return apiFetch(`/inbox-wa-light/${inboxId}/send-attachment`, {
    method: "POST",
    body: fd,
  });
}

export async function sendWaLightAudio(inboxId: string, conversation: WaLightConversation, blob: Blob) {
  const mime = String(blob.type || "").toLowerCase();
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm";
  const fd = new FormData();
  fd.append("file", new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type || `audio/${ext}` }));
  if (conversation.chatId) fd.append("chatId", conversation.chatId);
  if (conversation.remoteJid) fd.append("remoteJid", conversation.remoteJid);
  if (conversation.telefone) fd.append("telefone", conversation.telefone);
  if (conversation.contatoId) fd.append("contatoId", conversation.contatoId);

  if (conversation.leadId) {
    return apiFetch(`/leads/${conversation.leadId}/send-whatsapp-audio`, {
      method: "POST",
      body: fd,
    });
  }

  return apiFetch(`/inbox-wa-light/${inboxId}/send-audio`, {
    method: "POST",
    body: fd,
  });
}
