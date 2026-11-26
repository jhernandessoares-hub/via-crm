import { apiFetch } from "@/lib/api";
import {
  ATENDIMENTO_ASSUNTO_LABEL,
  ATENDIMENTO_MOTIVO_LABEL,
  OCORRENCIA_ORIGEM_LABEL,
  OCORRENCIA_STATUS_LABEL,
} from "./constants";
import { gerarXlsx, salvarBlob, type XlsxLinha } from "./xlsx-simples";

/**
 * Planilha mensal "Acompanhamento Psicossocial" (Indicador 2 do N1) para a
 * Verificadora: Resumo + Atendimentos + Demandas com andamentos. Sem CPF.
 */

type FamiliaRef = { numero: number; lead: { nome: string; nomeCorreto: string | null } } | null;

type RelatorioResposta = {
  atendimentos: {
    id: string;
    inicioEm: string;
    modalidade: string;
    motivo: string;
    assunto: string;
    descricao: string | null;
    atendidoPorNome: string | null;
    familia: FamiliaRef;
  }[];
  demandas: {
    id: string;
    numero: number;
    titulo: string;
    origem: string;
    status: string;
    abertaEm: string;
    encerradaEm: string | null;
    resolucao: string | null;
    familia: FamiliaRef;
    andamentos: { texto: string; criadoEm: string }[];
  }[];
  familiasDistintas: number;
};

const TZ = "America/Sao_Paulo";

/** Para a Verificadora o atendimento online é "Digital". */
const MODALIDADE_RELATORIO: Record<string, string> = {
  ONLINE: "Digital",
  PRESENCIAL: "Presencial",
  TELEFONE: "Telefone",
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const DEFINICAO_ATENDIMENTO =
  "Atendimento: cada contato individual da equipe técnica social com uma família, seja conversa pelo WhatsApp (Digital), presencial ou por telefone, para tirar dúvida, orientar ou registrar reclamação ou sugestão. É resolvido no próprio contato e registrado ao final dele, com motivo, assunto e a orientação ou providência dada.";

export const DEFINICAO_DEMANDA =
  "Demanda: pedido ou problema trazido pela família (pelo WhatsApp, Portal da Família, questionário ou registro da equipe) que não se resolve no próprio contato e precisa de providência ou encaminhamento. Fica aberta até ser resolvida; cada passo dado é registrado como andamento, com data, e ao encerrar registra-se a resolução.";

function data(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ }) : "";
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function numFamilia(f: FamiliaRef): string {
  return f ? String(f.numero).padStart(4, "0") : "";
}

function nomeFamilia(f: FamiliaRef): string {
  return f ? f.lead.nomeCorreto ?? f.lead.nome : "Sem família vinculada";
}

function pedido(titulo: string): string {
  return titulo.replace(/^Questionário:\s*/i, "").trim();
}

/** "Outubro 2026" quando o período é um mês fechado; senão "01/10/2026 a 15/10/2026". */
export function rotuloPeriodo(de: string, ate: string): string {
  const [ay, am, ad] = de.split("-").map(Number);
  const [by, bm, bd] = ate.split("-").map(Number);
  const ultimoDia = new Date(by, bm, 0).getDate();
  if (ay === by && am === bm && ad === 1 && bd === ultimoDia) return `${MESES[am - 1]} ${ay}`;
  const fmt = (d: string) => d.split("-").reverse().join("/");
  return `${fmt(de)} a ${fmt(ate)}`;
}

function contar<T>(lista: T[], chave: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of lista) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

