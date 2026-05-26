/**
 * Script de setup do funil exclusivo SP9.
 *
 * O que faz:
 *   1. Desativa todos os stages atuais do tenant SP9
 *   2. Cria os 20 novos stages com group, requiresEvidence e ownerOnly corretos
 *   3. Move todos os leads do SP9 para SP9_NOVO_LEAD (altera apenas stageId e pipelineId)
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
  { key: 'SP9_EXCLUSAO_PRE',        name: 'Exclusão do Inscrito',    group: 'PRE_ATENDIMENTO', sortOrder: 70, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_PRE',     name: 'Desistência do Inscrito', group: 'PRE_ATENDIMENTO', sortOrder: 80, requiresEvidence: true },

  // ── Documentação ─────────────────────────────────────────────────────────────
  { key: 'SP9_DOCS_PENDENTE',       name: 'Docs Pendente',           group: 'DOCUMENTACAO', sortOrder: 100 },
  { key: 'SP9_DOCS_ANALISE_CDHU',   name: 'Docs em Análise CDHU',   group: 'DOCUMENTACAO', sortOrder: 110 },
  { key: 'SP9_DOCS_APROVADOS',      name: 'Docs Aprovados',          group: 'DOCUMENTACAO', sortOrder: 120 },
  { key: 'SP9_EXCLUSAO_DOC',        name: 'Exclusão do Inscrito',    group: 'DOCUMENTACAO', sortOrder: 130, requiresEvidence: true },
  { key: 'SP9_DESISTENCIA_DOC',     name: 'Desistência do Inscrito', group: 'DOCUMENTACAO', sortOrder: 140, requiresEvidence: true },

  // ── Contrato ─────────────────────────────────────────────────────────────────
  { key: 'SP9_AGUARD_EMISSAO',      name: 'Aguard. Emissão de Contrato',    group: 'CONTRATO', sortOrder: 200 },
  { key: 'SP9_AGUARD_ASSINATURA',   name: 'Aguard. Assinatura de Contrato', group: 'CONTRATO', sortOrder: 210 },
  { key: 'SP9_CONTRATO_ASSINADO',   name: 'Contrato Assinado',              group: 'CONTRATO', sortOrder: 220, requiresEvidence: true },
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

  // ── 4. Buscar stage SP9_NOVO_LEAD para migração ───────────────────────────
  const novoLeadStage = await prisma.pipelineStage.findFirst({
    where: { tenantId: TENANT_ID, pipelineId: pipeline.id, key: 'SP9_NOVO_LEAD', isActive: true },
    select: { id: true },
  });

  if (!novoLeadStage) {
    console.error('❌ Stage SP9_NOVO_LEAD não encontrada após criação.');
    process.exit(1);
  }

  // ── 5. Migrar todos os leads para SP9_NOVO_LEAD ───────────────────────────
  // Altera SOMENTE stageId e pipelineId — nenhum outro campo é tocado.
  const migrated = await prisma.lead.updateMany({
    where: { tenantId: TENANT_ID, deletedAt: null },
    data: {
      pipelineId: pipeline.id,
      stageId: novoLeadStage.id,
    },
  });

  console.log(`✅ ${migrated.count} lead(s) migrado(s) para "Novo Lead".\n`);

  // ── 6. Resumo final ───────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('📊 RESUMO');
  console.log('═'.repeat(60));
  console.log(`  Stages criadas/atualizadas: ${SP9_STAGES.length}`);
  console.log(`  Leads migrados:             ${migrated.count}`);
  console.log(`  Stage destino:              Novo Lead (SP9_NOVO_LEAD)`);
  console.log('═'.repeat(60));
  console.log('\n✅ Setup concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
