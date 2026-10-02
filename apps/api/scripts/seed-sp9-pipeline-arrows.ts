/**
 * Cria as setas (PipelineTransition) do Fluxo do tenant SP9.
 *
 * Só INSERE linhas em PipelineTransition — não altera lead, status, etapa nem datas.
 * Idempotente (skipDuplicates). Simulação por padrão; --apply grava.
 *
 *   DATABASE_URL=... npx ts-node scripts/seed-sp9-pipeline-arrows.ts
 *   DATABASE_URL=... npx ts-node scripts/seed-sp9-pipeline-arrows.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const TENANT_ID = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

const P = (k: string) => `SP9_${k}`;
const exits = (suf: string) => [P(`SUSPENSAO_${suf}`), P(`EXCLUSAO_${suf}`), P(`DESISTENCIA_${suf}`)];

const NOVO = P('NOVO_LEAD'), CONTATO = P('EM_CONTATO'), APTO = P('LEAD_APTO');
const NAO_APTO = P('LEAD_NAO_APTO'), PAROU = P('PAROU_RESPONDER'), REATIVACAO = P('REATIVACAO_INSCRITO');
const AED = P('AGEND_ENTREGA_DOCS'), PEND = P('DOCS_PENDENTE'), ANALISE = P('DOCS_ANALISE_CDHU');
const APROV = P('DOCS_APROVADOS'), REPROV = P('DOCS_REPROVADO');
const AG_UNID = P('AGUARD_UNIDADE'), UNID_VINC = P('UNIDADE_VINCULADA');
const EMISSAO = P('AGUARD_EMISSAO'), ASSIN = P('AGUARD_ASSINATURA'), ASSINADO = P('CONTRATO_ASSINADO');
const EM_REG = P('EM_REGISTRO'), REGISTRADO = P('REGISTRADO');

const EXIT_GROUPS: Array<{ suf: string; from: string[] }> = [
  { suf: 'PRE', from: [CONTATO, APTO, NAO_APTO, PAROU] },
  { suf: 'DOC', from: [AED, PEND, ANALISE, REPROV, APROV] },
  { suf: 'UNIDADE', from: [AG_UNID, UNID_VINC] },
  { suf: 'CONT', from: [EMISSAO, ASSIN, ASSINADO] },
  { suf: 'REG', from: [EM_REG, REGISTRADO] },
];

const PAIRS: Array<[string, string]> = [
  // Pré-Atendimento
  [NOVO, CONTATO], [CONTATO, APTO], [CONTATO, NAO_APTO], [CONTATO, PAROU],
  [NAO_APTO, CONTATO], [PAROU, CONTATO], [REATIVACAO, CONTATO],
  // Documentação
  [AED, PEND], [AED, ANALISE], [PEND, ANALISE], [ANALISE, PEND],
  [ANALISE, APROV], [ANALISE, REPROV], [REPROV, PEND], [REPROV, NOVO],
  // Escolha da Unidade / Contrato / Registro
  [AG_UNID, UNID_VINC], [EMISSAO, ASSIN], [ASSIN, EMISSAO], [ASSIN, ASSINADO], [EM_REG, REGISTRADO],
  // passagem de etapa (antes era avanço automático)
  [APTO, AED], [APROV, AG_UNID], [UNID_VINC, EMISSAO], [ASSINADO, EM_REG],
];

for (const g of EXIT_GROUPS) {
  for (const f of g.from) for (const e of exits(g.suf)) PAIRS.push([f, e]);
  // saídas voltam pela Reativação do Inscrito (só dono)
  for (const e of exits(g.suf)) PAIRS.push([e, REATIVACAO]);
}

async function main() {
  console.log(`[seed-sp9-pipeline-arrows] ${APPLY ? 'APPLY' : 'SIMULAÇÃO'}`);
  const stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, key: true, name: true, pipelineId: true },
  });
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const missing = new Set<string>();
  const rows: Array<{ tenantId: string; pipelineId: string; fromStageId: string; toStageId: string }> = [];
  const seen = new Set<string>();
  for (const [a, b] of PAIRS) {
    const from = byKey.get(a), to = byKey.get(b);
    if (!from) missing.add(a);
    if (!to) missing.add(b);
    if (!from || !to) continue;
    const k = `${from.id}>${to.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ tenantId: TENANT_ID, pipelineId: from.pipelineId, fromStageId: from.id, toStageId: to.id });
  }
  const existing = await prisma.pipelineTransition.count({ where: { tenantId: TENANT_ID } });
  console.log(`status ativos: ${stages.length} | setas já existentes: ${existing} | setas a gravar: ${rows.length}`);
  if (missing.size) console.log('chaves NÃO encontradas:', [...missing].join(', '));
  const sem = stages.filter((s) => !rows.some((r) => r.fromStageId === s.id));
  console.log('status sem seta saindo:', sem.map((s) => s.name).join(' | ') || '(nenhum)');
  if (!APPLY) return console.log('[SIMULAÇÃO] nada gravado. Use --apply.');
  if (missing.size) throw new Error('Abortado: há chaves ausentes.');
  const r = await prisma.pipelineTransition.createMany({ data: rows, skipDuplicates: true });
  console.log(`[APPLY] setas criadas: ${r.count}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
