"use client";

import React from "react";

export type PipelineStage = {
  id: string;
  key: string;
  name: string;
  sortOrder?: number;
};

type Props = {
  stages: PipelineStage[];
  currentStageId?: string | null;
  currentStageKey?: string | null;
  onSelectStage?: (stage: PipelineStage, index: number) => void;
  disabled?: boolean;
  minimizeChatAfterKeys?: string[];
  onShouldMinimizeChatChange?: (shouldMinimize: boolean) => void;
  className?: string;
};

function normalizeStages(stages: PipelineStage[]) {
  const arr = Array.isArray(stages) ? stages.slice() : [];
  arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return arr;
}

export default function PipelineStepper({
  stages,
  currentStageId,
  currentStageKey,
  onSelectStage,
  disabled,
  minimizeChatAfterKeys,
  onShouldMinimizeChatChange,
  className,
}: Props) {
  const list = React.useMemo(() => normalizeStages(stages || []), [stages]);

  const currentIndex = React.useMemo(() => {
    if (!list.length) return -1;

    if (currentStageId) {
      const i = list.findIndex((s) => s.id === currentStageId);
      if (i >= 0) return i;
    }

    if (currentStageKey) {
      const i = list.findIndex(
        (s) =>
          String(s.key || "").toUpperCase() ===
          String(currentStageKey || "").toUpperCase()
      );
      if (i >= 0) return i;
    }

    return -1;
  }, [list, currentStageId, currentStageKey]);

  const resolvedCurrentKey = React.useMemo(() => {
    if (currentStageKey) return String(currentStageKey).toUpperCase();
    if (currentIndex >= 0) return String(list[currentIndex]?.key || "").toUpperCase();
    return "";
  }, [currentStageKey, currentIndex, list]);

  const shouldMinimizeChat = React.useMemo(() => {
    const keys = (minimizeChatAfterKeys || []).map((k) => String(k).toUpperCase());
    if (!keys.length) return false;

    const curKey =
      currentIndex >= 0 ? String(list[currentIndex]?.key || "").toUpperCase() : "";

    return !!curKey && keys.includes(curKey);
  }, [minimizeChatAfterKeys, currentIndex, list]);

  React.useEffect(() => {
    if (onShouldMinimizeChatChange) onShouldMinimizeChatChange(shouldMinimizeChat);
  }, [shouldMinimizeChat, onShouldMinimizeChatChange]);

  function isStageSelectable(stageKey: string) {
    const targetKey = String(stageKey || "").toUpperCase();

    if (!targetKey) return false;
    if (!resolvedCurrentKey) return false;

    // não pode clicar na própria etapa
    if (targetKey === resolvedCurrentKey) return false;

    // backend decide as regras
    return true;
  }

  if (!list.length) {
    return (
      <div className={["rounded-xl border bg-white p-2", className || ""].join(" ")}>
        <div className="text-[11px] text-gray-500">Funil</div>
        <div className="mt-1 text-xs text-gray-700">Nenhuma etapa carregada.</div>
      </div>
    );
  }

  return (
    <div className={["rounded-xl border bg-white p-2", className || ""].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-gray-500">Funil</div>

        {currentIndex >= 0 ? (
          <div className="text-[11px] text-gray-500 truncate max-w-[60%]">
            Atual:{" "}
            <span className="font-semibold text-gray-700">
              {list[currentIndex]?.name}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">(sem etapa atual)</div>
        )}
      </div>

      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {list.map((st, idx) => {
            const isDone = currentIndex >= 0 ? idx < currentIndex : false;
            const isCurrent = currentIndex >= 0 ? idx === currentIndex : false;
            const isSelectable = isStageSelectable(st.key);
            const isBlocked = false;

            const base =
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition select-none";

            const color = isDone
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : isCurrent
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : isSelectable
              ? "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"
              : "bg-gray-50 border-gray-200 text-gray-400";

            const cursor =
              disabled || isCurrent || !isSelectable
                ? "opacity-60 cursor-not-allowed"
                : "cursor-pointer";

            return (
              <React.Fragment key={st.id || st.key || String(idx)}>
                <button
                  type="button"
                  className={[base, color, cursor].join(" ")}
                  disabled={!!disabled || isCurrent || !isSelectable}
                  onClick={() => {
                    if (disabled || isCurrent || !isSelectable) return;
                    if (onSelectStage) onSelectStage(st, idx);
                  }}
                  title={
                    isCurrent
                      ? "Etapa atual"
                      : "Clique para mover o lead para esta etapa"
                  }
                >
                  <span className="font-mono text-[10px] opacity-60">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate max-w-[140px]">{st.name}</span>
                </button>

                {idx < list.length - 1 ? (
                  <span className={isBlocked ? "text-gray-200 text-xs" : "text-gray-300 text-xs"}>
                    →
                  </span>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {minimizeChatAfterKeys && minimizeChatAfterKeys.length ? (
        <div className="mt-1 text-[10px] text-gray-400">
          Chat auto-minimizar: {shouldMinimizeChat ? "SIM" : "não"}
        </div>
      ) : null}
    </div>
  );
}