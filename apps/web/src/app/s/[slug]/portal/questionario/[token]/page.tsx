"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const LOGO_URL =
  "https://res.cloudinary.com/divurdnpz/image/upload/e_trim/v1783042264/via-crm/sites/sp9/yvzu4cu5xuswjbgayc35.jpg";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Pergunta = {
  id: string;
  enunciado: string;
  tipo: "ESCOLHA_UNICA" | "ESCOLHA_MULTIPLA" | "TEXTO_CURTO" | "TEXTO_LONGO" | "ESCALA" | "NUMERO" | "DATA";
  opcoes: string[] | null;
  escalaMin: number | null;
  escalaMax: number | null;
  obrigatoria: boolean;
};

type Dados =
  | { nome: string; titulo: string; jaRespondido: true; respondidoEm: string }
  | { nome: string; titulo: string; descricao: string | null; jaRespondido: false; perguntas: Pergunta[] };

type Valor = string | string[] | number | undefined;

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-900";

function vazio(v: Valor) {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export default function QuestionarioPublicoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token as string;

  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [faltando, setFaltando] = useState<Set<string>>(new Set());
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/pre-ocupacao-questionario/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "Este link não é mais válido — fale com a equipe.");
        }
        return res.json();
      })
      .then(setDados)
      .catch((e: any) => setErroFatal(e?.message ?? "Este link não é mais válido — fale com a equipe."))
      .finally(() => setLoading(false));
  }, [token]);

  function setValor(id: string, v: Valor) {
    setValores((vs) => ({ ...vs, [id]: v }));
    setFaltando((f) => {
      if (!f.has(id)) return f;
      const n = new Set(f);
      n.delete(id);
      return n;
    });
  }

  async function enviar() {
    if (!dados || dados.jaRespondido) return;
    const pendentes = dados.perguntas.filter((p) => p.obrigatoria && vazio(valores[p.id])).map((p) => p.id);
    if (pendentes.length) {
      setFaltando(new Set(pendentes));
      setErroEnvio("Responda as perguntas marcadas em vermelho.");
      document.getElementById(`p-${pendentes[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setEnviando(true);
    setErroEnvio(null);
    try {
      const res = await fetch(`${API}/pre-ocupacao-questionario/${token}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: valores }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Não foi possível enviar suas respostas.");
      }
      setConcluido(true);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setErroEnvio(e?.message ?? "Não foi possível enviar suas respostas.");
    } finally {
      setEnviando(false);
    }
  }

  function renderCampo(p: Pergunta) {
    const v = valores[p.id];
    switch (p.tipo) {
      case "ESCOLHA_UNICA":
        return (
          <div className="space-y-2">
            {(p.opcoes ?? []).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setValor(p.id, o)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-base transition ${
                  v === o ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        );
      case "ESCOLHA_MULTIPLA": {
        const marcadas = Array.isArray(v) ? v : [];
        return (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Pode marcar mais de uma opção.</p>
            {(p.opcoes ?? []).map((o) => {
              const ativo = marcadas.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setValor(p.id, ativo ? marcadas.filter((x) => x !== o) : [...marcadas, o])}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-base transition ${
                    ativo ? "border-slate-900 bg-slate-100 text-slate-900" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      ativo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-400"
                    }`}
                  >
                    {ativo ? "✓" : ""}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>
        );
      }
      case "ESCALA": {
        const min = p.escalaMin ?? 1;
        const max = p.escalaMax ?? 5;
        const notas = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        return (
          <div>
            <div className="flex flex-wrap gap-2">
              {notas.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setValor(p.id, n)}
                  className={`h-12 min-w-12 flex-1 rounded-xl border text-base font-semibold transition ${
                    v === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{min} = pior</span>
              <span>{max} = melhor</span>
            </div>
          </div>
        );
      }
      case "NUMERO":
        return (
          <input
            type="text"
            inputMode="decimal"
            value={(v as string) ?? ""}
            onChange={(e) => setValor(p.id, e.target.value.replace(/[^0-9.,-]/g, ""))}
            className={inputCls}
          />
        );
      case "DATA":
        return (
          <input type="date" value={(v as string) ?? ""} onChange={(e) => setValor(p.id, e.target.value)} className={inputCls} />
        );
      case "TEXTO_LONGO":
        return (
          <textarea
            rows={4}
            maxLength={5000}
            value={(v as string) ?? ""}
            onChange={(e) => setValor(p.id, e.target.value)}
            className={inputCls}
          />
        );
      default:
        return (
          <input
            type="text"
            maxLength={500}
            value={(v as string) ?? ""}
            onChange={(e) => setValor(p.id, e.target.value)}
            className={inputCls}
          />
        );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center justify-center">
          <div className="relative h-16 w-16 shrink-0">
            <Image src={LOGO_URL} alt="SIM José Bonifácio" fill unoptimized className="object-contain" />
          </div>
        </div>

        {loading && <p className="text-center text-sm text-slate-500">Carregando...</p>}

        {!loading && erroFatal && (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center shadow-sm space-y-2">
            <p className="text-3xl">😕</p>
            <p className="text-sm text-slate-600">{erroFatal}</p>
          </div>
        )}

        {!loading && dados && (dados.jaRespondido || concluido) && (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center shadow-sm space-y-3">
            <p className="text-4xl">✅</p>
            <p className="text-lg font-semibold text-slate-950">
              {concluido ? `Obrigado, ${dados.nome}!` : "Você já respondeu este questionário."}
            </p>
            <p className="text-sm text-slate-600">
              {concluido
                ? "Suas respostas foram enviadas para a equipe do Trabalho Técnico Social."
                : "Obrigado pela participação! Se precisar corrigir alguma resposta, fale com a equipe."}
            </p>
          </div>
        )}

        {!loading && dados && !dados.jaRespondido && !concluido && (
          <>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm space-y-2">
              <p className="text-sm text-slate-500">Olá, {dados.nome}!</p>
              <h1 className="text-xl font-semibold text-slate-950">{dados.titulo}</h1>
              {dados.descricao && <p className="whitespace-pre-wrap text-sm text-slate-600">{dados.descricao}</p>}
              <p className="text-xs text-slate-400">Perguntas com * são obrigatórias.</p>
            </div>

            {dados.perguntas.map((p, idx) => {
              const erro = faltando.has(p.id);
              return (
                <div
                  key={p.id}
                  id={`p-${p.id}`}
                  className={`rounded-[1.5rem] border bg-white p-5 shadow-sm space-y-3 ${
                    erro ? "border-red-400" : "border-slate-200"
                  }`}
                >
                  <p className="text-base font-semibold text-slate-950">
                    {idx + 1}. {p.enunciado}
                    {p.obrigatoria && <span className="text-red-600"> *</span>}
                  </p>
                  {renderCampo(p)}
                  {erro && <p className="text-xs text-red-600">Esta pergunta é obrigatória.</p>}
                </div>
              );
            })}

            {erroEnvio && <p className="text-center text-sm text-red-600">{erroEnvio}</p>}

            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full rounded-full bg-slate-950 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar respostas"}
            </button>
            <p className="pb-6 text-center text-xs text-slate-400">Depois de enviar, as respostas não podem ser alteradas.</p>
          </>
        )}
      </div>
    </div>
  );
}
