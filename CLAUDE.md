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
| `tenants/` | CRUD de tenants, configurações WhatsApp, bot-config e permissões por role (`permissionsConfig`) |
| `users/` | CRUD de usuários, perfis, configurações de secretária; gestão de equipe (OWNER: POST/PATCH/DELETE /users/team); round-robin config (OWNER: GET/PATCH /users/round-robin) |
| `leads/` | CRUD de leads, qualificação, SLA, eventos, soft delete, exportação CSV; `GET /leads/my` (assignados ao usuário); `GET /leads/counts` (contagem por role para sidebar) |
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
| `whatsapp-unofficial/` | WhatsApp Light — sessões Baileys multi-tenant (QR Code), envio de texto/imagem/vídeo, inbound de mensagens; filtros: ignora @g.us (grupos), status@broadcast, @newsletter e reações; mensagens de sistema do protocolo WA (`protocolMessage`, `senderKeyDistributionMessage`, `callLogMessage`) retornam type `'system'` com texto descritivo — evento salvo mas sem acionar IA/SLA; `profilePictureUrl` com timeout 2s; desconexão manual via flag `manuallyDisconnected` não reconecta automaticamente; resolve LIDs via mapa `lidToPhone` (populado por `contacts.upsert`/`contacts.update`), com fallback para dígitos do LID se mapeamento ainda não disponível |
| `campanhas/` | Campanhas de disparo via WhatsApp Light — CRUD modelos (com mídia), CRUD disparos, contatos (leads ou lista externa), controle start/pause/resume/cancel, variáveis `{{nome}}`/`{{telefone}}`; lead criado **somente quando contato responde** (não ao enviar); ao responder, evento da mensagem original da campanha é registrado no lead (2s antes do inbound) para contexto da IA |
| `inbox/` | Inbox WA Light — lista conversas por sessão (`GET /inbox?sessionId=X`), mensagens paginadas, envio (`POST /inbox/:leadId/send`), marcar como lida (`POST /inbox/:leadId/read`); filtra por `conversaSessionId`; naoLidos calculado em 2 queries (não N+1); `GET /inbox/:leadId` retorna `avatarUrl` |

---

## Workers BullMQ (`apps/api/src/queue/`)

Todos inicializados em `main.ts` após health check do Redis.

| Worker | Fila | Função |
|--------|------|--------|
| `SlaWorker` | `sla-queue` | SLA automático: 2h (BAIXA), 10h (MEDIA), 18h (ALTA), 23h (CRITICA) — **somente** leads em grupo `PRE_ATENDIMENTO` e status `EM_CONTATO` |
| `InboundAiWorker` | `inbound-ai-queue` | Resposta IA ao lead em tempo real — suporta canais `whatsapp.in` e `whatsapp.unofficial.in`; envia via `WhatsappUnofficialService` quando `lead.conversaCanal === 'WHATSAPP_LIGHT'`; cooldown verifica `whatsapp.out` e `whatsapp.unofficial.out`; contexto da conversa inclui mensagens unofficial; notifica **somente o usuário assignado** (`assignedUserId`) |
| `WhatsappInboundWorker` | `whatsapp-inbound-queue` | Processa payloads de webhook (3 tentativas, exponential backoff) |
| `WhatsappMediaWorker` | `whatsapp-media-queue` | Download e resolução de mídia (áudio/imagem) via Cloudinary |
| `ReminderWorker` | `reminder-queue` | Lembretes de eventos do calendário 30min antes (cron `*/5 * * * *`) |
| `CampaignWorker` | `campaign-queue` | Disparo encadeado de campanhas WhatsApp Light — um job por vez, agenda próximo com delay aleatório entre `delayMin` e `delayMax` |

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
User              → role: OWNER | MANAGER | AGENT
                    passwordResetToken, passwordResetExpiry (recuperação de senha)
                    apelido String? — nome de exibição (mostrado no header em vez do nome completo se preenchido)
                    preferences Json? — preferências do usuário: { theme: 'light' | 'dark' }
                    recebeLeads Boolean @default(true) — participa da roleta de distribuição de leads
