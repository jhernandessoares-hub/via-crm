const MARCAS = [
  {
    nome: "VIA CRM",
    tagline: "Tecnologia para imobiliárias",
    descricao:
      "CRM com inteligência artificial no WhatsApp: organiza leads, funil de vendas e atendimento em um só lugar, com um assistente de IA que qualifica e responde clientes em tempo real.",
    itens: ["Atendimento com IA no WhatsApp", "Funil de vendas customizável", "Catálogo de imóveis integrado"],
    url: "https://crmvia.vexcia.com/",
  },
  {
    nome: "Valure",
    tagline: "Correspondente bancário",
    descricao:
      "Assessoria e intermediação de crédito imobiliário junto aos principais agentes financeiros, acompanhando o cliente do enquadramento até a liberação do financiamento.",
    itens: ["MCMV e SBPE", "FGTS e Consórcio", "Relacionamento direto com bancos e Caixa"],
    url: undefined as string | undefined,
  },
  {
    nome: "Vex Imob",
    tagline: "Incorporação e imobiliária",
    descricao:
      "A frente que desenvolve e vende os empreendimentos: da viabilização do terreno à entrega das unidades, com um portfólio de empreendimentos entregues em todo o estado de SP.",
    itens: ["Incorporação de empreendimentos", "Loteamentos e condomínios", "Gestão comercial da venda"],
    url: undefined as string | undefined,
  },
];

export default function Marcas() {
  return (
    <section id="marcas" className="vx-section">
      <div className="vx-container">
        <p className="vx-eyebrow">Nossas Marcas</p>
        <h2 className="vx-h2 mt-3">Três frentes, um só grupo.</h2>
        <p className="vx-lead mt-4" style={{ maxWidth: 700 }}>
          Cada marca cuida de uma etapa do ciclo imobiliário. Juntas, cobrem tudo, do primeiro contato à
          entrega das chaves.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {MARCAS.map((m) => (
            <div key={m.nome} className="vx-card flex flex-col">
              <span className="vx-eyebrow" style={{ color: "var(--vx-lime)" }}>
                {m.tagline}
              </span>
              <h3 className="mt-2 font-bold" style={{ color: "var(--vx-navy)", fontSize: 24 }}>
                {m.nome}
              </h3>
              <p className="mt-3 text-sm" style={{ color: "var(--vx-muted)", lineHeight: 1.6 }}>
                {m.descricao}
              </p>
              <ul className="mt-5 flex flex-col gap-2">
                {m.itens.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm" style={{ color: "var(--vx-ink)" }}>
                    <span style={{ color: "var(--vx-cyan)" }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 text-sm font-semibold"
                  style={{ color: "var(--vx-cyan)" }}
                >
                  Visitar site →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
