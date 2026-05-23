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
    ctaLabel: "Agendar demonstração",
  },
  nav: {
    problem: "Problema",
    solution: "Solução",
    plans: "Planos",
  },
  hero: {
    badge: "Mais controle para atender, organizar e acompanhar",
    titleLine1: "Corretor com cliente,",
    titleLine2: "a VIA no CRM.",
    description:
      "Organize atendimento, rotina dos corretores, agenda e acompanhamento do cliente em um fluxo único. Menos ruído, mais produtividade e mais clareza para a sua operação imobiliária.",
    primaryCta: "Quero ver funcionando",
    secondaryCta: "Ver planos",
    panelEyebrow: "Painel VIA CRM",
    panelTitle: "Atendimento e operação em sintonia",
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
    { value: "24h", label: "de operação organizada entre corretor, gestão e agenda" },
    { value: "1", label: "painel único para corretor, gestor e acompanhamento do cliente" },
  ],
  problem: {
    eyebrow: "O problema",
    title: "Seu time atende pior quando a operação depende de memória, mensagens soltas e improviso.",
    items: [
      "O atendimento perde ritmo quando conversas, tarefas e histórico do cliente ficam espalhados em vários lugares.",
      "Corretores gastam tempo demais tentando lembrar combinados, próximos passos e retornos pendentes.",
      "A gestão perde visibilidade da operação e só percebe atrasos quando o cliente já teve uma experiência ruim.",
    ],
  },
  solution: {
    eyebrow: "A solução",
    title: "Um ambiente único para atender melhor, organizar a operação e acompanhar cada cliente com clareza.",
    description:
      "O VIA CRM foi desenhado para a rotina imobiliária. O corretor ganha produtividade, a gestão enxerga o andamento e o cliente recebe uma experiência mais rápida e organizada.",
  },
  features: [
    {
      title: "Acompanhamento do cliente",
      description:
        "Visualize a jornada de cada atendimento, organize próximos passos e mantenha contexto em toda a relação.",
    },
    {
      title: "Central de atendimento",
      description:
        "Conecte canais, distribua contatos e mantenha o contexto completo do atendimento em um só lugar.",
    },
    {
      title: "Agenda e secretária",
      description:
        "Coordene visitas, retornos e tarefas operacionais com menos ruído entre corretor, backoffice e gestão.",
    },
    {
      title: "Produtividade do corretor",
      description:
        "Reduza retrabalho com acesso rápido a clientes, agenda, histórico e informações importantes da rotina.",
    },
    {
      title: "Operação mais organizada",
      description:
        "Padronize processos, repasses e acompanhamentos para a equipe operar melhor no dia a dia.",
    },
    {
      title: "Visão gerencial",
      description:
        "Monitore o andamento do time, gargalos de atendimento e pontos críticos da operação com clareza.",
    },
  ],
  plansSection: {
    eyebrow: "Planos",
    title: "Estrutura de contratação compatível com o estágio da sua operação.",
    description:
      "Comece com o essencial, organize a rotina e avance para uma operação imobiliária mais fluida.",
  },
  plans: [
    {
      name: "Start",
      price: "R$ 297/mês",
      description: "Para operações enxutas que precisam sair do improviso.",
      items: ["Até 3 usuários", "Atendimento centralizado", "Agenda básica", "Suporte por e-mail"],
    },
    {
      name: "Performance",
      price: "R$ 697/mês",
      description: "Para imobiliárias em crescimento com foco em organização e produtividade.",
      items: ["Até 10 usuários", "Canais integrados", "Secretária e agenda", "Dashboards operacionais"],
      featured: true,
    },
    {
      name: "Scale",
      price: "Sob consulta",
      description: "Para operações com múltiplas equipes, maior volume e automações avançadas.",
      items: ["Usuários ilimitados", "Configuração dedicada", "Fluxos avançados", "Onboarding assistido"],
    },
  ],
  finalCta: {
    eyebrow: "Pronto para começar?",
    title: "Se a sua operação imobiliária cresceu, o atendimento e a organização precisam crescer junto.",
    description:
      "Veja como o VIA CRM organiza a rotina, acelera o atendimento e dá mais clareza para corretores e gestão.",
    sideText:
      "Demonstração focada na rotina de imobiliárias, com atendimento mais consistente e operação mais controlada.",
    buttonLabel: "Solicitar apresentação",
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
