"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SiteBlockType,
  SiteContent,
  cloneSiteContent,
  writeSiteContentToStorage,
} from "@/lib/site-content";
import { adminFetch } from "@/lib/admin-api";

type SiteType = "Landing Page" | "Institucional" | "Site Imobiliario" | "Portal";
type SiteStatus = "DRAFT" | "PUBLISHED";
type SiteScope = "PADRAO" | "EXCLUSIVO";

type ApiTemplate = {
  id: string;
  name: string;
  siteType: string;
  scope: SiteScope;
  tenantId: string | null;
  status: SiteStatus;
  createdAt: string;
  updatedAt: string;
};

type NewSiteForm = {
  name: string;
  type: SiteType;
  scope: SiteScope;
  tenantName: string;
};

type SeedBlockInfo = {
  type: SiteBlockType;
  label: string;
  description: string;
};

// ─── Seed por tipo ────────────────────────────────────────────────────────────

function buildSeedLandingPage(name: string): SiteContent {
  const base = cloneSiteContent();
  const heroId = "sec-hero";
  const beneficiosId = "sec-beneficios";
  const planosId = "sec-planos";
  const ctaId = "sec-cta";
  const footerId = "sec-footer";

  base.hero.titleLine1 = name;
  base.hero.titleLine2 = "Conheça nossa solução";
  base.hero.description = "Apresente o valor do seu produto de forma clara e direta.";
  base.hero.primaryCta = "Agendar demonstração";
  base.hero.secondaryCta = "Ver planos";

  base.dynamicSections = [
    { id: heroId, name: "Hero", kind: "hero" },
    { id: beneficiosId, name: "Benefícios", kind: "content" },
    { id: planosId, name: "Planos", kind: "content", bgColor: "#0f172a" },
    { id: ctaId, name: "CTA Final", kind: "cta" },
    { id: footerId, name: "Rodapé", kind: "footer" },
  ];

  base.dynamicBlocks = [
    { id: `${heroId}-title`, sectionId: heroId, type: "title", text: name },
    { id: `${heroId}-text`, sectionId: heroId, type: "text", text: "Subtítulo da sua proposta de valor." },
    { id: `${heroId}-btn`, sectionId: heroId, type: "button", text: "Agendar demonstração" },
    { id: `${heroId}-img`, sectionId: heroId, type: "image", src: null, alt: "Imagem principal" },
    { id: `${beneficiosId}-title`, sectionId: beneficiosId, type: "title", text: "Por que escolher?" },
    { id: `${beneficiosId}-card1`, sectionId: beneficiosId, type: "card", text: "Benefício 1 — descreva aqui o diferencial." },
    { id: `${beneficiosId}-card2`, sectionId: beneficiosId, type: "card", text: "Benefício 2 — descreva aqui o diferencial." },
    { id: `${beneficiosId}-card3`, sectionId: beneficiosId, type: "card", text: "Benefício 3 — descreva aqui o diferencial." },
    { id: `${planosId}-title`, sectionId: planosId, type: "title", text: "Planos e preços" },
    { id: `${planosId}-card1`, sectionId: planosId, type: "card", text: "Plano Starter — R$ 297/mês\nDescreva o que está incluso." },
    { id: `${planosId}-card2`, sectionId: planosId, type: "card", text: "Plano Pro — R$ 697/mês\nDescreva o que está incluso." },
    { id: `${planosId}-card3`, sectionId: planosId, type: "card", text: "Plano Enterprise — Sob consulta\nDescreva o que está incluso." },
    { id: `${ctaId}-title`, sectionId: ctaId, type: "title", text: "Pronto para começar?" },
    { id: `${ctaId}-text`, sectionId: ctaId, type: "text", text: "Entre em contato e saiba como podemos ajudar." },
    { id: `${ctaId}-form`, sectionId: ctaId, type: "contact-form", text: "Formulário de contato" },
    { id: `${footerId}-text`, sectionId: footerId, type: "text", text: `© ${new Date().getFullYear()} ${name}. Todos os direitos reservados.` },
  ];

  return base;
}

