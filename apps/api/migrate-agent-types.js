const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.$executeRaw`
    UPDATE ai_agents
    SET "agentType" = 'OPERACIONAL'
    WHERE slug = 'assistente_operacional'
  `;
  console.log(`Atualizado: ${result} agente(s)`);
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
