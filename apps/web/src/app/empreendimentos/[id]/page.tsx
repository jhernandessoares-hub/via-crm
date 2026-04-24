"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, updateDevelopment, createTower, updateTower, deleteTower,
  bulkCreateUnits, bulkUpdateUnits, updateUnit, getDashboard,
  getPaymentCondition, upsertPaymentCondition,
  type Development, type Tower, type DevelopmentUnit, type UnitStatus,
  type PaymentCondition, type Dashboard,
} from "@/lib/developments.service";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<UnitStatus, string> = {
  DISPONIVEL: "#22c55e",
  RESERVADO:  "#f59e0b",
  VENDIDO:    "#ef4444",
  BLOQUEADO:  "#6b7280",
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  DISPONIVEL: "Disponível",
  RESERVADO:  "Reservado",
  VENDIDO:    "Vendido",
  BLOQUEADO:  "Bloqueado",
};

const CELL_COLORS: Record<string, { bg: string; label: string; emoji: string }> = {
  UNIT:          { bg: "var(--shell-card-bg)", label: "Unidade",        emoji: "" },
  EMPTY:         { bg: "transparent",           label: "Vazio",          emoji: "" },
  VEGETATION:    { bg: "#bbf7d0",               label: "Vegetação",      emoji: "🌳" },
  PORTARIA:      { bg: "#bfdbfe",               label: "Portaria",       emoji: "🏪" },
  RUA:           { bg: "#d1d5db",               label: "Rua",            emoji: "🛣️" },
  MURO:          { bg: "#9ca3af",               label: "Muro",           emoji: "🧱" },
  GARAGEM:       { bg: "#fde68a",               label: "Garagem",        emoji: "🚗" },
  PISCINA:       { bg: "#7dd3fc",               label: "Piscina",        emoji: "🏊" },
  QUADRA:        { bg: "#a7f3d0",               label: "Quadra",         emoji: "🏀" },
  CHURRASQUEIRA: { bg: "#fca5a5",               label: "Churrasqueira",  emoji: "🔥" },
  SALAO_FESTA:   { bg: "#ddd6fe",               label: "Salão de Festa", emoji: "🎉" },
  AREA_LAZER:    { bg: "#d1fae5",               label: "Área de Lazer",  emoji: "🌿" },
  CASA_MAQUINAS: { bg: "#fef9c3",               label: "Casa de Maq.",   emoji: "⚙️" },
  CAIXA_DAGUA:   { bg: "#e0f2fe",               label: "Caixa d'água",   emoji: "💧" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function SunIndicator({ orientation }: { orientation: string }) {
  const arrows: Record<string, { arrow: string; label: string; pos: string }> = {
    NORTE: { arrow: "↑", label: "Nascente", pos: "top-0 left-1/2 -translate-x-1/2 -translate-y-full" },
    SUL:   { arrow: "↓", label: "Nascente", pos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-full" },
    LESTE: { arrow: "→", label: "Nascente", pos: "right-0 top-1/2 -translate-y-1/2 translate-x-full" },
    OESTE: { arrow: "←", label: "Nascente", pos: "left-0 top-1/2 -translate-y-1/2 -translate-x-full" },
  };
  const s = arrows[orientation] ?? arrows.LESTE;
  return (
    <div className={`absolute ${s.pos} flex flex-col items-center gap-0.5 pointer-events-none`}>
      <span className="text-yellow-500 text-xl">{s.arrow}</span>
      <span className="text-[10px] font-semibold text-yellow-600 bg-yellow-50 rounded px-1">☀️ {s.label}</span>
    </div>
  );
}

// ─── UnitTooltip ─────────────────────────────────────────────────────────────

function UnitTooltip({ unit, x, y }: { unit: DevelopmentUnit; x: number; y: number }) {
  return (
    <div className="fixed z-50 pointer-events-none w-48 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 shadow-xl text-xs"
      style={{ left: x + 12, top: y }}>
      <p className="font-semibold text-[var(--shell-text)] mb-1">{unit.nome}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[unit.status] }} />
        <span className="text-[var(--shell-subtext)]">{STATUS_LABEL[unit.status]}</span>
      </div>
      {unit.valorVenda && <p className="text-[var(--shell-subtext)]">Valor: <span className="font-medium text-[var(--shell-text)]">{fmt(unit.valorVenda)}</span></p>}
      {unit.areaM2 && <p className="text-[var(--shell-subtext)]">Área: <span className="font-medium text-[var(--shell-text)]">{unit.areaM2} m²</span></p>}
      {unit.quartos && <p className="text-[var(--shell-subtext)]">Quartos: <span className="font-medium text-[var(--shell-text)]">{unit.quartos}</span></p>}
      {unit.bloqueioMotivo && <p className="mt-1 text-red-600">🔒 {unit.bloqueioMotivo}</p>}
    </div>
  );
}

// ─── TerrainGrid ─────────────────────────────────────────────────────────────


function BtnPlusMinus({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label}
      className="flex h-5 w-5 items-center justify-center rounded bg-[var(--brand-accent)] text-white text-xs font-bold hover:opacity-80 transition-opacity shrink-0">
      +
    </button>
  );
}

function BtnMinus({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label}
      className="flex h-5 w-5 items-center justify-center rounded border border-red-300 bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors shrink-0">
      −
    </button>
  );
}

// ─── SunCompass ───────────────────────────────────────────────────────────────

const SUN_POSITIONS = [
  { key: "LESTE",     angle: 0,   label: "L"  },
  { key: "SUDESTE",   angle: 45,  label: "SE" },
  { key: "SUL",       angle: 90,  label: "S"  },
  { key: "SUDOESTE",  angle: 135, label: "SO" },
  { key: "OESTE",     angle: 180, label: "O"  },
  { key: "NOROESTE",  angle: 225, label: "NO" },
  { key: "NORTE",     angle: 270, label: "N"  },
  { key: "NORDESTE",  angle: 315, label: "NE" },
];

