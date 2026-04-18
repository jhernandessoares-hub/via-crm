"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { listProducts, Product, normalizeImageUrl } from "@/lib/products.service";
import { apiFetch } from "@/lib/api";

type ViewMode = "table" | "cards";

type MacroOrigin = "" | "DEVELOPMENT" | "THIRD_PARTY" | "OWN";

// Alinhado ao schema.prisma (sem CHACARA/AREA por enquanto)
type ProductType =
  | "EMPREENDIMENTO"
  | "LOTEAMENTO"
  | "APARTAMENTO"
  | "CASA"
  | "KITNET"
  | "SOBRADO"
  | "TERRENO"
  | "SALA_COMERCIAL"
  | "LOJA"
  | "SALAO_COMERCIAL"
  | "BARRACAO"
  | "OUTRO";

const TYPES_DEVELOPMENT: ProductType[] = ["EMPREENDIMENTO", "LOTEAMENTO"];
const TYPES_THIRD_PARTY: ProductType[] = [
  "APARTAMENTO",
  "CASA",
  "KITNET",
  "SOBRADO",
  "TERRENO",
  "SALA_COMERCIAL",
  "LOJA",
  "SALAO_COMERCIAL",
  "BARRACAO",
  "OUTRO",
];

function labelType(t?: string) {
  switch (t) {
    case "EMPREENDIMENTO":
      return "Empreendimento";
    case "LOTEAMENTO":
      return "Loteamento";
    case "APARTAMENTO":
      return "Apartamento";
    case "CASA":
      return "Casa";
    case "KITNET":
      return "Kitnet";
    case "SOBRADO":
      return "Sobrado";
    case "TERRENO":
      return "Terreno";
    case "SALA_COMERCIAL":
      return "Sala comercial";
    case "LOJA":
      return "Loja";
    case "SALAO_COMERCIAL":
      return "Salão comercial";
    case "BARRACAO":
      return "Barracão / Galpão";
    case "OUTRO":
      return "Outro";
    default:
      return t ? t.replaceAll("_", " ") : "-";
  }
}

/**
 * Helpers resilientes: como o backend pode evoluir,
 * a UI tenta ler de múltiplos campos possíveis sem quebrar.
 */
