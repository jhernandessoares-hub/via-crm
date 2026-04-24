"use client";
import { useState, useRef } from "react";

type Unit = {
  id: string;
  number: string;
  tower?: string | null;
  floor?: number | null;
  status: "DISPONIVEL" | "RESERVADO" | "VENDIDO";
  areaM2?: number | null;
  price?: number | null;
  buyerName?: string | null;
  lead?: { id: string; nome: string; nomeCorreto?: string | null } | null;
};

type Props = {
  units: Unit[];
  onSelect?: (unit: Unit) => void;
};

const STATUS_COLOR: Record<string, string> = {
  DISPONIVEL: "bg-green-500 hover:bg-green-400",
  RESERVADO:  "bg-yellow-400 hover:bg-yellow-300",
  VENDIDO:    "bg-red-500 hover:bg-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível",
  RESERVADO:  "Reservado",
  VENDIDO:    "Vendido",
};

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function TowerLayout({ units, onSelect }: Props) {
  const [tooltip, setTooltip] = useState<{ unit: Unit; x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Agrupa por torre
  const towers: Record<string, Unit[]> = {};
  for (const u of units) {
    const key = u.tower ?? "Principal";
    if (!towers[key]) towers[key] = [];
    towers[key].push(u);
  }

  function showTooltip(e: React.MouseEvent, unit: Unit) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ unit, x: rect.right + 8, y: rect.top });
  }

  return (
    <div className="space-y-8">
      {Object.entries(towers).map(([towerName, towerUnits]) => {
        // Agrupa por andar, ordem decrescente (topo = andar mais alto)
        const floorMap: Record<number, Unit[]> = {};
        for (const u of towerUnits) {
          const f = u.floor ?? 0;
          if (!floorMap[f]) floorMap[f] = [];
          floorMap[f].push(u);
        }
        const floors = Object.keys(floorMap)
          .map(Number)
          .sort((a, b) => b - a);

        return (
          <div key={towerName}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">
              Torre {towerName}
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--shell-card-border)]">
              <table className="w-full text-sm">
                <tbody>
                  {floors.map((floor) => (
                    <tr key={floor} className="border-b border-[var(--shell-card-border)] last:border-0">
                      <td className="w-12 px-3 py-2 text-center text-xs font-medium text-[var(--shell-subtext)]">
                        {floor > 0 ? `${floor}º` : "T"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {floorMap[floor].map((unit) => (
                            <button
                              key={unit.id}
                              type="button"
                              onMouseEnter={(e) => showTooltip(e, unit)}
                              onMouseLeave={() => setTooltip(null)}
                              onClick={() => onSelect?.(unit)}
                              className={`h-8 w-14 rounded text-xs font-semibold text-white transition-colors ${STATUS_COLOR[unit.status]}`}
                            >
                              {unit.number}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-[var(--shell-subtext)]">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${STATUS_COLOR[k].split(" ")[0]}`} />
            {v}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 w-52 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 shadow-xl text-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold text-[var(--shell-text)] mb-1">Unidade {tooltip.unit.number}</p>
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
