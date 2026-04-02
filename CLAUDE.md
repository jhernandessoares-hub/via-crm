# VIA CRM — Guia para Claude

Sistema CRM SaaS multi-tenant para imobiliárias brasileiras. Gerencia leads, funil de vendas, atendimento via WhatsApp com IA, catálogo de imóveis e secretária pessoal por voz/texto.

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
| WhatsApp | Meta Cloud API v20.0 (multi-tenant, por `phone_number_id`) |
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
| `tenants/` | CRUD de tenants, configurações WhatsApp por tenant |
| `users/` | CRUD de usuários, perfis, configurações de secretária |
| `leads/` | CRUD de leads, qualificação, SLA, eventos, soft delete, exportação CSV |
| `pipeline/` | Funil customizável com etapas e transições |
| `products/` | Catálogo imobiliário (EMPREENDIMENTO / IMOVEL), extração IA de PDFs |
| `ingest/` | Normalização e deduplicação de leads de qualquer origem |
| `channels/` | 12 fontes de lead via webhook (Meta Ads, ZAP, OLX, etc.) |
| `ai/` | Serviço unificado de LLM (OpenAI + Anthropic dual-provider) |
| `ai-agents/` | CRUD de agentes IA — bloqueado para plano STARTER (PlanGuard) |
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
| `prisma/` | PrismaService (@Global) |

---

## Workers BullMQ (`apps/api/src/queue/`)

Todos inicializados em `main.ts` após health check do Redis.

| Worker | Fila | Função |
|--------|------|--------|
| `SlaWorker` | `sla-queue` | SLA automático: 2h, 10h, 22h45, 23h-template Meta |
| `InboundAiWorker` | `inbound-ai-queue` | Resposta IA ao lead em tempo real (delay 90s/10s) |
| `WhatsappInboundWorker` | `whatsapp-inbound-queue` | Processa payloads de webhook (3 tentativas, exponential backoff) |
| `WhatsappMediaWorker` | `whatsapp-media-queue` | Download e resolução de mídia (áudio/imagem) via Cloudinary |
| `ReminderWorker` | `reminder-queue` | Lembretes de eventos do calendário 30min antes (cron `*/5 * * * *`) |

---

## Filas e seus jobs

```
sla-queue              → sla-2h | sla-10h | sla-22h45 | sla-23h-template | sla-test
inbound-ai-queue       → inbound-ai
whatsapp-inbound-queue → whatsapp-inbound
whatsapp-media-queue   → whatsapp-media.resolve
reminder-queue         → reminder-check (repeatable, cron */5 * * * *)
```

---

## Modelos Prisma principais

```
PlatformAdmin     → administrador da plataforma SaaS (acima dos tenants)
Tenant            → raiz multi-tenant (plan: STARTER | PREMIUM)
                    whatsappPhoneNumberId, whatsappToken, whatsappVerifyToken (por tenant)
User              → role: OWNER | MANAGER | AGENT
                    passwordResetToken, passwordResetExpiry (recuperação de senha)
Branch            → filial/equipe dentro do tenant
Lead              → com soft delete (deletedAt/deletedBy/deletionReason)
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
```

---

## Autenticação e Segurança

- **JWT access token:** 15 minutos
- **JWT refresh token:** 7 dias (`type: 'refresh'` no payload)
- **Platform Admin JWT:** 8 horas (`isPlatformAdmin: true` no payload)
- **Endpoint refresh:** `POST /auth/refresh` com `{ refreshToken }`
- **Recuperação de senha:** `POST /auth/forgot-password` → email com token 1h; `POST /auth/reset-password`
- **Frontend (`api.ts`):** renova token automaticamente no 401 sem logout
- **JWT Strategy:** valida `sub` no banco a cada request (usuário ativo)
- **PlanGuard:** `@RequiresPlan('PREMIUM')` bloqueia rotas para plano STARTER — aplicado em `ai-agents/`
- **PlatformAdminGuard:** valida `isPlatformAdmin: true` no JWT — rotas `/admin/*`
- **Rate limiting:** 120 req/min global; 10 tent./15min em `/auth/login`; 5 tent./15min em `/auth/register-master` e `/auth/forgot-password`
- **Helmet:** headers de segurança ativos (CSP, HSTS, X-Frame-Options, etc.)
- **Webhook tokens:** armazenados como HMAC-SHA256 (`webhookTokenHash`), com fallback para plaintext em canais antigos
- **HMAC Meta:** verifica `X-Hub-Signature-256` nos webhooks Meta Ads se `appSecret` configurado
- **Soft delete leads:** nunca apaga fisicamente — usa `deletedAt/deletedBy/deletionReason` (LGPD Art. 17)
- **Branch isolation:** role AGENT só vê leads da própria `branchId`
- **`POST /tenants` e `POST /auth/register-master`:** protegidos por `REGISTER_MASTER_SECRET` env
- **`POST /admin/bootstrap`:** protegido por `PLATFORM_ADMIN_SECRET` env (cria primeiro admin)

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
- Frontend: `/admin/*` com shell separado (sidebar escuro), 7 telas

