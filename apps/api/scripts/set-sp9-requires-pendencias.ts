/**
 * Marca requiresPendencias=true na etapa "Docs Pendente" (SP9_DOCS_PENDENTE) do funil SP9.
 *
 * Efeito: ao mover um lead PARA essa etapa, o sistema exige registrar ao menos uma
 * pendência (modal na transição); só libera a SAÍDA quando todas as pendências
 * estiverem resolvidas.
 *
 * Rodar APÓS deploy (prisma db push já criou a coluna requiresPendencias):
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/set-sp9-requires-pendencias.ts
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

// Etapas que controlam pendências de documentação.
const PENDENCIA_KEYS = ['SP9_DOCS_PENDENTE'];

async function main() {
  console.log('🚀 Configurando requiresPendencias no funil SP9...\n');

  // Zera tudo primeiro (idempotente) para não deixar resíduo de execuções anteriores.
  await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9 },
    data: { requiresPendencias: false },
  });

  const result = await prisma.pipelineStage.updateMany({
    where: {
      tenantId: TENANT_SP9,
      key: { in: PENDENCIA_KEYS },
    },
    data: { requiresPendencias: true },
  });

  console.log(`✅ ${result.count} status marcados com requiresPendencias=true.\n`);

  const stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_SP9, isActive: true, requiresPendencias: true },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    select: { key: true, name: true, group: true },
  });

  for (const s of stages) {
    console.log(`  [${s.group}] ${s.name} → 📋 pendências`);
  }

  console.log('\n✅ Concluído.');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
