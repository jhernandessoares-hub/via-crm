import { PrismaService } from '../prisma/prisma.service';

/**
 * URL pública base do site do tenant, usada para montar links mágicos enviados
 * às famílias (convite de sessão, questionário). Domínio próprio publicado tem
 * prioridade — o `proxy.ts` do web reescreve `/portal/...` para `/s/<slug>/...`.
 */
export async function resolvePortalBaseUrl(prisma: PrismaService, tenantId: string): Promise<string> {
  const site = await prisma.tenantSite.findFirst({ where: { tenantId } });
  if (site?.customDomain && site.status === 'PUBLISHED') {
    return `https://${site.customDomain}`;
  }
  if (site?.slug) {
    return `${process.env.APP_URL || ''}/s/${site.slug}`;
  }
  return process.env.APP_URL || '';
}
