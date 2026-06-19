

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
import { buildLeadInteresseLabel } from './lead-interesse.helper';
import { resolvePermissions, resolveFieldVisibility, resolveDocumentAccess, DocumentAccessLevel } from '../tenants/permissions.config';
import { isValidCPF } from './cpf.util';
import { digitsOnly, normalizePhoneBR } from '../common/phone.util';
import { resolveSlaConfig } from '../tenants/sla.config';

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
            type: 'upload',
            access_mode: 'public',
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

      // depois de upload vem opcionalmente "s--sig--", depois "v123", depois o publicId + ext
      const afterUpload = parts.slice(uploadIdx + 1);
      const afterSig =
        afterUpload.length > 0 && /^s--[A-Za-z0-9_-]+--$/.test(afterUpload[0])
          ? afterUpload.slice(1)
          : afterUpload;
      const withoutVersion =
        afterSig.length > 0 && /^v\d+$/.test(afterSig[0])
          ? afterSig.slice(1)
          : afterSig;

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
   * Gera URL de download privada via credenciais admin do Cloudinary.
   * Funciona para qualquer asset (upload ou authenticated), expira em 5min.
   * O backend usa pra baixar — o frontend nunca vê essa URL.
   */
  private buildPrivateDownloadUrl(input: {
    publicId: string;
    ext: string;
    resourceType: 'image' | 'video' | 'raw';
    deliveryType?: 'upload' | 'authenticated';
  }): string {
    this.ensureCloudinaryConfigured();
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutos
    const format = input.ext && input.ext !== 'bin' ? input.ext : '';
    return (cloudinary.utils as any).private_download_url(input.publicId, format, {
      resource_type: input.resourceType,
      type: input.deliveryType ?? 'upload',
      expires_at: expiresAt,
      attachment: false,
    });
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

    const candidateUrls: string[] = [];

    // (A) URL do Cloudinary, se disponível
    if (url && url.includes('cloudinary.com')) {
      candidateUrls.push(url);

      const parsed = this.parseCloudinaryUrl(url);
      if (parsed?.publicId) {
        // Ajuste: pdf deve ser raw (mesmo se a URL atual veio como image/upload)
        let resourceType: 'image' | 'video' | 'raw' = parsed.resourceType;
        if (parsed.ext === 'pdf') resourceType = 'raw';

        // URL assinada (fallback)
        try {
          const signedUrl = this.buildPrivateDownloadUrl({
            publicId: parsed.publicId,
            ext: parsed.ext,
            resourceType,
          });
          if (signedUrl && signedUrl !== url) candidateUrls.push(signedUrl);
        } catch {}

        // Para raw: tenta também com a extensão incluída no publicId
        // (Cloudinary raw resources guardam a ext no public_id, ex: "arquivo.pdf")
        if (resourceType === 'raw' && parsed.ext && parsed.ext !== 'bin') {
          const publicIdWithExt = `${parsed.publicId}.${parsed.ext}`;
          for (const t of ['upload', 'authenticated'] as const) {
            try {
              const rawExtUrl = (cloudinary.utils as any).private_download_url(publicIdWithExt, '', {
                resource_type: 'raw',
                type: t,
                expires_at: Math.floor(Date.now() / 1000) + 300,
                attachment: false,
              });
              if (rawExtUrl && !candidateUrls.includes(rawExtUrl)) candidateUrls.push(rawExtUrl);
            } catch {}
          }
        }

        // Tenta type: 'authenticated' com o publicId sem ext (asset pode ter esse delivery type)
        try {
          const authUrl = this.buildPrivateDownloadUrl({
            publicId: parsed.publicId,
            ext: parsed.ext,
            resourceType,
            deliveryType: 'authenticated',
          });
          if (authUrl && !candidateUrls.includes(authUrl)) candidateUrls.push(authUrl);
        } catch {}

        // Fallback extra — tenta resource_type alternativo
        const altResourceTypes: Array<'image' | 'video' | 'raw'> = (['image', 'video', 'raw'] as const).filter((x) => x !== resourceType);
        for (const rt of altResourceTypes) {
          try {
            const altSigned = this.buildPrivateDownloadUrl({
              publicId: parsed.publicId,
              ext: parsed.ext,
              resourceType: rt,
            });
            if (altSigned && !candidateUrls.includes(altSigned)) candidateUrls.push(altSigned);
          } catch {}
        }
      }
    } else if (url && url.startsWith('http')) {
      // URL direta (não-Cloudinary): tenta servir diretamente
      candidateUrls.push(url);
    }

    let parsedExt = '';
    let parsedFilenameBase = 'arquivo';
    if (url && url.includes('cloudinary.com')) {
      const tmp = this.parseCloudinaryUrl(url);
      if (tmp?.publicId) {
        parsedExt = tmp.ext || '';
        parsedFilenameBase = tmp.publicId.split('/').pop() || 'arquivo';
      }
    } else if (filenameRaw) {
      const dot = filenameRaw.lastIndexOf('.');
      parsedExt = dot >= 0 ? filenameRaw.slice(dot + 1) : '';
      parsedFilenameBase = filenameRaw;
    }

    const allErrors: string[] = [];
    let res: any = null;

    this.logger.warn(`downloadEventMedia: ${candidateUrls.length} candidatos para evento ${eventId}, media.url=${url?.slice(0, 120)}`);

    for (const u of candidateUrls) {
      try {
        const r = await fetch(u, { method: 'GET' });
        if (r.ok && r.body) {
          res = r;
          break;
        }
        const txt = await r.text().catch(() => '');
        const errLine = `[${u.slice(0, 120)} → ${r.status} ${txt.slice(0, 300)}]`;
        allErrors.push(errLine);
        this.logger.warn(`downloadEventMedia: falha → ${errLine}`);
      } catch (e: any) {
        const errLine = `[${u.slice(0, 120)} → ERR ${e?.message || String(e)}]`;
        allErrors.push(errLine);
        this.logger.warn(`downloadEventMedia: exceção → ${errLine}`);
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

      if (candidateUrls.length === 0) {
        throw new BadRequestException(
          'Este arquivo não possui URL de download disponível. Pode ser um arquivo antigo enviado antes do armazenamento ser configurado.',
        );
      }
      throw new BadRequestException(
        `Falha ao baixar arquivo. falhas=${JSON.stringify(allErrors)}`,
      );
    }

    const contentType =
      res.headers.get('content-type') || mimeType || 'application/octet-stream';
    const len = res.headers.get('content-length');
    const contentLength = len ? Number(len) : undefined;

    const g = this.guessFromMime(contentType);
    const extFinal = parsedExt || g.ext;
    const filename = this.safeFilename(
      filenameRaw || `${parsedFilenameBase}.${extFinal}`,
      extFinal,
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
        conversaCanal: true,
        stage: { select: { group: true, key: true, name: true } },
      },
    });

    if (!lead) throw new NotFoundException('Lead não encontrado');

    // Config do SLA do canal do lead (reflete a tela Config SLA)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { slaConfig: true },
    });
    const slaCfg = resolveSlaConfig(tenant?.slaConfig as any);
    const canal: 'light' | 'oficial' = lead.conversaCanal === 'WHATSAPP_LIGHT' ? 'light' : 'oficial';
    const channelCfg = slaCfg[canal];
    const inScope = !channelCfg.etapas.length || (lead.stage?.key ? channelCfg.etapas.includes(lead.stage.key) : false);

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
      canal,
      slaEnabled: channelCfg.enabled,
      slaMode: channelCfg.mode,
      slaInScope: inScope,
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

    if (buffer.length > 50 * 1024 * 1024) {
      throw new BadRequestException('Arquivo muito grande. O tamanho máximo permitido é 50 MB.');
    }

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

    if (!cloudUrl) {
      throw new BadRequestException('Falha ao armazenar mídia (URL Cloudinary vazia). Tente novamente.');
    }

    const mediaKind = isImage ? 'image' : isVideo ? 'video' : 'document';

    // Rota pelo canal ativo do lead
    if (lead.conversaCanal === 'WHATSAPP_LIGHT' && lead.conversaSessionId) {
      const sessionId = lead.conversaSessionId;
      const to = lead.telefone!;
      try {
        // Passa o buffer diretamente — Baileys não precisa baixar do Cloudinary
        if (isImage) {
          await this.unofficialService.sendImage(sessionId, to, buffer);
        } else if (isVideo) {
          await this.unofficialService.sendVideo(sessionId, to, buffer);
        } else {
          await this.unofficialService.sendDocument(sessionId, to, buffer, originalname, mimetype || 'application/octet-stream');
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
        throw new BadRequestException(err?.message || 'Falha ao enviar via WhatsApp Light.');
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
    let upload: Awaited<ReturnType<MessagingService['uploadMetaMedia']>>;
    try {
      upload = await this.messaging.uploadMetaMedia({
        buffer,
        filename: originalname,
        mimeType: mimetype || 'application/octet-stream',
      }, user.tenantId);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Falha ao enviar mídia para o WhatsApp (upload Meta).');
    }

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
      throw new BadRequestException(err?.message || 'Falha ao enviar mensagem via WhatsApp (Meta).');
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
    return digitsOnly(v);
  }

  private telefoneKeyFrom(input: string): string {
    let d = this.digitsOnly(input);

    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length > 11) d = d.slice(-11);
    if (d.length >= 9) return d.slice(-9);

    return d;
  }

  /** Normaliza para o padrão de discagem 55+DDD+numero (ex: 5511999999999).
   * Garante que o número salvo seja sempre completo, para o envio de WhatsApp
   * conseguir falar com o cliente. Números nacionais (10/11 dígitos) recebem o 55;
   * números que já têm o país (12/13 dígitos) são mantidos. */
  private normalizePhoneBR(input: string | null | undefined): string | null {
    return normalizePhoneBR(input);
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
  async create(tenantId: string, body: any, actor?: { id?: string; sub?: string; role?: string }) {
    const telefoneRaw = body?.telefone ? String(body.telefone) : '';
    const telefoneDigits = this.normalizePhoneBR(telefoneRaw);

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

    this.audit.log({
      tenantId,
      userId: actor?.id ?? actor?.sub,
      action: 'CREATE_LEAD',
      resourceType: 'lead',
      resourceId: lead.id,
      metadata: { nome: body.nome, origem: body.origem ?? null, role: actor?.role ?? null },
    });

    return lead;
  }

  async counts(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};
    if (role === 'AGENT' || role === 'PARTNER') {
      const canViewAll = await this.canViewPipeline(tenantId, role);
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

    // Base Fria — contagem dedicada (cobre BASE_FRIA do pipeline padrão e
    // BASE_FRIA_PRE/AGENDAMENTO/NEGOCIACOES do pipeline v2)
    const baseFria = await this.prisma.lead.count({
      where: { ...baseWhere, stage: { key: { startsWith: 'BASE_FRIA' } } },
    });

    return { total, mine, groups, baseFria };
  }

  async getPendingReply(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    const roleFilter: Record<string, unknown> =
      role === 'AGENT' || role === 'PARTNER'
        ? { assignedUserId: id }
        : role === 'MANAGER' && branchId
          ? { branchId }
          : {};

    const leads = await this.prisma.lead.findMany({
      where: { tenantId, deletedAt: null, lastInboundAt: { not: null }, ...roleFilter },
      select: { id: true, nome: true, nomeCorreto: true, telefone: true, lastInboundAt: true, lastReadAt: true },
      orderBy: { lastInboundAt: 'desc' },
      take: 100,
    });

    if (leads.length === 0) return [];

    const leadIds = leads.map((l) => l.id);

    const lastOutbounds = await this.prisma.leadEvent.groupBy({
      by: ['leadId'],
      where: {
        leadId: { in: leadIds },
        channel: { in: ['whatsapp.out', 'whatsapp.unofficial.out'] },
      },
      _max: { criadoEm: true },
    });

    const lastOutboundMap = new Map(
      lastOutbounds.map((lo) => [lo.leadId, lo._max.criadoEm]),
    );

    return leads
      .filter((lead) => {
        const lastOut = lastOutboundMap.get(lead.id);
        const aguardaResposta = !lastOut || lead.lastInboundAt! > lastOut;
        if (!aguardaResposta) return false;
        // Já lido: o usuário abriu o lead depois da última mensagem recebida → some da lista.
        if (lead.lastReadAt && lead.lastReadAt >= lead.lastInboundAt!) return false;
        return true;
      })
      .map(({ lastReadAt, ...rest }) => rest)
      .slice(0, 20);
  }

  async dashboard(
    user: { id: string; tenantId: string; role: string; branchId?: string | null },
    from: Date,
    to: Date,
  ) {
    const { id, tenantId, role, branchId } = user;

    let roleFilter: Record<string, unknown> = {};
    if (role === 'AGENT' || role === 'PARTNER') roleFilter = { assignedUserId: id };
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

    // Externo Consultivo: visibilidade de campos
    const fv = await this.getPartnerFieldVisibility(tenantId, role);
    const showField = (k: string) => !fv || fv[k] !== false;

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
    if (role === 'AGENT' || role === 'PARTNER') agendaWhere.userId = id;
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
          id: l.id, nome: l.nome,
          telefone: showField('lead.telefone') ? l.telefone : null,
          origem: showField('lead.origem') ? l.origem : null,
          status: l.status, stageName: stage?.name ?? null, stageGroup: stage?.group ?? null,
          responsavel: showField('lead.responsavel') ? (usr?.apelido || usr?.nome || null) : null,
          criadoEm: showField('lead.dataCriacao') ? l.criadoEm : null,
        };
      }),
      ia: { execucoes: aiCount },
      agenda: agenda.map((e) => {
        const lead = e.leadId ? leadById[e.leadId] : null;
        const usr = e.userId ? agendaUserById[e.userId] : null;
        return {
          id: e.id, title: e.title, startAt: e.startAt, eventType: e.eventType,
          status: e.status, leadNome: lead?.nome ?? null, leadId: lead?.id ?? null,
          responsavel: showField('lead.responsavel') ? (usr?.apelido || usr?.nome || null) : null,
        };
      }),
    };
  }

  private async canViewPipeline(tenantId: string, role: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
    const roleKey = role.toLowerCase() as 'agent' | 'partner';
    return perms[roleKey]?.pipeline?.view ?? false;
  }

  /**
   * Visibilidade de campos do Externo Consultivo (role PARTNER). Retorna null
   * para qualquer outro role (sem restrição). true = campo visível.
   */
  private async getPartnerFieldVisibility(
    tenantId: string,
    role: string,
  ): Promise<Record<string, boolean> | null> {
    if (role !== 'PARTNER') return null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    return resolveFieldVisibility((tenant?.permissionsConfig as any)?.fieldVisibility);
  }

  /**
   * Nível de acesso a documentos do Externo Consultivo. 'download' para qualquer
   * outro role (sem restrição).
   */
  async getPartnerDocumentAccess(tenantId: string, role: string): Promise<DocumentAccessLevel> {
    if (role !== 'PARTNER') return 'download';
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    return resolveDocumentAccess((tenant?.permissionsConfig as any)?.documentAccess);
  }

  /**
   * Verifica uma permissão configurável (módulo/ação) para o role. OWNER tem bypass total.
   * Respeita o config do tenant (`permissionsConfig`) com fallback nos defaults.
   */
  async hasPermission(
    tenantId: string,
    role: string,
    module: string,
    action: string,
  ): Promise<boolean> {
    if (role === 'OWNER') return true;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
    const roleKey = role.toLowerCase();
    return !!perms[roleKey]?.[module]?.[action];
  }

  /** Remove do payload os campos ocultos para o Externo Consultivo (segurança real). */
  private sanitizeLeadForPartner<T extends Record<string, any>>(
    lead: T,
    fv: Record<string, boolean>,
  ): T {
    const hidden = (k: string) => fv[k] === false;

    if (hidden('lead.telefone')) {
      (lead as any).telefone = null;
      (lead as any).whatsapp = null;
    }
    if (hidden('lead.responsavel')) (lead as any).assignedUserName = null;
    if (hidden('lead.cpf')) (lead as any).cpf = null;
    if (hidden('lead.rg')) (lead as any).rg = null;
    if (hidden('lead.email')) (lead as any).email = null;
    if (hidden('lead.endereco')) {
      (lead as any).endereco = null;
      (lead as any).cep = null;
      (lead as any).cidade = null;
      (lead as any).uf = null;
    }
    if (hidden('lead.profissao')) {
      (lead as any).profissao = null;
      (lead as any).empresa = null;
      (lead as any).naturalidade = null;
    }
    if (hidden('lead.financeiro')) {
      (lead as any).rendaBrutaFamiliar = null;
      (lead as any).fgts = null;
      (lead as any).valorEntrada = null;
    }
    if (hidden('lead.estadoCivil')) {
      (lead as any).estadoCivil = null;
      (lead as any).dataNascimento = null;
    }
    if (hidden('lead.origem')) {
      (lead as any).origem = null;
      (lead as any).cadastroOrigem = null;
    }
    if (hidden('lead.resumo')) (lead as any).resumoLead = null;
    if (hidden('lead.observacao')) (lead as any).observacao = null;
    if (hidden('lead.dataCriacao')) {
      (lead as any).criadoEm = null;
      (lead as any).reentradaCount = null;
    }
    if (hidden('lead.conversa')) {
      (lead as any).lastInboundText = null;
      (lead as any).lastInboundChannel = null;
      (lead as any).lastInboundEventAt = null;
      (lead as any).conversaRestricted = true;
    }

    for (const u of ((lead as any).developmentUnits ?? []) as Record<string, any>[]) {
      this.applyUnitVisibility(u, fv);
    }

    (lead as any).restrictedFields = Object.keys(fv).filter((k) => fv[k] === false);
    return lead;
  }

  /** Remove campos ocultos de uma unidade (espelho) para o Externo Consultivo. */
  private applyUnitVisibility(u: Record<string, any>, fv: Record<string, boolean>): void {
    const hidden = (k: string) => fv[k] === false;
    if (hidden('unit.identificacao')) {
      u.nome = null;
      if (u.development) u.development = { ...u.development, nome: null };
      if (u.tower) u.tower = { ...u.tower, nome: null };
    }
    if (hidden('unit.status')) u.status = null;
    if (hidden('unit.valores')) {
      u.finalPrice = null;
      u.valorVenda = null;
      u.valorAvaliado = null;
    }
    if (hidden('unit.specs')) {
      u.areaM2 = null;
      u.quartos = null;
      u.suites = null;
      u.banheiros = null;
      u.vagas = null;
      u.andar = null;
    }
    if (hidden('unit.lote')) {
      u.loteNum = null;
      u.loteAreaM2 = null;
      u.loteFrente = null;
      u.loteFundo = null;
    }
    if (hidden('unit.proposta')) {
      u.propostaPagamento = null;
      u.propostaObs = null;
    }
    if (hidden('unit.comprador')) {
      u.comprador = null;
      u.soldAt = null;
    }
  }

  // Opções selecionáveis de interesse do lead: imóveis do catálogo (ACTIVE) + empreendimentos.
  async interestOptions(user: { tenantId: string }) {
    const [products, developments] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: {
          id: true, title: true, city: true, neighborhood: true,
          images: { select: { url: true }, take: 1, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.development.findMany({
        where: { tenantId: user.tenantId },
        select: { id: true, nome: true, cidade: true, capaUrl: true },
        orderBy: { nome: 'asc' },
      }),
    ]);
    return {
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        local: [p.neighborhood, p.city].filter(Boolean).join(', ') || null,
        coverUrl: p.images[0]?.url ?? null,
      })),
      developments: developments.map((d) => ({
        id: d.id,
        nome: d.nome,
        local: d.cidade ?? null,
        coverUrl: d.capaUrl ?? null,
      })),
    };
  }

  // Mapa id→título de produtos do catálogo, para resolver o nome do interesse nas listas.
  private async buildProductTitleMap(tenantId: string, productIds: (string | null | undefined)[]) {
    const ids = Array.from(new Set(productIds.filter((x): x is string => !!x)));
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const prods = await this.prisma.product.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, title: true },
    });
    for (const p of prods) map.set(p.id, p.title);
    return map;
  }

  async list(user: { id: string; tenantId: string; role: string; branchId?: string | null }) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};

    if (role === 'AGENT' || role === 'PARTNER') {
      const canViewAll = await this.canViewPipeline(tenantId, role);
      if (!canViewAll) extraFilter = { assignedUserId: id };
    } else if (role === 'MANAGER' && branchId) {
      extraFilter = { branchId };
    }

    const leads = await this.prisma.lead.findMany({
      where: { tenantId, ...extraFilter, deletedAt: null },
      orderBy: { criadoEm: 'desc' },
      include: {
        stage: { select: { id: true, name: true, key: true, group: true } },
        empreendimentoInteresse: { select: { nome: true } },
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
    const productTitleMap = await this.buildProductTitleMap(tenantId, leads.map((l) => l.produtoInteresseId));
    const enriched = leads.map((l) => ({
      ...l,
      assignedUserName: l.assignedUserId ? (assignedMap[l.assignedUserId] ?? null) : null,
      interesse: buildLeadInteresseLabel(l as any, productTitleMap),
    }));

    // Conversas abertas primeiro (lastInboundAt DESC), depois demais (criadoEm DESC)
    enriched.sort((a, b) => {
      if (a.conversaAberta && !b.conversaAberta) return -1;
      if (!a.conversaAberta && b.conversaAberta) return 1;
      if (a.conversaAberta && b.conversaAberta) {
        const ta = a.lastInboundAt ? new Date(a.lastInboundAt as any).getTime() : 0;
        const tb = b.lastInboundAt ? new Date(b.lastInboundAt as any).getTime() : 0;
        return tb - ta;
      }
      return new Date(b.criadoEm as any).getTime() - new Date(a.criadoEm as any).getTime();
    });

    const withPreview = await this.attachLastInboundPreview(tenantId, enriched);
    const fv = await this.getPartnerFieldVisibility(tenantId, role);
    if (fv) withPreview.forEach((l) => this.sanitizeLeadForPartner(l, fv));
    return withPreview;
  }

  /**
   * Listagem dedicada da Base Fria — leads na etapa BASE_FRIA (some do funil ativo
   * porque a etapa não tem group). Respeita isolamento por role, anexa rótulo de
   * interesse e marcação "em campanha" (CampanhaContato pendente em disparo ativo).
   */
  async listBaseFria(
    user: { id: string; tenantId: string; role: string; branchId?: string | null },
    filters: { q?: string; produtoInteresseId?: string } = {},
  ) {
    const { id, tenantId, role, branchId } = user;

    let extraFilter: Record<string, unknown> = {};
    if (role === 'AGENT' || role === 'PARTNER') {
      const canViewAll = await this.canViewPipeline(tenantId, role);
      if (!canViewAll) extraFilter = { assignedUserId: id };
    } else if (role === 'MANAGER' && branchId) {
      extraFilter = { branchId };
    }

    const q = (filters.q ?? '').trim();
    const searchFilter: Record<string, unknown> = q
      ? {
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { nomeCorreto: { contains: q, mode: 'insensitive' } },
            { telefone: { contains: q } },
            { cpf: { contains: q } },
          ],
        }
      : {};

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        ...extraFilter,
        ...searchFilter,
        deletedAt: null,
        stage: { key: { startsWith: 'BASE_FRIA' } },
        ...(filters.produtoInteresseId ? { produtoInteresseId: filters.produtoInteresseId } : {}),
      },
      orderBy: [{ baseFriaDesde: 'desc' }, { criadoEm: 'desc' }],
      include: {
        stage: { select: { id: true, name: true, key: true, group: true } },
        empreendimentoInteresse: { select: { nome: true } },
      },
    });

    const assignedIds = [...new Set(leads.map((l) => l.assignedUserId).filter(Boolean))] as string[];
    const assignedUsers = assignedIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, nome: true, apelido: true } })
      : [];
    const assignedMap = Object.fromEntries(assignedUsers.map((u) => [u.id, u.apelido || u.nome]));
    const productTitleMap = await this.buildProductTitleMap(tenantId, leads.map((l) => l.produtoInteresseId));

    // Marcação "em campanha": CampanhaContato vinculado ao lead em disparo ativo e ainda não respondido.
    const leadIds = leads.map((l) => l.id);
    const emCampanhaMap = new Map<string, Date | null>();
    if (leadIds.length > 0) {
      const contatos = await this.prisma.campanhaContato.findMany({
        where: {
          leadId: { in: leadIds },
          status: { in: ['PENDENTE', 'ENVIADO'] },
          disparo: { is: { tenantId, status: { in: ['RODANDO', 'PAUSADA'] } } },
        },
        select: { leadId: true, enviadoEm: true, criadoEm: true },
        orderBy: { criadoEm: 'desc' },
      });
      for (const c of contatos) {
        if (c.leadId && !emCampanhaMap.has(c.leadId)) {
          emCampanhaMap.set(c.leadId, c.enviadoEm ?? c.criadoEm ?? null);
        }
      }
    }

    const enriched = leads.map((l) => ({
      ...l,
      assignedUserName: l.assignedUserId ? (assignedMap[l.assignedUserId] ?? null) : null,
      interesse: buildLeadInteresseLabel(l as any, productTitleMap),
      emCampanha: emCampanhaMap.has(l.id),
      emCampanhaDesde: emCampanhaMap.get(l.id) ?? null,
    }));

    const fv = await this.getPartnerFieldVisibility(tenantId, role);
    if (fv) enriched.forEach((l) => this.sanitizeLeadForPartner(l, fv));
    return enriched;
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

  let produtoInteresse: { id: string; title: string; coverUrl: string | null } | null = null;
  if ((lead as any).produtoInteresseId) {
    const prod = await this.prisma.product.findFirst({
      where: { id: (lead as any).produtoInteresseId, tenantId: user.tenantId },
      select: { id: true, title: true, images: { select: { url: true }, take: 1, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
    });
    produtoInteresse = prod
      ? { id: prod.id, title: prod.title, coverUrl: prod.images[0]?.url ?? null }
      : null;
  }

  // Nome do responsável (para sanitização do Externo Consultivo)
  let assignedUserName: string | null = null;
  if ((lead as any).assignedUserId) {
    const assigned = await this.prisma.user.findUnique({
      where: { id: (lead as any).assignedUserId },
      select: { nome: true, apelido: true },
    });
    assignedUserName = assigned ? assigned.apelido || assigned.nome : null;
  }

  const result: any = {
    ...lead,
    assignedUserName,
    stageId: effectiveStageId,
    stageKey,
    stageName,
    stageGroup,
    previousStageName,
    previousStageKey,
    developmentUnits: linkedUnits,
    empreendimentoInteresse,
    produtoInteresse,
  };

  const fv = await this.getPartnerFieldVisibility(user.tenantId, user.role);
  if (fv) {
    this.sanitizeLeadForPartner(result, fv);
    if (fv['lead.conversa'] === false) result.conversaRestricted = true;
    if (fv['lead.responsavel'] === false) {
      // o responsável é resolvido no front via teamMembers + assignedUserId;
      // ocultamos o id para impedir o lookup do nome
      result.assignedUserId = null;
    }
  }

  return result;
}

  async listEvents(user: any, id: string, opts?: { limit?: number; skip?: number }) {
    const fv = await this.getPartnerFieldVisibility(user.tenantId, user.role);
    if (fv && fv['lead.conversa'] === false) return [];

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
    if (user.role === 'AGENT' || user.role === 'PARTNER') {
      throw new ForbiddenException('Sem permissão');
    }

    const [lead, assignedUser] = await Promise.all([
      this.prisma.lead.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true, tenantId: true } }),
      this.prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true, tenantId: true, role: true } }),
    ]);

    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!assignedUser) throw new NotFoundException('Usuário não encontrado');
    if (lead.tenantId !== user.tenantId) {
      throw new ForbiddenException('Acesso negado a este lead');
    }
    if (assignedUser.tenantId !== user.tenantId) {
      throw new ForbiddenException('Usuário pertence a outro tenant');
    }
    // Externo Consultivo (PARTNER) é só leitura — nunca pode ser responsável por um lead.
    if (assignedUser.role === 'PARTNER') {
      throw new ForbiddenException('Externo Consultivo não pode ser responsável por leads');
    }

    const result = await this.prisma.lead.update({
      where: { id },
      data: { assignedUserId },
    });

    this.audit.log({
      tenantId: user.tenantId,
      userId: user?.id ?? user?.sub,
      action: 'ASSIGN_LEAD',
      resourceType: 'lead',
      resourceId: id,
      metadata: { assignedUserId, role: user?.role ?? null },
    });

    return result;
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
    // requiresEvidence/requiresReason do status ATUAL — usado pelo frontend para abrir
    // o modal também ao SAIR de um status sensível (suspenso/excluído/etc.)
    let currentRequiresEvidence = false;
    let currentRequiresReason = false;
    let currentRequiresPendencias = false;
    let currentUnitAction: string | null = null;

    if (lead.stageId) {
      const from = await this.prisma.pipelineStage.findFirst({
        where: { id: lead.stageId, tenantId: user.tenantId },
        select: { id: true, key: true, name: true, sortOrder: true, requiresEvidence: true, requiresReason: true, requiresPendencias: true, unitAction: true },
      });

      fromStageKey = from?.key ?? null;
      currentRequiresEvidence = from?.requiresEvidence ?? false;
      currentRequiresReason = from?.requiresReason ?? false;
      currentRequiresPendencias = (from as any)?.requiresPendencias ?? false;
      currentUnitAction = from?.unitAction ?? null;
    } else {
      const defaultStage = await this.prisma.pipelineStage.findFirst({
        where: {
          tenantId: user.tenantId,
          isActive: true,
        },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, key: true, name: true, sortOrder: true, requiresEvidence: true, requiresReason: true, requiresPendencias: true, unitAction: true },
      });

      if (!defaultStage?.id) {
        throw new BadRequestException('Pipeline padrão não encontrado.');
      }

      effectiveCurrentStageId = defaultStage.id;
      fromStageKey = defaultStage.key;
      currentRequiresEvidence = defaultStage.requiresEvidence ?? false;
      currentRequiresReason = defaultStage.requiresReason ?? false;
      currentRequiresPendencias = (defaultStage as any).requiresPendencias ?? false;
      currentUnitAction = defaultStage.unitAction ?? null;
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
        select: { pipelineId: true, group: true, sortOrder: true },
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
            select: { id: true, key: true, name: true, sortOrder: true, group: true, requiresEvidence: true, requiresReason: true, requiresPendencias: true, unitAction: true, ownerOnly: true, advancesToGroup: true, returnsToGroup: true },
            orderBy: { sortOrder: 'asc' },
          })
        : [];

      // Descobre o stage real em que o lead esteve na etapa anterior (via log de transições)
      let prevGroupLastStageId: string | null = null;
      if (currentStageRecord?.group && allCustomStages.length > 0) {
        // Agrupa todos os stages pelo grupo e calcula o minSortOrder de cada grupo
        const groupMinOrder = new Map<string, number>();
        for (const s of allCustomStages) {
          if (!s.group) continue;
          const cur = groupMinOrder.get(s.group) ?? Infinity;
          groupMinOrder.set(s.group, Math.min(cur, s.sortOrder ?? 0));
        }
        // Inclui o grupo atual no mapa
        if (!groupMinOrder.has(currentStageRecord.group)) {
          groupMinOrder.set(currentStageRecord.group, currentStageRecord.sortOrder ?? 0);
        }

        const groupOrder = [...groupMinOrder.entries()]
          .sort((a, b) => a[1] - b[1])
          .map(([g]) => g);

        const currentGroupIdx = groupOrder.indexOf(currentStageRecord.group);
        const prevGroupKey = currentGroupIdx > 0 ? groupOrder[currentGroupIdx - 1] : null;

        if (prevGroupKey) {
          const prevGroupStages = allCustomStages.filter((s) => s.group === prevGroupKey);
          const prevGroupNames = prevGroupStages.map((s) => s.name);

          // Busca o log mais recente em que o lead saiu de um stage da etapa anterior
          const lastLog = await this.prisma.leadTransitionLog.findFirst({
            where: { tenantId: user.tenantId, leadId, fromStage: { in: prevGroupNames } },
            orderBy: { createdAt: 'desc' },
            select: { fromStage: true },
          });

          if (lastLog?.fromStage) {
            const match = prevGroupStages.find((s) => s.name === lastLog.fromStage);
            prevGroupLastStageId = match?.id ?? null;
          }
        }
      }

      return {
        leadId,
        currentStageId: effectiveCurrentStageId,
        currentStageKey: fromStageKey,
        currentRequiresEvidence,
        currentRequiresReason,
        currentRequiresPendencias,
        currentUnitAction,
        allowedStages: allCustomStages,
        prevGroupLastStageId,
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
          currentRequiresEvidence,
          currentRequiresReason,
          currentUnitAction,
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
              requiresReason: true,
              unitAction: true,
              ownerOnly: true,
            },
            orderBy: { sortOrder: 'asc' },
          })
        : [];

    return {
      leadId,
      currentStageId: effectiveCurrentStageId,
      currentStageKey: fromStageKey,
      currentRequiresEvidence,
      currentRequiresReason,
      currentUnitAction,
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
  telefone?: string | null;
  email?: string | null;
}, actor?: { id?: string; sub?: string; role?: string }) {
  // Campos monetários: o front envia string (input type="number") — converter para Float (vazio → null)
  const toFloat = (v: any): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // CPF: bloqueia salvar valor inválido (vazio/null é permitido)
  if (data.cpf !== undefined && data.cpf !== null && String(data.cpf).trim() !== '' && !isValidCPF(data.cpf)) {
    throw new BadRequestException('CPF inválido');
  }

  const updateData: any = {};
  if (data.nomeCorreto !== undefined) {
    updateData.nomeCorreto = data.nomeCorreto;
    updateData.nomeCorretoOrigem = data.nomeCorreto ? 'MANUAL' : null;
  }
  if (data.rendaBrutaFamiliar !== undefined) updateData.rendaBrutaFamiliar = toFloat(data.rendaBrutaFamiliar);
  if (data.fgts !== undefined) updateData.fgts = toFloat(data.fgts);
  if (data.valorEntrada !== undefined) updateData.valorEntrada = toFloat(data.valorEntrada);
  if (data.estadoCivil !== undefined) updateData.estadoCivil = data.estadoCivil;
  if (data.dataNascimento !== undefined) updateData.dataNascimento = data.dataNascimento ? new Date(data.dataNascimento) : null;
  if (data.tempoProcurandoImovel !== undefined) updateData.tempoProcurandoImovel = data.tempoProcurandoImovel;
  if (data.conversouComCorretor !== undefined) updateData.conversouComCorretor = data.conversouComCorretor;
  if (data.qualCorretorImobiliaria !== undefined) updateData.qualCorretorImobiliaria = data.qualCorretorImobiliaria;
  if (data.perfilImovel !== undefined) updateData.perfilImovel = data.perfilImovel;
  // Interesse real (produto/empreendimento): edição manual marca origem MANUAL (IA nunca sobrescreve)
  // e mantém os dois mutuamente exclusivos (um interesse por vez).
  if (data.produtoInteresseId !== undefined || data.empreendimentoInteresseId !== undefined) {
    if (data.produtoInteresseId) {
      updateData.produtoInteresseId = data.produtoInteresseId;
      updateData.empreendimentoInteresseId = null;
      updateData.interesseOrigem = 'MANUAL';
    } else if (data.empreendimentoInteresseId) {
      updateData.empreendimentoInteresseId = data.empreendimentoInteresseId;
      updateData.produtoInteresseId = null;
      updateData.interesseOrigem = 'MANUAL';
    } else {
      // Interesse removido manualmente
      if (data.produtoInteresseId !== undefined) updateData.produtoInteresseId = null;
      if (data.empreendimentoInteresseId !== undefined) updateData.empreendimentoInteresseId = null;
      updateData.interesseOrigem = null;
    }
  }
  if (data.resumoLead !== undefined) updateData.resumoLead = data.resumoLead;
  // Cadastro pessoal (campos string)
  const pessoalFields = ['cpf', 'rg', 'profissao', 'empresa', 'naturalidade', 'endereco', 'cep', 'cidade', 'uf', 'telefone', 'email'] as const;
  for (const f of pessoalFields) {
    if (data[f] !== undefined) updateData[f] = data[f];
  }
  // Telefone alterado: normaliza para o padrão 55+DDD+numero e recalcula a chave de deduplicação
  if (data.telefone !== undefined) {
    const normalized = this.normalizePhoneBR(data.telefone);
    updateData.telefone = normalized;
    updateData.telefoneKey = normalized ? this.telefoneKeyFrom(normalized) : null;
  }
  if ((data as any).cadastroOrigem !== undefined) updateData.cadastroOrigem = (data as any).cadastroOrigem;

  const updated = await this.prisma.lead.update({
    where: { id: leadId, tenantId },
    data: updateData,
    select: {
      id: true, nome: true, nomeCorreto: true, rendaBrutaFamiliar: true,
      fgts: true, valorEntrada: true, estadoCivil: true, dataNascimento: true,
      tempoProcurandoImovel: true, conversouComCorretor: true,
      qualCorretorImobiliaria: true, perfilImovel: true,
      produtoInteresseId: true, empreendimentoInteresseId: true, interesseOrigem: true, resumoLead: true,
      cpf: true, telefone: true, telefoneKey: true,
    },
  });

  // Registra a edição na trilha de auditoria — guarda QUAIS campos mudaram (não os valores)
  const camposAlterados = Object.keys(updateData).filter((k) => k !== 'telefoneKey');
  if (camposAlterados.length) {
    this.audit.log({
      tenantId,
      userId: actor?.id ?? actor?.sub,
      action: 'UPDATE_QUALIFICATION',
      resourceType: 'lead',
      resourceId: leadId,
      metadata: { campos: camposAlterados, role: actor?.role ?? null },
    });
  }

  return updated;
}

