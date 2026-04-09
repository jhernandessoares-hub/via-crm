import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  SiteContent,
  SiteBlock,
  SiteSection,
  EditorElementStyle,
  normalizeSiteContent,
} from "@/lib/site-content";

const API = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchPublicSite(slug: string): Promise<{
  id: string;
  name: string;
  slug: string;
  siteType: string;
  publishedJson: SiteContent;
  tenantId: string;
} | null> {
  try {
    const res = await fetch(`${API}/sites/public/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, publishedJson: normalizeSiteContent(data.publishedJson) };
  } catch {
    return null;
  }
}

async function fetchPublicProducts(slug: string) {
  try {
    const res = await fetch(`${API}/sites/public/${slug}/products`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await fetchPublicSite(slug);
  if (!site) return { title: "Site não encontrado" };
  return { title: site.name };
}

// ─── Block Renderers ─────────────────────────────────────────────────────────

function PublicBlock({
  block,
  style,
  products,
  slug,
}: {
  block: SiteBlock;
  style?: EditorElementStyle;
  products: any[];
  slug: string;
}) {
  if (block.type === "title") {
    return (
      <h2
        className="text-3xl font-bold text-slate-950"
        style={{ fontSize: style?.fontSize ? `${style.fontSize}px` : undefined, color: style?.color ?? undefined }}
      >
        {block.text}
      </h2>
    );
  }

  if (block.type === "text") {
    return (
      <p className="text-base leading-7 text-slate-700" style={{ whiteSpace: "pre-wrap", color: style?.color ?? undefined }}>
        {block.text}
      </p>
    );
  }

  if (block.type === "button") {
    return (
      <a
        href={style?.href ?? "#"}
        className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        style={{ color: style?.color ?? undefined }}
      >
        {block.text}
      </a>
    );
  }

  if (block.type === "card") {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white p-6 text-base font-semibold text-slate-950 shadow-sm"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {block.text}
      </div>
    );
  }

  if (block.type === "image" && block.src) {
    return (
      <div className="relative overflow-hidden rounded-2xl" style={{ height: style?.height ? `${style.height}px` : "260px" }}>
        <Image src={block.src} alt={block.alt ?? ""} fill unoptimized className="object-cover" />
      </div>
    );
  }

  if (block.type === "list") {
    const items = block.items ?? block.text?.split("\n").filter(Boolean) ?? [];
    return (
      <ul className="space-y-2 text-base leading-7 text-slate-700">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "icon") {
    return <span className="text-5xl leading-none">{block.text ?? "★"}</span>;
  }

  if (block.type === "divider") {
    return <hr className="border-slate-200" />;
  }

  if (block.type === "video" && block.embedUrl) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-slate-200"
        style={{ height: style?.height ? `${style.height}px` : "320px" }}
      >
        <iframe src={block.embedUrl} className="h-full w-full" allowFullScreen title="Vídeo" />
      </div>
    );
  }

  if (block.type === "whatsapp-button" && block.phone) {
    return (
      <a
        href={`https://wa.me/55${block.phone.replace(/\D/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-emerald-600"
      >
        <span>💬</span>
        {block.text || "Falar no WhatsApp"}
      </a>
    );
  }

  if (block.type === "team-card") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        {block.src ? (
          <Image src={block.src} alt={block.alt ?? "Corretor"} width={80} height={80} unoptimized className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">👤</div>
        )}
        <div className="text-sm leading-6 text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
          {block.text || "Nome do Corretor"}
        </div>
      </div>
    );
  }

  if (block.type === "contact-form") {
    return <ContactFormBlock slug={slug} title={block.text} />;
  }

  if (block.type === "property-grid") {
    if (!products.length) return null;
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p: any) => (
          <Link
            key={p.id}
            href={`/s/${slug}/imovel/${p.id}`}
            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="relative h-44 bg-slate-100">
              {p.images?.[0]?.url ? (
                <Image src={p.images[0].url} alt={p.title} fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-3xl text-slate-300">🏠</div>
              )}
            </div>
            <div className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{p.type}</div>
              <div className="mt-1 truncate font-semibold text-slate-950">{p.title}</div>
              {(p.neighborhood || p.city) && (
                <div className="mt-1 text-xs text-slate-500">{[p.neighborhood, p.city].filter(Boolean).join(", ")}</div>
              )}
              {(p.price || p.rentPrice) && (
                <div className="mt-2 font-semibold text-slate-950">
                  {Number(p.price ?? p.rentPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
              {(p.bedrooms || p.bathrooms || p.parkingSpaces) && (
                <div className="mt-2 flex gap-3 text-xs text-slate-500">
                  {p.bedrooms > 0 && <span>{p.bedrooms} quartos</span>}
                  {p.bathrooms > 0 && <span>{p.bathrooms} banheiros</span>}
                  {p.parkingSpaces > 0 && <span>{p.parkingSpaces} vagas</span>}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    );
  }

  if (block.type === "property-search") {
    return (
      <form action={`/s/${slug}/busca`} method="GET" className="flex w-full max-w-2xl gap-2">
        <input
          name="q"
          placeholder="Buscar por cidade, bairro ou tipo de imóvel..."
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-slate-950"
        />
        <button type="submit" className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>
    );
  }

  if (block.type === "property-map") {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm">
        📍 Mapa interativo — disponível em breve
      </div>
    );
  }

  if (block.type === "broker-grid") {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm">
        👥 Grid de corretores — integração em breve
      </div>
    );
  }

  return null;
}

// Client-side contact form
function ContactFormBlock({ slug, title }: { slug: string; title?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold text-slate-950">{title || "Fale conosco"}</div>
      <form
        action={`${API}/sites/public/${slug}/lead`}
        method="POST"
        className="mt-4 space-y-3"
      >
        <input name="nome" required className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Seu nome" />
        <input name="telefone" required className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="WhatsApp" />
        <textarea name="mensagem" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Mensagem (opcional)" />
        <button type="submit" className="w-full rounded-full bg-slate-950 py-2 text-sm font-semibold text-white">
          Enviar
        </button>
      </form>
    </div>
  );
}

// ─── Section Renderer ─────────────────────────────────────────────────────────

function PublicSection({
  section,
  blocks,
  styles,
  products,
  slug,
}: {
  section: SiteSection;
  blocks: SiteBlock[];
  styles: Record<string, EditorElementStyle>;
  products: any[];
  slug: string;
}) {
  const sectionBlocks = blocks.filter((b) => b.sectionId === section.id);
  if (!sectionBlocks.length) return null;

  const bg = section.bgColor
    ? { backgroundColor: section.bgColor }
    : section.kind === "hero"
    ? { backgroundColor: "#0f172a" }
    : section.kind === "footer"
    ? { backgroundColor: "#1e293b" }
    : {};

  const isDark = section.bgColor
    ? isColorDark(section.bgColor)
    : section.kind === "hero" || section.kind === "footer";

  const FULL_WIDTH_TYPES = ["property-grid", "property-search", "contact-form", "property-map", "broker-grid"];

  return (
    <section className="w-full py-16 px-6" style={bg}>
      <div className={`mx-auto max-w-5xl ${isDark ? "text-white" : "text-slate-950"}`}>
        <div className="flex flex-wrap gap-6 items-start">
          {sectionBlocks.map((block) => {
            const st = styles[block.id];
            return (
              <div
                key={block.id}
                style={{
                  width: st?.width ? `${st.width}px` : undefined,
                  minWidth: FULL_WIDTH_TYPES.includes(block.type) ? "100%" : undefined,
                }}
              >
                <PublicBlock block={block} style={st} products={products} slug={slug} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function isColorDark(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [site, products] = await Promise.all([
    fetchPublicSite(slug),
    fetchPublicProducts(slug),
  ]);

  if (!site) notFound();

  const content = site.publishedJson;
  const { branding, hero, dynamicSections, dynamicBlocks, editorStyles } = content;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          {branding.headerLogo.src ? (
            <Image
              src={branding.headerLogo.src}
              alt={branding.headerLogo.alt || site.name}
              width={140}
              height={40}
              unoptimized
              className="h-8 w-auto object-contain"
            />
          ) : (
            <span className="text-base font-bold text-slate-950">{site.name}</span>
          )}
          <nav className="ml-auto flex gap-4">
            <a href="#imoveis" className="text-sm text-slate-600 hover:text-slate-950">Imóveis</a>
            <a href="#contato" className="text-sm text-slate-600 hover:text-slate-950">Contato</a>
          </nav>
        </div>
      </header>

      {/* Hero estático (campos hero do SiteContent) */}
      {hero.titleLine1 && !dynamicSections.some((s) => s.kind === "hero") && (
        <section className="bg-slate-950 py-20 px-6 text-white">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-5xl font-bold leading-tight">
              {hero.titleLine1}
              {hero.titleLine2 && <><br /><span className="text-sky-400">{hero.titleLine2}</span></>}
            </h1>
            {hero.description && <p className="mt-4 max-w-xl text-lg text-slate-300">{hero.description}</p>}
            <div className="mt-8 flex flex-wrap gap-4">
              {hero.primaryCta && (
                <a href="#contato" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                  {hero.primaryCta}
                </a>
              )}
              {hero.secondaryCta && (
                <a href="#imoveis" className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  {hero.secondaryCta}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Dynamic sections */}
      {dynamicSections.map((section) => (
        <PublicSection
          key={section.id}
          section={section}
          blocks={dynamicBlocks}
          styles={editorStyles}
          products={products}
          slug={slug}
        />
      ))}

      {/* Footer fallback */}
      {!dynamicSections.some((s) => s.kind === "footer") && (
        <footer className="border-t border-slate-200 bg-slate-950 py-8 px-6 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} {site.name}. Todos os direitos reservados.
        </footer>
      )}
    </div>
  );
}
