"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const LOGO_URL =
  "https://res.cloudinary.com/divurdnpz/image/upload/e_trim/v1783042264/via-crm/sites/sp9/yvzu4cu5xuswjbgayc35.jpg";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ConviteData = {
  nome: string;
  sessao: { titulo: string; dataAgendada: string; local: string | null };
  rsvpStatus: "AGUARDANDO" | "CONFIRMOU" | "RECUSOU";
};

export default function ConvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token as string;

  const [data, setData] = useState<ConviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<"pergunta" | "confirmacao">("pergunta");
  const [resposta, setResposta] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/pre-ocupacao-convite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Este convite não é mais válido — fale com a equipe.");
        }
        return res.json();
      })
      .then((res: ConviteData) => {
        setData(res);
        if (res.rsvpStatus !== "AGUARDANDO") {
          setResposta(res.rsvpStatus === "CONFIRMOU");
        }
      })
      .catch((e: any) => setError(e?.message ?? "Este convite não é mais válido — fale com a equipe."))
      .finally(() => setLoading(false));
  }, [token]);

  async function responder(confirmar: boolean) {
    setEnviando(true);
    try {
      const res = await fetch(`${API}/pre-ocupacao-convite/${token}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Não foi possível registrar sua resposta.");
      }
      setResposta(confirmar);
      setEtapa("confirmacao");
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível registrar sua resposta.");
    } finally {
      setEnviando(false);
    }
  }

  const dataLabel = data ? new Date(data.sessao.dataAgendada).toLocaleDateString("pt-BR") : "";
  const horaLabel = data
    ? new Date(data.sessao.dataAgendada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const localTrecho = data?.sessao.local ? `, em ${data.sessao.local}` : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center">
          <div className="relative h-16 w-16 shrink-0">
            <Image src={LOGO_URL} alt="SIM José Bonifácio" fill unoptimized className="object-contain" />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
          {loading && <p className="text-sm text-slate-500 text-center">Carregando...</p>}

          {!loading && error && (
            <div className="text-center space-y-2">
              <p className="text-3xl">😕</p>
              <p className="text-sm text-slate-600">{error}</p>
            </div>
          )}

          {!loading && !error && data && etapa === "pergunta" && (
            <div className="space-y-5 text-center">
              <p className="text-sm text-slate-500">Olá, {data.nome}!</p>
              <p className="text-base font-semibold text-slate-950">
                Você irá comparecer à reunião &ldquo;{data.sessao.titulo}&rdquo;, em {dataLabel} às {horaLabel}
                {localTrecho}?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => responder(true)}
                  disabled={enviando}
                  className={`flex-1 rounded-full py-3 text-sm font-semibold transition disabled:opacity-60 ${
                    resposta === true ? "bg-emerald-600 text-white" : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  SIM
                </button>
                <button
                  onClick={() => responder(false)}
                  disabled={enviando}
                  className={`flex-1 rounded-full py-3 text-sm font-semibold transition border disabled:opacity-60 ${
                    resposta === false
                      ? "bg-red-50 border-red-300 text-red-700"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  NÃO
                </button>
              </div>
              {resposta !== null && (
                <p className="text-xs text-slate-400">
                  Sua última resposta foi &ldquo;{resposta ? "SIM" : "NÃO"}&rdquo;. Pode trocar até o convite expirar.
                </p>
              )}
            </div>
          )}

          {!loading && !error && data && etapa === "confirmacao" && (
            <div className="space-y-5 text-center">
              <p className="text-3xl">{resposta ? "✅" : "❌"}</p>
              <p className="text-base font-semibold text-slate-950">
                {resposta
                  ? `Presença confirmada! Te esperamos na sessão em ${dataLabel} às ${horaLabel}.`
                  : "Combinado, registramos que você não vai participar desta sessão."}
              </p>
              <button
                onClick={() => setEtapa("pergunta")}
                className="w-full rounded-full border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
