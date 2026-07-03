import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Roteamento por domínio custom: quando a requisição chega num host que não é
 * do próprio app (ex.: simjosebonifacio.com.br), resolve o slug do TenantSite
 * pelo customDomain (GET /sites/public/domain/:host) e reescreve o path para
 * /s/<slug>/... — o domínio serve o site público (e o Portal da Família em
 * /portal) sem mudar a URL no navegador.
 *
 * Auth continua no client (AuthGuard) — tokens ficam em localStorage e o
 * proxy não os enxerga.
 */

const API = process.env.NEXT_PUBLIC_API_URL || "";

// Hosts do próprio CRM (nunca reescritos). Além da env NEXT_PUBLIC_APP_HOSTS
// (separada por vírgula), localhost e *.railway.app são sempre hosts do app.
const APP_HOSTS = (process.env.NEXT_PUBLIC_APP_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const CACHE_TTL_MS = 5 * 60 * 1000;
const domainCache = new Map<string, { slug: string | null; expires: number }>();

function isAppHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".railway.app")) return true;
  return APP_HOSTS.includes(host);
}

async function resolveSlugByDomain(host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.slug;

  let slug: string | null = null;
  try {
    const res = await fetch(`${API}/sites/public/domain/${encodeURIComponent(host)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      slug = typeof data?.slug === "string" ? data.slug : null;
    }
  } catch {
    // API fora do ar — segue sem rewrite (cai no fluxo normal do app)
  }

  domainCache.set(host, { slug, expires: Date.now() + CACHE_TTL_MS });
  return slug;
}

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  if (isAppHost(host)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Links internos do site já usam /s/<slug>/... absolutos — deixa passar
  if (pathname.startsWith("/s/")) return NextResponse.next();

  const slug = await resolveSlugByDomain(host);
  if (!slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Ignora assets do Next, rotas de API e arquivos estáticos (path com ponto)
  matcher: ["/((?!_next|api/|.*\\..*).*)"],
};
