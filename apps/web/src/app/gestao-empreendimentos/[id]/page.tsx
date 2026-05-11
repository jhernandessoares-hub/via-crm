"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, updateDevelopment, createTower, updateTower, deleteTower,
  bulkCreateUnits, updateUnit, getDashboard, getPaymentCondition, upsertPaymentCondition,
  uploadImplantacao,
  type Development, type Tower, type DevelopmentUnit, type UnitStatus,
  type PaymentCondition, type Dashboard,
} from "@/lib/developments.service";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Tab = "cadastro" | "espelho" | "precos" | "dashboard";

// ─── Constantes ──────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<UnitStatus, string> = {
  DISPONIVEL: "#22c55e",
  RESERVADO:  "#f59e0b",
  VENDIDO:    "#ef4444",
  BLOQUEADO:  "#9ca3af",
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  DISPONIVEL: "Disponível",
  RESERVADO:  "Reservado",
  VENDIDO:    "Vendido",
  BLOQUEADO:  "Bloqueado",
};

const STATUS_BG: Record<UnitStatus, string> = {
  DISPONIVEL: "bg-green-500",
  RESERVADO:  "bg-amber-400",
  VENDIDO:    "bg-red-500",
  BLOQUEADO:  "bg-gray-400",
};

const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] transition-colors";

function fmt(v: number | null | undefined) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// ─── Modal genérico ──────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} mx-4 rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[var(--shell-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal de Unidade ─────────────────────────────────────────────────────────

