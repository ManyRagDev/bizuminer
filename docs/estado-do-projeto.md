# BizuMiner — Estado do Projeto (documento mestre oficial)

**Redigido em 20/08/2026, a partir do levantamento do código, do banco e das decisões do dono.** Este documento descreve **o que o produto é**, não o que se pretendeu que fosse. Quando houver divergência entre este documento e qualquer outro, vale este — e a divergência deve ser corrigida no outro.

Convenção de honestidade: **fato** (lido no código ou no banco), **inferência** (conclusão a partir de fatos) e **pendente** (decisão que ninguém tomou ainda). Nada é registrado como pronto sem verificação.

---

## 1. O produto

O **BizuMiner** é um site B2C de curadoria de ofertas. As pessoas acessam, encontram produtos com desconto real, e compram — a comissão de afiliado é da casa. O comprador decide, o BizuMiner publica, o clique é rastreado de ponta a ponta.

Três fatos que definem o modelo econômico **atual**, verificados no código:

1. **Existe uma única tag de afiliado**, lida de `ML_TRACKING_ID`. Toda comissão gerada é da casa. Não há cadastro de tag de terceiros.
2. **Não existe cobrança**: nenhuma assinatura, gateway ou plano no pacote web.
3. **`tenant_id` aparece em todas as tabelas e vale `"local"`.** Multi-tenancy hoje é uma coluna, não uma capacidade.

**Mudança de rumo registrada em 25/08/2026 (decisão do dono):** o produto evolui de site B2C para **gerenciador de afiliados** — vários afiliados assinam e vendem com a própria tag, e o BizuMiner administra. Catálogo **por afiliado**. Cobrança por assinatura fixa **em aberto** (não definida). O plano e a sequência estão em `docs/tecnico/plano-afiliados.md`. A decisão da seção 6 ("B2C, comissão da casa") foi **reaberta** — ver seção 6.

**Lojas:** o Mercado Livre opera hoje. **Shopee e Amazon estão pendentes de credencial de afiliado** (solicitadas pelo dono, sem resposta na data desta redação). A Shopee já tem adapter pronto no código (`packages/capture/src/adapters/shopee/`, Open API oficial — nunca scraping); a Amazon não tem código ainda. Nenhuma das duas bloqueia nada: o produto roda 100% no Mercado Livre enquanto as credenciais não chegam.

**Fonte do briefing antigo:** os documentos de `docs/estrategia/` (julho/2026) descreviam o OfertaFlow — SaaS B2B vendido a afiliados, com disparo em massa por WhatsApp e instâncias WAHA/Docker. **Nada disso existe no código e nada disso será construído.** Esses documentos são histórico: não se atualizam e não se consultam para decidir o presente.

---

## 2. Arquitetura real

Monorepo com três pacotes canônicos (o quarto foi arquivado em 20/08):

| Pacote | O que é | Onde |
|---|---|---|
| `packages/capture` | Adaptadores de captura: ML (`/ofertas` público, auditável) e Shopee (Open API oficial) | `src/adapters/*` |
| `packages/persistence` | Schema SQL, ingestão (`sweep()`), CLI `bin/sweep.ts`, migrations e scripts de verificação derivada | `supabase/migrations/`, `bin/verify-*.ts` |
| `packages/web` | Next.js 15 (App Router): vitrine, página de produto, área do cliente, painel do dono | `app/` |
| `archive/site` | Protótipo estático anterior (starter com Drizzle/Worker). **Arquivado em 20/08, não é superfície, não se mexe, não se deleta** | `archive/site/` |

**Banco:** Supabase (Postgres), schema `garimpa`, acesso direto via pooler com role de servidor `garimpa_app` (privilégio mínimo). SQL puro, sem ORM. As 10 tabelas: `product`, `price_observation`, `capture_run`, `publication`, `click_event`, `subscriber`, `app_user`, `favorite`, `price_watch`, `buyer_profile`.

**Web:** Next.js App Router, CSS próprio (tokens BizuMiner em `globals.css`), sem Tailwind, sem framework de UI. Rotas: `/` (vitrine), `/bizu/[slug]` (+ card OG), `/go/[slug]` (saída afiliada), `/minha-area`, `/admin`, e as APIs `/api/deals`, `/api/newsletter`, `/api/minha/*`, `/api/admin/*`.

**Deploy:** Vercel, com os domínios próprios **ao vivo desde 20/08/2026**: `www.bizuminer.com.br` (canônico, CNAME para a Vercel) e `bizuminer.com.br` (apex apontado; redirecionar para o `www` no painel de domínios). O código resolve a base sozinho: **links de compartilhamento (composer) usam `shareBaseUrl()` — sempre o domínio canônico**, nunca preview/localhost (corrigido em 20/08: o link estava saindo com a URL provisória da Vercel); `metadataBase`/card OG usam `siteUrl()` (cada ambiente aponta para si mesmo). Ainda assim, setar `NEXT_PUBLIC_SITE_URL=https://www.bizuminer.com.br` no ambiente **Production** da Vercel faz o card OG resolver o domínio real no ar.

---

## 3. Fontes de dados

| Fonte | Como | Estado |
|---|---|---|
| Mercado Livre | Scraping automatizado de `/ofertas` ainda existe no código e registra `capture_run`; captura manual por bookmarklet já existe | 🟡 legado operacional a conter em E0; automação não será pilar |
| Shopee | Open API oficial (`ShopeeAdapter` pronto). **Scraping de Shopee é proibido pelos termos e nunca será feito** | Pendente de credencial |
| Amazon | Nenhum código | Pendente de credencial |

Regra de ouro do projeto: **nunca construir permalink do zero; sempre usar o href real do card + parâmetros `matt_*`** (provado em campo). `Puppeteer`/headless: nunca (ToS).

---

## 4. Os fluxos de negócio

