"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createProduct } from "@/lib/products.service";

const inp = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400";

export default function NewLoteamentoPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !saving && name.trim().length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createProduct({
        title: name.trim(),
        type: "LOTEAMENTO",
        status: "ACTIVE",
        origin: "DEVELOPMENT",
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        state: state.trim() || undefined,
      });
      router.push(`/products/${created.id}/loteamento`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar");
      setSaving(false);
    }
  }

  return (
    <AppShell title="Novo loteamento">
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6">
        <Link href="/products/new" className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)]">
          ← Voltar
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Novo loteamento
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Informe o nome e a localização para começar.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-200 bg-[var(--shell-card-bg)] p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Loteamento
          </span>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            Nome *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Loteamento Recanto Verde"
            className={inp}
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="mb-1 block text-sm font-medium text-neutral-800">Estado (UF)</label>
            <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} className={inp} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-neutral-800">Cidade</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: São Paulo" className={inp} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-800">Bairro / Região</label>
          <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Ex.: Jardim América" className={inp} />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link href="/products/new" className="rounded-lg border border-neutral-200 bg-[var(--shell-card-bg)] px-4 py-2 text-sm font-medium hover:bg-neutral-50">
            Cancelar
          </Link>
          <button type="submit" disabled={!canSave} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Criando..." : "Criar e continuar"}
          </button>
        </div>
      </form>
    </div>
    </AppShell>
  );
}
