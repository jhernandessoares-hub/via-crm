/**
 * Fix pontual: corrige os 7 leads do SP9 que ficaram com NOVO_LEAD (inativo).
 * Lógica: todos têm conversas → vai para SP9_EM_CONTATO + seta pipelineId.
 *
 * Rodar: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/fix-sp9-leads-stage.ts
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9             = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const STAGE_NOVO_LEAD_INATIVO = '79975d8d-0510-45e8-b196-ddf840e4b90a';
const STAGE_SP9_EM_CONTATO   = '64ac6c2b-6a7c-40ec-94c4-ed2a653d66dc';
const PIPELINE_SP9_VENDAS    = '3a302ed8-a859-4856-ab8f-a2f9c71aaa81';

async function main() {
  // Lista leads antes de alterar
  const antes = await prisma.lead.findMany({
    where: { tenantId: TENANT_SP9, stageId: STAGE_NOVO_LEAD_INATIVO, deletedAt: null },
    select: { id: true, nome: true },
  });

  if (antes.length === 0) {
    console.log('Nenhum lead encontrado com NOVO_LEAD inativo. Nada a fazer.');
    return;
  }

  console.log(`Leads a corrigir (${antes.length}):`);
  antes.forEach((l) => console.log(`  - ${l.nome} (${l.id})`));

  const result = await prisma.lead.updateMany({
    where: {
      tenantId: TENANT_SP9,
      stageId: STAGE_NOVO_LEAD_INATIVO,
      deletedAt: null,
    },
    data: {
      stageId: STAGE_SP9_EM_CONTATO,
      pipelineId: PIPELINE_SP9_VENDAS,
    },
  });

  console.log(`\n✅ ${result.count} leads atualizados → SP9_EM_CONTATO + pipelineId VENDAS`);

  // Confirma
  const depois = await prisma.lead.findMany({
    where: { tenantId: TENANT_SP9, id: { in: antes.map((l) => l.id) } },
    select: { nome: true, stageId: true, pipelineId: true, stage: { select: { key: true, name: true, isActive: true } } },
  });

  console.log('\nVerificação:');
  depois.forEach((l) =>
    console.log(`  ${l.nome}: stage=${l.stage?.key} (${l.stage?.isActive ? 'ativo' : 'INATIVO'}) | pipelineId=${l.pipelineId ? 'SET' : 'NULL'}`),
  );
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
