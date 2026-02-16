import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async create(@Body() body: { nome: string; slug: string }) {
    return this.tenantsService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list() {
    return this.tenantsService.list();
  }
}
