import { v2 as cloudinary } from 'cloudinary';
import { Logger } from '../logger';

const logger = new Logger('CloudinaryInit');

/**
 * Inicializa o SDK Cloudinary uma única vez no startup da API.
 * Lança exceção se as variáveis obrigatórias não estiverem definidas.
 * Chamado em main.ts antes de iniciar os workers.
 */
export function initCloudinary(): void {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    logger.warn(
      'Cloudinary não configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET ausentes). ' +
      'Upload e download de mídia serão desabilitados.',
    );
    return;
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  logger.log(`Cloudinary inicializado (cloud: ${cloud_name})`);
}
