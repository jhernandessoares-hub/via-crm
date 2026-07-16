import ContactForm from "./ContactForm";
import WhatsAppButton from "./WhatsAppButton";

const CONTATOS_WHATSAPP = [
  { marca: "VIA CRM", mensagem: "Olá! Quero saber mais sobre a VIA CRM." },
  { marca: "Valure", mensagem: "Olá! Quero saber mais sobre crédito imobiliário com a Valure." },
  { marca: "Vex Imob", mensagem: "Olá! Quero saber mais sobre os empreendimentos da Vex Imob." },
];

export default function Contato() {
  return (
    <section id="contato" className="vx-section" style={{ background: "var(--vx-navy)" }}>
      <div className="vx-container grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="text-white">
          <p className="vx-eyebrow" style={{ color: "#7fd6f3" }}>
            Contato
          </p>
          <h2 className="mt-3 font-bold" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            Vamos conversar sobre o seu projeto.
          </h2>
          <p className="mt-4" style={{ color: "rgba(255,255,255,0.75)", maxWidth: 480, lineHeight: 1.6 }}>
            Preencha o formulário ou fale direto pelo WhatsApp com a frente que faz mais sentido pra você.
          </p>

          <div className="flex flex-col gap-3 mt-8" style={{ maxWidth: 320 }}>
            {CONTATOS_WHATSAPP.map((c) => (
              <WhatsAppButton key={c.marca} mensagem={c.mensagem} label={`Falar com ${c.marca}`} variant="ghost" />
            ))}
          </div>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
