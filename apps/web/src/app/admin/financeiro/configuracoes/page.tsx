"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import { formatBRL } from "@/lib/format";
import {
  FinCategoria,
  FinConta,
  FinContato,
  FinMensalidade,
  FinRecorrencia,
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
import { AdminModal, ErrorBanner, MoneyInput, PageHeader, useToast } from "../_components/shared";

type Tab = "categorias" | "contas" | "contatos" | "mensalidades" | "fixas";

const TABS: { id: Tab; label: string }[] = [
  { id: "categorias", label: "Categorias" },
  { id: "contas", label: "Contas bancárias" },
  { id: "contatos", label: "Contatos" },
  { id: "mensalidades", label: "Mensalidades" },
  { id: "fixas", label: "Receitas/Despesas fixas" },
];

export default function FinConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>("categorias");
  const [error, setError] = useState("");
  const { showToast, toastNode } = useToast();

  return (
    <div className="p-8">
      <PageHeader title="Configurações do Financeiro" subtitle="Plano de contas, contas bancárias, contatos e recorrências da VEXCIA" />
      <ErrorBanner error={error} onClose={() => setError("")} />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categorias" && <CategoriasTab onError={setError} showToast={showToast} />}
      {tab === "contas" && <ContasTab onError={setError} showToast={showToast} />}
      {tab === "contatos" && <ContatosTab onError={setError} showToast={showToast} />}
      {tab === "mensalidades" && <MensalidadesTab onError={setError} showToast={showToast} />}
      {tab === "fixas" && <FixasTab onError={setError} showToast={showToast} />}
      {toastNode}
    </div>
  );
}

type TabProps = { onError: (m: string) => void; showToast: (m: string, error?: boolean) => void };

// ============================ Categorias ============================

