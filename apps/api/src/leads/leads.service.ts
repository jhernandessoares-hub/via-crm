

function calcAiUsagePercent(aiText, finalText) {
  if (!aiText) return 0;
  if (!finalText) return 0;

  const a = aiText.trim().toLowerCase();
  const b = finalText.trim().toLowerCase();

  if (a === b) return 100;

  const aiWords = a.split(/\s+/);
  const finalWords = b.split(/\s+/);

  let matches = 0;

  for (const w of finalWords) {
    if (aiWords.includes(w)) matches++;
  }

  const ratio = matches / finalWords.length;

  if (ratio > 0.9) return 90;
  if (ratio > 0.75) return 75;
  if (ratio > 0.6) return 60;
  if (ratio > 0.4) return 40;
  if (ratio > 0.1) return 10;

  return 0;
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as fs from 'fs';

// ✅ NOVO: conversão webm -> ogg(opus)
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegPath as any);
import * as path from 'path';
import * as os from 'os';

// ✅ NOVO: download seguro Cloudinary via backend (proxy)
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// ✅ NOVO: Pipeline (ETAPA 2)
import { PipelineService } from '../pipeline/pipeline.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineService: PipelineService,
  ) {}

  // =========================================
  // ✅ CONFIG CLOUDINARY (somente backend)
  // =========================================
  private ensureCloudinaryConfigured() {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;

    if (!cloud_name || !api_key || !api_secret) {
      throw new Error(
        'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
      );
    }

    cloudinary.config({
      cloud_name,
      api_key,
      api_secret,
      secure: true,
    });
  }

  private safeFilename(name: string, fallbackExt: string) {
    const base = (name || '').trim() || `arquivo-${Date.now()}.${fallbackExt}`;
    // remove caracteres problemáticos
    return base.replace(/[\\/:*?"<>|]/g, '_');
  }

  private guessFromMime(
    mime?: string,
  ): { ext: string; kind: 'image' | 'video' | 'raw' } {
    const mt = String(mime || '').toLowerCase();
    if (mt.startsWith('image/'))
      return { ext: mt.split('/')[1] || 'jpg', kind: 'image' };
    if (mt.startsWith('video/'))
      return { ext: mt.split('/')[1] || 'mp4', kind: 'video' };
    if (mt === 'application/pdf') return { ext: 'pdf', kind: 'raw' };
    if (mt.startsWith('audio/')) return { ext: 'ogg', kind: 'raw' };
    return { ext: 'bin', kind: 'raw' };
  }

  // ✅ NOVO (MÍNIMO): inferir mime pelo nome (só ajuda quando chega application/octet-stream)
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

  // ✅ NOVO: sobe a mídia no Cloudinary e devolve secure_url (ou null se falhar)
  private async uploadCloudinaryLeadMedia(input: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<string | null> {
    try {
      this.ensureCloudinaryConfigured();

      const mt = String(input.mimeType || '').toLowerCase().split(';')[0].trim();

      // Cloudinary: áudio entra como resource_type "video" (sim, é isso mesmo)
      const resourceType: 'image' | 'video' | 'raw' =
        mt.startsWith('image/')
          ? 'image'
          : mt.startsWith('video/') || mt.startsWith('audio/')
            ? 'video'
            : 'raw';

      const safeName = String(input.filename || 'arquivo')
        .replace(/[^\w.\-() ]+/g, '_')
        .slice(0, 120);

      const publicId = `via-crm/whatsapp/${Date.now()}_${Math.floor(
        Math.random() * 1e9,
      )}_${safeName}`;

      const result: any = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            public_id: publicId,
            overwrite: false,
          },
          (err: any, res: any) => {
            if (err) return reject(err);
            resolve(res);
          },
        );

        stream.end(input.buffer);
      });

       const url = String(result?.secure_url || result?.url || '').trim();
      return url || null;
    } catch (error) {
      throw new BadRequestException(
        'Falha ao enviar mídia para o Cloudinary. Envie novamente com o sistema totalmente online.',
      );
    }
  }

  /**
   * Cloudinary URL típica:

  /**
   * Cloudinary URL típica:
   * https://res.cloudinary.com/<cloud>/image/upload/v123/via-crm/whatsapp/<publicId>.pdf
   *
   * A gente extrai:
   * publicId = "via-crm/whatsapp/<publicIdSemExt>"
   * ext = "pdf"
   * resource_type sugerido pelo path: image|video|raw (pelo menos pra inferir)
   */
  private parseCloudinaryUrl(
    url: string,
  ): {
    publicId: string;
    ext: string;
    resourceType: 'image' | 'video' | 'raw';
  } | null {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);

      // achar onde está o "upload"
      const uploadIdx = parts.findIndex((p) => p === 'upload');
      if (uploadIdx < 0) return null;

      // o resource_type normalmente vem antes do upload: image/upload | video/upload | raw/upload
      const resourceTypeRaw = parts[uploadIdx - 1] || 'image';
      const resourceType =
        resourceTypeRaw === 'video'
          ? 'video'
          : resourceTypeRaw === 'raw'
            ? 'raw'
            : 'image';

      // depois de upload vem "v123" e depois o caminho do publicId + ext
      // então pegamos tudo depois do vNNN
      const afterUpload = parts.slice(uploadIdx + 1);
      const withoutVersion =
        afterUpload[0] && /^v\d+$/.test(afterUpload[0])
          ? afterUpload.slice(1)
          : afterUpload;

      if (withoutVersion.length === 0) return null;

      const last = withoutVersion[withoutVersion.length - 1];
      const m = last.match(/^(.+)\.([a-zA-Z0-9]+)$/);
      const ext = m?.[2] ? m[2].toLowerCase() : 'bin';
      const lastNoExt = m?.[1] || last;

      // publicId = path + filename sem extensão
      const folderParts = withoutVersion.slice(0, -1);
      const publicId = [...folderParts, lastNoExt].join('/');

      return { publicId, ext, resourceType };
    } catch {
      return null;
    }
  }

  /**
   * ✅ Gera uma URL assinada (curta, expira) para Cloudinary,
   * mas o usuário NUNCA vê essa URL — o backend usa pra baixar e streamar.
   */
  private buildSignedCloudinaryDownloadUrl(input: {
    publicId: string;
    ext: string;
    resourceType: 'image' | 'video' | 'raw';
  }): string {
    this.ensureCloudinaryConfigured();

    const expiresAt = Math.floor(Date.now() / 1000) + 120; // 2 minutos

    // ✅ Para PDFs e outros RAW protegidos
    if (input.resourceType === 'raw') {
      // @ts-ignore
      return cloudinary.utils.private_download_url(input.publicId, input.ext, {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: expiresAt,
      });
    }

    // ✅ Para image e video
    return cloudinary.url(input.publicId, {
      resource_type: input.resourceType,
      type: 'authenticated',
      secure: true,
      sign_url: true,
      format: input.ext,
      expires_at: expiresAt,
    } as any);
  }

  async downloadEventMedia(
    user: any,
    leadId: string,
    eventId: string,
  ): Promise<{
    stream: Readable;
    mimeType: string;
    filename: string;
    contentLength?: number;
  }> {
    // 1) garante que o lead é do tenant
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    // 2) busca evento
    const ev = await this.prisma.leadEvent.findFirst({
      where: { id: eventId, leadId, tenantId: user.tenantId },
      select: { id: true, payloadRaw: true, channel: true },
    });

    if (!ev) throw new NotFoundException('Evento não encontrado');

    const payload: any = (ev as any).payloadRaw || {};
    const media = payload?.media || {};
    const url = typeof media?.url === 'string' ? media.url : null;
    const mimeType =
      String(media?.mimeType || '').trim() || 'application/octet-stream';
    const filenameRaw = String(media?.filename || '').trim();

    if (!url || !url.includes('cloudinary.com')) {
      throw new BadRequestException(
        'Este evento não tem mídia em Cloudinary (url ausente).',
      );
    }

    const parsed = this.parseCloudinaryUrl(url);
    if (!parsed?.publicId) {
      throw new BadRequestException(
        'Não consegui extrair publicId da URL do Cloudinary.',
      );
    }

    // Ajuste: pdf deve ser raw (mesmo se a URL atual veio como image/upload)
    let resourceType: 'image' | 'video' | 'raw' = parsed.resourceType;
    if (parsed.ext === 'pdf') resourceType = 'raw';

    const candidateUrls: string[] = [];

    // (A) 1º: URL original do evento
    candidateUrls.push(url);

    // (B) 2º: URL assinada (fallback)
    try {
      const signedUrl = this.buildSignedCloudinaryDownloadUrl({
        publicId: parsed.publicId,
        ext: parsed.ext,
        resourceType,
      });
      if (signedUrl && signedUrl !== url) candidateUrls.push(signedUrl);
    } catch {}

    // (C) 3º: fallback extra — tenta resource_type alternativo
    const altResourceTypes: Array<'image' | 'video' | 'raw'> = [
      'image',
      'video',
      'raw',
    ].filter((x) => x !== resourceType) as any;

    for (const rt of altResourceTypes) {
      try {
        const altSigned = this.buildSignedCloudinaryDownloadUrl({
          publicId: parsed.publicId,
          ext: parsed.ext,
          resourceType: rt,
        });
        if (altSigned && !candidateUrls.includes(altSigned))
          candidateUrls.push(altSigned);
      } catch {}
    }

    let lastErrorText = '';
    let res: any = null;

    for (const u of candidateUrls) {
      try {
        const r = await fetch(u, { method: 'GET' });
        if (r.ok && r.body) {
          res = r;
          break;
        }
        const txt = await r.text().catch(() => '');
        lastErrorText = `url=${u} status=${r.status} ${txt || ''}`.trim();
      } catch (e: any) {
        lastErrorText = `url=${u} error=${e?.message || String(e)}`;
      }
    }

    if (!res || !res.ok || !res.body) {
      // ✅ FALLBACK: se Cloudinary falhar (ex: authenticated), tenta baixar direto da Meta usando mediaId salvo no payloadRaw
      try {
        const payload: any = (ev as any)?.payloadRaw ?? {};

        const mediaId: string | undefined =
          payload?.media?.id ||
          payload?.mediaId ||
          payload?.rawMsg?.image?.id ||
          payload?.rawMsg?.video?.id ||
          payload?.rawMsg?.audio?.id ||
          payload?.rawMsg?.document?.id ||
          payload?.rawMsg?.sticker?.id ||
          payload?.message?.audio?.id ||
          payload?.message?.document?.id ||
          payload?.message?.image?.id ||
          payload?.message?.video?.id;

        if (!mediaId) {
          throw new Error('Fallback Meta: evento sem mediaId no payloadRaw');
        }

        const metaInfo = await this.metaGetDownloadUrl(String(mediaId));
        const meta = await this.metaDownloadStream(metaInfo.downloadUrl);

        const streamNode = meta.stream as unknown as Readable;

        const mimeFinal =
          metaInfo?.mimeType ||
          payload?.media?.mimeType ||
          payload?.mimeType ||
          'application/octet-stream';

        const filenameFinal =
          payload?.media?.filename ||
          payload?.filename ||
          `media-${String(mediaId)}`;

        return {
          stream: streamNode,
          mimeType: mimeFinal,
          filename: this.safeFilename(
            filenameFinal,
            this.extFromMime(mimeFinal) || 'bin',
          ),
          contentLength: meta.contentLength ?? metaInfo?.fileSize ?? undefined,
        };
      } catch (e: any) {
        // se fallback falhar, cai no throw original abaixo
      }

      throw new BadRequestException(
        `Falha ao baixar do Cloudinary via backend. ${
          lastErrorText || (res ? `status=${res.status}` : 'sem response')
        }`,
      );
    }

    const contentType =
      res.headers.get('content-type') || mimeType || 'application/octet-stream';
    const len = res.headers.get('content-length');
    const contentLength = len ? Number(len) : undefined;

    const g = this.guessFromMime(contentType);
    const filename = this.safeFilename(
      filenameRaw ||
        `${parsed.publicId.split('/').pop() || 'arquivo'}.${parsed.ext || g.ext}`,
      parsed.ext || g.ext,
    );

    // Node 18: converte WebStream -> Node Readable
    const nodeStream = Readable.fromWeb(res.body as any);

    return {
      stream: nodeStream,
      mimeType: contentType,
      filename,
      contentLength,
    };
  }

  // =========================================================
  // ✅ ETAPA 3 — JANELA 24H DO WHATSAPP (window)
  // =========================================================
  async getWhatsappWindow(user: any, leadId: string): Promise<{
    lastInboundAt: string | null;
    expiresAt: string | null;
    remainingMinutes: number;
  }> {
    if (!leadId) throw new BadRequestException('leadId ausente');

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { lastInboundAt: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    const last = lead.lastInboundAt ? new Date(lead.lastInboundAt) : null;
    if (!last) {
      return { lastInboundAt: null, expiresAt: null, remainingMinutes: 0 };
    }

    const expires = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const diffMs = expires.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.ceil(diffMs / (60 * 1000)));

    return {
      lastInboundAt: last.toISOString(),
      expiresAt: expires.toISOString(),
      remainingMinutes,
    };
  }

  // =========================================================
  // ✅ ENVIO REAL WHATSAPP (ÁUDIO)
  // =========================================================
  async sendWhatsappAudioMessage(user: any, leadId: string, file: any) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId: user.tenantId,
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    if (!lead.telefone) {
      throw new BadRequestException('Lead não possui telefone cadastrado');
    }

    if (!file) {
      throw new BadRequestException('Arquivo não enviado (field: file)');
    }

    const mimetypeRaw = String(file.mimetype || '')
      .toLowerCase()
      .split(';')[0]
      .trim();

    const bufferRaw = await this.getFileBuffer(file);

    const { buffer: bufferFinal, mimeType: mimeFinal, ext: extFinal } =
      await this.ensureMetaCompatibleAudio(bufferRaw, mimetypeRaw);

    const originalnameRaw =
      typeof file.originalname === 'string' && file.originalname.trim()
        ? file.originalname.trim()
        : '';

    const safeNameBase =
      originalnameRaw && originalnameRaw.includes('.')
        ? originalnameRaw.replace(/\.[^/.]+$/, '')
        : `audio-${Date.now()}`;

    const originalname = `${safeNameBase}.${extFinal}`;

    // ✅ NOVO: sobe no Cloudinary pra termos URL no histórico (download/preview)
    const cloudUrl = await this.uploadCloudinaryLeadMedia({
      buffer: bufferFinal,
      filename: originalname,
      mimeType: mimeFinal,
    });

    const upload = await this.uploadMetaMedia({
      buffer: bufferFinal,
      filename: originalname,
      mimeType: mimeFinal,
    });

    const send = await this.sendMetaAudioMessage(lead.telefone, upload.mediaId);

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        channel: 'whatsapp.out',
        payloadRaw: {
          to: send.to,
          type: 'audio',
          media: {
            kind: 'audio',
            id: upload.mediaId,
            mimeType: mimeFinal,
            filename: originalname,
            url: cloudUrl,
          },
          metaUploadResponse: upload.metaResponse,
          metaResponse: send.metaResponse,
          originalInput: {
            mimeType: mimetypeRaw,
            size: bufferRaw?.length ?? null,
          },
          normalized: {
            mimeType: mimeFinal,
            size: bufferFinal?.length ?? null,
          },
        },
      },
    });

    return { ok: true, mediaId: upload.mediaId };
  }

  // =========================================================
  // ✅ ENVIO REAL WHATSAPP (ANEXO: image/video/document)
  // =========================================================
  async sendWhatsappAttachment(user: any, leadId: string, file: any) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!lead.telefone)
      throw new BadRequestException('Lead não possui telefone cadastrado');

    if (!file) {
      throw new BadRequestException('Arquivo não enviado (field: file)');
    }

    const originalname =
      typeof file.originalname === 'string' && file.originalname.trim()
        ? file.originalname.trim()
        : `arquivo-${Date.now()}`;

    const mimetypeRaw = String(file.mimetype || '')
      .toLowerCase()
      .split(';')[0]
      .trim();

    const buffer = await this.getFileBuffer(file);

    // 2) decide tipo de mensagem (para saber se é "document")
    const isImage = mimetypeRaw.startsWith('image/');
    const isVideo = mimetypeRaw.startsWith('video/');
    const isAudio = mimetypeRaw.startsWith('audio/');

    if (isAudio) {
      throw new BadRequestException('Use /send-whatsapp-audio para áudio');
    }

    // ✅ AJUSTE MÍNIMO (DOCUMENTO):
    // Se vier octet-stream e for documento, tenta inferir mime pelo filename.
    let mimetype = mimetypeRaw;
    const isDocument = !isImage && !isVideo && !isAudio;

    if (isDocument && (!mimetype || mimetype === 'application/octet-stream')) {
      const guessed = this.guessMimeFromFilename(originalname);
      if (guessed) mimetype = guessed;
    }

    // ✅ NOVO: sobe no Cloudinary pra termos URL no histórico (download/preview)
    const cloudUrl = await this.uploadCloudinaryLeadMedia({
      buffer,
      filename: originalname,
      mimeType: mimetype || 'application/octet-stream',
    });

    // 1) upload para Meta -> mediaId
    const upload = await this.uploadMetaMedia({
      buffer,
      filename: originalname,
      mimeType: mimetype || 'application/octet-stream',
    });

    const send = isImage
      ? await this.sendMetaImageMessage(lead.telefone, upload.mediaId)
      : isVideo
        ? await this.sendMetaVideoMessage(lead.telefone, upload.mediaId)
        : await this.sendMetaDocumentMessage(
            lead.telefone,
            upload.mediaId,
            originalname,
          );

    // 3) salva evento
    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        channel: 'whatsapp.out',
        payloadRaw: {
          to: send.to,
          type: isImage ? 'image' : isVideo ? 'video' : 'document',
          media: {
            kind: isImage ? 'image' : isVideo ? 'video' : 'document',
            id: upload.mediaId,
            mimeType: mimetype,
            filename: originalname,
            url: cloudUrl,
          },
          metaUploadResponse: upload.metaResponse,
          metaResponse: send.metaResponse,
        },
      },
    });

    return { ok: true, mediaId: upload.mediaId };
  }

  private async ensureMetaCompatibleAudio(
    buffer: Buffer,
    mimetype: string,
  ): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
    // ✅ Sempre gerar OGG OPUS (voz) — WhatsApp toca 100%
    // Mesmo que já venha .ogg, a gente re-encode para garantir codec OPUS.

    const fs = require('fs');
    const path = require('path');
    const os = require('os');

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
        // usa fluent-ffmpeg + ffmpeg-static (você já tem no arquivo)
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

  private async convertWebmToOggOpus(input: Buffer): Promise<Buffer> {
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

  private async getFileBuffer(file: any): Promise<Buffer> {
    if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;

    if (file?.path && typeof file.path === 'string') {
      return fs.promises.readFile(file.path);
    }

    throw new BadRequestException(
      'Arquivo inválido: não encontrei buffer nem path',
    );
  }

  private async uploadMetaMedia(input: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<{ mediaId: string; metaResponse: any }> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error(
        'Config faltando: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Railway/ambiente.',
      );
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/media`;

    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');

    let cleanType = String(input.mimeType || '')
      .toLowerCase()
      .split(';')[0]
      .trim();

    // ✅ AJUSTE MÍNIMO (DOCUMENTO):
    // Se vier octet-stream, tenta inferir pelo filename (Meta costuma rejeitar octet-stream)
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

  // =============================
  // META API: fetch com retry/backoff
  // =============================
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

  private async sendMetaAudioMessage(toRaw: string, mediaId: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error(
        'Config faltando: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Railway/ambiente.',
      );
    }

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

  private async sendMetaImageMessage(toRaw: string, mediaId: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error('Config faltando: WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID');
    }

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

  private async sendMetaVideoMessage(toRaw: string, mediaId: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error('Config faltando: WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID');
    }

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

  private async sendMetaDocumentMessage(toRaw: string, mediaId: string, filename?: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error('Config faltando: WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID');
    }

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

  // =============================
  // HELPERS (telefone / key)
  // =============================
  private digitsOnly(v: string): string {
    return (v || '').replace(/\D/g, '');
  }

  private telefoneKeyFrom(input: string): string {
    let d = this.digitsOnly(input);

    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length > 11) d = d.slice(-11);
    if (d.length >= 9) return d.slice(-9);

    return d;
  }

  private getInboundChannels(): string[] {
    const raw = (process.env.SLA_INBOUND_CHANNELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return raw.length
      ? raw
      : ['whatsapp.in', 'whatsapp.inbound', 'inbound', 'message.in', 'lead.inbound'];
  }

  private pickInboundText(payloadRaw: any): string | null {
    if (!payloadRaw || typeof payloadRaw !== 'object') return null;

    const candidates = [
      payloadRaw.text,
      payloadRaw.message,
      payloadRaw.body,
      payloadRaw.caption,
      payloadRaw?.interactive?.button_reply?.title,
      payloadRaw?.interactive?.list_reply?.title,
    ];

    const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
    return found ? found.trim() : null;
  }

  private async attachLastInboundPreview(tenantId: string, leads: any[]) {
    if (!Array.isArray(leads) || leads.length === 0) return leads;

    const leadIds = leads.map((l) => l.id).filter(Boolean);
    if (leadIds.length === 0) return leads;

    const inboundChannels = this.getInboundChannels();

    const events = await this.prisma.leadEvent.findMany({
      where: {
        tenantId,
        leadId: { in: leadIds },
        channel: { in: inboundChannels },
      },
      orderBy: { criadoEm: 'desc' },
      select: {
        leadId: true,
        channel: true,
        criadoEm: true,
        payloadRaw: true,
      },
    });

    const lastByLead = new Map<string, any>();
    for (const ev of events) {
      if (!lastByLead.has(ev.leadId)) lastByLead.set(ev.leadId, ev);
    }

    return leads.map((l) => {
      const ev = lastByLead.get(l.id);
      return {
        ...l,
        lastInboundEventAt: ev?.criadoEm ?? null,
        lastInboundText: ev ? this.pickInboundText(ev.payloadRaw) : null,
        lastInboundChannel: ev?.channel ?? null,
      };
    });
  }

  /**
   * ⚠️ DEPRECATED (mantido apenas para não apagar nada):
   * Versão antiga que baixava direto na Meta pelo mediaId.
   * NÃO é a função usada pelo Controller (pra evitar duplicidade de nome).
   */
  async downloadEventMediaFromMeta_DEPRECATED(
    user: any,
    leadId: string,
    eventId: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string | null;
    contentLength?: number | null;
  }> {
    // 1) valida lead do tenant
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true, tenantId: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    // 2) pega evento do lead (do tenant)
    const ev = await this.prisma.leadEvent.findFirst({
      where: { id: eventId, leadId: leadId, tenantId: user.tenantId },
    });
    if (!ev) throw new NotFoundException('Evento não encontrado');

    const payload: any = (ev as any).payloadRaw || {};

    // 3) extrai mediaId (o que permite baixar na Meta)
    const mediaId =
      payload?.media?.id ||
      payload?.rawMsg?.image?.id ||
      payload?.rawMsg?.video?.id ||
      payload?.rawMsg?.audio?.id ||
      payload?.rawMsg?.document?.id ||
      payload?.rawMsg?.sticker?.id ||
      null;

    if (!mediaId) {
      throw new BadRequestException('Evento não possui mediaId para download.');
    }

    // 4) pega URL de download na Meta
    const info = await this.metaGetDownloadUrl(String(mediaId));

    // 5) baixa como stream (com Bearer da Meta) e devolve para o Controller
    const { stream, contentLength } = await this.metaDownloadStream(info.downloadUrl);

    const mimeType = info.mimeType || payload?.media?.mimeType || null;

    // filename: tenta pegar do payload, senão cria um
    const filenameFromPayload =
      typeof payload?.media?.filename === 'string' && payload.media.filename.trim()
        ? payload.media.filename.trim()
        : typeof payload?.rawMsg?.document?.filename === 'string' &&
            payload.rawMsg.document.filename.trim()
          ? payload.rawMsg.document.filename.trim()
          : null;

    const ext = this.extFromMime(mimeType) || 'bin';
    const filename = filenameFromPayload || `lead-${leadId}-event-${eventId}.${ext}`;

    return {
      stream,
      filename,
      mimeType,
      contentLength,
    };
  }

  // =========================
  // META (WhatsApp Cloud) helpers — download seguro
  // =========================
  private getMetaConfigOrThrow() {
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';
    const token = process.env.WHATSAPP_TOKEN;

    if (!token) {
      throw new Error('WHATSAPP_TOKEN não definido no .env');
    }

    return { version, token };
  }

  private async metaGetDownloadUrl(mediaId: string): Promise<{
    downloadUrl: string;
    mimeType?: string;
    sha256?: string;
    fileSize?: number;
  }> {
    const { version, token } = this.getMetaConfigOrThrow();

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

  private async metaDownloadStream(downloadUrl: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength?: number | null;
  }> {
    const { token } = this.getMetaConfigOrThrow();

    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Meta download (${res.status}): ${txt}`);
    }

    // Node 18+: res.body é ReadableStream (web). Converte para stream do Node:
    const nodeStream = Readable.fromWeb(res.body as any);

    const lenHeader = res.headers.get('content-length');
    const contentLength =
      lenHeader && !Number.isNaN(Number(lenHeader)) ? Number(lenHeader) : null;

    return { stream: nodeStream, contentLength };
  }

  private extFromMime(mimeType: string | null | undefined): string | null {
    const mt = String(mimeType || '').toLowerCase().split(';')[0].trim();
    if (!mt) return null;

    if (mt === 'application/pdf') return 'pdf';
    if (mt === 'image/jpeg') return 'jpg';
    if (mt === 'image/png') return 'png';
    if (mt === 'image/webp') return 'webp';
    if (mt === 'video/mp4') return 'mp4';
    if (mt === 'audio/ogg') return 'ogg';
    if (mt === 'audio/mpeg') return 'mp3';
    if (mt === 'audio/mp4') return 'm4a';

    return null;
  }

  // =============================
  // CRUD BÁSICO
  // =============================
  async create(tenantId: string, body: any) {
    const telefoneRaw = body?.telefone ? String(body.telefone) : '';
    const telefoneDigits = this.digitsOnly(telefoneRaw);

    let telefoneKey: string | null = null;
    if (telefoneDigits) {
      telefoneKey = this.telefoneKeyFrom(telefoneDigits);
    }

    // ✅ garante pipeline/stages e define stage inicial (Novo Lead)
    const pipelineId = await this.pipelineService.ensureDefaultPipeline(tenantId);
    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { tenantId, pipelineId, key: 'NOVO_LEAD' },
      select: { id: true, name: true },
    });

    let lead: Awaited<ReturnType<typeof this.prisma.lead.create>>;
    try {
      lead = await this.prisma.lead.create({
        data: {
          tenantId,
          nome: body.nome,
          telefone: telefoneDigits || null,
          telefoneKey,
          email: body.email || null,
          origem: body.origem || null,
          observacao: body.observacao || null,
          status: 'NOVO',
          // ✅ novo campo no Lead (prisma): stageId
          stageId: firstStage?.id ?? null,
        },
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Lead já existe com esses dados.');
      }
      throw err;
    }

    await this.prisma.leadSla.upsert({
      where: { leadId: lead.id },
      create: {
        tenantId,
        leadId: lead.id,
        lastInboundAt: new Date(),
        isActive: true,
      },
      update: {
        isActive: true,
      },
    });

    await this.prisma.leadTransitionLog.create({
      data: {
        tenantId,
        leadId: lead.id,
        fromStage: null,
        toStage: firstStage?.name ?? 'Novo Lead',
        changedBy: 'SYSTEM',
      },
    });

    return lead;
  }

  async list(tenantId: string, status?: LeadStatus) {
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(tenantId, leads);
  }

