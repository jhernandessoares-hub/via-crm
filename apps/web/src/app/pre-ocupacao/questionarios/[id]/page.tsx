"use client";

import { useEffect, useState, startTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ScrollEdgeButtons } from "@/components/ui/ScrollEdgeButtons";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../../_lib/useSP9Guard";
import { useIsOwner } from "../../_lib/useIsOwner";
import { formatDateTime } from "../../_lib/constants";
import { QUESTIONARIO_STATUS_LABEL, QUESTIONARIO_STATUS_VARIANT, Questionario } from "../../_lib/questionario";
import AbaPerguntas from "./AbaPerguntas";
import AbaEnvio from "./AbaEnvio";
import AbaAcompanhamento from "./AbaAcompanhamento";
import AbaRelatorio from "./AbaRelatorio";
import RespostasFamilia, { RespostasEnvio } from "./RespostasFamilia";
import type { FocoResposta } from "./AbaRelatorio";
import AbaTeste from "./AbaTeste";

type Aba = "perguntas" | "teste" | "envio" | "acompanhamento" | "relatorio";

// Perguntas e Teste: só o Proprietário altera; os demais veem em modo leitura
const ABAS: { key: Aba; label: string; soOwner?: boolean }[] = [
  { key: "perguntas", label: "Perguntas", soOwner: true },
  { key: "teste", label: "Teste", soOwner: true },
  { key: "envio", label: "Envio" },
  { key: "acompanhamento", label: "Acompanhamento" },
  { key: "relatorio", label: "Relatório" },
];

type Acao = "publicar" | "encerrar" | "duplicar" | "excluir";

const ACAO_TEXTO: Record<Acao, { titulo: string; texto: string; botao: string }> = {
  publicar: {
    titulo: "Publicar questionário",
    texto: "Confira se você clicou em Salvar na aba Perguntas. Depois de publicado, as perguntas ficam travadas (para o relatório não misturar versões) e o questionário pode ser enviado às famílias.",
    botao: "Publicar",
  },
  encerrar: {
    titulo: "Encerrar questionário",
    texto: "Os links enviados deixam de aceitar respostas e não será possível enviar de novo. As respostas já recebidas continuam no relatório.",
    botao: "Encerrar",
  },
  duplicar: {
    titulo: "Duplicar questionário",
    texto: "Cria um novo questionário em rascunho com as mesmas perguntas, para você ajustar e enviar de novo.",
    botao: "Duplicar",
  },
  excluir: {
    titulo: "Excluir questionário",
    texto: "O rascunho e suas perguntas serão excluídos. Essa ação não pode ser desfeita.",
    botao: "Excluir",
  },
};

