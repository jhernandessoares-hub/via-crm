import type { Metadata } from "next";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "VIA CRM",
  description: "CRM imobiliario para atendimento, operacao e gestao",
  icons: {
    icon: [
      { url: "/favicon-via.svg", type: "image/svg+xml" },
      { url: "/favicon-via.png", type: "image/png", sizes: "256x256" },
    ],
    shortcut: "/favicon-via.png",
    apple: "/favicon-via.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="antialiased bg-gray-50">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
