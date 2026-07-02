"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DEMANDA_TIPO_LABEL,
  PortalDemanda,
  getPortalToken,
  portalAdicionarAndamento,
  portalDetalheDemanda,
} from "@/lib/portal-familia.service";

export default function PortalFamiliaDemandaDetalhePage() {
  const params = useParams<{ slug: string; id: string }>();
  const slug = params.slug as string;
  const id = params.id as string;
  const router = useRouter();

  const [demanda, setDemanda] = useState<PortalDemanda | null>(null);
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await portalDetalheDemanda(slug, id);
      setDemanda(data);
    } catch (err: any) {
      setError(err.message ?? "Não foi possível carregar a solicitação.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getPortalToken(slug)) {
      router.replace(`/s/${slug}/portal/login`);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!texto.trim() && !file) return;
    setSending(true);
    setError(null);
    try {
      await portalAdicionarAndamento(slug, id, texto.trim(), file);
      setTexto("");
      setFile(null);
      await load();
    } catch (err: any) {
      setError(err.message ?? "Não foi possível enviar sua resposta.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">Carregando...</div>;
  }
  if (!demanda) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 text-center text-sm text-red-700">
        {error ?? "Solicitação não encontrada."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <button onClick={() => router.push(`/s/${slug}/portal`)} className="text-sm font-medium text-slate-500 hover:text-slate-950">
            ← Voltar
          </button>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-slate-950">{demanda.titulo}</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                demanda.status === "ABERTA" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {demanda.status === "ABERTA" ? "Em aberto" : "Encerrada"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {DEMANDA_TIPO_LABEL[demanda.tipo]} · {new Date(demanda.abertaEm).toLocaleDateString("pt-BR")}
          </p>
          {demanda.observacoes && <p className="mt-3 text-sm text-slate-700">{demanda.observacoes}</p>}
          {demanda.status === "ENCERRADA" && demanda.resolucao && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Retorno</p>
              {demanda.resolucao}
            </div>
          )}
        </div>

        {demanda.andamentos && demanda.andamentos.length > 0 && (
          <div className="space-y-3">
            {demanda.andamentos.map((a) => (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <p className="text-slate-700">{a.texto}</p>
                {a.anexos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.anexos.map((anexo) => (
                      <a
                        key={anexo.id}
                        href={anexo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-slate-500 underline hover:text-slate-950"
                      >
                        {anexo.nome}
                      </a>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-400">{new Date(a.criadoEm).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}

        {demanda.status === "ABERTA" && (
          <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              disabled={sending}
              placeholder="Escreva uma mensagem"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={sending}
              className="w-full text-xs text-slate-500"
            />
            <button
              type="submit"
              disabled={sending || (!texto.trim() && !file)}
              className="w-full rounded-full bg-slate-950 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
