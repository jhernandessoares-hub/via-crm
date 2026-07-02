/**
 * Avança os leads do SP9 (José Bonifácio) cuja UNIDADE já está VENDIDO mas o LEAD
 * ainda consta em "Aguard. Assinatura de Contrato" (grupo CONTRATO) → para "Em Registro"
 * (SP9_EM_REGISTRO, grupo REGISTRO).
 *
 * Decisão: a unidade é a verdade (já assinaram). O movimento é feito COMO SE FOSSE MANUAL,
 * replicando fielmente o branch `isCustomTransition` de LeadsService.updateStage
 * (leads.service.ts:2627): update stageId + LeadTransitionLog + AuditLog MOVE_PIPELINE.
 * NÃO apaga nada — a unidade segue VENDIDO com soldAt original (unitAction de "Em Registro"
 * é null, então nenhum side-effect de unidade; sem cascade).
 *
 * Atribuído ao OWNER José Hernandes Soares. Como o destino tem requiresEvidence=true e o
 * ator é OWNER, passamos `motivo` (justificativa) — igual ao que o app exige no movimento real.
 *
 * Dry-run por padrão. APPLY=1 efetiva. Idempotente (recalcula candidatos em runtime).
 *
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/advance-sp9-vendido-aguard-registro.ts
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/advance-sp9-vendido-aguard-registro.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEV_JOSE_BONIFACIO = '41da19cb-8450-447b-aa12-50196b5a82b5';
const STAGE_EM_REGISTRO = 'eafaa119-0a0c-4194-8980-4b8bba989ac2'; // SP9_EM_REGISTRO
const OWNER_ID = 'eb481844-42bf-46f1-baff-ebfdb68a9193'; // José Hernandes Soares (OWNER)
const FROM_STAGE_NAME = 'Aguard. Assinatura de Contrato';
const TO_STAGE_NAME = 'Em Registro';
const TO_GROUP = 'REGISTRO';
const MOTIVO =
  'Alinhamento de etapa ao espelho de vendas: unidade já VENDIDO (contrato assinado). Avanço administrativo (OWNER).';

const APPLY = process.env.APPLY === '1';

async function main() {
  console.log(`🚀 Avanço SP9 VENDIDO×Aguard.Assinatura → Em Registro (${APPLY ? 'APLICANDO' : 'DRY-RUN'})\n`);

  // Candidatos: unidade VENDIDO cujo lead está em "Aguard. Assinatura de Contrato" (grupo CONTRATO).
  const units = await prisma.developmentUnit.findMany({
    where: {
      developmentId: DEV_JOSE_BONIFACIO,
      tenantId: TENANT_SP9,
      status: 'VENDIDO',
      leadId: { not: null },
      lead: { stage: { group: 'CONTRATO', name: FROM_STAGE_NAME } },
    },
    select: {
      nome: true,
      leadId: true,
      lead: { select: { nome: true, nomeCorreto: true, stageId: true } },
    },
  });

  console.log(`Candidatos: ${units.length}\n`);
  if (units.length === 0) {
    console.log('Nada a fazer (já avançados ou inexistentes).');
    return;
  }

  let done = 0;
  for (const u of units) {
    const leadId = u.leadId as string;
    const nome = u.lead?.nomeCorreto ?? u.lead?.nome ?? '—';
    console.log(`  ${String(u.nome).padEnd(11)} lead="${nome}" (${leadId})  →  "${TO_STAGE_NAME}"`);

    if (!APPLY) continue;

    // Replica o branch isCustomTransition de updateStage (leads.service.ts:2627):
    // 1) update stageId + LeadTransitionLog (em transação)
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: { stageId: STAGE_EM_REGISTRO },
      }),
      prisma.leadTransitionLog.create({
        data: {
          tenantId: TENANT_SP9,
          leadId,
          fromStage: FROM_STAGE_NAME,
          toStage: TO_STAGE_NAME,
          changedBy: OWNER_ID,
          evidenceDocumentId: null,
          motivo: MOTIVO,
          cascade: false,
        },
      }),
    ]);

    // 2) AuditLog MOVE_PIPELINE (auditMove) — mesma metadata do serviço real
    await prisma.auditLog.create({
      data: {
        tenantId: TENANT_SP9,
        userId: OWNER_ID,
        action: 'MOVE_PIPELINE',
        resourceType: 'lead',
        resourceId: leadId,
        metadata: {
          fromStage: FROM_STAGE_NAME,
          toStage: TO_STAGE_NAME,
          group: TO_GROUP,
          role: 'OWNER',
          cascade: false,
          motivo: MOTIVO,
          evidenceDocumentId: null,
        },
      },
    });

    // 3) unitAction de "Em Registro" é null → nenhum side-effect na unidade. Unidade intacta.
    done++;
  }

  console.log(`\n${APPLY ? '✅ Avançados' : '🔍 Dry-run sobre'} ${done || units.length} leads.`);
  if (!APPLY) console.log('Para efetivar: APPLY=1 npx ts-node ... scripts/advance-sp9-vendido-aguard-registro.ts');
}

main()
  .catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
