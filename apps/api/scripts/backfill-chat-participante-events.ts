/**
 * Backfill: marca leadParticipanteId nos eventos de sistema "chat_incorporated" e
 * "chat_encerrado_aba" que foram criados ANTES da correção que passou a gravar
 * esse campo na hora da criação. Sem essa marcação, esses avisos apareciam sempre
 * na aba Principal do lead pai, em vez de só na aba da pessoa incorporada/encerrada.
 *
 * Como rodar (a partir de apps/api):
 *   npx ts-node scripts/backfill-chat-participante-events.ts
 *
 * O script é idempotente:
 *   - Só olha eventos com leadParticipanteId ainda NULL (já corrigidos ficam intactos).
 *   - Pode rodar quantas vezes quiser sem efeito colateral.
 *
 * Não mexe em "chat_desagrupado"/"chat_desagrupado_origem" — esses continuam sem
 * leadParticipanteId de propósito (o LeadParticipante já foi deletado quando esse
 * evento é criado; a reconstrução da aba cinza depende dele estar sem essa marcação).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIPOS_ALVO = ['chat_incorporated', 'chat_encerrado_aba'] as const;

async function main() {
  let totalCorrigidos = 0;
  let totalSemParticipante = 0;
  let totalSemDadoUtil = 0;

  for (const tipo of TIPOS_ALVO) {
    const eventos = await prisma.leadEvent.findMany({
      where: {
        channel: 'system',
        leadParticipanteId: null,
        payloadRaw: { path: ['type'], equals: tipo },
      },
      select: { id: true, tenantId: true, payloadRaw: true },
    });

    console.log(`[backfill] tipo=${tipo}: ${eventos.length} evento(s) sem leadParticipanteId`);

    for (const ev of eventos) {
      const p = ev.payloadRaw as any;
      const participanteId = typeof p?.participanteId === 'string' ? p.participanteId : null;

      if (!participanteId) {
        totalSemDadoUtil++;
        continue;
      }

      const participante = await prisma.leadParticipante.findUnique({
        where: { id: participanteId },
        select: { id: true, tenantId: true },
      });

      // Participante pode não existir mais (ex.: a pessoa foi desagrupada depois) —
      // nesse caso o evento fica como está, vira parte do histórico congelado.
      if (!participante || participante.tenantId !== ev.tenantId) {
        totalSemParticipante++;
        continue;
      }

      await prisma.leadEvent.update({
        where: { id: ev.id },
        data: { leadParticipanteId: participanteId },
      });
      totalCorrigidos++;
    }
  }

  console.log(
    `\n[backfill] CONCLUIDO. Corrigidos: ${totalCorrigidos}. ` +
      `Sem participante válido (mantidos como estão): ${totalSemParticipante}. ` +
      `Sem participanteId no payload (mantidos como estão): ${totalSemDadoUtil}.`,
  );
}

main()
  .catch((err) => {
    console.error('[backfill] erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
