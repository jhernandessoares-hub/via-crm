import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevelopmentsService } from './developments.service';

@UseGuards(JwtAuthGuard)
@Controller('developments')
export class DevelopmentsController {
  constructor(private readonly svc: DevelopmentsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.svc.findAll(req.user.tenantId);
  }

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.svc.create(req.user.tenantId, body);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.svc.findOne(req.user.tenantId, id);
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

  @Post(':id/towers/:towerId/units/bulk')
  bulkCreateUnits(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    return this.svc.bulkCreateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/towers/:towerId/units/bulk')
  bulkUpdateUnits(@Request() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    return this.svc.bulkUpdateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/units/:unitId')
  updateUnit(@Request() req: any, @Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any) {
    return this.svc.updateUnit(req.user.tenantId, id, unitId, body);
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
}
