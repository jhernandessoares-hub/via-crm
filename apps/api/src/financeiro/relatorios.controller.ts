import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { FinRelatoriosService } from './relatorios.service';

@Controller('admin/financeiro')
@UseGuards(PlatformAdminGuard)
export class FinRelatoriosController {
  constructor(private readonly service: FinRelatoriosService) {}

  @Get('dashboard')
  dashboard(@Req() req: any, @Query('mes') mes?: string, @Query('companyId') companyId?: string) {
    return this.service.dashboard(mes, req.platformAdmin?.sub, companyId);
  }

  @Get('fluxo-caixa')
  fluxoCaixa(
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('granularidade') granularidade?: 'dia' | 'mes',
    @Query('companyId') companyId?: string,
  ) {
    return this.service.fluxoCaixa(de, ate, granularidade === 'mes' ? 'mes' : 'dia', companyId);
  }

  @Get('dre')
  dre(@Query('de') de?: string, @Query('ate') ate?: string, @Query('companyId') companyId?: string) {
    return this.service.dre(de, ate, companyId);
  }

  @Get('balancete')
  balancete(@Query('de') de?: string, @Query('ate') ate?: string, @Query('companyId') companyId?: string) {
    return this.service.balancete(de, ate, companyId);
  }
}
