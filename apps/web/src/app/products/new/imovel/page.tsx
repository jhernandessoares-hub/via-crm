"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createProduct } from "@/lib/products.service";
import { maskArea, parseArea, inp, sel } from "@/lib/format";

type ProductType =
  | "APARTAMENTO" | "CASA" | "KITNET" | "SOBRADO" | "TERRENO"
  | "SALA_COMERCIAL" | "LOJA" | "SALAO_COMERCIAL" | "BARRACAO" | "OUTRO";

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: "APARTAMENTO",     label: "Apartamento" },
  { value: "CASA",            label: "Casa" },
  { value: "KITNET",          label: "Kitnet" },
  { value: "SOBRADO",         label: "Sobrado" },
  { value: "TERRENO",         label: "Terreno" },
  { value: "SALA_COMERCIAL",  label: "Sala comercial" },
  { value: "LOJA",            label: "Loja" },
  { value: "SALAO_COMERCIAL", label: "Salão comercial" },
  { value: "BARRACAO",        label: "Barracão / Galpão" },
  { value: "OUTRO",           label: "Outro" },
];

export default function NewImovelPage() {
  const router = useRouter();

  const [type,           setType]           = useState<ProductType>("APARTAMENTO");
  const [dealType,       setDealType]       = useState("SALE");
  const [condition,      setCondition]      = useState("");
  const [standard,       setStandard]       = useState("");
  const [origin,         setOrigin]         = useState<"OWN" | "THIRD_PARTY" | "DEVELOPMENT" | "PARTNERSHIP">("THIRD_PARTY");
  const [builtAreaM2,    setBuiltAreaM2]    = useState("");
  const [landAreaM2,     setLandAreaM2]     = useState("");
  const [landNA,         setLandNA]         = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const typeLabel = PRODUCT_TYPES.find((t) => t.value === type)?.label ?? type;
      const created = await createProduct({
        title:       typeLabel,
        type,
        status:      "ACTIVE",
        dealType,
        condition:   condition   || undefined,
        standard:    standard    || undefined,
        origin,
        builtAreaM2: builtAreaM2 ? parseArea(builtAreaM2) : undefined,
        landAreaM2:  !landNA && landAreaM2 ? parseArea(landAreaM2) : undefined,
      });
      router.push(`/products/${created.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar produto");
      setSaving(false);
    }
  }

  return (
    <AppShell title="Novo imóvel">
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6">
        <Link href="/products/new" className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)]">
          ← Voltar
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Novo imóvel</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Preencha o básico para criar. Você completará os detalhes na próxima tela.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-[var(--shell-card-bg)] p-6 shadow-sm">

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Tipo *</label>
          <select value={type} onChange={(e) => setType(e.target.value as ProductType)} className={sel}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Finalidade *</label>
          <select value={dealType} onChange={(e) => setDealType(e.target.value)} className={sel}>
            <option value="SALE">Venda</option>
            <option value="RENT">Locação</option>
            <option value="BOTH">Venda e Locação</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Estado do imóvel</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className={sel}>
            <option value="">-</option>
            <option value="NOVO">Novo</option>
            <option value="USADO">Usado</option>
            <option value="EM_CONSTRUCAO">Em construção</option>
            <option value="NA_PLANTA">Na planta</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Padrão</label>
          <select value={standard} onChange={(e) => setStandard(e.target.value)} className={sel}>
            <option value="">-</option>
            <option value="ECONOMICO">Econômico</option>
            <option value="MEDIO">Médio</option>
            <option value="ALTO">Alto</option>
            <option value="LUXO">Luxo</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Origem</label>
          <select value={origin} onChange={(e) => setOrigin(e.target.value as any)} className={sel}>
            <option value="THIRD_PARTY">Imóvel de terceiros</option>
            <option value="OWN">Próprio</option>
            <option value="PARTNERSHIP">Parceria com outra Imob/Corretor</option>
          </select>
        </div>

        {/* Áreas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">M² construção / Área Privativa</label>
            <input
              value={builtAreaM2}
              onChange={(e) => setBuiltAreaM2(maskArea(e.target.value))}
              inputMode="numeric"
              placeholder="00,00"
              className={inp}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">M² terreno</label>
            <div className="flex gap-2">
              <input
                value={landNA ? "" : landAreaM2}
                onChange={(e) => setLandAreaM2(maskArea(e.target.value))}
                inputMode="numeric"
                placeholder="00,00"
                disabled={landNA}
                className={`${inp} flex-1 disabled:opacity-40`}
              />
              <button
                type="button"
                onClick={() => { setLandNA(!landNA); setLandAreaM2(""); }}
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs transition-colors ${landNA ? "border-neutral-400 bg-neutral-100 text-neutral-600 font-medium" : "border-neutral-200 text-neutral-400 hover:bg-neutral-50"}`}
              >
                N/A
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href="/products/new"
            className="rounded-lg border border-neutral-200 bg-[var(--shell-card-bg)] px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Criando..." : "Criar e continuar"}
          </button>
        </div>
      </form>
    </div>
    </AppShell>
  );
}
