/**
 * Arruma a posição das caixas do Fluxo do SP9 (só posX/posY de PipelineStage).
 * Cada Etapa = uma linha horizontal; as Saídas (Suspensão/Exclusão/Desistência) ficam numa 2ª linha.
 * Não altera setas, status, etapa nem lead.
 *
 *   DATABASE_URL=... npx ts-node scripts/layout-sp9-pipeline-flow.ts            (simulação)
 *   DATABASE_URL=... npx ts-node scripts/layout-sp9-pipeline-flow.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const TENANT_ID = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';

const COL = 260;
const LINE = 110;
const BLOCK = 270;

// [chave sem prefixo SP9_, bloco da etapa, linha (0 principal / 1 saídas), coluna]
const LAYOUT: Array<[string, number, number, number]> = [
  ['NOVO_LEAD', 0, 0, 0], ['EM_CONTATO', 0, 0, 1], ['LEAD_APTO', 0, 0, 2], ['LEAD_NAO_APTO', 0, 0, 3], ['PAROU_RESPONDER', 0, 0, 4],
  ['REATIVACAO_INSCRITO', 0, 1, 0], ['SUSPENSAO_PRE', 0, 1, 1], ['EXCLUSAO_PRE', 0, 1, 2], ['DESISTENCIA_PRE', 0, 1, 3],

  ['AGEND_ENTREGA_DOCS', 1, 0, 0], ['DOCS_PENDENTE', 1, 0, 1], ['DOCS_ANALISE_CDHU', 1, 0, 2], ['DOCS_APROVADOS', 1, 0, 3], ['DOCS_REPROVADO', 1, 0, 4],
  ['SUSPENSAO_DOC', 1, 1, 1], ['EXCLUSAO_DOC', 1, 1, 2], ['DESISTENCIA_DOC', 1, 1, 3],

  ['AGUARD_UNIDADE', 2, 0, 0], ['UNIDADE_VINCULADA', 2, 0, 1],
  ['SUSPENSAO_UNIDADE', 2, 1, 1], ['EXCLUSAO_UNIDADE', 2, 1, 2], ['DESISTENCIA_UNIDADE', 2, 1, 3],

  ['AGUARD_EMISSAO', 3, 0, 0], ['AGUARD_ASSINATURA', 3, 0, 1], ['CONTRATO_ASSINADO', 3, 0, 2],
  ['SUSPENSAO_CONT', 3, 1, 1], ['EXCLUSAO_CONT', 3, 1, 2], ['DESISTENCIA_CONT', 3, 1, 3],

  ['EM_REGISTRO', 4, 0, 0], ['REGISTRADO', 4, 0, 1],
  ['SUSPENSAO_REG', 4, 1, 1], ['EXCLUSAO_REG', 4, 1, 2], ['DESISTENCIA_REG', 4, 1, 3],
];

async function main() {
  console.log(`[layout-sp9-pipeline-flow] ${APPLY ? 'APPLY' : 'SIMULAÇÃO'}`);
  const stages = await prisma.pipelineStage.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, key: true, name: true },
  });
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const used = new Set<string>();
  const ops: Array<{ id: string; x: number; y: number }> = [];
  for (const [k, block, line, col] of LAYOUT) {
    const s = byKey.get(`SP9_${k}`);
    if (!s) { console.log('chave não encontrada:', k); continue; }
    used.add(s.id);
    ops.push({ id: s.id, x: col * COL, y: block * BLOCK + line * LINE });
  }
  const fora = stages.filter((s) => !used.has(s.id));
  console.log(`caixas a posicionar: ${ops.length} de ${stages.length}`, fora.length ? `| fora do layout: ${fora.map((s) => s.name).join(', ')}` : '');
  if (!APPLY) return console.log('[SIMULAÇÃO] nada gravado. Use --apply.');
  await prisma.$transaction(ops.map((o) => prisma.pipelineStage.update({ where: { id: o.id }, data: { posX: o.x, posY: o.y } })));
  console.log(`[APPLY] posições gravadas: ${ops.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
