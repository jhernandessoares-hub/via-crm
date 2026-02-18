import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    return this.authService.registerMaster({
      tenantId,
      nome: body.nome,
      email: body.email,
      senha,
    });
  }

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
}
