"use client";

import { Modal } from "@/components/ui/Modal";
import { TEAL, btnPrimario } from "../../_lib/assembleia";

export type PedidoConfirmacao = {
  titulo: string;
  texto: string;
  botao: string;
  perigo?: boolean;
  acao: () => Promise<unknown>;
};

/** Confirmação antes das ações que não têm volta (abrir/fechar votação, encerrar, convocar). */
export function Confirmar({
  pedido,
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  pedido: PedidoConfirmacao | null;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal
      open={!!pedido}
      onClose={onCancelar}
      title={pedido?.titulo}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={ocupado}
            className={btnPrimario}
            style={{ background: pedido?.perigo ? "#dc2626" : TEAL }}
          >
            {ocupado ? "Aguarde..." : pedido?.botao}
          </button>
        </div>
      }
    >
      <p className="text-sm whitespace-pre-line" style={{ color: "var(--shell-text)" }}>
        {pedido?.texto}
      </p>
    </Modal>
  );
}
