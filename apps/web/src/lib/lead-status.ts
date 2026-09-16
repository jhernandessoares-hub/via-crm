import type { BadgeVariant } from "@/components/ui/Badge";

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em Contato",
  QUALIFICADO: "Qualificado",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
};

export const LEAD_STATUS_VARIANT: Record<string, BadgeVariant> = {
  NOVO: "neutral",
  EM_CONTATO: "info",
  QUALIFICADO: "success",
  PROPOSTA: "warning",
  FECHADO: "success",
};

export const LEAD_STAGE_VARIANT: BadgeVariant = "neutral";

export function formatLeadStatus(s: string | null | undefined): { label: string; variant: BadgeVariant } | null {
  if (!s) return null;
  return { label: LEAD_STATUS_LABEL[s] ?? s, variant: LEAD_STATUS_VARIANT[s] ?? "neutral" };
}
