import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { AtividadesService } from './atividades.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/atividades')
export class AtividadesController {
  constructor(private readonly svc: AtividadesService) {}

  @Post()
  criar(@Request() req: any, @Body() body: any) {
    return this.svc.criar(req.user.tenantId, req.user.id ?? req.user.sub, body);
  }

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Get(':id')
  detalhe(@Request() req: any, @Param('id') id: string) {
    return this.svc.detalhe(req.user.tenantId, id);
  }

  @Patch(':id')
  atualizar(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.atualizar(req.user.tenantId, id, body);
  }

  @Post(':id/anexos')
  @UseInterceptors(FileInterceptor('file'))
  adicionarAnexo(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('tipo') tipo: string,
    @Body('legenda') legenda?: string,
  ) {
    return this.svc.adicionarAnexo(req.user.tenantId, id, file, tipo, legenda);
  }

  @Patch(':id/participantes/:familiaId/falta')
  marcarFalta(
    @Request() req: any,
    @Param('id') id: string,
    @Param('familiaId') familiaId: string,
    @Body('marcadoFaltaPor') marcadoFaltaPor?: string,
  ) {
    const quem = marcadoFaltaPor?.trim() || req.user?.nome || req.user?.email || req.user?.id;
    return this.svc.marcarFalta(req.user.tenantId, id, familiaId, quem);
  }

  @Post(':id/participantes/:familiaId/ficha')
  @UseInterceptors(FileInterceptor('file'))
  preencherFicha(
    @Request() req: any,
    @Param('id') id: string,
    @Param('familiaId') familiaId: string,
    @UploadedFile() file: any,
    @Body('avaliacao') avaliacao?: string,
    @Body('transcricaoFicha') transcricaoFicha?: string,
  ) {
    return this.svc.preencherFicha(req.user.tenantId, id, familiaId, file, { avaliacao, transcricaoFicha });
  }
}
