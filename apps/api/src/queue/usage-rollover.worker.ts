import { Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from './queue.service';
import { UsageService } from '../plans/usage.service';
import { Logger } from '../logger';

const logger = new Logger('UsageRolloverWorker');

export function startUsageRolloverWorker(
  prisma: PrismaService,
  queueService: QueueService,
): Worker {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const worker = new Worker(
    'usage-rollover-queue',
    async () => {
      const usageService = new UsageService(prisma);
      const removed = await usageService.rolloverMonthlyCounters();
      logger.log(`Rollover mensal concluído — ${removed} contadores removidos`);
    },
    { connection: { host, port, password }, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => logger.error('Erro no rollover de uso', { error: err?.message }));

  queueService.scheduleUsageRollover().then(() => {
    logger.log('Usage Rollover Worker iniciado (BullMQ cron: dia 1 de cada mês às 00:00)');
  });

  return worker;
}