1. **Varredura legada** — `bin/sweep.ts` ainda captura `/ofertas`, grava produto + uma observação de preço por execução e fecha `capture_run`. **A decisão de cron GitHub Actions para o ML foi reaberta em 25/08:** E0 do plano da extensão deve desligar esse acesso automatizado por default; o parser/fixtures permanecem, e o caminho vigente passa a ser captura humana. Não configurar o cron ML enquanto E0 não for conferida.
   - **Coleta/curadoria (decidido e aplicado em 20/08):** a varredura tem duas missões — **descoberta** (ler o feed, produtos novos entram) e **retenção** (re-observar o que importa). Fato duro: a página de produto do ML responde 302 → anti-bot (`mercadolivre-engenharia-reversa.md`, regra de ouro §2), então **re-visita individual por scrape é bloqueada pela plataforma**; no ML a retenção é via feed (produto que volta ao feed retoma a história automaticamente — comportamento confirmado, ver abaixo). Re-visita individual só será possível com API oficial (Shopee/Amazon quando as credenciais chegarem).
   - **Estado de vida derivado, nunca gravado** (`packages/persistence/src/activity.ts`): **ativo** = rodagem atual (vitrine) · **recente** = últimos 14 dias (superfícies secundárias) · **dormente** = além (fora das superfícies, histórico preservado, re-ativa sozinho). O `sweep.ts` imprime o resumo ao fim de cada rodagem. Verificado contra o banco em 20/08: 41 ativos / 295 recentes / 0 dormentes (o projeto tem 3 dias).
   - **Comportamento confirmado ("voltou com histórico"):** produto fora do feed ontem e de volta hoje **não perde nada** — o upsert por `external_id` reencontra o mesmo produto e a nova observação se soma ao histórico append-only; o gap fica honesto (ausência ≠ indisponível, regra registrada). O selo/ranking recalculam sozinhos.
2. **Vitrine** — `/` dinâmica (`force-dynamic`): 24 ofertas por página, busca, categorias, faixa de preço, ordenação, carrossel editorial, newsletter.
3. **Produto** — `/bizu/[slug]` com histórico real (até 90 dias), evidências do ML, CTA afiliado e **card OG** para compartilhamento (WhatsApp/Telegram). Com `?direto=1` (link do composer), vira **página de passagem**: contador de 3s redireciona ao ML (via `/go`, registrando o clique), com "quero ficar aqui" e anti-loop do botão voltar — decidido em 20/08 (D-2b).
4. **Clique afiliado** — `/go/[slug]` upserta `publication`, grava `click_event` (IP só como hash salgado — LGPD), redireciona com `matt_word` + `subId`.
5. **Área do cliente** — `/minha-area`: salvos sincronizados com o servidor, "de olho no preço" com baseline e ticker de movimento, recomendações com o motivo declarado, perfil com categorias e faixa de preço. **Autenticação desde 22/08 (AL-3):** login com Google (Supabase Auth), `/minha-area` atrás de `/entrar`, identidade anônima (cookie `bm_uid`) preservada e fundida na conta no primeiro login via `app_user.auth_user_id` — dados de quem nunca logou continuam funcionando e entram na conta automaticamente.
6. **Distribuição** — WhatsApp é **manual, para sempre** (você publica como pessoa; zero automação, zero risco jurídico). Telegram entra por Bot API oficial (botão inline apontando para `/go/[slug]?via=tg`). A plataforma gera a mensagem pronta: é o **composer** do painel (D-2).
7. **Aviso de queda de preço** — **individual, nunca broadcast**: quem marcou "de olho" recebe o aviso daquele produto. Ordem de canal: painel sempre → e-mail (padrão) → Telegram opcional (deep link) → WhatsApp só com autorização explícita e registrada, por último.

---

## 5. O oráculo — o painel do dono é o centro de comando (escopo confirmado em 20/08)

O dono quer ver tudo e comandar tudo pela plataforma, sem entrar no código. Confirmado como escopo:

- **Hoje (AD-1):** telemetria completa (produtos, observações, rodagens, cliques, assinantes, dados da área do cliente), tabela de rodagens com destaque para vazia/erro, botão de acionar rodagem.
- **Composer (D-2, 🟡 entregue em 20/08):** escolher produto(s) e destino → a plataforma gera a mensagem pronta (copy + link) para colar no WhatsApp ou publicar no Telegram.
- **Publicação no Telegram (D-5):** `sendPhoto` com botão inline, direto do painel.
- **Acionamento via GitHub Actions (M1-C):** rodagem pela plataforma em qualquer ambiente, sem processo local.
- **Admin editorial (AD-2):** curadoria (blurb/score), gestão de assinantes e alertas, logs do coletor.

O painel é ferramenta interna de vocês dois: específico e cru, não precisa nascer genérico.

---

## 6. Decisões que não se reabrem sem o dono

| Decisão | Valor |
|---|---|
| Modelo | ~~B2C, comissão da casa, vocês são o único canal de distribuição~~ → **reaberta em 25/08/2026**: gerenciador de afiliados (catálogo por afiliado, assinatura fixa em aberto). Ver `plano-afiliados.md` |
| WhatsApp | Manual, sempre. Nenhuma automação, nenhuma sessão não-oficial, nenhum WAHA |
| Telegram | Bot API oficial, canal público desde o início |
| Docker/WAHA/Puppeteer | Fora. Nunca existiram no código |
| Aviso de queda | Individual, não broadcast |
| Card OG v1 | Só selo em texto; mini-gráfico quando o histórico for denso |
| Copy | Soar humano; gatilho sempre do dado real; nunca fabricar urgência |
| Preço envelhecido | Link carrega preço da publicação; a página compara — só se o valor existir no histórico (anti-adulteração) |
| Provedor de e-mail | SMTP da Hostinger (ativa quando o domínio existir) |
| Fora de escopo | Automação de WhatsApp, comparador entre lojas, recomendação por LLM em produção |

---

## 7. Estado atual por item

✅ feito e conferido · 🟡 feito, aguardando conferência humana/independente · ⬜ não iniciado

