export const SITE_CONTENT_STORAGE_KEY = "via.site.content.v1";
export const DEFAULT_SITE_ID = "default-homepage";
export const SITE_CONTENT_STORAGE_PREFIX = "via.site.content.site.";

export type SiteMetric = {
  value: string;
  label: string;
};

export type SiteFeature = {
  title: string;
  description: string;
};

export type SitePlan = {
  name: string;
  price: string;
  description: string;
  items: string[];
  featured?: boolean;
};

export type SiteImage = {
  src: string | null;
  alt: string;
  fit: "cover" | "contain";
  positionY: number;
  scale: number;
};

export type SiteLogo = {
  src: string | null;
  alt: string;
  height: number;
};

export type EditorElementStyle = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "mono" | "display";
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  color?: string;
  bgColor?: string;
  clickable?: boolean;
  href?: string;
};

export type SiteCustomField = {
  id: string;
  text: string;
  variant: "text" | "title" | "button";
  section: "hero" | "problem" | "solution" | "plans" | "finalCta";
};

export type SiteSectionKind =
  | "header"
  | "content"
  | "hero"
  | "cta"
  | "footer"
  | "properties"
  | "team"
  | "contact"
  | "other";

export type SiteBlockType =
  | "text"
  | "title"
  | "button"
  | "image"
  | "card"
  | "list"
  | "icon"
  | "video"
  | "form"
  | "divider"
  | "property-search"
  | "property-grid"
  | "property-card"
  | "property-map"
  | "broker-grid"
  | "whatsapp-button"
  | "team-card"
  | "contact-form";

export type SiteSection = {
  id: string;
  name: string;
  kind: SiteSectionKind;
  bgColor?: string;
};

export type SiteBlock = {
  id: string;
  sectionId: string;
  type: SiteBlockType;
  text?: string;
  items?: string[];
  src?: string | null;
  alt?: string;
  embedUrl?: string;
  phone?: string;
};

export type SiteTheme = {
  pageBg?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: "sans" | "serif" | "mono";
};

export type SiteContent = {
  theme?: SiteTheme;
  branding: {
    headerLogo: SiteLogo;
    panelLogo: SiteLogo;
  };
  editorStyles: Record<string, EditorElementStyle>;
  customFields: SiteCustomField[];
  dynamicSections: SiteSection[];
  dynamicBlocks: SiteBlock[];
  header: {
    loginLabel: string;
    ctaLabel: string;
  };
  nav: {
    problem: string;
    solution: string;
    plans: string;
  };
  hero: {
    badge: string;
    titleLine1: string;
    titleLine2: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    panelEyebrow: string;
    panelTitle: string;
    panelStatus: string;
    image: SiteImage;
  };
  metrics: SiteMetric[];
  problem: {
    eyebrow: string;
    title: string;
    items: string[];
  };
  solution: {
    eyebrow: string;
    title: string;
    description: string;
  };
  features: SiteFeature[];
  plansSection: {
    eyebrow: string;
    title: string;
    description: string;
  };
  plans: SitePlan[];
  finalCta: {
    eyebrow: string;
    title: string;
    description: string;
    sideText: string;
    buttonLabel: string;
  };
};

