import { BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async uploadImage(fileBuffer: Buffer, folder: string) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'image',
            type: 'upload', // garante público
            access_mode: 'public',
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        )
        .end(fileBuffer);
    });
  }

  async uploadFileRaw(fileBuffer: Buffer, folder: string) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'raw',
            type: 'upload',        // 🔥 FORÇA público
            access_mode: 'public', // 🔥 FORÇA público
            use_filename: false,
            unique_filename: true,
            overwrite: false,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        )
        .end(fileBuffer);
    });
  }

  /**
   * Deleta no Cloudinary usando publicId.
   * Tenta primeiro como RAW (pdf), depois como IMAGE (jpg/png/webp).
   * Se não encontrar em nenhum, não quebra (idempotente).
   */
  async deleteByPublicId(publicId: string) {
    const pid = String(publicId || '').trim();
    if (!pid) throw new BadRequestException('publicId inválido');

    const tryDestroy = async (resource_type: 'raw' | 'image') => {
      return await cloudinary.uploader.destroy(pid, {
        resource_type,
        invalidate: true,
      });
    };

    // 1) tenta RAW (pdf)
    try {
      const r1: any = await tryDestroy('raw');
      if (r1?.result && r1.result !== 'not found') return r1;
    } catch (_) {}

    // 2) tenta IMAGE
    try {
      const r2: any = await tryDestroy('image');
      return r2;
    } catch (e: any) {
      throw new BadRequestException(
        `Falha ao deletar no Cloudinary: ${e?.message || 'erro desconhecido'}`,
      );
    }
  }
}