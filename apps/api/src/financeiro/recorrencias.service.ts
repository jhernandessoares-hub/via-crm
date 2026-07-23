import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Logger } from '../logger';
import { FinCadastrosService } from './cadastros.service';
import {
  assertPositiveMoney,
  currentCompetencia,
  dayInMonthClamped,
  finSerialize,
  formatDateOnly,
  parseCompetencia,
} from './fin-shared.util';

const logger = new Logger('FinRecorrencias');

@Injectable()
export class FinRecorrenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cadastros: FinCadastrosService,
  ) {}

  // ---------- CRUD de regras (despesas/receitas fixas) ----------

  async list() {
    const rules = await this.prisma.finRecurringRule.findMany({
      orderBy: [{ tipo: 'asc' }, { descricao: 'asc' }],
      include: {
        categoria: { select: { id: true, nome: true, parent: { select: { nome: true } } } },
        contact: { select: { id: true, nome: true } },
        company: { select: { id: true, nome: true } },
        _count: { select: { entries: true } },
      },
    });
    return finSerialize(rules);
  }

  async create(
    data: {
      tipo: FinEntryType;
      descricao: string;
      categoriaId: string;
      contactId?: string;
      companyId?: string;
      valor: number;
      diaVencimento?: number;
      valorVariavel?: boolean;
    },
    adminId?: string,
  ) {
    const descricao = (data.descricao || '').trim();
    if (!descricao) throw new BadRequestException('Descrição é obrigatória');
    const valor = assertPositiveMoney(data.valor, 'valor');
    const tipoCategoria = data.tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
    await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);

    const created = await this.prisma.finRecurringRule.create({
      data: {
        tipo: data.tipo,
        descricao,
        categoriaId: data.categoriaId,
        contactId: data.contactId || null,
        companyId: data.companyId || null,
        valor,
        diaVencimento: this.validDia(data.diaVencimento),
        valorVariavel: data.valorVariavel ?? false,
        updatedBy: adminId || null,
      },
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPDATE_RECURRING',
      resourceType: 'FinRecurringRule',
      resourceId: created.id,
      metadata: { operacao: 'create', descricao, valor },
    });

    return finSerialize(created);
  }

  async update(
    id: string,
    data: {
      descricao?: string;
      categoriaId?: string;
      contactId?: string | null;
      companyId?: string | null;
      valor?: number;
      diaVencimento?: number;
      ativo?: boolean;
      valorVariavel?: boolean;
    },
    adminId?: string,
  ) {
    const rule = await this.prisma.finRecurringRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Recorrência não encontrada');

    if (data.categoriaId !== undefined) {
      const tipoCategoria = rule.tipo === 'RECEBER' ? 'RECEITA' : 'DESPESA';
      await this.cadastros.assertCategoriaAnalitica(data.categoriaId, tipoCategoria);
    }

    const updated = await this.prisma.finRecurringRule.update({
      where: { id },
      data: {
        ...(data.descricao !== undefined ? { descricao: data.descricao.trim() } : {}),
        ...(data.categoriaId !== undefined ? { categoriaId: data.categoriaId } : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId || null } : {}),
        ...(data.companyId !== undefined ? { companyId: data.companyId || null } : {}),
        ...(data.valor !== undefined ? { valor: assertPositiveMoney(data.valor, 'valor') } : {}),
        ...(data.diaVencimento !== undefined ? { diaVencimento: this.validDia(data.diaVencimento) } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
        ...(data.valorVariavel !== undefined ? { valorVariavel: data.valorVariavel } : {}),
        updatedBy: adminId || null,
      },
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPDATE_RECURRING',
      resourceType: 'FinRecurringRule',
      resourceId: id,
      metadata: { operacao: 'update', campos: Object.keys(data) },
    });

    return finSerialize(updated);
  }

  async delete(id: string, adminId?: string) {
    const rule = await this.prisma.finRecurringRule.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });
    if (!rule) throw new NotFoundException('Recorrência não encontrada');

    if (rule._count.entries > 0) {
      await this.prisma.finRecurringRule.update({ where: { id }, data: { ativo: false, updatedBy: adminId || null } });
      this.audit.log({
        platformAdminId: adminId,
        action: 'PLATFORM_FIN_UPDATE_RECURRING',
        resourceType: 'FinRecurringRule',
        resourceId: id,
        metadata: { operacao: 'deactivate' },
      });
      return { deleted: false, deactivated: true };
    }

    await this.prisma.finRecurringRule.delete({ where: { id } });
    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPDATE_RECURRING',
      resourceType: 'FinRecurringRule',
      resourceId: id,
      metadata: { operacao: 'delete', descricao: rule.descricao },
    });
    return { deleted: true, deactivated: false };
  }

  // ---------- Mensalidades por tenant ----------

  /** Join Tenant × regra — tela de configurar valor por tenant. */
  async listMensalidades() {
    const [tenants, rules] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, slug: true, plan: true, ativo: true },
      }),
      this.prisma.finRecurringRule.findMany({ where: { tenantId: { not: null } } }),
    ]);
    const ruleByTenant = new Map(rules.map((r) => [r.tenantId as string, r]));
    return tenants.map((t) => {
      const r = ruleByTenant.get(t.id);
      return {
        tenantId: t.id,
        nome: t.nome,
        slug: t.slug,
        plan: t.plan,
        tenantAtivo: t.ativo,
        regra: r
          ? { id: r.id, valor: r.valor.toNumber(), diaVencimento: r.diaVencimento, ativo: r.ativo }
          : null,
      };
    });
  }

  /** Upsert da regra de mensalidade do tenant. */
  async upsertMensalidade(
    tenantId: string,
    data: { valor: number; diaVencimento?: number; ativo?: boolean; categoriaId?: string },
    adminId?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const valor = assertPositiveMoney(data.valor, 'valor');
    const categoriaId = data.categoriaId || (await this.defaultMensalidadeCategoriaId());
    await this.cadastros.assertCategoriaAnalitica(categoriaId, 'RECEITA');

    const payload = {
      tipo: 'RECEBER' as FinEntryType,
      descricao: `Mensalidade VIA CRM — ${tenant.nome}`,
      categoriaId,
      valor,
      diaVencimento: this.validDia(data.diaVencimento),
      ativo: data.ativo ?? true,
      updatedBy: adminId || null,
    };

    const rule = await this.prisma.finRecurringRule.upsert({
      where: { tenantId },
      create: { ...payload, tenantId },
      update: payload,
    });

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_UPDATE_RECURRING',
      resourceType: 'FinRecurringRule',
      resourceId: rule.id,
      metadata: { operacao: 'mensalidade', tenantId, valor, ativo: payload.ativo },
    });

    return finSerialize(rule);
  }

  /** Categoria "Mensalidades" do seed (Receitas VIA CRM). */
  private async defaultMensalidadeCategoriaId(): Promise<string> {
    const cat = await this.prisma.finCategory.findFirst({
      where: { tipo: 'RECEITA', nome: 'Mensalidades', parentId: { not: null } },
    });
    if (!cat) throw new BadRequestException('Categoria padrão "Mensalidades" não encontrada — informe categoriaId');
    return cat.id;
  }

  // ---------- Geração por competência ----------

  /**
   * Regras elegíveis: ativas; mensalidades só de tenants ativos.
   * valorVariavel (água, energia) fica de fora por padrão — não tem como adivinhar o valor do
   * mês, então nunca entra na geração automática/em massa; só via gerarValorVariavel().
   */
  private async regrasElegiveis(opts: { incluirVariaveis?: boolean } = {}) {
    const rules = await this.prisma.finRecurringRule.findMany({ where: { ativo: true } });
    const tenantIds = rules.map((r) => r.tenantId).filter(Boolean) as string[];
    const ativos = tenantIds.length
      ? new Set(
          (
            await this.prisma.tenant.findMany({
              where: { id: { in: tenantIds }, ativo: true },
              select: { id: true },
            })
          ).map((t) => t.id),
        )
      : new Set<string>();
    return rules.filter(
      (r) => (!r.tenantId || ativos.has(r.tenantId)) && (opts.incluirVariaveis || !r.valorVariavel),
    );
  }

  /** Regras de valor variável (água, energia) sem título gerado na competência — precisam do valor informado. */
  async pendenciasVariaveis(competencia?: string) {
    const comp = competencia ? parseCompetencia(competencia) : currentCompetencia();
    const todas = await this.regrasElegiveis({ incluirVariaveis: true });
    const variaveis = todas.filter((r) => r.valorVariavel);
    if (variaveis.length === 0) return [];
    const geradas = await this.prisma.finEntry.findMany({
      where: { recurringRuleId: { in: variaveis.map((r) => r.id) }, competencia: comp },
      select: { recurringRuleId: true },
    });
    const geradasIds = new Set(geradas.map((e) => e.recurringRuleId));
    const pendentes = variaveis.filter((r) => !geradasIds.has(r.id));
    const categorias = await this.prisma.finCategory.findMany({
      where: { id: { in: pendentes.map((r) => r.categoriaId) } },
      select: { id: true, nome: true },
    });
    const catNome = new Map(categorias.map((c) => [c.id, c.nome]));
    const companyIds = pendentes.map((r) => r.companyId).filter(Boolean) as string[];
    const companies = companyIds.length
      ? await this.prisma.finCompany.findMany({ where: { id: { in: companyIds } }, select: { id: true, nome: true } })
      : [];
    const companyNome = new Map(companies.map((c) => [c.id, c.nome]));
    return finSerialize(
      pendentes.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        descricao: r.descricao,
        categoriaNome: catNome.get(r.categoriaId) || null,
        companyNome: r.companyId ? companyNome.get(r.companyId) || null : null,
        valorReferencia: r.valor,
        diaVencimento: r.diaVencimento,
        competencia: formatDateOnly(comp).slice(0, 7),
      })),
    );
  }

  /** Gera o título de uma regra de valor variável para a competência, com o valor informado agora. */
  async gerarValorVariavel(id: string, data: { valor: number; competencia?: string }, adminId?: string) {
    const rule = await this.prisma.finRecurringRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Recorrência não encontrada');
    if (!rule.ativo) throw new BadRequestException('Recorrência está pausada');
    if (!rule.valorVariavel) throw new BadRequestException('Essa recorrência não é de valor variável');

    const comp = data.competencia ? parseCompetencia(data.competencia) : currentCompetencia();
    const valor = assertPositiveMoney(data.valor, 'valor');

    const jaExiste = await this.prisma.finEntry.findFirst({
      where: { recurringRuleId: id, competencia: comp },
    });
    if (jaExiste) throw new BadRequestException('Já existe título dessa recorrência para essa competência');

    const [entry] = await this.prisma.$transaction([
      this.prisma.finEntry.create({
        data: {
          tipo: rule.tipo,
          descricao: rule.descricao,
          categoriaId: rule.categoriaId,
          contactId: rule.contactId,
          companyId: rule.companyId,
          competencia: comp,
          vencimento: dayInMonthClamped(comp, rule.diaVencimento),
          valor,
          recurringRuleId: rule.id,
          createdBy: adminId || null,
        },
      }),
      // guarda o valor informado como referência pro próximo mês
      this.prisma.finRecurringRule.update({ where: { id }, data: { valor, updatedBy: adminId || null } }),
    ]);

    this.audit.log({
      platformAdminId: adminId,
      action: 'PLATFORM_FIN_GENERATE_RECURRING',
      resourceType: 'FinEntry',
      resourceId: entry.id,
      metadata: { competencia: formatDateOnly(comp).slice(0, 7), valor, origem: 'variavel' },
    });

    return finSerialize(entry);
  }

  async status(competencia?: string) {
    const comp = competencia ? parseCompetencia(competencia) : currentCompetencia();
    const rules = await this.regrasElegiveis();
    if (rules.length === 0) return { competencia: formatDateOnly(comp).slice(0, 7), total: 0, geradas: 0, pendentes: 0 };
    const geradas = await this.prisma.finEntry.count({
      where: { recurringRuleId: { in: rules.map((r) => r.id) }, competencia: comp },
    });
    return {
      competencia: formatDateOnly(comp).slice(0, 7),
      total: rules.length,
      geradas,
      pendentes: rules.length - geradas,
    };
  }

  /**
   * Geração idempotente: createMany + skipDuplicates no unique [recurringRuleId, competencia].
   */
  async gerar(competencia: string | undefined, adminId?: string, origem: 'manual' | 'lazy' = 'manual') {
    const comp = competencia ? parseCompetencia(competencia) : currentCompetencia();
    const rules = await this.regrasElegiveis();
    if (rules.length === 0) return { competencia: formatDateOnly(comp).slice(0, 7), geradas: 0, jaExistiam: 0 };

    const rows = rules.map((r) => ({
      tipo: r.tipo,
      descricao: r.descricao,
      categoriaId: r.categoriaId,
      contactId: r.contactId,
      companyId: r.companyId,
      tenantId: r.tenantId,
      competencia: comp,
      vencimento: dayInMonthClamped(comp, r.diaVencimento),
      valor: r.valor,
      recurringRuleId: r.id,
      createdBy: adminId || null,
    }));

    const result = await this.prisma.finEntry.createMany({ data: rows, skipDuplicates: true });

    if (result.count > 0) {
      this.audit.log({
        platformAdminId: adminId,
        action: 'PLATFORM_FIN_GENERATE_RECURRING',
        resourceType: 'FinEntry',
        metadata: { competencia: formatDateOnly(comp).slice(0, 7), geradas: result.count, origem },
      });
    }

    return {
      competencia: formatDateOnly(comp).slice(0, 7),
      geradas: result.count,
      jaExistiam: rules.length - result.count,
    };
  }

  /**
   * Geração lazy da competência corrente — chamada pelo dashboard e pela
   * listagem de contas a receber. Nunca propaga erro (não pode quebrar o GET).
   */
  async gerarCompetenciaCorrenteSilencioso(adminId?: string) {
    try {
      const { pendentes } = await this.status();
      if (pendentes > 0) {
        const r = await this.gerar(undefined, adminId, 'lazy');
        if (r.geradas > 0) logger.log(`Geração lazy: ${r.geradas} título(s) da competência ${r.competencia}`);
      }
    } catch (err: any) {
      logger.error(`Geração lazy de recorrências falhou: ${err?.message}`);
    }
  }

  private validDia(dia?: number): number {
    const d = Math.floor(Number(dia ?? 5));
    if (!isFinite(d) || d < 1 || d > 31) throw new BadRequestException('Dia de vencimento deve estar entre 1 e 31');
    return d;
  }
}