function CategoriasTab({ onError, showToast }: TabProps) {
  const [grupos, setGrupos] = useState<FinCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState<{ parentId: string | null; tipo: "RECEITA" | "DESPESA" } | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    finApi
      .categorias(true)
      .then(setGrupos)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const criar = async () => {
    if (!novo || !novoNome.trim()) return;
    setSaving(true);
    try {
      await adminFetch("/admin/financeiro/categorias", {
        method: "POST",
        body: JSON.stringify({ nome: novoNome.trim(), tipo: novo.tipo, parentId: novo.parentId ?? undefined }),
      });
      showToast("Categoria criada");
      setNovo(null);
      setNovoNome("");
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const renomear = async () => {
    if (!editando || !editando.nome.trim()) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/financeiro/categorias/${editando.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nome: editando.nome.trim() }),
      });
      setEditando(null);
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (cat: FinCategoria) => {
    try {
      const r = await adminFetch(`/admin/financeiro/categorias/${cat.id}`, { method: "DELETE" });
      showToast(r.deleted ? "Categoria excluída" : "Categoria em uso — foi desativada");
      load();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const reativar = async (cat: FinCategoria) => {
    try {
      await adminFetch(`/admin/financeiro/categorias/${cat.id}`, { method: "PATCH", body: JSON.stringify({ ativo: true }) });
      load();
    } catch (e: any) {
      onError(e.message);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Carregando...</div>;

  const porTipo: Array<{ tipo: "RECEITA" | "DESPESA"; titulo: string }> = [
    { tipo: "RECEITA", titulo: "Receitas" },
    { tipo: "DESPESA", titulo: "Despesas" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {porTipo.map(({ tipo, titulo }) => (
        <div key={tipo} className={`${cardCls} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={`text-sm font-semibold uppercase tracking-wide ${tipo === "RECEITA" ? "text-emerald-700" : "text-red-700"}`}>
              {titulo}
            </h2>
            <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => { setNovo({ parentId: null, tipo }); setNovoNome(""); }}>
              + Novo grupo
            </button>
          </div>
          <div className="space-y-4">
            {grupos
              .filter((g) => g.tipo === tipo)
              .map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className={`text-sm font-semibold ${g.ativo ? "text-slate-700" : "text-slate-400 line-through"}`}>{g.nome}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <button className="text-slate-400 hover:text-slate-700" onClick={() => setEditando({ id: g.id, nome: g.nome })}>Renomear</button>
                      <button className="text-slate-400 hover:text-slate-700" onClick={() => { setNovo({ parentId: g.id, tipo }); setNovoNome(""); }}>+ Categoria</button>
                      {!g.sistema && g.ativo && <button className="text-red-300 hover:text-red-600" onClick={() => excluir(g)}>Excluir</button>}
                      {!g.ativo && <button className="text-emerald-500 hover:text-emerald-700" onClick={() => reativar(g)}>Reativar</button>}
                    </span>
                  </div>
                  <div className="ml-3 mt-1 space-y-0.5">
                    {g.children.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded px-3 py-1.5 hover:bg-slate-50">
                        <span className={`text-sm ${c.ativo ? "text-slate-600" : "text-slate-400 line-through"}`}>{c.nome}</span>
                        <span className="flex items-center gap-2 text-xs opacity-70">
                          <button className="text-slate-400 hover:text-slate-700" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</button>
                          {!c.sistema && c.ativo && <button className="text-red-300 hover:text-red-600" onClick={() => excluir(c)}>Excluir</button>}
                          {!c.ativo && <button className="text-emerald-500 hover:text-emerald-700" onClick={() => reativar(c)}>Reativar</button>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      {novo && (
        <AdminModal
          title={novo.parentId ? "Nova categoria" : "Novo grupo"}
          footer={
            <>
              <button className={btnSecondary} onClick={() => setNovo(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !novoNome.trim()} onClick={criar}>{saving ? "Salvando..." : "Criar"}</button>
            </>
          }
        >
          <label className="mb-1 block text-xs font-medium text-slate-500">Nome</label>
          <input className={inputCls} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus />
          <p className="mt-2 text-xs text-slate-400">
            {novo.parentId
              ? "Categorias (nível 2) recebem lançamentos."
              : "Grupos (nível 1) organizam o DRE — lançamentos entram nas categorias internas."}
          </p>
        </AdminModal>
      )}

      {editando && (
        <AdminModal
          title="Renomear"
          footer={
            <>
              <button className={btnSecondary} onClick={() => setEditando(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !editando.nome.trim()} onClick={renomear}>{saving ? "Salvando..." : "Salvar"}</button>
            </>
          }
        >
          <input className={inputCls} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus />
        </AdminModal>
      )}
    </div>
  );
}

// ============================ Contas bancárias ============================

function ContasTab({ onError, showToast }: TabProps) {
  const [contas, setContas] = useState<FinConta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<FinConta> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    finApi.contas(true).then(setContas).catch((e) => onError(e.message)).finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    if (!modal?.nome?.trim() || !modal.saldoInicialData) return;
    setSaving(true);
    try {
      const body = {
        nome: modal.nome.trim(),
        banco: modal.banco || undefined,
        agencia: modal.agencia || undefined,
        conta: modal.conta || undefined,
        saldoInicial: modal.saldoInicial ?? 0,
        saldoInicialData: modal.saldoInicialData,
      };
      if (modal.id) {
        await adminFetch(`/admin/financeiro/contas-bancarias/${modal.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await adminFetch("/admin/financeiro/contas-bancarias", { method: "POST", body: JSON.stringify(body) });
      }
      showToast("Conta salva");
      setModal(null);
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (c: FinConta) => {
    try {
      const r = await adminFetch(`/admin/financeiro/contas-bancarias/${c.id}`, { method: "DELETE" });
      showToast(r.deleted ? "Conta excluída" : "Conta com movimento — foi desativada");
      load();
    } catch (e: any) {
      onError(e.message);
    }
  };

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Contas bancárias</h2>
        <button className={btnPrimary} onClick={() => setModal({ saldoInicial: 0, saldoInicialData: hojeStr() })}>+ Nova conta</button>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className={thCls}>Nome</th>
            <th className={thCls}>Banco</th>
            <th className={thCls}>Ag. / Conta</th>
            <th className={`${thCls} text-right`}>Saldo inicial</th>
            <th className={`${thCls} text-right`}>Saldo atual</th>
            <th className={thCls}>Status</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
          ) : contas.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma conta cadastrada — crie a primeira para registrar baixas e importar extratos.</td></tr>
          ) : (
            contas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{c.nome}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.banco || "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{[c.agencia, c.conta].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{formatBRL(c.saldoInicial)} <span className="text-xs text-slate-400">em {fmtDate(c.saldoInicialData)}</span></td>
                <td className={`px-4 py-2.5 text-right font-semibold ${c.saldoAtual < 0 ? "text-red-600" : "text-slate-800"}`}>{formatBRL(c.saldoAtual)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.ativo ? "Ativa" : "Inativa"}</span>
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

      {modal && (
        <AdminModal
          title={modal.id ? "Editar conta" : "Nova conta bancária"}
          footer={
            <>
              <button className={btnSecondary} onClick={() => setModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !modal.nome?.trim() || !modal.saldoInicialData} onClick={salvar}>{saving ? "Salvando..." : "Salvar"}</button>
            </>
          }
        >
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nome *</label>
              <input className={inputCls} placeholder="Ex.: Itaú PJ VEXCIA" value={modal.nome || ""} onChange={(e) => setModal({ ...modal, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Banco</label>
                <input className={inputCls} value={modal.banco || ""} onChange={(e) => setModal({ ...modal, banco: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Agência</label>
                <input className={inputCls} value={modal.agencia || ""} onChange={(e) => setModal({ ...modal, agencia: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Conta</label>
                <input className={inputCls} value={modal.conta || ""} onChange={(e) => setModal({ ...modal, conta: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Saldo inicial</label>
                <MoneyInput value={modal.saldoInicial} onValue={(n) => setModal({ ...modal, saldoInicial: n ?? 0 })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Data do saldo *</label>
                <input type="date" className={inputCls} value={modal.saldoInicialData || ""} onChange={(e) => setModal({ ...modal, saldoInicialData: e.target.value })} />
              </div>
            </div>
            {modal.id && (
              <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modal.ativo !== false} onChange={(e) => setModal({ ...modal, ativo: e.target.checked })} />
                Conta ativa
              </label>
            )}
          </div>
        </AdminModal>
      )}
    </div>
  );
}

// ============================ Contatos ============================

function ContatosTab({ onError, showToast }: TabProps) {
  const [contatos, setContatos] = useState<FinContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<FinContato> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    finApi.contatos(true).then(setContatos).catch((e) => onError(e.message)).finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    if (!modal?.nome?.trim()) return;
    setSaving(true);
    try {
      const body = {
        nome: modal.nome.trim(),
        documento: modal.documento || undefined,
        tipo: modal.tipo || "AMBOS",
        observacao: modal.observacao || undefined,
      };
      if (modal.id) {
        await adminFetch(`/admin/financeiro/contatos/${modal.id}`, { method: "PATCH", body: JSON.stringify({ ...body, ativo: modal.ativo !== false }) });
      } else {
        await adminFetch("/admin/financeiro/contatos", { method: "POST", body: JSON.stringify(body) });
      }
      showToast("Contato salvo");
      setModal(null);
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (c: FinContato) => {
    try {
      const r = await adminFetch(`/admin/financeiro/contatos/${c.id}`, { method: "DELETE" });
      showToast(r.deleted ? "Contato excluído" : "Contato em uso — foi desativado");
      load();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const TIPO_LABEL = { CLIENTE: "Cliente", FORNECEDOR: "Fornecedor", AMBOS: "Ambos" } as const;

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Contatos (clientes, fornecedores e CNPJs prestadores)</h2>
        <button className={btnPrimary} onClick={() => setModal({ tipo: "AMBOS" })}>+ Novo contato</button>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className={thCls}>Nome</th>
            <th className={thCls}>CNPJ/CPF</th>
            <th className={thCls}>Tipo</th>
            <th className={thCls}>Uso</th>
            <th className={thCls}>Status</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
          ) : contatos.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum contato — cadastre fornecedores e os CNPJs que prestam serviço.</td></tr>
          ) : (
            contatos.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{c.nome}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.documento || "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{TIPO_LABEL[c.tipo]}</td>
                <td className="px-4 py-2.5 text-slate-400">{c._count ? `${c._count.entries} lançamento(s)` : "—"}</td>
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

      {modal && (
        <AdminModal
          title={modal.id ? "Editar contato" : "Novo contato"}
          footer={
            <>
              <button className={btnSecondary} onClick={() => setModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !modal.nome?.trim()} onClick={salvar}>{saving ? "Salvando..." : "Salvar"}</button>
            </>
          }
        >
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nome *</label>
              <input className={inputCls} value={modal.nome || ""} onChange={(e) => setModal({ ...modal, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">CNPJ/CPF</label>
                <input className={inputCls} value={modal.documento || ""} onChange={(e) => setModal({ ...modal, documento: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                <select className={selectCls} value={modal.tipo || "AMBOS"} onChange={(e) => setModal({ ...modal, tipo: e.target.value as FinContato["tipo"] })}>
                  <option value="CLIENTE">Cliente</option>
                  <option value="FORNECEDOR">Fornecedor</option>
                  <option value="AMBOS">Ambos</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Observação</label>
              <input className={inputCls} value={modal.observacao || ""} onChange={(e) => setModal({ ...modal, observacao: e.target.value })} />
            </div>
            {modal.id && (
              <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modal.ativo !== false} onChange={(e) => setModal({ ...modal, ativo: e.target.checked })} />
                Contato ativo
              </label>
            )}
          </div>
        </AdminModal>
      )}
    </div>
  );
}

// ============================ Mensalidades ============================

function MensalidadesTab({ onError, showToast }: TabProps) {
  const [rows, setRows] = useState<FinMensalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { valor?: number; diaVencimento?: number }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/financeiro/recorrencias/mensalidades")
      .then(setRows)
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const salvar = async (t: FinMensalidade, override?: { ativo?: boolean }) => {
    const edit = edits[t.tenantId] || {};
    const valor = edit.valor ?? t.regra?.valor;
    if (!valor || valor <= 0) {
      onError(`Informe o valor da mensalidade de ${t.nome}`);
      return;
    }
    setSavingId(t.tenantId);
    try {
      await adminFetch(`/admin/financeiro/recorrencias/mensalidades/${t.tenantId}`, {
        method: "PUT",
        body: JSON.stringify({
          valor,
          diaVencimento: edit.diaVencimento ?? t.regra?.diaVencimento ?? 5,
          ativo: override?.ativo ?? t.regra?.ativo ?? true,
        }),
      });
      showToast(`Mensalidade de ${t.nome} salva`);
      setEdits((p) => ({ ...p, [t.tenantId]: {} }));
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Mensalidades do VIA CRM por cliente (tenant)</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          A conta a receber é gerada automaticamente todo mês para cada cliente ativo com mensalidade configurada.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className={thCls}>Cliente</th>
            <th className={thCls}>Plano</th>
            <th className={thCls}>Valor mensal</th>
            <th className={thCls}>Dia venc.</th>
            <th className={thCls}>Cobrança</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum tenant encontrado.</td></tr>
          ) : (
            rows.map((t) => {
              const edit = edits[t.tenantId] || {};
              return (
                <tr key={t.tenantId} className={`hover:bg-slate-50 ${!t.tenantAtivo ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-700">{t.nome}</div>
                    <div className="text-xs text-slate-400">{t.slug}{!t.tenantAtivo && " · tenant suspenso"}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{t.plan}</td>
                  <td className="px-4 py-2.5" style={{ maxWidth: 160 }}>
                    <MoneyInput value={edit.valor ?? t.regra?.valor} onValue={(n) => setEdits((p) => ({ ...p, [t.tenantId]: { ...p[t.tenantId], valor: n } }))} />
                  </td>
                  <td className="px-4 py-2.5" style={{ maxWidth: 90 }}>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className={inputCls}
                      value={edit.diaVencimento ?? t.regra?.diaVencimento ?? 5}
                      onChange={(e) => setEdits((p) => ({ ...p, [t.tenantId]: { ...p[t.tenantId], diaVencimento: Number(e.target.value) } }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {t.regra ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${t.regra.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {t.regra.ativo ? "Ativa" : "Pausada"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">Não configurada</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                    <button className="mr-3 font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50" disabled={savingId === t.tenantId} onClick={() => salvar(t)}>
                      {savingId === t.tenantId ? "Salvando..." : "Salvar"}
                    </button>
                    {t.regra && (
                      <button className="text-slate-400 hover:text-slate-700" onClick={() => salvar(t, { ativo: !t.regra!.ativo })}>
                        {t.regra.ativo ? "Pausar" : "Reativar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================ Receitas/Despesas fixas ============================

function FixasTab({ onError, showToast }: TabProps) {
  const [rules, setRules] = useState<FinRecorrencia[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [contatos, setContatos] = useState<FinContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<FinRecorrencia> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adminFetch("/admin/financeiro/recorrencias"), finApi.categorias(), finApi.contatos()])
      .then(([r, c, ct]) => {
        setRules(r.filter((x: FinRecorrencia) => !x.tenantId)); // mensalidades ficam na outra aba
        setCategorias(c);
        setContatos(ct);
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    if (!modal?.descricao?.trim() || !modal.categoriaId || !modal.valor) return;
    setSaving(true);
    try {
      const body = {
        descricao: modal.descricao.trim(),
        categoriaId: modal.categoriaId,
        contactId: modal.contact?.id || undefined,
        valor: modal.valor,
        diaVencimento: modal.diaVencimento ?? 5,
      };
      if (modal.id) {
        await adminFetch(`/admin/financeiro/recorrencias/${modal.id}`, { method: "PATCH", body: JSON.stringify({ ...body, ativo: modal.ativo !== false }) });
      } else {
        await adminFetch("/admin/financeiro/recorrencias", { method: "POST", body: JSON.stringify({ ...body, tipo: modal.tipo || "PAGAR" }) });
      }
      showToast("Recorrência salva");
      setModal(null);
      load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (r: FinRecorrencia) => {
    try {
      const res = await adminFetch(`/admin/financeiro/recorrencias/${r.id}`, { method: "DELETE" });
      showToast(res.deleted ? "Recorrência excluída" : "Já gerou lançamentos — foi desativada");
      load();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const gruposDoTipo = (tipo: FinEntryTypeLocal) => categorias.filter((g) => g.tipo === (tipo === "RECEBER" ? "RECEITA" : "DESPESA"));
  type FinEntryTypeLocal = "PAGAR" | "RECEBER";

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Receitas e despesas fixas</h2>
          <p className="mt-0.5 text-xs text-slate-400">Geradas automaticamente todo mês (aluguel, contabilidade, contratos de serviço...)</p>
        </div>
        <button className={btnPrimary} onClick={() => setModal({ tipo: "PAGAR", diaVencimento: 5 })}>+ Nova recorrência</button>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className={thCls}>Tipo</th>
            <th className={thCls}>Descrição</th>
            <th className={thCls}>Categoria</th>
            <th className={`${thCls} text-right`}>Valor</th>
            <th className={thCls}>Dia</th>
            <th className={thCls}>Status</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
          ) : rules.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma recorrência fixa cadastrada.</td></tr>
          ) : (
            rules.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.tipo === "RECEBER" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {r.tipo === "RECEBER" ? "Receita" : "Despesa"}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-700">{r.descricao}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.categoria ? `${r.categoria.parent?.nome ? r.categoria.parent.nome + " › " : ""}${r.categoria.nome}` : "—"}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{formatBRL(r.valor)}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.diaVencimento}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.ativo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.ativo ? "Ativa" : "Pausada"}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                  <button className="mr-3 text-slate-400 hover:text-slate-700" onClick={() => setModal(r)}>Editar</button>
                  <button className="text-red-300 hover:text-red-600" onClick={() => excluir(r)}>Excluir</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {modal && (
        <AdminModal
          title={modal.id ? "Editar recorrência" : "Nova recorrência"}
          footer={
            <>
              <button className={btnSecondary} onClick={() => setModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={saving || !modal.descricao?.trim() || !modal.categoriaId || !modal.valor} onClick={salvar}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </>
          }
        >
          <div className="grid gap-3">
            {!modal.id && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                <div className="flex gap-2">
                  {(["PAGAR", "RECEBER"] as const).map((t) => (
                    <button
                      key={t}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${modal.tipo === t ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                      onClick={() => setModal({ ...modal, tipo: t, categoriaId: undefined })}
                    >
                      {t === "PAGAR" ? "Despesa fixa" : "Receita fixa"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Descrição *</label>
              <input className={inputCls} placeholder="Ex.: Contabilidade mensal" value={modal.descricao || ""} onChange={(e) => setModal({ ...modal, descricao: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Categoria *</label>
              <select className={selectCls} value={modal.categoriaId || ""} onChange={(e) => setModal({ ...modal, categoriaId: e.target.value })}>
                <option value="">Selecione...</option>
                {gruposDoTipo((modal.tipo as "PAGAR" | "RECEBER") || "PAGAR").map((g) => (
                  <optgroup key={g.id} label={g.nome}>
                    {g.children.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">Valor mensal *</label>
                <MoneyInput value={modal.valor} onValue={(n) => setModal({ ...modal, valor: n })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Dia venc.</label>
                <input type="number" min={1} max={31} className={inputCls} value={modal.diaVencimento ?? 5} onChange={(e) => setModal({ ...modal, diaVencimento: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Contraparte</label>
                <select className={selectCls} value={modal.contact?.id || ""} onChange={(e) => setModal({ ...modal, contact: e.target.value ? { id: e.target.value, nome: "" } : null })}>
                  <option value="">—</option>
                  {contatos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            {modal.id && (
              <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modal.ativo !== false} onChange={(e) => setModal({ ...modal, ativo: e.target.checked })} />
                Recorrência ativa
              </label>
            )}
          </div>
        </AdminModal>
      )}
    </div>
  );
}
