import { apiFetch } from "./api";

export type UnitStatus = "DISPONIVEL" | "RESERVADO" | "VENDIDO" | "BLOQUEADO";

export type DevelopmentUnit = {
  id: string;
  towerId: string;
  developmentId: string;
  nome: string;
  andar?: number | null;
  posicao?: number | null;
  status: UnitStatus;
  bloqueioMotivo?: string | null;
  areaM2?: number | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  valorVenda?: number | null;
  valorAvaliado?: number | null;
  finalPrice?: number | null;
  comprador?: string | null;
  balconyType?: string | null;
  windowLayout?: any | null;
  loteNum?: string | null;
  loteAreaM2?: number | null;
  loteFrente?: number | null;
  loteFundo?: number | null;
  soldAt?: string | null;
  leadId?: string | null;
  lead?: { id: string; nome: string; nomeCorreto?: string | null } | null;
};

export type FaseConfig = {
  nome: string;
  unidades: number;
  subsolos: number;
  excludedSlots?: Array<{ andar: number; localPos: number }>; // células removidas manualmente
};

export type FloorPlan = {
  cols: number;
  rows: number;
  cells: ("APT" | "HALL" | "EMPTY")[];
  cellWidthM: number;
  cellDepthM: number;
};

export type Tower = {
  id: string;
  nome: string;
  floors: number;
  unitsPerFloor: number;
  gridX?: number | null;
  gridY?: number | null;
  gridWidth?: number | null;
  gridHeight?: number | null;
  offsetX: number;
  offsetY: number;
  larguraM: number;
  profundidadeM: number;
  alturaAndarM: number;
  rotacao: number;
  lados: string;
  facadeImageUrl?: string | null;
  roofType?: string | null;
  roofColor?: string | null;
  facadeColor?: string | null;
  balconyType?: string | null;
  floorPlan?: FloorPlan | null;
  hasLobbyFloor?: boolean | null;
  implantacaoX?: number | null;
  implantacaoY?: number | null;
  implantacaoW?: number | null;
  implantacaoH?: number | null;
  implantacaoLat?: number | null;
  implantacaoLng?: number | null;
  ladoConfig?: Record<string, string> | null;
  subsolos?: number | null;
  floorUnitsConfig?: Record<string, number> | null;
  fasesConfig?: FaseConfig[] | null;
  posicaoPad?: number | null;
  posicaoFinalMap?: number[] | null;
  prefixoUnidade?: string | null;
  andarInicialContagem?: string | null;
  andarInicialDisplay?: number | null;
  subsoloDisplay?: string | null;
  units: DevelopmentUnit[];
};

export type PaymentCondition = {
  id: string;
  developmentId: string;
  aceitaFinanciamento: boolean;
  valorAto?: number | null;
  entradaPercentual?: number | null;
  entradaParcelas?: number | null;
  descontoAVista?: number | null;
  financiamentoBase?: "AVALIADO" | "VENDA" | null;
  financiamentoPercentual?: number | null;
  proSoluto: boolean;
  proSolutoPercentual?: number | null;
  proSolutoParcelas?: number | null;
  obs?: string | null;
};

export type Development = {
  id: string;
  nome: string;
  tipo: "VERTICAL" | "HORIZONTAL";
  subtipo: "APARTAMENTO" | "CASA" | "LOTEAMENTO";
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  sunOrientation: string;
  prazoEntrega?: string | null;
  status: string;
  gridRows: number;
  gridCols: number;
  gridLayout?: any[] | null;
  descricao?: string | null;
  lat?: number | null;
  lng?: number | null;
  entranceLat?: number | null;
  entranceLng?: number | null;
  implantacaoUrl?: string | null;
  implantacaoPublicId?: string | null;
  implantacaoMode?: "SATELITE" | "IMAGEM" | null;
  terrainDesign?: TerrainDesign | null;
  modelUrl?: string | null;
  modelPublicId?: string | null;
  areasComuns?: {
    piscina?: boolean;
    academia?: boolean;
    playground?: boolean;
    jardim?: boolean;
    portaria?: boolean;
  } | null;
  publishedAt?: string | null;
  towers: Tower[];
  paymentCondition?: PaymentCondition | null;
};

