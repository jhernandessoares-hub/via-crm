"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  FinBankTx,
  FinCategoria,
  FinConta,
  FinContrato,
  FinEmpresa,
  FinEntry,
  FinImportacao,
  FinTxStatus,
  btnPrimary,
  btnSecondary,
  cardCls,
  finApi,
  fmtDate,
  inputCls,
  selectCls,
  thCls,
} from "../_lib/fin";
import { AdminModal, ErrorBanner, FileButton, MoneyInput, PageHeader, useToast } from "../_components/shared";

/** "Itaú — Conta Principal" quando há banco, senão só o nome. */
function contaLabel(c: FinConta): string {
  return c.banco ? `${c.banco} — ${c.nome}` : c.nome;
}

const ABAS: { id: FinTxStatus; label: string }[] = [
  { id: "PENDENTE", label: "Pendentes" },
  { id: "CONCILIADO", label: "Conciliadas" },
  { id: "IGNORADO", label: "Ignoradas" },
];

export default function ConciliacaoPage() {
  const [contas, setContas] = useState<FinConta[]>([]);
  const [contaId, setContaId] = useState("");
  const [aba, setAba] = useState<FinTxStatus>("PENDENTE");
  const [txs, setTxs] = useState<FinBankTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState("");
  const { showToast, toastNode } = useToast();

  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [contratos, setContratos] = useState<FinContrato[]>([]);
  const [empresas, setEmpresas] = useState<FinEmpresa[]>([]);
  const [vincularTx, setVincularTx] = useState<FinBankTx | null>(null);
  const [criarTx, setCriarTx] = useState<FinBankTx | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [historico, setHistorico] = useState(false);

  useEffect(() => {
    Promise.all([finApi.contas(), finApi.categorias(), finApi.contratos(), finApi.empresas()])
      .then(([c, cats, contrs, emps]) => {
        const ativas = c.filter((x) => x.ativo);
        setContas(ativas);
        setCategorias(cats);
        setContratos(contrs.filter((c) => c.ativo));
        setEmpresas(emps);
        if (ativas.length > 0) setContaId((prev) => prev || ativas[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (!contaId) return;
    setLoading(true);
    adminFetch(`/admin/financeiro/conciliacao/transacoes?bankAccountId=${contaId}&status=${aba}`)
      .then(setTxs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [contaId, aba]);

  useEffect(() => { load(); }, [load]);

  const importar = async (file: File) => {
    if (!contaId) {
      setError("Selecione a conta bancária antes de importar");
      return;
    }
    setImportando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bankAccountId", contaId);
      const r = await adminFetch("/admin/financeiro/conciliacao/importar", { method: "POST", body: form });
      showToast(`${r.importadas} transação(ões) importada(s)${r.duplicadas > 0 ? `, ${r.duplicadas} duplicada(s) ignorada(s)` : ""}`);
      setAba("PENDENTE");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImportando(false);
    }
  };

  const acao = async (tx: FinBankTx, fn: () => Promise<any>, msg: string) => {
    setBusyId(tx.id);
    try {
      await fn();
      showToast(msg);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmarSugestao = (tx: FinBankTx) => {
    if (!tx.sugestao) return;
    const body = tx.sugestao.kind === "payment" ? { paymentId: tx.sugestao.payment.id } : { entryId: tx.sugestao.entry.id };
    acao(tx, () => adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/conciliar`, { method: "POST", body: JSON.stringify(body) }), "Transação conciliada");
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Conciliação Bancária"
        subtitle="Importe o extrato do banco (OFX recomendado; CSV/Excel com colunas Data, Descrição e Valor) e confira lançamento a lançamento"
        actions={
          <>
            <button className={btnSecondary} onClick={() => setHistorico(true)}>Histórico de importações</button>
            <button className={btnSecondary} onClick={() => setTransferindo(true)}>⇄ Transferir entre contas</button>
            <FileButton
              accept=".ofx,.csv,.xls,.xlsx"
              label="⬆ Importar extrato"
              className={btnPrimary}
              busy={importando}
              onSelect={importar}
            />
          </>
        }
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} mb-4 flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-500">Conta bancária</label>
          <select className={selectCls} style={{ width: 300 }} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{contaLabel(c)} · saldo {formatBRL(c.saldoAtual)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${aba === a.id ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>Data</th>
              <th className={thCls}>Descrição do extrato</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={thCls}>{aba === "PENDENTE" ? "Sugestão" : "Vínculo"}</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
            ) : txs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  {aba === "PENDENTE" ? "Nenhuma transação pendente — importe um extrato para começar." : "Nada por aqui."}
                </td>
              </tr>
            ) : (
              txs.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{fmtDate(tx.data)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{tx.descricao}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${tx.valor < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {tx.valor < 0 ? "−" : "+"}{formatBRL(Math.abs(tx.valor))}
                  </td>
                  <td className="px-4 py-2.5">
                    {aba === "PENDENTE" ? (
                      tx.sugestao ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                          {tx.sugestao.kind === "payment" ? (
                            <>Baixa existente: <b>{tx.sugestao.payment.entry.descricao}</b> ({fmtDate(tx.sugestao.payment.dataPagamento)})</>
                          ) : (
                            <>Título em aberto: <b>{tx.sugestao.entry.descricao}</b> (venc. {fmtDate(tx.sugestao.entry.vencimento)})</>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sem correspondência automática</span>
                      )
                    ) : tx.payment ? (
                      <span className="text-xs text-slate-600">{tx.payment.entry.descricao} · {formatBRL(tx.payment.valor)}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                    {aba === "PENDENTE" && (
                      <>
                        {tx.sugestao && (
                          <button
                            className="mr-3 rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            disabled={busyId === tx.id}
                            onClick={() => confirmarSugestao(tx)}
                          >
                            Confirmar
                          </button>
                        )}
                        <button className="mr-3 text-slate-500 hover:text-slate-800" onClick={() => setVincularTx(tx)}>Vincular...</button>
                        <button className="mr-3 text-slate-500 hover:text-slate-800" onClick={() => setCriarTx(tx)}>Criar lançamento</button>
                        <button
                          className="text-slate-400 hover:text-slate-600"
                          disabled={busyId === tx.id}
                          onClick={() => acao(tx, () => adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/ignorar`, { method: "POST" }), "Transação ignorada")}
                        >
                          Ignorar
                        </button>
                      </>
                    )}
                    {aba !== "PENDENTE" && (
                      <button
                        className="text-slate-400 hover:text-slate-700"
                        disabled={busyId === tx.id}
                        onClick={() => acao(tx, () => adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/desfazer`, { method: "POST" }), "Desfeito — voltou para pendentes")}
                      >
                        Desfazer
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {vincularTx && (
        <VincularModal
          tx={vincularTx}
          onClose={() => setVincularTx(null)}
          onSaved={() => { setVincularTx(null); showToast("Transação conciliada"); load(); }}
          onError={setError}
        />
      )}
      {criarTx && (
        <CriarLancamentoModal
          tx={criarTx}
          categorias={categorias}
          contratos={contratos}
          onClose={() => setCriarTx(null)}
          onSaved={() => { setCriarTx(null); showToast("Lançamento criado e conciliado"); load(); }}
          onError={setError}
        />
      )}
      {transferindo && (
        <TransferModal
          contas={contas}
          empresas={empresas}
          contaSelecionada={contaId}
          onClose={() => setTransferindo(false)}
          onSaved={() => { setTransferindo(false); showToast("Transferência registrada"); load(); }}
          onError={setError}
        />
      )}
      {historico && <HistoricoImportacoesModal contas={contas} onClose={() => setHistorico(false)} />}
      {toastNode}
    </div>
  );
}

// ============================ Vincular manual ============================

function VincularModal({
  tx,
  onClose,
  onSaved,
  onError,
}: {
  tx: FinBankTx;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const tipo = tx.valor < 0 ? "PAGAR" : "RECEBER";
  const [busca, setBusca] = useState("");
  const [candidatos, setCandidatos] = useState<FinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      finApi
        .lancamentos({ tipo, busca, pageSize: 20 })
        .then((r) => setCandidatos(r.items.filter((i) => i.status === "ABERTO" || i.status === "PARCIAL")))
        .catch((e) => onError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busca, tipo, onError]);

  const vincular = async (entry: FinEntry) => {
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/conciliar`, {
        method: "POST",
        body: JSON.stringify({ entryId: entry.id }),
      });
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title="Vincular a um título em aberto"
      width="max-w-2xl"
      footer={<button className={btnSecondary} onClick={onClose}>Cancelar</button>}
    >
      <div className="mb-3 rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
        {fmtDate(tx.data)} · {tx.descricao} · <b className={tx.valor < 0 ? "text-red-600" : "text-emerald-600"}>{formatBRL(Math.abs(tx.valor))}</b>
        <span className="ml-2 text-xs text-slate-400">A baixa será criada com a data e o valor da linha do extrato.</span>
      </div>
      <input className={`${inputCls} mb-3`} placeholder={`Buscar título a ${tipo === "PAGAR" ? "pagar" : "receber"}...`} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      <div className="max-h-80 space-y-2 overflow-auto">
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Buscando...</p>
        ) : candidatos.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nenhum título em aberto encontrado.</p>
        ) : (
          candidatos.map((e) => (
            <button
              key={e.id}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              disabled={saving}
              onClick={() => vincular(e)}
            >
              <span>
                <span className="font-medium text-slate-700">{e.descricao}</span>
                <span className="ml-2 text-xs text-slate-400">venc. {fmtDate(e.vencimento)}{e.tenantNome || e.contact?.nome ? ` · ${e.tenantNome || e.contact?.nome}` : ""}</span>
              </span>
              <span className="font-semibold text-slate-700">{formatBRL(e.saldo)}</span>
            </button>
          ))
        )}
      </div>
    </AdminModal>
  );
}

// ============================ Criar lançamento da linha ============================

function CriarLancamentoModal({
  tx,
  categorias,
  contratos,
  onClose,
  onSaved,
  onError,
}: {
  tx: FinBankTx;
  categorias: FinCategoria[];
  contratos: FinContrato[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const tipo = tx.valor < 0 ? "PAGAR" : "RECEBER";
  const grupos = categorias.filter((g) => g.tipo === (tipo === "RECEBER" ? "RECEITA" : "DESPESA"));
  const contratosDoTipo = contratos.filter((c) => c.tipo === tipo);
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState(tx.descricao);
  const [contractId, setContractId] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!categoriaId) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/criar-lancamento`, {
        method: "POST",
        body: JSON.stringify({ categoriaId, descricao: descricao.trim() || undefined, contractId: contractId || undefined }),
      });
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title={`Criar ${tipo === "PAGAR" ? "despesa" : "receita"} a partir da linha`}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={saving || !categoriaId} onClick={salvar}>{saving ? "Criando..." : "Criar e conciliar"}</button>
        </>
      }
    >
      <div className="mb-3 rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
        {fmtDate(tx.data)} · <b className={tx.valor < 0 ? "text-red-600" : "text-emerald-600"}>{formatBRL(Math.abs(tx.valor))}</b>
        <span className="ml-2 text-xs text-slate-400">O título nasce como {tipo === "PAGAR" ? "pago" : "recebido"}, já conciliado com esta linha.</span>
      </div>
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Categoria *</label>
          <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Selecione...</option>
            {grupos.map((g) => (
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
          <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Contrato</label>
          <select className={selectCls} value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">—</option>
            {contratosDoTipo.map((c) => (
              <option key={c.id} value={c.id}>{c.descricao}</option>
            ))}
          </select>
        </div>
      </div>
    </AdminModal>
  );
}

// ============================ Transferência entre contas ============================

function TransferModal({
  contas,
  empresas,
  contaSelecionada,
  onClose,
  onSaved,
  onError,
}: {
  contas: FinConta[];
  empresas: FinEmpresa[];
  contaSelecionada: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [contaOrigemId, setContaOrigemId] = useState(contaSelecionada || "");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [valor, setValor] = useState<number | undefined>(undefined);
  const [data, setData] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome || null;
  const origem = contas.find((c) => c.id === contaOrigemId);
  const destino = contas.find((c) => c.id === contaDestinoId);
  const destinosPossiveis = contas.filter((c) => c.id !== contaOrigemId);
  const empresasDiferentes = Boolean(origem?.companyId && destino?.companyId && origem.companyId !== destino.companyId);

  const salvar = async () => {
    if (!contaOrigemId || !contaDestinoId || !valor || !data) return;
    setSaving(true);
    try {
      await finApi.transferir({ contaOrigemId, contaDestinoId, valor, data, descricao: descricao.trim() || undefined });
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title="Transferir entre contas"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={saving || !contaOrigemId || !contaDestinoId || !valor} onClick={salvar}>
            {saving ? "Transferindo..." : "Transferir"}
          </button>
        </>
      }
    >
      <div className="mb-3 rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        Cria uma saída já paga na origem e uma entrada já recebida no destino — os dois saldos se ajustam na hora.
      </div>
      {empresasDiferentes && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {nomeEmpresa(origem!.companyId) || "A empresa da origem"} e {nomeEmpresa(destino!.companyId) || "a do destino"} são CNPJs diferentes — isso será lançado como <b>repasse entre empresas do grupo</b> (categoria própria, separada da transferência entre contas da mesma empresa), não como despesa/receita real. Se for recorrente, considere formalizar como mútuo entre empresas com o contador.
        </div>
      )}
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">De (origem) *</label>
            <select className={selectCls} value={contaOrigemId} onChange={(e) => { setContaOrigemId(e.target.value); if (e.target.value === contaDestinoId) setContaDestinoId(""); }}>
              <option value="">Selecione...</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{contaLabel(c)} · saldo {formatBRL(c.saldoAtual)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Para (destino) *</label>
            <select className={selectCls} value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} disabled={!contaOrigemId}>
              <option value="">Selecione...</option>
              {destinosPossiveis.map((c) => (
                <option key={c.id} value={c.id}>{contaLabel(c)} · saldo {formatBRL(c.saldoAtual)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor *</label>
            <MoneyInput value={valor} onValue={setValor} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data *</label>
            <input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
          <input className={inputCls} placeholder="Opcional — padrão: “Transferência para/de …”" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
      </div>
    </AdminModal>
  );
}

// ============================ Histórico de importações ============================

function HistoricoImportacoesModal({ contas, onClose }: { contas: FinConta[]; onClose: () => void }) {
  const [importacoes, setImportacoes] = useState<FinImportacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    finApi.importacoes()
      .then(setImportacoes)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const contaInfo = (id: string) => contas.find((c) => c.id === id);

  return (
    <AdminModal title="Histórico de importações" width="max-w-2xl" footer={<button className={btnSecondary} onClick={onClose}>Fechar</button>}>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
      ) : importacoes.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhuma importação ainda.</p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-auto">
          {importacoes.map((imp) => {
            const conta = contaInfo(imp.bankAccountId);
            return (
              <div key={imp.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{imp.filename}</span>
                  <span className="text-xs text-slate-400">{new Date(imp.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {conta ? contaLabel(conta) : imp.bankAccount?.nome || "conta removida"} · {imp.formato} · {imp.importadas} importada(s){imp.duplicadas > 0 ? `, ${imp.duplicadas} duplicada(s)` : ""} de {imp.totalLinhas} linha(s)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminModal>
  );
}
