"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";
import PainelQuestionario, { DadosAcompanhamento } from "./PainelQuestionario";
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

const CORES = ["#2563eb", "#1D9E75", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#64748b", "#f97316"];

type ItemGrafico = { label: string; total: number; percentual: number; extra?: string };

/** Lista com barrinhas (a visão de sempre): texto completo, quantidade e %. */
function Barras({ itens, cores }: { itens: ItemGrafico[]; cores?: boolean }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="space-y-2">
      {itens.map((i, idx) => (
        <div key={i.label}>
          <div className="flex justify-between gap-3 text-xs mb-0.5" style={{ color: "var(--shell-text)" }}>
            <span className="flex items-start gap-2">
              {cores && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES[idx % CORES.length] }} />}
              {i.label}
            </span>
            <span className="shrink-0" style={{ color: "var(--shell-subtext)" }}>
              {i.total} · {fmtNum(i.percentual)}%{i.extra ? ` · ${i.extra}` : ""}
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--shell-hover)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(i.total / max) * 100}%`, background: cores ? CORES[idx % CORES.length] : "#2563eb" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pizza (só para escolha única, onde as fatias somam 100%). */
function GraficoPizza({ itens }: { itens: ItemGrafico[] }) {
  if (!itens.some((i) => i.total > 0)) return null;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={itens} dataKey="total" nameKey="label" innerRadius={45} outerRadius={90} paddingAngle={1} isAnimationActive={false}>
            {itens.map((i, idx) => (
              <Cell key={i.label} fill={CORES[idx % CORES.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v, _n, item) => [`${v} · ${fmtNum((item?.payload as ItemGrafico)?.percentual)}%`, (item?.payload as ItemGrafico)?.label]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras em pé para múltipla escolha, aceite e notas (cada opção conta por si). */
function GraficoColunas({ itens, numerar }: { itens: ItemGrafico[]; numerar: boolean }) {
  if (!itens.some((i) => i.total > 0)) return null;
  // Rótulo curto no eixo: o texto completo fica na lista ao lado e no tooltip
  const dados = itens.map((i, idx) => ({ ...i, curto: numerar ? String(idx + 1) : i.label }));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="curto" tick={{ fontSize: 11, fill: "var(--shell-text)" }} interval={0} />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            formatter={(v, _n, item) => [`${v} · ${fmtNum((item?.payload as ItemGrafico)?.percentual)}%`, "Respostas"]}
            labelFormatter={(_l, payload) => (payload?.[0]?.payload as ItemGrafico | undefined)?.label ?? ""}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {dados.map((d, idx) => (
              <Cell key={d.label} fill={CORES[idx % CORES.length]} />
            ))}
            <LabelList dataKey="percentual" position="top" style={{ fontSize: 11, fill: "var(--shell-subtext)" }} formatter={(v) => `${fmtNum(Number(v))}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** As duas visões juntas: lista (como sempre foi) e gráfico ao lado; em tela estreita, o gráfico vai para baixo. */
function ListaEGrafico({ itens, pizza }: { itens: ItemGrafico[]; pizza: boolean }) {
  const numerar = !pizza && (itens.length > 6 || itens.some((i) => i.label.length > 14));
  const lista = numerar ? itens.map((i, idx) => ({ ...i, label: `${idx + 1}. ${i.label}` })) : itens;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center">
      <Barras itens={lista} cores />
      {pizza ? <GraficoPizza itens={itens} /> : <GraficoColunas itens={itens} numerar={numerar} />}
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
    <div className={`grid grid-cols-2 ${itens.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"} gap-2 max-w-xl`}>
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
            {(() => {
              const itens = p.opcoes.map((o) => ({
                label: o.opcao,
                total: o.total,
                percentual: o.percentual,
                extra: o.valores && o.valores.media !== null ? `média ${fmtValor(o.valores.media, "R$")}` : undefined,
              }));
              return <ListaEGrafico itens={itens} pizza={p.tipo === "ESCOLHA_UNICA"} />;
            })()}
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
          <ListaEGrafico
            pizza={false}
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
              ["Menor", fmtValor(p.minimo, p.unidade)],
              ["Média", fmtValor(p.media, p.unidade)],
              ["Maior", fmtValor(p.maximo, p.unidade)],
            ]}
          />
        )}

        {p.campos && (
          <div className="space-y-3">
            {p.campos.map((c) =>
              c.tipo === "CONTADOR" ? (
                <div key={c.chave}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>{c.label}</p>
                  <Numeros itens={[["Menor", fmtNum(c.minimo)], ["Média por família", fmtNum(c.media)], ["Maior", fmtNum(c.maximo)]]} />
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
  const [acomp, setAcomp] = useState<DadosAcompanhamento | null>(null);

  useEffect(() => {
    apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/relatorio`)
      .then(setRel)
      .catch((e: any) => setErro(e?.message ?? "Erro ao carregar relatório"));
    // O painel de cima usa os números do acompanhamento; se falhar, o relatório segue sem ele
    apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/acompanhamento`)
      .then(setAcomp)
      .catch(() => setAcomp(null));
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
      {acomp && <PainelQuestionario dados={acomp} />}
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
                    <th key={p.id} className="px-4 py-3 min-w-[180px] max-w-[220px] truncate whitespace-nowrap" title={p.enunciado}>
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
                      // Uma linha só por família: texto longo é cortado; a resposta inteira abre no clique da linha
                      <td key={p.id} className="px-4 py-2 text-xs max-w-[220px] truncate whitespace-nowrap" title={f.respostas[p.id] || undefined}>
                        {f.respostas[p.id] || "—"}
                      </td>
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