| Item | Estado |
|---|---|
| Captura do ML com execução auditável | 🟡 |
| Captura manual por bookmarklet (BM1 + `/api/capture`) | 🟡 implementada em 25/08, token global temporário, aguardando conferência |
| Extensão catalog-first multi-afiliado | 🟡 E0–E8 implementados; migrations E1–E4 aplicadas e verificadas (26/08); RLS gated; aguardando conferência |
| Histórico de preço e selo honesto de menor preço | 🟡 |
| Categoria de produto (75,9% de cobertura) | 🟡 |
| Vitrine, busca, filtros, paginação | 🟡 |
| Página `/bizu/[slug]` com histórico | 🟡 |
| Redirect afiliado com telemetria própria | ✅ (validado em campo) |
| Área do cliente (salvos, acompanhamento, recomendações, perfil) | 🟡 |
| Painel do dono (telemetria + acionar robô) | 🟡 |
| **Autenticação (Google OAuth) + gate do admin por e-mail** | 🟡 entregue 22/08, aguardando conferência |
| Card de compartilhamento (OG) | 🟡 (entregue; falta veredito visual do dono e teste real pós-domínio) |
| **Varredura recorrente ML (cron GitHub Actions)** | ⬜ **suspensa/reaberta em 25/08; não configurar enquanto E0 contém o acesso automatizado** |
| Composer (D-2) | 🟡 (entregue 20/08, aguardando conferência) |
| Atribuição por destino (`via`) (D-3) | ⬜ depende de D-2 |
| Comparação de preço na chegada (D-4) | ⬜ depende de D-3 |
| Publicação no Telegram (D-5) | ⬜ depende de D-2 |
| Alerta individual por Telegram (D-6) | ⬜ depende do cron |
| **RLS/contexto de tenant no schema** | ⬜ adiada para a operação da casa; obrigatória antes do primeiro afiliado externo (E2) |
| Alerta de e-mail | ⬜ depende do cron |
| `sitemap.xml` / `robots.txt` | ⬜ |
| Shopee / Amazon | ⬜ pendente de credencial (nenhum bloqueio interno) |

---

## 8. Bloqueios duros antes de qualquer deploy público de peso

1. **RLS habilitada (defesa em profundidade) em 26/08/2026.** Todas as 14 tabelas do schema `garimpa` têm `row level security` ativo com política permissiva para a role `garimpa_app` (`using (true)`). `anon`/`authenticated` não têm grant (verificado) e ficam em *default-deny* — mesmo um grant acidental futuro não expõe linhas. O **escopo por tenant** (`tenant_id = current_setting('garimpa.tenant_id', true)`) é o follow-up: entra depois da adoção de `withTenantDb` em transação, antes do primeiro afiliado externo.
2. **Multi-afiliado ainda não possui isolamento real.** `tenant_id="local"`, slug global e tag de afiliado global impedem abrir cadastro a terceiros. O gate agora é explícito: E1–E4 do `plano-extensao-captura.md`, incluindo RLS/contexto de tenant, precisam de conferência antes do primeiro afiliado externo.

**Resolvidos em 22/08/2026 (AL-3):**
- ~~Painel `/admin` sem autenticação~~ — `/admin` e `/api/admin/*` exigem sessão + e-mail do dono (`ADMIN_EMAIL`). Qualquer outra conta leva 403.
- ~~Área do cliente sem autenticação~~ — `/minha-area` atrás de `/entrar` (Google OAuth). Anônimos continuam com identidade por cookie e a **fundem na conta no primeiro login** — nada se perde ao limpar cookies depois do login.

Nenhum impede o uso atual da casa. O painel sem gate e a área por cookie deixaram de existir; RLS/isolamento passam a ser bloqueio duro assim que houver afiliado externo, mesmo com o schema fora do PostgREST.

---

## 9. Cicatrizes (o que já custou caro aqui)

- **Selo "menor preço" exibido em 24 de 24 produtos** porque o mínimo incluía a observação atual. Origem da regra: nenhuma afirmação vai à interface sem que o dado a sustente.
- **Blurb idêntico repetido 24 vezes** — e a mesma falha reapareceu como razão de recomendação repetida 7 vezes na área do cliente. Repetição é sintoma de afirmação sem dado variável.
- **`subscriber` existia só como arquivo** — newsletter respondia 500 em silêncio desde 17/08. Migration versionada não é migration aplicada.
- **Perda silenciosa de preferência**: perfil validava categorias contra a última varredura, e uma rodagem curta apagava escolhas sem aviso. Corrigido 20/08 com teste que reproduz o defeito exato.
- **Três bugs do Satori no card OG** (`fit-content`, `line-through`, WebP) — todos mascarados pelo mesmo erro minificado inútil (`u2 is not iterable`); só bisecção achou. Fotos do ML trocam `.webp` por `.jpg` na mesma URL da CDN.
- **Documentos descreviam um produto que não é** (brief B2B OfertaFlow) — origem da régua e desta redação oficial.
- **Encoding corrompido por edição via PowerShell.** Arquivo se edita por editor UTF-8; shell é para comando.
- **Um único `next dev` por pasta.** Porta diferente não dá `.next` diferente; dois servidores se atropelam e produzem falsos negativos absurdos.
- **Nada commitado desde 19/08** — a entrega da área logada, do painel e do card vive só no working tree. Risco real de perda até o próximo commit.

---

## 10. Próxima entrega, na ordem (uma por vez)

