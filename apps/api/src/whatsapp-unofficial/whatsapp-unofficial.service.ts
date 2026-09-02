import { Injectable, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import makeWASocket, { WASocket, DisconnectReason, downloadMediaMessage, generateMessageID, WAMessageUpdate } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Prisma } from '@prisma/client';
import pino from 'pino';
import * as QRCode from 'qrcode';
import OpenAI from 'openai';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { upsertLeadFromWhatsapp, telefoneKeyFrom } from '../whatsapp/lead-upsert.helper';
import { resolveAiModel } from '../ai/resolve-ai-model';
import { LimitsService } from '../plans/limits.service';
import { LimitExceededException } from '../plans/usage.service';
import { WhatsappService } from '../secretary/whatsapp.service';
import { userWantsEvent, recordUserNotice } from '../users/notification-prefs.helper';
import {
  computeAuthStatePrune,
  isContactScopedAuthKey,
  preKeyIdOf,
  type AuthStatePruneOpts,
  type AuthStatePruneResult,
} from './auth-state-prune.util';

const logger = new Logger('WhatsappUnofficialService');

// Tipos que não representam intenção do lead — não acionam IA nem criam lead de campanha
const SILENT_INBOUND_TYPES = new Set(['sticker', 'poll', 'system', 'unknown', 'edited']);

const WA_LIGHT_CHANNELS = ['whatsapp.unofficial.in', 'whatsapp.unofficial.out'];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Contexto de uma importação de histórico em andamento (por sessão).
// O handler `messaging-history.set` só persiste mensagens quando há um contexto ativo,
// atribuindo cada mensagem ao lead dono do `remoteJid` e deduplicando por `key.id`.
interface HistoryImportCtx {
  tenantId: string;
  jidToLead: Map<string, { leadId: string; knownKeyIds: Set<string> }>;
  inserted: number;
  processMedia: boolean;
  since?: Date;          // se definido, ignora msgs com timestamp anterior a esta data
  minTsThisPage: number; // menor timestamp visto na página atual (para avanço de âncora)
  minKeyThisPage: any;   // key da msg mais antiga da página atual
}

// ── Extrator de texto/tipo de mensagens Baileys ───────────────────────────────

function extractBaileysText(msgContent: any): { type: string; text: string } {
  if (!msgContent) return { type: 'unknown', text: '[MENSAGEM]' };

  // Desembrulha tipos container
  const inner =
    msgContent.viewOnceMessage?.message ||
    msgContent.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
    msgContent.ephemeralMessage?.message ||
    msgContent.documentWithCaptionMessage?.message ||
    msgContent;

  if (inner.conversation) return { type: 'text', text: inner.conversation };
  if (inner.extendedTextMessage?.text) return { type: 'text', text: inner.extendedTextMessage.text };
  if (inner.imageMessage) return { type: 'image', text: inner.imageMessage.caption || '[IMAGEM]' };
  if (inner.videoMessage) return { type: 'video', text: inner.videoMessage.caption || '[VÍDEO]' };
  if (inner.audioMessage) return { type: 'audio', text: '[ÁUDIO]' };
  if (inner.documentMessage) return { type: 'document', text: inner.documentMessage.fileName || '[DOCUMENTO]' };
  if (inner.stickerMessage) return { type: 'sticker', text: '[STICKER]' };
  if (inner.locationMessage) return { type: 'location', text: '[LOCALIZAÇÃO]' };
  if (inner.contactMessage) return { type: 'contact', text: `[CONTATO: ${inner.contactMessage.displayName || ''}]` };
  if (inner.reactionMessage) return { type: 'reaction', text: `[REAÇÃO: ${inner.reactionMessage.text || ''}]` };
  if (inner.buttonsResponseMessage) return { type: 'text', text: inner.buttonsResponseMessage.selectedDisplayText || '[RESPOSTA]' };
  if (inner.listResponseMessage) return { type: 'text', text: inner.listResponseMessage.title || '[RESPOSTA LISTA]' };
  if (inner.templateButtonReplyMessage) return { type: 'text', text: inner.templateButtonReplyMessage.selectedDisplayText || '[RESPOSTA]' };
  if (inner.pollUpdateMessage) return { type: 'poll', text: '[VOTAÇÃO]' };
  if (inner.pollCreationMessage || inner.pollCreationMessageV2 || inner.pollCreationMessageV3) {
    const question = inner.pollCreationMessage?.name || inner.pollCreationMessageV2?.name || inner.pollCreationMessageV3?.name || '';
    return { type: 'poll', text: `[ENQUETE: ${question}]` };
  }
  if (inner.editedMessage) {
    const edited = inner.editedMessage.message;
    const extracted = extractBaileysText(edited);
    return { type: 'edited', text: extracted.text };
  }

  // Mensagens de sistema do protocolo WhatsApp — não representam intenção do lead
  if (inner.protocolMessage) {
    const descriptions: Record<number, string> = {
      0: '[Mensagem apagada pelo remetente]',
      3: '[Sincronização de histórico]',
      4: '[Mensagens temporárias atualizadas]',
      14: '[Chave de criptografia atualizada]',
    };
    const desc = descriptions[inner.protocolMessage.type] ?? '[Mensagem de sistema]';
    return { type: 'system', text: desc };
  }
  if (inner.senderKeyDistributionMessage || (inner as any).senderKeyDistributionMessageWithIdentity) {
    return { type: 'system', text: '[Protocolo de criptografia]' };
  }
  if (inner.callLogMessage) {
    const missed = inner.callLogMessage.callResult === 'MISSED';
    return { type: 'system', text: missed ? '[Chamada perdida]' : '[Chamada de voz]' };
  }

  return { type: 'unknown', text: '[Mensagem não reconhecida]' };
}

// Mapeia o enum de ACK do Baileys (proto.WebMessageInfo.Status) para os 3 estados
// exibidos na UI (check simples / duplo cinza / duplo azul).
// ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5
function mapBaileysAckToStatus(rawStatus: number): 'SENT' | 'DELIVERED' | 'READ' | null {
  if (rawStatus === 1 || rawStatus === 2) return 'SENT';
  if (rawStatus === 3) return 'DELIVERED';
  if (rawStatus === 4 || rawStatus === 5) return 'READ';
  return null; // ERROR (0) ou valor desconhecido
}

function statusRank(status: string | null | undefined): number {
  if (status === 'READ') return 3;
  if (status === 'DELIVERED') return 2;
  if (status === 'SENT') return 1;
  return 0;
}

function digitsOnly(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  if (!jid.includes('@s.whatsapp.net') && !jid.includes('@c.us')) return null;
  const phone = digitsOnly(jid.split('@')[0].split(':')[0]);
  return phone || null;
}

function lidFromJid(jid: string | null | undefined): string | null {
  if (!jid?.endsWith('@lid')) return null;
  const lid = jid.split('@')[0].split(':')[0];
  return lid || null;
}

function phoneMatchSuffix(value: string) {
  const digits = digitsOnly(value);
  if (digits.length >= 11) return digits.slice(-11);
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

function nameTokens(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 4);
}

function namesLookRelated(a: string | null | undefined, b: string | null | undefined) {
  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  return aTokens.some((aToken) =>
    bTokens.some((bToken) => aToken.startsWith(bToken) || bToken.startsWith(aToken)),
  );
}

// ── Auth state persistido no banco ───────────────────────────────────────────
//
// Guarda credenciais + chaves do protocolo Signal (Baileys) por sessão. O objeto
// `keys` acumula pre-keys, sessões e sender-keys por contato — sem poda, cresce
// sem limite pelo tempo de vida da sessão (uma sessão ativa há meses acumula
// dezenas de milhares de chaves, vários MB — foi a causa raiz de um vazamento de
// memória em produção: toda mensagem trocada reserializava e regravava o blob
// INTEIRO). Duas defesas:
//
//   1. Persistência incremental (applyAuthStatePatch): cada set()/saveCreds()
//      grava só o delta via jsonb_set/#- no Postgres — nunca mais o objeto
//      `keys` inteiro, mesmo que ele já tenha milhares de entradas.
//   2. Poda periódica (pruneNow / pruneAuthStateInDb, chamada 1x/dia pelo
//      WaAuthPruneWorker — ver pruneAllSessions): remove pre-keys já
//      consumidas (mantém sempre as AUTH_STATE_MAX_PREKEYS mais recentes — o
//      protocolo só usa cada pre-key uma vez) e sessões/sender-keys de
//      contatos sem atividade há mais de AUTH_STATE_PRUNE_INACTIVE_DAYS dias.
//      NUNCA remove sessão/sender-key com atividade recente. Se o contato
//      nunca teve timestamp registrado (dado anterior a este fix), a primeira
//      poda só grava "ativo agora" — nunca remove sem antes ter um histórico.

const AUTH_STATE_MAX_PREKEYS = Number(process.env.WA_AUTH_MAX_PREKEYS || 1000);
const AUTH_STATE_PRUNE_INACTIVE_DAYS = Number(process.env.WA_AUTH_PRUNE_INACTIVE_DAYS || 90);
const AUTH_STATE_PRUNE_CHUNK_SIZE = 200;

type AuthStatePatch = {
  creds?: any;
  upsertKeys?: Record<string, any>;
  deleteKeys?: string[];
  touchMeta?: Record<string, number>;
};

