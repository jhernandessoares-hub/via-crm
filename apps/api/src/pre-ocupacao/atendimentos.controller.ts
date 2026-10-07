import {
  Body,
  Controller,
  Get,
  Param,
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
import { AtendimentosService } from './atendimentos.service';

@UseGuards(JwtAuthGuard, AddonGuard)
@RequiresAddon('PRE_OCUPACAO')
@Controller('pre-ocupacao')
export class AtendimentosController {
  constructor(private readonly svc: AtendimentosService) {}

  private actor(req: any) {
    return { id: req.user?.id ?? req.user?.sub, nome: req.user?.nome || req.user?.email };
  }

  /** Quadro do "Encerrar conversa": família ativa? + mensagens da conversa atual. */
  @Get('leads/:leadId/atendimento-pendente')
  pendente(@Request() req: any, @Param('leadId') leadId: string) {
    return this.svc.pendentePorLead(req.user.tenantId, leadId);
  }

  /** Saiu do lead sem encerrar: conversa da família continua aberta e não lida. */
  @Post('leads/:leadId/manter-nao-lida')
  manterNaoLida(@Request() req: any, @Param('leadId') leadId: string) {
    return this.svc.manterNaoLida(req.user.tenantId, leadId);
  }

  /** Registra o atendimento e encerra a conversa do lead. */
  @Post('leads/:leadId/atendimentos')
  registrarPorEncerramento(@Request() req: any, @Param('leadId') leadId: string, @Body() body: any) {
    return this.svc.registrarPorEncerramento(req.user.tenantId, leadId, body ?? {}, this.actor(req));
  }

  @Get('familias/:familiaId/atendimentos')
  listarPorFamilia(@Request() req: any, @Param('familiaId') familiaId: string) {
    return this.svc.listarPorFamilia(req.user.tenantId, familiaId);
  }

  /** Atendimento presencial/telefone lançado dentro da família. */
  @Post('familias/:familiaId/atendimentos')
  registrarManual(@Request() req: any, @Param('familiaId') familiaId: string, @Body() body: any) {
    return this.svc.registrarManual(req.user.tenantId, familiaId, body ?? {}, this.actor(req));
  }

  @Get('atendimentos')
  listarPeriodo(@Request() req: any, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.svc.listarPeriodo(req.user.tenantId, de, ate);
  }

  @Get('atendimentos/:id')
  detalhe(@Request() req: any, @Param('id') id: string) {
    return this.svc.detalhe(req.user.tenantId, id);
  }

  @Post('atendimentos/:id/anexos')
  @UseInterceptors(FileInterceptor('file'))
  adicionarAnexo(@Request() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body('nome') nome?: string) {
    return this.svc.adicionarAnexo(req.user.tenantId, id, file, nome, this.actor(req).nome);
  }
}
