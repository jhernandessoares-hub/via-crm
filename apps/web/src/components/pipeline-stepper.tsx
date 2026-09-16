"use client";
import { usePipelineGroups } from "@/lib/pipeline-groups";

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

function ArrowRightIcon({ color = "#94a3b8" }: { color?: string }) {
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
      style={{ flexShrink: 0, color }}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// Check exibido nos chips de etapas já concluídas (past / past-prev)
function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M5 12l5 5 9-10" />
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
  requiresReason?: boolean;
  requiresPendencias?: boolean;
  unitAction?: string | null;
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


// ─── Chip ─────────────────────────────────────────────────────────────────────

type ChipVariant =
  | "past"           // etapa anterior — cinza, não clicável
  | "past-prev"      // etapa imediatamente anterior permitida — cinza + texto da marca, clicável
  | "current"        // etapa atual — teal da marca
  | "next-positive"  // transição positiva — teal contornado
  | "next-negative"  // transição negativa — âmbar
  | "prev-group"     // stage da etapa anterior — âmbar suave, clicável
  | "future";        // etapa futura bloqueada — cinza claro

const chipBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs leading-none transition-colors whitespace-nowrap";

// Paleta amarrada à marca VIA: atual = via-teal sólido; positivas = teal contornado.
// Concluídas recebem check; negativas/retorno seguem em âmbar (semântica de alerta).
const chipStyles: Record<ChipVariant, string> = {
  past:
    "bg-slate-50 border-slate-200 text-slate-400 cursor-default dark:bg-neutral-800/60 dark:border-neutral-700 dark:text-neutral-500",
  "past-prev":
    "bg-white border-slate-200 text-via-teal font-medium cursor-pointer hover:bg-via-teal-soft hover:border-via-teal-light dark:bg-neutral-800 dark:border-neutral-700 dark:text-via-teal-light dark:hover:border-via-teal",
  current:
    "bg-via-teal border-via-teal text-white font-semibold cursor-default shadow-sm",
  "next-positive":
    "bg-white border-via-teal-light text-via-teal font-medium cursor-pointer hover:bg-via-teal-soft dark:bg-neutral-900 dark:border-via-teal/50 dark:text-via-teal-light dark:hover:bg-via-teal/10",
  "next-negative":
    "bg-white border-amber-300 text-amber-700 font-medium cursor-pointer hover:bg-amber-50 dark:bg-neutral-900 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10",
  "prev-group":
    "bg-amber-50 border-amber-200 text-amber-700 font-medium cursor-pointer hover:bg-amber-100 hover:border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400",
  future:
    "bg-white border-slate-200 text-slate-300 cursor-default dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-600",
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
    (variant === "past-prev" ||
      variant === "next-positive" ||
      variant === "next-negative" ||
      variant === "prev-group");

  const done = variant === "past" || variant === "past-prev";

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(chipBase, chipStyles[variant], "disabled:pointer-events-none")}
    >
      {done && <CheckIcon />}
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
  // mesma fonte do resto da tela: o nome que o tenant deu à Etapa
  const { groupName } = usePipelineGroups();
  const label = groupName(targetGroup);
  const isAdvance = direction === "advance";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        isAdvance
          ? "border-via-teal-light bg-via-teal-soft text-via-teal dark:border-via-teal/40 dark:bg-via-teal/10 dark:text-via-teal-light"
          : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
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

// ─── Separador de grupo ───────────────────────────────────────────────────────

function GroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 self-stretch">
      <div className="h-full w-px bg-slate-200 dark:bg-neutral-600" style={{ minHeight: 28 }} />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 writing-mode-vertical whitespace-nowrap">
        {label}
      </span>
      <div className="h-full w-px bg-slate-200 dark:bg-neutral-600" style={{ minHeight: 28 }} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface PipelineStepperProps {
  stages: PipelineStage[];
  currentStageId?: string | null;
  currentGroup?: string | null;
  allowedStageIds?: string[];
  /** Status por onde o lead já passou (do histórico). Vazio = não mostra volta. */
  returnableStages?: PipelineStage[];
  previousStageName?: string | null;
  onSelectStage?: (stage: PipelineStage) => void;
  disabled?: boolean;
}

export function PipelineStepper({
  stages,
  currentStageId,
  currentGroup,
  allowedStageIds,
  returnableStages,
  previousStageName,
  onSelectStage,
  disabled,
}: PipelineStepperProps) {
  // Stages do grupo atual em ordem
  // Nome e cor das Etapas saem do funil configurado pelo próprio tenant em
  // /settings/pipeline — antes eram um Record fixo aqui dentro, então Etapa
  // criada pelo cliente aparecia com a chave crua (ex.: "MINHA_ETAPA").
  const { groupName: GROUP_LABEL, colorOf: GROUP_COLOR } = usePipelineGroups();

  const list = (stages || [])
    .filter((s) => !currentGroup || s.group === currentGroup)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const currentStage = list.find((s) => s.id === currentStageId) ?? null;
  const currentOrder = currentStage?.sortOrder ?? -1;
  const allowedSet   = new Set(allowedStageIds ?? []);

  if (!list.length) return null;

  const groupLabel = currentGroup
    ? GROUP_LABEL(currentGroup)
    : "Todas as etapas";

  // Determina a etapa anterior pela ordem de sortOrder mínimo de cada grupo
  const groupOrder = [...new Set(
    (stages || []).filter((s) => s.group).map((s) => s.group!)
  )]
    .map((g) => ({
      group: g,
      minOrder: Math.min(...(stages || []).filter((s) => s.group === g).map((s) => s.sortOrder ?? 0)),
    }))
    .sort((a, b) => a.minOrder - b.minOrder)
    .map((g) => g.group);

  const currentGroupIndex = currentGroup ? groupOrder.indexOf(currentGroup) : -1;
  const prevGroupKey = currentGroupIndex > 0 ? groupOrder[currentGroupIndex - 1] : null;
  const prevGroupLabel = prevGroupKey ? GROUP_LABEL(prevGroupKey) : null;
  const nextGroupKey =
    currentGroupIndex >= 0 && currentGroupIndex < groupOrder.length - 1
      ? groupOrder[currentGroupIndex + 1]
      : null;
  const nextGroupLabel = nextGroupKey ? GROUP_LABEL(nextGroupKey) : null;

  const prevGroupStages = prevGroupKey
    ? (stages || [])
        .filter((s) => s.group === prevGroupKey)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];

  // Voltar SÓ para status por onde o lead realmente passou — quem decide é o
  // backend, lendo o histórico de movimentações.
  //
  // Antes aqui havia um encadeamento de fallbacks que, na falta de histórico,
  // chutava "o último status da etapa anterior". Isso oferecia um chip clicável
  // que o servidor recusava ("Transição inválida: NAO_QUALIFICADO ->
  // BASE_FRIA_PRE"). Sem histórico agora não aparece botão de voltar nenhum.
  const backStages = (returnableStages ?? [])
    .filter((s) => s.id !== currentStageId && !list.some((x) => x.id === s.id))
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Stages do PRÓXIMO grupo que já estão liberadas para este lead (salto direto de fase,
  // ex.: matriz hardcoded de leads.service.ts permitindo LEAD_POTENCIAL_QUALIFICADO →
  // AGUARDANDO_AGENDAMENTO). Sem isso, essas opções ficam autorizadas no backend mas
  // invisíveis na tela, pois o `list` abaixo só cobre o grupo atual.
  const nextGroupAllowedStages = nextGroupKey
    ? (stages || [])
        .filter((s) => s.group === nextGroupKey && allowedSet.has(s.id))
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];

  // Classifica cada stage do grupo atual
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
    if (inAllowed) {
      return NEGATIVE_KEYS.has(s.key) || s.returnsToGroup
        ? { variant: "next-negative", clickable: true }
        : { variant: "next-positive", clickable: true };
    }
    return { variant: "future", clickable: false };
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      {/* Header — breadcrumb: fase › etapa atual */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={currentGroup ? { color: GROUP_COLOR(currentGroup) } : undefined}
          >
            {groupLabel}
          </span>
          {currentStage && (
            <>
              <span className="mx-1.5 text-slate-300 dark:text-neutral-600">›</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{currentStage.name}</span>
            </>
          )}
        </p>
        {previousStageName && (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-400">
            Etapa anterior: {previousStageName}
          </span>
        )}
      </div>

      {/* Trilha macro — progresso entre as fases do funil */}
      {groupOrder.length > 1 && currentGroupIndex >= 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1">
            {groupOrder.map((g, i) => (
              <div
                key={g}
                title={GROUP_LABEL(g)}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{
                  background: GROUP_COLOR(g),
                  // fases já passadas ficam esmaecidas; a que falta, quase apagada
                  opacity: i < currentGroupIndex ? 0.45 : i === currentGroupIndex ? 1 : 0.15,
                }}
              />
            ))}
          </div>
          <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            fase {currentGroupIndex + 1} de {groupOrder.length}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-2">

        {/* Status por onde o lead já passou — volta permitida */}
        {backStages.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {backStages.map((st) => (
                <div key={st.id} className="flex flex-col items-start gap-1">
                  <StageChip
                    name={st.name}
                    variant="prev-group"
                    disabled={disabled}
                    onClick={() => onSelectStage?.(st)}
                  />
                  {st.advancesToGroup && (
                    <GroupTransitionBadge targetGroup={st.advancesToGroup} direction="advance" />
                  )}
                </div>
              ))}
            </div>

            {/* Separador com label da etapa atual */}
            <GroupDivider label={groupLabel} />
          </>
        )}

        {/* Stages do grupo atual */}
        {list.map((s, i) => {
          const { variant, clickable } = classifyStage(s);
          const showAdvanceBadge = clickable && !!s.advancesToGroup;
          const showReturnBadge  = clickable && !!s.returnsToGroup;

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
                {showAdvanceBadge && (
                  <GroupTransitionBadge targetGroup={s.advancesToGroup!} direction="advance" />
                )}
                {showReturnBadge && (
                  <GroupTransitionBadge targetGroup={s.returnsToGroup!} direction="return" />
                )}
              </div>
            </div>
          );
        })}

        {/* Stages do PRÓXIMO grupo já liberadas (salto direto de fase) */}
        {nextGroupAllowedStages.length > 0 && nextGroupLabel && (
          <>
            <GroupDivider label={nextGroupLabel} />
            {nextGroupAllowedStages.map((s, i) => {
              const variant: ChipVariant =
                NEGATIVE_KEYS.has(s.key) || s.returnsToGroup ? "next-negative" : "next-positive";

              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRightIcon />}
                  <div className="flex flex-col items-start gap-1">
                    <StageChip
                      name={s.name}
                      variant={variant}
                      disabled={disabled}
                      onClick={() => onSelectStage?.(s)}
                    />
                    <GroupTransitionBadge targetGroup={nextGroupKey!} direction="advance" />
                  </div>
                </div>
              );
            })}
          </>
        )}

      </div>
    </div>
  );
}

export default PipelineStepper;
