import { Body, Controller, ForbiddenException, Get, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // Requer segredo de provisionamento para criar tenants (protege criação pública)
  @Post()
  async create(@Body() body: { nome: string; slug: string; secret?: string }) {
    const secret = process.env.REGISTER_MASTER_SECRET;
    if (secret && body.secret !== secret) {
      throw new UnauthorizedException('Sem autorização para criar tenant.');
    }
    return this.tenantsService.create(body);
  }

  // Retorna apenas o tenant do usuário autenticado (isolamento multi-tenant)
  @UseGuards(JwtAuthGuard)
  @Get()
  async getMyTenant(@Req() req: any) {
    return this.tenantsService.getById(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bot-config')
  async getBotConfig(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.getBotConfig(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('whatsapp-settings')
  updateWhatsappSettings(
    @Req() req: any,
    @Body() body: { whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string },
  ) {
    requireOwner(req);
    return this.tenantsService.updateWhatsappSettings(req.user.tenantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('whatsapp-settings')
  getWhatsappSettings(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.getWhatsappSettings(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('bot-config')
  async updateBotConfig(@Req() req: any, @Body() body: {
    autopilotEnabled?: boolean;
    businessHours?: any;
    outsideHoursMessage?: string | null;
    aiDelayMin?: number;
    aiDelayMax?: number;
    aiTypingEnabled?: boolean;
    aiHistoryLimit?: number;
  }) {
    requireOwner(req);
    return this.tenantsService.updateBotConfig(req.user.tenantId, body);
  }

  // Qualquer usuário autenticado pode buscar as permissões do seu tenant
  @UseGuards(JwtAuthGuard)
  @Get('permissions-public')
  async getPermissionsPublic(@Req() req: any) {
    return this.tenantsService.getPermissions(req.user.tenantId);
  }

  // Somente OWNER pode ver e editar
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  async getPermissions(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.getPermissions(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('permissions')
  async updatePermissions(@Req() req: any, @Body() body: Record<string, any>) {
    requireOwner(req);
    return this.tenantsService.updatePermissions(req.user.tenantId, body);
  }
}
