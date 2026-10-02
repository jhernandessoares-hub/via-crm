"use client";

/** Tempo decorrido curto: "agora", "5min", "3h", "2d". */
export function formatWaiting(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Selo verde "Nova" — o lead mandou mensagem que o usuário ainda não viu. */
export function NewMessageBadge({ since }: { since?: string | null }) {
  const waiting = formatWaiting(since);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: "#16A34A", color: "#FFFFFF" }}
      title={waiting ? `Mensagem nova do lead há ${waiting}` : "Mensagem nova do lead"}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      Nova{waiting ? ` · há ${waiting}` : ""}
    </span>
  );
}
