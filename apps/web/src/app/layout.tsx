import type { Metadata } from "next";
import AuthGuard from "@/components/AuthGuard";
import SecretaryWidget from "@/components/SecretaryWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIA CRM",
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
        <AuthGuard>{children}</AuthGuard>
        <SecretaryWidget />
      </body>
    </html>
  );
}
