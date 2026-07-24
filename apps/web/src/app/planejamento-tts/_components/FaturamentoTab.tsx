"use client";

import { Card, CardBody } from "@/components/ui/Card";
import type {
  EntregaveisStatus,
  NfStatus,
  PagamentoStatus,
  TtsParcela,
} from "@/lib/planejamento-tts.service";
import { formatBRL, formatYmdBr, totalContrato } from "../_lib/overview";
import {
  ENTREGAVEIS_STATUS_OPTIONS,
  InlineObs,
  InlineSelect,
  NF_STATUS_OPTIONS,
  PAGAMENTO_STATUS_OPTIONS,
} from "./helpers";

export default function FaturamentoTab({
  parcelas,
  onUpdate,
  saving,
}: {
  parcelas: TtsParcela[];
  onUpdate: (
    id: string,
    patch: {
      entregaveisStatus?: EntregaveisStatus;
      nfStatus?: NfStatus;
      pagamentoStatus?: PagamentoStatus;
      observacoes?: string;
    },
  ) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--shell-subtext)]">
        Fluxo do contrato: entregáveis → aceite da SP9 em 5 dias úteis → NF no último dia útil → pagamento em até 20
        dias. Sem entregável aprovado, não há NF nem pagamento (Cláusula 3ª §2º).
      </p>
      <Card>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--shell-subtext)] border-b border-[var(--shell-card-border)]">
                <th className="px-3 py-2 font-medium">Parc.</th>
                <th className="px-3 py-2 font-medium">Competência</th>
                <th className="px-3 py-2 font-medium">Entregáveis até</th>
                <th className="px-3 py-2 font-medium">Aceite até</th>
                <th className="px-3 py-2 font-medium">NF em</th>
                <th className="px-3 py-2 font-medium">Receber até</th>
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Entregáveis</th>
                <th className="px-3 py-2 font-medium">NF</th>
                <th className="px-3 py-2 font-medium">Pagamento</th>
                <th className="px-3 py-2 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => (
                <tr key={p.id} className="border-b border-[var(--shell-card-border)] last:border-0 align-top">
                  <td className="px-3 py-2 tabular-nums">{p.numero}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.competencia}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(p.entregaveisAte)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(p.aceiteAte)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(p.nfEm)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(p.receberAte)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatBRL(p.valor)}</td>
                  <td className="px-3 py-2">
                    <InlineSelect
                      value={p.entregaveisStatus}
                      options={ENTREGAVEIS_STATUS_OPTIONS}
                      disabled={saving}
                      onChange={(v) => onUpdate(p.id, { entregaveisStatus: v as EntregaveisStatus })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineSelect
                      value={p.nfStatus}
                      options={NF_STATUS_OPTIONS}
                      disabled={saving}
                      onChange={(v) => onUpdate(p.id, { nfStatus: v as NfStatus })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineSelect
                      value={p.pagamentoStatus}
                      options={PAGAMENTO_STATUS_OPTIONS}
                      disabled={saving}
                      onChange={(v) => onUpdate(p.id, { pagamentoStatus: v as PagamentoStatus })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineObs value={p.observacoes} disabled={saving} onSave={(v) => onUpdate(p.id, { observacoes: v })} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 font-semibold" colSpan={6}>
                  Total do contrato
                </td>
                <td className="px-3 py-2 font-semibold whitespace-nowrap tabular-nums">
                  {formatBRL(totalContrato(parcelas))}
                </td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
