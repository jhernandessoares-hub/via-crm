"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { label: "Quem Somos", href: "#quem-somos" },
  { label: "Nossas Marcas", href: "#marcas" },
  { label: "Serviços", href: "#servicos" },
  { label: "Nossos Trabalhos", href: "#trabalhos" },
  { label: "Contato", href: "#contato" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ease-in-out"
      style={{
        background: scrolled ? "#ffffff" : "transparent",
        borderBottom: scrolled ? "1px solid var(--vx-border)" : "1px solid transparent",
      }}
    >
      <div className="vx-container flex items-center justify-between" style={{ height: 76 }}>
        <a href="#top" className="relative flex items-center" style={{ height: 44, width: 152 }}>
          <Image
            src="/logo-escura.png"
            alt="Vexcia"
            width={140}
            height={58}
            className="absolute left-0 top-0 transition-opacity duration-300 ease-in-out"
            style={{ height: 44, width: "auto", opacity: scrolled ? 0 : 1 }}
            priority
          />
          <Image
            src="/logo-clara.png"
            alt="Vexcia"
            width={140}
            height={58}
            className="absolute left-0 top-0 transition-opacity duration-300 ease-in-out"
            style={{ height: 44, width: "auto", opacity: scrolled ? 1 : 0 }}
            priority
          />
        </a>

        <nav className="hidden md:flex items-center gap-11">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium transition-colors duration-300 ease-in-out"
              style={{ color: scrolled ? "var(--vx-ink)" : "#ffffff" }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a href="#contato" className="vx-btn-primary" style={{ padding: "10px 20px" }}>
          Fale conosco
        </a>
      </div>
    </header>
  );
}
