import { Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../secretary/whatsapp.service';
import { QueueService } from './queue.service';
import { Logger } from '../logger';

const logger = new Logger('ReminderWorker');

async function checkReminders(prisma: PrismaService, whatsapp: WhatsappService) {
  const now = new Date();
  const in25 = new Date(now.getTime() + 25 * 60 * 1000);
  const in35 = new Date(now.getTime() + 35 * 60 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      startAt: { gte: in25, lte: in35 },
      reminderSentAt: null,
      status: { notIn: ['CANCELADO', 'NO_SHOW'] as any },
    },
    select: { id: true, title: true, startAt: true, location: true, userId: true, tenantId: true },
  });

  for (const event of events) {
    try {
      const user = await prisma.user.findFirst({
        where: { id: event.userId },
        select: { whatsappNumber: true, secretaryName: true, nome: true },
      });

      if (!user?.whatsappNumber) {
        logger.warn(`Lembrete ignorado: usuário sem whatsappNumber (evento ${event.id})`);
        continue; // não marca reminderSentAt — se o usuário cadastrar o número, tenta de novo
      }

      const hora = new Date(event.startAt).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      });
      const nome = user.secretaryName?.trim() || user.nome || '';
      let msg = `🔔 ${nome ? nome + ', lembrete' : 'Lembrete'}: *${event.title}* começa em 30 minutos (${hora}).`;
      if (event.location) msg += `\n📍 ${event.location}`;

      await whatsapp.sendMessage(user.whatsappNumber, msg, event.tenantId);
      logger.log(`Lembrete enviado: evento "${event.title}" para ${user.whatsappNumber}`);

      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { reminderSentAt: now },
      });
    } catch (err: any) {
      logger.error(`Erro ao enviar lembrete para evento ${event.id}`, { error: err?.message });
    }
  }
}

export function startReminderWorker(
  prisma: PrismaService,
  whatsapp: WhatsappService,
  queueService: QueueService,
) {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const worker = new Worker(
    'reminder-queue',
    async () => {
      await checkReminders(prisma, whatsapp);
    },
    { connection: { host, port, password }, concurrency: 1 },
  );

  worker.on('completed', () => logger.log('Check de lembretes concluído'));
  worker.on('failed', (_job, err) => logger.error('Erro no check de lembretes', { error: err?.message }));

  // Registra o cron repetível no Redis (idempotente — deduplicado pelo QueueService)
  queueService.scheduleReminderRepeat().then(() => {
    logger.log('Reminder Worker iniciado (BullMQ cron: a cada 5 min)');
  });

  return worker;
}
