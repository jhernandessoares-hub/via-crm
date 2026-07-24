"use client";

import { Card, CardBody } from "@/components/ui/Card";
import type { IndicadorSituacao, TtsIndicador } from "@/lib/planejamento-tts.service";
import { INDICADOR_SITUACAO_OPTIONS, InlineObs, InlineSelect } from "./helpers";

export default function IndicadoresTab({
  indicadores,
  onUpdate,
  saving,
}: {
  indicadores: TtsIndicador[];
  onUpdate: (id: string, patch: { situacao?: IndicadorSituacao; evidencias?: string }) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--shell-subtext)]">
        Matriz da Tabela 2 do Anexo V do Edital COHAB-SP 001/2018 — é por ela que a COHAB e o agente verificador medem
        o desempenho do TTS. O Relatório Mensal de Atividades deve apurar estes indicadores todo mês.
      </p>
      <Card>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--shell-subtext)] border-b border-[var(--shell-card-border)]">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Atividade</th>
                <th className="px-3 py-2 font-medium">Meta</th>
                <th className="px-3 py-2 font-medium">Meta %</th>
                <th className="px-3 py-2 font-medium">Peso %</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Evidências</th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((i) => (
                <tr key={i.id} className="border-b border-[var(--shell-card-border)] last:border-0 align-top">
                  <td className="px-3 py-2 tabular-nums">{i.numero}</td>
                  <td className="px-3 py-2 min-w-[220px] text-[var(--shell-text)]">{i.atividade}</td>
                  <td className="px-3 py-2 min-w-[220px]">{i.meta}</td>
                  <td className="px-3 py-2 tabular-nums">{i.metaPercentual != null ? `${i.metaPercentual}%` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{i.pesoPercentual}%</td>
                  <td className="px-3 py-2">
                    <InlineSelect
                      value={i.situacao}
                      options={INDICADOR_SITUACAO_OPTIONS}
                      disabled={saving}
                      onChange={(v) => onUpdate(i.id, { situacao: v as IndicadorSituacao })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineObs value={i.evidencias} disabled={saving} onSave={(v) => onUpdate(i.id, { evidencias: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