1. ~~**E0 — conformidade e contenção**~~ — **🟡 entregue 26/08**.
2. ~~**E1 — fundação de afiliados**~~ — **🟡 entregue 26/08** (migration aplicada e verificada).
3. ~~**E2/E3 — isolamento e link por afiliado**~~ — **🟡 entregue 26/08** (migrations aplicadas e verificadas; RLS gated).
4. ~~**E4–E6 — dispositivo/API/extensão**~~ — **🟡 entregue 26/08** (migration E4 aplicada e verificada; E5–E6 extensão testável unpacked).
5. ~~**E7 — gestão e revogação**~~ — **🟡 entregue 26/08**; **E8 — verificação/distribuição** — **🟡 entregue 26/08** (execução real externa).
6. **Pendências anteriores ainda válidas:** conferir D-1/D-2; D-3/D-5 e alertas devem ser replanejados depois que o novo modelo de afiliados estiver estabilizado.
7. **Ações externas do dono (bloqueiam só o rollout, não o código):** aplicar E1–E4 no banco + configurar `aff_local` + rotacionar credencial de role; habilitar flags; testar em Chrome real; registrar na Chrome Web Store.

---

## 11. Onde os documentos vivem

| Documento | Papel | Tipo |
|---|---|---|
| `docs/estado-do-projeto.md` | **Este.** O que é verdade hoje | vivo |
| `README.md` | Porta de entrada do repositório | vivo |
| `docs/pendencias.md` | Mapa de "o que fazer a seguir e por quê" da sessão 19–20/08 | vivo |
| `docs/tecnico/roadmap.md` | Fases e histórico de execução | vivo |
| `docs/tecnico/plano-motor-curadoria.md` | Dados e captura | vivo |
| `docs/tecnico/plano-ux-vitrine.md` | Interface pública | vivo |
| `docs/tecnico/plano-area-logada.md` | Área do cliente e painel do dono | vivo |
| `docs/tecnico/plano-distribuicao.md` | Card, copy, composer, Telegram e atribuição | vivo |
| `docs/tecnico/plano-afiliados.md` | Gerenciador de afiliados: identidade → link por afiliado → gestão → distribuição (extensão) | vivo |
| `docs/tecnico/plano-extensao-captura.md` | Plano executável E0–E8: dados, API, extensão, testes e rollout | vivo |
| `docs/tecnico/handoff-extensao-captura-terra.md` | Instrução fechada para a sessão Terra médio, começando somente por E0 | vivo |
| `docs/tecnico/modelo-de-dados.md` | Princípios do schema (referência congelada) | **histórico** |
| `docs/estrategia/*` | Brief inicial do OfertaFlow (SaaS B2B) | **histórico** |
| `docs/pesquisa/*` | Pesquisa de mercado de julho | **histórico** |
| `archive/site/` | Protótipo estático anterior | **arquivado** |

---

## 12. Registro — redação oficial da documentação (20/08/2026)

**O que mudou em relação à versão anterior do mestre, por decisão do dono nesta sessão:**

1. **Amazon saiu de "fora de escopo"** e entrou como loja pendente de credencial (solicitação em aberto, sem código). Shopee permanece pendente de credencial, com adapter pronto.
2. **O oráculo foi confirmado como centro de comando**: composer (D-2), publicação no Telegram (D-5), rodagem via plataforma (GitHub Actions) e admin editorial (AD-2) são escopo confirmado, não aspiração.
3. **`packages/site` foi arquivado** em `archive/site/` (não deletado), removendo a ambiguidade de superfície.
4. **Provedor de e-mail fechado**: SMTP Hostinger (o plano M3 ainda citava Resend como candidato — corrigido).
5. **Correções factuais**: README dizia que o card de compartilhamento não existia (existe desde 20/08, aguardando conferência); UX-2 citava mini-gráfico no card (decidido para depois).

**D-2 entregue no mesmo dia:** composer no painel (seleção de produtos, destino, mensagem pronta com copy pelo sinal real e link, botão copiar) — 11 testes novos, 39/39, build limpo, smoke test HTTP 200. Registro e verificação em `plano-distribuicao.md`; aguardando conferência independente.
**D-2b entregue no mesmo dia:** link direto com página de passagem (`?direto=1`) — contador 3s → ML via `/go`, "quero ficar aqui", anti-loop do voltar; composer passou a gerar esse link. 44/44 testes, build limpo, smoke test com slug real. Aguardando conferência.

**AL-3 entregue em 22/08 — autenticação com Google OAuth (Supabase Auth) + gate do admin:**

- **Login:** página `/entrar` (botão "Continuar com Google", design manifesto aprovado), `/auth/callback` (PKCE → sessão → **merge** `bm_uid` → conta em transação: cookie vira conta, conta absorve dados do cookie, ou conta nasce nova), `/auth/sair`.
- **Modelo híbrido preservado:** APIs `/api/minha/*` resolvem sessão primeiro e caem no `bm_uid` se não houver sessão — o coração anônimo da vitrine continua funcionando, e o merge traz tudo para a conta no login.
- **Admin exclusivo do dono:** `isAdmin` = e-mail normalizado === `ADMIN_EMAIL` (env, fallback `emanuel.adm10@gmail.com`). Página e APIs revalidam no servidor (middleware só redireciona). Outra conta → 403 com "trocar de conta". Aviso "painel sem autenticação" removido.
- **Banco:** migration `garimpa_auth_link` (índice único parcial em `app_user.auth_user_id`) aplicada via MCP e versionada. `email`/`display_name` passam a ser gravados no login (o e-mail do Google é a credencial escolhida; consentimento de marketing continua separado).
- **Ambiente:** chave publishable (`SUPABASE_PUBLISHABLE_KEY`) + `NEXT_PUBLIC_SUPABASE_*` no browser só para iniciar o OAuth; `ADMIN_EMAIL` no `.env.local`. Redirect URLs do projeto compartilhado: **adicionar com wildcard** `https://www.bizuminer.com.br/**` e `http://localhost:3100/**` no dashboard (sem tocar na Site URL).
- **Cicatriz de deploy (22/08):** o primeiro fluxo real caiu na Site URL (brincareducando) — o `redirectTo` levava `?next=...` na query e o GoTrue casava a URL exata da lista sem ela. Corrigido no código: o `next` agora viaja no cookie `bm_auth_next` (5 min, sanitizado no callback, apagado após o uso) e o `redirectTo` vai limpo (`/auth/callback`). Wildcard na lista continua recomendado como cinto-e-suspensório.
- **Verificação:** 49/49 testes (3 novos em `auth-contract.test.mjs`: gate do admin, sanitização do `next`, régua do UUID), typecheck limpo, build limpo, smoke HTTP (rotas protegidas redirecionam/401, híbrido preservado, caminhos de erro do callback), merge exercitado contra o banco real nos 4 casos (D/A/B/C) com limpeza conferida (0 linhas de teste restantes). Aguardando conferência.
- **Follow-up no mesmo dia (corações da conta na vitrine):** vitrine e página de produto passam a receber os ids salvos da conta (`initialSavedIds`) e fundem com o localStorage (`unionSavedIds` — local primeiro, conta completa). Logado em aparelho novo, os corações já nascem pintados. Middleware passou a rodar o Proxy em todas as rotas (token fresco para a personalização das páginas públicas). **50/50 testes** (+1 para `unionSavedIds`), typecheck e build limpos, smoke HTTP conferido.

