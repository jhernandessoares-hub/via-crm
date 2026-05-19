"use client";
import { useEffect, useState, useCallback, useRef, useMemo, forwardRef, useImperativeHandle, startTransition, type ForwardedRef } from "react";
import type { FaseConfig } from "@/lib/developments.service";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { computeCompleteness, STEP_LABELS, type Completeness } from "@/lib/empreendimento-completeness";
import AppShell from "@/components/AppShell";
import {
  getDevelopment, updateDevelopment, createTower, updateTower, deleteTower,
  bulkCreateUnits, updateUnit, bulkUpdateUnits, bulkUpdateUnitsIndividual,
  getDashboard, getPaymentCondition, upsertPaymentCondition,
  uploadImplantacao, uploadDevelopmentModel, publishDevelopment, unpublishDevelopment,
  type Development, type Tower, type DevelopmentUnit, type UnitStatus,
  type PaymentCondition, type Dashboard,
  type TerrainShape, type TerrainShapeType,
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

function UnitModal({ unit, devId, onClose, onUpdated, role = "OWNER" }: {
  unit: DevelopmentUnit; devId: string; onClose: () => void; onUpdated: (u: DevelopmentUnit) => void; role?: string;
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

  const isAgent = role === "AGENT";
  const allActions: { label: string; status: UnitStatus; color: string }[] = [
    { label: "Disponível", status: "DISPONIVEL" as UnitStatus, color: "bg-green-500 hover:bg-green-600" },
    { label: "Reservar",   status: "RESERVADO"  as UnitStatus, color: "bg-amber-400 hover:bg-amber-500" },
    ...(!isAgent ? [
      { label: "Vender",   status: "VENDIDO"   as UnitStatus, color: "bg-red-500 hover:bg-red-600" },
      { label: "Bloquear", status: "BLOQUEADO" as UnitStatus, color: "bg-gray-400 hover:bg-gray-500" },
    ] : []),
  ];
  // AGENT só pode transitar entre DISPONIVEL e RESERVADO
  const actions = allActions.filter((a) => {
    if (a.status === status) return false;
    if (isAgent && status !== "DISPONIVEL" && status !== "RESERVADO") return false;
    return true;
  });

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

// ─── Popup de detalhes da unidade (view-only + lead search) ──────────────────

function UnitDetailsPopup({ unit, devId, onClose, onUnitUpdated, onEditUnit, role = "OWNER" }: {
  unit: DevelopmentUnit; devId: string; onClose: () => void;
  onUnitUpdated: (u: DevelopmentUnit) => void;
  onEditUnit: () => void;
  role?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(unit);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!showSearch || !query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`/leads?search=${encodeURIComponent(query)}&limit=10`);
        setResults(Array.isArray(res) ? res : (res?.data ?? []));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, showSearch]);

  async function linkLead(lead: any) {
    try {
      await updateUnit(devId, current.id, { leadId: lead.id } as any);
      const updated = { ...current, leadId: lead.id, lead: { id: lead.id, nome: lead.nome, nomeCorreto: lead.nomeCorreto ?? null } };
      setCurrent(updated);
      onUnitUpdated(updated);
      setShowSearch(false);
      setQuery("");
      setResults([]);
    } catch (e: any) { alert(e?.message ?? "Erro ao vincular lead"); }
  }

  const buyerName = current.lead?.nomeCorreto ?? current.lead?.nome ?? current.comprador;
  const canLink = current.status === "VENDIDO" || current.status === "RESERVADO";

  return (
    <Modal open title={current.nome} onClose={onClose}>
      <div className="space-y-4">
        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white ${STATUS_BG[current.status]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          {STATUS_LABEL[current.status]}
        </span>

        {/* Dados */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {current.areaM2 != null && <div><p className="text-xs text-[var(--shell-subtext)] mb-0.5">Área</p><p className="font-semibold text-[var(--shell-text)]">{current.areaM2} m²</p></div>}
          {current.quartos != null && <div><p className="text-xs text-[var(--shell-subtext)] mb-0.5">Quartos</p><p className="font-semibold text-[var(--shell-text)]">{current.quartos}</p></div>}
          {current.suites != null && current.suites > 0 && <div><p className="text-xs text-[var(--shell-subtext)] mb-0.5">Suítes</p><p className="font-semibold text-[var(--shell-text)]">{current.suites}</p></div>}
          {current.vagas != null && <div><p className="text-xs text-[var(--shell-subtext)] mb-0.5">Vagas</p><p className="font-semibold text-[var(--shell-text)]">{current.vagas}</p></div>}
          {(current.finalPrice ?? current.valorVenda) != null && (
            <div className="col-span-2">
              <p className="text-xs text-[var(--shell-subtext)] mb-0.5">{current.finalPrice ? "Valor negociado" : "Valor de venda"}</p>
              <p className="font-semibold text-[var(--brand-accent)]">{fmt(current.finalPrice ?? current.valorVenda)}</p>
            </div>
          )}
        </div>

        {/* Bloqueio */}
        {current.status === "BLOQUEADO" && current.bloqueioMotivo && (
          <div className="rounded-lg bg-gray-100 dark:bg-gray-800/50 px-3 py-2">
            <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Motivo do bloqueio</p>
            <p className="text-sm text-[var(--shell-text)]">{current.bloqueioMotivo}</p>
          </div>
        )}

        {/* Comprador + Lead */}
        {canLink && (
          <div className="pt-3 border-t border-[var(--shell-card-border)] space-y-2">
            {buyerName && (
              <div>
                <p className="text-xs text-[var(--shell-subtext)] mb-0.5">{current.status === "VENDIDO" ? "Comprador" : "Interessado"}</p>
                <p className="text-sm font-semibold text-[var(--shell-text)]">{buyerName}</p>
              </div>
            )}
            {current.soldAt && current.status === "VENDIDO" && (
              <div>
                <p className="text-xs text-[var(--shell-subtext)] mb-0.5">Data da venda</p>
                <p className="text-sm font-semibold text-[var(--shell-text)]">{new Date(current.soldAt).toLocaleDateString("pt-BR")}</p>
              </div>
            )}

            {current.leadId ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-[var(--shell-text)] flex-1 truncate font-medium">
                  {current.lead?.nomeCorreto ?? current.lead?.nome ?? "Lead vinculado"}
                </span>
                <button type="button" onClick={() => setShowSearch(true)}
                  className="text-xs text-[var(--brand-accent)] hover:underline shrink-0">Alterar</button>
              </div>
            ) : (
              !showSearch && (
                <button type="button" onClick={() => setShowSearch(true)}
                  className="text-xs font-medium text-[var(--brand-accent)] hover:underline">
                  + Vincular Lead
                </button>
              )
            )}

            {showSearch && (
              <div className="space-y-2">
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome ou telefone..."
                  className={inp} />
                {searching && <p className="text-xs text-[var(--shell-subtext)]">Buscando...</p>}
                {results.length > 0 && (
                  <div className="border border-[var(--shell-card-border)] rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {results.map((l: any) => (
                      <button key={l.id} type="button" onClick={() => linkLead(l)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--shell-hover)] border-b border-[var(--shell-card-border)] last:border-b-0">
                        <span className="font-semibold text-[var(--shell-text)]">{l.nomeCorreto ?? l.nome}</span>
                        {l.telefone && <span className="text-[var(--shell-subtext)] ml-2">{l.telefone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim() && results.length === 0 && (
                  <p className="text-xs text-[var(--shell-subtext)]">Nenhum lead encontrado</p>
                )}
                <button type="button" onClick={() => { setShowSearch(false); setQuery(""); setResults([]); }}
                  className="text-xs text-[var(--shell-subtext)] hover:underline">Cancelar</button>
              </div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-3 border-t border-[var(--shell-card-border)]">
          <button type="button" onClick={onEditUnit}
            className="flex-1 rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-xs font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors">
            Detalhes da Unidade
          </button>
          {current.leadId && (
            <button type="button"
              onClick={() => { onClose(); startTransition(() => router.push(`/leads/${current.leadId}`)); }}
              className="flex-1 rounded-lg bg-[var(--brand-accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity">
              Ver Lead →
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Espelho 2D — filtros e helpers ──────────────────────────────────────────

type EspelhoFilters = {
  statuses: Set<UnitStatus>;
  priceMin: number | null;
  priceMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
};

function emptyFilters(): EspelhoFilters {
  return {
    statuses: new Set<UnitStatus>(["DISPONIVEL", "RESERVADO", "VENDIDO", "BLOQUEADO"]),
    priceMin: null, priceMax: null, floorMin: null, floorMax: null,
  };
}

function isFiltersActive(f: EspelhoFilters): boolean {
  return f.statuses.size !== 4
    || f.priceMin !== null || f.priceMax !== null
    || f.floorMin !== null || f.floorMax !== null;
}

function unitMatches(u: DevelopmentUnit, f: EspelhoFilters, isVertical: boolean): boolean {
  if (!f.statuses.has(u.status)) return false;
  if (f.priceMin !== null || f.priceMax !== null) {
    const price = u.valorVenda;
    if (price == null) return false;
    if (f.priceMin !== null && price < f.priceMin) return false;
    if (f.priceMax !== null && price > f.priceMax) return false;
  }
  if (isVertical && (f.floorMin !== null || f.floorMax !== null)) {
    const a = u.andar ?? 0;
    if (f.floorMin !== null && a < f.floorMin) return false;
    if (f.floorMax !== null && a > f.floorMax) return false;
  }
  return true;
}

// ─── Popover de filtros ──────────────────────────────────────────────────────

function FiltersPopover({ filters, setFilters, isVertical, allFloors }: {
  filters: EspelhoFilters;
  setFilters: (f: EspelhoFilters) => void;
  isVertical: boolean;
  allFloors: number[];
}) {
  const [open, setOpen] = useState(false);
  const active = isFiltersActive(filters);

  function toggleStatus(s: UnitStatus) {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s); else next.add(s);
    setFilters({ ...filters, statuses: next });
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]"
            : "border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
        }`}>
        🎚️ Filtros{active ? " ●" : ""}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-4 shadow-xl space-y-4">
            <div>
              <div className="text-[10px] font-bold text-[var(--shell-subtext)] uppercase tracking-wider mb-2">Status</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(["DISPONIVEL","RESERVADO","VENDIDO","BLOQUEADO"] as UnitStatus[]).map((s) => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer text-xs text-[var(--shell-text)]">
                    <input type="checkbox" checked={filters.statuses.has(s)}
                      onChange={() => toggleStatus(s)}
                      className="h-3.5 w-3.5 rounded accent-[var(--brand-accent)]" />
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLOR[s] }} />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-[var(--shell-subtext)] uppercase tracking-wider mb-2">Faixa de preço (R$)</div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Min" value={filters.priceMin ?? ""}
                  onChange={(e) => setFilters({ ...filters, priceMin: e.target.value ? Number(e.target.value) : null })}
                  className={`${inp} text-xs py-1.5`} />
                <input type="number" placeholder="Máx" value={filters.priceMax ?? ""}
                  onChange={(e) => setFilters({ ...filters, priceMax: e.target.value ? Number(e.target.value) : null })}
                  className={`${inp} text-xs py-1.5`} />
              </div>
              <p className="text-[10px] text-[var(--shell-subtext)] mt-1">Unidades sem preço cadastrado ficam ocultas quando há faixa.</p>
            </div>
            {isVertical && allFloors.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-[var(--shell-subtext)] uppercase tracking-wider mb-2">Faixa de andar</div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder={`Min (${Math.min(...allFloors)})`}
                    value={filters.floorMin ?? ""}
                    onChange={(e) => setFilters({ ...filters, floorMin: e.target.value ? Number(e.target.value) : null })}
                    className={`${inp} text-xs py-1.5`} />
                  <input type="number" placeholder={`Máx (${Math.max(...allFloors)})`}
                    value={filters.floorMax ?? ""}
                    onChange={(e) => setFilters({ ...filters, floorMax: e.target.value ? Number(e.target.value) : null })}
                    className={`${inp} text-xs py-1.5`} />
                </div>
              </div>
            )}
            {active && (
              <button onClick={() => setFilters(emptyFilters())}
                className="w-full text-xs font-medium text-[var(--brand-accent)] hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Espelho 2D — VERTICAL (lado a lado por fase) ───────────────────────────

const LADO_OPTIONS = ["Vista Interna", "Vista Externa", "Norte", "Sul", "Leste", "Oeste"];

function EspelhoVertical({ tower, devId, filters, onUnitUpdated, onUnitClick }: {
  tower: Tower; devId: string; filters: EspelhoFilters;
  onUnitUpdated: (u: DevelopmentUnit) => void;
  onUnitClick: (u: DevelopmentUnit) => void;
}) {

  // Deriva fases e ranges de posição
  const faseRanges = useMemo(() => {
    const cfg = tower.fasesConfig as FaseConfig[] | null;
    if (cfg && cfg.length > 0) {
      let offset = 0;
      return cfg.map((f) => {
        const posStart = offset + 1;
        offset += f.unidades;
        return { nome: f.nome, posStart, posEnd: offset, subsolos: f.subsolos };
      });
    }
    // fallback: sem fasesConfig, trata como fase única
    return [{ nome: "", posStart: 1, posEnd: tower.unitsPerFloor, subsolos: tower.subsolos ?? 0 }];
  }, [tower.fasesConfig, tower.unitsPerFloor, tower.subsolos]);

  const hasMultipleFases = faseRanges.length > 1 && faseRanges.some((f) => f.nome);

  // Mapa de unidades por andar
  const unitsByFloor = useMemo(() => {
    const map: Record<number, DevelopmentUnit[]> = {};
    tower.units.forEach((u) => {
      const f = u.andar ?? 1;
      if (!map[f]) map[f] = [];
      map[f].push(u);
    });
    return map;
  }, [tower.units]);

  const allFloors = Object.keys(unitsByFloor).map(Number).sort((a, b) => b - a);

  const floorLabel = (f: number) => f < 0 ? `S${Math.abs(f)}` : `${f}º`;
  const isSubsolo = (f: number) => f < 0;

  const unitMap = useMemo(() => {
    const m: Record<string, DevelopmentUnit> = {};
    tower.units.forEach((u) => { m[`${u.andar}_${u.posicao}`] = u; });
    return m;
  }, [tower.units]);

  if (tower.units.length === 0) {
    return <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Nenhuma unidade nesta torre</div>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-auto">
        <div className="inline-block min-w-max border-2 border-slate-700 rounded-lg overflow-hidden bg-[var(--shell-card-bg)] shadow-md">

          {/* Cabeçalho — nome da torre + headers de fase */}
          <div className="bg-gradient-to-b from-slate-700 to-slate-800 text-white border-b-2 border-slate-900">
            <div className="py-2 px-4 text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">▲ Topo</div>
              <div className="text-sm font-bold tracking-wider mt-0.5">{tower.nome}</div>
            </div>
            {hasMultipleFases && (
              <div className="flex border-t border-slate-600">
                <div className="w-14 shrink-0" />
                {faseRanges.map((fase, fi) => (
                  <div key={fi} className="flex border-l border-slate-600">
                    <div className="text-center text-[11px] font-bold py-1 px-2 tracking-wide opacity-90 whitespace-nowrap"
                      style={{ width: `${(fase.posEnd - fase.posStart + 1) * 64}px` }}>
                      {fase.nome}
                    </div>
                  </div>
                ))}
                <div className="w-14 shrink-0" />
              </div>
            )}
          </div>

          {/* Linhas por andar */}
          {allFloors.map((floor, idx) => {
            const zebra = idx % 2 === 0 ? "bg-[var(--shell-card-bg)]" : "bg-[var(--shell-bg)]";
            const sub = isSubsolo(floor);
            return (
              <div key={floor} className={`flex border-b border-slate-200 dark:border-slate-700 last:border-b-0 ${zebra} ${sub ? "border-t-2 border-t-amber-200 dark:border-t-amber-800" : ""}`}>
                {/* Label esquerdo */}
                <div className={`w-14 shrink-0 flex items-center justify-center text-xs font-bold border-r border-slate-200 dark:border-slate-700 py-1 ${sub ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}`}>
                  {floorLabel(floor)}
                </div>

                {/* Células por fase */}
                {faseRanges.map((fase, fi) => {
                  const faseDepth = Math.abs(floor);
                  const faseHasFloor = !sub || faseDepth <= fase.subsolos;
                  return (
                    <div key={fi} className={`flex ${fi > 0 ? "border-l-2 border-slate-400 dark:border-slate-500" : ""}`}>
                      {Array.from({ length: fase.posEnd - fase.posStart + 1 }, (_, pi) => {
                        const pos = fase.posStart + pi;
                        const unit = unitMap[`${floor}_${pos}`];
                        if (!faseHasFloor || !unit) {
                          return (
                            <div key={pos} className="w-16 h-14 flex items-center justify-center border-r border-slate-100 dark:border-slate-800 last:border-r-0">
                              <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                            </div>
                          );
                        }
                        const visible = unitMatches(unit, filters, true);
                        return (
                          <button key={pos} type="button"
                            onClick={() => onUnitClick(unit)}
                            title={`${unit.nome} — ${STATUS_LABEL[unit.status]}${unit.valorVenda ? ` — ${fmt(unit.valorVenda)}` : ""}`}
                            className={`w-16 h-14 flex flex-col items-center justify-center border-r border-white/30 last:border-r-0 transition-all hover:brightness-110 hover:z-10 hover:shadow-lg ${visible ? "" : "opacity-20 grayscale"}`}
                            style={{ backgroundColor: STATUS_COLOR[unit.status] }}
                          >
                            <div className="text-[11px] font-bold text-white drop-shadow leading-tight">
                              {unit.nome.replace(/^(Apto|Casa|Lote)\s*/i, "")}
                            </div>
                            {unit.areaM2 != null && (
                              <div className="text-[9px] text-white/90 leading-tight">{unit.areaM2}m²</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Label direito */}
                <div className={`w-14 shrink-0 flex items-center justify-center text-xs font-bold border-l border-slate-200 dark:border-slate-700 py-1 ${sub ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}`}>
                  {floorLabel(floor)}
                </div>
              </div>
            );
          })}

          {/* Térreo (lobby) — linha visual sem unidades */}
          {tower.hasLobbyFloor && (
            <div className="flex border-t-2 border-amber-300 dark:border-amber-700 bg-gray-100 dark:bg-gray-800/50">
              <div className="w-14 shrink-0 flex items-center justify-center text-xs font-bold border-r border-slate-200 dark:border-slate-700 py-2 text-gray-500">T</div>
              <div className="flex-1 flex items-center px-3 py-2 text-[10px] text-gray-400 italic">Térreo — Hall / Lobby</div>
              <div className="w-14 shrink-0 flex items-center justify-center text-xs font-bold border-l border-slate-200 dark:border-slate-700 py-2 text-gray-500">T</div>
            </div>
          )}

          {/* Rodapé */}
          <div className="bg-gradient-to-t from-slate-700 to-slate-800 text-white py-2 px-4 text-center border-t-2 border-slate-900">
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">▼ Base</div>
          </div>
        </div>
      </div>

    </div>
  );
}

function EspelhoHorizontal({ tower, devId, filters, onUnitUpdated, onUnitClick, isLoteamento }: {
  tower: Tower; devId: string; filters: EspelhoFilters;
  onUnitUpdated: (u: DevelopmentUnit) => void;
  onUnitClick: (u: DevelopmentUnit) => void;
  isLoteamento: boolean;
}) {
  const units = [...tower.units].sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
  const cols = Math.ceil(Math.sqrt(units.length)) || 1;

  return (
    <div className="overflow-auto">
      <div className="inline-block min-w-max border-2 border-slate-700 rounded-lg overflow-hidden bg-[var(--shell-card-bg)] shadow-md">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-b from-slate-700 to-slate-800 text-white py-2.5 px-4 text-center border-b-2 border-slate-900">
          <div className="text-sm font-bold tracking-wider">{tower.nome}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-70 mt-0.5">{units.length} {isLoteamento ? "lotes" : "casas"}</div>
        </div>

        {/* Grade de lotes/casas */}
        <div className="p-4 grid gap-2 bg-[var(--shell-bg)]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(6rem, 1fr))` }}>
          {units.map((unit) => {
            const visible = unitMatches(unit, filters, false);
            return (
              <button key={unit.id} type="button"
                onClick={() => onUnitClick(unit)}
                title={`${unit.loteNum ?? unit.nome}\n${STATUS_LABEL[unit.status]}${unit.valorVenda ? `\n${fmt(unit.valorVenda)}` : ""}`}
                className={`relative flex flex-col items-stretch rounded-md border-2 px-2.5 py-2 text-left transition-all hover:scale-105 hover:shadow-lg hover:z-10 ${visible ? "" : "opacity-20 grayscale"}`}
                style={{ backgroundColor: STATUS_COLOR[unit.status] + "22", borderColor: STATUS_COLOR[unit.status] }}
              >
                <div className="text-sm font-bold leading-tight" style={{ color: STATUS_COLOR[unit.status] }}>
                  {unit.loteNum ?? unit.nome}
                </div>
                {!isLoteamento && (
                  <div className="text-[9px] text-[var(--shell-subtext)] mt-0.5">Casa</div>
                )}
                {unit.loteAreaM2 && (
                  <div className="text-[10px] font-medium text-[var(--shell-subtext)]">{unit.loteAreaM2} m²</div>
                )}
                {unit.valorVenda && (
                  <div className="text-[10px] font-semibold mt-1" style={{ color: STATUS_COLOR[unit.status] }}>
                    {fmt(unit.valorVenda)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ─── Modal Street View ───────────────────────────────────────────────────────

function StreetViewModal({ lat, lng, onClose }: { lat: number; lng: number; onClose: () => void }) {
  const svRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svRef.current) return;
    function init() {
      if (!svRef.current || !window.google?.maps) return;
      new window.google.maps.StreetViewPanorama(svRef.current, {
        position: { lat, lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        fullscreenControl: true,
      });
    }
    if (window.google?.maps) { init(); return; }
    const t = setInterval(() => { if (window.google?.maps) { clearInterval(t); init(); } }, 100);
    return () => clearInterval(t);
  }, [lat, lng]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-3xl mx-4 rounded-2xl bg-[var(--shell-card-bg)] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--shell-card-border)]">
          <h3 className="text-base font-bold text-[var(--shell-text)]">Ver Entorno (Street View)</h3>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-xl leading-none">×</button>
        </div>
        <div ref={svRef} style={{ height: 480 }} />
        <p className="px-5 py-2 text-xs text-[var(--shell-subtext)]">
          Navegue com o mouse · Street View pode não estar disponível para este endereço
        </p>
      </div>
    </div>
  );
}

function EspelhoVendas({ dev, onUnitUpdated, role }: {
  dev: Development; onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void; role: string;
}) {
  const [filters, setFilters] = useState<EspelhoFilters>(emptyFilters());
  const [exporting, setExporting] = useState(false);
  const [detailsUnit, setDetailsUnit] = useState<DevelopmentUnit | null>(null);
  const [editUnit, setEditUnit] = useState<DevelopmentUnit | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const isVertical = dev.tipo === "VERTICAL";
  const isLoteamento = dev.subtipo === "LOTEAMENTO";

  const allUnits = dev.towers.flatMap((t) => t.units);
  const total = allUnits.length;
  const vendido = allUnits.filter((u) => u.status === "VENDIDO").length;
  const reservado = allUnits.filter((u) => u.status === "RESERVADO").length;
  const disponivel = allUnits.filter((u) => u.status === "DISPONIVEL").length;

  const allFloors = isVertical
    ? Array.from(new Set(allUnits.map((u) => u.andar ?? 0))).filter((n) => n > 0).sort((a, b) => a - b)
    : [];

  async function captureCanvas() {
    if (!exportRef.current) throw new Error("nada para exportar");
    const html2canvas = (await import("html2canvas")).default;
    const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
    return html2canvas(exportRef.current, { backgroundColor: bg, scale: 2, logging: false });
  }

  async function exportPNG() {
    setExporting(true);
    try {
      const canvas = await captureCanvas();
      const link = document.createElement("a");
      link.download = `${dev.nome}-espelho-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e: any) { alert("Erro ao exportar PNG: " + (e?.message ?? e)); }
    finally { setExporting(false); }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const canvas = await captureCanvas();
      const { jsPDF } = await import("jspdf");
      const orient = canvas.width > canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation: orient as any, unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${dev.nome}-espelho-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) { alert("Erro ao exportar PDF: " + (e?.message ?? e)); }
    finally { setExporting(false); }
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

      {/* Legenda + Filtros + Exportação */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-[var(--shell-subtext)]">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_COLOR[k as UnitStatus] }} />
            {l}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <FiltersPopover filters={filters} setFilters={setFilters} isVertical={isVertical} allFloors={allFloors} />
          <button onClick={exportPNG} disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors disabled:opacity-50">
            🖼️ {exporting ? "..." : "PNG"}
          </button>
          <button onClick={exportPDF} disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors disabled:opacity-50">
            📄 {exporting ? "..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Grade — todas as torres empilhadas */}
      <div ref={exportRef} className="bg-[var(--shell-bg)] p-4 rounded-2xl space-y-8">
        {dev.towers.map((tower) => (
          <div key={tower.id}>
            {isVertical ? (
              <EspelhoVertical
                tower={tower}
                devId={dev.id}
                filters={filters}
                onUnitUpdated={(u) => onUnitUpdated(tower.id, u)}
                onUnitClick={setDetailsUnit}
              />
            ) : (
              <EspelhoHorizontal
                tower={tower}
                devId={dev.id}
                filters={filters}
                onUnitUpdated={(u) => onUnitUpdated(tower.id, u)}
                onUnitClick={setDetailsUnit}
                isLoteamento={isLoteamento}
              />
            )}
          </div>
        ))}
      </div>

      {/* Popups renderizados fora da grade para evitar stacking context */}
      {detailsUnit && (
        <UnitDetailsPopup
          unit={detailsUnit}
          devId={dev.id}
          role={role}
          onClose={() => setDetailsUnit(null)}
          onUnitUpdated={(u) => { onUnitUpdated(detailsUnit.towerId, u); setDetailsUnit(u); }}
          onEditUnit={() => { setEditUnit(detailsUnit); setDetailsUnit(null); }}
        />
      )}
      {editUnit && (
        <UnitModal
          unit={editUnit}
          devId={dev.id}
          role={role}
          onClose={() => setEditUnit(null)}
          onUpdated={(u) => { onUnitUpdated(editUnit.towerId, u); setEditUnit(u); }}
        />
      )}
    </div>
  );
}

// --- Aba Espelho -------------------------------------------------------------

function AbaEspelho({ dev, onUnitUpdated, role }: {
  dev: Development; onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void; role: string;
}) {
  return <EspelhoVendas dev={dev} onUnitUpdated={onUnitUpdated} role={role} />;
}

// ─── Preencher em Lote por Posição ────────────────────────────────────────────

type PosValues = { areaM2: string; quartos: string; suites: string; banheiros: string; vagas: string; valorVenda: string; valorAvaliado: string };
const emptyPosValues = (): PosValues => ({ areaM2: "", quartos: "", suites: "", banheiros: "", vagas: "", valorVenda: "", valorAvaliado: "" });

function BulkFillByPosicao({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, PosValues>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  function setVal(key: string, field: keyof PosValues, v: string) {
    setValues((p) => ({ ...p, [key]: { ...(p[key] ?? emptyPosValues()), [field]: v } }));
  }

  async function apply(towerId: string, posicao: number, key: string) {
    const v = values[key] ?? emptyPosValues();
    const updates: Partial<DevelopmentUnit> = {};
    if (v.areaM2 !== "") updates.areaM2 = Number(v.areaM2) as any;
    if (v.quartos !== "") updates.quartos = Number(v.quartos) as any;
    if (v.suites !== "") updates.suites = Number(v.suites) as any;
    if (v.banheiros !== "") updates.banheiros = Number(v.banheiros) as any;
    if (v.vagas !== "") updates.vagas = Number(v.vagas) as any;
    if (v.valorVenda !== "") updates.valorVenda = Number(v.valorVenda) as any;
    if (v.valorAvaliado !== "") updates.valorAvaliado = Number(v.valorAvaliado) as any;
    if (Object.keys(updates).length === 0) { alert("Preencha ao menos um campo."); return; }
    setBusy(key);
    try {
      await bulkUpdateUnits(dev.id, towerId, { posicaoMin: posicao, posicaoMax: posicao, updates });
      setApplied((p) => new Set([...p, key]));
      onSaved();
    } catch (e: any) { alert("Erro: " + (e?.message ?? e)); }
    finally { setBusy(null); }
  }

  const towerGroups = dev.towers.map((tower) => {
    const posMap = new Map<number, number>();
    for (const u of tower.units) {
      if (u.posicao != null) posMap.set(u.posicao, (posMap.get(u.posicao) ?? 0) + 1);
    }
    const maxPos = posMap.size > 0 ? Math.max(...posMap.keys()) : 1;
    const pad = maxPos >= 1000 ? 4 : maxPos >= 100 ? 3 : 2;
    const positions = Array.from(posMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([posicao, count]) => ({ posicao, count, key: `${tower.id}-${posicao}`, label: posicao.toString().padStart(pad, "0") }));
    return { tower, positions, pad };
  });

  const inp = "w-16 rounded border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-1.5 py-1 text-xs outline-none focus:border-[var(--brand-accent)] text-center";
  const inpWide = "w-24 rounded border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-1.5 py-1 text-xs outline-none focus:border-[var(--brand-accent)]";

  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] shadow-sm overflow-hidden">
      <div role="button" tabIndex={0} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-[var(--shell-bg)] transition-colors">
        <div>
          <p className="text-sm font-semibold text-[var(--shell-text)]">Preencher em lote por posição</p>
          <p className="text-xs text-[var(--shell-subtext)]">Todas as unidades com o mesmo final (mesma posição na torre) recebem os mesmos valores</p>
        </div>
        <span className="text-[var(--shell-subtext)] text-lg">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="border-t border-[var(--shell-card-border)]">
          <p className="px-6 pt-4 text-xs text-[var(--shell-subtext)]">Deixe em branco os campos que não quer alterar. Clique em Aplicar por linha.</p>
          {towerGroups.map(({ tower, positions }) => (
            <div key={tower.id} className="px-6 py-4">
              {dev.towers.length > 1 && (
                <p className="text-[11px] font-bold text-[var(--shell-subtext)] uppercase tracking-wider mb-3">{tower.nome}</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--shell-card-border)]">
                      <th className="pb-2 pr-4 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Final</th>
                      <th className="pb-2 pr-4 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Qtd</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Área m²</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Qts</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Sts</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Bnh</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Vgs</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Vl. Venda (R$)</th>
                      <th className="pb-2 pr-2 text-left text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Vl. Avaliado (R$)</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(({ posicao, count, key, label }) => {
                      const v = values[key] ?? emptyPosValues();
                      const done = applied.has(key);
                      return (
                        <tr key={key} className="border-b border-[var(--shell-card-border)]/40">
                          <td className="py-2 pr-4">
                            <span className="font-mono font-bold text-[var(--shell-text)] text-xs">…{label}</span>
                          </td>
                          <td className="py-2 pr-4 text-[var(--shell-subtext)]">{count}×</td>
                          <td className="py-1.5 pr-2"><input className={inp} placeholder="—" value={v.areaM2} onChange={(e) => { setVal(key, "areaM2", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inp} placeholder="—" value={v.quartos} onChange={(e) => { setVal(key, "quartos", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inp} placeholder="—" value={v.suites} onChange={(e) => { setVal(key, "suites", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inp} placeholder="—" value={v.banheiros} onChange={(e) => { setVal(key, "banheiros", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inp} placeholder="—" value={v.vagas} onChange={(e) => { setVal(key, "vagas", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inpWide} placeholder="—" value={v.valorVenda} onChange={(e) => { setVal(key, "valorVenda", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pr-2"><input className={inpWide} placeholder="—" value={v.valorAvaliado} onChange={(e) => { setVal(key, "valorAvaliado", e.target.value); setApplied((p) => { const s = new Set(p); s.delete(key); return s; }); }} /></td>
                          <td className="py-1.5 pl-1 whitespace-nowrap">
                            {done ? (
                              <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">✓ Aplicado</span>
                            ) : (
                              <button onClick={() => apply(tower.id, posicao, key)} disabled={busy === key}
                                className="rounded-lg bg-[var(--brand-accent)] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                                {busy === key ? "..." : "Aplicar"}
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
      )}
    </div>
  );
}

// ─── Tabela de Preços ─────────────────────────────────────────────────────────

function exportUnitsCsv(dev: Development) {
  const sep = ";";
  const header = ["torre", "unidade", "andar", "area_m2", "quartos", "suites", "banheiros", "vagas", "valor_venda", "valor_avaliado"].join(sep);
  const rows = dev.towers.flatMap((t) =>
    t.units.map((u) =>
      [t.nome, u.nome, u.andar ?? "", u.areaM2 ?? "", u.quartos ?? "", u.suites ?? "", u.banheiros ?? "", u.vagas ?? "", u.valorVenda ?? "", u.valorAvaliado ?? ""].join(sep),
    ),
  );
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dev.nome.replace(/\s+/g, "_")}-precos.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && ch === sep) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseCsvNum(s: string): number | null {
  if (!s || s.trim() === "") return null;
  // Suporta formato brasileiro (1.234,56) e internacional (1234.56)
  const normalized = s.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return isNaN(n) ? null : n;
}

async function importUnitsCsv(file: File, dev: Development, onSaved: () => void, setImporting: (v: boolean) => void) {
  setImporting(true);
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { alert("Arquivo vazio ou sem dados."); return; }

    // Remove BOM e detecta delimitador pelo cabeçalho
    const rawHeader = lines[0].replace(/^﻿/, "");
    const sep = rawHeader.includes(";") ? ";" : ",";
    const headers = parseCsvLine(rawHeader, sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

    const unitMap = new Map<string, string>();
    for (const t of dev.towers) {
      for (const u of t.units) unitMap.set(u.nome.trim(), u.id);
    }

    const units: Array<{ id: string } & Partial<DevelopmentUnit>> = [];
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line, sep);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
      const id = unitMap.get(row["unidade"] ?? "");
      if (!id) continue;
      const entry: { id: string } & Partial<DevelopmentUnit> = { id };
      const areaM2 = parseCsvNum(row["area_m2"]);       if (areaM2 != null) (entry as any).areaM2 = areaM2;
      const quartos = parseCsvNum(row["quartos"]);       if (quartos != null) (entry as any).quartos = quartos;
      const suites = parseCsvNum(row["suites"]);         if (suites != null) (entry as any).suites = suites;
      const banheiros = parseCsvNum(row["banheiros"]);   if (banheiros != null) (entry as any).banheiros = banheiros;
      const vagas = parseCsvNum(row["vagas"]);           if (vagas != null) (entry as any).vagas = vagas;
      const valorVenda = parseCsvNum(row["valor_venda"]); if (valorVenda != null) (entry as any).valorVenda = valorVenda;
      const valorAvaliado = parseCsvNum(row["valor_avaliado"]); if (valorAvaliado != null) (entry as any).valorAvaliado = valorAvaliado;
      units.push(entry);
    }

    if (units.length === 0) { alert("Nenhuma unidade encontrada. Verifique se a coluna 'unidade' tem os nomes exatos (ex: Apto 101)."); return; }
    await bulkUpdateUnitsIndividual(dev.id, units);
    onSaved();
    alert(`${units.length} unidade(s) atualizadas com sucesso.`);
  } catch (e: any) {
    alert("Erro ao importar: " + (e?.message ?? e));
  } finally {
    setImporting(false);
  }
}

function PriceTable({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, Partial<DevelopmentUnit>>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--shell-subtext)]">Edite diretamente na tabela ou use as opções acima para preenchimento em lote.</p>
        <div className="flex gap-2">
          <button onClick={() => exportUnitsCsv(dev)}
            className="rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--shell-text)] hover:bg-[var(--shell-bg)] transition-colors">
            Exportar CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="rounded-lg border border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/20 disabled:opacity-50 transition-colors">
            {importing ? "Importando..." : "Importar CSV"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { e.target.value = ""; importUnitsCsv(f, dev, onSaved, setImporting); } }} />
        </div>
      </div>
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

// ─── Editor de Implantação (Fase 2) ──────────────────────────────────────────

async function waitForMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps) { resolve(); return; }
    const t = setInterval(() => { if (window.google?.maps) { clearInterval(t); resolve(); } }, 100);
  });
}

function ImplantacaoSatelite({ dev, towers, onReload }: { dev: Development; towers: Tower[]; onReload?: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const rectsRef = useRef<Map<string, any>>(new Map());
  const hasGps = !!(dev.lat && dev.lng);

  useEffect(() => {
    if (!hasGps || !mapRef.current) return;
    let cancelled = false;
    let map: any = null;

    async function init() {
      await waitForMaps();
      if (cancelled || !mapRef.current) return;

      map = new window.google.maps.Map(mapRef.current, {
        center: { lat: dev.lat!, lng: dev.lng! },
        zoom: 19, tilt: 0,
        mapTypeId: "satellite",
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      });

      // Renderiza shapes do terreno como fundo (não editáveis aqui)
      const terrainShapes: TerrainShape[] = (dev as any).terrainDesign?.shapes ?? [];
      terrainShapes.forEach((s) => {
        const c = SHAPE_COLORS[s.type];
        const path = s.points as { lat: number; lng: number }[];
        if (s.type === "RUA") {
          new window.google.maps.Polyline({
            path, strokeColor: c.stroke, strokeOpacity: 0.7, strokeWeight: 5,
            clickable: false, map,
          });
        } else if (path.length >= 3) {
          new window.google.maps.Polygon({
            paths: path,
            strokeColor: c.stroke, strokeOpacity: 0.8, strokeWeight: 2,
            fillColor: c.fill, fillOpacity: Math.max(c.opacity, 0.15),
            clickable: false, map,
          });
        }
      });

      const cosLat = Math.cos(dev.lat! * Math.PI / 180);
      const latPerM = 1 / 111320;
      const lngPerM = 1 / (111320 * cosLat);

      towers.forEach((t) => {
        const tLat = t.implantacaoLat ?? (dev.lat! + (t.offsetY ?? 0) * latPerM);
        const tLng = t.implantacaoLng ?? (dev.lng! + (t.offsetX ?? 0) * lngPerM);
        const halfLat = (t.profundidadeM / 2) * latPerM;
        const halfLng = (t.larguraM / 2) * lngPerM;

        const rect = new window.google.maps.Rectangle({
          bounds: {
            north: tLat + halfLat, south: tLat - halfLat,
            east: tLng + halfLng, west: tLng - halfLng,
          },
          editable: true, draggable: true,
          fillColor: "#2563eb", fillOpacity: 0.55,
          strokeColor: "#ffffff", strokeWeight: 2,
          map,
        });

        const label = new window.google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;color:#111;padding:2px 4px"><strong>${t.nome}</strong><br><small>${t.units.length} unid · ${dev.tipo === 'VERTICAL' ? `${t.floors} andares` : 'horizontal'}</small></div>`,
        });
        rect.addListener("click", () => {
          const b = rect.getBounds(); if (!b) return;
          label.setPosition(b.getCenter());
          label.open(map);
        });

        let saveTimer: any = null;
        rect.addListener("bounds_changed", () => {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(async () => {
            const b = rect.getBounds(); if (!b) return;
            const c = b.getCenter();
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            const newProfM = Math.max(1, Math.round((ne.lat() - sw.lat()) / latPerM));
            const newLargM = Math.max(1, Math.round((ne.lng() - sw.lng()) / lngPerM));
            try {
              await updateTower(dev.id, t.id, {
                implantacaoLat: c.lat(), implantacaoLng: c.lng(),
                larguraM: newLargM, profundidadeM: newProfM,
              });
            } catch (e) { console.error("Erro ao salvar torre:", e); }
          }, 600);
        });

        rectsRef.current.set(t.id, rect);
      });
    }

    init();
    return () => {
      cancelled = true;
      rectsRef.current.forEach((r) => r.setMap(null));
      rectsRef.current.clear();
    };
  }, [hasGps, dev.id, dev.lat, dev.lng, towers.map((t) => t.id).join(",")]);

  if (!hasGps) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
        <span>Salve as coordenadas GPS na aba/passo <strong>Localização</strong> e depois recarregue.</span>
        {onReload && (
          <button type="button" onClick={() => onReload()}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors">
            Recarregar
          </button>
        )}
      </div>
    );
  }
  if (towers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--shell-card-border)] p-6 text-center text-sm text-[var(--shell-subtext)]">
        Adicione pelo menos uma torre/quadra para posicionar no mapa.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--shell-subtext)]">
        Arraste cada retângulo azul para reposicionar; use os handles brancos para redimensionar. Mudanças são salvas automaticamente.
      </p>
      <div ref={mapRef} className="w-full h-96 rounded-xl overflow-hidden border border-[var(--shell-card-border)]" />
    </div>
  );
}

function ImplantacaoImagem({ dev, towers }: { dev: Development; towers: Tower[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ towerId: string; type: "move" | "resize"; startX: number; startY: number; init: { x: number; y: number; w: number; h: number } } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});

  function getRect(t: Tower) {
    if (overrides[t.id]) return overrides[t.id];
    return {
      x: t.implantacaoX ?? 0.4,
      y: t.implantacaoY ?? 0.4,
      w: t.implantacaoW ?? 0.2,
      h: t.implantacaoH ?? 0.15,
    };
  }
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  useEffect(() => {
    if (!drag) return;
    function onMove(e: MouseEvent) {
      if (!drag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      if (drag.type === "move") {
        setOverrides((p) => ({ ...p, [drag.towerId]: {
          x: clamp01(drag.init.x + dx), y: clamp01(drag.init.y + dy),
          w: drag.init.w, h: drag.init.h,
        }}));
      } else {
        setOverrides((p) => ({ ...p, [drag.towerId]: {
          x: drag.init.x, y: drag.init.y,
          w: clamp01(Math.max(0.02, drag.init.w + dx)),
          h: clamp01(Math.max(0.02, drag.init.h + dy)),
        }}));
      }
    }
    async function onUp() {
      const id = drag!.towerId;
      const r = overrides[id];
      setDrag(null);
      if (r) {
        try {
          await updateTower(dev.id, id, {
            implantacaoX: r.x, implantacaoY: r.y,
            implantacaoW: r.w, implantacaoH: r.h,
          });
        } catch (e) { console.error("Erro ao salvar torre:", e); }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, overrides, dev.id]);

  if (!dev.implantacaoUrl) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Faça upload da planta de implantação (no card de upload abaixo) para usar este modo.
      </div>
    );
  }
  if (towers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--shell-card-border)] p-6 text-center text-sm text-[var(--shell-subtext)]">
        Adicione pelo menos uma torre/quadra para posicionar sobre a planta.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--shell-subtext)]">
        Arraste o corpo da torre para mover · use o canto ◢ inferior direito para redimensionar.
      </p>
      <div ref={containerRef}
        className="relative inline-block w-full overflow-hidden rounded-xl border border-[var(--shell-card-border)] bg-slate-900 select-none">
        <img src={dev.implantacaoUrl} alt="Implantação" className="w-full h-auto block pointer-events-none" draggable={false} />
        {towers.map((t) => {
          const r = getRect(t);
          return (
            <div key={t.id}
              className="absolute border-2 border-white/90 shadow-lg cursor-move"
              style={{
                left: `${r.x * 100}%`, top: `${r.y * 100}%`,
                width: `${r.w * 100}%`, height: `${r.h * 100}%`,
                backgroundColor: "rgba(37,99,235,0.55)",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setDrag({ towerId: t.id, type: "move", startX: e.clientX, startY: e.clientY, init: r });
              }}>
              <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow pointer-events-none truncate px-1">
                {t.nome}
              </div>
              <div
                className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-white border border-[var(--brand-accent)] cursor-nwse-resize"
                onMouseDown={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setDrag({ towerId: t.id, type: "resize", startX: e.clientX, startY: e.clientY, init: r });
                }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Editor de Terreno (Fase 4) ──────────────────────────────────────────────

const SHAPE_COLORS: Record<TerrainShapeType, { fill: string; stroke: string; label: string; emoji: string; opacity: number }> = {
  CONTORNO: { fill: "#f59e0b", stroke: "#f59e0b", label: "Contorno",  emoji: "🔲", opacity: 0    },
  RUA:      { fill: "#374151", stroke: "#374151", label: "Rua",       emoji: "🛣️", opacity: 0.7  },
  JARDIM:   { fill: "#22c55e", stroke: "#16a34a", label: "Jardim",    emoji: "🌳", opacity: 0.45 },
  PISCINA:  { fill: "#0ea5e9", stroke: "#0284c7", label: "Piscina",   emoji: "🏊", opacity: 0.55 },
  SALAO:    { fill: "#fef3c7", stroke: "#a16207", label: "Salão",     emoji: "🏢", opacity: 0.65 },
  GARAGEM:  { fill: "#78716c", stroke: "#57534e", label: "Garagem",   emoji: "🚗", opacity: 0.4  },
  QUADRA:   { fill: "#fb923c", stroke: "#ea580c", label: "Quadra",    emoji: "⚽", opacity: 0.45 },
};

function newShapeId() { return Math.random().toString(36).slice(2, 10); }

function TerrenoSateliteCanvas({ dev, shapes, drawing, onAddPoint, onUpdateShape, onMoveDrawingPoint, onDeleteDrawingPoint }: {
  dev: Development; shapes: TerrainShape[]; drawing: TerrainShape | null;
  onAddPoint: (p: { lat: number; lng: number }) => void;
  onUpdateShape: (id: string, points: { lat: number; lng: number }[]) => void;
  onMoveDrawingPoint?: (idx: number, p: { lat: number; lng: number }) => void;
  onDeleteDrawingPoint?: (idx: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawingRef = useRef(drawing);
  const onAddPointRef = useRef(onAddPoint);
  const onUpdateRef = useRef(onUpdateShape);
  const onMoveDrawingPointRef = useRef(onMoveDrawingPoint);
  const onDeleteDrawingPointRef = useRef(onDeleteDrawingPoint);
  drawingRef.current = drawing;
  onAddPointRef.current = onAddPoint;
  onUpdateRef.current = onUpdateShape;
  onMoveDrawingPointRef.current = onMoveDrawingPoint;
  onDeleteDrawingPointRef.current = onDeleteDrawingPoint;

  const overlaysRef = useRef<any[]>([]);
  const drawingOverlaysRef = useRef<any[]>([]);
  const hasGps = !!(dev.lat && dev.lng);

  useEffect(() => {
    if (!hasGps || !mapRef.current) return;
    let cancelled = false;
    async function init() {
      await waitForMaps();
      if (cancelled || !mapRef.current) return;
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: dev.lat!, lng: dev.lng! },
        zoom: 19, tilt: 0, mapTypeId: "satellite",
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
        clickableIcons: false,
      });
      mapInstance.current = map;
      map.addListener("click", (e: any) => {
        if (drawingRef.current) {
          onAddPointRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });
    }
    init();
    return () => { cancelled = true; };
  }, [hasGps, dev.id]);

  // Render shapes confirmadas
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    shapes.forEach((s) => {
      const c = SHAPE_COLORS[s.type];
      const path = s.points as { lat: number; lng: number }[];
      const isLine = s.type === "RUA";
      const minPoints = isLine ? 2 : 3;
      let overlay: any;
      if (isLine) {
        overlay = new window.google.maps.Polyline({
          path, strokeColor: c.stroke, strokeOpacity: 0.95, strokeWeight: 7,
          editable: true, draggable: true,
          map,
        });
      } else {
        overlay = new window.google.maps.Polygon({
          paths: path,
          strokeColor: c.stroke, strokeOpacity: 1, strokeWeight: 2,
          fillColor: c.fill, fillOpacity: c.opacity,
          editable: true, draggable: true,
          map,
        });
      }

      const pathArr = isLine ? overlay.getPath() : overlay.getPaths().getAt(0);
      let saveTimer: any = null;
      const persistPath = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const len = pathArr.getLength();
          const pts: { lat: number; lng: number }[] = [];
          for (let i = 0; i < len; i++) {
            const ll = pathArr.getAt(i);
            pts.push({ lat: ll.lat(), lng: ll.lng() });
          }
          onUpdateRef.current(s.id, pts);
        }, 800);
      };
      pathArr.addListener("set_at", persistPath);
      pathArr.addListener("insert_at", persistPath);
      pathArr.addListener("remove_at", persistPath);
      overlay.addListener("dragend", persistPath);

      // Right-click no vértice → remover
      overlay.addListener("rightclick", (e: any) => {
        if (e.vertex !== undefined) {
          if (pathArr.getLength() <= minPoints) {
            alert(`Mínimo ${minPoints} pontos.`);
            return;
          }
          pathArr.removeAt(e.vertex);
        }
      });

      overlaysRef.current.push(overlay);
    });
  }, [shapes]);

  // Render drawing em andamento
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    drawingOverlaysRef.current.forEach((o) => o.setMap(null));
    drawingOverlaysRef.current = [];

    if (!drawing || drawing.points.length === 0) return;
    const c = SHAPE_COLORS[drawing.type];
    const path = drawing.points as { lat: number; lng: number }[];
    const line = new window.google.maps.Polyline({
      path, strokeColor: c.stroke, strokeOpacity: 0.9, strokeWeight: 3, map,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "10px" }],
    });
    drawingOverlaysRef.current.push(line);
    path.forEach((p, i) => {
      const m = new window.google.maps.Marker({
        position: p, map,
        label: { text: String(i + 1), color: "#fff", fontSize: "10px", fontWeight: "700" },
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: c.stroke, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
        draggable: true,
        title: "Arraste para mover · botão direito para excluir",
      });
      m.addListener("dragend", (e: any) => {
        onMoveDrawingPointRef.current?.(i, { lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      m.addListener("rightclick", () => {
        onDeleteDrawingPointRef.current?.(i);
      });
      // Clique no marcador NÃO adiciona ponto novo (stopPropagation via marker)
      drawingOverlaysRef.current.push(m);
    });
  }, [drawing]);

  if (!hasGps) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Defina o GPS do empreendimento (na seção Localização) para desenhar sobre o satélite.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div ref={mapRef}
        className={`w-full h-96 rounded-xl overflow-hidden border border-[var(--shell-card-border)] ${drawing ? "cursor-crosshair" : ""}`} />
      {drawing && (
        <p className="text-[11px] text-[var(--shell-subtext)]">
          Clique no mapa para adicionar pontos · <strong>arraste</strong> um ponto numerado para mover · <strong>botão direito</strong> num ponto para excluir
        </p>
      )}
      {!drawing && shapes.length > 0 && (
        <p className="text-[11px] text-[var(--shell-subtext)]">
          💡 Arraste os <strong>vértices brancos</strong> para mover · clique nos <strong>pontos translúcidos do meio</strong> de uma aresta para inserir vértice · <strong>botão direito</strong> num vértice para remover · <strong>⧉</strong> na lista abaixo para duplicar
        </p>
      )}
    </div>
  );
}

