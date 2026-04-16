/**
 * Usuário autenticado conforme retornado pelo JwtStrategy.validate().
 * Este é o objeto disponível em req.user em todos os controllers protegidos por JwtAuthGuard.
 *
 * Nota: `sub` é o claim JWT original; `id` é o mesmo valor por conveniência (atribuído
 * no validate()). Use `user.id` no código novo — `user.sub` existe apenas para compatibilidade
 * com tokens emitidos antes desta tipagem ser aplicada.
 */
export interface AuthenticatedUser {
  /** ID do usuário (equivalente ao JWT `sub`) */
  id: string;
  /** Alias para sub — mantido por compatibilidade */
  sub?: string;
  tenantId: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'AGENT';
  branchId?: string | null;
  nome?: string;
}

/**
 * Payload gerado pelo AuthService no login (antes de ser validado pelo JwtStrategy).
 * Inclui campos extras que ficam no JWT mas não no req.user final.
 */
export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  branchId?: string | null;
  /** Presente apenas em refresh tokens */
  type?: 'refresh';
  /** ID único do refresh token para revogação */
  jti?: string;
}
