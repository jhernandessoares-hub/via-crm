"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import TowerLayout from "@/components/development/TowerLayout";
import LotGrid from "@/components/development/LotGrid";
import { apiFetch } from "@/lib/api";

// ─── Local helpers ────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-slate-400";
const btnPrimary = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors";
const btnSecondary = "rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors";

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--shell-text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--shell-card-border)] last:border-0">
      <span className="text-xs text-[var(--shell-subtext)]">{label}</span>
      <span className="text-sm font-medium text-[var(--shell-text)]">{value ?? "—"}</span>
    </div>
  );
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "DISPONIVEL", label: "Disponível" },
  { value: "RESERVADO", label: "Reservado" },
  { value: "VENDIDO", label: "Vendido" },
];

const STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: "Disponível", RESERVADO: "Reservado", VENDIDO: "Vendido",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UnitsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<any>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [view, setView] = useState<"tower" | "lot" | "house" | "table">("tower");
  const [gridCols, setGridCols] = useState(10);

  // Modals
  const [showBulk, setShowBulk] = useState(false);
  const [showPriceRules, setShowPriceRules] = useState(false);
  const [showUnitDetail, setShowUnitDetail] = useState<any>(null);
  const [showSell, setShowSell] = useState(false);

  // Bulk form
  const [bulkTower, setBulkTower] = useState("");
  const [bulkFloors, setBulkFloors] = useState("10");
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState("4");
  const [bulkRows, setBulkRows] = useState("5");
  const [bulkCols, setBulkCols] = useState("10");
  const [bulkPrefix, setBulkPrefix] = useState("Apto");
  const [bulkArea, setBulkArea] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Price rules form
  const [prBase, setPrBase] = useState("");
  const [prFloor, setPrFloor] = useState("");
  const [prCorner, setPrCorner] = useState("");
  const [prLoading, setPrLoading] = useState(false);

  // Sell form
  const [sellBuyer, setSellBuyer] = useState("");
  const [sellLoading, setSellLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [prod, uList] = await Promise.all([
        apiFetch(`/products/${id}`),
        apiFetch(`/products/${id}/units`),
      ]);
      setProduct(prod);
      setUnits(Array.isArray(uList) ? uList : []);
      // Auto-detecta tipo
      if ((prod as any).type === "LOTEAMENTO") setView("lot");
      // Inicializa price rules
      const pr = (prod as any).priceRules;
      if (pr) {
        setPrBase(pr.basePrice != null ? String(pr.basePrice) : "");
        setPrFloor(pr.floorIncrement != null ? String(pr.floorIncrement) : "");
        setPrCorner(pr.cornerPremium != null ? String(pr.cornerPremium) : "");
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const filtered = useMemo(() =>
    filterStatus ? units.filter((u) => u.status === filterStatus) : units,
    [units, filterStatus]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { DISPONIVEL: 0, RESERVADO: 0, VENDIDO: 0 };
    for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [units]);

  const isLoteamento = product?.type === "LOTEAMENTO";

  async function handleBulkCreate() {
    setBulkLoading(true);
    try {
      const body = isLoteamento
        ? { rows: Number(bulkRows), cols: Number(bulkCols), prefix: bulkPrefix || "Lote", areaM2: bulkArea ? Number(bulkArea) : undefined }
        : { tower: bulkTower || undefined, floors: Number(bulkFloors), unitsPerFloor: Number(bulkUnitsPerFloor), prefix: bulkPrefix, areaM2: bulkArea ? Number(bulkArea) : undefined };
      await apiFetch(`/products/${id}/units/bulk`, { method: "POST", body: JSON.stringify(body) });
      if (isLoteamento) setGridCols(Number(bulkCols));
      setShowBulk(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao gerar unidades");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleSavePriceRules() {
    setPrLoading(true);
    try {
      const priceRules = {
        basePrice: prBase ? Number(prBase) : null,
        floorIncrement: prFloor ? Number(prFloor) : null,
        cornerPremium: prCorner ? Number(prCorner) : null,
      };
      await apiFetch(`/products/${id}`, { method: "PATCH", body: JSON.stringify({ priceRules }) });
      setShowPriceRules(false);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar regras");
    } finally {
      setPrLoading(false);
    }
  }

  async function handleRecalcPrices() {
    setPrLoading(true);
    try {
      await apiFetch(`/products/${id}/units/recalc-prices`, { method: "POST" });
      setShowPriceRules(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao recalcular");
    } finally {
      setPrLoading(false);
    }
  }

  async function handleRelease(unitId: string) {
    try {
      await apiFetch(`/products/${id}/units/${unitId}/release`, { method: "POST" });
      await load();
      setShowUnitDetail(null);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao liberar unidade");
    }
  }

  async function handleSell() {
    if (!showUnitDetail) return;
    setSellLoading(true);
    try {
      await apiFetch(`/products/${id}/units/${showUnitDetail.id}/sell`, {
        method: "POST",
        body: JSON.stringify({ buyerName: sellBuyer || undefined }),
      });
      setShowSell(false);
      setShowUnitDetail(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao marcar como vendido");
    } finally {
      setSellLoading(false);
    }
  }

  async function handleDeleteUnit(unitId: string) {
    try {
      await apiFetch(`/products/${id}/units/${unitId}`, { method: "DELETE" });
      await load();
      setShowUnitDetail(null);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir unidade");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button type="button" onClick={() => router.back()} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] mb-1">← Voltar</button>
            <h1 className="text-lg font-semibold text-[var(--shell-text)]">
              Planta Interativa{product ? ` — ${product.title}` : ""}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowPriceRules(true)} className={btnSecondary}>
              Tabela de Preços
            </button>
            <button type="button" onClick={() => setShowBulk(true)} className={btnPrimary}>
              + Gerar Unidades
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Resumo */}
        <div className="flex items-center gap-6 rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] px-5 py-3 text-sm">
          <span className="text-[var(--shell-subtext)]">Total: <strong className="text-[var(--shell-text)]">{units.length}</strong></span>
          <span className="text-green-600">Disponível: <strong>{counts.DISPONIVEL ?? 0}</strong></span>
          <span className="text-yellow-600">Reservado: <strong>{counts.RESERVADO ?? 0}</strong></span>
          <span className="text-red-600">Vendido: <strong>{counts.VENDIDO ?? 0}</strong></span>
        </div>

        {/* Filtros e view */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} type="button"
                onClick={() => setFilterStatus(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === f.value ? "bg-slate-900 text-white" : "border border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                {f.label}{f.value && counts[f.value] != null ? ` (${counts[f.value]})` : ""}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(["tower", "lot", "house", "table"] as const).map((v) => (
              <button key={v} type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${view === v ? "bg-slate-900 text-white" : "border border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"}`}>
                {v === "tower" ? "Torre" : v === "lot" ? "Lote" : v === "house" ? "Casa" : "Tabela"}
              </button>
            ))}
            {view !== "tower" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--shell-subtext)]">Colunas:</span>
                <input type="number" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))}
                  min={1} max={30} className="w-16 rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-2 py-1 text-xs text-center" />
              </div>
            )}
          </div>
        </div>

        {/* Planta */}
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--shell-subtext)]">
            Nenhuma unidade encontrada. Use "Gerar Unidades" para começar.
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
            {view === "tower" && <TowerLayout units={filtered} onSelect={setShowUnitDetail} />}
            {view === "lot"   && <LotGrid units={filtered} cols={gridCols} mode="lot" onSelect={setShowUnitDetail} />}
            {view === "house" && <LotGrid units={filtered} cols={gridCols} mode="house" onSelect={setShowUnitDetail} />}
            {view === "table" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--shell-card-border)] text-xs text-[var(--shell-subtext)]">
                      <th className="pb-2 text-left font-medium">Unidade</th>
                      <th className="pb-2 text-left font-medium">Torre</th>
                      <th className="pb-2 text-left font-medium">Andar</th>
                      <th className="pb-2 text-left font-medium">Área</th>
                      <th className="pb-2 text-left font-medium">Preço</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium">Lead/Comprador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} className="border-b border-[var(--shell-card-border)] last:border-0 hover:bg-[var(--shell-hover)] cursor-pointer" onClick={() => setShowUnitDetail(u)}>
                        <td className="py-2 font-medium text-[var(--shell-text)]">{u.number}</td>
                        <td className="py-2 text-[var(--shell-subtext)]">{u.tower ?? "—"}</td>
                        <td className="py-2 text-[var(--shell-subtext)]">{u.floor ?? "—"}</td>
                        <td className="py-2 text-[var(--shell-subtext)]">{u.areaM2 ? `${u.areaM2} m²` : "—"}</td>
                        <td className="py-2 text-[var(--shell-subtext)]">{fmt(u.price)}</td>
                        <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "DISPONIVEL" ? "bg-green-100 text-green-700" : u.status === "RESERVADO" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{STATUS_LABEL[u.status]}</span></td>
                        <td className="py-2 text-[var(--shell-subtext)]">{u.buyerName ?? u.lead?.nomeCorreto ?? u.lead?.nome ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Gerar Unidades */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title={isLoteamento ? "Gerar Lotes" : "Gerar Torre"}>
        <div className="space-y-4">
          {isLoteamento ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Linhas"><input type="number" value={bulkRows} onChange={(e) => setBulkRows(e.target.value)} className={inputCls} min={1} /></Field>
                <Field label="Colunas"><input type="number" value={bulkCols} onChange={(e) => setBulkCols(e.target.value)} className={inputCls} min={1} /></Field>
              </div>
              <Field label="Prefixo"><input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className={inputCls} placeholder="Lote" /></Field>
            </>
          ) : (
            <>
              <Field label="Nome da torre"><input value={bulkTower} onChange={(e) => setBulkTower(e.target.value)} className={inputCls} placeholder="Ex.: A, B, Principal" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Andares"><input type="number" value={bulkFloors} onChange={(e) => setBulkFloors(e.target.value)} className={inputCls} min={1} /></Field>
                <Field label="Unidades por andar"><input type="number" value={bulkUnitsPerFloor} onChange={(e) => setBulkUnitsPerFloor(e.target.value)} className={inputCls} min={1} /></Field>
              </div>
              <Field label="Prefixo"><input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className={inputCls} placeholder="Apto" /></Field>
            </>
          )}
          <Field label="Área (m²) — opcional"><input type="number" value={bulkArea} onChange={(e) => setBulkArea(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowBulk(false)} className={btnSecondary}>Cancelar</button>
            <button type="button" onClick={handleBulkCreate} disabled={bulkLoading} className={btnPrimary}>
              {bulkLoading ? "Gerando..." : "Gerar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Tabela de Preços */}
      <Modal open={showPriceRules} onClose={() => setShowPriceRules(false)} title="Tabela de Preços">
        <div className="space-y-4">
          <Field label="Preço base (R$)"><input type="number" value={prBase} onChange={(e) => setPrBase(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <Field label="Incremento por andar (R$)"><input type="number" value={prFloor} onChange={(e) => setPrFloor(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <Field label="Ágio de esquina (R$)"><input type="number" value={prCorner} onChange={(e) => setPrCorner(e.target.value)} className={inputCls} placeholder="0" /></Field>
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={handleRecalcPrices} disabled={prLoading} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] underline disabled:opacity-50">
              Recalcular preços das unidades
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowPriceRules(false)} className={btnSecondary}>Cancelar</button>
              <button type="button" onClick={handleSavePriceRules} disabled={prLoading} className={btnPrimary}>
                {prLoading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Detalhe da Unidade */}
      <Modal open={!!showUnitDetail} onClose={() => setShowUnitDetail(null)} title={`Unidade ${showUnitDetail?.number ?? ""}`}>
        {showUnitDetail && (
          <div className="space-y-4">
            <div className="space-y-0 rounded-xl border border-[var(--shell-card-border)] px-4 py-1">
              <Row label="Status" value={STATUS_LABEL[showUnitDetail.status]} />
              <Row label="Torre" value={showUnitDetail.tower} />
              <Row label="Andar" value={showUnitDetail.floor} />
              <Row label="Área" value={showUnitDetail.areaM2 ? `${showUnitDetail.areaM2} m²` : null} />
              <Row label="Preço" value={fmt(showUnitDetail.price)} />
              <Row label="Comprador" value={showUnitDetail.buyerName} />
              <Row label="Lead" value={showUnitDetail.lead?.nomeCorreto ?? showUnitDetail.lead?.nome} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {showUnitDetail.status !== "VENDIDO" && (
                <button type="button" onClick={() => { setShowSell(true); setSellBuyer(""); }} className={btnPrimary}>
                  Marcar como Vendido
                </button>
              )}
              {showUnitDetail.status !== "DISPONIVEL" && (
                <button type="button" onClick={() => handleRelease(showUnitDetail.id)} className={btnSecondary}>
                  Liberar Unidade
                </button>
              )}
              <button type="button" onClick={() => handleDeleteUnit(showUnitDetail.id)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ml-auto">
                Excluir
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Vender */}
      <Modal open={showSell} onClose={() => setShowSell(false)} title="Registrar Venda">
        <div className="space-y-4">
          <Field label="Nome do comprador (opcional)">
            <input value={sellBuyer} onChange={(e) => setSellBuyer(e.target.value)} className={inputCls} placeholder="Nome do comprador" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowSell(false)} className={btnSecondary}>Cancelar</button>
            <button type="button" onClick={handleSell} disabled={sellLoading} className={btnPrimary}>
              {sellLoading ? "Salvando..." : "Confirmar Venda"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
