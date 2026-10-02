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
      {variant === "prev-group" && <span aria-hidden>↩</span>}
      {name}
    </button>
  );
}

// ─── Separador de grupo ───────────────────────────────────────────────────────

function GroupDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 self-stretch">
      <div className="h-full w-px bg-slate-200 dark:bg-neutral-600" style={{ minHeight: 28 }} />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface PipelineStepperProps {
  stages: PipelineStage[];
  currentStageId?: string | null;
  currentGroup?: string | null;
  allowedStageIds?: string[];
  /** Subconjunto de allowedStageIds que é VOLTA (sentido inverso de uma seta). */
  backStageIds?: string[];
  /** Existem setas de volta, mas o usuário não tem permissão de usá-las. */
  backBlocked?: boolean;
  /** Último status de onde o lead realmente veio (histórico). */
  lastStageId?: string | null;
  previousStageName?: string | null;
  onSelectStage?: (stage: PipelineStage) => void;
  disabled?: boolean;
}

export function PipelineStepper({
  stages,
  currentStageId,
  currentGroup,
  allowedStageIds,
  backStageIds,
  backBlocked,
  lastStageId,
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
  const backSet      = new Set(backStageIds ?? []);

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

  // O que aparece na linha (regra do Fluxo, nunca o histórico):
  //  • o ÚLTIMO status que ficou para trás (vizinho anterior na Etapa) — só leitura,
  //    ou botão de voltar quando o usuário tem permissão;
  //  • o status atual;
  //  • SÓ os destinos possíveis (setas liberadas), da Etapa atual e das demais.
  const backInGroup = list.filter((s) => s.id !== currentStageId && backSet.has(s.id) && allowedSet.has(s.id));
  const forwardInGroup = list.filter((s) => s.id !== currentStageId && !backSet.has(s.id) && allowedSet.has(s.id));
  // Chip de "passado" (cinza): só o último status de onde o lead veio, e só se ele
  // não aparece já como destino/volta liberada.
  const lastStage = lastStageId && !allowedSet.has(lastStageId)
    ? (stages || []).find((s) => s.id === lastStageId) ?? null
    : null;
  const behindChips = [
    ...(lastStage ? [{ stage: lastStage, back: false }] : []),
    ...backInGroup.map((stage) => ({ stage, back: true })),
  ];

  // Destinos liberados fora da Etapa atual, agrupados por Etapa de destino.
  const otherGroups = groupOrder
    .filter((g) => g !== currentGroup)
    .map((g) => ({
      group: g,
      stages: (stages || [])
        .filter((s) => s.group === g && s.id !== currentStageId && allowedSet.has(s.id))
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter((g) => g.stages.length > 0);

  // Voltas para outras Etapas ficam no INÍCIO da linha; avanços, no fim.
  const otherBackGroups = otherGroups
    .map((g) => ({ ...g, stages: g.stages.filter((s) => backSet.has(s.id)) }))
    .filter((g) => g.stages.length > 0);
  const otherForwardGroups = otherGroups
    .map((g) => ({ ...g, stages: g.stages.filter((s) => !backSet.has(s.id)) }))
    .filter((g) => g.stages.length > 0);

  function forwardVariant(s: PipelineStage): ChipVariant {
    return NEGATIVE_KEYS.has(s.key) || s.returnsToGroup ? "next-negative" : "next-positive";
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

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">

        {/* Voltas para outras Etapas (início da linha) — nome da Etapa pequeno embaixo */}
        {otherBackGroups.flatMap((g) =>
          g.stages.map((s) => (
            <div key={`back-${s.id}`} className="flex flex-col items-start gap-0.5">
              <StageChip name={s.name} variant="prev-group" disabled={disabled} onClick={() => onSelectStage?.(s)} />
              <span className="px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {GROUP_LABEL(g.group)}
              </span>
            </div>
          )),
        )}

        {/* Último status que ficou para trás / voltas permitidas nesta Etapa */}
        {behindChips.map(({ stage, back }) => (
          <div key={stage.id} className="flex flex-col items-start gap-0.5">
            <StageChip
              name={stage.name}
              variant={back ? "prev-group" : "past"}
              disabled={disabled}
              onClick={back ? () => onSelectStage?.(stage) : undefined}
            />
            {stage.group && stage.group !== currentGroup && (
              <span className="px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {GROUP_LABEL(stage.group)}
              </span>
            )}
          </div>
        ))}

        {(otherBackGroups.length > 0 || behindChips.length > 0) && <ArrowRightIcon />}

        {/* Status atual */}
        {currentStage && <StageChip name={currentStage.name} variant="current" disabled />}

        {/* Destinos possíveis: são alternativas (escolhe um), por isso sem setas entre eles */}
        {(forwardInGroup.length > 0 || otherForwardGroups.length > 0) && <ArrowRightIcon />}
        {forwardInGroup.map((s) => (
          <StageChip
            key={s.id}
            name={s.name}
            variant={forwardVariant(s)}
            disabled={disabled}
            onClick={() => onSelectStage?.(s)}
          />
        ))}

        {otherForwardGroups.flatMap((g) =>
          g.stages.map((s) => (
            <div key={s.id} className="flex flex-col items-start gap-0.5">
              <StageChip name={s.name} variant={forwardVariant(s)} disabled={disabled} onClick={() => onSelectStage?.(s)} />
              <span className="px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {GROUP_LABEL(g.group)}
              </span>
            </div>
          )),
        )}

      </div>

      {backBlocked && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Para voltar este status, peça à liderança.
        </p>
      )}
    </div>
  );
}

export default PipelineStepper;
