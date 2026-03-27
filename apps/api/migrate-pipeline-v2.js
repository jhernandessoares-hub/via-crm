/**
 * Migração Pipeline V2 — VIA CRM
 * Tenant: 8510fa2e-... (DEV)
 * Pipeline: a65d64c9-...
 *
 * 1. Apaga todas as stages existentes do pipeline
 * 2. Recria 25 stages na nova estrutura V2
 * 3. Move todos os leads do tenant para NOVO_LEAD
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_PREFIX = '8510fa2e';
const PIPELINE_PREFIX = 'a65d64c9';

const NEW_STAGES = [
  // PRE_ATENDIMENTO
  { key: 'NOVO_LEAD',                    name: 'Novo Lead',                         sortOrder: 1,  group: 'PRE_ATENDIMENTO' },
  { key: 'EM_CONTATO',                   name: 'Em Contato',                        sortOrder: 2,  group: 'PRE_ATENDIMENTO' },
  { key: 'NAO_QUALIFICADO',              name: 'Não Qualificado',                   sortOrder: 3,  group: 'PRE_ATENDIMENTO' },
  { key: 'LEAD_POTENCIAL_QUALIFICADO',   name: 'Lead Potencial - Qualificado',      sortOrder: 4,  group: 'PRE_ATENDIMENTO' },
  { key: 'ATENDIMENTO_ENCERRADO',        name: 'Atendimento Encerrado',             sortOrder: 5,  group: 'PRE_ATENDIMENTO' },
  { key: 'BASE_FRIA_PRE',               name: 'Base Fria - Pré Atendimento',       sortOrder: 6,  group: 'PRE_ATENDIMENTO' },

  // AGENDAMENTO
  { key: 'AGUARDANDO_AGENDAMENTO',       name: 'Aguardando Agendamento de Visita',  sortOrder: 7,  group: 'AGENDAMENTO' },
  { key: 'AGENDADO_VISITA',             name: 'Agendado Visita',                   sortOrder: 8,  group: 'AGENDAMENTO' },
  { key: 'REAGENDAMENTO',               name: 'Reagendamento',                     sortOrder: 9,  group: 'AGENDAMENTO' },
  { key: 'CONFIRMADOS',                 name: 'Confirmados',                       sortOrder: 10, group: 'AGENDAMENTO' },
  { key: 'NAO_COMPARECEU',             name: 'Não Compareceu',                    sortOrder: 11, group: 'AGENDAMENTO' },
  { key: 'VISITA_CANCELADA',            name: 'Visita Cancelada',                  sortOrder: 12, group: 'AGENDAMENTO' },
  { key: 'BASE_FRIA_AGENDAMENTO',       name: 'Base Fria - Agendamento',           sortOrder: 13, group: 'AGENDAMENTO' },

  // NEGOCIACOES
  { key: 'CRIACAO_PROPOSTA',            name: 'Criação de Proposta',               sortOrder: 14, group: 'NEGOCIACOES' },
  { key: 'PROPOSTA_ANDAMENTO',          name: 'Proposta em Andamento',             sortOrder: 15, group: 'NEGOCIACOES' },
  { key: 'PROPOSTA_ACEITA',             name: 'Proposta Aceita',                   sortOrder: 16, group: 'NEGOCIACOES' },
  { key: 'ANALISE_CREDITO',             name: 'Análise de Crédito',               sortOrder: 17, group: 'NEGOCIACOES' },
  { key: 'FORMALIZACAO',               name: 'Formalização',                      sortOrder: 18, group: 'NEGOCIACOES' },
  { key: 'CONTRATO_ASSINADO',           name: 'Contrato Assinado',                sortOrder: 19, group: 'NEGOCIACOES' },
  { key: 'DECLINIO',                   name: 'Declínio',                          sortOrder: 20, group: 'NEGOCIACOES' },
  { key: 'BASE_FRIA_NEGOCIACOES',       name: 'Base Fria - Negociações',          sortOrder: 21, group: 'NEGOCIACOES' },

  // NEGOCIO_FECHADO
  { key: 'ITBI',                        name: 'ITBI',                              sortOrder: 22, group: 'NEGOCIO_FECHADO' },
  { key: 'REGISTRO',                    name: 'Registro',                          sortOrder: 23, group: 'NEGOCIO_FECHADO' },
  { key: 'ENTREGA_CONTRATO',            name: 'Entrega de Contrato Registrado',    sortOrder: 24, group: 'NEGOCIO_FECHADO' },

  // POS_VENDA
  { key: 'POS_VENDA',                   name: 'Pós Venda',                        sortOrder: 25, group: 'POS_VENDA' },
];

async function run() {
  console.log('🚀 Iniciando migração Pipeline V2...\n');

  // ─── 1. Encontrar tenant ──────────────────────────────────────────────────
  const tenant = await prisma.tenant.findFirst({
    where: { id: { startsWith: TENANT_PREFIX } },
  });
  if (!tenant) throw new Error(`Tenant com prefixo "${TENANT_PREFIX}" não encontrado.`);
  console.log(`✅ Tenant encontrado: ${tenant.id} (${tenant.nome || tenant.slug})`);

  // ─── 2. Encontrar pipeline ────────────────────────────────────────────────
  const pipeline = await prisma.pipeline.findFirst({
    where: {
      tenantId: tenant.id,
      id: { startsWith: PIPELINE_PREFIX },
    },
  });
  if (!pipeline) throw new Error(`Pipeline com prefixo "${PIPELINE_PREFIX}" não encontrado para o tenant.`);
  console.log(`✅ Pipeline encontrado: ${pipeline.id} (${pipeline.name || pipeline.key})`);

  // ─── 3. Verificação de segurança — garantir que é o tenant certo ──────────
  const SAFE_TENANT_ID = '8510fa2e-c4b4-4cc1-aff1-b161ee9f1e66';
  if (tenant.id !== SAFE_TENANT_ID) {
    throw new Error(`SEGURANÇA: Tenant encontrado (${tenant.id}) não corresponde ao tenant esperado. Abortando.`);
  }

  // ─── 4. Contar leads antes da migração ────────────────────────────────────
  const leadsCount = await prisma.lead.count({ where: { tenantId: tenant.id } });
  console.log(`\n📊 Leads no tenant: ${leadsCount}`);

  // ─── 5. Apagar todas as stages do pipeline ────────────────────────────────
  const deleted = await prisma.pipelineStage.deleteMany({
    where: { pipelineId: pipeline.id, tenantId: tenant.id },
  });
  console.log(`\n🗑️  Stages apagadas: ${deleted.count}`);

  // ─── 6. Criar as 25 novas stages ──────────────────────────────────────────
  console.log('\n📝 Criando novas stages...');
  const createdStages = [];

  for (const stage of NEW_STAGES) {
    const created = await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        key: stage.key,
        name: stage.name,
        sortOrder: stage.sortOrder,
        group: stage.group,
        isActive: true,
      },
    });
    createdStages.push(created);
    console.log(`   ✓ [${String(stage.sortOrder).padStart(2, '0')}] ${stage.key} — ${stage.name}`);
  }

  // ─── 7. Obter stageId do NOVO_LEAD ───────────────────────────────────────
  const novoLeadStage = createdStages.find((s) => s.key === 'NOVO_LEAD');
  if (!novoLeadStage) throw new Error('Stage NOVO_LEAD não encontrada após criação.');

  // ─── 8. Mover todos os leads para NOVO_LEAD ───────────────────────────────
  const updated = await prisma.lead.updateMany({
    where: { tenantId: tenant.id },
    data: {
      pipelineId: pipeline.id,
      stageId: novoLeadStage.id,
    },
  });
  console.log(`\n✅ Leads movidos para NOVO_LEAD: ${updated.count}`);

  // ─── 9. Tabela final de confirmação ───────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('TABELA FINAL — STAGES CRIADAS');
  console.log('═'.repeat(90));
  console.log(
    'nº'.padEnd(4) +
    'sortOrder'.padEnd(11) +
    'key'.padEnd(34) +
    'name'.padEnd(36) +
    'group'
  );
  console.log('─'.repeat(90));

  const finalStages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id, tenantId: tenant.id },
    orderBy: { sortOrder: 'asc' },
  });

  finalStages.forEach((s, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      String(s.sortOrder).padEnd(11) +
      s.key.padEnd(34) +
      s.name.padEnd(36) +
      (s.group || '-')
    );
  });

  console.log('═'.repeat(90));
  console.log(`\nTotal de stages: ${finalStages.length}`);
  console.log(`Leads movidos para NOVO_LEAD (stageId: ${novoLeadStage.id}): ${updated.count}`);
  console.log(`Pipeline ID: ${pipeline.id}`);
  console.log(`Tenant ID: ${tenant.id}`);
  console.log('\n🎉 Migração Pipeline V2 concluída com sucesso!');
}

run()
  .catch((e) => {
    console.error('\n❌ Migração falhou:', e.message);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
