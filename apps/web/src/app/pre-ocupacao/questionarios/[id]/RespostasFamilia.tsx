"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatDateTime } from "../../_lib/constants";

export type RespostasEnvio = {
  questionario: { titulo: string };
  familia: { numero: number; nome: string };
  respondidoEm: string | null;
  situacao: string;
  teste?: boolean;
  alertas: string[];
  /** 2+ = reenviado para corrigir */
  rodada?: number;
  /** Respostas substituídas por correção (só histórico, não contam no relatório) */
  anteriores?: { rodada: number; respondidoEm: string | null; arquivadoEm: string; arquivadoPor: string | null; respostas: RespostasEnvio["respostas"] }[];
  respostas: {
    perguntaId: string;
    instancia: number;
    ordem: number;
    secao: string | null;
    rotuloGrupo: string | null;
    enunciado: string;
    valor: string;
  }[];
};

type Linha = RespostasEnvio["respostas"][number];
type Grupo = { rotulo: string | null; linhas: Linha[] };
type Bloco = { secao: string; grupos: Grupo[] };
/** Resposta clicada no relatório: a tela rola até ela e destaca. */
type Foco = { perguntaId: string; instancia: number };

/** Organiza as respostas em blocos (seções) e, dentro deles, por pessoa. */
function organizar(respostas: Linha[]): Bloco[] {
  const blocos: Bloco[] = [];
  for (const r of respostas) {
    const secao = r.secao ?? "Respostas";
    let bloco = blocos[blocos.length - 1];
    if (!bloco || bloco.secao !== secao) {
      bloco = { secao, grupos: [] };
      blocos.push(bloco);
    }
    let grupo = bloco.grupos[bloco.grupos.length - 1];
    if (!grupo || grupo.rotulo !== r.rotuloGrupo) {
      grupo = { rotulo: r.rotuloGrupo, linhas: [] };
      bloco.grupos.push(grupo);
    }
    grupo.linhas.push(r);
  }
  return blocos;
}

const idBloco = (i: number) => `resp-bloco-${i}`;
const idResposta = (perguntaId: string, instancia: number) => `resp-${perguntaId}-${instancia}`;

