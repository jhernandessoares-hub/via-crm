"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { formatDateTime } from "../../_lib/constants";

export type RespostasEnvio = {
  questionario: { titulo: string };
  familia: { numero: number; nome: string };
  respondidoEm: string | null;
  situacao: string;
  alertas: string[];
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

function Linhas({ linhas }: { linhas: Linha[] }) {
  return (
    <dl className="divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
      {linhas.map((r) => (
        <div
          key={`${r.perguntaId}#${r.instancia}`}
          className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <dt className="text-sm" style={{ color: "var(--shell-subtext)" }}>
            {r.enunciado}
          </dt>
          <dd
            className="whitespace-pre-wrap text-[15px] font-semibold"
            style={{ color: r.valor ? "var(--shell-text)" : "var(--shell-subtext)" }}
          >
            {r.valor || "Sem resposta"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Painel em tela cheia com as respostas de uma família, organizado por bloco e
 * por pessoa. Fecha só pelo botão (regra global de modais do CRM).
 */
export default function RespostasFamilia({ dados, onClose }: { dados: RespostasEnvio; onClose: () => void }) {
  const blocos = organizar(dados.respostas);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--shell-bg, #f8fafc)" }}>
      {/* Cabeçalho fixo */}
      <div
        className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-8"
        style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
            {dados.questionario.titulo}
          </p>
          <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--shell-text)" }}>
            Família {dados.familia.numero} · {dados.familia.nome}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--shell-subtext)" }}>
            {dados.respondidoEm
              ? `Respondeu em ${formatDateTime(dados.respondidoEm)}`
              : "Ainda está respondendo. Abaixo, o que já foi salvo."}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
        >
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Índice dos blocos (computador) */}
        <nav
          className="hidden w-64 shrink-0 overflow-y-auto border-r px-3 py-4 lg:block"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
            Blocos
          </p>
          {blocos.map((b, i) => (
            <button
              key={idBloco(i)}
              onClick={() => document.getElementById(idBloco(i))?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--shell-hover)]"
              style={{ color: "var(--shell-text)" }}
            >
              {b.secao}
            </button>
          ))}
        </nav>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {dados.alertas.map((a) => (
              <p key={a} className="rounded-xl px-4 py-3 text-sm font-semibold text-red-700" style={{ background: "#fef2f2" }}>
                ⚠ {a}
              </p>
            ))}

            {blocos.map((b, i) => (
              <section
                key={idBloco(i)}
                id={idBloco(i)}
                className="scroll-mt-4 rounded-xl border"
                style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)" }}
              >
                <h3
                  className="border-b px-5 py-3 text-sm font-bold uppercase tracking-wide"
                  style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                >
                  {b.secao}
                </h3>
                <div className="space-y-4 px-5 py-2">
                  {b.grupos.map((g, gi) =>
                    g.rotulo ? (
                      <div
                        key={gi}
                        className="my-3 rounded-lg border px-4"
                        style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-hover)" }}
                      >
                        <p className="pt-3 text-sm font-bold" style={{ color: "var(--via-teal, #1D9E75)" }}>
                          {g.rotulo}
                        </p>
                        <Linhas linhas={g.linhas} />
                      </div>
                    ) : (
                      <Linhas key={gi} linhas={g.linhas} />
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
