import { v2 as cloudinary } from 'cloudinary';

/**
 * Helpers de upload compartilhados pelo módulo Pré-Ocupação (TTS).
 *
 * Mesmo padrão de `lead-documents/lead-documents.service.ts`: assets privados
 * (`type: 'authenticated'`), pois são dados pessoais de famílias de um programa
 * social — mesmo cuidado LGPD dado aos documentos de lead. Nunca usar
 * `cloudinary.config()` direto — o singleton já é configurado em `main.ts`.
 */
export function ensurePreOcupacaoCloudinaryConfigured() {
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

function resolveResourceType(mimetype: string | undefined): 'image' | 'video' | 'raw' {
  if (!mimetype) return 'raw';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

/**
 * Upload de anexo (foto/vídeo/lista de presença/ficha) para Cloudinary — retorna { url, publicId }.
 *
 * Por padrão privado (`type: 'authenticated'`). Passar `{ public: true }` para
 * conteúdo institucional/educacional sem dado pessoal (ex.: "Conteúdo e Mídias"),
 * evitando a necessidade de URL assinada a cada visualização.
 */
export async function uploadPreOcupacaoFile(
  file: any,
  tenantId: string,
  subfolder: string,
  opts?: { public?: boolean },
): Promise<{ url: string; publicId: string }> {
  ensurePreOcupacaoCloudinaryConfigured();
  const resourceType = resolveResourceType(file?.mimetype);
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `via-crm/pre-ocupacao/${tenantId}/${subfolder}`,
          resource_type: resourceType,
          type: opts?.public ? 'upload' : 'authenticated', // 🔒 privado por padrão — só acessível via URL assinada pelo backend
          use_filename: false,
          unique_filename: true,
        },
        (err: any, res: any) => {
          if (err) return reject(err);
          resolve({ url: res.secure_url, publicId: res.public_id });
        },
      )
      .end(file.buffer);
  });
}
