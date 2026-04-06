"use client";
import dynamic from "next/dynamic";

const AuthGuard = dynamic(() => import("./AuthGuard"), { ssr: false });
const SecretaryWidget = dynamic(() => import("./SecretaryWidget"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthGuard>{children}</AuthGuard>
      <SecretaryWidget />
    </>
  );
}
