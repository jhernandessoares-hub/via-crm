import * as crypto from 'crypto';

/**
 * Hash HMAC-SHA256 do token de convite (link mágico de confirmação de
 * presença) — mesmo padrão de `hashToken()` em `channels.service.ts`,
 * reusando `WEBHOOK_HMAC_SECRET` (já existe em produção, sem segredo novo).
 */
export function hashConviteToken(token: string): string {
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) throw new Error('WEBHOOK_HMAC_SECRET não configurada');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function gerarConviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const CONVITE_TOKEN_VALIDADE_MS = 24 * 60 * 60 * 1000; // 24h a partir do envio
