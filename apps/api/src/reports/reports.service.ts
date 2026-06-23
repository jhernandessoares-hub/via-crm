import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissions, resolveFieldVisibility } from '../tenants/permissions.config';

type Bucket = { qtd: number; valor: number };
const emptyBucket = (): Bucket => ({ qtd: 0, valor: 0 });

/**
 * Relatórios gerenciais de vendas — separa explicitamente duas fontes:
 *  - GESTÃO: vendas de unidades de empreendimento (DevelopmentUnit).
 *  - AVULSO: vendas de imóveis avulsos (Lead com dataVenda, sem unidade).
 *
 * Período: Vendido / financeiro / mensal / corretor → filtrados por período.
 * Demais status do espelho (Disponível/Proposta/Reservado/Bloqueado) e VSO → snapshot atual.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Externo Consultivo: oculta nas linhas do drill os mesmos campos bloqueados na ficha do lead.
   * Cobertura alinhada à de `LeadsService.sanitizeLeadForPartner`/`applyUnitVisibility`.
   */
  private async sanitizeRowsForPartner<T extends Record<string, any>>(
    tenantId: string,
    role: string,
    rows: T[],
  ): Promise<T[]> {
    if (role !== 'PARTNER') return rows;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { permissionsConfig: true },
    });
    const fv = resolveFieldVisibility((tenant?.permissionsConfig as any)?.fieldVisibility);
    const hidden = (k: string) => fv[k] === false;
    for (const r of rows) {
      if (hidden('lead.responsavel')) (r as any).corretor = null;
      if (hidden('lead.cpf')) (r as any).cpf = null;
      if (hidden('unit.valores')) (r as any).valor = null;
      if (hidden('unit.comprador')) {
        (r as any).comprador = null;
        (r as any).data = null; // data de venda
      }
      if (hidden('unit.identificacao')) {
        (r as any).empreendimento = null;
        (r as any).torreUnidade = null;
      }
    }
    return rows;
  }

  private inPeriod(d: Date | null | undefined, from: Date | null, to: Date | null): boolean {
    if (!d) return false;
    const x = new Date(d);
    if (from && x < from) return false;
    if (to && x > to) return false;
    return true;
  }

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
  async vendasReport(tenantId: string, role: string, fromISO?: string, toISO?: string, developmentId?: string) {
    await this.assertCanView(tenantId, role);
    const from = fromISO ? new Date(fromISO) : null;
    const to = toISO ? new Date(toISO) : null;

    // Lista de empreendimentos cadastrados (para o seletor / decidir visibilidade)
    const developments = await this.prisma.development.findMany({
      where: { tenantId },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    const empreendimento = developments.length > 0
      ? await this.buildEmpreendimentoBlock(tenantId, from, to, developmentId)
      : null;
    const avulso = await this.buildAvulsoBlock(tenantId, from, to);

    return { developments, empreendimento, avulso };
  }

  private async buildEmpreendimentoBlock(tenantId: string, from: Date | null, to: Date | null, developmentId?: string) {
    const units = await this.prisma.developmentUnit.findMany({
      where: { tenantId, ativo: true, ...(developmentId ? { developmentId } : {}) },
      select: {
        id: true,
        status: true,
        valorVenda: true,
        finalPrice: true,
        soldAt: true,
        development: { select: { id: true, nome: true } },
        lead: { select: { id: true, assignedUserId: true } },
      },
    });

    const espelho = {
      total: units.length,
      disponivel: emptyBucket(),
      proposta: emptyBucket(),
      reservado: emptyBucket(),
      vendido: emptyBucket(),
      bloqueado: emptyBucket(),
    };
    let vendidoSnapshotQtd = 0;
    for (const u of units) {
      const tabela = u.valorVenda || 0;
      switch (u.status) {
        case 'DISPONIVEL': espelho.disponivel.qtd++; espelho.disponivel.valor += tabela; break;
        case 'PROPOSTA': espelho.proposta.qtd++; espelho.proposta.valor += tabela; break;
        case 'RESERVADO': espelho.reservado.qtd++; espelho.reservado.valor += tabela; break;
        case 'BLOQUEADO': espelho.bloqueado.qtd++; espelho.bloqueado.valor += tabela; break;
        case 'VENDIDO':
          vendidoSnapshotQtd++;
          if (this.inPeriod(u.soldAt, from, to)) {
            espelho.vendido.qtd++;
            espelho.vendido.valor += u.finalPrice || u.valorVenda || 0;
          }
          break;
      }
    }

    const valorVendido = espelho.vendido.valor;
    const numVendas = espelho.vendido.qtd;
    const ticketMedio = numVendas > 0 ? Math.round(valorVendido / numVendas) : 0;
    const vso = espelho.total > 0 ? Math.round(((vendidoSnapshotQtd + espelho.reservado.qtd) / espelho.total) * 100) : 0;
    const vgvEstoque = espelho.disponivel.valor;

    // Mensal
    const monthlyMap: Record<string, { mes: string; vendas: number; vgv: number }> = {};
    for (const u of units) {
      if (u.status === 'VENDIDO' && this.inPeriod(u.soldAt, from, to)) {
        const mes = new Date(u.soldAt as Date).toISOString().slice(0, 7);
        if (!monthlyMap[mes]) monthlyMap[mes] = { mes, vendas: 0, vgv: 0 };
        monthlyMap[mes].vendas++;
        monthlyMap[mes].vgv += u.finalPrice || u.valorVenda || 0;
      }
    }
    const mensal = Object.values(monthlyMap).sort((a, b) => a.mes.localeCompare(b.mes));

    // Por empreendimento
    const devMap = new Map<string, { nome: string; totalUnidades: number; vendidasSnapshot: number; reservado: number; vendidas: number; vgvVendido: number; vgvDisponivel: number }>();
    for (const u of units) {
      const devId = u.development?.id ?? 'sem-empreendimento';
      const nome = u.development?.nome ?? 'Sem empreendimento';
      if (!devMap.has(devId)) devMap.set(devId, { nome, totalUnidades: 0, vendidasSnapshot: 0, reservado: 0, vendidas: 0, vgvVendido: 0, vgvDisponivel: 0 });
      const d = devMap.get(devId)!;
      d.totalUnidades++;
      if (u.status === 'VENDIDO') {
        d.vendidasSnapshot++;
        if (this.inPeriod(u.soldAt, from, to)) { d.vendidas++; d.vgvVendido += u.finalPrice || u.valorVenda || 0; }
      } else if (u.status === 'RESERVADO') {
        d.reservado++;
      }
      if (u.status === 'DISPONIVEL') d.vgvDisponivel += u.valorVenda || 0;
    }
    const porEmpreendimento = Array.from(devMap.values())
      .map((d) => ({
        nome: d.nome,
        totalUnidades: d.totalUnidades,
        vendidas: d.vendidas,
        vsoPct: d.totalUnidades > 0 ? Math.round(((d.vendidasSnapshot + d.reservado) / d.totalUnidades) * 100) : 0,
        vgvVendido: d.vgvVendido,
        vgvDisponivel: d.vgvDisponivel,
      }))
      .sort((a, b) => b.vgvVendido - a.vgvVendido);

    // Por corretor
    const userMap = await this.buildUserMap(tenantId, units.map((u) => u.lead?.assignedUserId));
    const porCorretor = this.groupCorretor(
      units
        .filter((u) => u.status === 'VENDIDO' && this.inPeriod(u.soldAt, from, to))
        .map((u) => ({ userId: u.lead?.assignedUserId ?? null, valor: u.finalPrice || u.valorVenda || 0 })),
      userMap,
    );

    return { espelho, carteira: { vso, vgvEstoque }, periodo: { numVendas, valorVendido, ticketMedio }, mensal, porEmpreendimento, porCorretor };
  }

  private async buildAvulsoBlock(tenantId: string, from: Date | null, to: Date | null) {
    const avulsos = await this.prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dataVenda: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
        developmentUnits: { none: {} },
      },
      select: { id: true, valorVenda: true, dataVenda: true, assignedUserId: true, produtoInteresseId: true },
    });
    if (avulsos.length === 0) return null;

    const prodPrice = await this.buildProductPriceMap(tenantId, avulsos.filter((a) => a.valorVenda == null).map((a) => a.produtoInteresseId));
    const valorDe = (a: (typeof avulsos)[number]) => (a.valorVenda != null ? a.valorVenda : a.produtoInteresseId ? prodPrice.get(a.produtoInteresseId) ?? 0 : 0);

    const valorVendido = avulsos.reduce((s, a) => s + valorDe(a), 0);
    const numVendas = avulsos.length;
    const ticketMedio = numVendas > 0 ? Math.round(valorVendido / numVendas) : 0;

    const monthlyMap: Record<string, { mes: string; vendas: number; vgv: number }> = {};
    for (const a of avulsos) {
      const mes = new Date(a.dataVenda as Date).toISOString().slice(0, 7);
      if (!monthlyMap[mes]) monthlyMap[mes] = { mes, vendas: 0, vgv: 0 };
      monthlyMap[mes].vendas++;
      monthlyMap[mes].vgv += valorDe(a);
    }
    const mensal = Object.values(monthlyMap).sort((a, b) => a.mes.localeCompare(b.mes));

    const userMap = await this.buildUserMap(tenantId, avulsos.map((a) => a.assignedUserId));
    const porCorretor = this.groupCorretor(avulsos.map((a) => ({ userId: a.assignedUserId, valor: valorDe(a) })), userMap);

    return { periodo: { numVendas, valorVendido, ticketMedio }, mensal, porCorretor };
  }

  private groupCorretor(items: { userId: string | null; valor: number }[], userMap: Map<string, string>) {
    const map = new Map<string, { nome: string; vendas: number; vgv: number }>();
    for (const it of items) {
      const key = it.userId ?? '__none__';
      const nome = it.userId ? userMap.get(it.userId) ?? 'Sem responsável' : 'Sem responsável';
      if (!map.has(key)) map.set(key, { nome, vendas: 0, vgv: 0 });
      const c = map.get(key)!;
      c.vendas++;
      c.vgv += it.valor;
    }
    return Array.from(map.values()).sort((a, b) => b.vgv - a.vgv);
  }

  private async buildProductPriceMap(tenantId: string, productIds: (string | null | undefined)[]) {
    const ids = Array.from(new Set(productIds.filter((x): x is string => !!x)));
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const prods = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, price: true } });
    for (const p of prods) map.set(p.id, p.price ? Number(p.price) : 0);
    return map;
  }

  // ── Drill-down: lista de unidades por status ────────────────────────────────
  async unidadesPorStatus(
    tenantId: string,
    role: string,
    status: string,
    fromISO?: string,
    toISO?: string,
    developmentId?: string,
    source?: string,
  ) {
    await this.assertCanView(tenantId, role);
    const from = fromISO ? new Date(fromISO) : null;
    const to = toISO ? new Date(toISO) : null;
    const st = String(status || '').toUpperCase();
    const src = String(source || '').toLowerCase();

    type Row = {
      unitId: string | null;
      leadId: string | null;
      numero: number | null;
      reentradaCount: number | null;
      cpf: string | null;
      empreendimento: string;
      torreUnidade: string;
      comprador: string | null;
      valor: number;
      corretor: string | null;
      etapa: string | null;
      stageGroup: string | null;
      leadStatus: string | null;
      data: Date | null;
    };
    const rows: Row[] = [];

    // ── Avulso ──
    if (src === 'avulso') {
      if (st !== 'VENDIDO') return [];
      const avulsos = await this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dataVenda: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
          developmentUnits: { none: {} },
        },
        select: {
          id: true, nome: true, nomeCorreto: true, numero: true, reentradaCount: true, cpf: true,
          valorVenda: true, dataVenda: true, assignedUserId: true, produtoInteresseId: true, status: true,
          stage: { select: { name: true, group: true } },
        },
      });
      const prodInfo = new Map<string, { price: number; title: string }>();
      const ids = Array.from(new Set(avulsos.filter((a) => a.valorVenda == null && a.produtoInteresseId).map((a) => a.produtoInteresseId as string)));
      if (ids.length > 0) {
        const prods = await this.prisma.product.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, price: true, title: true } });
        for (const p of prods) prodInfo.set(p.id, { price: p.price ? Number(p.price) : 0, title: p.title });
      }
      const userMap = await this.buildUserMap(tenantId, avulsos.map((a) => a.assignedUserId));
      for (const a of avulsos) {
        const pinfo = a.produtoInteresseId ? prodInfo.get(a.produtoInteresseId) : undefined;
        rows.push({
          unitId: null,
          leadId: a.id,
          numero: a.numero ?? null,
          reentradaCount: a.reentradaCount ?? null,
          cpf: a.cpf ?? null,
          empreendimento: 'Imóvel avulso',
          torreUnidade: pinfo?.title ?? 'Imóvel',
          comprador: a.nomeCorreto || a.nome || null,
          valor: a.valorVenda != null ? a.valorVenda : pinfo?.price ?? 0,
          corretor: a.assignedUserId ? userMap.get(a.assignedUserId) ?? null : null,
          etapa: a.stage?.name ?? null,
          stageGroup: a.stage?.group ?? null,
          leadStatus: a.status ?? null,
          data: a.dataVenda,
        });
      }
      rows.sort((x, y) => y.valor - x.valor);
      return this.sanitizeRowsForPartner(tenantId, role, rows);
    }

    // ── Empreendimento (unidades) ──
    const units = await this.prisma.developmentUnit.findMany({
      where: { tenantId, ativo: true, status: st, ...(developmentId ? { developmentId } : {}) },
      select: {
        id: true, nome: true, status: true, valorVenda: true, finalPrice: true, soldAt: true, comprador: true, leadId: true,
        development: { select: { nome: true } },
        tower: { select: { nome: true } },
        lead: { select: { id: true, nome: true, nomeCorreto: true, numero: true, reentradaCount: true, cpf: true, status: true, stage: { select: { name: true, group: true } } } },
      },
    });
    for (const u of units) {
      if (st === 'VENDIDO' && !this.inPeriod(u.soldAt, from, to)) continue;
      const isSold = st === 'VENDIDO';
      rows.push({
        unitId: u.id,
        leadId: u.leadId ?? u.lead?.id ?? null,
        numero: u.lead?.numero ?? null,
        reentradaCount: u.lead?.reentradaCount ?? null,
        cpf: u.lead?.cpf ?? null,
        empreendimento: u.development?.nome ?? '—',
        torreUnidade: [u.tower?.nome, u.nome].filter(Boolean).join(' · '),
        comprador: u.comprador || u.lead?.nomeCorreto || u.lead?.nome || null,
        valor: isSold ? u.finalPrice || u.valorVenda || 0 : u.valorVenda || 0,
        corretor: null,
        etapa: u.lead?.stage?.name ?? null,
        stageGroup: u.lead?.stage?.group ?? null,
        leadStatus: u.lead?.status ?? null,
        data: isSold ? u.soldAt : null,
      });
    }

    // Corretor das unidades: busca assignedUserId dos leads envolvidos
    const leadIds = Array.from(new Set(units.map((u) => u.lead?.id).filter((x): x is string => !!x)));
    if (leadIds.length > 0) {
      const leads = await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, assignedUserId: true } });
      const leadToUser = new Map(leads.map((l) => [l.id, l.assignedUserId]));
      const cMap = await this.buildUserMap(tenantId, leads.map((l) => l.assignedUserId));
      for (const r of rows) {
        const uid = r.leadId ? leadToUser.get(r.leadId) : null;
        r.corretor = uid ? cMap.get(uid) ?? null : null;
      }
    }

    rows.sort((a, b) => b.valor - a.valor);
    return this.sanitizeRowsForPartner(tenantId, role, rows);
  }

  // ── Contagem de unidades por etapa (para drill-down de etapa) ───────────────
  async unidadesPorStatusEtapa(
    tenantId: string,
    role: string,
    status: string,
    fromISO?: string,
    toISO?: string,
    developmentId?: string,
    source?: string,
  ) {
    await this.assertCanView(tenantId, role);
    const from = fromISO ? new Date(fromISO) : null;
    const to = toISO ? new Date(toISO) : null;
    const st = String(status || '').toUpperCase();
    const src = String(source || '').toLowerCase();

    type EtapaItem = { etapaKey: string; etapaNome: string; stageGroup: string | null; qtd: number };
    const counts = new Map<string, EtapaItem>();

    const accumulate = (stageKey: string | null, stageName: string | null, stageGroup: string | null) => {
      const key = stageKey ?? '__no_stage__';
      if (counts.has(key)) {
        counts.get(key)!.qtd++;
      } else {
        counts.set(key, { etapaKey: key, etapaNome: stageName ?? 'Sem etapa', stageGroup, qtd: 1 });
      }
    };

    if (src === 'avulso') {
      if (st !== 'VENDIDO') return [];
      const avulsos = await this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dataVenda: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
          developmentUnits: { none: {} },
        },
        select: { stage: { select: { key: true, name: true, group: true } } },
      });
      for (const a of avulsos) {
        accumulate(a.stage?.key ?? null, a.stage?.name ?? null, a.stage?.group ?? null);
      }
    } else {
      const units = await this.prisma.developmentUnit.findMany({
        where: { tenantId, ativo: true, status: st, ...(developmentId ? { developmentId } : {}) },
        select: {
          soldAt: true,
          lead: { select: { stage: { select: { key: true, name: true, group: true } } } },
        },
      });
      for (const u of units) {
        if (st === 'VENDIDO' && !this.inPeriod(u.soldAt, from, to)) continue;
        accumulate(u.lead?.stage?.key ?? null, u.lead?.stage?.name ?? null, u.lead?.stage?.group ?? null);
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.qtd - a.qtd);
  }
}
