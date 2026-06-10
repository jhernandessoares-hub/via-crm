"use client";

import { ReactNode, useEffect, useState } from "react";
import { checkFieldVisible, getStoredPermissions, getStoredUserRole } from "@/lib/permissions";

/**
 * Exibe um valor ou, quando `visible` é false, uma barra borrada com tooltip
 * "Permissão não concedida". Usado para o perfil Externo Consultivo (PARTNER),
 * cujos dados ocultos já vêm removidos do backend — aqui é só o efeito visual.
 */
export default function MaskedValue({
  visible,
  children,
  width = "5rem",
  className = "",
}: {
  visible: boolean;
  children: ReactNode;
  /** largura aproximada da barra borrada */
  width?: string;
  className?: string;
}) {
  if (visible) return <>{children}</>;

  return (
    <span className={`relative inline-flex items-center group align-middle ${className}`}>
      <span
        aria-hidden
        title="Permissão não concedida"
        className="blur-[5px] select-none pointer-events-none rounded text-[var(--shell-subtext)] bg-[var(--shell-hover)]/60"
        style={{ minWidth: width }}
      >
        ●●● ●●●●
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 hidden group-hover:block whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
        Permissão não concedida
      </span>
    </span>
  );
}

/**
 * Versão que descobre sozinha a visibilidade pelo perfil/permissões em cache
 * (sem fetch por célula). Para uso espalhado em listas e no detalhe do lead.
 * `field` é uma chave de FIELD_VISIBILITY_FIELDS (ex.: "lead.telefone").
 */
export function MaskedField({
  field,
  children,
  width,
  className,
}: {
  field: string;
  children: ReactNode;
  width?: string;
  className?: string;
}) {
  // Lido em efeito (nunca no render) para não quebrar hidratação.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(checkFieldVisible(getStoredUserRole(), getStoredPermissions(), field));
  }, [field]);

  return (
    <MaskedValue visible={visible} width={width} className={className}>
      {children}
    </MaskedValue>
  );
}
