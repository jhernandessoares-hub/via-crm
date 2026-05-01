import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, Query,
  UseGuards, UseInterceptors, UploadedFile, ForbiddenException,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CampanhasService } from './campanhas.service';

@UseGuards(JwtAuthGuard)
@Controller('campanhas')
export class CampanhasController {
  constructor(private readonly service: CampanhasService) {}

  // ── MODELOS (templates pessoais do usuário) ───────────────────────────────

  @Get('modelos')
  listModelos(@Req() req: any) {
    return this.service.listModelos(req.user.tenantId, req.user.sub);
  }

  @Post('modelos')
  createModelo(@Req() req: any, @Body() body: any) {
    return this.service.createModelo(req.user.tenantId, req.user.sub, body);
  }

  @Patch('modelos/:id')
  updateModelo(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.updateModelo(id, req.user.tenantId, req.user.sub, body);
  }

  @Delete('modelos/:id')
  deleteModelo(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteModelo(id, req.user.tenantId, req.user.sub);
  }

  @Post('modelos/:id/media')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.service.uploadModeloMedia(id, req.user.tenantId, req.user.sub, file);
  }

  @Delete('modelos/:id/media')
  removeMedia(@Req() req: any, @Param('id') id: string) {
    return this.service.removeModeloMedia(id, req.user.tenantId, req.user.sub);
  }

  // ── VALIDAÇÃO WA ──────────────────────────────────────────────────────────

  @Post('validate-numbers')
  validateNumbers(@Req() req: any, @Body() body: { sessionId: string; numeros: string[] }) {
    return this.service.validateNumbers(body.sessionId, req.user.tenantId, body.numeros ?? []);
  }

  @Post('check-recampanha')
  checkRecampanha(@Req() req: any, @Body() body: { phones: string[] }) {
    return this.service.checkRecampanha(req.user.tenantId, body.phones ?? []);
  }

  // ── DISPAROS ──────────────────────────────────────────────────────────────

  @Get('disparos')
  listDisparos(@Req() req: any) {
    return this.service.listDisparos(req.user.tenantId);
  }

  @Get('disparos/active/:sessionId')
  getActive(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.service.getActiveDisparo(sessionId, req.user.tenantId);
  }

  @Get('disparos/:id')
  getDisparo(@Req() req: any, @Param('id') id: string) {
    return this.service.getDisparo(id, req.user.tenantId);
  }

  @Get('disparos/:id/contatos')
  listContatos(
    @Req() req: any,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listContatosDisparo(id, req.user.tenantId, page, limit);
  }

  @Post('disparos')
  createDisparo(@Req() req: any, @Body() body: any) {
    return this.service.createDisparo(req.user.tenantId, req.user.sub, body);
  }

  @Post('disparos/:id/pause')
  pause(@Req() req: any, @Param('id') id: string) {
    return this.service.pauseDisparo(id, req.user.tenantId);
  }

  @Post('disparos/:id/resume')
  resume(@Req() req: any, @Param('id') id: string) {
    return this.service.resumeDisparo(id, req.user.tenantId);
  }

  @Post('disparos/:id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.service.cancelDisparo(id, req.user.tenantId);
  }

  // ── ROTAS FLAT (usadas pelo frontend novo) ────────────────────────────────
  // Ficam APÓS as rotas com segmentos estáticos (modelos/disparos) para evitar
  // que /:id capture "modelos" ou "disparos" como ID.

  @Post()
  createRascunho(@Req() req: any, @Body() body: any) {
    return this.service.createRascunho(req.user.tenantId, req.user.sub, body);
  }

  @Get(':id')
  getDisparoFlat(@Req() req: any, @Param('id') id: string) {
    return this.service.getDisparo(id, req.user.tenantId);
  }

  @Get(':id/contatos')
  listContatosFlat(
    @Req() req: any,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.service.listContatosDisparo(id, req.user.tenantId, page, limit);
  }

  @Post(':id/contatos/lista')
  addContatosLista(@Req() req: any, @Param('id') id: string, @Body() body: { contatos: Array<{ telefone: string; nome?: string }> }) {
    return this.service.addContatosLista(id, req.user.tenantId, body.contatos ?? []);
  }

  @Post(':id/start')
  start(@Req() req: any, @Param('id') id: string) {
    return this.service.startDisparo(id, req.user.tenantId);
  }

  @Post(':id/pause')
  pauseFlat(@Req() req: any, @Param('id') id: string) {
    return this.service.pauseDisparo(id, req.user.tenantId);
  }

  @Post(':id/resume')
  resumeFlat(@Req() req: any, @Param('id') id: string) {
    return this.service.resumeDisparo(id, req.user.tenantId);
  }

  @Post(':id/cancel')
  cancelFlat(@Req() req: any, @Param('id') id: string) {
    return this.service.cancelDisparo(id, req.user.tenantId);
  }
}
