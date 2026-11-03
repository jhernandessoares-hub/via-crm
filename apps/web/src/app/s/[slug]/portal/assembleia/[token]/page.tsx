"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const POLL_MS = 4000;

type Dados = {
  tipo: "ASSEMBLEIA" | "REUNIAO";
  titulo: string;
  status: "RASCUNHO" | "CONVOCADA" | "EM_ANDAMENTO" | "ENCERRADA";
  unidade: string;
  dataPrimeiraConvocacao: string;
  dataSegundaConvocacao: string;
  linkVideo: string | null;
  credenciado: boolean;
  nome: string | null;
  pauta: { id: string; ordem: number; titulo: string; status: string; resumo: string | null }[];
  itemAberto: { id: string; ordem: number; titulo: string; descricao: string | null; tipo: string; opcoes: string[] } | null;
  meuVoto: { opcao: string; nome: string } | null;
};

const chaveLs = (token: string) => `assembleia_acesso_${token}`;
function lerAcesso(token: string): string | null {
  try {
    return localStorage.getItem(chaveLs(token));
  } catch {
    return null;
  }
}
function gravarAcesso(token: string, v: string | null) {
  try {
    if (v) localStorage.setItem(chaveLs(token), v);
    else localStorage.removeItem(chaveLs(token));
  } catch {
    // sem localStorage: precisa digitar o CPF de novo ao recarregar
  }
}

const dataLonga = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Página do morador na assembleia (link individual da unidade). Confirma presença
 * com o CPF e vota item a item; a tela se atualiza sozinha enquanto a mesa abre e
 * fecha as votações. O vídeo fica na sala externa (botão no topo).
 */
