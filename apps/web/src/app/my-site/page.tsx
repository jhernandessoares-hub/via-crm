"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { cloneSiteContent, writeSiteContentToStorage } from "@/lib/site-content";

type SiteType = "LANDING_PAGE" | "INSTITUCIONAL" | "SITE_IMOBILIARIO" | "PORTAL";
type SiteStatus = "DRAFT" | "PUBLISHED";

type TenantSite = {
  id: string;
  name: string;
  slug: string;
  siteType: SiteType;
  status: SiteStatus;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
};

type Template = {
  id: string;
  name: string;
  siteType: SiteType;
  scope: string;
};

const TYPE_LABELS: Record<SiteType, string> = {
  LANDING_PAGE: "Landing Page",
  INSTITUCIONAL: "Institucional",
  SITE_IMOBILIARIO: "Site Imobiliário",
  PORTAL: "Portal",
};

const TYPE_DESCRIPTIONS: Record<SiteType, string> = {
  LANDING_PAGE: "Ideal para captar leads com uma proposta de valor clara e chamadas para ação.",
  INSTITUCIONAL: "Apresente a empresa, equipe, serviços e facilite o contato.",
  SITE_IMOBILIARIO: "Integrado ao seu catálogo de imóveis — busca, filtros e contato direto.",
  PORTAL: "Portal completo com mapa interativo, grade de corretores e busca avançada.",
};

function statusBadge(status: SiteStatus) {
  if (status === "PUBLISHED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function typeBadge(type: SiteType) {
  if (type === "SITE_IMOBILIARIO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "PORTAL") return "bg-violet-50 text-violet-700 border-violet-200";
  if (type === "INSTITUCIONAL") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function MySitePage() {
  const [sites, setSites] = useState<TenantSite[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    siteType: "SITE_IMOBILIARIO" as SiteType,
    templateId: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sitesData, tplData] = await Promise.all([
        apiFetch("/sites"),
        apiFetch("/sites/templates"),
      ]);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setTemplates(Array.isArray(tplData) ? tplData : []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  const availableTemplates = useMemo(
    () => templates.filter((t) => t.siteType === form.siteType),
    [templates, form.siteType]
  );

  const slugifiedName = form.name.trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

  const canCreate = form.name.trim() && form.slug.trim();

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    try {
      let contentJson: any = cloneSiteContent();
      if (form.templateId) {
        // Load template content from API
        try {
          const tplFull = await apiFetch(`/sites/templates`);
          const found = (Array.isArray(tplFull) ? tplFull : []).find((t: any) => t.id === form.templateId);
          if (found?.contentJson) contentJson = found.contentJson;
        } catch {
          // fallback to empty seed
        }
      }

      const site: TenantSite = await apiFetch("/sites", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          siteType: form.siteType,
          templateId: form.templateId || undefined,
          contentJson,
        }),
      });

      // Save to localStorage so editor can load it immediately
      writeSiteContentToStorage(contentJson, site.id);

      setSites((prev) => [site, ...prev]);
      setIsCreateOpen(false);
      setForm({ name: "", slug: "", siteType: "SITE_IMOBILIARIO", templateId: "" });
      window.open(`/?editor=1&site=${site.id}&siteApiId=${site.id}`, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e.message || "Erro ao criar site.");
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(id: string) {
    try {
      await apiFetch(`/sites/${id}/publish`, { method: "POST" });
      setSites((prev) => prev.map((s) => s.id === id ? { ...s, status: "PUBLISHED" } : s));
    } catch (e: any) {
      setError(e.message || "Erro ao publicar.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/sites/${id}`, { method: "DELETE" });
      setSites((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message || "Erro ao excluir.");
    }
  }

  return (
    <AppShell title="Meu Site">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Meu Site</div>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Gerenciador de sites</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Crie e publique sites imobiliários integrados ao seu CRM. Cada site é independente — você edita, publica e controla o domínio.
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="self-start rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Novo site
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-3 underline" onClick={() => setError(null)}>Fechar</button>
          </div>
        )}

        {/* Sites list */}
        {loading ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-sm text-slate-500">Carregando...</div>
        ) : sites.length === 0 ? (
          <div className="rounded-2xl border bg-white p-12 text-center">
            <div className="text-4xl">🌐</div>
            <div className="mt-4 text-sm font-semibold text-slate-950">Você ainda não tem nenhum site</div>
            <p className="mt-2 text-sm text-slate-500">Crie agora um site integrado ao seu catálogo de imóveis.</p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Criar meu primeiro site
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((site) => (
              <div key={site.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{site.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{site.slug}</div>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(site.status)}`}>
                    {site.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                  </span>
                </div>

                <div className="mt-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeBadge(site.siteType)}`}>
                    {TYPE_LABELS[site.siteType]}
                  </span>
                </div>

                {site.customDomain && (
                  <div className="mt-2 text-xs text-slate-500">
                    🌐 {site.customDomain}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/?editor=1&site=${site.id}&siteApiId=${site.id}`}
                    target="_blank"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                  >
                    Editar
                  </Link>
                  <Link
                    href={`/s/${site.slug}`}
                    target="_blank"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
                  >
                    Visualizar
                  </Link>
                  {site.status === "DRAFT" && (
                    <button
                      onClick={() => handlePublish(site.id)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Publicar
                    </button>
                  )}
                  {deleteConfirm === site.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(site.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(site.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600"
                    >
                      Excluir
                    </button>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-slate-400">
                  Atualizado {new Date(site.updatedAt).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar site */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Novo site</div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">Criar site</h2>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {/* Tipo do site */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo de site</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["LANDING_PAGE", "INSTITUCIONAL", "SITE_IMOBILIARIO", "PORTAL"] as SiteType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setField("siteType", type); setField("templateId", ""); }}
                      className={`rounded-xl border p-3 text-left transition ${form.siteType === type ? "border-slate-950 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
                    >
                      <div className="text-sm font-semibold text-slate-950">{TYPE_LABELS[type]}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{TYPE_DESCRIPTIONS[type]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Nome do site</div>
                <input
                  value={form.name}
                  onChange={(e) => {
                    setField("name", e.target.value);
                    if (!form.slug) {
                      setField("slug", e.target.value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-"));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                  placeholder="Ex.: Imobiliária Solaris"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Slug do site (URL)</div>
                <div className="flex items-center rounded-xl border border-slate-200 focus-within:border-slate-950">
                  <span className="pl-3 text-xs text-slate-400">/s/</span>
                  <input
                    value={form.slug}
                    onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    className="flex-1 px-1 py-2 text-sm outline-none bg-transparent"
                    placeholder={slugifiedName || "minha-imobiliaria"}
                  />
                </div>
              </label>

              {availableTemplates.length > 0 && (
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Usar template (opcional)</div>
                  <select
                    value={form.templateId}
                    onChange={(e) => setField("templateId", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                  >
                    <option value="">Começar do zero (estrutura padrão)</option>
                    {availableTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {creating ? "Criando..." : "Criar e editar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
