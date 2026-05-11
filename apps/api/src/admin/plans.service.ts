import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../plans/limits.service';
import { Logger } from '../logger';
import { PlanTier } from '@prisma/client';

@Injectable()
export class PlansService {
  private readonly logger = new Logger('PlansService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly limitsService: LimitsService,
  ) {}

  async listPlans() {
    const configs = await this.prisma.planConfig.findMany({ orderBy: { tier: 'asc' } });
    return configs;
  }

  async getPlan(tier: PlanTier) {
    const config = await this.prisma.planConfig.findUnique({ where: { tier } });
    if (!config) throw new NotFoundException(`Plano ${tier} não encontrado`);
    return config;
  }

  async updatePlan(tier: PlanTier, data: { limits?: object; prices?: object; active?: boolean }, updatedBy: string) {
    const existing = await this.prisma.planConfig.findUnique({ where: { tier } });
    if (!existing) throw new NotFoundException(`Plano ${tier} não encontrado`);

    const updated = await this.prisma.planConfig.update({
      where: { tier },
      data: {
        ...(data.limits !== undefined && { limits: data.limits }),
        ...(data.prices !== undefined && { prices: data.prices }),
        ...(data.active !== undefined && { active: data.active }),
        updatedBy,
      },
    });

    this.limitsService.invalidateCache();
    this.logger.log(`Plano ${tier} atualizado por ${updatedBy}`);
    return updated;
  }

  async listAddons() {
    return this.prisma.addonConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async getAddon(key: string) {
    const addon = await this.prisma.addonConfig.findUnique({ where: { key } });
    if (!addon) throw new NotFoundException(`Add-on ${key} não encontrado`);
    return addon;
  }

  async updateAddon(key: string, data: { limits?: object; prices?: object; active?: boolean }, updatedBy: string) {
    const existing = await this.prisma.addonConfig.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Add-on ${key} não encontrado`);

    const updated = await this.prisma.addonConfig.update({
      where: { key },
      data: {
        ...(data.limits !== undefined && { limits: data.limits }),
        ...(data.prices !== undefined && { prices: data.prices }),
        ...(data.active !== undefined && { active: data.active }),
        updatedBy,
      },
    });

    this.logger.log(`Add-on ${key} atualizado por ${updatedBy}`);
    return updated;
  }

  async setTenantPlan(tenantId: string, tier: PlanTier, updatedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: tier },
    });

    this.limitsService.invalidateCache(tenantId);
    this.logger.log(`Tenant ${tenantId} migrado para plano ${tier} por ${updatedBy}`);
    return updated;
  }

  async overrideTenantLimits(tenantId: string, limits: object, updatedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const current = (tenant.limits as object) ?? {};
    const merged = { ...current, ...limits };

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { limits: merged },
    });

    this.limitsService.invalidateCache(tenantId);
    this.logger.log(`Override de limites aplicado ao tenant ${tenantId} por ${updatedBy}`);
    return updated;
  }

  async addAddonToTenant(tenantId: string, addonKey: string, updatedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const addonConfig = await this.prisma.addonConfig.findUnique({ where: { key: addonKey } });
    if (!addonConfig) throw new NotFoundException(`Add-on ${addonKey} não encontrado`);

    if (addonConfig.requiresTier && addonConfig.requiresTier !== tenant.plan) {
      throw new BadRequestException(
        `O add-on ${addonKey} requer o plano ${addonConfig.requiresTier}. Tenant está no plano ${tenant.plan}.`,
      );
    }

    if (tenant.addons.includes(addonKey)) return tenant;

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { addons: { push: addonKey } },
    });

    this.logger.log(`Add-on ${addonKey} ativado no tenant ${tenantId} por ${updatedBy}`);
    return updated;
  }

  async removeAddonFromTenant(tenantId: string, addonKey: string, updatedBy: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { addons: tenant.addons.filter((a) => a !== addonKey) },
    });

    this.logger.log(`Add-on ${addonKey} removido do tenant ${tenantId} por ${updatedBy}`);
    return updated;
  }

  async getTenantUsageSummary(tenantId: string) {
    const [tenant, counters] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, limits: true } }),
      this.prisma.usageCounter.findMany({ where: { tenantId } }),
    ]);
    return { tenant, counters };
  }

  async listAllTenantsUsage() {
    const tenants = await this.prisma.tenant.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, plan: true },
    });

    const result: Array<typeof tenants[number] & { counters: Awaited<ReturnType<typeof this.prisma.usageCounter.findMany>> }> = [];
    for (const t of tenants) {
      const counters = await this.prisma.usageCounter.findMany({ where: { tenantId: t.id } });
      result.push({ ...t, counters });
    }
    return result;
  }
}