Branch            → filial/equipe dentro do tenant
LeadDocument      → documentos solicitados para o lead: tipo (RG|CNH|CPF|COMP_RENDA|COMP_ENDERECO|FGTS|DECL_IR|CERT_ESTADO_CIVIL|CONTRATO_TRABALHO|OUTRO), nome, status (PENDENTE|ENVIADO), url/publicId Cloudinary
                    participanteNome String? — nome do participante dono do documento (null = lead principal)
                    participanteClassificacao String? — classificação do participante (CONJUGE|SOCIO|FIADOR|OUTRO)
                    classificadoPorIA Boolean @default(false) — documento foi classificado automaticamente pela IA
                    pendingReview Boolean @default(false) — documento aguarda revisão humana (não enquadrado pela IA)
                    observacao String? — observação sobre o documento
                    Endpoints: GET/POST /leads/:id/documents, PATCH /leads/:id/documents/:docId, POST /leads/:id/documents/:docId/upload, DELETE /leads/:id/documents/:docId
                    POST /leads/:id/documents/toggle-na — marcar tipo como não aplicável
                    POST /leads/:id/documents/classify-bulk — upload em massa: fase 1 síncrona (Cloudinary, retorna imediatamente com pendingReview=true) + fase 2 background (IA classifica sem bloquear o request); frontend polling a cada 5s
                    POST /leads/:id/ai-cadastro — preenche campos de cadastro lendo documentos enviados (Claude vision)
LeadParticipante  → participantes do lead além do lead principal (@@map("lead_participantes"))
                    campos: nome, classificacao (CONJUGE|SOCIO|FIADOR|OUTRO), dados pessoais (cpf, rg, profissao, empresa, renda, naturalidade, endereco, cep, cidade, uf, estadoCivil, dataNascimento, telefone, email)
                    cadastroOrigem Json? — mapa de origem por campo: { cpf: "IA"|null, rg: "IA"|null, ... }
                    Endpoints: GET/POST /leads/:id/participantes, PATCH/DELETE /leads/:id/participantes/:partId
