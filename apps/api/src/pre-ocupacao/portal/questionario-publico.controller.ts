import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { QuestionarioPublicoService } from './questionario-publico.service';

/**
 * Rotas públicas (sem login) — link mágico do questionário enviado por
 * WhatsApp. Token verificado por hash no service, mesmo padrão do
 * `ConviteController`.
 */
@Controller('pre-ocupacao-questionario')
export class QuestionarioPublicoController {
  constructor(private readonly svc: QuestionarioPublicoService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 30 } })
  @Get(':token')
  buscar(@Param('token') token: string) {
    return this.svc.buscar(token);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 10 } })
  @Post(':token/responder')
  responder(@Param('token') token: string, @Body('respostas') respostas: Record<string, unknown>) {
    return this.svc.responder(token, respostas);
  }
}
