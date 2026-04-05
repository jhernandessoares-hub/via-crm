"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin-api";
import Link from "next/link";

const STEPS = ["Imobiliária", "Proprietário", "WhatsApp", "Plano", "Revisão"];

function slugify(str: string) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const emptyForm = {
  // Step 1
  nome: "", slug: "",
  logradouro: "", numero: "", bairro: "", cep: "",
  cidade: "", estado: "", site: "", redesSociais: "",
  // Step 2
  proprietarioNome: "", proprietarioTelefone: "",
  ownerNome: "", ownerEmail: "", ownerSenha: "",
  // Step 3
  whatsappPhoneNumberId: "", whatsappToken: "", whatsappVerifyToken: "",
  // Step 4
  plan: "STARTER",
};

export default function NovoClientePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  function canAdvance() {
    if (step === 0) return form.nome.trim() !== "" && form.slug.trim() !== "";
    if (step === 1) return form.ownerNome.trim() !== "" && form.ownerEmail.trim() !== "" && form.ownerSenha.length >= 6;
    return true;
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const tenant = await adminFetch("/admin/tenants", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push(`/admin/clientes/${tenant.id}`);
    } catch (e: any) {
      setError(e?.message || "Erro ao criar cliente.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div>
        <Link href="/admin/clientes" className="text-xs text-gray-500 hover:underline">← Clientes</Link>
        <h1 className="text-2xl font-bold mt-2">Novo cliente</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 mt-6 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors
                ${i < step ? "bg-blue-600 border-blue-600 text-white" : i === step ? "border-blue-600 text-blue-600 bg-white" : "border-gray-300 text-gray-400 bg-white"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${i === step ? "text-blue-600 font-medium" : "text-gray-400"}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-4 ${i < step ? "bg-blue-600" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>}

      <div className="bg-white border rounded-xl p-6 space-y-4">

        {/* Step 0: Imobiliária */}
        {step === 0 && (
          <>
            <h2 className="font-semibold text-gray-700">Dados da imobiliária</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nome *</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value, slug: slugify(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Slug (automático)</label>
                <input className="w-full border rounded px-3 py-2 text-sm bg-gray-50 text-gray-400" value={form.slug} readOnly />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Logradouro</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Rua, Av..." value={form.logradouro}
                  onChange={(e) => set("logradouro", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Número</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.numero}
                  onChange={(e) => set("numero", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bairro</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.bairro}
                  onChange={(e) => set("bairro", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">CEP</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="00000-000" value={form.cep}
                  onChange={(e) => set("cep", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Estado</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="SP" value={form.estado}
                  onChange={(e) => set("estado", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cidade</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.cidade}
                  onChange={(e) => set("cidade", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Site</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="https://..." value={form.site}
                  onChange={(e) => set("site", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rede social</label>
              <input className="w-full border rounded px-3 py-2 text-sm" placeholder="@imobiliaria" value={form.redesSociais}
                onChange={(e) => set("redesSociais", e.target.value)} />
            </div>
          </>
        )}

        {/* Step 1: Proprietário */}
        {step === 1 && (
          <>
            <h2 className="font-semibold text-gray-700">Proprietário / acesso OWNER</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nome do proprietário</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form.proprietarioNome}
                  onChange={(e) => set("proprietarioNome", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Telefone do proprietário</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="(11) 99999-9999" value={form.proprietarioTelefone}
                  onChange={(e) => set("proprietarioTelefone", e.target.value)} />
              </div>
            </div>
            <hr className="my-2" />
            <p className="text-xs text-gray-500">Credenciais de acesso ao sistema (conta OWNER)</p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome completo *</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={form.ownerNome}
                onChange={(e) => set("ownerNome", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">E-mail *</label>
                <input type="email" className="w-full border rounded px-3 py-2 text-sm" value={form.ownerEmail}
                  onChange={(e) => set("ownerEmail", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Senha * (mín. 6 caracteres)</label>
                <input type="password" className="w-full border rounded px-3 py-2 text-sm" value={form.ownerSenha}
                  onChange={(e) => set("ownerSenha", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {/* Step 2: WhatsApp */}
        {step === 2 && (
          <>
            <h2 className="font-semibold text-gray-700">Configuração WhatsApp</h2>
            <p className="text-xs text-gray-500">Opcional — pode configurar depois nas configurações do cliente.</p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Phone Number ID</label>
              <input className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="123456789012345" value={form.whatsappPhoneNumberId}
                onChange={(e) => set("whatsappPhoneNumberId", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Access Token</label>
              <input className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="EAAxxxxx..." value={form.whatsappToken}
                onChange={(e) => set("whatsappToken", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Verify Token</label>
              <input className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="token-verificação" value={form.whatsappVerifyToken}
                onChange={(e) => set("whatsappVerifyToken", e.target.value)} />
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">URL do webhook para configurar no Meta:</p>
              <p className="font-mono break-all">https://via-crm-api-backend.up.railway.app/webhooks/whatsapp</p>
            </div>
          </>
        )}

        {/* Step 3: Plano */}
        {step === 3 && (
          <>
            <h2 className="font-semibold text-gray-700">Plano</h2>
            <div className="grid grid-cols-2 gap-4 mt-2">
              {[
                { value: "STARTER", label: "Starter", desc: "Leads, funil, WhatsApp com agente padrão VIA. Sem Central de Agentes." },
                { value: "PREMIUM", label: "Premium", desc: "Tudo do Starter + Central de Agentes, KBs personalizadas e agentes próprios." },
              ].map((p) => (
                <button key={p.value} onClick={() => set("plan", p.value)}
                  className={`border-2 rounded-xl p-4 text-left transition-all ${form.plan === p.value ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className={`font-semibold text-sm ${p.value === "PREMIUM" ? "text-amber-700" : "text-gray-700"}`}>{p.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 4: Revisão */}
        {step === 4 && (
          <>
            <h2 className="font-semibold text-gray-700">Revisão</h2>
            <div className="space-y-3 text-sm">
              {[
                { section: "Imobiliária", items: [
                  { label: "Nome", value: form.nome },
                  { label: "Slug", value: form.slug },
                  { label: "Endereço", value: [form.logradouro, form.numero].filter(Boolean).join(", ") },
                  { label: "Cidade/Estado", value: [form.cidade, form.estado].filter(Boolean).join(" - ") },
                ]},
                { section: "Proprietário", items: [
                  { label: "Nome", value: form.proprietarioNome },
                  { label: "Telefone", value: form.proprietarioTelefone },
                  { label: "E-mail OWNER", value: form.ownerEmail },
                ]},
                { section: "WhatsApp", items: [
                  { label: "Phone Number ID", value: form.whatsappPhoneNumberId || "Não configurado" },
                ]},
                { section: "Plano", items: [
                  { label: "Plano", value: form.plan },
                ]},
              ].map(({ section, items }) => (
                <div key={section} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{section}</div>
                  <div className="divide-y">
                    {items.map(({ label, value }) => (
                      <div key={label} className="flex px-3 py-2 gap-4">
                        <span className="text-gray-500 w-32 shrink-0">{label}</span>
                        <span className="text-gray-800">{value || <em className="text-gray-300">—</em>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => step === 0 ? router.push("/admin/clientes") : setStep(step - 1)}
          className="text-sm px-4 py-2 border rounded-md hover:bg-gray-50">
          {step === 0 ? "Cancelar" : "Voltar"}
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
            className="text-sm px-6 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
            Próximo
          </button>
        ) : (
          <button onClick={submit} disabled={saving}
            className="text-sm px-6 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
            {saving ? "Criando..." : "Criar cliente"}
          </button>
        )}
      </div>
    </div>
  );
}
