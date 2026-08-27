import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ConviteService } from './convite.service';

/**
 * Rotas públicas (sem login) — link mágico de confirmação de presença
 * enviado por WhatsApp. Token verificado por hash dentro do service, mesmo
 * padrão de channels-webhook.controller.ts (rota sem guard de autenticação).
 */
@Controller('pre-ocupacao-convite')
export class ConviteController {
  constructor(private readonly svc: ConviteService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Get(':token')
  buscar(@Param('token') token: string) {
    return this.svc.buscarPorToken(token);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Post(':token/responder')
  responder(@Param('token') token: string, @Body('confirmar') confirmar: boolean) {
    return this.svc.responder(token, !!confirmar);
  }
}
