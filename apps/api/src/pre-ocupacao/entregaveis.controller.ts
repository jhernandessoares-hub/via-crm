import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { EntregaveisService } from './entregaveis.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/entregaveis')
export class EntregaveisController {
  constructor(private readonly svc: EntregaveisService) {}

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Get(':competencia')
  agregar(@Request() req: any, @Param('competencia') competencia: string) {
    return this.svc.agregarCompetencia(req.user.tenantId, competencia);
  }

  @Post(':competencia/gerar')
  gerar(@Request() req: any, @Param('competencia') competencia: string, @Body('geradoPor') geradoPor?: string) {
    const quem = geradoPor?.trim() || req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.gerarVersao(req.user.tenantId, competencia, quem);
  }

  @Get(':competencia/versoes')
  versoes(@Request() req: any, @Param('competencia') competencia: string) {
    return this.svc.listarVersoes(req.user.tenantId, competencia);
  }

  @Patch(':competencia/status')
  atualizarStatus(@Request() req: any, @Param('competencia') competencia: string, @Body() body: any) {
    return this.svc.atualizarStatus(req.user.tenantId, competencia, body);
  }
}
