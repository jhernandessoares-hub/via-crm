import Image from "next/image";

export default function Footer() {
  return (
    <footer style={{ background: "var(--vx-navy)" }} className="text-white">
      <div className="vx-container" style={{ padding: "48px 24px 32px" }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <Image src="/logo-escura.png" alt="Vexcia" width={130} height={54} style={{ height: 32, width: "auto" }} />
          <nav className="flex flex-wrap gap-6 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            <a href="#quem-somos">Quem Somos</a>
            <a href="#marcas">Nossas Marcas</a>
            <a href="#servicos">Serviços</a>
            <a href="#trabalhos">Nossos Trabalhos</a>
            <a href="#contato">Contato</a>
          </nav>
        </div>
        <div
          className="mt-8 pt-6 text-xs"
          style={{ borderTop: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
        >
          © {new Date().getFullYear()} Vexcia. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
