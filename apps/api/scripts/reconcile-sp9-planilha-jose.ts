/**
 * Reconciliação one-off SP9 (José Bonifácio) a partir da conferência manual da planilha
 * "PLANILHA CONFERIDA JOSE.xlsx" feita pelo usuário. Executa 3 blocos de decisão:
 *
 *  A) Grupo 3 — 3 vendas voltam para RESERVADO: lead "Em Registro"[REGISTRO] → "Docs Pendente"
 *     [DOCUMENTACAO] (SP9_DOCS_PENDENTE) + unidade VENDIDO→RESERVADO (limpa soldAt).
 *       #273 FABIANA (Torre B/10010) · #123 JOSE ROBERTO (Torre B/9007) · #159 MARIA APARECIDA (Torre B/6003)
 *  B) Maria Lúcia #171 vira venda: lead "Unidade Vinculada"[ESCOLHA_UNIDADE] → "Contrato Assinado"
 *     [CONTRATO] (SP9_CONTRATO_ASSINADO, unitAction=VENDA) + unidade Torre B/2003 PROPOSTA→VENDIDO + soldAt=now.
 *  C) Grupo 2 — cadastrar cônjuges (titular da planilha como LeadParticipante CONJUGE no lead em produção).
 *       ACLEDSON→#276 · LUCIANA→#142 · ROBERTO MENESES→#268 · (REINALDO→#262 já existe → pula)
 *
 * Transições de etapa replicam fielmente o branch isCustomTransition de LeadsService.updateStage
 * (leads.service.ts): lead.update(stageId) + LeadTransitionLog + AuditLog MOVE_PIPELINE. Mudança de
 * status de unidade espelha developments.service.ts. Ator = OWNER José Hernandes (destinos requiresEvidence).
 *
 * Dry-run por padrão. APPLY=1 efetiva. Idempotente (guards por estado atual). NÃO COMMITAR (senha maglev + LGPD).
 *
 *   cd apps/api && npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-planilha-jose.ts
 *   APPLY=1 npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/reconcile-sp9-planilha-jose.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_SP9 = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEV_JOSE_BONIFACIO = '41da19cb-8450-447b-aa12-50196b5a82b5';
const OWNER_ID = 'eb481844-42bf-46f1-baff-ebfdb68a9193'; // José Hernandes Soares (OWNER)
const APPLY = process.env.APPLY === '1';

// Grupo 3: VENDIDO → RESERVADO (lead volta para Docs Pendente)
const GRUPO3 = [
  { numero: 273, apto: '10010' },
  { numero: 123, apto: '9007' },
  { numero: 159, apto: '6003' },
];

// Bloco B: PROPOSTA → VENDIDO (lead → Contrato Assinado). Maria Lúcia + famílias do Grupo 2 em PROPOSTA.
const VENDAS = [
  { numero: 171, apto: '2003' },  // Maria Lúcia
  { numero: 276, apto: '11002' }, // Ana Paula (cônjuge Acledson)
  { numero: 268, apto: '3012' },  // Cassia (cônjuge Roberto Meneses)
];

// Grupo 2: cônjuge (titular da planilha) → lead em produção
const CONJUGES = [
  { leadNumero: 276, nome: 'ACLEDSON DE QUEIROZ', cpf: '01543012132' },
  { leadNumero: 142, nome: 'LUCIANA GONCALVES DE MORAIS', cpf: '32889084841' },
  { leadNumero: 268, nome: 'ROBERTO FRANCISCO DE MENESES', cpf: '28057020857' },
];

const dig = (s: any) => String(s || '').replace(/\D/g, '');
const unitNum = (nome: string) => dig(nome);

async function leadByNumero(numero: number) {
  return prisma.lead.findFirst({
    where: { tenantId: TENANT_SP9, numero, deletedAt: null },
    select: { id: true, nome: true, nomeCorreto: true, stageId: true, stage: { select: { name: true, group: true } } },
  });
}

async function main() {
  console.log(`\n🚀 Reconciliação SP9 × PLANILHA CONFERIDA JOSE — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}\n`);

  // Resolver etapas-alvo por key
  const docsPendente = await prisma.pipelineStage.findFirst({
    where: { tenantId: TENANT_SP9, key: 'SP9_DOCS_PENDENTE' }, select: { id: true, name: true, group: true },
  });
  const contratoAssinado = await prisma.pipelineStage.findFirst({
    where: { tenantId: TENANT_SP9, key: 'SP9_CONTRATO_ASSINADO' }, select: { id: true, name: true, group: true },
  });
  if (!docsPendente || !contratoAssinado) throw new Error('Etapas-alvo (SP9_DOCS_PENDENTE / SP9_CONTRATO_ASSINADO) não encontradas.');

  // ───────────────────────── BLOCO A — Grupo 3 → RESERVADO ─────────────────────────
  console.log('── A) Grupo 3: VENDIDO → RESERVADO (lead → Docs Pendente) ──');
  for (const item of GRUPO3) {
    const lead = await leadByNumero(item.numero);
    if (!lead) { console.log(`  #${item.numero}: lead não encontrado — pulando`); continue; }
    const units = await prisma.developmentUnit.findMany({
      where: { developmentId: DEV_JOSE_BONIFACIO, leadId: lead.id },
      select: { id: true, nome: true, status: true, tower: { select: { nome: true } } },
    });
    const unit = units.find((u) => unitNum(u.nome) === item.apto) || units[0];
    const nome = lead.nomeCorreto || lead.nome;

    const leadOk = lead.stage?.group === 'REGISTRO';
    const unitOk = unit && unit.status === 'VENDIDO';
    if (!leadOk && !unitOk) { console.log(`  #${item.numero} ${nome}: já reconciliado (etapa=${lead.stage?.name}, unid=${unit?.status}) — pulando`); continue; }

    console.log(`  #${item.numero} ${nome} | etapa "${lead.stage?.name}" → "${docsPendente.name}" | unid ${unit?.tower?.nome}/${unit?.nome} ${unit?.status} → RESERVADO`);
    if (!APPLY) continue;

    const motivo = 'Reconciliação espelho de vendas (PLANILHA CONFERIDA JOSE): venda revertida para reserva. Ajuste administrativo (OWNER).';
    const ops: any[] = [];
    if (leadOk) {
      ops.push(prisma.lead.update({ where: { id: lead.id }, data: { stageId: docsPendente.id } }));
      ops.push(prisma.leadTransitionLog.create({
        data: { tenantId: TENANT_SP9, leadId: lead.id, fromStage: lead.stage?.name ?? 'Em Registro', toStage: docsPendente.name, changedBy: OWNER_ID, evidenceDocumentId: null, motivo, cascade: false },
      }));
    }
    if (unitOk) {
      ops.push(prisma.developmentUnit.update({ where: { id: unit!.id }, data: { status: 'RESERVADO', soldAt: null } }));
    }
    await prisma.$transaction(ops);
    if (leadOk) {
      await prisma.auditLog.create({
        data: { tenantId: TENANT_SP9, userId: OWNER_ID, action: 'MOVE_PIPELINE', resourceType: 'lead', resourceId: lead.id,
          metadata: { fromStage: lead.stage?.name, toStage: docsPendente.name, group: 'DOCUMENTACAO', role: 'OWNER', cascade: false, motivo, evidenceDocumentId: null } },
      });
    }
    console.log(`     ✅ aplicado`);
  }

  // ───────────────────────── BLOCO B — PROPOSTA → VENDIDO (Contrato Assinado) ─────────────────────────
  console.log('\n── B) PROPOSTA → VENDIDO (lead → Contrato Assinado) ──');
  for (const item of VENDAS) {
    const lead = await leadByNumero(item.numero);
    if (!lead) { console.log(`  #${item.numero}: lead não encontrado — pulando`); continue; }
    const units = await prisma.developmentUnit.findMany({
      where: { developmentId: DEV_JOSE_BONIFACIO, leadId: lead.id },
      select: { id: true, nome: true, status: true, tower: { select: { nome: true } } },
    });
    const unit = units.find((u) => unitNum(u.nome) === item.apto) || units[0];
    const nome = lead.nomeCorreto || lead.nome;
    const leadOk = lead.stage?.group === 'ESCOLHA_UNIDADE';
    const unitOk = unit && unit.status === 'PROPOSTA';
    if (!leadOk && !unitOk) { console.log(`  #${item.numero} ${nome}: já reconciliado (etapa=${lead.stage?.name}, unid=${unit?.status}) — pulando`); continue; }

    console.log(`  #${item.numero} ${nome} | etapa "${lead.stage?.name}" → "${contratoAssinado.name}" | unid ${unit?.tower?.nome}/${unit?.nome} ${unit?.status} → VENDIDO`);
    if (!APPLY) continue;

    const motivo = 'Reconciliação espelho de vendas (PLANILHA CONFERIDA JOSE): contrato assinado, venda confirmada. Ajuste administrativo (OWNER).';
    const ops: any[] = [];
    if (leadOk) {
      ops.push(prisma.lead.update({ where: { id: lead.id }, data: { stageId: contratoAssinado.id } }));
      ops.push(prisma.leadTransitionLog.create({
        data: { tenantId: TENANT_SP9, leadId: lead.id, fromStage: lead.stage?.name ?? 'Unidade Vinculada', toStage: contratoAssinado.name, changedBy: OWNER_ID, evidenceDocumentId: null, motivo, cascade: false },
      }));
    }
    if (unitOk) {
      ops.push(prisma.developmentUnit.update({ where: { id: unit!.id }, data: { status: 'VENDIDO', soldAt: new Date() } }));
    }
    await prisma.$transaction(ops);
    if (leadOk) {
      await prisma.auditLog.create({
        data: { tenantId: TENANT_SP9, userId: OWNER_ID, action: 'MOVE_PIPELINE', resourceType: 'lead', resourceId: lead.id,
          metadata: { fromStage: lead.stage?.name, toStage: contratoAssinado.name, group: 'CONTRATO', role: 'OWNER', cascade: false, motivo, evidenceDocumentId: null } },
      });
    }
    console.log(`     ✅ aplicado`);
  }

  // ───────────────────────── BLOCO C — cônjuges ─────────────────────────
  console.log('\n── C) Grupo 2: cadastrar cônjuges (LeadParticipante CONJUGE) ──');
  for (const c of CONJUGES) {
    const lead = await leadByNumero(c.leadNumero);
    if (!lead) { console.log(`  #${c.leadNumero}: lead não encontrado — pulando ${c.nome}`); continue; }
    const existing = await prisma.leadParticipante.findMany({ where: { leadId: lead.id }, select: { nome: true, cpf: true } });
    if (existing.some((p) => dig(p.cpf) === c.cpf)) {
      console.log(`  #${c.leadNumero} ${lead.nomeCorreto || lead.nome}: cônjuge ${c.nome} já cadastrado — pulando`);
      continue;
    }
    if (c.leadNumero === 142 && existing.length) {
      console.log(`  ⚠️  #142 já tem participante(s) [${existing.map((p) => `${p.nome}/${dig(p.cpf)}`).join(', ')}] — provável "lixo" da importação (Leandro como próprio cônjuge). NÃO removido automaticamente.`);
    }
    console.log(`  #${c.leadNumero} ${lead.nomeCorreto || lead.nome} ← cadastrar cônjuge "${c.nome}" (CPF ${c.cpf})`);
    if (!APPLY) continue;
    await prisma.leadParticipante.create({
      data: { tenantId: TENANT_SP9, leadId: lead.id, nome: c.nome, cpf: c.cpf, classificacao: 'CONJUGE',
        cadastroOrigem: { fonte: 'PLANILHA CONFERIDA JOSE', conferenciaManual: true } },
    });
    console.log(`     ✅ cadastrado`);
  }

  // ───────────────────────── Espelho final ─────────────────────────
  const espelho = await prisma.developmentUnit.groupBy({ by: ['status'], where: { developmentId: DEV_JOSE_BONIFACIO }, _count: true });
  console.log('\n── Espelho atual ──');
  espelho.forEach((e) => console.log(`  ${e.status}: ${e._count}`));

  console.log(`\n${APPLY ? '✅ Concluído.' : '🔍 Dry-run. Para efetivar: APPLY=1 npx ts-node ... scripts/reconcile-sp9-planilha-jose.ts'}\n`);
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
