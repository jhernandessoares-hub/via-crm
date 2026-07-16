import SPMap from "./SPMap";
import {
  AGENTES_FINANCEIROS,
  PROJETOS,
  TOTAL_CIDADES,
  TOTAL_EMPREENDIMENTOS,
  TOTAL_UNIDADES,
} from "@/data/projetos";

const STATS = [
  { valor: `${TOTAL_UNIDADES.toLocaleString("pt-BR")}+`, label: "unidades habitacionais viabilizadas" },
  { valor: `${TOTAL_EMPREENDIMENTOS}`, label: "empreendimentos entregues" },
  { valor: `${TOTAL_CIDADES}`, label: "cidades atendidas em São Paulo" },
  { valor: AGENTES_FINANCEIROS.length.toString(), label: "grandes agentes financeiros parceiros" },
];

export default function Trabalhos() {
  return (
    <section id="trabalhos" className="vx-section">
      <div className="vx-container">
        <p className="vx-eyebrow">Nossos Trabalhos</p>
        <h2 className="vx-h2 mt-3">Presença real em todo o estado de São Paulo.</h2>
        <p className="vx-lead mt-4" style={{ maxWidth: 700 }}>
          Nosso portfólio reúne empreendimentos habitacionais entregues em parceria com {" "}
          {AGENTES_FINANCEIROS.join(", ")}.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10">
          {STATS.map((s) => (
            <div key={s.label} className="vx-card">
              <div className="font-bold" style={{ color: "var(--vx-navy)", fontSize: 30 }}>
                {s.valor}
              </div>
              <div className="mt-2 text-xs" style={{ color: "var(--vx-muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <SPMap />
        </div>

        <details className="mt-10">
          <summary className="text-sm font-medium cursor-pointer" style={{ color: "var(--vx-cyan)" }}>
            Ver lista completa de empreendimentos
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--vx-border)" }}>
                  <th className="text-left py-2 pr-4" style={{ color: "var(--vx-muted)" }}>
                    Empreendimento
                  </th>
                  <th className="text-left py-2 pr-4" style={{ color: "var(--vx-muted)" }}>
                    Cidade
                  </th>
                  <th className="text-left py-2 pr-4" style={{ color: "var(--vx-muted)" }}>
                    Construtora
                  </th>
                  <th className="text-right py-2" style={{ color: "var(--vx-muted)" }}>
                    Unidades
                  </th>
                </tr>
              </thead>
              <tbody>
                {PROJETOS.map((p) => (
                  <tr key={p.nome} style={{ borderBottom: "1px solid var(--vx-border)" }}>
                    <td className="py-2 pr-4" style={{ color: "var(--vx-ink)" }}>
                      {p.nome}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--vx-muted)" }}>
                      {p.cidade}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--vx-muted)" }}>
                      {p.construtora}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--vx-navy)", fontWeight: 600 }}>
                      {p.unidades.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
