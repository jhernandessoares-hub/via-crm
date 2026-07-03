/**
 * Upload das fotos de andamento da obra do SP9 ("SIM José Bonifácio") pro
 * Cloudinary. Uso: npx ts-node scripts/upload-sp9-obra-photos.ts
 * Imprime as URLs pra colar no componente do site.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import * as fs from 'fs';
import * as path from 'path';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const IMAGES_DIR = path.resolve(__dirname, '../../../IMAGENS SITE SP9');

const FILES = {
  obra1: 'OBRA 1.jpeg',
  obra2: 'OBRA 2.jpeg',
  obra4: 'OBRA 4.jpeg',
  obra5: 'OBRA 5.jpeg',
  obra6: 'OBRA 6.jpeg',
  obra7: 'OBRA 7.jpeg',
} as const;

async function upload(filename: string): Promise<string> {
  const filePath = path.join(IMAGES_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: 'via-crm/sites/sp9/obra', resource_type: 'image', type: 'upload', access_mode: 'public' },
        (err: any, res: any) => {
          if (err) return reject(err);
          resolve(res.secure_url);
        },
      )
      .end(buffer);
  });
}

async function main() {
  const urls: Record<string, string> = {};
  for (const [key, filename] of Object.entries(FILES)) {
    process.stdout.write(`Upload ${filename}... `);
    urls[key] = await upload(filename);
    console.log('OK');
  }
  console.log('\n' + JSON.stringify(urls, null, 2));
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
