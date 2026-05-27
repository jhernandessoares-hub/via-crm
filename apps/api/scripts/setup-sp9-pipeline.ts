/**
 * Script de setup do funil exclusivo SP9.
 *
 * O que faz:
 *   1. Desativa todos os stages atuais do tenant SP9
 *   2. Cria/atualiza os stages com group, requiresEvidence e ownerOnly corretos
 *   3. Move para SP9_NOVO_LEAD SOMENTE leads que não estão em uma stage SP9 válida
 *      — leads já posicionados em stages SP9 não são tocados
 *      — nenhum outro campo de lead é alterado
 *      — DevelopmentUnit.status (espelho) não é tocado
 *
 * Rodar:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/setup-sp9-pipeline.ts
 */

// Rodar apontando para produção:
// DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/setup-sp9-pipeline.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

const SP9_STAGES: Array<{
  key: string;
  name: string;
  group: string;
  sortOrder: number;
  requiresEvidence?: boolean;
  ownerOnly?: boolean;
}> = [
  // ── Pré-Atendimento ──────────────────────────────────────────────────────────
  { key: 'SP9_NOVO_LEAD',           name: 'Novo Lead',               group: 'PRE_ATENDIMENTO', sortOrder: 10 },
  { key: 'SP9_EM_CONTATO',          name: 'Em Contato',              group: 'PRE_ATENDIMENTO', sortOrder: 20 },
  { key: 'SP9_REATIVACAO_INSCRITO', name: 'Reativação do Inscrito',  group: 'PRE_ATENDIMENTO', sortOrder: 30, ownerOnly: true },
  { key: 'SP9_LEAD_APTO',           name: 'Lead Apto',               group: 'PRE_ATENDIMENTO', sortOrder: 40 },
  { key: 'SP9_LEAD_NAO_APTO',       name: 'Lead Não Apto',           group: 'PRE_ATENDIMENTO', sortOrder: 50 },
  { key: 'SP9_PAROU_RESPONDER',     name: 'Parou de Responder',      group: 'PRE_ATENDIMENTO', sortOrder: 60, requiresEvidence: true },
  { key: 'SP9_SUSPENSAO_PRE',       name: 'Suspensão',               group: 'PRE_ATENDIMENTO', sortOrder: 65, requiresEvidence: true },
  { key: 'SP9_EXCLUSAO_PRE',        name: 'Exclusão do Inscrito',    group: 'PRE_ATENDIMENTO', sortOrder: 70, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_PRE',     name: 'Desistência do Inscrito', group: 'PRE_ATENDIMENTO', sortOrder: 80, requiresEvidence: true },

  // ── Documentação ─────────────────────────────────────────────────────────────
  { key: 'SP9_DOCS_PENDENTE',       name: 'Docs Pendente',           group: 'DOCUMENTACAO', sortOrder: 100 },
  { key: 'SP9_DOCS_ANALISE_CDHU',   name: 'Docs em Análise CDHU',   group: 'DOCUMENTACAO', sortOrder: 110 },
  { key: 'SP9_DOCS_APROVADOS',      name: 'Docs Aprovados',          group: 'DOCUMENTACAO', sortOrder: 120 },
  { key: 'SP9_DOCS_REPROVADO',      name: 'Docs Reprovado',          group: 'DOCUMENTACAO', sortOrder: 125, requiresEvidence: true },
  { key: 'SP9_SUSPENSAO_DOC',       name: 'Suspensão',               group: 'DOCUMENTACAO', sortOrder: 127, requiresEvidence: true },
  { key: 'SP9_EXCLUSAO_DOC',        name: 'Exclusão do Inscrito',    group: 'DOCUMENTACAO', sortOrder: 130, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_DOC',     name: 'Desistência do Inscrito', group: 'DOCUMENTACAO', sortOrder: 140, requiresEvidence: true },

  // ── Escolha da Unidade ───────────────────────────────────────────────────────
  { key: 'SP9_AGUARD_UNIDADE',      name: 'Aguard. Unidade',         group: 'ESCOLHA_UNIDADE', sortOrder: 150 },
  { key: 'SP9_UNIDADE_VINCULADA',   name: 'Unidade Vinculada',       group: 'ESCOLHA_UNIDADE', sortOrder: 160 },
  { key: 'SP9_SUSPENSAO_UNIDADE',   name: 'Suspensão',               group: 'ESCOLHA_UNIDADE', sortOrder: 170, requiresEvidence: true },
  { key: 'SP9_EXCLUSAO_UNIDADE',    name: 'Exclusão do Inscrito',    group: 'ESCOLHA_UNIDADE', sortOrder: 180, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_UNIDADE', name: 'Desistência do Inscrito', group: 'ESCOLHA_UNIDADE', sortOrder: 190, requiresEvidence: true },

  // ── Contrato ─────────────────────────────────────────────────────────────────
  { key: 'SP9_AGUARD_EMISSAO',      name: 'Aguard. Emissão de Contrato',    group: 'CONTRATO', sortOrder: 200 },
  { key: 'SP9_AGUARD_ASSINATURA',   name: 'Aguard. Assinatura de Contrato', group: 'CONTRATO', sortOrder: 210 },
  { key: 'SP9_CONTRATO_ASSINADO',   name: 'Contrato Assinado',              group: 'CONTRATO', sortOrder: 220, requiresEvidence: true },
  { key: 'SP9_SUSPENSAO_CONT',      name: 'Suspensão',                      group: 'CONTRATO', sortOrder: 225, requiresEvidence: true },
  { key: 'SP9_EXCLUSAO_CONT',       name: 'Exclusão do Inscrito',           group: 'CONTRATO', sortOrder: 230, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_CONT',    name: 'Desistência do Inscrito',        group: 'CONTRATO', sortOrder: 240, requiresEvidence: true },

  // ── Registro ─────────────────────────────────────────────────────────────────
  { key: 'SP9_EM_REGISTRO',  name: 'Em Registro', group: 'REGISTRO', sortOrder: 300, requiresEvidence: true },
  { key: 'SP9_REGISTRADO',   name: 'Registrado',  group: 'REGISTRO', sortOrder: 310, requiresEvidence: true },
];

async function main() {
  console.log('🚀 Iniciando setup do funil exclusivo SP9...\n');

  // ── 1. Pipeline ativo do SP9 ──────────────────────────────────────────────
  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, name: true },
  });

  if (!pipeline) {
    console.error('❌ Nenhum pipeline ativo encontrado para o tenant SP9.');
    process.exit(1);
  }

  console.log(`✅ Pipeline encontrado: "${pipeline.name}" (${pipeline.id})\n`);

  // ── 2. Desativar stages existentes ───────────────────────────────────────
  const deactivated = await prisma.pipelineStage.updateMany({
    where: { tenantId: TENANT_ID, pipelineId: pipeline.id, isActive: true },
    data: { isActive: false },
  });

  console.log(`⏸️  ${deactivated.count} stage(s) existente(s) desativada(s).\n`);

  // ── 3. Criar novos stages ─────────────────────────────────────────────────
  let criados = 0;
  let reaproveitados = 0;

  for (const s of SP9_STAGES) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { tenantId: TENANT_ID, pipelineId: pipeline.id, key: s.key },
    });

    if (existing) {
      await prisma.pipelineStage.update({
        where: { id: existing.id },
        data: {
          name: s.name,
          group: s.group,
          sortOrder: s.sortOrder,
          requiresEvidence: s.requiresEvidence ?? false,
          ownerOnly: s.ownerOnly ?? false,
          isActive: true,
        },
      });
      reaproveitados++;
    } else {
      await prisma.pipelineStage.create({
        data: {
          tenantId: TENANT_ID,
          pipelineId: pipeline.id,
          key: s.key,
          name: s.name,
          group: s.group,
          sortOrder: s.sortOrder,
          requiresEvidence: s.requiresEvidence ?? false,
          ownerOnly: s.ownerOnly ?? false,
          isActive: true,
        },
      });
      criados++;
    }

    const icon = s.requiresEvidence ? '📎' : s.ownerOnly ? '🔒' : '  ';
    console.log(`  ${icon} [${s.group}] ${s.name}`);
  }

  console.log(`\n✅ ${criados} stage(s) criada(s), ${reaproveitados} reaproveitada(s).\n`);

  // ── 4. Coletar IDs de todas as stages SP9 válidas ────────────────────────
  const allSp9Stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_ID, pipelineId: pipeline.id, isActive: true },
    select: { id: true, key: true },
  });
  const validSp9StageIds = allSp9Stages.map((s) => s.id);

  // ── 5. Buscar stage SP9_NOVO_LEAD para migração ───────────────────────────
  const novoLeadStage = allSp9Stages.find((s) => s.key === 'SP9_NOVO_LEAD');

  if (!novoLeadStage) {
    console.error('❌ Stage SP9_NOVO_LEAD não encontrada após criação.');
    process.exit(1);
  }

  // ── 6. Migrar apenas leads que NÃO estão em uma stage SP9 válida ──────────
  // Leads já posicionados em stages SP9 não são tocados.
  // Altera SOMENTE stageId e pipelineId — nenhum outro campo é alterado.
  const migrated = await prisma.lead.updateMany({
    where: {
      tenantId: TENANT_ID,
      deletedAt: null,
      OR: [
        { stageId: null },
        { stageId: { notIn: validSp9StageIds } },
      ],
    },
    data: {
      pipelineId: pipeline.id,
      stageId: novoLeadStage.id,
    },
  });

  console.log(`✅ ${migrated.count} lead(s) sem stage SP9 migrado(s) para "Novo Lead".\n`);

  // ── 7. Resumo final ───────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('📊 RESUMO');
  console.log('═'.repeat(60));
  console.log(`  Stages criadas/atualizadas: ${SP9_STAGES.length}`);
  console.log(`  Leads migrados p/ Novo Lead: ${migrated.count}`);
  console.log('═'.repeat(60));
  console.log('\n✅ Setup concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
