import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import QuemSomos from "@/components/QuemSomos";
import Marcas from "@/components/Marcas";
import Servicos from "@/components/Servicos";
import Trabalhos from "@/components/Trabalhos";
import Contato from "@/components/Contato";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <QuemSomos />
        <Marcas />
        <Servicos />
        <Trabalhos />
        <Contato />
      </main>
      <Footer />
    </>
  );
}