export const defaultSiteContent: SiteContent = {
  theme: undefined,
  branding: {
    headerLogo: {
      src: "/logo-via.svg",
      alt: "VIA CRM",
      height: 56,
    },
    panelLogo: {
      src: "/logo-via.svg",
      alt: "VIA CRM",
      height: 48,
    },
  },
  editorStyles: {},
  customFields: [],
  dynamicSections: [],
  dynamicBlocks: [],
  header: {
    loginLabel: "Entrar",
    ctaLabel: "Agendar demonstracao",
  },
  nav: {
    problem: "Problema",
    solution: "Solucao",
    plans: "Planos",
  },
  hero: {
    badge: "Mais controle para atender, organizar e acompanhar",
    titleLine1: "Corretor com cliente,",
    titleLine2: "a VIA no CRM.",
    description:
      "Organize atendimento, rotina dos corretores, agenda e acompanhamento do cliente em um fluxo unico. Menos ruido, mais produtividade e mais clareza para a sua operacao imobiliaria.",
    primaryCta: "Quero ver funcionando",
    secondaryCta: "Ver planos",
    panelEyebrow: "Painel VIA CRM",
    panelTitle: "Atendimento e operacao em sintonia",
    panelStatus: "Online",
    image: {
      src: null,
      alt: "Imagem de destaque da homepage",
      fit: "cover",
      positionY: 50,
      scale: 100,
    },
  },
  metrics: [
    { value: "3x", label: "mais agilidade no atendimento e no retorno ao cliente" },
    { value: "24h", label: "de operacao organizada entre corretor, gestao e agenda" },
    { value: "1", label: "painel unico para corretor, gestor e acompanhamento do cliente" },
  ],
  problem: {
    eyebrow: "O problema",
    title: "Seu time atende pior quando a operacao depende de memoria, mensagens soltas e improviso.",
    items: [
      "O atendimento perde ritmo quando conversas, tarefas e historico do cliente ficam espalhados em varios lugares.",
      "Corretores gastam tempo demais tentando lembrar combinados, proximos passos e retornos pendentes.",
      "A gestao perde visibilidade da operacao e so percebe atrasos quando o cliente ja teve uma experiencia ruim.",
    ],
  },
  solution: {
    eyebrow: "A solucao",
    title: "Um ambiente unico para atender melhor, organizar a operacao e acompanhar cada cliente com clareza.",
    description:
      "O VIA CRM foi desenhado para a rotina imobiliaria. O corretor ganha produtividade, a gestao enxerga o andamento e o cliente recebe uma experiencia mais rapida e organizada.",
  },
  features: [
    {
      title: "Acompanhamento do cliente",
      description:
        "Visualize a jornada de cada atendimento, organize proximos passos e mantenha contexto em toda a relacao.",
    },
    {
      title: "Central de atendimento",
      description:
        "Conecte canais, distribua contatos e mantenha o contexto completo do atendimento em um so lugar.",
    },
    {
      title: "Agenda e secretaria",
      description:
        "Coordene visitas, retornos e tarefas operacionais com menos ruido entre corretor, backoffice e gestao.",
    },
    {
      title: "Produtividade do corretor",
      description:
        "Reduza retrabalho com acesso rapido a clientes, agenda, historico e informacoes importantes da rotina.",
    },
    {
      title: "Operacao mais organizada",
      description:
        "Padronize processos, repasses e acompanhamentos para a equipe operar melhor no dia a dia.",
    },
    {
      title: "Visao gerencial",
      description:
        "Monitore o andamento do time, gargalos de atendimento e pontos criticos da operacao com clareza.",
    },
  ],
  plansSection: {
    eyebrow: "Planos",
    title: "Estrutura de contratacao compativel com o estagio da sua operacao.",
    description:
      "Comece com o essencial, organize a rotina e avance para uma operacao imobiliaria mais fluida.",
  },
  plans: [
    {
      name: "Start",
      price: "R$ 297/mes",
      description: "Para operacoes enxutas que precisam sair do improviso.",
      items: ["Ate 3 usuarios", "Atendimento centralizado", "Agenda basica", "Suporte por e-mail"],
    },
    {
      name: "Performance",
      price: "R$ 697/mes",
      description: "Para imobiliarias em crescimento com foco em organizacao e produtividade.",
      items: ["Ate 10 usuarios", "Canais integrados", "Secretaria e agenda", "Dashboards operacionais"],
      featured: true,
    },
    {
      name: "Scale",
      price: "Sob consulta",
      description: "Para operacoes com multiplas equipes, maior volume e automacoes avancadas.",
      items: ["Usuarios ilimitados", "Configuracao dedicada", "Fluxos avancados", "Onboarding assistido"],
    },
  ],
  finalCta: {
    eyebrow: "CTA final",
    title: "Se a sua operacao imobiliaria cresceu, o atendimento e a organizacao precisam crescer junto.",
    description:
      "Veja como o VIA CRM organiza a rotina, acelera o atendimento e da mais clareza para corretores e gestao.",
    sideText:
      "Demonstracao focada na rotina de imobiliarias, com atendimento mais consistente e operacao mais controlada.",
    buttonLabel: "Solicitar apresentacao",
  },
};