function buildSeedInstitucional(name: string): SiteContent {
  const base = cloneSiteContent();
  const heroId = "sec-hero";
  const sobreId = "sec-sobre";
  const servicosId = "sec-servicos";
  const equipeId = "sec-equipe";
  const contatoId = "sec-contato";
  const footerId = "sec-footer";

  base.hero.titleLine1 = name;
  base.hero.titleLine2 = "Sua parceira imobiliária de confiança";
  base.hero.description = "Anos de experiência no mercado, dedicados a encontrar o imóvel ideal para você.";
  base.hero.primaryCta = "Fale conosco";
  base.hero.secondaryCta = "Conheça nossa equipe";

  base.dynamicSections = [
    { id: heroId, name: "Hero", kind: "hero" },
    { id: sobreId, name: "Sobre nós", kind: "content" },
    { id: servicosId, name: "Serviços", kind: "content" },
    { id: equipeId, name: "Nossa equipe", kind: "team" },
    { id: contatoId, name: "Contato", kind: "contact" },
    { id: footerId, name: "Rodapé", kind: "footer" },
  ];

  base.dynamicBlocks = [
    { id: `${heroId}-title`, sectionId: heroId, type: "title", text: name },
    { id: `${heroId}-text`, sectionId: heroId, type: "text", text: "Sua parceira imobiliária de confiança." },
    { id: `${heroId}-btn`, sectionId: heroId, type: "button", text: "Fale conosco" },
    { id: `${heroId}-img`, sectionId: heroId, type: "image", src: null, alt: "Fachada da imobiliária" },
    { id: `${sobreId}-title`, sectionId: sobreId, type: "title", text: "Quem somos" },
    { id: `${sobreId}-text`, sectionId: sobreId, type: "text", text: "Conte a história da empresa, missão, visão e valores." },
    { id: `${sobreId}-img`, sectionId: sobreId, type: "image", src: null, alt: "Equipe" },
    { id: `${sobreId}-list`, sectionId: sobreId, type: "list", text: "Diferenciais", items: ["Anos de experiência", "Equipe especializada", "Atendimento personalizado"] },
    { id: `${servicosId}-title`, sectionId: servicosId, type: "title", text: "Nossos serviços" },
    { id: `${servicosId}-card1`, sectionId: servicosId, type: "card", text: "Compra e venda de imóveis — Encontramos o imóvel certo para você." },
    { id: `${servicosId}-card2`, sectionId: servicosId, type: "card", text: "Locação — Imóveis residenciais e comerciais para alugar." },
    { id: `${servicosId}-card3`, sectionId: servicosId, type: "card", text: "Avaliação — Saiba o valor real do seu imóvel." },
    { id: `${equipeId}-title`, sectionId: equipeId, type: "title", text: "Conheça nossa equipe" },
    { id: `${equipeId}-team1`, sectionId: equipeId, type: "team-card", text: "Corretor 1\nCRECI 000000\n(00) 00000-0000", src: null, alt: "Foto do corretor" },
    { id: `${equipeId}-team2`, sectionId: equipeId, type: "team-card", text: "Corretor 2\nCRECI 000000\n(00) 00000-0000", src: null, alt: "Foto do corretor" },
    { id: `${equipeId}-team3`, sectionId: equipeId, type: "team-card", text: "Corretor 3\nCRECI 000000\n(00) 00000-0000", src: null, alt: "Foto do corretor" },
    { id: `${contatoId}-title`, sectionId: contatoId, type: "title", text: "Entre em contato" },
    { id: `${contatoId}-whatsapp`, sectionId: contatoId, type: "whatsapp-button", text: "Falar no WhatsApp", phone: "" },
    { id: `${contatoId}-form`, sectionId: contatoId, type: "contact-form", text: "Formulário de contato" },
    { id: `${footerId}-text`, sectionId: footerId, type: "text", text: `© ${new Date().getFullYear()} ${name}. Todos os direitos reservados.` },
  ];

  return base;
}

