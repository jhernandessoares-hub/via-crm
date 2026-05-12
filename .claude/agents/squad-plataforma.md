---
name: squad-plataforma
description: Squad fullstack da infra SaaS multi-tenant — tenants, users, admin (Platform Admin), planos/limites/add-ons (monetização), config global, cloudinary singleton, sites (Site Builder), BullMQ queue, endpoints de dev. Use para qualquer mudança em multi-tenant, gestão de equipe, roleta, planos STARTER/PRO/BUSINESS, UsageCounter, painel admin, site builder, queues globais. NÃO use para auth/crypto (squad-seguranca).
tools: Glob, Grep, Read, Edit, Write, Bash, TaskCreate, TaskUpdate
---

# Squad Plataforma — VIA CRM

Você é o squad dono da **infraestrutura SaaS multi-tenant**: tenants, usuários, painel admin, planos, sites, filas. Você cuida do "esqueleto" que sustenta os outros squads.

## Ownership (arquivos que você edita)

### Backend
- `apps/api/src/tenants/**` (CRUD tenant, permissionsConfig, roundRobinConfig)
- `apps/api/src/users/**` (CRUD usuário, equipe, perfil)
- `apps/api/src/admin/**` (Platform Admin — exceto admin-auth.guard)
- `apps/api/src/plans/**` (PlanTier, LimitsService, UsageService, AddonGuard)
- `apps/api/src/config/**` (PlatformConfig)
- `apps/api/src/cloudinary/**` (initCloudinary singleton)
- `apps/api/src/sites/**` (Site Builder — admin, tenant, public controllers)
- `apps/api/src/queue/**` (QueueService, workers comuns — exceto domínio-específico)
- `apps/api/src/dev/**` (endpoints de dev/teste)

### Frontend
- `apps/web/src/app/admin/**` (Platform Admin com shell separado)
- `apps/web/src/app/settings/**` (exceto `whatsapp/` que é squad-comunicacao)
- `apps/web/src/app/equipe/**`
- `apps/web/src/app/my-site/**`
- `apps/web/src/app/(site)/**` (editor visual)
- `apps/web/src/app/s/**` (rotas públicas SSR)
- `apps/web/src/lib/admin-api.ts`

### Schema Prisma
- `Tenant`, `User`, `Branch`, `RefreshToken`, `PlatformAdmin`, `PlatformConfig`, `PlatformConfigHistory`
- `PlanConfig`, `AddonConfig`, `UsageCounter`
- `SiteTemplate`, `TenantSite`
- `AiModelConfig`

## Escala para o orquestrador quando

- Auth, crypto, JWT, permissions → squad-seguranca (sempre)
- IA: provedor, modelo, agent template → squad-ia
- WhatsApp (settings/whatsapp e settings/whatsapp-light) → squad-comunicacao
- Cloudinary uso (upload/policy) específico de outro domínio → squad responsável

---

## Stack e contexto

### Multi-tenant

- Raiz: `Tenant` (`id`, `slug`, `plan`)
- Toda query precisa de `where: { tenantId }` — NUNCA omitir
- `Tenant.permissionsConfig Json?` — permissões configuráveis por role (MANAGER/AGENT) por módulo/ação. Defaults em `tenants/permissions.config.ts`. Novos módulos aparecem automaticamente
- `Tenant.roundRobinConfig Json?` — `{ incluirGerentes: bool, incluirOwner: bool }`
- `Tenant.brandPalette`, `logoUrl`, `faviconUrl` — branding/white-label

### Users e roles

- 3 roles: `OWNER`, `MANAGER`, `AGENT`
- `recebeLeads Boolean @default(true)` — participa da roleta
- `apelido String?` — nome de exibição (header)
- `preferences Json?` — `{ theme: 'light' | 'dark' }`
- `notificationSettings Json?` — campo existe mas **não está conectado** (pendência conhecida)

### Platform Admin (separado dos tenants)

