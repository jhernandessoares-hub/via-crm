import { TOTAL_CIDADES, TOTAL_UNIDADES } from "@/data/projetos";

const STATS = [
  { valor: "30+", label: "anos de experiência combinada do time" },
  { valor: `${TOTAL_UNIDADES.toLocaleString("pt-BR")}+`, label: "unidades habitacionais viabilizadas" },
  { valor: `${TOTAL_CIDADES}`, label: "cidades atendidas no interior e capital de SP" },
];

export default function QuemSomos() {
  return (
    <section id="quem-somos" className="vx-section" style={{ background: "var(--vx-offwhite)" }}>
      <div className="vx-container">
        <p className="vx-eyebrow">Quem Somos</p>
        <h2 className="vx-h2 mt-3" style={{ maxWidth: 700 }}>
          Um grupo formado por profissionais que viveram o mercado imobiliário por dentro.
        </h2>
        <p className="vx-lead mt-6" style={{ maxWidth: 700 }}>
          A Vexcia nasceu para unir, sob um mesmo grupo, a tecnologia, o crédito e a operação imobiliária que
          normalmente ficam espalhados entre fornecedores diferentes. Nosso time reúne profissionais com mais
          de 30 anos de mercado imobiliário, com atuação direta na estruturação, viabilização e entrega de
          empreendimentos habitacionais em todo o interior paulista e na capital, do plano de negócio às
          chaves na mão.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
          {STATS.map((s) => (
            <div key={s.label} className="vx-card">
              <div className="font-bold" style={{ color: "var(--vx-navy)", fontSize: 36 }}>
                {s.valor}
              </div>
              <div className="mt-2 text-sm" style={{ color: "var(--vx-muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
