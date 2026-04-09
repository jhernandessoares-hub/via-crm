import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SitesService } from './sites.service';

@UseGuards(JwtAuthGuard)
@Controller('sites')
export class TenantSitesController {
  constructor(private readonly sitesService: SitesService) {}

  // ── Available templates ─────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(@Req() req: any) {
    return this.sitesService.listAvailableTemplates(req.user.tenantId);
  }

  // ── Own sites ───────────────────────────────────────────────────────────────

  @Get()
  listSites(@Req() req: any) {
    return this.sitesService.listTenantSites(req.user.tenantId);
  }

  @Post()
  createSite(@Req() req: any, @Body() body: {
    name: string;
    slug: string;
    siteType: string;
    templateId?: string;
    contentJson: object;
  }) {
    if (req.user.role !== 'OWNER') {
      return { ok: false, error: 'Apenas OWNERs podem criar sites.' };
    }
    return this.sitesService.createTenantSite(req.user.tenantId, body);
  }

  @Get(':id')
  getSite(@Req() req: any, @Param('id') id: string) {
    return this.sitesService.getTenantSite(req.user.tenantId, id);
  }

  @Patch(':id')
  updateSite(@Req() req: any, @Param('id') id: string, @Body() body: Partial<{ name: string; contentJson: object }>) {
    if (req.user.role !== 'OWNER') {
      return { ok: false, error: 'Apenas OWNERs podem editar sites.' };
    }
    return this.sitesService.updateTenantSite(req.user.tenantId, id, body);
  }

  @Post(':id/publish')
  publishSite(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'OWNER') {
      return { ok: false, error: 'Apenas OWNERs podem publicar sites.' };
    }
    return this.sitesService.publishTenantSite(req.user.tenantId, id);
  }

  @Delete(':id')
  deleteSite(@Req() req: any, @Param('id') id: string) {
    if (req.user.role !== 'OWNER') {
      return { ok: false, error: 'Apenas OWNERs podem excluir sites.' };
    }
    return this.sitesService.deleteTenantSite(req.user.tenantId, id);
  }
}
