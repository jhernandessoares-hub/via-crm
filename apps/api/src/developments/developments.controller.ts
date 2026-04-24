import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
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

@Controller('products/:pid/units')
@UseGuards(JwtAuthGuard)
export class DevelopmentsController {
  constructor(private readonly svc: DevelopmentsService) {}

  @Get()
  list(@Req() req: any, @Param('pid') pid: string) {
    requireOwnerOrManager(req);
    return this.svc.list(req.user, pid);
  }

  @Post('bulk')
  bulkCreate(@Req() req: any, @Param('pid') pid: string, @Body() body: any) {
    requireOwner(req);
    const isTorre = body.floors && body.unitsPerFloor;
    if (isTorre) return this.svc.bulkCreate(req.user, pid, body);
    return this.svc.bulkCreateLots(req.user, pid, body);
  }

  @Post('recalc-prices')
  recalcPrices(@Req() req: any, @Param('pid') pid: string) {
    requireOwner(req);
    return this.svc.recalcPrices(req.user, pid);
  }

  @Post()
  create(@Req() req: any, @Param('pid') pid: string, @Body() body: any) {
    requireOwner(req);
    return this.svc.create(req.user, pid, body);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('pid') pid: string, @Param('id') id: string, @Body() body: any) {
    requireOwnerOrManager(req);
    return this.svc.update(req.user, pid, id, body);
  }

  @Post(':id/reserve')
  reserve(@Req() req: any, @Param('pid') pid: string, @Param('id') id: string, @Body() body: any) {
    requireOwnerOrManager(req);
    return this.svc.reserve(req.user, pid, id, body);
  }

  @Post(':id/sell')
  sell(@Req() req: any, @Param('pid') pid: string, @Param('id') id: string, @Body() body: any) {
    requireOwnerOrManager(req);
    return this.svc.sell(req.user, pid, id, body);
  }

  @Post(':id/release')
  release(@Req() req: any, @Param('pid') pid: string, @Param('id') id: string) {
    requireOwnerOrManager(req);
    return this.svc.release(req.user, pid, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('pid') pid: string, @Param('id') id: string) {
    requireOwner(req);
    return this.svc.remove(req.user, pid, id);
  }
}
