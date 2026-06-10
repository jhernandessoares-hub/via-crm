/**
 * Constante e helper para gate de funcionalidades exclusivas do tenant SP9.
 *
 * Mesmo padrão já adotado no projeto (SP9_GROUPS no dashboard, TENANT_SP9 nos
 * scripts da API). Centralizado aqui para reuso na Sidebar e na tela de Permissões.
 */
export const SP9_TENANT_ID = "5705ea62-0b1e-4323-8c84-99cdd9d4df7c";

export const isSP9 = (tenantId: string | null | undefined): boolean =>
  tenantId === SP9_TENANT_ID;
