/**
 * Ajuste de DADO (não cria regra): unidades do SP9 (José Bonifácio) em PROPOSTA cujo lead
 * está em PRE_ATENDIMENTO ou DOCUMENTACAO devem estar em RESERVADO — para casar com os
 * relatórios (espelho/dashboard contam por status da unidade).
 *
 * Causa: o sistema só aplica efeitos pra frente (RESERVADO→PROPOSTA→VENDIDO); quando o lead
 * voltou de Escolha da Unidade/Contrato, a unidade ficou presa em PROPOSTA. Aqui só corrigimos
 * essas unidades pontuais, sem alterar pipeline/código.
 *
 * Espelha o fluxo real PROPOSTA→RESERVADO (developments.service.ts:550): troca SOMENTE o
 * `status`. Mantém leadId/preço/proposta; soldAt já é null em PROPOSTA. Nada é apagado.
 *
 * Regra de status por etapa (config já correta no pipeline):
 *   PRE_ATENDIMENTO → RESERVADO | DOCUMENTACAO → RESERVADO (unitAction=RESERVA)
 *   ESCOLHA_UNIDADE → PROPOSTA  | CONTRATO → PROPOSTA até "Contrato Assinado" → VENDIDO
 *
 * Dry-run por padrão. APPLY=1 efetiva. Idempotente.
 *
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/fix-sp9-proposta-para-reserva.ts
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/fix-sp9-proposta-para-reserva.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEV_JOSE_BONIFACIO = '41da19cb-8450-447b-aa12-50196b5a82b5';
const GRUPOS_RESERVA = ['PRE_ATENDIMENTO', 'DOCUMENTACAO'];
const APPLY = process.env.APPLY === '1';

async function main() {
  console.log(`🚀 SP9 PROPOSTA→RESERVADO (lead em Pré-Atendimento/Documentação) — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}\n`);

  const units = await prisma.developmentUnit.findMany({
    where: {
      developmentId: DEV_JOSE_BONIFACIO,
      tenantId: TENANT_SP9,
      status: 'PROPOSTA',
      leadId: { not: null },
      lead: { stage: { group: { in: GRUPOS_RESERVA } } },
    },
    select: {
      id: true,
      nome: true,
      lead: { select: { nome: true, nomeCorreto: true, stage: { select: { name: true, group: true } } } },
    },
    orderBy: { nome: 'asc' },
  });

  console.log(`Candidatas (PROPOSTA → RESERVADO): ${units.length}\n`);
  if (units.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  for (const u of units) {
    const l = u.lead;
    console.log(`  ${String(u.nome).padEnd(11)} ${(l?.nomeCorreto || l?.nome || '?').padEnd(34)} [${l?.stage?.group} :: ${l?.stage?.name}]  PROPOSTA → RESERVADO`);
  }

  if (APPLY) {
    const ids = units.map((u) => u.id);
    const res = await prisma.developmentUnit.updateMany({
      where: { id: { in: ids }, status: 'PROPOSTA' },
      data: { status: 'RESERVADO' },
    });
    console.log(`\n✅ ${res.count} unidades atualizadas para RESERVADO (status apenas; lead e proposta preservados).`);
  } else {
    console.log('\n🔍 Dry-run. Para efetivar: APPLY=1 npx ts-node ... scripts/fix-sp9-proposta-para-reserva.ts');
  }
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
