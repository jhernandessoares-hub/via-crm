"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createProduct } from "@/lib/products.service";

type ProductType =
  | "EMPREENDIMENTO" | "LOTEAMENTO" | "APARTAMENTO" | "CASA" | "KITNET"
  | "SOBRADO" | "TERRENO" | "SALA_COMERCIAL" | "LOJA" | "SALAO_COMERCIAL"
  | "BARRACAO" | "OUTRO";

type ProductStatus = "ACTIVE" | "INACTIVE" | "RESERVED" | "SOLD" | "SOLD_OUT" | "ARCHIVED";

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: "APARTAMENTO",    label: "Apartamento" },
  { value: "CASA",           label: "Casa" },
  { value: "KITNET",         label: "Kitnet" },
  { value: "SOBRADO",        label: "Sobrado" },
  { value: "TERRENO",        label: "Terreno" },
  { value: "SALA_COMERCIAL", label: "Sala comercial" },
  { value: "LOJA",           label: "Loja" },
  { value: "SALAO_COMERCIAL",label: "Salão comercial" },
  { value: "BARRACAO",       label: "Barracão / Galpão" },
  { value: "OUTRO",          label: "Outro" },
  { value: "EMPREENDIMENTO", label: "Empreendimento" },
  { value: "LOTEAMENTO",     label: "Loteamento" },
];

function labelStatus(s: ProductStatus) {
  switch (s) {
    case "ACTIVE":   return "Ativo";
    case "INACTIVE": return "Inativo";
    case "RESERVED": return "Reservado";
    case "SOLD":     return "Vendido";
    case "SOLD_OUT": return "Esgotado";
    case "ARCHIVED": return "Arquivado";
    default: return s;
  }
}

const inp = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400";
const sel = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 bg-white";

export default function NewProductPage() {
  const router = useRouter();

  const [type, setType] = useState<ProductType>("APARTAMENTO");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpreendimento = type === "EMPREENDIMENTO" || type === "LOTEAMENTO";
  const typeLabel = PRODUCT_TYPES.find((t) => t.value === type)?.label ?? "";
  const titleLabel = isEmpreendimento ? "Nome do empreendimento *" : "Título (opcional)";
  const titlePlaceholder = isEmpreendimento ? "Ex.: Residencial Vista Verde" : typeLabel;

  const canSave = !saving && (!isEmpreendimento || title.trim().length > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // For non-EMPREENDIMENTO: title defaults to the type label if left blank
      const resolvedTitle = title.trim() || typeLabel;
      const origin = isEmpreendimento ? "DEVELOPMENT" : "THIRD_PARTY";
      const created = await createProduct({ title: resolvedTitle, type, status, origin });
      router.push(`/products/${created.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar produto");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Novo produto</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Preencha o básico para criar. Você completará todos os detalhes na próxima tela.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Tipo *</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value as ProductType); setTitle(""); }}
            className={sel}
          >
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">{titleLabel}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            className={inp}
            autoFocus={isEmpreendimento}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductStatus)}
            className={sel}
          >
            {(["ACTIVE", "INACTIVE", "RESERVED", "SOLD", "SOLD_OUT", "ARCHIVED"] as ProductStatus[]).map((s) => (
              <option key={s} value={s}>{labelStatus(s)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/products"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Criando..." : "Criar e continuar"}
          </button>
        </div>
      </form>
    </div>
  );
}
