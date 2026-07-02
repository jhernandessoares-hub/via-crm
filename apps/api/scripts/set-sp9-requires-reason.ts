/**
 * Marca requiresReason=true nos terminais NEGATIVOS do funil SP9:
 *   Suspensão, Exclusão do Inscrito, Desistência do Inscrito (todos os grupos),
 *   Docs Reprovado e Parou de Responder.
 *
 * Critério: requiresEvidence=true E key NÃO está entre os marcos POSITIVOS
 *   (Contrato Assinado, Em Registro, Registrado) — esses só exigem documento,
 *   não justificativa.
 *
 * Rodar APÓS deploy (prisma db push já criou a coluna requiresReason):
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/set-sp9-requires-reason.ts
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

// Marcos positivos: exigem evidência (documento) mas NÃO justificativa em texto.
const POSITIVE_KEYS = ['SP9_CONTRATO_ASSINADO', 'SP9_EM_REGISTRO', 'SP9_REGISTRADO'];

async function main() {
  console.log('🚀 Configurando requiresReason nos terminais negativos do SP9...\n');

  // Zera tudo primeiro (idempotente) para não deixar resíduo de execuções anteriores.
  await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_SP9 },
    data: { requiresReason: false },
  });

  const result = await prisma.pipelineStage.updateMany({
    where: {
      tenantId: TENANT_SP9,
      requiresEvidence: true,
      key: { notIn: POSITIVE_KEYS },
    },
    data: { requiresReason: true },
  });

  console.log(`✅ ${result.count} status marcados com requiresReason=true.\n`);

  const stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_SP9, isActive: true },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    select: { key: true, name: true, group: true, requiresEvidence: true, requiresReason: true },
  });

  for (const s of stages) {
    const flags = [
      s.requiresEvidence ? '📎 evidência' : '',
      s.requiresReason ? '📝 justificativa' : '',
    ].filter(Boolean).join(' + ');
    if (flags) console.log(`  [${s.group}] ${s.name} → ${flags}`);
  }

  console.log('\n✅ Concluído.');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
