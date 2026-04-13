/**
 * Define os módulos e ações disponíveis no sistema de permissões.
 * Cada entrada aqui aparece automaticamente na tela de Permissões do OWNER.
 *
 * Adicionar novos módulos/ações aqui os torna configuráveis sem alterar mais código.
 */

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'use';

export type PermissionRole = 'manager' | 'agent';

export interface ModulePermissions {
  key: string;
  label: string;
  actions: { key: PermissionAction; label: string }[];
}

export const PERMISSION_MODULES: ModulePermissions[] = [
  {
    key: 'leads',
    label: 'Leads',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
    ],
  },
  {
    key: 'products',
    label: 'Produtos',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
    ],
  },
  {
    key: 'calendar',
    label: 'Agenda',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
    ],
  },
  {
    key: 'secretary',
    label: 'Secretaria',
    actions: [
      { key: 'use', label: 'Usar' },
    ],
  },
  {
    key: 'channels',
    label: 'Canais',
    actions: [
      { key: 'view', label: 'Ver' },
      { key: 'edit', label: 'Editar' },
    ],
  },
  {
    key: 'botConfig',
    label: 'Config. IA',
    actions: [
      { key: 'view', label: 'Ver' },
      { key: 'edit', label: 'Editar' },
    ],
  },
  {
    key: 'settings',
    label: 'Configurações',
    actions: [
      { key: 'view', label: 'Ver' },
      { key: 'edit', label: 'Editar' },
    ],
  },
  {
    key: 'pipeline',
    label: 'Pipeline (todos os leads)',
    actions: [
      { key: 'view', label: 'Ver' },
    ],
  },
  {
    key: 'knowledgeBase',
    label: 'Base de Conhecimento',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
    ],
  },
];

/** Permissões padrão quando o tenant não tem config salva. */
export const DEFAULT_PERMISSIONS: Record<PermissionRole, Record<string, Record<string, boolean>>> = {
  manager: {
    leads:         { view: true,  create: true,  edit: true,  delete: true  },
    products:      { view: true,  create: true,  edit: true,  delete: true  },
    calendar:      { view: true,  create: true,  edit: true,  delete: true  },
    secretary:     { use: true  },
    channels:      { view: false, edit: false },
    botConfig:     { view: false, edit: false },
    settings:      { view: false, edit: false },
    pipeline:      { view: true  },
    knowledgeBase: { view: true,  create: true,  edit: true,  delete: true  },
  },
  agent: {
    leads:         { view: true,  create: true,  edit: true,  delete: false },
    products:      { view: true,  create: true,  edit: true,  delete: false },
    calendar:      { view: true,  create: true,  edit: true,  delete: true  },
    secretary:     { use: true  },
    channels:      { view: false, edit: false },
    botConfig:     { view: false, edit: false },
    settings:      { view: false, edit: false },
    pipeline:      { view: true  },
    knowledgeBase: { view: true,  create: false, edit: false, delete: false },
  },
};

/** Mescla o config salvo no banco com os defaults (novos módulos aparecem com default). */
export function resolvePermissions(
  saved: Record<string, any> | null | undefined,
): Record<PermissionRole, Record<string, Record<string, boolean>>> {
  if (!saved) return DEFAULT_PERMISSIONS;

  const result: any = {};
  for (const role of ['manager', 'agent'] as PermissionRole[]) {
    result[role] = {};
    for (const mod of PERMISSION_MODULES) {
      result[role][mod.key] = {};
      for (const action of mod.actions) {
        const savedVal = saved?.[role]?.[mod.key]?.[action.key];
        result[role][mod.key][action.key] =
          savedVal !== undefined ? savedVal : DEFAULT_PERMISSIONS[role][mod.key]?.[action.key] ?? false;
      }
    }
  }
  return result;
}
