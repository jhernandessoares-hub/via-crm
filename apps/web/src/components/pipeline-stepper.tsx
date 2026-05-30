"use client";

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

function ArrowRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, color: "#94a3b8" }}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StageKey =
  | "NOVO_LEAD"
  | "EM_CONTATO"
  | "NAO_QUALIFICADO"
  | "LEAD_POTENCIAL_QUALIFICADO"
  | "ATENDIMENTO_ENCERRADO"
  | "BASE_FRIA_PRE"
  | "AGUARDANDO_AGENDAMENTO"
  | "AGENDADO_VISITA"
  | "REAGENDAMENTO"
  | "CONFIRMADOS"
  | "NAO_COMPARECEU"
  | "VISITA_CANCELADA"
  | "BASE_FRIA_AGENDAMENTO"
  | "CRIACAO_PROPOSTA"
  | "PROPOSTA_ANDAMENTO"
  | "PROPOSTA_ACEITA"
  | "ANALISE_CREDITO"
  | "FORMALIZACAO"
  | "CONTRATO_ASSINADO"
  | "DECLINIO"
  | "BASE_FRIA_NEGOCIACOES"
  | "ITBI"
  | "REGISTRO"
  | "ENTREGA_CONTRATO"
  | "POS_VENDA";

export type GroupKey =
  | "PRE_ATENDIMENTO"
  | "AGENDAMENTO"
  | "NEGOCIACOES"
  | "NEGOCIO_FECHADO"
  | "POS_VENDA";

export type PipelineStage = {
  id: string;
  key: string;
  name: string;
  group?: string | null;
  sortOrder?: number;
  requiresEvidence?: boolean;
  ownerOnly?: boolean;
  advancesToGroup?: string | null;
  returnsToGroup?: string | null;
};

// ─── Etapas negativas → âmbar ─────────────────────────────────────────────────

export const NEGATIVE_KEYS = new Set<string>([
  "NAO_QUALIFICADO",
  "ATENDIMENTO_ENCERRADO",
  "BASE_FRIA_PRE",
  "REAGENDAMENTO",
  "NAO_COMPARECEU",
  "VISITA_CANCELADA",
  "BASE_FRIA_AGENDAMENTO",
  "DECLINIO",
  "BASE_FRIA_NEGOCIACOES",
]);

// ─── Labels de grupo ──────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  PRE_ATENDIMENTO:     "Pré-atendimento",
  AGENDAMENTO:         "Agendamento",
  NEGOCIACOES:         "Negociações",
  CREDITO_IMOBILIARIO: "Crédito Imobiliário",
  NEGOCIO_FECHADO:     "Negócio Fechado",
  POS_VENDA:           "Pós Venda",
  DOCUMENTACAO:        "Documentação",
  ESCOLHA_UNIDADE:     "Escolha da Unidade",
  CONTRATO:            "Contrato",
  REGISTRO:            "Registro",
};

// ─── Chip ─────────────────────────────────────────────────────────────────────

type ChipVariant =
  | "past"           // etapa anterior — cinza, não clicável
  | "past-prev"      // etapa imediatamente anterior permitida — cinza + texto azul, clicável
  | "current"        // etapa atual — azul escuro
  | "next-positive"  // transição positiva — verde
  | "next-negative"  // transição negativa — âmbar
  | "future";        // etapa futura bloqueada — cinza claro

const chipBase =
  "rounded-md border px-3 py-1.5 text-xs leading-none transition-colors whitespace-nowrap";

const chipStyles: Record<ChipVariant, string> = {
  past:
    "bg-slate-100 border-slate-200 text-slate-400 cursor-default",
  "past-prev":
    "bg-slate-100 border-slate-200 text-blue-600 font-medium cursor-pointer hover:bg-blue-50 hover:border-blue-200",
  current:
    "bg-blue-600 border-blue-600 text-white font-semibold cursor-default shadow-sm",
  "next-positive":
    "bg-white border-green-300 text-green-700 font-medium cursor-pointer hover:bg-green-50",
  "next-negative":
    "bg-white border-amber-300 text-amber-700 font-medium cursor-pointer hover:bg-amber-50",
  future:
    "bg-white border-slate-200 text-slate-300 cursor-default",
};

function StageChip({
  name,
  variant,
  disabled,
  onClick,
}: {
  name: string;
  variant: ChipVariant;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const clickable =
    !disabled &&
    (variant === "past-prev" || variant === "next-positive" || variant === "next-negative");

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(chipBase, chipStyles[variant], "disabled:pointer-events-none")}
    >
      {name}
    </button>
  );
}

// ─── Badge de transição de grupo ─────────────────────────────────────────────

function GroupTransitionBadge({
  targetGroup,
  direction,
}: {
  targetGroup: string;
  direction: "advance" | "return";
}) {
  const label = GROUP_LABELS[targetGroup] ?? targetGroup;
  const isAdvance = direction === "advance";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        isAdvance
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-amber-300 bg-amber-50 text-amber-700"
      )}
    >
      {isAdvance ? (
        <>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
          {label}
        </>
      ) : (
        <>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          {label}
        </>
      )}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface PipelineStepperProps {
  stages: PipelineStage[];
  currentStageId?: string | null;
  currentGroup?: string | null;
  allowedStageIds?: string[];
  onSelectStage?: (stage: PipelineStage) => void;
  disabled?: boolean;
}

export function PipelineStepper({
  stages,
  currentStageId,
  currentGroup,
  allowedStageIds,
  onSelectStage,
  disabled,
}: PipelineStepperProps) {
  // Apenas stages do grupo atual, em ordem
  const list = (stages || [])
    .filter((s) => !currentGroup || s.group === currentGroup)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const currentStage = list.find((s) => s.id === currentStageId) ?? null;
  const currentOrder = currentStage?.sortOrder ?? -1;
  const allowedSet   = new Set(allowedStageIds ?? []);

  if (!list.length) return null;

  const groupLabel = currentGroup
    ? (GROUP_LABELS[currentGroup] ?? currentGroup)
    : "Todas as etapas";

  // Classifica cada stage do grupo para exibição linear
  function classifyStage(s: PipelineStage): {
    variant: ChipVariant;
    clickable: boolean;
  } {
    if (s.id === currentStageId) return { variant: "current", clickable: false };
    const order = s.sortOrder ?? 0;
    const inAllowed = allowedSet.has(s.id);
    if (order < currentOrder) {
      return inAllowed
        ? { variant: "past-prev", clickable: true }
        : { variant: "past",      clickable: false };
    }
    // order > currentOrder
    if (inAllowed) {
      return NEGATIVE_KEYS.has(s.key) || s.returnsToGroup
        ? { variant: "next-negative", clickable: true }
        : { variant: "next-positive", clickable: true };
    }
    return { variant: "future", clickable: false };
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Você está em:{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{groupLabel}</span>
      </p>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {list.map((s, i) => {
          const { variant, clickable } = classifyStage(s);
          const showGroupAdvance = clickable && !!s.advancesToGroup;
          const showGroupReturn  = clickable && !!s.returnsToGroup;

          return (
            <div key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRightIcon />}
              <div className="flex flex-col items-start gap-1">
                <StageChip
                  name={s.name}
                  variant={variant}
                  disabled={disabled || !clickable}
                  onClick={clickable ? () => onSelectStage?.(s) : undefined}
                />
                {showGroupAdvance && (
                  <GroupTransitionBadge targetGroup={s.advancesToGroup!} direction="advance" />
                )}
                {showGroupReturn && (
                  <GroupTransitionBadge targetGroup={s.returnsToGroup!} direction="return" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PipelineStepper;
