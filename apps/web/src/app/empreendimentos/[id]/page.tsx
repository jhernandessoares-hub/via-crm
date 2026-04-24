"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, updateDevelopment, createTower, deleteTower,
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

const COMPASS: Record<string, { N: string; S: string; L: string; O: string }> = {
  NORTE:  { N: "☀️ Nascente", S: "Poente",    L: "Leste", O: "Oeste" },
  SUL:    { N: "Poente",     S: "☀️ Nascente", L: "Oeste", O: "Leste" },
  LESTE:  { N: "Norte",      S: "Sul",         L: "☀️ Nascente", O: "Poente" },
  OESTE:  { N: "Norte",      S: "Sul",         L: "Poente", O: "☀️ Nascente" },
};

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

function TerrainGrid({ dev, onSelectTower, onSave, onSunChange }: {
  dev: Development;
  onSelectTower: (t: Tower) => void;
  onSave: (layout: any[], rows: number, cols: number, sun: string) => Promise<void>;
  onSunChange: (sun: string) => void;
}) {
  const [layout, setLayout] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (dev.gridLayout) {
      (dev.gridLayout as any[]).forEach((c: any) => { map[`${c.row}-${c.col}`] = c.type; });
    }
    return map;
  });
  const [brushType, setBrushType] = useState<string>("EMPTY");
  const [painting, setPainting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [rows, setRows] = useState(dev.gridRows);
  const [cols, setCols] = useState(dev.gridCols);
  const [sun, setSun] = useState(dev.sunOrientation);

  const towerMap: Record<string, Tower> = {};
  dev.towers.forEach((t) => { if (t.gridX != null && t.gridY != null) towerMap[`${t.gridY}-${t.gridX}`] = t; });

  function mark() { setSaved(false); }

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
    setRows((r) => r + 1);
    mark();
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
    setRows((r) => r - 1);
    mark();
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
    setCols((c) => c + 1);
    mark();
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
    setCols((c) => c - 1);
    mark();
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

  const compass = COMPASS[sun] ?? COMPASS.LESTE;

  return (
    <div className="space-y-3">
      {/* Pincéis */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-[var(--shell-subtext)] mr-1">Pincel:</span>
        {Object.entries(CELL_COLORS).filter(([k]) => k !== "UNIT").map(([type, cfg]) => (
          <button key={type} type="button" onClick={() => setBrushType(type)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${brushType === type ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold" : "border-[var(--shell-card-border)] hover:bg-[var(--shell-hover)]"}`}>
            {cfg.emoji} {cfg.label}
          </button>
        ))}
      </div>

      {/* Segunda linha: orientação solar + salvar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--shell-subtext)]">☀️ Nascente:</span>
          <select value={sun} onChange={(e) => { setSun(e.target.value); onSunChange(e.target.value); mark(); }}
            className="rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1 text-xs text-[var(--shell-text)]">
            <option value="NORTE">Norte</option>
            <option value="SUL">Sul</option>
            <option value="LESTE">Leste</option>
            <option value="OESTE">Oeste</option>
          </select>
        </div>
        <div className="ml-auto">
          <button type="button" onClick={handleSave} disabled={saving || saved}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${saved ? "border border-green-300 bg-green-50 text-green-600" : "bg-[var(--brand-accent)] text-white hover:opacity-90"} disabled:opacity-60`}>
            {saving ? "Salvando..." : saved ? "✓ Salvo" : "Salvar terreno"}
          </button>
        </div>
      </div>

      {/* Grid com compass + +/- buttons */}
      <div className="overflow-auto">
        <div className="inline-flex flex-col items-center gap-1">
          {/* Norte */}
          <div className="flex items-center gap-1">
            <div className="w-6" />
            <span className="text-[11px] font-semibold text-slate-500 px-2">⬆ {compass.N}</span>
            <div className="w-6" />
          </div>

          <div className="flex items-start gap-1">
            {/* Oeste + controles linhas à esquerda */}
            <div className="flex flex-col items-center justify-center gap-1 w-6 self-stretch">
              <span className="text-[10px] font-semibold text-slate-500 [writing-mode:vertical-lr] rotate-180">⬅ {compass.O}</span>
            </div>

            {/* Área central: controles de linha + grid + controles de coluna */}
            <div className="flex flex-col gap-0.5">
              {/* Botões de coluna no topo */}
              <div className="flex gap-px pl-7">
                {Array.from({ length: cols }, (_, col) => (
                  <div key={col} className="flex flex-col items-center gap-0.5" style={{ width: "2.5rem" }}>
                    <BtnPlusMinus onClick={() => addCol(col)} label={`Inserir coluna antes da ${col + 1}`} />
                    {col === cols - 1 && (
                      <BtnPlusMinus onClick={() => addCol(cols)} label="Inserir coluna no final" />
                    )}
                  </div>
                ))}
              </div>

              {/* Linhas do grid */}
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-0.5">
                  {/* Controles da linha */}
                  <div className="flex flex-col gap-0.5 w-6 items-center">
                    <BtnPlusMinus onClick={() => addRow(row)} label={`Inserir linha acima da ${row + 1}`} />
                    <BtnMinus onClick={() => removeRow(row)} label={`Remover linha ${row + 1}`} />
                    {row === rows - 1 && <BtnPlusMinus onClick={() => addRow(rows)} label="Inserir linha abaixo" />}
                  </div>
                  {/* Células */}
                  <div className="flex gap-px"
                    onMouseLeave={() => setPainting(false)}>
                    {Array.from({ length: cols }, (_, col) => {
                      const key = `${row}-${col}`;
                      const cellType = layout[key] ?? "UNIT";
                      const tower = towerMap[key];
                      const cfg = CELL_COLORS[cellType];
                      return (
                        <div key={key}
                          className="h-10 w-10 rounded flex items-center justify-center text-sm cursor-pointer select-none border"
                          style={{
                            backgroundColor: tower ? "#1e3a5f" : cfg?.bg,
                            borderColor: tower ? "#3b82f6" : "rgba(0,0,0,0.1)",
                          }}
                          onMouseDown={() => { setPainting(true); paintCell(row, col); }}
                          onMouseEnter={() => { if (painting) paintCell(row, col); }}
                          onMouseUp={() => setPainting(false)}
                          onClick={() => { if (tower) onSelectTower(tower); }}>
                          {tower
                            ? <span className="text-[9px] font-bold text-white text-center leading-tight px-0.5">{tower.nome}</span>
                            : <span>{cfg?.emoji}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* − coluna direita */}
                  <BtnMinus onClick={() => removeCol(cols - 1)} label="Remover última coluna" />
                </div>
              ))}

              {/* − linha no rodapé */}
              <div className="flex gap-px pl-7">
                {Array.from({ length: cols }, (_, col) => (
                  <div key={col} className="flex items-center justify-center" style={{ width: "2.5rem" }}>
                    {col === 0 && <BtnMinus onClick={() => removeRow(rows - 1)} label="Remover última linha" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Leste */}
            <div className="flex flex-col items-center justify-center gap-1 w-6 self-stretch">
              <span className="text-[10px] font-semibold text-slate-500 [writing-mode:vertical-lr]">{compass.L} ➡</span>
            </div>
          </div>

          {/* Sul */}
          <div className="flex items-center gap-1">
            <div className="w-6" />
            <span className="text-[11px] font-semibold text-slate-500 px-2">⬇ {compass.S}</span>
            <div className="w-6" />
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--shell-subtext)]">
        Clique e arraste para pintar · + adiciona linha/coluna · − remove · Clique em uma torre (azul) para ver a fachada
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
                onSunChange={(sun) => setDev((d) => d ? { ...d, sunOrientation: sun } : d)} />
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