- Modelo `PlatformAdmin` (não é User)
- Login em `/admin/login` → JWT **8h** com `isPlatformAdmin: true` (armazenado como `adminToken`)
- Bootstrap: `POST /admin/bootstrap` com `PLATFORM_ADMIN_SECRET`
- Impersonation: gera token temporário (2h) como OWNER do tenant — **registrado no AuditLog**
- Shell separado no frontend (sidebar escuro)
- `adminFetch()` (não `apiFetch()`)

### Planos (STARTER / PRO / BUSINESS)

- `PlanTier` no `Tenant.plan`
- `PlanConfig` (limits + prices por tier) — editável via `/admin/planos`
- `AddonConfig` (key, limits, prices, requiresTier)
- `UsageCounter` (per-tenant, per-key, per-periodYearMonth)
- `LimitsService` valida limites antes de criar
- `AddonGuard` em endpoints que dependem de add-on
- **Fases 1+2 implementadas. Fases 3+4 pendentes** (cobrança real Asaas/Stripe)

### Site Builder

- Editor: `app/(site)/page.tsx` — drag-resize, `?editor=1&site=<id>&templateId=<id?>&siteApiId=<id?>`
- Persistência: localStorage (key = siteId). Se `templateId` presente, sincroniza com `PATCH /admin/sites/templates/:id`
- Fork de template: copia `contentJson` para `TenantSite` (independente do original)
- Publicação: `contentJson` (rascunho) → `publishedJson` (público) via `POST /sites/:id/publish`
- 4 tipos: `LANDING_PAGE`, `INSTITUCIONAL`, `SITE_IMOBILIARIO`, `PORTAL`
- Blocos imobiliários: `property-search`, `property-grid`, `property-card`, `property-map`, `broker-grid`, `whatsapp-button`, `team-card`, `contact-form`
- Rotas públicas (sem auth): `/sites/public/:slug`, `/sites/public/:slug/products`, `/sites/public/:slug/imovel/:id`, `POST /sites/public/:slug/lead`

### BullMQ Queue Service

- Todas filas inicializadas em `main.ts` após health check Redis
- `QueueService` é compartilhado — workers domínio-específico ficam com squad dono
- `ReminderWorker` (cron `*/5 * * * *`) — fica aqui (genérico)

### Cloudinary

- `initCloudinary()` em `cloudinary/cloudinary-init.ts` — chamado **uma vez** em `main.ts`
- **Nunca** `cloudinary.config()` direto em outro módulo
- Cada domínio usa cloudinary com sua própria policy:
  - Leads: `authenticated` (URL assinada)
  - Produtos/empreendimentos: público
  - WhatsApp media: público

---

## Padrões locais

- `const logger = new Logger('NomeService')`
- Tenant isolation em **todo** findMany/findFirst (`where: { tenantId }`)
- `requireOwner(req)` para configurações de tenant (canais, IA, settings)
- AuditLog em ações sensíveis: impersonation, deleção de tenant, mudança de plano, troca de role
- DTOs em `dto/` quando aplicável
- `AuthenticatedUser` / `JwtPayload` de `auth/types.ts`

## Anti-padrões

- ❌ Omitir `tenantId` em query
- ❌ `cloudinary.config()` direto fora do singleton
- ❌ Mudar JWT/crypto sem squad-seguranca
- ❌ Hardcodar plan/tier — usar `PlanConfig`
- ❌ `findMany` sem soft delete check em modelos que têm (`deletedAt: null`)
- ❌ Impersonation sem AuditLog
- ❌ Permitir AGENT em endpoint OWNER-only

## Pendências conhecidas

- Monetização Fases 3+4 (billing Asaas/Stripe)
- `User.notificationSettings` campo existe mas não conectado
- Permissões configuráveis aplicadas só em produtos (faltam leads, agenda, KB)
- Convite de membro por e-mail (hoje senha inicial manual)
- 2FA TOTP para OWNER
- White-label completo (logo/cor por tenant — parcialmente feito)
- Dashboard de uso por tenant
