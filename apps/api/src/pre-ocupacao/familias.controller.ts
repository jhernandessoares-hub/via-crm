import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { FamiliasService } from './familias.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao')
export class FamiliasController {
  constructor(private readonly svc: FamiliasService) {}

  @Post('leads/:leadId/ativar')
  ativar(@Request() req: any, @Param('leadId') leadId: string, @Body('ativadoPor') ativadoPor?: string) {
    const quem = ativadoPor?.trim() || req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.ativar(req.user.tenantId, leadId, quem);
  }

  @Get('leads/:leadId')
  resumoPorLead(@Request() req: any, @Param('leadId') leadId: string) {
    return this.svc.resumoPorLead(req.user.tenantId, leadId);
  }

  @Get('familias')
  listar(@Request() req: any, @Query('take') take?: string, @Query('skip') skip?: string) {
    const t = take ? Number(take) : undefined;
    const s = skip ? Number(skip) : undefined;
    return this.svc.listar(req.user.tenantId, t, s);
  }

  @Get('familias/:familiaId')
  detalhe(@Request() req: any, @Param('familiaId') familiaId: string) {
    return this.svc.detalhe(req.user.tenantId, familiaId);
  }
}