function snapSun(angleDeg: number): string {
  const deg = ((angleDeg % 360) + 360) % 360;
  let best = SUN_POSITIONS[0];
  let bestD = Infinity;
  for (const p of SUN_POSITIONS) {
    const d = Math.min(Math.abs(deg - p.angle), 360 - Math.abs(deg - p.angle));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.key;
}

function SunCompass({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const R      = 38;
  const SIZE   = 104;
  const CENTER = SIZE / 2;
  const ref    = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [live,     setLive]     = useState<string | null>(null);

  function angleFrom(clientX: number, clientY: number) {
    const rect = ref.current!.getBoundingClientRect();
    const dx = clientX - (rect.left + CENTER);
    const dy = clientY - (rect.top  + CENTER);
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => setLive(snapSun(angleFrom(e.clientX, e.clientY)));
    const onUp   = (e: MouseEvent) => {
      const k = snapSun(angleFrom(e.clientX, e.clientY));
      onChange(k); setDragging(false); setLive(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  const display = live ?? value;
  const cur     = SUN_POSITIONS.find((p) => p.key === display) ?? SUN_POSITIONS[0];
  const sunRad  = cur.angle * Math.PI / 180;
  const sunX    = CENTER + R * Math.cos(sunRad);
  const sunY    = CENTER + R * Math.sin(sunRad);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <p className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nascente ☀️</p>
      <div ref={ref} style={{ width: SIZE, height: SIZE, position: "relative" }}>
        <svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0 }}>
          {/* Anel externo */}
          <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="#e2e8f0" strokeWidth="2" />
          {/* Raios */}
          {SUN_POSITIONS.map((p) => {
            const rad = p.angle * Math.PI / 180;
            return <line key={p.key}
              x1={CENTER + (R - 8) * Math.cos(rad)} y1={CENTER + (R - 8) * Math.sin(rad)}
              x2={CENTER + R * Math.cos(rad)}        y2={CENTER + R * Math.sin(rad)}
              stroke={display === p.key ? "#f59e0b" : "#e2e8f0"} strokeWidth="2" />;
          })}
          {/* Labels das 8 posições */}
          {SUN_POSITIONS.map((p) => {
            const rad = p.angle * Math.PI / 180;
            const lx  = CENTER + (R + 12) * Math.cos(rad);
            const ly  = CENTER + (R + 12) * Math.sin(rad);
            const active = display === p.key;
            return <text key={p.key} x={lx} y={ly + 3.5} textAnchor="middle"
              fontSize="9" fontWeight="700"
              fill={active ? "#92400e" : "#94a3b8"}>{p.label}</text>;
          })}
          {/* Seta indicando direção atual */}
          <line x1={CENTER} y1={CENTER}
            x2={CENTER + (R - 12) * Math.cos(sunRad)}
            y2={CENTER + (R - 12) * Math.sin(sunRad)}
            stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          {/* Ponto central */}
          <circle cx={CENTER} cy={CENTER} r={3} fill="#f59e0b" />
        </svg>
        {/* ☀️ arrastável */}
        <div
          onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
          style={{
            position: "absolute",
            left: sunX - 12, top: sunY - 12,
            fontSize: 24,
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none", pointerEvents: "all",
            filter: dragging ? "drop-shadow(0 0 4px #f59e0b)" : "none",
            transition: dragging ? "none" : "left 0.15s, top 0.15s",
          }}>
          ☀️
        </div>
        {/* Label central */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span className="text-[10px] font-bold text-amber-600">{cur.label}</span>
        </div>
      </div>
      <p className="text-[9px] text-[var(--shell-subtext)]">Arraste o ☀️ para girar</p>
    </div>
  );
}

// ─── TerrainGrid ───────────────────────────────────────────────────────────────

function TerrainGrid({ dev, onSelectTower, onSave, onSunChange, onPlaceTower, onClearTowerPosition }: {
  dev: Development;
  onSelectTower: (t: Tower) => void;
  onSave: (layout: any[], rows: number, cols: number, sun: string) => Promise<void>;
  onSunChange: (sun: string) => void;
  onPlaceTower: (towerId: string, col: number, row: number, w: number, h: number) => Promise<void>;
  onClearTowerPosition: (towerId: string) => Promise<void>;
}) {
  const [layout,  setLayout]  = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (dev.gridLayout) (dev.gridLayout as any[]).forEach((c: any) => { map[`${c.row}-${c.col}`] = c.type; });
    return map;
  });
  const [brushType,      setBrushType]      = useState<string>("EMPTY");
  const [painting,       setPainting]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(true);
  const [rows,           setRows]           = useState(dev.gridRows);
  const [cols,           setCols]           = useState(dev.gridCols);
  const [sun,            setSun]            = useState(dev.sunOrientation);
  const [placingTowerId, setPlacingTowerId] = useState<string | null>(null);
  const [placingW,       setPlacingW]       = useState(1);
  const [placingH,       setPlacingH]       = useState(1);
  const [hoverCell,      setHoverCell]      = useState<{ row: number; col: number } | null>(null);

  // footprint map cobre todas as células de cada torre
  const towerMap: Record<string, Tower> = {};
  dev.towers.forEach((t) => {
    if (t.gridX != null && t.gridY != null) {
      for (let dy = 0; dy < (t.gridHeight ?? 1); dy++)
        for (let dx = 0; dx < (t.gridWidth ?? 1); dx++)
          towerMap[`${t.gridY + dy}-${t.gridX + dx}`] = t;
    }
  });

  const placingTower = placingTowerId ? dev.towers.find((t) => t.id === placingTowerId) ?? null : null;

  const previewCells = new Set<string>();
  if (placingTower && hoverCell) {
    for (let dy = 0; dy < placingH; dy++)
      for (let dx = 0; dx < placingW; dx++)
        previewCells.add(`${hoverCell.row + dy}-${hoverCell.col + dx}`);
  }
  const previewConflict = placingTower && hoverCell && Array.from(previewCells).some((k) => towerMap[k]);

  const cancelPlacing = useCallback(() => { setPlacingTowerId(null); setHoverCell(null); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelPlacing(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelPlacing]);

  function mark()                          { setSaved(false); }
  function paintCell(r: number, c: number) { mark(); setLayout((p) => ({ ...p, [`${r}-${c}`]: brushType })); }

  function addRow(atIndex: number) {
    setLayout((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([key, type]) => {
        const [r, c] = key.split("-").map(Number);
        next[r >= atIndex ? `${r + 1}-${c}` : key] = type;
      });
      return next;
    });
    setRows((r) => r + 1); mark();
  }

  function removeRow(atIndex: number) {
    if (rows <= 1) return;
    setLayout((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([key, type]) => {
        const [r, c] = key.split("-").map(Number);
        if (r === atIndex) return;
        next[r > atIndex ? `${r - 1}-${c}` : key] = type;
      });
      return next;
    });
    setRows((r) => r - 1); mark();
  }

  function addCol(atIndex: number) {
    setLayout((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([key, type]) => {
        const [r, c] = key.split("-").map(Number);
        next[c >= atIndex ? `${r}-${c + 1}` : key] = type;
      });
      return next;
    });
    setCols((c) => c + 1); mark();
  }

  function removeCol(atIndex: number) {
    if (cols <= 1) return;
    setLayout((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([key, type]) => {
        const [r, c] = key.split("-").map(Number);
        if (c === atIndex) return;
        next[c > atIndex ? `${r}-${c - 1}` : key] = type;
      });
      return next;
    });
    setCols((c) => c - 1); mark();
  }

  function layoutToArray() {
    return Object.entries(layout).filter(([, t]) => t !== "UNIT").map(([key, type]) => {
      const [r, c] = key.split("-").map(Number);
      return { row: r, col: c, type };
    });
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave(layoutToArray(), rows, cols, sun); setSaved(true); }
    finally { setSaving(false); }
  }

  function handleSunChange(k: string) { setSun(k); onSunChange(k); mark(); }

  // ─── Cell width constant
  const CW = 40; // px (w-10 = 2.5rem)

  return (
    <div className="space-y-4">

      {/* Banner modo posicionamento */}
      {placingTower && (
        <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 gap-4 flex-wrap">
          <p className="text-sm font-semibold text-blue-700">
            📍 Posicionando <span className="font-bold">{placingTower.nome}</span>
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-blue-700">
              <span className="font-semibold">Tamanho:</span>
              <BtnMinus onClick={() => setPlacingW((w) => Math.max(1, w - 1))} label="−" />
              <span className="w-5 text-center font-bold">{placingW}</span>
              <BtnPlusMinus onClick={() => setPlacingW((w) => Math.min(cols, w + 1))} label="+" />
              <span className="text-blue-500">col ×</span>
              <BtnMinus onClick={() => setPlacingH((h) => Math.max(1, h - 1))} label="−" />
              <span className="w-5 text-center font-bold">{placingH}</span>
              <BtnPlusMinus onClick={() => setPlacingH((h) => Math.min(rows, h + 1))} label="+" />
              <span className="text-blue-500">lin</span>
            </div>
            <span className="text-xs text-blue-400">Hover = preview · clique = confirma · ESC cancela</span>
            <button onClick={cancelPlacing} className="text-blue-500 hover:text-blue-700 text-lg font-bold">✕</button>
          </div>
        </div>
      )}

      {/* Torres no terreno */}
      {dev.towers.length > 0 && (
        <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-bg)] p-3">
          <p className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide mb-2">Torres no terreno</p>
          <div className="flex flex-wrap gap-2">
            {dev.towers.map((t) => {
              const placed    = t.gridX != null && t.gridY != null;
              const isPlacing = placingTowerId === t.id;
              const w = t.gridWidth ?? 1; const h = t.gridHeight ?? 1;
              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors
                  ${isPlacing ? "border-blue-400 bg-blue-50" : placed ? "border-[#3b82f6] bg-[#1e3a5f]/10" : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]"}`}>
                  <span className={`font-semibold ${placed ? "text-blue-600" : "text-[var(--shell-subtext)]"}`}>
                    {placed ? "🏢" : "⬜"} {t.nome}
                  </span>
                  {placed && (
                    <span className="text-[10px] text-[var(--shell-subtext)]">
                      L{(t.gridY ?? 0) + 1} C{(t.gridX ?? 0) + 1}{(w > 1 || h > 1) ? ` · ${w}×${h}` : ""}
                    </span>
                  )}
                  <button onClick={() => { setPlacingTowerId(isPlacing ? null : t.id); setPlacingW(w); setPlacingH(h); setHoverCell(null); }}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors
                      ${isPlacing ? "bg-blue-200 text-blue-700" : "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/20"}`}>
                    {isPlacing ? "Cancelar" : placed ? "Mover" : "📍 Posicionar"}
                  </button>
                  {placed && !isPlacing && (
                    <button onClick={() => onClearTowerPosition(t.id)}
                      className="rounded px-1 py-0.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50"
                      title="Remover do terreno">✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar: pincéis + sol + salvar */}
      <div className="flex items-start gap-4 flex-wrap">
        {/* Pincéis */}
        {!placingTower && (
          <div className="flex-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-[var(--shell-subtext)] mr-1">Pincel:</span>
            {Object.entries(CELL_COLORS).filter(([k]) => k !== "UNIT").map(([type, cfg]) => (
              <button key={type} type="button" onClick={() => setBrushType(type)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors
                  ${brushType === type ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold" : "border-[var(--shell-card-border)] hover:bg-[var(--shell-hover)]"}`}>
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        )}

        {/* Sol arrastável */}
        <SunCompass value={sun} onChange={handleSunChange} />

        {/* Salvar */}
        <div className="flex items-end pb-2">
          <button type="button" onClick={handleSave} disabled={saving || saved}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
              ${saved ? "border border-green-300 bg-green-50 text-green-600" : "bg-[var(--brand-accent)] text-white hover:opacity-90"} disabled:opacity-60`}>
            {saving ? "Salvando..." : saved ? "✓ Salvo" : "Salvar terreno"}
          </button>
        </div>
      </div>

      {/* Grade centralizada */}
      <div className="flex justify-center overflow-auto">
        <div className="inline-flex flex-col" style={{ gap: 0 }}>

          {/* ── N (topo) ── */}
          <div className="flex justify-center py-1">
            <span className="text-[11px] font-bold text-slate-400">N</span>
          </div>

          <div className="flex items-stretch" style={{ gap: 0 }}>
            {/* ── O (esquerda) ── */}
            <div className="flex items-center justify-center pr-2">
              <span className="text-[11px] font-bold text-slate-400" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>O</span>
            </div>

            {/* Bloco central: controles cols (topo) + linhas */}
            <div className="flex flex-col" style={{ gap: 0 }}>

              {/* Controles de colunas — TOPO */}
              {!placingTower && (
                <div className="flex" style={{ gap: 1, marginBottom: 2 }}>
                  {/* espaço do controle de linhas à esquerda */}
                  <div style={{ width: 44 }} />
                  {/* +/- por coluna */}
                  {Array.from({ length: cols }, (_, col) => (
                    <div key={col} className="flex flex-col items-center gap-0.5" style={{ width: CW }}>
                      <BtnPlusMinus onClick={() => addCol(col)}    label={`+ col ${col + 1}`} />
                      <BtnMinus     onClick={() => removeCol(col)} label={`− col ${col + 1}`} />
                    </div>
                  ))}
                  {/* + adicionar coluna no final */}
                  <div className="flex items-start justify-center" style={{ width: CW }}>
                    <BtnPlusMinus onClick={() => addCol(cols)} label="+ col fim" />
                  </div>
                </div>
              )}

              {/* Linhas com controles à esquerda */}
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center" style={{ gap: 1, marginBottom: 1 }}>

                  {/* Controles de linha — ESQUERDA */}
                  {!placingTower ? (
                    <div className="flex items-center gap-0.5" style={{ width: 44 }}>
                      <BtnPlusMinus onClick={() => addRow(row)}    label={`+ lin ${row + 1}`} />
                      <BtnMinus     onClick={() => removeRow(row)} label={`− lin ${row + 1}`} />
                    </div>
                  ) : (
                    <div style={{ width: 44 }} />
                  )}

                  {/* Células */}
                  <div className="flex" style={{ gap: 1 }}
                    onMouseLeave={() => { setPainting(false); setHoverCell(null); }}>
                    {Array.from({ length: cols }, (_, col) => {
                      const key      = `${row}-${col}`;
                      const cellType = layout[key] ?? "UNIT";
                      const tower    = towerMap[key];
                      const cfg      = CELL_COLORS[cellType];
                      const inPrev   = previewCells.has(key);
                      const isAnchor = inPrev && hoverCell?.row === row && hoverCell?.col === col;

                      let bg    = tower ? "#1e3a5f" : cfg?.bg;
                      let bord  = tower ? "#3b82f6" : "rgba(0,0,0,0.1)";
                      if (inPrev) { bg = previewConflict ? "#dc2626" : "#2563eb"; bord = previewConflict ? "#b91c1c" : "#1d4ed8"; }

                      return (
                        <div key={key}
                          className={`flex items-center justify-center text-sm select-none rounded border transition-colors
                            ${placingTower ? (!previewConflict ? "cursor-crosshair" : "cursor-not-allowed") : "cursor-pointer"}`}
                          style={{ width: CW, height: CW, backgroundColor: bg, borderColor: bord }}
                          onMouseEnter={() => { if (placingTower) { setHoverCell({ row, col }); return; } if (painting) paintCell(row, col); }}
                          onMouseDown={() => { if (!placingTower) { setPainting(true); paintCell(row, col); } }}
                          onMouseUp={() => setPainting(false)}
                          onClick={async () => {
                            if (placingTowerId) {
                              if (previewConflict || !hoverCell) return;
                              await onPlaceTower(placingTowerId, hoverCell.col, hoverCell.row, placingW, placingH);
                              cancelPlacing(); return;
                            }
                            if (tower) onSelectTower(tower);
                          }}>
                          {isAnchor
                            ? <span className="text-[9px] font-bold text-white text-center leading-tight px-0.5">{placingTower?.nome}</span>
                            : tower
                              ? <span className="text-[9px] font-bold text-white text-center leading-tight px-0.5">{tower.nome}</span>
                              : <span>{cfg?.emoji}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* + adicionar linha no final */}
              {!placingTower && (
                <div className="flex items-center" style={{ gap: 1, marginTop: 2 }}>
                  <div className="flex items-center justify-center" style={{ width: 44 }}>
                    <BtnPlusMinus onClick={() => addRow(rows)} label="+ lin fim" />
                  </div>
                </div>
              )}

            </div>

            {/* ── L (direita) ── */}
            <div className="flex items-center justify-center pl-2">
              <span className="text-[11px] font-bold text-slate-400" style={{ writingMode: "vertical-lr" }}>L</span>
            </div>
          </div>

          {/* ── S (rodapé) ── */}
          <div className="flex justify-center py-1">
            <span className="text-[11px] font-bold text-slate-400">S</span>
          </div>

        </div>
      </div>

      <p className="text-xs text-center text-[var(--shell-subtext)]">
        {placingTower
          ? `${placingW}×${placingH} células · hover = preview · clique = confirma · ESC cancela`
          : "Pintar: clique e arraste · Controles de linha/coluna: esquerda e topo · Sol: arraste ☀️"}
      </p>
    </div>
  );
}

// ─── BuildingFacade ───────────────────────────────────────────────────────────

function BuildingFacade({ tower, onSelectUnit }: { tower: Tower; onSelectUnit: (u: DevelopmentUnit) => void }) {
  const [tooltip, setTooltip] = useState<{ unit: DevelopmentUnit; x: number; y: number } | null>(null);

  const unitsByFloor: Record<number, DevelopmentUnit[]> = {};
  for (const u of tower.units) {
    const f = u.andar ?? 1;
    if (!unitsByFloor[f]) unitsByFloor[f] = [];
    unitsByFloor[f].push(u);
  }
  const floors = Object.keys(unitsByFloor).map(Number).sort((a, b) => b - a);

  if (tower.units.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--shell-subtext)]">
        <p className="text-sm">Nenhuma unidade cadastrada nesta torre.</p>
        <p className="text-xs mt-1">Use o botão "Gerar Unidades" para criar.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-1 overflow-x-auto p-2">
      {floors.map((floor) => (
        <div key={floor} className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-right text-[10px] font-medium text-[var(--shell-subtext)]">{floor}º</span>
          <div className="flex gap-1">
            {(unitsByFloor[floor] ?? []).map((unit) => (
              <button key={unit.id} type="button"
                onMouseEnter={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTooltip({ unit, x: r.right, y: r.top });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onSelectUnit(unit)}
                className="relative flex flex-col items-center justify-center rounded border text-center transition-all hover:scale-110 hover:z-10"
                style={{
                  width: "3rem", height: "2.5rem",
                  backgroundColor: STATUS_COLOR[unit.status] + "33",
                  borderColor: STATUS_COLOR[unit.status],
                  borderWidth: "2px",
                }}>
                {/* Window effect */}
                <div className="grid grid-cols-2 gap-0.5 w-5 h-3 mb-0.5">
                  {[0,1,2,3].map((i) => (
                    <div key={i} className="rounded-sm" style={{ backgroundColor: STATUS_COLOR[unit.status] + "99" }} />
                  ))}
                </div>
                <span className="text-[8px] font-bold leading-none" style={{ color: STATUS_COLOR[unit.status] }}>
                  {unit.nome.replace(/\D/g, "").slice(-3)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* Telhado / cobertura */}
      <div className="flex items-end gap-1 pl-9 mt-1">
        {Array.from({ length: Math.max(...floors.map((f) => (unitsByFloor[f] ?? []).length)) }, (_, i) => (
          <div key={i} className="w-12 h-1.5 bg-slate-600 rounded-sm" />
        ))}
      </div>

      {tooltip && <UnitTooltip unit={tooltip.unit} x={tooltip.x} y={tooltip.y} />}

      {/* Legenda */}
      <div className="flex items-center gap-3 mt-3 text-xs text-[var(--shell-subtext)]">
        {(Object.keys(STATUS_COLOR) as UnitStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm border-2" style={{ backgroundColor: STATUS_COLOR[s] + "33", borderColor: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── PriceTable ───────────────────────────────────────────────────────────────

const inpSm = "w-full rounded border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-1.5 py-1 text-xs text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] text-right";

function fmtCur(v: number | null | undefined) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function parsePt(v: string): number | null {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function PriceTable({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, Partial<DevelopmentUnit>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkTower, setBulkTower] = useState<string | null>(null);
  const [bulkFloor, setBulkFloor] = useState<string>("all");
  const [bulkFields, setBulkFields] = useState({ areaM2: "", quartos: "", suites: "", banheiros: "", vagas: "", valorVenda: "", valorAvaliado: "" });
  const [applyingBulk, setApplyingBulk] = useState(false);

  function setField(unitId: string, field: keyof DevelopmentUnit, val: string) {
    const num = parsePt(val);
    setEdits((p) => ({ ...p, [unitId]: { ...p[unitId], [field]: num } }));
  }

  async function saveUnit(devId: string, unitId: string) {
    const e = edits[unitId];
    if (!e || Object.keys(e).length === 0) return;
    setSaving(unitId);
    try {
      await updateUnit(devId, unitId, e);
      setEdits((p) => { const n = { ...p }; delete n[unitId]; return n; });
      onSaved();
    } finally { setSaving(null); }
  }

  async function applyBulk() {
    if (!bulkTower) return;
    setApplyingBulk(true);
    const updates: any = {};
    if (bulkFields.areaM2)      updates.areaM2      = parsePt(bulkFields.areaM2);
    if (bulkFields.quartos)     updates.quartos     = parseInt(bulkFields.quartos);
    if (bulkFields.suites)      updates.suites      = parseInt(bulkFields.suites);
    if (bulkFields.banheiros)   updates.banheiros   = parseInt(bulkFields.banheiros);
    if (bulkFields.vagas)       updates.vagas       = parseInt(bulkFields.vagas);
    if (bulkFields.valorVenda)  updates.valorVenda  = parsePt(bulkFields.valorVenda);
    if (bulkFields.valorAvaliado) updates.valorAvaliado = parsePt(bulkFields.valorAvaliado);
    if (Object.keys(updates).length === 0) { setApplyingBulk(false); return; }
    try {
      await bulkUpdateUnits(dev.id, bulkTower, {
        ...(bulkFloor !== "all" ? { andar: parseInt(bulkFloor) } : {}),
        updates,
      });
      setBulkFields({ areaM2: "", quartos: "", suites: "", banheiros: "", vagas: "", valorVenda: "", valorAvaliado: "" });
      setBulkTower(null);
      onSaved();
    } finally { setApplyingBulk(false); }
  }

  return (
    <div className="space-y-5">
      {/* Painel preenchimento em massa */}
      <div className="rounded-xl border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/5 p-4 space-y-3">
        <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Preencher em massa</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--shell-subtext)]">Torre</label>
            <select value={bulkTower ?? ""} onChange={(e) => setBulkTower(e.target.value || null)}
              className="rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1.5 text-xs text-[var(--shell-text)]">
              <option value="">Selecione</option>
              {dev.towers.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          {bulkTower && (
            <div className="space-y-1">
              <label className="text-[10px] text-[var(--shell-subtext)]">Andar</label>
              <select value={bulkFloor} onChange={(e) => setBulkFloor(e.target.value)}
                className="rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1.5 text-xs text-[var(--shell-text)]">
                <option value="all">Todos</option>
                {Array.from({ length: dev.towers.find((t) => t.id === bulkTower)?.floors ?? 0 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}º andar</option>
                ))}
              </select>
            </div>
          )}
          {(["areaM2", "quartos", "suites", "banheiros", "vagas", "valorVenda", "valorAvaliado"] as const).map((f) => (
            <div key={f} className="space-y-1">
              <label className="text-[10px] text-[var(--shell-subtext)] whitespace-nowrap">
                {f === "areaM2" ? "Área m²" : f === "valorVenda" ? "Vl. Venda" : f === "valorAvaliado" ? "Vl. Avaliado" : f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
              <input value={bulkFields[f]} onChange={(e) => setBulkFields((p) => ({ ...p, [f]: e.target.value }))}
                placeholder="—" className="w-20 rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1.5 text-xs text-right text-[var(--shell-text)]" />
            </div>
          ))}
          <button onClick={applyBulk} disabled={!bulkTower || applyingBulk}
            className="rounded-lg bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {applyingBulk ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      </div>

      {/* Tabela por torre */}
      {dev.towers.map((tower) => (
        <div key={tower.id} className="space-y-2">
          <p className="text-sm font-semibold text-[var(--shell-text)]">{tower.nome}</p>
          <div className="overflow-x-auto rounded-xl border border-[var(--shell-card-border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--shell-card-border)] bg-[var(--shell-bg)]">
                  {["Unidade", "Andar", "Status", "Área m²", "Quartos", "Suítes", "Banheiros", "Vagas", "Vl. Venda", "Vl. Avaliado", ""].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-semibold text-[var(--shell-subtext)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tower.units.map((unit) => {
                  const e = edits[unit.id] ?? {};
                  const dirty = Object.keys(e).length > 0;
                  return (
                    <tr key={unit.id} className={`border-b border-[var(--shell-card-border)] last:border-0 ${dirty ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}`}>
                      <td className="px-2 py-1.5 font-medium text-[var(--shell-text)] whitespace-nowrap">{unit.nome}</td>
                      <td className="px-2 py-1.5 text-[var(--shell-subtext)] text-center">{unit.andar ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: STATUS_COLOR[unit.status] + "22", color: STATUS_COLOR[unit.status] }}>
                          {STATUS_LABEL[unit.status]}
                        </span>
                      </td>
                      {(["areaM2", "quartos", "suites", "banheiros", "vagas"] as const).map((f) => (
                        <td key={f} className="px-2 py-1 min-w-[60px]">
                          <input defaultValue={unit[f] ?? ""} onBlur={(e) => setField(unit.id, f, e.target.value)}
                            className={inpSm} />
                        </td>
                      ))}
                      {(["valorVenda", "valorAvaliado"] as const).map((f) => (
                        <td key={f} className="px-2 py-1 min-w-[90px]">
                          <input defaultValue={unit[f] ?? ""} onBlur={(e) => setField(unit.id, f, e.target.value)}
                            className={inpSm} />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        {dirty && (
                          <button onClick={() => saveUnit(dev.id, unit.id)} disabled={saving === unit.id}
                            className="rounded bg-[var(--brand-accent)] px-2 py-0.5 text-[10px] font-semibold text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                            {saving === unit.id ? "..." : "Salvar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PaymentConditionForm ─────────────────────────────────────────────────────

function PaymentConditionForm({ devId, initial, onSaved }: {
  devId: string;
  initial: PaymentCondition | null | undefined;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    aceitaFinanciamento:     initial?.aceitaFinanciamento ?? true,
    valorAto:                String(initial?.valorAto ?? ""),
    entradaPercentual:       String(initial?.entradaPercentual ?? ""),
    entradaParcelas:         String(initial?.entradaParcelas ?? ""),
    descontoAVista:          String(initial?.descontoAVista ?? ""),
    financiamentoBase:       initial?.financiamentoBase ?? "AVALIADO",
    financiamentoPercentual: String(initial?.financiamentoPercentual ?? ""),
    proSoluto:               initial?.proSoluto ?? false,
    proSolutoPercentual:     String(initial?.proSolutoPercentual ?? ""),
    proSolutoParcelas:       String(initial?.proSolutoParcelas ?? ""),
    obs:                     initial?.obs ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(k: string, v: any) { setForm((p) => ({ ...p, [k]: v })); setSaved(false); }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertPaymentCondition(devId, {
        aceitaFinanciamento:     form.aceitaFinanciamento,
        valorAto:                form.valorAto ? parseFloat(form.valorAto) : null,
        entradaPercentual:       form.entradaPercentual ? parseFloat(form.entradaPercentual) : null,
        entradaParcelas:         form.entradaParcelas ? parseInt(form.entradaParcelas) : null,
        descontoAVista:          form.descontoAVista ? parseFloat(form.descontoAVista) : null,
        financiamentoBase:       form.financiamentoBase as any,
        financiamentoPercentual: form.financiamentoPercentual ? parseFloat(form.financiamentoPercentual) : null,
        proSoluto:               form.proSoluto,
        proSolutoPercentual:     form.proSolutoPercentual ? parseFloat(form.proSolutoPercentual) : null,
        proSolutoParcelas:       form.proSolutoParcelas ? parseInt(form.proSolutoParcelas) : null,
        obs:                     form.obs || null,
      });
      setSaved(true);
      onSaved();
    } finally { setSaving(false); }
  }

  const inpPc = "rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] w-full";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Aceita financiamento bancário */}
        <label className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] p-3 cursor-pointer">
          <input type="checkbox" checked={form.aceitaFinanciamento} onChange={(e) => set("aceitaFinanciamento", e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--brand-accent)]" />
          <span className="text-sm font-medium text-[var(--shell-text)]">Aceita financiamento bancário</span>
        </label>

        {/* Pro-soluto */}
        <label className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] p-3 cursor-pointer">
          <input type="checkbox" checked={form.proSoluto} onChange={(e) => set("proSoluto", e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--brand-accent)]" />
          <span className="text-sm font-medium text-[var(--shell-text)]">Tem pro-soluto</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Valor de ato */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Valor de Ato (R$)</label>
          <input value={form.valorAto} onChange={(e) => set("valorAto", e.target.value)} placeholder="Ex.: 5000" className={inpPc} />
        </div>
        {/* Desconto à vista */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Desconto à Vista (%)</label>
          <input value={form.descontoAVista} onChange={(e) => set("descontoAVista", e.target.value)} placeholder="Ex.: 5" className={inpPc} />
        </div>
        {/* Prazo entrega */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Observações Gerais</label>
          <input value={form.obs} onChange={(e) => set("obs", e.target.value)} placeholder="Obs. adicionais" className={inpPc} />
        </div>
      </div>

      {/* Entrada */}
      <div className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
        <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Entrada Parcelada</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">% da entrada sobre valor de venda</label>
            <input value={form.entradaPercentual} onChange={(e) => set("entradaPercentual", e.target.value)}
              placeholder="Ex.: 20" className={inpPc} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">Nº de parcelas até entrega das chaves</label>
            <input value={form.entradaParcelas} onChange={(e) => set("entradaParcelas", e.target.value)}
              placeholder="Ex.: 24" className={inpPc} />
          </div>
        </div>
      </div>

      {/* Financiamento */}
      {form.aceitaFinanciamento && (
        <div className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Financiamento Bancário</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">Base de cálculo</label>
              <select value={form.financiamentoBase} onChange={(e) => set("financiamentoBase", e.target.value)}
                className={inpPc}>
                <option value="AVALIADO">Valor Avaliado</option>
                <option value="VENDA">Valor de Venda</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">% sobre a base para financiar</label>
              <input value={form.financiamentoPercentual} onChange={(e) => set("financiamentoPercentual", e.target.value)}
                placeholder="Ex.: 80" className={inpPc} />
            </div>
          </div>
        </div>
      )}

      {/* Pro-soluto */}
      {form.proSoluto && (
        <div className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Pro-soluto (Financiamento Direto Pós-Entrega)</p>
          <p className="text-xs text-[var(--shell-subtext)]">Parcelas pagas diretamente à incorporadora após entrega das chaves — % sobre o valor de venda.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">% sobre valor de venda (ex.: 3–5%)</label>
              <input value={form.proSolutoPercentual} onChange={(e) => set("proSolutoPercentual", e.target.value)}
                placeholder="Ex.: 4" className={inpPc} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">Nº de parcelas do pro-soluto</label>
              <input value={form.proSolutoParcelas} onChange={(e) => set("proSolutoParcelas", e.target.value)}
                placeholder="Ex.: 12" className={inpPc} />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors ${saved ? "border border-green-300 bg-green-50 text-green-600" : "bg-[var(--brand-accent)] text-white hover:opacity-90"} disabled:opacity-60`}>
          {saving ? "Salvando..." : saved ? "✓ Salvo" : "Salvar Condições"}
        </button>
      </div>
    </div>
  );
}

