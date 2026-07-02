"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEMANDA_TIPO_LABEL, DemandaTipo, getPortalToken, portalCriarDemanda } from "@/lib/portal-familia.service";

const TIPOS = Object.keys(DEMANDA_TIPO_LABEL) as DemandaTipo[];

export default function PortalFamiliaNovaDemandaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;
  const router = useRouter();

  const [tipo, setTipo] = useState<DemandaTipo>("DUVIDA");
  const [tituloPersonalizado, setTituloPersonalizado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getPortalToken(slug)) router.replace(`/s/${slug}/portal/login`);
  }, [slug, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const demanda = await portalCriarDemanda(slug, {
        tipo,
        tituloPersonalizado: tipo === "OUTRO" ? tituloPersonalizado : undefined,
        observacoes: observacoes || undefined,
      });
      router.replace(`/s/${slug}/portal/demandas/${demanda.id}`);
    } catch (err: any) {
      setError(err.message ?? "Não foi possível registrar sua solicitação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-sm font-medium text-slate-500 hover:text-slate-950">
            ← Voltar
          </button>
          <p className="mt-2 text-xl font-bold text-slate-950">Nova solicitação</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DemandaTipo)}
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {DEMANDA_TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {tipo === "OUTRO" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Título</label>
              <input
                value={tituloPersonalizado}
                onChange={(e) => setTituloPersonalizado(e.target.value)}
                required
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
                placeholder="Descreva em poucas palavras"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detalhes (opcional)</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
              placeholder="Conte com mais detalhes o que você precisa"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-950 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Enviar solicitação"}
          </button>
        </form>
      </div>
    </div>
  );
}
