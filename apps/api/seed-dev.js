const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  // Tenants
  const devTenant = {
    id: '8510fa2e-c4b4-4cc1-aff1-b161ee9f1e66', // fixo como você pediu
    nome: 'VIA CRM DEV',
    slug: 'via-crm-dev',
    ativo: true,
  };

  const testTenant = {
    nome: 'VIA-CRM TESTE',
    slug: 'via-crm-teste',
    ativo: true,
  };

  // cria/garante tenants
  const tDev = await prisma.tenant.upsert({
    where: { id: devTenant.id },
    update: { nome: devTenant.nome, slug: devTenant.slug, ativo: true },
    create: devTenant,
  });

  const tTest = await prisma.tenant.upsert({
    where: { slug: testTenant.slug },
    update: { nome: testTenant.nome, ativo: true },
    create: testTenant,
  });

  const senhaHash = await bcrypt.hash('123456', 10);

  const users = [
    {
      nome: 'José Hernandes',
      email: 'jhernandes_soares@hotmail.com',
      tenantId: tDev.id,
      role: 'OWNER',
    },
    {
      nome: 'Joana Elisa',
      email: 'jo-ana_soares@hotmail.com',
      tenantId: tTest.id,
      role: 'OWNER',
    },
    {
      nome: 'Ana Carolina Santos',
      email: 'ana.santos@valureservicos.com.br',
      tenantId: tDev.id,
      role: 'AGENT',
    },
    {
      nome: 'Hernandes Soares',
      email: 'hernandes@valureservicos.com.br',
      tenantId: tDev.id,
      role: 'MANAGER',
    },
  ];

  for (const u of users) {
    const email = u.email.trim().toLowerCase();

    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: u.tenantId, email } },
      update: {
        nome: u.nome.trim(),
        role: u.role,
        ativo: true,
        senhaHash,
      },
      create: {
        tenantId: u.tenantId,
        nome: u.nome.trim(),
        email,
        role: u.role,
        ativo: true,
        senhaHash,
      },
    });
  }

  console.log('✅ Seed concluído!');
  console.log('DEV tenantId:', tDev.id, 'slug:', tDev.slug);
  console.log('TEST tenantId:', tTest.id, 'slug:', tTest.slug);
}

run()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
