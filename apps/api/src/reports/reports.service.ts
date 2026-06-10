import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissions } from '../tenants/permissions.config';

type Bucket = { qtd: number; valor: number };
const emptyBucket = (): Bucket => ({ qtd: 0, valor: 0 });

/**
 * Relatórios gerenciais de vendas — consolida vendas de empreendimentos
 * (DevelopmentUnit) e de imóveis avulsos (Lead com dataVenda).
 *
 * Regra de período:
 *  - Vendido / financeiro / mensal / corretor → filtrados por período (soldAt / dataVenda).
 *  - Demais status do espelho (Disponível/Proposta/Reservado/Bloqueado) e VSO → snapshot atual.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante que o usuário pode ver relatórios (OWNER bypassa; demais via permissionsConfig). */
  private async assertCanView(tenantId: string, role: string) {
    if (role === 'OWNER') return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const perms = resolvePermissions(tenant?.permissionsConfig as Record<string, any> | null);
    const roleKey = String(role).toLowerCase();
    const allowed = perms?.[roleKey as 'manager' | 'agent' | 'partner']?.relatorios?.view ?? false;
    if (!allowed) throw new ForbiddenException('Sem permissão para ver relatórios gerenciais.');
  }

  private inPeriod(d: Date | null | undefined, from: Date | null, to: Date | null): boolean {
    if (!d) return false;
    const x = new Date(d);
    if (from && x < from) return false;
    if (to && x > to) return false;
    return true;
  }

  /** Nome de exibição do corretor (apelido ?? nome) por id. */
  private async buildUserMap(tenantId: string, userIds: (string | null | undefined)[]) {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, nome: true, apelido: true },
    });
    for (const u of users) map.set(u.id, u.apelido || u.nome);
    return map;
  }

  // ── Relatório resumo ────────────────────────────────────────────────────────
  async vendasReport(tenantId: string, role: string, fromISO?: string, toISO?: string) {
    await this.assertCanView(tenantId, role);
    const from = fromISO ? new Date(fromISO) : null;
    const to = toISO ? new Date(toISO) : null;

    const units = await this.prisma.developmentUnit.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true,
        status: true,
        valorVenda: true,
        finalPrice: true,
        soldAt: true,
        leadId: true,
        development: { select: { id: true, nome: true } },
        lead: { select: { id: true, assignedUserId: true } },
      },
    });

    // Vendas avulsas no período (leads sem unidade de empreendimento)
    const avulsos = await this.prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dataVenda: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
        developmentUnits: { none: {} },
      },
      select: { id: true, valorVenda: true, dataVenda: true, assignedUserId: true, produtoInteresseId: true },
    });

    // Preço de tabela de fallback para avulsos sem valorVenda
    const prodIds = Array.from(
      new Set(avulsos.filter((a) => a.valorVenda == null && a.produtoInteresseId).map((a) => a.produtoInteresseId as string)),
    );
    const prodPrice = new Map<string, number>();
    if (prodIds.length > 0) {
      const prods = await this.prisma.product.findMany({
        where: { id: { in: prodIds }, tenantId },
        select: { id: true, price: true },
      });
      for (const p of prods) prodPrice.set(p.id, p.price ? Number(p.price) : 0);
    }
    const avulsoValor = (a: (typeof avulsos)[number]): number =>
      a.valorVenda != null ? a.valorVenda : a.produtoInteresseId ? prodPrice.get(a.produtoInteresseId) ?? 0 : 0;

    // ── Espelho consolidado (empreendimentos) ──
    const espelho = {
      total: units.length,
      disponivel: emptyBucket(),
      proposta: emptyBucket(),
      reservado: emptyBucket(),
      vendido: emptyBucket(),
      bloqueado: emptyBucket(),
    };
    let vendidoSnapshotQtd = 0; // todas as vendidas (para VSO), independente do período
    for (const u of units) {
      const tabela = u.valorVenda || 0;
      switch (u.status) {
        case 'DISPONIVEL':
          espelho.disponivel.qtd++;
          espelho.disponivel.valor += tabela;
          break;
        case 'PROPOSTA':
          espelho.proposta.qtd++;
          espelho.proposta.valor += tabela;
          break;
        case 'RESERVADO':
          espelho.reservado.qtd++;
          espelho.reservado.valor += tabela;
          break;
        case 'BLOQUEADO':
          espelho.bloqueado.qtd++;
          espelho.bloqueado.valor += tabela;
          break;
        case 'VENDIDO':
          vendidoSnapshotQtd++;
          if (this.inPeriod(u.soldAt, from, to)) {
            espelho.vendido.qtd++;
            espelho.vendido.valor += u.finalPrice || u.valorVenda || 0;
          }
          break;
      }
    }
    // Avulsos vendidos no período entram no card Vendido
    for (const a of avulsos) {
      espelho.vendido.qtd++;
      espelho.vendido.valor += avulsoValor(a);
    }

    // ── Cards financeiros (período, emp + avulso) ──
    const valorVendido = espelho.vendido.valor;
    const numVendas = espelho.vendido.qtd;
    const ticketMedio = numVendas > 0 ? Math.round(valorVendido / numVendas) : 0;
    const vso =
      espelho.total > 0
        ? Math.round(((vendidoSnapshotQtd + espelho.reservado.qtd) / espelho.total) * 100)
        : 0;
    const vgvEstoque = espelho.disponivel.valor;

    // ── Evolução mensal (vendas por mês no período) ──
    const monthlyMap: Record<string, { mes: string; vendas: number; vgv: number }> = {};
    const addMonth = (date: Date | null | undefined, valor: number) => {
      if (!this.inPeriod(date, from, to)) return;
      const mes = new Date(date as Date).toISOString().slice(0, 7);
      if (!monthlyMap[mes]) monthlyMap[mes] = { mes, vendas: 0, vgv: 0 };
      monthlyMap[mes].vendas++;
      monthlyMap[mes].vgv += valor;
    };
    for (const u of units)
      if (u.status === 'VENDIDO') addMonth(u.soldAt, u.finalPrice || u.valorVenda || 0);
    for (const a of avulsos) addMonth(a.dataVenda, avulsoValor(a));
    const mensal = Object.values(monthlyMap).sort((x, y) => x.mes.localeCompare(y.mes));

    // ── Por empreendimento ──
    const devMap = new Map<
      string,
      { nome: string; totalUnidades: number; vendidasSnapshot: number; reservado: number; vendidas: number; vgvVendido: number; vgvDisponivel: number }
    >();
    for (const u of units) {
      const devId = u.development?.id ?? 'sem-empreendimento';
      const nome = u.development?.nome ?? 'Sem empreendimento';
      if (!devMap.has(devId))
        devMap.set(devId, { nome, totalUnidades: 0, vendidasSnapshot: 0, reservado: 0, vendidas: 0, vgvVendido: 0, vgvDisponivel: 0 });
      const d = devMap.get(devId)!;
      d.totalUnidades++;
      if (u.status === 'VENDIDO') {
        d.vendidasSnapshot++;
        if (this.inPeriod(u.soldAt, from, to)) {
          d.vendidas++;
          d.vgvVendido += u.finalPrice || u.valorVenda || 0;
        }
      } else if (u.status === 'RESERVADO') {
        d.reservado++;
        d.vgvDisponivel += 0;
      }
      if (u.status === 'DISPONIVEL') d.vgvDisponivel += u.valorVenda || 0;
    }
    const porEmpreendimento = Array.from(devMap.values()).map((d) => ({
      nome: d.nome,
      totalUnidades: d.totalUnidades,
      vendidas: d.vendidas,
      vsoPct: d.totalUnidades > 0 ? Math.round(((d.vendidasSnapshot + d.reservado) / d.totalUnidades) * 100) : 0,
      vgvVendido: d.vgvVendido,
      vgvDisponivel: d.vgvDisponivel,
    }));
    // Linha de imóveis avulsos (somente vendas do período)
    if (avulsos.length > 0) {
      porEmpreendimento.push({
        nome: 'Imóveis avulsos',
        totalUnidades: avulsos.length,
        vendidas: avulsos.length,
        vsoPct: 100,
        vgvVendido: avulsos.reduce((s, a) => s + avulsoValor(a), 0),
        vgvDisponivel: 0,
      });
    }
    porEmpreendimento.sort((a, b) => b.vgvVendido - a.vgvVendido);

    // ── Por corretor (vendas do período) ──
    const userMap = await this.buildUserMap(tenantId, [
      ...units.map((u) => u.lead?.assignedUserId),
      ...avulsos.map((a) => a.assignedUserId),
    ]);
    const corretorMap = new Map<string, { nome: string; vendas: number; vgv: number }>();
    const addCorretor = (userId: string | null | undefined, valor: number) => {
      const key = userId ?? '__none__';
      const nome = userId ? userMap.get(userId) ?? 'Sem responsável' : 'Sem responsável';
      if (!corretorMap.has(key)) corretorMap.set(key, { nome, vendas: 0, vgv: 0 });
      const c = corretorMap.get(key)!;
      c.vendas++;
      c.vgv += valor;
    };
    for (const u of units)
      if (u.status === 'VENDIDO' && this.inPeriod(u.soldAt, from, to))
        addCorretor(u.lead?.assignedUserId, u.finalPrice || u.valorVenda || 0);
    for (const a of avulsos) addCorretor(a.assignedUserId, avulsoValor(a));
    const porCorretor = Array.from(corretorMap.values()).sort((a, b) => b.vgv - a.vgv);

    return {
      espelho,
      carteira: { vso, vgvEstoque },
      periodo: { numVendas, valorVendido, ticketMedio },
      mensal,
      porEmpreendimento,
      porCorretor,
    };
  }

  // ── Drill-down: lista de unidades por status ────────────────────────────────
  async unidadesPorStatus(
    tenantId: string,
    role: string,
    status: string,
    fromISO?: string,
    toISO?: string,
    developmentId?: string,
  ) {
    await this.assertCanView(tenantId, role);
    const from = fromISO ? new Date(fromISO) : null;
    const to = toISO ? new Date(toISO) : null;
    const st = String(status || '').toUpperCase();

    const rows: Array<{
      unitId: string | null;
      leadId: string | null;
      empreendimento: string;
      torreUnidade: string;
      comprador: string | null;
      valor: number;
      corretor: string | null;
      data: Date | null;
    }> = [];

    const units = await this.prisma.developmentUnit.findMany({
      where: {
        tenantId,
        ativo: true,
        status: st,
        ...(developmentId ? { developmentId } : {}),
      },
      select: {
        id: true,
        nome: true,
        status: true,
        valorVenda: true,
        finalPrice: true,
        soldAt: true,
        comprador: true,
        leadId: true,
        development: { select: { nome: true } },
        tower: { select: { nome: true } },
        lead: { select: { id: true, nome: true, nomeCorreto: true, assignedUserId: true } },
      },
    });

    const userMap = await this.buildUserMap(tenantId, units.map((u) => u.lead?.assignedUserId));

    for (const u of units) {
      // Para VENDIDO, respeitar o período por soldAt
      if (st === 'VENDIDO' && !this.inPeriod(u.soldAt, from, to)) continue;
      const isSold = st === 'VENDIDO';
      rows.push({
        unitId: u.id,
        leadId: u.leadId ?? u.lead?.id ?? null,
        empreendimento: u.development?.nome ?? '—',
        torreUnidade: [u.tower?.nome, u.nome].filter(Boolean).join(' · '),
        comprador: u.comprador || u.lead?.nomeCorreto || u.lead?.nome || null,
        valor: isSold ? u.finalPrice || u.valorVenda || 0 : u.valorVenda || 0,
        corretor: u.lead?.assignedUserId ? userMap.get(u.lead.assignedUserId) ?? null : null,
        data: isSold ? u.soldAt : null,
      });
    }

    // Avulsos vendidos no período entram na lista de VENDIDO (sem filtro de empreendimento)
    if (st === 'VENDIDO' && !developmentId) {
      const avulsos = await this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dataVenda: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
          developmentUnits: { none: {} },
        },
        select: { id: true, nome: true, nomeCorreto: true, valorVenda: true, dataVenda: true, assignedUserId: true, produtoInteresseId: true },
      });
      const prodIds = Array.from(
        new Set(avulsos.filter((a) => a.valorVenda == null && a.produtoInteresseId).map((a) => a.produtoInteresseId as string)),
      );
      const prodInfo = new Map<string, { price: number; title: string }>();
      if (prodIds.length > 0) {
        const prods = await this.prisma.product.findMany({
          where: { id: { in: prodIds }, tenantId },
          select: { id: true, price: true, title: true },
        });
        for (const p of prods) prodInfo.set(p.id, { price: p.price ? Number(p.price) : 0, title: p.title });
      }
      const avUserMap = await this.buildUserMap(tenantId, avulsos.map((a) => a.assignedUserId));
      for (const a of avulsos) {
        const pinfo = a.produtoInteresseId ? prodInfo.get(a.produtoInteresseId) : undefined;
        rows.push({
          unitId: null,
          leadId: a.id,
          empreendimento: 'Imóvel avulso',
          torreUnidade: pinfo?.title ?? 'Imóvel',
          comprador: a.nomeCorreto || a.nome || null,
          valor: a.valorVenda != null ? a.valorVenda : pinfo?.price ?? 0,
          corretor: a.assignedUserId ? avUserMap.get(a.assignedUserId) ?? null : null,
          data: a.dataVenda,
        });
      }
    }

    rows.sort((a, b) => b.valor - a.valor);
    return rows;
  }
}
