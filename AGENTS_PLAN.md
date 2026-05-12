# VIA CRM — Plano de Agents

Estrutura aprovada de squads para o time de desenvolvimento via Claude Code agents.

**Estrutura final (2026-05-12):** 11 squads ativos + 4 stubs futuros = 15 total (incluindo orquestrador).

---

## Princípios

1. **Fullstack por domínio** — cada squad é dono do backend **e** do frontend do seu domínio.
2. **Ownership único por glob** — cada módulo tem 1 dono. Conflito = escalar para orquestrador.
3. **Não reorganizar pastas** — ownership vive no system prompt do agent, não no filesystem.
4. **Segurança sempre revisa** — qualquer mudança em `auth/`, `crypto/`, `audit/` passa pelo `squad-seguranca` antes do Railway.
5. **QA é per-feature** — `squad-qatester` é invocado com escopo limitado, não "lê tudo".
6. **Stubs ficam dormindo** — agents para módulos inexistentes têm `.md` placeholder; ativam quando o módulo nascer.
7. **CLAUDE.md global** continua compartilhado por todos os agents.

---

## Estrutura completa

### Squads ATIVOS (11)

| # | Squad | Módulos existentes | Módulos a construir |
|---|---|---|---|
| 1 | **orquestrador** | (lê todos) | — |
| 2 | **squad-atendimento** | leads, ingest, pipeline, channels, calendar | sla expansão, reviews, visits, proposals, lead-participantes |
| 3 | **squad-seguranca** | auth, crypto, audit, privacy | lgpd-center, incidents |
| 4 | **squad-comunicacao** | whatsapp, whatsapp-unofficial, messaging, inbox, campanhas, secretary, email | notifications, marketing-email |
| 5 | **squad-gestao-empreendimentos** | developments | unit-holds |
| 6 | **squad-produtos** | products, owners | acquisition, portals-outbound, appraisals, post-sale |
| 7 | **squad-plataforma** | users, tenants, admin, plans, config, cloudinary, sites, queue, dev | billing, integrations-hub, storage |
| 8 | **squad-financiamento** | correspondents, credit-requests | partners, investors |
| 9 | **squad-ia** | ai, ai-agents, knowledge-base | learnings expansão, analytics, reports |
| 10 | **squad-qatester** | (transversal — testa todos) | — |
| 11 | **squad-design-system** | components shared, layout shell, tema | — |

### Squads STUB (4) — módulos ainda não existem

| # | Squad | Módulos futuros |
|---|---|---|
| 12 | **squad-fechamento** | contracts (venda + locação), legal-docs (due diligence), integração Clicksign/D4Sign/Autentique |
| 13 | **squad-locacao** | rentals, inspections, boletos mensais, reajuste IGPM/IPCA, repasse, garantia, vacância |
| 14 | **squad-financeiro** | commissions, financial (contas pagar/receber, DRE, conciliação) — **NÃO confundir com squad-financiamento** |
| 15 | **squad-times** | goals (metas), shifts (plantão) |

---

## Diferenças críticas de naming

| Nome | Domínio |
|---|---|
| **squad-financiamento** ✅ ativo | Correspondente bancário + pedido de crédito do **lead** (cliente final) |
| **squad-financeiro** 🟡 stub | Caixa da **imobiliária** (comissões, DRE, conciliação) |

Não confundir.

---

## Fases de criação

### ✅ Fase 1 — Validação (concluída)

- `orquestrador`, `squad-atendimento`, `squad-seguranca`

**Tarefa de validação:** extrair `messaging` e `lead-documents` de `leads.service.ts` — ✅ concluído (3.644 → 2.437 linhas).

### ✅ Fase 2 — Expansão completa (concluída)

8 squads ativos + 4 stubs criados em 2026-05-12.

### 🔵 Fase 3 — Ativação dos stubs (futuro)

Cada stub vira agent ativo quando o módulo correspondente for criado. Critérios em cada `.md` de stub.

---

## Como funciona cada cruzamento de domínio

### Lead vira venda
```
squad-atendimento (lead muda etapa pra PROPOSTA/CONTRATO)
        ↓
squad-fechamento (gera contrato — quando ativo)
        ↓
squad-financeiro (provisiona comissão — quando ativo)
```

### Lead vira inquilino (locação)
```
squad-atendimento (lead procura aluguel)
        ↓
squad-fechamento (contrato de locação)
        ↓
squad-locacao (boleto mensal + repasse + reajuste)
        ↓
squad-financeiro (DRE)
```

### Inbound de WhatsApp dispara IA
```
squad-comunicacao (recebe via webhook/Baileys)
        ↓
[InboundAiWorker — coordenado entre squad-comunicacao e squad-ia]
        ↓
squad-comunicacao (envia resposta IA via MessagingService)
```

---

## Regras invioláveis

- Cada agent é fullstack (backend + frontend do seu domínio)
- Ownership por glob no system prompt (não reorganizar pastas)
- Conflito de ownership = escalar para orquestrador
- `squad-seguranca` revisa qualquer mudança em auth/crypto/audit antes do Railway
- `squad-qatester` invocado per-feature, não "lê tudo"
- Stubs só são ativados após confirmação do usuário + criação do módulo
- CLAUDE.md continua sendo contexto global compartilhado por TODOS os agents

---

## Arquivos relacionados

- `.claude/agents/*.md` — system prompts de cada agent (15 arquivos)
- `CLAUDE.md` — contexto global compartilhado por todos
- `~/.claude/.../memory/project_agents_plan.md` — memória persistente desta decisão
