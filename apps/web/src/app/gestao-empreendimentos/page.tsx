"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { listDevelopments, deleteDevelopment, type Development } from "@/lib/developments.service";
import { computeCompleteness } from "@/lib/empreendimento-completeness";

const STATUS_LABEL: Record<string, string> = { LANCAMENTO: "Lançamento", EM_OBRA: "Em Obra", CONCLUIDO: "Concluído" };
const STATUS_COLOR: Record<string, string> = {
  LANCAMENTO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  EM_OBRA:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  CONCLUIDO:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};
const SUBTIPO_LABEL: Record<string, string> = { APARTAMENTO: "Apartamentos", CASA: "Casas", LOTEAMENTO: "Loteamento" };
const TIPO_ICON: Record<string, string> = { VERTICAL: "🏢", HORIZONTAL: "🏘️" };

export default function EmpreendimentosPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try { const u = localStorage.getItem("user"); setRole(u ? JSON.parse(u).role : null); } catch { /* noop */ }
  }, []);

  const isOwnerOrManager = role === "OWNER" || role === "MANAGER";

  async function load() {
    setLoading(true);
    try {
      setItems(await listDevelopments());
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
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
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--shell-text)]">Gestão de Empreendimentos</h1>
            <p className="text-sm text-[var(--shell-subtext)] mt-0.5">Gerencie empreendimentos, torres, unidades e espelho de vendas</p>
          </div>
          {isOwnerOrManager && (
            <button type="button" onClick={() => router.push("/gestao-empreendimentos/novo")}
              className="rounded-xl bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm">
              + Novo Empreendimento
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden animate-pulse">
                <div className="h-36 bg-[var(--shell-bg)]" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-[var(--shell-bg)] rounded w-3/4" />
                  <div className="h-3 bg-[var(--shell-bg)] rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4">🏗️</div>
            <p className="text-base font-semibold text-[var(--shell-text)]">Nenhum empreendimento cadastrado</p>
            <p className="text-sm text-[var(--shell-subtext)] mt-1 mb-6">
              {isOwnerOrManager ? "Comece criando seu primeiro empreendimento" : "Nenhum empreendimento disponível no momento"}
            </p>
            {isOwnerOrManager && (
              <button type="button" onClick={() => router.push("/gestao-empreendimentos/novo")}
                className="rounded-xl bg-[var(--brand-accent)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm">
                + Novo Empreendimento
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const totalUnits = item._count?.units ?? item.towers?.reduce((s: number, t: any) => s + (t.units?.length ?? 0), 0) ?? 0;
              const vendido = (item.towers || []).flatMap((t: any) => t.units || []).filter((u: any) => u.status === "VENDIDO").length;
              const vso = totalUnits > 0 ? Math.round((vendido / totalUnits) * 100) : 0;
              const completeness = computeCompleteness(item);
              const targetUrl = isOwnerOrManager
                ? (completeness.allComplete
                    ? `/gestao-empreendimentos/${item.id}`
                    : `/gestao-empreendimentos/${item.id}?step=${Math.max(0, completeness.firstIncomplete)}`)
                : `/gestao-empreendimentos/${item.id}`;

              return (
                <div key={item.id}
                  className="group rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                  onClick={() => router.push(targetUrl)}>

                  {/* Thumbnail da implantação ou placeholder */}
                  <div className="relative h-40 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 overflow-hidden">
                    {item.implantacaoUrl ? (
                      <img src={item.implantacaoUrl} alt={item.nome}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-30">{TIPO_ICON[item.tipo] ?? "🏗️"}</span>
                      </div>
                    )}
                    {/* Badge de status */}
                    <div className="absolute top-3 right-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${STATUS_COLOR[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </div>
                    {/* Badge de publicação/cadastro */}
                    <div className="absolute top-3 left-3">
                      {item.publishedAt ? (
                        <span className="rounded-full bg-green-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                          ✓ Publicado
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                          📝 Rascunho · {completeness.percent}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Nome e subtipo */}
                    <div className="mb-3">
                      <h2 className="font-bold text-[var(--shell-text)] text-base leading-tight truncate">{item.nome}</h2>
                      <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
                        {SUBTIPO_LABEL[item.subtipo] ?? item.subtipo}
                        {item.cidade ? ` · ${item.cidade}` : ""}
                        {item.estado ? `, ${item.estado}` : ""}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[
                        { v: totalUnits, l: "Unidades" },
                        { v: item.towers?.length ?? 0, l: item.tipo === "VERTICAL" ? "Torres" : "Quadras" },
                        { v: `${vso}%`, l: "VSO" },
                      ].map((s) => (
                        <div key={s.l} className="rounded-xl bg-[var(--shell-bg)] p-2 text-center">
                          <p className="text-base font-bold text-[var(--shell-text)]">{s.v}</p>
                          <p className="text-[10px] text-[var(--shell-subtext)] mt-0.5">{s.l}</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de progresso VSO */}
                    {totalUnits > 0 && (
                      <div className="mb-4">
                        <div className="h-1.5 rounded-full bg-[var(--shell-bg)] overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-500"
                            style={{ width: `${vso}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex items-center justify-between">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(targetUrl); }}
                        className="text-xs font-semibold text-[var(--brand-accent)] hover:underline">
                        {isOwnerOrManager
                          ? (item.publishedAt ? "Ver espelho →" : completeness.allComplete ? "Publicar →" : "Continuar cadastro →")
                          : "Ver espelho →"}
                      </button>
                      {isOwnerOrManager && (
                        <button type="button"
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={deleting === item.id}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors">
                          {deleting === item.id ? "..." : "Excluir"}
                        </button>
                      )}
                    </div>
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
