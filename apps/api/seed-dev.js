const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = 'via-crm-dev';
  const tenantName = 'VIA CRM DEV';
  const senha = '123456';
  const senhaHash = await bcrypt.hash(senha, 10);

  // tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { nome: tenantName, ativo: true },
    create: { slug: tenantSlug, nome: tenantName, ativo: true },
  });

  // users
  const users = [
    {
      nome: 'José Hernandes',
      email: 'jhernandes_soares@hotmail.com',
      role: 'OWNER',
    },
    {
      nome: 'Joana Elisa',
      email: 'jo-ana_soares@hotmail.com',
      role: 'OWNER',
    },
    {
      nome: 'Ana Carolina Santos',
      email: 'ana.santos@valureservicos.com.br',
      role: 'AGENT',
    },
    {
      nome: 'Hernandes Soares',
      email: 'hernandes@valureservicos.com.br',
      role: 'MANAGER',
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {
        nome: u.nome,
        role: u.role,
        ativo: true,
        senhaHash,
      },
      create: {
        tenantId: tenant.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        senhaHash,
        ativo: true,
      },
    });
  }

  // manager reasons (seed)
  const reasons = [
    'Atendimento com o primeiro atendente precário, necessário outro agent.',
    'Lead vindo de outro criativo/mídia/anúncio/produto, continuar atendimento com o mesmo agent anterior.',
    'Lead sem perfil para nenhum produto disponível, atendimento pela IA para encerramento cordial.',
  ];

  let order = 1;
  for (const label of reasons) {
    await prisma.managerDecisionReason.create({
      data: {
        tenantId: tenant.id,
        label,
        active: true,
        sortOrder: order++,
      },
    }).catch(() => {});
  }

  console.log('SEED OK');
  console.log('tenantSlug:', tenantSlug);
  console.log('senha padrão:', senha);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
