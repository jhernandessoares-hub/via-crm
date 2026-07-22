"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  DOC_TIPO_LABEL,
  DOC_TIPO_STYLE,
  FinCategoria,
  FinConta,
  FinContato,
  FinContrato,
  FinDocumentType,
  FinDocumento,
  FinEmpresa,
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
import {
  AdminModal,
  DocPreviewInfo,
  DownloadModal,
  ErrorBanner,
  FileButton,
  MoneyInput,
  PageHeader,
  baixarDocumentoDireto,
  useToast,
} from "../_components/shared";

// Documentos tipo Contrato (arquivo do contrato/aditivo) só existem dentro da tela de Contratos —
// não aparecem nem são enviáveis por aqui, pra não misturar com notas/guias/comprovantes.
const DOC_TIPO_LABEL_SEM_CONTRATO = Object.fromEntries(
  Object.entries(DOC_TIPO_LABEL).filter(([k]) => k !== "CONTRATO"),
) as typeof DOC_TIPO_LABEL;

export default function DocumentosFiscaisPage() {
  const [docs, setDocs] = useState<FinDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { showToast, toastNode } = useToast();

  // filtros
  const [tipo, setTipo] = useState("");
  const [vinculado, setVinculado] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  // auxiliares
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [contatos, setContatos] = useState<FinContato[]>([]);
  const [empresas, setEmpresas] = useState<FinEmpresa[]>([]);
  const [contratos, setContratos] = useState<FinContrato[]>([]);

  // modais
  const [uploadModal, setUploadModal] = useState<{ file: File } | null>(null);
  const [gerarModal, setGerarModal] = useState<FinDocumento | null>(null);
  const [previewInfo, setPreviewInfo] = useState<DocPreviewInfo | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const load = useCallback(() => {
    setLoading(true);
    finApi
      .documentos({ tipo, vinculado, companyId, busca: buscaDebounced })
      .then(setDocs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tipo, vinculado, companyId, buscaDebounced]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([finApi.categorias(), finApi.contas(), finApi.contatos(), finApi.empresas(), finApi.contratos()])
      .then(([c, ct, ctt, emps, contrs]) => {
        setCategorias(c);
        setContas(ct.filter((x) => x.ativo));
        setContatos(ctt);
        setEmpresas(emps);
        setContratos(contrs);
      })
      .catch((e) => setError(e.message));
  }, []);

  const ver = (doc: FinDocumento) => setPreviewInfo({ id: doc.id, filename: doc.filename, mimeType: doc.mimeType });

  const baixar = async (doc: FinDocumento) => {
    try {
      await baixarDocumentoDireto(doc.id, doc.filename);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const excluir = async (doc: FinDocumento) => {
    try {
      await adminFetch(`/admin/financeiro/documentos/${doc.id}`, { method: "DELETE" });
      showToast("Documento excluído");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Documentos Fiscais"
        subtitle="Notas fiscais, guias de impostos, comprovantes e boletos — gere o compromisso financeiro a partir do documento"
        actions={
          <FileButton
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xml"
            label="+ Enviar documento"
            className={btnPrimary}
            busy={uploading}
            onSelect={(file) => setUploadModal({ file })}
          />
        }
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
          <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ width: 170 }}>
            <option value="">Todos</option>
            {Object.entries(DOC_TIPO_LABEL_SEM_CONTRATO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Vínculo</label>
          <select className={selectCls} value={vinculado} onChange={(e) => setVinculado(e.target.value)} style={{ width: 170 }}>
            <option value="">Todos</option>
            <option value="sim">Com lançamento</option>
            <option value="nao">Sem lançamento</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
          <select className={selectCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={{ width: 160 }}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Busca</label>
          <input className={inputCls} placeholder="Número, descrição, arquivo ou contraparte..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>Emissão</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>Número / Arquivo</th>
              <th className={thCls}>Contraparte</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={thCls}>Lançamentos</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Nenhum documento — envie a primeira nota, guia ou comprovante.</td></tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                    {fmtDate(d.dataEmissao) !== "—" ? fmtDate(d.dataEmissao) : fmtDate(d.createdAt.slice(0, 10))}
                    {d.dataPagamento && <div className="text-xs text-emerald-600">pago {fmtDate(d.dataPagamento)}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOC_TIPO_STYLE[d.tipo]}`}>{DOC_TIPO_LABEL[d.tipo]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-700">{d.numero || d.descricao || d.filename}</div>
                    <div className="text-xs text-slate-400">{d.filename}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{d.contact?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{d.valor != null ? formatBRL(d.valor) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {d.entries.length === 0 ? (
                      <span className="text-xs text-slate-400">Nenhum</span>
                    ) : (
                      <span className="text-xs text-slate-600">
                        {d.entries.length} título(s) · {formatBRL(d.entries.reduce((a, e) => a + e.valor, 0))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                    <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => ver(d)}>Ver</button>
                    <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => baixar(d)}>Baixar</button>
                    <button className="mr-3 font-medium text-emerald-600 hover:text-emerald-800" onClick={() => setGerarModal(d)}>Gerar lançamento</button>
                    {d.entries.length === 0 && (
                      <button className="text-red-300 hover:text-red-600" onClick={() => excluir(d)}>Excluir</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {uploadModal && (
        <UploadModal
          file={uploadModal.file}
          contatos={contatos}
          empresas={empresas}
          contratos={contratos}
          uploading={uploading}
          setUploading={setUploading}
          onClose={() => setUploadModal(null)}
          onSaved={() => { setUploadModal(null); showToast("Documento enviado"); load(); }}
          onError={setError}
        />
      )}
      {gerarModal && (
        <GerarLancamentoModal
          doc={gerarModal}
          categorias={categorias}
          contas={contas}
          onClose={() => setGerarModal(null)}
          onSaved={() => { setGerarModal(null); showToast("Lançamento(s) criado(s) a partir do documento"); load(); }}
          onError={setError}
        />
      )}
      <DownloadModal info={previewInfo} onClose={() => setPreviewInfo(null)} />
      {toastNode}
    </div>
  );
}

// ============================ Upload ============================

function UploadModal({
  file,
  contatos,
  empresas,
  contratos,
  uploading,
  setUploading,
  onClose,
  onSaved,
  onError,
}: {
  file: File;
  contatos: FinContato[];
  empresas: FinEmpresa[];
  contratos: FinContrato[];
  uploading: boolean;
  setUploading: (b: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [tipo, setTipo] = useState<FinDocumentType>("NF_EMITIDA");
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number | undefined>(undefined);
  const [dataEmissao, setDataEmissao] = useState(hojeStr());
  const [dataPagamento, setDataPagamento] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");

  // só sugere contratos dessa contraparte — sem contraparte escolhida, não faz sentido mostrar
  const contratosDaContraparte = contactId ? contratos.filter((c) => c.contactId === contactId) : [];
  const contratoSelecionado = contratosDaContraparte.find((c) => c.id === contractId) || null;

  // preview do arquivo local — nada sobe pro servidor só pra visualizar
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");

  const enviar = async () => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tipo", tipo);
      if (numero.trim()) form.append("numero", numero.trim());
      if (descricao.trim()) form.append("descricao", descricao.trim());
      if (valor) form.append("valor", String(valor));
      if (dataEmissao) form.append("dataEmissao", dataEmissao);
      if (dataPagamento) form.append("dataPagamento", dataPagamento);
      if (contactId) form.append("contactId", contactId);
      if (companyId) form.append("companyId", companyId);
      if (contractId) form.append("contractId", contractId);
      await adminFetch("/admin/financeiro/documentos", { method: "POST", body: form });
      onSaved();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminModal
      title="Enviar documento fiscal"
      width="max-w-6xl"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={uploading}>Cancelar</button>
          <button className={btnPrimary} disabled={uploading} onClick={enviar}>{uploading ? "Enviando..." : "Enviar"}</button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs text-slate-500">
            📄 {file.name} <span className="text-slate-400">({(file.size / 1024 / 1024).toFixed(2)} MB — máx. 10 MB)</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{ height: "65vh" }}>
            {isPdf ? (
              <iframe src={previewUrl} title={file.name} className="h-full w-full" />
            ) : isImage ? (
              <img src={previewUrl} alt={file.name} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
                Pré-visualização não disponível para este tipo de arquivo — confira o conteúdo depois de enviar.
              </div>
            )}
          </div>
        </div>
        <div className="grid content-start gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tipo *</label>
            <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value as FinDocumentType)}>
              {Object.entries(DOC_TIPO_LABEL_SEM_CONTRATO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Número</label>
            <input className={inputCls} placeholder="Ex.: NF 000123" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
          <input className={inputCls} placeholder="Ex.: NF serviço de consultoria julho" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor</label>
            <MoneyInput value={valor} onValue={setValor} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data de emissão</label>
            <input type="date" className={inputCls} value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data de pagamento <span className="font-normal text-slate-400">(se já pago)</span></label>
            <input type="date" className={inputCls} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Contraparte</label>
            <select
              className={selectCls}
              value={contactId}
              onChange={(e) => { setContactId(e.target.value); setContractId(""); }}
            >
              <option value="">—</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Empresa</label>
            <select className={selectCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">—</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>
        </div>
        {contactId && contratosDaContraparte.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Contrato <span className="font-normal text-slate-400">(opcional — computa no faturamento do contrato)</span></label>
            <select className={selectCls} value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">—</option>
              {contratosDaContraparte.map((c) => (
                <option key={c.id} value={c.id}>{c.descricao}{c.numero ? ` (nº ${c.numero})` : ""}</option>
              ))}
            </select>
          </div>
        )}
        {contratoSelecionado && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {contratoSelecionado.valorTotal != null ? (
              <>
                Já faturado: <b>{formatBRL(contratoSelecionado.valorFaturado)}</b> de <b>{formatBRL(contratoSelecionado.valorTotal)}</b> · Saldo a faturar:{" "}
                <b className={(contratoSelecionado.saldoAFaturar ?? 0) < 0 ? "text-red-600" : "text-slate-700"}>{formatBRL(contratoSelecionado.saldoAFaturar ?? 0)}</b>
              </>
            ) : (
              "Contrato recorrente — sem teto definido, sem saldo a faturar."
            )}
          </p>
        )}
        </div>
      </div>
    </AdminModal>
  );
}

// ============================ Gerar lançamento ============================

function GerarLancamentoModal({
  doc,
  categorias,
  contas,
  onClose,
  onSaved,
  onError,
}: {
  doc: FinDocumento;
  categorias: FinCategoria[];
  contas: FinConta[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const tipoSugerido = doc.tipo === "NF_EMITIDA" ? "RECEBER" : "PAGAR";
  const [tipo, setTipo] = useState<"PAGAR" | "RECEBER">(tipoSugerido);
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState(doc.descricao || "");
  const [vencimento, setVencimento] = useState(hojeStr());
  const [valor, setValor] = useState<number | undefined>(doc.valor ?? undefined);
  const [parcelas, setParcelas] = useState(1);
  const [jaPago, setJaPago] = useState(doc.tipo === "COMPROVANTE");
  const [bankAccountId, setBankAccountId] = useState(contas[0]?.id || "");
  const [dataPagamento, setDataPagamento] = useState(hojeStr());
  const [saving, setSaving] = useState(false);

  const gruposDoTipo = categorias.filter((g) => g.tipo === (tipo === "RECEBER" ? "RECEITA" : "DESPESA"));

  const salvar = async () => {
    if (!categoriaId || !valor) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/documentos/${doc.id}/gerar-lancamentos`, {
        method: "POST",
        body: JSON.stringify({
          tipo,
          categoriaId,
          descricao: descricao.trim() || undefined,
          vencimento,
          valor,
          parcelas: parcelas > 1 ? parcelas : undefined,
          jaPago: jaPago && parcelas === 1 ? { bankAccountId, dataPagamento } : undefined,
        }),
      });
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title={`Gerar lançamento — ${DOC_TIPO_LABEL[doc.tipo]}${doc.numero ? ` ${doc.numero}` : ""}`}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={saving || !categoriaId || !valor || (jaPago && !bankAccountId)} onClick={salvar}>
            {saving ? "Criando..." : parcelas > 1 ? `Criar ${parcelas} parcelas` : "Criar lançamento"}
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">O documento gera...</label>
          <div className="flex gap-2">
            {(
              [
                { v: "RECEBER", label: "Conta a receber" },
                { v: "PAGAR", label: "Conta a pagar" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${tipo === o.v ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                onClick={() => { setTipo(o.v); setCategoriaId(""); }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Categoria *</label>
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Selecione...</option>
            {gruposDoTipo.map((g) => (
              <optgroup key={g.id} label={g.nome}>
                {g.children.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
          <input className={inputCls} placeholder={`${DOC_TIPO_LABEL[doc.tipo]}${doc.numero ? ` ${doc.numero}` : ""}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{parcelas > 1 ? "Valor total *" : "Valor *"}</label>
            <MoneyInput value={valor} onValue={setValor} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{parcelas > 1 ? "1º vencimento *" : "Vencimento *"}</label>
            <input type="date" className={inputCls} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Parcelas</label>
            <select className={selectCls} value={parcelas} onChange={(e) => { setParcelas(Number(e.target.value)); if (Number(e.target.value) > 1) setJaPago(false); }}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "1x" : `${n}x mensais`}</option>
              ))}
            </select>
          </div>
        </div>

        {parcelas === 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
            Já {tipo === "RECEBER" ? "recebido" : "pago"} — registrar a baixa junto
          </label>
        )}
        {jaPago && parcelas === 1 && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Conta bancária *</label>
              <select className={selectCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">Selecione...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Data do {tipo === "RECEBER" ? "recebimento" : "pagamento"} *</label>
              <input type="date" className={inputCls} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
