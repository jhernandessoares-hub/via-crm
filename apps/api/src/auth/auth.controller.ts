import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-master')
  async registerMaster(
    @Body() body: { tenantId: string; nome: string; email: string; senha: string },
  ) {
    return this.authService.registerMaster(body);
  }

  @Post('login')
  async login(@Body() body: { tenantId: string; email: string; senha: string }) {
    return this.authService.login(body);
  }
}
