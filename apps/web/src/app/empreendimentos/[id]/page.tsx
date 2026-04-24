"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, createTower, updateTower, deleteTower,
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
  UNIT:          { bg: "var(--shell-card-bg)", label: "Unidade",      emoji: "" },
  EMPTY:         { bg: "transparent",           label: "Vazio",        emoji: "" },
  VEGETATION:    { bg: "#bbf7d0",               label: "Vegetação",    emoji: "🌳" },
  PORTARIA:      { bg: "#bfdbfe",               label: "Portaria",     emoji: "🏪" },
  RUA:           { bg: "#d1d5db",               label: "Rua",          emoji: "🛣️" },
  CASA_MAQUINAS: { bg: "#fef9c3",               label: "Casa de Maq.", emoji: "⚙️" },
  CAIXA_DAGUA:   { bg: "#e0f2fe",               label: "Caixa d'água", emoji: "💧" },
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

function TerrainGrid({ dev, onSelectTower }: { dev: Development; onSelectTower: (t: Tower) => void }) {
  const [layout, setLayout] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (dev.gridLayout) {
      (dev.gridLayout as any[]).forEach((c: any) => { map[`${c.row}-${c.col}`] = c.type; });
    }
    return map;
  });
  const [brushType, setBrushType] = useState<string>("EMPTY");
  const [painting, setPainting] = useState(false);

  const towerMap: Record<string, Tower> = {};
  dev.towers.forEach((t) => { if (t.gridX != null && t.gridY != null) towerMap[`${t.gridY}-${t.gridX}`] = t; });

  function paintCell(row: number, col: number) {
    setLayout((prev) => ({ ...prev, [`${row}-${col}`]: brushType }));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[var(--shell-subtext)]">Pincel:</span>
        {Object.entries(CELL_COLORS).filter(([k]) => k !== "UNIT").map(([type, cfg]) => (
          <button key={type} type="button"
            onClick={() => setBrushType(type)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors ${brushType === type ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 font-semibold" : "border-[var(--shell-card-border)] hover:bg-[var(--shell-hover)]"}`}>
            {cfg.emoji} {cfg.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="relative inline-block p-8 border border-[var(--shell-card-border)] rounded-2xl bg-[var(--shell-bg)]">
        <SunIndicator orientation={dev.sunOrientation} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${dev.gridCols}, 2.5rem)`, gap: "3px" }}>
          {Array.from({ length: dev.gridRows }, (_, row) =>
            Array.from({ length: dev.gridCols }, (_, col) => {
              const key = `${row}-${col}`;
              const cellType = layout[key] ?? "UNIT";
              const tower = towerMap[key];
              const cfg = CELL_COLORS[cellType];

              return (
                <div key={key}
                  className="h-10 w-10 rounded flex items-center justify-center text-sm transition-all cursor-pointer select-none border"
                  style={{
                    backgroundColor: tower ? "#1e3a5f" : cfg?.bg,
                    borderColor: tower ? "#3b82f6" : "rgba(0,0,0,0.08)",
                  }}
                  onMouseDown={() => { setPainting(true); paintCell(row, col); }}
                  onMouseEnter={() => { if (painting) paintCell(row, col); }}
                  onMouseUp={() => setPainting(false)}
                  onClick={() => { if (tower) onSelectTower(tower); }}>
                  {tower ? (
                    <span className="text-[9px] font-bold text-white text-center leading-tight px-0.5">{tower.nome}</span>
                  ) : (
                    <span>{cfg?.emoji}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--shell-subtext)]">Clique e arraste para pintar células. Clique em uma torre para ver a fachada.</p>
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
                <TerrainGrid dev={dev} onSelectTower={(t) => { setSelectedTower(t); setView("fachada"); }} />
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
