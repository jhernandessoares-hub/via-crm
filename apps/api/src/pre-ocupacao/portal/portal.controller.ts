import { Body, Controller, Get, Param, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FamiliaAuthGuard } from './familia-auth.guard';
import { PortalAuthService } from './portal-auth.service';
import { PortalDemandasService } from './portal-demandas.service';

@Controller('pre-ocupacao-portal')
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly demandas: PortalDemandasService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Post(':slug/login')
  login(@Request() req: any, @Param('slug') slug: string, @Body() body: { cpf: string; telefoneFinal: string }) {
    return this.auth.login(slug, body?.cpf, body?.telefoneFinal, req.ip);
  }

  @UseGuards(FamiliaAuthGuard)
  @Post('logout')
  logout(@Request() req: any) {
    return this.auth.logout(req.familia.jti);
  }

  @UseGuards(FamiliaAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return this.auth.me(req.familia.familiaId);
  }

  @UseGuards(FamiliaAuthGuard)
  @Get('demandas')
  listarDemandas(@Request() req: any) {
    return this.demandas.listarMinhas(req.familia.tenantId, req.familia.familiaId);
  }

  @UseGuards(FamiliaAuthGuard)
  @Get('demandas/:id')
  detalheDemanda(@Request() req: any, @Param('id') id: string) {
    return this.demandas.detalhe(req.familia.tenantId, req.familia.familiaId, id);
  }

  @UseGuards(FamiliaAuthGuard)
  @Post('demandas')
  criarDemanda(@Request() req: any, @Body() body: any) {
    return this.demandas.criar(req.familia.tenantId, req.familia.familiaId, req.familia.nomeFamilia, body);
  }

  @UseGuards(FamiliaAuthGuard)
  @Post('demandas/:id/andamentos')
  @UseInterceptors(FileInterceptor('file'))
  adicionarAndamento(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('texto') texto?: string,
    @Body('nome') nome?: string,
  ) {
    return this.demandas.adicionarAndamento(
      req.familia.tenantId,
      req.familia.familiaId,
      id,
      texto,
      req.familia.nomeFamilia,
      file,
      nome,
    );
  }
}
