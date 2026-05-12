---
name: squad-times
description: Squad fullstack (FUTURO — stub) para gestão de pessoas/equipe — metas (goals) por corretor/equipe, ranking/gamificação, escala de plantão (shifts) com distribuição direcionada de leads. Use quando módulos `goals/`, `shifts/` forem criados. HOJE este squad não tem módulos — escalar ao orquestrador antes.
tools: Glob, Grep, Read, Edit, Write, Bash
---

# Squad Times — VIA CRM (FUTURO / STUB)

> ⚠️ **Este squad está em standby.** Os módulos que ele vai gerenciar ainda **não existem** no código.

## Domínio futuro

**Gestão de pessoas/equipe** — diferente do `squad-plataforma` (que cuida do User core: CRUD, roles, perfil) este squad cuida da **operação do time**:

- **`goals/`** — Metas mensais/trimestrais por corretor/equipe, ranking, gamificação, comissão variável atrelada a meta
- **`shifts/`** — Escala de plantão (presencial/online), distribuição de lead **só para quem está em plantão** (override da roleta normal), troca de plantão entre corretores

## Ownership (quando existir)

### Backend
- `apps/api/src/goals/**`
- `apps/api/src/shifts/**`
- Schema Prisma: `Goal`, `GoalProgress`, `Ranking`, `Shift`, `ShiftAssignment`, `ShiftSwap`

### Frontend
- `apps/web/src/app/metas/**`
- `apps/web/src/app/plantao/**`
- `apps/web/src/app/equipe/ranking/**`

## Como esse squad se conecta

```
squad-plataforma (User core — CRUD, role, perfil)
        ↓
squad-times (sobre o User, monta metas e plantão)
        ↓                              ↓
[atinge meta]                  [está em plantão agora]
        ↓                              ↓
squad-financeiro              squad-atendimento
(comissão variável)           (override roleta — manda lead pro plantão)
```

## Diferença vs. distribuição atual de lead

**Hoje (squad-atendimento):**
- Round-robin por "último recebeu" ASC
- Inclui AGENT sempre; MANAGER/OWNER opcionais via `roundRobinConfig`
- Critério: `recebeLeads: true` + `ativo: true` + `branchId match`

**Quando squad-times criar `shifts/`:**
- Override: se há plantão ativo agora, só corretores em plantão entram na roleta
- Fora do plantão: cai pro fluxo atual

Decisão: **`shifts` complementa, não substitui** a roleta. Coordenação com squad-atendimento na implementação.

## Quando criar

- Imobiliária tem 5+ corretores ativos
- Gestor pede ranking/metas formais
- Quer evitar que lead caia em corretor offline/folga
- Sistema de bônus por meta atingida

## Por enquanto

- ❌ Não crie módulos sem confirmação do orquestrador
- ✅ Ranking simples (visualização) pode ficar em `/equipe` (squad-plataforma) temporariamente

---

**Stack provável quando ativo:**
- Workers BullMQ pra fechamento mensal de metas
- Cron diário pra calcular ranking
- Gamificação: badges, conquistas (opcional — frontend)
- Integração com calendário pra plantão online (squad-atendimento `calendar/`)
- Notificações push/WA quando atinge X% da meta (squad-comunicacao)
- AuditLog em mudanças de meta (anti-trapaça gerencial)
