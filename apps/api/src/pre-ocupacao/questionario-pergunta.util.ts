import { BadRequestException } from '@nestjs/common';
import { CampoConfig, OpcaoConfig, PerguntaConfig, opcoesDe } from './questionario-fluxo';

export const PERGUNTA_TIPOS = [
  'INFO',
  'ACEITE',
  'CPF',
  'ESCOLHA_UNICA',
  'ESCOLHA_MULTIPLA',
  'TEXTO_CURTO',
  'TEXTO_LONGO',
  'ESCALA',
  'NUMERO',
  'CONTADOR',
  'MOEDA',
  'TELEFONE',
  'DATA',
  'CAMPOS',
] as const;
export type PerguntaTipo = (typeof PERGUNTA_TIPOS)[number];

export const TIPOS_COM_OPCOES: PerguntaTipo[] = ['ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA'];

export interface PerguntaInput {
  enunciado: string;
  tipo: PerguntaTipo;
  opcoes?: (string | OpcaoConfig)[] | null;
  escalaMin?: number | null;
  escalaMax?: number | null;
  obrigatoria?: boolean;
  chave?: string | null;
  config?: PerguntaConfig | null;
}

export interface PerguntaDef {
  id: string;
  enunciado: string;
  tipo: string;
  opcoes: unknown;
  escalaMin: number | null;
  escalaMax: number | null;
  obrigatoria: boolean;
  config?: unknown;
}

/** Normaliza e valida a lista de perguntas (editor ou script de carga). */
export function normalizarPerguntas(perguntas: PerguntaInput[]) {
  if (!Array.isArray(perguntas)) throw new BadRequestException('Lista de perguntas inválida.');
  const chaves = new Set<string>();
  return perguntas.map((p, idx) => {
    const n = idx + 1;
    const enunciado = String(p?.enunciado ?? '').trim();
    if (!enunciado) throw new BadRequestException(`Pergunta ${n}: escreva o enunciado.`);
    if (!PERGUNTA_TIPOS.includes(p.tipo)) throw new BadRequestException(`Pergunta ${n}: tipo inválido.`);

    const chave = p.chave ? String(p.chave).trim() : null;
    if (chave) {
      if (chaves.has(chave)) throw new BadRequestException(`Pergunta ${n}: identificador "${chave}" repetido.`);
      chaves.add(chave);
    }

    let opcoes: OpcaoConfig[] | null = null;
    // Opções montadas com os nomes dos moradores não têm lista fixa
    const dinamica = !!p.config?.opcoesDinamicas;
    if ((TIPOS_COM_OPCOES.includes(p.tipo) || p.tipo === 'ACEITE') && !dinamica) {
      const vistos = new Set<string>();
      opcoes = (Array.isArray(p.opcoes) ? p.opcoes : [])
        .map((o) => (typeof o === 'string' ? { label: o } : { ...o, label: String(o?.label ?? '') }))
        .map((o) => ({ ...o, label: o.label.trim() }))
        .filter((o) => o.label && !vistos.has(o.label) && vistos.add(o.label));
      const minimo = p.tipo === 'ACEITE' ? 1 : 2;
      if (opcoes.length < minimo) throw new BadRequestException(`Pergunta ${n}: informe pelo menos ${minimo} opções.`);
    }

    let escalaMin: number | null = null;
    let escalaMax: number | null = null;
    if (p.tipo === 'ESCALA') {
      escalaMin = Number.isInteger(p.escalaMin) ? (p.escalaMin as number) : 1;
      escalaMax = Number.isInteger(p.escalaMax) ? (p.escalaMax as number) : 5;
      if (escalaMin < 0 || escalaMax > 10 || escalaMin >= escalaMax) {
        throw new BadRequestException(`Pergunta ${n}: escala precisa estar entre 0 e 10, com mínimo menor que máximo.`);
      }
    }

    if (p.tipo === 'CAMPOS' && !(p.config?.campos?.length)) {
      throw new BadRequestException(`Pergunta ${n}: informe os campos.`);
    }

    // Opções simples (só texto) continuam gravadas como lista de textos
    const opcoesGravar = opcoes
      ? opcoes.every((o) => Object.keys(o).length === 1)
        ? opcoes.map((o) => o.label)
        : opcoes
      : undefined;

    return {
      ordem: n,
      enunciado,
      tipo: p.tipo,
      opcoes: opcoesGravar,
      escalaMin,
      escalaMax,
      obrigatoria: p.tipo === 'INFO' ? false : p.obrigatoria !== false,
      chave,
      config: p.config ?? undefined,
    };
  });
}

