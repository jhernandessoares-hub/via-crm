"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { opcoesFaltandoNasCondicoes } from "@/lib/questionario-fluxo";
import { OpcaoRica, PERGUNTA_TIPO_LABEL, Pergunta, PerguntaTipo, Questionario, TIPOS_AVANCADOS, opcaoLabel } from "../../_lib/questionario";

const inputCls =
  "block w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none";

const TIPOS_COM_OPCOES: PerguntaTipo[] = ["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA", "ACEITE"];

/** Resumo do que a carga configurou e o editor simples não mostra. */
const ROTULO_GRUPO: Record<string, string> = { morador: "cada morador", pcd: "cada pessoa com deficiência", estudante: "cada estudante" };

function curto(t: string, n = 45) {
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Descreve a condição em português: "Só aparece se “Quantas pessoas…” for “5 ou mais”". */
function descreverCondicao(c: any, todas: Pergunta[]): string {
  if ("instanciaMaiorQue" in c) return "Não aparece para o titular (só do 2º morador em diante)";
  if (Array.isArray(c.qualquer)) {
    return c.qualquer.map((x: any) => descreverCondicao(x, todas).replace(/^Só aparece se /, "")).join(" OU ").replace(/^/, "Só aparece se ");
  }
  if (c.algumaPessoa) {
    const ref = todas.find((x) => x.chave === c.chave);
    const nome = ref ? `“${curto(ref.enunciado)}”` : c.chave;
    const faixa = c.algumaPessoa.menorQue !== undefined ? `menor que ${c.algumaPessoa.menorQue}` : `maior que ${c.algumaPessoa.maiorQue}`;
    return `Só aparece se algum morador tiver ${nome} ${faixa}`;
  }
  const ref = todas.find((x) => x.chave === c.chave);
  const nome = ref ? `“${curto(ref.enunciado)}”` : c.chave;
  if (Array.isArray(c.em)) return `Só aparece se ${nome} for ${c.em.map((v: string) => `“${curto(v, 35)}”`).join(" ou ")}`;
  if (Array.isArray(c.naoEm)) return `Só aparece se ${nome} não for ${c.naoEm.map((v: string) => `“${curto(v, 35)}”`).join(" nem ")}`;
  if (typeof c.maiorQue === "number") return `Só aparece se ${nome} for maior que ${c.maiorQue}`;
  return "Só aparece conforme resposta anterior";
}

function detalhesAvancados(p: Pergunta, todas: Pergunta[]): string[] {
  const c = p.config ?? {};
  const out: string[] = [];
  if (c.secao) out.push(c.secao);
  if (c.grupo) out.push(`Repete para ${ROTULO_GRUPO[c.grupo] ?? c.grupo}`);
  if (Array.isArray(c.mostrarSe)) for (const cond of c.mostrarSe) out.push(descreverCondicao(cond, todas));
  if (c.prefill) out.push("Já vem preenchido do CRM");
  if (c.opcoesDinamicas) out.push("Opções: nomes dos moradores");
  if (c.tempo === "HOJE") out.push("📍 Sobre HOJE");
  if (c.tempo === "FUTURO") out.push("🏠 Sobre o José Bonifácio");
  if (c.mostrarTotal) out.push(`Mostra total: ${c.mostrarTotal}`);
  if (Array.isArray(c.campos)) out.push(`Campos: ${c.campos.map((x: any) => x.label).join(", ")}`);
  if (c.unidade) out.push(`Unidade: ${c.unidade}`);
  return out;
}

function sufixoOpcao(o: string | { complemento?: string; rotuloComplemento?: string; exclusiva?: boolean; alerta?: string }): string {
  if (typeof o === "string") return "";
  const partes: string[] = [];
  if (o.complemento === "TEXTO") partes.push(`abre "${o.rotuloComplemento ?? "Qual?"}"`);
  if (o.complemento === "VALOR") partes.push("abre valor em R$");
  if (o.exclusiva) partes.push("desmarca as outras");
  if (o.alerta) partes.push(`alerta: ${o.alerta}`);
  return partes.join(" · ");
}

type AcaoOpcao = "NADA" | "VALOR" | "TEXTO" | "EXCLUSIVA";

/** O que acontece quando a família marca a opção (menu "Ao marcar"). */
function acaoDaOpcao(o: OpcaoRica): AcaoOpcao {
  if (o.complemento === "VALOR") return "VALOR";
  if (o.complemento === "TEXTO") return "TEXTO";
  if (o.exclusiva) return "EXCLUSIVA";
  return "NADA";
}

function patchDaAcao(a: AcaoOpcao): Partial<OpcaoRica> {
  const limpo: Partial<OpcaoRica> = { complemento: undefined, rotuloComplemento: undefined, complementoOpcional: undefined, exclusiva: undefined };
  if (a === "VALOR") return { ...limpo, complemento: "VALOR", rotuloComplemento: "Quanto recebe por mês (R$)" };
  if (a === "TEXTO") return { ...limpo, complemento: "TEXTO", rotuloComplemento: "Qual?" };
  if (a === "EXCLUSIVA") return { ...limpo, exclusiva: true };
  return limpo;
}

function trocar<T>(lista: T[], a: number, b: number): T[] {
  if (b < 0 || b >= lista.length) return lista;
  const copia = [...lista];
  [copia[a], copia[b]] = [copia[b], copia[a]];
  return copia;
}

function novaPergunta(): Pergunta {
  return { enunciado: "", tipo: "ESCOLHA_UNICA", opcoes: ["", ""], obrigatoria: true, escalaMin: 1, escalaMax: 5 };
}

export default function AbaPerguntas({
  questionario,
  onSalvo,
}: {
  questionario: Questionario;
  onSalvo: (q: Questionario) => void;
}) {
  const travado = questionario.status !== "RASCUNHO";
  const encerrado = questionario.status === "ENCERRADO";

  const [titulo, setTitulo] = useState(questionario.titulo);
  const [descricao, setDescricao] = useState(questionario.descricao ?? "");
  const [mensagem, setMensagem] = useState(questionario.mensagemEnvio);
  const [validade, setValidade] = useState(questionario.validadeDias);
  const [perguntas, setPerguntas] = useState<Pergunta[]>(
    questionario.perguntas.length ? questionario.perguntas : [novaPergunta()],
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    setTitulo(questionario.titulo);
    setDescricao(questionario.descricao ?? "");
    setMensagem(questionario.mensagemEnvio);
    setValidade(questionario.validadeDias);
    setPerguntas(questionario.perguntas.length ? questionario.perguntas : [novaPergunta()]);
  }, [questionario]);

  function alterar(idx: number, patch: Partial<Pergunta>) {
    setPerguntas((ps) => ps.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function mover(idx: number, dir: -1 | 1) {
    setPerguntas((ps) => {
      const alvo = idx + dir;
      if (alvo < 0 || alvo >= ps.length) return ps;
      const copia = [...ps];
      [copia[idx], copia[alvo]] = [copia[alvo], copia[idx]];
      return copia;
    });
  }

  async function salvar() {
    setErro(null);
    setOkMsg(null);
    if (!travado) {
      // Opção renomeada/apagada que faz outra pergunta aparecer: avisa antes de salvar
      const limpas = perguntas.map((p) => ({
        ...p,
        opcoes: p.opcoes?.map((o) => (typeof o === "string" ? o.trim() : { ...o, label: o.label.trim() })),
      }));
      const f = opcoesFaltandoNasCondicoes(limpas)[0];
      if (f) {
        setErro(
          `A opção "${f.opcao}" da pergunta "${f.perguntaOrigem}" é usada para mostrar a pergunta "${f.usadaEm}". ` +
            "Volte o nome da opção como estava ou fale com o suporte para ajustar essa regra.",
        );
        return;
      }
    }
    setSalvando(true);
    try {
      let q: Questionario = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}`, {
        method: "PATCH",
        body: JSON.stringify({ titulo, descricao, mensagemEnvio: mensagem, validadeDias: Number(validade) }),
      });
      if (!travado) {
        q = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/perguntas`, {
          method: "PUT",
          body: JSON.stringify({ perguntas }),
        });
      }
      onSalvo(q);
      setOkMsg("Alterações salvas.");
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const previa = mensagem
    .replace(/\{\{nome\}\}/gi, "Maria da Silva")
    .replace(/\{\{link\}\}/gi, "https://…/portal/questionario/abc123");
  const previaFinal = /\{\{link\}\}/i.test(mensagem) ? previa : `${previa}\n\nResponda aqui: https://…/portal/questionario/abc123`;

  return (
    <div className="space-y-6">
      {travado && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-subtext)" }}
        >
          {encerrado
            ? "Questionário encerrado — nada mais pode ser alterado."
            : "Questionário publicado — as perguntas estão travadas para o relatório não misturar versões. Para mudar perguntas, use \"Duplicar\". Título, descrição e mensagem ainda podem ser ajustados."}
        </div>
      )}

      <Card>
        <CardBody className="space-y-4">
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Título
            <input value={titulo} disabled={encerrado} onChange={(e) => setTitulo(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
            Descrição (aparece para a família no topo do questionário)
            <textarea
              value={descricao}
              disabled={encerrado}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
              Mensagem do WhatsApp — use {"{{nome}}"} e {"{{link}}"}
              <textarea
                value={mensagem}
                disabled={encerrado}
                onChange={(e) => setMensagem(e.target.value)}
                rows={5}
                className={inputCls}
              />
            </label>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>Prévia</p>
              <div
                className="rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                style={{ background: "#dcf8c6", color: "#111" }}
              >
                {previaFinal}
              </div>
            </div>
          </div>
          <label className="block text-xs font-medium w-48" style={{ color: "var(--shell-subtext)" }}>
            Validade do link (dias)
            <input
              type="number"
              min={1}
              max={180}
              value={validade}
              disabled={encerrado}
              onChange={(e) => setValidade(Number(e.target.value))}
              className={inputCls}
            />
            <span className="block mt-1 font-normal">
              Vale também para os links já enviados e ainda não respondidos.
            </span>
          </label>
        </CardBody>
      </Card>

      <div className="space-y-3">
        {perguntas.map((p, idx) => (
          <Card key={idx}>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>Pergunta {idx + 1}</p>
                  {detalhesAvancados(p, perguntas).map((d) => (
                    <span
                      key={d}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: "var(--shell-hover)", color: "var(--shell-subtext)" }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                {!travado && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => mover(idx, -1)} disabled={idx === 0} title="Subir" className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--shell-subtext)" }}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => mover(idx, 1)} disabled={idx === perguntas.length - 1} title="Descer" className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--shell-subtext)" }}>
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPerguntas((ps) => ps.filter((_, i) => i !== idx))}
                      title="Remover"
                      className="p-1.5 rounded text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
                <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                  Enunciado
                  <input
                    value={p.enunciado}
                    disabled={travado}
                    onChange={(e) => alterar(idx, { enunciado: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>
                  Tipo
                  <select
                    value={p.tipo}
                    disabled={travado || TIPOS_AVANCADOS.includes(p.tipo)}
                    onChange={(e) => {
                      const tipo = e.target.value as PerguntaTipo;
                      alterar(idx, {
                        tipo,
                        opcoes: TIPOS_COM_OPCOES.includes(tipo) ? (p.opcoes?.length ? p.opcoes : ["", ""]) : null,
                      });
                    }}
                    className={inputCls}
                  >
                    {Object.entries(PERGUNTA_TIPO_LABEL)
                      .filter(([v]) => v === p.tipo || !TIPOS_AVANCADOS.includes(v as PerguntaTipo))
                      .map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                  </select>
                </label>
              </div>

              {TIPOS_COM_OPCOES.includes(p.tipo) && !p.config?.opcoesDinamicas && (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: "var(--shell-subtext)" }}>Opções</p>
                  {(p.opcoes ?? []).map((o, oi) => {
                    const ops = p.opcoes ?? [];
                    const rica: OpcaoRica = typeof o === "string" ? { label: o } : o;
                    const ajustavel = !travado && p.tipo !== "ACEITE";
                    const setOps = (novas: (string | OpcaoRica)[]) => alterar(idx, { opcoes: novas });
                    const setOpcao = (patch: Partial<OpcaoRica>) =>
                      setOps(ops.map((x, xi) => (xi === oi ? { ...(typeof x === "string" ? { label: x } : x), ...patch } : x)));
                    return (
                      <div
                        key={oi}
                        className="rounded-lg border p-2 space-y-2"
                        style={{ borderColor: "var(--shell-card-border)" }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            value={opcaoLabel(o)}
                            disabled={travado}
                            placeholder={`Opção ${oi + 1}`}
                            onChange={(e) => setOpcao({ label: e.target.value })}
                            className={inputCls.replace("mt-1", "")}
                          />
                          {!travado && (
                            <div className="flex shrink-0 items-center">
                              <button
                                onClick={() => setOps(trocar(ops, oi, oi - 1))}
                                disabled={oi === 0}
                                title="Subir opção"
                                className="p-1.5 rounded disabled:opacity-30"
                                style={{ color: "var(--shell-subtext)" }}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setOps(trocar(ops, oi, oi + 1))}
                                disabled={oi === ops.length - 1}
                                title="Descer opção"
                                className="p-1.5 rounded disabled:opacity-30"
                                style={{ color: "var(--shell-subtext)" }}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              {ops.length > 2 && (
                                <button
                                  onClick={() => setOps(ops.filter((_, xi) => xi !== oi))}
                                  className="p-1.5 text-red-600"
                                  title="Remover opção"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {ajustavel ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" style={{ color: "var(--shell-subtext)" }}>
                            <label className="flex items-center gap-1.5">
                              Ao marcar:
                              <select
                                value={acaoDaOpcao(rica)}
                                onChange={(e) => setOpcao(patchDaAcao(e.target.value as AcaoOpcao))}
                                className="rounded-md border px-2 py-1 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                              >
                                <option value="NADA">Nada</option>
                                <option value="VALOR">Pede valor (R$)</option>
                                <option value="TEXTO">Pede texto</option>
                                <option value="EXCLUSIVA">Desmarca as outras (ex.: “Nenhuma”)</option>
                              </select>
                            </label>
                            {rica.complemento && (
                              <input
                                value={rica.rotuloComplemento ?? ""}
                                onChange={(e) => setOpcao({ rotuloComplemento: e.target.value })}
                                title="Texto que aparece em cima do campo"
                                placeholder={rica.complemento === "VALOR" ? "Texto do campo (ex.: Quanto recebe por mês)" : "Pergunta do campo (ex.: Qual?)"}
                                className="w-56 rounded-md border px-2 py-1 text-xs bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                              />
                            )}
                            {rica.complemento && (
                              <label className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={!!rica.complementoOpcional}
                                  onChange={(e) => setOpcao({ complementoOpcional: e.target.checked || undefined })}
                                />
                                {rica.complemento === "VALOR" ? "Valor" : "Texto"} opcional
                              </label>
                            )}
                            {rica.alerta && <span className="text-red-600">Abre demanda: {rica.alerta}</span>}
                            {rica.exclusiva && oi < ops.length - 1 && (
                              <span className="text-amber-600">Costuma ficar por último</span>
                            )}
                            <button
                              onClick={() => setOps([...ops.slice(0, oi + 1), "", ...ops.slice(oi + 1)])}
                              className="ml-auto font-medium"
                              style={{ color: "var(--via-teal, #1D9E75)" }}
                            >
                              + Inserir abaixo
                            </button>
                          </div>
                        ) : (
                          sufixoOpcao(o) && (
                            <p className="text-[11px]" style={{ color: "var(--shell-subtext)" }}>
                              {sufixoOpcao(o)}
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                  {!travado && (
                    <button
                      onClick={() => alterar(idx, { opcoes: [...(p.opcoes ?? []), ""] })}
                      className="text-xs font-medium"
                      style={{ color: "var(--via-teal, #1D9E75)" }}
                    >
                      + Adicionar opção
                    </button>
                  )}
                </div>
              )}

              {p.tipo === "ESCALA" && (
                <div className="flex items-end gap-3">
                  <label className="block text-xs font-medium w-28" style={{ color: "var(--shell-subtext)" }}>
                    Nota mínima
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={p.escalaMin ?? 1}
                      disabled={travado}
                      onChange={(e) => alterar(idx, { escalaMin: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs font-medium w-28" style={{ color: "var(--shell-subtext)" }}>
                    Nota máxima
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={p.escalaMax ?? 5}
                      disabled={travado}
                      onChange={(e) => alterar(idx, { escalaMax: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--shell-text)" }}>
                <input
                  type="checkbox"
                  checked={p.obrigatoria}
                  disabled={travado}
                  onChange={(e) => alterar(idx, { obrigatoria: e.target.checked })}
                />
                Resposta obrigatória
              </label>
            </CardBody>
          </Card>
        ))}

        {!travado && (
          <button
            onClick={() => setPerguntas((ps) => [...ps, novaPergunta()])}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium"
            style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
          >
            <Plus className="h-4 w-4" /> Adicionar pergunta
          </button>
        )}
      </div>

      {!encerrado && (
        <div className="flex items-center justify-end gap-3">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {okMsg && <p className="text-sm" style={{ color: "var(--via-teal, #1D9E75)" }}>{okMsg}</p>}
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--via-teal, #1D9E75)" }}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
}
