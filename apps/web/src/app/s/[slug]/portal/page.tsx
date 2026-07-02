"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DEMANDA_TIPO_LABEL,
  PortalDemanda,
  clearPortalToken,
  getPortalToken,
  portalListarDemandas,
  portalLogout,
  portalMe,
} from "@/lib/portal-familia.service";

export default function PortalFamiliaDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;
  const router = useRouter();

  const [nome, setNome] = useState<string | null>(null);
  const [demandas, setDemandas] = useState<PortalDemanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getPortalToken(slug)) {
      router.replace(`/s/${slug}/portal/login`);
      return;
    }
    (async () => {
      try {
        const [me, lista] = await Promise.all([portalMe(slug), portalListarDemandas(slug)]);
        setNome(me.lead.nome);
        setDemandas(lista);
      } catch (err: any) {
        setError(err.message ?? "Não foi possível carregar seus dados.");
        clearPortalToken(slug);
        router.replace(`/s/${slug}/portal/login`);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, router]);

  async function handleLogout() {
    await portalLogout(slug);
    router.replace(`/s/${slug}/portal/login`);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-slate-950">Olá, {nome}</p>
            <p className="text-sm text-slate-500">Suas solicitações de atendimento</p>
          </div>
          <button onClick={handleLogout} className="text-sm font-medium text-slate-500 hover:text-slate-950">
            Sair
          </button>
        </div>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Link
          href={`/s/${slug}/portal/nova`}
          className="block w-full rounded-full bg-slate-950 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Nova solicitação
        </Link>

        <div className="space-y-3">
          {demandas.length === 0 && (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Você ainda não tem nenhuma solicitação registrada.
            </div>
          )}
          {demandas.map((d) => (
            <Link
              key={d.id}
              href={`/s/${slug}/portal/demandas/${d.id}`}
              className="block rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">{d.titulo}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    d.status === "ABERTA" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {d.status === "ABERTA" ? "Em aberto" : "Encerrada"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {DEMANDA_TIPO_LABEL[d.tipo]} · {new Date(d.abertaEm).toLocaleDateString("pt-BR")}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
