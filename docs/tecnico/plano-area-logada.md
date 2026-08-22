# Plano de Implementação — Área do Comprador + Painel Administrativo

**Documento vivo — criado em 19/08/2026.**
Escopo: `packages/web` (rotas `/minha-area` e `/admin`, APIs `/api/minha/*` e `/api/admin/*`), schema `garimpa` (novas tabelas de usuário) e `packages/persistence` (script de verificação). Os planos irmãos continuam valendo: `plano-ux-vitrine.md` (vitrine pública) e `plano-motor-curadoria.md` (dados). Este plano **consome** contratos do motor (categorias, `topDeals`, `dealDetail`) e **cria** os contratos de usuário.

Status: ✅ feito e conferido · 🟡 parcial (com o que falta explícito) · ⬜ não iniciado

---

## Objetivo de produto

Fidelizar o comprador e alongar o LTV com três mecanismos que só funcionam com identidade persistente:

1. **Salvos** — favoritos que sobrevivem à sessão e viram matéria-prima de recomendação.
2. **Acompanhamento de preço** — "estou de olho neste item": o BizuMiner registra o preço no momento da marcação e informa o movimento desde então. É a ponte natural para o alerta por e-mail (M3 do motor).
3. **Perfil do comprador** — preferências explícitas (categorias, faixa de preço) que, somadas ao comportamento (salvos/acompanhados), alimentam recomendações **com o porquê declarado**.

E um **painel administrativo** — o **oráculo**, confirmado em 20/08/2026 como o centro de comando do produto: o dono vê tudo que acontece e comanda tudo pela plataforma, sem entrar no código. Hoje: acionar rodagem, ver histórico, detectar rodagem vazia/falha e acompanhar a telemetria do app inteiro. A seguir: composer (D-2 do `plano-distribuicao.md`), publicação no Telegram (D-5), acionamento via GitHub Actions (M1-C) e gestão editorial (AD-2).

## Decisão estruturante — identidade antes do auth

O dono decidiu: **nada de mecanismo de autenticação nesta entrega**. A área é acessível sem login. Mas favoritos que moram só em `localStorage` (estado atual) morrem com o navegador e não geram dado de recomendação — então a identidade precisa existir *sem* auth:

- Cookie `bm_uid` (UUID, httpOnly, 1 ano) emitido pelo middleware na primeira visita.
- Tabela `garimpa.app_user` com esse UUID como chave. Coluna `auth_user_id` já nasce (nula) para o dia em que o Supabase Auth entrar: o merge é um `update`, não uma migração de dados.
- Tudo que a área grava (favorito, acompanhamento, perfil) referencia `app_user.id`.

**Consequência honesta, dita na UI:** "sua área fica neste navegador por enquanto" — trocar de aparelho ainda perde o vínculo. Isso só se resolve com auth (fase AL-3), e a UI não promete o que não existe.

## Achados da leitura do código (19/08/2026)

1. **`garimpa.subscriber` não existe no banco.** A migration `20260817120000_garimpa_subscriber.sql` está no repositório mas nunca foi aplicada — conferido via `information_schema.tables` no Supabase (só existem product, price_observation, capture_run, publication, click_event). Resultado: **`POST /api/newsletter` responde 500 hoje** e o toast diz "tente de novo em instantes". Cadastro de newsletter está quebrado em silêncio. Corrigido nesta entrega (migration aplicada).
2. **Favoritos são 100% locais** (`lib/saved-products.ts`, chaves `bizuminer:salvos*`). O painel "Seus salvos" já existe no mobile e no desktop; o que falta é persistência e identidade.
3. **O sweep já é auditável e é acionável por processo**: `packages/persistence/bin/sweep.ts` cria `capture_run` como `running` antes da busca e fecha como `ok`/`error`; `--pages` controla o coletor. O painel admin não precisa de tabela nova para "acionar rodagem": basta disparar o processo e ler `capture_run`.
4. **Não há workspace npm** — `packages/web` não importa `packages/persistence`. O acionamento da rodagem pelo admin é `spawn` de processo Node (`node --experimental-strip-types bin/sweep.ts`), com o ambiente do próprio servidor web (que já tem `DATABASE_URL`).
5. **RLS segue desabilitada em todas as tabelas** (re-conferido 19/08 via MCP, advisory crítico). As tabelas novas nascem iguais às existentes (sem RLS, acesso via role `garimpa_app` de servidor). A decisão de RLS/exposição do schema continua sendo **bloqueio pré-deploy público**, agora com mais peso: haverá dado de usuário.
6. **`tenant_id` em toda tabela nova** (princípio do modelo-de-dados.md) — mantido.
7. **Identidade visual BizuMiner consolidada** em `globals.css` com tokens por papel (`--paper`, `--ink`, `--blue` = leitura nossa, `--acid` = alegação do anúncio) e tema escuro. As novas telas **estendem** esses tokens; nenhum valor novo de cor.