Lead              → campos de cadastro pessoal: cpf, rg, profissao, empresa, naturalidade, endereco, cep, cidade, uf + cadastroOrigem Json?
                    nomeCorreto String? — nome real confirmado (IA ou humano); nomeCorretoOrigem String? ("IA"|"MANUAL")
                    Prioridade de exibição: nomeCorreto ?? nome em toda a UI e notificações
                    com soft delete (deletedAt/deletedBy/deletionReason)
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
WhatsappUnofficialSession → sessão Baileys por tenant (múltiplas por tenant): nome, status (DISCONNECTED|CONNECTING|CONNECTED|QR_PENDING), qrCode base64, phoneNumber, pushName, authStateJson (creds+keys Baileys). FK em Lead (onDelete: SetNull) e CampanhaDisparo (onDelete: SetNull)
CampanhaModelo    → template de campanha: nome, mensagem ({{nome}}/{{telefone}}), mediaUrl, mediaType, delayMinSegundos (≥5), delayMaxSegundos. Delete bloqueia se há disparo ativo; remove histórico de disparos antes de deletar
CampanhaDisparo   → disparo de campanha: sessionId? (nullable, onDelete: SetNull), modeloId, status (RODANDO|PAUSADA|CONCLUIDA|CANCELADA), contadores. Rota `GET /campanhas/disparos/active/:sessionId` deve ficar ANTES de `GET /campanhas/disparos/:id` no controller (NestJS resolve em ordem)
CampanhaContato   → contato de campanha: telefone, nome, leadId? (preenchido quando contato responde), status (PENDENTE|ENVIADO|FALHA|RESPONDEU), enviadoEm, respondeuEm
Lead.avatarUrl    → foto de perfil do contato WhatsApp (buscado com timeout 2s via profilePictureUrl do Baileys, salvo no upsert)
Lead.lastReadAt   → timestamp da última vez que um usuário abriu a conversa no inbox (`POST /inbox/:leadId/read`); usado no cálculo de naoLidos
Lead.conversaCanal/conversaSessionId → canal ativo da conversa ('WHATSAPP_OFICIAL'|'WHATSAPP_LIGHT'|null) e FK para sessão Light (onDelete: SetNull)
PlatformConfig    → configurações globais da plataforma (key/value). Chaves: globalAgentRules, agentIdentityRules, whatsappFormattingRules
PlatformConfigHistory → histórico de alterações de PlatformConfig (key, previousValue, newValue, changedAt)
AiModelConfig     → modelo configurado por função (function PK: DEFAULT|FOLLOW_UP|PDF_EXTRACTION|TRANSCRIPTION|DOC_CLASSIFICATION, modelName). Chaves de API ficam no .env.
Tenant.permissionsConfig → Json? — permissões configuráveis por role (manager/agent) por módulo/ação. Gerenciado via /settings/permissions (OWNER). Defaults em tenants/permissions.config.ts.
Tenant.roundRobinConfig → Json? — configuração da roleta de distribuição de leads: { incluirGerentes: bool, incluirOwner: bool }
RefreshToken      → revogação de refresh token por jti: campos jti (unique), userId, expiresAt, revokedAt? — persiste no banco para invalidação segura
```

---

## Autenticação e Segurança

- **JWT access token:** 15 minutos
- **JWT refresh token:** 7 dias (`type: 'refresh'` no payload) — revogação por jti: login persiste jti no banco, refresh valida+revoga+emite novo (rotation), logout revoga
- **Platform Admin JWT:** 8 horas (`isPlatformAdmin: true` no payload)
- **Endpoint refresh:** `POST /auth/refresh` com `{ refreshToken }`
- **Endpoint logout:** `POST /auth/logout` com `{ refreshToken }` — revoga jti no banco antes de responder
- **Recuperação de senha:** `POST /auth/forgot-password` → email com token 1h; `POST /auth/reset-password`
- **Frontend (`api.ts`):** renova token automaticamente no 401; `apiLogout()` revoga no servidor antes de limpar localStorage; AppShell usa `apiLogout()` no logout
- **JWT Strategy:** valida `sub` no banco a cada request; rejeita refresh tokens usados como access tokens (campo `type`)
- **AuthenticatedUser / JwtPayload:** interfaces em `auth/types.ts` — usar em controllers e guards no lugar de `any`
- **PlanGuard:** existe no código mas **não está aplicado** — lógica de planos removida, todos os tenants têm acesso total
- **PlatformAdminGuard:** valida `isPlatformAdmin: true` no JWT — rotas `/admin/*`
- **Rate limiting:** 120 req/min global; 10 tent./15min em `/auth/login`; 5 tent./15min em `/auth/register-master` e `/auth/forgot-password`
- **Helmet:** headers de segurança ativos (CSP, HSTS, X-Frame-Options, etc.)
- **Webhook tokens:** armazenados como HMAC-SHA256 (`webhookTokenHash`), com fallback para plaintext em canais antigos
- **HMAC Meta:** verifica `X-Hub-Signature-256` nos webhooks Meta Ads se `appSecret` configurado
- **Soft delete leads:** nunca apaga fisicamente — usa `deletedAt/deletedBy/deletionReason` (LGPD Art. 17)
- **Branch isolation:** role AGENT só vê leads da própria `branchId`
- **`POST /tenants` e `POST /auth/register-master`:** protegidos por `REGISTER_MASTER_SECRET` env
- **`POST /admin/bootstrap`:** protegido por `PLATFORM_ADMIN_SECRET` env (cria primeiro admin)
- **WhatsApp token encrypt-at-rest:** `Tenant.whatsappToken` armazenado cifrado (AES-256-GCM, prefixo `ENC:`). `field-crypto.util.ts` em `src/crypto/`; `resolveWhatsappCreds` decifra ao ler; `tenants.service` cifra ao salvar. Requer `ENCRYPTION_KEY` (64 chars hex). Graceful degradation sem chave (loga warning, continua sem cifrar).
- **Cloudinary documentos privados:** uploads de `LeadDocument` usam `type: 'authenticated'` — URL direta nunca funciona sem assinatura. `viewDocument` gera URL assinada (validade 2 min) via `buildSignedCloudinaryDownloadUrl()`. Imagens de produto e mídia WhatsApp continuam públicas.
- **Cloudinary singleton:** `initCloudinary()` em `cloudinary/cloudinary-init.ts`, chamado uma vez no `main.ts`. Nenhum módulo chama `cloudinary.config()` diretamente.

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
- **Modelo configurável via banco:** `resolveAiModel(prisma, fn, { allowDefaultFallback })` em `ai/resolve-ai-model.ts` — consultado por TODOS os serviços que usam IA. Cascata: AiModelConfig do banco → DEFAULT (se allowDefaultFallback=true) → padrão hardcoded. Funções com provider fixo (DOC_CLASSIFICATION, PDF_EXTRACTION) usam `allowDefaultFallback: false` para não receber modelos OpenAI acidentalmente. Configurável em `/admin/ia/provedores` sem deploy.
- **Seed automático:** `seedAiModelDefaults()` roda no startup da API (main.ts) — popula AiModelConfig com padrões se ainda não existirem. Idempotente, nunca sobrescreve configurações existentes.

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
- **Role guard (tenant):** usar `requireOwner(req)` inline nos controllers para restringir a OWNER — padrão adotado em ai-agents, channels, tenants, users/team.
- **Permissões configuráveis:** usar `GET /tenants/permissions-public` + hook `usePermissions()` do frontend para verificar permissões de MANAGER/AGENT. Nunca hardcodar restrições que deveriam ser configuráveis.
- **Platform Admin:** rotas `/admin/*` protegidas por `PlatformAdminGuard` — token separado, nunca misturar com JWT de tenant.
- **Email:** `EmailService` é `@Global()` — injetar direto. Sempre envolto em try/catch para não quebrar fluxo.

---

## Frontend (`apps/web/src/`)

- `lib/api.ts` → função `apiFetch()` centraliza todas as chamadas tenant. Renova token automaticamente (refresh token) antes de redirecionar para login.
- **Dark mode:** toggled via classe `dark` no `<html>`. Preferência salva em `user.preferences.theme` (`PATCH /users/me`). `applyTheme()` em AppShell sincroniza na inicialização e na troca.
- **AppShell sidebar:** exibe nome do tenant abaixo do logo; avatar com dropdown ("Meus Dados", "Sair"); badges de contagem de leads (`GET /leads/counts`, atualizado a cada 60s) ao lado de "Meus Leads" e "Todos os Leads"; seção "Funil de Vendas" colapsável (estado em `localStorage` key `sidebar_funnel_open`).
- **Modal "Meus Dados":** nome, email, apelido, trocar senha (validação `senhaAtual` no backend), toggle tema Claro/Escuro. Usa `style={{ backgroundColor: "rgba(0,0,0,0.55)" }}` no overlay (Tailwind v4 não suporta `bg-black/40` de forma confiável).
- **Visibilidade de leads por role:** AGENT vê apenas leads com `assignedUserId = me`; MANAGER vê todos da filial (`branchId`); OWNER vê todos. Implementado em `LeadsService.list()`.
- **Atribuição manual:** campo "Responsável" no detalhe do lead — OWNER/MANAGER veem `<select>` com membros da equipe (chama `POST /leads/:id/assign`); AGENT vê nome somente-leitura.
- `lib/admin-api.ts` → função `adminFetch()` para chamadas do Platform Admin (usa `adminToken`).
- Tokens tenant em `localStorage`: `accessToken` (15min), `refreshToken` (7d), `user` (objeto do usuário).
- Tokens admin em `localStorage`: `adminToken` (8h), `adminUser`.
- Logout tenant: remove `accessToken`, `refreshToken`, `user` → redireciona `/login`.
- Logout admin: remove `adminToken`, `adminUser` → redireciona `/admin/login`.
- **EnvBanner** (`components/EnvBanner.tsx`): faixa de aviso de ambiente — laranja em local, âmbar em dev, invisível em produção. Incluída no `AppShell` e no shell admin.

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
- `/equipe` → gestão de equipe (OWNER only) — ver membros, convidar, editar role, ativar/desativar, redefinir senha; painel de configuração da roleta (incluirGerentes/incluirOwner); toggle `recebeLeads` por membro.
- `/meus-leads` → leads atribuídos ao usuário logado (todos os roles) — usa `GET /leads/my`.
- `/settings/permissions` → permissões por role (OWNER only) — toggles ver/criar/editar/excluir por módulo para MANAGER e AGENT. Novos módulos adicionados em `tenants/permissions.config.ts` aparecem automaticamente.
- `/settings/whatsapp` → configuração do número WhatsApp do tenant.
- `/forgot-password` e `/reset-password` → recuperação de senha.
- `/admin/*` → painel Platform Admin com shell separado (sidebar escuro).
- `/admin/site` → Gerenciador de Sites (Platform Admin) — CRUD de SiteTemplates via API.
- `/admin/regras-globais` → módulo de Regras Globais — edita globalAgentRules, agentIdentityRules, whatsappFormattingRules com dupla confirmação e histórico.
- `/admin/ia/provedores` → Provedores de IA — configuração de modelo por função do sistema (DEFAULT, FOLLOW_UP, PDF_EXTRACTION, TRANSCRIPTION, DOC_CLASSIFICATION) sem deploy. DOC_CLASSIFICATION e PDF_EXTRACTION restritos a modelos Anthropic (visão).
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
| InboundAiWorker notifica só assignedUser | Evita spam de notificações para toda equipe — apenas o responsável pelo lead recebe o WhatsApp de lead qualificado/etapa movida |
| WhatsApp Light — filtros de inbound | Grupos (`@g.us`), status (`status@broadcast`, `@newsletter`) e reações (`type === 'reaction'`) são ignorados no `handleInbound` — nunca criam lead nem evento. Mensagens de sistema WA (`protocolMessage`, `senderKeyDistributionMessage`, `callLogMessage`) geram type `'system'`: LeadEvent criado com texto descritivo, mas sem atualizar `lastInboundAt`/`conversaCanal`/`LeadSla` nem acionar IA. Auto-reply detectado em `lead-upsert.helper.ts`: inbound que chega em menos de 3s após um outbound não aciona IA (evento salvo normalmente). |
| WhatsApp Light — LID (Linked ID) | WhatsApp multi-device usa LIDs internos (`{id}@lid`) como `remoteJid` em vez do telefone. `handleInbound` detecta `@lid`, tenta resolver via `lidToPhone` (Map em memória por sessão, populado por `contacts.upsert`). Se não resolvido, usa dígitos do LID como telefone temporário (fallback — não descarta a mensagem). Leads com LID não resolvido terão telefone incorreto até o mapeamento estar disponível. |
| WhatsApp Light — extração de JID | `from.split('@')[0].split(':')[0]` — remove sufixo `@domínio` e sufixo de dispositivo `:X` (multi-device). Nunca usar `.replace('@s.whatsapp.net', '')` pois não trata variantes. |
| WhatsApp Light — desconexão manual | `disconnect()` adiciona sessionId em `manuallyDisconnected` (Set em memória); o handler `connection === 'close'` checa o flag antes de reconectar — só reconecta em quedas inesperadas, nunca em desconexão manual |
| Campanha → lead só na resposta | `CampaignWorker` não cria lead ao enviar; lead criado pelo `handleInbound` quando contato responde; evento `whatsapp.unofficial.out` da mensagem original registrado com timestamp 2s antes do inbound para a IA ter contexto |
| Lead page — canais unofficial | `isOutgoing()` reconhece `whatsapp.unofficial.out` como enviado (direita) e `whatsapp.unofficial.in` como recebido (esquerda) |
| Inbox WA Light — conversas por sessão | `GET /inbox?sessionId=X` filtra conversas pelo inbox específico; sem filtro retorna todas as conversas WHATSAPP_LIGHT do tenant |
| Tailwind v4 sem opacidade em bg-black/40 | Modificador de opacidade não funciona de forma confiável — usar `style={{ backgroundColor: "rgba(...)" }}` para overlays e valores hex para fundos de modal |
| `router.push/replace` em Next.js 16 + React 19 | Envolto em `startTransition(() => router.replace(...))` para evitar "Router action dispatched before initialization" |
| `localStorage` nunca lido durante o render | Sempre em `useEffect` + `useState` — leitura síncrona durante render causa hidratação incorreta e dispara router antes da inicialização |

---

## Distribuição de Leads (Round-Robin)

- **Automática na entrada:** `IngestService.roundRobinAssign(tenantId, branchId)` chamado ao criar um lead novo (não em re-entrada de lead existente)
- **Algoritmo:** busca usuários com `ativo=true, recebeLeads=true, role in eligibleRoles, branchId match`; ordena por data do último lead assignado ASC → atribui ao que esperou mais tempo
- **Roles elegíveis:** sempre inclui AGENT; inclui MANAGER se `roundRobinConfig.incluirGerentes=true`; inclui OWNER se `roundRobinConfig.incluirOwner=true`
- **Fallback:** se nenhum elegível encontrado, lead fica sem responsável (`assignedUserId = null`)
- **Manual:** OWNER/MANAGER podem reatribuir lead via `<select>` no detalhe do lead → `POST /leads/:id/assign`
- **Configuração:** `GET /users/round-robin` e `PATCH /users/round-robin` (OWNER only) — persiste em `Tenant.roundRobinConfig`
- **Elegibilidade individual:** `recebeLeads Boolean @default(true)` no User — toggle na tela `/equipe`

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
- Permissões configuráveis ainda não são aplicadas nas páginas do frontend além de produtos — `usePermissions()` existe mas falta integrar em leads, agenda, KB, etc.
- Convite de membro por e-mail (atualmente cria com senha inicial definida pelo OWNER)
- Permissões de exclusão de produtos (hoje hardcoded): mover regras de quem pode excluir/solicitar exclusão de produto para o sistema de `permissionsConfig` do tenant (OWNER configura via `/settings/permissions`), assim como já existe para leads/agenda/KB
- **Sistema de preferências de notificação por usuário** — campo `User.notificationSettings Json?` já existe no banco mas não está conectado. Implementar: (A) tela em "Meus Dados" com toggles "Notificar quando chegar lead" e "Notificar quando lead qualificar" para todos os roles; (B) preferência exclusiva do Owner: "Receber notificações de todos os leads qualificados do tenant" — notifica o Owner sempre que qualquer lead do tenant qualificar, independente do responsável; (C) incluir nome do corretor responsável na mensagem de qualificação ("👤 Atendido por: [nome]"). Requisito para receber notificação: `whatsappNumber` preenchido no perfil; janela de 24h da Meta se aplica. A secretária é independente das notificações — não exige conversa ativa.

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
