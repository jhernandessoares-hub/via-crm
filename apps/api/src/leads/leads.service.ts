

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

    const mediaKind = isImage ? 'image' : isVideo ? 'video' : 'document';

    // Rota pelo canal ativo do lead
    if (lead.conversaCanal === 'WHATSAPP_LIGHT' && lead.conversaSessionId) {
      const sessionId = lead.conversaSessionId;
      const to = lead.telefone!;
      const lightUrl = cloudUrl ?? '';
      try {
        if (isImage) {
          await this.unofficialService.sendImage(sessionId, to, lightUrl);
        } else if (isVideo) {
          await this.unofficialService.sendVideo(sessionId, to, lightUrl);
        } else {
          await this.unofficialService.sendDocument(sessionId, to, lightUrl, originalname, mimetype || 'application/octet-stream');
        }
      } catch (err: any) {
        await this.prisma.leadEvent.create({
          data: {
            tenantId: user.tenantId,
            leadId,
            channel: 'whatsapp.out.failed',
            payloadRaw: { type: mediaKind, error: err?.message || String(err) },
          },
        });
        throw err;
      }

      await this.prisma.leadEvent.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          channel: 'whatsapp.unofficial.out',
          payloadRaw: {
            to,
            type: mediaKind,
            media: {
              kind: mediaKind,
              mimeType: mimetype,
              filename: originalname,
              url: cloudUrl,
            },
          },
        },
      });

      return { ok: true };
    }

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
            type: mediaKind,
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
          type: mediaKind,
          media: {
            kind: mediaKind,
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

    // ✅ garante pipeline/stages e define stage inicial (primeiro ativo por sortOrder)
    const pipelineId = await this.pipelineService.ensureDefaultPipeline(tenantId);
    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { tenantId, pipelineId, isActive: true },
      orderBy: { sortOrder: 'asc' },
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

    // Busca stages dos leads E todas as stages ativas do tenant para inicializar grupos vazios
    const [stagesOfLeads, allActiveStages] = await Promise.all([
      stageIds.length > 0
        ? this.prisma.pipelineStage.findMany({
            where: { id: { in: stageIds } },
            select: { id: true, group: true },
          })
        : Promise.resolve([]),
      this.pipelineService.getActiveStages(tenantId),
    ]);

    const stageGroupMap: Record<string, string> = {};
    for (const s of stagesOfLeads) {
      if (s.group) stageGroupMap[s.id] = s.group;
    }

    // Inicializa todos os grupos com 0 (na ordem das stages ativas)
    const groups: Record<string, number> = {};
    for (const s of allActiveStages) {
      if (s.group && !(s.group in groups)) groups[s.group] = 0;
    }

    const firstGroup = Object.keys(groups)[0] ?? 'PRE_ATENDIMENTO';
    if (!(firstGroup in groups)) groups[firstGroup] = 0;

    for (const l of leadsWithStage) {
      const g = l.stageId ? stageGroupMap[l.stageId] : null;
      if (g) {
        if (!(g in groups)) groups[g] = 0;
        groups[g]++;
      }
    }

    // Leads sem stage vão para o primeiro grupo
    const noStage = await this.prisma.lead.count({ where: { ...baseWhere, stageId: null } });
    groups[firstGroup] += noStage;

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
    // Grupos derivados das stages ativas do tenant (não hardcoded).
    const ALL_GROUP_LABELS: Record<string, string> = {
      PRE_ATENDIMENTO:     'Pré-atendimento',
      AGENDAMENTO:         'Agendamento',
      NEGOCIACOES:         'Negociações',
      CREDITO_IMOBILIARIO: 'Crédito Imobiliário',
      NEGOCIO_FECHADO:     'Negócio Fechado',
      POS_VENDA:           'Pós-venda',
      DOCUMENTACAO:        'Documentação',
      ESCOLHA_UNIDADE:     'Escolha da Unidade',
      CONTRATO:            'Contrato',
      REGISTRO:            'Registro',
    };

    // Funil: leads criados no período
    const todosLeads = await this.prisma.lead.findMany({
      where: periodWhere,
      select: { id: true, stageId: true },
    });
    const todosLeadIds = todosLeads.map((l) => l.id);

    // Todas as stages do tenant (ativas) para mapear stageId → group e stageName → group
    const todasStages = await this.pipelineService.getActiveStages(tenantId);
    const stageGroupMap: Record<string, string> = {};
    const stageNameGroupMap: Record<string, string> = {};
    for (const s of todasStages) {
      if (s.group) {
        stageGroupMap[s.id] = s.group;
        if (s.name) stageNameGroupMap[s.name.toLowerCase()] = s.group;
      }
    }

    // Grupos do tenant na ordem das stages
    const seenGroups = new Set<string>();
    const GROUPS: string[] = [];
    for (const s of todasStages) {
      if (s.group && !seenGroups.has(s.group)) {
        seenGroups.add(s.group);
        GROUPS.push(s.group);
      }
    }
    const firstGroup = GROUPS[0] ?? 'PRE_ATENDIMENTO';

    // Monta set de (leadId, group) que o lead atingiu
    const leadGrupos = new Map<string, Set<string>>();
    const addGrupo = (leadId: string, stageRef: string) => {
      // stageRef pode ser UUID (stageId) ou nome (toStage no log)
      const g = stageGroupMap[stageRef] ?? stageNameGroupMap[stageRef.toLowerCase()];
      if (!g) return;
      if (!leadGrupos.has(leadId)) leadGrupos.set(leadId, new Set());
      leadGrupos.get(leadId)!.add(g);
    };

    // Todos os leads começam no primeiro grupo do funil
    for (const l of todosLeads) {
      if (!leadGrupos.has(l.id)) leadGrupos.set(l.id, new Set());
      leadGrupos.get(l.id)!.add(firstGroup);
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

    const funil = GROUPS.map((g) => ({ key: g, label: ALL_GROUP_LABELS[g] ?? g, count: groupCounts[g] }));

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
        stage: { select: { id: true, name: true, key: true, group: true } },
        developmentUnits: {
          select: {
            id: true,
            nome: true,
            status: true,
            finalPrice: true,
            propostaPagamento: true,
            soldAt: true,
            development: { select: { nome: true } },
            tower: { select: { nome: true } },
          },
        },
      },
    });

    const assignedIds = [...new Set(leads.map((l) => l.assignedUserId).filter(Boolean))] as string[];
    const assignedUsers = assignedIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, nome: true, apelido: true } })
      : [];
    const assignedMap = Object.fromEntries(assignedUsers.map((u) => [u.id, u.apelido || u.nome]));
    const enriched = leads.map((l) => ({
      ...l,
      assignedUserName: l.assignedUserId ? (assignedMap[l.assignedUserId] ?? null) : null,
    }));

    return this.attachLastInboundPreview(tenantId, enriched);
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
      tower: { select: { nome: true } },
      reservaHistory: { orderBy: { createdAt: 'desc' } },
    },
  });

  let empreendimentoInteresse: { id: string; nome: string; capaUrl: string | null } | null = null;
  if ((lead as any).empreendimentoInteresseId) {
    empreendimentoInteresse = await this.prisma.development.findFirst({
      where: { id: (lead as any).empreendimentoInteresseId, tenantId: user.tenantId },
      select: { id: true, nome: true, capaUrl: true },
    }) ?? null;
  }

  return {
    ...lead,
    stageId: effectiveStageId,
    stageKey,
    stageName,
    stageGroup,
    previousStageName,
    previousStageKey,
    developmentUnits: linkedUnits,
    empreendimentoInteresse,
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

    // Pipeline customizado: stages não presentes na matriz padrão têm livre movimento
    const isCustomStage = fromStageKey !== 'BASE_FRIA' && !Object.prototype.hasOwnProperty.call(allowedTransitions, fromStageKey);

    if (isCustomStage) {
      const currentStageRecord = await this.prisma.pipelineStage.findFirst({
        where: { tenantId: user.tenantId, key: fromStageKey, isActive: true },
        select: { pipelineId: true },
      });

      const allCustomStages = currentStageRecord
        ? await this.prisma.pipelineStage.findMany({
            where: {
              tenantId: user.tenantId,
              pipelineId: currentStageRecord.pipelineId,
              isActive: true,
              NOT: { id: effectiveCurrentStageId ?? undefined },
              ...(user.role !== 'OWNER' ? { ownerOnly: false } : {}),
            },
            select: { id: true, key: true, name: true, sortOrder: true, requiresEvidence: true, ownerOnly: true },
            orderBy: { sortOrder: 'asc' },
          })
        : [];

      return {
        leadId,
        currentStageId: effectiveCurrentStageId,
        currentStageKey: fromStageKey,
        allowedStages: allCustomStages,
      };
    }

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
              requiresEvidence: true,
              ownerOnly: true,
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
  empreendimentoInteresseId?: string | null;
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
  if (data.empreendimentoInteresseId !== undefined) updateData.empreendimentoInteresseId = data.empreendimentoInteresseId;
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
      produtoInteresseId: true, empreendimentoInteresseId: true, resumoLead: true,
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

  if (toStage.ownerOnly && user?.role !== 'OWNER') {
    throw new ForbiddenException('Apenas o OWNER pode mover para esta etapa.');
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

  // Pipeline customizado: stages fora da matriz padrão têm livre movimento
  const isCustomTransition =
    fromStageKey !== 'BASE_FRIA' &&
    !Object.prototype.hasOwnProperty.call(allowedTransitions, fromStageKey);

  if (isCustomTransition) {
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
      include: {
        stage: { select: { id: true, name: true, key: true, group: true } },
      },
    });

    const userInfo = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { nome: true, apelido: true },
    });
    const myName = userInfo?.apelido || userInfo?.nome || null;
    const enriched = leads.map((l) => ({ ...l, assignedUserName: myName }));

    return this.attachLastInboundPreview(user.tenantId, enriched);
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

    // Quando conversaCanal ainda não está definido (lead manual), o frontend pode
    // indicar qual sessão WA Light usar. Se sessionId informado → trata como Light.
    const chosenSessionId: string | null = input.sessionId || null;
    const isLight = lead.conversaCanal === 'WHATSAPP_LIGHT' ||
      (lead.conversaCanal === null && !!chosenSessionId);
    const activeSessionId = lead.conversaSessionId || chosenSessionId;

    if (isLight) {
      if (!activeSessionId) {
        throw new Error('Sessão WhatsApp Light não especificada');
      }

      try {
        await this.unofficialService.sendText(activeSessionId, lead.telefone, text);
      } catch (sendErr: any) {
        await this.prisma.leadEvent.create({
          data: {
            tenantId: user.tenantId,
            leadId,
            channel: 'whatsapp.unofficial.out.failed',
            payloadRaw: {
              to: lead.telefone,
              sessionId: activeSessionId,
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
            sessionId: activeSessionId,
            type: 'text',
            text,
            message: text,
            body: text,
            aiAssistancePercent,
            aiAssistanceLabel,
          },
        },
      });

      // Fixa o canal no lead na primeira mensagem outbound
      if (!lead.conversaCanal) {
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: activeSessionId },
        });
      }

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

    // Fixa o canal no lead na primeira mensagem outbound
    if (!lead.conversaCanal) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { conversaCanal: 'WHATSAPP_OFICIAL' },
      });
    }

    return { ok: true };
  }

  async updateCanal(user: any, leadId: string, body: { conversaCanal: string | null; conversaSessionId?: string | null }) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        conversaCanal: body.conversaCanal,
        conversaSessionId: body.conversaCanal === 'WHATSAPP_LIGHT' ? (body.conversaSessionId ?? null) : null,
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

  // =========================================
  // DUPLICATAS
  // =========================================

  /**
   * Jaro-Winkler similarity (inline — sem pacote externo)
   */
  private jaroWinkler(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0;

    const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, len2);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro =
      (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix bonus
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }

  private normalizeNome(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(de|da|do|dos|das|e)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async findDuplicates(tenantId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        nome: true,
        nomeCorreto: true,
        telefone: true,
        telefoneKey: true,
        email: true,
        cpf: true,
        criadoEm: true,
        origem: true,
        numero: true,
        stage: { select: { name: true } },
        assignedUserId: true,
        developmentUnits: {
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            status: true,
            tower: { select: { nome: true } },
            development: { select: { id: true, nome: true } },
          },
          take: 3,
        },
      },
      orderBy: { criadoEm: 'asc' },
      take: 2000,
    });

    // Enriquecer com nome do assignedUser em batch
    const userIds = [...new Set(leads.map((l) => l.assignedUserId).filter(Boolean))] as string[];
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nome: true },
        })
      : [];
    const userById: Record<string, string> = {};
    for (const u of users) userById[u.id] = u.nome;

    const toReturn = (l: (typeof leads)[0]) => ({
      id: l.id,
      nome: l.nome,
      nomeCorreto: l.nomeCorreto,
      telefone: l.telefone,
      email: l.email,
      cpf: l.cpf,
      criadoEm: l.criadoEm,
      source: l.origem,
      numero: l.numero,
      stage: l.stage ? { nome: l.stage.name } : null,
      assignedUser: l.assignedUserId ? { nome: userById[l.assignedUserId] ?? '' } : null,
      developmentUnits: l.developmentUnits.map((u) => ({
        id: u.id,
        nome: u.nome,
        status: u.status,
        towerNome: u.tower?.nome ?? null,
        developmentNome: u.development?.nome ?? null,
      })),
    });

    // ── Grupo CERTA: mesmo telefoneKey OU mesmo CPF ───────────────────────────
    const byPhone = new Map<string, typeof leads>();
    const byCpf   = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (lead.telefoneKey) {
        if (!byPhone.has(lead.telefoneKey)) byPhone.set(lead.telefoneKey, []);
        byPhone.get(lead.telefoneKey)!.push(lead);
      }
      const cpfDigits = lead.cpf ? lead.cpf.replace(/\D/g, '') : null;
      if (cpfDigits && cpfDigits.length === 11) {
        if (!byCpf.has(cpfDigits)) byCpf.set(cpfDigits, []);
        byCpf.get(cpfDigits)!.push(lead);
      }
    }

    const certaPairs = new Set<string>();
    const gruposCerta: Array<{ tipo: 'CERTA'; motivo: string; leads: ReturnType<typeof toReturn>[] }> = [];

    function addCertaGroup(grupo: typeof leads, motivo: string) {
      if (grupo.length < 2) return;
      // Deduplicar: não adicionar grupo se todos os pares já foram vistos
      const newPairs: string[] = [];
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          const key = [grupo[i].id, grupo[j].id].sort().join('|');
          if (!certaPairs.has(key)) newPairs.push(key);
        }
      }
      if (newPairs.length === 0) return;
      newPairs.forEach((k) => certaPairs.add(k));
      gruposCerta.push({ tipo: 'CERTA', motivo, leads: grupo.map(toReturn) });
    }

    for (const grupo of byPhone.values()) addCertaGroup(grupo, 'Mesmo telefone');
    for (const grupo of byCpf.values())   addCertaGroup(grupo, 'Mesmo CPF');

    // ── Grupo POSSIVEL: nome similar Jaro-Winkler >= 0.80 ────────────────────
    const gruposPossivel: Array<{ tipo: 'POSSIVEL'; score: number; motivo: string; leads: ReturnType<typeof toReturn>[] }> = [];
    const possivelPairsSeen = new Set<string>();

    for (let i = 0; i < leads.length; i++) {
      for (let j = i + 1; j < leads.length; j++) {
        const a = leads[i];
        const b = leads[j];
        const pairKey = [a.id, b.id].sort().join('|');

        if (certaPairs.has(pairKey)) continue;
        if (possivelPairsSeen.has(pairKey)) continue;

        // CPFs preenchidos e diferentes = pessoas distintas (CPF é único por pessoa)
        const cpfA = a.cpf?.replace(/\D/g, '');
        const cpfB = b.cpf?.replace(/\D/g, '');
        if (cpfA && cpfB && cpfA.length === 11 && cpfB.length === 11 && cpfA !== cpfB) continue;

        const nomeA = this.normalizeNome(a.nome);
        const nomeB = this.normalizeNome(b.nome);
        if (!nomeA || !nomeB) continue;

        const score = this.jaroWinkler(nomeA, nomeB);
        if (score >= 0.80) {
          possivelPairsSeen.add(pairKey);
          gruposPossivel.push({ tipo: 'POSSIVEL', score: Math.round(score * 100) / 100, motivo: 'Nome similar', leads: [toReturn(a), toReturn(b)] });
        }
      }
    }

    // Ordenar POSSIVEL por score desc
    gruposPossivel.sort((a, b) => b.score - a.score);

    return {
      grupos: [...gruposCerta, ...gruposPossivel] as Array<
        { tipo: 'CERTA'; motivo: string; leads: ReturnType<typeof toReturn>[] } |
        { tipo: 'POSSIVEL'; score: number; motivo: string; leads: ReturnType<typeof toReturn>[] }
      >,
      totalCerta: gruposCerta.length,
      totalPossivel: gruposPossivel.length,
    };
  }

  async search(user: any, q: string) {
    const { tenantId, role, id: userId, branchId } = user;
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];

    let extraFilter: Record<string, unknown> = {};
    if (role === 'AGENT') {
      const canViewAll = await this.agentCanViewPipeline(tenantId);
      if (!canViewAll) extraFilter = { assignedUserId: userId };
    } else if (role === 'MANAGER' && branchId) {
      extraFilter = { branchId };
    }

    const isNumeric = /^\d+$/.test(trimmed);
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...extraFilter,
        OR: [
          { nome: { contains: trimmed, mode: 'insensitive' } },
          { nomeCorreto: { contains: trimmed, mode: 'insensitive' } },
          { telefone: { contains: trimmed } },
          { cpf: { contains: trimmed } },
          ...(isNumeric ? [{ numero: { equals: parseInt(trimmed, 10) } }] : []),
        ],
      },
      take: 10,
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        nomeCorreto: true,
        telefone: true,
        email: true,
        cpf: true,
        criadoEm: true,
        origem: true,
        numero: true,
        assignedUserId: true,
        stage: { select: { name: true } },
        developmentUnits: {
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            status: true,
            tower: { select: { nome: true } },
            development: { select: { nome: true } },
          },
          take: 3,
        },
      },
    });

    const userIds = [...new Set(leads.map((l) => l.assignedUserId).filter(Boolean))] as string[];
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
      : [];
    const userById: Record<string, string> = {};
    for (const u of users) userById[u.id] = u.nome;

    return leads.map((l) => ({
      id: l.id,
      nome: l.nome,
      nomeCorreto: l.nomeCorreto,
      telefone: l.telefone,
      email: l.email,
      cpf: l.cpf,
      criadoEm: l.criadoEm,
      source: l.origem,
      numero: l.numero,
      stage: l.stage ? { nome: l.stage.name } : null,
      assignedUser: l.assignedUserId ? { nome: userById[l.assignedUserId] ?? '' } : null,
      developmentUnits: l.developmentUnits.map((u) => ({
        id: u.id,
        nome: u.nome,
        status: u.status,
        towerNome: u.tower?.nome ?? null,
        developmentNome: u.development?.nome ?? null,
      })),
    }));
  }

  async mergeLeads(
    tenantId: string,
    winnerId: string,
    sourceId: string,
    fieldChoices: {
      nome?: 'winner' | 'source';
      nomeCorreto?: 'winner' | 'source';
      telefone?: 'winner' | 'source';
      email?: 'winner' | 'source';
      cpf?: 'winner' | 'source';
      rg?: 'winner' | 'source';
      profissao?: 'winner' | 'source';
      empresa?: 'winner' | 'source';
      endereco?: 'winner' | 'source';
      cep?: 'winner' | 'source';
      cidade?: 'winner' | 'source';
      uf?: 'winner' | 'source';
      stageId?: 'winner' | 'source';
      assignedUserId?: 'winner' | 'source';
      origem?: 'winner' | 'source';
      observacao?: 'winner' | 'source';
    },
    actor?: { id: string; nome: string },
  ) {
    if (winnerId === sourceId) throw new BadRequestException('winner e source não podem ser o mesmo lead');

    const [winner, source] = await Promise.all([
      this.prisma.lead.findFirst({ where: { id: winnerId, tenantId, deletedAt: null } }),
      this.prisma.lead.findFirst({ where: { id: sourceId, tenantId, deletedAt: null } }),
    ]);

    if (!winner) throw new NotFoundException('Lead vencedor não encontrado');
    if (!source) throw new NotFoundException('Lead fonte não encontrado');

    // Monta os campos que vêm do source
    const updateData: Record<string, any> = {};
    const mergeable: Array<keyof typeof fieldChoices> = [
      'nome', 'nomeCorreto', 'telefone', 'email', 'cpf', 'rg',
      'profissao', 'empresa', 'endereco', 'cep', 'cidade', 'uf',
      'stageId', 'assignedUserId', 'origem', 'observacao',
    ];

    for (const field of mergeable) {
      if (fieldChoices[field] === 'source') {
        updateData[field] = (source as any)[field] ?? null;
      }
    }

    // Recalcular telefoneKey se telefone mudou
    const newTelefone = updateData['telefone'] !== undefined ? updateData['telefone'] : winner.telefone;
    if (newTelefone) {
      const digits = newTelefone.replace(/\D/g, '');
      updateData['telefoneKey'] = digits.slice(-9);
    }

    await this.prisma.$transaction(async (tx) => {
      // Transferir LeadEvent
      await tx.leadEvent.updateMany({ where: { leadId: sourceId, tenantId }, data: { leadId: winnerId } });

      // Transferir LeadDocument
      await tx.leadDocument.updateMany({ where: { leadId: sourceId, tenantId }, data: { leadId: winnerId } });

      // Transferir LeadParticipante
      await (tx as any).leadParticipante.updateMany({ where: { leadId: sourceId, tenantId }, data: { leadId: winnerId } });

      // Transferir DevelopmentUnit (leadId nullable FK)
      await (tx as any).developmentUnit.updateMany({ where: { leadId: sourceId }, data: { leadId: winnerId } });

      // Soft-delete source
      await tx.lead.update({
        where: { id: sourceId },
        data: {
          deletedAt: new Date(),
          deletedBy: actor?.id ?? 'system',
          deletionReason: `Mesclado com lead ${winnerId}`,
        },
      });

      // Update winner com campos escolhidos
      if (Object.keys(updateData).length > 0) {
        await tx.lead.update({ where: { id: winnerId }, data: updateData });
      }
    });

    await this.audit.log({
      tenantId,
      userId: actor?.id,
      action: 'LEAD_MERGE',
      resourceType: 'Lead',
      resourceId: winnerId,
      metadata: { winnerId, sourceId, fieldChoices, actor: actor?.nome },
    });

    this.logger.log(`Lead mesclado: source=${sourceId} → winner=${winnerId} por ${actor?.nome ?? 'sistema'}`);

    // Retornar winner atualizado via getById (sem pipeline check, busca simples)
    const updated = await this.prisma.lead.findFirst({
      where: { id: winnerId, tenantId },
      include: {
        stage: { select: { id: true, name: true, key: true, group: true } },
      },
    });
    return updated;
  }

}
