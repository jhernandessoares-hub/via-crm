/**
 * Habilita o addon PLANEJAMENTO_TTS no tenant SP9.
 *
 * Usa `PlansService.addAddonToTenant()` (mesma regra de produção: exige que
 * `AddonConfig[key=PLANEJAMENTO_TTS]` já exista — criado via `seedPlanConfigs()`
 * no startup da API, `ADDON_CONFIGS` em `src/plans/plans.seed.ts`).
 *
 * Conecta no banco definido em `.env` (dev local) — NÃO sobrescreve DATABASE_URL.
 * Idempotente: `addAddonToTenant` já checa `tenant.addons.includes(addonKey)`.
 *
 * Uso:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/enable-planejamento-tts-addon-sp9.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LimitsService } from '../src/plans/limits.service';
import { UsageService } from '../src/plans/usage.service';
import { PlansService } from '../src/admin/plans.service';
import { seedPlanConfigs } from '../src/plans/plans.seed';

const prisma = new PrismaClient();

// Em dev, sobrescreva com TENANT_ID=<uuid do tenant de teste> (o SP9 real só existe em produção).
const TENANT_SP9 = process.env.TENANT_ID || '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const ADDON_KEY = 'PLANEJAMENTO_TTS';

async function main() {
  console.log(`Conectando em: ${(process.env.DATABASE_URL || '').split('@')[1] ?? '(sem DATABASE_URL)'}`);

  // Idempotente — mesma função rodada no startup da API (main.ts). Garante que o
  // AddonConfig PLANEJAMENTO_TTS exista sem precisar subir a API inteira.
  await seedPlanConfigs(prisma);

  const addonConfig = await prisma.addonConfig.findUnique({ where: { key: ADDON_KEY } });
  if (!addonConfig) {
    throw new Error(
      `AddonConfig '${ADDON_KEY}' não encontrado mesmo após seedPlanConfigs(). Verifique ADDON_CONFIGS em plans.seed.ts.`,
    );
  }
  console.log(`AddonConfig '${ADDON_KEY}' encontrado (requiresTier=${addonConfig.requiresTier ?? 'null'}).`);

  // Reaproveita o mesmo PlansService usado em produção (mesma validação de requiresTier).
  const prismaService = prisma as unknown as PrismaService;
  const usageService = new UsageService(prismaService);
  const limitsService = new LimitsService(prismaService, usageService);
  const plansService = new PlansService(prismaService, limitsService, usageService);

  const updated = await plansService.addAddonToTenant(TENANT_SP9, ADDON_KEY, 'system-setup');
  console.log(`Tenant ${TENANT_SP9} — addons: ${JSON.stringify(updated.addons)}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
