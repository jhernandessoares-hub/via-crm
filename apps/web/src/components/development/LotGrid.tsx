"use client";
import { useState } from "react";

type Unit = {
  id: string;
  number: string;
  status: "DISPONIVEL" | "RESERVADO" | "VENDIDO";
  areaM2?: number | null;
  price?: number | null;
  buyerName?: string | null;
  lead?: { id: string; nome: string; nomeCorreto?: string | null } | null;
};

type Props = {
  units: Unit[];
  cols?: number;
  mode?: "lot" | "house";
  onSelect?: (unit: Unit) => void;
};

const STATUS_COLOR: Record<string, string> = {
  DISPONIVEL: "#22c55e",
  RESERVADO:  "#facc15",
  VENDIDO:    "#ef4444",
};

const STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível",
  RESERVADO:  "Reservado",
  VENDIDO:    "Vendido",
};

function HouseIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill={color}>
      <polygon points="12,2 22,11 20,11 20,21 14,21 14,15 10,15 10,21 4,21 4,11 2,11" />
    </svg>
  );
}

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function LotGrid({ units, cols = 10, mode = "lot", onSelect }: Props) {
  const [tooltip, setTooltip] = useState<{ unit: Unit; x: number; y: number } | null>(null);

  function showTooltip(e: React.MouseEvent, unit: Unit) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ unit, x: rect.right + 8, y: rect.top });
  }

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div
        className="gap-2"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {units.map((unit) => {
          const color = STATUS_COLOR[unit.status];
          return (
            <button
              key={unit.id}
              type="button"
              onMouseEnter={(e) => showTooltip(e, unit)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => onSelect?.(unit)}
              className="flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-opacity hover:opacity-80"
              style={{ borderColor: color, backgroundColor: color + "33" }}
            >
              {mode === "lot" ? (
                <>
                  <span className="text-xs font-bold leading-none" style={{ color }}>
                    {unit.number}
                  </span>
                  <span className="mt-0.5 text-[10px] leading-none text-[var(--shell-subtext)]">
                    {unit.number}
                  </span>
                </>
              ) : (
                <>
                  <HouseIcon color={color} />
                  <span className="mt-0.5 text-[10px] leading-none text-[var(--shell-subtext)]">
                    {unit.number}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-[var(--shell-subtext)]">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: STATUS_COLOR[k] }} />
            {v}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 w-52 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 shadow-xl text-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold text-[var(--shell-text)] mb-1">{tooltip.unit.number}</p>
          <p className="text-[var(--shell-subtext)]">Status: <span className="font-medium text-[var(--shell-text)]">{STATUS_LABEL[tooltip.unit.status]}</span></p>
          {tooltip.unit.areaM2 && <p className="text-[var(--shell-subtext)]">Área: <span className="font-medium text-[var(--shell-text)]">{tooltip.unit.areaM2} m²</span></p>}
          {tooltip.unit.price && <p className="text-[var(--shell-subtext)]">Preço: <span className="font-medium text-[var(--shell-text)]">{fmt(tooltip.unit.price)}</span></p>}
          {tooltip.unit.buyerName && <p className="text-[var(--shell-subtext)]">Comprador: <span className="font-medium text-[var(--shell-text)]">{tooltip.unit.buyerName}</span></p>}
          {tooltip.unit.lead && <p className="text-[var(--shell-subtext)]">Lead: <span className="font-medium text-[var(--shell-text)]">{tooltip.unit.lead.nomeCorreto ?? tooltip.unit.lead.nome}</span></p>}
        </div>
      )}
    </div>
  );
}
