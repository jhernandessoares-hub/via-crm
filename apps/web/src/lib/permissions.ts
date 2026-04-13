/**
 * Hook e helpers de permissões.
 *
 * As permissões são carregadas do servidor e armazenadas em localStorage
 * (chave: "tenantPermissions"). O hook `usePermissions` expõe `can(role, module, action)`.
 *
 * OWNER sempre tem acesso total — nunca passa por verificação de permissão.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "use";
export type PermissionRole = "manager" | "agent";

export type PermissionsConfig = Record<
  PermissionRole,
  Record<string, Record<string, boolean>>
>;

// ── Módulos disponíveis (espelho do backend) ────────────────────────────────
export const PERMISSION_MODULES = [
  {
    key: "leads",
    label: "Leads",
    actions: [
      { key: "view",   label: "Ver" },
      { key: "create", label: "Criar" },
      { key: "edit",   label: "Editar" },
      { key: "delete", label: "Excluir" },
    ],
  },
  {
    key: "products",
    label: "Produtos",
    actions: [
      { key: "view",   label: "Ver" },
      { key: "create", label: "Criar" },
      { key: "edit",   label: "Editar" },
      { key: "delete", label: "Excluir" },
    ],
  },
  {
    key: "calendar",
    label: "Agenda",
    actions: [
      { key: "view",   label: "Ver" },
      { key: "create", label: "Criar" },
      { key: "edit",   label: "Editar" },
      { key: "delete", label: "Excluir" },
    ],
  },
  {
    key: "secretary",
    label: "Secretaria",
    actions: [{ key: "use", label: "Usar" }],
  },
  {
    key: "channels",
    label: "Canais",
    actions: [
      { key: "view", label: "Ver" },
      { key: "edit", label: "Editar" },
    ],
  },
  {
    key: "botConfig",
    label: "Config. IA",
    actions: [
      { key: "view", label: "Ver" },
      { key: "edit", label: "Editar" },
    ],
  },
  {
    key: "settings",
    label: "Configurações",
    actions: [
      { key: "view", label: "Ver" },
      { key: "edit", label: "Editar" },
    ],
  },
  {
    key: "pipeline",
    label: "Pipeline (todos os leads)",
    actions: [{ key: "view", label: "Ver" }],
  },
  {
    key: "knowledgeBase",
    label: "Base de Conhecimento",
    actions: [
      { key: "view",   label: "Ver" },
      { key: "create", label: "Criar" },
      { key: "edit",   label: "Editar" },
      { key: "delete", label: "Excluir" },
    ],
  },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getStoredPermissions(): PermissionsConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("tenantPermissions");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredUserRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw).role : null;
  } catch {
    return null;
  }
}

/**
 * Verifica se o usuário atual tem permissão para a ação no módulo.
 * OWNER sempre retorna true.
 */
export function checkPermission(
  userRole: string | null,
  permissions: PermissionsConfig | null,
  module: string,
  action: PermissionAction,
): boolean {
  if (!userRole) return false;
  if (userRole === "OWNER") return true;

  const role = userRole.toLowerCase() as PermissionRole;
  if (!permissions) return false;
  return permissions?.[role]?.[module]?.[action] ?? false;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePermissions() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = getStoredUserRole();
    setUserRole(role);

    if (role === "OWNER") {
      setLoading(false);
      return;
    }

    // Tenta usar cache local primeiro
    const cached = getStoredPermissions();
    if (cached) {
      setPermissions(cached);
      setLoading(false);
    }

    // Carrega do servidor (atualiza cache)
    if (role) {
      apiFetch("/tenants/permissions-public")
        .then((data: PermissionsConfig) => {
          setPermissions(data);
          localStorage.setItem("tenantPermissions", JSON.stringify(data));
        })
        .catch(() => {/* usa cache se falhar */})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const can = (module: string, action: PermissionAction): boolean => {
    return checkPermission(userRole, permissions, module, action);
  };

  return { can, userRole, permissions, loading };
}
