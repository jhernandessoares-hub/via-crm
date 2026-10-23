"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { maskPhone } from "@/lib/format";
import RitmoEnvio from "./RitmoEnvio";
import FiltroColuna from "./FiltroColuna";
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
  telefone?: string | null;
  semTelefone: boolean;
  semCpf?: boolean;
  situacao: Situacao | null;
};

type Preview = {
  familias: FamiliaPreview[];
  empreendimentos: string[];
  total: number;
  jaReceberam: number;
  vaoReceber: number;
  semCpf?: number;
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

type Coluna = "numero" | "familia" | "telefone" | "empreendimento" | "status" | "situacao";

// Texto de cada coluna, igual ao que aparece na tabela (é o que o filtro do título lista)
const VALOR_COLUNA: Record<Coluna, (f: FamiliaPreview) => string> = {
  numero: (f) => String(f.numero),
  familia: (f) => f.nome,
  telefone: (f) => (f.telefone ? maskPhone(f.telefone) : "Sem telefone"),
  empreendimento: (f) => (f.empreendimento ? `${f.empreendimento}${f.unidade ? ` · ${f.unidade}` : ""}` : "—"),
  status: (f) => `${FAMILIA_STATUS_LABEL[f.statusFamilia] ?? f.statusFamilia} · ${ACOMPANHAMENTO_LABEL[f.acompanhamento]}`,
  situacao: (f) =>
    f.situacao
      ? SITUACAO_LABEL[f.situacao]
      : f.semTelefone
        ? "Sem telefone"
        : f.semCpf
          ? "Sem CPF no cadastro"
          : "Ainda não recebeu",
};

const COLUNAS: { key: Coluna; titulo: string }[] = [
  { key: "numero", titulo: "Nº" },
  { key: "familia", titulo: "Família" },
  { key: "telefone", titulo: "Telefone" },
  { key: "empreendimento", titulo: "Empreendimento / Unidade" },
  { key: "status", titulo: "Status" },
  { key: "situacao", titulo: "Situação neste questionário" },
];

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
  const [filtrosColuna, setFiltrosColuna] = useState<Partial<Record<Coluna, Set<string>>>>({});

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
      // Começa sem ninguém marcado: disparar para todos tem que ser escolha consciente
      setSelecionadas(new Set());
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar famílias");
    } finally {
      setLoading(false);
    }
  }

  // Valores distintos de cada coluna, para o filtro do título
  const valoresColuna = useMemo(() => {
    const r = {} as Record<Coluna, string[]>;
    for (const c of COLUNAS) {
      const vs = Array.from(new Set((preview?.familias ?? []).map(VALOR_COLUNA[c.key])));
      r[c.key] = c.key === "numero" ? vs.sort((a, b) => Number(a) - Number(b)) : vs.sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return r;
  }, [preview]);

  const visiveis = useMemo(
    () =>
      (preview?.familias ?? []).filter((f) =>
        COLUNAS.every((c) => {
          const sel = filtrosColuna[c.key];
          return !sel || sel.has(VALOR_COLUNA[c.key](f));
        }),
      ),
    [preview, filtrosColuna],
  );
  // Só conta/dispara quem está aparecendo: família escondida pelo filtro não vai junto sem o usuário ver
  const marcadas = useMemo(
    () => new Set(visiveis.filter((f) => selecionadas.has(f.familiaId)).map((f) => f.familiaId)),
    [visiveis, selecionadas],
  );
  const elegiveis = useMemo(() => visiveis.filter((f) => !f.situacao && !f.semTelefone && !f.semCpf), [visiveis]);
  const todasMarcadas = elegiveis.length > 0 && elegiveis.every((f) => marcadas.has(f.familiaId));
  const temFiltroColuna = Object.values(filtrosColuna).some(Boolean);

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
          familiaIds: Array.from(marcadas),
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
      <div className="space-y-4">
        <Card>
          <CardBody>
            <p className="text-sm" style={{ color: "var(--shell-subtext)" }}>
              {questionario.status === "RASCUNHO"
                ? "Publique o questionário (botão no topo) para poder enviar às famílias."
                : "Questionário encerrado — não é possível enviar."}
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RitmoEnvio questionario={questionario} />
      <Card>
        <CardBody className="flex flex-wrap items-start gap-x-10 gap-y-4">
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
          <label className="block text-xs font-medium w-72" style={{ color: "var(--shell-subtext)" }}>
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
              {!!preview.semCpf && (
                <>
                  <strong className="text-amber-600">{preview.semCpf}</strong> sem CPF no cadastro ·{" "}
                </>
              )}
              {temFiltroColuna && (
                <>
                  <strong>{visiveis.length}</strong> aparecendo com os filtros das colunas ·{" "}
                </>
              )}
              <strong>{marcadas.size}</strong> selecionada(s) para receber agora
            </>
          )}
          {!loading && preview && (
            <button onClick={carregar} className="ml-3 text-xs font-medium" style={{ color: "var(--via-teal, #1D9E75)" }}>
              ↻ Recarregar lista
            </button>
          )}
          {temFiltroColuna && (
            <button onClick={() => setFiltrosColuna({})} className="ml-3 text-xs font-medium" style={{ color: "var(--via-teal, #1D9E75)" }}>
              Limpar filtros das colunas
            </button>
          )}
        </p>
        <button
          onClick={() => setConfirmando(true)}
          disabled={marcadas.size === 0 || loading || agendamentoInvalido}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--via-teal, #1D9E75)" }}
        >
          {modo === "agendar" ? "Agendar para" : "Disparar para"} {marcadas.size} família(s)
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
                        setSelecionadas((s) => {
                          const n = new Set(s);
                          for (const f of elegiveis) {
                            if (todasMarcadas) n.delete(f.familiaId);
                            else n.add(f.familiaId);
                          }
                          return n;
                        })
                      }
                      title="Marcar todas"
                    />
                  </th>
                  {COLUNAS.map((c) => (
                    <th key={c.key} className="px-4 py-3">
                      <FiltroColuna
                        titulo={c.titulo}
                        valores={valoresColuna[c.key]}
                        selecionados={filtrosColuna[c.key] ?? null}
                        onChange={(sel) => setFiltrosColuna((fc) => ({ ...fc, [c.key]: sel ?? undefined }))}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center" style={{ color: "var(--shell-subtext)" }}>
                      Nenhuma família com esses filtros.
                    </td>
                  </tr>
                )}
                {visiveis.map((f) => {
                  const bloqueada = !!f.situacao || f.semTelefone || !!f.semCpf;
                  return (
                    <tr
                      key={f.familiaId}
                      onClick={() => window.open(`/pre-ocupacao/familias/${f.familiaId}`, "_blank")}
                      title="Abrir a família em outra aba"
                      className="border-t cursor-pointer hover:bg-[var(--shell-hover)]"
                      style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
                    >
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-4 py-2 whitespace-nowrap">{f.telefone ? maskPhone(f.telefone) : "—"}</td>
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
                        ) : f.semCpf ? (
                          <Badge variant="warning">Sem CPF no cadastro</Badge>
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
          <strong>{marcadas.size}</strong> família(s)
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