// ─── DashboardView ────────────────────────────────────────────────────────────

function DashboardView({ dashboard, dev }: { dashboard: Dashboard; dev: Development }) {
  const vgvCards = [
    { label: "VGV Total",       value: dashboard.vgvTotal,      color: "text-[var(--shell-text)]" },
    { label: "VGV Vendido",     value: dashboard.vgvVendido,    color: "text-red-600" },
    { label: "VGV Reservado",   value: dashboard.vgvReservado,  color: "text-yellow-600" },
    { label: "VGV a Vender",    value: dashboard.vgvDisponivel, color: "text-green-600" },
  ];

  const statusCards = [
    { label: "Total",       value: dashboard.total,      color: "#6b7280" },
    { label: "Disponível",  value: dashboard.disponivel, color: STATUS_COLOR.DISPONIVEL },
    { label: "Reservado",   value: dashboard.reservado,  color: STATUS_COLOR.RESERVADO },
    { label: "Vendido",     value: dashboard.vendido,    color: STATUS_COLOR.VENDIDO },
    { label: "Bloqueado",   value: dashboard.bloqueado,  color: STATUS_COLOR.BLOQUEADO },
  ];

  const chartData = dashboard.monthly.map((m) => ({
    name: m.mes.slice(5),
    vendas: m.vendas,
    vgv: Math.round(m.vgv / 1000),
  }));

  return (
    <div className="space-y-6">
      {/* VSO e % vendido */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5 px-5 py-3 text-center">
          <p className="text-3xl font-bold text-[var(--brand-accent)]">{dashboard.percentualVendido}%</p>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Vendido</p>
        </div>
        <div className="rounded-xl border border-slate-300 px-5 py-3 text-center">
          <p className="text-3xl font-bold text-slate-700 dark:text-slate-300">{dashboard.vso}%</p>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">VSO (vendido + reservado)</p>
        </div>
        {dev.prazoEntrega && (
          <div className="rounded-xl border border-slate-300 px-5 py-3 text-center">
            <p className="text-lg font-bold text-[var(--shell-text)]">{new Date(dev.prazoEntrega).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Previsão entrega</p>
          </div>
        )}
      </div>

      {/* Unidades por status */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {statusCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-4 py-3 text-center">
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* VGV */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {vgvCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-4 py-3">
            <p className={`text-lg font-bold truncate ${c.color}`}>{fmtCur(c.value)}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico mensal de vendas */}
      <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
        <p className="text-sm font-semibold text-[var(--shell-text)] mb-4">Vendas mensais — últimos 12 meses</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-card-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--shell-subtext)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--shell-subtext)" allowDecimals={false} />
            <RechartsTooltip
              formatter={(value: any, name: any) =>
                name === "vgv" ? [`R$ ${value}k`, "VGV (R$k)"] : [value, "Unidades vendidas"]
              }
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="vendas" fill={STATUS_COLOR.VENDIDO} radius={[4, 4, 0, 0]} name="vendas" />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-[var(--shell-subtext)] mt-2">* Unidades marcadas como Vendido no mês</p>
      </div>

      {/* Resumo por torre */}
      {dev.towers.length > 0 && (
        <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
          <p className="text-sm font-semibold text-[var(--shell-text)] mb-3">Resumo por torre</p>
          <div className="space-y-2">
            {dev.towers.map((t) => {
              const total  = t.units.length;
              const vend   = t.units.filter((u) => u.status === "VENDIDO").length;
              const res    = t.units.filter((u) => u.status === "RESERVADO").length;
              const disp   = t.units.filter((u) => u.status === "DISPONIVEL").length;
              const pct    = total > 0 ? Math.round((vend / total) * 100) : 0;
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-20 text-xs font-medium text-[var(--shell-text)] truncate">{t.nome}</span>
                  <div className="flex-1 h-4 rounded-full bg-[var(--shell-bg)] overflow-hidden flex">
                    <div style={{ width: `${pct}%`, backgroundColor: STATUS_COLOR.VENDIDO }} />
                    <div style={{ width: `${total > 0 ? Math.round((res / total) * 100) : 0}%`, backgroundColor: STATUS_COLOR.RESERVADO }} />
                    <div style={{ width: `${total > 0 ? Math.round((disp / total) * 100) : 0}%`, backgroundColor: STATUS_COLOR.DISPONIVEL + "55" }} />
                  </div>
                  <span className="text-xs text-[var(--shell-subtext)] whitespace-nowrap">{vend}/{total} vendidas</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)]";

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--shell-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmpreendimentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [dev, setDev] = useState<Development | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab]   = useState<"terreno" | "fachada" | "precos" | "dashboard">("terreno");
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedUnit,  setSelectedUnit]  = useState<DevelopmentUnit | null>(null);

  // Tower modal
  const [showTowerModal, setShowTowerModal] = useState(false);
  const [towerNome,   setTowerNome]   = useState("");
  const [towerFloors, setTowerFloors] = useState("10");
  const [towerUPF,    setTowerUPF]    = useState("4");
  const [towerPrefix, setTowerPrefix] = useState("Apto");
  const [savingTower, setSavingTower] = useState(false);

  // Unit status modal
  const [showUnitModal,        setShowUnitModal]        = useState(false);
  const [unitStatus,           setUnitStatus]           = useState<UnitStatus>("DISPONIVEL");
  const [unitBloqueioMotivo,   setUnitBloqueioMotivo]   = useState("");
  const [savingUnit,           setSavingUnit]           = useState(false);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [d, dash] = await Promise.all([getDevelopment(id), getDashboard(id)]);
      setDev(d);
      setDashboard(dash);
      if (d.towers.length > 0 && !selectedTower) setSelectedTower(d.towers[0]);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (dev && selectedTower) {
      const updated = dev.towers.find((t) => t.id === selectedTower.id);
      if (updated) setSelectedTower(updated);
    }
  }, [dev]);

  async function handleSaveLayout(layout: any[], rows: number, cols: number, sun: string) {
    await updateDevelopment(id, { gridLayout: layout, gridRows: rows, gridCols: cols, sunOrientation: sun } as any);
    await load();
  }

  async function handleCreateTowerWithUnits() {
    if (!towerNome.trim()) return;
    setSavingTower(true);
    try {
      const t = await createTower(id, {
        nome: towerNome.trim(),
        floors: parseInt(towerFloors),
        unitsPerFloor: parseInt(towerUPF),
      });
      await bulkCreateUnits(id, t.id, {
        floors: parseInt(towerFloors),
        unitsPerFloor: parseInt(towerUPF),
        prefix: towerPrefix,
      });
      setShowTowerModal(false);
      setTowerNome(""); setTowerFloors("10"); setTowerUPF("4");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar torre");
    } finally {
      setSavingTower(false);
    }
  }

  async function handleUpdateUnitStatus() {
    if (!selectedUnit || !dev) return;
    if (unitStatus === "BLOQUEADO" && !unitBloqueioMotivo.trim()) return;
    setSavingUnit(true);
    try {
      await updateUnit(id, selectedUnit.id, {
        status: unitStatus,
        bloqueioMotivo: unitStatus === "BLOQUEADO" ? unitBloqueioMotivo.trim() : null,
      });
      setShowUnitModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao atualizar unidade");
    } finally {
      setSavingUnit(false);
    }
  }

  function openUnitModal(unit: DevelopmentUnit) {
    setSelectedUnit(unit);
    setUnitStatus(unit.status);
    setUnitBloqueioMotivo(unit.bloqueioMotivo ?? "");
    setShowUnitModal(true);
  }

  if (loading) return <AppShell title="Empreendimento"><div className="flex items-center justify-center h-64 text-sm text-[var(--shell-subtext)]">Carregando...</div></AppShell>;
  if (!dev) return <AppShell title="Empreendimento"><div className="flex items-center justify-center h-64 text-sm text-red-500">{error ?? "Empreendimento não encontrado"}</div></AppShell>;

  const isVertical = dev.tipo === "VERTICAL";

  const TABS = [
    { key: "terreno",   label: "🗺️ Terreno" },
    { key: "fachada",   label: "🏢 Fachada" },
    { key: "precos",    label: "💰 Preços" },
    { key: "dashboard", label: "📊 Dashboard" },
  ] as const;

  return (
    <AppShell title={dev.nome}>
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => router.back()} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] mb-1">← Empreendimentos</button>
            <h1 className="text-xl font-bold text-[var(--shell-text)]">{dev.nome}</h1>
            <p className="text-sm text-[var(--shell-subtext)]">{dev.cidade}{dev.cidade && dev.estado ? ` / ${dev.estado}` : dev.estado}</p>
          </div>
          <div className="flex items-center gap-2">
            {(tab === "terreno" || tab === "fachada") && (
              <button onClick={() => setShowTowerModal(true)}
                className="rounded-xl bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                + {isVertical ? "Nova Torre" : "Nova Quadra"}
              </button>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--shell-card-border)]">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-[var(--brand-accent)] text-[var(--brand-accent)]" : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Terreno ── */}
        {tab === "terreno" && (
          <div className="flex gap-5 items-start">
            {dev.towers.length > 0 && (
              <div className="w-44 shrink-0 space-y-2">
                <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide px-1">
                  {isVertical ? "Torres" : "Quadras"}
                </p>
                {dev.towers.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => { setSelectedTower(t); setTab("fachada"); }}
                    className="w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
                    <p className="font-medium">{t.nome}</p>
                    <p className="text-[11px] text-[var(--shell-subtext)]">{t.units.length} unid. · {t.floors} and.</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0 rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
              <TerrainGrid dev={dev}
                onSelectTower={(t) => { setSelectedTower(t); setTab("fachada"); }}
                onSave={handleSaveLayout}
                onSunChange={(sun) => setDev((d) => d ? { ...d, sunOrientation: sun } : d)}
                onPlaceTower={async (towerId, col, row, w, h) => {
                  await updateTower(id, towerId, { gridX: col, gridY: row, gridWidth: w, gridHeight: h });
                  await load();
                }}
                onClearTowerPosition={async (towerId) => {
                  await updateTower(id, towerId, { gridX: null, gridY: null });
                  await load();
                }} />
            </div>
          </div>
        )}

        {/* ── Fachada ── */}
        {tab === "fachada" && (
          <div className="flex gap-5 items-start">
            {dev.towers.length > 0 && (
              <div className="w-44 shrink-0 space-y-2">
                <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide px-1">
                  {isVertical ? "Torres" : "Quadras"}
                </p>
                {dev.towers.map((t) => (
                  <button key={t.id} type="button" onClick={() => setSelectedTower(t)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${selectedTower?.id === t.id ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold text-[var(--brand-accent)]" : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]"}`}>
                    <p className="font-medium">{t.nome}</p>
                    <p className="text-[11px] text-[var(--shell-subtext)]">{t.units.length} unid. · {t.floors} and.</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0 rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
              {selectedTower
                ? <BuildingFacade tower={selectedTower} onSelectUnit={openUnitModal} />
                : <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Selecione uma torre para ver a fachada</div>
              }
            </div>
          </div>
        )}

        {/* ── Preços ── */}
        {tab === "precos" && (
          <div className="space-y-8">
            <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6">
              <h2 className="text-base font-semibold text-[var(--shell-text)] mb-5">Tabela de Preços</h2>
              <PriceTable dev={dev} onSaved={load} />
            </div>
            <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6">
              <h2 className="text-base font-semibold text-[var(--shell-text)] mb-1">Condições de Pagamento</h2>
              <p className="text-xs text-[var(--shell-subtext)] mb-5">Definições comerciais aplicáveis a todas as unidades deste empreendimento.</p>
              <PaymentConditionForm devId={id} initial={dev.paymentCondition} onSaved={load} />
            </div>
          </div>
        )}

        {/* ── Dashboard ── */}
        {tab === "dashboard" && dashboard && (
          <DashboardView dashboard={dashboard} dev={dev} />
        )}
        {tab === "dashboard" && !dashboard && (
          <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Carregando dashboard...</div>
        )}

      </div>

      {/* Modal: Nova Torre */}
      <Modal open={showTowerModal} onClose={() => setShowTowerModal(false)} title={`Nova ${isVertical ? "Torre" : "Quadra"}`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nome</label>
            <input value={towerNome} onChange={(e) => setTowerNome(e.target.value)} placeholder="Ex.: Torre A" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Andares</label>
              <input type="number" value={towerFloors} onChange={(e) => setTowerFloors(e.target.value)} min={1} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Unid. por andar</label>
              <input type="number" value={towerUPF} onChange={(e) => setTowerUPF(e.target.value)} min={1} className={inp} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Prefixo das unidades</label>
            <input value={towerPrefix} onChange={(e) => setTowerPrefix(e.target.value)} placeholder="Apto" className={inp} />
          </div>
          <p className="text-xs text-[var(--shell-subtext)]">
            Serão criadas {parseInt(towerFloors || "0") * parseInt(towerUPF || "0")} unidades automaticamente.
            Ex.: {towerPrefix}101, {towerPrefix}102...
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowTowerModal(false)}
              className="rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
              Cancelar
            </button>
            <button onClick={handleCreateTowerWithUnits} disabled={savingTower || !towerNome.trim()}
              className="rounded-lg bg-[var(--brand-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {savingTower ? "Criando..." : "Criar Torre"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Status da Unidade */}
      <Modal open={showUnitModal} onClose={() => setShowUnitModal(false)} title={selectedUnit?.nome ?? "Unidade"}>
        {selectedUnit && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-bg)] p-3 text-sm space-y-1">
              {selectedUnit.areaM2 && <p className="text-[var(--shell-subtext)]">Área: <span className="font-medium text-[var(--shell-text)]">{selectedUnit.areaM2} m²</span></p>}
              {selectedUnit.valorVenda && <p className="text-[var(--shell-subtext)]">Valor: <span className="font-medium text-[var(--shell-text)]">{fmt(selectedUnit.valorVenda)}</span></p>}
              {selectedUnit.quartos && <p className="text-[var(--shell-subtext)]">Quartos: <span className="font-medium text-[var(--shell-text)]">{selectedUnit.quartos}</span></p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_COLOR) as UnitStatus[]).map((s) => (
                  <button key={s} type="button" onClick={() => setUnitStatus(s)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${unitStatus === s ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold" : "border-[var(--shell-card-border)] hover:bg-[var(--shell-hover)]"}`}>
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {unitStatus === "BLOQUEADO" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Motivo do bloqueio *</label>
                <input value={unitBloqueioMotivo} onChange={(e) => setUnitBloqueioMotivo(e.target.value)}
                  placeholder="Informe o motivo..." className={inp} />
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowUnitModal(false)}
                className="rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
                Cancelar
              </button>
              <button onClick={handleUpdateUnitStatus} disabled={savingUnit || (unitStatus === "BLOQUEADO" && !unitBloqueioMotivo.trim())}
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {savingUnit ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
