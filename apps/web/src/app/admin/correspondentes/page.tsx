"use client";
import { useEffect, useState } from "react";
import AdminShell from "@/app/admin/_admin-shell";
import {
  adminListCorrespondents, adminCreateCorrespondent,
  adminUpdateCorrespondent, adminDeleteCorrespondent,
  type Correspondent,
} from "@/lib/correspondente.service";

const inp = "w-full rounded-lg border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)]";

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--shell-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--shell-subtext)] hover:text-[var(--shell-text)] text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CorrespondentesAdminPage() {
  const [list,    setList]    = useState<Correspondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Correspondent | null>(null);
  const [saving,  setSaving]  = useState(false);

  const [form, setForm] = useState({ nome: "", email: "", telefone: "", empresa: "", creci: "", senha: "" });

  function setF(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function load() {
    try { setList(await adminListCorrespondents()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ nome: "", email: "", telefone: "", empresa: "", creci: "", senha: "" });
    setShowModal(true);
  }

  function openEdit(c: Correspondent) {
    setEditing(c);
    setForm({ nome: c.nome, email: c.email, telefone: c.telefone ?? "", empresa: c.empresa ?? "", creci: c.creci ?? "", senha: "" });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.nome.trim() || !form.email.trim()) return;
    if (!editing && !form.senha.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await adminUpdateCorrespondent(editing.id, { nome: form.nome, email: form.email, telefone: form.telefone || undefined, empresa: form.empresa || undefined, creci: form.creci || undefined, ...(form.senha ? { senha: form.senha } : {}) });
      } else {
        await adminCreateCorrespondent({ nome: form.nome, email: form.email, telefone: form.telefone || undefined, empresa: form.empresa || undefined, creci: form.creci || undefined, senha: form.senha, ativo: true });
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(c: Correspondent) {
    try { await adminUpdateCorrespondent(c.id, { ativo: !c.ativo }); await load(); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--shell-text)]">Correspondentes de Crédito</h1>
            <p className="text-sm text-[var(--shell-subtext)]">Usuários externos que recebem demandas de análise de crédito</p>
          </div>
          <button onClick={openCreate}
            className="rounded-xl bg-[var(--brand-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            + Novo Correspondente
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--shell-subtext)]">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] py-16 text-center text-sm text-[var(--shell-subtext)]">
            Nenhum correspondente cadastrado.
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] divide-y divide-[var(--shell-card-border)]">
            {list.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${c.ativo ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${c.ativo ? "text-[var(--shell-text)]" : "text-[var(--shell-subtext)]"}`}>
                    {c.nome}
                    {!c.ativo && <span className="ml-2 text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">Inativo</span>}
                  </p>
                  <p className="text-xs text-[var(--shell-subtext)]">
                    {c.email}{c.empresa ? ` · ${c.empresa}` : ""}{c.creci ? ` · CRECI ${c.creci}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(c)}
                    className="rounded-lg border border-[var(--shell-card-border)] px-3 py-1.5 text-xs text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]">
                    Editar
                  </button>
                  <button onClick={() => handleToggle(c)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${c.ativo ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                    {c.ativo ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Editar Correspondente" : "Novo Correspondente"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Nome *</label>
              <input value={form.nome} onChange={(e) => setF("nome", e.target.value)} placeholder="Nome completo" className={inp} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">E-mail *</label>
              <input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="email@exemplo.com" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Telefone</label>
              <input value={form.telefone} onChange={(e) => setF("telefone", e.target.value)} placeholder="(11) 99999-9999" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">CRECI</label>
              <input value={form.creci} onChange={(e) => setF("creci", e.target.value)} placeholder="Nº CRECI" className={inp} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Empresa / Banco</label>
              <input value={form.empresa} onChange={(e) => setF("empresa", e.target.value)} placeholder="Nome da financeira ou banco" className={inp} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">
                Senha {editing ? "(deixe em branco para manter)" : "*"}
              </label>
              <input type="password" value={form.senha} onChange={(e) => setF("senha", e.target.value)} placeholder="••••••••" className={inp} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowModal(false)}
              className="rounded-lg border border-[var(--shell-card-border)] px-4 py-2 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.nome.trim() || !form.email.trim() || (!editing && !form.senha.trim())}
              className="rounded-lg bg-[var(--brand-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
