import { Body, Controller, ForbiddenException, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { PlanejamentoTtsService } from './planejamento-tts.service';
import { UpdateAtividadeDto, UpdateIndicadorDto, UpdateParcelaDto } from './dto/planejamento-tts.dto';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PLANEJAMENTO_TTS')
@Controller('planejamento-tts')
export class PlanejamentoTtsController {
  constructor(private readonly svc: PlanejamentoTtsService) {}

  /** Módulo restrito por contrato: dados de faturamento não podem vazar para AGENT/PARTNER. */
  private assertOwnerOrManager(req: any) {
    const role = req.user?.role;
    if (role !== 'OWNER' && role !== 'MANAGER') {
      throw new ForbiddenException('Acesso restrito a OWNER e MANAGER.');
    }
  }

  @Get()
  getAll(@Request() req: any) {
    this.assertOwnerOrManager(req);
    return this.svc.getAll(req.user.tenantId);
  }

  @Patch('atividades/:id')
  updateAtividade(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateAtividadeDto) {
    this.assertOwnerOrManager(req);
    return this.svc.updateAtividade(req.user.tenantId, id, dto);
  }

  @Patch('parcelas/:id')
  updateParcela(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateParcelaDto) {
    this.assertOwnerOrManager(req);
    return this.svc.updateParcela(req.user.tenantId, id, dto);
  }

  @Patch('indicadores/:id')
  updateIndicador(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateIndicadorDto) {
    this.assertOwnerOrManager(req);
    return this.svc.updateIndicador(req.user.tenantId, id, dto);
  }
}