function buildSeedSiteImobiliario(name: string): SiteContent {
  const base = cloneSiteContent();
  const heroId = "sec-hero";
  const destaquesId = "sec-destaques";
  const categoriasId = "sec-categorias";
  const sobreId = "sec-sobre";
  const contatoId = "sec-contato";
  const footerId = "sec-footer";

  base.hero.titleLine1 = "Encontre seu";
  base.hero.titleLine2 = "imóvel ideal";
  base.hero.description = `${name} — imóveis residenciais e comerciais para compra e locação.`;
  base.hero.primaryCta = "Buscar imóveis";
  base.hero.secondaryCta = "Falar com corretor";

  base.dynamicSections = [
    { id: heroId, name: "Hero com busca", kind: "hero" },
    { id: destaquesId, name: "Imóveis em destaque", kind: "properties" },
    { id: categoriasId, name: "Categorias", kind: "content" },
    { id: sobreId, name: "Sobre a imobiliária", kind: "content" },
    { id: contatoId, name: "Contato", kind: "contact" },
    { id: footerId, name: "Rodapé", kind: "footer" },
  ];

  base.dynamicBlocks = [
    { id: `${heroId}-title`, sectionId: heroId, type: "title", text: "Encontre seu imóvel ideal" },
    { id: `${heroId}-search`, sectionId: heroId, type: "property-search", text: "Busca de imóveis" },
    { id: `${heroId}-whatsapp`, sectionId: heroId, type: "whatsapp-button", text: "Falar com corretor", phone: "" },
    { id: `${destaquesId}-title`, sectionId: destaquesId, type: "title", text: "Imóveis em destaque" },
    { id: `${destaquesId}-grid`, sectionId: destaquesId, type: "property-grid", text: "Grid de imóveis" },
    { id: `${categoriasId}-title`, sectionId: categoriasId, type: "title", text: "Busque por categoria" },
    { id: `${categoriasId}-card1`, sectionId: categoriasId, type: "card", text: "Apartamentos" },
    { id: `${categoriasId}-card2`, sectionId: categoriasId, type: "card", text: "Casas" },
    { id: `${categoriasId}-card3`, sectionId: categoriasId, type: "card", text: "Comercial" },
    { id: `${categoriasId}-card4`, sectionId: categoriasId, type: "card", text: "Lançamentos" },
    { id: `${sobreId}-title`, sectionId: sobreId, type: "title", text: `Sobre a ${name}` },
    { id: `${sobreId}-text`, sectionId: sobreId, type: "text", text: "Conte a história e os diferenciais da imobiliária." },
    { id: `${sobreId}-img`, sectionId: sobreId, type: "image", src: null, alt: "Imobiliária" },
    { id: `${contatoId}-title`, sectionId: contatoId, type: "title", text: "Não encontrou o que procurava?" },
    { id: `${contatoId}-text`, sectionId: contatoId, type: "text", text: "Nossos corretores encontram o imóvel certo para você." },
    { id: `${contatoId}-whatsapp`, sectionId: contatoId, type: "whatsapp-button", text: "Falar no WhatsApp", phone: "" },
    { id: `${contatoId}-form`, sectionId: contatoId, type: "contact-form", text: "Formulário de contato" },
    { id: `${footerId}-text`, sectionId: footerId, type: "text", text: `© ${new Date().getFullYear()} ${name}. Todos os direitos reservados.` },
  ];

  return base;
}