function TerrenoImagemCanvas({ dev, shapes, drawing, onAddPoint, onUpdateShape, onMoveDrawingPoint, onDeleteDrawingPoint }: {
  dev: Development; shapes: TerrainShape[]; drawing: TerrainShape | null;
  onAddPoint: (p: { x: number; y: number }) => void;
  onUpdateShape: (id: string, points: { x: number; y: number }[]) => void;
  onMoveDrawingPoint?: (idx: number, p: { x: number; y: number }) => void;
  onDeleteDrawingPoint?: (idx: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragVertex, setDragVertex] = useState<{ shapeId: string; vIdx: number } | null>(null);
  const [dragDrawingPt, setDragDrawingPt] = useState<number | null>(null); // idx do ponto do drawing sendo arrastado
  const [localShapes, setLocalShapes] = useState<TerrainShape[] | null>(null);
  const [localDrawing, setLocalDrawing] = useState<TerrainShape | null>(null); // cópia local durante drag de ponto do drawing

  // Sincroniza localShapes com props quando shapes muda externamente
  useEffect(() => { setLocalShapes(null); }, [shapes]);
  // Limpa localDrawing quando drawing muda (terminou ou cancelou)
  useEffect(() => { setLocalDrawing(null); }, [drawing]);

  const renderedShapes = localShapes ?? shapes;

  function getXY(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleContainerClick(e: React.MouseEvent) {
    if (!drawing) return;
    if (dragDrawingPt !== null) return; // arrastou um ponto — não adiciona
    const p = getXY(e);
    if (p) onAddPoint(p);
  }

  // Inserir vértice no meio de uma aresta
  function insertVertex(shapeId: string, afterIdx: number, p: { x: number; y: number }) {
    const next = renderedShapes.map((s) => {
      if (s.id !== shapeId) return s;
      const pts = (s.points as { x: number; y: number }[]).slice();
      pts.splice(afterIdx + 1, 0, p);
      return { ...s, points: pts };
    });
    setLocalShapes(next);
    const target = next.find((s) => s.id === shapeId)!;
    onUpdateShape(shapeId, target.points as any);
  }

  function deleteVertex(shapeId: string, vIdx: number) {
    const target = renderedShapes.find((s) => s.id === shapeId);
    if (!target) return;
    const min = target.type === "RUA" ? 2 : 3;
    if (target.points.length <= min) { alert(`Mínimo ${min} pontos.`); return; }
    const next = renderedShapes.map((s) =>
      s.id !== shapeId ? s : { ...s, points: (s.points as any[]).filter((_, i) => i !== vIdx) }
    );
    setLocalShapes(next);
    const t = next.find((s) => s.id === shapeId)!;
    onUpdateShape(shapeId, t.points as any);
  }

  // Drag de vértice de shape finalizada
  useEffect(() => {
    if (!dragVertex) return;
    function onMove(e: MouseEvent) {
      const p = getXY(e);
      if (!p || !dragVertex) return;
      setLocalShapes((prev) => {
        const base = prev ?? shapes;
        return base.map((s) => {
          if (s.id !== dragVertex.shapeId) return s;
          const pts = (s.points as { x: number; y: number }[]).slice();
          pts[dragVertex.vIdx] = p;
          return { ...s, points: pts };
        });
      });
    }
    function onUp() {
      setDragVertex((cur) => {
        if (cur) {
          const target = (localShapes ?? shapes).find((s) => s.id === cur.shapeId);
          if (target) onUpdateShape(cur.shapeId, target.points as any);
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragVertex, localShapes, shapes, onUpdateShape]);

  // Drag de ponto durante o desenho
  useEffect(() => {
    if (dragDrawingPt === null || !drawing) return;
    const capturedIdx = dragDrawingPt;
    function onMove(e: MouseEvent) {
      const p = getXY(e);
      if (!p) return;
      setLocalDrawing((prev) => {
        const base = prev ?? drawing!;
        const pts = [...base.points] as any[];
        pts[capturedIdx] = p;
        return { ...base, points: pts };
      });
    }
    function onUp() {
      setDragDrawingPt((cur) => {
        if (cur !== null) {
          setLocalDrawing((ld) => {
            if (ld) onMoveDrawingPoint?.(cur, (ld.points as any[])[cur]);
            return null;
          });
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragDrawingPt, drawing, onMoveDrawingPoint]);

  if (!dev.implantacaoUrl) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        Faça upload da planta de implantação para desenhar sobre ela.
      </div>
    );
  }

  // Helper: midpoint entre 2 pontos
  function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  return (
    <div ref={containerRef} onClick={handleContainerClick}
      className={`relative inline-block w-full overflow-hidden rounded-xl border border-[var(--shell-card-border)] bg-slate-900 select-none ${drawing ? "cursor-crosshair" : ""}`}>
      <img src={dev.implantacaoUrl} alt="Implantação" className="w-full h-auto block pointer-events-none" draggable={false} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ pointerEvents: drawing ? "none" : "auto" }}>
        {/* Shapes confirmadas */}
        {renderedShapes.map((s) => {
          const c = SHAPE_COLORS[s.type];
          const pts = s.points as { x: number; y: number }[];
          const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
          const isLine = s.type === "RUA";
          return (
            <g key={s.id} style={{ pointerEvents: drawing ? "none" : "auto" }}>
              {isLine ? (
                <polyline points={ptsStr} stroke={c.stroke} strokeWidth="0.008" strokeOpacity="0.95" strokeLinecap="round" fill="none" />
              ) : (
                <polygon points={ptsStr} stroke={c.stroke} strokeWidth="0.003" fill={c.fill} fillOpacity={c.opacity} />
              )}
              {/* Pontos intermediários (clicar para inserir vértice) */}
              {pts.map((p, i) => {
                const next = isLine ? (i < pts.length - 1 ? pts[i + 1] : null) : pts[(i + 1) % pts.length];
                if (!next) return null;
                const mp = midpoint(p, next);
                return (
                  <circle key={`m-${i}`} cx={mp.x} cy={mp.y} r="0.005"
                    fill="rgba(255,255,255,0.5)" stroke={c.stroke} strokeWidth="0.0015"
                    style={{ cursor: "copy" }}
                    onClick={(e) => { e.stopPropagation(); insertVertex(s.id, i, mp); }} />
                );
              })}
              {/* Vértices */}
              {pts.map((p, i) => (
                <circle key={`v-${i}`} cx={p.x} cy={p.y} r="0.009"
                  fill={c.stroke} stroke="#fff" strokeWidth="0.002"
                  style={{ cursor: "move" }}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragVertex({ shapeId: s.id, vIdx: i }); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteVertex(s.id, i); }} />
              ))}
            </g>
          );
        })}

        {/* Drawing em andamento */}
        {(drawing || localDrawing) && (() => {
          const d = localDrawing ?? drawing!;
          const c = SHAPE_COLORS[d.type];
          const dpts = d.points as { x: number; y: number }[];
          return dpts.length > 0 ? (
            <g style={{ pointerEvents: "auto" }}>
              <polyline
                points={dpts.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={c.stroke} strokeWidth="0.005"
                strokeDasharray="0.012,0.008" fill="none" style={{ pointerEvents: "none" }} />
              {dpts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="0.012" fill="transparent"
                    style={{ cursor: "move", pointerEvents: "all" }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragDrawingPt(i); }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteDrawingPoint?.(i); }} />
                  <circle cx={p.x} cy={p.y} r="0.008" fill={c.stroke} stroke="#fff" strokeWidth="0.002" style={{ pointerEvents: "none" }} />
                  <text x={p.x} y={p.y + 0.003} textAnchor="middle" fontSize="0.012" fill="#fff" fontWeight="700" style={{ pointerEvents: "none" }}>{i + 1}</text>
                </g>
              ))}
            </g>
          ) : null;
        })()}
      </svg>
      {drawing && (
        <div className="absolute bottom-2 left-2 right-2 rounded-md bg-slate-900/85 px-3 py-1.5 text-[10px] text-white pointer-events-none">
          Clique na imagem para adicionar pontos · <strong>arraste</strong> um ponto numerado para mover · <strong>botão direito</strong> para excluir
        </div>
      )}
      {!drawing && renderedShapes.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 rounded-md bg-slate-900/85 px-3 py-1.5 text-[10px] text-white pointer-events-none">
          Arraste os pontos coloridos para mover · clique nos pontos brancos pequenos para inserir vértice · botão direito num vértice para remover · <strong>⧉</strong> na lista para duplicar
        </div>
      )}
    </div>
  );
}


