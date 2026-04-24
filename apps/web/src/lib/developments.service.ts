import { apiFetch } from "./api";

export type UnitStatus = "DISPONIVEL" | "RESERVADO" | "VENDIDO" | "BLOQUEADO";

export type DevelopmentUnit = {
  id: string;
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
  soldAt?: string | null;
};

export type Tower = {
  id: string;
  nome: string;
  floors: number;
  unitsPerFloor: number;
  gridX?: number | null;
  gridY?: number | null;
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
  towers: Tower[];
  paymentCondition?: PaymentCondition | null;
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

export async function createDevelopment(body: Partial<Development>): Promise<Development> {
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

export async function updateTower(devId: string, towerId: string, body: any): Promise<Tower> {
  return apiFetch(`/developments/${devId}/towers/${towerId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteTower(devId: string, towerId: string): Promise<void> {
  await apiFetch(`/developments/${devId}/towers/${towerId}`, { method: "DELETE" });
}

export async function bulkCreateUnits(devId: string, towerId: string, body: any) {
  return apiFetch(`/developments/${devId}/towers/${towerId}/units/bulk`, { method: "POST", body: JSON.stringify(body) });
}

export async function bulkUpdateUnits(devId: string, towerId: string, body: { andar?: number; updates: Partial<DevelopmentUnit> }) {
  return apiFetch(`/developments/${devId}/towers/${towerId}/units/bulk`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function updateUnit(devId: string, unitId: string, body: Partial<DevelopmentUnit>) {
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
