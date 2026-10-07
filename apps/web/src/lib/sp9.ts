/**
 * Constante e helper para gate de funcionalidades exclusivas do tenant SP9.
 *
 * Mesmo padrão já adotado no projeto (SP9_GROUPS no dashboard, TENANT_SP9 nos
 * scripts da API). Centralizado aqui para reuso na Sidebar e na tela de Permissões.
 */
export const SP9_TENANT_ID = "5705ea62-0b1e-4323-8c84-99cdd9d4df7c";

// Só no ambiente DEV (Railway): o banco de dev não tem o tenant SP9, então um
// tenant de teste pode ser liberado para validar as telas exclusivas do SP9.
// Em produção a variável não existe e o gate continua sendo só o SP9.
const SP9_TEST_TENANT_ID = process.env.NEXT_PUBLIC_SP9_TEST_TENANT_ID || null;

export const isSP9 = (tenantId: string | null | undefined): boolean =>
  !!tenantId && (tenantId === SP9_TENANT_ID || tenantId === SP9_TEST_TENANT_ID);
