"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { maskPhone } from "@/lib/format";
import { formatDateTime } from "../../_lib/constants";
import BotaoHistorico from "./HistoricoEnvio";
import RitmoEnvio from "./RitmoEnvio";
import PainelQuestionario from "./PainelQuestionario";
import { Questionario, SITUACAO_LABEL, SITUACAO_VARIANT, Situacao, baixarCsv, slugArquivo } from "../../_lib/questionario";

type Linha = {
  envioId: string;
  familiaId: string;
  numero: number;
  nome: string;
  telefone: string | null;
  situacao: Situacao;
  agendadoPara: string | null;
  enviadoEm: string | null;
  linkAbertoEm: string | null;
  iniciadoEm: string | null;
  respondidoEm: string | null;
  respostasSalvas: number;
  alertas: string[];
  enviosCount: number;
  ultimoEnvioErro: string | null;
  tokenExpiraEm: string | null;
  canalEnvio: string | null;
  rodada: number;
  cobrancas: number;
  ultimaCobrancaEm: string | null;
};

// "Cobrar resposta": mesmos textos da API (questionario-cobranca.util.ts), para a confirmação mostrar o que vai sair
const COBRAVEIS: Situacao[] = ["RECEBEU", "ABRIU", "RESPONDENDO"];
const DIA_MS = 24 * 60 * 60 * 1000;
function previaCobranca(nome: string, titulo: string, situacao: Situacao): string {
  const seNaoAbrir = "Se o link não abrir, responda aqui que mandamos outro.";
  if (situacao === "RESPONDENDO")
    return `Olá, ${nome}! Você ainda não finalizou o preenchimento do questionário "${titulo}". Suas respostas já estão salvas: é só tocar no link da mensagem anterior e continuar de onde parou. ${seNaoAbrir}`;
  if (situacao === "ABRIU")
    return `Olá, ${nome}! Você abriu o questionário "${titulo}", mas ainda não começou a responder. Leva poucos minutos e ajuda muito a equipe a conhecer sua família. É só tocar no link da mensagem anterior. ${seNaoAbrir}`;
  return `Olá, ${nome}! Ainda não recebemos suas respostas do questionário "${titulo}". É só tocar no link da mensagem anterior para responder. ${seNaoAbrir}`;
}
/** Trava de 24h: null = pode cobrar; senão quantas horas faz e quantas faltam. */
function travaCobranca(ultima: string | null): { ha: number; faltam: number } | null {
  if (!ultima) return null;
  const passou = Date.now() - new Date(ultima).getTime();
  if (passou >= DIA_MS) return null;
  return { ha: Math.floor(passou / 3_600_000), faltam: Math.ceil((DIA_MS - passou) / 3_600_000) };
}

type Dados = {
  totais: { total: number; agendado: number; aguardandoEnvio: number; falha: number; enviado: number; recebeu: number; abriu: number; respondendo: number; respondeu: number; alertas: number };
  linhas: Linha[];
};

const CARDS: { key: keyof Dados["totais"]; situacao: Situacao | ""; label: string }[] = [
  { key: "total", situacao: "", label: "Total" },
  { key: "agendado", situacao: "AGENDADO", label: "Agendado" },
  { key: "aguardandoEnvio", situacao: "AGUARDANDO_ENVIO", label: "Na fila" },
  { key: "falha", situacao: "FALHA", label: "Envio falhou" },
  { key: "enviado", situacao: "ENVIADO", label: "Enviado, aguardando entrega" },
  { key: "recebeu", situacao: "RECEBEU", label: "Recebeu, não abriu" },
  { key: "abriu", situacao: "ABRIU", label: "Abriu, não começou" },
  { key: "respondendo", situacao: "RESPONDENDO", label: "Começou, não terminou" },
  { key: "respondeu", situacao: "RESPONDEU", label: "Respondeu" },
];

