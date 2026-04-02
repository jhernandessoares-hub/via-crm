import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Rate limit reforçado: 5 tentativas/15 min por IP
  @Throttle({ auth: { ttl: 900_000, limit: 5 } })
  @Post('register-master')
  async registerMaster(
    @Body()
    body: {
      tenantId?: string;
      tenant?: string;
      nome: string;
      email: string;
      senha?: string;
      password?: string;
    },
  ) {
    const tenantId = (body.tenantId || body.tenant || '').toString().trim();
    const senha = (body.senha ?? body.password ?? '').toString();

    // Requer segredo de provisionamento para criar master users
    const secret = process.env.REGISTER_MASTER_SECRET;
    if (secret && body['secret'] !== secret) {
      throw new UnauthorizedException('Sem autorização para criar usuário master.');
    }

    return this.authService.registerMaster({
      tenantId,
      nome: body.nome,
      email: body.email,
      senha,
    });
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshAccessToken(body.refreshToken);
  }

  // Rate limit reforçado: 10 tentativas/15 min por IP
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Post('login')
  async login(
    @Body()
    body: {
      tenantId?: string;
      tenant?: string;
      email: string;
      senha?: string;
      password?: string;
    },
  ) {
    const tenantId = (body.tenantId || body.tenant || '').toString().trim();

    return this.authService.login({
      tenantId,
      email: body.email,
      senha: body.senha,
      password: body.password,
    });
  }

  // Rate limit: 5 solicitações/15 min por IP
  @Throttle({ auth: { ttl: 900_000, limit: 5 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email);
    // Sempre retorna 200 para não revelar se o email existe
    return { ok: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; password: string }) {
    await this.authService.resetPassword(body.token, body.password);
    return { ok: true };
  }
}
