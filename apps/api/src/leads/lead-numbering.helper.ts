import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

/**
 * Gera o próximo número sequencial de lead para o tenant.
 *
 * - Cada tenant tem seu contador independente em `TenantLeadCounter`.
 * - `upsert` + `increment` é atômico no Postgres, então é seguro contra
 *   race conditions em criação concorrente via webhook.
 * - Pode ser chamado fora ou dentro de uma transação maior — basta passar
 *   o client `tx` no parâmetro `client`.
 *
 * Decisão (CLAUDE.md): números deletados NÃO são reciclados — pulam.
 * O contador só sobe, nunca desce.
 */
export async function getNextLeadNumber(
  client: PrismaService | Prisma.TransactionClient,
  tenantId: string,
): Promise<number> {
  const counter = await client.tenantLeadCounter.upsert({
    where: { tenantId },
    create: { tenantId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return counter.lastNumber;
}
