"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, className = "", id, children, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-[var(--shell-subtext)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`w-full h-10 appearance-none rounded-lg border pl-3 pr-9 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] transition-colors focus:border-[var(--via-teal)] focus:ring-2 focus:ring-[#1D9E75]/20 ${error ? "border-red-400" : "border-[var(--shell-input-border)]"} ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shell-subtext)]" />
        </div>
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : hint ? (
          <p className="text-xs text-[var(--shell-subtext)]">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";
