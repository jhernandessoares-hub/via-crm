import { Worker } from 'bullmq';
import { QueueService } from './queue.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { Logger } from '../logger';

const logger = new Logger('WaAuthPruneWorker');

// Poda diária do auth-state Baileys (pre-keys já consumidas + sessões/sender-keys
// de contatos inativos há muito tempo) — ver whatsapp-unofficial.service.ts para
// o porquê (vazamento de memória: o blob de chaves Signal crescia sem limite).
export function startWaAuthPruneWorker(
  whatsappUnofficialService: WhatsappUnofficialService,
  queueService: QueueService,
): Worker {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const worker = new Worker(
    'wa-auth-prune-queue',
    async () => {
      const result = await whatsappUnofficialService.pruneAllSessions();
      logger.log(
        `Poda de auth-state concluída — sessões=${result.sessions} preKeys removidas=${result.deletedPreKeys} sessões de contato removidas=${result.deletedSessions}`,
      );
    },
    { connection: { host, port, password }, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => logger.error('Erro na poda de auth-state WhatsApp Light', { error: err?.message }));

  queueService.scheduleWaAuthPruneRepeat().then(() => {
    logger.log('WA Auth Prune Worker iniciado (BullMQ cron: diário às 04:00)');
  });

  return worker;
}