function UnitModal({ unit, devId, onClose, onUpdated }: {
  unit: DevelopmentUnit; devId: string; onClose: () => void; onUpdated: (u: DevelopmentUnit) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [comprador, setComprador] = useState(unit.comprador ?? "");
  const [finalPrice, setFinalPrice] = useState(String(unit.finalPrice ?? unit.valorVenda ?? ""));
  const [bloqueioMotivo, setBloqueioMotivo] = useState(unit.bloqueioMotivo ?? "");
  const [status, setStatus] = useState<UnitStatus>(unit.status);

  async function changeStatus(newStatus: UnitStatus) {
    if (newStatus === "VENDIDO" && !confirm(`Confirmar venda da unidade ${unit.nome}?`)) return;
    setSaving(true);
    try {
      const updated = await updateUnit(devId, unit.id, {
        status: newStatus,
        comprador: comprador || null,
        finalPrice: finalPrice ? parseFloat(finalPrice) : null,
        bloqueioMotivo: newStatus === "BLOQUEADO" ? bloqueioMotivo || null : null,
        soldAt: newStatus === "VENDIDO" ? new Date().toISOString() : null,
      } as any);
      setStatus(newStatus);
      onUpdated({ ...unit, ...updated });
    } finally { setSaving(false); }
  }

  const allActions: { label: string; status: UnitStatus; color: string }[] = [
    { label: "Disponível", status: "DISPONIVEL" as UnitStatus, color: "bg-green-500 hover:bg-green-600" },
    { label: "Reservar",   status: "RESERVADO"  as UnitStatus, color: "bg-amber-400 hover:bg-amber-500" },
    { label: "Vender",     status: "VENDIDO"    as UnitStatus, color: "bg-red-500 hover:bg-red-600" },
    { label: "Bloquear",   status: "BLOQUEADO"  as UnitStatus, color: "bg-gray-400 hover:bg-gray-500" },
  ];
  const actions = allActions.filter((a) => a.status !== status);

  return (
    <Modal open title={`Unidade — ${unit.nome}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Status atual */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white ${STATUS_BG[status]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* Dados da unidade */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {unit.andar && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Andar</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.andar}º</p>
            </div>
          )}
          {unit.areaM2 && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Área</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.areaM2} m²</p>
            </div>
          )}
          {unit.quartos && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Quartos</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.quartos}</p>
            </div>
          )}
          {unit.vagas && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Vagas</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.vagas}</p>
            </div>
          )}
          {unit.valorVenda && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Valor</p>
              <p className="font-semibold text-[var(--brand-accent)]">{fmt(unit.valorVenda)}</p>
            </div>
          )}
          {unit.loteNum && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Lote</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.loteNum}</p>
            </div>
          )}
          {unit.loteAreaM2 && (
            <div>
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Área do lote</p>
              <p className="font-semibold text-[var(--shell-text)]">{unit.loteAreaM2} m²</p>
            </div>
          )}
        </div>

        {/* Comprador / Preço final (para reserva/venda) */}
        {(status === "RESERVADO" || status === "VENDIDO" || actions.find(a => a.status === "RESERVADO" || a.status === "VENDIDO")) && (
          <div className="space-y-3 pt-2 border-t border-[var(--shell-card-border)]">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Comprador / Interessado</label>
              <input value={comprador} onChange={(e) => setComprador(e.target.value)} placeholder="Nome completo" className={inp} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Valor negociado (R$)</label>
              <input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={String(unit.valorVenda ?? "")} className={inp} />
            </div>
            {(status === "BLOQUEADO" || actions.find(a => a.status === "BLOQUEADO")) && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Motivo do bloqueio</label>
                <input value={bloqueioMotivo} onChange={(e) => setBloqueioMotivo(e.target.value)} placeholder="Ex: Pendência documental" className={inp} />
              </div>
            )}
          </div>
        )}

        {/* Botões de ação */}
        <div className="flex flex-wrap gap-2 pt-2">
          {actions.map((a) => (
            <button key={a.status} type="button" disabled={saving} onClick={() => changeStatus(a.status)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${a.color}`}>
              {saving ? "..." : a.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Espelho 2D ───────────────────────────────────────────────────────────────

function EspelhoVertical({ tower, devId, onUnitUpdated }: {
  tower: Tower; devId: string; onUnitUpdated: (u: DevelopmentUnit) => void;
}) {
  const [selectedUnit, setSelectedUnit] = useState<DevelopmentUnit | null>(null);

  const unitsByFloor: Record<number, DevelopmentUnit[]> = {};
  tower.units.forEach((u) => {
    const f = u.andar ?? 1;
    if (!unitsByFloor[f]) unitsByFloor[f] = [];
    unitsByFloor[f].push(u);
  });
  const floors = Object.keys(unitsByFloor).map(Number).sort((a, b) => b - a);

  return (
    <div className="overflow-auto">
      {floors.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Nenhuma unidade nesta torre</div>
      ) : (
        <div className="space-y-1.5 min-w-max">
          {floors.map((floor) => (
            <div key={floor} className="flex items-center gap-2">
              <span className="w-10 text-right text-xs font-bold text-[var(--shell-subtext)] shrink-0">{floor}º</span>
              <div className="flex gap-1.5">
                {(unitsByFloor[floor] ?? []).sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)).map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => setSelectedUnit(unit)}
                    title={`${unit.nome}\n${STATUS_LABEL[unit.status]}${unit.valorVenda ? `\n${fmt(unit.valorVenda)}` : ""}`}
                    className="relative w-16 h-10 rounded-lg border-2 text-[10px] font-bold text-white transition-all duration-150 hover:scale-110 hover:shadow-lg hover:z-10 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
                    style={{ backgroundColor: STATUS_COLOR[unit.status], borderColor: STATUS_COLOR[unit.status] }}
                  >
                    <span className="truncate px-0.5 leading-tight block">{unit.nome.replace(/^(Apto|Casa|Lote)\s*/i, "")}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedUnit && (
        <UnitModal
          unit={selectedUnit}
          devId={devId}
          onClose={() => setSelectedUnit(null)}
          onUpdated={(u) => { onUnitUpdated(u); setSelectedUnit(u); }}
        />
      )}
    </div>
  );
}

function EspelhoHorizontal({ tower, devId, onUnitUpdated, isLoteamento }: {
  tower: Tower; devId: string; onUnitUpdated: (u: DevelopmentUnit) => void; isLoteamento: boolean;
}) {
  const [selectedUnit, setSelectedUnit] = useState<DevelopmentUnit | null>(null);
  const units = [...tower.units].sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
  const cols = Math.ceil(Math.sqrt(units.length)) || 1;

  return (
    <div>
      <div
        className="inline-grid gap-2 p-4 rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            onClick={() => setSelectedUnit(unit)}
            title={`${unit.loteNum ?? unit.nome}\n${STATUS_LABEL[unit.status]}`}
            className="relative flex flex-col items-center justify-center rounded-xl border-2 w-20 h-16 transition-all duration-150 hover:scale-105 hover:shadow-lg hover:z-10 focus:outline-none"
            style={{ backgroundColor: STATUS_COLOR[unit.status] + "22", borderColor: STATUS_COLOR[unit.status] }}
          >
            <span className="text-xs font-bold truncate px-1" style={{ color: STATUS_COLOR[unit.status] }}>
              {unit.loteNum ?? unit.nome}
            </span>
            {!isLoteamento && (
              <span className="text-[9px] text-[var(--shell-subtext)]">Casa</span>
            )}
            {unit.loteAreaM2 && (
              <span className="text-[9px] text-[var(--shell-subtext)]">{unit.loteAreaM2}m²</span>
            )}
          </button>
        ))}
      </div>

      {selectedUnit && (
        <UnitModal
          unit={selectedUnit}
          devId={devId}
          onClose={() => setSelectedUnit(null)}
          onUpdated={(u) => { onUnitUpdated(u); setSelectedUnit(u); }}
        />
      )}
    </div>
  );
}

function EspelhoVendas({ dev, onUnitUpdated }: {
  dev: Development; onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void;
}) {
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(dev.towers[0]?.id ?? null);
  const selectedTower = dev.towers.find((t) => t.id === selectedTowerId) ?? dev.towers[0] ?? null;

  const total = dev.towers.flatMap((t) => t.units).length;
  const vendido = dev.towers.flatMap((t) => t.units).filter((u) => u.status === "VENDIDO").length;
  const reservado = dev.towers.flatMap((t) => t.units).filter((u) => u.status === "RESERVADO").length;
  const disponivel = dev.towers.flatMap((t) => t.units).filter((u) => u.status === "DISPONIVEL").length;

  const isVertical = dev.tipo === "VERTICAL";
  const isLoteamento = dev.subtipo === "LOTEAMENTO";

  function printEspelho() {
    window.print();
  }

  if (dev.towers.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-5xl mb-4">🏗️</div>
        <p className="text-sm font-semibold text-[var(--shell-text)]">Nenhuma torre/quadra cadastrada</p>
        <p className="text-xs text-[var(--shell-subtext)] mt-1">Vá para a aba Cadastro e adicione torres para ver o espelho</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total",      value: total,      color: "text-[var(--shell-text)]",  bg: "bg-[var(--shell-bg)]" },
          { label: "Disponível", value: disponivel, color: "text-green-600",             bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "Reservado",  value: reservado,  color: "text-amber-600",             bg: "bg-amber-50 dark:bg-amber-900/20" },
          { label: "Vendido",    value: vendido,    color: "text-red-600",               bg: "bg-red-50 dark:bg-red-900/20" },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border border-[var(--shell-card-border)] ${c.bg} px-4 py-3 text-center`}>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-[var(--shell-subtext)]">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLOR[k as UnitStatus] }} />
            {l}
          </div>
        ))}
        <button onClick={printEspelho}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors">
          🖨️ Imprimir
        </button>
      </div>

      {/* Seletor de torre */}
      {dev.towers.length > 1 && (
        <div className="flex gap-2 flex-wrap border-b border-[var(--shell-card-border)] pb-3">
          {dev.towers.map((t) => (
            <button key={t.id} type="button"
              onClick={() => setSelectedTowerId(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedTower?.id === t.id
                  ? "bg-[var(--brand-accent)] text-white shadow-sm"
                  : "border border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
              }`}>
              {t.nome}
              <span className="ml-2 text-[10px] opacity-70">{t.units.length} unid.</span>
            </button>
          ))}
        </div>
      )}

      {/* Grade */}
      {selectedTower && (
        <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 shadow-sm">
          <p className="text-sm font-semibold text-[var(--shell-text)] mb-4">{selectedTower.nome}</p>
          {isVertical ? (
            <EspelhoVertical
              tower={selectedTower}
              devId={dev.id}
              onUnitUpdated={(u) => onUnitUpdated(selectedTower.id, u)}
            />
          ) : (
            <EspelhoHorizontal
              tower={selectedTower}
              devId={dev.id}
              onUnitUpdated={(u) => onUnitUpdated(selectedTower.id, u)}
              isLoteamento={isLoteamento}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers 3D compartilhados ───────────────────────────────────────────────

function buildThreeScene(THREE: any, dev: Development) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
  sun.position.set(100, 200, 100);
  scene.add(sun);

  const isVertical = dev.tipo === "VERTICAL";
  const isLoteamento = dev.subtipo === "LOTEAMENTO";
  const interactiveObjects: any[] = [];
  const unitMap = new Map<string, DevelopmentUnit>();

  dev.towers.forEach((tower) => {
    const bx = tower.offsetX;
    const bz = -tower.offsetY;
    const activeFaces = (tower.lados ?? "FRENTE,FUNDO,ESQUERDA,DIREITA").split(",");

    if (isVertical) {
      const buildingH = tower.floors * tower.alturaAndarM;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(tower.larguraM, buildingH, tower.profundidadeM),
        new THREE.MeshLambertMaterial({ color: 0xd0d8e8 }),
      );
      body.position.set(bx, buildingH / 2, bz);
      scene.add(body);

      const unitsByFloor: Record<number, DevelopmentUnit[]> = {};
      tower.units.forEach((u) => { const f = u.andar ?? 1; if (!unitsByFloor[f]) unitsByFloor[f] = []; unitsByFloor[f].push(u); });

      Object.entries(unitsByFloor).forEach(([floorStr, floorUnits]) => {
        const floor = parseInt(floorStr);
        const y = (floor - 0.5) * tower.alturaAndarM;
        const perFace = Math.ceil(floorUnits.length / activeFaces.length);
        activeFaces.forEach((face, fi) => {
          const faceUnits = floorUnits.slice(fi * perFace, (fi + 1) * perFace);
          if (!faceUnits.length) return;
          const cols = faceUnits.length;
          faceUnits.forEach((unit, idx) => {
            let wx = bx, wz = bz;
            let gw = 1, gh = tower.alturaAndarM * 0.5, gd = 0.3;
            if (face === "FRENTE") { wx = bx - tower.larguraM/2 + tower.larguraM/(cols+1)*(idx+1); wz = bz - tower.profundidadeM/2 - 0.05; gw = tower.larguraM/(cols+1)*0.6; }
            else if (face === "FUNDO") { wx = bx - tower.larguraM/2 + tower.larguraM/(cols+1)*(idx+1); wz = bz + tower.profundidadeM/2 + 0.05; gw = tower.larguraM/(cols+1)*0.6; }
            else if (face === "ESQUERDA") { wx = bx - tower.larguraM/2 - 0.05; wz = bz - tower.profundidadeM/2 + tower.profundidadeM/(cols+1)*(idx+1); gw = 0.3; gd = tower.profundidadeM/(cols+1)*0.6; }
            else if (face === "DIREITA") { wx = bx + tower.larguraM/2 + 0.05; wz = bz - tower.profundidadeM/2 + tower.profundidadeM/(cols+1)*(idx+1); gw = 0.3; gd = tower.profundidadeM/(cols+1)*0.6; }
            const win = new THREE.Mesh(
              new THREE.BoxGeometry(gw, gh, gd),
              new THREE.MeshLambertMaterial({ color: new THREE.Color(STATUS_COLOR[unit.status]), emissive: new THREE.Color(STATUS_COLOR[unit.status]), emissiveIntensity: 0.4 }),
            );
            win.position.set(wx, y, wz);
            win.userData = { unitId: unit.id };
            scene.add(win);
            interactiveObjects.push(win);
            unitMap.set(win.uuid, unit);
          });
        });
      });

    } else if (isLoteamento) {
      const cols = Math.ceil(Math.sqrt(tower.units.length)) || 1;
      const lotW = tower.larguraM / cols, lotD = tower.profundidadeM / cols;
      tower.units.forEach((unit, idx) => {
        const col = idx % cols, row = Math.floor(idx / cols);
        const lot = new THREE.Mesh(
          new THREE.PlaneGeometry(lotW * 0.9, lotD * 0.9),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(STATUS_COLOR[unit.status]), opacity: 0.8, transparent: true }),
        );
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(bx - tower.larguraM/2 + lotW*(col+0.5), 0.1, bz - tower.profundidadeM/2 + lotD*(row+0.5));
        lot.userData = { unitId: unit.id };
        scene.add(lot); interactiveObjects.push(lot); unitMap.set(lot.uuid, unit);
      });

    } else {
      const cols = Math.ceil(Math.sqrt(tower.units.length)) || 1;
      const lotW = tower.larguraM / cols, lotD = tower.profundidadeM / cols;
      tower.units.forEach((unit, idx) => {
        const col = idx % cols, row = Math.floor(idx / cols);
        const lx = bx - tower.larguraM/2 + lotW*(col+0.5), lz = bz - tower.profundidadeM/2 + lotD*(row+0.5);
        const houseH = tower.alturaAndarM;
        const house = new THREE.Mesh(
          new THREE.BoxGeometry(lotW*0.7, houseH, lotD*0.7),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(STATUS_COLOR[unit.status]).lerp(new THREE.Color(0xffffff), 0.4) }),
        );
        house.position.set(lx, houseH/2, lz);
        house.userData = { unitId: unit.id };
        scene.add(house); interactiveObjects.push(house); unitMap.set(house.uuid, unit);
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(lotW,lotD)*0.55, houseH*0.5, 4),
          new THREE.MeshLambertMaterial({ color: 0x8b4513 }),
        );
        roof.position.set(lx, houseH + houseH*0.25, lz);
        roof.rotation.y = Math.PI/4;
        scene.add(roof);
      });
    }
  });

  return { scene, interactiveObjects, unitMap };
}

