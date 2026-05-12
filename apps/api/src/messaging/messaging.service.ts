import { Injectable } from '@nestjs/common';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWhatsappCreds } from '../whatsapp/whatsapp-creds';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Readable } from 'stream';

ffmpeg.setFfmpegPath(ffmpegPath as any);

@Injectable()
export class MessagingService {
  private readonly logger = new Logger('MessagingService');

  constructor(private readonly prisma: PrismaService) {}

  // =========================================
  // ENVIO — Meta WhatsApp Cloud API
  // =========================================

  async sendMetaMessage(toRaw: string, text: string, tenantId?: string) {
    const safeText = (text || '').trim();
    if (!safeText) {
      throw new Error('Mensagem vazia: informe "message" no body.');
    }

    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);
    if (!to || to.length < 8) {
      throw new Error(`Telefone inválido para envio: "${toRaw}"`);
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: safeText },
    };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const metaMsg = data?.error?.message || data?.message || 'Erro desconhecido retornado pela Meta';
      throw new Error(`Erro ao enviar WhatsApp (Meta): ${metaMsg}`);
    }

    return { to, metaResponse: data };
  }

  async sendMetaAudioMessage(toRaw: string, mediaId: string, tenantId?: string) {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);

    if (!to || to.length < 8) {
      throw new Error(`Telefone inválido para envio: "${toRaw}"`);
    }

    if (!mediaId || typeof mediaId !== 'string') {
      throw new Error('mediaId inválido para envio de áudio');
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const msg = data?.error?.message || data?.message || 'Erro desconhecido retornado pela Meta (send audio)';
      throw new Error(`Erro ao enviar áudio (Meta): ${msg}`);
    }

    return { to, metaResponse: data };
  }

  async sendMetaImageMessage(toRaw: string, mediaId: string, tenantId?: string) {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = { messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId } };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const msg = data?.error?.message || data?.message || 'Erro Meta (send image)';
      throw new Error(`Erro ao enviar imagem (Meta): ${msg}`);
    }

    return { to, metaResponse: data };
  }

  async sendMetaImageByUrl(toRaw: string, imageUrl: string, caption?: string, tenantId?: string) {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const imagePayload: any = { link: imageUrl };
    if (caption) imagePayload.caption = caption;

    const body = { messaging_product: 'whatsapp', to, type: 'image', image: imagePayload };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const msg = data?.error?.message || data?.message || 'Erro Meta (send image by url)';
      throw new Error(`Erro ao enviar imagem (Meta): ${msg}`);
    }

    return { to, metaResponse: data };
  }

  async sendMetaVideoMessage(toRaw: string, mediaId: string, tenantId?: string) {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = { messaging_product: 'whatsapp', to, type: 'video', video: { id: mediaId } };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const msg = data?.error?.message || data?.message || 'Erro Meta (send video)';
      throw new Error(`Erro ao enviar vídeo (Meta): ${msg}`);
    }

    return { to, metaResponse: data };
  }

  async sendMetaDocumentMessage(toRaw: string, mediaId: string, filename?: string, tenantId?: string) {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const to = this.normalizeToE164(toRaw);
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename: filename || `arquivo-${Date.now()}` },
    };

    const { ok, data } = await this.fetchMetaWithRetry(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!ok) {
      const msg = data?.error?.message || data?.message || 'Erro Meta (send document)';
      throw new Error(`Erro ao enviar documento (Meta): ${msg}`);
    }

    return { to, metaResponse: data };
  }

  // =========================================
  // UPLOAD DE MÍDIA — Meta
  // =========================================

  async uploadMetaMedia(
    input: { buffer: Buffer; filename: string; mimeType: string },
    tenantId?: string,
  ): Promise<{ mediaId: string; metaResponse: any }> {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('Config faltando: credenciais WhatsApp não configuradas.');
    const { token, phoneNumberId, version } = creds;

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/media`;

    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');

    let cleanType = String(input.mimeType || '')
      .toLowerCase()
      .split(';')[0]
      .trim();

    if (!cleanType || cleanType === 'application/octet-stream') {
      const guessed = this.guessMimeFromFilename(input.filename);
      if (guessed) cleanType = guessed;
    }

    fd.append('type', cleanType);

    const blob = new Blob([new Uint8Array(input.buffer)], { type: cleanType });
    fd.append('file', blob, input.filename);

    const uploadTimeoutMs = Number(process.env.WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS || 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), uploadTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: fd as any,
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data: any = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        const metaMsg =
          data?.error?.message ||
          data?.message ||
          'Erro desconhecido retornado pela Meta (upload media)';
        throw new Error(`Erro ao subir mídia (Meta): ${metaMsg}`);
      }

      const mediaId = data?.id;
      if (!mediaId || typeof mediaId !== 'string') {
        throw new Error('Meta não retornou "id" no upload de mídia.');
      }

      return { mediaId, metaResponse: data };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Timeout ao subir mídia (Meta). Tente novamente.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // =========================================
  // DOWNLOAD SEGURO — Meta
  // =========================================

  async metaGetDownloadUrl(
    mediaId: string,
    tenantId?: string,
  ): Promise<{
    downloadUrl: string;
    mimeType?: string;
    sha256?: string;
    fileSize?: number;
  }> {
    const { version, token } = await this.resolveMetaToken(tenantId);

    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data: any = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Meta lookup media (${res.status}): ${JSON.stringify(data)}`);
    }

    if (!data?.url) {
      throw new Error(`Meta não retornou url para mediaId=${mediaId}`);
    }

    return {
      downloadUrl: String(data.url),
      mimeType: data.mime_type ? String(data.mime_type) : undefined,
      sha256: data.sha256 ? String(data.sha256) : undefined,
      fileSize: typeof data.file_size === 'number' ? data.file_size : undefined,
    };
  }

  async metaDownloadStream(
    downloadUrl: string,
    tenantId?: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength?: number | null;
  }> {
    const { token } = await this.resolveMetaToken(tenantId);

    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Meta download (${res.status}): ${txt}`);
    }

    const nodeStream = Readable.fromWeb(res.body as any);

    const lenHeader = res.headers.get('content-length');
    const contentLength =
      lenHeader && !Number.isNaN(Number(lenHeader)) ? Number(lenHeader) : null;

    return { stream: nodeStream, contentLength };
  }

  // =========================================
  // CONVERSÃO DE ÁUDIO (ffmpeg)
  // =========================================

  async ensureMetaCompatibleAudio(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
    const tmpDir = os.tmpdir();
    const inPath = path.join(
      tmpDir,
      'via_audio_in_' +
        Date.now() +
        '_' +
        Math.random().toString(16).slice(2) +
        '.bin',
    );
    const outPath = path.join(
      tmpDir,
      'via_audio_out_' +
        Date.now() +
        '_' +
        Math.random().toString(16).slice(2) +
        '.ogg',
    );

    await fs.promises.writeFile(inPath, buffer);

    await new Promise<void>((resolve, reject) => {
      try {
        ffmpeg(inPath)
          .noVideo()
          .audioCodec('libopus')
          .audioChannels(1)
          .audioFrequency(48000)
          .outputOptions([
            '-b:a 24k',
            '-vbr on',
            '-compression_level 10',
            '-application voip',
          ])
          .format('ogg')
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err))
          .save(outPath);
      } catch (e) {
        reject(e);
      }
    });

    const outBuf = await fs.promises.readFile(outPath);

    try {
      await fs.promises.unlink(inPath);
    } catch {}
    try {
      await fs.promises.unlink(outPath);
    } catch {}

    return {
      buffer: outBuf,
      mimeType: 'audio/ogg',
      ext: 'ogg',
    };
  }

  async convertWebmToOggOpus(input: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const inPath = path.join(tmpDir, `via-audio-${stamp}.webm`);
    const outPath = path.join(tmpDir, `via-audio-${stamp}.ogg`);

    await fs.promises.writeFile(inPath, input);

    return new Promise<Buffer>((resolve, reject) => {
      try {
        ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);

        ffmpeg(inPath)
          .noVideo()
          .audioCodec('libopus')
          .format('ogg')
          .on('end', async () => {
            try {
              const out = await fs.promises.readFile(outPath);
              fs.promises.unlink(inPath).catch(() => null);
              fs.promises.unlink(outPath).catch(() => null);
              resolve(out);
            } catch (e) {
              fs.promises.unlink(inPath).catch(() => null);
              fs.promises.unlink(outPath).catch(() => null);
              reject(e);
            }
          })
          .on('error', (err) => {
            fs.promises.unlink(inPath).catch(() => null);
            fs.promises.unlink(outPath).catch(() => null);
            reject(err);
          })
          .save(outPath);
      } catch (e) {
        fs.promises.unlink(inPath).catch(() => null);
        fs.promises.unlink(outPath).catch(() => null);
        reject(e);
      }
    });
  }

  // =========================================
  // HELPERS PRIVADOS
  // =========================================

  private async fetchMetaWithRetry(
    url: string,
    options: RequestInit,
    timeoutMs = 15000,
    maxAttempts = 3,
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const rawText = await response.text();
        let data: any;
        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          data = { raw: rawText };
        }

        if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
          return { ok: response.ok, status: response.status, data };
        }

        lastError = new Error(`Meta API status ${response.status}: ${JSON.stringify(data)}`);
      } catch (err: any) {
        lastError = err?.name === 'AbortError'
          ? new Error('Timeout na chamada à Meta API')
          : err;
      } finally {
        clearTimeout(timer);
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }

    throw lastError;
  }

  private async resolveMetaToken(tenantId?: string): Promise<{ version: string; token: string }> {
    const creds = await resolveWhatsappCreds(this.prisma, tenantId);
    if (!creds) throw new Error('WHATSAPP_TOKEN não configurado');
    return { version: creds.version, token: creds.token };
  }

  private normalizeToE164(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('55')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  private guessMimeFromFilename(filename?: string): string | null {
    const name = String(filename || '').toLowerCase().trim();
    if (!name) return null;

    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
    if (!ext) return null;

    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'zip':
        return 'application/zip';
      case 'rar':
        return 'application/vnd.rar';
      case '7z':
        return 'application/x-7z-compressed';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'mp3':
        return 'audio/mpeg';
      case 'ogg':
        return 'audio/ogg';
      default:
        return null;
    }
  }
}
