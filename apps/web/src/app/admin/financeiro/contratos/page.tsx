"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  DOC_TIPO_LABEL,
  FinCategoria,
  FinContato,
  FinContrato,
  FinDocumentType,
  FinDocumento,
  FinEmpresa,
  FinEntryType,
  btnPrimary,
  btnSecondary,
  cardCls,
  finApi,
  fmtDate,
  hojeStr,
  inputCls,
  selectCls,
  thCls,
} from "../_lib/fin";
import { AdminModal, ErrorBanner, FileButton, MoneyInput, PageHeader, useToast } from "../_components/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Duração/contagem regressiva do contrato — null quando falta início ou fim. */
function vigenciaDias(dataInicio: string | null, dataFim: string | null): string | null {
  if (!dataInicio || !dataFim) return null;
  const di = new Date(`${dataInicio.slice(0, 10)}T00:00:00Z`).getTime();
  const df = new Date(`${dataFim.slice(0, 10)}T00:00:00Z`).getTime();
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const duracao = Math.round((df - di) / DAY_MS);
  const restantes = Math.round((df - hojeUTC) / DAY_MS);
  if (restantes < 0) return `${duracao} dias · venceu há ${Math.abs(restantes)} dia(s)`;
  const decorridos = Math.max(0, Math.round((hojeUTC - di) / DAY_MS));
  return `${decorridos}/${duracao} dias · faltam ${restantes}`;
}

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

  // documentos do contrato aberto no modal
  const [docs, setDocs] = useState<FinDocumento[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docTipo, setDocTipo] = useState<FinDocumentType>("CONTRATO");
  const [docNumero, setDocNumero] = useState("");
  const [docDescricao, setDocDescricao] = useState("");
  const [docValor, setDocValor] = useState<number | undefined>(undefined);
  const [docDataEmissao, setDocDataEmissao] = useState(hojeStr());
  const [uploadingDoc, setUploadingDoc] = useState(false);

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

  const carregarDocs = useCallback((contractId: string) => {
    setDocsLoading(true);
    finApi.documentos({ contractId }).then(setDocs).catch((e) => setError(e.message)).finally(() => setDocsLoading(false));
  }, []);

  useEffect(() => {
    if (modal?.id) carregarDocs(modal.id);
    else setDocs([]);
    setPendingFile(null);
    setDocTipo("CONTRATO");
    setDocNumero("");
    setDocDescricao("");
    setDocValor(undefined);
    setDocDataEmissao(hojeStr());
  }, [modal?.id, carregarDocs]);

  const baixarDoc = async (docId: string) => {
    try {
      const r = await adminFetch(`/admin/financeiro/documentos/${docId}/download`);
      window.open(r.url, "_blank");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const enviarDocumento = async () => {
    if (!pendingFile || !modal?.id) return;
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("tipo", docTipo);
      if (docNumero.trim()) form.append("numero", docNumero.trim());
      if (docDescricao.trim()) form.append("descricao", docDescricao.trim());
      if (docValor) form.append("valor", String(docValor));
      if (docDataEmissao) form.append("dataEmissao", docDataEmissao);
      form.append("contractId", modal.id);
      if (modal.companyId) form.append("companyId", modal.companyId);
      if (modal.contactId) form.append("contactId", modal.contactId);
      await adminFetch("/admin/financeiro/documentos", { method: "POST", body: form });
      showToast("Documento enviado");
      setPendingFile(null);
      setDocNumero("");
      setDocDescricao("");
      setDocValor(undefined);
      carregarDocs(modal.id);
      // saldo a faturar pode ter mudado — recarrega o contrato
      const atualizado = await adminFetch(`/admin/financeiro/contratos/${modal.id}`);
      setModal((m) => (m ? { ...m, valorFaturado: atualizado.valorFaturado, saldoAFaturar: atualizado.saldoAFaturar } : m));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploadingDoc(false);
    }
  };

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

      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>Objeto</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>Contraparte</th>
              <th className={thCls}>Empresa</th>
              <th className={thCls}>Vigência</th>
              <th className={`${thCls} text-right`}>Total / Faturado</th>
              <th className={`${thCls} text-right`}>Saldo a faturar</th>
              <th className={`${thCls} text-right`}>Recebido / Pago</th>
              <th className={`${thCls} text-right`}>Em aberto</th>
              <th className={thCls}>Status</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
            ) : contratos.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">Nenhum contrato cadastrado.</td></tr>
            ) : (
              contratos.map((c) => {
                const dias = vigenciaDias(c.dataInicio, c.dataFim);
                return (
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
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                      {c.dataInicio || c.dataFim ? (
                        <>
                          <div>{fmtDate(c.dataInicio)} → {fmtDate(c.dataFim)}</div>
                          {dias && <div className="text-xs text-slate-400">{dias}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {c.valorTotal != null ? `${formatBRL(c.valorFaturado)} / ${formatBRL(c.valorTotal)}` : c.valorRecorrente != null ? `${formatBRL(c.valorRecorrente)}/mês` : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${(c.saldoAFaturar ?? 0) < 0 ? "text-red-600" : "text-slate-700"}`}>
                      {c.saldoAFaturar != null ? formatBRL(c.saldoAFaturar) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{formatBRL(c.valorRealizado)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${c.valorEmAberto > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {formatBRL(c.valorEmAberto)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.ativo ? "Ativo" : "Inativo"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => setModal(c)}>Editar</button>
                      {c.ativo && <button className="text-red-300 hover:text-red-600" onClick={() => excluir(c)}>Excluir</button>}
                    </td>
                  </tr>
                );
              })
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
            {modal.id && (
              <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {modal.valorTotal != null && (
                  <div>
                    Já faturado: <b>{formatBRL(modal.valorFaturado || 0)}</b> · Saldo a faturar:{" "}
                    <b className={(modal.saldoAFaturar ?? 0) < 0 ? "text-red-600" : "text-slate-700"}>{formatBRL(modal.saldoAFaturar ?? 0)}</b>
                  </div>
                )}
                <div>
                  {modal.tipo === "RECEBER" ? "Recebido" : "Pago"}: <b className="text-emerald-700">{formatBRL(modal.valorRealizado || 0)}</b> · Em aberto:{" "}
                  <b className={(modal.valorEmAberto || 0) > 0 ? "text-amber-600" : "text-slate-700"}>{formatBRL(modal.valorEmAberto || 0)}</b>
                </div>
                {vigenciaDias(modal.dataInicio || null, modal.dataFim || null) && (
                  <div>{vigenciaDias(modal.dataInicio || null, modal.dataFim || null)}</div>
                )}
              </div>
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

            {modal.id ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-600">Documentos do contrato</div>
                  <FileButton
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.xml"
                    label="+ Enviar documento"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    busy={uploadingDoc}
                    onSelect={(f) => setPendingFile(f)}
                  />
                </div>

                {docsLoading ? (
                  <p className="text-xs text-slate-400">Carregando...</p>
                ) : docs.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum documento vinculado ainda — envie o contrato assinado e as notas fiscais emitidas aqui.</p>
                ) : (
                  <div className="space-y-1.5">
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                        <span className="text-slate-700">
                          <span className="mr-2 text-slate-400">{DOC_TIPO_LABEL[d.tipo]}</span>
                          {d.numero || d.filename}
                          {d.valor != null && <span className="ml-2 text-slate-400">{formatBRL(d.valor)}</span>}
                        </span>
                        <button className="text-slate-500 hover:text-slate-800" onClick={() => baixarDoc(d.id)}>Ver / Baixar</button>
                      </div>
                    ))}
                  </div>
                )}

                {pendingFile && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="mb-2 text-xs text-slate-600">📄 {pendingFile.name}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                        <select className={selectCls} value={docTipo} onChange={(e) => setDocTipo(e.target.value as FinDocumentType)}>
                          {Object.entries(DOC_TIPO_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Número</label>
                        <input className={inputCls} value={docNumero} onChange={(e) => setDocNumero(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
                      <input className={inputCls} value={docDescricao} onChange={(e) => setDocDescricao(e.target.value)} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Valor</label>
                        <MoneyInput value={docValor} onValue={setDocValor} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Data de emissão</label>
                        <input type="date" className={inputCls} value={docDataEmissao} onChange={(e) => setDocDataEmissao(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button className={btnSecondary} disabled={uploadingDoc} onClick={() => setPendingFile(null)}>Cancelar</button>
                      <button className={btnPrimary} disabled={uploadingDoc} onClick={enviarDocumento}>{uploadingDoc ? "Enviando..." : "Enviar"}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Salve o contrato primeiro para poder anexar o documento assinado e as notas fiscais.</p>
            )}
          </div>
        </AdminModal>
      )}
      {toastNode}
    </div>
  );
}
