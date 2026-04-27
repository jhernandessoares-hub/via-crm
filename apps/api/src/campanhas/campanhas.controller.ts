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
}