// Monta a expressão SQL do patch incremental — só o delta desta chamada entra no
// jsonb_set/#-, nunca o objeto `keys`/`meta` inteiro.
function buildAuthStatePatchExpr(patch: AuthStatePatch) {
  let expr = Prisma.sql`coalesce("authStateJson", '{}'::jsonb)`;

  if (patch.creds !== undefined) {
    expr = Prisma.sql`jsonb_set(${expr}, '{creds}', ${JSON.stringify(patch.creds)}::jsonb, true)`;
  }
  if (patch.upsertKeys && Object.keys(patch.upsertKeys).length > 0) {
    expr = Prisma.sql`jsonb_set(${expr}, '{keys}', coalesce((${expr})->'keys', '{}'::jsonb) || ${JSON.stringify(patch.upsertKeys)}::jsonb, true)`;
  }
  if (patch.deleteKeys && patch.deleteKeys.length > 0) {
    for (const k of patch.deleteKeys) {
      expr = Prisma.sql`(${expr}) #- ARRAY['keys', ${k}]::text[]`;
    }
  }
  if (patch.touchMeta && Object.keys(patch.touchMeta).length > 0) {
    // path de 2 níveis: jsonb_set só cria o ÚLTIMO elemento faltante do path —
    // se 'meta' também não existir ainda, a chamada vira no-op. Por isso
    // garante 'meta' como objeto primeiro, e só então seta 'lastUsedAt' nele.
    expr = Prisma.sql`jsonb_set(
      ${expr},
      '{meta}',
      jsonb_set(
        coalesce((${expr})->'meta', '{}'::jsonb),
        '{lastUsedAt}',
        coalesce((${expr})->'meta'->'lastUsedAt', '{}'::jsonb) || ${JSON.stringify(patch.touchMeta)}::jsonb,
        true
      ),
      true
    )`;
  }
  return expr;
}

async function applyAuthStatePatch(prisma: PrismaService, sessionId: string, patch: AuthStatePatch) {
  const hasChange =
    patch.creds !== undefined ||
    !!(patch.upsertKeys && Object.keys(patch.upsertKeys).length) ||
    !!(patch.deleteKeys && patch.deleteKeys.length) ||
    !!(patch.touchMeta && Object.keys(patch.touchMeta).length);
  if (!hasChange) return;

  const expr = buildAuthStatePatchExpr(patch);
  await prisma.$executeRaw`UPDATE whatsapp_unofficial_sessions SET "authStateJson" = ${expr} WHERE id = ${sessionId}`;
}

// Poda direto no banco — usada para sessões sem socket vivo neste processo
// (status DISCONNECTED, ou vivas em outra réplica). Lê o blob atual do banco,
// decide o que remover e aplica via applyAuthStatePatch (nunca reescreve o
// blob inteiro, mesmo estando podando milhares de chaves de uma vez — em
// lotes de AUTH_STATE_PRUNE_CHUNK_SIZE).
async function pruneAuthStateInDb(
  prisma: PrismaService,
  sessionId: string,
  opts?: AuthStatePruneOpts,
): Promise<AuthStatePruneResult> {
  const row = await prisma.whatsappUnofficialSession.findUnique({
    where: { id: sessionId },
    select: { authStateJson: true },
  });
  const blob = (row?.authStateJson as any) ?? {};
  const keys: Record<string, any> = blob.keys ?? {};
  const lastUsedAt: Record<string, number> = blob.meta?.lastUsedAt ?? {};

  const { toDelete, seedMeta } = computeAuthStatePrune(keys, lastUsedAt, {
    maxPreKeys: opts?.maxPreKeys ?? AUTH_STATE_MAX_PREKEYS,
    inactiveDays: opts?.inactiveDays ?? AUTH_STATE_PRUNE_INACTIVE_DAYS,
  });

  let deletedPreKeys = 0;
  let deletedSessions = 0;
  for (const k of toDelete) {
    if (preKeyIdOf(k) !== null) deletedPreKeys++;
    else deletedSessions++;
  }

  for (let i = 0; i < toDelete.length; i += AUTH_STATE_PRUNE_CHUNK_SIZE) {
    await applyAuthStatePatch(prisma, sessionId, { deleteKeys: toDelete.slice(i, i + AUTH_STATE_PRUNE_CHUNK_SIZE) });
  }
  if (Object.keys(seedMeta).length > 0) {
    await applyAuthStatePatch(prisma, sessionId, { touchMeta: seedMeta });
  }

  return { deletedPreKeys, deletedSessions };
}

