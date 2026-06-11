import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { SalesLeadsService } from './sales-leads.service';
import type { CreateSalesLeadInput } from './sales-leads.service';

// Endpoint público — site institucional ("Falar com vendas")
@Controller('sales-leads')
export class SalesLeadsController {
  constructor(private readonly service: SalesLeadsService) {}

  @Post()
  create(@Body() body: CreateSalesLeadInput) {
    return this.service.create(body);
  }
}

// Endpoints do Platform Admin
@Controller('admin/sales-leads')
export class AdminSalesLeadsController {
  constructor(private readonly service: SalesLeadsService) {}

  @UseGuards(PlatformAdminGuard)
  @Get()
  list() {
    return this.service.list();
  }

  @UseGuards(PlatformAdminGuard)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.service.updateStatus(id, body.status);
  }
}
