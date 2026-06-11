/**
 * Hook e helpers de permissões.
 *
 * As permissões são carregadas do servidor e armazenadas em localStorage
 * (chave: "tenantPermissions"). O hook `usePermissions` expõe `can(role, module, action)`.
 *
 * OWNER sempre tem acesso total — nunca passa por verificação de permissão.
 */

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "./api";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "use" | "export" | "send" | "merge";
export type PermissionRole = "manager" | "agent" | "partner";

export type DocumentAccessLevel = "none" | "view" | "download";

export type PermissionsConfig = Record<
  PermissionRole,
  Record<string, Record<string, boolean>>
> & {
  /** Visibilidade de campos do Externo Consultivo (role PARTNER). */
  fieldVisibility?: { partner: Record<string, boolean> };
  /** Acesso a documentos do lead para o Externo Consultivo. */
  documentAccess?: { partner: DocumentAccessLevel };
};

// ── Módulos disponíveis (espelho do backend) ────────────────────────────────
export const PERMISSION_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard (Operacional)",
    actions: [{ key: "view", label: "Ver" }],
  },
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
  {
    key: "gestao_empreendimentos",
    label: "Gestão de Empreendimentos",
    actions: [
      { key: "view",   label: "Ver (consultar espelho)" },
      { key: "create", label: "Fazer proposta" },
      { key: "edit",   label: "Editar unidades" },
      { key: "delete", label: "Bloquear unidades" },
    ],
  },
  {
    key: "inbox",
    label: "Inbox WhatsApp",
    actions: [
      { key: "view", label: "Ver conversas" },
      { key: "send", label: "Enviar mensagens" },
    ],
  },
  {
    key: "campanhas",
    label: "Campanhas",
    actions: [
      { key: "view",   label: "Ver" },
      { key: "create", label: "Criar" },
      { key: "edit",   label: "Editar" },
      { key: "delete", label: "Excluir" },
    ],
  },
  {
    key: "duplicados",
    label: "Duplicados",
    actions: [
      { key: "view",  label: "Ver" },
      { key: "merge", label: "Mesclar" },
    ],
  },
  {
    key: "exportacao",
    label: "Exportação de Dados",
    actions: [
      { key: "export", label: "Exportar leads (CSV)" },
    ],
  },
  {
    key: "relatorios",
    label: "Relatórios Gerenciais",
    actions: [{ key: "view", label: "Ver" }],
  },
  {
    key: "pre_ocupacao",
    label: "Pré-Ocupação",
    actions: [{ key: "view", label: "Ver" }],
  },
  {
    key: "pos_ocupacao",
    label: "Pós-Ocupação",
    actions: [{ key: "view", label: "Ver" }],
  },
] as const;

// ── Visibilidade de campos (Externo Consultivo) — espelho do backend ─────────
export type FieldVisibilityGroup = "lead" | "espelho";

export const FIELD_VISIBILITY_FIELDS: { key: string; label: string; group: FieldVisibilityGroup }[] = [
  { key: "lead.telefone",    label: "Telefone / WhatsApp",          group: "lead" },
  { key: "lead.dataCriacao", label: "Data de criação / entrada",    group: "lead" },
  { key: "lead.responsavel", label: "Atendente / Responsável",      group: "lead" },
  { key: "lead.conversa",    label: "Conversa (histórico + IA)",    group: "lead" },
  { key: "lead.cpf",         label: "CPF",                          group: "lead" },
  { key: "lead.rg",          label: "RG",                           group: "lead" },
  { key: "lead.email",       label: "E-mail",                       group: "lead" },
  { key: "lead.endereco",    label: "Endereço (rua/cidade/UF/CEP)", group: "lead" },
  { key: "lead.profissao",   label: "Profissão / Empresa",          group: "lead" },
  { key: "lead.financeiro",  label: "Renda / FGTS / Entrada",       group: "lead" },
  { key: "lead.estadoCivil", label: "Estado civil / Nascimento",    group: "lead" },
  { key: "lead.origem",      label: "Origem / Indicação",           group: "lead" },
  { key: "lead.resumo",      label: "Resumo do lead",               group: "lead" },
  { key: "lead.observacao",  label: "Observações",                  group: "lead" },
  { key: "unit.identificacao", label: "Empreendimento / Torre / Unidade",     group: "espelho" },
  { key: "unit.status",        label: "Status da unidade",                    group: "espelho" },
  { key: "unit.valores",       label: "Valores (tabela / negociado)",         group: "espelho" },
  { key: "unit.specs",         label: "Características (área/quartos/vagas...)", group: "espelho" },
  { key: "unit.lote",          label: "Dados do lote",                        group: "espelho" },
  { key: "unit.proposta",      label: "Proposta (pagamento / obs)",           group: "espelho" },
  { key: "unit.comprador",     label: "Comprador / data de venda",            group: "espelho" },
];

/** true = campo visível. Só restringe o role PARTNER; demais sempre veem tudo. */
export function checkFieldVisible(
  userRole: string | null,
  permissions: PermissionsConfig | null,
  fieldKey: string,
): boolean {
  if (userRole !== "PARTNER") return true;
  const fv = permissions?.fieldVisibility?.partner;
  if (!fv) return true;
  return fv[fieldKey] !== false;
}

/** Nível de acesso a documentos. Não-PARTNER sempre 'download' (total). */
export function checkDocumentAccess(
  userRole: string | null,
  permissions: PermissionsConfig | null,
): DocumentAccessLevel {
  if (userRole !== "PARTNER") return "download";
  return permissions?.documentAccess?.partner ?? "none";
}

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

  const isFieldVisible = (fieldKey: string): boolean => {
    return checkFieldVisible(userRole, permissions, fieldKey);
  };

  const documentAccess: DocumentAccessLevel = checkDocumentAccess(userRole, permissions);

  return { can, isFieldVisible, documentAccess, userRole, permissions, loading };
}

export type PageGuardState = "checking" | "allowed" | "denied";

/**
 * Guard de página por permissão. Enquanto carrega → "checking"; se permitido →
 * "allowed"; se negado → "denied" e redireciona para `fallback` (rota sem guard,
 * para nunca entrar em loop). OWNER sempre passa.
 *
 * Uso: `const guard = useRequirePermission((can) => can("calendar", "view"));`
 * e renderize o conteúdo apenas quando `guard === "allowed"`.
 */
export function useRequirePermission(
  predicate: (
    can: (module: string, action: PermissionAction) => boolean,
    role: string | null,
  ) => boolean,
  fallback = "/meus-leads",
): PageGuardState {
  const { can, loading, userRole } = usePermissions();
  const router = useRouter();
  const [state, setState] = useState<PageGuardState>("checking");

  useEffect(() => {
    if (loading) return;
    const ok = userRole === "OWNER" || predicate(can, userRole);
    if (ok) {
      setState("allowed");
      return;
    }
    setState("denied");
    startTransition(() => router.replace(fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userRole]);

  return state;
}

/**
 * Hook leve só para o nível de acesso a documentos (lê o cache via efeito,
 * sem fetch). Usado em componentes profundos (modais de preview de documento).
 */
export function useDocumentAccess(): DocumentAccessLevel {
  const [level, setLevel] = useState<DocumentAccessLevel>("download");
  useEffect(() => {
    setLevel(checkDocumentAccess(getStoredUserRole(), getStoredPermissions()));
  }, []);
  return level;
}
