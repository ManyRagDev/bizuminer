# Handoff — Navegação Integrada (Admin Shell + componentes compartilhados)

**Para quem executa.** Entrega de organização da navegação, sem mudança de modelo de dados nem de auth. Resolve os pontos fracos identificados no diagnóstico de 09/09/2026: rotas soltas, admin invisível ("às vezes preciso digitar /admin"), conexões não óbvias entre páginas e pauta desconectada do painel.

**Decisões fechadas com o dono (09/09/2026):**
- Visão de navegação: **Admin Shell com sidebar persistente** (Opção A).
- `/admin/direcionamento`: **fica como está** (redirect 307 para `/admin/curadoria?aba=bussola`).
- Query params: **canônico `?aba=`/`?sub=`, aliases mantidos** via redirect (`hoje`, `grupos`, `espera`, `aprendizados`, `modo=…`, `subaba=…`, `fila=held`).
- `/pauta`: **entra no Admin Shell**.

---

## O que foi entregue

### 1. Admin Shell persistente

- `app/_components/admin-shell.tsx` (client) — shell das páginas administrativas: marca no topo, sidebar com as áreas do painel à esquerda (desktop) e **drawer no mobile** (botão "menu" + overlay). O item ativo é derivado da URL (`usePathname` + `window.location.search`) — cada página não precisa mais saber qual aba está aberta.
- `app/admin/layout.tsx` (server) — barreira de dono centralizada: sem sessão → `/entrar?next=/admin`; logado sem ser admin → tela "Sem acesso" compartilhada; logado como admin → `AdminShell` envolvendo a rota. **As páginas deixaram de repetir o próprio gate.**
- `app/_components/deny-access.tsx` — tela "Sem acesso" única (antes colada em `admin/page.tsx`).
- Aplicado em: `/admin` (cockpit), `/admin/curadoria` (mesa editorial) e `/pauta` (mesa de links).

### 2. `/pauta` dentro do shell

- `app/pauta/page.tsx` agora resolve a autorização (sessão admin **OU** token HMAC do QR) e, quando autorizada, renderiza `<AdminShell>` ao redor do `PautaClient`. Não autorizado → tela "Acesso restrito" **sem** shell.
- `app/pauta/pauta-client.tsx` — removido o par de links de topo ("← Seleção do Dia" / "Painel Admin →"): a sidebar do shell cobre essa navegação. Raiz trocada de `<main>` para `<div>` para não aninhar `<main>` dentro do `<main>` do shell.
- CSS: `.admin-shell .pauta-header { position: static }` — o sticky do shell cuida do topo; o da pauta deixa de fixar para não empilhar.

### 3. Query params canônicos (aliases preservados)

- `lib/admin-query-aliases.ts` — puro, testado. `canonicalAdminQuery(raw)` mapeia qualquer combinação para `{ aba, sub, redirectNeeded }`; `canonicalAdminUrl(pathname, raw)` monta a URL canônica preservando params desconhecidos (ex.: `grupo`).
  - `?aba=hoje` → `?aba=excecoes&sub=singulars`
  - `?aba=grupos` → `?aba=excecoes&sub=grupos`
  - `?aba=espera` → `?aba=auditoria&sub=espera`
  - `?aba=aprendizados` → `?aba=bussola`
  - `?fila=held` → `?aba=auditoria&sub=espera`
  - `?modo=grupos` / `?modo=hoje` → `?sub=grupos` / `?sub=singulars`
  - `?subaba=espera` / `?subaba=spotcheck` → `?sub=…`
- `app/admin/curadoria/page.tsx` chama `canonicalAdminQuery` no início e, se `redirectNeeded`, faz `redirect(canonicalAdminUrl(...))`. A lógica de aba/sub lê só a gramática canônica.
- `app/admin/page.tsx` — os links do resumo de curadoria passaram a usar `?sub=grupos` e `?sub=singulars` (antes `?modo=`, que nem era lido pela mesa — corrige um desvio real: "grupos abertos" abria "singulares").

### 4. Componentes compartilhados (fim da duplicação de header)