async updateStage(
  user: any,
  leadId: string,
  stageId: string,
  opts: {
    evidenceDocumentId?: string;
    motivo?: string;
    ipAddress?: string;
    valorVenda?: number | string;
    dataVenda?: string;
    // Base Fria — ações opcionais ao mover o lead para a etapa BASE_FRIA
    baseFria?: {
      agenda?: { dataHora: string; titulo?: string; descricao?: string };
      mensagemProgramada?: { dataHora: string; texto: string; sessionId: string; salvarTemplate?: boolean; templateNome?: string };
    };
  } = {},
) {
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

  let fromStageGroup: string | null = null;
  let fromStageRequiresEvidence = false;
  let fromStageRequiresReason = false;
  let fromStageRequiresPendencias = false;

  if (lead.stageId) {
    const from = await this.prisma.pipelineStage.findFirst({
      where: { id: lead.stageId, tenantId: user.tenantId },
      select: { key: true, name: true, group: true, requiresEvidence: true, requiresReason: true, requiresPendencias: true },
    });

    fromStageKey = from?.key ?? null;
    fromStageName = from?.name ?? null;
    fromStageGroup = from?.group ?? null;
    fromStageRequiresEvidence = from?.requiresEvidence ?? false;
    fromStageRequiresReason = from?.requiresReason ?? false;
    fromStageRequiresPendencias = (from as any)?.requiresPendencias ?? false;
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

  // Base Fria: marca a data de ingresso ao entrar; limpa ao sair.
  // Cobre BASE_FRIA (pipeline padrão) e BASE_FRIA_PRE/AGENDAMENTO/NEGOCIACOES (v2).
  const enteringBaseFria = toStage.key.startsWith('BASE_FRIA');
  const leavingBaseFria = !!fromStageKey && fromStageKey.startsWith('BASE_FRIA');
  const baseFriaData: { baseFriaDesde?: Date | null } = enteringBaseFria
    ? { baseFriaDesde: new Date() }
    : leavingBaseFria
      ? { baseFriaDesde: null }
      : {};

  // Ações opcionais ao ingressar na Base Fria (agenda + mensagem programada).
  // Best-effort: nunca quebra a mudança de etapa (já efetivada).
  const applyBaseFriaIngress = async () => {
    if (!enteringBaseFria || !opts.baseFria) return;
    const bf = opts.baseFria;

    // Agenda → evento no calendário vinculado ao lead (lembrete automático pelo ReminderWorker).
    try {
      if (bf.agenda?.dataHora) {
        const start = new Date(bf.agenda.dataHora);
        if (!Number.isNaN(start.getTime())) {
          await this.prisma.calendarEvent.create({
            data: {
              tenantId: user.tenantId,
              userId: user.id,
              leadId,
              title: bf.agenda.titulo?.trim() || 'Retomar contato (Base Fria)',
              description: bf.agenda.descricao?.trim() || null,
              startAt: start,
              endAt: new Date(start.getTime() + 30 * 60 * 1000),
              eventType: 'TAREFA',
            },
          });
        }
      }
    } catch (e) {
      this.logger.warn(`Base Fria agenda falhou (lead ${leadId}): ${(e as Error).message}`);
    }

    // Mensagem programada → campanha de 1 contato (o próprio lead) agendada para o horário.
    try {
      const mp = bf.mensagemProgramada;
      if (mp?.dataHora && mp.texto?.trim() && mp.sessionId) {
        const runAt = new Date(mp.dataHora);
        const leadInfo = await this.prisma.lead.findFirst({
          where: { id: leadId, tenantId: user.tenantId },
          select: { nome: true, nomeCorreto: true, telefone: true },
        });
        if (!Number.isNaN(runAt.getTime()) && leadInfo?.telefone) {
          const nomeModelo = mp.templateNome?.trim() || `Base Fria — ${new Date().toLocaleDateString('pt-BR')}`;
          const modelo = await this.prisma.campanhaModelo.create({
            data: { tenantId: user.tenantId, userId: user.id, nome: nomeModelo, mensagem: mp.texto.trim() },
          });
          const disparo = await this.prisma.campanhaDisparo.create({
            data: {
              tenantId: user.tenantId,
              userId: user.id,
              sessionId: mp.sessionId,
              modeloId: modelo.id,
              nome: `Programada · ${nomeModelo}`,
              status: 'RASCUNHO',
              totalContatos: 1,
              contatos: {
                create: {
                  telefone: leadInfo.telefone.replace(/\D/g, ''),
                  nome: leadInfo.nomeCorreto || leadInfo.nome || null,
                  leadId,
                },
              },
            },
          });
          await this.queueService.scheduleCampaignStart(disparo.id, runAt);
        }
      }
    } catch (e) {
      this.logger.warn(`Base Fria mensagem programada falhou (lead ${leadId}): ${(e as Error).message}`);
    }
  };

  if (toStage.ownerOnly && user?.role !== 'OWNER') {
    throw new ForbiddenException('Apenas o OWNER pode mover para esta etapa.');
  }

  // ── Evidência obrigatória (requiresEvidence) ──────────────────────────────
  // Exigida ao ENTRAR num status com requiresEvidence E ao SAIR de um status
  // com requiresEvidence (ex.: reativar um lead suspenso/excluído/desistente).
  // Não-OWNER: precisa anexar um documento (upload concluído) vinculado a este lead.
  // OWNER: dispensa documento, mas exige texto de justificativa.
  const motivo = typeof opts.motivo === 'string' ? opts.motivo.trim() : '';
  let evidenceDocumentId: string | null = null;
  // needsEvidence = exige documento (não-OWNER); needsReason = exige justificativa em texto (todos)
  const needsEvidence = toStage.requiresEvidence || fromStageRequiresEvidence;
  const needsReason = toStage.requiresReason || fromStageRequiresReason;

  if (needsEvidence || needsReason) {
    const isOwner = user?.role === 'OWNER';

    if (opts.evidenceDocumentId) {
      const doc = await this.prisma.leadDocument.findFirst({
        where: { id: opts.evidenceDocumentId, leadId, tenantId: user.tenantId },
        select: { id: true, status: true, url: true, publicId: true },
      });
      if (!doc) {
        throw new BadRequestException('Evidência inválida: documento não encontrado para este lead.');
      }
      if (doc.status !== 'ENVIADO' && !doc.publicId && !doc.url) {
        throw new BadRequestException('Evidência inválida: o upload do documento não foi concluído.');
      }
      evidenceDocumentId = doc.id;
    }

    // Justificativa em texto: obrigatória para TODOS quando o status exige motivo.
    if (needsReason && !motivo) {
      throw new BadRequestException(
        'Esta etapa exige uma justificativa. Descreva o motivo para continuar.',
      );
    }

    // Documento: obrigatório para não-OWNER quando o status exige evidência.
    if (needsEvidence && !isOwner && !evidenceDocumentId) {
      throw new BadRequestException(
        'Esta etapa exige uma evidência. Anexe um documento (print, arquivo ou e-mail) para continuar.',
      );
    }

    // OWNER em status que exige evidência (sem motivo já cobrir): precisa de documento OU justificativa.
    if (needsEvidence && isOwner && !evidenceDocumentId && !motivo) {
      throw new BadRequestException(
        'Esta etapa exige evidência. Anexe um documento ou informe uma justificativa para continuar.',
      );
    }
  }

  // ── Pendências (requiresPendencias) ───────────────────────────────────────
  // Ao ENTRAR numa etapa que exige pendências: precisa existir ao menos uma
  // pendência registrada (o modal as cria via API antes deste PATCH).
  // Ao SAIR de uma etapa que exige pendências: só libera quando TODAS estiverem
  // resolvidas.
  if ((toStage as any).requiresPendencias) {
    const total = await (this.prisma as any).leadPendencia.count({ where: { leadId, tenantId: user.tenantId } });
    if (total === 0) {
      throw new BadRequestException('Registre ao menos uma pendência para mover o lead para esta etapa.');
    }
  }
  if (fromStageRequiresPendencias) {
    const abertas = await (this.prisma as any).leadPendencia.count({
      where: { leadId, tenantId: user.tenantId, resolvida: false },
    });
    if (abertas > 0) {
      throw new BadRequestException('Resolva todas as pendências antes de sair desta etapa.');
    }
  }

  // Registra a movimentação na trilha de auditoria (LGPD). Silencioso, nunca quebra o fluxo.
  const auditMove = (
    fromName: string | null,
    toName: string,
    group: string | null,
    cascade: boolean,
  ) =>
    this.audit.log({
      tenantId: user.tenantId,
      userId: user?.id,
      action: 'MOVE_PIPELINE',
      resourceType: 'lead',
      resourceId: leadId,
      ipAddress: opts.ipAddress,
      metadata: {
        fromStage: fromName,
        toStage: toName,
        group,
        role: user?.role ?? null,
        cascade,
        ...(cascade ? {} : { motivo: motivo || null, evidenceDocumentId }),
      },
    });

  // Efeitos no espelho ao ENTRAR numa etapa (sensível ao pipeline via unitAction):
  //   PROPOSTA → converte unidade RESERVADO do lead em PROPOSTA
  //   VENDA    → converte unidade PROPOSTA do lead em VENDIDO
  // Best-effort: nunca quebra a mudança de etapa (já efetivada).
  const applyUnitSideEffects = async (unitAction: string | null | undefined) => {
    try {
      if (unitAction === 'PROPOSTA') {
        await this.prisma.developmentUnit.updateMany({
          where: { tenantId: user.tenantId, leadId, status: 'RESERVADO' },
          data: { status: 'PROPOSTA' },
        });
      } else if (unitAction === 'VENDA') {
        const sold = await this.prisma.developmentUnit.updateMany({
          where: { tenantId: user.tenantId, leadId, status: 'PROPOSTA' },
          data: { status: 'VENDIDO', soldAt: new Date() },
        });
        // Venda avulsa (sem unidade de empreendimento): registra valor/data no próprio lead.
        // Só quando o lead NÃO tem nenhuma unidade vinculada — empreendimentos (ex.: SP9)
        // seguem pelo fluxo acima e nunca caem aqui.
        if (sold.count === 0) {
          const hasUnit = await this.prisma.developmentUnit.count({
            where: { tenantId: user.tenantId, leadId },
          });
          if (hasUnit === 0) {
            const valorRaw = opts.valorVenda;
            const valor =
              valorRaw == null || valorRaw === ''
                ? null
                : typeof valorRaw === 'number'
                  ? valorRaw
                  : Number(String(valorRaw).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
            const data = opts.dataVenda ? new Date(opts.dataVenda) : new Date();
            await this.prisma.lead.update({
              where: { id: leadId },
              data: {
                valorVenda: valor != null && !Number.isNaN(valor) ? valor : undefined,
                dataVenda: data,
              },
            });
          }
        }
      }
    } catch (e) {
      this.logger.warn(`applyUnitSideEffects falhou (lead ${leadId}): ${(e as Error).message}`);
    }
  };

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
        data: { stageId: toStage.id, ...baseFriaData },
      }),
      this.prisma.leadTransitionLog.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          fromStage: fromStageName,
          toStage: toStage.name,
          changedBy: user?.id || 'USER',
          evidenceDocumentId,
          motivo: motivo || null,
        },
      }),
    ]);

    await auditMove(fromStageName, toStage.name, toStage.group ?? null, false);
    await applyUnitSideEffects(toStage.unitAction);

    const targetGroup = toStage.advancesToGroup ?? toStage.returnsToGroup ?? null;
    // Só faz cascade se o grupo destino for diferente do grupo atual do lead
    // (evita loop: clicar em stage gateway ao voltar re-empurraria para o grupo de origem)
    if (targetGroup && targetGroup !== fromStageGroup) {
      const firstStageOfGroup = await this.prisma.pipelineStage.findFirst({
        where: { tenantId: user.tenantId, group: targetGroup, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, unitAction: true },
      });
      if (firstStageOfGroup) {
        await this.prisma.$transaction([
          this.prisma.lead.update({ where: { id: leadId }, data: { stageId: firstStageOfGroup.id } }),
          this.prisma.leadTransitionLog.create({
            data: {
              tenantId: user.tenantId,
              leadId,
              fromStage: toStage.name,
              toStage: firstStageOfGroup.name,
              changedBy: user?.id || 'USER',
              cascade: true,
            },
          }),
        ]);
        await auditMove(toStage.name, firstStageOfGroup.name, targetGroup, true);
        await applyUnitSideEffects(firstStageOfGroup.unitAction);
      }
    }

    await applyBaseFriaIngress();
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
        evidenceDocumentId,
        motivo: motivo || null,
      },
    }),
  ]);

  await auditMove(fromStageName, toStage.name, toStage.group ?? null, false);
  await applyUnitSideEffects(toStage.unitAction);

  await applyBaseFriaIngress();
  return updated;
}

