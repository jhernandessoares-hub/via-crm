import Image from "next/image";
import Link from "next/link";
import { CookieConsentBanner } from "./CookieConsentBanner";

/**
 * Site institucional do Condomínio Residencial SIM José Bonifácio (SP9) —
 * página escrita à mão, sem depender do editor visual genérico de sites
 * (que ainda tem bugs de alinhamento em `dynamicBlocks`/`editorStyles`). O
 * registro do site continua existindo no Gerenciador de Sites (`/my-site`)
 * para uso futuro do editor com outros templates — esta página é o
 * conteúdo real, direto.
 */

const IMG = {
  // e_trim corta a margem branca ao redor da marca, deixando a logo maior
  // dentro da mesma caixa sem esticar/distorcer.
  logo: "https://res.cloudinary.com/divurdnpz/image/upload/e_trim/v1783042264/via-crm/sites/sp9/yvzu4cu5xuswjbgayc35.jpg",
  fachada: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042264/via-crm/sites/sp9/qmk6tzuh6a2iddqeas7p.jpg",
  vistaLateral: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042265/via-crm/sites/sp9/ct4pokx4ymmaqiyrcsxf.jpg",
  implantacao: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042266/via-crm/sites/sp9/tlmm4txnfc38udicntuj.jpg",
  quadra: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042266/via-crm/sites/sp9/snyttl2ravjzohixcyse.jpg",
  salaCozinha1: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042267/via-crm/sites/sp9/bjk3gfcu0arugnv6yob0.jpg",
  salaCozinha2: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042268/via-crm/sites/sp9/guu9vey6lm47xk0p1smw.jpg",
  planta1: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042269/via-crm/sites/sp9/g1v99it3xm9sl1wokcw7.jpg",
  planta2: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042269/via-crm/sites/sp9/k76x5rydxauuhzls3z2r.jpg",
  planta3: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042270/via-crm/sites/sp9/msfszx327gfvloyadqyu.jpg",
  planta4: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042271/via-crm/sites/sp9/lmy9kcny3yd9cbiyixds.jpg",
  planta5: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042271/via-crm/sites/sp9/bek1mxjlbkhjqeqf5cgm.jpg",
  planta6: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042272/via-crm/sites/sp9/tme22l4xcy454gvuuovr.jpg",
  planta7: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042273/via-crm/sites/sp9/bvs77cntue9d6kuak9hg.jpg",
  planta8: "https://res.cloudinary.com/divurdnpz/image/upload/v1783042274/via-crm/sites/sp9/bkdij2s7mva779aulh8f.jpg",
};

const PARCEIROS = [
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044095/via-crm/sites/sp9/parceiros/eprugi0in8r2jq2s5wx7.jpg", alt: "Governo do Estado de São Paulo" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044095/via-crm/sites/sp9/parceiros/vw3jksmffpcowlhazt59.png", alt: "Prefeitura de São Paulo" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044096/via-crm/sites/sp9/parceiros/sj2vjrwqxktdy1r8woln.png", alt: "COHAB São Paulo" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044097/via-crm/sites/sp9/parceiros/zoynkwkaedv6yob9rl7k.png", alt: "CDHU" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044097/via-crm/sites/sp9/parceiros/wz1narq6il9dulr8quoh.png", alt: "Programa Pode Entrar" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044098/via-crm/sites/sp9/parceiros/krkydslafgb4hzlujie8.png", alt: "SP9 Incorporação e Construção" },
  { src: "https://res.cloudinary.com/divurdnpz/image/upload/v1783044099/via-crm/sites/sp9/parceiros/frxnqcm2oizvib8an5vc.png", alt: "Simétrica Construtora" },
];

const PLANTAS = [IMG.planta1, IMG.planta2, IMG.planta3, IMG.planta4, IMG.planta5, IMG.planta6, IMG.planta7, IMG.planta8];

