import type { Metadata } from "next";

// O endereço tem o código do link da família: não repassar para outros sites
// (fontes, imagens) no cabeçalho Referer.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function QuestionarioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