function buildSeedPortal(name: string): SiteContent {
  const base = cloneSiteContent();
  const heroId = "sec-hero";
  const destaquesId = "sec-destaques";
  const mapaId = "sec-mapa";
  const categoriasId = "sec-categorias";
  const corretoresId = "sec-corretores";
  const footerId = "sec-footer";

  base.hero.titleLine1 = "O maior portal";
  base.hero.titleLine2 = "de imóveis da região";
  base.hero.description = `${name} — busque entre milhares de imóveis de diversas imobiliárias e corretores.`;
  base.hero.primaryCta = "Buscar imóveis";
  base.hero.secondaryCta = "Anunciar imóvel";

  base.dynamicSections = [
    { id: heroId, name: "Hero com busca avançada", kind: "hero" },
    { id: destaquesId, name: "Imóveis em destaque", kind: "properties" },
    { id: mapaId, name: "Mapa de imóveis", kind: "properties" },
    { id: categoriasId, name: "Categorias", kind: "content" },
    { id: corretoresId, name: "Corretores e imobiliárias", kind: "team" },
    { id: footerId, name: "Rodapé", kind: "footer" },
  ];

  base.dynamicBlocks = [
    { id: `${heroId}-title`, sectionId: heroId, type: "title", text: "Encontre o imóvel perfeito" },
    { id: `${heroId}-search`, sectionId: heroId, type: "property-search", text: "Busca avançada de imóveis" },
    { id: `${destaquesId}-title`, sectionId: destaquesId, type: "title", text: "Destaques" },
    { id: `${destaquesId}-grid`, sectionId: destaquesId, type: "property-grid", text: "Grid de imóveis" },
    { id: `${mapaId}-title`, sectionId: mapaId, type: "title", text: "Imóveis no mapa" },
    { id: `${mapaId}-map`, sectionId: mapaId, type: "property-map", text: "Mapa interativo de imóveis" },
    { id: `${categoriasId}-title`, sectionId: categoriasId, type: "title", text: "Busque por categoria" },
    { id: `${categoriasId}-card1`, sectionId: categoriasId, type: "card", text: "Apartamentos" },
    { id: `${categoriasId}-card2`, sectionId: categoriasId, type: "card", text: "Casas" },
    { id: `${categoriasId}-card3`, sectionId: categoriasId, type: "card", text: "Comercial" },
    { id: `${categoriasId}-card4`, sectionId: categoriasId, type: "card", text: "Terrenos" },
    { id: `${categoriasId}-card5`, sectionId: categoriasId, type: "card", text: "Lançamentos" },
    { id: `${categoriasId}-card6`, sectionId: categoriasId, type: "card", text: "Rural" },
    { id: `${corretoresId}-title`, sectionId: corretoresId, type: "title", text: "Corretores e imobiliárias parceiras" },
    { id: `${corretoresId}-grid`, sectionId: corretoresId, type: "broker-grid", text: "Grid de corretores" },
    { id: `${footerId}-text`, sectionId: footerId, type: "text", text: `© ${new Date().getFullYear()} ${name}. Todos os direitos reservados.` },
  ];

  return base;
}

function buildSeedContent(form: NewSiteForm): SiteContent {
  const name = form.name.trim() || "Meu Site";
  if (form.type === "Institucional") return buildSeedInstitucional(name);
  if (form.type === "Site Imobiliario") return buildSeedSiteImobiliario(name);
  if (form.type === "Portal") return buildSeedPortal(name);
  return buildSeedLandingPage(name);
}

// ─── Helpers de seed por tipo para preview ───────────────────────────────────

const SEED_PREVIEW: Record<SiteType, { sections: string[]; blocks: SeedBlockInfo[] }> = {
  "Landing Page": {
    sections: ["Hero", "Benefícios", "Planos", "CTA Final", "Rodapé"],
    blocks: [
      { type: "title", label: "Título", description: "Headline principal" },
      { type: "text", label: "Texto", description: "Subtítulo e descrição" },
      { type: "button", label: "Botão CTA", description: "Chamada para ação" },
      { type: "image", label: "Imagem", description: "Visual de destaque" },
      { type: "card", label: "Cards de benefício", description: "3 benefícios + 3 planos" },
      { type: "contact-form", label: "Formulário", description: "Captação de lead" },
    ],
  },
  "Institucional": {
    sections: ["Hero", "Sobre nós", "Serviços", "Equipe", "Contato", "Rodapé"],
    blocks: [
      { type: "title", label: "Título", description: "Nome e slogan" },
      { type: "image", label: "Imagem", description: "Fachada / equipe" },
      { type: "team-card", label: "Cartão de corretor", description: "Foto, nome, CRECI" },
      { type: "card", label: "Cards de serviço", description: "Compra, venda, locação, avaliação" },
      { type: "whatsapp-button", label: "Botão WhatsApp", description: "Contato direto" },
      { type: "contact-form", label: "Formulário", description: "Captação de lead" },
    ],
  },
  "Site Imobiliario": {
    sections: ["Hero + busca", "Destaques", "Categorias", "Sobre", "Contato", "Rodapé"],
    blocks: [
      { type: "property-search", label: "Busca de imóveis", description: "Campo de busca integrado ao CRM" },
      { type: "property-grid", label: "Grid de imóveis", description: "Cards com foto, preço e tipo (CRM)" },
      { type: "card", label: "Categorias", description: "Apartamentos, casas, comercial, lançamentos" },
      { type: "team-card", label: "Cartão de corretor", description: "Foto, nome, CRECI" },
      { type: "whatsapp-button", label: "Botão WhatsApp", description: "Contato direto" },
      { type: "contact-form", label: "Formulário", description: "Captação de lead" },
    ],
  },
  "Portal": {
    sections: ["Hero + busca avançada", "Destaques", "Mapa", "Categorias", "Corretores", "Rodapé"],
    blocks: [
      { type: "property-search", label: "Busca avançada", description: "Filtros por tipo, cidade, preço, quartos" },
      { type: "property-grid", label: "Grid de imóveis", description: "Cards com paginação (CRM)" },
      { type: "property-map", label: "Mapa interativo", description: "Pins de imóveis por localização" },
      { type: "broker-grid", label: "Grid de corretores", description: "Parceiros e imobiliárias" },
      { type: "card", label: "Categorias", description: "6 categorias de imóvel" },
      { type: "contact-form", label: "Formulário", description: "Captação de lead" },
    ],
  },
};