- `app/_components/detail-header.tsx` — header interno padrão (marca + ações), antes colado em 4 páginas.
- `app/_components/admin-badge.tsx` — atalho "⚡ Painel Admin" (era um bloco de estilo inline repetido em 3 arquivos).
- Aplicado em `/entrar`, `/bizu/[slug]` e `/minha-area`. O `vitrine.tsx` mantém o próprio header (busca + salvos são estado local da página); só ganhou o **link "⚡ Painel Admin" no menu mobile**, que não existia — era o motivo de "às vezes preciso digitar /admin" no celular.

### 5. CSS

- Bloco "Admin Shell" no fim de `globals.css` usando os tokens existentes (`--paper`, `--line`, `--acid`, `--blue-*`). Sidebar desktop 224px à esquerda; abaixo de 820px vira drawer off-canvas com overlay.

---

## Verificação executada

- `npm run typecheck` (web): limpo.
- `npm test` (web): **215/215** (inclui 8 novos de `admin-query-aliases`).
- `npm test` (persistence): 22/22.
- `npm run build` (web): limpo, 17/17 rotas geradas.
- Smoke com `next start`:
  - `/` → 200; `/entrar` → 200 com header compartilhado.
  - `/admin`, `/minha-area` sem sessão → 307 para `/entrar?next=…` (middleware/layout).
  - `/admin/direcionamento` sem sessão → 307 (mantido).
  - `/pauta` sem sessão/token → 200 com "Acesso restrito" (sem shell).

## Fora de escopo (por decisão, não por esquecimento)

- Remover `/admin/direcionamento` (dono pediu para manter).
- Migrar para `?sub=` removendo aliases (dono pediu retro-compat).
- `/painel` unificado cliente + admin.
- Footer global com link admin em páginas públicas (era a Opção C; o dono escolheu só a A).
- RLS / roles no banco / multi-tenancy.
- Visual dos cards, hero, search — só navegação/header/sidebar.

## Próximo passo obrigatório (conferência do dono)

1. Logar como admin e percorrer `/admin`, `/admin/curadoria` (as 4 abas + sub-abas) e `/pauta` — confirmar que a sidebar marca a área atual e que o drawer mobile abre/fecha.
2. Abrir `/pauta` no celular via QR (token HMAC) e confirmar que o shell não atrapalha a pauta mobile-first.
3. Testar deep links antigos: `/admin/curadoria?aba=hoje`, `?aba=grupos`, `?fila=held`, `?modo=grupos`, `?subaba=espera` → todos redirecionam para a canônica.
4. Julgamento humano: a sidebar tem todas as áreas esperadas e o contador "Curadoria" reflete a fila real.

## Arquivos que a entrega toca

**Novos**
- `packages/web/lib/admin-query-aliases.ts`
- `packages/web/test/admin-query-aliases.test.mjs`
- `packages/web/app/_components/admin-shell.tsx`
- `packages/web/app/_components/deny-access.tsx`
- `packages/web/app/_components/detail-header.tsx`
- `packages/web/app/_components/admin-badge.tsx`
- `packages/web/app/admin/layout.tsx`
- `docs/tecnico/handoff-navegacao-integrada.md` (este)

**Modificados**
- `packages/web/app/admin/page.tsx` — remove gate/header inline; links de curadoria canônicos
- `packages/web/app/admin/curadoria/page.tsx` — remove gate/header inline; usa `canonicalAdminQuery`
- `packages/web/app/entrar/page.tsx` — usa `DetailHeader`
- `packages/web/app/bizu/[slug]/page.tsx` — usa `DetailHeader` + `AdminBadge`
- `packages/web/app/minha-area/member-area.tsx` — usa `DetailHeader` + `AdminBadge`
- `packages/web/app/pauta/page.tsx` — envolve no `AdminShell`
- `packages/web/app/pauta/pauta-client.tsx` — remove links de topo; `<main>` → `<div>`
- `packages/web/app/vitrine.tsx` — link "⚡ Painel Admin" no menu mobile
- `packages/web/app/globals.css` — bloco Admin Shell

**Não tocados (decisão do dono)**
- `packages/web/app/admin/direcionamento/page.tsx`
- `packages/web/middleware.ts`, `lib/auth*.ts`, `lib/api-auth.ts`
- `packages/web/app/go/[slug]/route.ts`, `app/p/[code]/route.ts`
- pacotes `capture`, `persistence`, `extension`, `social`