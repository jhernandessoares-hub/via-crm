import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FinEntryType } from '@prisma/client';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinLancamentosService } from './lancamentos.service';
import { FinRecorrenciasService } from './recorrencias.service';
import { BaixarLancamentoDto, CreateLancamentoDto, UpdateLancamentoDto } from './dto/lancamentos.dto';

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinLancamentosController {
  constructor(
    private readonly service: FinLancamentosService,
    private readonly recorrencias: FinRecorrenciasService,
  ) {}

  @Get('lancamentos')
  async list(
    @Req() req: any,
    @Query('tipo') tipo?: FinEntryType,
    @Query('status') status?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('contactId') contactId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('busca') busca?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    // Contas a receber dispara a geração lazy das mensalidades da competência corrente
    if (tipo === 'RECEBER') {
      await this.recorrencias.gerarCompetenciaCorrenteSilencioso(req.platformAdmin?.sub);
    }
    return this.service.list({
      tipo,
      status,
      de,
      ate,
      categoriaId,
      contactId,
      tenantId,
      busca,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || undefined,
    });
  }

  @Post('lancamentos')
  create(@Body() dto: CreateLancamentoDto, @Req() req: any) {
    return this.service.create(dto, req.platformAdmin?.sub);
  }

  @Patch('lancamentos/:id')
  update(@Param('id') id: string, @Body() dto: UpdateLancamentoDto, @Req() req: any) {
    return this.service.update(id, dto, req.platformAdmin?.sub);
  }

  @Post('lancamentos/:id/cancelar')
  cancelar(@Param('id') id: string, @Req() req: any) {
    return this.service.cancelar(id, req.platformAdmin?.sub);
  }

  @Post('lancamentos/:id/baixar')
  baixar(@Param('id') id: string, @Body() dto: BaixarLancamentoDto, @Req() req: any) {
    return this.service.baixar(id, dto, req.platformAdmin?.sub);
  }

  @Delete('pagamentos/:id')
  estornar(@Param('id') id: string, @Req() req: any) {
    return this.service.estornarPagamento(id, req.platformAdmin?.sub);
  }
}
