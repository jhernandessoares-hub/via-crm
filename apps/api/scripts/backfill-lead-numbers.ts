/**
 * Backfill de numero sequencial dos leads por tenant.
 *
 * Como rodar (a partir de apps/api):
 *   npx ts-node scripts/backfill-lead-numbers.ts
 *
 * Pré-requisito: rodar `npx prisma db push` ANTES, para o schema novo
 * (campos numero/reentradaCount e modelo TenantLeadCounter) já estar aplicado.
 *
 * O script é idempotente:
 *   - Pula leads que já têm `numero` preenchido.
 *   - Reaproveita o `TenantLeadCounter` existente como base se já houver.
 *
 * Estratégia:
 *   - Para cada tenant, busca TODOS os leads ordenados por criadoEm ASC
 *     (incluindo soft-deleted, para preservar ordem cronológica — eles
 *     ocupam números mas não aparecem na UI).
 *   - Atribui números sequencialmente começando de (lastNumber atual + 1)
 *     para leads ainda sem `numero`. Se nenhum lead tem número,
 *     começa do 1.
 *   - Atualiza o `TenantLeadCounter.lastNumber` para o último valor usado.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, nome: true },
    orderBy: { criadoEm: 'asc' },
  });

  console.log(`[backfill] tenants encontrados: ${tenants.length}`);

  let totalLeadsNumerados = 0;
  let totalLeadsJaNumerados = 0;

  for (const tenant of tenants) {
    const result = await prisma.$transaction(async (tx) => {
      // timeout generoso: backfill em Railway tem latência alta por update sequencial
      const leads = await tx.lead.findMany({
        where: { tenantId: tenant.id },
        orderBy: { criadoEm: 'asc' },
        select: { id: true, numero: true },
      });

      if (leads.length === 0) {
        return { numerados: 0, jaNumerados: 0, lastNumber: 0 };
      }

      // Maior numero já existente (para retomar de onde parou em re-execuções)
      const maxExisting = leads.reduce(
        (acc, l) => (typeof l.numero === 'number' && l.numero > acc ? l.numero : acc),
        0,
      );

      let counter = maxExisting;
      let numerados = 0;
      let jaNumerados = 0;

      for (const lead of leads) {
        if (typeof lead.numero === 'number' && lead.numero > 0) {
          jaNumerados++;
          continue;
        }
        counter++;
        await tx.lead.update({
          where: { id: lead.id },
          data: { numero: counter },
        });
        numerados++;
      }

      // Atualiza/cria o contador do tenant para refletir o ultimo numero usado
      await tx.tenantLeadCounter.upsert({
        where: { tenantId: tenant.id },
        create: { tenantId: tenant.id, lastNumber: counter },
        update: { lastNumber: counter },
      });

      return { numerados, jaNumerados, lastNumber: counter };
    }, { maxWait: 10_000, timeout: 600_000 });

    totalLeadsNumerados += result.numerados;
    totalLeadsJaNumerados += result.jaNumerados;

    console.log(
      `[backfill] tenant ${tenant.nome} (${tenant.id}): ` +
        `+${result.numerados} numerados, ${result.jaNumerados} ja tinham, ` +
        `lastNumber=${result.lastNumber}`,
    );
  }

  console.log(
    `\n[backfill] CONCLUIDO. Total numerados: ${totalLeadsNumerados}. ` +
      `Total ja numerados (pulados): ${totalLeadsJaNumerados}.`,
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
