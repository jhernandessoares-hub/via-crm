import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from './admin-auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Auth ────────────────────────────────────────────────────────────────
  @Post('login')
  login(@Body() body: { email: string; senha: string }) {
    return this.adminService.login(body.email, body.senha);
  }

  @Post('bootstrap')
  bootstrap(@Body() body: { email: string; senha: string; nome: string; secret: string }) {
    return this.adminService.bootstrap(body.email, body.senha, body.nome, body.secret);
  }

  // ── Tenants ─────────────────────────────────────────────────────────────
  @UseGuards(PlatformAdminGuard)
  @Get('tenants')
  listTenants(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listTenants(Number(page) || 1, Number(limit) || 20);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants')
  createTenant(@Body() body: { nome: string; slug: string; ownerNome: string; ownerEmail: string; ownerSenha: string; plan?: string }) {
    return this.adminService.createTenant(body);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.adminService.getTenant(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tenants/:id/stats')
  getTenantStats(@Param('id') id: string) {
    return this.adminService.getTenantStats(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('tenants/:id')
  updateTenant(@Param('id') id: string, @Body() body: {
    nome?: string; slug?: string;
    cidade?: string; estado?: string; site?: string; redesSociais?: string;
    proprietarioNome?: string; proprietarioTelefone?: string;
    whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string;
  }) {
    return this.adminService.updateTenant(id, body);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.adminService.suspendTenant(id, true);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/activate')
  activate(@Param('id') id: string) {
    return this.adminService.suspendTenant(id, false);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('tenants/:id/plan')
  updatePlan(@Param('id') id: string, @Body() body: { plan: string }) {
    return this.adminService.updatePlan(id, body.plan);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/impersonate')
  impersonate(@Param('id') id: string, @Req() req: any) {
    return this.adminService.impersonate(id, req.platformAdmin);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tenants/:id/export')
  exportTenant(@Param('id') id: string) {
    return this.adminService.exportTenantData(id);
  }

  // ── Users (dentro de tenant) ────────────────────────────────────────────
  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/users')
  createUser(@Param('id') id: string, @Body() body: { nome: string; email: string; senha: string; role?: string }) {
    return this.adminService.createUser(id, body);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('tenants/:id/users/:userId')
  updateUser(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { nome?: string; email?: string; role?: string }) {
    return this.adminService.updateUser(id, userId, body);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('tenants/:id/users/:userId/toggle')
  toggleUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.adminService.toggleUser(id, userId);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/users/:userId/reset-password')
  resetUserPassword(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { novaSenha: string }) {
    return this.adminService.resetUserPassword(id, userId, body.novaSenha);
  }

  @UseGuards(PlatformAdminGuard)
  @Delete('tenants/:id/users/:userId')
  deleteUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.adminService.deleteUser(id, userId);
  }

  // ── Health & Audit ───────────────────────────────────────────────────────
  @UseGuards(PlatformAdminGuard)
  @Get('health')
  health() {
    return this.adminService.getHealth();
  }

  @UseGuards(PlatformAdminGuard)
  @Get('audit-logs')
  auditLogs(@Query('page') page?: string, @Query('limit') limit?: string, @Query('tenantId') tenantId?: string) {
    return this.adminService.getAuditLogs(Number(page) || 1, Number(limit) || 50, tenantId);
  }
}
