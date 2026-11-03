"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import { useIsOwner } from "../../_lib/useIsOwner";
import { formatDateTime } from "../../_lib/constants";
import { ASSEMBLEIA_STATUS_LABEL, ASSEMBLEIA_STATUS_VARIANT, Assembleia, ENCONTRO_LABEL, TEAL } from "../../_lib/assembleia";
import { Confirmar, PedidoConfirmacao } from "./Confirmar";
import AbaDados from "./AbaDados";
import AbaPauta from "./AbaPauta";
import AbaConvocacao from "./AbaConvocacao";
import AbaMesa from "./AbaMesa";
import AbaResultado from "./AbaResultado";

type AbaId = "dados" | "pauta" | "convocacao" | "mesa" | "resultado";

function abasDe(reuniao: boolean): { id: AbaId; label: string }[] {
  return [
    { id: "dados", label: reuniao ? "Dados e convite" : "Dados e edital" },
    { id: "pauta", label: reuniao ? "Assuntos" : "Pauta" },
    { id: "convocacao", label: "Convocação" },
    { id: "mesa", label: reuniao ? "Presença (ao vivo)" : "Mesa (ao vivo)" },
    { id: "resultado", label: reuniao ? "Presença e anexos" : "Resultado e anexos" },
  ];
}

export default function AssembleiaPage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const isOwner = useIsOwner();
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<Assembleia | null>(null);
  const [aba, setAba] = useState<AbaId>("dados");
  const [error, setError] = useState<string | null>(null);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setA(await apiFetch(`/pre-ocupacao/assembleias/${id}`));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    }
  }, [id]);

  useEffect(() => {
    if (guard === true) carregar();
  }, [guard, carregar]);

  /** Chamada à API com tratamento de erro padrão; devolve o resultado ou undefined. */
  const chamar = useCallback(
    async (path: string, init?: RequestInit) => {
      try {
        const r = await apiFetch(`/pre-ocupacao/assembleias/${id}${path}`, init);
        setError(null);
        return r;
      } catch (e: any) {
        setError(e?.message ?? "Erro");
        return undefined;
      }
    },
    [id],
  );

  async function confirmar() {
    if (!pedido) return;
    setOcupado(true);
    await pedido.acao();
    setOcupado(false);
    setPedido(null);
    await carregar();
  }

  if (guard === null) return null;
  const reuniao = a?.tipo === "REUNIAO";
  if (!a) {
    return (
      <AppShell title="Assembleias e Reuniões">
        <div className="px-4 sm:px-6 lg:px-8 py-8 text-sm" style={{ color: "var(--shell-subtext)" }}>
          {error ?? "Carregando..."}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`Pré-Ocupação — ${ENCONTRO_LABEL[a.tipo]}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => startTransition(() => router.push("/pre-ocupacao/assembleias"))}
          className="text-xs mb-3"
          style={{ color: "var(--shell-subtext)" }}
        >
          ← Assembleias e Reuniões
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--shell-subtext)" }}>
              {ENCONTRO_LABEL[a.tipo]}
            </p>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>{a.titulo}</h1>
              <Badge variant={ASSEMBLEIA_STATUS_VARIANT[a.status]}>{ASSEMBLEIA_STATUS_LABEL[a.status]}</Badge>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
              {a.empreendimento} ·{" "}
              {reuniao
                ? formatDateTime(a.dataPrimeiraConvocacao)
                : `1ª convocação ${formatDateTime(a.dataPrimeiraConvocacao)} · 2ª convocação ${formatDateTime(a.dataSegundaConvocacao)}`}{" "}
              · {a.unidades.length} unidades
            </p>
          </div>
          {isOwner && (
            <div className="flex gap-2">
              {a.status === "RASCUNHO" && (
                <button
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 text-red-600"
                  onClick={() =>
                    setPedido({
                      titulo: `Excluir ${reuniao ? "reunião" : "assembleia"}`,
                      texto: "Ainda não houve convocação. Excluir apaga a pauta e a lista de unidades.",
                      botao: "Excluir",
                      perigo: true,
                      acao: async () => {
                        const r = await chamar("", { method: "DELETE" });
                        if (r) startTransition(() => router.push("/pre-ocupacao/assembleias"));
                      },
                    })
                  }
                >
                  Excluir
                </button>
              )}
              {a.status === "CONVOCADA" && (
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: TEAL }}
                  onClick={() =>
                    setPedido({
                      titulo: `Iniciar a ${reuniao ? "reunião" : "assembleia"}`,
                      texto: reuniao
                        ? "Marca o horário de início. A confirmação de presença continua aberta durante a reunião."
                        : "Confira na aba Mesa se o quórum de instalação foi atingido.\n\nDepois de iniciar não dá para mudar horário, pauta nem lista de unidades. O credenciamento continua aberto durante a assembleia.",
                      botao: "Iniciar",
                      acao: async () => {
                        const r = await chamar("/iniciar", { method: "POST" });
                        if (r) setAba("mesa");
                      },
                    })
                  }
                >
                  Iniciar {reuniao ? "reunião" : "assembleia"}
                </button>
              )}
              {a.status === "EM_ANDAMENTO" && (
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "#dc2626" }}
                  onClick={() =>
                    setPedido({
                      titulo: `Encerrar a ${reuniao ? "reunião" : "assembleia"}`,
                      texto: reuniao
                        ? "Depois de encerrar, a lista de presença fica fechada."
                        : "Depois de encerrar ninguém mais vota e o resultado fica fechado para a ata. Itens que não foram votados ficam sem resultado.",
                      botao: "Encerrar",
                      perigo: true,
                      acao: () => chamar("/encerrar", { method: "POST" }),
                    })
                  }
                >
                  Encerrar {reuniao ? "reunião" : "assembleia"}
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-1 border-b mb-6" style={{ borderColor: "var(--shell-card-border)" }}>
          {abasDe(reuniao).map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className="px-4 py-2 text-sm font-medium -mb-px border-b-2"
              style={{
                borderColor: aba === t.id ? TEAL : "transparent",
                color: aba === t.id ? "var(--shell-text)" : "var(--shell-subtext)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {aba === "dados" && <AbaDados a={a} isOwner={isOwner} chamar={chamar} recarregar={carregar} />}
        {aba === "pauta" && <AbaPauta a={a} isOwner={isOwner} chamar={chamar} recarregar={carregar} />}
        {aba === "convocacao" && (
          <AbaConvocacao a={a} isOwner={isOwner} chamar={chamar} recarregar={carregar} pedirConfirmacao={setPedido} />
        )}
        {aba === "mesa" && <AbaMesa a={a} isOwner={isOwner} chamar={chamar} recarregar={carregar} pedirConfirmacao={setPedido} />}
        {aba === "resultado" && <AbaResultado a={a} chamar={chamar} />}
      </div>

      <Confirmar pedido={pedido} ocupado={ocupado} onCancelar={() => setPedido(null)} onConfirmar={confirmar} />
    </AppShell>
  );
}
