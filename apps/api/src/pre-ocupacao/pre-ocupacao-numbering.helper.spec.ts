import { PrismaClient } from '@prisma/client';
import { getNextDemandaNumber, getNextFamiliaNumber } from './pre-ocupacao-numbering.helper';

/**
 * Teste de integração contra o banco de dev real (não mockado) — necessário
 * porque o que queremos provar é a atomicidade do `upsert`+`increment` do
 * Postgres sob concorrência, algo que um mock não consegue validar de
 * verdade. Cria um Tenant descartável só para este teste e limpa tudo ao final
 * (cascade apaga os contadores).
 */
describe('pre-ocupacao-numbering.helper (integração, banco real)', () => {
  const prisma = new PrismaClient();
  let tenantId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({
      data: {
        nome: `QA Pre-Ocupacao Numbering ${suffix}`,
        slug: `qa-pre-ocupacao-numbering-${suffix}`,
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('getNextFamiliaNumber gera números únicos e sequenciais sob 20 chamadas concorrentes', async () => {
    const N = 20;
    const numeros = await Promise.all(Array.from({ length: N }, () => getNextFamiliaNumber(prisma, tenantId)));

    const unicos = new Set(numeros);
    expect(unicos.size).toBe(N); // nenhuma colisão

    const esperado = Array.from({ length: N }, (_, i) => i + 1).sort((a, b) => a - b);
    expect([...numeros].sort((a, b) => a - b)).toEqual(esperado);
  });

  it('getNextDemandaNumber é independente do contador de família e também não colide sob concorrência', async () => {
    const N = 15;
    const numeros = await Promise.all(Array.from({ length: N }, () => getNextDemandaNumber(prisma, tenantId)));

    expect(new Set(numeros).size).toBe(N);
    expect(Math.max(...numeros)).toBe(N);
  });

  it('chamadas sequenciais adicionais continuam incrementando sem reiniciar (contador persiste)', async () => {
    const antes = await getNextFamiliaNumber(prisma, tenantId);
    const depois = await getNextFamiliaNumber(prisma, tenantId);
    expect(depois).toBe(antes + 1);
  });
});
