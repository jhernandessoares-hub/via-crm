import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { DemandasService } from './demandas.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/demandas')
export class DemandasController {
  constructor(private readonly svc: DemandasService) {}

  @Post()
  criar(@Request() req: any, @Body() body: any) {
    const quem = req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.criar(req.user.tenantId, body, quem);
  }

  @Get()
  listar(
    @Request() req: any,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('tipo') tipo?: string,
    @Query('semFamilia') semFamilia?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
  ) {
    return this.svc.listar(req.user.tenantId, { q, status, tipo, semFamilia: semFamilia === 'true', dataDe, dataAte });
  }

  // IMPORTANTE: precisa ficar antes de ':id', senão o Nest interpreta "contadores" como o :id.
  @Get('contadores')
  contadores(
    @Request() req: any,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
  ) {
    return this.svc.contadores(req.user.tenantId, { dataDe, dataAte });
  }

  @Get(':id')
  detalhe(@Request() req: any, @Param('id') id: string) {
    return this.svc.detalhe(req.user.tenantId, id);
  }

  @Post(':id/andamentos')
  @UseInterceptors(FileInterceptor('file'))
  adicionarAndamento(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('texto') texto?: string,
    @Body('nome') nome?: string,
  ) {
    const quem = req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.adicionarAndamento(req.user.tenantId, id, texto, quem, file, nome);
  }

  @Patch(':id/encerrar')
  encerrar(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.encerrar(req.user.tenantId, id, body);
  }

  @Post(':id/vincular-familia')
  vincularFamilia(@Request() req: any, @Param('id') id: string, @Body('leadId') leadId: string) {
    const quem = req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.vincularFamilia(req.user.tenantId, id, leadId, quem);
  }

  @Post(':id/anexos')
  @UseInterceptors(FileInterceptor('file'))
  adicionarAnexo(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('nome') nome?: string,
  ) {
    const quem = req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.adicionarAnexo(req.user.tenantId, id, file, nome, quem);
  }
}
