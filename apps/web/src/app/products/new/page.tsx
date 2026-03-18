"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createProduct } from "@/lib/products.service";

type MacroType = "DEVELOPMENT" | "THIRD_PARTY";
type ProductStatus = "ACTIVE" | "INACTIVE" | "RESERVED" | "SOLD" | "SOLD_OUT" | "ARCHIVED";

// Alinhado ao schema.prisma atual (sem CHACARA/AREA por enquanto)
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

function labelType(v: ProductType) {
  switch (v) {
    case "EMPREENDIMENTO": return "Empreendimento";
    case "LOTEAMENTO": return "Loteamento";
    case "APARTAMENTO": return "Apartamento";
    case "CASA": return "Casa";
    case "KITNET": return "Kitnet";
    case "SOBRADO": return "Sobrado";
    case "TERRENO": return "Terreno";
    case "SALA_COMERCIAL": return "Sala comercial";
    case "LOJA": return "Loja";
    case "SALAO_COMERCIAL": return "Salão comercial";
    case "BARRACAO": return "Barracão / Galpão";
    case "OUTRO": return "Outro";
    default: return String(v);
  }
}

function labelStatus(s: ProductStatus) {
  switch (s) {
    case "ACTIVE": return "Ativo";
    case "INACTIVE": return "Inativo";
    case "RESERVED": return "Reservado";
    case "SOLD": return "Vendido";
    case "SOLD_OUT": return "Esgotado";
    case "ARCHIVED": return "Arquivado";
    default: return s;
  }
}

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

export default function NewProductPage() {
  const router = useRouter();

  const [macroType, setMacroType] = useState<MacroType>("DEVELOPMENT");
  const [type, setType] = useState<ProductType>("EMPREENDIMENTO");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");

  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [price, setPrice] = useState<string>("");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChangeMacro(next: MacroType) {
    setMacroType(next);
    setType(next === "DEVELOPMENT" ? "EMPREENDIMENTO" : "CASA");
  }

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!title.trim()) return false;

    if (macroType === "DEVELOPMENT") {
      return TYPES_DEVELOPMENT.includes(type);
    }
    return TYPES_THIRD_PARTY.includes(type);
  }, [saving, title, macroType, type]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);

    try {
      const parsedPrice =
        price.trim() === "" ? undefined : Number(price.replace(",", "."));

      // ✅ Enviar SOMENTE o que o DTO aceita hoje
      const payload: any = {
        title: title.trim(),
        origin: macroType,
        type,
        status,
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        description: description.trim() || undefined,
        price: Number.isFinite(parsedPrice as number) ? (parsedPrice as number) : undefined,
      };

      const created = await createProduct(payload);
      router.push(`/products/${created.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar produto");
    } finally {
      setSaving(false);
    }
  }

  const typeOptions = macroType === "DEVELOPMENT" ? TYPES_DEVELOPMENT : TYPES_THIRD_PARTY;

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
          <p className="text-sm text-neutral-500">
            Primeiro salvamos o básico. Depois abrimos documentos, mídias e marketing.
          </p>
        </div>

        <Link
          href="/products"
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
        >
          Voltar
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {/* Macro tipo */}
        <div className="mb-6">
          <label className="text-sm font-medium text-neutral-800">Macro tipo *</label>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onChangeMacro("DEVELOPMENT")}
              className={`rounded-lg border px-4 py-3 text-left text-sm shadow-sm ${
                macroType === "DEVELOPMENT"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <div className="font-semibold">Empreendimento / Loteamento</div>
              <div className="mt-1 text-xs opacity-90">IA vai ajudar via documentos (depois)</div>
            </button>

            <button
              type="button"
              onClick={() => onChangeMacro("THIRD_PARTY")}
              className={`rounded-lg border px-4 py-3 text-left text-sm shadow-sm ${
                macroType === "THIRD_PARTY"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <div className="font-semibold">Imóvel de terceiros</div>
              <div className="mt-1 text-xs opacity-90">Cadastro manual (IA entra no marketing depois)</div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-neutral-800">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={macroType === "DEVELOPMENT" ? "Ex.: Residencial Vista Verde" : "Ex.: Casa 3 dormitórios"}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-neutral-800">Tipo *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProductType)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {labelType(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            >
              {(["ACTIVE","INACTIVE","RESERVED","SOLD","SOLD_OUT","ARCHIVED"] as ProductStatus[]).map((s) => (
                <option key={s} value={s}>{labelStatus(s)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Preço (opcional)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ex.: 499999.90"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Cidade (opcional)</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex.: Campinas"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Bairro (opcional)</label>
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex.: Centro"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-neutral-800">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Link
            href="/products"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
          >
            Cancelar
          </Link>

          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Criar e continuar"}
          </button>
        </div>
      </form>
    </div>
  );
}