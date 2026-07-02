/**
 * Teste local (dev DB) do fluxo:
 *   1. addAddonToTenant(PRE_OCUPACAO) num tenant fixture
 *   2. SitesService.submitDemanda() cria PreOcupacaoOcorrencia com origem SITE / familiaId null
 *
 * NÃO usa o tenant real do SP9 (5705ea62-0b1e-4323-8c84-99cdd9d4df7c) porque esse tenant
 * NÃO existe no banco de dev local (.env aponta para metro.proxy.rlwy.net, que só tem o
 * tenant "Teste Local" — o SP9 real vive em produção). Cria um tenant/site fixture
 * temporário, testa o fluxo ponta a ponta, e remove tudo no final.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LimitsService } from '../src/plans/limits.service';
import { UsageService } from '../src/plans/usage.service';
import { PlansService } from '../src/admin/plans.service';
import { SitesService } from '../src/sites/sites.service';
import { seedPlanConfigs } from '../src/plans/plans.seed';

const prisma = new PrismaClient();

async function main() {
  console.log(`Conectando em: ${(process.env.DATABASE_URL || '').split('@')[1] ?? '(sem DATABASE_URL)'}`);

  await seedPlanConfigs(prisma);

  const fixtureTenant = await prisma.tenant.create({
    data: { nome: '[FIXTURE] Pre-Ocupacao Test', slug: `fixture-preocupacao-${Date.now()}` },
  });
  console.log(`Tenant fixture criado: ${fixtureTenant.id}`);

  const fixtureSite = await prisma.tenantSite.create({
    data: {
      tenantId: fixtureTenant.id,
      name: '[FIXTURE] Site Pre-Ocupacao Test',
      slug: `fixture-site-${Date.now()}`,
      siteType: 'INSTITUCIONAL',
      status: 'PUBLISHED',
      contentJson: {},
    },
  });
  console.log(`TenantSite fixture criado: slug=${fixtureSite.slug}`);

  const prismaService = prisma as unknown as PrismaService;
  const usageService = new UsageService(prismaService);
  const limitsService = new LimitsService(prismaService, usageService);
  const plansService = new PlansService(prismaService, limitsService, usageService);
  const sitesService = new SitesService(prismaService, limitsService);

  const updatedTenant = await plansService.addAddonToTenant(fixtureTenant.id, 'PRE_OCUPACAO', 'system-setup-test');
  console.log(`Addon habilitado. addons=${JSON.stringify(updatedTenant.addons)}`);

  const ocorrencia = await sitesService.submitDemanda(fixtureSite.slug, {
    titulo: 'Vazamento no banheiro do apto 302',
    local: 'Bloco B, apto 302',
    dataAtendimento: '2026-07-10',
    horario: '14:00',
    observacoes: 'Relato via formulário público do site.',
  });
  console.log('PreOcupacaoOcorrencia criada:', JSON.stringify(ocorrencia, null, 2));

  // Validação de erro: título vazio deve lançar BadRequestException
  let threw = false;
  try {
    await sitesService.submitDemanda(fixtureSite.slug, { titulo: '   ' });
  } catch (e: any) {
    threw = true;
    console.log(`Validação OK — título vazio rejeitado: ${e.message}`);
  }
  if (!threw) console.error('FALHA: título vazio não foi rejeitado!');

  // Validação de erro: slug inexistente deve lançar NotFoundException
  threw = false;
  try {
    await sitesService.submitDemanda('slug-que-nao-existe-xyz', { titulo: 'teste' });
  } catch (e: any) {
    threw = true;
    console.log(`Validação OK — slug inexistente rejeitado: ${e.message}`);
  }
  if (!threw) console.error('FALHA: slug inexistente não foi rejeitado!');

  // Cleanup
  await prisma.preOcupacaoOcorrencia.deleteMany({ where: { tenantId: fixtureTenant.id } });
  await prisma.tenantPreOcupacaoDemandaCounter.deleteMany({ where: { tenantId: fixtureTenant.id } });
  await prisma.tenantSite.deleteMany({ where: { tenantId: fixtureTenant.id } });
  await prisma.tenant.delete({ where: { id: fixtureTenant.id } });
  console.log('Fixtures removidos (tenant, site, ocorrência, counter).');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
