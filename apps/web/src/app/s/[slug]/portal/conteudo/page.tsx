"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PortalConteudo, clearPortalToken, getPortalToken, portalListarConteudos } from "@/lib/portal-familia.service";

function tipoLabel(mimeType: string | null): "video" | "imagem" | "outro" {
  if (!mimeType) return "outro";
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("video/")) return "video";
  return "outro";
}

export default function PortalConteudoPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;
  const router = useRouter();

  const [itens, setItens] = useState<PortalConteudo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getPortalToken(slug)) {
      router.replace(`/s/${slug}/portal/login`);
      return;
    }
    (async () => {
      try {
        const lista = await portalListarConteudos(slug);
        setItens(lista);
      } catch (err: any) {
        setError(err.message ?? "Não foi possível carregar o conteúdo.");
        clearPortalToken(slug);
        router.replace(`/s/${slug}/portal/login`);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-slate-950">Conteúdo Educacional</p>
            <p className="text-sm text-slate-500">Vídeos, fotos e materiais sobre o seu empreendimento</p>
          </div>
          <Link href={`/s/${slug}/portal`} className="text-sm font-medium text-slate-500 hover:text-slate-950">
            Voltar
          </Link>
        </div>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          {itens.length === 0 && (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Nenhum conteúdo disponível no momento.
            </div>
          )}
          {itens.map((item) => {
            const tipo = tipoLabel(item.mimeType);
            return (
              <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{item.titulo}</p>
                  {item.descricao && <p className="mt-1 text-xs text-slate-500">{item.descricao}</p>}
                </div>
                {tipo === "video" && (
                  <video controls className="w-full rounded-xl" src={item.url} />
                )}
                {tipo === "imagem" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.titulo} className="w-full rounded-xl" />
                )}
                {tipo === "outro" && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Abrir material
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