const ETAPAS = [
  { n: "1", titulo: "Chamado", texto: "Famílias selecionadas recebem comunicado oficial para dar início ao processo." },
  { n: "2", titulo: "Marcação", texto: "Agendamento de horário para entrega da documentação necessária." },
  { n: "3", titulo: "Verificação", texto: "Conferência dos documentos entregues pela família candidata." },
  { n: "4", titulo: "Análise", texto: "Avaliação de crédito junto à instituição financeira responsável." },
  { n: "5", titulo: "Obtenção da Unidade", texto: "Com o financiamento aprovado, uma unidade é designada à família." },
  { n: "6", titulo: "Assinatura do Contrato", texto: "Agendamento com o agente financeiro para assinatura e informações sobre a obra." },
];

const NAV = [
  { href: "#sobre", label: "Sobre" },
  { href: "#programa", label: "O Programa" },
  { href: "#participacao", label: "Participação" },
  { href: "#apartamentos", label: "Apartamentos" },
  { href: "#obra", label: "Obra" },
  { href: "#localizacao", label: "Localização" },
];

const ENDERECO = "Rua Inácio Donati, 11, Conjunto Residencial José Bonifácio, São Paulo - SP";
const MAPS_EMBED_SRC = `https://www.google.com/maps?q=${encodeURIComponent(ENDERECO)}&output=embed`;

const WHATSAPP_NUMBER = "5511946698521";
const WHATSAPP_MESSAGE = "Olá, vim pelo site do empreendimento jose bonifacio.";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

function SectionTitle({ eyebrow, title, dark }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className="mb-10">
      <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${dark ? "text-amber-400" : "text-amber-600"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-4xl font-bold tracking-tight sm:text-5xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>
    </div>
  );
}

