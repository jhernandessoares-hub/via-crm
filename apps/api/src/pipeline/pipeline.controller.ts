import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PipelineService } from './pipeline.service';

@UseGuards(JwtAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  /**
   * GET /pipeline/active/stages
   */
  @Get('active/stages')
  async getActiveStages(@Req() req: any) {
    // retorna lista ordenada de stages ativas do pipeline ativo (VENDAS)
    return this.pipelineService.getActiveStages(req.user.tenantId);
  }
}