**Coleta/curadoria aplicada no mesmo dia:** estado de vida derivado (ativo/recente/dormente) em `persistence/src/activity.ts` + resumo na varredura + testes; comportamento "voltou com histórico" confirmado no código e registrado; re-visita individual documentada como bloqueada pelo anti-bot do ML (retomável via API oficial). 11/11 testes em persistence, typecheck limpo, verificado contra o banco real.

**PEDIDO DE CONFERÊNCIA — redação oficial (parcial)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Arquitetura**: `archive/site/` existe e `packages/site/` não existe mais; `packages/capture/src/adapters/` contém `mercadolivre/` e `shopee/`.
2. **Banco**: 10 tabelas no schema `garimpa`, RLS desabilitada em todas (query em `pg_tables`).
3. **Testes**: `npm test` em `packages/web` = 28 pass / 0 fail; `npm run typecheck` limpo.
4. **Decisões registradas nas seções 1, 5 e 6**: conferir com o dono que Amazon/Shopee pendentes, oráculo como centro de comando e WhatsApp manual/WAHA fora correspondem ao que foi decidido em conversa.
5. **Julgamento humano (degrau 5)**: o dono aprova este texto como a régua oficial do projeto — nenhum ✅ sem isso.

**PEDIDO DE CONFERÊNCIA — AL-3 (autenticação, 22/08/2026)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Testes**: `npm test` em `packages/web` = **49 pass / 0 fail** (3 novos em `test/auth-contract.test.mjs`); `npm run typecheck` limpo; `npm run build` limpo.
2. **Rotas protegidas** (dev server): `/minha-area` e `/admin` sem sessão → 307 para `/entrar?next=...`; `POST /api/admin/rodagens` sem sessão → 401; `GET /api/minha/perfil` com `bm_uid` → 200 (híbrido preservado); `/auth/callback` sem código → `/entrar?erro=1` (mesma origem do request, localhost em dev); `/entrar` renderiza o botão Google.
3. **Merge contra o banco real**: os 4 casos (D conta nova, A cookie vira conta, B idempotente, C favorito migra e anônimo some) executados com sucesso e limpeza conferida (0 linhas `teste-merge-*` restantes).
4. **Índice**: `app_user_auth_unique_idx` existe em `garimpa.app_user` (unique partial em `auth_user_id`).
5. **Fluxo completo em navegador (só humano)**: login Google real com `emanuel.adm10@gmail.com` → volta para a minha área com dados fundidos; `/admin` abre; com outra conta Google → 403 "trocar de conta"; sair → volta para a vitrine.
6. **Dashboard (só humano, uma vez)**: no projeto `spbuwcwmxlycchuwhfir` (Authentication → URL Configuration → Redirect URLs), conferir que as entradas existem **com wildcard**: `https://www.bizuminer.com.br/**` e `http://localhost:3100/**`. **Não tocar na Site URL** (compartilhada com outros apps).
7. **Julgamento do dono (degrau 5)**: copy/visual de `/entrar` e a decisão do admin exclusivo por e-mail. Nenhum ✅ antes disso.

**Veredito do dono — 20/08/2026: APROVADO.** Este documento passa a valer como a régua oficial do projeto.

**Registro — 25/08/2026: mudança de rumo para gerenciador de afiliados.**

- O dono reabriu a decisão de modelo (§6): o produto evolui de vitrine B2C (comissão da casa) para **gerenciador de afiliados**, onde vários afiliados assinam e vendem com a própria tag. Catálogo **por afiliado**. Cobrança por assinatura fixa **em aberto**.
- Levantamento prévio (pedido do dono): o que existe de multi-tenant é `tenant_id` pass-through (`"local"`) + auth real (Supabase/Google). Não existe credencial por afiliado (`affiliate_credential` é só um comentário em `oauth.ts`); `app_user` é o comprador, não o afiliado; o link afiliado é global (`ML_TRACKING_ID`/`ML_TOOL_ID` em `lib/db.ts`).
- Extensão de navegador reclassificada de "não justifica pelo volume" para **Frente D do roteiro** (casca de distribuição depois da identidade).
- Documento novo: `docs/tecnico/plano-afiliados.md` com a sequência (identidade → link por afiliado → gestão → distribuição), regras de integração e mapa de impactos.
- Também em 25/08: captura manual por bookmarklet (bloco BM1 + endpoint `/api/capture` com token) e rate limit — registrado em `mercadolivre-engenharia-reversa.md` §10 e no código; ainda 🟡 aguardando conferência.
- Plano completo da extensão registrado em `docs/tecnico/plano-extensao-captura.md`: UX no próprio catálogo, persistência imediata na API, outbox temporária, token revogável por dispositivo, identidade/link por afiliado e gates de isolamento. Handoff copiável para a sessão Terra médio em `docs/tecnico/handoff-extensao-captura-terra.md`. Estado: planejamento concluído; código da extensão ⬜.

**Registro — 26/08/2026: E0 entregue (🟡 aguardando conferência).**

