import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Logger } from '../logger';
import { AgendamentoConviteService } from './agendamento-convite.service';
import { AtividadesService } from './atividades.service';

const QUEUE_NAME = 'pre-ocupacao-convite-agendamento-queue';
const JOB_NAME = 'pre-ocupacao-convite-agendamento-check';

/**
 * Worker autocontido (não passa por QueueService) — cria sua própria fila e
 * se registra via ciclo de vida do NestJS (`OnModuleInit`), sem precisar
 * mexer em `main.ts`/`queue.service.ts`. A cada 5 min (mesma cadência do
 * ReminderWorker), busca convites agendados vencidos e dispara via
 * `AtividadesService.enviarConvites()` — mesma lógica de envio já usada nos
 * disparos manuais.
 */
@Injectable()
export class AgendamentoConviteWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PreOcupacaoAgendamentoConviteWorker');
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly agendamentos: AgendamentoConviteService,
    private readonly atividades: AtividadesService,
  ) {}

  /**
   * NÃO faz `await` da configuração — Nest espera qualquer Promise retornada
   * por `onModuleInit()` ANTES de subir o servidor HTTP (`app.listen()`).
   * Se o Redis estiver indisponível (ex: dev local sem Redis rodando), um
   * `await` aqui travaria o boot inteiro pra sempre. Mesmo cuidado do
   * `startReminderWorker()` (main.ts), que também é fire-and-forget.
   */
  onModuleInit() {
    this.setup().catch((err) =>
      this.logger.error('Erro ao iniciar Agendamento Convite Worker', { error: err?.message }),
    );
  }

  private async setup() {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;
    const connection = { host, port, password };

    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(QUEUE_NAME, async () => this.checarVencidos(), { connection, concurrency: 1 });
    this.worker.on('failed', (_job, err) => this.logger.error('Erro no check de convites agendados', { error: err?.message }));

    await this.queue.removeRepeatable(JOB_NAME, { pattern: '*/5 * * * *' });
    await this.queue.add(JOB_NAME, {}, { repeat: { pattern: '*/5 * * * *' }, removeOnComplete: true, removeOnFail: false });
    this.logger.log('Agendamento Convite Worker iniciado (BullMQ cron: a cada 5 min)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async checarVencidos() {
    const vencidos = await this.agendamentos.buscarVencidos();
    for (const a of vencidos) {
      try {
        const familiaIds = Array.isArray(a.familiaIds) ? (a.familiaIds as string[]) : undefined;
        await this.atividades.enviarConvites(
          a.tenantId,
          a.atividadeId,
          { tenantId: a.tenantId, nome: 'Envio agendado' },
          familiaIds,
          a.mensagem,
          a.imagemUrl ?? undefined,
        );
        await this.agendamentos.marcarEnviado(a.id);
        this.logger.log(`Convite agendado enviado: id=${a.id}`);
      } catch (e: any) {
        await this.agendamentos.marcarErro(a.id, e?.message || String(e));
        this.logger.error(`Erro ao enviar convite agendado: id=${a.id}`, { error: e?.message });
      }
    }
  }
}
