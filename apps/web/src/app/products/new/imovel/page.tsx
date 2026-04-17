"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createProduct } from "@/lib/products.service";

type ProductType =
  | "APARTAMENTO" | "CASA" | "KITNET" | "SOBRADO" | "TERRENO"
  | "SALA_COMERCIAL" | "LOJA" | "SALAO_COMERCIAL" | "BARRACAO" | "OUTRO";

type ProductStatus = "ACTIVE" | "INACTIVE" | "RESERVED" | "SOLD" | "ARCHIVED";

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

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "RESERVED", label: "Reservado" },
  { value: "SOLD",     label: "Vendido" },
  { value: "ARCHIVED", label: "Arquivado" },
];

const inp = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400";
const sel = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 bg-[var(--shell-card-bg)]";

export default function NewImovelPage() {
  const router = useRouter();

  const [type, setType] = useState<ProductType>("APARTAMENTO");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = PRODUCT_TYPES.find((t) => t.value === type)?.label ?? "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const resolvedTitle = title.trim() || typeLabel;
      const created = await createProduct({
        title: resolvedTitle,
        type,
        status,
        origin: "THIRD_PARTY",
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
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Título <span className="font-normal text-neutral-400">(opcional)</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={typeLabel}
            className={inp}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductStatus)}
            className={sel}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
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
