import { BadRequestException } from '@nestjs/common';

export const PERGUNTA_TIPOS = [
  'ESCOLHA_UNICA',
  'ESCOLHA_MULTIPLA',
  'TEXTO_CURTO',
  'TEXTO_LONGO',
  'ESCALA',
  'NUMERO',
  'DATA',
] as const;
export type PerguntaTipo = (typeof PERGUNTA_TIPOS)[number];

export const TIPOS_COM_OPCOES: PerguntaTipo[] = ['ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA'];

export interface PerguntaInput {
  enunciado: string;
  tipo: PerguntaTipo;
  opcoes?: string[] | null;
  escalaMin?: number | null;
  escalaMax?: number | null;
  obrigatoria?: boolean;
}

export interface PerguntaDef {
  id: string;
  enunciado: string;
  tipo: string;
  opcoes: unknown;
  escalaMin: number | null;
  escalaMax: number | null;
  obrigatoria: boolean;
}

/** Normaliza e valida a lista de perguntas enviada pelo editor. */
export function normalizarPerguntas(perguntas: PerguntaInput[]) {
  if (!Array.isArray(perguntas)) throw new BadRequestException('Lista de perguntas inválida.');
  return perguntas.map((p, idx) => {
    const n = idx + 1;
    const enunciado = String(p?.enunciado ?? '').trim();
    if (!enunciado) throw new BadRequestException(`Pergunta ${n}: escreva o enunciado.`);
    if (!PERGUNTA_TIPOS.includes(p.tipo)) throw new BadRequestException(`Pergunta ${n}: tipo inválido.`);

    let opcoes: string[] | null = null;
    if (TIPOS_COM_OPCOES.includes(p.tipo)) {
      opcoes = Array.from(
        new Set((Array.isArray(p.opcoes) ? p.opcoes : []).map((o) => String(o ?? '').trim()).filter(Boolean)),
      );
      if (opcoes.length < 2) throw new BadRequestException(`Pergunta ${n}: informe pelo menos 2 opções.`);
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

    return {
      ordem: n,
      enunciado,
      tipo: p.tipo,
      opcoes: opcoes ?? undefined,
      escalaMin,
      escalaMax,
      obrigatoria: p.obrigatoria !== false,
    };
  });
}

export interface RespostaNormalizada {
  perguntaId: string;
  valorTexto: string | null;
  valorNumero: number | null;
  valorData: Date | null;
  valorOpcoes: string[];
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida a resposta de uma pergunta. Retorna `null` quando a pergunta foi
 * deixada em branco (permitido só se não for obrigatória).
 */
export function validarResposta(p: PerguntaDef, valor: unknown, n: number): RespostaNormalizada | null {
  const vazio =
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '') ||
    (Array.isArray(valor) && valor.length === 0);
  if (vazio) {
    if (p.obrigatoria) throw new BadRequestException(`Responda a pergunta ${n}.`);
    return null;
  }

  const base: RespostaNormalizada = {
    perguntaId: p.id,
    valorTexto: null,
    valorNumero: null,
    valorData: null,
    valorOpcoes: [],
  };
  const opcoes = Array.isArray(p.opcoes) ? (p.opcoes as string[]) : [];

  switch (p.tipo) {
    case 'ESCOLHA_UNICA': {
      if (typeof valor !== 'string' || !opcoes.includes(valor)) {
        throw new BadRequestException(`Pergunta ${n}: escolha uma das opções.`);
      }
      return { ...base, valorOpcoes: [valor] };
    }
    case 'ESCOLHA_MULTIPLA': {
      if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !opcoes.includes(v))) {
        throw new BadRequestException(`Pergunta ${n}: escolha opções válidas.`);
      }
      return { ...base, valorOpcoes: Array.from(new Set(valor as string[])) };
    }
    case 'TEXTO_CURTO':
    case 'TEXTO_LONGO': {
      if (typeof valor !== 'string') throw new BadRequestException(`Pergunta ${n}: resposta inválida.`);
      const limite = p.tipo === 'TEXTO_CURTO' ? 500 : 5000;
      const texto = valor.trim();
      if (texto.length > limite) {
        throw new BadRequestException(`Pergunta ${n}: resposta muito longa (máximo ${limite} caracteres).`);
      }
      return { ...base, valorTexto: texto };
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
    case 'NUMERO': {
      const num = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
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
export type SituacaoEnvio = 'AGENDADO' | 'AGUARDANDO_ENVIO' | 'FALHA' | 'RECEBEU' | 'ABRIU' | 'RESPONDEU';

export function situacaoEnvio(e: {
  statusEnvio: string;
  agendadoPara?: Date | null;
  linkAbertoEm: Date | null;
  respondidoEm: Date | null;
}): SituacaoEnvio {
  if (e.respondidoEm) return 'RESPONDEU';
  if (e.statusEnvio === 'FALHA') return 'FALHA';
  if (e.statusEnvio === 'PENDENTE') {
    return e.agendadoPara && e.agendadoPara > new Date() ? 'AGENDADO' : 'AGUARDANDO_ENVIO';
  }
  if (e.linkAbertoEm) return 'ABRIU';
  return 'RECEBEU';
}

/** Texto legível de uma resposta, para relatório/CSV. */
export function respostaParaTexto(
  tipo: string,
  r: { valorTexto: string | null; valorNumero: number | null; valorData: Date | null; valorOpcoes: string[] },
): string {
  switch (tipo) {
    case 'ESCOLHA_UNICA':
    case 'ESCOLHA_MULTIPLA':
      return r.valorOpcoes.join(', ');
    case 'ESCALA':
    case 'NUMERO':
      return r.valorNumero === null ? '' : String(r.valorNumero).replace('.', ',');
    case 'DATA':
      return r.valorData ? r.valorData.toISOString().slice(0, 10).split('-').reverse().join('/') : '';
    default:
      return r.valorTexto ?? '';
  }
}
