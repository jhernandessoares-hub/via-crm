import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecretaryService } from './secretary.service';
import { Logger } from '../logger';
import { resolveWhatsappCreds, sendWhatsappText } from '../whatsapp/whatsapp-creds';

const logger = new Logger('WhatsappService');

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretary: SecretaryService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // GET /secretary/whatsapp/webhook  — verificação Meta
  // ─────────────────────────────────────────────────────────────────────

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'via-crm-verify';
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // POST /secretary/whatsapp/webhook  — mensagem recebida da Meta
  // ─────────────────────────────────────────────────────────────────────

  async handleWebhook(body: any): Promise<void> {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value?.messages?.length) return;

      const message = value.messages[0];
      const fromNumber: string = message.from; // ex: "5511999999999"

      if (message.type !== 'text' && message.type !== 'audio') return;

      // Localiza usuário pelo número cadastrado
      const user = await this.findUserByPhone(fromNumber);
      if (!user) {
        logger.warn(`WhatsApp: número não vinculado a nenhum usuário: ${fromNumber}`);
        return;
      }

      let text: string;

      if (message.type === 'text') {
        text = message.text?.body?.trim();
        if (!text) return;
      } else {
        // Áudio: baixa e transcreve via Whisper
        const audioBuffer = await this.downloadMedia(message.audio?.id, user?.tenantId);
        if (!audioBuffer) return;
        const transcription = await this.secretary.transcribe({
          buffer: audioBuffer,
          mimetype: 'audio/ogg',
          originalname: 'audio.ogg',
        });
        text = transcription.text?.trim();
        if (!text) return;
      }

      // Sessão contínua por número — cada número tem sua própria sessão
      const sessionId = `whatsapp_${fromNumber.replace(/\D/g, '')}`;

      // Processa na Secretária (sem TTS — não precisamos no WhatsApp)
      const response = await this.secretary.sendMessage({
        tenantId: user.tenantId,
        userId: user.id,
        text,
        sessionId,
      });

      // Envia resposta de volta ao WhatsApp
      await this.sendMessage(fromNumber, response.text);
    } catch (err) {
      logger.error('Erro ao processar webhook WhatsApp', {
        error: (err as any)?.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Chamado pelo WhatsApp inbound worker — mesmo número, roteamento
  // Retorna true se o remetente é um usuário interno (mensagem processada)
  // Retorna false se é cliente comum (segue fluxo de lead)
  // ─────────────────────────────────────────────────────────────────────

  async tryHandleAsUser(
    from: string,
    type: string,
    extractedText: string,
    audioId?: string | null,
  ): Promise<boolean> {
    const user = await this.findUserByPhone(from);
    if (!user) return false;

    let text = extractedText;

    // Áudio/voz: baixa e transcreve
    if ((type === 'audio' || type === 'voice') && audioId) {
      const audioBuffer = await this.downloadMedia(audioId, user?.tenantId);
      if (audioBuffer) {
        const transcription = await this.secretary.transcribe({
          buffer: audioBuffer,
          mimetype: 'audio/ogg',
          originalname: 'audio.ogg',
        });
        text = transcription.text?.trim() || '';
      }
    }

    if (!text) return true; // é usuário mas não tem texto para processar

    // Mesma sessão do chat do sistema — histórico unificado
    const sessionId = 'main';

    try {
      const response = await this.secretary.sendMessage({
        tenantId: user.tenantId,
        userId: user.id,
        text,
        sessionId,
        skipAudio: true,
      });
      await this.sendMessage(from, response.text);
    } catch (err) {
      logger.error('Erro ao processar mensagem do usuário via WhatsApp', {
        error: (err as any)?.message,
      });
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  private async findUserByPhone(phone: string) {
    const normalized = phone.replace(/\D/g, '');

    const users = await this.prisma.user.findMany({
      where: { ativo: true, whatsappNumber: { not: null } },
      select: { id: true, tenantId: true, whatsappNumber: true },
    });

    return (
      users.find((u) => {
        const n = (u.whatsappNumber || '').replace(/\D/g, '');
        // aceita com ou sem código do país
        return n === normalized || n.endsWith(normalized) || normalized.endsWith(n);
      }) ?? null
    );
  }

  private async downloadMedia(mediaId: string, tenantId?: string): Promise<Buffer | null> {
    try {
      const creds = await resolveWhatsappCreds(this.prisma, tenantId);
      const token = creds?.token || process.env.WHATSAPP_TOKEN;

      const urlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const urlData = (await urlRes.json()) as any;

      const mediaRes = await fetch(urlData.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const buf = await mediaRes.arrayBuffer();
      return Buffer.from(buf);
    } catch (err) {
      logger.error('Erro ao baixar mídia do WhatsApp', {
        error: (err as any)?.message,
      });
      return null;
    }
  }

  async sendReadReceipt(messageId: string, to: string, tenantId?: string): Promise<void> {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) return;
    try {
      await fetch(`https://graph.facebook.com/${creds.version}/${creds.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
      });
    } catch {}
  }

  async sendWithHumanDelay(
    to: string,
    text: string,
    opts: { delayMin?: number; delayMax?: number; tenantId?: string } = {},
  ): Promise<void> {
    const min = (opts.delayMin ?? 5) * 1000;
    const max = (opts.delayMax ?? 15) * 1000;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((r) => setTimeout(r, delay));
    await this.sendMessage(to, text, opts.tenantId);
  }

  async sendMessage(to: string, text: string, tenantId?: string): Promise<void> {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) {
      logger.warn('Credenciais WhatsApp não configuradas (tenant ou env)');
      return;
    }
    try {
      const res = await sendWhatsappText(creds, to, text);
      void res; // sendWhatsappText retorna void
    } catch (err) {
      logger.error('Erro ao enviar mensagem WhatsApp', { error: (err as any)?.message });
    }
  }
}