function getString(p: any, keys: string[]): string {
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function getNumber(p: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      // tenta converter "1234.56" ou "1.234,56"
      const s = v.trim();
      if (!s) continue;
      const normalized = s
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "");
      const n = Number(normalized);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelOrigin(origin?: string) {
  switch (origin) {
    case "DEVELOPMENT":
      return "Empreendimento/Loteamento";
    case "THIRD_PARTY":
      return "Imóvel de terceiros";
    case "OWN":
      return "Próprio";
    default:
      return origin ?? "-";
  }
}

function labelStatus(status?: string, active?: boolean) {
  if (!status && typeof active === "boolean") return active ? "Ativo" : "Inativo";
  switch (status) {
    case "ACTIVE": return "Ativo";
    case "RESERVED": return "Reservado";
    case "INACTIVE": return "Inativo";
    case "SOLD": return "Vendido";
    case "SOLD_OUT": return "Esgotado";
    case "ARCHIVED": return "Arquivado";
    default: return status ?? "-";
  }
}

function toneByStatus(status?: string, active?: boolean) {
  if (!status && typeof active === "boolean") return active ? "success" : "neutral";
  switch (status) {
    case "ACTIVE": return "success";
    case "RESERVED": return "warning";
    case "INACTIVE": case "ARCHIVED": return "neutral";
    case "SOLD": case "SOLD_OUT": return "danger";
    default: return "neutral";
  }
}

function labelCondition(condition?: string) {
  switch (condition) {
    case "NA_PLANTA": return "Na planta";
    case "EM_CONSTRUCAO": return "Em construção";
    case "PRONTO": return "Pronto";
    default: return null;
  }
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: any;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-neutral-200 bg-neutral-50 text-neutral-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function getPrimaryImageUrl(p: any): string | null {
  const imgs = Array.isArray(p?.images) ? p.images : [];
  // tenta achar "primary" se existir, senão pega a primeira
  const primary =
    imgs.find((x: any) => typeof x === "object" && (x.isPrimary || x.primary)) ?? imgs[0];
  if (!primary) return null;
  return normalizeImageUrl(primary) ?? null;
}

export default function ProductsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("cards");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) { const u = JSON.parse(raw); setUserRole(u.role ?? null); setUserId(u.id ?? null); }
    } catch {}
  }, []);

  // filtros
  const [filterName, setFilterName] = useState("");
  const [filterMacroType, setFilterMacroType] = useState<MacroOrigin>(""); // origin
  const [filterType, setFilterType] = useState<string>(""); // type (ProductType) dinâmico
  const [filterStatus, setFilterStatus] = useState(""); // ACTIVE, INACTIVE...
  const [filterNeighborhood, setFilterNeighborhood] = useState("");
  const [filterAddress, setFilterAddress] = useState("");
  const [filterPriceMin, setFilterPriceMin] = useState("");
  const [filterPriceMax, setFilterPriceMax] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listProducts();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar produtos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleApproveDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("Confirmar exclusão do produto?")) return;
    setActionLoading(id);
    try {
      await apiFetch(`/products/${id}/approve-delete`, { method: "POST" });
      setItems((prev) => prev.filter((p: any) => p.id !== id));
    } catch (err: any) {
      alert(err?.message ?? "Erro ao aprovar exclusão");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    setActionLoading(id);
    try {
      await apiFetch(`/products/${id}/reject-delete`, { method: "POST" });
      setItems((prev) => prev.map((p: any) => p.id === id ? { ...p, deletionRequestedAt: null } : p));
    } catch (err: any) {
      alert(err?.message ?? "Erro ao rejeitar solicitação");
    } finally {
      setActionLoading(null);
    }
  }

  // Quando troca macro, reseta o type para evitar filtro inválido
  useEffect(() => {
    setFilterType("");
  }, [filterMacroType]);

  const typeOptions = useMemo(() => {
    if (!filterMacroType) return [];
    if (filterMacroType === "DEVELOPMENT") return TYPES_DEVELOPMENT;
    if (filterMacroType === "THIRD_PARTY") return TYPES_THIRD_PARTY;
    // OWN: pode ser qualquer coisa; por ora deixamos vazio (ou você decide depois)
    return [];
  }, [filterMacroType]);

  const filteredItems = useMemo(() => {
    const min = filterPriceMin ? Number(filterPriceMin) : null;
    const max = filterPriceMax ? Number(filterPriceMax) : null;

    return items.filter((p: any) => {
      const title = getString(p, ["title", "name", "nome"]);
      const bairro = getString(p, ["neighborhood", "bairro", "district"]);
      const address = getString(p, ["address", "endereco", "logradouro", "street"]);

      const origin = getString(p, ["origin"]);
      const type = getString(p, ["type"]);
      const status = getString(p, ["status"]);
      const active = typeof p?.active === "boolean" ? p.active : undefined;

      // preço: tenta price, priceFrom, minPrice, startingPrice etc.
      const price = getNumber(p, ["price", "priceFrom", "startingPrice", "minPrice", "valor", "valorInicial"]);

      const nameMatch =
        !filterName || title.toLowerCase().includes(filterName.toLowerCase());

      const macroMatch = !filterMacroType || origin === filterMacroType;

      const typeMatch = (() => {
        if (!filterMacroType) return true; // filtro B: só habilita tipo quando macro escolhido
        if (!filterType) return true;
        return type === filterType;
      })();

      // statusMatch: se backend novo vier status, filtra por ele; se não, usa active boolean
      const statusMatch = (() => {
        if (!filterStatus) return true;
        if (status) return status === filterStatus;
        if (typeof active === "boolean") {
          if (filterStatus === "ACTIVE") return active === true;
          if (filterStatus === "INACTIVE") return active === false;
          return false;
        }
        return false;
      })();

      const bairroMatch =
        !filterNeighborhood ||
        bairro.toLowerCase().includes(filterNeighborhood.toLowerCase());

      const addressMatch =
        !filterAddress ||
        address.toLowerCase().includes(filterAddress.toLowerCase());

      const priceMatch = (() => {
        // se não tem preço no item, não bloqueia (pra não esconder produto incompleto)
        if (price === null) return true;
        if (min !== null && !Number.isNaN(min) && price < min) return false;
        if (max !== null && !Number.isNaN(max) && price > max) return false;
        return true;
      })();

      return (
        nameMatch &&
        macroMatch &&
        typeMatch &&
        statusMatch &&
        bairroMatch &&
        addressMatch &&
        priceMatch
      );
    });
  }, [
    items,
    filterName,
    filterMacroType,
    filterType,
    filterStatus,
    filterNeighborhood,
    filterAddress,
    filterPriceMin,
    filterPriceMax,
  ]);

  const total = filteredItems.length;

  return (
    <AppShell title="Produtos">
      <div className="mx-auto w-full max-w-6xl">
        {/* HEADER */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--shell-text)]">Produtos</h1>
            <p className="text-sm text-[var(--shell-subtext)]">
              {loading ? "Carregando..." : `${total} produto(s)`}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={load}
              className="rounded-lg border px-4 py-2 text-sm font-medium shadow-sm hover:bg-[var(--shell-hover)] bg-[var(--shell-card-bg)]"
              style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
              disabled={loading}
            >
              {loading ? "Atualizando..." : "Recarregar"}
            </button>

            <Link
              href="/products/new"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800"
            >
              + Novo produto
            </Link>
          </div>
        </div>

        {/* FILTROS */}
        <div className="mb-6 grid gap-3 rounded-xl border p-4 shadow-sm sm:grid-cols-6 bg-[var(--shell-card-bg)]" style={{ borderColor: "var(--shell-card-border)" }}>
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          />

          {/* Macro (B - primeiro) */}
          <select
            value={filterMacroType}
            onChange={(e) => setFilterMacroType(e.target.value as MacroOrigin)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          >
            <option value="">Macro tipo (todos)</option>
            <option value="DEVELOPMENT">Empreendimento/Loteamento</option>
            <option value="THIRD_PARTY">Imóvel de terceiros</option>
            <option value="OWN">Próprio</option>
          </select>

          {/* Tipo (B - aparece só se macro escolhido) */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
            disabled={!filterMacroType || typeOptions.length === 0}
            title={!filterMacroType ? "Escolha o Macro tipo primeiro" : undefined}
          >
            <option value="">
              {!filterMacroType ? "Tipo (selecione macro)" : "Tipo (todos)"}
            </option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {labelType(t)}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          >
            <option value="">Status (todos)</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
            <option value="RESERVED">Reservado</option>
            <option value="SOLD">Vendido</option>
            <option value="SOLD_OUT">Esgotado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>

          <input
            type="text"
            placeholder="Bairro..."
            value={filterNeighborhood}
            onChange={(e) => setFilterNeighborhood(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          />

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setView("cards")}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                view === "cards"
                  ? "bg-neutral-900 text-white"
                  : "border bg-[var(--shell-card-bg)]"
              }`}
              style={view !== "cards" ? { borderColor: "var(--shell-card-border)", color: "var(--shell-text)" } : undefined}
            >
              Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                view === "table"
                  ? "bg-neutral-900 text-white"
                  : "border bg-[var(--shell-card-bg)]"
              }`}
              style={view !== "table" ? { borderColor: "var(--shell-card-border)", color: "var(--shell-text)" } : undefined}
            >
              Lista
            </button>
          </div>

          <input
            type="text"
            placeholder="Endereço..."
            value={filterAddress}
            onChange={(e) => setFilterAddress(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-3"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
          />

          {/* Preço min/max */}
          <div className="sm:col-span-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="number"
              placeholder="Valor a partir de (R$)"
              value={filterPriceMin}
              onChange={(e) => setFilterPriceMin(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
              min={0}
            />
            <input
              type="number"
              placeholder="Valor até (R$)"
              value={filterPriceMax}
              onChange={(e) => setFilterPriceMax(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
              min={0}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* CARDS */}
        {view === "cards" && (
          <>
            {loading ? (
              <div className="rounded-xl border p-6 text-sm shadow-sm bg-[var(--shell-card-bg)] text-[var(--shell-subtext)]" style={{ borderColor: "var(--shell-card-border)" }}>
                Carregando...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border p-6 text-sm shadow-sm bg-[var(--shell-card-bg)] text-[var(--shell-subtext)]" style={{ borderColor: "var(--shell-card-border)" }}>
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((p: any) => {
                  const type = getString(p, ["type"]);
                  const status = getString(p, ["status"]);
                  const pubStatus = getString(p, ["publicationStatus"]);
                  const condition = getString(p, ["condition"]);
                  const active = typeof p?.active === "boolean" ? p.active : undefined;

                  const title = getString(p, ["title", "name", "nome"]);
                  const city = getString(p, ["city"]);
                  const state = getString(p, ["state"]);
                  const neighborhood = getString(p, ["neighborhood", "bairro"]);
                  const price = getNumber(p, ["price", "priceFrom", "startingPrice", "minPrice", "valor"]);

                  const img = getPrimaryImageUrl(p);
                  const condLabel = labelCondition(condition);

                  // Publicação como status primário: Rascunho se DRAFT, senão usa status operacional
                  const isDraft = pubStatus === "DRAFT";

                  const hasPendingDeletion = !!(p as any).deletionRequestedAt;
                  const canApprove = hasPendingDeletion && (userRole === "OWNER" || userRole === "MANAGER");
                  const isActioning = actionLoading === p.id;

                  return (
                    <div key={p.id} className={`rounded-xl border shadow-sm overflow-hidden bg-[var(--shell-card-bg)] ${hasPendingDeletion ? "border-red-300 ring-1 ring-red-200" : ""}`} style={{ borderColor: hasPendingDeletion ? undefined : "var(--shell-card-border)" }}>
                      <Link href={`/products/${p.id}`} className="block hover:opacity-95 transition-opacity">
                        {/* Imagem */}
                        <div className="h-36 w-full bg-[var(--shell-bg)] relative">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={title || "Produto"} className="h-36 w-full object-cover" />
                          ) : (
                            <div className="flex h-36 w-full items-center justify-center text-xs text-[var(--shell-subtext)]">
                              Sem imagem
                            </div>
                          )}
                          {hasPendingDeletion && (
                            <div className="absolute top-2 right-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                              Exclusão pendente
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          {/* Badges */}
                          <div className="mb-2.5 flex flex-wrap gap-1.5">
                            {type && <Badge tone="neutral">{labelType(type)}</Badge>}
                            {condLabel && <Badge tone="neutral">{condLabel}</Badge>}
                            {isDraft
                              ? <Badge tone="warning">Rascunho</Badge>
                              : <Badge tone={toneByStatus(status, active) as any}>{labelStatus(status, active)}</Badge>
                            }
                          </div>

                          {/* Nome */}
                          <div className="mb-1.5 text-sm font-semibold text-[var(--shell-text)] leading-snug line-clamp-2">
                            {title || "(Sem título)"}
                          </div>

                          {/* Localização */}
                          {(city || neighborhood) && (
                            <div className="mb-2 text-xs text-[var(--shell-subtext)] leading-relaxed">
                              {city && state ? `${city} — ${state}` : city || state}
                              {neighborhood && (city || state) ? ` · ${neighborhood}` : neighborhood}
                            </div>
                          )}

                          {/* Preço */}
                          <div className="text-sm font-semibold text-[var(--shell-text)]">
                            {price !== null
                              ? <>{["EMPREENDIMENTO", "LOTEAMENTO"].includes(type) ? "A partir de " : ""}{formatBRL(price)}</>
                              : <span className="font-normal text-[var(--shell-subtext)]">Preço não definido</span>
                            }
                          </div>

                          {/* Data atualização */}
                          {p.updatedAt && (
                            <div className="mt-2 text-[11px] text-[var(--shell-subtext)]">
                              Atualizado {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </div>
                      </Link>

                      {/* Ações de exclusão pendente */}
                      {canApprove && (
                        <div className="border-t border-red-200 px-4 py-2.5 flex gap-2 bg-red-50">
                          <p className="flex-1 text-xs text-red-700 font-medium leading-tight self-center">Corretor solicitou exclusão</p>
                          <button
                            onClick={(e) => handleRejectDelete(p.id, e)}
                            disabled={isActioning}
                            className="rounded-lg border border-[var(--shell-card-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)] disabled:opacity-50 transition-colors"
                          >
                            Rejeitar
                          </button>
                          <button
                            onClick={(e) => handleApproveDelete(p.id, e)}
                            disabled={isActioning}
                            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isActioning ? "..." : "Aprovar"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TABELA */}
        {view === "table" && (
          <div className="overflow-hidden rounded-xl border shadow-sm bg-[var(--shell-card-bg)]" style={{ borderColor: "var(--shell-card-border)" }}>
            <div className="grid grid-cols-12 gap-0 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide bg-[var(--shell-bg)] text-[var(--shell-subtext)]" style={{ borderColor: "var(--shell-card-border)" }}>
              <div className="col-span-4">Título</div>
              <div className="col-span-2">Macro</div>
              <div className="col-span-2">Tipo</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Bairro</div>
              <div className="col-span-1 text-right">Valor</div>
            </div>

            {loading ? (
              <div className="p-6 text-sm text-[var(--shell-subtext)]">Carregando...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-6 text-sm text-[var(--shell-subtext)]">Nenhum produto encontrado.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
                {filteredItems.map((p: any) => {
                  const origin = getString(p, ["origin"]);
                  const type = getString(p, ["type"]);
                  const status = getString(p, ["status"]);
                  const active = typeof p?.active === "boolean" ? p.active : undefined;

                  const title = getString(p, ["title", "name", "nome"]);
                  const bairro = getString(p, ["neighborhood", "bairro"]);
                  const address = getString(p, ["address", "endereco", "logradouro", "street"]);
                  const price = getNumber(p, ["price", "priceFrom", "startingPrice", "minPrice", "valor"]);

                  return (
                    <div key={p.id} className="grid grid-cols-12 items-center px-4 py-4 text-sm">
                      <div className="col-span-4">
                        <div className="font-medium text-[var(--shell-text)]">
                          {title || "(Sem título)"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--shell-subtext)]">{address}</div>
                      </div>

                      <div className="col-span-2">
                        <Badge tone="neutral">{labelOrigin(origin)}</Badge>
                      </div>

                      <div className="col-span-2">
                        {type ? <Badge tone="neutral">{labelType(type)}</Badge> : "-"}
                      </div>

                      <div className="col-span-2">
                        <Badge tone={toneByStatus(status, active) as any}>
                          {labelStatus(status, active)}
                        </Badge>
                      </div>

                      <div className="col-span-1 text-[var(--shell-subtext)]">{bairro || "-"}</div>

                      <div className="col-span-1 text-right text-[var(--shell-subtext)]">
                        {price !== null ? formatBRL(price) : "-"}
                      </div>

                      <div className="col-span-12 mt-2 flex justify-end">
                        <Link
                          href={`/products/${p.id}`}
                          className="rounded-lg border px-3 py-2 text-xs font-medium shadow-sm hover:bg-[var(--shell-hover)] bg-[var(--shell-card-bg)]"
                          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                        >
                          Editar
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
