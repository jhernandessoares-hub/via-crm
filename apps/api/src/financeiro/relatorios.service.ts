import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinCadastrosService } from './cadastros.service';
import { FinRecorrenciasService } from './recorrencias.service';
import {
  finSerialize,
  formatDateOnly,
  parseCompetencia,
  parseDateOnly,
  roundMoney,
  sumMoney,
} from './fin-shared.util';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FinRelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastros: FinCadastrosService,
    private readonly recorrencias: FinRecorrenciasService,
  ) {}

  private hoje(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // ---------- Dashboard ----------

  async dashboard(mes?: string, adminId?: string) {
    // Geração automática das mensalidades da competência corrente (idempotente, nunca quebra o GET)
    await this.recorrencias.gerarCompetenciaCorrenteSilencioso(adminId);

    const hoje = this.hoje();
    const comp = mes ? parseCompetencia(mes) : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    const fimMes = new Date(Date.UTC(comp.getUTCFullYear(), comp.getUTCMonth() + 1, 0));

    // Títulos com vencimento no mês (não cancelados) — saldo restante por tipo
    const entriesMes = await this.prisma.finEntry.findMany({
      where: { status: { not: 'CANCELADO' }, vencimento: { gte: comp, lte: fimMes } },
      select: { tipo: true, valor: true, payments: { select: { valor: true } } },
    });
    let aReceberMes = 0;
    let aPagarMes = 0;
    for (const e of entriesMes) {
      const saldo = roundMoney(e.valor.toNumber() - sumMoney(e.payments.map((p) => p.valor)));
      if (e.tipo === 'RECEBER') aReceberMes += saldo;
      else aPagarMes += saldo;
    }

    // Vencidos (qualquer período)
    const vencidos = await this.prisma.finEntry.findMany({
      where: { status: { in: ['ABERTO', 'PARCIAL'] }, vencimento: { lt: hoje } },
      select: { tipo: true, valor: true, payments: { select: { valor: true } } },
    });
    let vencidosReceber = 0;
    let vencidosPagar = 0;
    for (const e of vencidos) {
      const saldo = roundMoney(e.valor.toNumber() - sumMoney(e.payments.map((p) => p.valor)));
      if (e.tipo === 'RECEBER') vencidosReceber += saldo;
      else vencidosPagar += saldo;
    }

    // Realizado no mês (baixas)
    const paymentsMes = await this.prisma.finPayment.findMany({
      where: { dataPagamento: { gte: comp, lte: fimMes } },
      select: { valor: true, entry: { select: { tipo: true } } },
    });
    const recebidoMes = sumMoney(paymentsMes.filter((p) => p.entry.tipo === 'RECEBER').map((p) => p.valor));
    const pagoMes = sumMoney(paymentsMes.filter((p) => p.entry.tipo === 'PAGAR').map((p) => p.valor));

    // Gráfico 6 meses (realizado)
    const inicio6m = new Date(Date.UTC(comp.getUTCFullYear(), comp.getUTCMonth() - 5, 1));
    const payments6m = await this.prisma.finPayment.findMany({
      where: { dataPagamento: { gte: inicio6m, lte: fimMes } },
      select: { valor: true, dataPagamento: true, entry: { select: { tipo: true } } },
    });
    const meses6: { mes: string; receitas: number; despesas: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new Date(Date.UTC(inicio6m.getUTCFullYear(), inicio6m.getUTCMonth() + i, 1));
      meses6.push({ mes: formatDateOnly(m).slice(0, 7), receitas: 0, despesas: 0 });
    }
    for (const p of payments6m) {
      const key = formatDateOnly(p.dataPagamento).slice(0, 7);
      const bucket = meses6.find((b) => b.mes === key);
      if (!bucket) continue;
      if (p.entry.tipo === 'RECEBER') bucket.receitas = roundMoney(bucket.receitas + p.valor.toNumber());
      else bucket.despesas = roundMoney(bucket.despesas + p.valor.toNumber());
    }

    // Projeção de saldo 30 dias
    const saldoContas = await this.cadastros.saldoConsolidado();
    const fim30 = new Date(hoje.getTime() + 30 * DAY_MS);
    const projecao = await this.serieProjetada(hoje, fim30, saldoContas);

    // Próximos vencimentos (7 dias)
    const fim7 = new Date(hoje.getTime() + 7 * DAY_MS);
    const proximos = await this.prisma.finEntry.findMany({
      where: { status: { in: ['ABERTO', 'PARCIAL'] }, vencimento: { gte: hoje, lte: fim7 } },
      orderBy: { vencimento: 'asc' },
      take: 10,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        vencimento: true,
        valor: true,
        payments: { select: { valor: true } },
        contact: { select: { nome: true } },
      },
    });

    const mensalidades = await this.recorrencias.status();

    return {
      mes: formatDateOnly(comp).slice(0, 7),
      kpis: {
        aReceberMes: roundMoney(aReceberMes),
        aPagarMes: roundMoney(aPagarMes),
        vencidosReceber: roundMoney(vencidosReceber),
        vencidosPagar: roundMoney(vencidosPagar),
        saldoContas,
        recebidoMes,
        pagoMes,
      },
      grafico6Meses: meses6,
      projecao30Dias: projecao,
      proximosVencimentos: proximos.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        descricao: e.descricao,
        vencimento: formatDateOnly(e.vencimento),
        saldo: roundMoney(e.valor.toNumber() - sumMoney(e.payments.map((p) => p.valor))),
        contactNome: e.contact?.nome ?? null,
      })),
      mensalidades,
    };
  }

  /** Série diária de saldo projetado: saldo atual + títulos em aberto por vencimento (vencidos → hoje). */
  private async serieProjetada(de: Date, ate: Date, saldoInicial: number) {
    const abertos = await this.prisma.finEntry.findMany({
      where: { status: { in: ['ABERTO', 'PARCIAL'] }, vencimento: { lte: ate } },
      select: { tipo: true, valor: true, vencimento: true, payments: { select: { valor: true } } },
    });
    const porDia = new Map<string, number>();
    for (const e of abertos) {
      const saldo = roundMoney(e.valor.toNumber() - sumMoney(e.payments.map((p) => p.valor)));
      if (saldo <= 0) continue;
      // Vencido e não pago aparece re-datado para hoje na projeção
      const dia = e.vencimento < de ? de : e.vencimento;
      const key = formatDateOnly(dia);
      const delta = e.tipo === 'RECEBER' ? saldo : -saldo;
      porDia.set(key, roundMoney((porDia.get(key) || 0) + delta));
    }
    const serie: { data: string; saldoProjetado: number }[] = [];
    let acumulado = saldoInicial;
    for (let t = de.getTime(); t <= ate.getTime(); t += DAY_MS) {
      const key = formatDateOnly(new Date(t));
      acumulado = roundMoney(acumulado + (porDia.get(key) || 0));
      serie.push({ data: key, saldoProjetado: acumulado });
    }
    return serie;
  }

  // ---------- Fluxo de caixa ----------

  async fluxoCaixa(deStr?: string, ateStr?: string, granularidade: 'dia' | 'mes' = 'dia') {
    const hoje = this.hoje();
    const de = deStr ? parseDateOnly(deStr, 'de') : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    const ate = ateStr
      ? parseDateOnly(ateStr, 'ate')
      : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
    if (ate < de) throw new BadRequestException('Período inválido: fim antes do início');
    const dias = Math.round((ate.getTime() - de.getTime()) / DAY_MS) + 1;
    if (granularidade === 'dia' && dias > 92) {
      throw new BadRequestException('Granularidade diária limitada a 92 dias — use granularidade=mes');
    }

    // Saldo no início do período = saldo inicial das contas + baixas anteriores a "de"
    const contas = await this.prisma.finBankAccount.findMany({
      where: { ativo: true },
      select: { id: true, saldoInicial: true },
    });
    const paymentsAntes = contas.length
      ? await this.prisma.finPayment.findMany({
          where: { bankAccountId: { in: contas.map((c) => c.id) }, dataPagamento: { lt: de } },
          select: { valor: true, entry: { select: { tipo: true } } },
        })
      : [];
    let saldoInicial = sumMoney(contas.map((c) => c.saldoInicial));
    for (const p of paymentsAntes) {
      saldoInicial = roundMoney(saldoInicial + (p.entry.tipo === 'RECEBER' ? p.valor.toNumber() : -p.valor.toNumber()));
    }

    // Realizado (baixas no período)
    const payments = await this.prisma.finPayment.findMany({
      where: { dataPagamento: { gte: de, lte: ate } },
      select: { valor: true, dataPagamento: true, entry: { select: { tipo: true } } },
    });

    // Projetado (títulos em aberto por vencimento; vencidos re-datados para hoje)
    const abertos = await this.prisma.finEntry.findMany({
      where: { status: { in: ['ABERTO', 'PARCIAL'] }, vencimento: { lte: ate } },
      select: { tipo: true, valor: true, vencimento: true, payments: { select: { valor: true } } },
    });

    const bucketKey = (d: Date) =>
      granularidade === 'dia' ? formatDateOnly(d) : formatDateOnly(d).slice(0, 7);

    // Monta os buckets do período
    const buckets: {
      data: string;
      entradaRealizada: number;
      saidaRealizada: number;
      entradaPrevista: number;
      saidaPrevista: number;
      saldoAcumulado: number;
    }[] = [];
    const index = new Map<string, number>();
    if (granularidade === 'dia') {
      for (let t = de.getTime(); t <= ate.getTime(); t += DAY_MS) {
        const key = formatDateOnly(new Date(t));
        index.set(key, buckets.length);
        buckets.push({ data: key, entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0, saldoAcumulado: 0 });
      }
    } else {
      const cursor = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), 1));
      while (cursor <= ate) {
        const key = formatDateOnly(cursor).slice(0, 7);
        index.set(key, buckets.length);
        buckets.push({ data: key, entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0, saldoAcumulado: 0 });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    for (const p of payments) {
      const i = index.get(bucketKey(p.dataPagamento));
      if (i === undefined) continue;
      if (p.entry.tipo === 'RECEBER') buckets[i].entradaRealizada = roundMoney(buckets[i].entradaRealizada + p.valor.toNumber());
      else buckets[i].saidaRealizada = roundMoney(buckets[i].saidaRealizada + p.valor.toNumber());
    }

    for (const e of abertos) {
      const saldo = roundMoney(e.valor.toNumber() - sumMoney(e.payments.map((p) => p.valor)));
      if (saldo <= 0) continue;
      let dia = e.vencimento < hoje ? hoje : e.vencimento; // vencido → projeta em "hoje"
      if (dia < de) dia = de;
      if (dia > ate) continue;
      const i = index.get(bucketKey(dia));
      if (i === undefined) continue;
      if (e.tipo === 'RECEBER') buckets[i].entradaPrevista = roundMoney(buckets[i].entradaPrevista + saldo);
      else buckets[i].saidaPrevista = roundMoney(buckets[i].saidaPrevista + saldo);
    }

    let acumulado = saldoInicial;
    for (const b of buckets) {
      acumulado = roundMoney(acumulado + b.entradaRealizada - b.saidaRealizada + b.entradaPrevista - b.saidaPrevista);
      b.saldoAcumulado = acumulado;
    }

    return { de: formatDateOnly(de), ate: formatDateOnly(ate), granularidade, saldoInicial, serie: buckets };
  }

  // ---------- DRE (regime de competência) ----------

  async dre(deStr?: string, ateStr?: string) {
    const hoje = this.hoje();
    const de = deStr ? parseCompetencia(deStr) : new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1));
    const ateComp = ateStr ? parseCompetencia(ateStr) : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    const ate = new Date(Date.UTC(ateComp.getUTCFullYear(), ateComp.getUTCMonth() + 1, 0));
    if (ate < de) throw new BadRequestException('Período inválido: fim antes do início');

    const linhas = await this.prisma.$queryRaw<
      { mes: string; categoriaId: string; total: number }[]
    >(Prisma.sql`
      SELECT to_char(date_trunc('month', "competencia"), 'YYYY-MM') AS mes,
             "categoriaId",
             SUM("valor")::float8 AS total
      FROM "fin_entries"
      WHERE "status" <> 'CANCELADO'
        AND "competencia" >= ${de}
        AND "competencia" <= ${ate}
      GROUP BY 1, 2
    `);

    // Lista de meses do intervalo
    const meses: string[] = [];
    const cursor = new Date(de);
    while (cursor <= ateComp) {
      meses.push(formatDateOnly(cursor).slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    // Árvore de categorias (inclui inativas — podem ter histórico)
    const categorias = await this.prisma.finCategory.findMany({
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { nome: 'asc' }],
    });
    const porId = new Map(categorias.map((c) => [c.id, c]));

    // valores[categoriaId][mes] = total
    const valores = new Map<string, Map<string, number>>();
    for (const l of linhas) {
      if (!valores.has(l.categoriaId)) valores.set(l.categoriaId, new Map());
      valores.get(l.categoriaId)!.set(l.mes, roundMoney(l.total));
    }

    const grupos = categorias
      .filter((c) => !c.parentId)
      .map((grupo) => {
        const filhas = categorias.filter((c) => c.parentId === grupo.id);
        const linhasFilhas = filhas
          .map((f) => {
            const porMes = valores.get(f.id) || new Map<string, number>();
            const vals = meses.map((m) => porMes.get(m) || 0);
            return { id: f.id, nome: f.nome, valores: vals, total: roundMoney(vals.reduce((a, b) => a + b, 0)) };
          })
          .filter((f) => f.total !== 0);
        const subtotal = meses.map((_, i) => roundMoney(linhasFilhas.reduce((acc, f) => acc + f.valores[i], 0)));
        return {
          id: grupo.id,
          nome: grupo.nome,
          tipo: grupo.tipo,
          categorias: linhasFilhas,
          subtotal,
          total: roundMoney(subtotal.reduce((a, b) => a + b, 0)),
        };
      })
      .filter((g) => g.categorias.length > 0);

    const receitas = meses.map((_, i) =>
      roundMoney(grupos.filter((g) => g.tipo === 'RECEITA').reduce((acc, g) => acc + g.subtotal[i], 0)),
    );
    const despesas = meses.map((_, i) =>
      roundMoney(grupos.filter((g) => g.tipo === 'DESPESA').reduce((acc, g) => acc + g.subtotal[i], 0)),
    );
    const resultado = meses.map((_, i) => roundMoney(receitas[i] - despesas[i]));
    let acc = 0;
    const resultadoAcumulado = resultado.map((r) => (acc = roundMoney(acc + r)));

    // categorias sem grupo não deveriam existir; ignora silenciosamente se porId falhar
    void porId;

    return {
      meses,
      grupos,
      receitas,
      despesas,
      resultado,
      resultadoAcumulado,
      totais: {
        receitas: roundMoney(receitas.reduce((a, b) => a + b, 0)),
        despesas: roundMoney(despesas.reduce((a, b) => a + b, 0)),
        resultado: roundMoney(resultado.reduce((a, b) => a + b, 0)),
      },
    };
  }

  // ---------- Balancete gerencial ----------

  async balancete(deStr?: string, ateStr?: string) {
    const hoje = this.hoje();
    const de = deStr ? parseDateOnly(deStr, 'de') : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
    const ate = ateStr
      ? parseDateOnly(ateStr, 'ate')
      : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
    if (ate < de) throw new BadRequestException('Período inválido: fim antes do início');

    // Previsto: títulos por competência no período (não cancelados) + suas baixas (qualquer data)
    const entries = await this.prisma.finEntry.findMany({
      where: { status: { not: 'CANCELADO' }, competencia: { gte: de, lte: ate } },
      select: { categoriaId: true, valor: true, payments: { select: { valor: true } } },
    });

    // Realizado: baixas com dataPagamento no período (independente da competência do título)
    const realizadoRaw = await this.prisma.$queryRaw<{ categoriaId: string; total: number }[]>(Prisma.sql`
      SELECT e."categoriaId", SUM(p."valor")::float8 AS total
      FROM "fin_payments" p
      JOIN "fin_entries" e ON e."id" = p."entryId"
      WHERE p."dataPagamento" >= ${de} AND p."dataPagamento" <= ${ate}
        AND e."status" <> 'CANCELADO'
      GROUP BY 1
    `);
    const realizadoPorCat = new Map(realizadoRaw.map((r) => [r.categoriaId, roundMoney(r.total)]));

    const previstoPorCat = new Map<string, number>();
    const abertoPorCat = new Map<string, number>();
    for (const e of entries) {
      const pago = sumMoney(e.payments.map((p) => p.valor));
      previstoPorCat.set(e.categoriaId, roundMoney((previstoPorCat.get(e.categoriaId) || 0) + e.valor.toNumber()));
      abertoPorCat.set(
        e.categoriaId,
        roundMoney((abertoPorCat.get(e.categoriaId) || 0) + Math.max(0, e.valor.toNumber() - pago)),
      );
    }

    const categorias = await this.prisma.finCategory.findMany({
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { nome: 'asc' }],
    });

    const catIds = new Set([...previstoPorCat.keys(), ...realizadoPorCat.keys()]);
    const grupos = categorias
      .filter((c) => !c.parentId)
      .map((grupo) => {
        const filhas = categorias
          .filter((c) => c.parentId === grupo.id && catIds.has(c.id))
          .map((f) => {
            const previsto = previstoPorCat.get(f.id) || 0;
            const realizado = realizadoPorCat.get(f.id) || 0;
            const emAberto = abertoPorCat.get(f.id) || 0;
            return {
              id: f.id,
              nome: f.nome,
              previsto,
              realizado,
              emAberto,
              percentual: previsto > 0 ? Math.round((realizado / previsto) * 100) : null,
            };
          });
        const previsto = roundMoney(filhas.reduce((a, f) => a + f.previsto, 0));
        const realizado = roundMoney(filhas.reduce((a, f) => a + f.realizado, 0));
        const emAberto = roundMoney(filhas.reduce((a, f) => a + f.emAberto, 0));
        return {
          id: grupo.id,
          nome: grupo.nome,
          tipo: grupo.tipo,
          categorias: filhas,
          previsto,
          realizado,
          emAberto,
          percentual: previsto > 0 ? Math.round((realizado / previsto) * 100) : null,
        };
      })
      .filter((g) => g.categorias.length > 0);

    return finSerialize({ de: formatDateOnly(de), ate: formatDateOnly(ate), grupos });
  }
}