## Contrato de dados (esboço é contrato)

| Tabela | Colunas | Observações |
|---|---|---|
| `app_user` | `id` (uuid do cookie), `tenant_id`, `auth_user_id` null, `display_name` null, `email` null, `created_at`, `last_seen_at` | e-mail só entra com consentimento explícito (AL-4); nunca preenchido automaticamente |
| `favorite` | `id`, `tenant_id`, `user_id` FK, `product_id` FK, `created_at`, unique(user_id, product_id) | `on delete restrict` no produto: catálogo não apaga histórico de escolha |
| `price_watch` | `id`, `tenant_id`, `user_id` FK, `product_id` FK, `baseline_price_cents`, `target_price_cents` null, `active`, `created_at`, `deactivated_at` null, unique(user_id, product_id) | `baseline` = preço no momento da marcação; o "movimento desde que você marcou" é derivado, nunca gravado |
| `buyer_profile` | `user_id` PK/FK, `tenant_id`, `preferred_categories text[]`, `price_band` check, `updated_at` | categorias validadas contra as categorias reais do catálogo |

Contratos de leitura novos em `packages/web/lib/member-db.ts`:

- `savedDeals(userId)` → DealRow[] dos favoritos, com dados atuais do catálogo.
- `watchedDeals(userId)` → watch + preço atual + `delta_cents` (atual − baseline).
- `recommendedDeals(userId, limit)` → candidatos por categoria derivada de (perfil ∪ salvos ∪ acompanhados), excluindo o que já foi salvo, ordenados pelo mesmo sinal de `topDeals`, cada um com `reason` ("você salvou itens de X" / "está no seu perfil"). **Sem dado de base, devolve vazio e a UI mostra destaques rotulados como destaques** — nunca fingir personalização.

APIs (`/api/minha/*`, todas leem `bm_uid` do cookie; sem cookie → 401):

- `POST /api/minha/favoritos` `{productId, saved}` · `PUT` `{productIds[]}` (migração do localStorage, idempotente)
- `POST /api/minha/acompanhar` `{productId, targetPriceCents?}` · `DELETE` `{productId}`
- `GET|POST /api/minha/perfil` `{preferredCategories[], priceBand}`

APIs admin (`/api/admin/*`):

- `POST /api/admin/rodagem` `{pages}` → recusa se já houver `capture_run` `running` recente; senão `spawn` do sweep e `202`.
- `GET /api/admin/rodagens` → últimas execuções (para polling do painel).

## Manifesto Visual (extensão da identidade BizuMiner)

### Âncora emocional
- **Minha área:** *voltar a uma bancada arrumada — tudo que escolhi está onde deixei, e o que mudou me é dito na hora.*
- **Admin:** *sala de máquinas — estado do sistema em um relance, sem decoração.*

### Paleta
Os tokens existentes, sem cor nova. A regra de autoria é preservada e vira o coração da área: **azul (`--blue`) = leitura do BizuMiner sobre o próprio histórico** (badge de movimento desde a marcação), **ácido (`--acid`) = alegação do anúncio** (desconto declarado). No admin, `--danger` marca rodagem com erro e `--warning` marca rodagem vazia — os mesmos tokens de estado que já existem.

### Tipografia
Arial para dado e controle, Georgia para narrativa (como no resto do site). Admin acrescenta `font-variant-numeric: tabular-nums` nas colunas numéricas — número que se compara em coluna precisa alinhar.

