// Tokens de gráfico do módulo financeiro — validados com scripts/validate_palette.js
// (dataviz): verde/vermelho/azul passam CVD (pior par ΔE 12.4 deutan) e contraste ≥3:1
// sobre superfície branca. "Previsto" é variante ordinal da mesma matiz (opacidade +
// tracejado + tabela abaixo do gráfico como canal de alívio), não um slot categórico.

export const CHART = {
  entrada: "#0ca30c", // receitas / entradas realizadas
  saida: "#d03b3b", // despesas / saídas realizadas
  saldo: "#2a78d6", // linhas de saldo / projeção
  previstoOpacity: 0.35,
  grid: "#e1e0d9",
  axis: "#898781",
  tick: { fontSize: 11, fill: "#898781" } as const,
};

export function brlAxis(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
