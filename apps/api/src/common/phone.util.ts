/**
 * Utilitário compartilhado de telefone brasileiro.
 * Fonte única de verdade para normalização/validação — usado tanto para
 * `Lead.telefone` quanto para `User.whatsappNumber`.
 */

/** Remove tudo que não for dígito. */
export function digitsOnly(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * Normaliza para o padrão de discagem 55+DDD+numero (ex: 5511999999999).
 * Números nacionais (10/11 dígitos) recebem o 55; números que já têm o país
 * (12/13 dígitos) são mantidos. Retorna null quando não há dígitos.
 */
export function normalizePhoneBR(input: string | null | undefined): string | null {
  const d = digitsOnly(input);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

/**
 * Valida um número de WhatsApp já normalizado (saída de `normalizePhoneBR`).
 * Considera válido apenas 12 (fixo) ou 13 (celular com 9) dígitos começando com 55.
 */
export function isValidWhatsappNumber(normalized: string | null | undefined): boolean {
  if (!normalized) return false;
  return normalized.startsWith('55') && (normalized.length === 12 || normalized.length === 13);
}
