import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/public")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("accessToken")?.value;

  // MVP: como você está usando localStorage, o middleware não enxerga.
  // Então por enquanto vamos só deixar passar e fazer o guard no client.
  // (No próximo passo, vamos mudar pra cookie httpOnly ou cookie normal.)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};