/**
 * Lista as evidências/justificativas registradas em transições de status do lead.
 * Retorna apenas transições que exigiram evidência (documento anexado ou justificativa).
 */
async listStatusEvidences(user: any, leadId: string) {
  const lead = await this.prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new NotFoundException('Lead não encontrado');

  const logs = await this.prisma.leadTransitionLog.findMany({
    where: {
      tenantId: user.tenantId,
      leadId,
      OR: [
        { evidenceDocumentId: { not: null } },
        { motivo: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fromStage: true,
      toStage: true,
      changedBy: true,
      evidenceDocumentId: true,
      motivo: true,
      createdAt: true,
    },
  });

  if (logs.length === 0) return [];

  // Resolve documentos e nomes de quem moveu, em lote
  const docIds = logs.map((l) => l.evidenceDocumentId).filter((d): d is string => !!d);
  const userIds = logs.map((l) => l.changedBy).filter((u): u is string => !!u);

  const [docs, users] = await Promise.all([
    docIds.length
      ? this.prisma.leadDocument.findMany({
          where: { id: { in: docIds }, tenantId: user.tenantId },
          select: { id: true, nome: true, filename: true, mimeType: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? this.prisma.user.findMany({
          where: { id: { in: userIds }, tenantId: user.tenantId },
          select: { id: true, nome: true, apelido: true },
        })
      : Promise.resolve([]),
  ]);

  const docMap = new Map(docs.map((d) => [d.id, d] as const));
  const userMap = new Map(users.map((u) => [u.id, u.apelido || u.nome] as const));

  return logs.map((l) => ({
    id: l.id,
    fromStage: l.fromStage,
    toStage: l.toStage,
    motivo: l.motivo,
    changedByName: l.changedBy ? userMap.get(l.changedBy) ?? null : null,
    createdAt: l.createdAt,
    document: l.evidenceDocumentId ? docMap.get(l.evidenceDocumentId) ?? null : null,
  }));
}

/**
 * Campanhas (WhatsApp Light) das quais este lead participou — mais recentes primeiro.
 * Cada item é um CampanhaContato vinculado ao lead, com dados do disparo/modelo.
 */
async listLeadCampanhas(user: any, leadId: string) {
  const lead = await this.prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new NotFoundException('Lead não encontrado');

  const contatos = await this.prisma.campanhaContato.findMany({
    where: { leadId, disparo: { is: { tenantId: user.tenantId } } },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      status: true,
      enviadoEm: true,
      respondeuEm: true,
      criadoEm: true,
      disparo: {
        select: {
          id: true,
          nome: true,
          status: true,
          modelo: { select: { nome: true, mediaType: true, mensagem: true } },
        },
      },
    },
  });

  return contatos.map((c) => ({
    id: c.id,
    status: c.status,
    enviadoEm: c.enviadoEm,
    respondeuEm: c.respondeuEm,
    criadoEm: c.criadoEm,
    disparoId: c.disparo?.id ?? null,
    nome: c.disparo?.nome ?? c.disparo?.modelo?.nome ?? 'Campanha',
    disparoStatus: c.disparo?.status ?? null,
    mediaType: c.disparo?.modelo?.mediaType ?? null,
    mensagem: c.disparo?.modelo?.mensagem ?? null,
  }));
}

/**
 * Histórico completo de movimentações de etapa/status do lead (mais recentes primeiro).
 * Marca movimentos automáticos (cascade) e resolve o nome de quem moveu.
 */
async listTransitions(user: any, leadId: string) {
  const lead = await this.prisma.lead.findFirst({
    where: { id: leadId, tenantId: user.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new NotFoundException('Lead não encontrado');

  const logs = await this.prisma.leadTransitionLog.findMany({
    where: { tenantId: user.tenantId, leadId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fromStage: true,
      toStage: true,
      changedBy: true,
      cascade: true,
      createdAt: true,
    },
  });

  if (logs.length === 0) return [];

  const userIds = logs
    .map((l) => l.changedBy)
    .filter((u): u is string => !!u && u !== 'USER' && u !== 'SYSTEM');

  const users = userIds.length
    ? await this.prisma.user.findMany({
        where: { id: { in: userIds }, tenantId: user.tenantId },
        select: { id: true, nome: true, apelido: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.apelido || u.nome] as const));

  // Externo Consultivo: oculta as datas do histórico se o tenant configurou assim.
  const fv = await this.getPartnerFieldVisibility(user.tenantId, user.role);
  const hideDate = !!fv && fv['lead.historicoDatas'] === false;

  return logs.map((l) => ({
    id: l.id,
    fromStage: l.fromStage,
    toStage: l.toStage,
    cascade: l.cascade,
    changedByName: l.changedBy ? userMap.get(l.changedBy) ?? null : null,
    createdAt: hideDate ? null : l.createdAt,
  }));
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
        empreendimentoInteresse: { select: { nome: true } },
      },
    });

    const userInfo = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { nome: true, apelido: true },
    });
    const myName = userInfo?.apelido || userInfo?.nome || null;
    const productTitleMap = await this.buildProductTitleMap(user.tenantId, leads.map((l) => l.produtoInteresseId));
    const enriched = leads.map((l) => ({
      ...l,
      assignedUserName: myName,
      interesse: buildLeadInteresseLabel(l as any, productTitleMap),
    }));

    // Conversas abertas primeiro (lastInboundAt DESC), depois demais (criadoEm DESC)
    enriched.sort((a, b) => {
      if (a.conversaAberta && !b.conversaAberta) return -1;
      if (!a.conversaAberta && b.conversaAberta) return 1;
      if (a.conversaAberta && b.conversaAberta) {
        const ta = a.lastInboundAt ? new Date(a.lastInboundAt as any).getTime() : 0;
        const tb = b.lastInboundAt ? new Date(b.lastInboundAt as any).getTime() : 0;
        return tb - ta;
      }
      return new Date(b.criadoEm as any).getTime() - new Date(a.criadoEm as any).getTime();
    });

    const withPreview = await this.attachLastInboundPreview(user.tenantId, enriched);
    const fv = await this.getPartnerFieldVisibility(user.tenantId, user.role);
    if (fv) withPreview.forEach((l) => this.sanitizeLeadForPartner(l, fv));
    return withPreview;
  }

  async getBranchLeads(user: any, branchId?: string) {
    if (user.role === 'AGENT' || user.role === 'PARTNER') {
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

      // Fixa o canal no lead na primeira mensagem outbound e marca conversa aberta
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          conversaAberta: true,
          ...(!lead.conversaCanal ? { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: activeSessionId } : {}),
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

    // Fixa o canal no lead na primeira mensagem outbound e marca conversa aberta
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        conversaAberta: true,
        ...(!lead.conversaCanal ? { conversaCanal: 'WHATSAPP_OFICIAL' } : {}),
      },
    });

    return { ok: true };
  }

  async endConversation(tenantId: string, leadId: string): Promise<{ ok: boolean }> {
    await this.prisma.lead.update({
      where: { id: leadId, tenantId },
      data: { conversaAberta: false, lastReadAt: new Date() },
    });
    return { ok: true };
  }

  /** Marca o lead como lido (ao abrir o detalhe) — limpa a notificação "Aguardando resposta".
   *  Não altera conversaAberta; só registra que o usuário viu a última mensagem. */
  async markRead(tenantId: string, leadId: string): Promise<{ ok: boolean }> {
    await this.prisma.lead.updateMany({
      where: { id: leadId, tenantId, deletedAt: null },
      data: { lastReadAt: new Date() },
    });
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
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { permissionsConfig: true } });
      const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
      const roleKey = user.role.toLowerCase() as 'agent' | 'partner';
      if (!perms[roleKey]?.exportacao?.export) throw new ForbiddenException('Sem permissão para exportar');
    }

    const where: any = { tenantId: user.tenantId, deletedAt: null };
    if (user.role === 'AGENT' || user.role === 'PARTNER') {
      where.assignedUserId = user.id ?? user.sub;
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

    // Externo Consultivo: omite colunas de campos ocultos
    const fv = await this.getPartnerFieldVisibility(user.tenantId, user.role);
    const show = (k: string) => !fv || fv[k] !== false;

    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    type Col = { header: string; value: (l: (typeof leads)[number]) => any };
    const cols: Col[] = [
      { header: 'ID', value: (l) => l.id },
      { header: 'Nome', value: (l) => l.nome },
      ...(show('lead.telefone') ? [{ header: 'Telefone', value: (l: any) => l.telefone }] : []),
      ...(show('lead.email') ? [{ header: 'Email', value: (l: any) => l.email }] : []),
      ...(show('lead.origem') ? [{ header: 'Origem', value: (l: any) => l.origem }] : []),
      { header: 'Status', value: (l) => l.status },
      { header: 'Etapa', value: (l) => l.stage?.name },
      ...(show('lead.resumo') ? [{ header: 'Resumo', value: (l: any) => l.resumoLead }] : []),
      ...(show('lead.dataCriacao') ? [{ header: 'Criado em', value: (l: any) => l.criadoEm?.toISOString() }] : []),
      { header: 'Atualizado em', value: (l) => l.atualizadoEm?.toISOString() },
    ];

    const header = cols.map((c) => c.header).join(',');
    const rows = leads.map((l) => cols.map((c) => escape(c.value(l))).join(','));

    return [header, ...rows].join('\n');
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
    // CPF: bloqueia salvar valor inválido (vazio/null é permitido)
    if (data.cpf !== undefined && data.cpf !== null && String(data.cpf).trim() !== '' && !isValidCPF(data.cpf)) {
      throw new BadRequestException('CPF inválido');
    }
    const allowed = ['nome', 'classificacao', 'cpf', 'rg', 'dataNascimento', 'estadoCivil', 'naturalidade', 'profissao', 'empresa', 'renda', 'telefone', 'email', 'endereco', 'cep', 'cidade', 'uf', 'sortOrder'];
    const updateData: any = {};
    for (const f of allowed) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    // renda é Float no banco — o front envia string (input type="number")
    if (data.renda !== undefined) {
      if (data.renda === '' || data.renda === null) {
        updateData.renda = null;
      } else {
        const n = Number(data.renda);
        updateData.renda = Number.isFinite(n) ? n : null;
      }
    }
    if (data.dataNascimento !== undefined) {
      updateData.dataNascimento = data.dataNascimento ? new Date(data.dataNascimento) : null;
    }
    const existing = await (this.prisma as any).leadParticipante.findFirst({ where: { id: partId, leadId, tenantId } });
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
          return cloudinary.uploader.destroy(d.publicId!, { resource_type: rt, type: 'authenticated', invalidate: true })
            .catch((err: any) => this.logger.warn(`deleteParticipante: falha ao remover asset ${d.publicId}: ${err?.message}`));
        }));
      } catch { /* não bloqueia o fluxo se Cloudinary não estiver configurado */ }
    }
    // Remove documentos do banco e o participante
    await this.prisma.leadDocument.deleteMany({ where: { leadId, tenantId, participanteNome: part.nome } });
    await (this.prisma as any).leadParticipante.delete({ where: { id: partId } });
    return { ok: true };
  }

  // =========================================
  // PENDÊNCIAS DO LEAD
  // =========================================

  async listPendencias(tenantId: string, leadId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const [items, lead] = await Promise.all([
      (this.prisma as any).leadPendencia.findMany({
        where: { leadId, tenantId },
        orderBy: { criadoEm: 'asc' },
      }),
      this.prisma.lead.findFirst({
        where: { id: leadId, tenantId },
        select: { pendenciasObservacao: true },
      }),
    ]);
    return { items, observacao: (lead as any)?.pendenciasObservacao ?? null };
  }

  async createPendencia(
    tenantId: string,
    leadId: string,
    data: { descricao: string; origem?: string; tipoDocumento?: string | null; participanteNome?: string | null; participanteClassificacao?: string | null },
    userId: string,
  ) {
    await this.assertLeadAccess(tenantId, leadId);
    const descricao = (data.descricao ?? '').trim();
    if (!descricao) throw new BadRequestException('Descrição da pendência é obrigatória');
    const origem = data.origem === 'DOCUMENTO' ? 'DOCUMENTO' : 'MANUAL';
    return (this.prisma as any).leadPendencia.create({
      data: {
        tenantId,
        leadId,
        descricao,
        origem,
        tipoDocumento: origem === 'DOCUMENTO' ? (data.tipoDocumento ?? null) : null,
        participanteNome: data.participanteNome ?? null,
        participanteClassificacao: data.participanteClassificacao ?? null,
        criadoPor: userId ?? null,
      },
    });
  }

  async updatePendencia(
    tenantId: string,
    leadId: string,
    pendenciaId: string,
    data: { descricao?: string; resolvida?: boolean; participanteNome?: string | null; participanteClassificacao?: string | null },
    userId: string,
  ) {
    await this.assertLeadAccess(tenantId, leadId);
    const existing = await (this.prisma as any).leadPendencia.findFirst({ where: { id: pendenciaId, leadId, tenantId } });
    if (!existing) throw new NotFoundException('Pendência não encontrada neste lead');
    const updateData: any = {};
    if (data.descricao !== undefined) {
      const d = (data.descricao ?? '').trim();
      if (!d) throw new BadRequestException('Descrição da pendência é obrigatória');
      updateData.descricao = d;
    }
    if (data.participanteNome !== undefined) updateData.participanteNome = data.participanteNome ?? null;
    if (data.participanteClassificacao !== undefined) updateData.participanteClassificacao = data.participanteClassificacao ?? null;
    if (data.resolvida !== undefined) {
      updateData.resolvida = !!data.resolvida;
      updateData.resolvidoPor = data.resolvida ? (userId ?? null) : null;
      updateData.resolvidoEm = data.resolvida ? new Date() : null;
    }
    return (this.prisma as any).leadPendencia.update({ where: { id: pendenciaId }, data: updateData });
  }

  async deletePendencia(tenantId: string, leadId: string, pendenciaId: string) {
    await this.assertLeadAccess(tenantId, leadId);
    const existing = await (this.prisma as any).leadPendencia.findFirst({ where: { id: pendenciaId, leadId, tenantId } });
    if (!existing) throw new NotFoundException('Pendência não encontrada');
    await (this.prisma as any).leadPendencia.delete({ where: { id: pendenciaId } });
    return { ok: true };
  }

  async updatePendenciasObservacao(tenantId: string, leadId: string, observacao: string | null) {
    await this.assertLeadAccess(tenantId, leadId);
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { pendenciasObservacao: observacao ?? null } as any,
    });
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

  async findDuplicates(user: { tenantId: string; role: string }) {
    const { tenantId, role } = user;

    if (role !== 'OWNER' && role !== 'MANAGER') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { permissionsConfig: true } });
      const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
      const roleKey = role.toLowerCase() as 'agent' | 'partner';
      if (!perms[roleKey]?.duplicados?.view) throw new ForbiddenException('Sem permissão para ver duplicados');
    }

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
    if (role === 'AGENT' || role === 'PARTNER') {
      const canViewAll = await this.canViewPipeline(tenantId, role);
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

    const fv = await this.getPartnerFieldVisibility(tenantId, role);
    const show = (k: string) => !fv || fv[k] !== false;

    return leads.map((l) => ({
      id: l.id,
      nome: l.nome,
      nomeCorreto: l.nomeCorreto,
      telefone: show('lead.telefone') ? l.telefone : null,
      email: show('lead.email') ? l.email : null,
      cpf: show('lead.cpf') ? l.cpf : null,
      criadoEm: show('lead.dataCriacao') ? l.criadoEm : null,
      source: show('lead.origem') ? l.origem : null,
      numero: l.numero,
      stage: l.stage ? { nome: l.stage.name } : null,
      assignedUser:
        show('lead.responsavel') && l.assignedUserId
          ? { nome: userById[l.assignedUserId] ?? '' }
          : null,
      developmentUnits: l.developmentUnits.map((u) => ({
        id: u.id,
        nome: show('unit.identificacao') ? u.nome : null,
        status: show('unit.status') ? u.status : null,
        towerNome: show('unit.identificacao') ? u.tower?.nome ?? null : null,
        developmentNome: show('unit.identificacao') ? u.development?.nome ?? null : null,
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
