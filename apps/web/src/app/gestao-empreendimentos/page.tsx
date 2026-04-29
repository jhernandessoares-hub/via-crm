"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { listDevelopments, deleteDevelopment } from "@/lib/developments.service";

const STATUS_LABEL: Record<string, string> = {
  LANCAMENTO: "Lançamento",
  EM_OBRA: "Em Obra",
  CONCLUIDO: "Concluído",
};

const STATUS_COLOR: Record<string, string> = {
  LANCAMENTO: "bg-blue-100 text-blue-700",
  EM_OBRA: "bg-yellow-100 text-yellow-700",
  CONCLUIDO: "bg-green-100 text-green-700",
};

const SUBTIPO_LABEL: Record<string, string> = {
  APARTAMENTO: "Apartamentos",
  CASA: "Casas",
  LOTEAMENTO: "Loteamento",
};

export default function EmpreendimentosPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listDevelopments();
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este empreendimento? Todas as torres e unidades serão removidas.")) return;
    setDeleting(id);
    try {
      await deleteDevelopment(id);
      setItems((p) => p.filter((i) => i.id !== id));
    } catch (e: any) {
      alert(e?.message ?? "Erro ao excluir");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <AppShell title="Gestão de Empreendimentos">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--shell-text)]">Gestão de Empreendimentos</h1>
            <p className="text-sm text-[var(--shell-subtext)] mt-0.5">Gestão de empreendimentos e unidades</p>
          </div>
          <button type="button" onClick={() => router.push("/gestao-empreendimentos/novo")}
            className="rounded-xl bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity">
            + Novo Empreendimento
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">🏗️</div>
            <p className="text-sm font-medium text-[var(--shell-text)]">Nenhum empreendimento cadastrado</p>
            <p className="text-xs text-[var(--shell-subtext)] mt-1">Clique em "Novo Empreendimento" para começar</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const totalUnits = item._count?.units ?? 0;
              return (
                <div key={item.id}
                  className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/gestao-empreendimentos/${item.id}`)}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-[var(--shell-text)] truncate">{item.nome}</h2>
                      <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
                        {SUBTIPO_LABEL[item.subtipo] ?? item.subtipo}
                        {item.cidade ? ` · ${item.cidade}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="rounded-lg bg-[var(--shell-bg)] p-2">
                      <p className="text-lg font-bold text-[var(--shell-text)]">{totalUnits}</p>
                      <p className="text-[10px] text-[var(--shell-subtext)]">Unidades</p>
                    </div>
                    <div className="rounded-lg bg-[var(--shell-bg)] p-2">
                      <p className="text-lg font-bold text-[var(--shell-text)]">{item.towers?.length ?? 0}</p>
                      <p className="text-[10px] text-[var(--shell-subtext)]">{item.tipo === "VERTICAL" ? "Torres" : "Quadras"}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--shell-bg)] p-2">
                      <p className="text-lg font-bold text-[var(--shell-text)]">{item.sunOrientation}</p>
                      <p className="text-[10px] text-[var(--shell-subtext)]">Sol</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); router.push(`/gestao-empreendimentos/${item.id}`); }}
                      className="text-xs font-medium text-[var(--brand-accent)] hover:underline">
                      Ver planta →
                    </button>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                      disabled={deleting === item.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