### Ritmo
Minha área é mais densa que a vitrine (é ferramenta de retorno, não descoberta): seções empilhadas com cabeçalho pequeno em caps, grades de 4/2/1 colunas reusando `product-card`. Admin é o mais denso de todos: cartões de métrica em fileira + tabela de rodagens.

### Elemento surpresa
- **Minha área — o ticker de movimento:** cada item acompanhado declara literalmente "caiu R$ 32 desde 14/08" ou "subiu R$ 18 desde 14/08", derivado de `baseline` vs preço atual. É o dado que só o BizuMiner tem, dito em azul (autoria nossa).
- **Admin — o pulso da rodagem:** enquanto existe `capture_run` em `running`, uma barra fina animada (mesma linguagem do `carousel-progress`) pulsa no topo da tabela. O painel *respira* quando o robô trabalha.

### O que este design não é
Não é dashboard genérico de SaaS (sem sombras suaves, sem cinza-azulado, sem cards flutuantes); não é gamificação — nenhum ponto, streak ou troféu. É bancada e sala de máquinas da mesma casa editorial.

## Wireframes

```
/minha-area                                    /admin
┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
│ ⛏ BizuMiner    ← voltar aos achados│   │ ⛏ BizuMiner · PAINEL   ← site        │
├──────────────────────────────────┤   ├──────────────────────────────────────┤
│ MINHA ÁREA                        │   │ ▓▓▓▓▓▓░░░ pulso (se rodagem ativa)   │
│ Sua bancada neste navegador       │   │ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐│
│ [aviso: sem conta ainda]          │   │ │prod││obs ││runs││cliq││assin││users││
├──────────────────────────────────┤   │ └────┘└────┘└────┘└────┘└────┘└────┘│
│ DE OLHO NO PREÇO (n)              │   ├──────────────────────────────────────┤
│ ┌─────────────────────────────┐  │   │ RODAGENS DO ROBÔ      [nova rodagem ▸]│
│ │ produto · R$ atual           │  │   │ ┌──────────────────────────────────┐ │
│ │ ▼ caiu R$32 desde 14/08     │  │   │ │ status│início│dur│itens│novos│Δ$  │ │
│ │ [ver] [parar de acompanhar] │  │   │ │ ok    │ ...  │...│ 183 │  12 │ 9  │ │
│ └─────────────────────────────┘  │   │ │ ERRO  │ ...  │...│  —  │  —  │ —  │ │
├──────────────────────────────────┤   │ │ VAZIA │ ...  │...│  0! │   0 │ 0  │ │
│ SEUS SALVOS (n)      [sincronizar]│   │ └──────────────────────────────────┘ │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │   ├──────────────────────────────────────┤
│ │card│ │card│ │card│ │card│      │   │ MAIS CLICADOS (7d)  │ ÁREA DO COMPRADOR│
│ └────┘ └────┘ └────┘ └────┘      │   │ 1. produto — 8       │ favoritos: n    │
├──────────────────────────────────┤   │ 2. produto — 5       │ de olho: n      │
│ RECOMENDADOS PARA VOCÊ           │   │                      │ perfis: n       │
│ "porque você salvou itens de X"  │   └──────────────────────────────────────┘
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
├──────────────────────────────────┤
│ PERFIL DO COMPRADOR              │
│ categorias: [tech][casa][beleza…]│
│ faixa: (todos)(até100)(100-500)… │
│ [salvar preferências]            │
└──────────────────────────────────┘
```

## Fases

### AL-0 — Identidade pré-auth + fundação de dados (🟡 entregue em 19/08, aguardando conferência)

- Middleware emite `bm_uid`; `app_user` upsertado a cada operação de escrita e na visita à área.
- Migrations `garimpa_subscriber` (reparo) e `garimpa_member_area` aplicadas no Supabase e versionadas em `packages/persistence/supabase/migrations/`.

### AL-1 — `/minha-area`: salvos + acompanhamento + perfil (🟡 entregue em 19/08, aguardando conferência)

