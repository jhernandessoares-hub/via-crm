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

export const CONVITE_TOKEN_VALIDADE_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias a partir do envio

/**
 * Chave de acesso do questionário depois que o CPF confere. Fica no aparelho
 * da família e acompanha cada chamada (cabeçalho `X-Questionario-Acesso`):
 * sem ela o link sozinho só abre as telas de antes do CPF. Assinada com o
 * mesmo segredo e amarrada ao envio e ao token atual — reenviar ou cancelar o
 * link (token novo) invalida as chaves antigas.
 */
function assinaturaAcesso(envioId: string, tokenHash: string, exp: number): string {
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) throw new Error('WEBHOOK_HMAC_SECRET não configurada');
  return crypto.createHmac('sha256', secret).update(`questionario-acesso:${envioId}:${tokenHash}:${exp}`).digest('hex');
}

export function gerarChaveAcessoQuestionario(envioId: string, tokenHash: string, expiraEm: Date): string {
  const exp = expiraEm.getTime();
  return `${exp}.${assinaturaAcesso(envioId, tokenHash, exp)}`;
}

export function chaveAcessoQuestionarioValida(chave: unknown, envioId: string, tokenHash: string): boolean {
  if (typeof chave !== 'string') return false;
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(chave);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < Date.now()) return false;
  const esperada = Buffer.from(assinaturaAcesso(envioId, tokenHash, exp), 'hex');
  return crypto.timingSafeEqual(esperada, Buffer.from(m[2], 'hex'));
}
