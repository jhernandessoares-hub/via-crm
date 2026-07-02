/**
 * Backfill LeadTransitionLog para leads SP9 que não têm nenhum registro.
 *
 * Contexto: scripts de importação do SP9 atribuíam stageId diretamente no banco
 * sem criar LeadTransitionLog. Isso fazia o botão "Histórico de Movimentações"
 * sumir completamente no frontend (condição transitions.length > 0).
 *
 * O que faz: para cada lead sem nenhum registro no LeadTransitionLog,
 * cria uma entrada inicial: fromStage=null → toStage=<etapa atual>, changedBy='IMPORT'.
 *
 * Uso (DATABASE_URL deve estar definido no ambiente):
 *   npx ts-node scripts/backfill-sp9-transition-logs.ts            (dry-run)
 *   npx ts-node scripts/backfill-sp9-transition-logs.ts --apply    (executa)
 *   npx ts-node scripts/backfill-sp9-transition-logs.ts --tenantId=<id>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const TENANT_ARG = process.argv.find((a) => a.startsWith('--tenantId='))?.split('=')[1];

async function main() {
  console.log(`[backfill-sp9-transition-logs] modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (TENANT_ARG) console.log(`  tenant filtrado: ${TENANT_ARG}`);

  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      stageId: { not: null },
      ...(TENANT_ARG ? { tenantId: TENANT_ARG } : {}),
      leadTransitionLogs: { none: {} },
    },
    select: {
      id: true,
      tenantId: true,
      criadoEm: true,
      stage: { select: { name: true } },
    },
  });

  console.log(`\nLeads sem LeadTransitionLog: ${leads.length}`);

  if (leads.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  for (const l of leads.slice(0, 10)) {
    console.log(`  lead=${l.id}  stage="${l.stage?.name ?? '?'}"  criadoEm=${l.criadoEm.toISOString()}`);
  }
  if (leads.length > 10) console.log(`  ... e mais ${leads.length - 10}`);

  if (!APPLY) {
    console.log('\n[DRY-RUN] Nenhuma alteração feita. Passe --apply para executar.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    const stageName = lead.stage?.name;
    if (!stageName) { skipped++; continue; }

    await prisma.leadTransitionLog.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        fromStage: null,
        toStage: stageName,
        changedBy: 'IMPORT',
        cascade: false,
        createdAt: lead.criadoEm,
      },
    });
    created++;
  }

  console.log(`\n[APPLY] Criados: ${created}  Ignorados (sem stage): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
