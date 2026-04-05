"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

type User = { id: string; nome: string; email: string; role: string; ativo: boolean; criadoEm: string };

const ROLES = ["OWNER", "MANAGER", "AGENT"];

export default function AdminClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // edit tenant
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    nome: "", slug: "",
    logradouro: "", numero: "", bairro: "", cep: "",
    cidade: "", estado: "", site: "", redesSociais: "",
    proprietarioNome: "", proprietarioTelefone: "",
    whatsappPhoneNumberId: "", whatsappToken: "", whatsappVerifyToken: "",
  });
  const [saving, setSaving] = useState(false);

  function slugify(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // edit user modal
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({ nome: "", email: "", role: "" });
  const [savingUser, setSavingUser] = useState(false);

  // reset password modal
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [savingReset, setSavingReset] = useState(false);

  // new user modal
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ nome: "", email: "", senha: "", role: "AGENT" });
  const [savingNew, setSavingNew] = useState(false);

  const msg = (type: "success" | "error", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      adminFetch(`/admin/tenants/${id}`),
      adminFetch(`/admin/tenants/${id}/stats`),
    ]).then(([t, s]) => {
      setTenant(t);
      setStats(s);
      setEditForm({
        nome: t.nome || "",
        slug: t.slug || "",
        logradouro: t.logradouro || "",
        numero: t.numero || "",
        bairro: t.bairro || "",
        cep: t.cep || "",
        cidade: t.cidade || "",
        estado: t.estado || "",
        site: t.site || "",
        redesSociais: t.redesSociais || "",
        proprietarioNome: t.proprietarioNome || "",
        proprietarioTelefone: t.proprietarioTelefone || "",
        whatsappPhoneNumberId: t.whatsappPhoneNumberId || "",
        whatsappToken: t.whatsappToken || "",
        whatsappVerifyToken: t.whatsappVerifyToken || "",
      });
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { if (id) load(); }, [id]);

  async function saveTenant() {
    setSaving(true);
    try {
      await adminFetch(`/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(editForm) });
      msg("success", "Cliente atualizado.");
      setEditing(false);
      load();
    } catch (e: any) {
      msg("error", e?.message || "Erro ao salvar.");
    } finally { setSaving(false); }
  }

  async function impersonate() {
    try {
      const data = await adminFetch(`/admin/tenants/${id}/impersonate`, { method: "POST" });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify({ ...data.owner, role: data.owner.role }));
      window.open("/dashboard", "_blank");
      msg("success", "Sessão de impersonation aberta em nova aba.");
    } catch (e: any) { msg("error", e?.message || "Erro ao impersonar."); }
  }

  async function suspend(doSuspend: boolean) {
    try {
      await adminFetch(`/admin/tenants/${id}/${doSuspend ? "suspend" : "activate"}`, { method: "POST" });
      msg("success", doSuspend ? "Acesso suspenso." : "Acesso reativado.");
      load();
    } catch (e: any) { msg("error", e?.message || "Erro."); }
  }

  async function changePlan(plan: string) {
    try {
      await adminFetch(`/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
      msg("success", `Plano alterado para ${plan}.`);
      load();
    } catch (e: any) { msg("error", e?.message || "Erro."); }
  }

  async function exportData() {
    const data = await adminFetch(`/admin/tenants/${id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tenant-${id}-export.json`; a.click();
    URL.revokeObjectURL(url);
  }

  // --- User actions ---
  function openEditUser(u: User) {
    setEditUser(u);
    setEditUserForm({ nome: u.nome, email: u.email, role: u.role });
  }

  async function saveEditUser() {
    if (!editUser) return;
    setSavingUser(true);
    try {
      await adminFetch(`/admin/tenants/${id}/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(editUserForm) });
      msg("success", "Usuário atualizado.");
      setEditUser(null);
      load();
    } catch (e: any) { msg("error", e?.message || "Erro ao salvar."); }
    finally { setSavingUser(false); }
  }

  async function toggleUser(u: User) {
    try {
      await adminFetch(`/admin/tenants/${id}/users/${u.id}/toggle`, { method: "PATCH" });
      msg("success", u.ativo ? "Usuário desativado." : "Usuário ativado.");
      load();
    } catch (e: any) { msg("error", e?.message || "Erro."); }
  }

  async function saveResetPassword() {
    if (!resetUser) return;
    setSavingReset(true);
    try {
      await adminFetch(`/admin/tenants/${id}/users/${resetUser.id}/reset-password`, { method: "POST", body: JSON.stringify({ novaSenha }) });
      msg("success", "Senha redefinida.");
      setResetUser(null);
      setNovaSenha("");
    } catch (e: any) { msg("error", e?.message || "Erro ao redefinir."); }
    finally { setSavingReset(false); }
  }

  async function deleteUser(u: User) {
    if (!confirm(`Remover ${u.nome}? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminFetch(`/admin/tenants/${id}/users/${u.id}`, { method: "DELETE" });
      msg("success", "Usuário removido.");
      load();
    } catch (e: any) { msg("error", e?.message || "Erro ao remover."); }
  }

  async function saveNewUser() {
    setSavingNew(true);
    try {
      await adminFetch(`/admin/tenants/${id}/users`, { method: "POST", body: JSON.stringify(newUserForm) });
      msg("success", "Usuário criado.");
      setShowNewUser(false);
      setNewUserForm({ nome: "", email: "", senha: "", role: "AGENT" });
      load();
    } catch (e: any) { msg("error", e?.message || "Erro ao criar."); }
    finally { setSavingNew(false); }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Carregando...</div>;
  if (!tenant) return <div className="p-8 text-sm text-red-600">Tenant não encontrado.</div>;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/clientes" className="text-xs text-gray-500 hover:underline">← Clientes</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold">{tenant.nome}</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${tenant.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tenant.ativo ? "Ativo" : "Suspenso"}</span>
          <span className={`text-xs px-2 py-1 rounded-full ${tenant.plan === "PREMIUM" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{tenant.plan}</span>
        </div>
        <p className="text-sm text-gray-400 mt-1">slug: {tenant.slug} · id: {tenant.id}</p>
      </div>

      {actionMsg && (
        <div className={`rounded-md border p-3 text-sm ${actionMsg.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {actionMsg.text}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Leads total", value: stats.leadsTotal },
            { label: "Leads este mês", value: stats.leadsThisMonth },
            { label: "Usuários ativos", value: stats.users },
            { label: "Canais ativos", value: stats.channels },
          ].map((s) => (
            <div key={s.label} className="border rounded-lg bg-white p-4">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Edit tenant */}
      <div className="border rounded-lg bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Dados do cliente</h2>
          {!editing && <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">Editar</button>}
        </div>
        {editing ? (
          <div className="space-y-4">
            {/* Nome + slug automático */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nome da imobiliária</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" value={editForm.nome}
                  onChange={(e) => setEditForm({ ...editForm, nome: e.target.value, slug: slugify(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Slug (gerado automaticamente)</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-400" value={editForm.slug} readOnly />
              </div>
            </div>

            {/* Endereço */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Logradouro</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="Rua, Av., Alameda..." value={editForm.logradouro}
                  onChange={(e) => setEditForm({ ...editForm, logradouro: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Número</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="123" value={editForm.numero}
                  onChange={(e) => setEditForm({ ...editForm, numero: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bairro</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" value={editForm.bairro}
                  onChange={(e) => setEditForm({ ...editForm, bairro: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">CEP</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="00000-000" value={editForm.cep}
                  onChange={(e) => setEditForm({ ...editForm, cep: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Estado</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="SP" value={editForm.estado}
                  onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cidade</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" value={editForm.cidade}
                onChange={(e) => setEditForm({ ...editForm, cidade: e.target.value })} />
            </div>

            {/* Web */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Site</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="https://..." value={editForm.site}
                  onChange={(e) => setEditForm({ ...editForm, site: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rede social</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="@imobiliaria" value={editForm.redesSociais}
                  onChange={(e) => setEditForm({ ...editForm, redesSociais: e.target.value })} />
              </div>
            </div>

            {/* Proprietário */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nome do proprietário</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" value={editForm.proprietarioNome}
                  onChange={(e) => setEditForm({ ...editForm, proprietarioNome: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Telefone do proprietário</label>
                <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="(11) 99999-9999" value={editForm.proprietarioTelefone}
                  onChange={(e) => setEditForm({ ...editForm, proprietarioTelefone: e.target.value })} />
              </div>
            </div>

            {/* WhatsApp */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "WhatsApp Phone Number ID", field: "whatsappPhoneNumberId" },
                { label: "WhatsApp Token", field: "whatsappToken" },
                { label: "WhatsApp Verify Token", field: "whatsappVerifyToken" },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <input className="w-full border rounded px-3 py-1.5 text-sm" value={(editForm as any)[field]}
                    onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={saveTenant} disabled={saving} className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-md border hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: "Nome", value: tenant.nome },
              { label: "Slug", value: tenant.slug },
              { label: "Endereço", value: [tenant.logradouro, tenant.numero].filter(Boolean).join(", ") },
              { label: "Bairro", value: tenant.bairro },
              { label: "CEP", value: tenant.cep },
              { label: "Cidade", value: tenant.cidade },
              { label: "Estado", value: tenant.estado },
              { label: "Site", value: tenant.site },
              { label: "Rede social", value: tenant.redesSociais },
              { label: "Proprietário", value: tenant.proprietarioNome },
              { label: "Tel. proprietário", value: tenant.proprietarioTelefone },
              { label: "WhatsApp Phone ID", value: tenant.whatsappPhoneNumberId },
            ].map(({ label, value }) => (
              <>
                <span key={label + "_l"} className="text-gray-500">{label}</span>
                <span key={label + "_v"}>{value || <em className="text-gray-300">—</em>}</span>
              </>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border rounded-lg bg-white p-5 space-y-3">
        <h2 className="font-semibold text-sm">Ações</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={impersonate} className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Acessar como OWNER
          </button>
          <button onClick={() => suspend(!tenant.ativo)} className={`text-sm px-4 py-2 rounded-md ${tenant.ativo ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
            {tenant.ativo ? "Suspender acesso" : "Reativar acesso"}
          </button>
          <select onChange={(e) => changePlan(e.target.value)} value={tenant.plan} className="text-sm border rounded-md px-3 py-2">
            <option value="STARTER">Starter</option>
            <option value="PREMIUM">Premium</option>
          </select>
          <button onClick={exportData} className="text-sm px-4 py-2 rounded-md border hover:bg-gray-50">
            Exportar dados (JSON)
          </button>
        </div>
      </div>

      {/* Users */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">Usuários ({tenant.users?.length || 0})</span>
          <button onClick={() => setShowNewUser(true)} className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            + Novo usuário
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Nome", "E-mail", "Role", "Status", "Criado", "Ações"].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenant.users?.map((u: User) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2"><span className="text-xs bg-gray-100 rounded px-2 py-0.5">{u.role}</span></td>
                <td className="px-4 py-2">
                  <span className={`text-xs ${u.ativo ? "text-green-600" : "text-red-500"}`}>{u.ativo ? "Ativo" : "Inativo"}</span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(u.criadoEm).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => openEditUser(u)} className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => { setResetUser(u); setNovaSenha(""); }} className="text-xs text-amber-600 hover:underline">Senha</button>
                    <button onClick={() => toggleUser(u)} className={`text-xs hover:underline ${u.ativo ? "text-red-500" : "text-green-600"}`}>
                      {u.ativo ? "Desativar" : "Ativar"}
                    </button>
                    {u.role !== "OWNER" && (
                      <button onClick={() => deleteUser(u)} className="text-xs text-red-600 hover:underline">Remover</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: editar usuário */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Editar usuário</h3>
            {[
              { label: "Nome", field: "nome", type: "text" },
              { label: "E-mail", field: "email", type: "email" },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input type={type} className="w-full border rounded px-3 py-2 text-sm"
                  value={(editUserForm as any)[field]}
                  onChange={(e) => setEditUserForm({ ...editUserForm, [field]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={editUserForm.role}
                onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditUser(null)} className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50">Cancelar</button>
              <button onClick={saveEditUser} disabled={savingUser} className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {savingUser ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: redefinir senha */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold">Redefinir senha — {resetUser.nome}</h3>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nova senha (mín. 6 caracteres)</label>
              <input type="password" className="w-full border rounded px-3 py-2 text-sm"
                value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetUser(null)} className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50">Cancelar</button>
              <button onClick={saveResetPassword} disabled={savingReset || novaSenha.length < 6}
                className="text-sm px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                {savingReset ? "Salvando..." : "Redefinir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: novo usuário */}
      {showNewUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Novo usuário</h3>
            {[
              { label: "Nome", field: "nome", type: "text" },
              { label: "E-mail", field: "email", type: "email" },
              { label: "Senha", field: "senha", type: "password" },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input type={type} className="w-full border rounded px-3 py-2 text-sm"
                  value={(newUserForm as any)[field]}
                  onChange={(e) => setNewUserForm({ ...newUserForm, [field]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={newUserForm.role}
                onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewUser(false)} className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50">Cancelar</button>
              <button onClick={saveNewUser} disabled={savingNew}
                className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {savingNew ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
