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
