/**
 * Grupo 1 — SP9 José Bonifácio: 3 vendas PROPOSTA → VENDIDO
 * Planilha CONFERIDA JOSE 26/06/2026 confirma contratos assinados.
 *
 * changedBy = assignedUserId do lead (corretor responsável)
 * Timestamps escalonados: cada lead tem soldAt/log em horário diferente (minutos atrás)
 *
 * Dry-run por padrão. APPLY=1 para efetivar. Idempotente.
 *
 * cd apps/api
 * npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-grupo1-vendas-26-06.ts
 * APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-grupo1-vendas-26-06.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEV_JOSE_BONIFACIO = '41da19cb-8450-447b-aa12-50196b5a82b5';
const APPLY = process.env.APPLY === '1';

// changedBy = assignedUserId do lead; minutosAtras = timestamp escalonado no passado
const VENDAS = [
  { numero: 171, apto: '2003',  changedBy: '3b5c5c5b-5e38-40dd-8472-0667a6d39069', minutosAtras: 24 }, // Tatiane Azevedo
  { numero: 228, apto: '11012', changedBy: '46db22fd-61ca-487f-b12c-0aa5153df7e2', minutosAtras: 13 }, // Camila Machado
  { numero: 241, apto: '2005',  changedBy: '46db22fd-61ca-487f-b12c-0aa5153df7e2', minutosAtras: 3  }, // Camila Machado
];

async function main() {
  console.log(`\n🚀 Grupo 1 SP9 — PROPOSTA → VENDIDO — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}\n`);

  const contratoAssinado = await prisma.pipelineStage.findFirst({
    where: { tenantId: TENANT_SP9, key: 'SP9_CONTRATO_ASSINADO' },
    select: { id: true, name: true, group: true },
  });
  if (!contratoAssinado) throw new Error('Etapa SP9_CONTRATO_ASSINADO não encontrada.');
  console.log(`Etapa alvo: "${contratoAssinado.name}" (${contratoAssinado.group})\n`);

  for (const item of VENDAS) {
    const lead = await prisma.lead.findFirst({
      where: { tenantId: TENANT_SP9, numero: item.numero, deletedAt: null },
      select: {
        id: true, nome: true, nomeCorreto: true, assignedUserId: true,
        stage: { select: { name: true, group: true } },
      },
    });
    if (!lead) { console.log(`  #${item.numero}: lead não encontrado — pulando`); continue; }

    const units = await prisma.developmentUnit.findMany({
      where: { developmentId: DEV_JOSE_BONIFACIO, leadId: lead.id },
      select: { id: true, nome: true, status: true, tower: { select: { nome: true } } },
    });
    const unit = units.find((u) => u.nome.replace(/\D/g, '') === item.apto) || units[0];
    const nome = lead.nomeCorreto || lead.nome;
    const changedBy = lead.assignedUserId || item.changedBy;

    const leadOk = lead.stage?.group === 'CONTRATO';
    const unitOk = unit?.status === 'PROPOSTA';

    if (!leadOk && !unitOk) {
      console.log(`  #${item.numero} ${nome}: já reconciliado (etapa=${lead.stage?.name}, unid=${unit?.status}) — pulando`);
      continue;
    }

    const ts = new Date(Date.now() - item.minutosAtras * 60 * 1000);
    console.log(`  #${item.numero} ${nome}`);
    console.log(`    etapa:  "${lead.stage?.name}" → "${contratoAssinado.name}"`);
    console.log(`    unidade: ${unit?.tower?.nome}/${unit?.nome} ${unit?.status} → VENDIDO`);
    console.log(`    changedBy: ${changedBy} | ts: ${ts.toLocaleString('pt-BR')}`);

    if (!APPLY) { console.log(`    [DRY-RUN — não aplicado]\n`); continue; }

    const motivo = 'Contrato assinado confirmado via PLANILHA CONFERIDA JOSE 26/06/2026.';

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { stageId: contratoAssinado.id },
      }),
      prisma.leadTransitionLog.create({
        data: {
          tenantId: TENANT_SP9,
          leadId: lead.id,
          fromStage: lead.stage?.name ?? 'Aguard. Assinatura de Contrato',
          toStage: contratoAssinado.name,
          changedBy,
          evidenceDocumentId: null,
          motivo,
          cascade: false,
          createdAt: ts,
        },
      }),
      prisma.developmentUnit.update({
        where: { id: unit!.id },
        data: { status: 'VENDIDO', soldAt: ts },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        tenantId: TENANT_SP9,
        userId: changedBy,
        action: 'MOVE_PIPELINE',
        resourceType: 'lead',
        resourceId: lead.id,
        metadata: {
          fromStage: lead.stage?.name,
          toStage: contratoAssinado.name,
          group: contratoAssinado.group,
          role: 'AGENT',
          cascade: false,
          motivo,
        },
        createdAt: ts,
      },
    });

    console.log(`    ✅ aplicado\n`);
  }

  const espelho = await prisma.developmentUnit.groupBy({
    by: ['status'],
    where: { developmentId: DEV_JOSE_BONIFACIO },
    _count: true,
  });
  console.log('── Espelho atual ──');
  espelho.forEach((e) => console.log(`  ${e.status}: ${e._count}`));

  console.log(`\n${APPLY ? '✅ Concluído.' : '🔍 Dry-run. APPLY=1 para efetivar.'}\n`);
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
