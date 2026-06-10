import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('vendas')
  vendas(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.vendasReport(req.user.tenantId, req.user.role, from, to);
  }

  @Get('vendas/unidades')
  unidades(
    @Request() req: any,
    @Query('status') status: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('developmentId') developmentId?: string,
  ) {
    return this.svc.unidadesPorStatus(req.user.tenantId, req.user.role, status, from, to, developmentId);
  }
}
