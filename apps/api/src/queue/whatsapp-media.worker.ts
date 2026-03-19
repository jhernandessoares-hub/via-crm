import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  return { host, port };
}

function getMetaConfig() {
  const version = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const token = process.env.WHATSAPP_TOKEN;

  if (!token) {
    throw new Error('WHATSAPP_TOKEN não definido no .env');
  }

  return { version, token };
}

function getCloudinaryConfig() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function metaGetDownloadUrl(mediaId: string) {
  const { version, token } = getMetaConfig();

  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`;

  const res = await fetchWithTimeout(
    url,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    15_000,
  );

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

async function metaDownloadBuffer(downloadUrl: string) {
  const { token } = getMetaConfig();

  const res = await fetchWithTimeout(
    downloadUrl,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    30_000,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Meta download (${res.status}): ${txt}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pickResourceType(
  kind: string | undefined,
  mimeType: string | undefined,
): 'image' | 'video' | 'raw' | 'auto' {
  const k = String(kind || '').toLowerCase();
  const mt = String(mimeType || '').toLowerCase();

  // documento/PDF => RAW (evita /image/upload e evita ACL/deny na sua conta)
  if (k === 'document' || mt === 'application/pdf' || mt.startsWith('application/')) {
    return 'raw';
  }

  // áudio e vídeo sobem como "video" no Cloudinary (é assim que Cloudinary trata)
  if (k === 'audio' || k === 'voice' || mt.startsWith('audio/')) {
    return 'video';
  }

  if (k === 'video' || mt.startsWith('video/')) {
    return 'video';
  }

  if (k === 'image' || k === 'sticker' || mt.startsWith('image/')) {
    return 'image';
  }

  return 'auto';
}

async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string | undefined,
  publicId: string,
  kind: string | undefined,
) {
  getCloudinaryConfig();

  const resource_type = pickResourceType(kind, mimeType);

  return new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type,
          folder: 'via-crm/whatsapp',
          public_id: publicId,
          overwrite: true,

          // 🔥 força URL pública (evita "deny or ACL failure" para PDF)
          access_mode: 'public',

          // mantém entrega padrão do Cloudinary
          type: 'upload',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url) return reject(new Error('Cloudinary não retornou secure_url'));
          resolve(String(result.secure_url));
        },
      )
      .end(buffer);
  });
}

function extractMediaId(payload: any): string | null {
  return (
    payload?.media?.id ||
    payload?.rawMsg?.image?.id ||
    payload?.rawMsg?.video?.id ||
    payload?.rawMsg?.audio?.id ||
    payload?.rawMsg?.document?.id ||
    payload?.rawMsg?.sticker?.id ||
    null
  );
}

async function resolveEventMedia(prisma: PrismaService, eventId: string) {
  const ev = await prisma.leadEvent.findUnique({ where: { id: eventId } });
  if (!ev) return { ok: false as const, reason: 'EVENT_NOT_FOUND' as const };

  const payload: any = (ev as any).payloadRaw || {};
  const type = String(payload?.type || '').toLowerCase();

  const mediaId = extractMediaId(payload);
  if (!mediaId) return { ok: false as const, reason: 'NO_MEDIA_ID' as const };

  // Se já está em Cloudinary, não refaz
  const currentUrl = payload?.media?.url;
  const currentSource = payload?.media?.source;
  if (
    typeof currentUrl === 'string' &&
    currentUrl.includes('cloudinary.com') &&
    currentSource === 'cloudinary'
  ) {
    return { ok: true as const, already: true as const, url: currentUrl };
  }

  const info = await metaGetDownloadUrl(String(mediaId));
  const buf = await metaDownloadBuffer(info.downloadUrl);

  const cloudUrl = await uploadToCloudinary(
    buf,
    info.mimeType,
    `${eventId}_${mediaId}`,
    payload?.media?.kind || type,
  );

  const nextPayload = {
    ...payload,
    media: {
      ...(payload.media || {}),
      id: payload?.media?.id || mediaId,
      kind: payload?.media?.kind || type,
      mimeType: payload?.media?.mimeType || info.mimeType || null,
      sha256: payload?.media?.sha256 || info.sha256 || null,
      fileSize: payload?.media?.fileSize || info.fileSize || null,
      url: cloudUrl,
      source: 'cloudinary',
    },
  };

  await prisma.leadEvent.update({
    where: { id: eventId },
    data: { payloadRaw: nextPayload },
  });

  return { ok: true as const, url: cloudUrl };
}

async function handleJob(job: Job, prisma: PrismaService) {
  const eventId = job.data?.eventId as string | undefined;
  if (!eventId) throw new Error('job.data.eventId é obrigatório');
  return resolveEventMedia(prisma, eventId);
}

export function startWhatsappMediaWorker(prisma: PrismaService) {
  console.log('🧩 WhatsApp Media Worker boot', {
    redis: getRedisConnection(),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
  });

  const worker = new Worker(
    'whatsapp-media-queue',
    async (job) => {
      return handleJob(job, prisma);
    },
    {
      connection: getRedisConnection(),
      lockDuration: 60000,
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    console.log(`✅ media job completed: ${job.id} (${job.name})`);
  });

  worker.on('failed', (job, err) => {
    console.log(`❌ media job failed: ${job?.id} (${job?.name}) -> ${err?.message}`);
  });

  console.log('🚀 WhatsApp Media Worker iniciado (fila: whatsapp-media-queue)');
  return worker;
}