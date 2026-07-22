const SERVICOS = [
  {
    titulo: "Trabalho Técnico Social e Caracterização de Demandas",
    descricao:
      "Acompanhamento social em Pré e Pós-Ocupação de habitação de interesse social: educação condominial, comunitária e ambiental, articulação com CRAS, CREAS, escolas e postos de saúde. Inclui análise cadastral, perfil socioeconômico do público-alvo, elegibilidade a programas habitacionais e gestão de lista de beneficiários.",
  },
  {
    titulo: "Estruturação de Negócios Imobiliários e Incorporação",
    descricao:
      "Viabilização de empreendimentos e loteamentos, apoio na busca de financiamento, Plano Diretor, articulação com CDHU/COHAB, enquadramento em programas como MCMV e Selo Azul Caixa, além da condução do processo de incorporação (GRAPROHAB, outorgas de água e esgoto, regularização).",
  },
  {
    titulo: "Implantação de Condomínio",
    descricao:
      "Formação da associação de moradores e do síndico, elaboração do regimento interno, regularização e transição organizada da gestão da obra para o condomínio.",
  },
  {
    titulo: "Estruturação de Vendas",
    descricao: "Montagem e estruturação do time comercial responsável pela venda dos empreendimentos.",
  },
  {
    titulo: "Crédito Imobiliário",
    descricao: "Assessoria e intermediação de financiamento: MCMV, SBPE, FGTS e Consórcio.",
  },
];

export default function Servicos() {
  return (
    <section id="servicos" className="vx-section" style={{ background: "var(--vx-offwhite)" }}>
      <div className="vx-container">
        <p className="vx-eyebrow">Nossos Serviços</p>
        <h2 className="vx-h2 mt-3">Expertise de ponta a ponta em habitação.</h2>
        <p className="vx-lead mt-4" style={{ maxWidth: 700 }}>
          Além das nossas marcas, prestamos consultoria e estruturação a parceiros, incorporadoras e poder
          público em todas as etapas de um empreendimento habitacional.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {SERVICOS.map((s, i) => (
            <div key={s.titulo} className="vx-card flex gap-4">
              <div
                className="flex items-center justify-center shrink-0 rounded-full font-bold"
                style={{ width: 36, height: 36, background: "var(--vx-navy)", color: "#fff", fontSize: 14 }}
              >
                {i + 1}
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: "var(--vx-navy)", fontSize: 17 }}>
                  {s.titulo}
                </h3>
                <p className="mt-2 text-sm" style={{ color: "var(--vx-muted)", lineHeight: 1.6 }}>
                  {s.descricao}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
