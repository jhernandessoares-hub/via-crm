import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevelopmentsService } from './developments.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new Error('Apenas OWNER pode executar esta ação');
}

function requireOwnerOrManager(req: any) {
  if (!['OWNER', 'MANAGER'].includes(req.user?.role)) {
    throw new Error('Apenas OWNER ou MANAGER podem executar esta ação');
  }
}

@Controller('developments')
@UseGuards(JwtAuthGuard)
export class DevelopmentsController {
  constructor(private readonly svc: DevelopmentsService) {}

  // ── Developments ──────────────────────────────────────────────────────────

  @Get()
  list(@Req() req: any) {
    requireOwnerOrManager(req);
    return this.svc.list(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    requireOwnerOrManager(req);
    return this.svc.findOne(req.user.tenantId, id);
  }

  @Get(':id/dashboard')
  dashboard(@Req() req: any, @Param('id') id: string) {
    requireOwnerOrManager(req);
    return this.svc.dashboard(req.user.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    requireOwner(req);
    return this.svc.create(req.user.tenantId, body);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.update(req.user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.remove(req.user.tenantId, id);
  }

  // ── Torres ────────────────────────────────────────────────────────────────

  @Post(':id/towers')
  createTower(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.createTower(req.user.tenantId, id, body);
  }

  @Patch(':id/towers/:towerId')
  updateTower(@Req() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.updateTower(req.user.tenantId, id, towerId, body);
  }

  @Delete(':id/towers/:towerId')
  removeTower(@Req() req: any, @Param('id') id: string, @Param('towerId') towerId: string) {
    requireOwner(req);
    return this.svc.removeTower(req.user.tenantId, id, towerId);
  }

  // ── Unidades ──────────────────────────────────────────────────────────────

  @Post(':id/towers/:towerId/units/bulk')
  bulkCreateUnits(@Req() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    requireOwner(req);
    const isLot = body.total != null;
    if (isLot) return this.svc.bulkCreateLots(req.user.tenantId, id, towerId, body);
    return this.svc.bulkCreateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/towers/:towerId/units/bulk')
  bulkUpdateUnits(@Req() req: any, @Param('id') id: string, @Param('towerId') towerId: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.bulkUpdateUnits(req.user.tenantId, id, towerId, body);
  }

  @Patch(':id/units/:unitId')
  updateUnit(@Req() req: any, @Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any) {
    requireOwnerOrManager(req);
    return this.svc.updateUnit(req.user.tenantId, id, unitId, body);
  }

  @Delete(':id/units/:unitId')
  removeUnit(@Req() req: any, @Param('id') id: string, @Param('unitId') unitId: string) {
    requireOwner(req);
    return this.svc.removeUnit(req.user.tenantId, id, unitId);
  }

  // ── Condições de Pagamento ─────────────────────────────────────────────────

  @Get(':id/payment-condition')
  getPaymentCondition(@Req() req: any, @Param('id') id: string) {
    requireOwnerOrManager(req);
    return this.svc.getPaymentCondition(req.user.tenantId, id);
  }

  @Put(':id/payment-condition')
  upsertPaymentCondition(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.upsertPaymentCondition(req.user.tenantId, id, body);
  }
}