async function useDatabaseAuthState(prisma: PrismaService, sessionId: string) {
  const row = await prisma.whatsappUnofficialSession.findUnique({
    where: { id: sessionId },
    select: { authStateJson: true },
  });

  const stored = (row?.authStateJson as any) ?? {};
  const creds = stored.creds
    ? JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver)
    : initAuthCreds();
  const keys: Record<string, any> = { ...(stored.keys ?? {}) };
  const lastUsedAt: Record<string, number> = { ...(stored.meta?.lastUsedAt ?? {}) };

  const persistCreds = async () => {
    await applyAuthStatePatch(prisma, sessionId, {
      creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
    });
  };

  // Poda o estado LIVE em memória desta sessão (socket conectado neste
  // processo) — mantém `keys`/`lastUsedAt` locais em sincronia com o que é
  // gravado no banco, para não desalinhar do que o Baileys ainda enxerga.
  const pruneNow = async (opts?: AuthStatePruneOpts): Promise<AuthStatePruneResult> => {
    const { toDelete, seedMeta } = computeAuthStatePrune(keys, lastUsedAt, {
      maxPreKeys: opts?.maxPreKeys ?? AUTH_STATE_MAX_PREKEYS,
      inactiveDays: opts?.inactiveDays ?? AUTH_STATE_PRUNE_INACTIVE_DAYS,
    });

    let deletedPreKeys = 0;
    let deletedSessions = 0;
    for (const k of toDelete) {
      delete keys[k];
      delete lastUsedAt[k];
      if (preKeyIdOf(k) !== null) deletedPreKeys++;
      else deletedSessions++;
    }
    for (const k of Object.keys(seedMeta)) lastUsedAt[k] = seedMeta[k];

    for (let i = 0; i < toDelete.length; i += AUTH_STATE_PRUNE_CHUNK_SIZE) {
      await applyAuthStatePatch(prisma, sessionId, { deleteKeys: toDelete.slice(i, i + AUTH_STATE_PRUNE_CHUNK_SIZE) });
    }
    if (Object.keys(seedMeta).length > 0) {
      await applyAuthStatePatch(prisma, sessionId, { touchMeta: seedMeta });
    }

    return { deletedPreKeys, deletedSessions };
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, any> = {};
          for (const id of ids) {
            const k = `${type}-${id}`;
            if (keys[k] !== undefined) {
              data[id] = JSON.parse(JSON.stringify(keys[k]), BufferJSON.reviver);
            }
          }
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const upsertKeys: Record<string, any> = {};
          const deleteKeys: string[] = [];
          const touchMeta: Record<string, number> = {};

          for (const type in data) {
            for (const id in data[type]) {
              const k = `${type}-${id}`;
              const v = data[type][id];
              if (v != null) {
                const serialized = JSON.parse(JSON.stringify(v, BufferJSON.replacer));
                keys[k] = serialized;
                upsertKeys[k] = serialized;
                if (isContactScopedAuthKey(k)) {
                  const now = Date.now();
                  lastUsedAt[k] = now;
                  touchMeta[k] = now;
                }
              } else {
                delete keys[k];
                delete lastUsedAt[k];
                deleteKeys.push(k);
              }
            }
          }

          // Persistência incremental: grava só o delta desta chamada (nunca o
          // objeto `keys` inteiro, por maior que ele já esteja).
          await applyAuthStatePatch(prisma, sessionId, {
            upsertKeys: Object.keys(upsertKeys).length ? upsertKeys : undefined,
            deleteKeys: deleteKeys.length ? deleteKeys : undefined,
            touchMeta: Object.keys(touchMeta).length ? touchMeta : undefined,
          });
        },
        clear: async () => {
          for (const k in keys) delete keys[k];
          for (const k in lastUsedAt) delete lastUsedAt[k];
          // Reset completo (logout) — evento raro, escrever o blob inteiro aqui
          // é aceitável (é exatamente um estado vazio).
          await prisma.whatsappUnofficialSession.update({
            where: { id: sessionId },
            data: {
              authStateJson: {
                creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
                keys: {},
                meta: { lastUsedAt: {} },
              },
            },
          });
        },
        transaction: async <T>(code: () => Promise<T>): Promise<T> => code(),
      },
    },
    saveCreds: persistCreds,
    pruneNow,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WhatsappUnofficialService implements OnModuleDestroy {
  private sockets = new Map<string, WASocket>();
  private connectedAt = new Map<string, number>();
  private disconnectedAt = new Map<string, number>();
  private manuallyDisconnected = new Set<string>();
  // Mapa LID → phone por sessão (WhatsApp multi-device usa LIDs como ID interno)
  // Ex: { sessionId → Map('95236772601989' → '5513991431834') }
  private lidToPhone = new Map<string, Map<string, string>>();
  // Importações de histórico ativas por sessão (backfill de mensagens antigas)
  private historyImports = new Map<string, HistoryImportCtx>();
  // Mensagens enviadas pelo próprio CRM (Baileys `messageId` pré-gerado → expira em ms epoch, TTL ~5min).
  // Usado pra diferenciar o eco do próprio envio de uma mensagem genuína mandada direto do celular
  // do corretor (mesma conta, outro dispositivo) — ambas chegam com `key.fromMe: true`.
  private recentlySentByCrm = new Map<string, number>();
  // Dedup da janela de catchup (reconexão) — evita reprocessar a mesma mensagem se o
  // WhatsApp reenviar o backlog em múltiplas reconexões seguidas. TTL de processo (não
  // persiste, mas cobre o caso comum de reconexões repetidas em sequência).
  private catchupSeenMsgIds = new Map<string, Set<string>>();
  // Handle do auth-state (Baileys/Signal) da sessão com socket vivo neste processo —
  // usado pela poda periódica pra operar sobre o mesmo estado em memória que o
  // socket enxerga, em vez de reescrever o banco por baixo dele (ver pruneSession).
  private authStates = new Map<string, Awaited<ReturnType<typeof useDatabaseAuthState>>>();

  private updateLidMap(sessionId: string, contacts: Array<{ id: string; lid?: string | null }>) {
    let map = this.lidToPhone.get(sessionId);
    if (!map) { map = new Map(); this.lidToPhone.set(sessionId, map); }
    const newly: Array<[string, string]> = [];
    for (const c of contacts) {
      if (c.lid && c.id.includes('@s.whatsapp.net')) {
        const lid = c.lid.split('@')[0].split(':')[0];
        const phone = c.id.split('@')[0].split(':')[0];
        if (lid && phone && map.get(lid) !== phone) {
          map.set(lid, phone);
          newly.push([lid, phone]);
        }
      }
    }
    if (newly.length) this.persistLidPhoneMap(sessionId, newly);
  }

  private async resolveLidPhone(sessionId: string, lid: string, msg: any): Promise<string | null> {
    const altPhone = phoneFromJid(msg?.key?.remoteJidAlt) ?? phoneFromJid(msg?.key?.participantAlt);
    if (altPhone) {
      this.rememberLidPhone(sessionId, lid, altPhone);
      return altPhone;
    }

    const memoryPhone = this.lidToPhone.get(sessionId)?.get(lid) ?? null;
    if (memoryPhone) return memoryPhone;

    const session = await this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { authStateJson: true, lidPhoneMapJson: true },
    });

    // Cache persistido (sobrevive a restart do processo) — checado antes do authStateJson
    // porque é a fonte mais barata e mais confiável (populada por resoluções anteriores).
    const persisted = (session?.lidPhoneMapJson as Record<string, string> | null) ?? null;
    const persistedPhone = persisted?.[lid];
    if (persistedPhone) {
      this.rememberLidPhone(sessionId, lid, persistedPhone, { skipPersist: true });
      return persistedPhone;
    }

    const storedKeys = ((session?.authStateJson as any)?.keys ?? {}) as Record<string, any>;
    const pnUser = storedKeys[`lid-mapping-${lid}_reverse`];
    if (typeof pnUser === 'string' && pnUser) {
      const phone = digitsOnly(pnUser);
      if (phone) {
        this.rememberLidPhone(sessionId, lid, phone);
        return phone;
      }
    }

    return null;
  }

  private rememberLidPhone(sessionId: string, lid: string, phone: string, opts?: { skipPersist?: boolean }) {
    let map = this.lidToPhone.get(sessionId);
    if (!map) { map = new Map(); this.lidToPhone.set(sessionId, map); }
    const isNew = map.get(lid) !== phone;
    map.set(lid, phone);
    if (isNew && !opts?.skipPersist) this.persistLidPhoneMap(sessionId, [[lid, phone]]);
  }

  // Grava o mapa LID→telefone no banco (best-effort) pra sobreviver a restart/deploy da API —
  // sem isso, mensagens de contatos de baixa frequência (LID sem remoteJidAlt) somem
  // silenciosamente sempre que o processo reinicia antes de um novo inbound re-popular o cache.
  private async persistLidPhoneMap(sessionId: string, entries: Array<[string, string]>) {
    try {
      const session = await this.prisma.whatsappUnofficialSession.findUnique({
        where: { id: sessionId },
        select: { lidPhoneMapJson: true },
      });
      const current = (session?.lidPhoneMapJson as Record<string, string> | null) ?? {};
      const merged = { ...current };
      for (const [lid, phone] of entries) merged[lid] = phone;
      await this.prisma.whatsappUnofficialSession.update({
        where: { id: sessionId },
        data: { lidPhoneMapJson: merged },
      });
    } catch (e) {
      logger.warn(`Falha ao persistir lidPhoneMapJson (sessão=${sessionId}): ${(e as Error).message}`);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly limitsService: LimitsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // Registra um messageId gerado pelo próprio CRM antes do envio, com TTL de ~5min.
  // Faz limpeza oportunista de entradas expiradas a cada chamada (sem setInterval dedicado).
  private rememberSentByCrm(messageId: string) {
    const now = Date.now();
    for (const [id, expiresAt] of this.recentlySentByCrm) {
      if (expiresAt < now) this.recentlySentByCrm.delete(id);
    }
    this.recentlySentByCrm.set(messageId, now + 5 * 60 * 1000);
  }

  async onModuleDestroy() {
    for (const [, socket] of this.sockets) {
      try { socket.end(undefined); } catch {}
    }
  }

  /**
   * Notifica o corretor responsável sobre um lead novo do Light.
   * Entrega inteligente: tenta primeiro pela própria sessão Light que recebeu o lead
   * (cobre tenant sem WhatsApp oficial); se falhar, cai para o WhatsApp oficial (Meta).
   */
  private async notifyResponsibleNewLead(
    tenantId: string,
    assignedUserId: string,
    contactName: string | null | undefined,
    phone: string,
    sessionId: string | null,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: assignedUserId, tenantId, ativo: true, whatsappNumber: { not: null } },
      select: { whatsappNumber: true },
    });
    if (!user?.whatsappNumber) return;
    // Respeita a preferência do usuário (tela de Notificações).
    if (!(await userWantsEvent(this.prisma, assignedUserId, 'new_lead'))) return;
    const nome = contactName || phone || 'Novo lead';
    const msg = `🔔 Novo lead chegou: *${nome}*${phone ? `\nWhatsApp: ${phone}` : ''}`;

    // 1) Light primeiro (sessão que recebeu o lead está conectada).
    if (sessionId) {
      try {
        await this.sendText(sessionId, user.whatsappNumber, msg);
        return;
      } catch (e: any) {
        logger.warn(`Notif novo lead via Light falhou, tentando oficial: ${e?.message ?? e}`);
      }
    }

    // 2) Fallback: WhatsApp oficial (Meta).
    const r = await this.whatsapp.sendMessage(user.whatsappNumber, msg, tenantId);

    // 3) Ambos falharam → deixa aviso in-app (sininho) para o responsável.
    if (!r) {
      await recordUserNotice(this.prisma, {
        tenantId,
        userId: assignedUserId,
        kind: 'delivery_failed',
        title: 'Não consegui te avisar de um novo lead',
        body: `${nome}${phone ? ' — ' + phone : ''}`,
      });
    }
  }

  // ── Criação e reconexão ───────────────────────────────────────────────────

  async createSession(tenantId: string, nome: string) {
    const existing = await this.prisma.whatsappUnofficialSession.count({ where: { tenantId } });
    const maxWaSessions = await this.limitsService.resolveLimit(tenantId, 'maxWaSessions');
    if (maxWaSessions >= 0 && existing >= maxWaSessions) {
      throw new LimitExceededException('maxWaSessions', existing, maxWaSessions);
    }
    const session = await this.prisma.whatsappUnofficialSession.create({
      data: { tenantId, nome, status: 'CONNECTING' },
    });
    await this.connect(session.id);
    return session;
  }

  async deleteSession(sessionId: string) {
    this.manuallyDisconnected.add(sessionId);
    this.closeSocket(sessionId);
    this.lidToPhone.delete(sessionId);
    this.disconnectedAt.delete(sessionId);
    this.authStates.delete(sessionId);
    await this.prisma.whatsappUnofficialSession.delete({ where: { id: sessionId } });
  }

  async reconnectAll() {
    const sessions = await this.prisma.whatsappUnofficialSession.findMany({
      where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
      select: { id: true },
    });
    for (const s of sessions) {
      this.connect(s.id).catch((e) =>
        logger.warn(`Falha ao reconectar sessão ${s.id}: ${e?.message}`),
      );
    }
    logger.log(`Reconectando ${sessions.length} sessão(ões) WhatsApp Light`);
  }

  // Poda uma sessão específica. Se o socket estiver vivo neste processo, poda o
  // estado EM MEMÓRIA (mesmo objeto que o Baileys usa) pra manter tudo em
  // sincronia; senão poda direto no banco (sessão desconectada ou viva em outra
  // réplica). Nunca remove chave contact-scoped com atividade recente.
  async pruneSession(sessionId: string, opts?: AuthStatePruneOpts): Promise<AuthStatePruneResult> {
    const live = this.authStates.get(sessionId);
    if (live) return live.pruneNow(opts);
    return pruneAuthStateInDb(this.prisma, sessionId, opts);
  }

  // Roda a poda em TODAS as sessões de TODOS os tenants — chamada 1x/dia pelo
  // WaAuthPruneWorker. O vazamento é estrutural (nasce de como o auth-state é
  // guardado), não de um tenant específico, então a poda cobre todo mundo.
  async pruneAllSessions(opts?: AuthStatePruneOpts): Promise<{ sessions: number } & AuthStatePruneResult> {
    const sessions = await this.prisma.whatsappUnofficialSession.findMany({ select: { id: true } });
    let deletedPreKeys = 0;
    let deletedSessions = 0;

    for (const s of sessions) {
      try {
        const result = await this.pruneSession(s.id, opts);
        deletedPreKeys += result.deletedPreKeys;
        deletedSessions += result.deletedSessions;
        if (result.deletedPreKeys || result.deletedSessions) {
          logger.log(
            `🧹 Poda auth-state sessão=${s.id}: preKeys=${result.deletedPreKeys} sessões=${result.deletedSessions}`,
          );
        }
      } catch (e: any) {
        logger.warn(`Falha ao podar auth-state sessão=${s.id}: ${e?.message}`);
      }
    }

    logger.log(
      `🧹 Poda auth-state concluída: ${sessions.length} sessão(ões), ${deletedPreKeys} pre-keys removidas, ${deletedSessions} sessões de contato removidas`,
    );
    return { sessions: sessions.length, deletedPreKeys, deletedSessions };
  }

  async connect(sessionId: string) {
    if (this.sockets.has(sessionId)) {
      logger.warn(`Sessão ${sessionId} já possui socket ativo — ignorando connect`);
      return;
    }

    const authHandle = await useDatabaseAuthState(this.prisma, sessionId);
    const { state, saveCreds } = authHandle;
    this.authStates.set(sessionId, authHandle);
    const { version } = await fetchLatestBaileysVersion();

    // Hidrata o cache LID→telefone em memória a partir do que já foi persistido —
    // sem isso, todo restart/deploy zera o cache e mensagens do celular do corretor
    // pra contatos de baixa frequência (LID sem remoteJidAlt) somem até um novo inbound
    // re-popular o Map.
    try {
      const persisted = await this.prisma.whatsappUnofficialSession.findUnique({
        where: { id: sessionId },
        select: { lidPhoneMapJson: true },
      });
      const map = (persisted?.lidPhoneMapJson as Record<string, string> | null) ?? null;
      if (map) {
        let memMap = this.lidToPhone.get(sessionId);
        if (!memMap) { memMap = new Map(); this.lidToPhone.set(sessionId, memMap); }
        for (const [lid, phone] of Object.entries(map)) memMap.set(lid, phone);
      }
    } catch (e) {
      logger.warn(`Falha ao hidratar lidPhoneMapJson (sessão=${sessionId}): ${(e as Error).message}`);
    }

    const socket = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: pino({ level: 'silent' }),
    });

    this.sockets.set(sessionId, socket);

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.log(`QR gerado para sessão ${sessionId}`);
        const qrImage = await QRCode.toDataURL(qr, { width: 256, margin: 1 }).catch(() => qr);
        await this.prisma.whatsappUnofficialSession.update({
          where: { id: sessionId },
          data: { status: 'QR_PENDING', qrCode: qrImage },
        });
      }

      if (connection === 'open') {
        const phoneNumber = socket.user?.id?.split(':')[0] ?? null;
        const pushName = socket.user?.name ?? null;
        this.connectedAt.set(sessionId, Date.now()); // marca o momento de conexão

        // Se o processo reiniciou durante a queda, a memória perdeu `disconnectedAt` —
        // recupera do banco (persistido em connection.close) pra janela de catchup
        // continuar cobrindo a queda inteira, não só desde o boot do processo.
        if (!this.disconnectedAt.has(sessionId)) {
          const persisted = await this.prisma.whatsappUnofficialSession.findUnique({
            where: { id: sessionId },
            select: { lastDisconnectedAt: true },
          }).catch(() => null);
          if (persisted?.lastDisconnectedAt) {
            this.disconnectedAt.set(sessionId, persisted.lastDisconnectedAt.getTime());
          }
        }

        logger.log(`✅ WhatsApp Light conectado — sessão=${sessionId} número=${phoneNumber}`);
        await this.prisma.whatsappUnofficialSession.update({
          where: { id: sessionId },
          data: { status: 'CONNECTED', qrCode: null, phoneNumber, pushName },
        });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const isLoggedOut = reason === DisconnectReason.loggedOut;
        const manual = this.manuallyDisconnected.has(sessionId);
        const shouldReconnect = !manual;
        logger.warn(`Sessão ${sessionId} fechada — reason=${reason} loggedOut=${isLoggedOut} manual=${manual} reconnect=${shouldReconnect}`);
        const nowTs = Date.now();
        this.disconnectedAt.set(sessionId, nowTs);
        this.catchupSeenMsgIds.delete(sessionId); // nova queda → novo ciclo de dedup
        this.sockets.delete(sessionId);
        if (manual) this.manuallyDisconnected.delete(sessionId);

        // Persiste o momento da queda (não só em memória) — sobrevive a restart/deploy
        // e alimenta a busca automática de "desde quando" no botão de recuperar mensagens perdidas.
        // Só grava na primeira queda de uma sequência (evita sobrescrever com retries de reconexão).
        const existing = await this.prisma.whatsappUnofficialSession.findUnique({
          where: { id: sessionId },
          select: { lastDisconnectedAt: true, status: true },
        }).catch(() => null);
        const alreadyDown = existing && existing.status !== 'CONNECTED';
        const lastDisconnectedAt = alreadyDown && existing?.lastDisconnectedAt ? undefined : new Date(nowTs);

        if (shouldReconnect) {
          // Logout invalida as creds no servidor do WA — limpa para forçar novo QR
          await this.prisma.whatsappUnofficialSession.update({
            where: { id: sessionId },
            data: {
              status: 'CONNECTING',
              ...(lastDisconnectedAt ? { lastDisconnectedAt } : {}),
              ...(isLoggedOut ? { authStateJson: Prisma.DbNull } : {}),
            },
          }).catch(() => {});
          setTimeout(() => this.connect(sessionId).catch(() => {}), 5000);
        } else {
          await this.prisma.whatsappUnofficialSession.update({
            where: { id: sessionId },
            data: { status: 'DISCONNECTED', ...(lastDisconnectedAt ? { lastDisconnectedAt } : {}) },
          }).catch(() => {});
        }
      }
    });

    // Popula mapa LID→phone quando contatos são sincronizados (acontece na conexão)
    socket.ev.on('contacts.upsert', (contacts) => {
      this.updateLidMap(sessionId, contacts);
    });
    socket.ev.on('contacts.update', (updates) => {
      this.updateLidMap(sessionId, updates as any[]);
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const connectionTs = this.connectedAt.get(sessionId) ?? Date.now();
      const disconnectedAt = this.disconnectedAt.get(sessionId);
      // Janela de catchup: processa mensagens desde a última desconexão. Teto de
      // segurança de 48h (cobre o cenário de restrição do WhatsApp, que pode ficar
      // até ~24h fora) — antes era só 10min, o que descartava tudo que chegou durante
      // quedas longas mesmo o WhatsApp reentregando via este mesmo canal ao vivo.
      // Se não há registro de desconexão (restart abrupto sem `lastDisconnectedAt`
      // persistido), usa 60s antes da conexão.
      const maxCatchupMs = 48 * 60 * 60 * 1000;
      const cutoff = disconnectedAt
        ? Math.max(disconnectedAt - 2_000, connectionTs - maxCatchupMs)
        : connectionTs - 60_000;

      let seen = this.catchupSeenMsgIds.get(sessionId);
      if (!seen) {
        seen = new Set<string>();
        this.catchupSeenMsgIds.set(sessionId, seen);
      }

      for (const msg of messages) {
        const msgTs = (msg.messageTimestamp as number) * 1000;
        if (msgTs < cutoff) continue;

        // Dedup: janela ampliada pode receber o mesmo backlog em reconexões seguidas.
        const dedupKey = msg.key?.id;
        if (dedupKey) {
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
        }

        if (msg.key.fromMe) {
          const msgId = msg.key.id;
          if (msgId && this.recentlySentByCrm.has(msgId)) {
            // Eco do próprio envio do CRM (sendText/sendImage/sendVideo/sendDocument) — ignora.
            this.recentlySentByCrm.delete(msgId);
            continue;
          }
          // Mensagem genuína enviada direto do celular do corretor (mesma conta, outro dispositivo).
          await this.handleOutboundFromPhone(sessionId, msg).catch((e) =>
            logger.error(`Erro ao processar outbound-from-phone sessão=${sessionId}: ${e?.message}`),
          );
          continue;
        }

        await this.handleInbound(sessionId, msg).catch((e) =>
          logger.error(`Erro ao processar inbound sessão=${sessionId}: ${e?.message}`),
        );
      }
    });

    // Confirmação de leitura (✓✓ azul): status de entrega/leitura das mensagens enviadas.
    socket.ev.on('messages.update', async (updates) => {
      for (const u of updates) {
        await this.handleMessageStatusUpdate(sessionId, u).catch((e) =>
          logger.error(`Erro ao processar messages.update sessão=${sessionId}: ${e?.message}`),
        );
      }
    });

    // Histórico (on-demand): resultados de `fetchMessageHistory` chegam aqui.
    // Só age quando há uma importação ativa para a sessão — caso contrário ignora,
    // para não interferir no fluxo normal de mensagens novas.
    socket.ev.on('messaging-history.set', async ({ messages }) => {
      const ctx = this.historyImports.get(sessionId);
      if (!ctx || !messages?.length) return;
      logger.log(`📜 messaging-history.set sessão=${sessionId} msgs=${messages.length} (import ativo)`);
      for (const msg of messages) {
        await this.persistHistoryMessage(ctx, msg).catch((e) =>
          logger.warn(`Erro ao persistir histórico sessão=${sessionId}: ${e?.message}`),
        );
      }
    });
  }

  async disconnect(sessionId: string) {
    this.manuallyDisconnected.add(sessionId);
    this.closeSocket(sessionId);
    this.authStates.delete(sessionId); // desconexão manual não reconecta sozinha — não fica handle zumbi em memória
    await this.prisma.whatsappUnofficialSession.update({
      where: { id: sessionId },
      data: { status: 'DISCONNECTED' },
    });
  }

  private closeSocket(sessionId: string) {
    const socket = this.sockets.get(sessionId);
    if (socket) {
      try { socket.end(undefined); } catch {}
      this.sockets.delete(sessionId);
    }
  }

  // ── Envio de mensagens ────────────────────────────────────────────────────

  async sendText(sessionId: string, to: string, text: string): Promise<{ id: string | null }> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = await this.resolveJid(socket, to);
    const messageId = generateMessageID();
    this.rememberSentByCrm(messageId);
    await socket.sendMessage(jid, { text }, { messageId });
    return { id: messageId };
  }

  async sendImage(sessionId: string, to: string, content: string | Buffer, caption?: string): Promise<{ id: string | null }> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = await this.resolveJid(socket, to);
    const image: any = Buffer.isBuffer(content) ? content : { url: content };
    const messageId = generateMessageID();
    this.rememberSentByCrm(messageId);
    await socket.sendMessage(jid, {
      image,
      caption: caption ?? undefined,
    }, { messageId });
    return { id: messageId };
  }

  async sendVideo(sessionId: string, to: string, content: string | Buffer, caption?: string): Promise<{ id: string | null }> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = this.toJid(to);
    const video: any = Buffer.isBuffer(content) ? content : { url: content };
    const messageId = generateMessageID();
    this.rememberSentByCrm(messageId);
    await socket.sendMessage(jid, {
      video,
      caption: caption ?? undefined,
    }, { messageId });
    return { id: messageId };
  }

  async sendDocument(sessionId: string, to: string, content: string | Buffer, filename: string, mimetype?: string): Promise<{ id: string | null }> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = await this.resolveJid(socket, to);
    const document: any = Buffer.isBuffer(content) ? content : { url: content };
    const messageId = generateMessageID();
    this.rememberSentByCrm(messageId);
    await socket.sendMessage(jid, {
      document,
      fileName: filename,
      mimetype: mimetype ?? 'application/octet-stream',
    }, { messageId });
    return { id: messageId };
  }

  // ── Processamento de áudio inbound (download + Cloudinary + Whisper) ───────

  private async processAudioInbound(msg: any, rawMime: string): Promise<{ mediaUrl: string | null; mimeType: string | null; transcription: string | null }> {
    let buffer: Buffer;
    try {
      buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
      if (!buffer || buffer.length === 0) return { mediaUrl: null, mimeType: null, transcription: null };
    } catch (err: any) {
      logger.warn(`⚠️ Erro ao baixar áudio inbound (Baileys): ${err?.message}`);
      return { mediaUrl: null, mimeType: null, transcription: null };
    }

    const mimeType = rawMime.split(';')[0].trim();
    const ext = mimeType.includes('mp4') ? 'mp4' : 'ogg';

    let mediaUrl: string | null = null;
    try {
      mediaUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'via-crm/whatsapp-light/audio', resource_type: 'video', format: ext, type: 'upload', access_mode: 'public' },
          (err, result) => (err || !result ? reject(err) : resolve(result.secure_url)),
        );
        Readable.from(buffer).pipe(stream);
      });
    } catch (err: any) {
      logger.warn(`⚠️ Erro ao subir áudio inbound ao Cloudinary: ${err?.message}`);
      return { mediaUrl: null, mimeType: null, transcription: null };
    }

    // A partir daqui o áudio já está salvo no Cloudinary — falha na transcrição
    // não pode descartar a mediaUrl, senão o download no CRM também quebra.
    try {
      const model = await resolveAiModel(this.prisma, 'TRANSCRIPTION');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const audioFile = new File([new Uint8Array(buffer)], `audio.${ext}`, { type: mimeType });
      const result = await openai.audio.transcriptions.create({ file: audioFile, model, language: 'pt' });

      logger.log(`🎤 Áudio transcrito (${buffer.length} bytes): "${result.text.slice(0, 80)}"`);
      return { mediaUrl, mimeType, transcription: result.text };
    } catch (err: any) {
      logger.warn(`⚠️ Erro ao transcrever áudio inbound (Whisper): ${err?.message}`);
      return { mediaUrl, mimeType, transcription: null };
    }
  }

  // ── Processamento de mídia inbound (image/video/document → Cloudinary) ──

  private async processMediaInbound(
    msg: any,
    type: 'image' | 'video' | 'document',
  ): Promise<{ mediaUrl: string | null; mimeType: string | null; filename: string | null }> {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
      if (!buffer || buffer.length === 0) return { mediaUrl: null, mimeType: null, filename: null };

      const inner =
        msg.message?.documentWithCaptionMessage?.message ||
        msg.message?.viewOnceMessage?.message ||
        msg.message?.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
        msg.message?.ephemeralMessage?.message ||
        msg.message || {};

      let rawMime: string;
      let filename: string | null = null;
      let resourceType: 'image' | 'video' | 'raw';

      if (type === 'image') {
        rawMime = inner.imageMessage?.mimetype ?? 'image/jpeg';
        resourceType = 'image';
      } else if (type === 'video') {
        rawMime = inner.videoMessage?.mimetype ?? 'video/mp4';
        resourceType = 'video';
      } else {
        rawMime = inner.documentMessage?.mimetype ?? 'application/octet-stream';
        filename = inner.documentMessage?.fileName ?? null;
        resourceType = 'raw';
      }

      const mimeType = rawMime.split(';')[0].trim();

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'via-crm/whatsapp-light/files', resource_type: resourceType, type: 'upload', access_mode: 'public' },
          (err, result) => (err || !result ? reject(err) : resolve(result.secure_url)),
        );
        Readable.from(buffer).pipe(stream);
      });

      logger.log(`📎 Mídia inbound (${type}, ${buffer.length} bytes) salva no Cloudinary`);
      return { mediaUrl, mimeType, filename };
    } catch (err: any) {
      logger.warn(`⚠️ Erro ao processar mídia inbound (${type}): ${err?.message}`);
      return { mediaUrl: null, mimeType: null, filename: null };
    }
  }

  // ── Importação de histórico antigo (backfill de mensagens) ─────────────────

  // Persiste UMA mensagem histórica como LeadEvent, de forma inerte:
  // sem mexer em lastInboundAt/conversaCanal/SLA, sem acionar IA, sem criar lead.
  // Atribui ao lead dono do `remoteJid` (já conhecido no contexto) e deduplica por `key.id`.
  private async persistHistoryMessage(ctx: HistoryImportCtx, msg: any) {
    const jid: string | undefined = msg?.key?.remoteJid;
    if (!jid) return;
    const target = ctx.jidToLead.get(jid);
    if (!target) return; // não é um lead rastreado nesta importação

    const keyId: string | undefined = msg?.key?.id;
    if (!keyId || target.knownKeyIds.has(keyId)) return; // dedup

    const { type, text } = extractBaileysText(msg.message);
    if (type === 'reaction') return; // reações não viram evento

    const channel = msg.key.fromMe ? 'whatsapp.unofficial.out' : 'whatsapp.unofficial.in';
    const tsSec = Number(msg.messageTimestamp) || 0;
    const criadoEm = tsSec > 0 ? new Date(tsSec * 1000) : new Date();

    // Rastreia a mensagem mais antiga desta página para avanço de âncora
    if (tsSec > 0 && tsSec < (ctx.minTsThisPage ?? Infinity)) {
      ctx.minTsThisPage = tsSec;
      ctx.minKeyThisPage = msg.key;
    }

    // Filtra mensagens anteriores ao since (backfill de gap recente)
    if (ctx.since && criadoEm < ctx.since) return;

    // Mídia best-effort: imagem/vídeo/documento sobem ao Cloudinary; áudio sobe sem transcrever.
    let media: { url: string; mimeType: string; filename: string | null; kind: string } | null = null;
    let audioMediaUrl: string | null = null;
    let audioMimeType: string | null = null;
    if (ctx.processMedia) {
      if (type === 'image' || type === 'video' || type === 'document') {
        const r = await this.processMediaInbound(msg, type);
        if (r.mediaUrl) {
          media = { url: r.mediaUrl, mimeType: r.mimeType ?? 'application/octet-stream', filename: r.filename, kind: type };
        }
      } else if (type === 'audio') {
        const a = await this.processHistoryAudio(msg);
        audioMediaUrl = a.mediaUrl;
        audioMimeType = a.mimeType;
      }
    }

    await this.prisma.leadEvent.create({
      data: {
        tenantId: ctx.tenantId,
        leadId: target.leadId,
        channel,
        isReentry: false,
        criadoEm, // sobrescreve @default(now()) — preserva a ordem cronológica real
        payloadRaw: {
          from: jid,
          type,
          text,
          rawMsg: msg,
          historyImport: true,
          ...(audioMediaUrl ? { mediaUrl: audioMediaUrl } : {}),
          ...(audioMimeType ? { mimeType: audioMimeType } : {}),
          ...(media ? { media } : {}),
        },
      },
    });

    target.knownKeyIds.add(keyId);
    ctx.inserted++;
  }

  // Upload de áudio histórico ao Cloudinary (sem transcrição Whisper — economiza custo/tempo).
  private async processHistoryAudio(msg: any): Promise<{ mediaUrl: string | null; mimeType: string | null }> {
    try {
      const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
      if (!buffer || buffer.length === 0) return { mediaUrl: null, mimeType: null };
      const inner =
        msg.message?.viewOnceMessage?.message ||
        msg.message?.ephemeralMessage?.message ||
        msg.message || {};
      const rawMime: string = inner?.audioMessage?.mimetype ?? 'audio/ogg; codecs=opus';
      const mimeType = rawMime.split(';')[0].trim();
      const ext = mimeType.includes('mp4') ? 'mp4' : 'ogg';
      const mediaUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'via-crm/whatsapp-light/audio', resource_type: 'video', format: ext, type: 'upload', access_mode: 'public' },
          (err, result) => (err || !result ? reject(err) : resolve(result.secure_url)),
        );
        Readable.from(buffer).pipe(stream);
      });
      return { mediaUrl, mimeType };
    } catch (err: any) {
      logger.warn(`⚠️ Erro ao subir áudio histórico: ${err?.message}`);
      return { mediaUrl: null, mimeType: null };
    }
  }

  // Carrega a âncora (msg mais antiga/recente com key) e o set de key.id já conhecidos de um lead.
  // Eventos inbound (e histórico importado) guardam o rawMsg completo do Baileys — dali sai a
  // âncora "ideal" (key + remoteJid + timestamp reais). Mas leads de campanha que ainda não
  // responderam só têm eventos OUTBOUND (enviados por nós/IA), que guardam só `sourceRef`
  // (o messageId do Baileys), sem o rawMsg — mesmo assim é uma key válida na mesma conversa,
  // então serve de âncora quando não existe nenhum evento inbound ainda (senão nunca dava pra
  // recuperar mensagens perdidas de quem nunca respondeu antes da queda de conexão).
  private async loadLeadAnchor(
    leadId: string,
    strategy: 'oldest' | 'newest' = 'oldest',
    fallbackPhone?: string | null,
  ): Promise<{
    knownKeyIds: Set<string>;
    anchorKey: any;
    anchorTs: number;
    anchorJid: string;
  } | null> {
    const events = await this.prisma.leadEvent.findMany({
      where: { leadId, channel: { in: WA_LIGHT_CHANNELS } },
      select: { channel: true, sourceRef: true, payloadRaw: true, criadoEm: true },
      orderBy: { criadoEm: strategy === 'newest' ? 'desc' : 'asc' },
    });
    const knownKeyIds = new Set<string>();
    let anchor: { key: any; ts: number; jid: string } | null = null;
    const fallbackJid = fallbackPhone ? this.toJid(fallbackPhone) : null;
    for (const ev of events) {
      const r = (ev.payloadRaw as any)?.rawMsg;
      const kid = r?.key?.id;
      if (kid) knownKeyIds.add(kid);
      if (ev.sourceRef) knownKeyIds.add(ev.sourceRef);
      // Para 'newest': itera desc, pega o primeiro válido (= mais recente)
      // Para 'oldest': itera asc, pega o primeiro válido (= mais antigo)
      if (!anchor && r?.key?.id && r?.key?.remoteJid) {
        anchor = { key: r.key, ts: Number(r.messageTimestamp) || 0, jid: r.key.remoteJid };
      } else if (!anchor && ev.sourceRef && fallbackJid) {
        anchor = {
          key: { id: ev.sourceRef, remoteJid: fallbackJid, fromMe: true },
          ts: Math.floor(new Date(ev.criadoEm).getTime() / 1000),
          jid: fallbackJid,
        };
      }
    }
    if (!anchor) return null;
    return { knownKeyIds, anchorKey: anchor.key, anchorTs: anchor.ts, anchorJid: anchor.jid };
  }

  // Backfill do histórico de UM lead.
  // anchorStrategy:
  //   'oldest' (padrão) — pagina para trás a partir do evento mais antigo (recupera história pré-CRM)
  //   'newest'          — pagina para trás a partir do evento mais recente em direção a `since`
  //                       (preenche gap de período recente onde msgs do celular não eram capturadas)
  async backfillLeadHistory(
    leadId: string,
    opts?: {
      maxPages?: number;
      pageSize?: number;
      delayMs?: number;
      processMedia?: boolean;
      since?: Date;
      anchorStrategy?: 'oldest' | 'newest';
    },
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, tenantId: true, conversaSessionId: true, numero: true, nome: true, telefone: true },
    });
    if (!lead) throw new BadRequestException('Lead não encontrado');
    const sessionId = lead.conversaSessionId;
    if (!sessionId) throw new BadRequestException('Lead sem sessão WhatsApp Light vinculada (conversaSessionId)');
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão Light ${sessionId} não está conectada`);
    if (this.historyImports.has(sessionId)) {
      throw new BadRequestException('Já existe uma importação de histórico em andamento nesta sessão');
    }

    const anchorStrategy = opts?.anchorStrategy ?? 'oldest';
    const anchor = await this.loadLeadAnchor(leadId, anchorStrategy, lead.telefone);
    if (!anchor) {
      throw new BadRequestException('Lead sem âncora — nenhum evento Light com rawMsg.key para paginar o histórico');
    }

    const pageSize = opts?.pageSize ?? 50;
    const maxPages = opts?.maxPages ?? 10;
    const delayMs = opts?.delayMs ?? 6000;
    const processMedia = opts?.processMedia ?? true;
    const since = opts?.since;

    const ctx: HistoryImportCtx = {
      tenantId: lead.tenantId,
      jidToLead: new Map([[anchor.anchorJid, { leadId, knownKeyIds: anchor.knownKeyIds }]]),
      inserted: 0,
      processMedia,
      since,
      minTsThisPage: Infinity,
      minKeyThisPage: null,
    };
    this.historyImports.set(sessionId, ctx);

    let pages = 0;
    let curKey = anchor.anchorKey;
    let curTs = anchor.anchorTs;
    try {
      for (pages = 0; pages < maxPages; pages++) {
        const before = ctx.inserted;
        ctx.minTsThisPage = Infinity;
        ctx.minKeyThisPage = null;

        logger.log(`📜 fetchMessageHistory lead=#${lead.numero} page=${pages + 1} anchorTs=${curTs} strategy=${anchorStrategy}`);
        await socket.fetchMessageHistory(pageSize, curKey, curTs);
        await sleep(delayMs);

        if (ctx.inserted === before) break; // nada novo chegou → fim do histórico disponível

        if (anchorStrategy === 'newest' && ctx.minKeyThisPage) {
          // Para 'newest': avança pela página atual (não pelo DB — o oldest no DB é anterior ao gap)
          curKey = ctx.minKeyThisPage;
          curTs = ctx.minTsThisPage;
        } else {
          // Para 'oldest': avança para a mensagem mais antiga agora armazenada no DB
          const oldest = await this.prisma.leadEvent.findFirst({
            where: { leadId, channel: { in: WA_LIGHT_CHANNELS } },
            select: { payloadRaw: true },
            orderBy: { criadoEm: 'asc' },
          });
          const ro = (oldest?.payloadRaw as any)?.rawMsg;
          if (!ro?.key?.id) break;
          curKey = ro.key;
          curTs = Number(ro.messageTimestamp) || 0;
        }

        // Parar quando já passamos da data-limite (since)
        if (since && curTs > 0 && curTs * 1000 < since.getTime()) break;
      }
    } finally {
      this.historyImports.delete(sessionId);
    }

    logger.log(`📜 Backfill lead=#${lead.numero} concluído — inseridos=${ctx.inserted} páginas=${pages} strategy=${anchorStrategy}`);
    return { leadId, numero: lead.numero, nome: lead.nome, inserted: ctx.inserted, pages };
  }

  // ── Recuperação de mensagens perdidas (self-service, tenant) ───────────────
  // Wrapper tenant-scoped sobre backfillLeadHistory — usado pelo botão "Buscar
  // mensagens perdidas" em /settings/whatsapp (OWNER/MANAGER). Diferente do
  // endpoint de admin (livre, qualquer sessão): valida que a sessão pertence
  // ao tenant, e o `since` é automático (lastDisconnectedAt da sessão), a não
  // ser que o chamador informe uma data manual (usuário "aumentando" a janela).
  async recoverMissedMessages(
    tenantId: string,
    sessionId: string,
    opts?: { since?: Date },
  ) {
    const session = await this.prisma.whatsappUnofficialSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true, lastDisconnectedAt: true },
    });
    if (!session) throw new BadRequestException('Sessão WhatsApp Light não encontrada.');

    const since = opts?.since ?? session.lastDisconnectedAt;
    if (!since) {
      throw new BadRequestException('Nenhuma queda de conexão registrada para esta sessão — nada a recuperar.');
    }

    const leads = await this.prisma.lead.findMany({
      where: { conversaSessionId: sessionId, deletedAt: null },
      select: { id: true, numero: true, nome: true },
      orderBy: { criadoEm: 'asc' },
    });

    const skipReasonPatterns = [/sem âncora/i, /não está conectada/i, /sem sessão/i];
    type LeadResult = {
      leadId: string;
      numero: number | null;
      nome: string | null;
      status: 'ok' | 'skipped' | 'error';
      inserted?: number;
      reason?: string;
    };
    const results: LeadResult[] = [];
    let ok = 0;
    let skipped = 0;
    let errored = 0;
    let totalInserted = 0;

    logger.log(`📜 Recuperação de mensagens perdidas iniciada — sessão=${sessionId} desde=${since.toISOString()} leads=${leads.length}`);

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      try {
        const r = await this.backfillLeadHistory(lead.id, {
          anchorStrategy: 'newest',
          since,
          maxPages: 20,
          pageSize: 50,
          delayMs: 4000,
          processMedia: true,
        });
        ok++;
        totalInserted += r.inserted ?? 0;
        results.push({ leadId: lead.id, numero: lead.numero, nome: lead.nome, status: 'ok', inserted: r.inserted });
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        const isSkip = skipReasonPatterns.some((p) => p.test(reason));
        if (isSkip) {
          skipped++;
          results.push({ leadId: lead.id, numero: lead.numero, nome: lead.nome, status: 'skipped', reason });
        } else {
          errored++;
          results.push({ leadId: lead.id, numero: lead.numero, nome: lead.nome, status: 'error', reason });
          logger.warn(`⚠️ [recuperar mensagens sessão ${sessionId}] lead #${lead.numero} erro — ${reason}`);
        }
      }

      if (i < leads.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    logger.log(
      `📜 Recuperação de mensagens perdidas concluída — sessão=${sessionId} total=${leads.length} ok=${ok} skipped=${skipped} erro=${errored} inseridos=${totalInserted}`,
    );

    return {
      sessionId,
      since: since.toISOString(),
      totalLeads: leads.length,
      ok,
      skipped,
      errored,
      totalInserted,
      results,
    };
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getStatus(sessionId: string) {
    return this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { id: true, nome: true, status: true, qrCode: true, phoneNumber: true, pushName: true, lastDisconnectedAt: true },
    });
  }

  async listSessions(tenantId: string) {
    return this.prisma.whatsappUnofficialSession.findMany({
      where: { tenantId },
      select: { id: true, nome: true, status: true, phoneNumber: true, pushName: true, createdAt: true, lastDisconnectedAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Processamento de mensagem recebida ────────────────────────────────────

  private async handleInbound(sessionId: string, msg: any) {
    const session = await this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { tenantId: true, phoneNumber: true },
    });
    if (!session) return;

    const { tenantId } = session;
    const from: string = msg.key.remoteJid ?? '';

    // Ignora mensagens enviadas pelo próprio dispositivo (sync, "Recados", auto-mensagens)
    if (msg.key.fromMe) return;

    // Ignora grupos, status e newsletters — nunca criam leads
    if (from.endsWith('@g.us')) return;
    if (from === 'status@broadcast' || from.endsWith('@newsletter')) return;

    // Ignora mensagens cuja origem seja o próprio número da sessão
    // (notificações do WhatsApp, mensagens salvas, echo de outros dispositivos)
    if (session.phoneNumber) {
      const ownDigits = digitsOnly(session.phoneNumber);
      const fromDigits = digitsOnly(from.split('@')[0].split(':')[0]);
      if (ownDigits && fromDigits && fromDigits === ownDigits) {
        logger.log(`Inbound ignorado: mensagem do próprio número da sessão (sessão=${sessionId})`);
        return;
      }
    }

    // Resolve JID para telefone. WhatsApp multi-device pode entregar LIDs
    // internos (ex: '95236772601989@lid'), que não podem virar telefone de lead.
    let phone: string | null;
    let unresolvedLid: string | null = null;
    if (from.endsWith('@lid')) {
      const lid = lidFromJid(from);
      const resolved = lid ? await this.resolveLidPhone(sessionId, lid, msg) : null;
      if (resolved) {
        phone = resolved;
        logger.log(`LID ${lid} resolvido → ${phone}`);
      } else {
        phone = null;
        unresolvedLid = lid;
        logger.warn(`LID ${lid} sem mapeamento — aguardando resolução por campanha (sessão=${sessionId})`);
      }
    } else {
      phone = phoneFromJid(from) ?? from.split('@')[0].split(':')[0];
    }
    const contactName: string | null = (msg.pushName as string | null) || null;

    // Extrai texto e tipo da mensagem
    const { type, text } = extractBaileysText(msg.message);

    // Reações não criam lead nem evento
    if (type === 'reaction') return;

    // Processa áudio: baixa buffer, sobe ao Cloudinary, transcreve com Whisper
    let audioMediaUrl: string | null = null;
    let audioMimeType: string | null = null;
    let audioTranscription: string | null = null;
    if (type === 'audio') {
      const inner = msg.message?.viewOnceMessage?.message ||
                    msg.message?.ephemeralMessage?.message ||
                    msg.message || {};
      const rawMime: string = inner?.audioMessage?.mimetype ?? 'audio/ogg; codecs=opus';
      const audioResult = await this.processAudioInbound(msg, rawMime);
      audioMediaUrl = audioResult.mediaUrl;
      audioMimeType = audioResult.mimeType;
      audioTranscription = audioResult.transcription;
    }

    // Processa imagem/vídeo/documento: baixa buffer via Baileys, sobe ao Cloudinary
    let inboundMedia: { url: string; mimeType: string; filename: string | null; kind: string } | null = null;
    if (type === 'image' || type === 'video' || type === 'document') {
      const result = await this.processMediaInbound(msg, type);
      if (result.mediaUrl) {
        inboundMedia = {
          url: result.mediaUrl,
          mimeType: result.mimeType ?? 'application/octet-stream',
          filename: result.filename,
          kind: type,
        };
      }
    }

    // Verifica se é contato de disparo aguardando resposta
    const phoneSuffix = phone ? phoneMatchSuffix(phone) : '';
    let contatoDisparo = phoneSuffix
      ? await this.prisma.campanhaContato.findFirst({
          where: {
            telefone: { endsWith: phoneSuffix },
            status: 'ENVIADO',
            disparo: { tenantId, sessionId, status: { in: ['RODANDO', 'PAUSADA', 'CONCLUIDA'] } },
          },
          include: {
            disparo: { include: { modelo: { select: { mensagem: true } } } },
          },
        })
      : null;

    if (!contatoDisparo && unresolvedLid) {
      const candidates = await this.prisma.campanhaContato.findMany({
        where: {
          status: 'ENVIADO',
          leadId: null,
          disparo: { tenantId, sessionId, status: { in: ['RODANDO', 'PAUSADA', 'CONCLUIDA'] } },
        },
        include: {
          disparo: { include: { modelo: { select: { mensagem: true } } } },
        },
        orderBy: { enviadoEm: 'desc' },
        take: 2,
      });

      const nameMatches = contactName
        ? candidates.filter((candidate) => namesLookRelated(candidate.nome, contactName))
        : [];
      const selected = nameMatches.length === 1
        ? nameMatches[0]
        : candidates.length === 1
          ? candidates[0]
          : null;

      if (selected) {
        contatoDisparo = selected;
        phone = contatoDisparo.telefone;
        logger.warn(`LID ${unresolvedLid} casado com campanha contato=${contatoDisparo.id} telefone=${phone}`);
      } else {
        logger.warn(`LID ${unresolvedLid} sem campanha inequivoca; candidates=${candidates.length} nameMatches=${nameMatches.length}`);
      }
    }

    if (contatoDisparo) {
      phone = contatoDisparo.telefone;
    }

    if (!phone) {
      logger.warn(`Inbound WhatsApp Light ignorado: LID ${unresolvedLid} sem telefone real (sessão=${sessionId})`);
      return;
    }

    // Mensagens silenciosas de contato de campanha: acumula como preview sem criar lead
    if (contatoDisparo && SILENT_INBOUND_TYPES.has(type)) {
      const preview = { type, text, at: new Date().toISOString() };
      const existing = (contatoDisparo.previewMessages as any[] | null) ?? [];
      await this.prisma.campanhaContato.update({
        where: { id: contatoDisparo.id },
        data: { previewMessages: [...existing, preview] },
      });
      logger.log(`Mensagem silenciosa (${type}) de campanha → previewMessages contatoId=${contatoDisparo.id}`);
      return;
    }

    if (contatoDisparo) {
      await this.prisma.$transaction(async (tx) => {
        await tx.campanhaContato.update({
          where: { id: contatoDisparo.id },
          data: { status: 'RESPONDEU', respondeuEm: new Date() },
        });
        await tx.campanhaDisparo.update({
          where: { id: contatoDisparo.disparoId },
          data: { responderam: { increment: 1 } },
        });
      });

      // Reativação da Base Fria: se o lead vinculado à campanha está na etapa
      // BASE_FRIA, volta para NOVO_LEAD e marca passouBaseFria (SLA pula + IA não
      // assume; o corretor é notificado após o silêncio via base-fria-settle).
      if (contatoDisparo.leadId) {
        try {
          const bfLead = await this.prisma.lead.findFirst({
            where: { id: contatoDisparo.leadId, tenantId, deletedAt: null, stage: { key: { startsWith: 'BASE_FRIA' } } },
            select: { id: true, stage: { select: { name: true } } },
          });
          if (bfLead) {
            const novoLeadStage =
              (await this.prisma.pipelineStage.findFirst({
                where: { tenantId, key: 'NOVO_LEAD', isActive: true },
                select: { id: true, name: true, pipelineId: true },
              })) ??
              (await this.prisma.pipelineStage.findFirst({
                where: { tenantId, isActive: true },
                orderBy: { sortOrder: 'asc' },
                select: { id: true, name: true, pipelineId: true },
              }));
            if (novoLeadStage) {
              await this.prisma.lead.update({
                where: { id: bfLead.id },
                data: {
                  stageId: novoLeadStage.id,
                  ...(novoLeadStage.pipelineId ? { pipelineId: novoLeadStage.pipelineId } : {}),
                  passouBaseFria: true,
                  baseFriaDesde: null,
                },
              });
              await this.prisma.leadTransitionLog.create({
                data: {
                  tenantId,
                  leadId: bfLead.id,
                  fromStage: bfLead.stage?.name ?? 'Base Fria',
                  toStage: novoLeadStage.name,
                  changedBy: 'SYSTEM',
                  cascade: true,
                },
              });
              await this.prisma.leadEvent.create({
                data: { tenantId, leadId: bfLead.id, channel: 'base_fria.reactivated', payloadRaw: { at: new Date().toISOString() } },
              });
              logger.log(`❄️→🔥 Lead reativado da Base Fria leadId=${bfLead.id}`);
            }
          }
        } catch (e: any) {
          logger.warn(`Falha ao reativar lead da Base Fria: ${e?.message ?? e}`);
        }
      }
    }

    // Foto do contato — fire-and-forget, não bloqueia o processamento
    const socket = this.sockets.get(sessionId);
    const jid = `${phone}@s.whatsapp.net`;
    let avatarUrl: string | null = null;
    if (socket) {
      avatarUrl = await Promise.race([
        socket.profilePictureUrl(jid, 'image').catch((): null => null),
        new Promise<null>((r) => setTimeout(() => r(null), 2000)),
      ]) ?? null;
    }

    // Cria/atualiza lead e cria LeadEvent (inbound)
    const { leadId, isReentry, assignedUserId } = await upsertLeadFromWhatsapp(this.prisma, this.queue, {
      tenantId,
      from: phone,
      text: text,
      type,
      sessionId,
      rawMsg: msg,
      contactName,
      avatarUrl,
      mediaUrl: audioMediaUrl,
      mimeType: audioMimeType,
      transcription: audioTranscription,
      media: inboundMedia,
    });

    // Notifica o corretor responsável quando um lead NOVO entra pelo WhatsApp Light.
    // Só lead novo (não reentrada), só mensagens reais (não silenciosas), só o responsável.
    const SILENT_TYPES = new Set(['reaction', 'system', 'sticker', 'poll', 'edited', 'unknown']);
    if (!isReentry && assignedUserId && !SILENT_TYPES.has(type)) {
      this.notifyResponsibleNewLead(tenantId, assignedUserId, contactName, phone, sessionId).catch(() => {});
    }

    // Se é resposta de campanha e o lead NÃO foi criado pelo worker (fluxo legado),
    // registra a mensagem original + previews acumulados como contexto para a IA
    if (contatoDisparo && !contatoDisparo.leadId) {
      const sentAt = new Date(Date.now() - 2000);

      // 1. Mensagem original da campanha (outbound)
      const mensagemOriginal = contatoDisparo.disparo?.modelo?.mensagem;
      if (mensagemOriginal) {
        const textoEnviado = mensagemOriginal
          .replace(/\{\{nome\}\}/gi, contatoDisparo.nome || 'Prezado(a)')
          .replace(/\{\{telefone\}\}/gi, contatoDisparo.telefone);
        await this.prisma.leadEvent.create({
          data: {
            tenantId,
            leadId,
            channel: 'whatsapp.unofficial.out',
            criadoEm: sentAt,
            payloadRaw: {
              text: textoEnviado,
              source: 'campanha',
              disparoId: contatoDisparo.disparoId,
              sentAt: sentAt.toISOString(),
            },
          },
        });
      }

      // 2. Replay das mensagens silenciosas acumuladas antes da resposta real
      const previews = (contatoDisparo.previewMessages as any[] | null) ?? [];
      for (const preview of previews) {
        const previewAt = preview.at ? new Date(preview.at) : new Date(sentAt.getTime() + 500);
        await this.prisma.leadEvent.create({
          data: {
            tenantId,
            leadId,
            channel: 'whatsapp.unofficial.in',
            criadoEm: previewAt,
            payloadRaw: {
              type: preview.type,
              text: preview.text,
              source: 'campanha.preview',
            },
          },
        });
      }

      // 3. Vincula o lead ao contato da campanha
      await this.prisma.campanhaContato.update({
        where: { id: contatoDisparo.id },
        data: { leadId },
      });
    }
  }

  // ── Mensagem enviada direto do celular do corretor (fora do CRM) ───────────
  //
  // WhatsApp multi-device entrega `fromMe: true` tanto pro eco do próprio envio do CRM
  // quanto pra mensagens mandadas pelo corretor direto no app do celular (mesma conta,
  // outro dispositivo). O listener já filtrou o eco (via `recentlySentByCrm`) antes de
  // chegar aqui — então isso é sempre uma mensagem genuína do celular do corretor.
  //
  // Regras: nunca cria lead novo (só anexa a leads já existentes); dedup por
  // `sourceRef` (waMessageId).
  private async handleOutboundFromPhone(sessionId: string, msg: any) {
    const session = await this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });
    if (!session) return;
    const { tenantId } = session;

    const to: string = msg.key.remoteJid ?? '';
    if (!to) return;
    // Mesmos filtros de sempre — nunca vira LeadEvent de grupo/broadcast/newsletter
    if (to.endsWith('@g.us')) return;
    if (to === 'status@broadcast' || to.endsWith('@newsletter')) return;

    let phone: string | null;
    let lidForLog: string | null = null;
    if (to.endsWith('@lid')) {
      const lid = lidFromJid(to);
      lidForLog = lid;
      phone = lid ? await this.resolveLidPhone(sessionId, lid, msg) : null;
    } else {
      phone = phoneFromJid(to) ?? to.split('@')[0].split(':')[0];
    }
    if (!phone) {
      logger.warn(
        `Outbound-from-phone ignorado: destino sem telefone resolvível (sessão=${sessionId}, to=${to}, lid=${lidForLog ?? '-'}, msgId=${msg?.key?.id ?? '-'})`,
      );
      return;
    }

    const { type, text } = extractBaileysText(msg.message);
    // Reações e mensagens de sistema não representam comunicação real do corretor
    if (type === 'reaction' || type === 'system') return;

    const telefoneKey = telefoneKeyFrom(phone);
    if (!telefoneKey) return;

    // NUNCA cria lead a partir dessa mensagem — só anexa a um lead já existente
    const lead = await this.prisma.lead.findFirst({
      where: { tenantId, telefoneKey, deletedAt: null },
      select: { id: true },
      orderBy: { criadoEm: 'desc' },
    });
    if (!lead) return;

    const waMessageId: string | undefined = msg?.key?.id;
    if (waMessageId) {
      const already = await this.prisma.leadEvent.findFirst({
        where: { leadId: lead.id, channel: 'whatsapp.unofficial.out', sourceRef: waMessageId },
        select: { id: true },
      });
      if (already) return; // dedup por waMessageId
    }

    // Mídia (foto/vídeo/documento/áudio) enviada direto do celular: baixa via Baileys
    // e sobe ao Cloudinary — sem isso o download no CRM sempre falha (payloadRaw sem media.url).
    let media: { url: string; mimeType: string; filename: string | null; kind: string } | null = null;
    let audioMediaUrl: string | null = null;
    let audioMimeType: string | null = null;
    if (type === 'image' || type === 'video' || type === 'document') {
      const r = await this.processMediaInbound(msg, type);
      if (r.mediaUrl) {
        media = { url: r.mediaUrl, mimeType: r.mimeType ?? 'application/octet-stream', filename: r.filename, kind: type };
      }
    } else if (type === 'audio') {
      const a = await this.processHistoryAudio(msg);
      audioMediaUrl = a.mediaUrl;
      audioMimeType = a.mimeType;
    }

    await this.prisma.leadEvent.create({
      data: {
        tenantId,
        leadId: lead.id,
        channel: 'whatsapp.unofficial.out',
        sourceRef: waMessageId ?? null,
        payloadRaw: {
          text,
          type,
          to: phone,
          source: 'corretor_celular',
          sentAt: new Date().toISOString(),
          ...(audioMediaUrl ? { mediaUrl: audioMediaUrl } : {}),
          ...(audioMimeType ? { mimeType: audioMimeType } : {}),
          ...(media ? { media } : {}),
        },
      },
    });

    logger.log(`📱 Mensagem enviada direto do celular do corretor registrada — leadId=${lead.id} sessão=${sessionId}`);
  }

  // ── Confirmação de leitura (✓✓ azul) ────────────────────────────────────────
  //
  // Baileys emite `messages.update` com o novo status de entrega/leitura de mensagens
  // outbound. Mapeia pra 3 estados simplificados e grava no `payloadRaw` do LeadEvent
  // já existente (localizado pelo `sourceRef` = messageId pré-gerado no envio) — nunca
  // cria evento novo (isGhostEvent filtraria mesmo).
  private async handleMessageStatusUpdate(sessionId: string, update: WAMessageUpdate) {
    const messageId = update.key?.id;
    if (!messageId) return;

    const rawStatus = (update.update as any)?.status;
    if (rawStatus === undefined || rawStatus === null) return;

    const newStatus = mapBaileysAckToStatus(rawStatus);
    if (!newStatus) return; // ERROR ou valor desconhecido — ignora

    const session = await this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });
    if (!session) return;

    const ev = await this.prisma.leadEvent.findFirst({
      where: { tenantId: session.tenantId, channel: 'whatsapp.unofficial.out', sourceRef: messageId },
      select: { id: true, payloadRaw: true },
    });
    if (!ev) return; // mensagem não rastreada (ex: enviada antes desta feature) — ignora

    const currentStatus: string | undefined = (ev.payloadRaw as any)?.waMessageStatus;
    if (statusRank(newStatus) <= statusRank(currentStatus)) return; // evita regressão por ordem de chegada

    await this.prisma.leadEvent.update({
      where: { id: ev.id },
      data: {
        payloadRaw: {
          ...(ev.payloadRaw as any),
          waMessageStatus: newStatus,
          waMessageStatusAt: new Date().toISOString(),
        },
      },
    });
  }

  // ── Validação de números no WhatsApp ─────────────────────────────────────

  async validateNumbers(sessionId: string, phones: string[]): Promise<Array<{ telefone: string; noWhatsapp: boolean }>> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException('Sessão não está conectada — reconecte o número e tente novamente');

    const results: Array<{ telefone: string; noWhatsapp: boolean }> = [];

    for (const phone of phones) {
      const digits = phone.replace(/\D/g, '');
      try {
        const res = await socket.onWhatsApp(digits);
        const result = Array.isArray(res) ? res[0] : undefined;
        results.push({ telefone: digits, noWhatsapp: !result?.exists });
      } catch {
        results.push({ telefone: digits, noWhatsapp: false });
      }
    }

    return results;
  }

  private toJid(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  // Resolve o JID correto via onWhatsApp (trata variações do 9º dígito no Brasil).
  // Fallback para JID padrão se a consulta falhar ou o número não existir.
  private async resolveJid(socket: WASocket, phone: string): Promise<string> {
    const digits = phone.replace(/\D/g, '');
    try {
      const res = await Promise.race([
        socket.onWhatsApp(digits),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
      ]);
      const found = Array.isArray(res) ? res[0] : undefined;
      if (found?.exists && found.jid) return found.jid;
    } catch {
      // fallback abaixo
    }
    return `${digits}@s.whatsapp.net`;
  }
}
