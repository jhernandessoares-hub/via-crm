import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlatformAdminGuard } from './admin-auth.guard';
import { PlansService } from './plans.service';
import { AuditService } from '../audit/audit.service';
import { PlanTier } from '@prisma/client';

@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly audit: AuditService,
  ) {}

  @Get('plans')
  listPlans() {
    return this.plansService.listPlans();
  }

  @Get('plans/:tier')
  getPlan(@Param('tier') tier: PlanTier) {
    return this.plansService.getPlan(tier);
  }

  @Patch('plans/:tier')
  async updatePlan(
    @Param('tier') tier: PlanTier,
    @Body() body: { limits?: object; prices?: object; active?: boolean },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.updatePlan(tier, body, updatedBy);
    await this.audit.log({
      action: 'PLAN_UPDATED',
      resourceType: 'PlanConfig',
      resourceId: tier,
      metadata: { changes: body, updatedBy },
    });
    return result;
  }

  @Get('addons')
  listAddons() {
    return this.plansService.listAddons();
  }

  @Get('addons/:key')
  getAddon(@Param('key') key: string) {
    return this.plansService.getAddon(key);
  }

  @Patch('addons/:key')
  async updateAddon(
    @Param('key') key: string,
    @Body() body: { limits?: object; prices?: object; active?: boolean },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.updateAddon(key, body, updatedBy);
    await this.audit.log({
      action: 'ADDON_UPDATED',
      resourceType: 'AddonConfig',
      resourceId: key,
      metadata: { changes: body, updatedBy },
    });
    return result;
  }

  @Patch('tenants/:id/plan')
  async setTenantPlan(
    @Param('id') tenantId: string,
    @Body() body: { tier: PlanTier },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.setTenantPlan(tenantId, body.tier, updatedBy);
    await this.audit.log({
      action: 'TENANT_PLAN_CHANGED',
      resourceType: 'Tenant',
      resourceId: tenantId,
      metadata: { tier: body.tier, updatedBy },
    });
    return result;
  }

  @Patch('tenants/:id/limits')
  async overrideTenantLimits(
    @Param('id') tenantId: string,
    @Body() body: { limits: object },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.overrideTenantLimits(tenantId, body.limits, updatedBy);
    await this.audit.log({
      action: 'TENANT_LIMITS_OVERRIDE',
      resourceType: 'Tenant',
      resourceId: tenantId,
      metadata: { limits: body.limits, updatedBy },
    });
    return result;
  }

  @Post('tenants/:id/addons/add')
  @HttpCode(HttpStatus.OK)
  async addAddon(
    @Param('id') tenantId: string,
    @Body() body: { addon: string },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.addAddonToTenant(tenantId, body.addon, updatedBy);
    await this.audit.log({
      action: 'TENANT_ADDON_ADDED',
      resourceType: 'Tenant',
      resourceId: tenantId,
      metadata: { addon: body.addon, updatedBy },
    });
    return result;
  }

  @Post('tenants/:id/addons/remove')
  @HttpCode(HttpStatus.OK)
  async removeAddon(
    @Param('id') tenantId: string,
    @Body() body: { addon: string },
    @Request() req: any,
  ) {
    const updatedBy = req.admin?.email ?? 'admin';
    const result = await this.plansService.removeAddonFromTenant(tenantId, body.addon, updatedBy);
    await this.audit.log({
      action: 'TENANT_ADDON_REMOVED',
      resourceType: 'Tenant',
      resourceId: tenantId,
      metadata: { addon: body.addon, updatedBy },
    });
    return result;
  }

  @Get('usage')
  listAllTenantsUsage() {
    return this.plansService.listAllTenantsUsage();
  }

  @Get('usage/:tenantId')
  getTenantUsage(@Param('tenantId') tenantId: string) {
    return this.plansService.getTenantUsageSummary(tenantId);
  }
}
