"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

export default function AdminNovoClientePage() {
  const router = useRouter();
  const [form, setForm] = useState({ nome: "", slug: "", ownerNome: "", ownerEmail: "", ownerSenha: "", plan: "PREMIUM" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await adminFetch("/admin/tenants", { method: "POST", body: JSON.stringify(form) });
      router.push("/admin/clientes");
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar cliente.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: "nome", label: "Nome da empresa", placeholder: "Imobiliária Exemplo" },
    { key: "slug", label: "Slug (identificador único)", placeholder: "imobiliaria-exemplo" },
    { key: "ownerNome", label: "Nome do responsável (OWNER)", placeholder: "João Silva" },
    { key: "ownerEmail", label: "E-mail do responsável", placeholder: "joao@exemplo.com" },
    { key: "ownerSenha", label: "Senha inicial", placeholder: "Mínimo 8 caracteres" },
  ];

  return (
    <div className="p-8 max-w-lg space-y-6">
      <div>
        <Link href="/admin/clientes" className="text-xs text-gray-500 hover:underline">← Voltar</Link>
        <h1 className="text-2xl font-bold mt-2">Novo cliente</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 border rounded-lg bg-white p-6">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-gray-700">{f.label}</label>
            <input
              required
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={(form as any)[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              type={f.key === "ownerSenha" ? "password" : "text"}
              minLength={f.key === "ownerSenha" ? 8 : undefined}
            />
          </div>
        ))}
        {err &&<div className="text-sm text-red-600">{err}</div>}
        <button type="submit" disabled={loading} className="w-full rounded-md bg-slate-950 text-white py-2 text-sm hover:bg-slate-900 disabled:opacity-60">
          {loading ? "Criando..." : "Criar cliente"}
        </button>
      </form>
    </div>
  );
}
