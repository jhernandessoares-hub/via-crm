"use client";
import * as React from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(13, 27, 62, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-xl border shadow-2xl my-8"
        style={{
          background: "var(--shell-card-bg)",
          borderColor: "var(--shell-card-border)",
        }}
        data-size={size}
      >
        <div className={`${sizes[size]} mx-auto`}>
          {(title || description) && (
            <div
              className="flex items-start justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--shell-card-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                {title && (
                  <h2
                    className="text-base font-semibold"
                    style={{ color: "var(--shell-text)" }}
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--shell-subtext)" }}
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 hover:opacity-70 transition-opacity"
                style={{ color: "var(--shell-subtext)" }}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="p-5" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
          {footer && (
            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: "var(--shell-card-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
