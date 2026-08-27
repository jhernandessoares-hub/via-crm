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
import { AgendamentoConviteService } from './agendamento-convite.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/atividades')
export class AtividadesController {
  constructor(
    private readonly svc: AtividadesService,
    private readonly agendamentos: AgendamentoConviteService,
  ) {}

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

  @Post(':id/participantes')
  adicionarParticipantes(@Request() req: any, @Param('id') id: string, @Body('familiaIds') familiaIds: string[]) {
    return this.svc.adicionarParticipantes(req.user.tenantId, id, familiaIds);
  }

  @Post(':id/convite')
  enviarConvites(
    @Request() req: any,
    @Param('id') id: string,
    @Body('familiaIds') familiaIds?: string[],
    @Body('mensagem') mensagem?: string,
    @Body('imagemUrl') imagemUrl?: string,
  ) {
    const user = { tenantId: req.user.tenantId, id: req.user.id ?? req.user.sub, nome: req.user.nome };
    return this.svc.enviarConvites(req.user.tenantId, id, user, familiaIds, mensagem, imagemUrl);
  }

  @Post(':id/convite/agendar')
  agendarConvite(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { familiaIds?: string[]; mensagem?: string; imagemUrl?: string; agendadoPara?: string },
  ) {
    const criadoPor = req.user?.nome || req.user?.email || req.user?.id;
    return this.agendamentos.criar(req.user.tenantId, id, criadoPor, body);
  }

  @Get(':id/agendamentos')
  listarAgendamentos(@Request() req: any, @Param('id') id: string) {
    return this.agendamentos.listar(req.user.tenantId, id);
  }

  @Patch('agendamentos/:agendamentoId/cancelar')
  cancelarAgendamento(@Request() req: any, @Param('agendamentoId') agendamentoId: string) {
    return this.agendamentos.cancelar(req.user.tenantId, agendamentoId);
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
