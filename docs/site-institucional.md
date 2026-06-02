# Site Institucional do VIA — Onde fica e como editar

> Guia prático para alterar o site público da VIA (a landing page de marketing).
> Última atualização: 2026-06-02.

---

## ⚠️ Importante: hoje a edição é NO CÓDIGO (não pela tela)

Existe um editor visual (abrindo a home com `?editor=1`), **mas ele NÃO altera o site no ar.**
Motivo:

- O que você edita no editor é salvo só no `localStorage` do **seu navegador** (some em outro
  PC/navegador; ninguém mais vê).
- O botão "Publicar" grava num `SiteTemplate` no servidor, **mas a home pública `/` nunca lê
  esse conteúdo** — ela sempre renderiza o conteúdo fixo definido no código.

**Conclusão:** para mudar o site institucional publicado, edita-se o código (`defaultSiteContent`)
e faz-se deploy. (Consertar o editor para publicar de verdade é uma pendência registrada no
`CLAUDE.md`, seção "Pendências conhecidas".)

---

## Onde fica

| O quê | Caminho | Observação |
|-------|---------|------------|
| Página (rota `/`) | `apps/web/src/app/(site)/page.tsx` | Layout/JSX da landing. Mexer aqui só pra mudar **estrutura/seções**, não texto. |
| **Conteúdo (textos, números, planos, logo)** | `apps/web/src/lib/site-content.ts` → objeto **`defaultSiteContent`** | **É AQUI que se edita o conteúdo.** |
| Imagens/logo | `apps/web/public/` | Ex.: `Novo modelo de Logo.png`. Referência na URL com `%20` no lugar do espaço. |

URL de produção: `https://via-crm-web-frontend-production.up.railway.app/`

---

## O que dá pra editar em `defaultSiteContent`

Tudo abaixo é texto simples dentro do objeto `defaultSiteContent` em
`apps/web/src/lib/site-content.ts`. Trocar o valor entre aspas e fazer deploy basta.

### Logo (`branding`)
- `headerLogo.src` / `panelLogo.src` → caminho da imagem da logo (atual: `/Novo%20modelo%20de%20Logo.png`).
- `height` → altura da logo em px.

### Menu / header (`nav`, `header`)
- `nav.problem` / `nav.solution` / `nav.plans` → textos do menu de topo.
- `header.loginLabel` → botão "Entrar".
- `header.ctaLabel` → botão preto do topo (atual: "Agendar demonstração").

### Hero — a primeira dobra (`hero`)
- `badge` → tarja verde acima do título.
- `titleLine1` / `titleLine2` → o título grande (duas linhas).
- `description` → parágrafo abaixo do título.
- `primaryCta` → botão preto (atual: "Quero ver funcionando").
- `secondaryCta` → botão branco (atual: "Ver planos").
- `panelEyebrow` / `panelTitle` / `panelStatus` → textos do painel escuro (mockup à direita).

### Métricas (`metrics`)
Lista de 3 cartões. Cada item tem `value` (o número grande, ex.: "3x") e `label` (a descrição).

### Seção "Problema" (`problem`)
- `eyebrow` / `title` → rótulo e título.
- `items` → lista de tópicos (cada string é um item numerado).

### Seção "Solução" (`solution` + `features`)
- `solution.eyebrow` / `solution.title` / `solution.description`.
- `features` → lista de 6 cartões, cada um com `title` e `description`.

### Seção "Planos" (`plansSection` + `plans`)
- `plansSection.eyebrow` / `title` / `description`.
- `plans` → lista de 3 planos. Cada um: `name`, `price`, `description`, `items` (lista de
  bullets) e `featured` (`true` no plano em destaque — "Mais escolhido").

### CTA final (`finalCta`)
- `eyebrow`, `title`, `description`, `sideText`, `buttonLabel`.

> Os links dos botões ("Entrar", CTAs, "Falar com vendas") apontam para `/login` e para as
> âncoras `#problema`/`#solucao`/`#planos`. Mudar destino exige editar o JSX em `(site)/page.tsx`.

---

## Como aplicar uma alteração (passo a passo)

```bash
# 1. Editar o conteúdo
#    apps/web/src/lib/site-content.ts  → objeto defaultSiteContent

# 2. (opcional) trocar/incluir imagem
#    colocar o arquivo em apps/web/public/  e referenciar /nome%20do%20arquivo.png

# 3. Validar o build
cd apps/web
npm run build

# 4. (opcional) pré-visualizar localmente com JS — o app é client-only, então use o navegador,
#    não curl/WebFetch:
npm run start            # sobe em http://localhost:3000
#    abrir http://localhost:3000/ no navegador

# 5. Commit + push (dispara redeploy automático no Railway)
cd ../..
git add apps/web/src/lib/site-content.ts        # + arquivos de imagem se houver
git commit -m "feat(site): atualiza conteudo do institucional"
git push origin main
```

Depois do push, o Railway redeploya o frontend; conferir em
`https://via-crm-web-frontend-production.up.railway.app/`.

---

## Trocar a logo / imagens

1. Colocar o arquivo em `apps/web/public/` (ex.: `apps/web/public/minha-logo.png`).
2. Em `defaultSiteContent.branding.headerLogo.src` e `panelLogo.src`, usar o caminho a partir
   da raiz pública, com `%20` no lugar de espaços. Ex.: `/minha-logo.png`.
3. A logo do **painel escuro** e do **rodapé** é renderizada com filtro `brightness-0 invert`
   (vira branca) — uma logo colorida funciona nos dois contextos.

---

## Pendência registrada

Consertar o editor visual (`?editor=1`) para que "Publicar" realmente altere o site no ar:
desacoplar o render público do editor e fazer a home `/` buscar o conteúdo publicado do
servidor. Detalhes em `CLAUDE.md` → "Pendências conhecidas (não implementadas)".
