/** Remove a fixture criada por create-portal-familia-browser-fixture.ts */
import * as dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/../.env` });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'fixture-browser-portal' } });
  if (!tenant) {
    console.log('Fixture não encontrada (já removida?).');
    return;
  }
  await prisma.preOcupacaoOcorrenciaAndamento.deleteMany({ where: { ocorrencia: { tenantId: tenant.id } } });
  await prisma.preOcupacaoOcorrenciaAnexo.deleteMany({ where: { ocorrencia: { tenantId: tenant.id } } });
  await prisma.preOcupacaoOcorrencia.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantPreOcupacaoDemandaCounter.deleteMany({ where: { tenantId: tenant.id } });
  const familias = await prisma.preOcupacaoFamilia.findMany({ where: { tenantId: tenant.id } });
  await prisma.preOcupacaoFamiliaSession.deleteMany({ where: { familiaId: { in: familias.map((f) => f.id) } } });
  await prisma.preOcupacaoFamilia.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantPreOcupacaoFamiliaCounter.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantSite.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.lead.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log('Fixture removida.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
