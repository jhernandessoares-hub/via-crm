import { Injectable, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import makeWASocket, { WASocket, DisconnectReason } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Prisma } from '@prisma/client';
import pino from 'pino';
import * as QRCode from 'qrcode';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { upsertLeadFromWhatsapp } from '../whatsapp/lead-upsert.helper';

const logger = new Logger('WhatsappUnofficialService');

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
  if (inner.editedMessage) {
    const edited = inner.editedMessage.message;
    return extractBaileysText(edited);
  }

  return { type: 'unknown', text: '[MENSAGEM]' };
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

async function useDatabaseAuthState(prisma: PrismaService, sessionId: string) {
  const row = await prisma.whatsappUnofficialSession.findUnique({
    where: { id: sessionId },
    select: { authStateJson: true },
  });

  const stored = (row?.authStateJson as any) ?? {};
  const creds = stored.creds
    ? JSON.parse(JSON.stringify(stored.creds), BufferJSON.reviver)
    : initAuthCreds();
  const keys: Record<string, any> = stored.keys ?? {};

  const persist = async () => {
    await prisma.whatsappUnofficialSession.update({
      where: { id: sessionId },
      data: {
        authStateJson: {
          creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
          keys,
        },
      },
    });
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
          for (const type in data) {
            for (const id in data[type]) {
              const k = `${type}-${id}`;
              const v = data[type][id];
              if (v != null) {
                keys[k] = JSON.parse(JSON.stringify(v, BufferJSON.replacer));
              } else {
                delete keys[k];
              }
            }
          }
          await persist();
        },
        clear: async () => {
          for (const k in keys) delete keys[k];
          await persist();
        },
        transaction: async <T>(code: () => Promise<T>): Promise<T> => code(),
      },
    },
    saveCreds: persist,
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

  private updateLidMap(sessionId: string, contacts: Array<{ id: string; lid?: string | null }>) {
    let map = this.lidToPhone.get(sessionId);
    if (!map) { map = new Map(); this.lidToPhone.set(sessionId, map); }
    for (const c of contacts) {
      if (c.lid && c.id.includes('@s.whatsapp.net')) {
        const lid = c.lid.split('@')[0].split(':')[0];
        const phone = c.id.split('@')[0].split(':')[0];
        if (lid && phone) map.set(lid, phone);
      }
    }
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
      select: { authStateJson: true },
    });
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

  private rememberLidPhone(sessionId: string, lid: string, phone: string) {
    let map = this.lidToPhone.get(sessionId);
    if (!map) { map = new Map(); this.lidToPhone.set(sessionId, map); }
    map.set(lid, phone);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async onModuleDestroy() {
    for (const [, socket] of this.sockets) {
      try { socket.end(undefined); } catch {}
    }
  }

  // ── Criação e reconexão ───────────────────────────────────────────────────

  async createSession(tenantId: string, nome: string) {
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

  async connect(sessionId: string) {
    if (this.sockets.has(sessionId)) {
      logger.warn(`Sessão ${sessionId} já possui socket ativo — ignorando connect`);
      return;
    }

    const { state, saveCreds } = await useDatabaseAuthState(this.prisma, sessionId);
    const { version } = await fetchLatestBaileysVersion();

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
        this.disconnectedAt.set(sessionId, Date.now());
        this.sockets.delete(sessionId);
        if (manual) this.manuallyDisconnected.delete(sessionId);

        if (shouldReconnect) {
          // Logout invalida as creds no servidor do WA — limpa para forçar novo QR
          await this.prisma.whatsappUnofficialSession.update({
            where: { id: sessionId },
            data: { status: 'CONNECTING', ...(isLoggedOut ? { authStateJson: Prisma.DbNull } : {}) },
          }).catch(() => {});
          setTimeout(() => this.connect(sessionId).catch(() => {}), 5000);
        } else {
          await this.prisma.whatsappUnofficialSession.update({
            where: { id: sessionId },
            data: { status: 'DISCONNECTED' },
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
      // Janela de catchup: processa mensagens desde a última desconexão (máx 10 min).
      // Se não há registro de desconexão (restart abrupto), usa 60s antes da conexão.
      const maxCatchupMs = 10 * 60 * 1000;
      const cutoff = disconnectedAt
        ? Math.max(disconnectedAt - 2_000, connectionTs - maxCatchupMs)
        : connectionTs - 60_000;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const msgTs = (msg.messageTimestamp as number) * 1000;
        if (msgTs < cutoff) continue;
        await this.handleInbound(sessionId, msg).catch((e) =>
          logger.error(`Erro ao processar inbound sessão=${sessionId}: ${e?.message}`),
        );
      }
    });
  }

  async disconnect(sessionId: string) {
    this.manuallyDisconnected.add(sessionId);
    this.closeSocket(sessionId);
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

  async sendText(sessionId: string, to: string, text: string): Promise<void> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = await this.resolveJid(socket, to);
    await socket.sendMessage(jid, { text });
  }

  async sendImage(sessionId: string, to: string, imageUrl: string, caption?: string): Promise<void> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = this.toJid(to);
    await socket.sendMessage(jid, {
      image: { url: imageUrl },
      caption: caption ?? undefined,
    });
  }

  async sendVideo(sessionId: string, to: string, videoUrl: string, caption?: string): Promise<void> {
    const socket = this.sockets.get(sessionId);
    if (!socket) throw new BadRequestException(`Sessão ${sessionId} não está conectada`);
    const jid = this.toJid(to);
    await socket.sendMessage(jid, {
      video: { url: videoUrl },
      caption: caption ?? undefined,
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getStatus(sessionId: string) {
    return this.prisma.whatsappUnofficialSession.findUnique({
      where: { id: sessionId },
      select: { id: true, nome: true, status: true, qrCode: true, phoneNumber: true, pushName: true },
    });
  }

  async listSessions(tenantId: string) {
    return this.prisma.whatsappUnofficialSession.findMany({
      where: { tenantId },
      select: { id: true, nome: true, status: true, phoneNumber: true, pushName: true, createdAt: true },
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
    const { leadId } = await upsertLeadFromWhatsapp(this.prisma, this.queue, {
      tenantId,
      from: phone,
      text: text,
      type,
      sessionId,
      rawMsg: msg,
      contactName,
      avatarUrl,
    });

    // Se é resposta de campanha e o lead NÃO foi criado pelo worker (fluxo legado),
    // registra a mensagem original como contexto para a IA
    if (contatoDisparo && !contatoDisparo.leadId) {
      const mensagemOriginal = contatoDisparo.disparo?.modelo?.mensagem;
      if (mensagemOriginal) {
        const textoEnviado = mensagemOriginal
          .replace(/\{\{nome\}\}/gi, contatoDisparo.nome || 'Prezado(a)')
          .replace(/\{\{telefone\}\}/gi, contatoDisparo.telefone);
        const sentAt = new Date(Date.now() - 2000);
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
      // Vincula o lead ao contato da campanha
      await this.prisma.campanhaContato.update({
        where: { id: contatoDisparo.id },
        data: { leadId },
      });
    }
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
