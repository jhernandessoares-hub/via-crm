import { Body, Controller, Get, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
    return this.tenantsService.getBotConfig(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('whatsapp-settings')
  updateWhatsappSettings(
    @Req() req: any,
    @Body() body: { whatsappPhoneNumberId?: string; whatsappToken?: string; whatsappVerifyToken?: string },
  ) {
    return this.tenantsService.updateWhatsappSettings(req.user.tenantId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('whatsapp-settings')
  getWhatsappSettings(@Req() req: any) {
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
    return this.tenantsService.updateBotConfig(req.user.tenantId, body);
  }
}
