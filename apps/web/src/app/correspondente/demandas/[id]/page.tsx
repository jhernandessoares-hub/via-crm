"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getDemand, updateDemandStatus,
  CREDIT_STATUS_LABEL, CREDIT_STATUS_COLOR,
  type CreditRequest, type CreditStatus,
} from "@/lib/correspondente.service";

function fmt(v?: number | null) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const TIPO_LABEL: Record<string, string> = {
  MINHA_CASA_MINHA_VIDA: "Minha Casa Minha Vida",
  SBPE: "SBPE",
  FGTS: "FGTS",
  CONSORCIO: "Consórcio",
  OUTRO: "Outro",
};

const ACTIONS: { status: CreditStatus; label: string; color: string }[] = [
  { status: "EM_ANALISE",    label: "Em Análise",     color: "#f59e0b" },
  { status: "COM_PENDENCIA", label: "Com Pendência",  color: "#8b5cf6" },
  { status: "CONDICIONADO",  label: "Condicionado",   color: "#3b82f6" },
  { status: "APROVADO",      label: "✓ Aprovar",      color: "#22c55e" },
  { status: "REPROVADO",     label: "✕ Reprovar",     color: "#ef4444" },
];

export default function DemandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [demand,  setDemand]  = useState<CreditRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [parecer, setParecer] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("corrToken")) { router.replace("/correspondente/login"); return; }
    load();
  }, [id]);

  async function load() {
    try {
      const d = await getDemand(id);
      setDemand(d);
      setParecer(d.parecer ?? "");
    } catch {
      router.replace("/correspondente/demandas");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(status: CreditStatus) {
    setSaving(true); setError(null);
    try {
      const updated = await updateDemandStatus(id, { status, parecer: parecer.trim() || undefined });
      setDemand(updated);
    } catch (e: any) {
      setError(e.message ?? "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Carregando...</div>
  );
  if (!demand) return null;

  const leadName = demand.lead?.nomeCorreto ?? demand.lead?.nome ?? "—";
  const statusColor = CREDIT_STATUS_COLOR[demand.status];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-white">← Voltar</button>
        <p className="font-bold">Análise de Crédito</p>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">

        {/* Status atual */}
        <div className="flex items-center justify-between">
          <span className="rounded-full px-3 py-1.5 text-sm font-bold"
            style={{ backgroundColor: statusColor + "22", color: statusColor }}>
            {CREDIT_STATUS_LABEL[demand.status]}
          </span>
          <p className="text-xs text-slate-400">Recebido {new Date(demand.createdAt).toLocaleDateString("pt-BR")}</p>
        </div>

        {/* Dados do lead */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente</p>
          <p className="text-lg font-bold">{leadName}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {demand.lead?.telefone && <div><p className="text-slate-400 text-xs">Telefone</p><p>{demand.lead.telefone}</p></div>}
            {demand.lead?.email    && <div><p className="text-slate-400 text-xs">E-mail</p><p>{demand.lead.email}</p></div>}
            {demand.lead?.rendaBrutaFamiliar && <div><p className="text-slate-400 text-xs">Renda Bruta</p><p>{fmt(demand.lead.rendaBrutaFamiliar)}</p></div>}
            {demand.rendaMensal   && <div><p className="text-slate-400 text-xs">Renda Declarada</p><p>{fmt(demand.rendaMensal)}</p></div>}
          </div>
        </div>

        {/* Dados da proposta */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Proposta</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-slate-400 text-xs">Valor do Imóvel</p><p className="font-semibold">{fmt(demand.valorImovel)}</p></div>
            <div><p className="text-slate-400 text-xs">Crédito Solicitado</p><p className="font-semibold">{fmt(demand.valorCredito)}</p></div>
            <div><p className="text-slate-400 text-xs">Tipo de Financiamento</p>
              <p>{demand.tipoFinanciamento ? (TIPO_LABEL[demand.tipoFinanciamento] ?? demand.tipoFinanciamento) : "—"}</p></div>
            <div><p className="text-slate-400 text-xs">Imobiliária</p><p>{demand.tenant?.nome ?? "—"}</p></div>
          </div>
          {demand.observacoes && (
            <div><p className="text-slate-400 text-xs mb-1">Observações</p>
              <p className="text-sm bg-slate-800 rounded-lg px-3 py-2">{demand.observacoes}</p></div>
          )}
        </div>

        {/* Parecer + ações */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Seu Parecer</p>
          <textarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={3}
            placeholder="Informe o resultado, condições, pendências..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 resize-none" />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTIONS.map(({ status, label, color }) => (
              <button key={status} onClick={() => handleAction(status)} disabled={saving}
                className="rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                style={{
                  backgroundColor: demand.status === status ? color : color + "22",
                  color: demand.status === status ? "#fff" : color,
                  border: `1px solid ${color}44`,
                }}>
                {label}
              </button>
            ))}
          </div>
          {saving && <p className="text-xs text-slate-400 text-center">Salvando...</p>}
        </div>

      </main>
    </div>
  );
}
