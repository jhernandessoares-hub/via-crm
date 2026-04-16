

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
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
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
import Anthropic from '@anthropic-ai/sdk';
import { resolveAiModel } from '../ai/resolve-ai-model';

// ✅ NOVO: Pipeline (ETAPA 2)
import { PipelineService } from '../pipeline/pipeline.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger('LeadsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineService: PipelineService,
    private readonly audit: AuditService,
    private readonly queueService: QueueService,
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
  // ✅ PAINEL SLA — jobs agendados + histórico + janela
  // =========================================================
  async getLeadSla(user: any, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
      select: {
        id: true,
        lastInboundAt: true,
        stage: { select: { group: true, key: true, name: true } },
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    // Scheduled jobs in BullMQ
    const scheduledJobs = await this.queueService.getLeadSlaJobs(leadId);

    // 23h WhatsApp window
    const lastInboundAt = lead.lastInboundAt ? new Date(lead.lastInboundAt) : null;
    const windowCloseAt = lastInboundAt
      ? new Date(lastInboundAt.getTime() + 23 * 60 * 60 * 1000)
      : null;
    const windowRemainingMs = windowCloseAt
      ? Math.max(0, windowCloseAt.getTime() - Date.now())
      : 0;
    const windowRemainingMinutes = Math.ceil(windowRemainingMs / 60000);
    const windowExpired = windowCloseAt ? windowCloseAt.getTime() <= Date.now() : true;

    // Recent SLA history (last 20 events)
    const history = await this.prisma.leadEvent.findMany({
      where: {
        leadId,
        channel: { in: ['sla.due', 'ai.suggestion'] },
      },
      orderBy: { criadoEm: 'desc' },
      take: 20,
      select: {
        id: true,
        channel: true,
        criadoEm: true,
        payloadRaw: true,
      },
    });

    return {
      leadId,
      stageGroup: lead.stage?.group ?? null,
      stageKey: lead.stage?.key ?? null,
      stageName: lead.stage?.name ?? null,
      lastInboundAt: lastInboundAt?.toISOString() ?? null,
      windowCloseAt: windowCloseAt?.toISOString() ?? null,
      windowRemainingMinutes,
      windowExpired,
      scheduledJobs,
      history: history.map((ev) => ({
        id: ev.id,
        channel: ev.channel,
        criadoEm: ev.criadoEm,
        payload: ev.payloadRaw,
      })),
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

    let send: Awaited<ReturnType<typeof this.sendMetaAudioMessage>>;
    try {
      send = await this.sendMetaAudioMessage(lead.telefone, upload.mediaId);
    } catch (err: any) {
      await this.prisma.leadEvent.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          channel: 'whatsapp.out.failed',
          payloadRaw: {
            type: 'audio',
            mediaId: upload.mediaId,
            error: err?.message || String(err),
          },
        },
      });
      throw err;
    }

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

    let send: Awaited<ReturnType<typeof this.sendMetaImageMessage>>;
    try {
      send = isImage
        ? await this.sendMetaImageMessage(lead.telefone, upload.mediaId)
        : isVideo
          ? await this.sendMetaVideoMessage(lead.telefone, upload.mediaId)
          : await this.sendMetaDocumentMessage(
              lead.telefone,
              upload.mediaId,
              originalname,
            );
    } catch (err: any) {
      await this.prisma.leadEvent.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          channel: 'whatsapp.out.failed',
          payloadRaw: {
            type: isImage ? 'image' : isVideo ? 'video' : 'document',
            mediaId: upload.mediaId,
            error: err?.message || String(err),
          },
        },
      });
      throw err;
    }

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

  async sendMetaImageByUrl(toRaw: string, imageUrl: string, caption?: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v20.0';

    if (!token || !phoneNumberId) {
      throw new Error('Config faltando: WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID');
    }

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
      lead = await this.prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            tenantId,
            nome: body.nome,
            telefone: telefoneDigits || null,
            telefoneKey,
            email: body.email || null,
            origem: body.origem || null,
            observacao: body.observacao || null,
            stageId: firstStage?.id ?? null,
          },
        });

        await tx.leadSla.upsert({
          where: { leadId: created.id },
          create: {
            tenantId,
            leadId: created.id,
            lastInboundAt: new Date(),
            isActive: true,
          },
          update: { isActive: true },
        });

        await tx.leadTransitionLog.create({
          data: {
            tenantId,
            leadId: created.id,
            fromStage: null,
            toStage: firstStage?.name ?? 'Novo Lead',
            changedBy: 'SYSTEM',
          },
        });

        return created;
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Lead já existe com esses dados.');
      }
      throw err;
    }

    return lead;
  }

  async counts(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};
    if (role === 'AGENT') {
      extraFilter = { assignedUserId: id };
    } else if (role === 'MANAGER' && branchId) {
      extraFilter = { branchId };
    }

    const baseWhere = { tenantId, ...extraFilter, deletedAt: null };

    // Total visível para este usuário
    const total = await this.prisma.lead.count({ where: baseWhere });

    // Meus leads (atribuídos a mim)
    const mine = await this.prisma.lead.count({ where: { ...baseWhere, assignedUserId: id } });

    // Por grupo de funil — busca leads com stage e agrupa pelo group da stage
    const leadsWithStage = await this.prisma.lead.findMany({
      where: { ...baseWhere, stageId: { not: null } },
      select: { stageId: true },
    });

    const stageIds = [...new Set(leadsWithStage.map((l) => l.stageId).filter(Boolean))] as string[];

    const stages = stageIds.length > 0
      ? await this.prisma.pipelineStage.findMany({
          where: { id: { in: stageIds } },
          select: { id: true, group: true },
        })
      : [];

    const stageGroupMap: Record<string, string> = {};
    for (const s of stages) {
      if (s.group) stageGroupMap[s.id] = s.group;
    }

    const groups: Record<string, number> = {
      PRE_ATENDIMENTO: 0,
      AGENDAMENTO: 0,
      NEGOCIACOES: 0,
      CREDITO_IMOBILIARIO: 0,
      NEGOCIO_FECHADO: 0,
      POS_VENDA: 0,
    };

    for (const l of leadsWithStage) {
      const g = l.stageId ? stageGroupMap[l.stageId] : null;
      if (g && g in groups) groups[g]++;
      else if (!g) groups['PRE_ATENDIMENTO']++; // sem stage → pré-atendimento
    }

    // Leads sem stage também vão para pré-atendimento
    const noStage = await this.prisma.lead.count({ where: { ...baseWhere, stageId: null } });
    groups['PRE_ATENDIMENTO'] += noStage;

    return { total, mine, groups };
  }

  async list(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};

    if (role === 'AGENT') {
      // AGENT: apenas leads atribuídos a ele
      extraFilter = { assignedUserId: id };
    } else if (role === 'MANAGER' && branchId) {
      // MANAGER: todos os leads da filial dele
      extraFilter = { branchId };
    }
    // OWNER: sem filtro extra — vê todos do tenant

    const leads = await this.prisma.lead.findMany({
      where: { tenantId, ...extraFilter, deletedAt: null },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(tenantId, leads);
  }

async getById(user: any, id: string) {
  const lead = await this.prisma.lead.findFirst({
    where: {
      id,
      tenantId: user.tenantId,
      deletedAt: null,
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

  async listEvents(user: any, id: string, opts?: { limit?: number; skip?: number }) {
    const take = Math.min(Math.max(1, opts?.limit ?? 200), 400);
    const skip = Math.max(0, opts?.skip ?? 0);

    const events = await this.prisma.leadEvent.findMany({
      where: {
        leadId: id,
        tenantId: user.tenantId,
      },
      orderBy: { criadoEm: 'desc' },
      take,
      skip,
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


  async assignLead(id: string, assignedUserId: string, user: any) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    const [lead, assignedUser] = await Promise.all([
      this.prisma.lead.findUnique({ where: { id }, select: { id: true, tenantId: true } }),
      this.prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true, tenantId: true } }),
    ]);

    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!assignedUser) throw new NotFoundException('Usuário não encontrado');
    if (lead.tenantId !== assignedUser.tenantId) {
      throw new ForbiddenException('Usuário pertence a outro tenant');
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
      NOVO_LEAD: ['EM_CONTATO'],

      EM_CONTATO: ['NAO_QUALIFICADO', 'LEAD_POTENCIAL_QUALIFICADO'],

      NAO_QUALIFICADO: ['ATENDIMENTO_ENCERRADO'],

      LEAD_POTENCIAL_QUALIFICADO: [
        'AGUARDANDO_AGENDAMENTO',
        'AGENDADO_VISITA',
        'ATENDIMENTO_ENCERRADO',
      ],

      ATENDIMENTO_ENCERRADO: ['BASE_FRIA_PRE'],

      BASE_FRIA_PRE: ['NOVO_LEAD'],

      AGUARDANDO_AGENDAMENTO: ['AGENDADO_VISITA', 'VISITA_CANCELADA'],

      AGENDADO_VISITA: ['CONFIRMADOS', 'REAGENDAMENTO', 'VISITA_CANCELADA'],

      REAGENDAMENTO: ['CONFIRMADOS', 'VISITA_CANCELADA'],

      CONFIRMADOS: ['CRIACAO_PROPOSTA', 'NAO_COMPARECEU', 'VISITA_CANCELADA'],

      NAO_COMPARECEU: ['REAGENDAMENTO', 'VISITA_CANCELADA'],

      VISITA_CANCELADA: ['AGUARDANDO_AGENDAMENTO', 'BASE_FRIA_AGENDAMENTO'],

      BASE_FRIA_AGENDAMENTO: ['AGUARDANDO_AGENDAMENTO'],

      CRIACAO_PROPOSTA: ['PROPOSTA_ANDAMENTO'],

      PROPOSTA_ANDAMENTO: ['PROPOSTA_ACEITA', 'DECLINIO'],

      PROPOSTA_ACEITA: ['ANALISE_CREDITO', 'FORMALIZACAO'],

      ANALISE_CREDITO: ['FORMALIZACAO', 'DECLINIO'],

      FORMALIZACAO: ['CONTRATO_ASSINADO', 'DECLINIO'],

      CONTRATO_ASSINADO: ['ITBI'],

      DECLINIO: ['BASE_FRIA_NEGOCIACOES'],

      BASE_FRIA_NEGOCIACOES: ['CRIACAO_PROPOSTA'],

      ITBI: ['REGISTRO'],

      REGISTRO: ['ENTREGA_CONTRATO'],

      ENTREGA_CONTRATO: ['POS_VENDA'],

      POS_VENDA: [],
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

      // Permite voltar apenas para stages que o lead realmente visitou
      const transitions = await this.prisma.leadTransitionLog.findMany({
        where: { tenantId: user.tenantId, leadId },
        select: { fromStage: true, toStage: true },
      });

      const visitedNames = new Set<string>(
        transitions.flatMap((t) => [t.fromStage, t.toStage]).filter((s): s is string => s !== null)
      );

      const currentStageInfo = await this.prisma.pipelineStage.findFirst({
        where: { tenantId: user.tenantId, key: fromStageKey, isActive: true },
        select: { sortOrder: true, group: true },
      });

      if (currentStageInfo?.group != null && currentStageInfo?.sortOrder != null) {
        const prevStage = await this.prisma.pipelineStage.findFirst({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            group: currentStageInfo.group,
            sortOrder: { lt: currentStageInfo.sortOrder },
            name: { in: Array.from(visitedNames) },
          },
          orderBy: { sortOrder: 'desc' },
          select: { key: true },
        });

        if (prevStage?.key && !allowedStageKeys.includes(prevStage.key)) {
          allowedStageKeys = [...allowedStageKeys, prevStage.key];
        }
      }
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

async updateBotPaused(tenantId: string, leadId: string, botPaused: boolean) {
  return this.prisma.lead.update({
    where: { id: leadId, tenantId },
    data: { botPaused },
    select: { id: true, botPaused: true },
  });
}

async updateQualification(tenantId: string, leadId: string, data: {
  nomeCorreto?: string | null;
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
  // Cadastro pessoal
  cpf?: string | null;
  rg?: string | null;
  profissao?: string | null;
  empresa?: string | null;
  naturalidade?: string | null;
  endereco?: string | null;
  cep?: string | null;
  cidade?: string | null;
  uf?: string | null;
}) {
  const updateData: any = {};
  if (data.nomeCorreto !== undefined) {
    updateData.nomeCorreto = data.nomeCorreto;
    updateData.nomeCorretoOrigem = data.nomeCorreto ? 'MANUAL' : null;
  }
  if (data.rendaBrutaFamiliar !== undefined) updateData.rendaBrutaFamiliar = data.rendaBrutaFamiliar;
  if (data.fgts !== undefined) updateData.fgts = data.fgts;
  if (data.valorEntrada !== undefined) updateData.valorEntrada = data.valorEntrada;
  if (data.estadoCivil !== undefined) updateData.estadoCivil = data.estadoCivil;
  if (data.dataNascimento !== undefined) updateData.dataNascimento = data.dataNascimento ? new Date(data.dataNascimento) : null;
  if (data.tempoProcurandoImovel !== undefined) updateData.tempoProcurandoImovel = data.tempoProcurandoImovel;
  if (data.conversouComCorretor !== undefined) updateData.conversouComCorretor = data.conversouComCorretor;
  if (data.qualCorretorImobiliaria !== undefined) updateData.qualCorretorImobiliaria = data.qualCorretorImobiliaria;
  if (data.perfilImovel !== undefined) updateData.perfilImovel = data.perfilImovel;
  if (data.produtoInteresseId !== undefined) updateData.produtoInteresseId = data.produtoInteresseId;
  if (data.resumoLead !== undefined) updateData.resumoLead = data.resumoLead;
  // Cadastro pessoal
  const pessoalFields = ['cpf', 'rg', 'profissao', 'empresa', 'naturalidade', 'endereco', 'cep', 'cidade', 'uf'] as const;
  for (const f of pessoalFields) {
    if (data[f] !== undefined) updateData[f] = data[f];
  }
  if ((data as any).cadastroOrigem !== undefined) updateData.cadastroOrigem = (data as any).cadastroOrigem;

  return this.prisma.lead.update({
    where: { id: leadId, tenantId },
    data: updateData,
    select: {
      id: true, nome: true, nomeCorreto: true, rendaBrutaFamiliar: true,
      fgts: true, valorEntrada: true, estadoCivil: true, dataNascimento: true,
      tempoProcurandoImovel: true, conversouComCorretor: true,
      qualCorretorImobiliaria: true, perfilImovel: true,
      produtoInteresseId: true, resumoLead: true,
    },
  });
}

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
    NOVO_LEAD: ['EM_CONTATO'],

    EM_CONTATO: ['NAO_QUALIFICADO', 'LEAD_POTENCIAL_QUALIFICADO'],

    NAO_QUALIFICADO: ['ATENDIMENTO_ENCERRADO'],

    LEAD_POTENCIAL_QUALIFICADO: [
      'AGUARDANDO_AGENDAMENTO',
      'AGENDADO_VISITA',
      'ATENDIMENTO_ENCERRADO',
    ],

    ATENDIMENTO_ENCERRADO: ['BASE_FRIA_PRE'],

    BASE_FRIA_PRE: ['NOVO_LEAD'],

    AGUARDANDO_AGENDAMENTO: ['AGENDADO_VISITA', 'VISITA_CANCELADA'],

    AGENDADO_VISITA: ['CONFIRMADOS', 'REAGENDAMENTO', 'VISITA_CANCELADA'],

    REAGENDAMENTO: ['CONFIRMADOS', 'VISITA_CANCELADA'],

    CONFIRMADOS: ['CRIACAO_PROPOSTA', 'NAO_COMPARECEU', 'VISITA_CANCELADA'],

    NAO_COMPARECEU: ['REAGENDAMENTO', 'VISITA_CANCELADA'],

    VISITA_CANCELADA: ['AGUARDANDO_AGENDAMENTO', 'BASE_FRIA_AGENDAMENTO'],

    BASE_FRIA_AGENDAMENTO: ['AGUARDANDO_AGENDAMENTO'],

    CRIACAO_PROPOSTA: ['PROPOSTA_ANDAMENTO'],

    PROPOSTA_ANDAMENTO: ['PROPOSTA_ACEITA', 'DECLINIO'],

    PROPOSTA_ACEITA: ['ANALISE_CREDITO', 'FORMALIZACAO'],

    ANALISE_CREDITO: ['FORMALIZACAO', 'DECLINIO'],

    FORMALIZACAO: ['CONTRATO_ASSINADO', 'DECLINIO'],

    CONTRATO_ASSINADO: ['ITBI'],

    DECLINIO: ['BASE_FRIA_NEGOCIACOES'],

    BASE_FRIA_NEGOCIACOES: ['CRIACAO_PROPOSTA'],

    ITBI: ['REGISTRO'],

    REGISTRO: ['ENTREGA_CONTRATO'],

    ENTREGA_CONTRATO: ['POS_VENDA'],

    POS_VENDA: [],
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

    // Permite voltar apenas para stages que o lead realmente visitou
    if (!isAllowed) {
      const transitions = await this.prisma.leadTransitionLog.findMany({
        where: { tenantId: user.tenantId, leadId },
        select: { fromStage: true, toStage: true },
      });

      const visitedNames = new Set<string>(
        transitions.flatMap((t) => [t.fromStage, t.toStage]).filter((s): s is string => s !== null)
      );

      const currentStageInfo = await this.prisma.pipelineStage.findFirst({
        where: { tenantId: user.tenantId, key: fromStageKey, isActive: true },
        select: { sortOrder: true, group: true },
      });

      if (currentStageInfo?.group != null && currentStageInfo?.sortOrder != null) {
        const prevStage = await this.prisma.pipelineStage.findFirst({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            group: currentStageInfo.group,
            sortOrder: { lt: currentStageInfo.sortOrder },
            name: { in: Array.from(visitedNames) },
          },
          orderBy: { sortOrder: 'desc' },
          select: { id: true },
        });

        if (prevStage?.id === toStage.id) {
          isAllowed = true;
        }
      }
    }
  }

  if (!isAllowed) {
    throw new BadRequestException(
      `Transição inválida: ${fromStageKey} -> ${toStage.key}`,
    );
  }

  const [updated] = await this.prisma.$transaction([
    this.prisma.lead.update({
      where: { id: leadId },
      data: { stageId: toStage.id },
    }),
    this.prisma.leadTransitionLog.create({
      data: {
        tenantId: user.tenantId,
        leadId,
        fromStage: fromStageName,
        toStage: toStage.name,
        changedBy: user?.id || 'USER',
      },
    }),
  ]);

  return updated;
}
  async getMyLeads(user: any) {
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        assignedUserId: user.id,
        deletedAt: null,
      },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(user.tenantId, leads);
  }

  async getBranchLeads(user: any, branchId?: string) {
    if (user.role === 'AGENT') {
      throw new ForbiddenException('Sem permissão');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { criadoEm: 'desc' },
    });

    return this.attachLastInboundPreview(user.tenantId, leads);
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

  async deleteLead(user: any, leadId: string, reason?: string) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Apenas o proprietário pode excluir leads');
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    // Remove arquivos do Cloudinary (documentos do lead e participantes)
    const docsWithFile = await this.prisma.leadDocument.findMany({
      where: { leadId, tenantId: user.tenantId, publicId: { not: null } },
      select: { publicId: true, mimeType: true },
    });
    if (docsWithFile.length > 0) {
      try {
        this.ensureCloudinaryConfigured();
        await Promise.all(docsWithFile.map(d => {
          const rt = d.mimeType?.startsWith('image/') ? 'image' : 'raw';
          return cloudinary.uploader.destroy(d.publicId!, { resource_type: rt, invalidate: true }).catch(() => {});
        }));
      } catch { /* não bloqueia o fluxo */ }
    }

    // Soft delete: mantém registro para auditoria LGPD (Art. 17)
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        deletedAt: new Date(),
        deletedBy: user.id ?? user.sub,
        deletionReason: reason ?? null,
      },
    });

    this.audit.log({
      tenantId: user.tenantId,
      userId: user.id ?? user.sub,
      action: 'DELETE_LEAD',
      resourceType: 'lead',
      resourceId: leadId,
      metadata: { reason: reason ?? null },
    });

    return { ok: true };
  }

  async exportCsv(user: { tenantId: string; role: string; branchId?: string }, filters: { from?: string; to?: string; stageId?: string }): Promise<string> {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (user.role === 'AGENT' && user.branchId) where.branchId = user.branchId;
    if (filters.from) where.criadoEm = { ...(where.criadoEm || {}), gte: new Date(filters.from) };
    if (filters.to) where.criadoEm = { ...(where.criadoEm || {}), lte: new Date(filters.to) };
    if (filters.stageId) where.stageId = filters.stageId;

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 10000,
      select: {
        id: true, nome: true, telefone: true, email: true, origem: true, status: true,
        criadoEm: true, atualizadoEm: true, resumoLead: true,
        stage: { select: { name: true } },
      },
    });

    this.audit.log({ tenantId: user.tenantId, action: 'EXPORT_DATA', metadata: { count: leads.length } });

    const header = ['ID', 'Nome', 'Telefone', 'Email', 'Origem', 'Status', 'Etapa', 'Resumo', 'Criado em', 'Atualizado em'];
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = leads.map((l) => [
      escape(l.id), escape(l.nome), escape(l.telefone), escape(l.email),
      escape(l.origem), escape(l.status), escape(l.stage?.name),
      escape(l.resumoLead), escape(l.criadoEm?.toISOString()), escape(l.atualizadoEm?.toISOString()),
    ].join(','));

    return [header.join(','), ...rows].join('\n');
  }
  // =========================================
  // CLASSIFICAÇÃO BULK E AI CADASTRO
  // =========================================

  /** Classifica tipos de mídia suportados pelo Claude vision */
  private claudeMediaType(mime: string): string | null {
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg';
    if (mime === 'image/png') return 'image/png';
    if (mime === 'image/webp') return 'image/webp';
    if (mime === 'image/gif') return 'image/gif';
    if (mime === 'application/pdf') return 'application/pdf';
    return null;
  }

  private normalizePersonName(name: string | null | undefined): string {
    return String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private personNameTokens(name: string | null | undefined): string[] {
    const stop = new Set(['da', 'de', 'di', 'do', 'dos', 'das', 'e']);
    return this.normalizePersonName(name)
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stop.has(t));
  }

  private nameMatchScore(a: string | null | undefined, b: string | null | undefined): number {
    const normA = this.normalizePersonName(a);
    const normB = this.normalizePersonName(b);
    if (!normA || !normB) return 0;
    if (normA === normB) return 100;

    const tokensA = Array.from(new Set(this.personNameTokens(a)));
    const tokensB = Array.from(new Set(this.personNameTokens(b)));
    if (!tokensA.length || !tokensB.length) return 0;

    const common = tokensA.filter((t) => tokensB.includes(t)).length;
    if (!common) return 0;

    const shortest = Math.max(1, Math.min(tokensA.length, tokensB.length));
    const longest = Math.max(tokensA.length, tokensB.length);
    const coverageShort = common / shortest;
    const coverageLong = common / longest;
    const firstMatch = tokensA[0] === tokensB[0] ? 1 : 0;
    const lastMatch = tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1] ? 1 : 0;
    const contained =
      tokensA.every((t) => tokensB.includes(t)) || tokensB.every((t) => tokensA.includes(t))
        ? 1
        : 0;

    const score = Math.round(
      coverageShort * 70 +
      coverageLong * 15 +
      firstMatch * 5 +
      lastMatch * 5 +
      contained * 5,
    );

    return Math.min(100, score);
  }

  private resolveDocumentOwner(
    leadNome: string,
    participantesConhecidos: string[],
    nomeDetectado: string | null,
  ): {
    participanteNome: string | null;
    ownerLabel: string;
    decision: 'LEAD' | 'PARTICIPANTE_EXISTENTE' | 'NOVO_PARTICIPANTE' | 'ALOCACAO_MANUAL';
    reason: string;
  } {
    const detected = String(nomeDetectado || '').trim();
    if (!detected) {
      return {
        participanteNome: null,
        ownerLabel: 'Alocação manual',
        decision: 'ALOCACAO_MANUAL',
        reason: 'Nenhum nome confiável foi encontrado no documento.',
      };
    }

    const leadScore = this.nameMatchScore(detected, leadNome);
    const bestParticipant = participantesConhecidos
      .map((nome) => ({ nome, score: this.nameMatchScore(detected, nome) }))
      .sort((a, b) => b.score - a.score)[0];

    const bestParticipantScore = bestParticipant?.score ?? 0;
    if (leadScore >= 72 && leadScore >= bestParticipantScore + 5) {
      return {
        participanteNome: null,
        ownerLabel: leadNome,
        decision: 'LEAD',
        reason: `Nome compatível com o lead principal (${leadScore}%).`,
      };
    }

    if (bestParticipant && bestParticipant.score >= 72) {
      return {
        participanteNome: bestParticipant.nome,
        ownerLabel: bestParticipant.nome,
        decision: 'PARTICIPANTE_EXISTENTE',
        reason: `Nome compatível com participante já existente (${bestParticipant.score}%).`,
      };
    }

    return {
      participanteNome: detected,
      ownerLabel: detected,
      decision: 'NOVO_PARTICIPANTE',
      reason: 'Nome encontrado não bate com lead nem participantes existentes; novo participante sugerido.',
    };
  }

  private buildDocumentProcessingSummary(input: {
    filename: string;
    tipo: string;
    nomeDetectado: string | null;
    ownerLabel: string;
    decision: 'LEAD' | 'PARTICIPANTE_EXISTENTE' | 'NOVO_PARTICIPANTE' | 'ALOCACAO_MANUAL';
    reason: string;
    pendingReview: boolean;
  }): string {
    const tipo = input.tipo === 'NAO_IDENTIFICADO' ? 'não identificado' : input.tipo;
    const nome = input.nomeDetectado ? `"${input.nomeDetectado}"` : 'sem nome detectado';

    if (input.pendingReview) {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Encaminhado para revisão manual. ${input.reason}`;
    }

    if (input.decision === 'NOVO_PARTICIPANTE') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Novo participante "${input.ownerLabel}" criado e documento anexado.`;
    }

    if (input.decision === 'PARTICIPANTE_EXISTENTE') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Documento anexado ao participante "${input.ownerLabel}".`;
    }

    if (input.decision === 'LEAD') {
      return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Documento anexado ao lead principal "${input.ownerLabel}".`;
    }

    return `Arquivo ${input.filename}: identificado como ${tipo}, nome ${nome}. Aguardando alocação manual.`;
  }

  private sanitizeExtractedCadastro(input: Record<string, any> | null | undefined): Record<string, any> {
    const allowed = [
      'cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao',
      'empresa', 'renda', 'rendaBrutaFamiliar', 'endereco', 'cep', 'cidade', 'uf',
      'telefone', 'email', 'fgts', 'valorEntrada',
    ];
    const out: Record<string, any> = {};
    for (const key of allowed) {
      const value = input?.[key];
      if (value !== null && value !== undefined && value !== '') out[key] = value;
    }
    return out;
  }

  /** Upload de buffer para Cloudinary → retorna { url, publicId } */
  private async uploadLeadDocBuffer(file: any, tenantId: string): Promise<{ url: string; publicId: string }> {
    this.ensureCloudinaryConfigured();
    const isImage = file.mimetype.startsWith('image/');
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `via-crm/lead-documents/${tenantId}`,
          resource_type: isImage ? 'image' : 'raw',
          type: 'upload',
          access_mode: 'public',
          use_filename: false,
          unique_filename: true,
        },
        (err: any, res: any) => {
          if (err) {
            err.file = file;
            return reject(err);
          }
          resolve({ url: res.secure_url, publicId: res.public_id });
        },
      ).end(file.buffer);
    });
  }

  /** Classifica um documento via Claude vision */
  private async classifyDocumentWithAI(
    file: any,
    leadNome: string,
    participantesConhecidos: string[] = [],
  ): Promise<{
    tipo: string;
    confianca: string;
    nomeDetectado: string | null;
    tipoLabel: string;
    observacao: string | null;
    motivo: string | null;
    cadastroExtraido: Record<string, any>;
  }> {
    const mediaType = this.claudeMediaType(file.mimetype);
    if (!mediaType) {
      return {
        tipo: 'NAO_IDENTIFICADO',
        confianca: 'BAIXA',
        nomeDetectado: null,
        tipoLabel: file.originalname,
        observacao: null,
        motivo: 'Tipo de arquivo não suportado para leitura pela IA.',
        cadastroExtraido: {},
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado');
    const client = new Anthropic({ apiKey });

    const model = await resolveAiModel(this.prisma, 'DOC_CLASSIFICATION', { allowDefaultFallback: false });

    const base64 = file.buffer.toString('base64');
    const isPdf = mediaType === 'application/pdf';

    const contentBlock: any = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const participantesCtx = participantesConhecidos.length > 0
      ? `Participantes já cadastrados: ${participantesConhecidos.join(' | ')}.`
      : '';

    const prompt = `Analise este documento brasileiro e responda SOMENTE com JSON (sem markdown).

Lead principal: "${leadNome}". ${participantesCtx}

Objetivo:
- identificar o tipo principal do documento
- extrair o nome da pessoa titular do documento, quando aparecer
- resumir em uma frase curta o motivo da classificação

{
  "tipo": "RG_CNH" | "CPF" | "COMP_RESIDENCIA" | "COMP_RENDA" | "FGTS" | "DECL_IR" | "CERT_ESTADO_CIVIL" | "CONTRATO_TRABALHO" | "OUTRO" | "NAO_IDENTIFICADO",
  "confianca": "ALTA" | "MEDIA" | "BAIXA",
  "nomeDetectado": null ou nome completo como aparece no documento,
  "tipoLabel": "descrição resumida (ex: RG de Maria Silva, Holerite 03/2025)",
  "observacao": "info extra: período, mês, data emissão (ou null)",
  "motivo": "frase curta explicando como chegou nessa classificação",
  "cadastroExtraido": {
    "cpf": "xxx.xxx.xxx-xx ou null",
    "rg": "número do RG ou null",
    "dataNascimento": "YYYY-MM-DD ou null",
    "estadoCivil": "SOLTEIRO|CASADO|DIVORCIADO|VIUVO|UNIAO_ESTAVEL|SEPARADO ou null",
    "naturalidade": "Cidade-UF ou null",
    "profissao": "profissão ou null",
    "empresa": "nome da empresa ou null",
    "renda": número ou null,
    "endereco": "endereço completo ou null",
    "cep": "xxxxx-xxx ou null",
    "cidade": "cidade ou null",
    "uf": "UF 2 letras ou null",
    "telefone": "número com DDD ou null",
    "email": "email ou null",
    "fgts": número ou null,
    "valorEntrada": número ou null
  }
}`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 350,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
      });
      const text = (response.content[0] as any)?.text ?? '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        ...parsed,
        cadastroExtraido: this.sanitizeExtractedCadastro(parsed?.cadastroExtraido),
      };
    } catch {
      return {
        tipo: 'NAO_IDENTIFICADO',
        confianca: 'BAIXA',
        nomeDetectado: null,
        tipoLabel: file.originalname,
        observacao: null,
        motivo: 'A IA não conseguiu classificar o documento.',
        cadastroExtraido: {},
      };
    }
  }

  /**
   * Classifica e persiste múltiplos documentos.
   * Fase 1 (síncrona): faz upload de todos para Cloudinary e cria como pendingReview=true → retorna imediatamente.
   * Fase 2 (background): classifica com IA sem bloquear o request.
   */
  async classifyBulkDocuments(tenantId: string, leadId: string, files: any[], userId: string) {
    this.logger.log(`classifyBulk: ${files.length} arquivos, lead=${leadId}`);
    await this.assertLeadAccess(tenantId, leadId);

    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId }, select: { nomeCorreto: true, nome: true } });
    const leadNome = (lead?.nomeCorreto ?? lead?.nome ?? 'Lead').trim();
    const existingParts = await (this.prisma as any).leadParticipante.findMany({ where: { leadId, tenantId }, select: { nome: true } });
    const participantesConhecidos: string[] = existingParts.map((p: any) => p.nome);

    // ── Fase 1: upload paralelo + criação imediata como pendingReview ─────────
    const uploadResults = await Promise.allSettled(
      files.map(file => this.uploadLeadDocBuffer(file, tenantId).then(r => ({ file, ...r }))),
    );

    const uploadErrors: string[] = [];
    const docsParaClassificar: Array<{ docId: string; file: any }> = [];

    for (const result of uploadResults) {
      if (result.status === 'rejected') {
        const failedFile = (result as any)?.reason?.file;
        const fileName = failedFile?.originalname ? `${failedFile.originalname}: ` : '';
        uploadErrors.push(fileName + (result.reason?.message ?? 'Erro no upload'));
        continue;
      }
      const { file, url, publicId } = result.value;
      try {
        const doc = await this.prisma.leadDocument.create({
          data: {
            leadId, tenantId,
            tipo: 'OUTRO',
            nome: file.originalname,
            url, publicId,
            filename: file.originalname,
            mimeType: file.mimetype,
            tamanho: file.size,
            status: 'ENVIADO',
            requestedBy: userId,
            classificadoPorIA: false,
            pendingReview: true,
            processingStatus: 'EM_FILA',
            processingStep: 'Aguardando análise da IA',
            aiSummary: `Arquivo ${file.originalname} recebido e enviado para análise.`,
          },
        });
        docsParaClassificar.push({ docId: doc.id, file });
      } catch (e: any) {
        uploadErrors.push(`${file.originalname}: ${e?.message}`);
      }
    }

    this.logger.log(`classifyBulk fase1: ${docsParaClassificar.length} docs criados, ${uploadErrors.length} erros de upload`);

    // ── Fase 2: classificação em background (não bloqueia o response) ─────────
    setImmediate(() => {
      this.classifyDocsBackground(tenantId, leadId, leadNome, participantesConhecidos, docsParaClassificar)
        .catch(e => this.logger.error(`classifyBulk background erro: ${e?.message}`));
    });

    return {
      pending: docsParaClassificar.length,
      uploadErrors,
      message: `${docsParaClassificar.length} documento(s) enviado(s). Classificação em andamento em segundo plano.`,
    };
  }

  /** Classifica documentos já salvos em background — sem timeout de request */
  private async classifyDocsBackground(
    tenantId: string,
    leadId: string,
    leadNome: string,
    participantesConhecidos: string[],
    docs: Array<{ docId: string; file: any }>,
  ) {
    for (const { docId, file } of docs) {
      try {
        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            processingStatus: 'ANALISANDO',
            processingStep: 'Lendo arquivo, classificando tipo e extraindo nome',
          },
        });

        const cls = await this.classifyDocumentWithAI(file, leadNome, participantesConhecidos);
        const isClassified = cls.tipo !== 'NAO_IDENTIFICADO' && cls.confianca !== 'BAIXA';

        const owner = this.resolveDocumentOwner(leadNome, participantesConhecidos, cls.nomeDetectado);
        let participanteNome = owner.participanteNome;

        if (owner.decision === 'NOVO_PARTICIPANTE' && participanteNome) {
          const existing = await (this.prisma as any).leadParticipante.findFirst({
            where: { leadId, tenantId, nome: participanteNome },
          });
          if (!existing) {
            await (this.prisma as any).leadParticipante.create({
              data: { leadId, tenantId, nome: participanteNome, classificacao: 'OUTRO' },
            });
            participantesConhecidos.push(participanteNome);
          } else {
            participanteNome = existing.nome;
          }
        }

        const pendingReview = !isClassified || owner.decision === 'ALOCACAO_MANUAL';
        const summary = this.buildDocumentProcessingSummary({
          filename: file.originalname,
          tipo: cls.tipo,
          nomeDetectado: cls.nomeDetectado,
          ownerLabel: owner.ownerLabel,
          decision: owner.decision,
          reason: cls.motivo || owner.reason,
          pendingReview,
        });

        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            tipo: isClassified ? cls.tipo : 'OUTRO',
            nome: cls.tipoLabel || file.originalname,
            participanteNome,
            observacao: cls.observacao ?? null,
            classificadoPorIA: true,
            pendingReview,
            processingStatus: pendingReview ? 'PENDENTE_REVISAO' : 'CONCLUIDO',
            processingStep: pendingReview ? 'Aguardando revisão humana' : 'Classificação concluída',
            aiExtractedName: cls.nomeDetectado ?? null,
            aiDecision: owner.decision,
            aiConfidence: cls.confianca,
            aiReason: cls.motivo || owner.reason,
            aiSummary: summary,
            aiExtractedData: cls.cadastroExtraido,
          },
        });
        this.logger.log(`classifyBulk bg: doc=${docId} tipo=${cls.tipo} confianca=${cls.confianca} decision=${owner.decision}`);

        // Auto-fill: preenche campos de cadastro vazios a partir do que a IA extraiu
        if (!pendingReview && Object.keys(cls.cadastroExtraido).length > 0) {
          try {
            if (participanteNome) {
              const part = await (this.prisma as any).leadParticipante.findFirst({
                where: { leadId, tenantId, nome: participanteNome },
              });
              if (part) {
                const partFields = ['cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf'] as const;
                const upd: any = {};
                const origens: Record<string, string | null> = { ...(part.cadastroOrigem ?? {}) };
                for (const f of partFields) {
                  const val = cls.cadastroExtraido[f];
                  if (val !== null && val !== undefined && val !== '' && (part[f] === null || part[f] === undefined || part[f] === '')) {
                    upd[f] = f === 'dataNascimento' ? new Date(String(val)) : val;
                    origens[f] = 'IA';
                  }
                }
                if (Object.keys(upd).length > 0) {
                  await (this.prisma as any).leadParticipante.update({
                    where: { id: part.id },
                    data: { ...upd, cadastroOrigem: origens },
                  });
                  this.logger.log(`classifyBulk bg: auto-fill participante="${participanteNome}" campos=${Object.keys(upd).join(',')}`);
                }
              }
            } else {
              const leadData = await this.prisma.lead.findFirst({
                where: { id: leadId, tenantId },
                select: { cpf: true, rg: true, dataNascimento: true, estadoCivil: true, naturalidade: true, profissao: true, empresa: true, rendaBrutaFamiliar: true, fgts: true, valorEntrada: true, telefone: true, email: true, endereco: true, cep: true, cidade: true, uf: true, cadastroOrigem: true },
              });
              if (leadData) {
                // Mapeamento: campo extraído → campo do lead
                const fieldMap: Record<string, string> = { renda: 'rendaBrutaFamiliar', fgts: 'fgts', valorEntrada: 'valorEntrada' };
                const srcFields = ['cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'fgts', 'valorEntrada', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf'];
                const upd: any = {};
                const origens: Record<string, string | null> = { ...((leadData.cadastroOrigem as any) ?? {}) };
                for (const srcField of srcFields) {
                  const destField = fieldMap[srcField] ?? srcField;
                  const val = cls.cadastroExtraido[srcField];
                  const current = (leadData as any)[destField];
                  if (val !== null && val !== undefined && val !== '' && (current === null || current === undefined || current === '')) {
                    upd[destField] = srcField === 'dataNascimento' ? new Date(String(val)) : val;
                    origens[destField] = 'IA';
                  }
                }
                if (Object.keys(upd).length > 0) {
                  await this.prisma.lead.update({
                    where: { id: leadId },
                    data: { ...upd, cadastroOrigem: origens },
                  });
                  this.logger.log(`classifyBulk bg: auto-fill lead campos=${Object.keys(upd).join(',')}`);
                }
              }
            }
          } catch (autoFillErr: any) {
            this.logger.warn(`classifyBulk bg: auto-fill ignorado doc=${docId}: ${autoFillErr?.message}`);
          }
        }
      } catch (e: any) {
        this.logger.error(`classifyBulk bg erro doc=${docId}: ${e?.message}`);
        await this.prisma.leadDocument.update({
          where: { id: docId },
          data: {
            processingStatus: 'ERRO',
            processingStep: 'Falha durante a análise da IA',
            aiReason: e?.message ?? 'Erro interno ao processar documento',
            aiSummary: `Arquivo ${file.originalname}: erro ao processar na IA. Revisão manual necessária.`,
          },
        }).catch(() => {});
      }
    }
    this.logger.log(`classifyBulk background concluído: ${docs.length} docs processados`);
  }

  /** Atualiza tipo/participante de doc pendente de revisão */
  async updateDocument(tenantId: string, leadId: string, docId: string, data: { tipo?: string; nome?: string; participanteNome?: string | null; observacao?: string | null; pendingReview?: boolean }) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const upd: any = {};
    if (data.tipo !== undefined) upd.tipo = data.tipo;
    if (data.nome !== undefined) upd.nome = data.nome;
    if ('participanteNome' in data) upd.participanteNome = data.participanteNome ?? null;
    if ('observacao' in data) upd.observacao = data.observacao ?? null;
    if (data.pendingReview !== undefined) {
      upd.pendingReview = data.pendingReview;
      if (data.pendingReview === false) {
        upd.processingStatus = 'CONCLUIDO';
        upd.processingStep = 'Revisão humana concluída';
        upd.aiDecision = data.participanteNome ? 'PARTICIPANTE_EXISTENTE' : 'LEAD';
        upd.aiSummary = `Documento revisado manualmente e alocado em ${data.participanteNome ? `"${data.participanteNome}"` : 'lead principal'}.`;
      }
    }
    return this.prisma.leadDocument.update({ where: { id: docId }, data: upd });
  }

  /** Preenche cadastro via IA lendo documentos já enviados */
  async aiCadastroFill(tenantId: string, leadId: string, participanteNome: string | null) {
    await this.assertLeadAccess(tenantId, leadId);

    const docs = await this.prisma.leadDocument.findMany({
      where: { leadId, tenantId, participanteNome, naoAplicavel: false, url: { not: null } },
    });

    if (docs.length === 0) throw new BadRequestException('Nenhum documento enviado para este participante');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado');
    const client = new Anthropic({ apiKey });

    const model = await resolveAiModel(this.prisma, 'DOC_CLASSIFICATION', { allowDefaultFallback: false });

    const contentBlocks: any[] = [];
    for (const doc of docs) {
      try {
        const res = await fetch(doc.url!);
        const buffer = Buffer.from(await res.arrayBuffer());
        const base64 = buffer.toString('base64');
        const mime = doc.mimeType || 'application/pdf';
        const mediaType = this.claudeMediaType(mime);
        if (!mediaType) continue;

        const isPdf = mime === 'application/pdf';
        contentBlocks.push(
          isPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
            : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        );
        contentBlocks.push({ type: 'text', text: `(Documento: ${doc.nome}${doc.observacao ? ' — ' + doc.observacao : ''})` });
      } catch { /* skip doc unavailable */ }
    }

    if (contentBlocks.length === 0) throw new BadRequestException('Nenhum documento processável encontrado');

    contentBlocks.push({
      type: 'text',
      text: `Extraia as informações pessoais dos documentos acima e responda SOMENTE com JSON (sem markdown):
{
  "cpf": "xxx.xxx.xxx-xx ou null",
  "rg": "número do RG ou null",
  "dataNascimento": "YYYY-MM-DD ou null",
  "estadoCivil": "SOLTEIRO|CASADO|DIVORCIADO|VIUVO|UNIAO_ESTAVEL|SEPARADO ou null",
  "naturalidade": "Cidade-UF ou null",
  "profissao": "profissão ou null",
  "empresa": "nome da empresa ou null",
  "renda": número ou null,
  "endereco": "endereço completo ou null",
  "cep": "xxxxx-xxx ou null",
  "cidade": "cidade ou null",
  "uf": "UF 2 letras ou null",
  "telefone": "número com DDD ou null",
  "email": "email ou null"
}`,
    });

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: contentBlocks }],
      });
      const text = (response.content[0] as any)?.text ?? '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const campos = JSON.parse(clean);

      // Origens: todos os campos não-nulos vêm da IA
      const origens: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(campos)) {
        origens[k] = (v !== null && v !== undefined && v !== '') ? 'IA' : null;
      }

      return { campos, origens };
    } catch (e: any) {
      throw new BadRequestException('Erro ao processar documentos com IA: ' + (e?.message ?? ''));
    }
  }

  // =========================================
  // DOCUMENTOS DO LEAD
  // =========================================

  async listDocuments(tenantId: string, leadId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    return this.prisma.leadDocument.findMany({
      where: { leadId, tenantId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  // =========================================
  // PARTICIPANTES DO LEAD
  // =========================================

  async listParticipantes(tenantId: string, leadId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    return (this.prisma as any).leadParticipante.findMany({
      where: { leadId, tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createParticipante(tenantId: string, leadId: string, data: { nome: string; classificacao?: string }) {
    await this.assertLeadAccess(tenantId, leadId);
    return (this.prisma as any).leadParticipante.create({
      data: { leadId, tenantId, nome: data.nome, classificacao: data.classificacao ?? null },
    });
  }

  async updateParticipante(tenantId: string, leadId: string, partId: string, data: Record<string, any>) {
    await this.assertLeadAccess(tenantId, leadId);
    const allowed = ['nome', 'classificacao', 'cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf', 'sortOrder'];
    const updateData: any = {};
    for (const f of allowed) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.dataNascimento !== undefined) {
      updateData.dataNascimento = data.dataNascimento ? new Date(data.dataNascimento) : null;
    }
    return (this.prisma as any).leadParticipante.update({
      where: { id: partId },
      data: updateData,
    });
  }

  async deleteParticipante(tenantId: string, leadId: string, partId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const part = await (this.prisma as any).leadParticipante.findFirst({ where: { id: partId, leadId, tenantId } });
    if (!part) throw new NotFoundException('Participante não encontrado');
    // Remove arquivos do Cloudinary antes de deletar os registros
    const docsToDelete = await this.prisma.leadDocument.findMany({
      where: { leadId, tenantId, participanteNome: part.nome, publicId: { not: null } },
      select: { publicId: true, mimeType: true },
    });
    if (docsToDelete.length > 0) {
      try {
        this.ensureCloudinaryConfigured();
        await Promise.all(docsToDelete.map(d => {
          const rt = d.mimeType?.startsWith('image/') ? 'image' : 'raw';
          return cloudinary.uploader.destroy(d.publicId!, { resource_type: rt, invalidate: true }).catch(() => {});
        }));
      } catch { /* não bloqueia o fluxo se Cloudinary não estiver configurado */ }
    }
    // Remove documentos do banco e o participante
    await this.prisma.leadDocument.deleteMany({ where: { leadId, tenantId, participanteNome: part.nome } });
    await (this.prisma as any).leadParticipante.delete({ where: { id: partId } });
    return { ok: true };
  }

  async createDocument(tenantId: string, leadId: string, data: { tipo: string; nome: string; participanteNome?: string; participanteClassificacao?: string; observacao?: string }, userId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const createData: any = {
      leadId,
      tenantId,
      tipo: data.tipo,
      nome: data.nome,
      participanteNome: data.participanteNome ?? null,
      participanteClassificacao: data.participanteClassificacao ?? null,
      observacao: data.observacao ?? null,
      requestedBy: userId,
      processingStatus: 'MANUAL',
      processingStep: 'Documento criado manualmente',
    };
    return this.prisma.leadDocument.create({ data: createData });
  }

  // participanteNome null = lead principal; string = participante adicional
  async toggleNaoAplicavel(tenantId: string, leadId: string, tipo: string, naoAplicavel: boolean, participanteNome: string | null = null) {
    await this.assertLeadAccess(tenantId, leadId);
    const filter: any = { leadId, tenantId, tipo, participanteNome };
    if (naoAplicavel) {
      // Remove docs reais deste participante neste tipo e cria marcador N/A
      await this.prisma.leadDocument.deleteMany({ where: { ...filter, naoAplicavel: false } });
      const existing = await this.prisma.leadDocument.findFirst({ where: { ...filter, naoAplicavel: true } });
      if (!existing) {
        const naData: any = { leadId, tenantId, tipo, nome: 'N/A', naoAplicavel: true, participanteNome };
        await this.prisma.leadDocument.create({ data: naData });
      }
    } else {
      await this.prisma.leadDocument.deleteMany({ where: { ...filter, naoAplicavel: true } });
    }
    return { ok: true };
  }

  async uploadDocument(tenantId: string, leadId: string, docId: string, file: any) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    this.ensureCloudinaryConfigured();

    // Se já tinha arquivo, deleta o antigo
    if (doc.publicId) {
      const rt = doc.mimeType?.startsWith('image/') ? 'image' : 'raw';
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: rt, invalidate: true }).catch(() => {});
    }

    const isImage = file.mimetype.startsWith('image/');
    const result: any = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `via-crm/lead-documents/${tenantId}`,
          resource_type: isImage ? 'image' : 'raw',
          type: 'upload',
          access_mode: 'public',
          use_filename: false,
          unique_filename: true,
        },
        (err, res) => { if (err) return reject(err); resolve(res); },
      ).end(file.buffer);
    });

    return this.prisma.leadDocument.update({
      where: { id: docId },
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        filename: file.originalname,
        mimeType: file.mimetype,
        tamanho: file.size,
        status: 'ENVIADO',
        processingStatus: doc.classificadoPorIA ? doc.processingStatus : 'MANUAL',
        processingStep: doc.classificadoPorIA ? doc.processingStep : 'Upload manual concluído',
      },
    });
  }

  async viewDocument(tenantId: string, leadId: string, docId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({
      where: { id: docId, leadId, tenantId },
      select: { url: true, mimeType: true, filename: true, nome: true },
    });
    if (!doc?.url) throw new NotFoundException('Documento não encontrado ou sem arquivo');

    const response = await fetch(doc.url);
    if (!response.ok) throw new NotFoundException('Arquivo não disponível no storage');

    const mimeType = doc.mimeType || 'application/octet-stream';
    const rawName = doc.filename || doc.nome || 'documento';
    const filename = this.safeFilename(rawName, mimeType.split('/')[1] || 'bin');
    const contentLength = response.headers.get('content-length');

    return {
      mimeType,
      filename,
      contentLength: contentLength ? Number(contentLength) : undefined,
      stream: Readable.from(response.body as any),
    };
  }

  async deleteDocument(tenantId: string, leadId: string, docId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const doc = await this.prisma.leadDocument.findFirst({ where: { id: docId, leadId, tenantId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    if (doc.publicId) {
      this.ensureCloudinaryConfigured();
      const rt = doc.mimeType?.startsWith('image/') ? 'image' : 'raw';
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: rt, invalidate: true }).catch(() => {});
    }

    await this.prisma.leadDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  private async assertLeadAccess(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
  }

}
