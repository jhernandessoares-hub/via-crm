/**
 * Script de ajuste do pipeline SP9 (produção):
 * 1. Adiciona "Agend. Entrega Documentos" como 1º status da etapa Documentação (sortOrder 95)
 * 2. Adiciona SUSPENSÃO/EXCLUSÃO/DESISTÊNCIA à etapa Registro
 * 3. Configura regras de transição automática entre etapas (advancesToGroup / returnsToGroup)
 *
 * Rodar APÓS deploy (prisma db push já executado no Railway):
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/adjust-sp9-pipeline.ts
 */
process.env.DATABASE_URL =
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9   = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const PIPELINE_SP9 = '3a302ed8-a859-4856-ab8f-a2f9c71aaa81';

async function main() {
  console.log('🚀 Iniciando ajuste do pipeline SP9...\n');

  // ── 1. Novo stage: Agend. Entrega Documentos (1º da etapa Documentação) ────
  console.log('1️⃣  Criando "Agend. Entrega Documentos"...');
  await prisma.pipelineStage.upsert({
    where: {
      tenantId_pipelineId_key: {
        tenantId:   TENANT_SP9,
        pipelineId: PIPELINE_SP9,
        key:        'SP9_AGEND_ENTREGA_DOCS',
      },
    },
    create: {
      tenantId:   TENANT_SP9,
      pipelineId: PIPELINE_SP9,
      key:        'SP9_AGEND_ENTREGA_DOCS',
      name:       'Agend. Entrega Documentos',
      group:      'DOCUMENTACAO',
      sortOrder:  95,
      isActive:   true,
    },
    update: {},
  });
  console.log('  ✅ SP9_AGEND_ENTREGA_DOCS (sortOrder 95) — OK\n');

  // ── 2. Novos stages terminais na etapa Registro ──────────────────────────
  console.log('2️⃣  Adicionando terminais ao REGISTRO...');
  const registroTerminais = [
    { key: 'SP9_SUSPENSAO_REG',   name: 'Suspensão',               sortOrder: 320 },
    { key: 'SP9_EXCLUSAO_REG',    name: 'Exclusão do Inscrito',    sortOrder: 330 },
    { key: 'SP9_DESISTENCIA_REG', name: 'Desistência do Inscrito', sortOrder: 340 },
  ];
  for (const s of registroTerminais) {
    await prisma.pipelineStage.upsert({
      where: {
        tenantId_pipelineId_key: {
          tenantId:   TENANT_SP9,
          pipelineId: PIPELINE_SP9,
          key:        s.key,
        },
      },
      create: {
        tenantId:        TENANT_SP9,
        pipelineId:      PIPELINE_SP9,
        key:             s.key,
        name:            s.name,
        group:           'REGISTRO',
        sortOrder:       s.sortOrder,
        isActive:        true,
        requiresEvidence: true,
      },
      update: {},
    });
    console.log(`  ✅ ${s.key} (sortOrder ${s.sortOrder}) — OK`);
  }
  console.log();

  // ── 3. Configurar regras de transição nos stages gatilho ─────────────────
  console.log('3️⃣  Configurando regras de transição...');
  const transitions: Array<{ key: string; advancesToGroup?: string; returnsToGroup?: string }> = [
    { key: 'SP9_LEAD_APTO',          advancesToGroup: 'DOCUMENTACAO'    },
    { key: 'SP9_DOCS_APROVADOS',     advancesToGroup: 'ESCOLHA_UNIDADE' },
    { key: 'SP9_UNIDADE_VINCULADA',  advancesToGroup: 'CONTRATO'        },
    { key: 'SP9_CONTRATO_ASSINADO',  advancesToGroup: 'REGISTRO'        },
    { key: 'SP9_DOCS_REPROVADO',     returnsToGroup:  'PRE_ATENDIMENTO' },
  ];

  for (const t of transitions) {
    const result = await prisma.pipelineStage.updateMany({
      where:  { tenantId: TENANT_SP9, key: t.key },
      data:   t.advancesToGroup
        ? { advancesToGroup: t.advancesToGroup }
        : { returnsToGroup:  t.returnsToGroup  },
    });
    const dir = t.advancesToGroup ? `→ AVANÇA para ${t.advancesToGroup}` : `← RETORNA para ${t.returnsToGroup}`;
    console.log(`  ${result.count > 0 ? '✅' : '⚠️ '} ${t.key} ${dir} (${result.count} stage atualizado)`);
  }
  console.log();

  // ── 4. Confirmação final ──────────────────────────────────────────────────
  console.log('4️⃣  Verificando estado final...');
  const stages = await prisma.pipelineStage.findMany({
    where:   { tenantId: TENANT_SP9, pipelineId: PIPELINE_SP9, isActive: true },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    select:  { key: true, name: true, group: true, sortOrder: true, advancesToGroup: true, returnsToGroup: true },
  });

  const byGroup: Record<string, typeof stages> = {};
  for (const s of stages) {
    const g = s.group ?? 'SEM_GRUPO';
    (byGroup[g] ??= []).push(s);
  }
  for (const [group, list] of Object.entries(byGroup)) {
    console.log(`\n  ${group}:`);
    for (const s of list) {
      const rule = s.advancesToGroup ? ` → ${s.advancesToGroup}` : s.returnsToGroup ? ` ← ${s.returnsToGroup}` : '';
      console.log(`    [${String(s.sortOrder).padStart(3, ' ')}] ${s.key.padEnd(30)} ${s.name}${rule}`);
    }
  }

  console.log('\n✅ Ajuste concluído.');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
