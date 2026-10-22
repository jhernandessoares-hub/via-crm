"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../_lib/constants";
import BotaoHistorico from "./HistoricoEnvio";
import { Questionario, SITUACAO_LABEL, SITUACAO_VARIANT, Situacao } from "../../_lib/questionario";

type Teste = {
  envioId: string;
  nome: string | null;
  telefone: string | null;
  situacao: Situacao;
  enviadoPor: string;
  criadoEm: string;
  enviadoEm: string | null;
  respondidoEm: string | null;
  respostasSalvas: number;
  ultimoEnvioErro: string | null;
};

const inputCls =
  "block w-full mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none";

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Testes do questionário: envia para qualquer pessoa (nome, telefone, CPF),
 * quantas vezes quiser. Um teste respondido até o fim + o "ok" da equipe
 * liberam o Publicar.
 */
export default function AbaTeste({
  questionario,
  onAtualizado,
  onVerRespostas,
}: {
  questionario: Questionario;
  onAtualizado: (q: Questionario) => void;
  onVerRespostas: (envioId: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; erro: string | null; link: string | null } | null>(null);
  const [testes, setTestes] = useState<Teste[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [conferi, setConferi] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const encerrado = questionario.status === "ENCERRADO";
  const rascunho = questionario.status === "RASCUNHO";

  useEffect(() => {
    carregar();
    // Atualiza a lista enquanto alguém está respondendo um teste
    const t = setInterval(carregar, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionario.id]);

  async function carregar() {
    try {
      setTestes(await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/testes`));
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar testes");
    }
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    setResultado(null);
    setCopiado(false);
    try {
      const r = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/testes`, {
        method: "POST",
        body: JSON.stringify({ nome, telefone, cpf }),
      });
      setResultado(r);
      await carregar();
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao enviar teste");
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(envioId: string) {
    try {
      await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/testes/${envioId}`, { method: "DELETE" });
      await carregar();
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao apagar teste");
    }
  }

  async function aprovar() {
    setAprovando(true);
    setErro(null);
    try {
      onAtualizado(await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/aprovar-teste`, { method: "POST" }));
      setConferi(false);
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao aprovar teste");
    } finally {
      setAprovando(false);
    }
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const respondidos = testes.filter((t) => t.situacao === "RESPONDEU").length;
  const podeEnviar = !!nome.trim() && telefone.replace(/\D/g, "").length >= 10 && cpf.replace(/\D/g, "").length === 11;
  const btn = "px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Situação da liberação */}
      {questionario.testeAprovadoEm ? (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--via-teal, #1D9E75)", color: "var(--shell-text)" }}>
          ✓ Teste aprovado por <strong>{questionario.testeAprovadoPor}</strong> em {formatDateTime(questionario.testeAprovadoEm)}.
          {rascunho && " O botão Publicar está liberado."}
        </div>
      ) : (
        rascunho && (
          <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#f59e0b", color: "var(--shell-text)" }}>
            Para publicar, envie um teste, responda até o fim pelo celular e depois dê o ok aqui embaixo. Se alguma pergunta for
            alterada depois do ok, é preciso testar de novo.
          </div>
        )
      )}

      {/* Novo teste */}
      {!encerrado && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>Enviar teste</p>
            <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
              Vai pelo WhatsApp Light conectado, com &ldquo;[TESTE]&rdquo; no início. Na tela do questionário, a pessoa precisa
              digitar o CPF informado aqui. As respostas de teste não contam no relatório e não abrem demanda.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
              </label>
              <label className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                Telefone (WhatsApp)
                <input
                  value={telefone}
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  className={inputCls}
                />
              </label>
              <label className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                CPF para o teste
                <input
                  value={cpf}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={enviar}
                disabled={!podeEnviar || enviando}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--via-teal, #1D9E75)" }}
              >
                {enviando ? "Enviando..." : "Enviar teste"}
              </button>
            </div>

            {resultado && (
              <div
                className="rounded-lg border px-4 py-3 text-sm space-y-2"
                style={{ borderColor: resultado.ok ? "var(--via-teal, #1D9E75)" : "#dc2626", color: "var(--shell-text)" }}
              >
                <p>{resultado.ok ? "✓ Teste enviado pelo WhatsApp." : `⚠ O WhatsApp não foi enviado: ${resultado.erro}`}</p>
                {resultado.link && (
                  <div className="flex flex-wrap gap-2">
                    <a href={resultado.link} target="_blank" rel="noreferrer" className={btn} style={{ color: "var(--shell-text)" }}>
                      Abrir link
                    </a>
                    <button onClick={() => copiar(resultado.link!)} className={btn} style={{ color: "var(--shell-text)" }}>
                      {copiado ? "Link copiado ✓" : "Copiar link"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {/* Lista de testes */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--shell-subtext)" }}>
                <th className="px-4 py-3">Quem recebeu</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Enviado</th>
                <th className="px-4 py-3">Respondeu</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {testes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center" style={{ color: "var(--shell-subtext)" }}>
                    Nenhum teste enviado ainda.
                  </td>
                </tr>
              )}
              {testes.map((t) => (
                <tr key={t.envioId} className="border-t" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
                  <td className="px-4 py-2">
                    <p>{t.nome}</p>
                    <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>
                      {mascaraTelefone((t.telefone ?? "").replace(/^55/, ""))}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={SITUACAO_VARIANT[t.situacao]}>{SITUACAO_LABEL[t.situacao]}</Badge>
                    <BotaoHistorico questionarioId={questionario.id} envioId={t.envioId} />
                    {t.situacao === "FALHA" && t.ultimoEnvioErro && (
                      <p className="text-[11px] mt-1 text-red-600 max-w-xs">{t.ultimoEnvioErro}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>
                    {formatDateTime(t.criadoEm)} · {t.enviadoPor}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>{formatDateTime(t.respondidoEm)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                    {t.respostasSalvas > 0 && (
                      <button onClick={() => onVerRespostas(t.envioId)} className="text-xs font-medium" style={{ color: "var(--via-teal, #1D9E75)" }}>
                        Ver respostas
                      </button>
                    )}
                    <button onClick={() => apagar(t.envioId)} className="text-xs font-medium text-red-600">
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Aprovação */}
      {rascunho && !questionario.testeAprovadoEm && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>Aprovar e liberar a publicação</p>
            {respondidos === 0 ? (
              <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
                Disponível depois que pelo menos um teste for respondido até o fim.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm" style={{ color: "var(--shell-text)" }}>
                  <input type="checkbox" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
                  Conferi o teste (mensagem, link, perguntas e respostas) e está tudo certo
                </label>
                <button
                  onClick={aprovar}
                  disabled={!conferi || aprovando}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--via-teal, #1D9E75)" }}
                >
                  {aprovando ? "Aprovando..." : "Aprovar e liberar publicação"}
                </button>
              </>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
