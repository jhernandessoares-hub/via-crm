import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddonGuard, RequiresAddon } from '../auth/plan.guard';
import { AssembleiasService } from './assembleias.service';

// Montar, convocar e conduzir a assembleia (abrir/fechar votação, encerrar) é só do
// Proprietário. Os demais papéis acompanham a mesa e fazem o credenciamento/voto
// presencial no tablet.
function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER do tenant.');
}

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao/assembleias')
export class AssembleiasController {
  constructor(private readonly svc: AssembleiasService) {}

  private quem(req: any): string {
    return req.user?.nome || req.user?.email || req.user?.id;
  }

  @Get()
  listar(@Request() req: any) {
    return this.svc.listar(req.user.tenantId);
  }

  // Antes de ':id' — NestJS resolve rotas na ordem de declaração
  @Get('empreendimentos')
  empreendimentos(@Request() req: any) {
    return this.svc.empreendimentos(req.user.tenantId);
  }

  @Post()
  criar(@Request() req: any, @Body() body: any) {
    requireOwner(req);
    return this.svc.criar(req.user.tenantId, this.quem(req), body ?? {});
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

  @Put(':id/itens')
  salvarItens(@Request() req: any, @Param('id') id: string, @Body('itens') itens: any[]) {
    requireOwner(req);
    return this.svc.salvarItens(req.user.tenantId, id, itens);
  }

  @Post(':id/unidades/sincronizar')
  sincronizar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.sincronizarUnidades(req.user.tenantId, id);
  }

  @Patch(':id/unidades/:unidadeId/procurador')
  procurador(@Request() req: any, @Param('id') id: string, @Param('unidadeId') unidadeId: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.definirProcurador(req.user.tenantId, id, unidadeId, body ?? {}, this.quem(req));
  }

  @Post(':id/convocar')
  convocar(@Request() req: any, @Param('id') id: string, @Body('unidadeIds') unidadeIds?: string[]) {
    requireOwner(req);
    return this.svc.convocar(req.user.tenantId, id, this.quem(req), Array.isArray(unidadeIds) ? unidadeIds : undefined);
  }

  @Post(':id/unidades/:unidadeId/reenviar')
  reenviar(@Request() req: any, @Param('id') id: string, @Param('unidadeId') unidadeId: string) {
    requireOwner(req);
    return this.svc.reenviar(req.user.tenantId, id, unidadeId, this.quem(req));
  }

  @Post(':id/pausar-convocacao')
  pausar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.pausarConvocacao(req.user.tenantId, id, true, this.quem(req));
  }

  @Post(':id/retomar-convocacao')
  retomar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.pausarConvocacao(req.user.tenantId, id, false, this.quem(req));
  }

  @Post(':id/iniciar')
  iniciar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.iniciar(req.user.tenantId, id, this.quem(req));
  }

  @Put(':id/itens/:itemId/opcoes')
  opcoes(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string, @Body('opcoes') opcoes: string[]) {
    requireOwner(req);
    return this.svc.definirOpcoes(req.user.tenantId, id, itemId, opcoes, this.quem(req));
  }

  @Post(':id/itens/:itemId/abrir')
  abrir(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    requireOwner(req);
    return this.svc.abrirItem(req.user.tenantId, id, itemId, this.quem(req));
  }

  @Post(':id/itens/:itemId/fechar')
  fechar(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    requireOwner(req);
    return this.svc.fecharItem(req.user.tenantId, id, itemId, this.quem(req));
  }

  @Post(':id/encerrar')
  encerrar(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.encerrar(req.user.tenantId, id, this.quem(req));
  }

  @Get(':id/mesa')
  mesa(@Request() req: any, @Param('id') id: string) {
    return this.svc.mesa(req.user.tenantId, id);
  }

  @Post(':id/presencial/credenciar')
  credenciarPresencial(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.credenciarPresencial(req.user.tenantId, id, String(body?.unidadeId ?? ''), String(body?.cpf ?? ''), this.quem(req));
  }

  @Post(':id/presencial/votar')
  votarPresencial(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.votarPresencial(req.user.tenantId, id, body ?? {}, this.quem(req));
  }

  @Get(':id/relatorio')
  relatorio(@Request() req: any, @Param('id') id: string) {
    return this.svc.relatorio(req.user.tenantId, id);
  }
}
