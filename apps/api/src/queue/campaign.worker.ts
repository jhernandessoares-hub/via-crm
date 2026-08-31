import { Worker, Job } from 'bullmq';
import { Logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { WhatsappUnofficialService } from '../whatsapp-unofficial/whatsapp-unofficial.service';
import { findOrCreateLeadByPhone, telefoneKeyFrom } from '../whatsapp/lead-upsert.helper';

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
  // disparo.criarLeadNoEnvio / disparo.leadStageId já vêm no objeto (colunas
  // nativas do model, findUnique sem `select` retorna todos os campos escalares).

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

  // Verifica se o número está no WhatsApp antes de tentar enviar.
  // Evita chamada desnecessária ao servidor WA e reduz risco de ban.
  const [validation] = await unofficial.validateNumbers(sessionId, [contato.telefone]);
  if (validation?.noWhatsapp) {
    await prisma.campanhaContato.update({
      where: { id: contato.id },
      data: { status: 'FALHA', erro: 'Número não está no WhatsApp' },
    });
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { falhas: { increment: 1 } },
    });
    logger.log(`⏭ ${contato.telefone} não está no WhatsApp — pulado (disparo=${disparoId})`);
    const minMs = disparo.modelo.delayMinSegundos * 1000;
    const maxMs = disparo.modelo.delayMaxSegundos * 1000;
    const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await queue.scheduleCampaignNext(disparoId, delayMs);
    return;
  }

  try {
    let sent: { id: string | null } | undefined;
    if (disparo.modelo.mediaUrl) {
      if (disparo.modelo.mediaType === 'VIDEO') {
        sent = await unofficial.sendVideo(sessionId, contato.telefone, disparo.modelo.mediaUrl, texto);
      } else {
        sent = await unofficial.sendImage(sessionId, contato.telefone, disparo.modelo.mediaUrl, texto);
      }
    } else {
      sent = await unofficial.sendText(sessionId, contato.telefone, texto);
    }

    // Por padrão, o lead só é criado quando o contato responder (handleInbound).
    // Quando `criarLeadNoEnvio` está ativo na campanha, cria (ou reaproveita via
    // dedup por telefoneKey) o lead já no momento do envio, na etapa escolhida
    // na criação da campanha.
    let leadIdParaContato = contato.leadId;
    const leadJaSemeado = !!contato.leadId;
    if (disparo.criarLeadNoEnvio && !leadIdParaContato) {
      try {
        const telefoneKey = telefoneKeyFrom(contato.telefone);
        const leadExistente = telefoneKey
          ? await prisma.lead.findFirst({
              where: { tenantId, telefoneKey, deletedAt: null },
              select: { id: true },
              orderBy: { criadoEm: 'desc' },
            })
          : null;

        if (leadExistente) {
          // Dedup: reaproveita o lead existente sem alterar etapa/progresso.
          leadIdParaContato = leadExistente.id;
        } else {
          const result = await findOrCreateLeadByPhone(prisma, {
            tenantId,
            from: contato.telefone,
            contactName: contato.nome,
            stageId: disparo.leadStageId,
            origem: 'Campanha WhatsApp',
            canal: 'WHATSAPP_LIGHT',
            setLastInboundAt: false,
          });
          leadIdParaContato = result.leadId;
        }
      } catch (e: any) {
        logger.warn(`Falha ao criar lead no envio (criarLeadNoEnvio) para ${contato.telefone}: ${e?.message}`);
      }
    }

    await prisma.campanhaContato.update({
      where: { id: contato.id },
      data: { status: 'ENVIADO', enviadoEm: new Date(), ...(leadIdParaContato ? { leadId: leadIdParaContato } : {}) },
    });
    await prisma.campanhaDisparo.update({
      where: { id: disparoId },
      data: { enviados: { increment: 1 } },
    });

    // Lead já vinculado ao contato: pode vir semeado (campanha de Base Fria) ou
    // ter acabado de ser criado/reaproveitado acima (criarLeadNoEnvio). Registra a
    // mensagem enviada na timeline e marca o canal atual como Light, para o
    // corretor ver o que foi disparado e responder pelo número certo.
    if (leadIdParaContato) {
      await prisma.leadEvent.create({
        data: {
          tenantId,
          leadId: leadIdParaContato,
          channel: 'whatsapp.unofficial.out',
          sourceRef: sent?.id ?? null,
          payloadRaw: {
            text: texto,
            source: leadJaSemeado ? 'campanha-base-fria' : 'campanha',
            disparoId,
            sentAt: new Date().toISOString(),
            // Formato que a timeline do lead renderiza (p.media.url): imagem/vídeo
            ...(disparo.modelo.mediaUrl
              ? {
                  type: disparo.modelo.mediaType === 'VIDEO' ? 'video' : 'image',
                  media: {
                    url: disparo.modelo.mediaUrl,
                    kind: disparo.modelo.mediaType === 'VIDEO' ? 'video' : 'image',
                    mimeType: disparo.modelo.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
                  },
                }
              : {}),
          },
        },
      });
      await prisma.lead.update({
        where: { id: leadIdParaContato },
        data: { conversaCanal: 'WHATSAPP_LIGHT', conversaSessionId: sessionId },
      }).catch(() => {});
    }
    logger.log(`📤 Enviado para ${contato.telefone} — disparo=${disparoId}`);
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

  const minMs = disparo.modelo.delayMinSegundos * 1000;
  const maxMs = disparo.modelo.delayMaxSegundos * 1000;
  const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await queue.scheduleCampaignNext(disparoId, delayMs);
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
      // Mensagem programada (Base Fria): no horário agendado, ativa o rascunho e dispara.
      if (job.name === 'campaign-start') {
        const d = await prisma.campanhaDisparo.findUnique({
          where: { id: campanhaId },
          select: { status: true },
        });
        if (!d || d.status !== 'RASCUNHO') {
          logger.log(`campaign-start ignorado disparo=${campanhaId} (status=${d?.status ?? 'inexistente'})`);
          return;
        }
        await prisma.campanhaDisparo.update({ where: { id: campanhaId }, data: { status: 'RODANDO' } });
        await queue.scheduleCampaignNext(campanhaId, 0);
        logger.log(`▶ Mensagem programada ativada disparo=${campanhaId}`);
        return;
      }
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