// ─── Badges ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  LANDING_PAGE: "Landing Page",
  INSTITUCIONAL: "Institucional",
  SITE_IMOBILIARIO: "Site Imobiliário",
  PORTAL: "Portal",
};

function statusBadge(status: SiteStatus) {
  if (status === "PUBLISHED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function scopeBadge(scope: SiteScope) {
  return scope === "PADRAO"
    ? "bg-sky-50 text-sky-700 border-sky-200"
    : "bg-violet-50 text-violet-700 border-violet-200";
}

function typeBadgeByLocal(type: SiteType) {
  if (type === "Site Imobiliario") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "Portal") return "bg-violet-50 text-violet-700 border-violet-200";
  if (type === "Institucional") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function typeBadgeByApi(siteType: string) {
  if (siteType === "SITE_IMOBILIARIO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (siteType === "PORTAL") return "bg-violet-50 text-violet-700 border-violet-200";
  if (siteType === "INSTITUCIONAL") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

const SITE_TYPE_TO_API: Record<SiteType, string> = {
  "Landing Page": "LANDING_PAGE",
  "Institucional": "INSTITUCIONAL",
  "Site Imobiliario": "SITE_IMOBILIARIO",
  "Portal": "PORTAL",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSitePage() {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewSiteForm>({
    name: "",
    type: "Landing Page",
    scope: "PADRAO",
    tenantName: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch("/admin/sites/templates");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }

  const canCreate = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.scope === "EXCLUSIVO" && !form.tenantName.trim()) return false;
    return true;
  }, [form]);

  function setField<Key extends keyof NewSiteForm>(key: Key, value: NewSiteForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ name: "", type: "Landing Page", scope: "PADRAO", tenantName: "" });
  }

  async function handleCreateSite() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const seed = buildSeedContent(form);
      const tpl = await adminFetch("/admin/sites/templates", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          siteType: SITE_TYPE_TO_API[form.type],
          scope: form.scope,
          contentJson: seed,
          status: "DRAFT",
        }),
      });

      // Save seed to localStorage so the editor can load it immediately
      writeSiteContentToStorage(seed, tpl.id);
      setTemplates((current) => [tpl, ...current]);
      setIsCreateOpen(false);
      resetForm();
      window.open(`/?editor=1&site=${tpl.id}&templateId=${tpl.id}`, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e.message || "Erro ao criar template.");
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(id: string) {
    try {
      await adminFetch(`/admin/sites/templates/${id}/publish`, { method: "POST" });
      setTemplates((current) => current.map((t) => t.id === id ? { ...t, status: "PUBLISHED" } : t));
    } catch (e: any) {
      setError(e.message || "Erro ao publicar.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await adminFetch(`/admin/sites/templates/${id}`, { method: "DELETE" });
      setTemplates((current) => current.filter((t) => t.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message || "Erro ao excluir.");
    }
  }

  const preview = SEED_PREVIEW[form.type];
  const total = templates.length;
  const totalPadrao = templates.filter((t) => t.scope === "PADRAO").length;
  const totalExclusivo = templates.filter((t) => t.scope === "EXCLUSIVO").length;
  const totalPublished = templates.filter((t) => t.status === "PUBLISHED").length;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Gerenciador de Sites</div>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Templates e distribuição para tenants</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Crie templates de site para disponibilizar aos tenants. Cada tipo vem com estrutura própria — o tenant faz um fork e edita livremente.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Novo template
            </button>
            <Link
              href="/?editor=1"
              target="_blank"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            >
              Abrir editor visual
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-3 underline" onClick={() => setError(null)}>Fechar</button>
          </div>
        )}

        {/* Métricas */}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total de templates", value: total },
            { label: "Padrão", value: totalPadrao },
            { label: "Exclusivos", value: totalExclusivo },
            { label: "Publicados", value: totalPublished },
          ].map((m) => (
            <section key={m.label} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">{m.label}</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{m.value}</div>
            </section>
          ))}
        </div>

        {/* Tabela */}
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-5">
            <div className="text-sm font-semibold text-slate-950">Base de templates</div>
            <div className="mt-1 text-sm text-slate-600">Templates disponíveis na plataforma para os tenants usarem.</div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</div>
            ) : templates.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                Nenhum template criado ainda.{" "}
                <button className="underline" onClick={() => setIsCreateOpen(true)}>Criar o primeiro</button>
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Template</th>
                    <th className="px-6 py-3 font-medium">Tipo</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Escopo</th>
                    <th className="px-6 py-3 font-medium">Atualizado</th>
                    <th className="px-6 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tpl) => (
                    <tr key={tpl.id} className="border-t">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-950">{tpl.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{tpl.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${typeBadgeByApi(tpl.siteType)}`}>
                          {TYPE_LABELS[tpl.siteType] ?? tpl.siteType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(tpl.status)}`}>
                          {tpl.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${scopeBadge(tpl.scope)}`}>
                          {tpl.scope === "PADRAO" ? "Padrão" : "Exclusivo"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(tpl.updatedAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/?editor=1&site=${tpl.id}&templateId=${tpl.id}`}
                            target="_blank"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                          >
                            Editar
                          </Link>
                          {tpl.status === "DRAFT" && (
                            <button
                              onClick={() => handlePublish(tpl.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Publicar
                            </button>
                          )}
                          {deleteConfirm === tpl.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(tpl.id)}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                              >
                                Confirmar
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
                              onClick={() => setDeleteConfirm(tpl.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Modal criar template */}
      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6">
          <div className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Novo template</div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Cadastro inicial do template</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Cada tipo gera uma estrutura de seções e blocos específica. O editor abre logo após a criação.
                </p>
              </div>
              <button
                onClick={() => { setIsCreateOpen(false); resetForm(); }}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Nome do template</div>
                <input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                  placeholder="Ex.: Imobiliária Solaris"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Tipo do site</div>
                <select
                  value={form.type}
                  onChange={(e) => setField("type", e.target.value as SiteType)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                >
                  <option value="Landing Page">Landing Page</option>
                  <option value="Institucional">Institucional</option>
                  <option value="Site Imobiliario">Site Imobiliário</option>
                  <option value="Portal">Portal</option>
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Escopo</div>
                <select
                  value={form.scope}
                  onChange={(e) => setField("scope", e.target.value as SiteScope)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                >
                  <option value="PADRAO">Padrão — disponível para todos</option>
                  <option value="EXCLUSIVO">Exclusivo de tenant</option>
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Tenant</div>
                <input
                  value={form.tenantName}
                  onChange={(e) => setField("tenantName", e.target.value)}
                  disabled={form.scope !== "EXCLUSIVO"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:bg-slate-50"
                  placeholder={form.scope === "EXCLUSIVO" ? "Nome do tenant" : "Não aplicável"}
                />
              </label>
            </div>

            {/* Preview da estrutura do tipo selecionado */}
            <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
              <div className="text-sm font-semibold text-slate-950">
                Estrutura gerada para{" "}
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${typeBadgeByLocal(form.type)}`}>
                  {form.type}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seções</div>
                  <div className="mt-3 space-y-1">
                    {preview.sections.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blocos incluídos</div>
                  <div className="mt-3 space-y-2">
                    {preview.blocks.map((b) => (
                      <div key={b.type} className="text-sm">
                        <span className="font-medium text-slate-950">{b.label}</span>
                        <span className="text-slate-500"> — {b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setIsCreateOpen(false); resetForm(); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSite}
                disabled={!canCreate || creating}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {creating ? "Criando..." : "Criar e abrir editor"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
