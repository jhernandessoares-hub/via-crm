import * as React from "react";

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "indigo"
  | "violet"
  | "brand"
  | "navy"
  /** @deprecated use "neutral" */
  | "default"
  /** @deprecated use "brand" */
  | "teal";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-text)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]",
  error: "bg-[var(--status-error-bg)] text-[var(--status-error-text)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info-text)]",
  indigo: "bg-[var(--status-indigo-bg)] text-[var(--status-indigo-text)]",
  violet: "bg-[var(--status-violet-bg)] text-[var(--status-violet-text)]",
  brand: "bg-[var(--status-brand-bg)] text-[var(--status-brand-text)]",
  navy: "bg-[var(--via-navy)] text-white",
  default: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]",
  teal: "bg-[var(--status-brand-bg)] text-[var(--status-brand-text)]",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