function Linhas({ linhas, destaque, pulso }: { linhas: Linha[]; destaque: string | null; pulso: boolean }) {
  return (
    <dl className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
      {linhas.map((r) => {
        const id = idResposta(r.perguntaId, r.instancia);
        const ativa = destaque === id;
        return (
          <div
            key={id}
            id={id}
            className="grid scroll-mt-24 grid-cols-1 gap-1 py-3 transition-all duration-700 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
            style={{
              borderColor: "var(--shell-card-border)",
              // Resposta que veio do relatório: fundo verde da marca, barra à esquerda e um pulso no começo
              ...(ativa
                ? {
                    background: "var(--status-brand-bg)",
                    borderLeft: "4px solid var(--via-teal, #1D9E75)",
                    margin: "0 -12px",
                    padding: "12px 12px 12px 8px",
                    borderRadius: 8,
                    boxShadow: pulso ? "0 0 0 4px rgba(29,158,117,0.35)" : "0 0 0 0 rgba(29,158,117,0)",
                  }
                : {}),
            }}
          >
            <dt className="text-sm" style={{ color: ativa ? "var(--shell-text)" : "var(--shell-subtext)" }}>
              {r.enunciado}
            </dt>
            <dd
              className="whitespace-pre-wrap text-[15px] font-semibold"
              style={{ color: ativa ? "var(--status-brand-text)" : r.valor ? "var(--shell-text)" : "var(--shell-subtext)" }}
            >
              {r.valor || "Sem resposta"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Painel em tela cheia com as respostas de uma família, organizado por bloco e
 * por pessoa. Fecha só pelo botão (regra global de modais do CRM). Com `foco`
 * (aberto pelo relatório), rola até aquela resposta e destaca.
 */
export default function RespostasFamilia({
  dados,
  foco,
  onClose,
}: {
  dados: RespostasEnvio;
  foco?: Foco | null;
  onClose: () => void;
}) {
  // Aba "atual" (null) ou uma resposta anterior, substituída por correção (número da rodada)
  const [verRodada, setVerRodada] = useState<number | null>(null);
  const anterior = verRodada !== null ? dados.anteriores?.find((a) => a.rodada === verRodada) : undefined;
  const blocos = organizar(anterior ? anterior.respostas : dados.respostas);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const [blocoAtivo, setBlocoAtivo] = useState(0);
  const [visivel, setVisivel] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [pulso, setPulso] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    // Entrada suave do painel (timer, não requestAnimationFrame: aba em segundo plano
    // pausa o rAF e o painel ficaria transparente por cima da tela)
    const t = setTimeout(() => setVisivel(true), 20);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, []);

  // Veio do relatório: depois que o painel entra, rola suave até a resposta e destaca
  useEffect(() => {
    if (!foco || verRodada !== null) return;
    const id = idResposta(foco.perguntaId, foco.instancia);
    const t1 = setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      setDestaque(id);
      setPulso(true);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    const t2 = setTimeout(() => setPulso(false), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [foco, verRodada]);

  // Menu "Blocos" acompanha a rolagem: o bloco ativo é o que cruza o meio da área de leitura
  useEffect(() => {
    const raiz = conteudoRef.current;
    if (!raiz) return;
    const atualizar = () => {
      const meio = raiz.getBoundingClientRect().top + raiz.clientHeight / 2;
      let ativo = 0;
      raiz.querySelectorAll<HTMLElement>("[data-bloco]").forEach((el) => {
        if (el.getBoundingClientRect().top <= meio) ativo = Number(el.dataset.bloco);
      });
      setBlocoAtivo(ativo);
    };
    atualizar();
    raiz.addEventListener("scroll", atualizar, { passive: true });
    // Depois da rolagem automática até a resposta destacada, confere de novo (nem todo
    // navegador avisa a rolagem feita por código)
    const t = destaque ? setTimeout(atualizar, 1200) : undefined;
    return () => {
      raiz.removeEventListener("scroll", atualizar);
      if (t) clearTimeout(t);
    };
  }, [blocos.length, verRodada, destaque]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col transition-all duration-300 ease-out"
      style={{
        background: "var(--shell-bg, #f8fafc)",
        opacity: visivel ? 1 : 0,
        transform: visivel ? "translateY(0)" : "translateY(12px)",
      }}
    >
      {/* Cabeçalho fixo, nas cores do menu do sistema */}
      <div
        className="flex items-start justify-between gap-4 px-4 py-4 sm:px-8"
        style={{ background: "var(--sidebar-bg, #0D1B3E)", borderBottom: "3px solid var(--via-teal, #1D9E75)" }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--sidebar-text-muted, #8DA1C9)" }}>
            {dados.questionario.titulo}
          </p>
          <h2 className="mt-1 text-xl font-bold" style={{ color: "#fff" }}>
            {dados.teste ? dados.familia.nome : `Família ${dados.familia.numero} · ${dados.familia.nome}`}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--sidebar-text, rgba(255,255,255,0.92))" }}>
            {anterior
              ? `${anterior.rodada}ª resposta, enviada em ${formatDateTime(anterior.respondidoEm)} — substituída em ${formatDateTime(anterior.arquivadoEm)}${anterior.arquivadoPor ? ` por ${anterior.arquivadoPor}` : ""}. Só histórico: não conta no relatório.`
              : dados.respondidoEm
                ? `${(dados.rodada ?? 1) > 1 ? `${dados.rodada}ª resposta · ` : ""}Respondeu em ${formatDateTime(dados.respondidoEm)}`
                : `${(dados.rodada ?? 1) > 1 ? `Corrigindo (${dados.rodada}ª resposta). ` : ""}Ainda está respondendo. Abaixo, o que já foi salvo.`}
          </p>
          {!!dados.anteriores?.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[{ rodada: null as number | null, label: "Atual" }, ...dados.anteriores.map((a) => ({ rodada: a.rodada as number | null, label: `${a.rodada}ª resposta (substituída)` }))].map((t) => {
                const ativa = verRodada === t.rodada;
                return (
                  <button
                    key={String(t.rodada)}
                    onClick={() => setVerRodada(t.rodada)}
                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      borderColor: ativa ? "var(--via-teal, #1D9E75)" : "rgba(255,255,255,0.35)",
                      background: ativa ? "var(--via-teal, #1D9E75)" : "transparent",
                      color: "#fff",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white/10"
          style={{ borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}
        >
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Índice dos blocos (computador), nas cores do menu do sistema */}
        <nav
          className="hidden w-64 shrink-0 overflow-y-auto px-3 py-4 lg:block"
          style={{ background: "var(--sidebar-bg, #0D1B3E)", borderRight: "1px solid var(--sidebar-border, #1A2A55)" }}
        >
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--sidebar-text-muted, #8DA1C9)" }}>
            Blocos
          </p>
          {blocos.map((b, i) => {
            const ativo = blocoAtivo === i;
            return (
              <button
                key={idBloco(i)}
                onClick={() => document.getElementById(idBloco(i))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="mb-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--sidebar-hover)]"
                style={{
                  color: ativo ? "#fff" : "var(--sidebar-text, rgba(255,255,255,0.92))",
                  background: ativo ? "var(--via-teal, #1D9E75)" : undefined,
                  fontWeight: ativo ? 600 : 400,
                }}
              >
                {b.secao}
              </button>
            );
          })}
        </nav>

        {/* Conteúdo */}
        <div ref={conteudoRef} className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {anterior && (
              <p className="rounded-xl px-4 py-3 text-sm font-semibold text-amber-800" style={{ background: "#fffbeb" }}>
                Estas respostas foram substituídas quando a família foi chamada para corrigir. Ficam só para consulta.
              </p>
            )}
            {!anterior && dados.alertas.map((a) => (
              <p key={a} className="rounded-xl px-4 py-3 text-sm font-semibold text-red-700" style={{ background: "#fef2f2" }}>
                ⚠ {a}
              </p>
            ))}

            {blocos.map((b, i) => (
              <section
                key={idBloco(i)}
                id={idBloco(i)}
                data-bloco={i}
                className="scroll-mt-4 overflow-hidden rounded-xl border shadow-sm"
                style={{
                  background: "var(--shell-card-bg)",
                  borderColor: "var(--shell-card-border)",
                  borderLeft: "4px solid var(--via-teal, #1D9E75)",
                }}
              >
                <h3
                  className="border-b px-5 py-3 text-sm font-bold uppercase tracking-wide"
                  style={{ borderColor: "var(--shell-card-border)", color: "var(--status-brand-text)", background: "var(--status-brand-bg)" }}
                >
                  {b.secao}
                </h3>
                <div className="space-y-4 px-5 py-2">
                  {b.grupos.map((g, gi) =>
                    g.rotulo ? (
                      <div
                        key={gi}
                        className="my-3 rounded-lg border px-4"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
                      >
                        <p className="pt-3 text-sm font-bold" style={{ color: "var(--via-teal, #1D9E75)" }}>
                          {g.rotulo}
                        </p>
                        <Linhas linhas={g.linhas} destaque={destaque} pulso={pulso} />
                      </div>
                    ) : (
                      <Linhas key={gi} linhas={g.linhas} destaque={destaque} pulso={pulso} />
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