export interface RespostaNormalizada {
  perguntaId: string;
  valorTexto: string | null;
  valorNumero: number | null;
  valorData: Date | null;
  valorOpcoes: string[];
  extras: Record<string, string | number> | null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** CPF com 11 dígitos e dígitos verificadores corretos. */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

function paraNumero(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  // "1.234,56" (BR) ou "1234.56"
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normal);
}

function texto(v: unknown, limite: number, n: number): string {
  if (typeof v !== 'string') throw new BadRequestException(`Pergunta ${n}: resposta inválida.`);
  const t = v.trim();
  if (t.length > limite) throw new BadRequestException(`Pergunta ${n}: resposta muito longa (máximo ${limite} caracteres).`);
  return t;
}

/**
 * Valida o valor de uma pergunta (uma tela). Retorna `null` quando está em
 * branco — a obrigatoriedade é conferida só na conclusão, com o fluxo inteiro
 * (uma pergunta pode ter sumido por condição).
 */
export function validarValor(p: PerguntaDef, valor: unknown, extrasIn: unknown, n: number): RespostaNormalizada | null {
  const base: RespostaNormalizada = {
    perguntaId: p.id,
    valorTexto: null,
    valorNumero: null,
    valorData: null,
    valorOpcoes: [],
    extras: null,
  };
  const extrasObj = (extrasIn && typeof extrasIn === 'object' && !Array.isArray(extrasIn) ? extrasIn : {}) as Record<string, unknown>;

  if (p.tipo === 'INFO') return null;

  if (p.tipo === 'CAMPOS') {
    const campos = ((p.config as PerguntaConfig | undefined)?.campos ?? []) as CampoConfig[];
    const extras: Record<string, string | number> = {};
    for (const c of campos) {
      const v = extrasObj[c.chave];
      if (v === undefined || v === null || v === '') continue;
      if (c.tipo === 'CONTADOR') {
        const num = paraNumero(v);
        if (!Number.isInteger(num) || num < 0 || num > 999) throw new BadRequestException(`Pergunta ${n}: "${c.label}" inválido.`);
        extras[c.chave] = num;
      } else {
        extras[c.chave] = texto(v, 200, n);
      }
    }
    return Object.keys(extras).length ? { ...base, extras } : null;
  }

  const vazio =
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '') ||
    (Array.isArray(valor) && valor.length === 0);
  if (vazio) return null;

  const cfg = (p.config ?? {}) as PerguntaConfig;
  const opcoes = opcoesDe(p);
  const labels = opcoes.map((o) => o.label);

  /** Complementos ("Qual?", "Quem?", R$) só das opções marcadas que pedem complemento. */
  const complementos = (marcadas: string[]) => {
    const extras: Record<string, string | number> = {};
    for (const o of opcoes) {
      if (!o.complemento || !marcadas.includes(o.label)) continue;
      const v = extrasObj[o.label];
      if (v === undefined || v === null || v === '') {
        if (o.complementoOpcional) continue;
        const oque = o.complemento === 'VALOR' ? 'o valor' : `"${o.rotuloComplemento ?? 'Qual?'}"`;
        throw new BadRequestException(`Informe ${oque} de "${o.label}".`);
      }
      if (o.complemento === 'VALOR') {
        const num = paraNumero(v);
        if (!Number.isFinite(num) || num < 0) throw new BadRequestException(`Pergunta ${n}: valor de "${o.label}" inválido.`);
        extras[o.label] = Math.round(num * 100) / 100;
      } else {
        extras[o.label] = texto(v, 300, n);
      }
    }
    return Object.keys(extras).length ? extras : null;
  };

  switch (p.tipo) {
    case 'ESCOLHA_UNICA': {
      if (typeof valor !== 'string' || !labels.includes(valor)) {
        throw new BadRequestException(`Pergunta ${n}: escolha uma das opções.`);
      }
      return { ...base, valorOpcoes: [valor], extras: complementos([valor]) };
    }
    case 'ESCOLHA_MULTIPLA':
    case 'ACEITE': {
      if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !labels.includes(v))) {
        throw new BadRequestException(`Pergunta ${n}: escolha opções válidas.`);
      }
      let marcadas = Array.from(new Set(valor as string[]));
      const exclusiva = opcoes.find((o) => o.exclusiva && marcadas.includes(o.label));
      if (exclusiva && marcadas.length > 1) marcadas = [exclusiva.label];
      return { ...base, valorOpcoes: marcadas, extras: complementos(marcadas) };
    }
    case 'TEXTO_CURTO':
      return { ...base, valorTexto: texto(valor, 500, n) };
    case 'TEXTO_LONGO':
      return { ...base, valorTexto: texto(valor, 5000, n) };
    case 'CPF': {
      // Dígitos verificadores são conferidos junto com o cadastro (questionario-publico.service)
      const digitos = String(valor).replace(/\D/g, '');
      if (digitos.length !== 11) throw new BadRequestException('Digite os 11 números do CPF.');
      return { ...base, valorTexto: digitos };
    }
    case 'TELEFONE': {
      const digitos = String(valor).replace(/\D/g, '');
      if (digitos.length < 10 || digitos.length > 13) throw new BadRequestException(`Pergunta ${n}: telefone inválido.`);
      return { ...base, valorTexto: digitos };
    }
    case 'ESCALA': {
      const num = Number(valor);
      const min = p.escalaMin ?? 1;
      const max = p.escalaMax ?? 5;
      if (!Number.isInteger(num) || num < min || num > max) {
        throw new BadRequestException(`Pergunta ${n}: escolha uma nota de ${min} a ${max}.`);
      }
      return { ...base, valorNumero: num };
    }
    case 'CONTADOR': {
      const num = paraNumero(valor);
      const min = cfg.min ?? 0;
      const max = cfg.max ?? 999;
      if (!Number.isInteger(num) || num < min || num > max) {
        throw new BadRequestException(`Pergunta ${n}: informe um número de ${min} a ${max}.`);
      }
      return { ...base, valorNumero: num };
    }
    case 'MOEDA': {
      const num = paraNumero(valor);
      if (!Number.isFinite(num) || num < 0 || num > 10_000_000) throw new BadRequestException(`Pergunta ${n}: valor inválido.`);
      return { ...base, valorNumero: Math.round(num * 100) / 100 };
    }
    case 'NUMERO': {
      const num = paraNumero(valor);
      if (!Number.isFinite(num)) throw new BadRequestException(`Pergunta ${n}: informe um número.`);
      return { ...base, valorNumero: num };
    }
    case 'DATA': {
      if (typeof valor !== 'string' || !DATA_RE.test(valor)) {
        throw new BadRequestException(`Pergunta ${n}: informe uma data válida.`);
      }
      const d = new Date(`${valor}T12:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
        throw new BadRequestException(`Pergunta ${n}: informe uma data válida.`);
      }
      return { ...base, valorData: d };
    }
    default:
      throw new BadRequestException(`Pergunta ${n}: tipo não suportado.`);
  }
}

/** Situação da família em relação a um questionário (calculada, não persistida). */
export type SituacaoEnvio = 'AGENDADO' | 'AGUARDANDO_ENVIO' | 'FALHA' | 'RECEBEU' | 'ABRIU' | 'RESPONDENDO' | 'RESPONDEU';

export function situacaoEnvio(e: {
  statusEnvio: string;
  agendadoPara?: Date | null;
  linkAbertoEm: Date | null;
  iniciadoEm?: Date | null;
  respondidoEm: Date | null;
}): SituacaoEnvio {
  if (e.respondidoEm) return 'RESPONDEU';
  if (e.statusEnvio === 'FALHA') return 'FALHA';
  if (e.statusEnvio === 'PENDENTE') {
    return e.agendadoPara && e.agendadoPara > new Date() ? 'AGENDADO' : 'AGUARDANDO_ENVIO';
  }
  if (e.iniciadoEm) return 'RESPONDENDO';
  if (e.linkAbertoEm) return 'ABRIU';
  return 'RECEBEU';
}

/** Troca {{pessoa}}, {{ordem}}, {{nome}} e {{telefone}} no texto da pergunta. */
export function preencherTexto(
  texto: string,
  v: { pessoa?: string | null; instancia?: number; nome?: string | null; telefone?: string | null } = {},
): string {
  const tel = String(v.telefone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const telFmt = tel.length >= 10 ? `(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}` : 'o telefone cadastrado';
  const out = texto
    // Sem pessoa definida (relatório geral): marcador neutro
    .replace(/\{\{pessoa\}\}/gi, v.pessoa ?? '[pessoa]')
    .replace(/\{\{ordem\}\}/gi, v.instancia !== undefined ? `${v.instancia + 1}ª` : '[nº]')
    .replace(/\{\{nome\}\}/gi, v.nome ?? '')
    .replace(/\{\{telefone\}\}/gi, telFmt)
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** "1 anos" → "1 ano": unidade no singular quando o valor é 1. */
const SINGULAR: Record<string, string> = {
  anos: 'ano',
  minutos: 'minuto',
  pessoas: 'pessoa',
  moradores: 'morador',
  estudantes: 'estudante',
  'vezes por semana': 'vez por semana',
};
function comUnidade(valor: number, unidade?: string): string {
  const n = String(valor).replace('.', ',');
  if (!unidade) return n;
  return `${n} ${valor === 1 ? SINGULAR[unidade] ?? unidade : unidade}`;
}

export function formatarMoeda(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Texto legível de uma resposta, para relatório/CSV. */
export function respostaParaTexto(
  p: { tipo: string; config?: unknown },
  r: { valorTexto: string | null; valorNumero: number | null; valorData: Date | null; valorOpcoes: string[]; extras?: unknown },
): string {
  const extras = (r.extras && typeof r.extras === 'object' ? r.extras : {}) as Record<string, string | number>;
  switch (p.tipo) {
    case 'ESCOLHA_UNICA':
    case 'ESCOLHA_MULTIPLA':
    case 'ACEITE':
      return r.valorOpcoes
        .map((o) => {
          const c = extras[o];
          if (c === undefined || c === '') return o;
          return `${o} (${typeof c === 'number' ? formatarMoeda(c) : c})`;
        })
        .join(', ');
    case 'MOEDA':
      return r.valorNumero === null ? '' : formatarMoeda(r.valorNumero);
    case 'ESCALA':
    case 'NUMERO':
    case 'CONTADOR': {
      if (r.valorNumero === null) return '';
      const cfgN = (p.config ?? {}) as PerguntaConfig;
      if (r.valorNumero === 0 && cfgN.rotuloZero) return cfgN.rotuloZero;
      return comUnidade(r.valorNumero, cfgN.unidade);
    }
    case 'CPF':
      return r.valorTexto ? formatarCpf(r.valorTexto) : '';
    case 'DATA':
      return r.valorData ? r.valorData.toISOString().slice(0, 10).split('-').reverse().join('/') : '';
    case 'CAMPOS': {
      const campos = (((p.config ?? {}) as PerguntaConfig).campos ?? []) as CampoConfig[];
      return campos
        .filter((c) => extras[c.chave] !== undefined && extras[c.chave] !== '')
        .map((c) => `${c.label}: ${extras[c.chave]}`)
        .join(' · ');
    }
    default:
      return r.valorTexto ?? '';
  }
}