function Stepper({ completeness, current, onJump }: {
  completeness: Completeness; current: number; onJump: (step: number) => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
      {STEP_LABELS.map((label, i) => {
        const done = completeness.steps[i];
        const isCurrent = i === current;
        return (
          <div key={i} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button type="button" onClick={() => onJump(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isCurrent ? "bg-[var(--brand-accent)] text-white shadow"
                  : done ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60"
                  : "bg-[var(--shell-bg)] text-[var(--shell-subtext)] border border-[var(--shell-card-border)] hover:bg-[var(--shell-hover)]"
              }`}>
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                isCurrent ? "bg-white text-[var(--brand-accent)]"
                  : done ? "bg-green-500 text-white"
                  : "bg-[var(--shell-card-border)] text-[var(--shell-subtext)]"
              }`}>{done ? "✓" : i + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-px w-4 sm:w-8 ${done ? "bg-green-400" : "bg-[var(--shell-card-border)]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── StepHandle ──────────────────────────────────────────────────────────────

type StepHandle = { save: () => Promise<boolean> };

// ─── Step 1 — Identificação ──────────────────────────────────────────────────

const Step1Identificacao = forwardRef(function Step1Identificacao(
  { dev, onSaved, embeddedSubmit }: { dev: Development; onSaved: () => void; embeddedSubmit?: boolean },
  ref: ForwardedRef<StepHandle>,
) {
  const [nome, setNome] = useState(dev.nome ?? "");
  const [tipo, setTipo] = useState(dev.tipo);
  const [subtipo, setSubtipo] = useState(dev.subtipo);
  const [status, setStatus] = useState(dev.status);
  const [prazoEntrega, setPrazoEntrega] = useState(dev.prazoEntrega ? dev.prazoEntrega.split("T")[0] : "");
  const [descricao, setDescricao] = useState(dev.descricao ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      await updateDevelopment(dev.id, {
        nome: nome || undefined, tipo, subtipo, status,
        prazoEntrega: prazoEntrega || undefined,
        descricao: descricao || undefined,
      } as any);
      setSaved(true);
      await onSaved();
      return true;
    } catch (e: any) { alert("Erro ao salvar: " + (e?.message ?? e)); return false; }
    finally { setSaving(false); }
  }

  useImperativeHandle(ref, () => ({ save }), [nome, tipo, subtipo, status, prazoEntrega, descricao, dev.id]);

  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm max-w-2xl">
      <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Identificação</p>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nome *</label>
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
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Previsão de entrega *</label>
          <input type="date" value={prazoEntrega} onChange={(e) => { setPrazoEntrega(e.target.value); setSaved(false); }} className={inp} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Descrição (opcional)</label>
        <textarea value={descricao} onChange={(e) => { setDescricao(e.target.value); setSaved(false); }} rows={3}
          className={`${inp} resize-none`} placeholder="Breve descrição do empreendimento..." />
      </div>
      {embeddedSubmit && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="rounded-xl bg-[var(--brand-accent)] px-7 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
});

// ─── Step 2 — Localização (com 2 marcadores) ─────────────────────────────────

type MarkerMode = "CENTRO" | "ENTRADA";

const Step2Localizacao = forwardRef(function Step2Localizacao(
  { dev, onSaved, embeddedSubmit }: { dev: Development; onSaved: () => void; embeddedSubmit?: boolean },
  ref: ForwardedRef<StepHandle>,
) {
  const [endereco, setEndereco] = useState(dev.endereco ?? "");
  const [cidade, setCidade] = useState(dev.cidade ?? "");
  const [estado, setEstado] = useState(dev.estado ?? "");
  const [lat, setLat] = useState<number | null>(dev.lat ?? null);
  const [lng, setLng] = useState<number | null>(dev.lng ?? null);
  const [entLat, setEntLat] = useState<number | null>(dev.entranceLat ?? null);
  const [entLng, setEntLng] = useState<number | null>(dev.entranceLng ?? null);
  const [markerMode, setMarkerMode] = useState<MarkerMode>("CENTRO");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const centerMarkerRef = useRef<any>(null);
  const entranceMarkerRef = useRef<any>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const markerModeRef = useRef<MarkerMode>(markerMode);
  markerModeRef.current = markerMode;

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || !mapRef.current) return;
    function doInit() {
      if (!mapRef.current || !window.google?.maps) return;
      const center = lat && lng ? { lat, lng } : { lat: -15.7942, lng: -47.8822 };
      const map = new window.google.maps.Map(mapRef.current!, {
        center, zoom: 16, mapTypeId: "satellite", tilt: 0,
        zoomControl: true, mapTypeControl: false, streetViewControl: false,
      });
      mapInstanceRef.current = map;

      const cMarker = new window.google.maps.Marker({
        map, position: lat && lng ? { lat, lng } : undefined,
        draggable: true, visible: !!(lat && lng),
        title: "Centro do empreendimento",
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: "#2563eb", fillOpacity: 0.95, strokeColor: "#fff", strokeWeight: 3 },
      });
      centerMarkerRef.current = cMarker;
      cMarker.addListener("dragend", (e: any) => { setLat(e.latLng.lat()); setLng(e.latLng.lng()); setSaved(false); });

      const eMarker = new window.google.maps.Marker({
        map, position: entLat && entLng ? { lat: entLat, lng: entLng } : undefined,
        draggable: true, visible: !!(entLat && entLng),
        title: "Entrada principal",
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: "#f97316", fillOpacity: 0.95, strokeColor: "#fff", strokeWeight: 3 },
      });
      entranceMarkerRef.current = eMarker;
      eMarker.addListener("dragend", (e: any) => { setEntLat(e.latLng.lat()); setEntLng(e.latLng.lng()); setSaved(false); });

      map.addListener("click", (e: any) => {
        const la = e.latLng.lat(); const ln = e.latLng.lng();
        if (markerModeRef.current === "CENTRO") {
          setLat(la); setLng(ln);
          cMarker.setPosition({ lat: la, lng: ln }); cMarker.setVisible(true);
        } else {
          setEntLat(la); setEntLng(ln);
          eMarker.setPosition({ lat: la, lng: ln }); eMarker.setVisible(true);
        }
        setSaved(false);
      });

      if (window.google.maps.places && addressInputRef.current) {
        const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          types: ["geocode"], componentRestrictions: { country: "br" },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const la = place.geometry.location.lat();
          const ln = place.geometry.location.lng();
          setLat(la); setLng(ln);
          map.setCenter({ lat: la, lng: ln }); map.setZoom(17);
          cMarker.setPosition({ lat: la, lng: ln }); cMarker.setVisible(true);
          const comps = place.address_components ?? [];
          const get = (type: string) => comps.find((c: any) => c.types.includes(type))?.long_name ?? "";
          const getShort = (type: string) => comps.find((c: any) => c.types.includes(type))?.short_name ?? "";
          setEndereco(place.formatted_address ?? "");
          setCidade(get("administrative_area_level_2") || get("locality"));
          setEstado(getShort("administrative_area_level_1"));
          setSaved(false);
        });
      }
    }
    if (window.google?.maps) { doInit(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google?.maps) { clearInterval(wait); doInit(); } }, 100);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places,geometry`;
    script.async = true; script.onload = doInit;
    document.head.appendChild(script);
  }, []);

  // Salva apenas as coordenadas silenciosamente (onBlur dos inputs de lat/lng)
  const latRef = useRef(lat); latRef.current = lat;
  const lngRef = useRef(lng); lngRef.current = lng;
  const entLatRef = useRef(entLat); entLatRef.current = entLat;
  const entLngRef = useRef(entLng); entLngRef.current = entLng;

  async function saveLatLng() {
    try {
      await updateDevelopment(dev.id, {
        lat: latRef.current ?? null, lng: lngRef.current ?? null,
        entranceLat: entLatRef.current ?? null, entranceLng: entLngRef.current ?? null,
      } as any);
      setSaved(false); // marca que há dados salvos mas outros campos ainda podem ter alterações
    } catch { /* silencioso — o save completo vai capturar o erro */ }
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      await updateDevelopment(dev.id, {
        endereco: endereco || undefined,
        cidade: cidade || undefined,
        estado: estado || undefined,
        lat: latRef.current ?? null, lng: lngRef.current ?? null,
        entranceLat: entLatRef.current ?? null, entranceLng: entLngRef.current ?? null,
      } as any);
      setSaved(true);
      await onSaved();
      return true;
    } catch (e: any) { alert("Erro ao salvar: " + (e?.message ?? e)); return false; }
    finally { setSaving(false); }
  }

  useImperativeHandle(ref, () => ({ save }), [endereco, cidade, estado, lat, lng, entLat, entLng, dev.id]);

  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm max-w-3xl">
      <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Localização</p>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Endereço *</label>
        <input ref={addressInputRef} value={endereco} onChange={(e) => { setEndereco(e.target.value); setSaved(false); }} placeholder="Digite para buscar no mapa..." className={inp} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Cidade *</label>
          <input value={cidade} onChange={(e) => { setCidade(e.target.value); setSaved(false); }} placeholder="São Paulo" className={inp} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Estado *</label>
          <input value={estado} onChange={(e) => { setEstado(e.target.value); setSaved(false); }} maxLength={2} placeholder="SP" className={inp} />
        </div>
      </div>
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Localização no mapa</label>
            <div className="flex rounded-lg border border-[var(--shell-card-border)] overflow-hidden text-xs">
              {[
                { k: "CENTRO" as MarkerMode, l: "🟦 Centro do terreno" },
                { k: "ENTRADA" as MarkerMode, l: "🟧 Entrada principal" },
              ].map(({ k, l }) => (
                <button key={k} type="button" onClick={() => setMarkerMode(k)}
                  className={`px-3 py-1.5 font-medium transition-colors ${markerMode === k ? "bg-[var(--brand-accent)] text-white" : "text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {/* Inputs numéricos de lat/lng — ficam ACIMA do mapa para fácil preenchimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--shell-card-border)] p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--shell-subtext)]">🟦 Centro do terreno</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--shell-subtext)]">Latitude</label>
                  <input type="number" step="any" value={lat ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      const newLat = isNaN(v as number) ? null : v;
                      setLat(newLat); setSaved(false);
                      if (newLat != null && lng != null && mapInstanceRef.current) {
                        centerMarkerRef.current?.setPosition({ lat: newLat, lng });
                        centerMarkerRef.current?.setVisible(true);
                        mapInstanceRef.current.panTo({ lat: newLat, lng });
                        if ((mapInstanceRef.current.getZoom() ?? 0) < 15) mapInstanceRef.current.setZoom(17);
                      }
                    }}
                    onBlur={saveLatLng}
                    placeholder="-23.550520" className={`${inp} text-xs py-1.5`} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--shell-subtext)]">Longitude</label>
                  <input type="number" step="any" value={lng ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      const newLng = isNaN(v as number) ? null : v;
                      setLng(newLng); setSaved(false);
                      if (lat != null && newLng != null && mapInstanceRef.current) {
                        centerMarkerRef.current?.setPosition({ lat, lng: newLng });
                        centerMarkerRef.current?.setVisible(true);
                        mapInstanceRef.current.panTo({ lat, lng: newLng });
                        if ((mapInstanceRef.current.getZoom() ?? 0) < 15) mapInstanceRef.current.setZoom(17);
                      }
                    }}
                    onBlur={saveLatLng}
                    placeholder="-46.633608" className={`${inp} text-xs py-1.5`} />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--shell-card-border)] p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--shell-subtext)]">🟧 Entrada principal</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--shell-subtext)]">Latitude</label>
                  <input type="number" step="any" value={entLat ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      const newLat = isNaN(v as number) ? null : v;
                      setEntLat(newLat); setSaved(false);
                      if (newLat != null && entLng != null && mapInstanceRef.current) {
                        entranceMarkerRef.current?.setPosition({ lat: newLat, lng: entLng });
                        entranceMarkerRef.current?.setVisible(true);
                        mapInstanceRef.current.panTo({ lat: newLat, lng: entLng });
                        if ((mapInstanceRef.current.getZoom() ?? 0) < 15) mapInstanceRef.current.setZoom(17);
                      }
                    }}
                    onBlur={saveLatLng}
                    placeholder="-23.550520" className={`${inp} text-xs py-1.5`} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--shell-subtext)]">Longitude</label>
                  <input type="number" step="any" value={entLng ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : parseFloat(e.target.value);
                      const newLng = isNaN(v as number) ? null : v;
                      setEntLng(newLng); setSaved(false);
                      if (entLat != null && newLng != null && mapInstanceRef.current) {
                        entranceMarkerRef.current?.setPosition({ lat: entLat, lng: newLng });
                        entranceMarkerRef.current?.setVisible(true);
                        mapInstanceRef.current.panTo({ lat: entLat, lng: newLng });
                        if ((mapInstanceRef.current.getZoom() ?? 0) < 15) mapInstanceRef.current.setZoom(17);
                      }
                    }}
                    onBlur={saveLatLng}
                    placeholder="-46.633608" className={`${inp} text-xs py-1.5`} />
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[var(--shell-subtext)]">
            Preencha as coordenadas acima ou clique no mapa. Você também pode <strong>arrastar</strong> os marcadores para ajustar.
            A entrada principal define onde o passeio Street View começa.
          </p>
          <div ref={mapRef} className="w-full h-72 rounded-xl overflow-hidden border border-[var(--shell-card-border)]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">Latitude</label>
            <input type="number" step="any" value={lat ?? ""} onChange={(e) => { setLat(parseFloat(e.target.value) || null); setSaved(false); }} onBlur={saveLatLng} className={inp} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--shell-subtext)]">Longitude</label>
            <input type="number" step="any" value={lng ?? ""} onChange={(e) => { setLng(parseFloat(e.target.value) || null); setSaved(false); }} onBlur={saveLatLng} className={inp} />
          </div>
        </div>
      )}
      {embeddedSubmit && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="rounded-xl bg-[var(--brand-accent)] px-7 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
});

