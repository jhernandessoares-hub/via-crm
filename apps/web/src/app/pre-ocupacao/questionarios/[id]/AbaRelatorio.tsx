"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";
import { PERGUNTA_TIPO_LABEL, PerguntaTipo, Questionario, baixarCsv, slugArquivo } from "../../_lib/questionario";

type Estat = { media: number | null; soma: number; minimo: number | null; maximo: number | null };
type ItemTexto = { familiaNumero: number; familiaNome: string; rotulo: string | null; valor: string };

type PerguntaRel = {
  id: string;
  ordem: number;
  enunciado: string;
  tipo: PerguntaTipo;
  secao: string | null;
  porPessoa: boolean;
  totalRespostas: number;
  familias: number;
  opcoes?: { opcao: string; total: number; percentual: number; valores?: Estat; textos?: ItemTexto[] }[];
  unidade?: string | null;
  media?: number | null;
  soma?: number;
  minimo?: number | null;
  maximo?: number | null;
  distribuicao?: { nota: number; total: number }[];
  campos?: ({ chave: string; label: string; tipo: "CONTADOR" } & Estat | { chave: string; label: string; tipo: "TEXTO"; respostas: ItemTexto[] })[];
  respostas?: ItemTexto[];
  pessoasTotal?: number;
  familiasComAlguem?: number;
};

type Relatorio = {
  totalEnvios: number;
  totalRespondidos: number;
  perguntas: PerguntaRel[];
  porFamilia: { envioId: string; numero: number; nome: string; respondidoEm: string; respostas: Record<string, string> }[];
};

