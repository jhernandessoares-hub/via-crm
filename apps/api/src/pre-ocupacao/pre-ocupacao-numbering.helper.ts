import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

/**
 * Contadores sequenciais próprios do módulo Pré-Ocupação (TTS).
 *
 * - `getNextFamiliaNumber` numera `PreOcupacaoFamilia` via `TenantPreOcupacaoFamiliaCounter`.
 * - `getNextDemandaNumber` numera `PreOcupacaoOcorrencia` (protocolo da demanda) via
 *   `TenantPreOcupacaoDemandaCounter`.
 *
 * Ambos são contadores atômicos por tenant, independentes entre si e do
 * `TenantLeadCounter` já existente para o Lead de venda — ver
 * `leads/lead-numbering.helper.ts` para o padrão original.
 *
 * - `upsert` + `increment` é atômico no Postgres, então é seguro contra
 *   race conditions em criação concorrente.
 * - Pode ser chamado fora ou dentro de uma transação maior — basta passar
 *   o client `tx` no parâmetro `client`.
 *
 * Decisão (mesma regra do Lead — ver CLAUDE.md): números deletados NÃO são
 * reciclados — pulam. O contador só sobe, nunca desce.
 */
export async function getNextFamiliaNumber(
  client: PrismaService | Prisma.TransactionClient,
  tenantId: string,
): Promise<number> {
  const counter = await client.tenantPreOcupacaoFamiliaCounter.upsert({
    where: { tenantId },
    create: { tenantId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return counter.lastNumber;
}

export async function getNextDemandaNumber(
  client: PrismaService | Prisma.TransactionClient,
  tenantId: string,
): Promise<number> {
  const counter = await client.tenantPreOcupacaoDemandaCounter.upsert({
    where: { tenantId },
    create: { tenantId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return counter.lastNumber;
}
