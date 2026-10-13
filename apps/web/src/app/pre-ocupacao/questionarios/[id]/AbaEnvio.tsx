"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { FAMILIA_STATUS_LABEL } from "../../_lib/constants";
import { Questionario, SITUACAO_LABEL, SITUACAO_VARIANT, Situacao } from "../../_lib/questionario";

type FamiliaPreview = {
  familiaId: string;
  numero: number;
  nome: string;
  empreendimento: string | null;
  unidade: string | null;
  statusFamilia: string;
  acompanhamento: "EM_DIA" | "COM_PENDENCIA";
  semTelefone: boolean;
  situacao: Situacao | null;
};

type Preview = {
  familias: FamiliaPreview[];
  empreendimentos: string[];
  total: number;
  jaReceberam: number;
  vaoReceber: number;
};

const ACOMPANHAMENTO_LABEL: Record<string, string> = { EM_DIA: "Em dia", COM_PENDENCIA: "Com pendência" };

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-3 rounded-full text-sm font-medium border"
      style={{
        borderColor: ativo ? "var(--via-teal, #1D9E75)" : "var(--shell-card-border)",
        color: ativo ? "var(--via-teal, #1D9E75)" : "var(--shell-text)",
        background: ativo ? "var(--brand-accent-muted)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function alternar(lista: string[], v: string) {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

export default function AbaEnvio({ questionario, onEnviado }: { questionario: Questionario; onEnviado: () => void }) {
  const [statusFamilia, setStatusFamilia] = useState<string[]>(["ATIVA"]);
  const [acompanhamento, setAcompanhamento] = useState<string[]>([]);
  const [empreendimento, setEmpreendimento] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [modo, setModo] = useState<"agora" | "agendar">("agora");
  const [quando, setQuando] = useState(""); // valor do <input type="datetime-local">, horário local

  const publicado = questionario.status === "PUBLICADO";

  useEffect(() => {
    if (!publicado) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicado, statusFamilia.join(","), acompanhamento.join(","), empreendimento]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const res: Preview = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/publico/preview`, {
        method: "POST",
        body: JSON.stringify({ statusFamilia, acompanhamento, empreendimento: empreendimento || null }),
      });
      setPreview(res);
      // Pré-seleciona quem ainda não recebeu e tem telefone
      setSelecionadas(new Set(res.familias.filter((f) => !f.situacao && !f.semTelefone).map((f) => f.familiaId)));
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar famílias");
    } finally {
      setLoading(false);
    }
  }

  const elegiveis = useMemo(
    () => (preview?.familias ?? []).filter((f) => !f.situacao && !f.semTelefone),
    [preview],
  );
  const todasMarcadas = elegiveis.length > 0 && elegiveis.every((f) => selecionadas.has(f.familiaId));

  const agendamentoInvalido = modo === "agendar" && (!quando || new Date(quando).getTime() < Date.now() + 60_000);
  const quandoLabel = quando
    ? new Date(quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";

  async function disparar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/enviar`, {
        method: "POST",
        body: JSON.stringify({
          familiaIds: Array.from(selecionadas),
          agendadoPara: modo === "agendar" ? new Date(quando).toISOString() : null,
        }),
      });
      setResultado(
        modo === "agendar"
          ? `${res.enfileirados} família(s) agendadas para ${quandoLabel}. Dá para cancelar na aba Acompanhamento até lá.`
          : `${res.enfileirados} família(s) entraram na fila de envio. As mensagens saem uma de cada vez, com intervalo — acompanhe na aba Acompanhamento.`,
      );
      setConfirmando(false);
      onEnviado();
      carregar();
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao disparar");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  if (!publicado) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
            {questionario.status === "RASCUNHO"
              ? "Publique o questionário (botão no topo) para poder enviar às famílias."
              : "Questionário encerrado — não é possível enviar."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>Status da família</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(FAMILIA_STATUS_LABEL).map(([v, l]) => (
                <Chip key={v} ativo={statusFamilia.includes(v)} onClick={() => setStatusFamilia((s) => alternar(s, v))}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>
              Acompanhamento (nenhum marcado = todos)
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACOMPANHAMENTO_LABEL).map(([v, l]) => (
                <Chip key={v} ativo={acompanhamento.includes(v)} onClick={() => setAcompanhamento((s) => alternar(s, v))}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block text-xs font-medium w-full max-w-sm" style={{ color: "var(--shell-subtext)" }}>
            Empreendimento
            <select
              value={empreendimento}
              onChange={(e) => setEmpreendimento(e.target.value)}
              className="block w-full mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
            >
              <option value="">Todos</option>
              {(preview?.empreendimentos ?? []).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>
        </CardBody>
      </Card>

      {resultado && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--via-teal, #1D9E75)", color: "var(--shell-text)" }}>
          {resultado}
        </div>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--shell-subtext)" }}>Quando enviar</p>
            <div className="flex flex-wrap gap-2">
              <Chip ativo={modo === "agora"} onClick={() => setModo("agora")}>Enviar agora</Chip>
              <Chip ativo={modo === "agendar"} onClick={() => setModo("agendar")}>Agendar</Chip>
            </div>
          </div>
          {modo === "agendar" && (
            <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
              Data e hora do envio
              <input
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="block mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
              />
            </label>
          )}
          {modo === "agendar" && quando && agendamentoInvalido && (
            <p className="text-xs text-red-600">Escolha um horário no futuro.</p>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          {loading || !preview ? (
            "Carregando famílias..."
          ) : (
            <>
              <strong>{preview.total}</strong> família(s) no filtro · <strong>{preview.jaReceberam}</strong> já receberam ·{" "}
              <strong>{selecionadas.size}</strong> selecionada(s) para receber agora
            </>
          )}
        </p>
        <button
          onClick={() => setConfirmando(true)}
          disabled={selecionadas.size === 0 || loading || agendamentoInvalido}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--via-teal, #1D9E75)" }}
        >
          {modo === "agendar" ? "Agendar para" : "Disparar para"} {selecionadas.size} família(s)
        </button>
      </div>

      {preview && preview.familias.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--shell-subtext)" }}>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={todasMarcadas}
                      onChange={() =>
                        setSelecionadas(todasMarcadas ? new Set() : new Set(elegiveis.map((f) => f.familiaId)))
                      }
                      title="Marcar todas"
                    />
                  </th>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Família</th>
                  <th className="px-4 py-3">Empreendimento / Unidade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Situação neste questionário</th>
                </tr>
              </thead>
              <tbody>
                {preview.familias.map((f) => {
                  const bloqueada = !!f.situacao || f.semTelefone;
                  return (
                    <tr key={f.familiaId} className="border-t" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          disabled={bloqueada}
                          checked={selecionadas.has(f.familiaId)}
                          onChange={() =>
                            setSelecionadas((s) => {
                              const n = new Set(s);
                              if (n.has(f.familiaId)) n.delete(f.familiaId);
                              else n.add(f.familiaId);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">{f.numero}</td>
                      <td className="px-4 py-2">{f.nome}</td>
                      <td className="px-4 py-2" style={{ color: "var(--shell-subtext)" }}>
                        {f.empreendimento ? `${f.empreendimento}${f.unidade ? ` · ${f.unidade}` : ""}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>
                        {FAMILIA_STATUS_LABEL[f.statusFamilia] ?? f.statusFamilia} · {ACOMPANHAMENTO_LABEL[f.acompanhamento]}
                      </td>
                      <td className="px-4 py-2">
                        {f.situacao ? (
                          <Badge variant={SITUACAO_VARIANT[f.situacao]}>{SITUACAO_LABEL[f.situacao]}</Badge>
                        ) : f.semTelefone ? (
                          <Badge variant="warning">Sem telefone</Badge>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--shell-subtext)" }}>Ainda não recebeu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title={modo === "agendar" ? "Confirmar agendamento" : "Confirmar disparo"}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmando(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              Cancelar
            </button>
            <button
              onClick={disparar}
              disabled={enviando}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--via-teal, #1D9E75)" }}
            >
              {enviando ? "Enviando..." : modo === "agendar" ? "Sim, agendar" : "Sim, disparar"}
            </button>
          </div>
        }
      >
        <p className="text-sm" style={{ color: "var(--shell-text)" }}>
          O questionário &ldquo;{questionario.titulo}&rdquo; será enviado pelo WhatsApp para{" "}
          <strong>{selecionadas.size}</strong> família(s)
          {modo === "agendar" ? (
            <>
              {" "}a partir de <strong>{quandoLabel}</strong>
            </>
          ) : null}
          . As mensagens saem uma de cada vez, com intervalo de alguns segundos entre elas.
        </p>
      </Modal>
    </div>
  );
}
