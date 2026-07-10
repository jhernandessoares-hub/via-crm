import { NextResponse } from "next/server";

type VersionInfo = {
  version: string;
  commitSha: string | null;
  branch: string | null;
} | null;

async function fetchVersion(baseUrl?: string): Promise<VersionInfo> {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/version`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return { version: data.version, commitSha: data.commitSha, branch: data.branch };
  } catch {
    return null;
  }
}

async function isValidAdminToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/health`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!(await isValidAdminToken(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [dev, prod] = await Promise.all([
    fetchVersion(process.env.DEV_API_URL),
    fetchVersion(process.env.PROD_API_URL),
  ]);

  return NextResponse.json({
    dev,
    prod,
    match: !!dev && !!prod && dev.version === prod.version,
    configured: !!process.env.DEV_API_URL && !!process.env.PROD_API_URL,
  });
}
