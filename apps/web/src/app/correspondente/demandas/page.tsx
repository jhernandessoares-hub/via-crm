"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listMyDemands, correspondentMe,
  CREDIT_STATUS_LABEL, CREDIT_STATUS_COLOR,
  type CreditRequest, type CreditStatus,
} from "@/lib/correspondente.service";

function fmt(v?: number | null) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const STATUS_ORDER: CreditStatus[] = ["EM_ANALISE", "COM_PENDENCIA", "CONDICIONADO", "APROVADO", "REPROVADO"];

export default function DemandasPage() {
  const router = useRouter();
  const [user,     setUser]     = useState<any>(null);
  const [demands,  setDemands]  = useState<CreditRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<CreditStatus | "TODAS">("TODAS");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("corrUser") : null;
    if (!stored) { router.replace("/correspondente/login"); return; }
    setUser(JSON.parse(stored));
    load();
  }, []);

  async function load() {
    try {
      const data = await listMyDemands();
      setDemands(data);
    } catch {
      router.replace("/correspondente/login");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("corrToken");
    localStorage.removeItem("corrUser");
    router.replace("/correspondente/login");
  }

  const filtered = filter === "TODAS" ? demands : demands.filter((d) => d.status === filter);

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = demands.filter((d) => d.status === s).length;
    return acc;
  }, {} as Record<CreditStatus, number>);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-base font-bold">Portal do Correspondente</p>
          {user && <p className="text-xs text-slate-400">{user.nome}{user.empresa ? ` · ${user.empresa}` : ""}</p>}
        </div>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-white transition-colors">Sair</button>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <h1 className="text-lg font-bold">Minhas Demandas</h1>

        {/* Filtros por status */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFilter("TODAS")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
              ${filter === "TODAS" ? "bg-white text-slate-900" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>
            Todas ({demands.length})
          </button>
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                ${filter === s ? "text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}
              style={filter === s ? { backgroundColor: CREDIT_STATUS_COLOR[s] } : {}}>
              {CREDIT_STATUS_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">Nenhuma demanda{filter !== "TODAS" ? " com este status" : ""}.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((d) => {
              const leadName = d.lead?.nomeCorreto ?? d.lead?.nome ?? "—";
              return (
                <div key={d.id}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4 flex items-center gap-4 cursor-pointer hover:border-slate-500 transition-colors"
                  onClick={() => router.push(`/correspondente/demandas/${d.id}`)}>
                  {/* Status badge */}
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ backgroundColor: CREDIT_STATUS_COLOR[d.status] + "22", color: CREDIT_STATUS_COLOR[d.status] }}>
                    {CREDIT_STATUS_LABEL[d.status]}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{leadName}</p>
                    <p className="text-xs text-slate-400">
                      {d.tenant?.nome ?? "—"} · {d.tipoFinanciamento?.replace("_", " ") ?? "Financiamento"} · {fmt(d.valorCredito)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString("pt-BR")}</p>
                    {d.respondedAt && (
                      <p className="text-[10px] text-slate-500">Respondido {new Date(d.respondedAt).toLocaleDateString("pt-BR")}</p>
                    )}
                  </div>

                  <span className="text-slate-500">›</span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