- Kill switch do acesso automatizado ao ML: `mlAutomatedCaptureEnabled()` (fonte canônica em `packages/capture/src/automated-capture.ts`; espelho web em `packages/web/lib/automated-capture.ts`). Ligado só com `ML_AUTOMATED_CAPTURE_ENABLED=true` + `NODE_ENV=development`; produção e ausência falham fechadas.
- `bin/sweep.ts` e `/api/admin/rodagem` bloqueiam antes de qualquer rede/`capture_run`; painel desabilita o botão de rodagem e aponta a captura manual como caminho vigente. Parser/fixtures/testes do adapter intactos.
- Linguagem de risco trocada de "viola os termos" para "limite técnico adotado para reduzir risco" no painel e nas docs vivas.
- **Novo bloqueio externo (não bloqueia nada local):** rotação da credencial de role do banco exposta em migration histórica. Não executada; é ação externa do dono.
- Verificação: capture 72→77 testes, web 72→76, persistence 11/11; typecheck limpo nos três; build web limpo. `git diff --check` limpo.

**PEDIDO DE CONFERÊNCIA — E0 (total)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Kill switch**: `packages/capture/src/automated-capture.ts` e `packages/web/lib/automated-capture.ts` existem e têm a MESMA semântica (flag `"true"` + `NODE_ENV=development`); os testes em `test/automated-capture.test.*` cobrem flag ausente/outros valores/produção/development.
2. **Bloqueio real**: rodar `node --experimental-strip-types bin/sweep.ts` em `packages/persistence` SEM as variáveis → exit 1 com `[bloqueado]`, sem `capture_run` novo (confirmar `select count(*) from garimpa.capture_run` antes e depois).
3. **Rota admin**: `POST /api/admin/rodagem` sem flag → 409 `ml_automated_capture_disabled` (não `run_in_progress`), e o botão do painel aparece desabilitado com o aviso.
4. **Parser intacto**: `cd packages/capture && npm test` = 77 pass / 0 fail (o bloco `parseDealsHtml` e `MercadoLivreDealsAdapter` continuam verdes).
5. **Contagem**: capture 72→77, web 72→76, persistence 11/11. Re-derivar com os comandos do §11 do plano.
6. **Julgamento do dono (degrau 5)**: a linguagem de "limite técnico" (vs. afirmação jurídica) está de acordo; a rotação da credencial de banco será agendada pelo dono.

**Registro — 26/08/2026: E1 entregue (🟡 aguardando conferência; migration aplicada em 26/08 e verificada).**

- Migration `packages/persistence/supabase/migrations/20260826010000_garimpa_affiliates.sql`: `affiliate_account`, `affiliate_membership`, `affiliate_marketplace_config` + bootstrap `aff_local` (tenant `local`, slug `bizuminer`) + guarda anti-tenant órfão + grants. **Não aplicada** (ação externa pendente de autorização).
- `packages/web/lib/affiliate-db.ts` (nunca devolve `tracking_id`/`tool_id`), rotas `GET /api/admin/affiliates` e `POST /api/admin/affiliates/config`, painel `app/admin/affiliates.tsx`, scripts `bin/bootstrap-affiliate-house.ts` e `bin/verify-affiliates.ts`.
- Verificado localmente: typecheck limpo, testes inalterados (persistence 11/11, web 76/76), build web limpo. Degrau 4 (banco real) bloqueado pela não-aplicação da migration.

**PEDIDO DE CONFERÊNCIA — E1 (parcial; banco real pendente de aplicação)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Migration existe e é idempotente**: `git diff`/`git status` mostra `20260826010000_garimpa_affiliates.sql`; ler o arquivo e conferir que as 3 tabelas + `aff_local` + guarda `tenant_id <> 'local'` + grants `garimpa_app` estão lá. Nenhum `tracking_id`/`tool_id` real está no arquivo.
2. **Nenhuma credencial em payload**: `grep -r "tracking_id\|tool_id" packages/web/lib/affiliate-db.ts packages/web/app/api/admin/affiliates*` — só aparecem como colunas de escrita/`upsertMarketplaceConfig`, nunca em `select ... returning` de view nem em resposta `GET`.
3. **Aplicação (degrau 4, só após autorização do dono)**: após aplicar a migration via `supabase db push`/MCP, rodar `npm run verify:affiliates` e `npm run bootstrap:affiliate-house` em `packages/persistence`; confirmar `aff_local` aponta para `tenant_id=local` e exatamente 1 owner.
4. **Painel**: `/admin` renderiza a seção "Afiliados" sem derrubar a página mesmo com a migration não aplicada (degradação para lista vazia).
5. **Contagem**: persistence 11/11, web 76/76 (nenhum teste novo em E1 — a verificação de E1 é a query derivada, não unitária).

**Registro — 26/08/2026: E2 entregue (🟡 aguardando conferência; migrations aplicadas em 26/08 e verificadas).**

- Migration `20260826020000_garimpa_tenant_integrity.sql` (tenant_id → affiliate_account; FKs compostas; índices) e `20260826030000_garimpa_tenant_rls.sql` (GATED, RLS por contexto `garimpa.tenant_id`, sem `user_metadata`). Nenhuma aplicada.
- **Achado:** `anon`/`authenticated` não têm grant no schema `garimpa` (auditoria via `role_table_grants` = vazio) — o schema não está exposto ao Data API; RLS é defesa em profundidade.
- `packages/web/lib/tenant-db.ts` (`validTenantId`/`assertSameTenant`/`withTenantDb`) + testes; `bin/verify-tenant-isolation.ts` (A/B) pendente de aplicação.
- Verificado localmente: typecheck limpo, web 76→79 testes, persistence 11/11, build limpo.

