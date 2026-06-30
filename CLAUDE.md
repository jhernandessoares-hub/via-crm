# VIA CRM — Guia para Claude

Sistema CRM SaaS multi-tenant para imobiliárias brasileiras. Gerencia leads, funil de vendas, atendimento via WhatsApp com IA, catálogo de imóveis e secretária pessoal por voz/texto.

> **Agents:** este arquivo é o contexto **global** compartilhado por todos os agents. Detalhes específicos de cada domínio ficam em `.claude/agents/<squad>.md`. Plano de squads em `AGENTS_PLAN.md`.

---

## Estrutura do Monorepo

```
via-crm/
├── apps/
│   ├── api/          ← NestJS 11 (porta 3000)
│   └── web/          ← Next.js (porta 3001 dev / 3010 alternativo)
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| API | NestJS 11, TypeScript |
| Banco | PostgreSQL (Railway) via Prisma 5 |
| Fila | BullMQ + Redis |
| IA principal | OpenAI GPT-4o-mini (agentes, secretária) |
| IA extração | Anthropic Claude Haiku (PDFs de produtos) |
| WhatsApp oficial | Meta Cloud API v20.0 (multi-tenant, por `phone_number_id`) |
| WhatsApp Light | Baileys (`@whiskeysockets/baileys`) — conexão via QR Code, multi-sessão por tenant |
| Imagens | Cloudinary |
| Vídeo/áudio | fluent-ffmpeg + ffmpeg-static |
| Auth | JWT (access 15min, refresh 7d) + Platform Admin JWT (8h) |
| Email | Resend (`EmailService` global) |
| Frontend | Next.js 14, React, TypeScript |

---

## Módulos da API (`apps/api/src/`)

| Módulo | Responsabilidade |
|--------|-----------------|
| `auth/` | Login, registro de master, refresh token, JWT Strategy, recuperação de senha |
| `admin/` | Platform Admin — CRUD tenants, impersonation, audit, health |
| `tenants/` | CRUD de tenants, configurações WhatsApp, bot-config e permissões por role (`permissionsConfig`); `GET /tenants/ai-status` (todos os roles — retorna `{ autopilotEnabled }` para uso na UI) |
| `users/` | CRUD de usuários, perfis, configurações de secretária; gestão de equipe (OWNER: POST/PATCH/DELETE /users/team); round-robin config (OWNER: GET/PATCH /users/round-robin) |
| `leads/` | CRUD de leads, qualificação, SLA, eventos, soft delete, exportação CSV; `GET /leads/my` (assignados ao usuário); `GET /leads/counts` (contagem por role para sidebar); `GET /leads/duplicates` (grupos CERTA/POSSIVEL); `GET /leads/search?q=` (autocomplete — busca por nome/telefone/CPF/número, retorna até 10 resultados, respeita isolamento por role); `POST /leads/:id/merge` (mesclar dois leads com escolha campo a campo) |
| `pipeline/` | Funil customizável com etapas e transições |
| `products/` | Catálogo imobiliário (EMPREENDIMENTO / IMOVEL), extração IA de PDFs |
| `ingest/` | Normalização e deduplicação de leads de qualquer origem |
| `channels/` | 12 fontes de lead via webhook (Meta Ads, ZAP, OLX, etc.) |
| `ai/` | Serviço unificado de LLM (OpenAI + Anthropic dual-provider) |
| `ai-agents/` | CRUD de agentes IA — restrito a OWNER do tenant |
| `knowledge-base/` | Bases de conhecimento (docs, vídeos, links, Q&A) |
| `secretary/` | Assistente pessoal IA por WhatsApp (voz + texto) |
| `calendar/` | Eventos com lembretes automáticos por WhatsApp |
| `queue/` | BullMQ workers e serviço de filas |
| `whatsapp/` | Webhook de entrada de mensagens WhatsApp (multi-tenant) |
| `email/` | EmailService global (Resend) — welcome, reset senha, notificações |
| `privacy/` | Endpoints de política de privacidade |
| `owners/` | Proprietários/captadores de imóveis |
| `audit/` | AuditService global — log de ações sensíveis (LGPD) |
| `config/` | Configurações globais |
| `dev/` | Endpoints de desenvolvimento/teste |
| `sites/` | Gerenciador de Sites — templates admin, sites dos tenants, rotas públicas |
| `prisma/` | PrismaService (@Global) |
| `admin/ai-providers.service.ts` | Provedores de IA — CRUD de provedores, configuração de modelo por função, saldo OpenAI |
| `whatsapp-unofficial/` | WhatsApp Light — sessões Baileys multi-tenant (QR Code). Detalhes (filtros, LIDs, reconexão) em futuro `squad-comunicacao.md` |
| `campanhas/` | Disparo WhatsApp Light — modelos, contatos, lead criado só quando contato responde. Detalhes em futuro `squad-comunicacao.md` |
| `inbox/` | Inbox WA Light — conversas/mensagens por `sessionId`. Detalhes em futuro `squad-comunicacao.md` |
| `messaging/` | Envio Meta WhatsApp Cloud API (texto/áudio/imagem/vídeo/documento), upload/download de mídia, conversão de áudio ffmpeg. Extraído de `leads.service.ts` (2026-05-12) |
| `lead-documents/` | Documentos do lead — upload Cloudinary autenticado, classificação IA Claude Vision, cadastro fill, lista/CRUD. Extraído de `leads.service.ts` (2026-05-12). LeadsService delega via injection. |
| `sales-leads/` | Leads comerciais do próprio VIA CRM (site institucional "Falar com vendas") — **nível plataforma, não pertence a tenant**. `POST /sales-leads` (público) cria `SalesLead`; `GET`/`PATCH /admin/sales-leads/:id/status` (PlatformAdminGuard). Não confundir com lead de tenant (`SitesService.submitContactLead`). |

---

## Workers BullMQ (`apps/api/src/queue/`)

Todos inicializados em `main.ts` após health check do Redis.

| Worker | Fila | Função |
|--------|------|--------|
| `SlaWorker` | `sla-queue` | SLA automático: 2h (BAIXA), 10h (MEDIA), 18h (ALTA), 23h (CRITICA) — **somente** leads em grupo `PRE_ATENDIMENTO` e status `EM_CONTATO` |
| `InboundAiWorker` | `inbound-ai-queue` | Resposta IA em tempo real; suporta WA oficial e Light; notifica só `assignedUserId`. Detalhes em `squad-comunicacao.md` |
| `WhatsappInboundWorker` | `whatsapp-inbound-queue` | Processa payloads de webhook (3 tentativas, exponential backoff) |
| `WhatsappMediaWorker` | `whatsapp-media-queue` | Download e resolução de mídia (áudio/imagem) via Cloudinary |
| `ReminderWorker` | `reminder-queue` | Lembretes de eventos do calendário 30min antes (cron `*/5 * * * *`) |
| `CampaignWorker` | `campaign-queue` | Disparo encadeado WA Light — 1 job por vez, valida `onWhatsApp()` antes de enviar, delay aleatório entre `delayMin`/`delayMax` |

---

## Filas e seus jobs

```
sla-queue              → sla-2h | sla-10h | sla-18h | sla-23h | sla-23h-template | sla-test
inbound-ai-queue       → inbound-ai
whatsapp-inbound-queue → whatsapp-inbound
whatsapp-media-queue   → whatsapp-media.resolve
reminder-queue         → reminder-check (repeatable, cron */5 * * * *)
campaign-queue         → campaign-send (encadeado, um por campanha)
```

---

## Modelos Prisma principais

```
PlatformAdmin     → administrador da plataforma SaaS (acima dos tenants)
Tenant            → raiz multi-tenant (plan: STARTER | PREMIUM)
                    whatsappPhoneNumberId, whatsappToken, whatsappVerifyToken (por tenant)
