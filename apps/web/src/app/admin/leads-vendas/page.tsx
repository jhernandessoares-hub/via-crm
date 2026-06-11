"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";

type SalesLead = {
  id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  empresa?: string | null;
  numFuncionarios?: string | null;
  mensagem?: string | null;
  status: string;
  origem: string;
  createdAt: string;
};

const STATUS_OPTS = ["NOVO", "EM_CONTATO", "CONVERTIDO", "DESCARTADO"];

const STATUS_STYLE: Record<string, string> = {
  NOVO: "bg-blue-100 text-blue-700",
  EM_CONTATO: "bg-amber-100 text-amber-700",
  CONVERTIDO: "bg-emerald-100 text-emerald-700",
  DESCARTADO: "bg-slate-200 text-slate-500",
};

export default function AdminLeadsVendasPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminFetch("/admin/sales-leads")
      .then((d) => setLeads(d?.leads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const changeStatus = async (id: string, status: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await adminFetch(`/admin/sales-leads/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      load();
    }
  };

  const waLink = (l: SalesLead) =>
    `https://wa.me/${l.telefone.replace(/\D/g, "")}`;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads de Vendas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Contatos do site institucional (&ldquo;Falar com vendas&rdquo;)
          </p>
        </div>
        <button onClick={load} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
          Atualizar
        </button>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Nome", "Contato", "Empresa", "Funcionários", "Status", "Data", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum lead ainda.</td></tr>
            ) : leads.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 font-medium text-gray-900">{l.nome}</td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{l.telefone}</div>
                  {l.email && <div className="text-xs text-gray-400">{l.email}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{l.empresa || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{l.numFuncionarios || "—"}</td>
                <td className="px-4 py-3">
                  <select
                    value={l.status}
                    onChange={(e) => changeStatus(l.id, e.target.value)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold border-0 outline-none cursor-pointer ${STATUS_STYLE[l.status] || "bg-gray-100 text-gray-600"}`}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(l.createdAt).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={waLink(l)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    WhatsApp
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
