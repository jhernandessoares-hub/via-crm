import type { BadgeVariant } from "@/components/ui/Badge";

export type ItemTipo = "APROVACAO" | "ELEICAO" | "ESCOLHA";
export type Quorum = "MAIORIA_PRESENTES" | "MAIORIA_ABSOLUTA" | "DOIS_TERCOS";

export type ResultadoItem = {
  contagem: { opcao: string; votos: number }[];
  totalVotos: number;
  abstencoes: number;
  votosValidos: number;
  totalUnidades: number;
  presentes: number;
  necessarios: number;
  vencedor: string | null;
  empate: boolean;
  aprovado: boolean;
  resumo: string;
};

export type AssembleiaItem = {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: ItemTipo;
  opcoes: string[];
  quorum: Quorum;
  status: "PENDENTE" | "ABERTO" | "FECHADO";
  abertoEm: string | null;
  fechadoEm: string | null;
  resultado: ResultadoItem | null;
  totalVotos: number;
};

export type AssembleiaUnidade = {
  id: string;
  unidadeNome: string;
  torreNome: string | null;
  leadId: string | null;
  morador: string | null;
  telefone: string | null;
  temCpf: boolean;
  statusEnvio: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  linkAbertoEm: string | null;
  ultimoEnvioErro: string | null;
  procuradorNome: string | null;
  procuradorCpf: string | null;
  presente: boolean;
};

export type TipoEncontro = "ASSEMBLEIA" | "REUNIAO";

export type Assembleia = {
  id: string;
  tipo: TipoEncontro;
  titulo: string;
  status: "RASCUNHO" | "CONVOCADA" | "EM_ANDAMENTO" | "ENCERRADA";
  empreendimento: string | null;
  edital: string;
  linkVideo: string | null;
  dataPrimeiraConvocacao: string;
  dataSegundaConvocacao: string;
  presidenteNome: string | null;
  secretarioNome: string | null;
  envioPausadoEm: string | null;
  envioPausaMotivo: string | null;
  iniciadaEm: string | null;
  encerradaEm: string | null;
  itens: AssembleiaItem[];
  unidades: AssembleiaUnidade[];
};

export type Mesa = {
  tipo: TipoEncontro;
  status: Assembleia["status"];
  totalUnidades: number;
  presentes: number;
  online: number;
  presencial: number;
  convocadas: number;
  entregues: number;
  instalacao: { minimoPrimeira: number; emSegunda: boolean; instalada: boolean };
  itemAberto: {
    id: string;
    ordem: number;
    titulo: string;
    tipo: ItemTipo;
    opcoes: string[];
    abertoEm: string;
    parcial: ResultadoItem;
    faltamVotar: number;
  } | null;
  unidadesPresentes: string[];
  unidadesQueVotaram: string[];
};

export const ASSEMBLEIA_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  CONVOCADA: "Convocada",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA: "Encerrada",
};

export const ASSEMBLEIA_STATUS_VARIANT: Record<string, BadgeVariant> = {
  RASCUNHO: "neutral",
  CONVOCADA: "info",
  EM_ANDAMENTO: "warning",
  ENCERRADA: "success",
};

export const ENCONTRO_LABEL: Record<TipoEncontro, string> = {
  ASSEMBLEIA: "Assembleia",
  REUNIAO: "Reunião",
};

export const TIPO_LABEL: Record<ItemTipo, string> = {
  APROVACAO: "Aprovação (Sim / Não / Abstenção)",
  ELEICAO: "Eleição (candidatos)",
  ESCOLHA: "Escolha entre opções",
};

export const QUORUM_LABEL: Record<Quorum, string> = {
  MAIORIA_PRESENTES: "Maioria dos votos dos presentes",
  MAIORIA_ABSOLUTA: "Maioria absoluta (mais da metade de todas as unidades)",
  DOIS_TERCOS: "2/3 de todas as unidades (ex.: convenção)",
};

export const ENVIO_LABEL: Record<string, string> = {
  PENDENTE: "Na fila",
  ENVIADO: "Enviado",
  FALHA: "Falha",
};

/** Pauta típica da instalação, para começar mais rápido (pode editar tudo). */
export const PAUTA_SUGERIDA = [
  { titulo: "Aprovação da Convenção do Condomínio", tipo: "APROVACAO", quorum: "DOIS_TERCOS", opcoes: [] },
  { titulo: "Aprovação do Regimento Interno", tipo: "APROVACAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
  { titulo: "Eleição do Síndico", tipo: "ELEICAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
  { titulo: "Eleição do Subsíndico", tipo: "ELEICAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
  { titulo: "Eleição do Conselho Fiscal", tipo: "ELEICAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
  { titulo: "Aprovação da previsão orçamentária e do valor da taxa condominial", tipo: "APROVACAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
  { titulo: "Autorização para abertura de CNPJ e conta bancária do condomínio", tipo: "APROVACAO", quorum: "MAIORIA_PRESENTES", opcoes: [] },
] as const;

export const EDITAL_PADRAO = `Olá, {{nome}}!

Você está convocado(a) para a Assembleia Geral de Instalação do Condomínio, como responsável pela unidade {{unidade}}.

Data: {{data}}, em 1ª convocação. Se não houver quórum, a assembleia começa 30 minutos depois, em 2ª convocação, com qualquer número de presentes.

A assembleia será online (quem preferir pode comparecer no local). Para participar:
1. Entre na sala de vídeo: {{video}}
2. Abra o seu link individual para confirmar presença com o seu CPF e votar: {{link}}

Ordem do dia:
{{pauta}}

Este link é só da sua unidade. Não encaminhe para outras pessoas.`;

export const EDITAL_REUNIAO_PADRAO = `Olá, {{nome}}!

Você está convidado(a) para a reunião do condomínio, como responsável pela unidade {{unidade}}.

Data: {{data}}.

A reunião será online (quem preferir pode comparecer no local). Para participar:
1. Entre na sala de vídeo: {{video}}
2. Abra o seu link individual para confirmar presença com o seu CPF: {{link}}

Assuntos:
{{pauta}}

Este link é só da sua unidade. Não encaminhe para outras pessoas.`;

/** ISO → valor de <input type="datetime-local"> no horário do navegador. */
export function isoParaInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function nomeUnidade(u: { torreNome: string | null; unidadeNome: string }) {
  return [u.torreNome, u.unidadeNome].filter(Boolean).join(" · ");
}

export const inputCls =
  "block w-full mt-1 h-10 rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)] outline-none";
export const btnPrimario = "px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50";
export const btnSecundario = "px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--shell-card-border)] disabled:opacity-50";
export const TEAL = "var(--via-teal, #1D9E75)";

/** Chamada à API da assembleia (path relativo a /pre-ocupacao/assembleias/:id); undefined = erro já mostrado. */
export type Chamar = (path: string, init?: RequestInit) => Promise<any>;

export type AbaProps = {
  a: Assembleia;
  isOwner: boolean;
  chamar: Chamar;
  recarregar: () => Promise<void>;
};
