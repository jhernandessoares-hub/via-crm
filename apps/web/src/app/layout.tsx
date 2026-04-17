import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VIA CRM",
  description: "CRM imobiliário para atendimento, operação e gestão",
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
    <html lang="pt-BR" className={inter.variable}>
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
