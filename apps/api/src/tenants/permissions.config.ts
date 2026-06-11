/**
 * Define os módulos e ações disponíveis no sistema de permissões.
 * Cada entrada aqui aparece automaticamente na tela de Permissões do OWNER.
 *
 * Adicionar novos módulos/ações aqui os torna configuráveis sem alterar mais código.
 */

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'use' | 'export' | 'send' | 'merge';

export type PermissionRole = 'manager' | 'agent' | 'partner';

export interface ModulePermissions {
  key: string;
  label: string;
  actions: { key: PermissionAction; label: string }[];
}

export const PERMISSION_MODULES: ModulePermissions[] = [
  {
    key: 'dashboard',
    label: 'Dashboard (Operacional)',
    actions: [
      { key: 'view', label: 'Ver' },
    ],
  },
  {
    key: 'leads',
    label: 'Meus Leads',
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
    label: 'Todos os Leads',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
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
  {
    key: 'gestao_empreendimentos',
    label: 'Gestão de Empreendimentos',
    actions: [
      { key: 'view',   label: 'Ver (consultar espelho)' },
      { key: 'create', label: 'Fazer proposta de unidade' },
      { key: 'edit',   label: 'Editar unidades' },
      { key: 'delete', label: 'Bloquear unidades' },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox WhatsApp',
    actions: [
      { key: 'view', label: 'Ver conversas' },
      { key: 'send', label: 'Enviar mensagens' },
    ],
  },
  {
    key: 'campanhas',
    label: 'Campanhas',
    actions: [
      { key: 'view',   label: 'Ver' },
      { key: 'create', label: 'Criar' },
      { key: 'edit',   label: 'Editar' },
      { key: 'delete', label: 'Excluir' },
    ],
  },
  {
    key: 'duplicados',
    label: 'Duplicados',
    actions: [
      { key: 'view',  label: 'Ver' },
      { key: 'merge', label: 'Mesclar' },
    ],
  },
  {
    key: 'exportacao',
    label: 'Exportação de Dados',
    actions: [
      { key: 'export', label: 'Exportar leads (CSV)' },
    ],
  },
  {
    key: 'relatorios',
    label: 'Dashboard Gerencial (vendas)',
    actions: [
      { key: 'view', label: 'Ver' },
    ],
  },
  {
    key: 'pre_ocupacao',
    label: 'Pré-Ocupação',
    actions: [
      { key: 'view', label: 'Ver' },
    ],
  },
  {
    key: 'pos_ocupacao',
    label: 'Pós-Ocupação',
    actions: [
      { key: 'view', label: 'Ver' },
    ],
  },
];

/** Permissões padrão quando o tenant não tem config salva. */
export const DEFAULT_PERMISSIONS: Record<PermissionRole, Record<string, Record<string, boolean>>> = {
  manager: {
    dashboard:              { view: true  },
    leads:                  { view: true,  create: true,  edit: true,  delete: true  },
    products:               { view: true,  create: true,  edit: true,  delete: true  },
    calendar:               { view: true,  create: true,  edit: true,  delete: true  },
    secretary:              { use: true  },
    channels:               { view: false, edit: false },
    botConfig:              { view: false, edit: false },
    settings:               { view: false, edit: false },
    pipeline:               { view: true,  create: true,  edit: true,  delete: true  },
    knowledgeBase:          { view: true,  create: true,  edit: true,  delete: true  },
    gestao_empreendimentos: { view: true,  create: true,  edit: true,  delete: false },
    inbox:                  { view: true,  send: true  },
    campanhas:              { view: true,  create: true,  edit: true,  delete: true  },
    duplicados:             { view: true,  merge: true  },
    exportacao:             { export: true  },
    relatorios:             { view: true  },
    pre_ocupacao:           { view: true  },
    pos_ocupacao:           { view: true  },
  },
  agent: {
    dashboard:              { view: true  },
    leads:                  { view: true,  create: true,  edit: true,  delete: false },
    products:               { view: true,  create: true,  edit: true,  delete: false },
    calendar:               { view: true,  create: true,  edit: true,  delete: true  },
    secretary:              { use: true  },
    channels:               { view: false, edit: false },
    botConfig:              { view: false, edit: false },
    settings:               { view: false, edit: false },
    pipeline:               { view: true,  create: true,  edit: true,  delete: false },
    knowledgeBase:          { view: true,  create: false, edit: false, delete: false },
    gestao_empreendimentos: { view: true,  create: false, edit: false, delete: false },
    inbox:                  { view: true,  send: true  },
    campanhas:              { view: false, create: false, edit: false, delete: false },
    duplicados:             { view: false, merge: false },
    exportacao:             { export: false },
    relatorios:             { view: false },
    pre_ocupacao:           { view: true  },
    pos_ocupacao:           { view: true  },
  },
  partner: {
    dashboard:              { view: false },
    leads:                  { view: true,  create: false, edit: false, delete: false },
    products:               { view: true,  create: false, edit: false, delete: false },
    calendar:               { view: false, create: false, edit: false, delete: false },
    secretary:              { use: false },
    channels:               { view: false, edit: false },
    botConfig:              { view: false, edit: false },
    settings:               { view: false, edit: false },
    pipeline:               { view: false, create: false, edit: false, delete: false },
    knowledgeBase:          { view: true,  create: false, edit: false, delete: false },
    gestao_empreendimentos: { view: false, create: false, edit: false, delete: false },
    inbox:                  { view: false, send: false },
    campanhas:              { view: false, create: false, edit: false, delete: false },
    duplicados:             { view: false, merge: false },
    exportacao:             { export: false },
    relatorios:             { view: false },
    pre_ocupacao:           { view: true  },
    pos_ocupacao:           { view: true  },
  },
};

/** Mescla o config salvo no banco com os defaults (novos módulos aparecem com default). */
export function resolvePermissions(
  saved: Record<string, any> | null | undefined,
): Record<PermissionRole, Record<string, Record<string, boolean>>> {
  if (!saved) return DEFAULT_PERMISSIONS;

  const result: any = {};
  for (const role of ['manager', 'agent', 'partner'] as PermissionRole[]) {
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

/* ------------------------------------------------------------------ *
 * Visibilidade de campos — exclusivo do perfil Externo Consultivo.
 * O OWNER escolhe quais dados do lead / espelho ficam ocultos para
 * esse perfil. O backend remove o dado do payload; o front borra.
 * ------------------------------------------------------------------ */

export type FieldVisibilityGroup = 'lead' | 'espelho';

export interface FieldVisibilityField {
  key: string;
  label: string;
  group: FieldVisibilityGroup;
}

/** Campos que o OWNER pode ocultar do Externo Consultivo. */
export const FIELD_VISIBILITY_FIELDS: FieldVisibilityField[] = [
  // Lead
  { key: 'lead.telefone',    label: 'Telefone / WhatsApp',          group: 'lead' },
  { key: 'lead.dataCriacao', label: 'Data de criação / entrada',    group: 'lead' },
  { key: 'lead.historicoDatas', label: 'Datas do histórico de movimentação', group: 'lead' },
  { key: 'lead.responsavel', label: 'Atendente / Responsável',      group: 'lead' },
  { key: 'lead.conversa',    label: 'Conversa (histórico + IA)',    group: 'lead' },
  { key: 'lead.cpf',         label: 'CPF',                          group: 'lead' },
  { key: 'lead.rg',          label: 'RG',                           group: 'lead' },
  { key: 'lead.email',       label: 'E-mail',                       group: 'lead' },
  { key: 'lead.endereco',    label: 'Endereço (rua/cidade/UF/CEP)', group: 'lead' },
  { key: 'lead.profissao',   label: 'Profissão / Empresa',          group: 'lead' },
  { key: 'lead.financeiro',  label: 'Renda / FGTS / Entrada',       group: 'lead' },
  { key: 'lead.estadoCivil', label: 'Estado civil / Nascimento',    group: 'lead' },
  { key: 'lead.origem',      label: 'Origem / Indicação',           group: 'lead' },
  { key: 'lead.resumo',      label: 'Resumo do lead',               group: 'lead' },
  { key: 'lead.observacao',  label: 'Observações',                  group: 'lead' },
  // Espelho / unidade
  { key: 'unit.identificacao', label: 'Empreendimento / Torre / Unidade',     group: 'espelho' },
  { key: 'unit.status',        label: 'Status da unidade',                    group: 'espelho' },
  { key: 'unit.valores',       label: 'Valores (tabela / negociado)',         group: 'espelho' },
  { key: 'unit.specs',         label: 'Características (área/quartos/vagas...)', group: 'espelho' },
  { key: 'unit.lote',          label: 'Dados do lote',                        group: 'espelho' },
  { key: 'unit.proposta',      label: 'Proposta (pagamento / obs)',           group: 'espelho' },
  { key: 'unit.comprador',     label: 'Comprador / data de venda',            group: 'espelho' },
];

/**
 * Default: true = visível. Os 3 campos abaixo nascem OCULTOS por padrão;
 * qualquer campo não listado aqui é visível por default.
 */
export const DEFAULT_FIELD_VISIBILITY: Record<string, boolean> = {
  'lead.telefone': false,
  'lead.responsavel': false,
  'lead.conversa': false,
};

/** Resolve a visibilidade de campos do Externo Consultivo (mescla salvo + defaults). */
export function resolveFieldVisibility(saved: any): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of FIELD_VISIBILITY_FIELDS) {
    const s = saved?.partner?.[f.key];
    out[f.key] = s !== undefined ? !!s : DEFAULT_FIELD_VISIBILITY[f.key] ?? true;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Acesso a documentos do lead — Externo Consultivo.
 * 3 níveis: 'none' (nem vê), 'view' (vê/previsualiza, sem baixar),
 * 'download' (vê e baixa). Default mais restritivo: 'none'.
 * ------------------------------------------------------------------ */

export type DocumentAccessLevel = 'none' | 'view' | 'download';

export const DEFAULT_DOCUMENT_ACCESS: DocumentAccessLevel = 'none';

export function resolveDocumentAccess(saved: any): DocumentAccessLevel {
  const v = saved?.partner;
  return v === 'view' || v === 'download' || v === 'none' ? v : DEFAULT_DOCUMENT_ACCESS;
}
