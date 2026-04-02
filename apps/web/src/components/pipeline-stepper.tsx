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
  const list = (stages || [])
    .filter((s) => !currentGroup || s.group === currentGroup)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const currentStage = list.find((s) => s.id === currentStageId) ?? null;
  const currentOrder = currentStage?.sortOrder ?? -1;

  const allowedSet = new Set(allowedStageIds ?? []);

  const allSorted = (stages || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const currentGlobalOrder = (stages || []).find((s) => s.id === currentStageId)?.sortOrder ?? -1;

  const pastStages = list.filter((s) => (s.sortOrder ?? 0) < currentOrder && !allowedSet.has(s.id));

  // Busca em TODAS as stages recebidas — transições podem ir para outros grupos
  const allowedStages = (stages || []).filter(
    (s) => s.id !== currentStageId && allowedSet.has(s.id)
  );

  // Stage "voltar": permitida pelo backend E com sortOrder menor que a atual (globalmente)
  const backStages    = allowedStages.filter((s) => (s.sortOrder ?? 0) < currentGlobalOrder);
  const forwardStages = allowedStages.filter((s) => (s.sortOrder ?? 0) >= currentGlobalOrder);

  const futureStages  = list.filter(
    (s) => (s.sortOrder ?? 0) > currentOrder && !allowedSet.has(s.id)
  );

  const allowedPositive = forwardStages.filter((s) => !NEGATIVE_KEYS.has(s.key));
  const allowedNegative = forwardStages.filter((s) => NEGATIVE_KEYS.has(s.key));

  if (!list.length) return null;

  const groupLabel = currentGroup
    ? (GROUP_LABELS[currentGroup] ?? currentGroup)
    : "Todas as etapas";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs text-slate-500">
        Você está em:{" "}
        <span className="font-semibold text-slate-700">{groupLabel}</span>
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">

        {/* Etapas passadas bloqueadas — cinza, sem clique */}
        {pastStages.map((s) => (
          <StageChip key={s.id} name={s.name} variant="past" />
        ))}

        {/* Etapa anterior permitida — cinza + texto azul, clicável (voltar) */}
        {backStages.map((s) => (
          <StageChip
            key={s.id}
            name={s.name}
            variant="past-prev"
            disabled={disabled}
            onClick={() => onSelectStage?.(s)}
          />
        ))}

        {/* Etapa atual */}
        {currentStage && (
          <StageChip name={currentStage.name} variant="current" />
        )}

        {/* Seta + transições permitidas */}
        {allowedStages.length > 0 && (
          <div className="flex items-center gap-2">
            <ArrowRightIcon />
            <div className="flex flex-col gap-1.5">
              {allowedPositive.map((s) => (
                <StageChip
                  key={s.id}
                  name={s.name}
                  variant="next-positive"
                  disabled={disabled}
                  onClick={() => onSelectStage?.(s)}
                />
              ))}
              {allowedNegative.map((s) => (
                <StageChip
                  key={s.id}
                  name={s.name}
                  variant="next-negative"
                  disabled={disabled}
                  onClick={() => onSelectStage?.(s)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Etapas futuras bloqueadas — cinza claro */}
        {futureStages.map((s) => (
          <StageChip key={s.id} name={s.name} variant="future" />
        ))}

      </div>
    </div>
  );
}

export default PipelineStepper;
