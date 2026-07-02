/**
 * Migração + backfill do campo `local` em PreOcupacaoOcorrencia: texto livre → enum.
 *
 * Contexto: o usuário testou manualmente o módulo Pré-Ocupação antes do `local`
 * virar enum (`PreOcupacaoOcorrenciaLocal`), então pode haver linhas com texto
 * livre na coluna. Este script é SEGURO por construção — nunca sobrescreve
 * `local` sem antes copiar o valor original para `localDescricao`:
 *
 *   1. Cria os enums `PreOcupacaoOcorrenciaLocal`/`PreOcupacaoOcorrenciaTipo`
 *      no banco (idempotente — `DO $$ ... EXCEPTION WHEN duplicate_object`).
 *   2. Adiciona a coluna `localDescricao` (TEXT, nullable) se não existir.
 *   3. Copia `local` → `localDescricao` para toda linha com `local IS NOT NULL`
 *      e `localDescricao IS NULL` (backfill não-destrutivo — texto original
 *      preservado ANTES de qualquer conversão de tipo).
 *   4. Só então converte a coluna `local` de TEXT para o enum, mapeando
 *      qualquer valor textual pré-existente para `'OUTRO'` (o texto original já
 *      está seguro em `localDescricao` do passo 3).
 *   5. Adiciona as colunas `tipo` (enum) e `resolucao` (TEXT) — puramente
 *      aditivo, sem risco de perda de dado.
 *
 * Rodar ANTES de `npx prisma generate` (o client antigo não conhece os campos
 * novos, mas `$executeRawUnsafe` não depende disso). Depois de rodar este
 * script, `npx prisma db push` deve reportar "already in sync" (ou não pedir
 * `--accept-data-loss`, já que a coluna já está no formato do schema-alvo).
 *
 * Uso:
 *   npx ts-node scripts/backfill-pre-ocupacao-ocorrencia-local.ts            (dry-run — só relata o que existe)
 *   npx ts-node scripts/backfill-pre-ocupacao-ocorrencia-local.ts --apply    (executa)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`[backfill-pre-ocupacao-ocorrencia-local] modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const existing: { id: string; tenantId: string; local: string | null }[] = await prisma.$queryRawUnsafe(
    `SELECT id, "tenantId", local FROM pre_ocupacao_ocorrencias WHERE local IS NOT NULL`,
  );
  console.log(`Linhas com "local" preenchido (texto livre): ${existing.length}`);
  for (const row of existing) {
    console.log(`  - id=${row.id} tenantId=${row.tenantId} local=${JSON.stringify(row.local)}`);
  }

  if (!APPLY) {
    console.log('Dry-run — nada foi alterado. Rode com --apply para migrar.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1. Enums (idempotente)
    await tx.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PreOcupacaoOcorrenciaLocal" AS ENUM ('PLANTAO', 'ONLINE', 'OUTRO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await tx.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PreOcupacaoOcorrenciaTipo" AS ENUM ('DUVIDA', 'DENUNCIA', 'ACOLHIMENTO', 'SOLICITACAO', 'ELOGIO', 'OUTRO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Nova coluna de texto livre (preserva o valor original)
    await tx.$executeRawUnsafe(
      `ALTER TABLE pre_ocupacao_ocorrencias ADD COLUMN IF NOT EXISTS "localDescricao" TEXT;`,
    );

    // 3. Backfill não-destrutivo: copia o texto original ANTES de mudar o tipo da coluna `local`
    const copied = await tx.$executeRawUnsafe(`
      UPDATE pre_ocupacao_ocorrencias
      SET "localDescricao" = local
      WHERE local IS NOT NULL AND "localDescricao" IS NULL;
    `);
    console.log(`Linhas copiadas para localDescricao: ${copied}`);

    // 4. Só agora converte o tipo da coluna `local` (texto original já está seguro em localDescricao)
    //    Só executa a conversão de tipo se a coluna ainda for texto (idempotente).
    const columnType: { data_type: string }[] = await tx.$queryRawUnsafe(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'pre_ocupacao_ocorrencias' AND column_name = 'local';
    `);
    if (columnType[0]?.data_type !== 'USER-DEFINED') {
      await tx.$executeRawUnsafe(`
        ALTER TABLE pre_ocupacao_ocorrencias
        ALTER COLUMN local TYPE "PreOcupacaoOcorrenciaLocal"
        USING (CASE WHEN local IS NOT NULL THEN 'OUTRO'::"PreOcupacaoOcorrenciaLocal" ELSE NULL END);
      `);
      console.log('Coluna "local" convertida para enum PreOcupacaoOcorrenciaLocal (valores antigos → OUTRO, texto original em localDescricao).');
    } else {
      console.log('Coluna "local" já é enum — pulando conversão de tipo.');
    }

    // 5. Colunas novas puramente aditivas
    await tx.$executeRawUnsafe(
      `ALTER TABLE pre_ocupacao_ocorrencias ADD COLUMN IF NOT EXISTS tipo "PreOcupacaoOcorrenciaTipo";`,
    );
    await tx.$executeRawUnsafe(
      `ALTER TABLE pre_ocupacao_ocorrencias ADD COLUMN IF NOT EXISTS resolucao TEXT;`,
    );
  });

  console.log('Migração concluída.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