**PEDIDO DE CONFERÊNCIA — E2 (parcial; banco real pendente de aplicação)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Auditoria de grants**: `select grantee from information_schema.role_table_grants where table_schema='garimpa' and grantee in ('anon','authenticated')` deve retornar vazio.
2. **Migrations existem e são idempotentes**: `20260826020000_garimpa_tenant_integrity.sql` (FK tenant→conta, FKs compostas com a mesma semântica de delete, índices) e `20260826030000_garimpa_tenant_rls.sql` (políticas `tenant_scope` para `garimpa_app`, sem `user_metadata`, marcada GATED).
3. **Testes**: `cd packages/web && npm test` = 79 pass / 0 fail (+3 `tenant-db`); `validTenantId`/`assertSameTenant` cobertos.
4. **Aplicação + verificação (degrau 4, só após autorização)**: aplicar E1+E2, rodar `npm run verify:tenant-isolation` (espera 4 PASS: escrita ok, tenant inexistente rejeitado, cruzamento rejeitado, mesma-tenant ok) e conferir limpeza (0 linhas `test_a`/`test_b`).
5. **Julgamento do dono**: a RLS gated (não ativada até adoção de `withTenantDb`) está de acordo com manter a casa operando.

**Registro — 26/08/2026: E3 entregue (🟡 aguardando conferência; migration aplicada em 26/08 e verificada).**

- Migration `20260826040000_garimpa_publication_affiliate.sql`: `publication.affiliate_id` + backfill `aff_local` + unique `(affiliate_id, product_id, channel)`.
- `affiliateLink` sem env global (config explícita), `resolvePublicationForLink(slug)`, `/go/[slug]` com caminho V2 flag-gated que falha fechado, `lib/flags.ts`.
- Verificado localmente: typecheck limpo, web 79→84 testes (+5), build limpo.

**PEDIDO DE CONFERÊNCIA — E3 (parcial; banco real pendente de aplicação)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Sem fallback global**: `grep -n "ML_TRACKING_ID" packages/web/lib/db.ts` deve retornar ZERO ocorrências (a função `affiliateLink` não lê mais env); as únicas referências a `ML_TRACKING_ID` no código de runtime ficam no caminho legado de `/go/[slug]` (flag off), explicitamente marcado.
2. **Teste**: `cd packages/web && npm test` = 84 pass / 0 fail; `test/affiliate-link.test.mjs` prova dois `matt_word` distintos e que a função não depende de env.
3. **`/go` V2 falha fechado**: com `AFFILIATE_LINKS_V2_ENABLED=true`, config ausente → 404 (não redirect com a tag da casa); com flag off, links antigos continuam abrindo.
4. **Aplicação (degrau 4, só após autorização)**: aplicar E1–E3 e criar config de marketplace para `aff_local`; então `AFFILIATE_LINKS_V2_ENABLED=true` e conferir que o mesmo anúncio em dois afiliados gera dois slugs e dois `matt_word`.

**Registro — 26/08/2026: E4 entregue (🟡 aguardando conferência; migration aplicada em 26/08 e verificada).**

- Migration `20260826050000_garimpa_extension_device.sql`: `extension_device` + evolução de `price_observation` + índice único parcial de idempotência.
- Núcleo puro `lib/extension-token.ts` / `lib/extension-contract.ts` / `lib/extension-cors.ts`; borda `lib/extension-db.ts` + 3 rotas `/api/extension/*`; `/api/capture` marcado deprecated.
- Verificado localmente: typecheck limpo, web 84→102 testes (+18), build limpo.

**PEDIDO DE CONFERÊNCIA — E4 (parcial; banco real pendente de aplicação)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Sem credencial no payload/bundle**: `grep -rn "tracking_id\|tool_id" packages/web/lib/extension-*` deve mostrar escrita só em `extension-db.ts` (colunas do banco), nunca leitura de `ML_TRACKING_ID`/`ML_TOOL_ID`; as rotas `/api/extension/*` não devolvem token/código em resposta posterior (o `pairingCode` aparece só em `pairing-codes`, o `deviceToken` só em `exchange`).
2. **Testes**: `cd packages/web && npm test` = 102 pass / 0 fail (+18: token/contract/cors). Re-derivar com `node --test --experimental-strip-types test/extension-*.test.mjs`.
3. **Idempotência/revogação (degrau 4, só após aplicar E1–E4)**: retry com mesmo `Idempotency-Key` → mesma observação (`duplicate:true`); token revogado → 403 `device_revoked`; `/api/capture` responde com `Deprecation`.
4. **Julgamento do dono**: token `bm_ext_` + código de pareamento de 8 chars estão de acordo; CORS por allowlist exata.

**Registro — 26/08/2026: E5–E8 entregues (🟡 aguardando conferência; execução real externa).**

- **E5** novo pacote `packages/extension` (MV3, TS sem framework, esbuild): manifest com permissões mínimas, popup, injeção/observer/botão, parser puro de card, service worker. verify:manifest 8/8, 13 testes.
- **E6** outbox pura + alarmes de retry + badge de pendências + copiar link no sucesso.
- **E7** `lib/extension-admin.ts` + rota `/api/admin/extension/devices` + painel de dispositivos (revogar/renomear/gerar código), métricas por afiliado sem token bruto.
- **E8** `scripts/package.mjs` (release reproduzível + RELEASE.txt com hashes), `PRIVACY.md`, `CHROME_WEB_STORE.md`, `bin/verify-extension-e2e.ts`.
- Verificação final: capture 77/77, persistence 11/11, web 102/102, extension 13/13; typecheck limpo nos 4; build limpo (web + extension); `git diff --check` limpo.

