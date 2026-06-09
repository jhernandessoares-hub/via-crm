"use client";

import { checkPassword } from "@/lib/password";

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const checks = checkPassword(password);
  const passed = checks.filter((c) => c.ok).length;
  const label = passed <= 1 ? "Fraca" : passed <= 3 ? "Média" : passed <= 4 ? "Boa" : "Forte";
  const barColor =
    passed <= 1 ? "#EF4444" : passed <= 3 ? "#F59E0B" : "#1D9E75";

  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{
              background: i <= passed ? barColor : "rgba(0,0,0,0.08)",
            }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold" style={{ color: barColor }}>
        Força: {label}
      </p>
      <ul className="space-y-0.5">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-1.5 text-xs">
            <span style={{ color: check.ok ? "#1D9E75" : "#EF4444" }}>
              {check.ok ? "✓" : "✗"}
            </span>
            <span
              style={{
                color: check.ok ? "#1D9E75" : "var(--shell-subtext, #6B7280)",
              }}
            >
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
