"use client";

import { Badge } from "@/components/ui/Badge";
import { diasAte, type Urgencia } from "../_lib/overview";

/** Etiqueta de urgência derivada do prazo — ícone + texto, nunca só cor. */
export function UrgenciaBadge({ urgencia, prazoIso }: { urgencia: Urgencia; prazoIso?: string | null }) {
  const dias = prazoIso ? diasAte(prazoIso) : null;
  switch (urgencia) {
    case "concluido":
      return <Badge variant="success">✓ Concluído</Badge>;
    case "atrasado":
      return <Badge variant="error">✖ Atrasado {dias !== null ? `${Math.abs(dias)}d` : ""}</Badge>;
    case "hoje":
      return <Badge variant="error">⚠ Vence HOJE</Badge>;
    case "proximo":
      return <Badge variant="warning">⚠ Faltam {dias}d</Badge>;
    case "atencao":
      return <Badge variant="warning">● Faltam {dias}d</Badge>;
    case "ok":
      return <Badge variant="default">○ Em {dias}d</Badge>;
    default:
      return <Badge variant="default">· Sem data</Badge>;
  }
}

/** Select compacto para uso inline em tabelas (sem label/hint do Select global). */
export function InlineSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border px-2 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] focus:border-[var(--via-teal)] focus:outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Input de observações inline — salva no blur. */
export function InlineObs({
  value,
  onSave,
  disabled,
}: {
  value: string | null;
  onSave: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      defaultValue={value ?? ""}
      disabled={disabled}
      onBlur={(e) => {
        if ((e.target.value ?? "") !== (value ?? "")) onSave(e.target.value);
      }}
      placeholder="—"
      className="w-full min-w-[180px] h-8 rounded-lg border px-2 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] focus:border-[var(--via-teal)] focus:outline-none disabled:opacity-50"
    />
  );
}

export const ATIVIDADE_STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDO", label: "Concluído" },
];

export const ENTREGAVEIS_STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "ENTREGUE", label: "Entregue" },
  { value: "ACEITO", label: "Aceito" },
];

export const NF_STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "EMITIDA", label: "Emitida" },
];

export const PAGAMENTO_STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "RECEBIDO", label: "Recebido" },
];

export const INDICADOR_SITUACAO_OPTIONS = [
  { value: "NAO_INICIADO", label: "Não iniciado" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "ATINGIDO", label: "Atingido" },
  { value: "PARCIALMENTE_ATINGIDO", label: "Parcialmente atingido" },
  { value: "NAO_ATINGIDO", label: "Não atingido" },
];
