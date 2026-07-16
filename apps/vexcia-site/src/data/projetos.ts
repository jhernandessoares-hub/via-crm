export type Projeto = {
  nome: string;
  cidade: string;
  construtora: string;
  unidades: number;
};

export type Cidade = {
  nome: string;
  lat: number;
  lng: number;
};

// Fonte: ACERVO COMERCIAL (planilha interna). A soma bate com o total informado
// na planilha (8.227 unidades).
export const PROJETOS: Projeto[] = [
  { nome: "Residencial das Flores", cidade: "Rio Claro", construtora: "Paineiras", unidades: 250 },
  { nome: "Residencial São José", cidade: "Rio Claro", construtora: "Paineiras", unidades: 250 },
  { nome: "Residencial Jardim Paulista", cidade: "Santa Gertrudes", construtora: "Via Engenharia", unidades: 250 },
  { nome: "Residencial dos Eucaliptos", cidade: "Itirapina", construtora: "Via Engenharia", unidades: 250 },
  { nome: "Residencial Arnon de Melo", cidade: "Aguaí", construtora: "Via Engenharia", unidades: 250 },
  { nome: "Residencial Wlademir Pereira", cidade: "Casa Branca", construtora: "Via Engenharia", unidades: 250 },
  { nome: "Residencial Benjamim de Castro", cidade: "Rio Claro", construtora: "Construtoras Saned/HE", unidades: 250 },
  { nome: "Residencial dos Bosques", cidade: "Rio Claro", construtora: "Construtoras Saned/HE", unidades: 250 },
  { nome: "Residencial Hélio Nicolai", cidade: "Itapira", construtora: "Torres Engenharia", unidades: 270 },
  { nome: "Residencial Araçoiaba da Serra", cidade: "Araçoiaba da Serra", construtora: "Construtora Soma", unidades: 350 },
  { nome: "Residencial dos Trabalhadores", cidade: "Santa Bárbara D'Oeste", construtora: "Via Engenharia", unidades: 1000 },
  { nome: "Residencial São Valentim", cidade: "Pirassununga", construtora: "Via Engenharia", unidades: 1000 },
  { nome: "Residencial Piazza Navona", cidade: "Rio Claro", construtora: "Torres Engenharia", unidades: 47 },
  { nome: "Condomínio SIM Sapopemba", cidade: "São Paulo", construtora: "Simétrica Engenharia", unidades: 151 },
  { nome: "Condomínio SIM Boa Vista", cidade: "São João da Boa Vista", construtora: "Simétrica Engenharia", unidades: 224 },
  { nome: "Condomínio Parque das Árvores", cidade: "Rio Claro", construtora: "Simétrica Engenharia", unidades: 306 },
  { nome: "Condomínio Primavera", cidade: "Rio Claro", construtora: "Simétrica Engenharia", unidades: 320 },
  { nome: "Condomínio Canto dos Pássaros", cidade: "Pirassununga", construtora: "Simétrica Engenharia", unidades: 333 },
  { nome: "Residencial dos Manacás", cidade: "Mogi Mirim", construtora: "Simétrica Engenharia", unidades: 504 },
  { nome: "Condomínio Residencial J. Nazaré", cidade: "Mogi Mirim", construtora: "Via Engenharia", unidades: 841 },
  { nome: "Condomínio SIM José Bonifácio", cidade: "São Paulo", construtora: "Simétrica Engenharia", unidades: 297 },
  { nome: "Sollare Residencial", cidade: "Rio Claro", construtora: "Caprem Construtora", unidades: 160 },
  { nome: "Ibiza Residencial", cidade: "Rio Claro", construtora: "Vilaurbe", unidades: 112 },
  { nome: "Residencial Formentor", cidade: "Rio Claro", construtora: "Vilaurbe", unidades: 136 },
  { nome: "Residencial Estelencs", cidade: "Rio Claro", construtora: "Vilaurbe", unidades: 176 },
];

// Coordenadas reais (lat/lng) das sedes municipais — usadas no mapa Leaflet/OpenStreetMap.
export const CIDADES: Cidade[] = [
  { nome: "Rio Claro", lat: -22.4064, lng: -47.5613 },
  { nome: "Santa Gertrudes", lat: -22.4536, lng: -47.5286 },
  { nome: "Itirapina", lat: -22.2528, lng: -47.8214 },
  { nome: "Aguaí", lat: -22.0614, lng: -46.9736 },
  { nome: "Casa Branca", lat: -21.7717, lng: -47.0864 },
  { nome: "Itapira", lat: -22.4342, lng: -46.8225 },
  { nome: "Araçoiaba da Serra", lat: -23.5108, lng: -47.6119 },
  { nome: "Santa Bárbara D'Oeste", lat: -22.7539, lng: -47.4144 },
  { nome: "Pirassununga", lat: -21.9964, lng: -47.4258 },
  { nome: "São João da Boa Vista", lat: -21.9683, lng: -46.7994 },
  { nome: "Mogi Mirim", lat: -22.4319, lng: -46.9578 },
  { nome: "São Paulo", lat: -23.5505, lng: -46.6333 },
];

export const TOTAL_UNIDADES = PROJETOS.reduce((sum, p) => sum + p.unidades, 0);
export const TOTAL_CIDADES = CIDADES.length;
export const TOTAL_EMPREENDIMENTOS = PROJETOS.length;
export const AGENTES_FINANCEIROS = ["Caixa Econômica Federal", "Banco do Brasil", "CDHU"];
