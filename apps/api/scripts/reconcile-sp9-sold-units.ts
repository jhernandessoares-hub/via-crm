/**
 * Reconciliação one-off: leads do SP9 que já chegaram ao status "Contrato Assinado"
 * (ou etapa posterior) mas cuja unidade vinculada NÃO está VENDIDO.
 *
 * Causa: a conversão automática (applyUnitSideEffects('VENDA')) antes só convertia
 * unidades em PROPOSTA. Quem assinou contrato com a unidade ainda em DISPONIVEL/RESERVADO
 * ficou pelo caminho. Decisão do usuário: contrato assinado = sempre VENDIDO.
 *
 * Critério "assinou": stage.sortOrder >= sortOrder da etapa com unitAction='VENDA'
 * (SP9_CONTRATO_ASSINADO). Flipa a unidade para VENDIDO + soldAt (data de entrada no
 * contrato via AuditLog, fallback updatedAt).
 *
 * Dry-run por padrão (lista candidatos). Rode com APPLY=1 para efetivar.
 *
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-sold-units.ts
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-sold-units.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const CONTRACT_GROUPS = ['CONTRATO', 'REGISTRO'];
const APPLY = process.env.APPLY === '1';

async function contractSoldAt(leadId: string, fallback: Date): Promise<Date> {
  const moves = await prisma.auditLog.findMany({
    where: { tenantId: TENANT_SP9, action: 'MOVE_PIPELINE', resourceType: 'lead', resourceId: leadId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, metadata: true },
  });
  for (const m of moves) {
    const group = (m.metadata as any)?.group;
    if (group && CONTRACT_GROUPS.includes(group)) return m.createdAt;
  }
  return fallback;
}

async function main() {
  console.log(`🚀 Reconciliação vendas SP9 (${APPLY ? 'APLICANDO' : 'DRY-RUN'})\n`);

  // Etapa de venda (unitAction='VENDA') → define o limiar de sortOrder.
  const vendaStage = await prisma.pipelineStage.findFirst({
    where: { tenantId: TENANT_SP9, unitAction: 'VENDA' },
    select: { id: true, name: true, sortOrder: true },
  });
  if (!vendaStage) { console.log('Nenhuma etapa com unitAction=VENDA encontrada. Rode set-sp9-unit-action.ts antes.'); return; }
  console.log(`Etapa de venda: "${vendaStage.name}" (sortOrder=${vendaStage.sortOrder})\n`);

  // Unidades vinculadas a lead, ainda não vendidas, cujo lead está em/após a etapa de venda.
  const units = await prisma.developmentUnit.findMany({
    where: {
      tenantId: TENANT_SP9,
      status: { not: 'VENDIDO' },
      leadId: { not: null },
      lead: { stage: { sortOrder: { gte: vendaStage.sortOrder } } },
    },
    select: {
      id: true, nome: true, status: true, leadId: true, updatedAt: true,
      lead: { select: { nome: true, nomeCorreto: true, stage: { select: { name: true, group: true } } } },
    },
  });

  console.log(`Candidatos (lead assinou mas unidade ≠ VENDIDO): ${units.length}\n`);
  let done = 0;
  for (const u of units) {
    const leadNome = u.lead?.nomeCorreto ?? u.lead?.nome ?? '—';
    console.log(`  ${u.nome}  [${u.status}]  lead="${leadNome}" etapa="${u.lead?.stage?.name ?? '?'}"`);
    if (APPLY) {
      const soldAt = await contractSoldAt(u.leadId as string, u.updatedAt);
      await prisma.developmentUnit.update({ where: { id: u.id }, data: { status: 'VENDIDO', soldAt } });
    }
    done++;
  }

  console.log(`\n${APPLY ? '✅ Vendidas' : '🔍 Dry-run sobre'} ${done} unidades.`);
  if (!APPLY) console.log('Revise a lista acima. Para efetivar: APPLY=1 npx ts-node ... scripts/reconcile-sp9-sold-units.ts');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
