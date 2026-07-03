import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SitesService } from './sites.service';

@Controller('sites/public')
export class PublicSitesController {
  constructor(private readonly sitesService: SitesService) {}

  // Antes de ':slug' — NestJS resolve rotas na ordem de declaração
  @Get('domain/:host')
  getPublicSiteByDomain(@Param('host') host: string) {
    return this.sitesService.getPublicSiteSlugByDomain(host);
  }

  @Get(':slug')
  getPublicSite(@Param('slug') slug: string) {
    return this.sitesService.getPublicSite(slug);
  }

  @Get(':slug/products')
  getPublicProducts(@Param('slug') slug: string) {
    return this.sitesService.getPublicProducts(slug);
  }

  @Get(':slug/imovel/:id')
  getPublicProduct(@Param('slug') slug: string, @Param('id') id: string) {
    return this.sitesService.getPublicProduct(slug, id);
  }

  @Post(':slug/lead')
  submitLead(@Param('slug') slug: string, @Body() body: { nome: string; telefone: string; mensagem?: string }) {
    return this.sitesService.submitContactLead(slug, body);
  }

  @Post(':slug/demanda')
  submitDemanda(
    @Param('slug') slug: string,
    @Body() body: { titulo: string; local?: string; dataAtendimento?: string; horario?: string; observacoes?: string },
  ) {
    return this.sitesService.submitDemanda(slug, body);
  }
}
