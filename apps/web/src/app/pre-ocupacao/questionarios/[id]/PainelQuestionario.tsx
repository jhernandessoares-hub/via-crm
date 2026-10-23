"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody } from "@/components/ui/Card";
import { Situacao } from "../../_lib/questionario";

export type DadosAcompanhamento = {
  totais: { total: number; agendado: number; aguardandoEnvio: number; falha: number; recebeu: number; abriu: number; respondendo: number; respondeu: number; alertas: number };
  linhas: { situacao: Situacao; enviadoEm: string | null; respondidoEm: string | null }[];
};

const CORES_FUNIL = ["#64748b", "#2563eb", "#06b6d4", "#f59e0b", "#1D9E75"];

function fmtDuracao(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}

function Numero({ valor, label, cor }: { valor: string; label: string; cor?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-2xl font-bold" style={{ color: cor ?? "var(--shell-text)" }}>{valor}</p>
        <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>{label}</p>
      </CardBody>
    </Card>
  );
}

/** Resumo em números + funil das famílias (envio → recebeu → abriu → começou → respondeu). */
export default function PainelQuestionario({ dados }: { dados: DadosAcompanhamento }) {
  const t = dados.totais;
  // Cada etapa conta quem chegou nela ou passou dela
  const responderam = t.respondeu;
  const comecaram = responderam + t.respondendo;
  const abriram = comecaram + t.abriu;
  const receberam = abriram + t.recebeu;
  const enviadas = receberam + t.falha;

  const funil = [
    { etapa: "Enviadas", total: enviadas },
    { etapa: "Receberam", total: receberam },
    { etapa: "Abriram o link", total: abriram },
    { etapa: "Começaram", total: comecaram },
    { etapa: "Responderam", total: responderam },
  ];
  const pctDe = (n: number) => (enviadas ? Math.round((n / enviadas) * 100) : 0);

  const tempos = dados.linhas
    .filter((l) => l.enviadoEm && l.respondidoEm)
    .map((l) => new Date(l.respondidoEm!).getTime() - new Date(l.enviadoEm!).getTime())
    .filter((ms) => ms >= 0);
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  const fora = [
    t.falha && `Envio falhou para ${t.falha} família(s) (contam em Enviadas, mas não chegaram)`,
    t.agendado && `${t.agendado} agendada(s)`,
    t.aguardandoEnvio && `${t.aguardandoEnvio} na fila de envio`,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero valor={`${receberam ? Math.round((responderam / receberam) * 100) : 0}%`} label={`Responderam (${responderam} de ${receberam} que receberam)`} cor="var(--via-teal, #1D9E75)" />
        <Numero valor={String(receberam - responderam)} label="Faltam responder" />
        <Numero valor={String(t.respondendo)} label="Respondendo agora (começaram e não terminaram)" />
        <Numero valor={tempoMedio === null ? "—" : fmtDuracao(tempoMedio)} label="Tempo médio do envio até a resposta" />
      </div>

      <Card>
        <CardBody>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--shell-text)" }}>Funil das famílias</p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funil} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="etapa" width={120} tick={{ fontSize: 12, fill: "var(--shell-text)" }} />
                <Tooltip formatter={(v) => [`${v} família(s) · ${pctDe(Number(v))}%`, "Total"]} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {funil.map((f, i) => (
                    <Cell key={f.etapa} fill={CORES_FUNIL[i]} />
                  ))}
                  <LabelList
                    dataKey="total"
                    position="right"
                    style={{ fontSize: 12, fill: "var(--shell-subtext)" }}
                    formatter={(v) => `${v} · ${pctDe(Number(v))}%`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {fora.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--shell-subtext)" }}>
              {fora.join(" · ")}.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