export type TerrainShapeType = "CONTORNO" | "RUA" | "JARDIM" | "PISCINA" | "SALAO" | "GARAGEM" | "QUADRA";

export type TerrainPoint = { lat: number; lng: number } | { x: number; y: number };

export type TerrainShape = {
  id: string;
  type: TerrainShapeType;
  points: TerrainPoint[];
  width?: number; // para RUA, em metros
  label?: string;
};

export type TerrainDesign = {
  version: 1;
  mode: "SATELITE" | "IMAGEM";
  shapes: TerrainShape[];
};

export type Dashboard = {
  total: number;
  disponivel: number;
  reservado: number;
  vendido: number;
  bloqueado: number;
  vgvTotal: number;
  vgvVendido: number;
  vgvReservado: number;
  vgvDisponivel: number;
  percentualVendido: number;
  vso: number;
  monthly: { mes: string; vendas: number; vgv: number }[];
};

export async function listDevelopments(): Promise<Development[]> {
  const data = await apiFetch("/developments");
  return Array.isArray(data) ? data : [];
}

export async function getDevelopment(id: string): Promise<Development> {
  return apiFetch(`/developments/${id}`);
}

export async function createDevelopment(body: Partial<Development> & { nome: string }): Promise<Development> {
  return apiFetch("/developments", { method: "POST", body: JSON.stringify(body) });
}

export async function updateDevelopment(id: string, body: Partial<Development>): Promise<Development> {
  return apiFetch(`/developments/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteDevelopment(id: string): Promise<void> {
  await apiFetch(`/developments/${id}`, { method: "DELETE" });
}

export async function createTower(devId: string, body: any): Promise<Tower> {
  return apiFetch(`/developments/${devId}/towers`, { method: "POST", body: JSON.stringify(body) });
}

export async function updateTower(devId: string, towerId: string, body: Partial<Tower>): Promise<Tower> {
  return apiFetch(`/developments/${devId}/towers/${towerId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteTower(devId: string, towerId: string): Promise<void> {
  await apiFetch(`/developments/${devId}/towers/${towerId}`, { method: "DELETE" });
}

export async function bulkCreateUnits(devId: string, towerId: string, body: { floors: number; unitsPerFloor: number; prefix?: string }) {
  return apiFetch(`/developments/${devId}/towers/${towerId}/units/bulk`, { method: "POST", body: JSON.stringify(body) });
}

export async function bulkUpdateUnits(devId: string, towerId: string, body: { andar?: number; posicaoMin?: number; posicaoMax?: number; updates: Partial<DevelopmentUnit> }) {
  return apiFetch(`/developments/${devId}/towers/${towerId}/units/bulk`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function bulkUpdateUnitsIndividual(devId: string, units: Array<{ id: string } & Partial<DevelopmentUnit>>) {
  return apiFetch(`/developments/${devId}/units/bulk-individual`, { method: "PATCH", body: JSON.stringify({ units }) });
}

export async function updateUnit(devId: string, unitId: string, body: Partial<DevelopmentUnit>): Promise<DevelopmentUnit> {
  return apiFetch(`/developments/${devId}/units/${unitId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function getDashboard(devId: string): Promise<Dashboard> {
  return apiFetch(`/developments/${devId}/dashboard`);
}

export async function getPaymentCondition(devId: string): Promise<PaymentCondition | null> {
  return apiFetch(`/developments/${devId}/payment-condition`);
}

export async function upsertPaymentCondition(devId: string, body: Partial<PaymentCondition>): Promise<PaymentCondition> {
  return apiFetch(`/developments/${devId}/payment-condition`, { method: "PUT", body: JSON.stringify(body) });
}

export async function uploadImplantacao(devId: string, file: File): Promise<Development> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/developments/${devId}/implantation/image`, { method: "POST", body: form });
}

export async function uploadDevelopmentModel(devId: string, file: File): Promise<Development> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/developments/${devId}/upload-model`, { method: "POST", body: form });
}

export async function publishDevelopment(devId: string): Promise<Development> {
  return apiFetch(`/developments/${devId}/publish`, { method: "POST" });
}

export async function unpublishDevelopment(devId: string): Promise<Development> {
  return apiFetch(`/developments/${devId}/unpublish`, { method: "POST" });
}