**PEDIDO DE CONFERÊNCIA — E5–E8 (parcial; banco/Chrome reais externos)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Extensão**: `cd packages/extension && npm test` = 13/13; `npm run verify:manifest` = 8/8; `npm run build` limpo; `npm run package` gera `release/bizuminer-extension-v0.1.0/` com `RELEASE.txt`.
2. **Sem segredo no bundle**: `grep -rn "ML_TRACKING_ID\|ML_TOOL_ID\|DATABASE_URL\|bm_ext_" packages/extension/src` → só `bm_ext_` (prefixo de token, não segredo) deve aparecer; nenhum tracking/tool/URL de banco.
3. **Contagem**: capture 77, persistence 11, web 102, extension 13. Re-derivar com os comandos do ciclo de verificação.
4. **Migrações aplicadas**: 5 arquivos em `packages/persistence/supabase/migrations/` (`20260826010000` a `20260826050000`); as 4 de E1–E4 foram aplicadas via MCP em 26/08 (ver `Registro — aplicação das migrations`); a de RLS (`20260826030000`) segue GATED.
5. **Julgamento do dono (degrau 5)**: design da extensão (manifesto visual registrado no plano), política de privacidade e decisão de registro na Chrome Web Store.
6. **Execução real (externa)**: aplicar E1–E4, conectar 2 dispositivos de 2 afiliados, capturar o mesmo anúncio e rodar `npm run verify:extension-e2e` — o relatório deve ser gerado pelo script, não montado.

**Registro — 26/08/2026: decisão do dono (scraping automatizado opt-in consentido) — pendente de reconciliação.**

- O dono registrou em `DECISAO-PENDENTE-SCRAPING-CONSENTIDO.md` (nota isolada, 26/08) que o scraping automatizado do ML **deve permanecer disponível** como recurso opcional por afiliado — **não** "desligado definitivamente" como a E0 originalmente redigia.
- Direção mais recente: E0 passa de "desligar definitivamente" para **"conter e tornar opt-in"** — desligado por default para cada afiliado, habilitado só após aviso + consentimento versionado (`affiliate_id`, `terms_version`, `accepted_at`, `revoked_at`, `accepted_by_app_user_id`, hash da versão), com revogação individual e kill switch global.
- **O que já existe e é compatível:** o kill switch de E0 (`mlAutomatedCaptureEnabled`, default off, global) é exatamente a base "conter + desligado por default" — permanece válido.
- **O que NÃO foi implementado (não marcar como feito):** a tabela/fluxo de consentimento versionado por afiliado, o aviso pré-aceite, a revogação individual e o opt-in. É uma **nova entrega** a planejar (não fazia parte de E0–E8). A nota instrui a não marcar a mudança como implementada só porque a nota existe, e a registrar a divergência.
- **Ação para a próxima sessão:** conciliar `plano-extensao-captura.md` E0, o handoff, o roadmap e este mestre com a decisão; desenhar a entrega de consentimento (tabela + borda + aviso + revogação + teste) e emitir pedido de conferência próprio. Nenhum documento vivo foi reescrito por esta sessão para refletir o opt-in — apenas registrado aqui.

**Registro — 26/08/2026: aplicação das migrations E1–E4 (autorizada pelo dono).**

- Aplicadas via Supabase MCP, em ordem, no projeto `spbuwcwmxlycchuwhfir`: `garimpa_affiliates`, `garimpa_tenant_integrity`, `garimpa_publication_affiliate`, `garimpa_extension_device`. A RLS (`20260826030000`) **não** foi aplicada (gated, a fazer depois).
- **Verificação derivada do banco (todos PASS):**
  - `verify:affiliates` → `aff_local` aponta para `tenant_id=local` (slug `bizuminer`), 1 conta, 0 membership, 0 config.
  - `verify:tenant-isolation` (fixture A/B) → 4/4: escrita ok; tenant sem conta rejeitado (FK); relação entre tenants falha (FK composta); mesma-tenant ok. Limpeza conferida (0 contas/produtos de teste).
  - `verify:extension-e2e` → 0 duplicatas (device, requestId), 0 observações cruzadas; nenhuma captura de extensão ainda (esperado).
  - `schema_migrations` com 4 entradas `20260826*`.
- **Falta (ações externas, não bloqueiam):** aplicar a RLS gated (quando o `withTenantDb` cobrir as rotas); testar a extensão em Chrome real; configurar `EXTENSION_ALLOWED_ORIGINS`; rotacionar a credencial de role; registrar na Chrome Web Store.

**Registro — 26/08/2026: casa operacional (bootstrap + config + flags + backfill de publicações).**

- `bootstrap:affiliate-house` → `app_user` do `ADMIN_EMAIL` vinculado como **owner** de `aff_local` (1 owner ativo).
- `seed:house-config` → credencial `mercadolivre` da casa cadastrada (status `active`), valores vindos do env, nunca impressos.
- Backfill de publicações (`20260826060000_garimpa_backfill_publications.sql`) → 346 publicações (todas com `affiliate_id`), uma por produto.
- Flags ligadas em `.env.local`: `AFFILIATE_LINKS_V2_ENABLED=true`, `EXTENSION_CAPTURE_ENABLED=true`.
- Verificação final `verify:affiliates`: 1 conta · 1 owner · 1 config ativa — todos PASS.

**Registro — 26/08/2026: RLS habilitada (defesa em profundidade) + teste ponta a ponta real.**

- Migration `20260826070000_garimpa_rls_defense.sql` aplicada: `ENABLE ROW LEVEL SECURITY` nas 14 tabelas + política permissiva `garimpa_app` (`using (true) with check (true)`). O escopo por tenant fica como follow-up (ver `20260826030000_garimpa_tenant_rls.sql`, gated).
- **Teste ponta a ponta real (feito pelo dono):** extensão dev carregada no Chrome, dispositivo pareado, card "Aparelho de Jantar Oxford Cerâmica Folk 20 Pç" capturado → `MLB33269708`, `price 17480`, `capture_source=extension`, publicação `ml-MLB33269708-bizuminer`. `/go` → 302 com `matt_word=juem4482159_ml-MLB33269708-bizuminer&matt_tool=99838509&forceInApp=true`; `click_event` gravado em `tenant_id=local`, `affiliate_id=aff_local`.
- `verify:extension-e2e` → 0 duplicatas, 0 cruzamento, publicação na captura. `verify:affiliates` → 1 owner, 1 config ativa. RLS confirmada em `pg_class.relrowsecurity=true` nas 14 tabelas, com o app (garimpa_app) ainda lendo/escrevendo normalmente.
