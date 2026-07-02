"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  DOC_TIPO_LABEL,
  FinCategoria,
  FinContato,
  FinDocumento,
  FinEntry,
  FinEntryType,
  STATUS_LABEL,
  STATUS_STYLE,
  btnPrimary,
  btnSecondary,
  cardCls,
  finApi,
  fmtCompetencia,
  fmtDate,
  hojeStr,
  inputCls,
  mesAtualStr,
  selectCls,
  thCls,
} from "../_lib/fin";
import { AdminModal, ErrorBanner, MoneyInput, PageHeader, useToast } from "./shared";

interface ContaOption {
  id: string;
  nome: string;
}

export default function EntriesView({ tipo }: { tipo: FinEntryType }) {
  const isReceber = tipo === "RECEBER";
  const [items, setItems] = useState<FinEntry[]>([]);
  const [totais, setTotais] = useState({ valor: 0, pago: 0, saldo: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { showToast, toastNode } = useToast();

  // filtros
  const [status, setStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  // dados auxiliares
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [contas, setContas] = useState<ContaOption[]>([]);
  const [contatos, setContatos] = useState<FinContato[]>([]);

  // modais
  const [formModal, setFormModal] = useState<Partial<FinEntry> | null>(null);
  const [baixaModal, setBaixaModal] = useState<FinEntry | null>(null);
  const [anexosModal, setAnexosModal] = useState<FinEntry | null>(null);
  const [detalheModal, setDetalheModal] = useState<FinEntry | null>(null);

  // mensalidades pendentes (só no Receber)
  const [pendencias, setPendencias] = useState<{ competencia: string; pendentes: number } | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const load = useCallback(() => {
    setLoading(true);
    finApi
      .lancamentos({ tipo, status, de, ate, categoriaId, busca: buscaDebounced, page })
      .then((r) => {
        setItems(r.items);
        setTotais(r.totais);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tipo, status, de, ate, categoriaId, buscaDebounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([finApi.categorias(), finApi.contas(), finApi.contatos()])
      .then(([cats, cts, ctts]) => {
        setCategorias(cats.filter((g) => g.tipo === (isReceber ? "RECEITA" : "DESPESA")));
        setContas(cts.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })));
        setContatos(ctts);
      })
      .catch((e) => setError(e.message));
    if (isReceber) {
      adminFetch("/admin/financeiro/recorrencias/status")
        .then((s) => setPendencias(s.pendentes > 0 ? s : null))
        .catch(() => {});
    }
  }, [isReceber]);

  const gerarCompetencia = async () => {
    setGerando(true);
    try {
      const r = await adminFetch("/admin/financeiro/recorrencias/gerar", { method: "POST", body: JSON.stringify({}) });
      showToast(`${r.geradas} título(s) gerado(s) para ${fmtCompetencia(r.competencia + "-01")}`);
      setPendencias(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGerando(false);
    }
  };

  const cancelar = async (e: FinEntry) => {
    try {
      await adminFetch(`/admin/financeiro/lancamentos/${e.id}/cancelar`, { method: "POST" });
      showToast("Lançamento cancelado");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const titulo = isReceber ? "Contas a Receber" : "Contas a Pagar";
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-8">
      <PageHeader
        title={titulo}
        subtitle={isReceber ? "Mensalidades do VIA CRM, contratos de serviço e outras receitas" : "Fornecedores, impostos e demais compromissos da VEXCIA"}
        actions={
          <button className={btnPrimary} onClick={() => setFormModal({ tipo, competencia: mesAtualStr(), vencimento: hojeStr() })}>
            + Novo título
          </button>
        }
      />
      <ErrorBanner error={error} onClose={() => setError("")} />

      {isReceber && pendencias && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            Competência {fmtCompetencia(pendencias.competencia + "-01")}: {pendencias.pendentes} mensalidade(s)/recorrência(s) ainda não gerada(s).
          </span>
          <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50" disabled={gerando} onClick={gerarCompetencia}>
            {gerando ? "Gerando..." : "Gerar agora"}
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className={`${cardCls} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select className={selectCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 150 }}>
            <option value="">Todos (ativos)</option>
            <option value="ABERTO">Em aberto</option>
            <option value="PARCIAL">Parcial</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="PAGO">{isReceber ? "Recebidos" : "Pagos"}</option>
            <option value="CANCELADO">Cancelados</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Vencimento de</label>
          <input type="date" className={inputCls} value={de} onChange={(e) => { setDe(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">até</label>
          <input type="date" className={inputCls} value={ate} onChange={(e) => { setAte(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
          <select className={selectCls} value={categoriaId} onChange={(e) => { setCategoriaId(e.target.value); setPage(1); }} style={{ width: 200 }}>
            <option value="">Todas</option>
            {categorias.map((g) => (
              <optgroup key={g.id} label={g.nome}>
                {g.children.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Busca</label>
          <input className={inputCls} placeholder="Descrição ou contraparte..." value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* Totalizador */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { label: "Total do filtro", value: totais.valor, cls: "text-slate-800" },
          { label: isReceber ? "Recebido" : "Pago", value: totais.pago, cls: "text-emerald-600" },
          { label: "Em aberto", value: totais.saldo, cls: isReceber ? "text-blue-600" : "text-red-600" },
        ].map((k) => (
          <div key={k.label} className={`${cardCls} px-4 py-3`}>
            <div className="text-xs text-slate-400">{k.label}</div>
            <div className={`text-lg font-bold ${k.cls}`}>{formatBRL(k.value)}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={thCls}>Vencimento</th>
              <th className={thCls}>Descrição</th>
              <th className={thCls}>Categoria</th>
              <th className={thCls}>{isReceber ? "Cliente / Tenant" : "Fornecedor"}</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={`${thCls} text-right`}>{isReceber ? "Recebido" : "Pago"}</th>
              <th className={thCls}>Status</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Nenhum título encontrado com esses filtros.</td></tr>
            ) : (
              items.map((e) => {
                const statusKey = e.vencido ? "VENCIDO" : e.status;
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className={`px-4 py-2.5 whitespace-nowrap ${e.vencido ? "font-semibold text-red-600" : "text-slate-600"}`}>{fmtDate(e.vencimento)}</td>
                    <td className="px-4 py-2.5">
                      <button className="text-left font-medium text-slate-700 hover:underline" onClick={() => setDetalheModal(e)}>{e.descricao}</button>
                      <div className="text-xs text-slate-400">
                        Competência {fmtCompetencia(e.competencia)}
                        {e.documents.length > 0 && (
                          <button className="ml-2 text-slate-500 hover:text-slate-800" onClick={() => setAnexosModal(e)} title="Documentos anexados">
                            📎 {e.documents.length}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.categoria?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.tenantNome || e.contact?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{formatBRL(e.valor)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{e.valorPago > 0 ? formatBRL(e.valorPago) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[statusKey]}`}>
                        {e.vencido ? "Vencido" : STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                      {(e.status === "ABERTO" || e.status === "PARCIAL") && (
                        <button className="mr-3 font-medium text-emerald-600 hover:text-emerald-800" onClick={() => setBaixaModal(e)}>
                          {isReceber ? "Receber" : "Pagar"}
                        </button>
                      )}
                      <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => setFormModal(e)}>Editar</button>
                      <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => setAnexosModal(e)}>Anexos</button>
                      {e.status !== "CANCELADO" && e.payments.length === 0 && (
                        <button className="text-red-300 hover:text-red-600" onClick={() => cancelar(e)}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <span>{total} título(s)</span>
            <span className="flex items-center gap-2">
              <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <span>{page} / {totalPages}</span>
              <button className={btnSecondary} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
            </span>
          </div>
        )}
      </div>

      {formModal && (
        <EntryFormModal
          entry={formModal}
          tipo={tipo}
          categorias={categorias}
          contatos={contatos}
          onClose={() => setFormModal(null)}
          onSaved={() => { setFormModal(null); showToast("Título salvo"); load(); }}
          onError={setError}
        />
      )}
      {baixaModal && (
        <BaixaModal
          entry={baixaModal}
          contas={contas}
          isReceber={isReceber}
          onClose={() => setBaixaModal(null)}
          onSaved={() => { setBaixaModal(null); showToast(isReceber ? "Recebimento registrado" : "Pagamento registrado"); load(); }}
          onError={setError}
        />
      )}
      {anexosModal && (
        <AnexosModal
          entry={anexosModal}
          onClose={() => { setAnexosModal(null); load(); }}
          onError={setError}
          showToast={showToast}
        />
      )}
      {detalheModal && (
        <DetalheModal
          entry={detalheModal}
          contas={contas}
          isReceber={isReceber}
          onClose={() => setDetalheModal(null)}
          onChanged={() => { setDetalheModal(null); load(); }}
          onError={setError}
          showToast={showToast}
        />
      )}
      {toastNode}
    </div>
  );
}

// ============================ Modal de título ============================

function EntryFormModal({
  entry,
  tipo,
  categorias,
  contatos,
  onClose,
  onSaved,
  onError,
}: {
  entry: Partial<FinEntry>;
  tipo: FinEntryType;
  categorias: FinCategoria[];
  contatos: FinContato[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const isEdit = Boolean(entry.id);
  const isPago = entry.status === "PAGO";
  const [descricao, setDescricao] = useState(entry.descricao || "");
  const [categoriaId, setCategoriaId] = useState(entry.categoriaId || "");
  const [contactId, setContactId] = useState(entry.contactId || "");
  const [competencia, setCompetencia] = useState((entry.competencia || mesAtualStr()).slice(0, 7));
  const [vencimento, setVencimento] = useState(entry.vencimento || hojeStr());
  const [valor, setValor] = useState<number | undefined>(entry.valor);
  const [parcelas, setParcelas] = useState(1);
  const [observacao, setObservacao] = useState(entry.observacao || "");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!descricao.trim() || !categoriaId || !valor) return;
    setSaving(true);
    try {
      if (isEdit) {
        await adminFetch(`/admin/financeiro/lancamentos/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            descricao: descricao.trim(),
            categoriaId,
            contactId: contactId || null,
            observacao: observacao || null,
            ...(isPago ? {} : { competencia, vencimento, valor }),
          }),
        });
      } else {
        await adminFetch("/admin/financeiro/lancamentos", {
          method: "POST",
          body: JSON.stringify({
            tipo,
            descricao: descricao.trim(),
            categoriaId,
            contactId: contactId || undefined,
            competencia,
            vencimento,
            valor,
            parcelas: parcelas > 1 ? parcelas : undefined,
            observacao: observacao || undefined,
          }),
        });
      }
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title={isEdit ? "Editar título" : tipo === "RECEBER" ? "Nova conta a receber" : "Nova conta a pagar"}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={saving || !descricao.trim() || !categoriaId || !valor} onClick={salvar}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        {isPago && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Título pago: valor e datas ficam travados — estorne a baixa para alterá-los.</p>}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição *</label>
          <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Categoria *</label>
            <select className={selectCls} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Selecione...</option>
              {categorias.map((g) => (
                <optgroup key={g.id} label={g.nome}>
                  {g.children.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Contraparte</label>
            <select className={selectCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Competência *</label>
            <input type="month" className={inputCls} disabled={isPago} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{parcelas > 1 ? "1º vencimento *" : "Vencimento *"}</label>
            <input type="date" className={inputCls} disabled={isPago} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{parcelas > 1 ? "Valor total *" : "Valor *"}</label>
            <MoneyInput value={valor} onValue={setValor} disabled={isPago} />
          </div>
          {!isEdit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Parcelas</label>
              <select className={selectCls} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? "À vista (1x)" : `${n}x mensais`}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {parcelas > 1 && valor ? (
          <p className="text-xs text-slate-400">
            Serão criados {parcelas} títulos de ~{formatBRL(Math.floor((valor * 100) / parcelas) / 100)}, com vencimentos mensais a partir de {fmtDate(vencimento)}.
          </p>
        ) : null}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Observação</label>
          <input className={inputCls} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </div>
    </AdminModal>
  );
}

// ============================ Modal de baixa ============================

function BaixaModal({
  entry,
  contas,
  isReceber,
  onClose,
  onSaved,
  onError,
}: {
  entry: FinEntry;
  contas: ContaOption[];
  isReceber: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [bankAccountId, setBankAccountId] = useState(contas[0]?.id || "");
  const [dataPagamento, setDataPagamento] = useState(hojeStr());
  const [valor, setValor] = useState<number | undefined>(entry.saldo);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!bankAccountId || !dataPagamento || !valor) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/lancamentos/${entry.id}/baixar`, {
        method: "POST",
        body: JSON.stringify({ bankAccountId, dataPagamento, valor, observacao: observacao || undefined }),
      });
      onSaved();
    } catch (e: any) {
      onError(e.message);
      setSaving(false);
    }
  };

  return (
    <AdminModal
      title={isReceber ? "Registrar recebimento" : "Registrar pagamento"}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={saving || !bankAccountId || !valor} onClick={salvar}>
            {saving ? "Salvando..." : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <div className="font-medium text-slate-700">{entry.descricao}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Valor {formatBRL(entry.valor)} · {entry.valorPago > 0 ? `já ${isReceber ? "recebido" : "pago"} ${formatBRL(entry.valorPago)} · ` : ""}
          saldo <b>{formatBRL(entry.saldo)}</b>
        </div>
      </div>
      {contas.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nenhuma conta bancária ativa — cadastre uma em Configurações → Contas bancárias.
        </p>
      ) : (
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Conta bancária *</label>
            <select className={selectCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Data *</label>
              <input type="date" className={inputCls} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Valor * <span className="font-normal text-slate-400">(parcial permitido)</span></label>
              <MoneyInput value={valor} onValue={setValor} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Observação</label>
            <input className={inputCls} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>
      )}
    </AdminModal>
  );
}

// ============================ Modal de anexos ============================

function AnexosModal({
  entry,
  onClose,
  onError,
  showToast,
}: {
  entry: FinEntry;
  onClose: () => void;
  onError: (m: string) => void;
  showToast: (m: string, error?: boolean) => void;
}) {
  const [docs, setDocs] = useState(entry.documents);
  const [disponiveis, setDisponiveis] = useState<FinDocumento[]>([]);
  const [vinculandoId, setVinculandoId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    finApi.documentos({}).then(setDisponiveis).catch(() => {});
  }, []);

  const vincular = async () => {
    if (!vinculandoId) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/financeiro/lancamentos/${entry.id}/documentos/${vinculandoId}`, { method: "POST" });
      const doc = disponiveis.find((d) => d.id === vinculandoId);
      if (doc) setDocs((p) => [...p, { id: doc.id, tipo: doc.tipo, numero: doc.numero, filename: doc.filename }]);
      setVinculandoId("");
      showToast("Documento vinculado");
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const desvincular = async (docId: string) => {
    setBusy(true);
    try {
      await adminFetch(`/admin/financeiro/lancamentos/${entry.id}/documentos/${docId}`, { method: "DELETE" });
      setDocs((p) => p.filter((d) => d.id !== docId));
      showToast("Documento desvinculado");
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const baixarDoc = async (docId: string) => {
    try {
      const r = await adminFetch(`/admin/financeiro/documentos/${docId}/download`);
      window.open(r.url, "_blank");
    } catch (e: any) {
      onError(e.message);
    }
  };

  const naoVinculados = disponiveis.filter((d) => !docs.some((x) => x.id === d.id));

  return (
    <AdminModal
      title={`Documentos de "${entry.descricao}"`}
      footer={<button className={btnPrimary} onClick={onClose}>Fechar</button>}
    >
      {docs.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">Nenhum documento vinculado a este título.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-700">
                <span className="mr-2 text-xs text-slate-400">{DOC_TIPO_LABEL[d.tipo]}</span>
                {d.numero || d.filename}
              </span>
              <span className="flex gap-3 text-xs">
                <button className="text-slate-500 hover:text-slate-800" onClick={() => baixarDoc(d.id)}>Ver / Baixar</button>
                <button className="text-red-300 hover:text-red-600" disabled={busy} onClick={() => desvincular(d.id)}>Desvincular</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-slate-100 pt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">Vincular documento existente</label>
        <div className="flex gap-2">
          <select className={selectCls} value={vinculandoId} onChange={(e) => setVinculandoId(e.target.value)}>
            <option value="">Selecione um documento...</option>
            {naoVinculados.map((d) => (
              <option key={d.id} value={d.id}>
                {DOC_TIPO_LABEL[d.tipo]} {d.numero ? `nº ${d.numero}` : ""} — {d.filename}
              </option>
            ))}
          </select>
          <button className={btnPrimary} disabled={!vinculandoId || busy} onClick={vincular}>Vincular</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Para enviar um arquivo novo, use a página Documentos Fiscais.</p>
      </div>
    </AdminModal>
  );
}

// ============================ Modal de detalhe (baixas + estorno) ============================

function DetalheModal({
  entry,
  contas,
  isReceber,
  onClose,
  onChanged,
  onError,
  showToast,
}: {
  entry: FinEntry;
  contas: ContaOption[];
  isReceber: boolean;
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const contaNome = (id: string) => contas.find((c) => c.id === id)?.nome || "—";

  const estornar = async (paymentId: string) => {
    setBusy(true);
    try {
      await adminFetch(`/admin/financeiro/pagamentos/${paymentId}`, { method: "DELETE" });
      showToast("Baixa estornada");
      onChanged();
    } catch (e: any) {
      onError(e.message);
      setBusy(false);
    }
  };

  return (
    <AdminModal
      title={entry.descricao}
      footer={<button className={btnPrimary} onClick={onClose}>Fechar</button>}
    >
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div><span className="text-slate-400">Tipo:</span> <span className="text-slate-700">{isReceber ? "A receber" : "A pagar"}</span></div>
        <div><span className="text-slate-400">Status:</span> <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[entry.vencido ? "VENCIDO" : entry.status]}`}>{entry.vencido ? "Vencido" : STATUS_LABEL[entry.status]}</span></div>
        <div><span className="text-slate-400">Competência:</span> <span className="text-slate-700">{fmtCompetencia(entry.competencia)}</span></div>
        <div><span className="text-slate-400">Vencimento:</span> <span className="text-slate-700">{fmtDate(entry.vencimento)}</span></div>
        <div><span className="text-slate-400">Valor:</span> <span className="font-semibold text-slate-800">{formatBRL(entry.valor)}</span></div>
        <div><span className="text-slate-400">Saldo:</span> <span className="font-semibold text-slate-800">{formatBRL(entry.saldo)}</span></div>
        <div><span className="text-slate-400">Categoria:</span> <span className="text-slate-700">{entry.categoria?.nome || "—"}</span></div>
        <div><span className="text-slate-400">Contraparte:</span> <span className="text-slate-700">{entry.tenantNome || entry.contact?.nome || "—"}</span></div>
        {entry.parcelaNum && (
          <div><span className="text-slate-400">Parcela:</span> <span className="text-slate-700">{entry.parcelaNum}/{entry.parcelaTotal}</span></div>
        )}
        {entry.observacao && (
          <div className="col-span-2"><span className="text-slate-400">Observação:</span> <span className="text-slate-700">{entry.observacao}</span></div>
        )}
      </div>

      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{isReceber ? "Recebimentos" : "Pagamentos"}</h4>
      {entry.payments.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma baixa registrada.</p>
      ) : (
        <div className="space-y-2">
          {entry.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-700">
                {fmtDate(p.dataPagamento)} · <b>{formatBRL(p.valor)}</b>
                <span className="ml-2 text-xs text-slate-400">{contaNome(p.bankAccountId)}{p.bankTransactionId ? " · conciliado" : ""}</span>
              </span>
              <button className="text-xs text-red-300 hover:text-red-600 disabled:opacity-50" disabled={busy} onClick={() => estornar(p.id)}>
                Estornar
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminModal>
  );
}