// ─── Visão 3D ────────────────────────────────────────────────────────────────

function View3D({ dev, onUnitUpdated }: { dev: Development; onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void }) {
  const aerialRef = useRef<HTMLDivElement>(null);
  const walkRef   = useRef<HTMLDivElement>(null);
  const walkSceneRef = useRef<any>(null);
  const [mode, setMode] = useState<"aerial" | "walk">("aerial");
  const [selectedUnit, setSelectedUnit] = useState<DevelopmentUnit | null>(null);
  const [loadingAerial, setLoadingAerial] = useState(true);
  const [walkActive, setWalkActive] = useState(false);
  const hasGps = !!(dev.lat && dev.lng);

  // ── Modo Aéreo: Google Maps + OverlayView Canvas ────────────────────────────
  useEffect(() => {
    if (!aerialRef.current || !hasGps) { setLoadingAerial(false); return; }
    let cancelled = false;
    let overlayRef: any = null;

    async function initAerial() {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
      if (!key) { setLoadingAerial(false); return; }
      await new Promise<void>((resolve) => {
        if (window.google?.maps) { resolve(); return; }
        const t = setInterval(() => { if (window.google?.maps) { clearInterval(t); resolve(); } }, 100);
      });
      if (cancelled || !aerialRef.current) return;

      const map = new window.google.maps.Map(aerialRef.current, {
        center: { lat: dev.lat!, lng: dev.lng! },
        zoom: 19, tilt: 0,
        mapTypeId: "satellite",
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      });

      const cosLat = Math.cos(dev.lat! * Math.PI / 180);
      const latPerM = 1 / 111320;
      const lngPerM = 1 / (111320 * cosLat);

      const ov = new window.google.maps.OverlayView();
      overlayRef = ov;
      let canvas: HTMLCanvasElement | null = null;

      ov.onAdd = function () {
        canvas = document.createElement("canvas");
        canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
        (this as any).getPanes()!.overlayLayer.appendChild(canvas);
      };

      ov.draw = function () {
        if (!canvas || !aerialRef.current) return;
        const proj = (this as any).getProjection();
        if (!proj) return;
        canvas.width  = aerialRef.current.clientWidth;
        canvas.height = aerialRef.current.clientHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // pixels per meter at current zoom
        const cPx = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(dev.lat!, dev.lng!))!;
        const rPx = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(dev.lat!, dev.lng! + lngPerM))!;
        const ppm = Math.abs(rPx.x - cPx.x);

        dev.towers.forEach((tower) => {
          const tLat = dev.lat! + tower.offsetY * latPerM;
          const tLng = dev.lng! + tower.offsetX * lngPerM;
          const tPx = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(tLat, tLng))!;
          const tw = tower.larguraM * ppm;
          const th = tower.profundidadeM * ppm;
          const rx = tPx.x - tw / 2;
          const ry = tPx.y - th / 2;

          if (dev.tipo === "VERTICAL") {
            ctx.fillStyle = "rgba(37,99,235,0.78)";
            ctx.fillRect(rx, ry, tw, th);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, tw, th);
            ctx.fillStyle = "#fff";
            const fz = Math.max(9, Math.min(13, tw / 6));
            ctx.font = `bold ${fz}px sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(tower.nome, tPx.x, tPx.y - (tw > 50 ? fz / 2 : 0));
            if (tw > 50) {
              ctx.font = `${fz - 1}px sans-serif`;
              ctx.fillText(`${tower.floors} and · ${tower.units.length} un`, tPx.x, tPx.y + fz);
            }
          } else {
            const cols = Math.max(1, Math.ceil(Math.sqrt(tower.units.length)));
            const rows = Math.max(1, Math.ceil(tower.units.length / cols));
            const cellW = tw / cols;
            const cellH = th / rows;
            tower.units.forEach((unit, idx) => {
              const col = idx % cols;
              const row = Math.floor(idx / cols);
              const x = rx + col * cellW;
              const y = ry + row * cellH;
              ctx.fillStyle = STATUS_COLOR[unit.status] + "cc";
              ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
              ctx.strokeStyle = "rgba(255,255,255,0.6)";
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
              if (cellW > 18) {
                ctx.fillStyle = "#fff";
                ctx.font = `${Math.min(10, cellW / 3)}px sans-serif`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(unit.loteNum || String(idx + 1), x + cellW / 2, y + cellH / 2);
              }
            });
          }
        });
      };

      ov.onRemove = function () {
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
        canvas = null;
      };

      ov.setMap(map);
      setLoadingAerial(false);

      map.addListener("click", (e: any) => {
        const proj = (overlayRef as any)?.getProjection();
        if (!proj) return;
        const clickPx = proj.fromLatLngToDivPixel(e.latLng)!;
        const cPx2 = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(dev.lat!, dev.lng!))!;
        const rPx2 = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(dev.lat!, dev.lng! + lngPerM))!;
        const ppm = Math.abs(rPx2.x - cPx2.x);

        for (const tower of dev.towers) {
          const tLat = dev.lat! + tower.offsetY * latPerM;
          const tLng = dev.lng! + tower.offsetX * lngPerM;
          const tPx = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(tLat, tLng))!;
          const tw = tower.larguraM * ppm;
          const th = tower.profundidadeM * ppm;
          const rx = tPx.x - tw / 2, ry = tPx.y - th / 2;

          if (clickPx.x >= rx && clickPx.x <= rx + tw && clickPx.y >= ry && clickPx.y <= ry + th) {
            if (dev.tipo === "VERTICAL") {
              setSelectedUnit(tower.units[0] ?? null);
            } else {
              const cols = Math.max(1, Math.ceil(Math.sqrt(tower.units.length)));
              const cellW = tw / cols;
              const cellH = th / Math.max(1, Math.ceil(tower.units.length / cols));
              const col = Math.floor((clickPx.x - rx) / cellW);
              const row = Math.floor((clickPx.y - ry) / cellH);
              const idx = row * cols + col;
              if (tower.units[idx]) setSelectedUnit(tower.units[idx]);
            }
            return;
          }
        }
        setSelectedUnit(null);
      });
    }

    initAerial();
    return () => {
      cancelled = true;
      if (overlayRef) { try { overlayRef.setMap(null); } catch {} overlayRef = null; }
    };
  }, [dev, hasGps]);

  // ── Modo Walk: Three.js standalone ──────────────────────────────────────────
  useEffect(() => {
    if (mode !== "walk" || !walkRef.current) return;
    let cancelled = false;
    let animId = 0;

    async function initWalk() {
      if (!walkRef.current) return;
      const THREE = await import("three");
      const { PointerLockControls } = await import("three/examples/jsm/controls/PointerLockControls.js" as any);
      if (cancelled) return;

      const { scene, interactiveObjects, unitMap } = buildThreeScene(THREE, dev);
      scene.background = new THREE.Color(0x87ceeb);

      if (dev.implantacaoUrl) {
        const tex = await new THREE.TextureLoader().loadAsync(dev.implantacaoUrl);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ map: tex }));
        ground.rotation.x = -Math.PI / 2; scene.add(ground);
      } else {
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: 0x4a7c59 }));
        ground.rotation.x = -Math.PI / 2; scene.add(ground);
      }

      const W = walkRef.current.clientWidth, H = walkRef.current.clientHeight;
      const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000);
      camera.position.set(0, 1.7, 60);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(W, H);
      walkRef.current.appendChild(renderer.domElement);

      const controls = new PointerLockControls(camera, renderer.domElement);
      const keys: Record<string, boolean> = {};
      const onKD = (e: KeyboardEvent) => { keys[e.code] = true; if (e.code === "Escape") controls.unlock(); };
      const onKU = (e: KeyboardEvent) => { keys[e.code] = false; };
      document.addEventListener("keydown", onKD);
      document.addEventListener("keyup", onKU);
      controls.addEventListener("lock", () => setWalkActive(true));
      controls.addEventListener("unlock", () => setWalkActive(false));

      // Click para selecionar unidade
      const raycaster = new THREE.Raycaster();
      renderer.domElement.addEventListener("click", (e: MouseEvent) => {
        if (!controls.isLocked) { controls.lock(); return; }
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects(interactiveObjects);
        if (hits.length > 0) {
          const unit = unitMap.get(hits[0].object.uuid);
          if (unit) setSelectedUnit(unit);
        }
      });

      const ro = new ResizeObserver(() => {
        if (!walkRef.current) return;
        const w = walkRef.current.clientWidth, h = walkRef.current.clientHeight;
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      });
      ro.observe(walkRef.current);

      function animate() {
        animId = requestAnimationFrame(animate);
        if (controls.isLocked) {
          const spd = 0.3;
          if (keys["KeyW"] || keys["ArrowUp"])    controls.moveForward(spd);
          if (keys["KeyS"] || keys["ArrowDown"])  controls.moveForward(-spd);
          if (keys["KeyA"] || keys["ArrowLeft"])  controls.moveRight(-spd);
          if (keys["KeyD"] || keys["ArrowRight"]) controls.moveRight(spd);
        }
        renderer.render(scene, camera);
      }
      animate();
      walkSceneRef.current = { controls, renderer, ro, onKD, onKU };
    }

    initWalk();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      const s = walkSceneRef.current;
      if (s) {
        document.removeEventListener("keydown", s.onKD);
        document.removeEventListener("keyup", s.onKU);
        s.ro?.disconnect();
        s.renderer?.dispose();
        if (walkRef.current?.contains(s.renderer?.domElement)) walkRef.current.removeChild(s.renderer.domElement);
      }
      walkSceneRef.current = null;
      setWalkActive(false);
    };
  }, [mode, dev]);

  return (
    <div className="space-y-4">
      {!hasGps && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Defina as coordenadas GPS do empreendimento na aba Cadastro para usar a visão no Maps.
        </div>
      )}

      {/* Toggle de modo */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl border border-[var(--shell-card-border)] overflow-hidden">
          {[{ k: "aerial", l: "🛰️ Satélite (Maps)" }, { k: "walk", l: "🚶 Passeio Virtual" }].map(({ k, l }) => (
            <button key={k} type="button"
              onClick={() => { setMode(k as any); setSelectedUnit(null); }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${mode === k ? "bg-[var(--brand-accent)] text-white" : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
              {l}
            </button>
          ))}
        </div>
        {mode === "walk" && !walkActive && <p className="text-xs text-[var(--shell-subtext)]">Clique na cena para ativar · WASD para mover · ESC para sair</p>}
        {walkActive && <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white animate-pulse">Passeio ativo — ESC para sair</span>}
      </div>

      {/* Containers */}
      <div className="relative rounded-2xl overflow-hidden border border-[var(--shell-card-border)] shadow-md" style={{ height: 540 }}>
        {/* Aéreo: Google Maps + OverlayView */}
        <div ref={aerialRef} className="absolute inset-0" style={{ display: mode === "aerial" ? "block" : "none" }} />
        {mode === "aerial" && loadingAerial && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--shell-bg)] z-10">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-[var(--brand-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[var(--shell-subtext)]">Carregando mapa...</p>
            </div>
          </div>
        )}
        {/* Walk: Three.js */}
        {mode === "walk" && <div ref={walkRef} className="absolute inset-0" />}
      </div>

      {/* Painel de unidade selecionada */}
      {selectedUnit && (
        <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-[var(--shell-text)] text-base">{selectedUnit.nome}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: STATUS_COLOR[selectedUnit.status] }}>
                  {STATUS_LABEL[selectedUnit.status]}
                </span>
                {selectedUnit.valorVenda && <span className="text-sm font-semibold text-[var(--brand-accent)]">{fmt(selectedUnit.valorVenda)}</span>}
              </div>
            </div>
            <button onClick={() => setSelectedUnit(null)} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl">×</button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            {selectedUnit.andar && <div><p className="text-xs text-[var(--shell-subtext)]">Andar</p><p className="font-medium">{selectedUnit.andar}º</p></div>}
            {selectedUnit.areaM2 && <div><p className="text-xs text-[var(--shell-subtext)]">Área</p><p className="font-medium">{selectedUnit.areaM2}m²</p></div>}
            {selectedUnit.quartos && <div><p className="text-xs text-[var(--shell-subtext)]">Quartos</p><p className="font-medium">{selectedUnit.quartos}</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba Espelho (unificada 2D + 3D) ─────────────────────────────────────────

function AbaEspelho({ dev, onUnitUpdated }: {
  dev: Development; onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void;
}) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [show3d, setShow3d] = useState(false);

  return (
    <div className="space-y-5">
      {/* Toggle de visão */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-xl border border-[var(--shell-card-border)] overflow-hidden shadow-sm">
          {[{ k: "2d", l: "📋 2D Estático" }, { k: "3d", l: "🏗️ 3D Interativo" }].map(({ k, l }) => (
            <button key={k} type="button"
              onClick={() => {
                setView(k as any);
                if (k === "3d") setShow3d(true);
              }}
              className={`px-5 py-2.5 text-sm font-semibold transition-colors ${
                view === k
                  ? "bg-[var(--brand-accent)] text-white"
                  : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
              }`}>
              {l}
            </button>
          ))}
        </div>
        {view === "3d" && (
          <span className="text-xs text-[var(--shell-subtext)]">Arraste para orbitar · Scroll para zoom · Clique para selecionar</span>
        )}
      </div>

      {view === "2d" && <EspelhoVendas dev={dev} onUnitUpdated={onUnitUpdated} />}
      {view === "3d" && show3d && <View3D dev={dev} onUnitUpdated={onUnitUpdated} />}
    </div>
  );
}

// ─── Tabela de Preços ─────────────────────────────────────────────────────────

function PriceTable({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, Partial<DevelopmentUnit>>>({});
  const [saving, setSaving] = useState(false);

  function setEdit(unitId: string, field: string, val: any) {
    setEdits((p) => ({ ...p, [unitId]: { ...(p[unitId] ?? {}), [field]: val === "" ? null : (isNaN(Number(val)) ? val : Number(val)) } }));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await Promise.all(Object.entries(edits).map(([unitId, data]) =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/developments/${dev.id}/units/${unitId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
          body: JSON.stringify(data),
        }),
      ));
      setEdits({});
      onSaved();
    } finally { setSaving(false); }
  }

  const allUnits = dev.towers.flatMap((t) => t.units.map((u) => ({ ...u, towerNome: t.nome })));

  return (
    <div className="space-y-4">
      {Object.keys(edits).length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/5 px-4 py-3">
          <p className="text-sm text-[var(--shell-text)]">{Object.keys(edits).length} unidade(s) com alterações</p>
          <button onClick={saveAll} disabled={saving}
            className="rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      )}
      <div className="overflow-auto rounded-xl border border-[var(--shell-card-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--shell-bg)]">
            <tr>
              {["Torre", "Unidade", "Andar", "Status", "Área m²", "Quartos", "Suítes", "Banheiros", "Vagas", "Vl. Venda (R$)", "Vl. Avaliado (R$)"].map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allUnits.map((unit, i) => {
              const edit = edits[unit.id] ?? {};
              const cellCls = "px-3 py-2 border-t border-[var(--shell-card-border)]";
              const editInp = "w-20 rounded border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-1.5 py-0.5 text-xs outline-none focus:border-[var(--brand-accent)]";
              return (
                <tr key={unit.id} className={i % 2 === 0 ? "bg-[var(--shell-card-bg)]" : "bg-[var(--shell-bg)]"}>
                  <td className={cellCls}><span className="text-xs text-[var(--shell-subtext)]">{unit.towerNome}</span></td>
                  <td className={`${cellCls} font-medium text-[var(--shell-text)]`}>{unit.nome}</td>
                  <td className={cellCls}>{unit.andar ?? "—"}</td>
                  <td className={cellCls}>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: STATUS_COLOR[(edit.status ?? unit.status) as UnitStatus] }}>
                      {STATUS_LABEL[(edit.status ?? unit.status) as UnitStatus]}
                    </span>
                  </td>
                  <td className={cellCls}><input className={editInp} defaultValue={unit.areaM2 ?? ""} onChange={(e) => setEdit(unit.id, "areaM2", e.target.value)} /></td>
                  <td className={cellCls}><input className={editInp} defaultValue={unit.quartos ?? ""} onChange={(e) => setEdit(unit.id, "quartos", e.target.value)} /></td>
                  <td className={cellCls}><input className={editInp} defaultValue={unit.suites ?? ""} onChange={(e) => setEdit(unit.id, "suites", e.target.value)} /></td>
                  <td className={cellCls}><input className={editInp} defaultValue={unit.banheiros ?? ""} onChange={(e) => setEdit(unit.id, "banheiros", e.target.value)} /></td>
                  <td className={cellCls}><input className={editInp} defaultValue={unit.vagas ?? ""} onChange={(e) => setEdit(unit.id, "vagas", e.target.value)} /></td>
                  <td className={cellCls}><input className={`${editInp} w-28`} defaultValue={unit.valorVenda ?? ""} onChange={(e) => setEdit(unit.id, "valorVenda", e.target.value)} /></td>
                  <td className={cellCls}><input className={`${editInp} w-28`} defaultValue={unit.valorAvaliado ?? ""} onChange={(e) => setEdit(unit.id, "valorAvaliado", e.target.value)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Condições de Pagamento ───────────────────────────────────────────────────

function PaymentConditionForm({ devId, initial, onSaved }: {
  devId: string; initial?: PaymentCondition | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    aceitaFinanciamento: initial?.aceitaFinanciamento ?? true,
    proSoluto: initial?.proSoluto ?? false,
    valorAto: String(initial?.valorAto ?? ""),
    entradaPercentual: String(initial?.entradaPercentual ?? ""),
    entradaParcelas: String(initial?.entradaParcelas ?? ""),
    descontoAVista: String(initial?.descontoAVista ?? ""),
    financiamentoBase: initial?.financiamentoBase ?? "AVALIADO",
    financiamentoPercentual: String(initial?.financiamentoPercentual ?? ""),
    proSolutoPercentual: String(initial?.proSolutoPercentual ?? ""),
    proSolutoParcelas: String(initial?.proSolutoParcelas ?? ""),
    obs: initial?.obs ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(k: string, v: any) { setForm((p) => ({ ...p, [k]: v })); setSaved(false); }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertPaymentCondition(devId, {
        aceitaFinanciamento: form.aceitaFinanciamento,
        valorAto: form.valorAto ? parseFloat(form.valorAto) : null,
        entradaPercentual: form.entradaPercentual ? parseFloat(form.entradaPercentual) : null,
        entradaParcelas: form.entradaParcelas ? parseInt(form.entradaParcelas) : null,
        descontoAVista: form.descontoAVista ? parseFloat(form.descontoAVista) : null,
        financiamentoBase: form.financiamentoBase as any,
        financiamentoPercentual: form.financiamentoPercentual ? parseFloat(form.financiamentoPercentual) : null,
        proSoluto: form.proSoluto,
        proSolutoPercentual: form.proSolutoPercentual ? parseFloat(form.proSolutoPercentual) : null,
        proSolutoParcelas: form.proSolutoParcelas ? parseInt(form.proSolutoParcelas) : null,
        obs: form.obs || null,
      });
      setSaved(true);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] p-3 cursor-pointer hover:bg-[var(--shell-hover)] transition-colors">
          <input type="checkbox" checked={form.aceitaFinanciamento} onChange={(e) => set("aceitaFinanciamento", e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--brand-accent)]" />
          <span className="text-sm font-medium text-[var(--shell-text)]">Aceita financiamento bancário</span>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] p-3 cursor-pointer hover:bg-[var(--shell-hover)] transition-colors">
          <input type="checkbox" checked={form.proSoluto} onChange={(e) => set("proSoluto", e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--brand-accent)]" />
          <span className="text-sm font-medium text-[var(--shell-text)]">Tem pro-soluto</span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { k: "valorAto", l: "Valor de Ato (R$)", p: "Ex.: 5000" },
          { k: "descontoAVista", l: "Desconto à Vista (%)", p: "Ex.: 5" },
          { k: "obs", l: "Observações", p: "Obs. adicionais" },
        ].map(({ k, l, p }) => (
          <div key={k} className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{l}</label>
            <input value={(form as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={p} className={inp} />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
        <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Entrada Parcelada</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">% da entrada sobre valor de venda</label>
            <input value={form.entradaPercentual} onChange={(e) => set("entradaPercentual", e.target.value)} placeholder="Ex.: 20" className={inp} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">Nº de parcelas até entrega das chaves</label>
            <input value={form.entradaParcelas} onChange={(e) => set("entradaParcelas", e.target.value)} placeholder="Ex.: 24" className={inp} />
          </div>
        </div>
      </div>
      {form.aceitaFinanciamento && (
        <div className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Financiamento Bancário</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">Base de cálculo</label>
              <select value={form.financiamentoBase} onChange={(e) => set("financiamentoBase", e.target.value)} className={inp}>
                <option value="AVALIADO">Valor Avaliado</option>
                <option value="VENDA">Valor de Venda</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--shell-subtext)]">% sobre a base para financiar</label>
              <input value={form.financiamentoPercentual} onChange={(e) => set("financiamentoPercentual", e.target.value)} placeholder="Ex.: 80" className={inp} />
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="rounded-xl bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar Condições"}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardView({ dashboard, dev }: { dashboard: Dashboard; dev: Development }) {
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const chartData = dashboard.monthly.map((m) => ({ name: m.mes.slice(5), vendas: m.vendas, vgv: Math.round(m.vgv / 1000) }));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { v: `${dashboard.percentualVendido}%`, l: "Vendido", accent: true },
          { v: `${dashboard.vso}%`, l: "VSO (vendido + reservado)" },
          dev.prazoEntrega && { v: new Date(dev.prazoEntrega).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }), l: "Previsão entrega" },
        ].filter(Boolean).map((c: any, i) => (
          <div key={i} className={`rounded-xl border px-5 py-3 text-center ${c.accent ? "border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5" : "border-[var(--shell-card-border)]"}`}>
            <p className={`text-3xl font-bold ${c.accent ? "text-[var(--brand-accent)]" : "text-[var(--shell-text)]"}`}>{c.v}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.l}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: "Total",      v: dashboard.total,      c: "#6b7280" },
          { l: "Disponível", v: dashboard.disponivel, c: STATUS_COLOR.DISPONIVEL },
          { l: "Reservado",  v: dashboard.reservado,  c: STATUS_COLOR.RESERVADO },
          { l: "Vendido",    v: dashboard.vendido,    c: STATUS_COLOR.VENDIDO },
          { l: "Bloqueado",  v: dashboard.bloqueado,  c: STATUS_COLOR.BLOQUEADO },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-4 py-3 text-center">
            <p className="text-2xl font-bold" style={{ color: c.c }}>{c.v}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.l}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "VGV Total",    v: dashboard.vgvTotal,      cls: "text-[var(--shell-text)]" },
          { l: "VGV Vendido",  v: dashboard.vgvVendido,    cls: "text-red-600" },
          { l: "VGV Reservado",v: dashboard.vgvReservado,  cls: "text-amber-600" },
          { l: "VGV a Vender", v: dashboard.vgvDisponivel, cls: "text-green-600" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-4 py-3">
            <p className={`text-lg font-bold truncate ${c.cls}`}>{fmtCur(c.v)}</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-0.5">{c.l}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
        <p className="text-sm font-semibold text-[var(--shell-text)] mb-4">Vendas mensais — últimos 12 meses</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--shell-card-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--shell-subtext)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--shell-subtext)" allowDecimals={false} />
            <RechartsTooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="vendas" fill={STATUS_COLOR.VENDIDO} radius={[4, 4, 0, 0]} name="Vendidas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Aba Cadastro ─────────────────────────────────────────────────────────────

function AbaCadastro({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTowerModal, setShowTowerModal] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  // Campos do desenvolvimento
  const [nome, setNome] = useState(dev.nome);
  const [tipo, setTipo] = useState(dev.tipo);
  const [subtipo, setSubtipo] = useState(dev.subtipo);
  const [status, setStatus] = useState(dev.status);
  const [prazoEntrega, setPrazoEntrega] = useState(dev.prazoEntrega ? dev.prazoEntrega.split("T")[0] : "");
  const [endereco, setEndereco] = useState(dev.endereco ?? "");
  const [cidade, setCidade] = useState(dev.cidade ?? "");
  const [estado, setEstado] = useState(dev.estado ?? "");
  const [descricao, setDescricao] = useState(dev.descricao ?? "");
  const [lat, setLat] = useState<number | null>(dev.lat ?? null);
  const [lng, setLng] = useState<number | null>(dev.lng ?? null);
  const [implantacaoUrl, setImplantacaoUrl] = useState<string | null>(dev.implantacaoUrl ?? null);

  // Towers editáveis
  const [towers, setTowers] = useState<Tower[]>(dev.towers);

  // Modal nova torre
  const [towerNome, setTowerNome] = useState("");
  const [towerFloors, setTowerFloors] = useState("10");
  const [towerUPF, setTowerUPF] = useState("4");
  const [towerPrefix, setTowerPrefix] = useState(dev.tipo === "VERTICAL" ? "Apto" : dev.subtipo === "LOTEAMENTO" ? "Lote" : "Casa");
  const [towerLargura, setTowerLargura] = useState("20");
  const [towerProfundidade, setTowerProfundidade] = useState("15");
  const [towerAlturaAndar, setTowerAlturaAndar] = useState("3");
  const [savingTower, setSavingTower] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTowers(dev.towers); }, [dev]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || !mapRef.current) return;
    function doInit() {
      if (!mapRef.current || !window.google?.maps) return;
      const center = lat && lng ? { lat, lng } : { lat: -15.7942, lng: -47.8822 };
      const map = new window.google.maps.Map(mapRef.current!, {
        center, zoom: 16, mapTypeId: "satellite", tilt: 0,
        disableDefaultUI: false, zoomControl: true, mapTypeControl: false, streetViewControl: false,
      });
      mapInstanceRef.current = map;
      const marker = new window.google.maps.Marker({
        map, position: lat && lng ? { lat, lng } : undefined,
        draggable: true, visible: !!(lat && lng),
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#2563eb", fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 },
      });
      markerRef.current = marker;
      map.addListener("click", (e: any) => {
        const la = e.latLng.lat(); const ln = e.latLng.lng();
        setLat(la); setLng(ln); marker.setPosition({ lat: la, lng: ln }); marker.setVisible(true);
      });
      marker.addListener("dragend", (e: any) => { setLat(e.latLng.lat()); setLng(e.latLng.lng()); });

      if (window.google.maps.places && addressInputRef.current) {
        const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          types: ["geocode"],
          componentRestrictions: { country: "br" },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const la = place.geometry.location.lat();
          const ln = place.geometry.location.lng();
          setLat(la); setLng(ln);
          map.setCenter({ lat: la, lng: ln }); map.setZoom(17);
          marker.setPosition({ lat: la, lng: ln }); marker.setVisible(true);
          const comps = place.address_components ?? [];
          const get = (type: string) => comps.find((c: any) => c.types.includes(type))?.long_name ?? "";
          const getShort = (type: string) => comps.find((c: any) => c.types.includes(type))?.short_name ?? "";
          setEndereco(place.formatted_address ?? ""); setSaved(false);
          setCidade(get("administrative_area_level_2") || get("locality")); setSaved(false);
          setEstado(getShort("administrative_area_level_1")); setSaved(false);
        });
      }
    }
    if (window.google?.maps) { doInit(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google?.maps) { clearInterval(wait); doInit(); } }, 100);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places`;
    script.async = true; script.onload = doInit;
    document.head.appendChild(script);
  }, []);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await updateDevelopment(dev.id, {
        nome, tipo, subtipo, status, descricao: descricao || undefined,
        endereco: endereco || undefined, cidade: cidade || undefined, estado: estado || undefined,
        prazoEntrega: prazoEntrega || undefined,
        lat: lat ?? undefined, lng: lng ?? undefined,
      } as any);
      setSaved(true);
      onSaved();
    } finally { setSaving(false); }
  }

  async function handleImplantacaoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const result = await uploadImplantacao(dev.id, file);
      setImplantacaoUrl((result as any).implantacaoUrl ?? null);
      onSaved();
    } catch { alert("Erro ao fazer upload da implantação"); }
    finally { setUploadingImg(false); }
  }

  async function handleCreateTower() {
    if (!towerNome.trim()) return;
    setSavingTower(true);
    try {
      const tower = await createTower(dev.id, {
        nome: towerNome.trim(), floors: parseInt(towerFloors) || 1,
        unitsPerFloor: parseInt(towerUPF) || 1,
        larguraM: parseFloat(towerLargura) || 20,
        profundidadeM: parseFloat(towerProfundidade) || 15,
        alturaAndarM: parseFloat(towerAlturaAndar) || 3,
      });
      await bulkCreateUnits(dev.id, tower.id, {
        floors: parseInt(towerFloors) || 1,
        unitsPerFloor: parseInt(towerUPF) || 1,
        prefix: towerPrefix,
      });
      setShowTowerModal(false);
      setTowerNome(""); setTowerFloors("10"); setTowerUPF("4");
      onSaved();
    } catch (e: any) { alert(e?.message ?? "Erro ao criar torre"); }
    finally { setSavingTower(false); }
  }

  async function handleUpdateTower(towerId: string, field: string, val: any) {
    await updateTower(dev.id, towerId, { [field]: val });
    setTowers((p) => p.map((t) => t.id === towerId ? { ...t, [field]: val } : t));
  }

  async function handleDeleteTower(towerId: string) {
    if (!confirm("Excluir esta torre? Todas as unidades serão removidas.")) return;
    await deleteTower(dev.id, towerId);
    setTowers((p) => p.filter((t) => t.id !== towerId));
    onSaved();
  }

  const isVertical = tipo === "VERTICAL";
  const towerLabel = isVertical ? "Torre" : "Quadra";

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Identificação */}
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm">
        <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Identificação</p>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nome</label>
          <input value={nome} onChange={(e) => { setNome(e.target.value); setSaved(false); }} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Tipo</label>
            <select value={tipo} onChange={(e) => { setTipo(e.target.value as any); setSaved(false); }} className={inp}>
              <option value="VERTICAL">Vertical (Prédio)</option>
              <option value="HORIZONTAL">Horizontal</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Subtipo</label>
            <select value={subtipo} onChange={(e) => { setSubtipo(e.target.value as any); setSaved(false); }} className={inp}>
              {tipo === "VERTICAL" ? (
                <option value="APARTAMENTO">Apartamentos</option>
              ) : (
                <>
                  <option value="CASA">Casas</option>
                  <option value="LOTEAMENTO">Loteamento / Terrenos</option>
                </>
              )}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setSaved(false); }} className={inp}>
              <option value="LANCAMENTO">Lançamento</option>
              <option value="EM_OBRA">Em Obra</option>
              <option value="CONCLUIDO">Concluído</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Previsão de entrega</label>
            <input type="date" value={prazoEntrega} onChange={(e) => { setPrazoEntrega(e.target.value); setSaved(false); }} className={inp} />
          </div>
        </div>
      </div>

      {/* Localização */}
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm">
        <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Localização</p>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Endereço</label>
          <input ref={addressInputRef} value={endereco} onChange={(e) => { setEndereco(e.target.value); setSaved(false); }} placeholder="Digite para buscar no mapa..." className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Cidade</label>
            <input value={cidade} onChange={(e) => { setCidade(e.target.value); setSaved(false); }} placeholder="São Paulo" className={inp} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Estado</label>
            <input value={estado} onChange={(e) => { setEstado(e.target.value); setSaved(false); }} maxLength={2} placeholder="SP" className={inp} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Localização no mapa</label>
          {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Latitude</label>
                  <input
                    type="number" step="any"
                    value={lat ?? ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const newLat = isNaN(v) ? null : v;
                      setLat(newLat); setSaved(false);
                      if (newLat && lng) {
                        mapInstanceRef.current?.setCenter({ lat: newLat, lng });
                        mapInstanceRef.current?.setZoom(17);
                        markerRef.current?.setPosition({ lat: newLat, lng });
                        markerRef.current?.setVisible(true);
                      }
                    }}
                    placeholder="-23.550520"
                    className={inp}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Longitude</label>
                  <input
                    type="number" step="any"
                    value={lng ?? ""}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const newLng = isNaN(v) ? null : v;
                      setLng(newLng); setSaved(false);
                      if (lat && newLng) {
                        mapInstanceRef.current?.setCenter({ lat, lng: newLng });
                        mapInstanceRef.current?.setZoom(17);
                        markerRef.current?.setPosition({ lat, lng: newLng });
                        markerRef.current?.setVisible(true);
                      }
                    }}
                    placeholder="-46.633608"
                    className={inp}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--shell-subtext)]">Ou clique diretamente no mapa para marcar o terreno</p>
              <div ref={mapRef} className="w-full h-56 rounded-xl overflow-hidden border border-[var(--shell-card-border)]" />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--shell-subtext)]">Latitude</label>
                <input type="number" step="any" value={lat ?? ""} onChange={(e) => { setLat(parseFloat(e.target.value) || null); setSaved(false); }} placeholder="-23.5505" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--shell-subtext)]">Longitude</label>
                <input type="number" step="any" value={lng ?? ""} onChange={(e) => { setLng(parseFloat(e.target.value) || null); setSaved(false); }} placeholder="-46.6333" className={inp} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Implantação */}
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm">
        <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Planta de Implantação</p>
        <p className="text-xs text-[var(--shell-subtext)]">Faça upload da planta fornecida pelo arquiteto. Ela será usada como textura do chão na visão 3D.</p>
        {implantacaoUrl && (
          <div className="relative inline-block">
            <img src={implantacaoUrl} alt="Implantação" className="max-h-48 rounded-xl border border-[var(--shell-card-border)] object-contain" />
          </div>
        )}
        <label className={`inline-flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-[var(--shell-card-border)] px-5 py-3 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors ${uploadingImg ? "opacity-50 pointer-events-none" : ""}`}>
          {uploadingImg ? "Fazendo upload..." : implantacaoUrl ? "Trocar imagem" : "📎 Upload da planta (PNG / JPG)"}
          <input type="file" accept="image/*" className="hidden" onChange={handleImplantacaoUpload} disabled={uploadingImg} />
        </label>
      </div>

      {/* Torres / Quadras */}
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">{towerLabel}s</p>
          <button type="button" onClick={() => setShowTowerModal(true)}
            className="rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm">
            + Nova {towerLabel}
          </button>
        </div>
        {towers.length === 0 ? (
          <p className="text-sm text-[var(--shell-subtext)] text-center py-4">Nenhuma {towerLabel.toLowerCase()} cadastrada</p>
        ) : (
          <div className="space-y-3">
            {towers.map((t) => (
              <div key={t.id} className="rounded-xl border border-[var(--shell-card-border)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[var(--shell-text)] text-sm">{t.nome}</p>
                  <div className="flex items-center gap-2 text-xs text-[var(--shell-subtext)]">
                    <span>{t.floors} {isVertical ? "andares" : "linhas"}</span>
                    <span>·</span>
                    <span>{t.units.length} unidades</span>
                    <button onClick={() => handleDeleteTower(t.id)} className="text-red-400 hover:text-red-600 ml-2">Excluir</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {[
                    { l: "Largura (m)", k: "larguraM", v: t.larguraM },
                    { l: "Prof. (m)", k: "profundidadeM", v: t.profundidadeM },
                    { l: isVertical ? "Alt./andar (m)" : "Alt. casa (m)", k: "alturaAndarM", v: t.alturaAndarM },
                  ].map(({ l, k, v }) => (
                    <div key={k} className="space-y-1">
                      <label className="text-[var(--shell-subtext)] font-medium">{l}</label>
                      <input type="number" step="0.5" defaultValue={v}
                        onBlur={(e) => handleUpdateTower(t.id, k, parseFloat(e.target.value) || v)}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1.5 text-xs text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)]" />
                    </div>
                  ))}
                </div>
                {isVertical && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Faces com unidades</label>
                    <div className="flex gap-3 flex-wrap">
                      {(["FRENTE","FUNDO","ESQUERDA","DIREITA"] as const).map((lado) => {
                        const ativos = (t.lados ?? "FRENTE,FUNDO,ESQUERDA,DIREITA").split(",");
                        const ativo = ativos.includes(lado);
                        return (
                          <label key={lado} className="flex items-center gap-1.5 cursor-pointer text-xs text-[var(--shell-text)]">
                            <input
                              type="checkbox"
                              checked={ativo}
                              onChange={() => {
                                const novo = ativo
                                  ? ativos.filter(l => l !== lado)
                                  : [...ativos, lado];
                                if (novo.length === 0) return;
                                handleUpdateTower(t.id, "lados", novo.join(","));
                              }}
                              className="h-3.5 w-3.5 rounded accent-[var(--brand-accent)]"
                            />
                            {lado.charAt(0) + lado.slice(1).toLowerCase()}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botão salvar */}
      <div className="flex justify-end gap-3">
        <button onClick={handleSave} disabled={saving}
          className="rounded-xl bg-[var(--brand-accent)] px-7 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar alterações"}
        </button>
      </div>

      {/* Modal nova torre */}
      <Modal open={showTowerModal} onClose={() => setShowTowerModal(false)} title={`Nova ${towerLabel}`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nome *</label>
            <input value={towerNome} onChange={(e) => setTowerNome(e.target.value)} placeholder={isVertical ? "Ex.: Torre A" : "Ex.: Quadra 1"} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{isVertical ? "Andares" : "Linhas de lotes"}</label>
              <input type="number" value={towerFloors} onChange={(e) => setTowerFloors(e.target.value)} min={1} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{isVertical ? "Unid./andar" : "Lotes por linha"}</label>
              <input type="number" value={towerUPF} onChange={(e) => setTowerUPF(e.target.value)} min={1} className={inp} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Prefixo das unidades</label>
            <input value={towerPrefix} onChange={(e) => setTowerPrefix(e.target.value)} placeholder={isVertical ? "Apto" : "Lote"} className={inp} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Largura (m)", s: towerLargura, fn: setTowerLargura },
              { l: "Prof. (m)",   s: towerProfundidade, fn: setTowerProfundidade },
              { l: isVertical ? "Alt/andar (m)" : "Alt. casa (m)", s: towerAlturaAndar, fn: setTowerAlturaAndar },
            ].map(({ l, s, fn }) => (
              <div key={l} className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{l}</label>
                <input type="number" step="0.5" value={s} onChange={(e) => fn(e.target.value)} className={inp} />
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--shell-subtext)]">
            Serão criadas {parseInt(towerFloors || "0") * parseInt(towerUPF || "0")} unidades automaticamente.
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowTowerModal(false)}
              className="rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreateTower} disabled={savingTower || !towerNome.trim()}
              className="rounded-lg bg-[var(--brand-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {savingTower ? "Criando..." : `Criar ${towerLabel}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

const STATUS_LABEL_DEV: Record<string, string> = { LANCAMENTO: "Lançamento", EM_OBRA: "Em Obra", CONCLUIDO: "Concluído" };
const STATUS_COLOR_DEV: Record<string, string> = {
  LANCAMENTO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  EM_OBRA:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  CONCLUIDO:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "cadastro",  label: "📋 Cadastro" },
  { key: "espelho",   label: "🏢 Espelho de Vendas" },
  { key: "precos",    label: "💰 Preços" },
  { key: "dashboard", label: "📊 Dashboard" },
];

export default function EmpreendimentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dev, setDev] = useState<Development | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("espelho");

  async function load() {
    try {
      const [d, db] = await Promise.all([getDevelopment(id), getDashboard(id).catch(() => null)]);
      setDev(d);
      setDashboard(db);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  function handleUnitUpdated(towerId: string, unit: DevelopmentUnit) {
    setDev((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        towers: prev.towers.map((t) =>
          t.id !== towerId ? t : { ...t, units: t.units.map((u) => u.id === unit.id ? unit : u) }
        ),
      };
    });
  }

  if (loading) {
    return (
      <AppShell title="Empreendimento">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[var(--brand-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!dev) {
    return (
      <AppShell title="Empreendimento">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-[var(--shell-text)]">Empreendimento não encontrado</p>
          <button onClick={() => router.push("/gestao-empreendimentos")}
            className="text-sm text-[var(--brand-accent)] hover:underline">← Voltar</button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={dev.nome}>
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => router.push("/gestao-empreendimentos")}
              className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] mb-2 flex items-center gap-1 transition-colors">
              ← Gestão de Empreendimentos
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[var(--shell-text)]">{dev.nome}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR_DEV[dev.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABEL_DEV[dev.status] ?? dev.status}
              </span>
            </div>
            <p className="text-sm text-[var(--shell-subtext)] mt-1">
              {dev.cidade && dev.estado ? `${dev.cidade}, ${dev.estado}` : dev.cidade || dev.estado || ""}
              {dev.prazoEntrega && ` · Entrega: ${new Date(dev.prazoEntrega).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--shell-card-border)]">
          <div className="flex gap-1">
            {TABS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                    : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo das abas */}
        <div>
          {tab === "cadastro" && (
            <AbaCadastro dev={dev} onSaved={load} />
          )}

          {tab === "espelho" && (
            <AbaEspelho dev={dev} onUnitUpdated={handleUnitUpdated} />
          )}

          {tab === "precos" && (
            <div className="space-y-8">
              <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-5">Tabela de Preços</h2>
                <PriceTable dev={dev} onSaved={load} />
              </div>
              <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6 shadow-sm">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-1">Condições de Pagamento</h2>
                <p className="text-xs text-[var(--shell-subtext)] mb-5">Definições comerciais aplicáveis a todas as unidades.</p>
                <PaymentConditionForm devId={dev.id} initial={dev.paymentCondition} onSaved={load} />
              </div>
            </div>
          )}

          {tab === "dashboard" && dashboard && (
            <DashboardView dashboard={dashboard} dev={dev} />
          )}
          {tab === "dashboard" && !dashboard && (
            <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Nenhum dado disponível ainda</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