- Salvos sincronizados: o coração da vitrine passa a gravar também no servidor (localStorage continua como cache local/fallback); botão "sincronizar deste navegador" migra o legado.
- Acompanhamento com baseline e ticker de movimento; parar de acompanhar desativa (não apaga — o dado vira insumo de M3).
- Perfil: categorias reais do catálogo + faixa de preço.
- **Fica de FORA:** e-mail, notificação, qualquer promessa de alerta (isso é M3+AL-4).

### AL-2 — Recomendações v1 com porquê (🟡 entregue em 19/08, aguardando conferência)

- Derivadas de perfil ∪ salvos ∪ acompanhados; razão declarada por item; sem base → destaques rotulados como destaques.
- **Fica de FORA:** filtro colaborativo, embeddings, LLM. Só entra sofisticação quando houver volume que a justifique (medir antes).

### AD-1 — `/admin`: operação do robô + telemetria (🟡 entregue em 19/08, aguardando conferência)

- Acionar rodagem (1–3 páginas), com trava de rodagem simultânea; histórico com status, duração, contadores; rodagem vazia e erro destacados.
- Telemetria: produtos, observações, cliques 7d, publicações, assinantes, usuários/favoritos/acompanhamentos/perfis.
- **Sem autenticação, por decisão do dono.** Mitigação mínima nesta entrega: `noindex`, aviso permanente no topo do painel, e o acionamento de rodagem limitado a 1 processo por vez. **Gate de acesso é bloqueio duro antes de qualquer deploy público** (junto com RLS).

### AL-3 — Autenticação real (🟡 entregue em 22/08/2026, aguardando conferência)

- Supabase Auth com **Google OAuth (PKCE)**: `/entrar` com botão "Continuar com Google", `/auth/callback` server-side (troca do código → sessão → **merge transacional** `bm_uid` → conta via `auth_user_id`), `/auth/sair`.
- Merge em 4 casos: cookie vira conta (A), conta já vinculada idempotente (B), conta + cookie com dados → reatribuição e órfão apagado (C), conta nova (D). Índice único parcial `app_user_auth_unique_idx` (migration `garimpa_auth_link`).
- **Modelo híbrido**: APIs `/api/minha/*` resolvem sessão → `bm_uid`; o coração anônimo da vitrine não muda.
- **Gate do admin**: e-mail normalizado === `ADMIN_EMAIL` (env, fallback `emanuel.adm10@gmail.com`). Página e APIs revalidam no servidor; middleware só redireciona. Outra conta → 403. RLS continua desenhada junto em fase própria.
- `email`/`display_name` gravados no `app_user` no login (o e-mail do Google é a credencial escolhida — o consentimento de marketing continua separado, AL-4).
- Registro completo e verificação em `estado-do-projeto.md` §12 (pedido de conferência AL-3).

### AL-4 — Retenção ativa (⬜ depende de M1-C/M3)

- Alerta de e-mail consumindo `price_watch` (M3 usa o baseline/alvo já gravados aqui); digest semanal por perfil; "quanto você economizou" (soma dos deltas negativos realizados) — só com histórico denso.

### AD-2 — O oráculo completo (⬜ escopo confirmado em 20/08/2026, fases a seguir)

- **Composer** (D-2): escolher produto(s) e destino → mensagem pronta para copiar (WhatsApp) ou publicar (Telegram).
- **Publicação no Telegram** (D-5): `sendPhoto` com botão inline, disparada do painel.
- **Rodagem pela plataforma** (M1-C): o botão passa de `spawn` local para `workflow_dispatch` do GitHub Actions — funciona igual local ou hospedado.
- Curadoria (blurb/score) editável (depende de M4), gestão de assinantes e alertas, logs do coletor por `collector_run_id`.

### Backlog honesto (registrado, sem compromisso)

Vistos recentemente; coleções compartilháveis ("meu enxoval", "setup home office") — cada coleção é uma URL pública que distribui a marca; comparador entre salvos. Entram só com dado de uso que os justifique.

## Regras desta instância

