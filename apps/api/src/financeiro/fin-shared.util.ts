import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Campos de data de negócio (@db.Date) — trafegam como "YYYY-MM-DD" na API.
// Timestamps (createdAt/updatedAt) permanecem ISO completo.
const DATE_ONLY_FIELDS = new Set([
  'competencia',
  'vencimento',
  'dataPagamento',
  'dataEmissao',
  'data',
  'saldoInicialData',
]);

/** "YYYY-MM-DD" → Date UTC meia-noite (evita deslocamento UTC-3). */
export function parseDateOnly(s: string, field = 'data'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) {
    throw new BadRequestException(`Campo ${field} inválido — use o formato YYYY-MM-DD`);
  }
  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) {
    throw new BadRequestException(`Campo ${field} inválido — data inexistente`);
  }
  return d;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM" ou "YYYY-MM-DD" → Date UTC do dia 1 do mês (competência). */
export function parseCompetencia(s: string): Date {
  const m = (s || '').match(/^(\d{4})-(\d{2})/);
  if (!m) throw new BadRequestException('Competência inválida — use o formato YYYY-MM');
  return parseDateOnly(`${m[1]}-${m[2]}-01`, 'competencia');
}

/** Competência corrente ("YYYY-MM-01") em UTC. */
export function currentCompetencia(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Soma meses preservando o dia, com clamp para o último dia do mês destino. */
export function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + months;
  const day = base.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

/** Dia do mês com clamp (ex.: dia 31 em fevereiro → 28/29). */
export function dayInMonthClamped(competencia: Date, dia: number): Date {
  const y = competencia.getUTCFullYear();
  const m = competencia.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(Math.max(dia, 1), lastDay)));
}

/** Arredonda para 2 casas (valores chegam como number do frontend). */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function assertPositiveMoney(n: unknown, field: string): number {
  const v = typeof n === 'string' ? Number(n) : (n as number);
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
    throw new BadRequestException(`Campo ${field} deve ser um valor maior que zero`);
  }
  return roundMoney(v);
}

/**
 * Serializa recursivamente para a borda da API:
 * Prisma.Decimal → number; Date → "YYYY-MM-DD" (campos de negócio) ou ISO (timestamps).
 */
export function finSerialize(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => finSerialize(v));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v instanceof Date) {
        out[k] = DATE_ONLY_FIELDS.has(k) ? formatDateOnly(v) : v.toISOString();
      } else {
        out[k] = finSerialize(v);
      }
    }
    return out;
  }
  return value;
}

/** Soma de decimais (Prisma.Decimal | number) como number arredondado. */
export function sumMoney(values: Array<Prisma.Decimal | number>): number {
  return roundMoney(
    values.reduce<number>((acc, v) => acc + (v instanceof Prisma.Decimal ? v.toNumber() : v), 0),
  );
}

/**
 * Quanto de baixas quita o título (não é caixa real — ver FinPayment no schema).
 * = soma(valor) + soma(desconto) - soma(jurosMulta).
 * Usar para status/saldo do título. Para caixa real (saldo bancário, fluxo de caixa
 * realizado), somar `valor` puro com sumMoney — nunca esta função.
 */
export function sumAmortizado(
  payments: Array<{ valor: Prisma.Decimal | number; desconto: Prisma.Decimal | number; jurosMulta: Prisma.Decimal | number }>,
): number {
  const toNum = (v: Prisma.Decimal | number) => (v instanceof Prisma.Decimal ? v.toNumber() : v);
  return roundMoney(payments.reduce((acc, p) => acc + toNum(p.valor) + toNum(p.desconto) - toNum(p.jurosMulta), 0));
}