export async function baixarAcompanhamentoPsicossocial(de: string, ate: string) {
  const qs = new URLSearchParams({ de, ate }).toString();
  const r: RelatorioResposta = await apiFetch(`/pre-ocupacao/relatorios/acompanhamento-psicossocial?${qs}`);

  const rotulo = rotuloPeriodo(de, ate);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
  const periodoTxt = `${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`;
  const titulo = `Acompanhamento Psicossocial - ${rotulo}`;

  // ── Resumo ──
  const porModalidade = new Map<string, number>([["Digital", 0], ["Presencial", 0]]);
  for (const a of r.atendimentos) {
    const k = MODALIDADE_RELATORIO[a.modalidade] ?? a.modalidade;
    porModalidade.set(k, (porModalidade.get(k) ?? 0) + 1);
  }
  const porPedido = contar(r.demandas, (d) => pedido(d.titulo));
  const porSituacao = contar(r.demandas, (d) => OCORRENCIA_STATUS_LABEL[d.status] ?? d.status);

  const resumo: XlsxLinha[] = [
    { celulas: [titulo], estilo: "titulo" },
    { celulas: [`Período: ${periodoTxt}. Gerado em ${hoje}.`] },
    { celulas: [] },
    { celulas: ["O que é cada registro"], estilo: "negrito" },
    { celulas: [DEFINICAO_ATENDIMENTO], estilo: "texto", mesclarTudo: true },
    { celulas: [DEFINICAO_DEMANDA], estilo: "texto", mesclarTudo: true },
    { celulas: [] },
    { celulas: ["Indicador", "Quantidade"], estilo: "cabecalho" },
    { celulas: ["Total de acompanhamentos (atendimentos + demandas abertas no período)", r.atendimentos.length + r.demandas.length], estilo: "corpo" },
    { celulas: ["Atendimentos", r.atendimentos.length], estilo: "corpo" },
    { celulas: ["Demandas abertas no período", r.demandas.length], estilo: "corpo" },
    { celulas: ["Famílias distintas acompanhadas", r.familiasDistintas], estilo: "corpo" },
    { celulas: [] },
    { celulas: ["Atendimentos por modalidade", "Quantidade"], estilo: "cabecalho" },
    ...[...porModalidade.entries()].map(([k, n]): XlsxLinha => ({ celulas: [k, n], estilo: "corpo" })),
    { celulas: [] },
    { celulas: ["Demandas por pedido da família", "Quantidade"], estilo: "cabecalho" },
    ...(porPedido.length
      ? porPedido.map(([k, n]): XlsxLinha => ({ celulas: [k, n], estilo: "corpo" }))
      : [{ celulas: ["Nenhuma demanda aberta no período", 0], estilo: "corpo" } as XlsxLinha]),
    { celulas: [] },
    { celulas: [`Demandas por situação em ${hoje}`, "Quantidade"], estilo: "cabecalho" },
    ...porSituacao.map(([k, n]): XlsxLinha => ({ celulas: [k, n], estilo: "corpo" })),
    { celulas: [] },
    { celulas: ["Fonte: VIA CRM, módulo Pré-Ocupação"], estilo: "nota" },
  ];

  // ── Atendimentos ──
  const atendimentos: XlsxLinha[] = [
    { celulas: [`Atendimentos às famílias - ${rotulo} (${periodoTxt})`], estilo: "titulo" },
    {
      celulas: ["Data", "Hora", "Nº família", "Família", "Modalidade", "Motivo", "Assunto", "Descrição / providência", "Atendido por", "Situação"],
      estilo: "cabecalho",
    },
    ...r.atendimentos.map(
      (a): XlsxLinha => ({
        estilo: "corpo",
        celulas: [
          data(a.inicioEm),
          hora(a.inicioEm),
          numFamilia(a.familia),
          nomeFamilia(a.familia),
          MODALIDADE_RELATORIO[a.modalidade] ?? a.modalidade,
          ATENDIMENTO_MOTIVO_LABEL[a.motivo] ?? a.motivo,
          ATENDIMENTO_ASSUNTO_LABEL[a.assunto] ?? a.assunto,
          a.descricao ?? "",
          a.atendidoPorNome ?? "",
          "Concluído",
        ],
      }),
    ),
  ];

  // ── Demandas ──
  const demandas: XlsxLinha[] = [
    { celulas: [`Demandas abertas em ${rotulo} (situação em ${hoje})`], estilo: "titulo" },
    {
      celulas: ["Nº", "Aberta em", "Nº família", "Família", "Origem", "Pedido da família", "Situação", "Andamentos", "Encerrada em", "Resolução"],
      estilo: "cabecalho",
    },
    ...r.demandas.map(
      (d): XlsxLinha => ({
        estilo: "corpo",
        celulas: [
          d.numero,
          data(d.abertaEm),
          numFamilia(d.familia),
          nomeFamilia(d.familia),
          OCORRENCIA_ORIGEM_LABEL[d.origem] ?? d.origem,
          pedido(d.titulo),
          OCORRENCIA_STATUS_LABEL[d.status] ?? d.status,
          d.andamentos.map((an) => `${data(an.criadoEm)}: ${an.texto.trim()}`).join("\n"),
          data(d.encerradaEm),
          d.resolucao ?? "",
        ],
      }),
    ),
  ];

  const blob = await gerarXlsx([
    { nome: "Resumo", larguras: [70, 14], linhas: resumo },
    { nome: "Atendimentos", larguras: [11, 7, 10, 32, 12, 12, 26, 60, 20, 12], linhas: atendimentos, congelarAntesDaLinha: 3 },
    { nome: "Demandas", larguras: [6, 11, 10, 32, 16, 36, 11, 60, 12, 45], linhas: demandas, congelarAntesDaLinha: 3 },
  ]);
  salvarBlob(blob, `${titulo}.xlsx`);
}
