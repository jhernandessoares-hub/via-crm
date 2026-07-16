// Número institucional placeholder (mesmo usado hoje pelo "Falar com vendas" do VIA CRM).
// Confirmar com o usuário se Valure/Vex Imob têm números próprios antes de publicar.
export const WHATSAPP_NUMERO_PADRAO = "5519984025179";

export function whatsappLink(mensagem: string, numero: string = WHATSAPP_NUMERO_PADRAO) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export default function WhatsAppButton({
  mensagem,
  numero,
  label = "Falar no WhatsApp",
  variant = "primary",
}: {
  mensagem: string;
  numero?: string;
  label?: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <a
      href={whatsappLink(mensagem, numero)}
      target="_blank"
      rel="noopener noreferrer"
      className={variant === "primary" ? "vx-btn-primary" : "vx-btn-ghost"}
    >
      {label}
    </a>
  );
}
