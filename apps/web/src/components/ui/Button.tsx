"use client";
import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--via-teal)] text-white hover:bg-[#178862] active:bg-[#147053] shadow-sm",
  secondary:
    "bg-[var(--via-navy)] text-white hover:bg-[#142450] shadow-sm",
  ghost:
    "text-[var(--shell-text)] hover:bg-[var(--shell-hover)]",
  danger:
    "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline:
    "border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-text)] hover:bg-[var(--shell-hover)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/40 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
