/**
 * Backfill de `soldAt` nas unidades VENDIDO do SP9 que ficaram sem data.
 *
 * Contexto: a importação em massa do SP9 gravou status='VENDIDO' direto no banco,
 * sem passar pelos caminhos que setam soldAt (applyUnitSideEffects('VENDA') / UnitModal).
 * Resultado: o Dashboard Gerencial (que filtra VENDIDO por soldAt no período) não conta
 * essas vendas, divergindo da Gestão/Espelho (que contam por snapshot).
 *
 * Este script NÃO muda status — só preenche soldAt em unidades já VENDIDO com soldAt NULL.
 * Fonte da data, por unidade:
 *   1) AuditLog MOVE_PIPELINE do lead vinculado cujo metadata.group ∈ {CONTRATO, REGISTRO}
 *      (primeira entrada no contrato) → createdAt;
 *   2) fallback: developmentUnit.updatedAt.
 *
 * Idempotente: só toca soldAt IS NULL. Dry-run por padrão; rode com APPLY=1 para efetivar.
 *
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/backfill-sold-at-sp9.ts        # dry-run
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/backfill-sold-at-sp9.ts # efetiva
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const CONTRACT_GROUPS = ['CONTRATO', 'REGISTRO'];
const APPLY = process.env.APPLY === '1';

async function resolveSoldAt(leadId: string | null, fallback: Date): Promise<{ date: Date; source: string }> {
  if (leadId) {
    const moves = await prisma.auditLog.findMany({
      where: { tenantId: TENANT_SP9, action: 'MOVE_PIPELINE', resourceType: 'lead', resourceId: leadId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, metadata: true },
    });
    for (const m of moves) {
      const group = (m.metadata as any)?.group;
      if (group && CONTRACT_GROUPS.includes(group)) {
        return { date: m.createdAt, source: 'auditlog:' + group };
      }
    }
  }
  return { date: fallback, source: 'updatedAt' };
}

async function main() {
  console.log(`🚀 Backfill soldAt SP9 (${APPLY ? 'APLICANDO' : 'DRY-RUN'})\n`);

  const units = await prisma.developmentUnit.findMany({
    where: { tenantId: TENANT_SP9, status: 'VENDIDO', soldAt: null },
    select: { id: true, nome: true, leadId: true, updatedAt: true },
  });
  console.log(`Encontradas ${units.length} unidades VENDIDO com soldAt nulo.\n`);

  const bySource: Record<string, number> = {};
  let done = 0;
  for (const u of units) {
    const { date, source } = await resolveSoldAt(u.leadId, u.updatedAt);
    bySource[source] = (bySource[source] || 0) + 1;
    if (APPLY) {
      await prisma.developmentUnit.update({ where: { id: u.id }, data: { soldAt: date } });
    }
    done++;
    if (done <= 10) console.log(`  ${u.nome}  →  ${date.toISOString().slice(0, 10)}  (${source})`);
  }
  if (done > 10) console.log(`  ... (+${done - 10} unidades)`);

  console.log('\nResumo por fonte de data:', JSON.stringify(bySource));
  console.log(`\n${APPLY ? '✅ Aplicado em' : '🔍 Dry-run sobre'} ${done} unidades.`);
  if (!APPLY) console.log('Para efetivar: APPLY=1 npx ts-node ... scripts/backfill-sold-at-sp9.ts');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