export default function SimJoseBonifacioSite({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="relative h-24 w-44 shrink-0">
            <Image src={IMG.logo} alt="SIM José Bonifácio" fill unoptimized className="object-contain object-left" />
          </div>
          <nav className="hidden items-center gap-4 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="whitespace-nowrap text-sm font-medium text-slate-600 hover:text-slate-950"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 sm:inline-flex"
            >
              Falar no WhatsApp
            </a>
            <Link
              href={`/s/${slug}/portal/login`}
              className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Área da Família
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[520px] items-center overflow-hidden bg-slate-950">
        <Image src={IMG.fachada} alt="Fachada SIM José Bonifácio" fill unoptimized priority className="object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">José Bonifácio · São Paulo</p>
          <h1 className="mt-3 max-w-2xl text-5xl font-bold leading-tight text-white sm:text-6xl">
            Condomínio Residencial SIM José Bonifácio
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-200">Seu novo lar no bairro José Bonifácio, em São Paulo.</p>
        </div>
      </section>

      {/* Sobre */}
      <section id="sobre" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow="O Empreendimento" title="Sobre o Condomínio Residencial SIM José Bonifácio" />
            <p className="text-base leading-7 text-slate-600">
              O Condomínio Residencial SIM José Bonifácio é composto por dois blocos residenciais (Bloco A e Bloco B),
              localizado na Rua Alfredo Ricci com a Avenida Nagib Farah Maluf, no bairro José Bonifácio, em São Paulo.
              O empreendimento conta com portaria, área de lazer coberta, área comercial (lojas), quadra poliesportiva
              e playground.
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-xl shadow-slate-200">
            <Image src={IMG.vistaLateral} alt="Vista lateral do empreendimento" fill unoptimized className="object-cover" />
          </div>
        </div>
      </section>

      {/* O Programa */}
      <section id="programa" className="border-t border-slate-200 bg-slate-950 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle eyebrow="Parceria Público-Privada" title="O que é o Programa" dark />
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            Programa habitacional criado por meio de uma Parceria Público-Privada (PPP), reunindo governo e empresas
            privadas para reduzir o déficit de moradias na cidade de São Paulo.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { sigla: "HIS", nome: "Habitação de Interesse Social", desc: "Voltada a famílias de baixa renda." },
              { sigla: "HMP", nome: "Habitação do Mercado Popular", desc: "Voltada a famílias de renda moderada." },
              { sigla: "HMC", nome: "Habitação de Mercado", desc: "Unidades comercializadas em condições de mercado." },
            ].map((t) => (
              <div key={t.sigla} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-3xl font-bold text-amber-400">{t.sigla}</p>
                <p className="mt-2 text-lg font-semibold text-white">{t.nome}</p>
                <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Participação — Como Funciona + Etapas */}
      <section id="participacao" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle eyebrow="Quem Pode Participar" title="Como Funciona o Processo" />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { titulo: "Critério de Renda", desc: "Financiamento para famílias com renda dentro da faixa do programa." },
              { titulo: "Primeira Moradia", desc: "Voltado para quem não possui outro imóvel ou financiamento habitacional." },
              { titulo: "Transparência", desc: "Documentação completa, com processo seguro e transparente." },
            ].map((c) => (
              <div key={c.titulo} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-lg font-semibold text-slate-950">{c.titulo}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{c.desc}</p>
              </div>
            ))}
          </div>

          <p className="mb-6 mt-14 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Etapas para Participação</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ETAPAS.map((e) => (
              <div key={e.n} className="rounded-2xl border border-slate-200 p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                  {e.n}
                </div>
                <p className="mt-4 text-lg font-semibold text-slate-950">{e.titulo}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{e.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Implantação */}
      <section className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <div className="relative aspect-[6/5] overflow-hidden rounded-3xl shadow-xl shadow-slate-200 lg:order-2">
            <Image src={IMG.implantacao} alt="Planta de implantação" fill unoptimized className="object-cover" />
          </div>
          <div className="lg:order-1">
            <SectionTitle eyebrow="Planta" title="Implantação" />
            <ul className="space-y-3">
              {["Portaria", "Acesso de Pedestre", "Área de Lazer Coberta", "Área Comercial (Lojas)", "Quadra", "Carga e Descarga", "Playground"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-base text-slate-700">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Lazer */}
      <section className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow="Área Comum" title="Lazer" />
            <p className="text-base leading-7 text-slate-600">Quadra poliesportiva para o dia a dia da família.</p>
          </div>
          <div className="relative aspect-[3/2] overflow-hidden rounded-3xl shadow-xl shadow-slate-200">
            <Image src={IMG.quadra} alt="Quadra poliesportiva" fill unoptimized className="object-cover" />
          </div>
        </div>
      </section>

      {/* Apartamentos */}
      <section id="apartamentos" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle eyebrow="Unidades" title="Conheça os Apartamentos" />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="relative aspect-[3/2] overflow-hidden rounded-2xl shadow-lg shadow-slate-200">
              <Image src={IMG.salaCozinha1} alt="Sala e cozinha" fill unoptimized className="object-cover" />
            </div>
            <div className="relative aspect-[3/2] overflow-hidden rounded-2xl shadow-lg shadow-slate-200">
              <Image src={IMG.salaCozinha2} alt="Sala e cozinha" fill unoptimized className="object-cover" />
            </div>
          </div>

          <p className="mb-4 mt-12 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Plantas</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {PLANTAS.map((src, i) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <Image src={src} alt={`Planta ${i + 1}`} fill unoptimized className="object-contain p-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Obra */}
      <section id="obra" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle eyebrow="Acompanhamento" title="A Obra" />
          <p className="text-base leading-7 text-slate-600">Fotos do andamento da obra em breve.</p>
        </div>
      </section>

      {/* Localização */}
      <section id="localizacao" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionTitle eyebrow="Onde Fica" title="Localização" />
          <p className="max-w-2xl text-base leading-7 text-slate-600">{ENDERECO}</p>
          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 shadow-xl shadow-slate-200">
            <iframe
              title="Localização do SIM José Bonifácio"
              src={MAPS_EMBED_SRC}
              width="100%"
              height="420"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* Parceiros */}
      <section className="border-t border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-8 text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Uma parceria entre
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {PARCEIROS.map((p) => (
              <div
                key={p.src}
                className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="relative h-full w-full">
                  <Image src={p.src} alt={p.alt} fill unoptimized className="object-contain" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <SectionTitle eyebrow="Contato" title="Fale com a gente" />
          <p className="text-base leading-7 text-slate-600">
            Fale direto com a nossa equipe pelo WhatsApp. Retornamos o mais breve possível.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Falar no WhatsApp
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-950 py-10 px-6 text-left text-sm text-slate-400">
        © {new Date().getFullYear()} SIM José Bonifácio. Todos os direitos reservados.
      </footer>

      <CookieConsentBanner />
    </div>
  );
}