export default function AssembleiaPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [escolha, setEscolha] = useState<string | null>(null);
  const acessoRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/pre-ocupacao-assembleia/${token}`, {
        headers: acessoRef.current ? { "X-Assembleia-Acesso": acessoRef.current } : {},
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404 || res.status === 410) setErroFatal(err.message ?? "Este link não é mais válido. Fale com a equipe.");
        return;
      }
      const d: Dados = await res.json();
      // Chave guardada que o servidor não aceita mais (link reenviado)
      if (!d.credenciado && acessoRef.current) {
        gravarAcesso(token, null);
        acessoRef.current = null;
      }
      setDados(d);
    } catch {
      // sem internet por um instante: tenta de novo no próximo ciclo
    }
  }, [token]);

  useEffect(() => {
    acessoRef.current = lerAcesso(token);
    carregar();
    const t = setInterval(carregar, POLL_MS);
    return () => clearInterval(t);
  }, [token, carregar]);

  // Item mudou: limpa a escolha que estava em confirmação
  const itemId = dados?.itemAberto?.id ?? null;
  useEffect(() => setEscolha(null), [itemId]);

  async function credenciar() {
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`${API}/pre-ocupacao-assembleia/${token}/credenciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAviso(r.message ?? "Não foi possível confirmar o CPF.");
        return;
      }
      acessoRef.current = r.acesso;
      gravarAcesso(token, r.acesso);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function votar() {
    if (!dados?.itemAberto || !escolha) return;
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`${API}/pre-ocupacao-assembleia/${token}/votar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(acessoRef.current ? { "X-Assembleia-Acesso": acessoRef.current } : {}) },
        body: JSON.stringify({ itemId: dados.itemAberto.id, opcao: escolha }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) setAviso(r.message ?? "Não foi possível registrar o voto.");
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (erroFatal) {
    return (
      <Tela>
        <p className="text-xl text-slate-900">{erroFatal}</p>
      </Tela>
    );
  }
  if (!dados) {
    return (
      <Tela>
        <p className="text-lg text-slate-500">Carregando...</p>
      </Tela>
    );
  }

  return (
    <Tela>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Unidade {dados.unidade}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{dados.titulo}</h1>
          <p className="mt-1 text-base text-slate-600">{dataLonga(dados.dataPrimeiraConvocacao)}</p>
        </div>

        {dados.linkVideo && dados.status !== "ENCERRADA" && (
          <a
            href={dados.linkVideo}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-2xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white"
          >
            Entrar na sala de vídeo
          </a>
        )}

        {!dados.credenciado ? (
          dados.status === "ENCERRADA" ? (
            <p className="text-lg text-slate-700">Esta {dados.tipo === "REUNIAO" ? "reunião" : "assembleia"} já foi encerrada.</p>
          ) : (
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-5">
              <p className="text-lg font-semibold text-slate-900">Confirme sua presença</p>
              <p className="mt-1 text-base text-slate-600">
                {dados.tipo === "REUNIAO"
                  ? "Digite o CPF de quem está participando pela unidade (titular, cônjuge cadastrado ou procurador)."
                  : "Digite o CPF de quem vai votar pela unidade (titular, cônjuge cadastrado ou procurador)."}
              </p>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className="mt-4 w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-xl text-slate-900 outline-none focus:border-slate-900"
              />
              {aviso && <p className="mt-3 text-base text-red-700">{aviso}</p>}
              <button
                onClick={credenciar}
                disabled={enviando || cpf.replace(/\D/g, "").length !== 11}
                className="mt-4 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
              >
                {enviando ? "Conferindo..." : "Confirmar presença"}
              </button>
            </div>
          )
        ) : (
          <>
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
              <p className="text-lg font-semibold">Presença confirmada</p>
              <p className="text-base">
                {dados.nome}, você está {dados.tipo === "REUNIAO" ? "participando" : "votando"} pela unidade {dados.unidade}.
              </p>
            </div>

            {dados.status === "CONVOCADA" && (
              <p className="text-lg text-slate-700">
                {dados.tipo === "REUNIAO"
                  ? "A reunião ainda não começou. Entre na sala de vídeo no horário marcado."
                  : "A assembleia ainda não começou. Deixe esta página aberta: as votações aparecem aqui sozinhas."}
              </p>
            )}

            {dados.tipo !== "REUNIAO" && dados.status === "EM_ANDAMENTO" && !dados.itemAberto && (
              <p className="text-lg text-slate-700">Aguarde: a mesa vai abrir a próxima votação. Esta página se atualiza sozinha.</p>
            )}

            {dados.itemAberto && (
              <div className="rounded-2xl border-2 border-emerald-600 bg-white p-5">
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Votação aberta</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {dados.itemAberto.ordem}. {dados.itemAberto.titulo}
                </p>
                {dados.itemAberto.descricao && <p className="mt-1 text-base text-slate-600">{dados.itemAberto.descricao}</p>}

                {dados.meuVoto ? (
                  <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-lg text-emerald-900">
                    Voto registrado: <strong>{dados.meuVoto.opcao}</strong>
                  </p>
                ) : escolha ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-lg text-slate-900">
                      Confirmar voto em <strong>{escolha}</strong>? Depois de confirmar, não dá para mudar.
                    </p>
                    <button onClick={votar} disabled={enviando} className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-lg font-semibold text-white disabled:opacity-50">
                      {enviando ? "Registrando..." : "Confirmar voto"}
                    </button>
                    <button onClick={() => setEscolha(null)} className="w-full rounded-2xl border-2 border-slate-300 px-5 py-4 text-lg text-slate-900">
                      Voltar
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3">
                    {dados.itemAberto.opcoes.map((o) => (
                      <button
                        key={o}
                        onClick={() => setEscolha(o)}
                        className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-left text-lg font-semibold text-slate-900 active:bg-slate-100"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {aviso && <p className="mt-3 text-base text-red-700">{aviso}</p>}
              </div>
            )}
          </>
        )}

        <div>
          <p className="text-base font-semibold text-slate-900">{dados.tipo === "REUNIAO" ? "Assuntos" : "Ordem do dia"}</p>
          <ol className="mt-2 space-y-2">
            {dados.pauta.map((p) => (
              <li key={p.id} className="rounded-xl bg-slate-50 p-3 text-base text-slate-800">
                {p.ordem}. {p.titulo}
                {p.status === "ABERTO" && <span className="ml-2 text-sm font-semibold text-emerald-700">em votação</span>}
                {p.resumo && <span className="block text-sm text-slate-600">{p.resumo}</span>}
              </li>
            ))}
          </ol>
        </div>

        {dados.status === "ENCERRADA" && (
          <p className="text-lg text-slate-700">{dados.tipo === "REUNIAO" ? "Reunião" : "Assembleia"} encerrada. Obrigado pela participação!</p>
        )}
      </div>
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-lg">{children}</div>
    </main>
  );
}
