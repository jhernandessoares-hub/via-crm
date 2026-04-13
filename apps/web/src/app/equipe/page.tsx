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
  criadoEm: string;
};

type Branch = { id: string; nome: string };

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
};

const ROLE_COLORS: Record<Role, string> = {
  OWNER: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  AGENT: "bg-gray-100 text-gray-700",
};

export default function EquipePage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    nome: "",
    email: "",
    senha: "",
    role: "AGENT",
    branchId: "",
  });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Edit modal
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "",
    role: "AGENT",
    ativo: true,
    branchId: "",
    senha: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Remove confirm
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        setCurrentUserId(u.id);
      } catch {}
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
      setMembers(membersData);
      setBranches(branchesData);
    } finally {
      setLoading(false);
    }
  }

  // ── Invite ────────────────────────────────────────────────────────

  function openInvite() {
    setInviteForm({ nome: "", email: "", senha: "", role: "AGENT", branchId: "" });
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
    setEditForm({
      nome: m.nome,
      role: m.role,
      ativo: m.ativo,
      branchId: m.branchId ?? "",
      senha: "",
    });
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
      };
      if (editForm.senha) payload.senha = editForm.senha;
      await apiFetch(`/users/team/${editMember.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
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

  // ── Quick toggle ativo ────────────────────────────────────────────

  async function toggleAtivo(m: TeamMember) {
    try {
      await apiFetch(`/users/team/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !m.ativo }),
      });
      loadData();
    } catch (err: any) {
      alert(err?.message || "Erro.");
    }
  }

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.nome ?? "—";

  return (
    <AppShell title="Equipe">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Gestão de Equipe</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie os membros da sua equipe</p>
          </div>
          <button
            onClick={openInvite}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            + Novo membro
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="bg-white rounded-lg border divide-y">
            {members.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-gray-400">Nenhum membro encontrado.</div>
            )}
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{m.nome}</span>
                    {currentUserId === m.id && (
                      <span className="text-[11px] text-gray-400">(você)</span>
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
                  <div className="text-xs text-gray-500 mt-0.5">
                    {m.email}
                    {m.branchId && <span className="ml-2 text-gray-400">· {branchName(m.branchId)}</span>}
                  </div>
                </div>

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
                      className="text-xs rounded px-2 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50"
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo membro</h2>
            <form onSubmit={submitInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={inviteForm.nome}
                  onChange={(e) => setInviteForm({ ...inviteForm, nome: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Senha inicial *</label>
                <input
                  type="password"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={inviteForm.senha}
                  onChange={(e) => setInviteForm({ ...inviteForm, senha: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Papel</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  >
                    <option value="AGENT">Corretor</option>
                    <option value="MANAGER">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Equipe / Filial</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={inviteForm.branchId}
                    onChange={(e) => setInviteForm({ ...inviteForm, branchId: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {inviteLoading ? "Criando..." : "Criar membro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────── */}
      {editMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Editar membro</h2>
            <form onSubmit={submitEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={editForm.nome}
                  onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Papel</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="AGENT">Corretor</option>
                    <option value="MANAGER">Gerente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={editForm.ativo ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, ativo: e.target.value === "true" })}
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Equipe / Filial</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={editForm.branchId}
                  onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                >
                  <option value="">Nenhuma</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nova senha (opcional)</label>
                <input
                  type="password"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="Deixe em branco para não alterar"
                  value={editForm.senha}
                  onChange={(e) => setEditForm({ ...editForm, senha: e.target.value })}
                />
              </div>

              {editError && <p className="text-xs text-red-600">{editError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMember(null)}
                  className="flex-1 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {editLoading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove confirm ───────────────────────────────────────── */}
      {removingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Remover membro?</h2>
            <p className="text-sm text-gray-500 mb-4">
              Esta ação remove o usuário permanentemente do tenant. Não é possível desfazer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRemovingId(null)}
                className="flex-1 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmRemove(removingId)}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
