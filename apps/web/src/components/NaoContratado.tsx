"use client";

import { Lock } from "lucide-react";

/**
 * Placeholder de módulo não contratado. Exibido nas páginas de funcionalidades
 * que ainda não foram adquiridas pelo tenant (ex.: Pré-Ocupação / Pós-Ocupação).
 */
export default function NaoContratado({
  title = "Módulo não contratado",
  descricao = "Esta funcionalidade não está incluída no seu plano atual. Fale com a equipe comercial para contratar.",
}: {
  title?: string;
  descricao?: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="max-w-md w-full text-center rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(128,128,128,0.12)" }}>
          <Lock className="h-6 w-6 text-[var(--shell-subtext)]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--shell-text)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--shell-subtext)]">{descricao}</p>
      </div>
    </div>
  );
}
