"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

export default function NewProductPage() {
  const router = useRouter();

  return (
    <AppShell title="Novo produto">
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-8">
        <Link href="/products" className="text-xs text-gray-400 hover:text-gray-600">
          ← Produtos
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
          Novo produto
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          O que você está cadastrando?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Empreendimento */}
        <button
          type="button"
          onClick={() => router.push("/products/new/empreendimento?type=EMPREENDIMENTO")}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-7 text-center hover:border-blue-400 hover:shadow-md transition-all"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Empreendimento</p>
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              Projeto residencial ou comercial com múltiplas unidades
            </p>
          </div>
        </button>

        {/* Loteamento */}
        <button
          type="button"
          onClick={() => router.push("/products/new/empreendimento?type=LOTEAMENTO")}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-7 text-center hover:border-emerald-400 hover:shadow-md transition-all"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Loteamento</p>
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              Projeto de divisão de terreno em lotes individuais
            </p>
          </div>
        </button>

        {/* Imóvel */}
        <button
          type="button"
          onClick={() => router.push("/products/new/imovel")}
          className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-neutral-200 bg-white p-7 text-center hover:border-slate-400 hover:shadow-md transition-all"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Imóvel</p>
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              Casa, apartamento, terreno, sala comercial e outros
            </p>
          </div>
        </button>
      </div>
    </div>
    </AppShell>
  );
}
