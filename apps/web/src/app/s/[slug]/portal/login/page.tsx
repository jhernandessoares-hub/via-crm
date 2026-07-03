"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { portalLogin } from "@/lib/portal-familia.service";

const LOGO_URL =
  "https://res.cloudinary.com/divurdnpz/image/upload/e_trim/v1783042264/via-crm/sites/sp9/yvzu4cu5xuswjbgayc35.jpg";

export default function PortalFamiliaLoginPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;
  const router = useRouter();

  const [cpf, setCpf] = useState("");
  const [telefoneFinal, setTelefoneFinal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await portalLogin(slug, cpf, telefoneFinal);
      router.replace(`/s/${slug}/portal`);
    } catch (err: any) {
      setError(err.message ?? "Não foi possível entrar. Verifique os dados e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-slate-950 mb-1">Área da Família</p>
            <p className="text-sm text-slate-500">Acompanhe seus atendimentos e solicitações</p>
          </div>
          <div className="relative h-14 w-14 shrink-0">
            <Image src={LOGO_URL} alt="SIM José Bonifácio" fill unoptimized className="object-contain" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CPF</label>
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              required
              disabled={loading}
              inputMode="numeric"
              placeholder="000.000.000-00"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Últimos 4 números do telefone</label>
            <input
              value={telefoneFinal}
              onChange={(e) => setTelefoneFinal(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              disabled={loading}
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            />
            <p className="text-xs text-slate-400">Os 4 últimos números do telefone cadastrado com a equipe.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-950 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