export default function AbaAcompanhamento({
  questionario,
  onVerRespostas,
}: {
  questionario: Questionario;
  onVerRespostas: (envioId: string) => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [filtro, setFiltro] = useState<Situacao | "">("");
  const [busca, setBusca] = useState("");
  const [soAlertas, setSoAlertas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Cancelar link pede duas confirmações; reenviar pede uma
  const [confirmacao, setConfirmacao] = useState<{ tipo: "cancelar1" | "cancelar2" | "reenviar" | "corrigir1" | "corrigir2" | "cobrar"; linha: Linha } | null>(null);

  const publicado = questionario.status === "PUBLICADO";
  const naFilaRef = useRef(0);
  naFilaRef.current = dados?.totais.aguardandoEnvio ?? 0;

  useEffect(() => {
    carregar();
    // Enquanto houver envio na fila, atualiza sozinho a cada 15s
    const t = setInterval(() => {
      if (naFilaRef.current > 0) carregar(true);
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionario.id]);

  async function carregar(silencioso = false) {
    if (!silencioso) setLoading(true);
    setErro(null);
    try {
      setDados(await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/acompanhamento`));
    } catch (e: any) {
      setErro(e?.message ?? "Erro ao carregar acompanhamento");
    } finally {
      setLoading(false);
    }
  }

  async function reenviar(envioId: string) {
    setReenviando(envioId);
    setMsg(null);
    try {
      const r = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/envios/${envioId}/reenviar`, {
        method: "POST",
      });
      setMsg(r.ok ? "Reenviado — o link anterior deixou de valer." : `Falha ao reenviar: ${r.erro}`);
      await carregar(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao reenviar");
    } finally {
      setReenviando(null);
    }
  }

  async function cobrar(envioId: string) {
    setReenviando(envioId);
    setMsg(null);
    try {
      const r = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/envios/${envioId}/cobrar`, { method: "POST" });
      setMsg(r.ok ? "Cobrança enviada — a família foi lembrada de usar o link que já recebeu." : `Falha ao cobrar: ${r.erro}`);
      await carregar(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao cobrar");
    } finally {
      setReenviando(null);
    }
  }

  async function reenviarParaCorrigir(envioId: string) {
    setReenviando(envioId);
    setMsg(null);
    try {
      const r = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/envios/${envioId}/reenviar-correcao`, {
        method: "POST",
      });
      setMsg(
        r.ok
          ? "Reenviado para correção. As respostas anteriores foram para o histórico (Ver respostas) e a família recebeu um link novo, já preenchido."
          : `As respostas foram para o histórico, mas o WhatsApp falhou: ${r.erro}. Use Reenviar.`,
      );
      await carregar(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao reenviar para correção");
    } finally {
      setReenviando(null);
    }
  }

  async function cancelarLink(envioId: string) {
    setReenviando(envioId);
    setMsg(null);
    try {
      await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/envios/${envioId}/cancelar-link`, { method: "POST" });
      setMsg("Link cancelado. Para a família responder, use Reenviar (vai um link novo).");
      await carregar(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao cancelar o link");
    } finally {
      setReenviando(null);
    }
  }

  async function cancelarAgendamento(envioId?: string) {
    setReenviando(envioId ?? "cancelar-todos");
    setMsg(null);
    try {
      const r = await apiFetch(`/pre-ocupacao/questionarios/${questionario.id}/cancelar-agendamento`, {
        method: "POST",
        body: JSON.stringify(envioId ? { envioId } : {}),
      });
      setMsg(`${r.cancelados} agendamento(s) cancelado(s). As famílias podem ser escolhidas de novo na aba Envio.`);
      await carregar(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao cancelar agendamento");
    } finally {
      setReenviando(null);
    }
  }

  function abrirFamilia(familiaId: string) {
    window.open(`/pre-ocupacao/familias/${familiaId}`, "_blank");
  }

  function confirmar() {
    if (!confirmacao) return;
    const { tipo, linha } = confirmacao;
    if (tipo === "cancelar1") return setConfirmacao({ tipo: "cancelar2", linha });
    if (tipo === "corrigir1") return setConfirmacao({ tipo: "corrigir2", linha });
    setConfirmacao(null);
    if (tipo === "cancelar2") cancelarLink(linha.envioId);
    else if (tipo === "corrigir2") reenviarParaCorrigir(linha.envioId);
    else if (tipo === "cobrar") cobrar(linha.envioId);
    else reenviar(linha.envioId);
  }

  function exportar() {
    if (!dados) return;
    baixarCsv(`acompanhamento-${slugArquivo(questionario.titulo)}.csv`, [
      ["Nº", "Família", "Telefone", "Situação", "Resposta nº", "Cobranças", "Última cobrança", "Canal", "Agendado para", "Enviado em", "Abriu em", "Respondeu em", "Envios", "Erro do último envio", "Alertas"],
      ...dados.linhas.map((l) => [
        String(l.numero),
        l.nome,
        l.telefone ?? "",
        SITUACAO_LABEL[l.situacao],
        String(l.rodada ?? 1),
        String(l.cobrancas ?? 0),
        l.ultimaCobrancaEm ? formatDateTime(l.ultimaCobrancaEm) : "",
        l.canalEnvio === "WHATSAPP_OFICIAL" ? "WhatsApp Oficial" : l.canalEnvio === "WHATSAPP_LIGHT" ? "WhatsApp Light" : "",
        l.agendadoPara ? formatDateTime(l.agendadoPara) : "",
        l.enviadoEm ? formatDateTime(l.enviadoEm) : "",
        l.linkAbertoEm ? formatDateTime(l.linkAbertoEm) : "",
        l.respondidoEm ? formatDateTime(l.respondidoEm) : "",
        String(l.enviosCount),
        l.ultimoEnvioErro ?? "",
        l.alertas.join("; "),
      ]),
    ]);
  }

  const linhas = (dados?.linhas ?? []).filter((l) => {
    if (filtro && l.situacao !== filtro) return false;
    if (soAlertas && l.alertas.length === 0) return false;
    const t = busca.trim().toLowerCase();
    return !t || l.nome.toLowerCase().includes(t) || String(l.numero).includes(t);
  });

  return (
    <div className="space-y-4">
      {questionario.status === "PUBLICADO" && <RitmoEnvio questionario={questionario} />}
      {dados && dados.totais.total > 0 && <PainelQuestionario dados={dados} />}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {CARDS.map((c) => {
          const ativo = filtro === c.situacao;
          return (
            <button key={c.key} onClick={() => setFiltro(c.situacao)} className="text-left">
              <Card className="h-full" style={{ borderColor: ativo ? "var(--via-teal, #1D9E75)" : undefined }}>
                <CardBody>
                  <p className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
                    {dados ? dados.totais[c.key] : "—"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--shell-subtext)" }}>{c.label}</p>
                </CardBody>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {(dados?.totais.alertas ?? 0) > 0 && (
          <button
            onClick={() => setSoAlertas((v) => !v)}
            className="px-4 py-2 rounded-lg text-sm font-semibold border text-red-600"
            style={{ borderColor: soAlertas ? "#dc2626" : "var(--shell-card-border)", background: soAlertas ? "#fef2f2" : "transparent" }}
          >
            ⚠ {dados?.totais.alertas} família(s) pediram sigilo ou atendimento reservado
          </button>
        )}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar família por nome ou número"
          className="h-10 w-full max-w-xs rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {publicado && (dados?.totais.agendado ?? 0) > 0 && (
            <button
              onClick={() => cancelarAgendamento()}
              disabled={!!reenviando}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] text-red-600 disabled:opacity-50"
            >
              {reenviando === "cancelar-todos" ? "Cancelando..." : `Cancelar os ${dados?.totais.agendado} agendados`}
            </button>
          )}
          <button
            onClick={exportar}
            disabled={!dados?.linhas.length}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50"
            style={{ color: "var(--shell-text)" }}
          >
            Baixar CSV
          </button>
          <button
            onClick={() => carregar()}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
            style={{ color: "var(--shell-text)" }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm" style={{ color: "var(--shell-text)" }}>{msg}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--shell-subtext)" }}>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Família</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Enviado / agendado</th>
                <th className="px-4 py-3">Respondeu em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--shell-subtext)" }}>
                    {loading ? "Carregando..." : "Nenhuma família nesta situação."}
                  </td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.envioId} className="border-t" style={{ borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}>
                  <td className="px-4 py-2">
                    <button onClick={() => abrirFamilia(l.familiaId)} title="Abrir a família em outra aba" className="hover:underline">
                      {l.numero}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => abrirFamilia(l.familiaId)} title="Abrir a família em outra aba" className="text-left hover:underline">
                      {l.nome}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={SITUACAO_VARIANT[l.situacao]}>{SITUACAO_LABEL[l.situacao]}</Badge>
                    <BotaoHistorico questionarioId={questionario.id} envioId={l.envioId} />
                    {(l.cobrancas ?? 0) > 0 && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--shell-subtext)" }}>
                        Cobrado {l.cobrancas}x · última em {formatDateTime(l.ultimaCobrancaEm)}
                      </p>
                    )}
                    {(l.rodada ?? 1) > 1 && (
                      <span className="ml-2 inline-block rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {l.rodada}ª resposta
                      </span>
                    )}
                    {l.situacao === "RESPONDENDO" && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--shell-subtext)" }}>
                        {l.respostasSalvas} resposta(s) salva(s)
                      </p>
                    )}
                    {l.alertas.map((a) => (
                      <p key={a} className="text-[11px] mt-1 font-semibold text-red-600">⚠ {a}</p>
                    ))}
                    {!["RESPONDEU", "AGENDADO", "AGUARDANDO_ENVIO"].includes(l.situacao) &&
                      (!l.tokenExpiraEm ? (
                        // Sem link e sem nenhum envio que saiu: o link nem chegou a ser criado
                        l.enviosCount > 0 ? <p className="text-[11px] mt-1 text-red-600">Link cancelado</p> : null
                      ) : new Date(l.tokenExpiraEm) < new Date() ? (
                        <p className="text-[11px] mt-1 text-red-600">Link vencido</p>
                      ) : (
                        <p className="text-[11px] mt-1" style={{ color: "var(--shell-subtext)" }}>
                          Link vale até {formatDateTime(l.tokenExpiraEm)}
                        </p>
                      ))}
                    {l.situacao === "ENVIADO" && l.canalEnvio === "WHATSAPP_OFICIAL" && (
                      <p className="text-[11px] mt-1 font-semibold text-amber-600 max-w-xs">
                        Saiu pelo WhatsApp Oficial (número da plataforma) e pode não ter chegado. Troque o canal do lead para o
                        WhatsApp Light e reenvie.
                      </p>
                    )}
                    {l.situacao === "FALHA" && l.ultimoEnvioErro && (
                      <p className="text-[11px] mt-1 text-red-600 max-w-xs truncate" title={l.ultimoEnvioErro}>
                        {l.ultimoEnvioErro}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>
                    {l.situacao === "AGENDADO" ? `Agendado: ${formatDateTime(l.agendadoPara)}` : formatDateTime(l.enviadoEm)}
                    {l.enviosCount > 1 && ` (${l.enviosCount} envios)`}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--shell-subtext)" }}>{formatDateTime(l.respondidoEm)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {l.situacao !== "RESPONDEU" && l.tokenExpiraEm && new Date(l.tokenExpiraEm) > new Date() && (
                      <button
                        onClick={() => setConfirmacao({ tipo: "cancelar1", linha: l })}
                        disabled={!!reenviando}
                        title="Use se o link foi parar em mãos erradas"
                        className="mr-3 text-xs font-medium text-red-600 disabled:opacity-50"
                      >
                        Cancelar link
                      </button>
                    )}
                    {publicado && COBRAVEIS.includes(l.situacao) && (() => {
                      const trava = travaCobranca(l.ultimaCobrancaEm);
                      return (
                        <button
                          onClick={() => setConfirmacao({ tipo: "cobrar", linha: l })}
                          disabled={!!reenviando || !!trava}
                          title={trava ? `Dá para cobrar de novo em ${trava.faltam}h` : "Manda um lembrete pelo WhatsApp (sem link novo)"}
                          className="mr-3 text-xs font-medium text-blue-700 disabled:opacity-50"
                        >
                          {reenviando === l.envioId ? "Cobrando..." : trava ? `Cobrado há ${trava.ha}h` : "Cobrar resposta"}
                        </button>
                      );
                    })()}
                    {l.situacao === "RESPONDEU" && publicado && (
                      <button
                        onClick={() => setConfirmacao({ tipo: "corrigir1", linha: l })}
                        disabled={!!reenviando}
                        title="A família recebe um link novo, já preenchido, para corrigir e enviar de novo"
                        className="mr-3 text-xs font-medium text-amber-700 disabled:opacity-50"
                      >
                        {reenviando === l.envioId ? "Reenviando..." : "Reenviar para corrigir"}
                      </button>
                    )}
                    {l.situacao === "RESPONDEU" || l.situacao === "RESPONDENDO" ? (
                      <button
                        onClick={() => onVerRespostas(l.envioId)}
                        className="text-xs font-medium"
                        style={{ color: "var(--via-teal, #1D9E75)" }}
                      >
                        Ver respostas
                      </button>
                    ) : l.situacao === "AGENDADO" ? (
                      publicado && (
                        <button
                          onClick={() => cancelarAgendamento(l.envioId)}
                          disabled={!!reenviando}
                          className="text-xs font-medium text-red-600 disabled:opacity-50"
                        >
                          {reenviando === l.envioId ? "Cancelando..." : "Cancelar agendamento"}
                        </button>
                      )
                    ) : (
                      publicado &&
                      l.situacao !== "AGUARDANDO_ENVIO" && (
                        <button
                          onClick={() => setConfirmacao({ tipo: "reenviar", linha: l })}
                          disabled={!!reenviando}
                          className="text-xs font-medium disabled:opacity-50"
                          style={{ color: "var(--via-teal, #1D9E75)" }}
                        >
                          {reenviando === l.envioId ? "Reenviando..." : "Reenviar"}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={!!confirmacao}
        onClose={() => setConfirmacao(null)}
        title={
          confirmacao?.tipo === "reenviar"
            ? "Confirmar reenvio"
            : confirmacao?.tipo === "cobrar"
              ? "Cobrar resposta"
              : confirmacao?.tipo === "corrigir1"
              ? "Reenviar para corrigir"
              : confirmacao?.tipo === "cancelar2" || confirmacao?.tipo === "corrigir2"
                ? "Tem certeza?"
                : "Cancelar link"
        }
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmacao(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--shell-card-border)]"
              style={{ color: "var(--shell-text)" }}
            >
              Voltar
            </button>
            <button
              onClick={confirmar}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{
                background:
                  confirmacao?.tipo === "reenviar" || confirmacao?.tipo === "cobrar"
                    ? "var(--via-teal, #1D9E75)"
                    : confirmacao?.tipo === "corrigir1" || confirmacao?.tipo === "corrigir2"
                      ? "#b45309"
                      : "#dc2626",
              }}
            >
              {confirmacao?.tipo === "cobrar"
                ? "Sim, cobrar"
                : confirmacao?.tipo === "reenviar"
                ? "Sim, reenviar"
                : confirmacao?.tipo === "cancelar2"
                  ? "Sim, cancelar link"
                  : confirmacao?.tipo === "corrigir2"
                    ? "Sim, reenviar para correção"
                    : "Continuar"}
            </button>
          </div>
        }
      >
        {confirmacao && (
          <p className="text-sm" style={{ color: "var(--shell-text)" }}>
            {confirmacao.tipo === "reenviar" ? (
              <>
                Reenviar o questionário para <strong>{confirmacao.linha.nome}</strong>
                {confirmacao.linha.telefone ? ` no número ${maskPhone(confirmacao.linha.telefone)}` : ""}? Vai um link novo
                e o link anterior deixa de valer.
              </>
            ) : confirmacao.tipo === "cobrar" ? (
              <>
                Mandar um lembrete para <strong>{confirmacao.linha.nome}</strong>
                {confirmacao.linha.telefone ? ` no ${maskPhone(confirmacao.linha.telefone)}` : ""}? Não vai link novo: a família
                usa o link que já recebeu. Depois disso, só dá para cobrar de novo em 24h.
                {confirmacao.linha.tokenExpiraEm && new Date(confirmacao.linha.tokenExpiraEm) < new Date() && (
                  <span className="mt-3 block text-xs font-medium text-orange-600">
                    O link desta família já venceu. Ela não vai conseguir abrir; prefira Reenviar, que manda um link novo.
                  </span>
                )}
                <span
                  className="mt-3 block whitespace-pre-wrap rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-hover)" }}
                >
                  {previaCobranca(confirmacao.linha.nome, questionario.titulo, confirmacao.linha.situacao)}
                </span>
              </>
            ) : confirmacao.tipo === "corrigir1" ? (
              <>
                <strong>{confirmacao.linha.nome}</strong>{" "}já respondeu. As respostas atuais vão para o histórico (dá para ver em
                &ldquo;Ver respostas&rdquo;) e <strong>deixam de contar no relatório</strong> até a família enviar de novo. Ela
                recebe{confirmacao.linha.telefone ? ` no ${maskPhone(confirmacao.linha.telefone)}` : ""} um link novo, já
                preenchido, avisando que é a {(confirmacao.linha.rodada ?? 1) + 1}ª resposta.
              </>
            ) : confirmacao.tipo === "corrigir2" ? (
              <>
                A nova resposta de <strong>{confirmacao.linha.nome}</strong> vai <strong>substituir</strong>{" "}a anterior. Até a
                família enviar de novo, ela sai de &ldquo;Respondeu&rdquo; e volta a contar como enviado/respondendo.
              </>
            ) : confirmacao.tipo === "cancelar1" ? (
              <>
                Cancelar o link de <strong>{confirmacao.linha.nome}</strong>? Use isso se o link foi parar em mãos erradas.
              </>
            ) : (
              <>
                O link de <strong>{confirmacao.linha.nome}</strong> para de funcionar na hora. As respostas já salvas ficam
                guardadas e você pode reenviar um link novo depois.
              </>
            )}
          </p>
        )}
      </Modal>
    </div>
  );
}
