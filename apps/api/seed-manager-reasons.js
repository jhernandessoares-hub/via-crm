const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * Seed idempotente por tenant:
 * - acha o tenant (preferência: slug via-crm-dev; senão pega o primeiro)
 * - cria motivos padrão se NÃO existir nenhum motivo para esse tenant
 */
async function main() {
  // 1) encontra o tenant
  let tenant = await prisma.tenant.findFirst({
    where: { slug: "via-crm-dev" },
    select: { id: true, slug: true },
  });

  if (!tenant) {
    tenant = await prisma.tenant.findFirst({
      select: { id: true, slug: true },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!tenant) {
    throw new Error("Nenhum tenant encontrado no banco. Crie um tenant antes de rodar o seed.");
  }

  console.log("Tenant escolhido:", tenant);

  // 2) se já existir algum motivo para esse tenant, não duplica
  const existingCount = await prisma.managerDecisionReason.count({
    where: { tenantId: tenant.id },
  });

  if (existingCount > 0) {
    console.log(`Já existem ${existingCount} motivos para o tenant ${tenant.slug || tenant.id}. Nada a fazer.`);
    return;
  }

  // 3) cria motivos padrão
  const defaults = [
    { label: "Reentrada: manter com o mesmo corretor", sortOrder: 1, active: true },
    { label: "Reentrada: rotear para outro corretor", sortOrder: 2, active: true },
    { label: "Fechado: manter fechado, não reabrir atendimento", sortOrder: 3, active: true },
    { label: "Ativar IA após qualificação (manter regras padrão)", sortOrder: 4, active: true },
    { label: "Contato inválido / sem WhatsApp", sortOrder: 5, active: true },
    { label: "Spam / lead ruim", sortOrder: 6, active: true },
  ];

  const created = await prisma.managerDecisionReason.createMany({
    data: defaults.map((d) => ({ ...d, tenantId: tenant.id })),
  });

  console.log("createMany result:", created);

  const after = await prisma.managerDecisionReason.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  console.log("Motivos no banco agora:");
  console.log(after);
  console.log(`TOTAL: ${after.length}`);
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });