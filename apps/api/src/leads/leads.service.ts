

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

// ✅ NOVO: download seguro Cloudinary via backend (proxy)
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import Anthropic from '@anthropic-ai/sdk';
import { resolveAiModel } from '../ai/resolve-ai-model';

// ✅ NOVO: Pipeline (ETAPA 2)
import { PipelineService } from '../pipeline/pipeline.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { MessagingService } from '../messaging/messaging.service';
import { LeadDocumentsService } from '../lead-documents/lead-documents.service';
import { getNextLeadNumber } from './lead-numbering.helper';
import { resolvePermissions } from '../tenants/permissions.config';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger('LeadsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineService: PipelineService,
    private readonly audit: AuditService,
    private readonly queueService: QueueService,
    private readonly unofficialService: WhatsappUnofficialService,
    private readonly messaging: MessagingService,
    private readonly leadDocuments: LeadDocumentsService,
  ) {}

  // =========================================
  // ✅ CONFIG CLOUDINARY (inicializado em main.ts via initCloudinary())
  // =========================================
  private ensureCloudinaryConfigured() {
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error(
        'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
      );
    }
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

        const metaInfo = await this.messaging.metaGetDownloadUrl(String(mediaId), user.tenantId);
        const meta = await this.messaging.metaDownloadStream(metaInfo.downloadUrl, user.tenantId);

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
      await this.messaging.ensureMetaCompatibleAudio(bufferRaw, mimetypeRaw);

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

    const upload = await this.messaging.uploadMetaMedia({
      buffer: bufferFinal,
      filename: originalname,
      mimeType: mimeFinal,
    }, user.tenantId);

    let send: Awaited<ReturnType<MessagingService['sendMetaAudioMessage']>>;
    try {
      send = await this.messaging.sendMetaAudioMessage(lead.telefone, upload.mediaId, user.tenantId);
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
    const upload = await this.messaging.uploadMetaMedia({
      buffer,
      filename: originalname,
      mimeType: mimetype || 'application/octet-stream',
    }, user.tenantId);

    let send: Awaited<ReturnType<MessagingService['sendMetaImageMessage']>>;
    try {
      send = isImage
        ? await this.messaging.sendMetaImageMessage(lead.telefone, upload.mediaId, user.tenantId)
        : isVideo
          ? await this.messaging.sendMetaVideoMessage(lead.telefone, upload.mediaId, user.tenantId)
          : await this.messaging.sendMetaDocumentMessage(
              lead.telefone,
              upload.mediaId,
              originalname,
              user.tenantId,
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

  private async getFileBuffer(file: any): Promise<Buffer> {
    if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;

    if (file?.path && typeof file.path === 'string') {
      return fs.promises.readFile(file.path);
    }

    throw new BadRequestException(
      'Arquivo inválido: não encontrei buffer nem path',
    );
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
        const numero = await getNextLeadNumber(tx, tenantId);
        const created = await tx.lead.create({
          data: {
            tenantId,
            numero,
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
      const canViewAll = await this.agentCanViewPipeline(tenantId);
      if (!canViewAll) extraFilter = { assignedUserId: id };
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

  async dashboard(
    user: { id: string; tenantId: string; role: string; branchId?: string | null },
    from: Date,
    to: Date,
  ) {
    const { id, tenantId, role, branchId } = user;

    let roleFilter: Record<string, unknown> = {};
    if (role === 'AGENT') roleFilter = { assignedUserId: id };
    else if (role === 'MANAGER' && branchId) roleFilter = { branchId };

    const baseWhere = { tenantId, ...roleFilter, deletedAt: null };
    const periodWhere = { ...baseWhere, criadoEm: { gte: from, lte: to } };

    // ── Cards ──────────────────────────────────────────────────────────
    const [totalPeriodo, fechados, perdidos, ativos] = await Promise.all([
      this.prisma.lead.count({ where: periodWhere }),
      this.prisma.lead.count({ where: { ...periodWhere, status: 'FECHADO' } }),
      this.prisma.lead.count({ where: { ...periodWhere, status: 'PERDIDO' } }),
      this.prisma.lead.count({ where: { ...baseWhere, status: { notIn: ['FECHADO', 'PERDIDO'] } } }),
    ]);

    const taxaConversao = totalPeriodo > 0 ? Math.round((fechados / totalPeriodo) * 100) : 0;

    // ── Funil cumulativo — quantos leads PASSARAM por cada grupo ───────
    // Lógica: para cada grupo, conta leads criados no período que
    // chegaram àquele grupo (estão lá agora OU já passaram por lá).
    const GROUPS = ['PRE_ATENDIMENTO', 'AGENDAMENTO', 'NEGOCIACOES', 'CREDITO_IMOBILIARIO', 'NEGOCIO_FECHADO', 'POS_VENDA'];
    const GROUP_LABELS: Record<string, string> = {
      PRE_ATENDIMENTO: 'Pré-atendimento',
      AGENDAMENTO: 'Agendamento',
      NEGOCIACOES: 'Negociações',
      CREDITO_IMOBILIARIO: 'Crédito Imobiliário',
      NEGOCIO_FECHADO: 'Negócio Fechado',
      POS_VENDA: 'Pós-venda',
    };

    // Funil: leads criados no período
    const todosLeads = await this.prisma.lead.findMany({
      where: periodWhere,
      select: { id: true, stageId: true },
    });
    const todosLeadIds = todosLeads.map((l) => l.id);

    // Todas as stages do tenant para mapear stageId → group e stageName → group
    const todasStages = await this.prisma.pipelineStage.findMany({
      where: { pipeline: { tenantId } },
      select: { id: true, name: true, group: true },
    });
    const stageGroupMap: Record<string, string> = {};
    const stageNameGroupMap: Record<string, string> = {};
    for (const s of todasStages) {
      if (s.group) {
        stageGroupMap[s.id] = s.group;
        if (s.name) stageNameGroupMap[s.name.toLowerCase()] = s.group;
      }
    }

    // Monta set de (leadId, group) que o lead atingiu
    const leadGrupos = new Map<string, Set<string>>();
    const addGrupo = (leadId: string, stageRef: string) => {
      // stageRef pode ser UUID (stageId) ou nome (toStage no log)
      const g = stageGroupMap[stageRef] ?? stageNameGroupMap[stageRef.toLowerCase()];
      if (!g) return;
      if (!leadGrupos.has(leadId)) leadGrupos.set(leadId, new Set());
      leadGrupos.get(leadId)!.add(g);
    };

    // Todos os leads começam em PRE_ATENDIMENTO
    for (const l of todosLeads) {
      if (!leadGrupos.has(l.id)) leadGrupos.set(l.id, new Set());
      leadGrupos.get(l.id)!.add('PRE_ATENDIMENTO');
      if (l.stageId) addGrupo(l.id, l.stageId);
    }

    // Histórico de transições (toStage = nome da etapa no log)
    const transicoes = todosLeadIds.length > 0
      ? await this.prisma.leadTransitionLog.findMany({
          where: { tenantId, leadId: { in: todosLeadIds } },
          select: { leadId: true, toStage: true },
        })
      : [];
    for (const t of transicoes) addGrupo(t.leadId, t.toStage);

    // Conta distintos por grupo
    const groupCounts: Record<string, number> = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    for (const grupos of leadGrupos.values()) {
      for (const g of grupos) {
        if (g in groupCounts) groupCounts[g]++;
      }
    }

    const funil = GROUPS.map((g) => ({ key: g, label: GROUP_LABELS[g], count: groupCounts[g] }));

    // ── Origem dos leads ───────────────────────────────────────────────
    const leadsComOrigem = await this.prisma.lead.findMany({
      where: periodWhere,
      select: { origem: true },
    });
    const origemMap: Record<string, number> = {};
    for (const l of leadsComOrigem) {
      const key = l.origem || 'Não informado';
      origemMap[key] = (origemMap[key] || 0) + 1;
    }
    const origens = Object.entries(origemMap)
      .map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── Leads recentes ─────────────────────────────────────────────────
    const recentes = await this.prisma.lead.findMany({
      where: periodWhere,
      select: {
        id: true, nome: true, telefone: true, origem: true, criadoEm: true,
        status: true, stageId: true, assignedUserId: true,
      },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    });

    // Enriches recentes com stage name e responsavel
    const recenteStageIds = [...new Set(recentes.map((l) => l.stageId).filter(Boolean))] as string[];
    const recenteUserIds = [...new Set(recentes.map((l) => l.assignedUserId).filter(Boolean))] as string[];
    const [recenteStages, recenteUsers] = await Promise.all([
      recenteStageIds.length > 0
        ? this.prisma.pipelineStage.findMany({ where: { id: { in: recenteStageIds } }, select: { id: true, name: true, group: true } })
        : [],
      recenteUserIds.length > 0
        ? this.prisma.user.findMany({ where: { id: { in: recenteUserIds } }, select: { id: true, nome: true, apelido: true } })
        : [],
    ]);
    const stageById = Object.fromEntries(recenteStages.map((s) => [s.id, s]));
    const userById = Object.fromEntries(recenteUsers.map((u) => [u.id, u]));

    // ── IA execuções ───────────────────────────────────────────────────
    const aiCount = await this.prisma.aiExecutionLog.count({
      where: { tenantId, createdAt: { gte: from, lte: to } },
    });

    // ── Agenda próxima ─────────────────────────────────────────────────
    const now = new Date();
    const agendaWhere: any = {
      tenantId,
      startAt: { gte: now },
      status: { in: ['AGENDADO', 'CONFIRMADO'] },
    };
    if (role === 'AGENT') agendaWhere.userId = id;
    else if (role === 'MANAGER' && branchId) {
      const teamIds = await this.prisma.user.findMany({ where: { tenantId, branchId }, select: { id: true } });
      agendaWhere.userId = { in: teamIds.map((u) => u.id) };
    }

    const agenda = await this.prisma.calendarEvent.findMany({
      where: agendaWhere,
      select: { id: true, title: true, startAt: true, eventType: true, status: true, leadId: true, userId: true },
      orderBy: { startAt: 'asc' },
      take: 5,
    });

    // Enriches agenda com lead nome e user
    const agendaLeadIds = [...new Set(agenda.map((e) => e.leadId).filter(Boolean))] as string[];
    const agendaUserIds = [...new Set(agenda.map((e) => e.userId).filter(Boolean))] as string[];
    const [agendaLeads, agendaUsers] = await Promise.all([
      agendaLeadIds.length > 0
        ? this.prisma.lead.findMany({ where: { id: { in: agendaLeadIds } }, select: { id: true, nome: true } })
        : [],
      agendaUserIds.length > 0
        ? this.prisma.user.findMany({ where: { id: { in: agendaUserIds } }, select: { id: true, nome: true, apelido: true } })
        : [],
    ]);
    const leadById = Object.fromEntries(agendaLeads.map((l) => [l.id, l]));
    const agendaUserById = Object.fromEntries(agendaUsers.map((u) => [u.id, u]));

    return {
      periodo: { from, to },
      cards: { totalPeriodo, ativos, fechados, perdidos, taxaConversao },
      funil,
      origens,
      recentes: recentes.map((l) => {
        const stage = l.stageId ? stageById[l.stageId] : null;
        const usr = l.assignedUserId ? userById[l.assignedUserId] : null;
        return {
          id: l.id, nome: l.nome, telefone: l.telefone, origem: l.origem,
          status: l.status, stageName: stage?.name ?? null, stageGroup: stage?.group ?? null,
          responsavel: usr?.apelido || usr?.nome || null, criadoEm: l.criadoEm,
        };
      }),
      ia: { execucoes: aiCount },
      agenda: agenda.map((e) => {
        const lead = e.leadId ? leadById[e.leadId] : null;
        const usr = e.userId ? agendaUserById[e.userId] : null;
        return {
          id: e.id, title: e.title, startAt: e.startAt, eventType: e.eventType,
          status: e.status, leadNome: lead?.nome ?? null, leadId: lead?.id ?? null,
          responsavel: usr?.apelido || usr?.nome || null,
        };
      }),
    };
  }

  private async agentCanViewPipeline(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
    return perms.agent.pipeline?.view ?? false;
  }

  async list(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};

    if (role === 'AGENT') {
      const canViewAll = await this.agentCanViewPipeline(tenantId);
      if (!canViewAll) extraFilter = { assignedUserId: id };
    } else if (role === 'MANAGER' && branchId) {
      extraFilter = { branchId };
    }

    const leads = await this.prisma.lead.findMany({
      where: { tenantId, ...extraFilter, deletedAt: null },
      orderBy: { criadoEm: 'desc' },
      include: {
        developmentUnits: {
          select: {
            id: true,
            nome: true,
            status: true,
            finalPrice: true,
            propostaPagamento: true,
            soldAt: true,
            development: { select: { nome: true } },
          },
        },
      },
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
  let stageGroup: string | null = null;
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
        group: true,
      },
    });

    if (currentStage) {
      stageKey = currentStage.key;
      stageName = currentStage.name;
      stageGroup = currentStage.group ?? null;
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

  const linkedUnits = await this.prisma.developmentUnit.findMany({
    where: { leadId: id },
    select: {
      id: true,
      nome: true,
      status: true,
      developmentId: true,
      finalPrice: true,
      propostaPagamento: true,
      propostaObs: true,
      comprador: true,
      soldAt: true,
      development: { select: { id: true, nome: true } },
    },
  });

  return {
    ...lead,
    stageId: effectiveStageId,
    stageKey,
    stageName,
    stageGroup,
    previousStageName,
    previousStageKey,
    developmentUnits: linkedUnits,
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
      this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true, tenantId: true } }),
      this.prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true, tenantId: true } }),
    ]);

    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!assignedUser) throw new NotFoundException('Usuário não encontrado');
    if (lead.tenantId !== user.tenantId) {
      throw new ForbiddenException('Acesso negado a este lead');
    }
    if (assignedUser.tenantId !== user.tenantId) {
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

    const isLight = lead.conversaCanal === 'WHATSAPP_LIGHT';

    if (isLight) {
      if (!lead.conversaSessionId) {
        throw new Error('Lead WhatsApp Light sem sessão de origem');
      }

      try {
        await this.unofficialService.sendText(lead.conversaSessionId, lead.telefone, text);
      } catch (sendErr: any) {
        await this.prisma.leadEvent.create({
          data: {
            tenantId: user.tenantId,
            leadId,
            channel: 'whatsapp.unofficial.out.failed',
            payloadRaw: {
              to: lead.telefone,
              sessionId: lead.conversaSessionId,
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

      await this.prisma.leadEvent.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          channel: 'whatsapp.unofficial.out',
          payloadRaw: {
            to: lead.telefone,
            sessionId: lead.conversaSessionId,
            type: 'text',
            text,
            message: text,
            body: text,
            aiAssistancePercent,
            aiAssistanceLabel,
          },
        },
      });

      return { ok: true };
    }

    let result: Awaited<ReturnType<MessagingService['sendMetaMessage']>>;
    try {
      result = await this.messaging.sendMetaMessage(lead.telefone, text, user.tenantId);
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
          return cloudinary.uploader.destroy(d.publicId!, { resource_type: rt, type: 'authenticated', invalidate: true }).catch(() => {});
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

  async exportCsv(user: { tenantId: string; role: string; branchId?: string; id?: string; sub?: string }, filters: { from?: string; to?: string; stageId?: string }): Promise<string> {
    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (user.role === 'AGENT') {
      if (user.branchId) where.branchId = user.branchId;
      else where.assignedUserId = user.id ?? user.sub;
    }
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
  // DOCUMENTOS DO LEAD (delegado para LeadDocumentsService)
  // =========================================

  async classifyBulkDocuments(tenantId: string, leadId: string, files: any[], userId: string) {
    return this.leadDocuments.classifyBulkDocuments(tenantId, leadId, files, userId);
  }

  async updateDocument(tenantId: string, leadId: string, docId: string, data: { tipo?: string; nome?: string; participanteNome?: string | null; observacao?: string | null; pendingReview?: boolean }) {
    return this.leadDocuments.updateDocument(tenantId, leadId, docId, data);
  }

  async aiCadastroFill(tenantId: string, leadId: string, participanteNome: string | null) {
    return this.leadDocuments.aiCadastroFill(tenantId, leadId, participanteNome);
  }

  async listDocuments(tenantId: string, leadId: string) {
    return this.leadDocuments.listDocuments(tenantId, leadId);
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
    const existing = await (this.prisma as any).leadParticipante.findFirst({ where: { id: partId, leadId } });
    if (!existing) throw new NotFoundException('Participante não encontrado neste lead');
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
          return cloudinary.uploader.destroy(d.publicId!, { resource_type: rt, type: 'authenticated', invalidate: true }).catch(() => {});
        }));
      } catch { /* não bloqueia o fluxo se Cloudinary não estiver configurado */ }
    }
    // Remove documentos do banco e o participante
    await this.prisma.leadDocument.deleteMany({ where: { leadId, tenantId, participanteNome: part.nome } });
    await (this.prisma as any).leadParticipante.delete({ where: { id: partId } });
    return { ok: true };
  }

  async createDocument(tenantId: string, leadId: string, data: { tipo: string; nome: string; participanteNome?: string; participanteClassificacao?: string; observacao?: string }, userId: string) {
    return this.leadDocuments.createDocument(tenantId, leadId, data, userId);
  }

  async toggleNaoAplicavel(tenantId: string, leadId: string, tipo: string, naoAplicavel: boolean, participanteNome: string | null = null) {
    return this.leadDocuments.toggleNaoAplicavel(tenantId, leadId, tipo, naoAplicavel, participanteNome);
  }

  async uploadDocument(tenantId: string, leadId: string, docId: string, file: any) {
    return this.leadDocuments.uploadDocument(tenantId, leadId, docId, file);
  }

  async viewDocument(tenantId: string, leadId: string, docId: string) {
    return this.leadDocuments.viewDocument(tenantId, leadId, docId);
  }

  async deleteDocument(tenantId: string, leadId: string, docId: string) {
    return this.leadDocuments.deleteDocument(tenantId, leadId, docId);
  }

  private async assertLeadAccess(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
  }

}
