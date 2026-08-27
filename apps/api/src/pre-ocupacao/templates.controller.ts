import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { TemplatesService } from './templates.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Post()
  criar(@Request() req: any, @Body() body: { nome?: string; corpo?: string }) {
    return this.svc.criar(req.user.tenantId, body);
  }

  @Delete(':id')
  excluir(@Request() req: any, @Param('id') id: string) {
    return this.svc.excluir(req.user.tenantId, id);
  }
}