User              → role: OWNER | MANAGER | AGENT | PARTNER
                    PARTNER = Parceiro Externo — acesso configurável pelo OWNER. Default: só leads próprios, catálogo, KB. Sem inbox/campanhas/config.
                    apelido String? — nome de exibição no header; preferences Json? — { theme: 'light'|'dark' }
                    recebeLeads Boolean @default(true) — participa da roleta de distribuição de leads
Branch            → filial/equipe dentro do tenant
LeadDocument      → documentos do lead (RG/CNH/CPF/COMP_RENDA/...) com classificação IA, upload Cloudinary autenticado. Detalhes em squad-atendimento.md
LeadParticipante  → cônjuge/sócio/fiador do lead com dados pessoais e origem (IA|MANUAL). Detalhes em squad-atendimento.md
Lead              → campos de cadastro pessoal: cpf, rg, profissao, empresa, naturalidade, endereco, cep, cidade, uf + cadastroOrigem Json?
                    nomeCorreto String? — nome real confirmado (IA ou humano); nomeCorretoOrigem String? ("IA"|"MANUAL")
                    Regra: quando nomeCorretoOrigem='MANUAL', nenhuma atualização automática (inbound WA ou Assistente Operacional) pode sobrescrever o nomeCorreto
                    Prioridade de exibição: nomeCorreto ?? nome em toda a UI e notificações
                    com soft delete (deletedAt/deletedBy/deletionReason)
                    numero Int? — sequencial por tenant (formatado 6 dígitos na UI via `formatLeadNumber`); reentradaCount Int @default(1) incrementa em reentradas. Ver "Numeração sequencial de leads"
TenantLeadCounter → contador atômico por tenant (tenantId PK, lastNumber Int). Atualizado via upsert+increment em `getNextLeadNumber()` — seguro contra race condition em webhooks concorrentes
LeadEvent         → histórico de interações
LeadSla           → controle de janela 23h WhatsApp
Pipeline          → funil customizável
PipelineStage     → etapas com sortOrder e key
AiAgent           → agente IA (slug, prompt, mode COPILOT/AUTOPILOT) — PREMIUM only
KnowledgeBase     → base de conhecimento (PERSONALIDADE, REGRAS, PRODUTO, etc.)
KbTeaching        → pares Q&A aprovados para aprendizado contínuo
AgentTool         → webhook tools que agentes podem invocar
AiExecutionLog    → log de cada execução de agente
Learning          → sugestões de melhoria (PENDING/APPROVED/REJECTED/APPLIED)
Product           → imóvel/empreendimento com docs, imagens, vídeos, cômodos
Channel           → 12 tipos de fonte de lead com webhookToken e webhookTokenHash
CalendarEvent     → com reminderSentAt para controle de deduplicação
SecretaryConversation → histórico de conversa da secretária (10 msgs de contexto)
AuditLog          → rastreabilidade LGPD — inclui platformAdminId para ações admin
SiteTemplate      → template de site (scope: PADRAO/EXCLUSIVO/INTERNO, siteType, contentJson, status DRAFT/PUBLISHED)
TenantSite        → site do tenant — fork independente do template (contentJson ≠ template após customização)
                    slug único, publishedJson separado do contentJson (rascunho vs publicado)
