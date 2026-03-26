"use client";

import React from "react";

export type PipelineStage = {
  id: string;
  key: string;
  name: string;
  group?: string | null;
  sortOrder?: number;
};

type Props = {
  stages: PipelineStage[];
  currentStageId?: string | null;
  currentGroup?: string | null;
  allowedStageIds?: string[];
  onSelectStage?: (stage: PipelineStage) => void;
  disabled?: boolean;
};

const GROUP_LABELS: Record<string, string> = {
  PRE_ATENDIMENTO:    "Pré-atendimento",
  AGENDAMENTO:        "Agendamento",
  PROPOSTAS:          "Propostas",
  CREDITO_IMOBILIARIO:"Crédito Imobiliário",
  NEGOCIO_FECHADO:    "Negócio Fechado",
  POS_VENDA:          "Pós Venda",
};

export default function PipelineStepper({
  stages,
  currentStageId,
  currentGroup,
  allowedStageIds,
  onSelectStage,
  disabled,
}: Props) {
  const list = React.useMemo(() => {
    const arr = (stages || []).filter(
      (s) => !currentGroup || s.group === currentGroup
    );
    return arr.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [stages, currentGroup]);

  const currentIndex = React.useMemo(
    () => (currentStageId ? list.findIndex((s) => s.id === currentStageId) : -1),
    [list, currentStageId]
  );

  if (!list.length) return null;

  const groupLabel = currentGroup
    ? (GROUP_LABELS[currentGroup] ?? currentGroup)
    : "Todas as etapas";

  // Width % of the blue progress line (spans from center of first to center of last)
  const progressPct =
    list.length > 1 && currentIndex >= 0
      ? (currentIndex / (list.length - 1)) * 100
      : 0;

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="mb-4 text-xs text-gray-500">
        Você está vendo este lead em:{" "}
        <span className="font-semibold text-gray-700">{groupLabel}</span>
      </p>

      {/* Stepper row */}
      <div className="relative flex items-start">
        {/* Background line */}
        {list.length > 1 && (
          <div className="pointer-events-none absolute left-4 right-4 top-4 h-0.5 bg-gray-200" />
        )}
        {/* Blue progress line */}
        {list.length > 1 && currentIndex > 0 && (
          <div
            className="pointer-events-none absolute left-4 top-4 h-0.5 bg-blue-500 transition-all"
            style={{ width: `calc(${progressPct}% - 8px)` }}
          />
        )}

        {list.map((stage, idx) => {
          const isCurrent = idx === currentIndex;
          const isAllowed =
            !isCurrent &&
            (allowedStageIds ? allowedStageIds.includes(stage.id) : true);
          const isClickable = isAllowed && !disabled;

          const circleClass = [
            "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition select-none",
            isCurrent
              ? "bg-blue-600 text-white"
              : isAllowed
              ? "border-2 border-blue-300 bg-white text-blue-600 hover:bg-blue-50"
              : "border-2 border-gray-200 bg-gray-50 text-gray-400",
            isClickable ? "cursor-pointer" : "cursor-default",
          ].join(" ");

          return (
            <div
              key={stage.id}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onSelectStage?.(stage)}
                className={circleClass}
                title={
                  isCurrent
                    ? "Etapa atual"
                    : isAllowed
                    ? `Mover para: ${stage.name}`
                    : stage.name
                }
              >
                {idx + 1}
              </button>
              <span
                className={[
                  "max-w-[72px] text-center text-[10px] leading-tight",
                  isCurrent
                    ? "font-semibold text-gray-900"
                    : "text-gray-500",
                ].join(" ")}
              >
                {stage.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