- **Nunca fingir personalização.** Recomendação sem base vira "destaques" com rótulo literal. (Mesma cicatriz do blurb 24×.)
- **Movimento de preço é sempre derivado** de `baseline` vs observação atual — nunca gravado como fato editorial.
- **Nenhuma PII sem consentimento**: `app_user` nasce só com UUID; e-mail entra apenas via fluxo explícito.
- **Toda tabela nova com `tenant_id` e toda query com `where tenant_id`.**
- Edição de arquivo sempre via editor UTF-8, nunca PowerShell (incidente 18/08).
- Toda entrega termina com **pedido de conferência** antes de ✅.

## Escada de verificação desta instância

1. `npm run typecheck` + testes (web) — tudo
2. Testes de contrato de payload/derivação — toda lógica nova
3. Navegação real em viewport desktop e mobile — mudança visível
4. Escrita real no banco conferida por script derivado (`verify:member-area`) — caminho crítico
5. Veredito do dono sobre copy, ritmo e o risco aceito do admin sem gate — gosto e risco

---

## Registro de implementação — 19/08/2026 (🟡 aguardando conferência independente)

### O que foi entregue

- Migrations `garimpa_subscriber_repair` e `garimpa_member_area` aplicadas via MCP e versionadas em `packages/persistence/supabase/migrations/` (20260819180000 e 20260819181000).
- `middleware.ts` emite `bm_uid` (httpOnly, 1 ano); APIs `/api/minha/favoritos` (POST/PUT), `/api/minha/acompanhar` (POST/DELETE), `/api/minha/perfil` (GET/POST); `/api/admin/rodagem` (POST com trava) e `/api/admin/rodagens` (GET).
- Camadas: `lib/member-contract.ts` (validação/derivação pura, 8 testes), `lib/member-db.ts` e `lib/admin-db.ts` (todas as queries com `where tenant_id`).
- Páginas `/minha-area` e `/admin` (ambas `noindex`), CSS estendendo tokens existentes; vitrine e página de detalhe passaram a espelhar o favorito no servidor sem abandonar o localStorage.

### Verificações executadas (degraus 1–4)

- Degrau 1–2: `npm run typecheck` ok; **23 testes, 23 pass** (suíte anterior: 15; +8 de contrato). `npm run build` ok (rotas novas visíveis no manifesto de build).
- Degrau 3: navegação real via dev server (porta 3101). Desktop: salvos/recomendações/perfil renderizados com dado do banco; razão declarada ("porque você salvou itens de Tecnologia"). Mobile 375px: overflow horizontal = 0 nas duas páginas; tabela do admin rola internamente.
- Degrau 4 (fonte de verdade): favorito gravado (user `b4685925…`, produto `4c68f87d…`); watch com baseline R$ 437,46 idêntico à observação real; perfil `{casa, 100_500}` salvo; **rodagem acionada pelo painel** completou `ok` em 2s com 38 itens / 11 novos / 12 mudanças / 38 observações vinculadas; `npm run verify:member-area` → todos os checks PASS; `/api/newsletter` respondeu `{"ok":true}` após o reparo (linha de teste removida em seguida).

### Fora da entrega / dívidas conscientes

- Auth (AL-3), alerta por e-mail (AL-4), gate do admin e RLS: bloqueios pré-deploy público, não desta fase.
- Recomendações não usam a faixa de preço do perfil ainda (só categorias); registrado como evolução de AL-2.
- `price_watch.target_price_cents` existe no contrato e no banco, mas a UI ainda não oferece campo de alvo — entra com o alerta (AL-4), quando o alvo tiver consequência real.

## Correção visual da área do comprador — 19/08/2026 (🟡 aguardando conferência humana)

**Veredito do dono sobre a primeira versão: "funcional, mas feia."** O diagnóstico, registrado porque a causa é reaproveitável:

