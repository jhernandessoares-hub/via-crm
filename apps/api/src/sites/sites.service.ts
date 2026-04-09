import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '../logger';

@Injectable()
export class SitesService {
  private readonly logger = new Logger('SitesService');

  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: SiteTemplates ────────────────────────────────────────────────────

  async listTemplates(scope?: string, siteType?: string) {
    return this.prisma.siteTemplate.findMany({
      where: {
        ...(scope ? { scope } : {}),
        ...(siteType ? { siteType } : {}),
      },
      orderBy: [{ scope: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createTemplate(data: {
    name: string;
    siteType: string;
    scope?: string;
    tenantId?: string;
    contentJson: object;
    status?: string;
  }) {
    return this.prisma.siteTemplate.create({
      data: {
        name: data.name,
        siteType: data.siteType,
        scope: data.scope ?? 'PADRAO',
        tenantId: data.tenantId ?? null,
        contentJson: data.contentJson,
        status: data.status ?? 'DRAFT',
      },
    });
  }

  async getTemplate(id: string) {
    const tpl = await this.prisma.siteTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template não encontrado.');
    return tpl;
  }

  async updateTemplate(id: string, data: Partial<{ name: string; contentJson: object; status: string; scope: string }>) {
    await this.getTemplate(id);
    return this.prisma.siteTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    await this.prisma.siteTemplate.delete({ where: { id } });
    return { ok: true };
  }

  async publishTemplate(id: string) {
    await this.getTemplate(id);
    return this.prisma.siteTemplate.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  // ── Admin: TenantSites list ─────────────────────────────────────────────────

  async listAllTenantSites(tenantId?: string) {
    return this.prisma.tenantSite.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { id: true, tenantId: true, name: true, slug: true, siteType: true, status: true, createdAt: true },
    });
  }

  // ── Tenant: available templates ─────────────────────────────────────────────

  async listAvailableTemplates(tenantId: string) {
    return this.prisma.siteTemplate.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ scope: 'PADRAO' }, { scope: 'EXCLUSIVO', tenantId }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Tenant: create site (fork from template or blank) ───────────────────────

  async createTenantSite(tenantId: string, data: {
    name: string;
    slug: string;
    siteType: string;
    templateId?: string;
    contentJson: object;
  }) {
    const existing = await this.prisma.tenantSite.findUnique({ where: { slug: data.slug } });
    if (existing) throw new BadRequestException('Slug já está em uso.');

    if (data.templateId) {
      const tpl = await this.prisma.siteTemplate.findUnique({ where: { id: data.templateId } });
      if (!tpl) throw new NotFoundException('Template não encontrado.');
    }

    return this.prisma.tenantSite.create({
      data: {
        tenantId,
        name: data.name,
        slug: data.slug,
        siteType: data.siteType,
        templateId: data.templateId ?? null,
        contentJson: data.contentJson,
        publishedJson: Prisma.JsonNull,
        status: 'DRAFT',
      },
    });
  }

  // ── Tenant: list own sites ──────────────────────────────────────────────────

  async listTenantSites(tenantId: string) {
    return this.prisma.tenantSite.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, siteType: true, status: true, customDomain: true, createdAt: true, updatedAt: true },
    });
  }

  // ── Tenant: get own site ────────────────────────────────────────────────────

  async getTenantSite(tenantId: string, id: string) {
    const site = await this.prisma.tenantSite.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('Site não encontrado.');
    if (site.tenantId !== tenantId) throw new ForbiddenException('Acesso negado.');
    return site;
  }

  // ── Tenant: update own site (save draft) ────────────────────────────────────

  async updateTenantSite(tenantId: string, id: string, data: Partial<{ name: string; contentJson: object }>) {
    await this.getTenantSite(tenantId, id);
    return this.prisma.tenantSite.update({ where: { id }, data });
  }

  // ── Tenant: publish ─────────────────────────────────────────────────────────

  async publishTenantSite(tenantId: string, id: string) {
    const site = await this.getTenantSite(tenantId, id);
    return this.prisma.tenantSite.update({
      where: { id },
      data: { publishedJson: site.contentJson as Prisma.InputJsonValue, status: 'PUBLISHED' },
    });
  }

  // ── Tenant: delete own site ─────────────────────────────────────────────────

  async deleteTenantSite(tenantId: string, id: string) {
    await this.getTenantSite(tenantId, id);
    await this.prisma.tenantSite.delete({ where: { id } });
    return { ok: true };
  }

  // ── Public: get published site by slug ──────────────────────────────────────

  async getPublicSite(slug: string) {
    const site = await this.prisma.tenantSite.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, siteType: true, publishedJson: true, tenantId: true },
    });
    if (!site || !site.publishedJson) throw new NotFoundException('Site não encontrado ou não publicado.');
    return site;
  }

  // ── Public: list products for property-grid blocks ──────────────────────────

  async getPublicProducts(slug: string) {
    const site = await this.prisma.tenantSite.findUnique({ where: { slug }, select: { tenantId: true } });
    if (!site) throw new NotFoundException('Site não encontrado.');
    return this.prisma.product.findMany({
      where: { tenantId: site.tenantId, status: 'ACTIVE' },
      select: {
        id: true, title: true, type: true, city: true, neighborhood: true,
        price: true, rentPrice: true, bedrooms: true, bathrooms: true,
        parkingSpaces: true, privateAreaM2: true,
        images: { take: 1, select: { url: true }, orderBy: { createdAt: 'asc' } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Public: get single product for detail page ───────────────────────────────

  async getPublicProduct(slug: string, productId: string) {
    const site = await this.prisma.tenantSite.findUnique({ where: { slug }, select: { tenantId: true } });
    if (!site) throw new NotFoundException('Site não encontrado.');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: site.tenantId, status: 'ACTIVE' },
      include: {
        images: { select: { url: true }, orderBy: { createdAt: 'asc' } },
        rooms: { select: { label: true, sizeM2: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('Imóvel não encontrado.');
    return product;
  }

  // ── Public: contact form creates lead ───────────────────────────────────────

  async submitContactLead(slug: string, data: { nome: string; telefone: string; mensagem?: string }) {
    const site = await this.prisma.tenantSite.findUnique({ where: { slug }, select: { tenantId: true } });
    if (!site) throw new NotFoundException('Site não encontrado.');

    const branch = await this.prisma.branch.findFirst({ where: { tenantId: site.tenantId, ativo: true } });

    const pipeline = await this.prisma.pipeline.findFirst({ where: { tenantId: site.tenantId, isActive: true } });
    const firstStage = pipeline
      ? await this.prisma.pipelineStage.findFirst({
          where: { pipelineId: pipeline.id, isActive: true },
          orderBy: { sortOrder: 'asc' },
        })
      : null;

    const lead = await this.prisma.lead.create({
      data: {
        tenantId: site.tenantId,
        branchId: branch?.id ?? null,
        pipelineId: pipeline?.id ?? null,
        stageId: firstStage?.id ?? null,
        nome: data.nome,
        telefone: data.telefone,
        origem: 'SITE',
        observacao: data.mensagem ?? null,
      },
    });

    return { ok: true, leadId: lead.id };
  }
}
