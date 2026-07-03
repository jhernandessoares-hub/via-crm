import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só vale em `next dev`: permite testar domínios custom de sites de tenant
  // localmente (ex.: curl/Chrome com Host forjado) sem o dev server bloquear
  // os assets /_next. Não tem efeito em produção.
  allowedDevOrigins: ["simjosebonifacio.com.br", "www.simjosebonifacio.com.br"],
};

export default nextConfig;
