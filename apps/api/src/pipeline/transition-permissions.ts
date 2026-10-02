export type TransitionPerms = {
  forwardRoles: string[];
  forwardUserIds: string[];
  backRoles: string[];
  backUserIds: string[];
};

export const TRANSITION_ROLES = ['MANAGER', 'AGENT', 'PARTNER'];

/**
 * Quem pode usar uma seta do Fluxo.
 * - OWNER sempre pode (nos dois sentidos).
 * - Avançar: listas vazias = todos.
 * - Voltar (sentido inverso da seta): listas vazias = só o OWNER.
 */
export function canUseTransition(
  t: TransitionPerms,
  user: { id?: string; sub?: string; role?: string },
  direction: 'forward' | 'back',
): boolean {
  if (user?.role === 'OWNER') return true;
  const roles = direction === 'forward' ? t.forwardRoles : t.backRoles;
  const users = direction === 'forward' ? t.forwardUserIds : t.backUserIds;
  if (roles.length === 0 && users.length === 0) return direction === 'forward';
  const uid = user?.id ?? user?.sub;
  return (!!user?.role && roles.includes(user.role)) || (!!uid && users.includes(uid));
}
