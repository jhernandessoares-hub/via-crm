"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import type { PlanejamentoTtsData } from "@/lib/planejamento-tts.service";
import {
  concluidas,
  formatBRL,
  formatYmdBr,
  prazosCriticos,
  proximoEntregavel,
  proximoRecebimento,
  proximosPrazos,
  totalContrato,
  totalRecebido,
} from "../_lib/overview";
import { UrgenciaBadge } from "./helpers";

function Tile({ label, value, sub, valueClass = "" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card>
      <CardBody className="p-4">
        <p className="text-xs text-[var(--shell-subtext)]">{label}</p>
        <p className={`mt-1 text-xl font-semibold text-[var(--shell-text)] ${valueClass}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-[var(--shell-subtext)]">{sub}</p>}
      </CardBody>
    </Card>
  );
}

export default function OverviewTab({ data }: { data: PlanejamentoTtsData }) {
  const criticos = prazosCriticos(data.atividades, data.parcelas);
  const done = concluidas(data.atividades);
  const proxEnt = proximoEntregavel(data.parcelas);
  const proxRec = proximoRecebimento(data.parcelas);
  const recebido = totalRecebido(data.parcelas);
  const total = totalContrato(data.parcelas);
  const prazos = proximosPrazos(data.atividades, data.parcelas, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile
          label="Prazos críticos (≤ 7 dias ou atrasados)"
          value={String(criticos)}
          sub={criticos ? "exigem ação imediata" : "nada urgente hoje"}
          valueClass={criticos ? "text-red-600" : "text-[#5C8A1F]"}
        />
        <Tile label="Atividades concluídas" value={`${done} / ${data.atividades.length}`} sub="plano de pré-ocupação" />
        <Tile
          label="Próximos entregáveis mensais"
          value={proxEnt ? formatYmdBr(proxEnt.entregaveisAte) : "—"}
          sub={proxEnt ? `parcela ${proxEnt.numero} · ${proxEnt.competencia}` : "tudo entregue"}
        />
        <Tile
          label="Próximo recebimento previsto"
          value={proxRec ? formatYmdBr(proxRec.receberAte) : "—"}
          sub={proxRec ? `${formatBRL(proxRec.valor)} · NF em ${formatYmdBr(proxRec.nfEm)}` : ""}
        />
        <Tile label="Já recebido no contrato" value={formatBRL(recebido)} sub={`de ${formatBRL(total)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos 10 prazos</CardTitle>
        </CardHeader>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--shell-subtext)] border-b border-[var(--shell-card-border)]">
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium">Prazo</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">QID</th>
                <th className="px-4 py-2 font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {prazos.map((p, i) => (
                <tr key={i} className="border-b border-[var(--shell-card-border)] last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <UrgenciaBadge urgencia={p.urgencia} prazoIso={p.data} />
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(p.data)}</td>
                  <td className="px-4 py-2 text-[var(--shell-text)]">{p.titulo}</td>
                  <td className="px-4 py-2">{p.qid ?? "—"}</td>
                  <td className="px-4 py-2">{p.responsavel ?? "—"}</td>
                </tr>
              ))}
              {prazos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--shell-subtext)]">
                    Nenhum prazo pendente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
