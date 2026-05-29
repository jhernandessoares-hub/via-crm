import { v2 as cloudinary } from 'cloudinary';

export function parseCloudinaryUrl(url: string): {
  publicId: string;
  ext: string;
  resourceType: 'image' | 'video' | 'raw';
} | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);

    const uploadIdx = parts.findIndex((p) => p === 'upload');
    if (uploadIdx < 0) return null;

    const resourceTypeRaw = parts[uploadIdx - 1] || 'image';
    const resourceType =
      resourceTypeRaw === 'video' ? 'video' : resourceTypeRaw === 'raw' ? 'raw' : 'image';

    // Strip optional s--sig-- segment, then strip v{number}
    const afterUpload = parts.slice(uploadIdx + 1);
    const afterSig =
      afterUpload.length > 0 && /^s--[A-Za-z0-9_-]+--$/.test(afterUpload[0])
        ? afterUpload.slice(1)
        : afterUpload;
    const withoutVersion =
      afterSig.length > 0 && /^v\d+$/.test(afterSig[0]) ? afterSig.slice(1) : afterSig;

    if (withoutVersion.length === 0) return null;

    const last = withoutVersion[withoutVersion.length - 1];
    const m = last.match(/^(.+)\.([a-zA-Z0-9]+)$/);
    const ext = m?.[2] ? m[2].toLowerCase() : 'bin';
    const lastNoExt = m?.[1] || last;

    const folderParts = withoutVersion.slice(0, -1);
    const publicId = [...folderParts, lastNoExt].join('/');

    return { publicId, ext, resourceType };
  } catch {
    return null;
  }
}

export function buildPrivateDownloadUrl(
  publicId: string,
  ext: string,
  resourceType: 'image' | 'video' | 'raw',
  deliveryType: 'upload' | 'authenticated' = 'upload',
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutos
  const format = ext && ext !== 'bin' ? ext : '';
  return (cloudinary.utils as any).private_download_url(publicId, format, {
    resource_type: resourceType,
    type: deliveryType,
    expires_at: expiresAt,
    attachment: false,
  });
}

export function signCloudinaryUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) return url;
  // PDF via video/upload deve ser tratado como raw
  let resourceType = parsed.resourceType;
  if (parsed.ext === 'pdf') resourceType = 'raw';

  try {
    // Para raw com extensão conhecida: public_id no Cloudinary inclui a extensão
    // ex: "folder/arquivo.pdf" é o public_id real, não "folder/arquivo"
    if (resourceType === 'raw' && parsed.ext && parsed.ext !== 'bin') {
      const publicIdWithExt = `${parsed.publicId}.${parsed.ext}`;
      return (cloudinary.utils as any).private_download_url(publicIdWithExt, '', {
        resource_type: 'raw',
        type: 'upload',
        expires_at: Math.floor(Date.now() / 1000) + 300,
        attachment: false,
      });
    }
    return buildPrivateDownloadUrl(parsed.publicId, parsed.ext, resourceType);
  } catch {
    return url;
  }
}