// ─── Step 3 — Layout ─────────────────────────────────────────────────────────

function Step3Layout({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  return (
    <div className="space-y-5 max-w-3xl">
      <Step3TowersManager dev={dev} onSaved={onSaved} />
    </div>
  );
}

// ─── TowerConfigModal ─────────────────────────────────────────────────────────

const FACADE_COLORS = [
  "#f5f5f0", "#e5e7eb", "#d4d4d4", "#fef3c7", "#fde68a",
  "#dbeafe", "#bfdbfe", "#bbf7d0", "#fecaca", "#e9d5ff",
  "#fed7aa", "#a7f3d0", "#99f6e4", "#c7d2fe", "#fda4af",
];

const BALCONY_OPTS: { value: string; label: string; icon: string }[] = [
  { value: "NONE",      label: "Nenhuma",    icon: "⬛" },
  { value: "LAJE",      label: "Laje",       icon: "🏗️" },
  { value: "VIDRO",     label: "Vidro",      icon: "🪟" },
  { value: "FRANCESA",  label: "Francesa",   icon: "🌿" },
];

const ROOF_OPTS: { value: string; label: string; icon: string }[] = [
  { value: "PLANO",     label: "Plano",      icon: "▬" },
  { value: "INCLINADO", label: "Inclinado",  icon: "⛺" },
  { value: "PIRAMIDE",  label: "Pirâmide",   icon: "🔺" },
];

type CellType = "APT" | "HALL" | "EMPTY";

function FloorPlanEditor({
  cols, rows, cells, onChangeCols, onChangeRows, onToggleCell,
}: {
  cols: number; rows: number; cells: CellType[];
  onChangeCols: (v: number) => void;
  onChangeRows: (v: number) => void;
  onToggleCell: (idx: number) => void;
}) {
  const CYCLE: Record<CellType, CellType> = { APT: "HALL", HALL: "EMPTY", EMPTY: "APT" };
  const CELL_COLOR: Record<CellType, string> = {
    APT: "bg-blue-400 text-white",
    HALL: "bg-amber-300 text-amber-900",
    EMPTY: "bg-[var(--shell-bg)] text-[var(--shell-subtext)] border border-dashed border-[var(--shell-card-border)]",
  };
  const CELL_LABEL: Record<CellType, string> = { APT: "A", HALL: "H", EMPTY: "" };

  const aptCount = cells.filter((c) => c === "APT").length;
  const hallCount = cells.filter((c) => c === "HALL").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[var(--shell-subtext)]">Colunas</label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChangeCols(Math.max(1, cols - 1))}
              className="w-7 h-7 rounded border border-[var(--shell-card-border)] text-sm font-bold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] flex items-center justify-center">−</button>
            <span className="w-6 text-center text-sm font-bold text-[var(--shell-text)]">{cols}</span>
            <button type="button" onClick={() => onChangeCols(Math.min(8, cols + 1))}
              className="w-7 h-7 rounded border border-[var(--shell-card-border)] text-sm font-bold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] flex items-center justify-center">+</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[var(--shell-subtext)]">Linhas</label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChangeRows(Math.max(1, rows - 1))}
              className="w-7 h-7 rounded border border-[var(--shell-card-border)] text-sm font-bold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] flex items-center justify-center">−</button>
            <span className="w-6 text-center text-sm font-bold text-[var(--shell-text)]">{rows}</span>
            <button type="button" onClick={() => onChangeRows(Math.min(4, rows + 1))}
              className="w-7 h-7 rounded border border-[var(--shell-card-border)] text-sm font-bold text-[var(--shell-text)] hover:bg-[var(--shell-hover)] flex items-center justify-center">+</button>
          </div>
        </div>
        <div className="ml-auto text-xs text-[var(--shell-subtext)]">
          <span className="font-bold text-blue-500">{aptCount}</span> apto{aptCount !== 1 ? "s" : ""}
          {hallCount > 0 && <> · <span className="font-bold text-amber-600">{hallCount}</span> hall</>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {cells.map((cell, idx) => (
            <button key={idx} type="button"
              title={`Clique para alternar: APT → HALL → EMPTY`}
              onClick={() => onToggleCell(idx)}
              className={`w-10 h-10 rounded text-xs font-bold transition-colors ${CELL_COLOR[cell]}`}>
              {CELL_LABEL[cell]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 text-[10px] text-[var(--shell-subtext)]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> Apartamento</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-300 inline-block" /> Hall/Circulação</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-dashed border-[var(--shell-card-border)] bg-[var(--shell-bg)] inline-block" /> Vazio</span>
      </div>
    </div>
  );
}

function Tower3DPreview({ cols, rows, floors, facadeColor, balconyType, roofType, hasLobby }: {
  cols: number; rows: number; floors: number; facadeColor: string;
  balconyType: string; roofType: string; hasLobby: boolean;
}) {
  const totalFloors = floors + (hasLobby ? 1 : 0);
  const W = Math.max(80, cols * 22);
  const H = Math.max(60, totalFloors * 14 + 30);
  const lobbyH = 20;
  const floorH = 14;
  const wallW = W;
  const svgH = H + 40;

  const balconyLines: React.ReactElement[] = [];
  if (balconyType !== "NONE") {
    for (let f = hasLobby ? 1 : 0; f < totalFloors; f++) {
      const y = svgH - 10 - lobbyH - f * floorH - floorH;
      balconyLines.push(
        <rect key={f} x={2} y={y + floorH - 4} width={wallW - 4} height={4}
          fill={balconyType === "VIDRO" ? "#93c5fd88" : balconyType === "FRANCESA" ? "#6ee7b7" : "#9ca3af"}
          rx={1} />
      );
    }
  }

  const roofPath = roofType === "INCLINADO"
    ? `M0,0 L${wallW / 2},-16 L${wallW},0 Z`
    : roofType === "PIRAMIDE"
    ? `M0,0 L${wallW / 2},-20 L${wallW},0 Z`
    : null;

  return (
    <svg width={wallW + 4} height={svgH} className="mx-auto" style={{ display: "block" }}>
      {/* lobby */}
      {hasLobby && (
        <rect x={2} y={svgH - 10 - lobbyH} width={wallW} height={lobbyH}
          fill="#d1d5db" stroke="#9ca3af" strokeWidth={1} rx={2} />
      )}
      {/* floors */}
      {Array.from({ length: floors }).map((_, fi) => {
        const y = svgH - 10 - lobbyH - (fi + 1) * floorH;
        return (
          <g key={fi}>
            <rect x={2} y={y} width={wallW} height={floorH}
              fill={facadeColor} stroke="#9ca3af" strokeWidth={0.5} />
            {Array.from({ length: cols }).map((_, ci) => (
              <rect key={ci} x={2 + ci * (wallW / cols) + 2} y={y + 2}
                width={wallW / cols - 4} height={floorH - 6}
                fill="#bfdbfe88" stroke="#93c5fd" strokeWidth={0.5} rx={1} />
            ))}
          </g>
        );
      })}
      {balconyLines}
      {/* roof */}
      {roofPath && (
        <g transform={`translate(2, ${svgH - 10 - lobbyH - floors * floorH})`}>
          <path d={roofPath} fill="#6b7280" />
        </g>
      )}
      {/* ground */}
      <rect x={0} y={svgH - 10} width={wallW + 4} height={4} fill="#9ca3af" rx={1} />
    </svg>
  );
}

function TowerConfigModal({ dev, tower, onClose, onSaved }: {
  dev: Development;
  tower?: Tower;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isVertical = dev.tipo === "VERTICAL";
  const towerLabel = isVertical ? "Torre" : "Quadra";
  const isEdit = !!tower;

  const initCells = (c: number, r: number, existing?: CellType[]): CellType[] => {
    const total = c * r;
    if (existing && existing.length === total) return existing;
    return Array.from({ length: total }, (_, i) => {
      if (c > 2 && r > 1 && Math.floor(i / c) === Math.floor(r / 2) && i % c === Math.floor(c / 2)) return "HALL";
      return "APT";
    });
  };

  const existingFP = tower?.floorPlan;
  const [nome, setNome]               = useState(tower?.nome ?? "");
  const [floors, setFloors]           = useState(String(tower?.floors ?? 10));
  const [alturaAndar, setAlturaAndar] = useState(String(tower?.alturaAndarM ?? 3));
  const [hasLobby, setHasLobby]       = useState(tower?.hasLobbyFloor ?? false);
  const [posicaoPad, setPosicaoPad]   = useState(tower?.posicaoPad ?? 2);
  const [posicaoFinalMap, setPosicaoFinalMap] = useState<number[]>(() => {
    if (Array.isArray((tower as any)?.posicaoFinalMap)) return (tower as any).posicaoFinalMap as number[];
    const n = tower?.unitsPerFloor ?? 4;
    return Array.from({ length: n }, (_, i) => i + 1);
  });
  const [prefixoUnidade, setPrefixoUnidade]           = useState<string>((tower as any)?.prefixoUnidade ?? "");
  const [andarInicialContagem, setAndarInicialContagem] = useState<string>((tower as any)?.andarInicialContagem ?? "PRIMEIRO_PAV");
  const [andarInicialDisplay, setAndarInicialDisplay]   = useState<number>(Number((tower as any)?.andarInicialDisplay ?? 1));
  const [subsoloDisplay, setSubsoloDisplay]             = useState<string>((tower as any)?.subsoloDisplay ?? "PREFIXO_S");

  const [fases, setFases] = useState<FaseConfig[]>(() => {
    const cfg = tower?.fasesConfig;
    if (Array.isArray(cfg) && cfg.length > 0) return cfg as FaseConfig[];
    return [{ nome: "Frente", unidades: tower?.unitsPerFloor ?? 4, subsolos: tower?.subsolos ?? 0 }];
  });

  const [fpCols, setFpCols] = useState(existingFP?.cols ?? (isVertical ? 4 : 5));
  const [fpRows, setFpRows] = useState(existingFP?.rows ?? (isVertical ? 1 : 2));
  const [fpCells, setFpCells] = useState<CellType[]>(() =>
    initCells(existingFP?.cols ?? (isVertical ? 4 : 5), existingFP?.rows ?? (isVertical ? 1 : 2), existingFP?.cells as CellType[])
  );

  const [busy, setBusy] = useState(false);

  const totalUnitsPerFloor = fases.reduce((s, f) => s + (f.unidades || 0), 0);
  const maxSubsolos = fases.reduce((m, f) => Math.max(m, f.subsolos || 0), 0);

  function updateFase(idx: number, field: keyof FaseConfig, value: string | number) {
    setFases((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: typeof value === "string" && field !== "nome" ? parseInt(value as string) || 0 : value } : f));
  }
  function addFase() { setFases((prev) => [...prev, { nome: "", unidades: 4, subsolos: 0 }]); }
  function removeFase(idx: number) { setFases((prev) => prev.filter((_, i) => i !== idx)); }

  function toggleSlot(faseIdx: number, andar: number, localPos: number) {
    setFases((prev) => prev.map((f, i) => {
      if (i !== faseIdx) return f;
      const excluded = f.excludedSlots ?? [];
      const already = excluded.some((s) => s.andar === andar && s.localPos === localPos);
      return {
        ...f,
        excludedSlots: already
          ? excluded.filter((s) => !(s.andar === andar && s.localPos === localPos))
          : [...excluded, { andar, localPos }],
      };
    }));
  }

  // Redimensiona posicaoFinalMap quando totalUnitsPerFloor muda
  useEffect(() => {
    if (totalUnitsPerFloor <= 0) return;
    setPosicaoFinalMap((prev) => {
      if (prev.length === totalUnitsPerFloor) return prev;
      return Array.from({ length: totalUnitsPerFloor }, (_, i) => prev[i] ?? i + 1);
    });
  }, [totalUnitsPerFloor]);

  async function handleSave() {
    if (!nome.trim()) { alert("Informe o nome da torre."); return; }
    if (fases.length === 0 || totalUnitsPerFloor === 0) { alert("Adicione ao menos uma fase com aptos por andar."); return; }
    if (fases.some((f) => !f.nome.trim())) { alert("Todas as fases precisam de um nome."); return; }
    const dupCounts = posicaoFinalMap.reduce<Record<number, number>>((acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
    if (Object.values(dupCounts).some((c) => c > 1)) { alert("Existem números repetidos na numeração. Corrija antes de salvar."); return; }
    setBusy(true);
    try {
      const floorsNum = parseInt(floors) || 1;
      const payload: any = {
        nome: nome.trim(),
        floors: floorsNum,
        unitsPerFloor: totalUnitsPerFloor,
        alturaAndarM: parseFloat(alturaAndar) || 3,
        hasLobbyFloor: hasLobby,
        fasesConfig: fases,
        subsolos: maxSubsolos,
        posicaoPad,
        posicaoFinalMap,
        prefixoUnidade,
        andarInicialContagem,
        andarInicialDisplay,
        subsoloDisplay,
      };
      if (isEdit) {
        await updateTower(dev.id, tower!.id, payload);
      } else {
        const created = await createTower(dev.id, payload);
        // Auto-cria unidades logo após criar a torre
        await bulkCreateUnits(dev.id, created.id, {
          floors: floorsNum,
          unitsPerFloor: totalUnitsPerFloor,
          prefix: isVertical ? "Apto" : dev.subtipo === "LOTEAMENTO" ? "Lote" : "Casa",
        });
      }
      onSaved();
      onClose();
    } catch (e: any) { alert(e?.message ?? "Erro ao salvar"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-2"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--shell-card-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--shell-card-border)]">
          <h3 className="text-base font-bold text-[var(--shell-text)]">
            {isEdit ? `Editar ${towerLabel}` : `Nova ${towerLabel}`}
          </h3>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Seção 1 — Identificação */}
          <section>
            <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-widest mb-3">Identificação</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[var(--shell-subtext)]">Nome *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)}
                  placeholder={isVertical ? "Ex.: Torre A" : "Ex.: Quadra 1"} className={inp} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--shell-subtext)]">{isVertical ? "Andares" : "Linhas/Fileiras"}</label>
                <input type="number" min={1} max={80} value={floors}
                  onChange={(e) => setFloors(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--shell-subtext)]">Altura por andar (m)</label>
                <input type="number" min={2} max={10} step={0.5} value={alturaAndar}
                  onChange={(e) => setAlturaAndar(e.target.value)} className={inp} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div onClick={() => setHasLobby(!hasLobby)}
                  className={`w-10 h-5 rounded-full transition-colors flex items-center ${hasLobby ? "bg-[var(--brand-accent)]" : "bg-gray-300 dark:bg-gray-600"}`}>
                  <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${hasLobby ? "translate-x-5" : ""}`} />
                </div>
                <span className="text-xs text-[var(--shell-text)]">Hall/Lobby térreo (sem apartamentos no 1º andar)</span>
              </label>
            </div>
          </section>

          {/* Seção 2 — Fases */}
          {isVertical && (
            <section>
              <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-widest mb-1">Fases (lados da torre)</p>
              <p className="text-[11px] text-[var(--shell-subtext)] mb-3">
                Cada fase representa um lado com suas próprias unidades por andar e subsolos independentes.
              </p>
              <div className="space-y-2">
                <div className="grid gap-1 text-[10px] font-bold text-[var(--shell-subtext)] uppercase tracking-wide px-1"
                  style={{ gridTemplateColumns: "1fr 80px 80px 28px" }}>
                  <span>Nome do lado</span><span className="text-center">Aptos/andar</span><span className="text-center">Subsolos</span><span />
                </div>
                {fases.map((fase, idx) => (
                  <div key={idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 80px 80px 28px" }}>
                    <input value={fase.nome} onChange={(e) => updateFase(idx, "nome", e.target.value)}
                      placeholder="Ex.: Sul, Norte…" className={inp} />
                    <input type="number" min={1} max={30} value={fase.unidades}
                      onChange={(e) => updateFase(idx, "unidades", e.target.value)} className={`${inp} text-center`} />
                    <input type="number" min={0} max={5} value={fase.subsolos}
                      onChange={(e) => updateFase(idx, "subsolos", e.target.value)} className={`${inp} text-center`} />
                    <button type="button" onClick={() => removeFase(idx)} disabled={fases.length <= 1}
                      className="h-8 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-20 text-base">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addFase}
                className="mt-2 text-xs text-[var(--brand-accent)] hover:underline font-medium">
                + Adicionar fase
              </button>
              <p className="text-[11px] text-[var(--shell-subtext)] mt-2">
                Total: <strong>{totalUnitsPerFloor}</strong> aptos/andar · max <strong>{maxSubsolos}</strong> subsolo{maxSubsolos !== 1 ? "s" : ""}
              </p>
            </section>
          )}

          {/* Seção 3 — Numeração */}
          {isVertical && totalUnitsPerFloor > 0 && (
            <section>
              <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-widest mb-1">Numeração dos apartamentos</p>
              <p className="text-[11px] text-[var(--shell-subtext)] mb-4">
                Defina o número final de cada posição. Sem repetições — cada posição deve ter um número único.
              </p>

              {/* Fileira horizontal única com labels das fases acima */}
              {(() => {
                const FASE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
                const counts = posicaoFinalMap.reduce<Record<number, number>>((acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
                const hasDup = Object.values(counts).some((c) => c > 1);
                let offset = 0;
                const groups = fases.map((fase, fi) => {
                  const color = FASE_COLORS[fi % FASE_COLORS.length];
                  const idxs = Array.from({ length: fase.unidades || 0 }, (_, j) => offset + j);
                  offset += fase.unidades || 0;
                  return { fase, fi, color, idxs };
                }).filter((g) => g.idxs.length > 0);

                return (
                  <div className="mb-5">
                    {/* Labels das fases */}
                    <div className="flex gap-3 mb-1 overflow-x-auto pb-1">
                      {groups.map(({ fase, fi, color, idxs }) => (
                        <div key={fi} className="flex flex-col items-center flex-shrink-0">
                          <span className="text-[10px] font-bold mb-1.5" style={{ color }}>
                            {fase.nome || `Fase ${fi + 1}`}
                          </span>
                          <div className="flex gap-1.5">
                            {idxs.map((idx) => {
                              const val = posicaoFinalMap[idx] ?? idx + 1;
                              const isDup = (counts[val] ?? 0) > 1;
                              return (
                                <div key={idx} className="flex flex-col items-center gap-0.5">
                                  <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                                    style={{
                                      backgroundColor: isDup ? "#fee2e2" : color + "22",
                                      border: `2px solid ${isDup ? "#ef4444" : color}`,
                                    }}>
                                    <input
                                      type="number" min={1} max={9999}
                                      value={val}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value);
                                        if (!isNaN(v) && v >= 1) {
                                          setPosicaoFinalMap((prev) => { const next = [...prev]; next[idx] = v; return next; });
                                        }
                                      }}
                                      className="w-8 bg-transparent text-center text-sm font-bold outline-none"
                                      style={{ color: isDup ? "#ef4444" : color }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {hasDup && (
                      <p className="text-xs text-red-500 mt-2">Existem números repetidos. Cada posição deve ter um número único.</p>
                    )}
                  </div>
                );
              })()}

              {/* Formato de numeração */}
              {(() => {
                // Preview ao vivo: calcula nomes do primeiro e último andar
                const pad = posicaoPad;
                const fmt = (n: number) => n.toString().padStart(pad, "0");
                const finalEx = (posicaoFinalMap[0] ?? 1);
                const totalFloors = parseInt(floors) || 1;

                const buildPreview = (internalAndar: number): string => {
                  let displayStr: string;
                  if (internalAndar < 0) {
                    const s = -internalAndar;
                    if (andarInicialContagem === "SUBSOLO") {
                      displayStr = (andarInicialDisplay + maxSubsolos - s).toString();
                    } else if (subsoloDisplay === "PREFIXO_S") {
                      displayStr = `S${s}`;
                    } else {
                      displayStr = (andarInicialDisplay - s - (andarInicialContagem === "PRIMEIRO_PAV" ? 1 : 0)).toString();
                    }
                  } else {
                    if (andarInicialContagem === "SUBSOLO") {
                      displayStr = (andarInicialDisplay + maxSubsolos + (hasLobby ? 1 : 0) + internalAndar - 1).toString();
                    } else if (andarInicialContagem === "TERREO") {
                      displayStr = (andarInicialDisplay + internalAndar - (hasLobby ? 0 : 1)).toString();
                    } else {
                      displayStr = (andarInicialDisplay + internalAndar - 1).toString();
                    }
                  }
                  const code = prefixoUnidade ? `${prefixoUnidade} ${displayStr}${fmt(finalEx)}` : `${displayStr}${fmt(finalEx)}`;
                  return code;
                };

                const ex1 = maxSubsolos > 0 ? buildPreview(-maxSubsolos) : buildPreview(1);
                const ex2 = buildPreview(totalFloors);

                return (
                  <div className="space-y-4 pt-1 border-t border-[var(--shell-card-border)]">
                    <p className="text-[11px] font-bold text-[var(--shell-subtext)] uppercase tracking-widest pt-1">Formato de numeração</p>

                    {/* Prefixo */}
                    <div>
                      <label className="block text-[11px] text-[var(--shell-subtext)] mb-1">Prefixo da unidade</label>
                      <input type="text" maxLength={10} placeholder="Apto, AP, Casa, ... (deixe vazio para só o número)"
                        value={prefixoUnidade}
                        onChange={(e) => setPrefixoUnidade(e.target.value)}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]"
                      />
                    </div>

                    {/* Início da contagem */}
                    <div>
                      <label className="block text-[11px] text-[var(--shell-subtext)] mb-1">Início da contagem dos andares</label>
                      <select value={andarInicialContagem} onChange={(e) => setAndarInicialContagem(e.target.value)}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]">
                        <option value="SUBSOLO">Do subsolo mais profundo (subsolo → térreo → andares em sequência)</option>
                        <option value="TERREO">Do térreo (térreo = nº inicial, andares sobem a partir daí)</option>
                        <option value="PRIMEIRO_PAV">Do 1º pavimento (subsolos tratados separado)</option>
                      </select>
                    </div>

                    {/* Número inicial */}
                    <div>
                      <label className="block text-[11px] text-[var(--shell-subtext)] mb-1">
                        Número do {andarInicialContagem === "SUBSOLO" ? "subsolo mais profundo" : andarInicialContagem === "TERREO" ? "térreo" : "1º pavimento"}
                      </label>
                      <input type="number" min={0} max={999}
                        value={andarInicialDisplay}
                        onChange={(e) => setAndarInicialDisplay(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]"
                      />
                    </div>

                    {/* Exibição de subsolos (só quando há subsolos e contagem não começa do subsolo) */}
                    {maxSubsolos > 0 && andarInicialContagem !== "SUBSOLO" && (
                      <div>
                        <label className="block text-[11px] text-[var(--shell-subtext)] mb-1">Numeração dos subsolos</label>
                        <select value={subsoloDisplay} onChange={(e) => setSubsoloDisplay(e.target.value)}
                          className="w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]">
                          <option value="PREFIXO_S">Prefixo S — ex: S1001, S2001...</option>
                          <option value="SEQUENCIAL">Sequencial abaixo do início — ex: 0001, -1001...</option>
                        </select>
                      </div>
                    )}

                    {/* Formato do sufixo (posicaoPad) */}
                    <div>
                      <p className="text-[11px] text-[var(--shell-subtext)] mb-2">Dígitos do sufixo de posição</p>
                      <div className="grid grid-cols-4 gap-2">
                        {([1, 2, 3, 4] as const).map((p) => {
                          const sfx = finalEx.toString().padStart(p, "0");
                          const code = prefixoUnidade ? `${prefixoUnidade} 1${sfx}` : `1${sfx}`;
                          return (
                            <button key={p} type="button" onClick={() => setPosicaoPad(p)}
                              className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${posicaoPad === p ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]" : "border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:border-[var(--brand-accent)]/50"}`}>
                              <p className="font-mono font-bold text-xs">{code}</p>
                              <p className="text-[10px] mt-0.5 opacity-70">{"0".repeat(p)} sufixo</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preview ao vivo */}
                    <div className="rounded-lg bg-[var(--shell-bg)] border border-[var(--shell-card-border)] px-3 py-2.5">
                      <p className="text-[10px] text-[var(--shell-subtext)] mb-1 uppercase tracking-widest font-semibold">Preview</p>
                      <div className="flex gap-4 flex-wrap">
                        {maxSubsolos > 0 && <span className="font-mono text-sm font-bold text-[var(--shell-text)]">{buildPreview(-maxSubsolos)} <span className="text-[10px] font-normal opacity-60">(1º subsolo)</span></span>}
                        <span className="font-mono text-sm font-bold text-[var(--shell-text)]">{buildPreview(1)} <span className="text-[10px] font-normal opacity-60">({andarInicialContagem === "SUBSOLO" || andarInicialContagem === "TERREO" ? "térreo/1º andar" : "1º pav"})</span></span>
                        <span className="font-mono text-sm font-bold text-[var(--shell-text)]">{ex2} <span className="text-[10px] font-normal opacity-60">({totalFloors}º andar)</span></span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {/* Seção 4 — Pré-visualização */}
          {isVertical && fases.length > 0 && totalUnitsPerFloor > 0 && (
            <section>
              <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-widest mb-3">Pré-visualização</p>
              <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-bg)] p-3 overflow-x-auto">
                <table className="text-[10px] border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="w-12 text-left text-[var(--shell-subtext)] font-semibold pb-1 pr-2" />
                      {fases.map((f, fi) => (
                        <th key={fi} colSpan={f.unidades} className="text-center text-[var(--shell-text)] font-bold pb-1 px-1 border-l border-[var(--shell-card-border)]">
                          {f.nome || `Fase ${fi+1}`} ({f.unidades})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const floorsNum = parseInt(floors) || 1;
                      const rows: React.ReactElement[] = [];
                      // andares normais (desc) — todos têm unidades, incluindo o 1º
                      for (let andar = floorsNum; andar >= 1; andar--) {
                        rows.push(
                          <tr key={andar} className="border-t border-[var(--shell-card-border)]">
                            <td className="pr-2 py-0.5 text-[var(--shell-subtext)] font-semibold whitespace-nowrap">{andar}º</td>
                            {fases.map((f, fi) =>
                              Array.from({ length: f.unidades }, (_, ui) => {
                                const lp = ui + 1;
                                const excl = (f.excludedSlots ?? []).some((s) => s.andar === andar && s.localPos === lp);
                                return (
                                  <td key={`${fi}-${ui}`} className="px-0.5 py-0.5">
                                    <button type="button" onClick={() => toggleSlot(fi, andar, lp)}
                                      title={excl ? "Incluir unidade" : "Excluir unidade"}
                                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${excl ? "bg-gray-200 dark:bg-gray-700 border border-dashed border-gray-400" : "bg-green-500 opacity-80 hover:opacity-100"}`}>
                                      {excl && <span className="text-[8px] text-gray-500 leading-none">×</span>}
                                    </button>
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      }
                      // Térreo — piso extra visual, sem unidades
                      if (hasLobby) {
                        rows.push(
                          <tr key="terreo" className="border-t-2 border-[var(--shell-card-border)] bg-gray-100 dark:bg-gray-800/40">
                            <td className="pr-2 py-0.5 text-gray-400 dark:text-gray-500 font-semibold whitespace-nowrap">T</td>
                            <td colSpan={totalUnitsPerFloor} className="px-2 py-0.5 text-[9px] text-gray-400 italic">Térreo — Hall / Lobby</td>
                          </tr>
                        );
                      }
                      // subsolos (desc do mais raso S1 para mais profundo)
                      for (let s = 1; s <= maxSubsolos; s++) {
                        rows.push(
                          <tr key={`s${s}`} className="border-t-2 border-[var(--shell-card-border)]">
                            <td className="pr-2 py-0.5 text-amber-600 font-bold whitespace-nowrap">S{s}</td>
                            {fases.map((f, fi) =>
                              Array.from({ length: f.unidades }, (_, ui) => {
                                if (f.subsolos < s) return (
                                  <td key={`${fi}-${ui}`} className="px-0.5 py-0.5">
                                    <div className="w-5 h-5 rounded border border-dashed border-[var(--shell-card-border)]" />
                                  </td>
                                );
                                const lp = ui + 1;
                                const floorAndar = -s;
                                const excl = (f.excludedSlots ?? []).some((sl) => sl.andar === floorAndar && sl.localPos === lp);
                                return (
                                  <td key={`${fi}-${ui}`} className="px-0.5 py-0.5">
                                    <button type="button" onClick={() => toggleSlot(fi, floorAndar, lp)}
                                      title={excl ? "Incluir unidade" : "Excluir unidade"}
                                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${excl ? "bg-gray-200 dark:bg-gray-700 border border-dashed border-gray-400" : "bg-amber-400 opacity-80 hover:opacity-100"}`}>
                                      {excl && <span className="text-[8px] text-gray-500 leading-none">×</span>}
                                    </button>
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      }
                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-center text-[var(--shell-subtext)] mt-1">
                {(() => {
                  const fl = parseInt(floors) || 1;
                  const normalTotal = fl * totalUnitsPerFloor;
                  const subsoloTotal = fases.reduce((s, f) => s + f.unidades * f.subsolos, 0);
                  const excluded = fases.reduce((s, f) => s + (f.excludedSlots?.length ?? 0), 0);
                  const grand = normalTotal + subsoloTotal - excluded;
                  return <>
                    {fl} andares · {totalUnitsPerFloor} aptos/andar · {normalTotal} normais
                    {maxSubsolos > 0 && ` + ${subsoloTotal} subsolo`}
                    {excluded > 0 && <span className="text-red-400"> − {excluded} excluídas</span>}
                    {" = "}<strong className="text-[var(--shell-text)]">{grand} total</strong>
                  </>;
                })()}
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-[var(--shell-card-border)]">
          <button onClick={onClose}
            className="rounded-xl border border-[var(--shell-card-border)] px-5 py-2.5 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={busy || !nome.trim() || (isVertical && totalUnitsPerFloor === 0)}
            className="rounded-xl bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Salvando..." : isEdit ? "Salvar alterações" : `Criar ${towerLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step3TowersManager({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [editTower, setEditTower] = useState<Tower | undefined>(undefined);
  const isVertical = dev.tipo === "VERTICAL";
  const towerLabel = isVertical ? "Torre" : "Quadra";

  async function handleDelete(towerId: string) {
    if (!confirm(`Excluir esta ${towerLabel.toLowerCase()}? Todas as unidades serão removidas.`)) return;
    await deleteTower(dev.id, towerId);
    onSaved();
  }

  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">{towerLabel}s ({dev.towers.length})</p>
          <p className="text-xs text-[var(--shell-subtext)] mt-0.5">Configure cada {towerLabel.toLowerCase()}: planta, fachada e detalhes. Posicione no editor de implantação abaixo.</p>
        </div>
        <button type="button" onClick={() => { setEditTower(undefined); setShowModal(true); }}
          className="rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm">
          + Nova {towerLabel}
        </button>
      </div>
      {dev.towers.length > 0 && (
        <div className="space-y-2">
          {dev.towers.map((t) => {
            const aptPerFloor = t.floorPlan ? t.floorPlan.cells.filter((c: string) => c === "APT").length : t.unitsPerFloor;
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-[var(--shell-card-border)] px-4 py-3 bg-[var(--shell-bg)]">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 border border-[var(--shell-card-border)]"
                  style={{ backgroundColor: t.facadeColor ?? "#e5e7eb" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--shell-text)] truncate">{t.nome}</p>
                  <p className="text-[11px] text-[var(--shell-subtext)]">
                    {t.larguraM.toFixed(0)}×{t.profundidadeM.toFixed(0)}m · {aptPerFloor} apto/andar · {t.roofType ?? "PLANO"}
                  </p>
                </div>
                <button type="button" onClick={() => { setEditTower(t); setShowModal(true); }}
                  className="text-xs font-semibold text-[var(--brand-accent)] hover:underline px-2">
                  Editar
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 text-xs font-semibold px-2">
                  Excluir
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <TowerConfigModal
          dev={dev}
          tower={editTower}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onSaved(); }}
        />
      )}
    </div>
  );
}

// ─── Step 4 — Estruturação ───────────────────────────────────────────────────

function Step4Estruturacao({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  const isVertical = dev.tipo === "VERTICAL";
  const towerLabel = isVertical ? "Torre" : "Quadra";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 shadow-sm">
        <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider mb-1">Estruturação das {towerLabel}s</p>
        <p className="text-xs text-[var(--shell-subtext)]">
          Defina quantos {isVertical ? "andares e unidades por andar" : "lotes ou casas"} cada {towerLabel.toLowerCase()} terá. As unidades serão criadas automaticamente.
        </p>
      </div>
      {dev.towers.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300">
          Volte para o passo Layout e adicione pelo menos uma {towerLabel.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {dev.towers.map((t) => (
            <TowerStructureCard key={t.id} dev={dev} tower={t} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

function TowerStructureCard({ dev, tower, onSaved }: { dev: Development; tower: Tower; onSaved: () => void }) {
  const isVertical = dev.tipo === "VERTICAL";
  const isLoteamento = dev.subtipo === "LOTEAMENTO";
  const [floors, setFloors] = useState(String(tower.floors));
  const [unitsPerFloor, setUnitsPerFloor] = useState(String(tower.unitsPerFloor));
  const [alturaAndar, setAlturaAndar] = useState(String(tower.alturaAndarM));
  const [prefix, setPrefix] = useState(isVertical ? "Apto" : isLoteamento ? "Lote" : "Casa");
  const [busy, setBusy] = useState(false);

  const fasesConfig = tower.fasesConfig as FaseConfig[] | null;
  const subsoloUnits = fasesConfig?.reduce((sum, f) => sum + (f.subsolos ?? 0) * (f.unidades ?? 0), 0) ?? 0;
  const excludedSlotsCount = fasesConfig?.reduce((sum, f) => sum + (f.excludedSlots?.length ?? 0), 0) ?? 0;
  const expectedUnits = (parseInt(floors) || 0) * (parseInt(unitsPerFloor) || 0) + subsoloUnits - excludedSlotsCount;
  const currentUnits = tower.units.length;
  const fullyCreated = currentUnits === expectedUnits && expectedUnits > 0;

  async function handleSave() {
    if (expectedUnits === 0) { alert("Defina andares e unidades por andar."); return; }
    setBusy(true);
    try {
      await updateTower(dev.id, tower.id, {
        floors: parseInt(floors) || 1,
        unitsPerFloor: parseInt(unitsPerFloor) || 1,
        alturaAndarM: parseFloat(alturaAndar) || 3,
      } as any);
      if (currentUnits === 0) {
        await bulkCreateUnits(dev.id, tower.id, {
          floors: parseInt(floors) || 1,
          unitsPerFloor: parseInt(unitsPerFloor) || 1,
          prefix,
        });
      } else if (currentUnits !== expectedUnits) {
        alert(`A torre ${tower.nome} tem ${currentUnits} unidades cadastradas, mas você configurou ${expectedUnits}. Para reconfigurar, exclua a torre no Layout e recrie.`);
      }
      onSaved();
    } catch (e: any) { alert("Erro: " + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const hasFases = Array.isArray(tower.fasesConfig) && (tower.fasesConfig as FaseConfig[]).length > 0;

  return (
    <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--shell-text)]">{tower.nome}</p>
          <p className="text-[11px] text-[var(--shell-subtext)]">
            {fullyCreated ? `✅ ${currentUnits} unidades criadas` : currentUnits === 0 ? "⚠️ Nenhuma unidade criada ainda" : `⚠️ ${currentUnits}/${expectedUnits} unidades`}
          </p>
        </div>
        {fullyCreated && <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">OK</span>}
      </div>

      {hasFases ? (
        /* Torre configurada via fases — mostra resumo read-only */
        <div className="space-y-1.5">
          {(tower.fasesConfig as FaseConfig[]).map((f, fi) => (
            <div key={fi} className="flex items-center gap-2 text-xs text-[var(--shell-subtext)] bg-[var(--shell-bg)] rounded-lg px-3 py-1.5">
              <span className="font-semibold text-[var(--shell-text)] w-24 truncate">{f.nome}</span>
              <span>{f.unidades} aptos/andar</span>
              {f.subsolos > 0 && <span className="text-amber-600 dark:text-amber-400">· {f.subsolos} subsolo{f.subsolos > 1 ? "s" : ""}</span>}
            </div>
          ))}
          <p className="text-[11px] text-[var(--shell-subtext)]">{parseInt(floors)} andares · {expectedUnits} unidades no total</p>
        </div>
      ) : (
        /* Torre legada sem fasesConfig — mantém inputs editáveis */
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{isVertical ? "Andares" : "Linhas"}</label>
            <input type="number" min={1} value={floors} onChange={(e) => setFloors(e.target.value)} className={inp} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{isVertical ? "Unid/andar" : isLoteamento ? "Lotes/linha" : "Casas/linha"}</label>
            <input type="number" min={1} value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(e.target.value)} className={inp} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{isVertical ? "Alt/andar (m)" : "Altura (m)"}</label>
            <input type="number" step="0.5" value={alturaAndar} onChange={(e) => setAlturaAndar(e.target.value)} className={inp} />
          </div>
        </div>
      )}

      {currentUnits === 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Prefixo das unidades</label>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inp} />
        </div>
      )}

      {!fullyCreated && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-[var(--shell-subtext)]">Total esperado: <strong>{expectedUnits}</strong></span>
          <button onClick={handleSave} disabled={busy}
            className="rounded-lg bg-[var(--brand-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {busy ? "Processando..." : currentUnits === 0 ? "Criar unidades" : "Recriar unidades"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 5 — Preços ──────────────────────────────────────────────────────────

function Step5Precos({ dev, onSaved }: { dev: Development; onSaved: () => void }) {
  return (
    <div className="space-y-6 max-w-5xl">
      <BulkFillByPosicao dev={dev} onSaved={onSaved} />
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--shell-text)] mb-1">Tabela de Preços</h2>
        <p className="text-xs text-[var(--shell-subtext)] mb-5">Preencha o valor de venda de cada unidade. Todas precisam ter valor para concluir o cadastro.</p>
        <PriceTable dev={dev} onSaved={onSaved} />
      </div>
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--shell-text)] mb-1">Condições de Pagamento</h2>
        <p className="text-xs text-[var(--shell-subtext)] mb-5">Definições comerciais aplicáveis a todas as unidades.</p>
        <PaymentConditionForm devId={dev.id} initial={dev.paymentCondition} onSaved={onSaved} />
      </div>
    </div>
  );
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

function Wizard({ dev, completeness, onSaved, initialStep }: {
  dev: Development; completeness: Completeness; onSaved: () => void; initialStep?: number;
}) {
  const [currentStep, setCurrentStep] = useState(() =>
    typeof initialStep === "number" && initialStep >= 0 && initialStep < 5
      ? initialStep
      : Math.max(0, completeness.firstIncomplete)
  );
  const [advancing, setAdvancing] = useState(false);
  const stepRef = useRef<StepHandle>(null);

  async function handleNext() {
    setAdvancing(true);
    try {
      // Steps 1-2 têm save() via ref que persiste o que o usuário digitou (não bloqueia se incompleto)
      if (stepRef.current?.save) {
        await stepRef.current.save();
      }
      // Avança sempre — campos vazios ficam como rascunho
      if (currentStep < 4) setCurrentStep((s) => s + 1);
    } finally { setAdvancing(false); }
  }

  function handleBack() { if (currentStep > 0) setCurrentStep((s) => s - 1); }
  const isLastStep = currentStep === 4;
  const stepHasFooterSave = currentStep <= 1; // Step1 e Step2 salvam via footer

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-3 shadow-sm">
        <Stepper completeness={completeness} current={currentStep} onJump={async (target) => {
          // Auto-salva o passo atual (steps 1-2 têm save via ref) antes de navegar
          if (stepRef.current?.save) await stepRef.current.save();
          setCurrentStep(target);
        }} />
      </div>

      <div>
        {currentStep === 0 && <Step1Identificacao ref={stepRef} dev={dev} onSaved={onSaved} />}
        {currentStep === 1 && <Step2Localizacao   ref={stepRef} dev={dev} onSaved={onSaved} />}
        {currentStep === 2 && <Step3Layout       dev={dev} onSaved={onSaved} />}
        {currentStep === 3 && <Step4Estruturacao dev={dev} onSaved={onSaved} />}
        {currentStep === 4 && <Step5Precos       dev={dev} onSaved={onSaved} />}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--shell-card-border)] pt-4">
        <button onClick={handleBack} disabled={currentStep === 0}
          className="rounded-xl border border-[var(--shell-card-border)] px-5 py-2.5 text-sm font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ← Voltar
        </button>
        <div className="flex-1 text-center text-xs text-[var(--shell-subtext)]">
          Passo {currentStep + 1} de 5: <strong className="text-[var(--shell-text)]">{STEP_LABELS[currentStep]}</strong>
          <span className="text-[var(--shell-subtext)]"> · {completeness.percent}% completo</span>
        </div>
        {isLastStep ? (
          stepHasFooterSave ? null : (
            <button onClick={onSaved}
              className="rounded-xl border border-[var(--shell-card-border)] px-5 py-2.5 text-sm font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] transition-colors">
              Recarregar
            </button>
          )
        ) : (
          <button onClick={handleNext} disabled={advancing}
            className="rounded-xl bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
            {advancing ? "Salvando..." : stepHasFooterSave ? "Salvar e continuar →" : "Continuar →"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TabbedView (modo abas após cadastro 100% completo) ──────────────────────

type TabbedKey = "identificacao" | "localizacao" | "layout" | "estruturacao" | "precos" | "espelho" | "dashboard";

const TABBED_TABS: { key: TabbedKey; label: string }[] = [
  { key: "identificacao", label: "📋 Identificação" },
  { key: "localizacao",   label: "📍 Localização"  },
  { key: "layout",        label: "🗺️ Layout"        },
  { key: "estruturacao",  label: "🏗️ Estruturação"  },
  { key: "precos",        label: "💰 Preços"        },
  { key: "espelho",       label: "🏢 Espelho"       },
  { key: "dashboard",     label: "📊 Dashboard"     },
];

function TabbedView({ dev, dashboard, onSaved, onUnitUpdated, role }: {
  dev: Development; dashboard: Dashboard | null; onSaved: () => void;
  onUnitUpdated: (towerId: string, unit: DevelopmentUnit) => void;
  role: string;
}) {
  const isOwnerOrManager = role === "OWNER" || role === "MANAGER";
  const visibleTabs = isOwnerOrManager ? TABBED_TABS : TABBED_TABS.filter((t) => t.key === "espelho");
  const [tab, setTab] = useState<TabbedKey>("espelho");
  return (
    <div className="space-y-5">
      {visibleTabs.length > 1 && (
        <div className="border-b border-[var(--shell-card-border)] overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {visibleTabs.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                    : "border-transparent text-[var(--shell-subtext)] hover:text-[var(--shell-text)]"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        {tab === "identificacao" && <Step1Identificacao dev={dev} onSaved={onSaved} embeddedSubmit />}
        {tab === "localizacao"   && <Step2Localizacao   dev={dev} onSaved={onSaved} embeddedSubmit />}
        {tab === "layout"        && <Step3Layout        dev={dev} onSaved={onSaved} />}
        {tab === "estruturacao"  && <Step4Estruturacao  dev={dev} onSaved={onSaved} />}
        {tab === "precos"        && <Step5Precos        dev={dev} onSaved={onSaved} />}
        {(tab === "espelho" || !isOwnerOrManager) && <AbaEspelho dev={dev} onUnitUpdated={onUnitUpdated} role={role} />}
        {tab === "dashboard" && isOwnerOrManager && (
          dashboard ? <DashboardView dashboard={dashboard} dev={dev} /> :
          <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Nenhum dado disponível ainda</div>
        )}
      </div>
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

export default function EmpreendimentoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const initialStep = stepParam !== null ? parseInt(stepParam) : undefined;

  const [dev, setDev] = useState<Development | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try { const u = localStorage.getItem("user"); setRole(u ? JSON.parse(u).role : null); } catch { /* noop */ }
  }, []);

  const isOwnerOrManager = role === "OWNER" || role === "MANAGER";

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

  const completeness = useMemo(() => dev ? computeCompleteness(dev) : null, [dev]);
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    if (!dev) return;
    if (!completeness?.allComplete) return;
    setPublishing(true);
    try {
      await publishDevelopment(dev.id);
      await load();
    } catch (e: any) { alert("Erro ao publicar: " + (e?.message ?? e)); }
    finally { setPublishing(false); }
  }
  async function handleUnpublish() {
    if (!dev) return;
    if (!confirm("Despublicar este empreendimento? Ele voltará a ser rascunho e não será visível para a equipe.")) return;
    setPublishing(true);
    try {
      await unpublishDevelopment(dev.id);
      await load();
    } catch (e: any) { alert("Erro ao despublicar: " + (e?.message ?? e)); }
    finally { setPublishing(false); }
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

  if (!dev || !completeness) {
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
              {dev.publishedAt ? (
                <span className="rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 text-xs font-semibold">
                  ✅ Publicado
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 text-xs font-semibold">
                  📝 Rascunho · {completeness.percent}%
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--shell-subtext)] mt-1">
              {dev.cidade && dev.estado ? `${dev.cidade}, ${dev.estado}` : dev.cidade || dev.estado || ""}
              {dev.prazoEntrega && ` · Entrega: ${new Date(dev.prazoEntrega).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
            </p>
          </div>
          {isOwnerOrManager && (
            <div className="flex items-center gap-2">
              {dev.publishedAt ? (
                <button onClick={handleUnpublish} disabled={publishing}
                  className="rounded-xl border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] disabled:opacity-50 transition-colors">
                  {publishing ? "..." : "Despublicar"}
                </button>
              ) : (
                <button onClick={handlePublish}
                  disabled={!completeness.allComplete || publishing}
                  title={completeness.allComplete ? "Publicar para a equipe" : "Complete os 5 passos para habilitar"}
                  className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm">
                  {publishing ? "Publicando..." : completeness.allComplete ? "🚀 Publicar" : `Publicar (${completeness.percent}%)`}
                </button>
              )}
            </div>
          )}
        </div>

        {!isOwnerOrManager ? (
          // AGENT: só vê o espelho, nunca o wizard
          !dev.publishedAt ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-6 text-sm text-amber-700 dark:text-amber-300">
              Este empreendimento ainda não está disponível para a equipe.
            </div>
          ) : (
            <TabbedView dev={dev} dashboard={dashboard} onSaved={load} onUnitUpdated={handleUnitUpdated} role={role ?? "AGENT"} />
          )
        ) : !completeness.allComplete ? (
          <Wizard dev={dev} completeness={completeness} onSaved={load} initialStep={initialStep} />
        ) : (
          <TabbedView dev={dev} dashboard={dashboard} onSaved={load} onUnitUpdated={handleUnitUpdated} role={role ?? "OWNER"} />
        )}
      </div>
    </AppShell>
  );
}