export default function QuestionarioDetalhePage() {
  const guard = useSP9Guard();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id as string;

  const [q, setQ] = useState<Questionario | null>(null);
  const [aba, setAba] = useState<Aba>("perguntas");
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [executando, setExecutando] = useState(false);
  const [respostas, setRespostas] = useState<RespostasEnvio | null>(null);
  // Resposta clicada no relatório: a tela da família rola até ela e destaca
  const [focoResposta, setFocoResposta] = useState<FocoResposta | null>(null);
  const isOwner = useIsOwner();

  useEffect(() => {
    if (guard !== true) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, id]);

  async function carregar() {
    try {
      const dados: Questionario = await apiFetch(`/pre-ocupacao/questionarios/${id}`);
      setQ(dados);
      if (dados.status !== "RASCUNHO") setAba((a) => (a === "perguntas" && dados.totalEnvios > 0 ? "acompanhamento" : a));
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar questionário");
    }
  }

  async function executar() {
    if (!acao) return;
    setExecutando(true);
    setErro(null);
    try {
      if (acao === "excluir") {
        await apiFetch(`/pre-ocupacao/questionarios/${id}`, { method: "DELETE" });
        startTransition(() => router.push("/pre-ocupacao/questionarios"));
        return;
      }
      const res = await apiFetch(`/pre-ocupacao/questionarios/${id}/${acao}`, { method: "POST" });
      if (acao === "duplicar") {
        setAcao(null);
        startTransition(() => router.push(`/pre-ocupacao/questionarios/${res.id}`));
        return;
      }
      setQ(res);
      if (acao === "publicar") setAba("envio");
      setAcao(null);
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao executar ação");
      setAcao(null);
    } finally {
      setExecutando(false);
    }
  }

  async function verRespostas(envioId: string, foco?: FocoResposta) {
    try {
      const dados = await apiFetch(`/pre-ocupacao/questionarios/${id}/envios/${envioId}`);
      setFocoResposta(foco ?? null);
      setRespostas(dados);
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar respostas");
    }
  }

  if (guard === null) return null;

  const btn = "px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]";

  return (
    <AppShell title="Pré-Ocupação — Questionário">
      <ScrollEdgeButtons />
      <div className="w-full px-4 lg:px-8 pt-8 pb-48">
        <button
          onClick={() => startTransition(() => router.push("/pre-ocupacao/questionarios"))}
          className="text-sm mb-4"
          style={{ color: "var(--shell-subtext)" }}
        >
          ← Questionários
        </button>

        {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

        {!q ? (
          !erro && <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>Carregando...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>{q.titulo}</h1>
                  <Badge variant={QUESTIONARIO_STATUS_VARIANT[q.status]}>{QUESTIONARIO_STATUS_LABEL[q.status]}</Badge>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--shell-subtext)" }}>
                  Criado por {q.criadoPor} em {formatDateTime(q.criadoEm)}
                  {q.publicadoEm && ` · publicado em ${formatDateTime(q.publicadoEm)}`}
                  {q.encerradoEm && ` · encerrado em ${formatDateTime(q.encerradoEm)}`}
                </p>
              </div>
              {isOwner && (
              <div className="flex flex-wrap gap-2">
                {q.status === "RASCUNHO" && q.totalEnvios === 0 && (
                  <button onClick={() => setAcao("excluir")} className={`${btn} text-red-600`}>Excluir</button>
                )}
                <button onClick={() => setAcao("duplicar")} className={btn} style={{ color: "var(--shell-text)" }}>
                  Duplicar
                </button>
                {q.status === "PUBLICADO" && (
                  <button onClick={() => setAcao("encerrar")} className={btn} style={{ color: "var(--shell-text)" }}>
                    Encerrar
                  </button>
                )}
                {q.status === "RASCUNHO" &&
                  (q.testeAprovadoEm ? (
                    <button
                      onClick={() => setAcao("publicar")}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: "var(--via-teal, #1D9E75)" }}
                    >
                      Publicar
                    </button>
                  ) : (
                    // Publicar só depois de um teste respondido + ok da equipe
                    <button
                      onClick={() => setAba("teste")}
                      title="Faça um teste e aprove antes de publicar"
                      className="px-4 py-2 rounded-lg text-sm font-semibold border border-dashed"
                      style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-subtext)" }}
                    >
                      🔒 Publicar (faça o teste antes)
                    </button>
                  ))}
              </div>
              )}
            </div>

            <div
              className="flex gap-1 p-1 mb-6 rounded-xl overflow-x-auto border"
              style={{ background: "var(--shell-hover)", borderColor: "var(--shell-card-border)" }}
            >
              {ABAS.map((a) => {
                const ativa = aba === a.key;
                const leitura = a.soOwner && !isOwner;
                return (
                  <button
                    key={a.key}
                    onClick={() => setAba(a.key)}
                    title={leitura ? "Somente visualização: só o Proprietário pode alterar" : undefined}
                    className={`px-5 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      ativa ? "font-bold shadow-sm" : "font-medium hover:bg-[var(--shell-card-bg)]"
                    } ${leitura && !ativa ? "opacity-50" : ""}`}
                    style={{
                      background: ativa ? (leitura ? "#94a3b8" : "var(--via-teal, #1D9E75)") : "transparent",
                      color: ativa ? "#fff" : "var(--shell-subtext)",
                    }}
                  >
                    {leitura ? "🔒 " : ""}
                    {a.label}
                  </button>
                );
              })}
            </div>

            {!isOwner && (aba === "perguntas" || aba === "teste") && (
              <div
                className="mb-4 rounded-lg border px-4 py-3 text-sm font-medium"
                style={{ borderColor: "#94a3b8", background: "var(--shell-hover)", color: "var(--shell-subtext)" }}
              >
                🔒 Somente visualização. Só o Proprietário pode alterar perguntas e testes.
              </div>
            )}

            {aba === "perguntas" && <AbaPerguntas questionario={q} onSalvo={setQ} somenteLeitura={!isOwner} />}
            {aba === "teste" && <AbaTeste questionario={q} onAtualizado={setQ} onVerRespostas={verRespostas} somenteLeitura={!isOwner} />}
            {aba === "envio" && <AbaEnvio questionario={q} onEnviado={carregar} />}
            {aba === "acompanhamento" && <AbaAcompanhamento questionario={q} onVerRespostas={verRespostas} />}
            {aba === "relatorio" && <AbaRelatorio questionario={q} onVerRespostas={verRespostas} />}
          </>
        )}
      </div>

      <Modal
        open={!!acao}
        onClose={() => setAcao(null)}
        title={acao ? ACAO_TEXTO[acao].titulo : ""}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setAcao(null)} className={btn} style={{ color: "var(--shell-text)" }}>
              Cancelar
            </button>
            <button
              onClick={executar}
              disabled={executando}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: acao === "excluir" ? "#dc2626" : "var(--via-teal, #1D9E75)" }}
            >
              {executando ? "Aguarde..." : acao ? ACAO_TEXTO[acao].botao : ""}
            </button>
          </div>
        }
      >
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>{acao ? ACAO_TEXTO[acao].texto : ""}</p>
      </Modal>

      {respostas && <RespostasFamilia dados={respostas} foco={focoResposta} onClose={() => setRespostas(null)} />}
    </AppShell>
  );
}
