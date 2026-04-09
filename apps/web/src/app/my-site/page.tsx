"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { writeSiteContentToStorage } from "@/lib/site-content";

type SiteType = "LANDING_PAGE" | "INSTITUCIONAL" | "SITE_IMOBILIARIO" | "PORTAL";
type SiteStatus = "DRAFT" | "PUBLISHED" | "INATIVO";

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
  contentJson: any;
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

const TYPE_ICONS: Record<SiteType, string> = {
  LANDING_PAGE: "🚀",
  INSTITUCIONAL: "🏢",
  SITE_IMOBILIARIO: "🏠",
  PORTAL: "🌐",
};

function typeBadge(type: SiteType) {
  if (type === "SITE_IMOBILIARIO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "PORTAL") return "bg-violet-50 text-violet-700 border-violet-200";
  if (type === "INSTITUCIONAL") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function MySitePage() {
  const [activeSite, setActiveSite] = useState<TenantSite | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [unpublishConfirm, setUnpublishConfirm] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [openingEditor, setOpeningEditor] = useState(false);

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
      const sites: TenantSite[] = Array.isArray(sitesData) ? sitesData : [];
      const active = sites.find((s) => s.status !== "INATIVO") ?? null;
      setActiveSite(active);
      setCustomDomain(active?.customDomain ?? "");
      setTemplates(Array.isArray(tplData) ? tplData : []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUseTemplate(tpl: Template) {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const slug = tpl.name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        + "-" + Math.random().toString(36).slice(2, 6);

      const contentJson = tpl.contentJson;

      const site: TenantSite = await apiFetch("/sites", {
        method: "POST",
        body: JSON.stringify({
          name: tpl.name,
          slug,
          siteType: tpl.siteType,
          templateId: tpl.id,
          contentJson,
        }),
      });

      writeSiteContentToStorage(contentJson, site.id);
      setActiveSite(site);
      setCustomDomain("");
    } catch (e: any) {
      setError(e.message || "Erro ao criar site.");
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenEditor() {
    if (!activeSite || openingEditor) return;
    setOpeningEditor(true);
    try {
      const site = await apiFetch(`/sites/${activeSite.id}`);
      if (site?.contentJson) {
        writeSiteContentToStorage(site.contentJson, activeSite.id);
      }
    } catch {
      // fallback — abre mesmo sem sincronizar
    } finally {
      setOpeningEditor(false);
      window.open(`/?editor=1&site=${activeSite.id}&siteApiId=${activeSite.id}`, "_blank", "noopener,noreferrer");
    }
  }

  async function handlePublish() {
    if (!activeSite || publishing) return;
    setPublishing(true);
    try {
      await apiFetch(`/sites/${activeSite.id}/publish`, { method: "POST" });
      setActiveSite((s) => s ? { ...s, status: "PUBLISHED" } : s);
    } catch (e: any) {
      setError(e.message || "Erro ao publicar.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!activeSite) return;
    try {
      await apiFetch(`/sites/${activeSite.id}/unpublish`, { method: "POST" });
      setActiveSite((s) => s ? { ...s, status: "DRAFT" } : s);
      setUnpublishConfirm(false);
    } catch (e: any) {
      setError(e.message || "Erro ao tirar do ar.");
    }
  }

  async function handleSaveDomain() {
    if (!activeSite) return;
    setSavingDomain(true);
    try {
      await apiFetch(`/sites/${activeSite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ customDomain: customDomain.trim() || null }),
      });
      setActiveSite((s) => s ? { ...s, customDomain: customDomain.trim() || null } : s);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar domínio.");
    } finally {
      setSavingDomain(false);
    }
  }

  async function handleDeactivate() {
    if (!activeSite) return;
    try {
      await apiFetch(`/sites/${activeSite.id}/deactivate`, { method: "POST" });
      setActiveSite(null);
      setDeactivateConfirm(false);
      setShowConfig(false);
      await load();
    } catch (e: any) {
      setError(e.message || "Erro ao desativar.");
    }
  }

  if (loading) {
    return (
      <AppShell title="Meu Site">
        <div className="rounded-2xl border bg-white p-12 text-center text-sm text-slate-500">Carregando...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meu Site">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Meu Site</div>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Gerenciador de sites</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Crie e publique seu site imobiliário integrado ao CRM.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-3 underline" onClick={() => setError(null)}>Fechar</button>
          </div>
        )}

        {/* ── Estado 2: Site ativo ─────────────────────────────────────────── */}
        {activeSite ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{activeSite.name}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {activeSite.customDomain ? `🌐 ${activeSite.customDomain}` : `/s/${activeSite.slug}`}
                </div>
              </div>
              {activeSite.status === "PUBLISHED" ? (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  No ar
                </span>
              ) : (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Rascunho
                </span>
              )}
            </div>

            <div className="mt-3">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeBadge(activeSite.siteType)}`}>
                {TYPE_LABELS[activeSite.siteType]}
              </span>
            </div>

            {/* Ações principais — apenas Editar e Configurações */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleOpenEditor}
                disabled={openingEditor}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {openingEditor ? "Abrindo..." : "Editar site"}
              </button>

              <button
                onClick={() => { setShowConfig(!showConfig); setDeactivateConfirm(false); setUnpublishConfirm(false); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
              >
                Configurações
              </button>
            </div>

            {/* Painel de configurações */}
            {showConfig && (
              <div className="mt-6 rounded-2xl border bg-slate-50 p-5 space-y-5">

                {/* Domínio personalizado */}
                <div>
                  <div className="text-sm font-semibold text-slate-950">Domínio personalizado</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure o apontamento CNAME no seu provedor de domínio antes de salvar.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="meusite.com.br"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
                    />
                    <button
                      onClick={handleSaveDomain}
                      disabled={savingDomain}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingDomain ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>

                {/* Visualizar */}
                {activeSite.status === "PUBLISHED" && (
                  <div className="border-t pt-4">
                    <div className="text-sm font-semibold text-slate-950">Visualizar site</div>
                    <p className="mt-1 text-xs text-slate-500">Veja como seu site está aparecendo para os visitantes.</p>
                    <a
                      href={activeSite.customDomain ? `https://${activeSite.customDomain}` : `/s/${activeSite.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-950"
                    >
                      Abrir site
                    </a>
                  </div>
                )}

                {/* Publicar — só aparece se for rascunho e tiver domínio configurado */}
                {activeSite.status === "DRAFT" && (
                  <div className="border-t pt-4">
                    <div className="text-sm font-semibold text-slate-950">Publicar site</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Configure o domínio acima antes de publicar. Ao publicar, o site ficará acessível ao público.
                    </p>
                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {publishing ? "Publicando..." : "Publicar agora"}
                    </button>
                  </div>
                )}

                {/* Tirar do ar — só se publicado */}
                {activeSite.status === "PUBLISHED" && (
                  <div className="border-t pt-4">
                    <div className="text-sm font-semibold text-slate-950">Tirar do ar</div>
                    <p className="mt-1 text-xs text-slate-500">
                      O site volta para rascunho e sai do ar. Você pode republicar a qualquer momento.
                    </p>
                    <div className="mt-3">
                      {unpublishConfirm ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-amber-700">O site ficará inacessível para visitantes.</p>
                          <div className="flex gap-2">
                            <button onClick={handleUnpublish} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                              Confirmar
                            </button>
                            <button onClick={() => setUnpublishConfirm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setUnpublishConfirm(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-amber-600 transition hover:border-amber-200 hover:bg-amber-50">
                          Tirar do ar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Desativar site */}
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold text-slate-950">Desativar site</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Remove este site e libera para você escolher outro template. O conteúdo não é apagado permanentemente.
                  </p>
                  <div className="mt-3">
                    {deactivateConfirm ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-red-600">Confirma? O site sairá do ar imediatamente.</p>
                        <div className="flex gap-2">
                          <button onClick={handleDeactivate} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
                            Sim, desativar
                          </button>
                          <button onClick={() => setDeactivateConfirm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setDeactivateConfirm(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-red-500 transition hover:border-red-200 hover:bg-red-50">
                        Desativar site
                      </button>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        ) : (
          /* ── Estado 1: Sem site ativo ──────────────────────────────────── */
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-8 text-center">
              <div className="text-4xl">🌐</div>
              <div className="mt-3 text-lg font-semibold text-slate-950">Você ainda não tem um site ativo</div>
              <p className="mt-2 text-sm text-slate-500">
                Escolha um dos templates abaixo para começar. Você poderá personalizar tudo no editor.
              </p>
            </div>

            {templates.length === 0 ? (
              <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
                Nenhum template disponível no momento. Fale com seu administrador.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="rounded-2xl border bg-white p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{TYPE_ICONS[tpl.siteType]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-950">{tpl.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{TYPE_DESCRIPTIONS[tpl.siteType]}</div>
                      </div>
                      {tpl.scope === "EXCLUSIVO" && (
                        <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                          ★ Exclusivo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeBadge(tpl.siteType)}`}>
                        {TYPE_LABELS[tpl.siteType]}
                      </span>
                      <button
                        onClick={() => handleUseTemplate(tpl)}
                        disabled={creating}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {creating ? "Criando..." : "Usar este template"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
