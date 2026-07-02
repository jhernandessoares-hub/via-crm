/**
 * Tampa-buraco: leads do SP9 SEM corretor (assignedUserId NULL) recebem um responsável,
 * alternando entre Tatiane e Camila (um pra cada, em sequência).
 *
 * REGRA ESTRITA (pedido do usuário): mexe APENAS na coluna assignedUserId.
 * NÃO altera updatedAt/criadoEm (não sobe o lead na lista), não muda status, não marca lido.
 * Por isso usa UPDATE SQL cru (Prisma .update bumparia @updatedAt).
 *
 * Dry-run por padrão. APPLY=1 para efetivar.
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/assign-sp9-orphan-leads.ts
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/assign-sp9-orphan-leads.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const TATIANE = { id: '3b5c5c5b-5e38-40dd-8472-0667a6d39069', nome: 'Tatiane' };
const CAMILA = { id: '46db22fd-61ca-487f-b12c-0aa5153df7e2', nome: 'Camila' };
const APPLY = process.env.APPLY === '1';

async function main() {
  console.log(`🚀 Atribuir leads órfãos SP9 → Tatiane/Camila (${APPLY ? 'APLICANDO' : 'DRY-RUN'})\n`);

  const orphans = await prisma.lead.findMany({
    where: { tenantId: TENANT_SP9, deletedAt: null, assignedUserId: null },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  });
  console.log(`Leads sem corretor: ${orphans.length}\n`);

  const tati: string[] = [];
  const cami: string[] = [];
  orphans.forEach((l, i) => (i % 2 === 0 ? tati : cami).push(l.id));

  console.log(`  Tatiane recebe: ${tati.length}`);
  console.log(`  Camila  recebe: ${cami.length}\n`);

  if (APPLY) {
    // UPDATE cru: só assignedUserId, sem tocar em updatedAt/criadoEm.
    if (tati.length)
      await prisma.$executeRawUnsafe(
        `UPDATE leads SET "assignedUserId" = $1 WHERE id = ANY($2::text[])`,
        TATIANE.id, tati,
      );
    if (cami.length)
      await prisma.$executeRawUnsafe(
        `UPDATE leads SET "assignedUserId" = $1 WHERE id = ANY($2::text[])`,
        CAMILA.id, cami,
      );
    console.log('✅ Atribuído. (apenas assignedUserId; updatedAt/criadoEm intactos)');
  } else {
    console.log('🔍 Dry-run. Para efetivar: APPLY=1 npx ts-node ... scripts/assign-sp9-orphan-leads.ts');
  }
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
