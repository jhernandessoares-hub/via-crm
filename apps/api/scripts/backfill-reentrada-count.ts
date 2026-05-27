/**
 * Backfill: zera reentradaCount para todos os leads e popula lastEntryChannel.
 *
 * Motivo: antes do fix, reentradaCount era incrementado em toda mensagem
 * do mesmo canal — inflando contadores. Agora só incrementa quando o canal muda.
 *
 * O que faz:
 *   - reentradaCount = 1 para todos os leads (zera inflação)
 *   - lastEntryChannel = conversaCanal ?? origem (evita falso positivo pós-migração)
 *
 * Rodar APÓS prisma db push:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/backfill-reentrada-count.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Buscando leads...');

  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: { id: true, conversaCanal: true, origem: true, reentradaCount: true },
  });

  console.log(`Total: ${leads.length} leads\n`);

  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const lastEntryChannel = (lead.conversaCanal as string | null) ?? lead.origem ?? null;

    // Só atualiza se reentradaCount > 1 ou lastEntryChannel ainda null
    const needsUpdate = lead.reentradaCount > 1 || lastEntryChannel !== null;
    if (!needsUpdate) {
      skipped++;
      continue;
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        reentradaCount: 1,
        lastEntryChannel,
      },
    });
    updated++;
  }

  console.log(`Atualizados: ${updated}`);
  console.log(`Sem alteração: ${skipped}`);
  console.log('\nBackfill concluído.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