WhatsappUnofficialSession → sessão Baileys por tenant; status DISCONNECTED|CONNECTING|CONNECTED|QR_PENDING; authStateJson (creds Baileys). FK em Lead/CampanhaDisparo (SetNull)
CampanhaModelo    → template: mensagem com {{nome}}/{{telefone}}, mediaUrl, delayMin/Max (≥10s). Delete bloqueia se disparo ativo
CampanhaDisparo   → status RODANDO|PAUSADA|CONCLUIDA|CANCELADA. ⚠️ Rota `GET /campanhas/disparos/active/:sessionId` deve ficar ANTES de `GET /campanhas/disparos/:id` no controller (NestJS resolve em ordem)
CampanhaContato   → telefone, nome, leadId? (preenchido na resposta), status PENDENTE|ENVIADO|FALHA|RESPONDEU
                    previewMessages Json? — msgs silenciosas pré-resposta (sticker/poll/edited); replayed como LeadEvents com timestamp original antes da resposta real. Detalhes em squad-comunicacao.md
Lead.avatarUrl    → foto de perfil do contato WhatsApp (buscado com timeout 2s via profilePictureUrl do Baileys, salvo no upsert)
Lead.lastReadAt   → timestamp da última vez que um usuário abriu a conversa no inbox (`POST /inbox/:leadId/read`); usado no cálculo de naoLidos
Lead.conversaCanal/conversaSessionId → canal ativo da conversa ('WHATSAPP_OFICIAL'|'WHATSAPP_LIGHT'|null) e FK para sessão Light (onDelete: SetNull)
PlatformConfig    → configurações globais da plataforma (key/value). Chaves: globalAgentRules, agentIdentityRules, whatsappFormattingRules
PlatformConfigHistory → histórico de alterações de PlatformConfig (key, previousValue, newValue, changedAt)
SalesLead         → lead comercial do próprio VIA CRM (site institucional → "Falar com vendas"). Nível plataforma, sem tenantId. Campos: nome, telefone, email?, empresa?, numFuncionarios?, mensagem?, status (NOVO|EM_CONTATO|CONVERTIDO|DESCARTADO), origem. Visível no Platform Admin (/admin/leads-vendas)
AiModelConfig     → modelo configurado por função (function PK: DEFAULT|FOLLOW_UP|PDF_EXTRACTION|TRANSCRIPTION|DOC_CLASSIFICATION, modelName). Chaves de API ficam no .env.
Tenant.permissionsConfig → Json? — permissões configuráveis por role (manager/agent/partner) por módulo/ação. Gerenciado via /settings/permissions (OWNER). Defaults em tenants/permissions.config.ts.
                    Módulos configuráveis (14): leads, products, calendar, secretary, channels, botConfig, settings, pipeline, knowledgeBase, gestao_empreendimentos, inbox (view/send), campanhas (CRUD), duplicados (view/merge), exportacao (export).