---

## Planos (STARTER / PREMIUM)

- Campo `plan String @default("STARTER")` no Tenant
- **STARTER:** acesso completo exceto Central de Agentes — usa agente padrão VIA
- **PREMIUM:** acesso completo incluindo Central de Agentes (criar/editar agentes, skills, KBs próprias)
- Guard: `PlanGuard` + `@RequiresPlan('PREMIUM')` no controller
- Frontend: tela com cadeado + CTA de upgrade para Starters tentando acessar Central de Agentes

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

## AiService (dual-provider)

`src/ai/ai.service.ts` — suporte a OpenAI e Anthropic no mesmo método `callLLM()`.
- Prefixo `claude-` no model name → usa Anthropic SDK
- Qualquer outro → usa OpenAI
- **Atenção:** `SecretaryService` usa OpenAI diretamente (hardcoded), não passa pelo `AiService`

---

## Padrões de código

- **Logger:** usar `const logger = new Logger('NomeDoServico')` de `../logger`. **Nunca** `console.log` em produção.
- **Tenant isolation:** todo `findMany`/`findFirst` deve ter `where: { tenantId }` e `deletedAt: null` para leads.
- **Role AGENT:** sempre filtrar por `branchId` se disponível.
- **Soft delete:** nunca usar `prisma.lead.delete()` — usar `update({ data: { deletedAt: new Date(), deletedBy, deletionReason } })`.
- **Webhook tokens:** sempre usar `channels.findByToken(token)` — nunca buscar `webhookToken` diretamente no Prisma.
- **Audit:** usar `AuditService.log()` em ações sensíveis (deleção, login, exportação). O serviço é `@Global()` — injetar direto no constructor.
- **Branch resolver:** usar `IngestService.resolveDefaultBranchId(tenantId)` para obter a branch padrão — nunca hardcodar IDs.
- **WhatsApp creds:** sempre usar `resolveWhatsappCreds(prisma, tenantId)` de `whatsapp/whatsapp-creds.ts` — nunca ler `process.env.WHATSAPP_TOKEN` diretamente.
- **Plan guard:** usar `@RequiresPlan('PREMIUM')` + `@UseGuards(JwtAuthGuard, PlanGuard)` para features premium.
- **Platform Admin:** rotas `/admin/*` protegidas por `PlatformAdminGuard` — token separado, nunca misturar com JWT de tenant.
- **Email:** `EmailService` é `@Global()` — injetar direto. Sempre envolto em try/catch para não quebrar fluxo.

---

## Frontend (`apps/web/src/`)

- `lib/api.ts` → função `apiFetch()` centraliza todas as chamadas tenant. Renova token automaticamente (refresh token) antes de redirecionar para login.
- `lib/admin-api.ts` → função `adminFetch()` para chamadas do Platform Admin (usa `adminToken`).
- Tokens tenant em `localStorage`: `accessToken` (15min), `refreshToken` (7d), `user` (objeto do usuário).
- Tokens admin em `localStorage`: `adminToken` (8h), `adminUser`.
- Logout tenant: remove `accessToken`, `refreshToken`, `user` → redireciona `/login`.
- Logout admin: remove `adminToken`, `adminUser` → redireciona `/admin/login`.
- `/settings/whatsapp` → configuração do número WhatsApp do tenant.
- `/forgot-password` e `/reset-password` → recuperação de senha.
- `/admin/*` → painel Platform Admin com shell separado (sidebar escuro).

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
| PlanGuard no controller (não service) | Guard NestJS = interceptado antes do método; mais seguro e menos invasivo que checar no service |
| EmailService graceful degradation | Se `RESEND_API_KEY` não configurado, loga warning e continua sem quebrar o fluxo |

---

## Pendências conhecidas (não implementadas)

- `SecretaryService` não usa o dual-provider do `AiService` — hardcoded para OpenAI
- Verificação HMAC Meta depende do campo `appSecret` no config do canal (opt-in)
- Google Ads cost API (`fetchGoogleCost`) retorna null — OAuth não implementado
- Não há conector com CRMs externos (HubSpot, Salesforce, etc.)
- 2FA para OWNER (TOTP)
- White-label básico (logo/cor por tenant)
- Dashboard de uso por tenant (leads este mês, mensagens, canais)
- Monitoramento de erros por tenant (token WhatsApp expirado, etc.)

---

## Comandos úteis

```bash
# API
cd apps/api
npm run start:dev          # dev com watch
npx prisma studio          # GUI do banco
npx prisma db push         # push schema sem migration (dev)
npx prisma generate        # regenerar client após schema change
npx tsc --noEmit           # checar tipos sem compilar

# Web
cd apps/web
npm run dev                # Next.js dev
```
