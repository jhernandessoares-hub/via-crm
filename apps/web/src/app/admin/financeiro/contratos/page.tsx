"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  FinCategoria,
  FinContato,
  FinContrato,
  FinEmpresa,
  FinEntryType,
  btnPrimary,
  btnSecondary,
  cardCls,
  finApi,
  inputCls,
  selectCls,
  thCls,
} from "../_lib/fin";
import { AdminModal, ErrorBanner, MoneyInput, PageHeader, useToast } from "../_components/shared";

export default function ContratosPage() {
  const [contratos, setContratos] = useState<FinContrato[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [contatos, setContatos] = useState<FinContato[]>([]);
  const [empresas, setEmpresas] = useState<FinEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Partial<FinContrato> | null>(null);
  const [saving, setSaving] = useState(false);
  const { showToast, toastNode } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    finApi.contratos(true).then(setContratos).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([finApi.categorias(), finApi.contatos(), finApi.empresas()])
      .then(([c, ct, e]) => { setCategorias(c); setContatos(ct); setEmpresas(e); })
      .catch((e) => setError(e.message));
  }, []);

  const salvar = async () => {
    if (!modal?.descricao?.trim() || !modal.tipo) return;
    setSaving(true);
    try {
      const body = {
        numero: modal.numero || undefined,
        descricao: modal.descricao.trim(),
        contactId: modal.contactId || undefined,
        companyId: modal.companyId || undefined,
        categoriaId: modal.categoriaId || undefined,
        valorTotal: modal.valorTotal ?? undefined,
        valorRecorrente: modal.valorRecorrente ?? undefined,
        dataInicio: modal.dataInicio || undefined,
        dataFim: modal.dataFim || undefined,
        observacao: modal.observacao || undefined,
      };
      if (modal.id) {
        await adminFetch(`/admin/financeiro/contratos/${modal.id}`, { method: "PATCH", body: JSON.stringify({ ...body, ativo: modal.ativo !== false }) });
      } else {
        await adminFetch("/admin/financeiro/contratos", { method: "POST", body: JSON.stringify({ ...body, tipo: modal.tipo }) });
      }
      showToast("Contrato salvo");
      setModal(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (c: FinContrato) => {
    try {
      const r = await adminFetch(`/admin/financeiro/contratos/${c.id}`, { method: "DELETE" });
      showToast(r.deleted ? "Contrato excluído" : "Contrato em uso — foi desativado");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const gruposDoTipo = (tipo: FinEntryType) => categorias.filter((g) => g.tipo === (tipo === "RECEBER" ? "RECEITA" : "DESPESA"));

  return (
    <div className="p-8">
      <PageHeader
        title="Contratos"
        subtitle="Contratos de prestação de serviço ou despesa contratual — vincule notas fiscais e títulos a eles"
        actions={<button className={btnPrimary} onClick={() => setModal({ tipo: "RECEBER" })}>+ Novo contrato</button>}
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>Objeto</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>Contraparte</th>
              <th className={thCls}>Empresa</th>
              <th className={`${thCls} text-right`}>Total / Faturado</th>
              <th className={`${thCls} text-right`}>Saldo a faturar</th>
              <th className={thCls}>Status</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
            ) : contratos.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Nenhum contrato cadastrado.</td></tr>
            ) : (
              contratos.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <button className="text-left font-medium text-slate-700 hover:underline" onClick={() => setModal(c)}>{c.descricao}</button>
                    {c.numero && <div className="text-xs text-slate-400">nº {c.numero}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.tipo === "RECEBER" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {c.tipo === "RECEBER" ? "Receita" : "Despesa"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{c.contact?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.company?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {c.valorTotal != null ? `${formatBRL(c.valorFaturado)} / ${formatBRL(c.valorTotal)}` : c.valorRecorrente != null ? `${formatBRL(c.valorRecorrente)}/mês` : "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-medium ${(c.saldoAFaturar ?? 0) < 0 ? "text-red-600" : "text-slate-700"}`}>
                    {c.saldoAFaturar != null ? formatBRL(c.saldoAFaturar) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.ativo ? "Ativo" : "Inativo"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => setModal(c)}>Editar</button>
                    {c.ativo && <button className="text-red-300 hover:text-red-600" onClick={() => excluir(c)}>Excluir</button>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal
          title={modal.id ? "Editar contrato" : "Novo contrato"}
          footer={
            <>
              <button className={btnSecondary} onClick={() => setModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !modal.descricao?.trim()} onClick={salvar}>{saving ? "Salvando..." : "Salvar"}</button>
            </>
          }
        >
          <div className="grid gap-3">
            {!modal.id && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                <div className="flex gap-2">
                  {(["RECEBER", "PAGAR"] as const).map((t) => (
                    <button
                      key={t}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${modal.tipo === t ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      onClick={() => setModal({ ...modal, tipo: t, categoriaId: undefined })}
                    >
                      {t === "RECEBER" ? "Presto serviço (receita)" : "Contrato de despesa"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Objeto do contrato *</label>
                <input className={inputCls} placeholder="Ex.: Consultoria mensal — Cliente X" value={modal.descricao || ""} onChange={(e) => setModal({ ...modal, descricao: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Número interno</label>
                <input className={inputCls} value={modal.numero || ""} onChange={(e) => setModal({ ...modal, numero: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Contraparte</label>
                <select className={selectCls} value={modal.contactId || ""} onChange={(e) => setModal({ ...modal, contactId: e.target.value })}>
                  <option value="">—</option>
                  {contatos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
                <select className={selectCls} value={modal.companyId || ""} onChange={(e) => setModal({ ...modal, companyId: e.target.value })}>
                  <option value="">—</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
                <select className={selectCls} value={modal.categoriaId || ""} onChange={(e) => setModal({ ...modal, categoriaId: e.target.value })}>
                  <option value="">—</option>
                  {gruposDoTipo((modal.tipo as FinEntryType) || "RECEBER").map((g) => (
                    <optgroup key={g.id} label={g.nome}>
                      {g.children.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Valor total <span className="font-normal text-slate-400">(contrato fechado)</span></label>
                <MoneyInput value={modal.valorTotal ?? undefined} onValue={(n) => setModal({ ...modal, valorTotal: n ?? null })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Valor recorrente <span className="font-normal text-slate-400">(mensal, se houver)</span></label>
                <MoneyInput value={modal.valorRecorrente ?? undefined} onValue={(n) => setModal({ ...modal, valorRecorrente: n ?? null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Início da vigência</label>
                <input type="date" className={inputCls} value={modal.dataInicio || ""} onChange={(e) => setModal({ ...modal, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Fim da vigência</label>
                <input type="date" className={inputCls} value={modal.dataFim || ""} onChange={(e) => setModal({ ...modal, dataFim: e.target.value })} />
              </div>
            </div>
            {modal.id && modal.valorTotal != null && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Já faturado: <b>{formatBRL(modal.valorFaturado || 0)}</b> · Saldo a faturar: <b>{formatBRL(modal.saldoAFaturar ?? 0)}</b>
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Observação</label>
              <input className={inputCls} value={modal.observacao || ""} onChange={(e) => setModal({ ...modal, observacao: e.target.value })} />
            </div>
            {modal.id && (
              <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modal.ativo !== false} onChange={(e) => setModal({ ...modal, ativo: e.target.checked })} />
                Contrato ativo
              </label>
            )}
          </div>
        </AdminModal>
      )}
      {toastNode}
    </div>
  );
}
