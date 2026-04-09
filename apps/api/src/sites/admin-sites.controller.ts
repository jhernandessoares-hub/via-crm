import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { SitesService } from './sites.service';

@UseGuards(PlatformAdminGuard)
@Controller('admin/sites')
export class AdminSitesController {
  constructor(private readonly sitesService: SitesService) {}

  // ── Templates ───────────────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(@Query('scope') scope?: string, @Query('siteType') siteType?: string) {
    return this.sitesService.listTemplates(scope, siteType);
  }

  @Post('templates')
  createTemplate(@Body() body: {
    name: string;
    siteType: string;
    scope?: string;
    tenantId?: string;
    contentJson: object;
    status?: string;
  }) {
    return this.sitesService.createTemplate(body);
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.sitesService.getTemplate(id);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: Partial<{ name: string; contentJson: object; status: string; scope: string }>) {
    return this.sitesService.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.sitesService.deleteTemplate(id);
  }

  @Post('templates/:id/publish')
  publishTemplate(@Param('id') id: string) {
    return this.sitesService.publishTemplate(id);
  }

  // ── All tenant sites (read-only) ─────────────────────────────────────────────

  @Get('tenant-sites')
  listAllTenantSites(@Query('tenantId') tenantId?: string) {
    return this.sitesService.listAllTenantSites(tenantId);
  }
}