1. **A página não tinha ritmo.** A vitrine alterna papel, ácido, azul e bloco escuro; a área logada era uma pilha de faixas de peso idêntico no mesmo navy. Corrigido com alternância de superfícies: papel → bloco elevado (De olho no preço) → papel → papel-fundo (Recomendados).
2. **O ácido não aparecia uma única vez.** A cor que assina a marca estava ausente, e só o azul carregava a identidade. Voltou em dois pontos com função: o painel "estado da bancada" no hero e o cartão de convite que fecha as grades. A regra de autoria foi preservada — ácido nunca vira selo sobre dado de preço, onde ele significaria "alegação do anúncio".
3. **O topo tinha metade da largura vazia** e abria com uma caixa de aviso amarela: o terceiro elemento lido era uma ressalva. O hero virou duas colunas (copy + estado com salvos, de olho, categorias e queda somada), e a nota de honestidade recuou para nota de rodapé do bloco, sem perder a franqueza.
4. **"De olho no preço" vazio era um vão morto** — justo a seção que carrega o diferencial do produto. Agora explica o mecanismo em três passos, sem simular nenhum dado.
5. **Grades terminavam em buraco** (2 salvos numa grade de 4 colunas). Salvos passaram a 3 colunas (são poucos por natureza e merecem presença) e recomendados a 4; ambas terminam num cartão de convite de volta à vitrine, que também serve à retenção.
6. **Sete cartões repetiam a mesma frase** "porque você salvou itens de Casa" — a cicatriz dos 24 blurbs idênticos reaparecendo em outra tela. Quando o motivo é único, ele agora é dito uma vez no cabeçalho da seção; os cartões só repetem quando os motivos de fato diferem.
7. Hierarquia de ação no cartão: "de olho no preço" (gancho de retenção) ganhou a linha, "remover" recuou para texto — antes tinham o mesmo peso.

Também corrigidos: "0 items" → "0 itens" e "1 salvos" → "1 salvo" (pluralização), e alvos de toque de 36–42px elevados a 44px no mobile, conforme a regra de UX-1.

**Verificação:** typecheck ok, 23 testes ok, build ok. Estilos computados conferidos nos **dois temas** — claro (papel `#f3f0e8`, faixa escura `#151515` com texto branco) e escuro (papel `#0f172a`, faixa elevada `#1e2a42`, recomendados `#0a1020`), ácido resolvido como ilha clara em ambos. Mobile 375px: zero overflow, grades em 2 colunas, menor alvo de toque = 44px. Painel `/admin` reconferido sem regressão após a mudança na lista de ilhas.

**Cicatriz de processo — o diretório `.next` é um recurso exclusivo.** Dois episódios no mesmo dia, com a mesma raiz:

1. Rodar `npm run build` com o `next dev` ativo corrompeu o estado do servidor e fez **todas as cores computarem como `transparent`** — falso negativo que quase virou diagnóstico visual errado.
2. Apagar o `.next` para limpar essa corrupção derrubou um **segundo dev server** que rodava na mesma pasta (porta 3100, de outra sessão). Ele passou a responder `ENOENT ... .next\server\pages\_document.js` **somente nas rotas ainda não compiladas** — `/bizu/[slug]` dava 500 enquanto `/`, `/minha-area` e `/admin` seguiam em 200, servidas da memória. O sintoma parcial é o que torna esse erro enganoso: parece bug de uma rota específica, e é estado sujo do processo inteiro.

**Regra que fica:** um único `next dev` por pasta de projeto — porta diferente **não** dá `.next` diferente. Antes de buildar, parar o dev server; ao encontrar `ENOENT` em `.next/server/...`, reiniciar o processo em vez de investigar a rota. A configuração duplicada `bizuminer-web-3101` foi removida de `.claude/launch.json` para que o erro não se repita.

**Pendente para ✅:** julgamento do dono sobre o resultado visual e conferência em aparelho físico.

## Defeito encontrado em 19/08/2026 — perda silenciosa de preferência (✅ corrigido no mesmo dia)

**Sintoma provado por evidência derivada**, não por leitura de código: `POST /api/minha/perfil` com `["Moda","Casa","Ferramentas"]` respondeu `{"ok":true,"profile":{"preferredCategories":["Casa"]}}`. Duas categorias foram descartadas **em silêncio, com resposta de sucesso**.

**Causa:** `parseProfilePayload` valida contra `dealCategories()`, que lista apenas categorias presentes na **execução de captura mais recente** — não no catálogo. Em 19/08 a execução atual tinha 5 categorias (Beleza, Casa, Fitness, Suplementos, Tecnologia) enquanto o catálogo tem 7 (mais Ferramentas e Moda). Uma rodagem curta (1 página) basta para uma categoria sumir.

