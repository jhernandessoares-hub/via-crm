/**
 * Formata o numero sequencial do lead para exibicao.
 *
 * Exemplos:
 *   formatLeadNumber(1)            -> "000001"
 *   formatLeadNumber(10, 1)        -> "000010"
 *   formatLeadNumber(10, 2)        -> "000010 - 2x"
 *   formatLeadNumber(null)         -> ""  (lead ainda sem numero — backfill pendente)
 */
export function formatLeadNumber(
  numero: number | null | undefined,
  reentradaCount: number | null | undefined = 1,
): string {
  if (typeof numero !== "number" || numero <= 0) return "";
  const padded = String(numero).padStart(6, "0");
  const r = typeof reentradaCount === "number" ? reentradaCount : 1;
  return r > 1 ? `${padded} - ${r}x` : padded;
}