Tenant.roundRobinConfig → Json? — configuração da roleta de distribuição de leads: { incluirGerentes: bool, incluirOwner: bool }
RefreshToken      → revogação de refresh token por jti: campos jti (unique), userId, expiresAt, revokedAt? — persiste no banco para invalidação segura
```

---

## Autenticação e Segurança

> **Detalhes completos:** `.claude/agents/squad-seguranca.md`. Resumo essencial abaixo.

- **JWT:** access 15min + refresh 7d (rotation com jti em `RefreshToken`) + Platform Admin 8h
- **JWT Strategy:** valida `sub` no banco a cada request; rejeita refresh usado como access
- **Crypto at-rest:** `Tenant.whatsappToken` cifrado AES-256-GCM via `crypto/field-crypto.util.ts` (prefixo `ENC:`, requer `ENCRYPTION_KEY` 64 hex)
- **Webhook tokens:** HMAC-SHA256 em `Channel.webhookTokenHash` + HMAC Meta `X-Hub-Signature-256` (opt-in via `appSecret`)
- **Cloudinary privado:** `LeadDocument` usa `type: 'authenticated'`, URL assinada 2min via `buildSignedCloudinaryDownloadUrl()`. Singleton em `main.ts` — nunca `cloudinary.config()` direto
- **Cloudinary raw public_id:** recursos `resource_type: 'raw'` (PDFs, docs) guardam a **extensão no public_id** (ex: `pasta/arquivo.pdf`, não `pasta/arquivo`). Ao chamar `private_download_url` para raw, use `publicId + '.' + ext` e `format: ''`. Para image/video o public_id não tem extensão — comportamento oposto. Código de referência: `cloudinary-media.util.ts` (`signCloudinaryUrl`) e `leads.service.ts` (`downloadEventMedia`). Ignorar essa regra causa 404 silencioso no download.
- **LGPD:** soft delete em leads (`deletedAt/deletedBy/deletionReason`), `AuditService` `@Global()` com try/catch silencioso
- **Boundaries:** `REGISTER_MASTER_SECRET` (tenants/master), `PLATFORM_ADMIN_SECRET` (bootstrap), `PlatformAdminGuard` em `/admin/*`
- **Rate limiting:** 120/min global, 10/15min em `/auth/login`, 5/15min em registro e forgot-password. Helmet ativo
- **Tipos:** `AuthenticatedUser` / `JwtPayload` em `auth/types.ts` — nunca `any` em controllers/guards

---

## WhatsApp Multi-tenant

- Credenciais por tenant: `whatsappPhoneNumberId` + `whatsappToken` + `whatsappVerifyToken` no modelo `Tenant`
- Fallback: se tenant sem credenciais próprias, usa env vars `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
- Helper compartilhado: `src/whatsapp/whatsapp-creds.ts` → `resolveWhatsappCreds(prisma, tenantId?)`
- Webhook unificado `/webhooks/whatsapp` roteia pelo `phone_number_id` do payload Meta
- Verify: aceita token do tenant no banco OU o `WHATSAPP_VERIFY_TOKEN` global
- Tela de configuração: `/settings/whatsapp` no frontend

---

## Platform Admin

- Acesso separado dos tenants — modelo `PlatformAdmin` no Prisma
- Login em `/admin/login` → JWT com `isPlatformAdmin: true` armazenado como `adminToken`
- Bootstrap do primeiro admin: `POST /admin/bootstrap` com `PLATFORM_ADMIN_SECRET`
- Endpoints: `/admin/tenants` (CRUD), `/admin/tenants/:id/suspend|activate|plan|impersonate|export`
- Impersonation: gera token temporário (2h) como OWNER do tenant — registrado no AuditLog
- Frontend: `/admin/*` com shell separado (sidebar escuro). Sidebar agrupa "IA" com subitens: Provedores, Agent Templates, Regras Globais
- Endpoints IA: `GET /admin/ai/models` (catálogo), `GET /admin/ai/model-configs`, `PATCH /admin/ai/model-configs/:function`, `DELETE /admin/ai/model-configs/:function`

---

## Planos (STARTER / PREMIUM)

- Campo `plan String @default("PREMIUM")` no Tenant — mantido no banco para uso futuro, sem lógica de bloqueio ativa
- Todos os tenants têm acesso completo a todas as funcionalidades
- `PlanGuard` e `@RequiresPlan` existem no código mas não estão aplicados — modelo de cobrança a definir futuramente
- Novos tenants criados via admin recebem `plan: "PREMIUM"` por padrão

---

## Variáveis de Ambiente necessárias

```env
# Banco
DATABASE_URL=

# Redis
REDIS_HOST=
REDIS_PORT=

# JWT
JWT_SECRET=

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini        # opcional

# Anthropic (extração de PDFs)
ANTHROPIC_API_KEY=

# WhatsApp Meta Cloud API (fallback global)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TEMPLATE_NAME=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=VIA CRM <noreply@viacrm.com.br>
APP_URL=                        # URL do frontend (para links de reset de senha)

# Segurança
REGISTER_MASTER_SECRET=         # protege criação de tenants e master users
WEBHOOK_HMAC_SECRET=            # HMAC dos tokens de webhook
PLATFORM_ADMIN_SECRET=          # bootstrap do primeiro Platform Admin
ENCRYPTION_KEY=                 # 64 chars hex — cifra whatsappToken no banco (AES-256-GCM)

# CORS (separados por vírgula, URLs exatas)
CORS_ALLOWED_ORIGINS=

# Frontend
NEXT_PUBLIC_API_URL=
```

---

## Canais de entrada de leads (ChannelsModule)

12 tipos, cada um com lógica de parsing própria no `channels-webhook.controller.ts`:

- `META_ADS` — chama Graph API para buscar field_data do leadgen_id
- `GOOGLE_ADS`, `YOUTUBE` — mapeia `user_column_data`
- `TIKTOK_ADS` — extrai `data.fields`
- `PORTAL_ZAP`, `PORTAL_VIVAREAL`, `PORTAL_OLX`, `PORTAL_IMOVELWEB` — normaliza objeto de contato
- `LANDING_PAGE`, `FORMULARIO_INTERNO`, `SITE` — mapeamento genérico de JSON

**Deduplicação:** por `telefoneKey` (últimos 9 dígitos). Leads em etapas fechadas (`BASE_FRIA`, `ENTREGA_CONTRATO_REGISTRADO`, `POS_VENDA_IA`) não são reentradas.

---

## Secretária IA (SecretaryModule)

- Modelo: GPT-4o-mini com function calling
- Tools disponíveis: `criar_evento`, `excluir_evento`, `remarcar_evento`, `buscar_lead`, `criar_lead`, `mover_funil`
- Contexto: 10 mensagens por sessão (tabela `SecretaryConversation`)
- Injeta dados reais do CRM no system prompt (leads, produtos, agenda) filtrados por permissão
- Suporta entrada por texto e áudio (Whisper STT)
- Resposta em áudio via OpenAI TTS (voz por gênero: FEMININO=nova, MASCULINO=onyx, NEUTRO=alloy)
- WhatsApp: `secretary/whatsapp.service.ts` identifica se remetente é usuário interno e roteia para secretária

---

## Contexto de Produtos para a IA

`buildProductsBlock()` em `src/ai/ai.service.ts` — monta o bloco de imóveis que é injetado no system prompt dos agentes.

- **Inclui:** título, tipo, finalidade, localização, preços, quartos/suítes/banheiros/vagas, áreas (construção, terreno, privativo), padrão, condomínio, andar, ano, mobiliado, posição solar, comodidades internas, lazer do condomínio, condições financeiras (FGTS, financiamento, permuta, IPTU, taxa condomínio), **ambientes confirmados pelas fotos** (QUARTO, SUITE, etc.) e **características das fotos** (porcelanato, banheira, etc.).
- **Não inclui:** informações do proprietário, documentos do imóvel.
- **Condição:** apenas produtos com `status: ACTIVE` e `publicationStatus: PUBLISHED` são visíveis para a IA.
- **Regra:** sempre que novos campos relevantes forem adicionados ao cadastro de imóvel, adicionar ao `select` e ao bloco de formatação em `buildProductsBlock()` para que a IA tenha acesso.

---

## AiService (dual-provider)

`src/ai/ai.service.ts` — suporte a OpenAI e Anthropic no mesmo método `callLLM()`.
- Prefixo `claude-` no model name → usa Anthropic SDK
- Qualquer outro → usa OpenAI
- **Atenção:** `SecretaryService` usa OpenAI diretamente (hardcoded), não passa pelo `AiService`
- **Regras configuráveis via banco:** `generateFollowUp()` lê `agentIdentityRules` e `whatsappFormattingRules` do `PlatformConfig` com fallback para constantes hardcoded. Editáveis em `/admin/regras-globais` sem deploy.
- **Modelo configurável via banco:** `resolveAiModel(prisma, fn, { allowDefaultFallback })` em `ai/resolve-ai-model.ts`. Cascata: AiModelConfig banco → DEFAULT (se `allowDefaultFallback=true`) → hardcoded. Funções Anthropic (DOC_CLASSIFICATION, PDF_EXTRACTION) usam `allowDefaultFallback: false` — nunca recebem modelo OpenAI.
- **Seed automático:** `seedAiModelDefaults()` no startup — idempotente, nunca sobrescreve configs existentes.

---

## Padrões de código

- **Logger:** usar `const logger = new Logger('NomeDoServico')` de `../logger`. **Nunca** `console.log` em produção.
- **Tenant isolation:** todo `findMany`/`findFirst` deve ter `where: { tenantId }` e `deletedAt: null` para leads.
- **Role AGENT/PARTNER:** AGENT filtra por `assignedUserId` (ou `branchId` se disponível); PARTNER sempre filtra por `assignedUserId` — nunca tem acesso à filial inteira.
- **Soft delete:** nunca usar `prisma.lead.delete()` — usar `update({ data: { deletedAt: new Date(), deletedBy, deletionReason } })`.
- **Webhook tokens:** sempre usar `channels.findByToken(token)` — nunca buscar `webhookToken` diretamente no Prisma.
- **Audit:** usar `AuditService.log()` em ações sensíveis (deleção, login, exportação). O serviço é `@Global()` — injetar direto no constructor.
- **Branch resolver:** usar `IngestService.resolveDefaultBranchId(tenantId)` para obter a branch padrão — nunca hardcodar IDs.
- **WhatsApp creds:** sempre usar `resolveWhatsappCreds(prisma, tenantId)` de `whatsapp/whatsapp-creds.ts` — nunca ler `process.env.WHATSAPP_TOKEN` diretamente.
- **Role guard (tenant):** usar `requireOwner(req)` inline nos controllers para restringir a OWNER — padrão adotado em ai-agents, channels, tenants, users/team.
- **Permissões configuráveis:** usar `GET /tenants/permissions-public` + `usePermissions()` no frontend. OWNER tem bypass total. `resolvePermissions()` em `permissions.config.ts` mescla defaults — novos módulos aparecem automaticamente.
- **Platform Admin:** rotas `/admin/*` protegidas por `PlatformAdminGuard` — token separado, nunca misturar com JWT de tenant.
- **Email:** `EmailService` é `@Global()` — injetar direto. Sempre em try/catch para não quebrar fluxo.
- **Scripts fora de `src/`:** adicionar ao `exclude` de `apps/api/tsconfig.build.json` — caso contrário muda `rootDir` e quebra deploy no Railway (output vai para `dist/src/main.js` em vez de `dist/main.js`).

---

## Frontend (`apps/web/src/`)

- `lib/api.ts` → função `apiFetch()` centraliza todas as chamadas tenant. Renova token automaticamente (refresh token) antes de redirecionar para login.
- **Dark mode:** toggled via classe `dark` no `<html>`. Preferência salva em `user.preferences.theme` (`PATCH /users/me`). `applyTheme()` em AppShell sincroniza na inicialização e na troca.
- **AppShell sidebar:** nome do tenant + avatar dropdown ("Meus Dados"/"Sair"); badges contagem leads (`GET /leads/counts`, 60s); "Funil de Vendas" colapsável (localStorage `sidebar_funnel_open`).
- **Modal "Meus Dados":** nome, email, apelido, senha, toggle tema. Overlay usa `style={{ backgroundColor: "rgba(0,0,0,0.55)" }}` (Tailwind v4 não suporta `bg-black/40`).
- **Modal de boas-vindas (WelcomeModal):** exibido no 1º login (`preferences?.welcomeSeen !== true`). Fecha gravando `{ welcomeSeen: true }` via `PATCH /users/me`. Cards variam por role: AGENT 4, MANAGER +2, OWNER +4, PARTNER 2.
- **Visibilidade de leads por role:** AGENT/PARTNER veem só `assignedUserId = me`; MANAGER vê filial (`branchId`); OWNER vê tudo. Em `LeadsService.list()`.
- **Atribuição manual:** OWNER/MANAGER veem `<select>` de equipe (`POST /leads/:id/assign`); AGENT/PARTNER veem somente-leitura.
- `lib/admin-api.ts` → `adminFetch()` para Platform Admin (usa `adminToken`).
- Tokens em localStorage: tenant (`accessToken` 15min, `refreshToken` 7d, `user`) e admin (`adminToken` 8h, `adminUser`). Logout remove os respectivos e redireciona `/login` (tenant) ou `/admin/login` (admin).
- **EnvBanner** (`components/EnvBanner.tsx`): laranja em local, âmbar em dev, invisível em prod. Incluída no AppShell e shell admin.

### Páginas de produto — três tipos independentes

| Página de edição | Página de criação | Tipo |
|------------------|-------------------|------|
| `app/products/[id]/page.tsx` | `app/products/new/imovel/page.tsx` | Imóvel (casa, apto, lote, barracão…) |
| `app/products/[id]/empreendimento/page.tsx` | `app/products/new/empreendimento/page.tsx` | Empreendimento (condomínio, lançamento) |
| `app/products/[id]/loteamento/page.tsx` | `app/products/new/loteamento/page.tsx` | Loteamento |

**Seletor:** `app/products/new/page.tsx` — tela de escolha entre os 3 tipos.

**Redirecionamentos:** cada página verifica o `type` do produto ao carregar e redireciona para a página correta se necessário.

**Regra:** cada tipo tem formulário independente. Mudanças só precisam ser replicadas se a funcionalidade for comum aos três tipos.

**Página de imóvel (`[id]/page.tsx`) — sistema de seções:**
- 8 seções (Identificação, Fotos, Ambientes, Localização, Valores, Proprietário, Documentação, Título e Descrição)
- Cada seção tem botões "Salvar seção" e "Terminar depois"
- Status: `DONE` (verde) = totalmente preenchido, `INCOMPLETE` (laranja) = salvo com campos vazios, `PENDING` (amarelo) = terminar depois
- Modal de confirmação lista os campos vazios antes de salvar
- `sectionStatus` é salvo no banco via `updateProduct` e recarregado ao abrir o imóvel
- Campos de área (`privateAreaM2`, `landAreaM2`) com input fluido (máscara brasileira) e botão N/A — ficam na Seção 1
- Seção 2 exige mínimo 4 fotos; Seção 6 exige pelo menos 1 proprietário vinculado
- Footer: [Código interno] [Recarregar] [Salvar] à esquerda | [Status] [Publicação] à direita
- `products.service.ts`: `update()` persiste `sectionStatus` no banco
- `/equipe` → gestão de equipe (OWNER only) — ver membros, convidar, editar role (MANAGER/AGENT/PARTNER), ativar/desativar, redefinir senha; painel de configuração da roleta (incluirGerentes/incluirOwner); toggle `recebeLeads` por membro.
- `/meus-leads` → leads atribuídos ao usuário logado (todos os roles) — usa `GET /leads/my`.
- `/leads/duplicados` → detecção e resolução de duplicados (OWNER/MANAGER) — grupos CERTA (mesmo telefone/CPF) e POSSIVEL (Jaro-Winkler ≥ 0.80); merge transfere eventos/docs/participantes e faz soft-delete com `LEAD_MERGE`; merge manual via dois `LeadSearchInput`. Detalhes em `squad-atendimento.md`.
- `/settings/permissions` → permissões por role (OWNER only) — 3 colunas (Gerente / Corretor / Parceiro), toggles por módulo/ação para MANAGER, AGENT e PARTNER. 14 módulos configuráveis. Novos módulos adicionados em `tenants/permissions.config.ts` aparecem automaticamente.
- `/settings/whatsapp` → configuração do número WhatsApp do tenant.
- `/forgot-password` e `/reset-password` → recuperação de senha.
- `/admin/*` → painel Platform Admin com shell separado (sidebar escuro).
- `/admin/site` → Gerenciador de Sites (Platform Admin) — CRUD de SiteTemplates via API.
- `/admin/regras-globais` → módulo de Regras Globais — edita globalAgentRules, agentIdentityRules, whatsappFormattingRules com dupla confirmação e histórico.
- `/admin/leads-vendas` → Leads de Vendas (Platform Admin) — lista os `SalesLead` do site institucional, troca de status e link WhatsApp por contato.
- `/admin/ia/provedores` → Provedores de IA — configuração de modelo por função do sistema (DEFAULT, FOLLOW_UP, PDF_EXTRACTION, TRANSCRIPTION, DOC_CLASSIFICATION) sem deploy. DOC_CLASSIFICATION e PDF_EXTRACTION restritos a modelos Anthropic (visão).
- `/gestao-empreendimentos` → Módulo de Gestão de Empreendimentos (OWNER only) — 4 abas (Cadastro, Espelho de Vendas, Preços, Dashboard). Backend: `DevelopmentsModule`. Espelho: grid colorido por status; unidades têm `leadId` FK; trocar unidade via `EspelhoSelectorModal` (popup full-screen); OWNER bypass de etapa no `developments.service.ts`. Detalhes completos em `squad-gestao-empreendimentos.md`.
- `/my-site` → Gerenciador de Sites do tenant (OWNER only) — 1 site por tenant, fluxo adaptado com/sem site ativo; Publicar/Tirar do ar ficam em Configurações.
- `/s/[slug]` → Site público (SSR, `revalidate: 60`) — renderiza `publishedJson` do TenantSite.
- `/s/[slug]/imovel/[id]` → Detalhe público de imóvel — busca produto via `/sites/public/:slug/imovel/:id`.

### Arquitetura do Site Builder

| Conceito | Detalhe |
|----------|---------|
| Editor | `app/(site)/page.tsx` — editor visual drag-resize. Parâmetros: `?editor=1&site=<id>&templateId=<id?>&siteApiId=<id?>` |
| Persistência do editor | localStorage (chave = siteId). Se `templateId` presente, também sincroniza com `PATCH /admin/sites/templates/:id` ao salvar/publicar |
| Fork de template | Quando tenant escolhe template, `contentJson` é copiado para `TenantSite` — independente do original |
| Publicação | `contentJson` (rascunho) → `publishedJson` (público) via `POST /sites/:id/publish` |
| Despublicar/Desativar | `POST /sites/:id/unpublish` (volta a rascunho) e `POST /sites/:id/deactivate` (arquiva) |
| Editor sidebar | Abas structure (seções) / element (bloco selecionado); confirmação dupla ao publicar |
| Editor sincronização | Antes de abrir o editor, `contentJson` é carregado do servidor (não só localStorage) |
| Tipos de site | LANDING_PAGE, INSTITUCIONAL, SITE_IMOBILIARIO, PORTAL — cada um com seed de seções/blocos específico (todas incluem seção header por padrão) |
| Blocos imobiliários | property-search, property-grid, property-card, property-map, broker-grid, whatsapp-button, team-card, contact-form |
| Rotas públicas (sem auth) | `GET /sites/public/:slug`, `GET /sites/public/:slug/products`, `GET /sites/public/:slug/imovel/:id`, `POST /sites/public/:slug/lead` |

---

## Decisões técnicas relevantes

| Decisão | Motivo |
|---------|--------|
| Soft delete em leads | LGPD Art. 17 — direito ao esquecimento com rastreabilidade |
| JWT 15min + refresh 7d | Janela de comprometimento reduzida sem degradar UX |
| Platform Admin JWT separado | Token diferente do tenant evita privilege escalation acidental |
| HMAC nos webhook tokens | Se o banco vazar, tokens são inúteis sem o `WEBHOOK_HMAC_SECRET` |
| BullMQ para Reminder (não setInterval) | Persistência no Redis — restart do processo não perde o ciclo |
| Branch isolation no list() | LGPD — AGENT não pode ver leads de outras filiais |
| `resolveDefaultBranchId()` dinâmico | Compatibilidade multi-tenant real — sem IDs hardcoded |
| AuditLog nunca quebra o fluxo | try/catch silencioso no `AuditService.log()` |
| WhatsApp por phone_number_id | Cada tenant tem seu próprio número Meta; inbound worker resolve tenant pelo `phone_number_id` do payload |
| EmailService graceful degradation | Se `RESEND_API_KEY` não configurado, loga warning e continua sem quebrar o fluxo |
| `resolveAiModel(prisma, fn)` centralizado | Todos os serviços usam o mesmo helper — modelo configurável via banco sem deploy, sem divergência |
| classify-bulk assíncrono (setImmediate) | Upload síncrono (retorna imediato) + classificação IA em background — evita timeout de request para lotes grandes; frontend faz polling a cada 5s |
| `allowDefaultFallback: false` em funções Anthropic | DOC_CLASSIFICATION e PDF_EXTRACTION não podem receber modelo OpenAI via fallback DEFAULT — quebraria o Anthropic SDK |
| `<button>` não pode conter `<button>` | Accordions com botões internos usam `<div role="button">` no wrapper externo — evita erro de hidratação Next.js 16 |
| Permissões por JSON no Tenant | Sem tabela extra — `permissionsConfig Json?` no Tenant; `resolvePermissions()` mescla com defaults para novos módulos aparecerem automaticamente |
| Produtos: delete hierárquico | AGENT não exclui, MANAGER só exclui de AGENT, OWNER exclui tudo — verificação assíncrona do role do dono no `remove()` |
| Canais/Config.IA/Settings OWNER-only | Configurações de tenant não devem ser visíveis/editáveis por operadores — protegido em frontend (sidebar) e backend (requireOwner) |
| Round-robin por "último recebeu" ASC | Sem contador dedicado — ordena candidatos elegíveis por data do último lead assignado ASC; auto-corretivo, eficiente |
| InboundAiWorker notifica só assignedUser | Evita spam — apenas o responsável pelo lead recebe notificação. Ver detalhes em `squad-comunicacao.md` |
| WhatsApp Light — filtros/LID/JID/desconexão | Regras detalhadas em `squad-comunicacao.md` (seções WhatsApp Light e Workers) |
| Campanha — fluxo de lead e msgs silenciosas | Lead criado só na resposta; previews replayed antes do evento real. Detalhes em `squad-comunicacao.md` |
| Inbox WA Light — sidebar e canais unofficial | 5 abas, polling 5s, `isOutgoing()` por canal. Detalhes em `squad-comunicacao.md` |
| Painel da IA oculto quando IA desligada | `GET /tenants/ai-status` expõe `autopilotEnabled`. Detalhes em `squad-ia.md` |
| Avatar clicável no inbox e no lead | `showAvatarModal`/`showPhotoModal` — só abre se `avatarUrl` existir. Preservar em refatores. Ver `squad-comunicacao.md` |
| Tailwind v4 sem opacidade em bg-black/40 | Modificador de opacidade não funciona de forma confiável — usar `style={{ backgroundColor: "rgba(...)" }}` para overlays |
| `router.push/replace` em Next.js 16 + React 19 | Envolto em `startTransition(() => router.replace(...))` para evitar "Router action dispatched before initialization" |
| Modais não fecham ao clicar fora | Fecham SOMENTE via botão explícito (X, Cancelar, Fechar). Backdrop sem onClick. Regra em Modal.tsx (componente global) |
| `localStorage` nunca lido durante o render | Sempre em `useEffect` + `useState` — leitura síncrona causa hidratação incorreta |
| Duplicados — lógica de grupos CERTA/POSSIVEL | Detalhes em `squad-atendimento.md` (seção Detecção de duplicados) |

---

## Distribuição de Leads (Round-Robin)

> **Detalhes:** `.claude/agents/squad-atendimento.md`. Resumo: `IngestService.roundRobinAssign()` na criação ordena candidatos (`ativo=true, recebeLeads=true`) por último lead recebido ASC. Config em `Tenant.roundRobinConfig` (incluirGerentes/incluirOwner). Reatribuição manual: `POST /leads/:id/assign` (OWNER/MANAGER).

---

## Numeração sequencial de leads (por tenant)

- **Escopo:** cada tenant tem seu contador independente em `TenantLeadCounter` (1, 2, 3...). Não há numeração global.
- **Helper:** `getNextLeadNumber(prismaOrTx, tenantId)` em `apps/api/src/leads/lead-numbering.helper.ts`. Faz `upsert` + `increment` atômico no Postgres — seguro para webhooks concorrentes. Chamar **dentro** da transação que cria o `Lead`, passando o `tx`.
- **Onde gerar `numero`:** só em criação real — `IngestService.ingestLead()`, `LeadsService.create()`, `ChannelsWebhookController.receive()`, `SitesService.submitContactLead()`, `SecretaryService.criar_lead`, `upsertLeadFromWhatsapp()`.
- **Reentrada:** quando o lead já existe (mesmo `telefoneKey`, não está em etapa fechada) **NÃO gera novo número** — incrementar `reentradaCount: { increment: 1 }` no `update`. Mensagens de sistema do WhatsApp (`type === 'system'`) não contam como reentrada.
- **Apagou → pula.** Soft-delete preserva o número (lead sumiu da UI mas o número está ocupado). Contador só sobe, nunca recicla.
- **Formato na UI:** sempre via `formatLeadNumber(numero, reentradaCount)` em `apps/web/src/lib/format-lead-number.ts` — retorna `"000010"` (1ª vez) ou `"000010 - 2x"` (reentradas). String vazia se `numero` é null/0 (lead pré-backfill).
- **Backfill:** `apps/api/scripts/backfill-lead-numbers.ts` — idempotente, numera leads existentes por tenant ordenados por `criadoEm ASC`. Rodar com `npx ts-node scripts/backfill-lead-numbers.ts` após `prisma db push`.
- **Schema:** `Lead.numero Int?` (nullable para conviver com leads pré-backfill — `@@unique([tenantId, numero])` permite múltiplos NULLs no Postgres). Após backfill todos os leads ficam com número.

---

## Pendências conhecidas (não implementadas)

> Lista completa em `.claude/agents/orquestrador.md` — seção "Pendências conhecidas".

---

## Comandos úteis

```bash
# API
cd apps/api
npm run start:dev          # dev com watch
npx prisma studio          # GUI do banco
npx prisma db push         # push schema sem migration (dev)
npx prisma generate        # regenerar client após schema change
npx tsc --noEmit           # checar tipos sem compilar (usa tsconfig.json)
npx tsc -p tsconfig.build.json --noEmit  # checar tipos do build de prod (exclui scripts/)

# Web
cd apps/web
npm run dev                # Next.js dev (porta 3001)
```

### Bootstrap do Platform Admin (primeiro acesso / banco limpo)

Se a tabela `PlatformAdmin` estiver vazia, o login `/admin/login` retorna "Credenciais inválidas". Solução:

1. Garantir que `PLATFORM_ADMIN_SECRET` esteja definido no `apps/api/.env`
2. Reiniciar a API para carregar o env
3. Chamar o bootstrap:

```bash
curl -s -X POST http://localhost:3000/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@viacrm.com","senha":"admin123","nome":"Admin","secret":"SEU_PLATFORM_ADMIN_SECRET"}'
```

Ou criar direto via Prisma (sem reiniciar a API):

```bash
node -e "
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
bcrypt.hash('admin123', 10).then(h => p.platformAdmin.create({ data: { email: 'admin@viacrm.com', senhaHash: h, nome: 'Admin', ativo: true } })).then(a => { console.log('criado:', a.email); p.\$disconnect(); });
"
```