export function cloneSiteContent(): SiteContent {
  return JSON.parse(JSON.stringify(defaultSiteContent)) as SiteContent;
}

export function normalizeSiteContent(input: unknown): SiteContent {
  const base = cloneSiteContent();
  if (!input || typeof input !== "object") return base;

  const data = input as Partial<SiteContent>;
  const legacyLogo =
    data.branding && "logo" in data.branding
      ? (data.branding as { logo?: Partial<SiteLogo> }).logo
      : undefined;

  const rawTheme = data.theme && typeof data.theme === "object" ? data.theme as Partial<SiteTheme> : undefined;

  return {
    theme: rawTheme ? {
      pageBg: typeof rawTheme.pageBg === "string" ? rawTheme.pageBg : undefined,
      primaryColor: typeof rawTheme.primaryColor === "string" ? rawTheme.primaryColor : undefined,
      accentColor: typeof rawTheme.accentColor === "string" ? rawTheme.accentColor : undefined,
      fontFamily: rawTheme.fontFamily === "serif" || rawTheme.fontFamily === "mono" ? rawTheme.fontFamily : rawTheme.fontFamily === "sans" ? "sans" : undefined,
    } : undefined,
    branding: {
      headerLogo: {
        ...base.branding.headerLogo,
        ...(legacyLogo ?? {}),
        ...(data.branding?.headerLogo ?? {}),
      },
      panelLogo: {
        ...base.branding.panelLogo,
        ...(legacyLogo ?? {}),
        ...(data.branding?.panelLogo ?? {}),
      },
    },
    editorStyles:
      data.editorStyles && typeof data.editorStyles === "object"
        ? data.editorStyles
        : base.editorStyles,
    customFields:
      Array.isArray(data.customFields)
        ? (data.customFields as unknown[])
            .filter((item): item is Partial<SiteCustomField> => Boolean(item && typeof item === "object"))
            .map((item, index) => ({
              id: typeof item.id === "string" && item.id ? item.id : `custom-${index + 1}`,
              text: typeof item.text === "string" ? item.text : "",
              variant:
                item.variant === "title" || item.variant === "button"
                  ? item.variant
                  : "text",
              section:
                item.section === "problem" ||
                item.section === "solution" ||
                item.section === "plans" ||
                item.section === "finalCta"
                  ? item.section
                  : "hero",
            }))
        : base.customFields,
    dynamicSections:
      Array.isArray(data.dynamicSections)
        ? (data.dynamicSections as unknown[])
            .filter((item): item is Partial<SiteSection> => Boolean(item && typeof item === "object"))
            .map((item, index) => ({
              id: typeof item.id === "string" && item.id ? item.id : `section-${index + 1}`,
              name: typeof item.name === "string" && item.name ? item.name : `Nova seção ${index + 1}`,
              kind:
                item.kind === "header" || item.kind === "hero" || item.kind === "cta" ||
                item.kind === "footer" || item.kind === "properties" || item.kind === "team" ||
                item.kind === "contact" || item.kind === "other"
                  ? item.kind
                  : "content",
              bgColor: typeof item.bgColor === "string" ? item.bgColor : undefined,
            }))
        : base.dynamicSections,
    dynamicBlocks:
      Array.isArray(data.dynamicBlocks)
        ? (data.dynamicBlocks as unknown[])
            .filter((item): item is Partial<SiteBlock> => Boolean(item && typeof item === "object"))
            .map((item, index) => ({
              id: typeof item.id === "string" && item.id ? item.id : `block-${index + 1}`,
              sectionId: typeof item.sectionId === "string" ? item.sectionId : "",
              type:
                item.type === "title" || item.type === "button" || item.type === "image" ||
                item.type === "card" || item.type === "list" || item.type === "icon" ||
                item.type === "video" || item.type === "form" || item.type === "divider" ||
                item.type === "property-search" || item.type === "property-grid" ||
                item.type === "property-card" || item.type === "property-map" ||
                item.type === "broker-grid" || item.type === "whatsapp-button" ||
                item.type === "team-card" || item.type === "contact-form"
                  ? item.type
                  : "text",
              text: typeof item.text === "string" ? item.text : "",
              items:
                Array.isArray(item.items) && item.items.every((entry) => typeof entry === "string")
                  ? item.items
                  : undefined,
              src: typeof item.src === "string" || item.src === null ? item.src : null,
              alt: typeof item.alt === "string" ? item.alt : "",
              embedUrl: typeof item.embedUrl === "string" ? item.embedUrl : "",
              phone: typeof item.phone === "string" ? item.phone : undefined,
            }))
        : base.dynamicBlocks,
    header: { ...base.header, ...(data.header ?? {}) },
    nav: { ...base.nav, ...(data.nav ?? {}) },
    hero: {
      ...base.hero,
      ...(data.hero ?? {}),
      image: {
        ...base.hero.image,
        ...(data.hero?.image ?? {}),
      },
    },
    metrics: Array.isArray(data.metrics) && data.metrics.length === base.metrics.length
      ? data.metrics.map((item, index) => ({ ...base.metrics[index], ...item }))
      : base.metrics,
    problem: {
      ...base.problem,
      ...(data.problem ?? {}),
      items:
        Array.isArray(data.problem?.items) && data.problem.items.length === base.problem.items.length
          ? data.problem.items
          : base.problem.items,
    },
    solution: { ...base.solution, ...(data.solution ?? {}) },
    features: Array.isArray(data.features) && data.features.length === base.features.length
      ? data.features.map((item, index) => ({ ...base.features[index], ...item }))
      : base.features,
    plansSection: { ...base.plansSection, ...(data.plansSection ?? {}) },
    plans: Array.isArray(data.plans) && data.plans.length === base.plans.length
      ? data.plans.map((item, index) => ({
          ...base.plans[index],
          ...item,
          items:
            Array.isArray(item.items) && item.items.length === base.plans[index].items.length
              ? item.items
              : base.plans[index].items,
        }))
      : base.plans,
    finalCta: { ...base.finalCta, ...(data.finalCta ?? {}) },
  };
}

