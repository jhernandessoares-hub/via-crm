import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinRecorrenciasService } from './recorrencias.service';
import {
  CreateRecorrenciaDto,
  GerarCompetenciaDto,
  UpdateRecorrenciaDto,
  UpsertMensalidadeDto,
} from './dto/recorrencias.dto';

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinRecorrenciasController {
  constructor(private readonly service: FinRecorrenciasService) {}

  // ⚠️ Rotas específicas ANTES de recorrencias/:id (NestJS resolve em ordem)

  @Get('recorrencias/mensalidades')
  listMensalidades() {
    return this.service.listMensalidades();
  }

  @Put('recorrencias/mensalidades/:tenantId')
  upsertMensalidade(@Param('tenantId') tenantId: string, @Body() dto: UpsertMensalidadeDto, @Req() req: any) {
    return this.service.upsertMensalidade(tenantId, dto, req.platformAdmin?.sub);
  }

  @Get('recorrencias/status')
  status(@Query('competencia') competencia?: string) {
    return this.service.status(competencia);
  }

  @Post('recorrencias/gerar')
  gerar(@Body() dto: GerarCompetenciaDto, @Req() req: any) {
    return this.service.gerar(dto.competencia, req.platformAdmin?.sub, 'manual');
  }

  @Get('recorrencias')
  list() {
    return this.service.list();
  }

  @Post('recorrencias')
  create(@Body() dto: CreateRecorrenciaDto, @Req() req: any) {
    return this.service.create(dto, req.platformAdmin?.sub);
  }

  @Patch('recorrencias/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRecorrenciaDto, @Req() req: any) {
    return this.service.update(id, dto, req.platformAdmin?.sub);
  }

  @Delete('recorrencias/:id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.service.delete(id, req.platformAdmin?.sub);
  }
}
