"use client";
import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className = "", id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--shell-subtext)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] placeholder:text-[var(--via-muted)] transition-colors focus:border-[var(--via-teal)] focus:ring-2 focus:ring-[#1D9E75]/20 ${error ? "border-red-400" : "border-[var(--shell-input-border)]"} ${className}`}
          {...props}
        />
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : hint ? (
          <p className="text-xs text-[var(--shell-subtext)]">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
