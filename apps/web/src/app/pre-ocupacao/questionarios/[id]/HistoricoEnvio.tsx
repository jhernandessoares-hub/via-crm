"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";

type Historico = {
  nome: string;
  situacao: string;
  respostasSalvas: number;
  ultimaAtividade: string | null;
  tokenExpiraEm: string | null;
  eventos: { tipo: string; titulo: string; em: string; detalhe: string | null; por: string | null }[];
};

const COR_EVENTO: Record<string, string> = {
  RESPONDEU: "#059669",
  FALHA: "#dc2626",
  LINK_CANCELADO: "#dc2626",
  AGENDAMENTO_CANCELADO: "#dc2626",
};

/**
 * Relógio ao lado da situação: abre a linha do tempo do envio (enviado,
 * abriu, CPF, começou, respondeu...) com data e hora de cada etapa.
 */
export default function BotaoHistorico({ questionarioId, envioId }: { questionarioId: string; envioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Historico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(true);
    setDados(null);
    setErro(null);
    try {
      setDados(await apiFetch(`/pre-ocupacao/questionarios/${questionarioId}/envios/${envioId}/historico`));
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar o histórico");
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        title="Ver histórico (data e hora de cada etapa)"
        className="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md align-middle hover:bg-[var(--shell-hover)]"
        style={{ color: "var(--shell-subtext)" }}
      >
        <Clock className="h-3.5 w-3.5" />
      </button>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={dados ? `Histórico · ${dados.nome}` : "Histórico"}
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setAberto(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              Fechar
            </button>
          </div>
        }
      >
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {!dados && !erro && <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
        {dados && (
          <div className="space-y-4">
            {dados.situacao === "RESPONDENDO" && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--shell-hover)", color: "var(--shell-text)" }}>
                Respondeu <strong>{dados.respostasSalvas}</strong> tela(s)
                {dados.ultimaAtividade && <> · última atividade em <strong>{formatDateTime(dados.ultimaAtividade)}</strong></>}
              </p>
            )}
            <ol className="relative space-y-3 border-l pl-5" style={{ borderColor: "var(--shell-card-border)" }}>
              {dados.eventos.map((e, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full"
                    style={{ background: COR_EVENTO[e.tipo] ?? "var(--via-teal, #1D9E75)" }}
                  />
                  <p className="text-xs tabular-nums" style={{ color: "var(--shell-subtext)" }}>{formatDateTime(e.em)}</p>
                  <p className="text-sm font-semibold" style={{ color: COR_EVENTO[e.tipo] ?? "var(--shell-text)" }}>
                    {e.titulo}
                  </p>
                  {(e.detalhe || e.por) && (
                    <p className="text-xs break-words" style={{ color: "var(--shell-subtext)" }}>
                      {[e.detalhe, e.por && `por ${e.por}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {dados.tokenExpiraEm && dados.situacao !== "RESPONDEU" && (
              <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                Link vale até {formatDateTime(dados.tokenExpiraEm)}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
