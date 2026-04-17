import * as React from "react";

type Variant = "default" | "success" | "warning" | "error" | "info" | "teal" | "navy";

const variants: Record<Variant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-[#E8F5D8] text-[#5C8A1F]",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  teal: "bg-[var(--via-teal-soft)] text-[var(--via-teal)]",
  navy: "bg-[var(--via-navy)] text-white",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({
  variant = "default",
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
