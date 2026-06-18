import { Body, Controller, Delete, ForbiddenException, Get, InternalServerErrorException, Param, Patch, Post, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsageService, ALL_USAGE_KEYS, USAGE_TO_LIMIT_KEY } from '../plans/usage.service';
import { LimitsService } from '../plans/limits.service';

function requireOwner(req: any) {
  if (req.user?.role !== 'OWNER') throw new ForbiddenException('Acesso restrito ao OWNER.');
}

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usageService: UsageService,
    private readonly limitsService: LimitsService,
  ) {}

  // Requer segredo de provisionamento para criar tenants (protege criação pública)
  @Post()
  async create(@Body() body: { nome: string; slug: string; secret?: string }) {
    const secret = process.env.REGISTER_MASTER_SECRET;
    if (!secret) throw new InternalServerErrorException('REGISTER_MASTER_SECRET não configurada');
    if (body.secret !== secret) {
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
  @Get('ai-status')
  async getAiStatus(@Req() req: any) {
    return this.tenantsService.getAiStatus(req.user.tenantId);
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

  @UseGuards(JwtAuthGuard)
  @Get('sla-config')
  async getSlaConfig(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.getSlaConfig(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sla-config')
  async updateSlaConfig(@Req() req: any, @Body() body: any) {
    requireOwner(req);
    return this.tenantsService.updateSlaConfig(req.user.tenantId, body);
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

  @UseGuards(JwtAuthGuard)
  @Get('branding')
  async getBranding(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.getBranding(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('branding')
  async updateBranding(@Req() req: any, @Body() body: { brandPalette?: string }) {
    requireOwner(req);
    return this.tenantsService.updateBranding(req.user.tenantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('branding/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Req() req: any, @UploadedFile() file: any) {
    requireOwner(req);
    return this.tenantsService.uploadBrandingImage(req.user.tenantId, 'logo', file.buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('branding/logo')
  async removeLogo(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.removeBrandingImage(req.user.tenantId, 'logo');
  }

  @UseGuards(JwtAuthGuard)
  @Post('branding/favicon')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFavicon(@Req() req: any, @UploadedFile() file: any) {
    requireOwner(req);
    return this.tenantsService.uploadBrandingImage(req.user.tenantId, 'favicon', file.buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('branding/favicon')
  async removeFavicon(@Req() req: any) {
    requireOwner(req);
    return this.tenantsService.removeBrandingImage(req.user.tenantId, 'favicon');
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage')
  async getUsage(@Req() req: any) {
    const role = req.user?.role;
    if (role !== 'OWNER' && role !== 'MANAGER') throw new ForbiddenException('Acesso restrito ao OWNER e MANAGER.');
    const tenantId = req.user.tenantId;
    const tenant = await this.tenantsService.getById(tenantId);
    const limits = await this.limitsService.getLimitsForTenant(tenantId);
    const result: Record<string, any> = {};
    for (const key of ALL_USAGE_KEYS) {
      const limitKey = USAGE_TO_LIMIT_KEY[key] ?? key;
      const limit = limits[limitKey] ?? -1;
      if (limit < 0) {
        result[key] = { used: await this.usageService.getCounter(tenantId, key), limit: -1, remaining: -1, percent: 0 };
      } else {
        result[key] = await this.usageService.getUsage(tenantId, key, limit);
      }
    }
    return { plan: (tenant as any).plan, usage: result };
  }
}
