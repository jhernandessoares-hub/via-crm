"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  FinBankTx,
  FinCategoria,
  FinConta,
  FinEntry,
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
import { AdminModal, ErrorBanner, FileButton, PageHeader, useToast } from "../_components/shared";

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
  const [vincularTx, setVincularTx] = useState<FinBankTx | null>(null);
  const [criarTx, setCriarTx] = useState<FinBankTx | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([finApi.contas(), finApi.categorias()])
      .then(([c, cats]) => {
        const ativas = c.filter((x) => x.ativo);
        setContas(ativas);
        setCategorias(cats);
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
          <FileButton
            accept=".ofx,.csv,.xls,.xlsx"
            label="⬆ Importar extrato"
            className={btnPrimary}
            busy={importando}
            onSelect={importar}
          />
        }
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className={`${cardCls} mb-4 flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-500">Conta bancária</label>
          <select className={selectCls} style={{ width: 260 }} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {contas.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} · saldo {formatBRL(c.saldoAtual)}</option>
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
          onClose={() => setCriarTx(null)}
          onSaved={() => { setCriarTx(null); showToast("Lançamento criado e conciliado"); load(); }}
          onError={setError}
        />
      )}
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
  onClose,
  onSaved,
  onError,
}: {
  tx: FinBankTx;
  categorias: FinCategoria[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const tipo = tx.valor < 0 ? "PAGAR" : "RECEBER";
  const grupos = categorias.filter((g) => g.tipo === (tipo === "RECEBER" ? "RECEITA" : "DESPESA"));
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState(tx.descricao);
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!categoriaId) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/conciliacao/transacoes/${tx.id}/criar-lancamento`, {
        method: "POST",
        body: JSON.stringify({ categoriaId, descricao: descricao.trim() || undefined }),
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
      </div>
    </AdminModal>
  );
}
