import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuestionarioThrottlerGuard } from './questionario-throttler.guard';
import { QuestionarioPublicoService } from './questionario-publico.service';

/**
 * Rotas públicas (sem login) — link mágico do questionário enviado por
 * WhatsApp. Token verificado por hash no service, mesmo padrão do
 * `ConviteController`. `salvar` é chamado uma vez por tela (questionários
 * longos passam de 100 telas), por isso o limite é bem maior.
 *
 * Questionário com CPF: depois que o CPF confere, a tela manda a chave de
 * acesso no cabeçalho `X-Questionario-Acesso` (ver `QuestionarioPublicoService`).
 */
@Controller('pre-ocupacao-questionario')
export class QuestionarioPublicoController {
  constructor(private readonly svc: QuestionarioPublicoService) {}

  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 60 } })
  @Get(':token')
  buscar(@Param('token') token: string, @Headers('x-questionario-acesso') acesso?: string) {
    return this.svc.buscar(token, acesso);
  }

  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 600 } })
  @Post(':token/salvar')
  salvar(@Param('token') token: string, @Body() body: any, @Headers('x-questionario-acesso') acesso?: string) {
    return this.svc.salvar(token, body ?? {}, acesso);
  }

  // Limite baixo: evita tentativa e erro de CPF (por link)
  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 15 } })
  @Post(':token/verificar-cpf')
  verificarCpf(@Param('token') token: string, @Body('cpf') cpf: string) {
    return this.svc.verificarCpf(token, cpf);
  }

  @UseGuards(QuestionarioThrottlerGuard)
  @Throttle({ auth: { ttl: 900_000, limit: 20 } })
  @Post(':token/concluir')
  concluir(@Param('token') token: string, @Headers('x-questionario-acesso') acesso?: string) {
    return this.svc.concluir(token, acesso);
  }
}
