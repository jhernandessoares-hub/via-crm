/**
 * Validação de CPF brasileiro (formato + dígitos verificadores).
 * Aceita CPF com ou sem máscara. Rejeita sequências repetidas (000.000.000-00 etc).
 */
export function isValidCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11) return false;
  // Rejeita todos os dígitos iguais (ex.: 11111111111)
  if (/^(\d)\1{10}$/.test(clean)) return false;

  const calcDigit = (base: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(clean.slice(0, 9), 10);
  if (d1 !== Number(clean[9])) return false;
  const d2 = calcDigit(clean.slice(0, 10), 11);
  if (d2 !== Number(clean[10])) return false;
  return true;
}
