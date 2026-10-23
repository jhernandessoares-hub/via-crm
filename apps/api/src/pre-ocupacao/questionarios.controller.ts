import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { QuestionariosService } from './questionarios.service';

// Criar/alterar perguntas, testes e o ciclo do questionário (publicar, encerrar, duplicar, excluir)
// é só do Proprietário; os demais papéis enviam, acompanham e veem o relatório.
function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER do tenant.');
}

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/questionarios')
export class QuestionariosController {
  constructor(private readonly svc: QuestionariosService) {}

  private quem(req: any): string {
    return req.user?.nome || req.user?.email || req.user?.id;
  }

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  @Post()
  criar(@Request() req: any, @Body() body: any) {
    requireOwner(req);
    return this.svc.criar(req.user.tenantId, this.quem(req), body ?? {});
  }

  // Antes de ':id' — NestJS resolve rotas na ordem de declaração
  @Get('familias/:familiaId')
  porFamilia(@Request() req: any, @Param('familiaId') familiaId: string) {
    return this.svc.porFamilia(req.user.tenantId, familiaId);
  }

  @Get(':id')
  detalhe(@Request() req: any, @Param('id') id: string) {
    return this.svc.detalhe(req.user.tenantId, id);
  }

  @Patch(':id')
  atualizar(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.atualizar(req.user.tenantId, id, body ?? {});
  }

  @Delete(':id')
  excluir(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.excluir(req.user.tenantId, id);
  }

  @Put(':id/perguntas')
  salvarPerguntas(@Request() req: any, @Param('id') id: string, @Body('perguntas') perguntas: any[]) {
    requireOwner(req);
    return this.svc.salvarPerguntas(req.user.tenantId, id, perguntas);
  }

  @Post(':id/publicar')
  publicar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.publicar(req.user.tenantId, id);
  }

  @Post(':id/encerrar')
  encerrar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.encerrar(req.user.tenantId, id);
  }

  @Post(':id/duplicar')
  duplicar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.duplicar(req.user.tenantId, id, this.quem(req));
  }

  @Post(':id/publico/preview')
  previewPublico(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.previewPublico(req.user.tenantId, id, {
      statusFamilia: Array.isArray(body?.statusFamilia) ? body.statusFamilia : undefined,
      acompanhamento: Array.isArray(body?.acompanhamento) ? body.acompanhamento : undefined,
      empreendimento: typeof body?.empreendimento === 'string' ? body.empreendimento : null,
    });
  }

  @Post(':id/enviar')
  enviar(
    @Request() req: any,
    @Param('id') id: string,
    @Body('familiaIds') familiaIds: string[],
    @Body('agendadoPara') agendadoPara?: string | null,
  ) {
    return this.svc.enviar(req.user.tenantId, id, familiaIds, this.quem(req), agendadoPara);
  }

  @Post(':id/cancelar-agendamento')
  cancelarAgendamento(@Request() req: any, @Param('id') id: string, @Body('envioId') envioId?: string) {
    return this.svc.cancelarAgendamento(req.user.tenantId, id, envioId || undefined, this.quem(req));
  }

  @Post(':id/envios/:envioId/cancelar-link')
  cancelarLink(@Request() req: any, @Param('id') id: string, @Param('envioId') envioId: string) {
    return this.svc.cancelarLink(req.user.tenantId, id, envioId, this.quem(req));
  }

  @Post(':id/pausar-envios')
  pausarEnvios(@Request() req: any, @Param('id') id: string) {
    return this.svc.pausarEnvios(req.user.tenantId, id, this.quem(req));
  }

  @Post(':id/retomar-envios')
  retomarEnvios(@Request() req: any, @Param('id') id: string) {
    return this.svc.retomarEnvios(req.user.tenantId, id, this.quem(req));
  }

  @Post(':id/testes')
  enviarTeste(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.enviarTeste(req.user.tenantId, id, body ?? {}, this.quem(req));
  }

  @Get(':id/testes')
  listarTestes(@Request() req: any, @Param('id') id: string) {
    return this.svc.listarTestes(req.user.tenantId, id);
  }

  @Delete(':id/testes/:envioId')
  excluirTeste(@Request() req: any, @Param('id') id: string, @Param('envioId') envioId: string) {
    requireOwner(req);
    return this.svc.excluirTeste(req.user.tenantId, id, envioId);
  }

  @Post(':id/aprovar-teste')
  aprovarTeste(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.aprovarTeste(req.user.tenantId, id, this.quem(req));
  }

  @Post(':id/reenviar-nao-respondidos')
  reenviarNaoRespondidos(@Request() req: any, @Param('id') id: string) {
    return this.svc.reenviarNaoRespondidos(req.user.tenantId, id);
  }

  @Post(':id/envios/:envioId/reenviar')
  reenviar(@Request() req: any, @Param('id') id: string, @Param('envioId') envioId: string) {
    return this.svc.reenviar(req.user.tenantId, id, envioId, this.quem(req));
  }

  @Get(':id/envios/:envioId/historico')
  historico(@Request() req: any, @Param('id') id: string, @Param('envioId') envioId: string) {
    return this.svc.historicoDoEnvio(req.user.tenantId, id, envioId);
  }

  @Get(':id/envios/:envioId')
  respostasDoEnvio(@Request() req: any, @Param('id') id: string, @Param('envioId') envioId: string) {
    return this.svc.respostasDoEnvio(req.user.tenantId, id, envioId);
  }

  @Get(':id/acompanhamento')
  acompanhamento(@Request() req: any, @Param('id') id: string) {
    return this.svc.acompanhamento(req.user.tenantId, id);
  }

  @Get(':id/relatorio')
  relatorio(@Request() req: any, @Param('id') id: string) {
    return this.svc.relatorio(req.user.tenantId, id);
  }
}
