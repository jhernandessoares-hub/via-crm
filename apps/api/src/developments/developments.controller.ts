import { Controller, ForbiddenException, Get, Post, Patch, Delete, Put, Body, Param, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevelopmentsService } from './developments.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER do tenant.');
}

/** Externo Consultivo (PARTNER) é só consulta no espelho — nunca altera unidades. */
function denyPartner(req: any) {
  if (req.user?.role === 'PARTNER') {
    throw new ForbiddenException('Sem autorização: o Externo Consultivo só pode visualizar o espelho.');
  }
}

@UseGuards(JwtAuthGuard)
@Controller('developments')
export class DevelopmentsController {
  constructor(private readonly svc: DevelopmentsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.svc.findAll(req.user.tenantId, req.user.role);
  }

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.svc.create(req.user.tenantId, body);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.svc.findOne(req.user.tenantId, id, req.user.role);
  }

  @Post(':id/publish')
  publish(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.publish(req.user.tenantId, id);
  }

  @Post(':id/unpublish')
  unpublish(@Request() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.unpublish(req.user.tenantId, id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.svc.remove(req.user.tenantId, id);
  }

  @Get(':id/dashboard')
  getDashboard(@Request() req: any, @Param('id') id: string) {
    return this.svc.getDashboard(req.user.tenantId, id);
  }

  @Post(':id/towers')
  createTower(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createTower(req.user.tenantId, id, body);
  }

  @Patch(':id/towers/:towerId')
  updateTower(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    return this.svc.updateTower(req.user.tenantId, id, towerId, body);
  }

  @Delete(':id/towers/:towerId')
  removeTower(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string) {
    return this.svc.removeTower(req.user.tenantId, id, towerId);
  }

  @Post(':id/towers/:towerId/duplicate')
  duplicateTower(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body('nome') nome: string) {
    return this.svc.duplicateTower(req.user.tenantId, id, towerId, nome);
  }

  @Post(':id/towers/:towerId/units/bulk')
  bulkCreateUnits(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    return this.svc.bulkCreateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/towers/:towerId/units/bulk')
  bulkUpdateUnits(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    return this.svc.bulkUpdateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/units/bulk-individual')
  bulkUpdateUnitsIndividual(@Request() req: any, @Param('id') id: string, @Body() body: { units: any[] }) {
    return this.svc.bulkUpdateUnitsIndividual(req.user.tenantId, id, body.units ?? []);
  }

  @Patch(':id/units/:unitId/unlink')
  unlinkUnit(@Request() req: any, @Param('id') id: string, @Param('unitId') unitId: string) {
    denyPartner(req);
    return this.svc.unlinkUnit(req.user.tenantId, id, unitId, { id: req.user.sub, nome: req.user.nome });
  }

  @Patch(':id/units/:unitId')
  updateUnit(@Request() req: any, @Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any) {
    denyPartner(req);
    return this.svc.updateUnit(req.user.tenantId, id, unitId, body, { id: req.user.sub, nome: req.user.nome, role: req.user.role });
  }

  @Get(':id/payment-condition')
  getPaymentCondition(@Request() req: any, @Param('id') id: string) {
    return this.svc.getPaymentCondition(req.user.tenantId, id);
  }

  @Put(':id/payment-condition')
  upsertPaymentCondition(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.upsertPaymentCondition(req.user.tenantId, id, body);
  }

  @Patch(':id/grid')
  updateGrid(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateGrid(req.user.tenantId, id, body);
  }

  @Post(':id/implantation/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadImplantationImage(@Request() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    return this.svc.uploadImplantationImage(req.user.tenantId, id, file);
  }

  @Post(':id/upload-model')
  @UseInterceptors(FileInterceptor('file'))
  uploadModel(@Request() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    requireOwner(req);
    return this.svc.uploadModel(req.user.tenantId, id, file);
  }

  // ─── Mídia ────────────────────────────────────────────────────────────────

  @Get(':id/media')
  listMedia(@Request() req: any, @Param('id') id: string, @Query('categoria') categoria?: string) {
    return this.svc.listMedia(req.user.tenantId, id, categoria);
  }

  @Post(':id/media')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(@Request() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body('categoria') categoria: string, @Body('titulo') titulo?: string) {
    return this.svc.uploadMedia(req.user.tenantId, id, file, categoria, titulo);
  }

  @Patch(':id/media/:mediaId')
  patchMedia(@Request() req: any, @Param('id') id: string, @Param('mediaId') mediaId: string, @Body() body: any) {
    return this.svc.patchMedia(req.user.tenantId, id, mediaId, body);
  }

  @Delete(':id/media/:mediaId')
  deleteMedia(@Request() req: any, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.svc.deleteMedia(req.user.tenantId, id, mediaId);
  }

  // ─── Evolução de Obra ─────────────────────────────────────────────────────

  @Get(':id/obra-updates')
  listObraUpdates(@Request() req: any, @Param('id') id: string) {
    return this.svc.listObraUpdates(req.user.tenantId, id);
  }

  @Post(':id/obra-updates')
  createObraUpdate(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.createObraUpdate(req.user.tenantId, id, body);
  }

  @Patch(':id/obra-updates/:updateId')
  updateObraUpdate(@Request() req: any, @Param('id') id: string, @Param('updateId') updateId: string, @Body() body: any) {
    return this.svc.updateObraUpdate(req.user.tenantId, id, updateId, body);
  }

  @Delete(':id/obra-updates/:updateId')
  deleteObraUpdate(@Request() req: any, @Param('id') id: string, @Param('updateId') updateId: string) {
    return this.svc.deleteObraUpdate(req.user.tenantId, id, updateId);
  }

  @Post(':id/obra-updates/:updateId/fotos')
  @UseInterceptors(FileInterceptor('file'))
  uploadObraFoto(@Request() req: any, @Param('id') id: string, @Param('updateId') updateId: string, @UploadedFile() file: any, @Body('legenda') legenda?: string) {
    return this.svc.uploadObraFoto(req.user.tenantId, id, updateId, file, legenda);
  }

  @Delete(':id/obra-updates/:updateId/fotos/:fotoId')
  deleteObraFoto(@Request() req: any, @Param('id') id: string, @Param('updateId') updateId: string, @Param('fotoId') fotoId: string) {
    return this.svc.deleteObraFoto(req.user.tenantId, id, updateId, fotoId);
  }
}