export function readSiteContentFromStorage(): SiteContent {
  return readSiteContentById(DEFAULT_SITE_ID);
}

export function getSiteContentStorageKey(siteId = DEFAULT_SITE_ID) {
  return `${SITE_CONTENT_STORAGE_PREFIX}${siteId}`;
}

export function readSiteContentById(siteId = DEFAULT_SITE_ID): SiteContent {
  if (typeof window === "undefined") return cloneSiteContent();

  try {
    const siteRaw = window.localStorage.getItem(getSiteContentStorageKey(siteId));
    if (siteRaw) return normalizeSiteContent(JSON.parse(siteRaw));

    if (siteId === DEFAULT_SITE_ID) {
      const legacyRaw = window.localStorage.getItem(SITE_CONTENT_STORAGE_KEY);
      if (legacyRaw) return normalizeSiteContent(JSON.parse(legacyRaw));
    }

    return cloneSiteContent();
  } catch {
    return cloneSiteContent();
  }
}

export function writeSiteContentToStorage(content: SiteContent, siteId = DEFAULT_SITE_ID) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(content);
  window.localStorage.setItem(getSiteContentStorageKey(siteId), payload);

  if (siteId === DEFAULT_SITE_ID) {
    window.localStorage.setItem(SITE_CONTENT_STORAGE_KEY, payload);
  }
}

export function clearSiteContentStorage(siteId = DEFAULT_SITE_ID) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getSiteContentStorageKey(siteId));

  if (siteId === DEFAULT_SITE_ID) {
    window.localStorage.removeItem(SITE_CONTENT_STORAGE_KEY);
  }
}
