/**
 * Cria uma fixture PERSISTENTE (não limpa no final) para testar o portal de
 * login das famílias manualmente no navegador. Rodar
 * remove-portal-familia-browser-fixture.ts depois de terminar o teste.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FamiliasService } from '../src/pre-ocupacao/familias.service';

const prisma = new PrismaClient();

async function main() {
  const prismaService = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaService);
  const familiasService = new FamiliasService(prismaService, audit);

  const tenant = await prisma.tenant.create({ data: { nome: '[FIXTURE-BROWSER] Portal Familia', slug: 'fixture-browser-portal' } });
  const site = await prisma.tenantSite.create({
    data: { tenantId: tenant.id, name: '[FIXTURE-BROWSER] Site', slug: 'fixture-browser-portal-site', siteType: 'INSTITUCIONAL', status: 'PUBLISHED', contentJson: {} },
  });
  const lead = await prisma.lead.create({
    data: { tenantId: tenant.id, nome: 'Maria da Silva', telefone: '5511988887777', telefoneKey: '511988887777', cpf: '111.222.333-44', dataNascimento: new Date('1988-03-20') },
  });
  const familia = await familiasService.ativar(tenant.id, lead.id, 'fixture-browser');

  console.log('Fixture criada:');
  console.log(`  slug do site: ${site.slug}`);
  console.log(`  URL do portal: http://localhost:3001/s/${site.slug}/portal/login`);
  console.log(`  CPF: 111.222.333-44`);
  console.log(`  Últimos 4 do telefone: 7777`);
  console.log(`  tenantId: ${tenant.id} / familiaId: ${familia.id}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
