"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, updateDevelopment, createTower, updateTower, deleteTower,
  bulkCreateUnits, updateUnit, getDashboard,
  type Development, type Tower, type DevelopmentUnit, type UnitStatus,
} from "@/lib/developments.service";

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

  const [view, setView] = useState<"terreno" | "fachada">("terreno");
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<DevelopmentUnit | null>(null);

  // Tower modal
  const [showTowerModal, setShowTowerModal] = useState(false);
  const [towerNome, setTowerNome] = useState("");
  const [towerFloors, setTowerFloors] = useState("10");
  const [towerUPF, setTowerUPF] = useState("4");
  const [towerPrefix, setTowerPrefix] = useState("Apto");
  const [savingTower, setSavingTower] = useState(false);

  // Unit status modal
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitStatus, setUnitStatus] = useState<UnitStatus>("DISPONIVEL");
  const [unitBloqueioMotivo, setUnitBloqueioMotivo] = useState("");
  const [savingUnit, setSavingUnit] = useState(false);

  const [dashboard, setDashboard] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [d, dash] = await Promise.all([getDevelopment(id), getDashboard(id)]);
      setDev(d);
      setDashboard(dash);
      if (d.towers.length > 0 && !selectedTower) {
        setSelectedTower(d.towers[0]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  // Sync selectedTower after reload
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

  async function handleCreateTower() {
    if (!towerNome.trim()) return;
    setSavingTower(true);
    try {
      await createTower(id, {
        nome: towerNome.trim(),
        floors: parseInt(towerFloors),
        unitsPerFloor: parseInt(towerUPF),
      });
      // Bulk create units
      const tower = dev?.towers.find((t) => t.nome === towerNome.trim());
      setShowTowerModal(false);
      setTowerNome(""); setTowerFloors("10"); setTowerUPF("4");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar torre");
    } finally {
      setSavingTower(false);
    }
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
          <button onClick={() => setShowTowerModal(true)}
            className="rounded-xl bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            + {isVertical ? "Nova Torre" : "Nova Quadra"}
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Dashboard strip */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total", value: dashboard.total, color: "text-[var(--shell-text)]" },
              { label: "Disponível", value: dashboard.disponivel, color: "text-green-600" },
              { label: "Reservado", value: dashboard.reservado, color: "text-yellow-600" },
              { label: "Vendido", value: dashboard.vendido, color: "text-red-600" },
              { label: "% Vendido", value: `${dashboard.percentualVendido}%`, color: "text-[var(--brand-accent)]" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-4 py-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-5 items-start">
          {/* Torres sidebar */}
          {dev.towers.length > 0 && (
            <div className="w-44 shrink-0 space-y-2">
              <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide px-1">
                {isVertical ? "Torres" : "Quadras"}
              </p>
              {dev.towers.map((t) => (
                <button key={t.id} type="button"
                  onClick={() => { setSelectedTower(t); setView("fachada"); }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${selectedTower?.id === t.id ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold text-[var(--brand-accent)]" : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]"}`}>
                  <p className="font-medium">{t.nome}</p>
                  <p className="text-[11px] text-[var(--shell-subtext)]">{t.units.length} unid. · {t.floors} and.</p>
                </button>
              ))}
            </div>
          )}

          {/* Main view */}
          <div className="flex-1 min-w-0">
            {/* View toggle */}
            <div className="flex items-center gap-2 mb-4">
              {(["terreno", "fachada"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  disabled={v === "fachada" && !selectedTower}
                  className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-40 ${view === v ? "bg-slate-900 text-white" : "border border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                  {v === "terreno" ? "🗺️ Terreno" : `🏢 Fachada${selectedTower ? ` — ${selectedTower.nome}` : ""}`}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
              {view === "terreno" ? (
                <TerrainGrid dev={dev} onSelectTower={(t) => { setSelectedTower(t); setView("fachada"); }} onSave={handleSaveLayout} onSunChange={(sun) => setDev((d) => d ? { ...d, sunOrientation: sun } : d)} />
              ) : selectedTower ? (
                <BuildingFacade tower={selectedTower} onSelectUnit={openUnitModal} />
              ) : (
                <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">
                  Selecione uma torre para ver a fachada
                </div>
              )}
            </div>
          </div>
        </div>
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
