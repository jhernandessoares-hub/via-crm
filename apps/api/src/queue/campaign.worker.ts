import { Worker, Job } from 'bullmq';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';

const logger = new Logger('CampaignWorker');

function getRedisConnection() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password };
}

function interpolate(template: string, nome: string | null, telefone: string): string {
  return template
    .replace(/\{\{nome\}\}/gi, nome || 'Prezado(a)')
    .replace(/\{\{telefone\}\}/gi, telefone);
}

function digitsOnly(v: string) {
  return (v || '').replace(/\D/g, '');
}

function telefoneKeyFrom(telefone: string): string {
  let d = digitsOnly(telefone);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  if (d.length >= 9) return d.slice(-9);
  return d;
}

async function processNext(
  disparoId: string,
  prisma: PrismaService,
  queue: QueueService,
  unofficial: WhatsappUnofficialService,
) {
  const disparo = await prisma.campanhaDisparo.findUnique({
    where: { id: disparoId },
    include: { modelo: true },
  });

  if (!disparo || disparo.status !== 'RODANDO') {
    logger.log(`Disparo ${disparoId} não está rodando — abortando`);
    return;
  }

  if (!disparo.sessionId) {
    logger.warn(`Disparo ${disparoId} sem sessão (inbox excluído) — cancelando`);
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { status: 'CANCELADA', concluidaEm: new Date() },
    });
    return;
  }

  const sessionId = disparo.sessionId;
  const tenantId = disparo.tenantId;

  const contato = await prisma.campanhaContato.findFirst({
    where: { disparoId, status: 'PENDENTE' },
    orderBy: { criadoEm: 'asc' },
  });

  if (!contato) {
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { status: 'CONCLUIDA', concluidaEm: new Date() },
    });
    logger.log(`✅ Disparo ${disparoId} concluído`);
    return;
  }

  const texto = interpolate(disparo.modelo.mensagem, contato.nome, contato.telefone);

  try {
    if (disparo.modelo.mediaUrl) {
      if (disparo.modelo.mediaType === 'VIDEO') {
        await unofficial.sendVideo(sessionId, contato.telefone, disparo.modelo.mediaUrl, texto);
      } else {
        await unofficial.sendImage(sessionId, contato.telefone, disparo.modelo.mediaUrl, texto);
      }
    } else {
      await unofficial.sendText(sessionId, contato.telefone, texto);
    }

    // Cria ou atualiza o lead para que a conversa apareça no inbox imediatamente
    const leadId = await upsertLeadParaCampanha(prisma, {
      tenantId,
      telefone: contato.telefone,
      nome: contato.nome ?? null,
      sessionId,
    });

    // Registra o evento de saída da campanha
    await prisma.leadEvent.create({
      data: {
        tenantId,
        leadId,
        channel: 'whatsapp.unofficial.out',
        payloadRaw: {
          text: texto,
          source: 'campanha',
          disparoId,
          sentAt: new Date().toISOString(),
        },
      },
    });

    // Marca contato como enviado e vincula ao lead
    await prisma.campanhaContato.update({
      where: { id: contato.id },
      data: { status: 'ENVIADO', enviadoEm: new Date(), leadId },
    });
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { enviados: { increment: 1 } },
    });
    logger.log(`📤 Enviado para ${contato.telefone} leadId=${leadId} — disparo=${disparoId}`);
  } catch (e: any) {
    await prisma.campanhaContato.update({
      where: { id: contato.id },
      data: { status: 'FALHA', erro: e?.message ?? 'Erro desconhecido' },
    });
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { falhas: { increment: 1 } },
    });
    logger.warn(`Falha ao enviar para ${contato.telefone}: ${e?.message}`);
  }

  const minMs = (disparo.modelo.delayMinSegundos ?? 5) * 1000;
  const maxMs = (disparo.modelo.delayMaxSegundos ?? 15) * 1000;
  const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await queue.scheduleCampaignNext(disparoId, delayMs);
}

async function upsertLeadParaCampanha(
  prisma: PrismaService,
  params: { tenantId: string; telefone: string; nome: string | null; sessionId: string },
): Promise<string> {
  const { tenantId, telefone, nome, sessionId } = params;
  const telefoneKey = telefoneKeyFrom(telefone);
  const telDigits = digitsOnly(telefone);

  const existing = telefoneKey
    ? await prisma.lead.findFirst({
        where: { tenantId, telefoneKey, deletedAt: null },
        select: { id: true },
        orderBy: { criadoEm: 'desc' },
      })
    : null;

  if (existing) {
    // Lead já existe — atualiza para a sessão da campanha
    await prisma.lead.update({
      where: { id: existing.id },
      data: { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: sessionId },
    });
    return existing.id;
  }

  const firstStageId = await prisma.pipelineStage
    .findFirst({ where: { tenantId, key: 'NOVO_LEAD' }, select: { id: true } })
    .then((s) => s?.id ?? null);

  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.lead.create({
      data: {
        tenantId,
        nome: nome || telDigits || 'Lead Campanha',
        telefone: telDigits || null,
        telefoneKey: telefoneKey || null,
        origem: 'Campanha WhatsApp Light',
        status: 'NOVO',
        stageId: firstStageId,
        conversaCanal: 'WHATSAPP_LIGHT',
        conversaSessionId: sessionId,
      },
      select: { id: true },
    });
    await tx.leadTransitionLog.create({
      data: { tenantId, leadId: c.id, fromStage: null, toStage: 'NOVO', changedBy: 'SYSTEM' },
    });
    return c;
  });

  return created.id;
}

export function startCampaignWorker(
  prisma: PrismaService,
  queue: QueueService,
  unofficial: WhatsappUnofficialService,
) {
  const worker = new Worker(
    'campaign-queue',
    async (job: Job) => {
      const { campanhaId } = job.data;
      if (!campanhaId) return;
      await processNext(campanhaId, prisma, queue, unofficial);
    },
    { connection: getRedisConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job falhou disparo=${job?.data?.campanhaId}: ${err?.message}`);
  });

  logger.log('CampaignWorker iniciado');
  return worker;
}
