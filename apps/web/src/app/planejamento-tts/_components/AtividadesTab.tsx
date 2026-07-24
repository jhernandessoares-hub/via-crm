"use client";

import { Card, CardBody } from "@/components/ui/Card";
import type { TtsAtividade, AtividadeStatus } from "@/lib/planejamento-tts.service";
import { formatYmdBr, urgenciaAtividade } from "../_lib/overview";
import { ATIVIDADE_STATUS_OPTIONS, InlineObs, InlineSelect, UrgenciaBadge } from "./helpers";

export default function AtividadesTab({
  atividades,
  onUpdate,
  saving,
}: {
  atividades: TtsAtividade[];
  onUpdate: (id: string, patch: { status?: AtividadeStatus; observacoes?: string }) => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardBody className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--shell-subtext)] border-b border-[var(--shell-card-border)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Atividade</th>
              <th className="px-3 py-2 font-medium">Eixo/Categoria</th>
              <th className="px-3 py-2 font-medium">QID</th>
              <th className="px-3 py-2 font-medium">Prazo</th>
              <th className="px-3 py-2 font-medium">Responsável</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Observações</th>
            </tr>
          </thead>
          <tbody>
            {atividades.map((a) => (
              <tr key={a.id} className="border-b border-[var(--shell-card-border)] last:border-0 align-top">
                <td className="px-3 py-2 tabular-nums">{a.ordem}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <UrgenciaBadge urgencia={urgenciaAtividade(a)} prazoIso={a.prazoLimite} />
                </td>
                <td className="px-3 py-2 min-w-[260px] text-[var(--shell-text)]">{a.titulo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.eixo}</td>
                <td className="px-3 py-2">{a.indicadorQid ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatYmdBr(a.prazoLimite)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{a.responsavel ?? "—"}</td>
                <td className="px-3 py-2">
                  <InlineSelect
                    value={a.status}
                    options={ATIVIDADE_STATUS_OPTIONS}
                    disabled={saving}
                    onChange={(v) => onUpdate(a.id, { status: v as AtividadeStatus })}
                  />
                </td>
                <td className="px-3 py-2">
                  <InlineObs value={a.observacoes} disabled={saving} onSave={(v) => onUpdate(a.id, { observacoes: v })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
