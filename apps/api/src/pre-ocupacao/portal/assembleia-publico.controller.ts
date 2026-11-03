import { Body, Controller, Get, Headers, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuestionarioThrottlerGuard } from './questionario-throttler.guard';
import { AssembleiaPublicoService } from './assembleia-publico.service';

/**
 * Rotas públicas (sem login) da assembleia — link individual por unidade enviado no
 * edital. Limite contado por link (mesmo guard do questionário). A página consulta o
 * estado a cada poucos segundos durante a assembleia, por isso o GET tem limite alto.
 */
@Controller('pre-ocupacao-assembleia')
export class AssembleiaPublicoController {
  constructor(private readonly svc: AssembleiaPublicoService) {}

  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 1500 } })
  @Get(':token')
  buscar(@Param('token') token: string, @Headers('x-assembleia-acesso') acesso?: string) {
    return this.svc.buscar(token, acesso);
  }

  // Limite baixo: evita tentativa e erro de CPF (por link)
  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 15 } })
  @Post(':token/credenciar')
  credenciar(@Param('token') token: string, @Body('cpf') cpf: string, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.svc.credenciar(token, cpf, ip, ua);
  }

  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 100 } })
  @Post(':token/votar')
  votar(@Param('token') token: string, @Body() body: any, @Headers('x-assembleia-acesso') acesso?: string) {
    return this.svc.votar(token, acesso, body?.itemId, body?.opcao);
  }
}
