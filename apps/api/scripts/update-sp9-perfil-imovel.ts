/**
 * Atualiza perfilImovel de todos os leads importados do SP9
 * para o nome do empreendimento já cadastrado no sistema.
 *
 * Rodar: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/update-sp9-perfil-imovel.ts
 */

process.env.DATABASE_URL = 'postgresql://postgres:vIpOFBLarwkjGfmdZOKGaxoYlMgqllmi@maglev.proxy.rlwy.net:22547/railway';

const TENANT_ID      = '5705ea62-0b1e-4323-8c84-99cdd9d4df7c';
const DEVELOPMENT_ID = '41da19cb-8450-447b-aa12-50196b5a82b5';
const ORIGEM         = 'IMPORTACAO_SP9';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Busca o nome do empreendimento
  const dev = await prisma.development.findFirst({
    where: { id: DEVELOPMENT_ID, tenantId: TENANT_ID },
    select: { nome: true },
  });

  if (!dev) {
    console.error('❌ Empreendimento não encontrado. Verifique os IDs.');
    process.exit(1);
  }

  console.log(`✅ Empreendimento: "${dev.nome}"`);

  // Atualiza todos os leads SP9 sem perfilImovel (ou força atualização em todos)
  const result = await prisma.lead.updateMany({
    where: {
      tenantId: TENANT_ID,
      origem: ORIGEM,
      deletedAt: null,
    },
    data: {
      perfilImovel: dev.nome,
    },
  });

  console.log(`✅ ${result.count} leads atualizados com perfilImovel = "${dev.nome}"`);
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
