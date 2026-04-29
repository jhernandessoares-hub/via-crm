"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type Role = "OWNER" | "MANAGER" | "AGENT";

type TeamMember = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  branchId: string | null;
  recebeLeads: boolean;
  criadoEm: string;
};

type Branch = { id: string; nome: string };

type RoundRobinConfig = {
  incluirGerentes: boolean;
  incluirOwner: boolean;
};

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
};

const ROLE_COLORS: Record<Role, string> = {
  OWNER: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  AGENT: "bg-[var(--shell-hover)] text-[var(--shell-subtext)]",
};

export default function EquipePage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Round-robin config
  const [rrConfig, setRrConfig] = useState<RoundRobinConfig>({ incluirGerentes: false, incluirOwner: false });
  const [rrSaving, setRrSaving] = useState(false);
  const [rrOk, setRrOk] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ nome: "", email: "", senha: "", role: "AGENT", branchId: "", recebeLeads: true });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Edit modal
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", role: "AGENT", ativo: true, branchId: "", senha: "", recebeLeads: true });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Remove confirm
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try { setCurrentUserId(JSON.parse(raw).id); } catch {}
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [membersData, branchesData] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/users/branches"),
      ]);
      setMembers(Array.isArray(membersData) ? membersData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
    } finally {
      setLoading(false);
    }

    // Config da roleta separada — falha não impede a lista de membros
    try {
      const rrData = await apiFetch("/users/round-robin");
      setRrConfig(rrData);
    } catch { /* silently ignore */ }
  }

  // ── Round-robin config ────────────────────────────────────────────

  async function saveRrConfig(patch: Partial<RoundRobinConfig>) {
    const next = { ...rrConfig, ...patch };
    setRrConfig(next);
    setRrSaving(true);
    setRrOk(false);
    try {
      await apiFetch("/users/round-robin", { method: "PATCH", body: JSON.stringify(next) });
      setRrOk(true);
      setTimeout(() => setRrOk(false), 2000);
    } finally {
      setRrSaving(false);
    }
  }

  // ── Toggle recebeLeads inline ─────────────────────────────────────

  async function toggleRecebeLeads(m: TeamMember) {
    try {
      await apiFetch(`/users/team/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ recebeLeads: !m.recebeLeads }),
      });
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, recebeLeads: !m.recebeLeads } : x));
    } catch (err: any) {
      alert(err?.message || "Erro ao atualizar.");
    }
  }

  // ── Invite ────────────────────────────────────────────────────────

  function openInvite() {
    setInviteForm({ nome: "", email: "", senha: "", role: "AGENT", branchId: "", recebeLeads: true });
    setInviteError("");
    setShowInvite(true);
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteForm.nome || !inviteForm.email || !inviteForm.senha) {
      setInviteError("Preencha nome, e-mail e senha.");
      return;
    }
    setInviteLoading(true);
    setInviteError("");
    try {
      await apiFetch("/users/team", {
        method: "POST",
        body: JSON.stringify({
          nome: inviteForm.nome,
          email: inviteForm.email,
          senha: inviteForm.senha,
          role: inviteForm.role,
          branchId: inviteForm.branchId || null,
          recebeLeads: inviteForm.recebeLeads,
        }),
      });
      setShowInvite(false);
      loadData();
    } catch (err: any) {
      setInviteError(err?.message || "Erro ao criar usuário.");
    } finally {
      setInviteLoading(false);
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────

  function openEdit(m: TeamMember) {
    setEditMember(m);
    setEditForm({ nome: m.nome, role: m.role, ativo: m.ativo, branchId: m.branchId ?? "", senha: "", recebeLeads: m.recebeLeads });
    setEditError("");
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editMember) return;
    setEditLoading(true);
    setEditError("");
    try {
      const payload: any = {
        nome: editForm.nome,
        role: editForm.role,
        ativo: editForm.ativo,
        branchId: editForm.branchId || null,
        recebeLeads: editForm.recebeLeads,
      };
      if (editForm.senha) payload.senha = editForm.senha;
      await apiFetch(`/users/team/${editMember.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditMember(null);
      loadData();
    } catch (err: any) {
      setEditError(err?.message || "Erro ao atualizar usuário.");
    } finally {
      setEditLoading(false);
    }
  }

  // ── Remove ────────────────────────────────────────────────────────

  async function confirmRemove(id: string) {
    try {
      await apiFetch(`/users/team/${id}`, { method: "DELETE" });
      setRemovingId(null);
      loadData();
    } catch (err: any) {
      alert(err?.message || "Erro ao remover usuário.");
      setRemovingId(null);
    }
  }

  async function toggleAtivo(m: TeamMember) {
    try {
      await apiFetch(`/users/team/${m.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !m.ativo }) });
      loadData();
    } catch (err: any) {
      alert(err?.message || "Erro.");
    }
  }

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.nome ?? "—";

  return (
    <AppShell title="Equipe">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--shell-text)]">Gestão de Equipe</h1>
            <p className="text-sm text-[var(--shell-subtext)] mt-0.5">Gerencie os membros e a distribuição de leads</p>
          </div>
          <button onClick={openInvite} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
            + Novo membro
          </button>
        </div>

        {/* ── Painel de Distribuição de Leads ── */}
        <div className="bg-[var(--shell-card-bg)] rounded-lg border p-5" style={{ borderColor: "var(--shell-card-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--shell-text)]">Distribuição de Leads (Roleta)</h2>
              <p className="text-xs text-[var(--shell-subtext)] mt-0.5">
                Leads novos são distribuídos automaticamente para quem está habilitado a receber
              </p>
            </div>
            {rrSaving && <span className="text-xs text-[var(--shell-subtext)]">Salvando...</span>}
            {rrOk && <span className="text-xs text-emerald-600">Salvo ✓</span>}
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => saveRrConfig({ incluirGerentes: !rrConfig.incluirGerentes })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  rrConfig.incluirGerentes ? "bg-slate-900" : "bg-gray-200"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${
                  rrConfig.incluirGerentes ? "translate-x-4" : "translate-x-1"
                }`} />
              </button>
              <span className="text-sm text-[var(--shell-subtext)]">Gerentes podem receber leads</span>
            </label>

            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => saveRrConfig({ incluirOwner: !rrConfig.incluirOwner })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    rrConfig.incluirOwner ? "bg-slate-900" : "bg-gray-200"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${
                    rrConfig.incluirOwner ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
                <span className="text-sm text-[var(--shell-subtext)]">Proprietário pode receber leads</span>
              </label>
              <p className="text-xs text-amber-600 dark:text-amber-400 ml-11">
                Mesmo desligado, se não houver corretores elegíveis, o Proprietário receberá o lead e as notificações automaticamente.
              </p>
            </div>
          </div>

          <p className="text-xs text-[var(--shell-subtext)] mt-3">
            O sistema atribui o próximo lead ao membro habilitado que há mais tempo não recebe um lead (round-robin).
          </p>
        </div>

        {/* ── Lista de membros ── */}
        {loading ? (
          <div className="text-sm text-[var(--shell-subtext)]">Carregando...</div>
        ) : (
          <div className="bg-[var(--shell-card-bg)] rounded-lg border divide-y" style={{ borderColor: "var(--shell-card-border)" }}>
            {members.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-[var(--shell-subtext)]">Nenhum membro encontrado.</div>
            )}
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--shell-text)] text-sm">{m.nome}</span>
                    {currentUserId === m.id && (
                      <span className="text-[11px] text-[var(--shell-subtext)]">(você)</span>
                    )}
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[m.role]}`}>
                      {ROLE_LABELS[m.role]}
                    </span>
                    {!m.ativo && (
                      <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-600">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--shell-subtext)] mt-0.5">
                    {m.email}
                    {m.branchId && <span className="ml-2">· {branchName(m.branchId)}</span>}
                  </div>
                </div>

                {/* Toggle recebe leads */}
                {m.role !== "OWNER" && (
                  <div className="flex items-center gap-1.5 shrink-0" title={m.recebeLeads ? "Na roleta" : "Fora da roleta"}>
                    <button
                      type="button"
                      onClick={() => toggleRecebeLeads(m)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        m.recebeLeads && m.ativo ? "bg-emerald-500" : "bg-gray-200"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--shell-card-bg)] shadow transition-transform ${
                        m.recebeLeads ? "translate-x-4" : "translate-x-1"
                      }`} />
                    </button>
                    <span className="text-xs text-[var(--shell-subtext)] w-20">
                      {m.recebeLeads ? "Na roleta" : "Fora"}
                    </span>
                  </div>
                )}

                {m.role !== "OWNER" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleAtivo(m)}
                      className={`text-xs rounded px-2 py-1 border ${
                        m.ativo
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {m.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => openEdit(m)}
                      className="text-xs rounded px-2 py-1 border text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                      style={{ borderColor: "var(--shell-card-border)" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setRemovingId(m.id)}
                      className="text-xs rounded px-2 py-1 border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invite Modal ─────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl shadow-xl w-full max-w-md mx-4 p-6 bg-[var(--shell-card-bg)]">
            <h2 className="text-lg font-semibold text-[var(--shell-text)] mb-4">Novo membro</h2>
            <form onSubmit={submitInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Nome *</label>
                <input className="w-full border rounded-md px-3 py-2 text-sm" value={inviteForm.nome}
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  onChange={(e) => setInviteForm({ ...inviteForm, nome: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">E-mail *</label>
                <input type="email" className="w-full border rounded-md px-3 py-2 text-sm" value={inviteForm.email}
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Senha inicial *</label>
                <input type="password" className="w-full border rounded-md px-3 py-2 text-sm" value={inviteForm.senha}
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  onChange={(e) => setInviteForm({ ...inviteForm, senha: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Papel</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={inviteForm.role}
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
                    <option value="AGENT">Corretor</option>
                    <option value="MANAGER">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Equipe / Filial</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={inviteForm.branchId}
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    onChange={(e) => setInviteForm({ ...inviteForm, branchId: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </div>
              </div>

              {/* Recebe leads */}
              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input type="checkbox" className="h-4 w-4 rounded border-[var(--shell-card-border)]"
                  checked={inviteForm.recebeLeads}
                  onChange={(e) => setInviteForm({ ...inviteForm, recebeLeads: e.target.checked })} />
                <span className="text-sm text-[var(--shell-subtext)]">Participar da roleta de leads</span>
              </label>

              {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 rounded-md border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                  style={{ borderColor: "var(--shell-card-border)" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={inviteLoading}
                  className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
                  {inviteLoading ? "Criando..." : "Criar membro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────── */}
      {editMember && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl shadow-xl w-full max-w-md mx-4 p-6 bg-[var(--shell-card-bg)]">
            <h2 className="text-lg font-semibold text-[var(--shell-text)] mb-4">Editar membro</h2>
            <form onSubmit={submitEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Nome</label>
                <input className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.nome}
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Papel</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.role}
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    <option value="AGENT">Corretor</option>
                    <option value="MANAGER">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Status</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm"
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                    value={editForm.ativo ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, ativo: e.target.value === "true" })}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Equipe / Filial</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.branchId}
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}>
                  <option value="">Nenhuma</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--shell-subtext)] mb-1">Nova senha (opcional)</label>
                <input type="password" className="w-full border rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  placeholder="Deixe em branco para não alterar" value={editForm.senha}
                  onChange={(e) => setEditForm({ ...editForm, senha: e.target.value })} />
              </div>

              {/* Recebe leads */}
              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input type="checkbox" className="h-4 w-4 rounded border-[var(--shell-card-border)]"
                  checked={editForm.recebeLeads}
                  onChange={(e) => setEditForm({ ...editForm, recebeLeads: e.target.checked })} />
                <span className="text-sm text-[var(--shell-subtext)]">Participar da roleta de leads</span>
              </label>

              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditMember(null)}
                  className="flex-1 rounded-md border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                  style={{ borderColor: "var(--shell-card-border)" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={editLoading}
                  className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
                  {editLoading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove confirm ───────────────────────────────────────── */}
      {removingId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 bg-[var(--shell-card-bg)]">
            <h2 className="text-base font-semibold text-[var(--shell-text)] mb-2">Remover membro?</h2>
            <p className="text-sm text-[var(--shell-subtext)] mb-4">Esta ação remove o usuário permanentemente. Não é possível desfazer.</p>
            <div className="flex gap-2">
              <button onClick={() => setRemovingId(null)}
                className="flex-1 rounded-md border px-4 py-2 text-sm text-[var(--shell-subtext)] hover:bg-[var(--shell-hover)]"
                style={{ borderColor: "var(--shell-card-border)" }}>
                Cancelar
              </button>
              <button onClick={() => confirmRemove(removingId)}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
