const MARCAS = [
  { nome: "VIA CRM", desc: "Tecnologia" },
  { nome: "Valure", desc: "Crédito Imobiliário" },
  { nome: "Vex Imob", desc: "Incorporação" },
];

export default function Hero() {
  return (
    <section id="top" style={{ background: "var(--vx-navy)" }} className="relative pt-40 pb-28 text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(700px circle at 85% 0%, rgba(15,163,210,0.25), transparent 60%), radial-gradient(500px circle at 10% 100%, rgba(153,199,60,0.12), transparent 55%)",
        }}
      />
      <div className="vx-container relative">
        <p className="vx-eyebrow" style={{ color: "#7fd6f3" }}>
          Grupo Vexcia
        </p>
        <h1 className="mt-4 font-bold" style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.1, maxWidth: 780 }}>
          Tecnologia, crédito e incorporação imobiliária sob um só grupo.
        </h1>
        <p className="vx-lead mt-6" style={{ color: "rgba(255,255,255,0.78)", maxWidth: 620 }}>
          A Vexcia reúne três frentes complementares para atender todo o ciclo do negócio imobiliário: da
          tecnologia que organiza o atendimento, ao crédito que viabiliza a compra, à incorporação que entrega
          o empreendimento.
        </p>

        <div className="flex flex-wrap gap-4 mt-10">
          <a href="#contato" className="vx-btn-primary">
            Fale conosco
          </a>
          <a href="#marcas" className="vx-btn-ghost">
            Conhecer nossas marcas
          </a>
        </div>

        <div className="flex flex-wrap gap-4 mt-14">
          {MARCAS.map((m) => (
            <a
              key={m.nome}
              href="#marcas"
              className="flex flex-col gap-1 px-6 py-4 rounded-xl transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}
            >
              <span className="font-semibold">{m.nome}</span>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                {m.desc}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
