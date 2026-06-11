import GoogleAnalytics from "@/components/GoogleAnalytics";

/**
 * Layout do site institucional (rota "/"). Isola o Google Analytics 4 nesta área pública —
 * o CRM logado (/leads, /admin, etc.) NÃO passa por aqui e não é medido.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAnalytics />
      {children}
    </>
  );
}