**Duas consequências, ambas ruins:**
1. O chip de uma categoria válida **desaparece da tela** conforme a última varredura, sem explicação para quem escolheu.
2. Ao salvar o perfil de novo, a preferência antes gravada é **apagada** sem aviso — dado do usuário perdido por efeito colateral de uma varredura.

**Correção proposta:** listar e validar categorias pelo catálogo inteiro (`select distinct category from product where tenant_id = ...`), não pela execução corrente; e preservar categoria já gravada no perfil mesmo que ela não apareça na varredura atual. A vitrine pode continuar usando a execução atual — ali o recorte faz sentido, porque filtra o que está à venda agora; no perfil ele destrói intenção declarada.

**Achado menor:** `app_user` tinha 6 linhas, 4 sem nenhum dado associado. Abrir `/minha-area` criava a linha via `ensureUser` mesmo sem nenhuma ação. Confirmado que visitar páginas públicas (`/`, `/bizu/[slug]`) **não** cria linha — o cookie é emitido, o registro não.

### Correção aplicada — 19/08/2026

- Nova consulta `catalogCategories()` em `lib/db.ts`: todas as categorias já vistas no catálogo, sem recorte por execução. `dealCategories()` permanece intacta e continua servindo a vitrine, onde filtrar pelo que está à venda agora é o comportamento certo.
- `POST /api/minha/perfil` passou a validar contra `allowedProfileCategories(catálogo, jáGravadas)` — o segundo termo garante que uma preferência sobrevive mesmo se a categoria sumir do catálogo inteiro. Categoria inventada continua rejeitada.
- Os chips de `/minha-area` vêm da mesma união, para que uma categoria escolhida permaneça visível (e desmarcável) mesmo fora da varredura atual.
- `memberSnapshot` deixou de chamar `ensureUser` e passou a usar `touchUser` (apenas `update`). Leitura não fabrica mais usuário; só as escritas criam registro.
- Rótulo do painel admin ajustado de "visitantes identificados" para "pessoas com dados salvos", que é o que a contagem passou a significar.

**Verificação (degraus 1, 2 e 4):** typecheck ok; **25 testes, 25 pass** (eram 23; +2 cobrindo a união de categorias e a regressão exata do defeito). Contra o servidor real: `POST` com `["Moda","Casa","Ferramentas"]` agora responde com as três (antes devolvia só `["Casa"]`), e `["Casa","CategoriaInventada"]` continua devolvendo só `["Casa"]`. Visita a `/minha-area` com identidade nova resultou em **zero** linhas criadas. Chips do perfil voltaram a listar as 7 categorias do catálogo enquanto a vitrine segue com as 5 da execução corrente. Build de produção ok.

**Limpeza:** removidas 4 linhas órfãs de `app_user` (todas sobras dos testes de 19/08, sem favorito, acompanhamento ou perfil) e o perfil de teste criado via API. Restaram os 2 usuários reais, com dados intactos.

## PEDIDO DE CONFERÊNCIA — entrega AL-0/AL-1/AL-2/AD-1 (parcial)

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Schema**: `npm run verify:member-area` (em `packages/persistence`) deve terminar com "Todos os checks passaram" e contagens coerentes com o uso real.
2. **Testes**: `npm test` em `packages/web` deve reportar **23 pass / 0 fail** (suíte anterior: 15 subtests; esta entrega acrescenta 8 em `test/member-contract.test.mjs` — se aparecer outra contagem, a afirmação deste relatório é falsa).
3. **Fluxo do comprador**: em navegador limpo, salvar um produto na vitrine → `/minha-area` deve exibi-lo vindo do servidor; "de olho no preço" deve criar watch cujo `baseline_price_cents` exista como `price_observation` do produto (query no script cobre isso).
4. **Robô**: acionar "nova rodagem" no `/admin` deve criar `capture_run` novo com `status='running'` → `ok`, com observações vinculadas por `capture_run_id`; segundo clique durante execução deve receber 409.
5. **Julgamento humano (degrau 5)**: copy da honestidade pré-auth, ritmo visual das duas telas e aceitação do risco "admin sem gate até o deploy". Nenhum ✅ antes disso.
