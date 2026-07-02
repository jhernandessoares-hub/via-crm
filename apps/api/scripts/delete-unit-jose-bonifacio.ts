/**
 * Script: excluir unidade do empreendimento José Bonifácio (SP9 — PRD)
 *
 * Modos:
 *   --list              Lista todas as unidades de todas as torres
 *   --delete <unitId>   Hard delete irreversível da unidade (com confirmação)
 *
 * Rodar de apps/api/:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/delete-unit-jose-bonifacio.ts -- --list
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/delete-unit-jose-bonifacio.ts -- --delete <unitId>
 */

// Preencher com a DATABASE_PUBLIC_URL do Railway (PostgreSQL → Variables → DATABASE_PUBLIC_URL)
process.env.DATABASE_URL = 'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEVELOPMENT_ID = '41da19cb-8450-447b-aa12-50196b5a82b5';

function pad(str: string | number | null | undefined, len: number): string {
  return String(str ?? '—').padEnd(len).slice(0, len);
}

async function listUnits(): Promise<void> {
  const towers = await prisma.tower.findMany({
    where: { developmentId: DEVELOPMENT_ID },
    include: {
      units: {
        include: {
          _count: { select: { bloqueioHistory: true, reservaHistory: true } },
        },
        orderBy: [{ andar: 'asc' }, { posicao: 'asc' }],
      },
    },
    orderBy: { nome: 'asc' },
  });

  if (!towers.length) {
    console.log('Nenhuma torre encontrada para o empreendimento José Bonifácio.');
    return;
  }

  for (const tower of towers) {
    console.log(`\n=== Torre: ${tower.nome} (${tower.id}) — ${tower.units.length} unidades ===`);
    console.log(
      pad('ID', 36) + ' | ' +
      pad('Nome', 8) + ' | ' +
      pad('Andar', 5) + ' | ' +
      pad('Pos', 4) + ' | ' +
      pad('Status', 11) + ' | ' +
      pad('Ativo', 5) + ' | ' +
      pad('leadId', 36) + ' | Hist',
    );
    console.log('-'.repeat(130));

    for (const u of tower.units) {
      console.log(
        pad(u.id, 36) + ' | ' +
        pad(u.nome, 8) + ' | ' +
        pad(u.andar, 5) + ' | ' +
        pad(u.posicao, 4) + ' | ' +
        pad(u.status, 11) + ' | ' +
        pad(String(u.ativo), 5) + ' | ' +
        pad(u.leadId, 36) + ' | ' +
        `bloq:${u._count.bloqueioHistory} res:${u._count.reservaHistory}`,
      );
    }
  }
}

function askConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function deleteUnit(unitId: string, force = false): Promise<void> {
  const unit = await prisma.developmentUnit.findUnique({
    where: { id: unitId },
    include: {
      bloqueioHistory: true,
      reservaHistory: true,
    },
  });

  if (!unit) {
    console.error(`❌ Unidade ${unitId} não encontrada.`);
    process.exit(1);
  }

  if (unit.developmentId !== DEVELOPMENT_ID) {
    console.error(`❌ Unidade ${unitId} não pertence ao empreendimento José Bonifácio.`);
    process.exit(1);
  }

  const tower = await prisma.tower.findUnique({ where: { id: unit.towerId } });

  console.log('\n=== Unidade a ser excluída ===');
  console.log(`ID:           ${unit.id}`);
  console.log(`Nome:         ${unit.nome}`);
  console.log(`Torre:        ${tower?.nome ?? unit.towerId}`);
  console.log(`Andar:        ${unit.andar ?? '—'}`);
  console.log(`Posição:      ${unit.posicao ?? '—'}`);
  console.log(`Status:       ${unit.status}`);
  console.log(`Ativo:        ${unit.ativo}`);
  console.log(`Lead:         ${unit.leadId ?? 'null'}`);
  console.log(`BloqueioHist: ${unit.bloqueioHistory.length} registro(s)`);
  console.log(`ReservaHist:  ${unit.reservaHistory.length} registro(s)`);

  if (unit.leadId) {
    console.log(`\n⚠️  Esta unidade está vinculada ao lead ${unit.leadId}.`);
    console.log('   O lead NÃO será excluído — apenas o registro da unidade.');
  }

  console.log('\n⚠️  OPERAÇÃO IRREVERSÍVEL — a unidade e todo seu histórico serão removidos do banco de dados.');

  if (!force) {
    const answer = await askConfirmation('\nDigite CONFIRMAR para prosseguir (ou qualquer outra coisa para cancelar): ');
    if (answer !== 'CONFIRMAR') {
      console.log('Operação cancelada.');
      process.exit(0);
    }
  } else {
    console.log('Flag --force detectada, prosseguindo sem confirmação interativa.');
  }

  console.log('\nExecutando hard delete em transação...');

  await prisma.$transaction(async (tx) => {
    const deletedBloqueio = await tx.unitBloqueioHistory.deleteMany({ where: { unitId } });
    console.log(`  → ${deletedBloqueio.count} registro(s) de BloqueioHistory excluído(s)`);

    const deletedReserva = await tx.unitReservaHistory.deleteMany({ where: { unitId } });
    console.log(`  → ${deletedReserva.count} registro(s) de ReservaHistory excluído(s)`);

    await tx.developmentUnit.delete({ where: { id: unitId } });
    console.log(`  → Unidade "${unit.nome}" excluída`);
  });

  console.log(`\n✅ Unidade "${unit.nome}" da torre "${tower?.nome}" excluída com sucesso do empreendimento José Bonifácio.`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não configurada. Preencha a variável no topo do script.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--list') {
    await listUnits();
  } else if (mode === '--delete') {
    const unitId = args[1];
    if (!unitId) {
      console.error('❌ Informe o ID da unidade: --delete <unitId>');
      process.exit(1);
    }
    const force = args.includes('--force');
    await deleteUnit(unitId, force);
  } else {
    console.log('Uso:');
    console.log('  --list              Lista todas as unidades de todas as torres');
    console.log('  --delete <unitId>   Hard delete da unidade (com confirmação)');
  }
}

main()
  .catch(err => { console.error('[delete-unit] erro:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
