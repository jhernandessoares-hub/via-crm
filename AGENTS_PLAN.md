# VIA CRM — Plano de Agents

Estrutura aprovada de squads para o time de desenvolvimento via Claude Code agents.

**Decisão (2026-05-12):** começar pequeno com 3 agents, expandir por fases após validação.

---

## Princípios

1. **Fullstack por domínio** — cada squad é dono do backend **e** do frontend do seu domínio. Sem `squad-frontend` horizontal.
2. **Ownership único por glob** — cada módulo tem 1 dono. Conflito = escalar para orquestrador.
3. **Não reorganizar pastas** — ownership vive no system prompt do agent, não no filesystem.
4. **Segurança sempre revisa** — qualquer mudança em `auth/`, `crypto/`, `audit/` passa pelo `squad-seguranca` antes do Railway.
5. **CLAUDE.md global** continua compartilhado por todos os agents (stack, padrões, regras universais).

---

## Estrutura completa (12 squads)

| # | Squad | Módulos existentes | Módulos a construir |
|---|---|---|---|
| 1 | **orquestrador** | (lê todos) | — |
| 2 | **squad-design-system** | components/, shared UI | — |
| 3 | **squad-empreendimentos** | developments | unit-holds |
| 4 | **squad-imoveis** | products, owners | rentals, acquisition, portals-outbound, appraisals, inspections, legal-docs, post-sale |
| 5 | **squad-atendimento** | leads, ingest, pipeline, channels | sla, reviews, visits, proposals, lead-documents, lead-participantes |
| 6 | **squad-vendas** | — | contracts, commissions, financial, goals, shifts |
| 7 | **squad-financiamento** | correspondents, credit-requests | partners, investors |
| 8 | **squad-comunicacao** | whatsapp, whatsapp-unofficial, inbox, campanhas, secretary, email | messaging, notifications, marketing-email |
| 9 | **squad-ia** | ai, ai-agents, knowledge-base | learnings, analytics, reports |
| 10 | **squad-plataforma** | users, tenants, admin, plans, config, cloudinary, sites, queue, dev | billing, integrations-hub, storage |
| 11 | **squad-seguranca** | auth, crypto, audit, privacy | lgpd-center, incidents |
| 12 | **squad-qa** | (testa todos) | — |

---

## Fases de criação

### ✅ Fase 1 — Validação (atual)

Apenas **3 agents**, escolhidos pela dor real do código hoje:

- `orquestrador`
- `squad-atendimento` — porque `leads.service.ts` tem 3.644 linhas (maior dívida técnica)
- `squad-seguranca` — porque deploy vai direto pro Railway sem revisão humana

**Tarefa de validação:** extrair `messaging` (envio Meta API) de `leads.service.ts` para módulo próprio.

### 🟡 Fase 2 — Após validação

Adicionar 4 agents:
- `squad-empreendimentos`
- `squad-comunicacao`
- `squad-plataforma`
- `squad-qa`

### 🔵 Fase 3 — Quando time crescer

Os 5 restantes (`design-system`, `imoveis`, `vendas`, `financiamento`, `ia`).

---

## Regras de interação

- **Quem pode editar o quê:** definido no glob do system prompt de cada agent
- **Conflito de ownership:** agent escala para `orquestrador`, que delega corretamente
- **Mudança em arquivo cross-domínio:** orquestrador coordena handoff
- **Antes do Railway:** se mexeu em auth/crypto/audit, passa por `squad-seguranca`
- **Antes de merge dev→main:** `squad-qa` valida testes (quando existir)

---

## Arquivos relacionados

- `.claude/agents/*.md` — system prompts de cada agent
- `CLAUDE.md` — contexto global compartilhado por todos
- `~/.claude/.../memory/project_agents_plan.md` — memória persistente desta decisão