const fmtNum = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtValor = (n: number | null | undefined, unidade?: string | null) =>
  n === null || n === undefined
    ? "—"
    : unidade === "R$"
      ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${fmtNum(n)}${unidade ? ` ${unidade}` : ""}`;

function Barras({ itens }: { itens: { label: string; total: number; percentual: number; extra?: string }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="space-y-2">
      {itens.map((i) => (
        <div key={i.label}>
          <div className="flex justify-between gap-3 text-xs mb-0.5" style={{ color: "var(--shell-text)" }}>
            <span>{i.label}</span>
            <span className="shrink-0" style={{ color: "var(--shell-subtext)" }}>
              {i.total} · {fmtNum(i.percentual)}%{i.extra ? ` · ${i.extra}` : ""}
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--shell-hover)" }}>
            <div className="h-full rounded-full" style={{ width: `${(i.total / max) * 100}%`, background: "#2563eb" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaTextos({ itens, vazio = "Nenhuma resposta ainda." }: { itens: ItemTexto[]; vazio?: string }) {
  if (itens.length === 0) return <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>{vazio}</p>;
  return (
    <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
      {itens.map((r, i) => (
        <div key={i} className="py-2 text-sm" style={{ borderColor: "var(--shell-card-border)" }}>
          <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
            {r.familiaNumero} · {r.familiaNome}
            {r.rotulo ? ` · ${r.rotulo}` : ""}
          </p>
          <p className="whitespace-pre-wrap" style={{ color: "var(--shell-text)" }}>{r.valor}</p>
        </div>
      ))}
    </div>
  );
}

function Numeros({ itens }: { itens: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-xl">
      {itens.map(([l, v]) => (
        <div key={l} className="rounded-lg border px-2 py-2 text-center" style={{ borderColor: "var(--shell-card-border)" }}>
          <p className="text-base font-bold" style={{ color: "var(--shell-text)" }}>{v}</p>
          <p className="text-[11px]" style={{ color: "var(--shell-subtext)" }}>{l}</p>
        </div>
      ))}
    </div>
  );
}

function BlocoPergunta({ p }: { p: PerguntaRel }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>{p.enunciado}</p>
          <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
            {PERGUNTA_TIPO_LABEL[p.tipo]} · {p.porPessoa ? `${p.totalRespostas} pessoa(s) em ${p.familias} família(s)` : `${p.totalRespostas} resposta(s)`}
          </p>
        </div>

        {p.opcoes && (
          <>
            <Barras
              itens={p.opcoes.map((o) => ({
                label: o.opcao,
                total: o.total,
                percentual: o.percentual,
                extra: o.valores && o.valores.media !== null ? `média ${fmtValor(o.valores.media, "R$")}` : undefined,
              }))}
            />
            {p.opcoes
              .filter((o) => o.textos && o.textos.length)
              .map((o) => (
                <div key={o.opcao}>
                  <p className="text-xs font-medium mt-2 mb-1" style={{ color: "var(--shell-subtext)" }}>
                    Detalhes de &ldquo;{o.opcao}&rdquo;
                  </p>
                  <ListaTextos itens={o.textos!} />
                </div>
              ))}
          </>
        )}

        {p.distribuicao && (
          <Barras
            itens={p.distribuicao.map((d) => ({
              label: `Nota ${d.nota}`,
              total: d.total,
              percentual: p.totalRespostas ? Math.round((d.total / p.totalRespostas) * 1000) / 10 : 0,
            }))}
          />
        )}

        {p.media !== undefined && (
          <Numeros
            itens={[
              ["Média", fmtValor(p.media, p.unidade)],
              ["Menor", fmtValor(p.minimo, p.unidade)],
              ["Maior", fmtValor(p.maximo, p.unidade)],
              ["Soma", fmtValor(p.soma, p.unidade)],
            ]}
          />
        )}

        {p.campos && (
          <div className="space-y-3">
            {p.campos.map((c) =>
              c.tipo === "CONTADOR" ? (
                <div key={c.chave}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>{c.label}</p>
                  <Numeros itens={[["Total", fmtNum(c.soma)], ["Média por família", fmtNum(c.media)], ["Maior", fmtNum(c.maximo)]]} />
                </div>
              ) : (
                <div key={c.chave}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>{c.label}</p>
                  <ListaTextos itens={c.respostas} />
                </div>
              ),
            )}
          </div>
        )}

        {p.pessoasTotal !== undefined && (
          <Numeros
            itens={[
              ["Famílias com pelo menos 1 pessoa", fmtNum(p.familiasComAlguem)],
              ["Pessoas no total", fmtNum(p.pessoasTotal)],
            ]}
          />
        )}
        {p.respostas && <ListaTextos itens={p.respostas} />}
      </CardBody>
    </Card>
  );
}

export default function AbaRelatorio({
  questionario,
  onVerRespostas,
}: {
  questionario: Questionario;
  onVerRespostas: (envioId: string) => void;
}) {
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<"pergunta" | "familia">("pergunta");

  useEffect(() => {
    apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/relatorio`)
      .then(setRel)
      .catch((e: any) => setErro(e?.message ?? "Erro ao carregar relatório"));
  }, [questionario.id]);

  function exportarRespostas() {
    if (!rel) return;
    baixarCsv(`respostas-${slugArquivo(questionario.titulo)}.csv`, [
      ["Nº", "Família", "Respondeu em", ...rel.perguntas.map((p) => (p.secao ? `${p.secao} · ${p.enunciado}` : p.enunciado))],
      ...rel.porFamilia.map((f) => [
        String(f.numero),
        f.nome,
        formatDateTime(f.respondidoEm),
        ...rel.perguntas.map((p) => f.respostas[p.id] ?? ""),
      ]),
    ]);
  }

  function exportarConsolidado() {
    if (!rel) return;
    const linhas: string[][] = [["Bloco", "Pergunta", "Tipo", "Resultado", "Quantidade", "%"]];
    for (const p of rel.perguntas) {
      const b = p.secao ?? "";
      const tipo = PERGUNTA_TIPO_LABEL[p.tipo];
      if (p.opcoes) {
        for (const o of p.opcoes) {
          linhas.push([b, p.enunciado, tipo, o.opcao, String(o.total), fmtNum(o.percentual)]);
          if (o.valores && o.valores.media !== null) linhas.push([b, p.enunciado, tipo, `${o.opcao} (valor médio)`, fmtValor(o.valores.media, "R$"), ""]);
        }
      } else if (p.campos) {
        for (const c of p.campos) if (c.tipo === "CONTADOR") linhas.push([b, p.enunciado, tipo, `${c.label} (total)`, fmtNum(c.soma), ""]);
      } else if (p.pessoasTotal !== undefined) {
        linhas.push([b, p.enunciado, tipo, "Famílias com pelo menos 1 pessoa", fmtNum(p.familiasComAlguem), ""]);
        linhas.push([b, p.enunciado, tipo, "Pessoas no total", fmtNum(p.pessoasTotal), ""]);
      } else if (p.media !== undefined) {
        linhas.push([b, p.enunciado, tipo, "Média", fmtValor(p.media, p.unidade), ""]);
        for (const d of p.distribuicao ?? []) linhas.push([b, p.enunciado, tipo, `Nota ${d.nota}`, String(d.total), ""]);
      } else {
        linhas.push([b, p.enunciado, tipo, "Respostas", String(p.totalRespostas), ""]);
      }
    }
    baixarCsv(`consolidado-${slugArquivo(questionario.titulo)}.csv`, linhas);
  }

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!rel) return <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>;

  const pct = rel.totalEnvios ? Math.round((rel.totalRespondidos / rel.totalEnvios) * 100) : 0;
  const btn = "px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50";

  // Agrupa por bloco (seção) para a leitura seguir a ordem do questionário
  const blocos: { secao: string; perguntas: PerguntaRel[] }[] = [];
  for (const p of rel.perguntas) {
    const s = p.secao ?? "";
    if (!blocos.length || blocos[blocos.length - 1].secao !== s) blocos.push({ secao: s, perguntas: [] });
    blocos[blocos.length - 1].perguntas.push(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          <strong>{rel.totalRespondidos}</strong> de <strong>{rel.totalEnvios}</strong> famílias concluíram ({pct}%)
        </p>
        <div className="flex flex-wrap gap-2">
          {(["pergunta", "familia"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={btn}
              style={{
                color: visao === v ? "var(--via-teal, #1D9E75)" : "var(--shell-text)",
                borderColor: visao === v ? "var(--via-teal, #1D9E75)" : undefined,
              }}
            >
              {v === "pergunta" ? "Por pergunta" : "Por família"}
            </button>
          ))}
          <button onClick={exportarConsolidado} disabled={!rel.totalRespondidos} className={btn} style={{ color: "var(--shell-text)" }}>
            CSV consolidado
          </button>
          <button onClick={exportarRespostas} disabled={!rel.totalRespondidos} className={btn} style={{ color: "var(--shell-text)" }}>
            CSV respostas por família
          </button>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
        O relatório conta só as famílias que terminaram e enviaram. Respostas de quem ainda está respondendo aparecem em
        Acompanhamento → Ver respostas.
      </p>

      {visao === "pergunta" &&
        blocos.map((b) => (
          <div key={b.secao} className="space-y-3">
            {b.secao && (
              <p className="pt-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
                {b.secao}
              </p>
            )}
            {b.perguntas.map((p) => (
              <BlocoPergunta key={p.id} p={p} />
            ))}
          </div>
        ))}

      {visao === "familia" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--shell-subtext)" }}>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Família</th>
                  {rel.perguntas.map((p) => (
                    <th key={p.id} className="px-4 py-3 min-w-[180px]" title={p.enunciado}>
                      {p.enunciado.length > 40 ? `${p.enunciado.slice(0, 40)}…` : p.enunciado}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rel.porFamilia.length === 0 && (
                  <tr>
                    <td colSpan={rel.perguntas.length + 2} className="px-4 py-6 text-center" style={{ color: "var(--shell-subtext)" }}>
                      Nenhuma família concluiu ainda.
                    </td>
                  </tr>
                )}
                {rel.porFamilia.map((f) => (
                  <tr
                    key={f.envioId}
                    onClick={() => onVerRespostas(f.envioId)}
                    className="border-t cursor-pointer hover:bg-[var(--shell-hover)]"
                    style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                  >
                    <td className="px-4 py-2">{f.numero}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{f.nome}</td>
                    {rel.perguntas.map((p) => (
                      <td key={p.id} className="px-4 py-2 text-xs">{f.respostas[p.id] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
