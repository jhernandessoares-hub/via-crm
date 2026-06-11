import Script from "next/script";

/**
 * Google Analytics 4 — carregado APENAS no site institucional (via app/(site)/layout.tsx).
 * O ID vem da env NEXT_PUBLIC_GA_ID (ex: G-XXXXXXXXXX). Sem ID definido, nada é carregado
 * (seguro em dev/local). NEXT_PUBLIC_* é inlined no build do Next — definir no Railway ANTES do build.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function GoogleAnalytics() {
  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
