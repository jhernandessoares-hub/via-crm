"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";
import { PERGUNTA_TIPO_LABEL, PerguntaTipo, Questionario, baixarCsv, slugArquivo } from "../../_lib/questionario";

type PerguntaRel = {
  id: string;
  ordem: number;
  enunciado: string;
  tipo: PerguntaTipo;
  totalRespostas: number;
  emBranco: number;
  opcoes?: { opcao: string; total: number; percentual: number }[];
  media?: number | null;
  minimo?: number | null;
  maximo?: number | null;
  distribuicao?: { nota: number; total: number }[];
  respostas?: { familiaNumero: number; familiaNome: string; valor: string }[];
};

type Relatorio = {
  totalEnvios: number;
  totalRespondidos: number;
  perguntas: PerguntaRel[];
  porFamilia: { envioId: string; numero: number; nome: string; respondidoEm: string; respostas: Record<string, string> }[];
};

const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n).replace(".", ","));

function Barras({ itens }: { itens: { label: string; total: number; percentual: number }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="space-y-2">
      {itens.map((i) => (
        <div key={i.label}>
          <div className="flex justify-between text-xs mb-0.5" style={{ color: "var(--shell-text)" }}>
            <span>{i.label}</span>
            <span style={{ color: "var(--shell-subtext)" }}>
              {i.total} · {fmtNum(i.percentual)}%
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
      ["Nº", "Família", "Respondeu em", ...rel.perguntas.map((p) => `${p.ordem}. ${p.enunciado}`)],
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
    const linhas: string[][] = [["Pergunta", "Tipo", "Resultado", "Quantidade", "%"]];
    for (const p of rel.perguntas) {
      const titulo = `${p.ordem}. ${p.enunciado}`;
      const tipo = PERGUNTA_TIPO_LABEL[p.tipo];
      if (p.opcoes) {
        for (const o of p.opcoes) linhas.push([titulo, tipo, o.opcao, String(o.total), fmtNum(o.percentual)]);
      } else if (p.tipo === "ESCALA") {
        linhas.push([titulo, tipo, "Média", fmtNum(p.media), ""]);
        for (const d of p.distribuicao ?? []) linhas.push([titulo, tipo, `Nota ${d.nota}`, String(d.total), ""]);
      } else if (p.tipo === "NUMERO") {
        linhas.push([titulo, tipo, "Média", fmtNum(p.media), ""]);
        linhas.push([titulo, tipo, "Mínimo", fmtNum(p.minimo), ""]);
        linhas.push([titulo, tipo, "Máximo", fmtNum(p.maximo), ""]);
      } else {
        linhas.push([titulo, tipo, "Respostas", String(p.totalRespostas), ""]);
      }
      linhas.push([titulo, tipo, "Em branco", String(p.emBranco), ""]);
    }
    baixarCsv(`consolidado-${slugArquivo(questionario.titulo)}.csv`, linhas);
  }

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!rel) return <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>;

  const pct = rel.totalEnvios ? Math.round((rel.totalRespondidos / rel.totalEnvios) * 100) : 0;
  const btn = "px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          <strong>{rel.totalRespondidos}</strong> de <strong>{rel.totalEnvios}</strong> famílias responderam ({pct}%)
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

      {visao === "pergunta" &&
        rel.perguntas.map((p) => (
          <Card key={p.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>
                  {p.ordem}. {p.enunciado}
                </p>
                <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                  {PERGUNTA_TIPO_LABEL[p.tipo]} · {p.totalRespostas} resposta(s)
                  {p.emBranco > 0 && ` · ${p.emBranco} em branco`}
                </p>
              </div>

              {p.opcoes && <Barras itens={p.opcoes.map((o) => ({ label: o.opcao, total: o.total, percentual: o.percentual }))} />}

              {p.tipo === "ESCALA" && (
                <>
                  <p className="text-sm" style={{ color: "var(--shell-text)" }}>
                    Média: <strong>{fmtNum(p.media)}</strong>
                  </p>
                  <Barras
                    itens={(p.distribuicao ?? []).map((d) => ({
                      label: `Nota ${d.nota}`,
                      total: d.total,
                      percentual: p.totalRespostas ? Math.round((d.total / p.totalRespostas) * 1000) / 10 : 0,
                    }))}
                  />
                </>
              )}

              {p.tipo === "NUMERO" && (
                <div className="grid grid-cols-3 gap-2 max-w-md">
                  {[
                    ["Média", p.media],
                    ["Mínimo", p.minimo],
                    ["Máximo", p.maximo],
                  ].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg border px-2 py-2 text-center" style={{ borderColor: "var(--shell-card-border)" }}>
                      <p className="text-lg font-bold" style={{ color: "var(--shell-text)" }}>{fmtNum(v as number | null)}</p>
                      <p className="text-[11px]" style={{ color: "var(--shell-subtext)" }}>{l as string}</p>
                    </div>
                  ))}
                </div>
              )}

              {p.respostas && (
                <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
                  {p.respostas.length === 0 && (
                    <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Nenhuma resposta ainda.</p>
                  )}
                  {p.respostas.map((r, i) => (
                    <div key={i} className="py-2 text-sm" style={{ borderColor: "var(--shell-card-border)" }}>
                      <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                        {r.familiaNumero} · {r.familiaNome}
                      </p>
                      <p className="whitespace-pre-wrap" style={{ color: "var(--shell-text)" }}>{r.valor}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
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
                    <th key={p.id} className="px-4 py-3 min-w-[160px]" title={p.enunciado}>
                      {p.ordem}. {p.enunciado.length > 40 ? `${p.enunciado.slice(0, 40)}…` : p.enunciado}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rel.porFamilia.length === 0 && (
                  <tr>
                    <td colSpan={rel.perguntas.length + 2} className="px-4 py-6 text-center" style={{ color: "var(--shell-subtext)" }}>
                      Nenhuma família respondeu ainda.
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
