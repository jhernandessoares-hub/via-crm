import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CorrespondentAuthGuard } from '../correspondents/correspondent-auth.guard';
import { CreditRequestsService } from './credit-requests.service';

// ── Tenant: gerencia solicitações de crédito do lead ─────────────────────────

@Controller('leads/:leadId/credit-requests')
@UseGuards(JwtAuthGuard)
export class LeadCreditRequestsController {
  constructor(private readonly svc: CreditRequestsService) {}

  @Get()
  list(@Req() req: any, @Param('leadId') leadId: string) {
    return this.svc.listForLead(req.user.tenantId, leadId);
  }

  @Post()
  create(@Req() req: any, @Param('leadId') leadId: string, @Body() body: any) {
    return this.svc.createForLead(req.user.tenantId, leadId, body);
  }

  @Delete(':id')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.svc.cancelRequest(req.user.tenantId, id);
  }
}

// ── Correspondente: suas demandas ─────────────────────────────────────────────

@Controller('correspondent/demands')
@UseGuards(CorrespondentAuthGuard)
export class CorrespondentDemandsController {
  constructor(private readonly svc: CreditRequestsService) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.listForCorrespondent(req.correspondent.sub);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.svc.getOneForCorrespondent(req.correspondent.sub, id);
  }

  @Patch(':id/status')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateStatus(req.correspondent.sub, id, body);
  }
}
