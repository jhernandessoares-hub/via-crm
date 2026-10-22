import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite de tentativas do questionário contado POR LINK (token), não por IP.
 *
 * Por IP, famílias que dividem o mesmo endereço (Wi-Fi do CRAS num mutirão,
 * 4G atrás de CGNAT, e o próprio proxy do Railway, já que a API não lê o IP
 * real do X-Forwarded-For) dividiriam um único limite e travariam umas às
 * outras. Por link, cada família tem o seu — e a tentativa e erro de CPF fica
 * limitada no link atacado, mesmo trocando de IP.
 */
@Injectable()
export class QuestionarioThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = String(req.params?.token ?? '').slice(0, 128);
    return `questionario:${token}`;
  }
}