async getById(user: any, id: string) {
  const lead = await this.prisma.lead.findFirst({
    where: {
      id,
      tenantId: user.tenantId,
    },
  });

  if (!lead) throw new NotFoundException('Lead não encontrado');

  await this.pipelineService.ensureDefaultPipeline(user.tenantId);

  let effectiveStageId = lead.stageId ?? null;
  let stageKey: string | null = null;
  let stageName: string | null = null;
  let previousStageName: string | null = null;
  let previousStageKey: string | null = null;

  if (!effectiveStageId) {
    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        key: 'NOVO_LEAD',
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, name: true },
    });

    if (!firstStage?.id) {
      return lead;
    }

    effectiveStageId = firstStage.id;
    stageKey = firstStage.key;
    stageName = firstStage.name;
  } else {
    const currentStage = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        id: effectiveStageId,
      },
      select: {
        id: true,
        key: true,
        name: true,
      },
    });

    if (currentStage) {
      stageKey = currentStage.key;
      stageName = currentStage.name;
    }
  }

  if (stageKey === 'BASE_FRIA') {
    const lastMoveToBaseFria = await this.prisma.leadTransitionLog.findFirst({
      where: {
        tenantId: user.tenantId,
        leadId: id,
        toStage: stageName ?? 'Base Fria',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        fromStage: true,
      },
    });

    if (lastMoveToBaseFria?.fromStage) {
      previousStageName = lastMoveToBaseFria.fromStage;

      const previousStage = await this.prisma.pipelineStage.findFirst({
        where: {
          tenantId: user.tenantId,
          name: previousStageName,
          isActive: true,
        },
        select: {
          key: true,
          name: true,
        },
      });

      if (previousStage) {
        previousStageKey = previousStage.key;
        previousStageName = previousStage.name;
      }
    }
  }

  return {
    ...lead,
    stageId: effectiveStageId,
    stageKey,
    stageName,
    previousStageName,
    previousStageKey,
  };
}

  async listEvents(user: any, id: string) {
    const events = await this.prisma.leadEvent.findMany({
      where: {
        leadId: id,
        tenantId: user.tenantId,
      },
      orderBy: { criadoEm: 'desc' },
      take: 400,
    });

    return events.reverse();
  }

  async createEvent(user: any, id: string, body: any) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    const channel =
      typeof body?.channel === 'string' && body.channel.trim().length > 0
        ? body.channel.trim()
        : 'crm.note';

    const payloadRaw =
      body?.payloadRaw && typeof body.payloadRaw === 'object' ? body.payloadRaw : {};

    return this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId: id,
        channel,
        payloadRaw,
      },
    });
  }

  async registerInbound(user: any, leadId: string, payloadRaw: any) {
    const now = new Date();

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true, tenantId: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    const event = await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'whatsapp.in',
        payloadRaw: payloadRaw || {},
      },
    });

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { lastInboundAt: now },
    });

    await this.prisma.leadSla.upsert({
      where: { leadId: lead.id },
      create: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        isActive: true,
        lastInboundAt: now,
      },
      update: {
        lastInboundAt: now,
        isActive: true,
      },
    });

    return event;
  }

  async freezeSla(user: any, leadId: string, minutes?: string) {
    const mins = Math.max(1, Number(minutes || 30));
    const until = new Date(Date.now() + mins * 60 * 1000);

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true, tenantId: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    await this.prisma.leadSla.upsert({
      where: { leadId: lead.id },
      create: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        isActive: true,
        frozenUntil: until,
      },
      update: {
        frozenUntil: until,
        isActive: true,
      },
    });

    await this.prisma.leadEvent.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: 'sla.frozen',
        payloadRaw: {
          minutes: mins,
          frozenUntil: until.toISOString(),
          at: new Date().toISOString(),
          source: 'manual-freeze-endpoint',
        },
      },
    });

    return { ok: true, leadId: lead.id, frozenUntil: until.toISOString() };
  }

  async updateStatus(tenantId: string, id: string, status: LeadStatus) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status },
    });

    await this.prisma.leadTransitionLog.create({
      data: {
        tenantId,
        leadId: id,
        fromStage: lead.status as any,
        toStage: status as any,
        changedBy: 'USER',
      },
    });

    return updated;
  }

  async assignLead(id: string, assignedUserId: string, user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.lead.update({
      where: { id },
      data: { assignedUserId },
    });
  }

  async getAllowedStageTransitions(user: any, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
        stageId: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead não encontrado');
    }

    await this.pipelineService.ensureDefaultPipeline(user.tenantId);

    let fromStageKey: string | null = null;
    let effectiveCurrentStageId: string | null = lead.stageId ?? null;

    if (lead.stageId) {
      const from = await this.prisma.pipelineStage.findFirst({
        where: { id: lead.stageId, tenantId: user.tenantId },
        select: { id: true, key: true, name: true, sortOrder: true },
      });

      fromStageKey = from?.key ?? null;
    } else {
      const defaultStage = await this.prisma.pipelineStage.findFirst({
        where: {
          tenantId: user.tenantId,
          key: 'NOVO_LEAD',
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, key: true, name: true, sortOrder: true },
      });

      if (!defaultStage?.id) {
        throw new BadRequestException('Pipeline padrão não encontrado.');
      }

      effectiveCurrentStageId = defaultStage.id;
      fromStageKey = defaultStage.key;
    }

    if (!fromStageKey) {
      throw new BadRequestException('Lead sem stage atual.');
    }

    const allowedTransitions: Record<string, string[]> = {
      NOVO_LEAD: ['PRIMEIRO_CONTATO'],

      PRIMEIRO_CONTATO: [
        'NOVO_LEAD',
        'INTERESSE_QUALIFICACAO_CONFIRMADOS',
        'NAO_QUALIFICADO',
      ],

      NAO_QUALIFICADO: ['PRIMEIRO_CONTATO', 'BASE_FRIA'],

      INTERESSE_QUALIFICACAO_CONFIRMADOS: [
        'PRIMEIRO_CONTATO',
        'AGENDAMENTO_VISITA',
      ],

      AGENDAMENTO_VISITA: [
        'INTERESSE_QUALIFICACAO_CONFIRMADOS',
        'PROPOSTA',
        'BASE_FRIA',
      ],

      PROPOSTA: [
        'AGENDAMENTO_VISITA',
        'APROVACAO_CREDITO_PROPOSTA',
        'CONTRATO',
        'BASE_FRIA',
      ],

      APROVACAO_CREDITO_PROPOSTA: [
        'PROPOSTA',
        'CONTRATO',
        'BASE_FRIA',
      ],

      CONTRATO: [
        'APROVACAO_CREDITO_PROPOSTA',
        'ASSINATURA_CONTRATO',
        'BASE_FRIA',
      ],

      ASSINATURA_CONTRATO: [
        'CONTRATO',
        'BANCO',
        'REGISTRO',
        'BASE_FRIA',
      ],

      BANCO: [
        'ASSINATURA_CONTRATO',
        'REGISTRO',
        'BASE_FRIA',
      ],

      REGISTRO: [
        'BANCO',
        'ENTREGA_CONTRATO_REGISTRADO',
        'BASE_FRIA',
      ],

      ENTREGA_CONTRATO_REGISTRADO: [
        'REGISTRO',
        'POS_VENDA_IA',
        'BASE_FRIA',
      ],

      POS_VENDA_IA: ['ENTREGA_CONTRATO_REGISTRADO'],

      BASE_FRIA: [],
    };

    let allowedStageKeys: string[] = [];

    if (fromStageKey === 'BASE_FRIA') {
      const isManagerLike = user?.role === 'MANAGER' || user?.role === 'OWNER';

      if (!isManagerLike) {
        return {
          leadId,
          currentStageId: effectiveCurrentStageId,
          currentStageKey: fromStageKey,
          allowedStages: [],
        };
      }

      const baseFriaStage = await this.prisma.pipelineStage.findFirst({
        where: {
          tenantId: user.tenantId,
          key: 'BASE_FRIA',
          isActive: true,
        },
        select: {
          name: true,
        },
      });

      if (!baseFriaStage) {
        throw new BadRequestException('Stage BASE_FRIA não encontrada.');
      }

      const lastMoveToBaseFria = await this.prisma.leadTransitionLog.findFirst({
        where: {
          tenantId: user.tenantId,
          leadId,
          toStage: baseFriaStage.name,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          fromStage: true,
        },
      });

      if (lastMoveToBaseFria?.fromStage) {
        const previousStage = await this.prisma.pipelineStage.findFirst({
          where: {
            tenantId: user.tenantId,
            name: lastMoveToBaseFria.fromStage,
            isActive: true,
          },
          select: {
            key: true,
          },
        });

        if (previousStage?.key) {
          allowedStageKeys = [previousStage.key];
        }
      }
    } else {
      allowedStageKeys = allowedTransitions[fromStageKey] ?? [];
    }

    const allowedStages =
      allowedStageKeys.length > 0
        ? await this.prisma.pipelineStage.findMany({
            where: {
              tenantId: user.tenantId,
              isActive: true,
              key: { in: allowedStageKeys },
            },
            select: {
              id: true,
              key: true,
              name: true,
              sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
          })
        : [];

    return {
      leadId,
      currentStageId: effectiveCurrentStageId,
      currentStageKey: fromStageKey,
      allowedStages,
    };
  }

 // =============================
