import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Logger } from '../logger';
import { QuestionarioEnvioService } from './questionario-envio.service';

const QUEUE_NAME = 'pre-ocupacao-questionario-envio-queue';
const JOB_PROCESSAR = 'questionario-envio-processar';
const JOB_CHECK = 'questionario-envio-check';

/**
 * Worker autocontido (mesmo padrão do `AgendamentoConviteWorker`): cria a
 * própria fila no `onModuleInit`, sem mexer em `main.ts`. O disparo manual
 * enfileira um job de processamento; um cron a cada 1 min solta os envios
 * agendados cujo horário chegou e recolhe pendentes que tenham sobrado (ex.:
 * restart do processo no meio de um disparo).
 * Concorrência 1 — os envios saem um de cada vez, com intervalo.
 */
@Injectable()
export class QuestionarioEnvioWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PreOcupacaoQuestionarioEnvioWorker');
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly envios: QuestionarioEnvioService) {}

  /** Sem `await` — Redis fora do ar não pode travar o boot (ver AgendamentoConviteWorker). */
  onModuleInit() {
    this.setup().catch((err) =>
      this.logger.error('Erro ao iniciar Questionário Envio Worker', { error: err?.message }),
    );
  }

  private async setup() {
    const connection = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    };
    const queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(QUEUE_NAME, async () => this.envios.processarPendentes(), {
      connection,
      concurrency: 1,
      // um disparo grande pode levar mais de 1h (intervalo de até 20s por família)
      lockDuration: 60_000,
    });
    this.worker.on('failed', (_job, err) =>
      this.logger.error('Erro no processamento de envios de questionário', { error: err?.message }),
    );

    await queue.removeRepeatable(JOB_CHECK, { pattern: '*/5 * * * *' }); // cadência antiga (só existiu em dev)
    await queue.removeRepeatable(JOB_CHECK, { pattern: '* * * * *' });
    await queue.add(JOB_CHECK, {}, { repeat: { pattern: '* * * * *' }, removeOnComplete: true, removeOnFail: true });
    this.queue = queue;
    this.logger.log('Questionário Envio Worker iniciado (BullMQ, concorrência 1)');
  }

  /** Pede o processamento dos envios pendentes. Sem Redis, processa em background. */
  async enfileirar() {
    if (this.queue) {
      try {
        await this.queue.add(JOB_PROCESSAR, {}, { removeOnComplete: true, removeOnFail: true });
        return;
      } catch (e: any) {
        this.logger.warn(`Fila indisponível, processando em background: ${e?.message}`);
      }
    }
    setImmediate(() => {
      this.envios.processarPendentes().catch((err) =>
        this.logger.error('Erro ao processar envios em background', { error: err?.message }),
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
