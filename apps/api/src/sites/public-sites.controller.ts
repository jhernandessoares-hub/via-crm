import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SitesService } from './sites.service';

@Controller('sites/public')
export class PublicSitesController {
  constructor(private readonly sitesService: SitesService) {}

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
}
