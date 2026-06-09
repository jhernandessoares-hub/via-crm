/** Classes Tailwind para inputs e selects — tema-aware (dark mode via variáveis CSS) */
export const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500/20 placeholder:text-[var(--shell-subtext)]/60";
export const sel = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500/20";

/** Formata dígitos digitados como área em m² no padrão brasileiro: 15000 → "150,00" */
export function maskArea(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  const int = Math.floor(num / 100);
  const dec = num % 100;
  return `${int.toLocaleString("pt-BR")},${String(dec).padStart(2, "0")}`;
}

/** Converte string no formato "1.500,50" para number 1500.5 */
export function parseArea(v: string): number | undefined {
  const clean = v.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? undefined : n;
}

/** Máscara de CPF: "12345678901" → "123.456.789-01" (limita a 11 dígitos) */
export function maskCPF(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Máscara de CEP: "12345678" → "12345-678" (limita a 8 dígitos) */
export function maskCEP(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Máscara de telefone BR: "(11) 99999-9999" (celular) ou "(11) 9999-9999" (fixo).
 * Remove o código de país 55 quando presente (número armazenado é 55+DDD+numero,
 * ex: 5511999999999 com 13 dígitos) para exibir/editar no formato nacional. */
export function maskPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Valida CPF (formato + dígitos verificadores). Vazio retorna false. */
export function isValidCPF(cpf: string): boolean {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10]);
}
