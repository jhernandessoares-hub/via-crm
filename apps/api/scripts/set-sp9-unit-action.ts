/**
 * Configura unitAction no funil SP9 (espelho de vendas, ordem invertida do padrão):
 *   - Etapa DOCUMENTACAO (todos os status) → 'RESERVA'   (permite reservar unidade)
 *   - Etapa ESCOLHA_UNIDADE (todos os status) → 'PROPOSTA' (ao entrar, reserva vira proposta)
 *   - Status "Contrato Assinado" (SP9_CONTRATO_ASSINADO) → 'VENDA' (proposta vira vendida)
 *
 * Rodar APÓS deploy (prisma db push já criou a coluna unitAction):
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/set-sp9-unit-action.ts
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

async function main() {
  console.log('🚀 Configurando unitAction no funil SP9...\n');

  // Zera tudo (idempotente)
  await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9 },
    data: { unitAction: null },
  });

  const reserva = await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9, group: 'DOCUMENTACAO' },
    data: { unitAction: 'RESERVA' },
  });
  const proposta = await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9, group: 'ESCOLHA_UNIDADE' },
    data: { unitAction: 'PROPOSTA' },
  });
  const venda = await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9, key: 'SP9_CONTRATO_ASSINADO' },
    data: { unitAction: 'VENDA' },
  });

  console.log(`✅ RESERVA (Documentação): ${reserva.count} status`);
  console.log(`✅ PROPOSTA (Escolha da Unidade): ${proposta.count} status`);
  console.log(`✅ VENDA (Contrato Assinado): ${venda.count} status\n`);

  const stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_SP9, isActive: true, unitAction: { not: null } },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    select: { name: true, group: true, unitAction: true },
  });
  for (const s of stages) console.log(`  [${s.group}] ${s.name} → ${s.unitAction}`);

  console.log('\n✅ Concluído.');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
