import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

const API = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchProduct(slug: string, id: string) {
  try {
    const res = await fetch(`${API}/sites/public/${slug}/imovel/${id}`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchSiteInfo(slug: string) {
  try {
    const res = await fetch(`${API}/sites/public/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const product = await fetchProduct(slug, id);
  if (!product) return { title: "Imóvel não encontrado" };
  const site = await fetchSiteInfo(slug);
  return { title: `${product.nome}${site ? ` — ${site.name}` : ""}` };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const [site, product] = await Promise.all([fetchSiteInfo(slug), fetchProduct(slug, id)]);
  if (!site) notFound();
  if (!product) notFound();

  const images: { url: string }[] = product.images ?? [];
  const price = product.price ?? product.rentPrice;
  const priceLabel = product.price ? "Valor de venda" : "Valor de locação";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <Link href={`/s/${slug}`} className="text-sm text-slate-500 hover:text-slate-950">
            ← Voltar ao site
          </Link>
          <span className="text-sm font-semibold text-slate-950">{site.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Gallery */}
        {images.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {images.slice(0, 6).map((img, i) => (
              <div key={i} className={`relative overflow-hidden rounded-2xl bg-slate-100 ${i === 0 ? "md:col-span-2 h-72" : "h-36"}`}>
                <Image src={img.url} alt={`Foto ${i + 1}`} fill unoptimized className="object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-100 text-4xl text-slate-300">🏠</div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Details */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{product.type}</div>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">{product.title}</h1>

            {(product.neighborhood || product.city || product.state) && (
              <p className="mt-2 text-base text-slate-500">
                📍 {[product.neighborhood, product.city, product.state].filter(Boolean).join(", ")}
              </p>
            )}

            {/* Specs */}
            {(product.bedrooms || product.bathrooms || product.parkingSpaces || product.privateAreaM2) && (
              <div className="mt-6 flex flex-wrap gap-4">
                {product.bedrooms > 0 && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-center">
                    <div className="text-xl font-bold text-slate-950">{product.bedrooms}</div>
                    <div className="text-xs text-slate-500">quartos</div>
                  </div>
                )}
                {product.bathrooms > 0 && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-center">
                    <div className="text-xl font-bold text-slate-950">{product.bathrooms}</div>
                    <div className="text-xs text-slate-500">banheiros</div>
                  </div>
                )}
                {product.parkingSpaces > 0 && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-center">
                    <div className="text-xl font-bold text-slate-950">{product.parkingSpaces}</div>
                    <div className="text-xs text-slate-500">vagas</div>
                  </div>
                )}
                {product.privateAreaM2 > 0 && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-center">
                    <div className="text-xl font-bold text-slate-950">{product.privateAreaM2} m²</div>
                    <div className="text-xs text-slate-500">área privativa</div>
                  </div>
                )}
              </div>
            )}

            {product.descricao && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Descrição</h2>
                <p className="mt-2 text-base leading-7 text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
                  {product.descricao}
                </p>
              </div>
            )}

            {/* Rooms */}
            {product.rooms?.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Cômodos</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {product.rooms.map((room: any, i: number) => (
                    <div key={i} className="rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-700">
                      {room.label}{room.sizeM2 ? `: ${room.sizeM2} m²` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Price card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {price && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{priceLabel}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-950">
                    {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                </div>
              )}

              {/* Contact form */}
              <div className="mt-5">
                <div className="text-sm font-semibold text-slate-950">Quero visitar este imóvel</div>
                <form
                  action={`${API}/sites/public/${slug}/lead`}
                  method="POST"
                  className="mt-3 space-y-3"
                >
                  <input type="hidden" name="mensagem" value={`Interesse no imóvel: ${product.nome}`} />
                  <input
                    name="nome"
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                    placeholder="Seu nome"
                  />
                  <input
                    name="telefone"
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
                    placeholder="WhatsApp"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-full bg-slate-950 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Quero agendar visita
                  </button>
                </form>
              </div>
            </div>

            {/* WhatsApp CTA */}
            <a
              href={`https://wa.me/55?text=${encodeURIComponent(`Olá! Vi o imóvel "${product.nome}" no site e gostaria de mais informações.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              💬 Falar no WhatsApp
            </a>

            <Link
              href={`/s/${slug}`}
              className="block text-center text-sm text-slate-500 hover:text-slate-950"
            >
              ← Ver todos os imóveis
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