// ✅ ETAPA 2 — mover lead de etapa
// =============================
async updateStage(user: any, leadId: string, stageId: string) {
  if (!leadId) throw new BadRequestException('leadId ausente');
  if (!stageId) throw new BadRequestException('stageId ausente');

  await this.pipelineService.ensureDefaultPipeline(user.tenantId);

  const lead = await this.prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId },
    select: { id: true, stageId: true },
  });
  if (!lead) throw new NotFoundException('Lead não encontrado');

  const toStage = await this.pipelineService.getStageByIdOrThrow(
    user.tenantId,
    stageId,
  );

  let fromStageName: string | null = null;
  let fromStageKey: string | null = null;
  let effectiveCurrentStageId: string | null = lead.stageId ?? null;

  if (lead.stageId) {
    const from = await this.prisma.pipelineStage.findFirst({
      where: { id: lead.stageId, tenantId: user.tenantId },
      select: { key: true, name: true },
    });

    fromStageKey = from?.key ?? null;
    fromStageName = from?.name ?? null;
  } else {
    const defaultStage = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        key: 'NOVO_LEAD',
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, name: true },
    });

    if (defaultStage) {
      effectiveCurrentStageId = defaultStage.id;
      fromStageKey = defaultStage.key;
      fromStageName = defaultStage.name;
    }
  }

  if (effectiveCurrentStageId === toStage.id) {
    return this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
    });
  }

  const allowedTransitions: Record<string, string[]> = {
    NOVO_LEAD: ['PRIMEIRO_CONTATO'],

    PRIMEIRO_CONTATO: [
      'NOVO_LEAD',
      'INTERESSE_QUALIFICACAO_CONFIRMADOS',
      'NAO_QUALIFICADO',
    ],

    NAO_QUALIFICADO: ['PRIMEIRO_CONTATO', 'BASE_FRIA'],

    INTERESSE_QUALIFICACAO_CONFIRMADOS: [
      'PRIMEIRO_CONTATO',
      'AGENDAMENTO_VISITA',
    ],

    AGENDAMENTO_VISITA: [
      'INTERESSE_QUALIFICACAO_CONFIRMADOS',
      'PROPOSTA',
      'BASE_FRIA',
    ],

    PROPOSTA: [
      'AGENDAMENTO_VISITA',
      'APROVACAO_CREDITO_PROPOSTA',
      'CONTRATO',
      'BASE_FRIA',
    ],

    APROVACAO_CREDITO_PROPOSTA: [
      'PROPOSTA',
      'CONTRATO',
      'BASE_FRIA',
    ],

    CONTRATO: [
      'APROVACAO_CREDITO_PROPOSTA',
      'ASSINATURA_CONTRATO',
      'BASE_FRIA',
    ],

    ASSINATURA_CONTRATO: [
      'CONTRATO',
      'BANCO',
      'REGISTRO',
      'BASE_FRIA',
    ],

    BANCO: [
      'ASSINATURA_CONTRATO',
      'REGISTRO',
      'BASE_FRIA',
    ],

    REGISTRO: [
      'BANCO',
      'ENTREGA_CONTRATO_REGISTRADO',
      'BASE_FRIA',
    ],

    ENTREGA_CONTRATO_REGISTRADO: [
      'REGISTRO',
      'POS_VENDA_IA',
      'BASE_FRIA',
    ],

    POS_VENDA_IA: ['ENTREGA_CONTRATO_REGISTRADO'],

    BASE_FRIA: [],
  };

  if (!fromStageKey) {
    throw new BadRequestException('Lead sem stage atual.');
  }

  let isAllowed = false;

  if (fromStageKey === 'BASE_FRIA') {
    const isManagerLike = user?.role === 'MANAGER' || user?.role === 'OWNER';

    if (!isManagerLike) {
      throw new BadRequestException('Somente manager pode retirar lead da Base Fria.');
    }

    const baseFriaStage = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        key: 'BASE_FRIA',
        isActive: true,
      },
      select: {
        name: true,
      },
    });

    if (!baseFriaStage) {
      throw new BadRequestException('Stage BASE_FRIA não encontrada.');
    }

    const lastMoveToBaseFria = await this.prisma.leadTransitionLog.findFirst({
      where: {
        tenantId: user.tenantId,
        leadId,
        toStage: baseFriaStage.name,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        fromStage: true,
      },
    });

    if (!lastMoveToBaseFria?.fromStage) {
      throw new BadRequestException(
        'Não foi possível identificar a última etapa antes da Base Fria.',
      );
    }

    const previousStage = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        name: lastMoveToBaseFria.fromStage,
        isActive: true,
      },
      select: {
        id: true,
        key: true,
        name: true,
      },
    });

    if (!previousStage) {
      throw new BadRequestException(
        'Não foi possível localizar a etapa anterior da Base Fria.',
      );
    }

    isAllowed = previousStage.id === toStage.id;
  } else {
    const allowedTargets = allowedTransitions[fromStageKey] ?? [];
    isAllowed = allowedTargets.includes(toStage.key);
  }

  if (!isAllowed) {
    throw new BadRequestException(
      `Transição inválida: ${fromStageKey} -> ${toStage.key}`,
    );
  }

  const updated = await this.prisma.lead.update({
    where: { id: leadId },
    data: { stageId: toStage.id },
  });

  await this.prisma.leadTransitionLog.create({
    data: {
      tenantId: user.tenantId,
      leadId,
      fromStage: fromStageName,
      toStage: toStage.name,
      changedBy: user?.id || 'USER',
    },
  });

  return updated;
}
  // =============================
  // MANAGER QUEUE
  // =============================
  async getManagerQueue(user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        needsManagerReview: true,
      },
      orderBy: { lastInboundAt: 'desc' },
    });

    return this.attachLastInboundPreview(user.tenantId, leads);
  }

  async getMyLeads(user: any, status?: LeadStatus) {
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        assignedUserId: user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(user.tenantId, leads);
  }

  async getBranchLeads(user: any, branchId?: string, status?: LeadStatus) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(user.tenantId, leads);
  }

  async managerDecision(id: string, dto: any, user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    await this.prisma.lead.update({
      where: { id },
      data: {
        needsManagerReview: false,
      },
    });

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId: id,
        channel: 'system.manager_decision',
        payloadRaw: dto,
      },
    });

    return { ok: true };
  }

  // =============================
  // 🚀 ENVIO REAL WHATSAPP (TEXTO)
  // =============================
  private normalizeToE164(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('55')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  private pickMessage(input: any): string {
    if (typeof input === 'string') return input;

    const candidates = [
      input?.message,
      input?.mensagem,
      input?.text,
      input?.body,
      input?.content,
      input?.data?.message,
      input?.data?.text,
    ];

    const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
    return (found || '').trim();
  }

  private async sendMetaMessage(toRaw: string, text: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    const safeText = (text || '').trim();
    if (!safeText) {
      throw new Error('Mensagem vazia: informe "message" no body.');
    }

    if (!token || !phoneNumberId) {
      throw new Error(
        'Config faltando: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no Railway/ambiente.',
      );
    }

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

  async sendWhatsappMessage(user: any, leadId: string, input: any) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId: user.tenantId,
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    if (!lead.telefone) {
      throw new Error('Lead não possui telefone cadastrado');
    }

const text = this.pickMessage(input);

const aiAssistancePercentRaw =
  typeof input?.aiAssistancePercent === 'number'
    ? input.aiAssistancePercent
    : typeof input?.aiAssistancePercent === 'string'
      ? Number(input.aiAssistancePercent)
      : NaN;

const aiAssistancePercent = Number.isFinite(aiAssistancePercentRaw)
  ? Math.max(0, Math.min(100, Math.round(aiAssistancePercentRaw)))
  : 0;

const aiAssistanceLabel =
  typeof input?.aiAssistanceLabel === 'string' && input.aiAssistanceLabel.trim()
    ? input.aiAssistanceLabel.trim()
    : aiAssistancePercent >= 100
      ? '100% IA'
      : aiAssistancePercent >= 75
        ? '75% IA'
        : aiAssistancePercent > 0
          ? 'Parcial IA'
          : 'Humano';

    let result: Awaited<ReturnType<typeof this.sendMetaMessage>>;
    try {
      result = await this.sendMetaMessage(lead.telefone, text);
    } catch (sendErr: any) {
      await this.prisma.leadEvent.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          channel: 'whatsapp.out.failed',
          payloadRaw: {
            to: lead.telefone,
            type: 'text',
            message: text,
            error: sendErr?.message || String(sendErr),
            aiAssistancePercent,
            aiAssistanceLabel,
          },
        },
      });
      throw sendErr;
    }

    const messageId =
      result?.metaResponse?.messages?.[0]?.id ||
      result?.metaResponse?.messages?.[0]?.message_id ||
      result?.metaResponse?.message_id ||
      null;

    await this.prisma.leadEvent.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        channel: 'whatsapp.out',
        payloadRaw: {
          to: result.to,
          type: 'text',
          text: { body: text },
          message: text,
          body: text,
          messageId,
          metaResponse: result.metaResponse,
          aiAssistancePercent,
          aiAssistanceLabel,
        },
      },
    });

    return { ok: true };
  }
}