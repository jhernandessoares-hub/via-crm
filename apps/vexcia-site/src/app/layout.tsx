import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vexcia | Grupo Vexcia",
  description:
    "Grupo Vexcia: tecnologia, crédito imobiliário e incorporação. Conheça a VIA CRM, a Valure e a Vex Imob.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
