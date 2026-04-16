import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';
/** Prefixo que distingue valores criptografados de texto plano (backward compat) */
const ENC_PREFIX = 'ENC:';

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY não definida no .env. ' +
      'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY deve ter exatamente 64 caracteres hex (256 bits).');
  }
  return key;
}

/**
 * Criptografa um valor sensível com AES-256-GCM.
 * Retorna string com prefixo "ENC:" para identificação.
 */
export function encryptField(value: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: ENC:<base64(iv + tag + ciphertext)>
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decriptografa um valor previamente criptografado por encryptField().
 * Se o valor não começa com "ENC:", retorna como está (backward compat com dados antigos).
 */
export function decryptField(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) {
    return value; // plaintext — dados anteriores à criptografia
  }

  const key = getKey();
  const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');

  if (buf.length < 28) {
    throw new Error('Valor criptografado corrompido (comprimento inválido).');
  }

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Retorna true se o valor já foi criptografado por encryptField().
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}
