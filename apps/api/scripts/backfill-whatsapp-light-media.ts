/**
 * Backfill mídia WhatsApp Light (Baileys) — imagem/vídeo/documento
 *
 * Uso: npx ts-node scripts/backfill-whatsapp-light-media.ts
 *
 * Busca LeadEvents do WhatsApp Light sem payloadRaw.media.url,
 * re-baixa o arquivo via Baileys downloadMediaMessage() usando o rawMsg armazenado,
 * sobe ao Cloudinary e atualiza o evento.
 *
 * Idempotente: pula eventos que já têm payloadRaw.media.url.
 */

import { PrismaClient } from '@prisma/client';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';

dotenv.config({ path: `${__dirname}/../.env` });

const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MEDIA_TYPES = ['image', 'video', 'document'];

// Busca eventos a partir de ontem 00:00 (ajustar se necessário)
const SINCE = new Date('2026-05-26T00:00:00.000Z');

async function uploadToCloudinary(
  buffer: Buffer,
  resourceType: 'image' | 'video' | 'raw',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'via-crm/whatsapp-light/files', resource_type: resourceType },
      (err, result) => (err || !result ? reject(err) : resolve(result.secure_url)),
    );
    Readable.from(buffer).pipe(stream);
  });
}

function resolveMediaMeta(rawMsg: any, type: string): {
  rawMime: string;
  filename: string | null;
  resourceType: 'image' | 'video' | 'raw';
} {
  const inner =
    rawMsg?.message?.documentWithCaptionMessage?.message ||
    rawMsg?.message?.viewOnceMessage?.message ||
    rawMsg?.message?.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
    rawMsg?.message?.ephemeralMessage?.message ||
    rawMsg?.message || {};

  if (type === 'image') {
    return {
      rawMime: inner.imageMessage?.mimetype ?? 'image/jpeg',
      filename: null,
      resourceType: 'image',
    };
  }
  if (type === 'video') {
    return {
      rawMime: inner.videoMessage?.mimetype ?? 'video/mp4',
      filename: null,
      resourceType: 'video',
    };
  }
  return {
    rawMime: inner.documentMessage?.mimetype ?? 'application/octet-stream',
    filename: inner.documentMessage?.fileName ?? null,
    resourceType: 'raw',
  };
}

async function main() {
  console.log(`Buscando eventos WhatsApp Light sem mídia Cloudinary desde ${SINCE.toISOString()}...`);

  const events = await prisma.leadEvent.findMany({
    where: {
      channel: 'whatsapp.unofficial.in',
      criadoEm: { gte: SINCE },
    },
    select: { id: true, payloadRaw: true, criadoEm: true, leadId: true },
    orderBy: { criadoEm: 'asc' },
  });

  const candidates = events.filter((ev) => {
    const p = ev.payloadRaw as any;
    if (!p) return false;
    if (!MEDIA_TYPES.includes(p.type)) return false;
    if (p.media?.url) return false; // já tem Cloudinary URL
    if (!p.rawMsg) return false;
    return true;
  });

  console.log(`Total de eventos candidatos: ${candidates.length}`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const ev of candidates) {
    const p = ev.payloadRaw as any;
    const type: string = p.type;
    const rawMsg = p.rawMsg;

    try {
      const buffer = await downloadMediaMessage(rawMsg, 'buffer', {}) as Buffer;
      if (!buffer || buffer.length === 0) {
        console.warn(`  [SKIP] ${ev.id} — buffer vazio (mídia expirada?)`);
        skip++;
        continue;
      }

      const { rawMime, filename, resourceType } = resolveMediaMeta(rawMsg, type);
      const mimeType = rawMime.split(';')[0].trim();
      const mediaUrl = await uploadToCloudinary(buffer, resourceType);

      const nextPayload = {
        ...p,
        media: { url: mediaUrl, mimeType, filename, kind: type },
      };

      await prisma.leadEvent.update({
        where: { id: ev.id },
        data: { payloadRaw: nextPayload },
      });

      console.log(`  [OK] ${ev.id} (${type}, ${buffer.length} bytes) → ${mediaUrl}`);
      ok++;
    } catch (err: any) {
      console.error(`  [FAIL] ${ev.id} — ${err?.message}`);
      fail++;
    }
  }

  console.log(`\nConcluído: ${ok} recuperados, ${skip} pulados, ${fail} com falha.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
