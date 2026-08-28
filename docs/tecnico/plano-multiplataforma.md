# Plano — Multiplataforma (Shopee + AliExpress convivendo com a captura manual do ML)

**Criado em 26/08/2026.** Como o BizuMiner deixa de ser um catálogo de Mercado Livre com colunas genéricas e passa a ser, de fato, um agregador de várias plataformas — sem tocar em uma linha do caminho canônico de captura manual do ML.

Status: ✅ feito e conferido · 🟡 parcial · ⬜ não iniciado

Documentos irmãos: [`plano-afiliados.md`](./plano-afiliados.md) (identidade e comissão por afiliado) · [`plano-extensao-captura.md`](./plano-extensao-captura.md) (a captura manual canônica). Este plano **depende** do primeiro e **não pode alterar** o segundo.

---

## 1. Diagnóstico — o que já existe (fato, lido no código em 26/08/2026)

**A boa notícia: o banco e o contrato de captura já são multiplataforma.** O que está preso ao Mercado Livre é a **borda** — vitrine, slug, link de saída e painel.

| Camada | Estado real | Evidência |
|---|---|---|
| Schema | `garimpa.product` tem `marketplace` e `unique (tenant_id, marketplace, external_id)`; `capture_run` tem `marketplace`; índice `product_tenant_last_seen_idx` já é por marketplace | `20260818000000_garimpa_initial.sql`, `20260819024349_capture_audit_flow.sql:90` |
| Contrato de captura | `CaptureAdapter` é explicitamente agnóstico; `paginate()` genérico | `packages/capture/src/types.ts:1-10` |
| Ingestão | `sweep()` grava `capture_run` com `adapter.marketplace` e persiste produto+observação sem saber de que loja é | `packages/persistence/src/ingest.ts:40,63` |
| Adapter Shopee | **Escrito e testável**: Open API oficial, assinatura HMAC-SHA256 sobre a string exata do corpo, rate limit, retry, `buildAffiliateLink` via `generateShortLink` | `packages/capture/src/adapters/shopee/{client,index,mapper,queries}.ts` |
| Adapter AliExpress | **Não existe nenhuma linha** | — |

**As cinco amarras ao ML que impedem a convivência (fato, com localização):**

1. **Slug sintetizado na query.** `topDeals` devolve `'ml-' || p.external_id as slug` e `dealDetail` só aceita `^ml-(.+)$` — um produto Shopee entraria na vitrine com slug mentiroso e página 404. `packages/web/lib/db.ts:114,205`
2. **`current_run` filtra o ML.** A CTE que empurra "visto na rodagem atual" para o topo tem `cr.marketplace = 'mercadolivre'` fixo. Com Shopee no catálogo, o ranking mistura duas noções de "atual". `packages/web/lib/db.ts:87`
3. **`/go/[slug]` só sabe fazer link do ML.** `affiliateLink()` monta `matt_word`/`matt_tool`/`forceInApp`; o caminho legado ainda casa `p.marketplace='mercadolivre' and 'ml-'||p.external_id = slug`. `packages/web/lib/db.ts:273`, `packages/web/app/go/[slug]/route.ts`
4. **A vitrine afirma a origem em texto fixo.** `MarketplaceEvidence` escreve "dados do Mercado Livre" para qualquer produto; `deal-query.ts` não tem dimensão `marketplace`. `packages/web/app/vitrine.tsx`, `packages/web/lib/deal-query.ts`
5. **A rodagem do painel é uma só, e é a do ML.** `/api/admin/rodagem` dispara `bin/sweep.ts` (ML) e é bloqueada pelo kill switch E0 — que **deve continuar bloqueando o ML** e não pode virar chave geral. `packages/web/app/api/admin/rodagem/route.ts`, `packages/capture/src/automated-capture.ts`

**Decisões do dono (26/08/2026), já fechadas:**

| Decisão | Valor |
|---|---|
| Credencial de captura Shopee/AliExpress | **Env do servidor** (credencial da casa). Nunca no banco, nunca em payload de client. A atribuição por afiliado continua em `affiliate_marketplace_config` |
| Link de saída Shopee/AliExpress | **Pré-gerado e persistido**; o clique só redireciona. Nenhuma chamada externa dentro do redirect |
| Sequência | **Shopee primeiro** (adapter pronto), AliExpress depois pela trilha já aberta |
| Vitrine | Painel inicial com **todas as plataformas misturadas** por padrão + filtro por plataforma |
| Diversidade na home (27/08) | A home **sempre mostra as duas lojas**, intercaladas — é o chamariz, e a diversidade é benéfica. Ver M6 |
| Cron | **Fora deste plano.** Só disparo manual pelo `/admin` |

---

## 2. Regras de integração (invariantes — derivadas das cicatrizes deste projeto)

| Regra | Invariante | Origem |
|---|---|---|
| **M-R1** | **A captura manual do ML é intocável.** Nenhuma entrega deste plano altera `packages/extension/`, `lib/manual-capture.ts`, `lib/bookmarklet.ts`, `/api/capture`, o kill switch `mlAutomatedCaptureEnabled()` nem o formato do bloco `BM1`. Refatoração que passe por perto exige diff conferido linha a linha | ordem explícita do dono, 26/08 |
| **M-R2** | **Nada de scraping de Shopee ou AliExpress, jamais.** Só API oficial. A Seção 4.3(d) dos termos da Shopee proíbe extração automatizada e a penalidade cai na conta de afiliado | já registrado em `adapters/shopee/index.ts:1-8` |
| **M-R3** | **Kill switch é por plataforma, nunca global.** O gate do ML (`ML_AUTOMATED_CAPTURE_ENABLED`) continua existindo, isolado e desligado por default. Shopee e AliExpress ganham gates próprios, que falham fechado (ausência de credencial = desligado) | cicatriz E0: rota que rodava rede sem gate |
| **M-R4** | **Slug de produto nunca muda depois de publicado.** Os `ml-<external_id>` existentes continuam válidos e resolvendo; plataforma nova ganha prefixo novo. Link compartilhado no WhatsApp em agosto tem que abrir em dezembro | `publication.slug` é chave pública e já foi backfillada |
| **M-R5** | **Adicionar marketplace é escrever arquivo novo, não editar o núcleo.** Se uma entrega precisar de `if (marketplace === 'shopee')` dentro de `sweep()`, do store ou da vitrine, o desenho está errado — o ponto de variação vira registro/adapter | promessa escrita em `types.ts:8` que ainda não foi testada por um segundo marketplace |
| **M-R6** | **A comissão continua sendo de quem compartilhou** (R3 do plano de afiliados). Link Shopee/AliExpress pré-gerado é gerado **com o subId da publicação do afiliado dono** — nunca um link único da casa reaproveitado | invariante de negócio do modelo inteiro |
| **M-R7** | **Migration versionada não é migration aplicada.** Coluna nova nasce com script de verificação derivada que lê o banco real | cicatriz "`subscriber` existia só como arquivo" |

---

## 3. O que explicitamente NÃO entra

| Item descartado | Por quê |
|---|---|
| Cron / GitHub Actions para qualquer plataforma | decisão do dono: backlog de médio prazo. Só disparo manual |
| Persistir comissão (`commissionRate`/`commissionCents`) da Shopee | o adapter já devolve, mas não há coluna nem tela que use. Entra quando existir a pergunta de negócio que ela responde — hoje seria coluna morta |
| Relatório de conversão / vendas / comissão validada (Shopee `conversionReport`, AliExpress `order.list`) | fecha o ciclo de analytics, mas é outro produto. `CONVERSION_REPORT_QUERY` fica escrita e sem chamador, como está hoje |
| Credencial de API por afiliado, cadastrada no painel | decidido: env da casa. Reabrir só quando um afiliado real pedir para capturar com a conta dele |
| Catálogo por afiliado para Shopee/AliExpress | a rodagem por API alimenta o tenant da casa (`local`), como o ML hoje. A separação por tenant já está no schema e não muda aqui |
| Qualquer alteração na extensão/bookmarklet | M-R1 |
| Amazon | sem credencial. O registro de marketplaces já deixa a porta aberta, sem código especulativo |

---

## 4. Sequência de entregas

Uma entrega fechada por vez. Cada uma termina com **PEDIDO DE CONFERÊNCIA** antes do ✅.

### ✅ M0 — Fundação: o núcleo deixa de saber o que é "ml-" — feito e verificado 26/08/2026

**Refatoração pura, sem mudança de comportamento observável.** É a entrega que torna as outras baratas.

- `packages/web/lib/marketplaces.ts` (novo): registro único e tipado — `{ slug, label, slugPrefix, evidenceLabel, captureMode: 'manual' | 'api', linkStrategy }`. Nasce com `mercadolivre` (prefixo `ml-`, manual) e `shopee` (prefixo `shp-`, api). É o único lugar onde um marketplace é nomeado.
- `lib/db.ts`: slug deixa de ser `'ml-' || external_id` e passa a ser derivado do `marketplace` do produto; `dealDetail(slug)` resolve `prefixo → marketplace + external_id` pelo registro. `DealRow` ganha `marketplace`.
- `topDeals`: a CTE `current_run` passa a ser **por marketplace** (uma rodagem atual por plataforma), não uma global filtrada no ML.
- Testes: resolução de slug ida-e-volta para cada marketplace do registro; slug legado `ml-MLB123...` continua resolvendo o mesmo produto (M-R4).

**Critério de aceite:** com o banco atual (só ML), a vitrine, a página de produto e o `/go` produzem **exatamente** o mesmo resultado de antes — mesmos slugs, mesma ordenação. Diff de comportamento zero.

**Verificado:** `packages/web/test/marketplaces.test.mjs` (ida-e-volta de slug para todo marketplace do registro, slug legado `ml-` resolvendo, `slugCaseSql` em sincronia com o registro). `tsc --noEmit` limpo. Testado ao vivo contra o banco de produção (347 produtos ML): mesmo slug, mesma ordenação, `/bizu/ml-MLB54964804` abre sem erro de console.

### ✅ M1 — Rodagem Shopee de verdade (a prova de que o desenho aguenta o segundo marketplace) — feito e verificado 26/08/2026

- `packages/persistence/bin/sweep-shopee.ts`: espelha `bin/sweep.ts`, monta `Credential` a partir de `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`, chama o mesmo `sweep()` com `ShopeeAdapter`. **Não toca em `bin/sweep.ts`.**
- Gate próprio: `shopeeCaptureEnabled()` — exige as duas variáveis presentes e `SHOPEE_CAPTURE_ENABLED=true`. Falha fechado, aborta **antes** de criar `capture_run` e antes de qualquer rede (mesmo padrão do E0, arquivo separado).
- `/api/admin/rodagem/[marketplace]/route.ts`: rota por plataforma. O ML continua atendido pela rota atual, com o kill switch atual, sem alteração (M-R1/M-R3). Plataforma desconhecida → 404; gate desligado → 409 com erro de domínio estável.
- `sweep()` **não muda**. Se precisar mudar, o desenho está errado (M-R5).

**Critério de aceite:** uma rodagem real da Shopee grava `capture_run(marketplace='shopee', status='ok')` com N > 0 itens, e produtos Shopee aparecem em `garimpa.product` com `marketplace='shopee'`. Verificado por script, não por narrativa (M-R7).

**Degrau caro:** `bin/verify-multiplataforma.ts` ainda não existe como script dedicado — a verificação por marketplace hoje é feita por `verify-shopee-links.ts` (M3, links) e pelo resumo que `sweep-shopee.ts` imprime ao fim de cada rodagem (produtos capturados, ativos/recentes/dormentes). Criar o script dedicado fica pendente para quando M5 (AliExpress) tornar "por marketplace" um caso genérico de fato — hoje bastaria repetir o que M1 já prova para dois marketplaces.

**Verificado:** gate testado por execução real nos dois sentidos — sem credencial, `sweep-shopee.ts` aborta com `[bloqueado]` antes de qualquer rede; **com credencial real (27/08/2026)**, `sweep-shopee.ts --pages 1` capturou **50 itens novos** de verdade (`capture_run(marketplace='shopee', status='ok', items_captured=50)`), confirmado no banco. Rota `/api/admin/rodagem/[marketplace]` e `captureRuns`/`runningRun` com filtro por marketplace cobertos por `tsc` + `next build`.

### ✅ M2 — Vitrine multiplataforma — feito e verificado 26/08/2026

- `deal-query.ts` ganha a dimensão `marketplace` (URL pública: `?loja=shopee`), normalizada contra o registro — valor inválido vira "todas", nunca erro.
- `topDeals` filtra por marketplace quando pedido; `dealCategories` idem.
- `VitrineProduct` ganha `marketplace`; o card mostra o selo da plataforma e `MarketplaceEvidence` passa a dizer a origem correta em vez de "dados do Mercado Livre" fixo.
- Filtro visível junto de categoria/preço, com contagem por plataforma.

**Critério de aceite:** com ML e Shopee no banco, `/` mostra os dois misturados; `/?loja=shopee` mostra só Shopee; nenhum card atribui a origem errada; o slug de cada card abre a página certa.

**Verificado:** testado ao vivo no dev server contra 347 produtos ML reais. **Achado durante a implementação (bug real, corrigido nesta entrega):** o `fetchDeals` do client montava a query para `/api/deals` sem incluir `marketplace` — o filtro clicava, a URL mudava (`?loja=shopee`), mas a lista continuada mostrando tudo. Corrigido em `vitrine.tsx` (`params.set("marketplace", ...)`) e reconfirmado: `Shopee` → 0 ofertas (nenhuma capturada ainda), `Mercado Livre` → 347, `todas` → 347. Slug legado do card (`ml-MLB54964804`) continua abrindo a página do produto sem erro de console. `tsc --noEmit` limpo; 120 testes web (foram 116, +4 de `deal-query`).

### ✅ M3 — Link de saída Shopee (pré-gerado, atribuição preservada) — implementado 26/08/2026, conferido 26/08/2026

- Migration: `publication.affiliate_url text` + `affiliate_url_generated_at timestamptz`. Aplicada e verificada (M-R7).
- Na publicação de um produto Shopee, o shortlink é gerado uma vez via `buildAffiliateLink` com o subId da publicação do afiliado dono (M-R6) e persistido.
- `/go/[slug]`: se o produto é ML → caminho `matt_word` atual, intacto. Se é de plataforma com link pré-gerado → grava `click_event` e redireciona para o `affiliate_url` persistido. Sem link persistido → **falha fechado** (404 com mensagem), nunca link cru sem comissão.

**Critério de aceite:** clique em oferta Shopee registra `click_event` e redireciona a um shortlink que contém o subId da publicação; nenhum caminho chama a API da Shopee dentro do redirect.

**Implementado (26/08/2026):**
- Migration `20260826080000_garimpa_publication_shopee_link.sql` — `publication.affiliate_url` + `affiliate_url_generated_at`. Aplicada no projeto Supabase `spbuwcwmxlycchuwhfir` e verificada por `packages/persistence/bin/verify-shopee-links.ts` (`npm run verify:shopee-links` no pacote persistence): colunas presentes, 0 publications Shopee hoje (nenhuma rodagem Shopee ainda rodou em produção).
- `packages/persistence/src/shopee-links.ts` (`ensureShopeeAffiliateLinks`): garante a `publication` (afiliado `aff_local`, canal `web`, slug `shp-<external_id>`) e gera o shortlink uma vez via `ShopeeAdapter.buildAffiliateLink`, com `subIds: [publication.id]` (M-R6). Chamado a partir de `packages/persistence/bin/sweep-shopee.ts`, **depois** do `sweep()` — não altera `sweep()` nem o núcleo (M-R5), e a chamada à API acontece na mesma execução que já chama a API para captura (não no redirect).
- `packages/web/lib/db.ts`: `resolveShopeePublicationForLink` (consulta) + `shopeeRedirectTarget` (decisão pura, testável sem `DATABASE_URL` — o tipo de entrada não carrega `product_url`, então não há como a decisão vazar o link cru por engano).
- `packages/web/app/go/[slug]/route.ts`: novo ramo `handleShopee`, resolvido **antes** de `handleV2`/`handleLegacy` por slug (`parseProductSlug`). Sem `affiliate_url` persistido → 404, nunca redirect para o produto. Os caminhos `handleV2`/`handleLegacy` do ML não foram tocados (diff conferível).
- Testes novos: `packages/web/test/shopee-go.test.mjs` (4 casos — sem publication, sem link gerado, com link, string vazia tratada como ausente). `npm test` nos três pacotes: capture 83/83, persistence 11/11, web 120/120 (116 antes + 4 novos). `npm run typecheck` limpo nos três.

**Achado durante a implementação:** `affiliate_marketplace_config` (tracking_id/tool_id) não é usada para Shopee — a atribuição inteira vive no `subIds: [publication.id]`, e a credencial de API é a única (da casa, `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`), não por afiliado. O campo `trackingId` do `AffiliateTag` é passado mas ignorado pelo `ShopeeAdapter.buildAffiliateLink` — mantido só porque o tipo o exige.

**PEDIDO DE CONFERÊNCIA (parcial — itens de risco) — VEREDITO (sessão separada, 26/08/2026):**
1. ✅ **Confirmado.** `handleV2`/`handleLegacy` reconstruídos byte-a-byte a partir do estado no início desta sessão de multiplataforma e comparados via `diff` contra o arquivo atual: **idênticos**, zero diferença.
2. ✅ **Confirmado.** `npm run verify:shopee-links` rodado contra o Supabase real: `PASS garimpa.publication.affiliate_url existe`, `PASS garimpa.publication.affiliate_url_generated_at existe`.
3. ✅ **Confirmado.** `grep -n "ShopeeClient\|fetch(" packages/web/app/go/[slug]/route.ts` — zero ocorrências. Nenhuma chamada de rede no caminho do redirect.
4. ✅ **Fechado em 27/08/2026, com credencial real** (dono configurou `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`/`SHOPEE_CAPTURE_ENABLED=true`). Rodagem real: `sweep-shopee.ts --pages 1` capturou **50 itens novos** (credencial válida, API responde). Ver os dois achados abaixo — a rodagem revelou dois bugs reais que só apareciam com dado de verdade.
5. ✅ **Resolvido nesta mesma sessão.** M0/M1/M2/M4 foram implementados e verificados (ver seções acima); os status deste documento foram corrigidos.

**Conclusão da conferência:** aprovado.

**Dois achados da primeira rodagem real (27/08/2026) — a regra da evidência funcionou: nenhum dos dois apareceria em teste unitário com mock.**

- **Bug 1 — `subId` com hífen é rejeitado pela Shopee.** `ensureShopeeAffiliateLinks` usava `pub.id` (UUID com hífen) como `subId`; a API devolveu `error [11001]: Params Error : invalid sub id` para as 50 publications. Isolado por teste direto (UUID sem hífen funcionou, com hífen falhou) antes de tocar no código. Corrigido em `packages/persistence/src/shopee-links.ts`: `subId = pub.id.replace(/-/g, "")` — continua único, só perde os hífens. Reprocessado: **50/50 links gerados**, confirmado por `verify:shopee-links` contra o banco real.
- **Bug 2 — imagens da Shopee quebravam a vitrine inteira.** `next.config.ts` só liberava `*.mlstatic.com` em `images.remotePatterns`; a primeira imagem de produto Shopee (`cf.shopee.com.br`) lançava `Invalid src prop … next-image-unconfigured-host` e o React derrubava a página com "Application error" — **qualquer produto Shopee na página quebrava a vitrine inteira**, não só o card dele. Corrigido: `cf.shopee.com.br` adicionado a `remotePatterns`. Verificado ao vivo: `/?loja=shopee` renderiza 48 cards, 0 imagens quebradas, filtro mostra `SHOPEE (50)` com contagem real, `/go/shp-<id>` redireciona (302) para um shortlink real (`s.shopee.com.br/…`) e grava `click_event` — conferido lendo a linha no banco, não por narrativa.

Esses dois bugs não existiam nos testes unitários (que usam mocks) nem no `next build`/`tsc` (que não sabem que uma API externa rejeita hífen ou que falta um hostname de imagem) — só apareceram com credencial e dado real, exatamente o motivo de o item 4 do pedido de conferência ter ficado em aberto até agora.

### ✅ M4 — Painel `/admin` remodelado — feito 26/08/2026, aguardando julgamento visual do dono

O painel hoje é uma pilha de seis blocos soltos (`AdminPanel`, `Capturador`, `Affiliates`, `Devices`, `Composer`, duas colunas de métricas) numa única página, com uma noção de "rodagem" que assume o ML. Remodelagem em **abas por intenção**, mantendo cada componente atual como conteúdo (sem reescrever o que funciona):

| Aba | Conteúdo |
|---|---|
| **Visão geral** | métricas atuais + estado por plataforma (última rodagem, produtos, se está ligada) |
| **Rodagens** | uma linha por plataforma com estado do gate, botão "rodar agora" (parâmetros próprios: páginas, palavra-chave, desconto mínimo) e histórico filtrável por plataforma. O ML aparece como **manual** com o aviso atual, sem botão de automação |
| **Captura manual** | `Capturador` (bookmarklet) + `Devices` — o caminho canônico, em destaque próprio |
| **Afiliados** | `Affiliates` |
| **Publicação** | `Composer` + mais clicados |

- `AdminPanel` deixa de ser "rodagens do robô" e vira componente parametrizado por plataforma.
- Estado vazio honesto: plataforma sem credencial diz **por que** está desligada, não some da tela.

**Critério de aceite:** o dono dispara rodagem de qualquer plataforma habilitada em ≤ 2 cliques; o ML continua exibindo o aviso de captura manual e **não ganha** botão de automação; nenhuma funcionalidade atual do painel desaparece.

**Verificado:** `AdminPanel` generalizado por `marketplace` (props `triggerPath`/`enabled`/`disabledNotice`); Mercado Livre e Shopee cada um na própria instância, listagem de `capture_run` filtrada por marketplace (antes de M4 as duas ficariam misturadas na mesma tabela — bug que essa filtragem evita). Abas em `admin-tabs.tsx` (Server Components passados como prop `content`, controlados por `hidden`, sem perder estado de polling ao trocar de aba). `tsc --noEmit` e `next build` limpos. **Não verificado no browser**: o painel exige login Google OAuth como dono, que não deve ser preenchido por automação — falta o degrau 5 (julgamento humano) desta escada.

### ✅ M5 — AliExpress — **integrada e rodando em 28/08/2026**

**Fechamento:** API aprovada pela AliExpress em 28/08. A espiga rodou, o adapter foi escrito sobre o resultado dela, e uma rodagem real capturou **49 produtos** (`capture_run` id `9cbbaf91-47f6-4e7f-8a2e-f94e8303a1a5`, status ok). Catálogo hoje: 347 ML + 77 Shopee + 49 AliExpress = 473.

**O que a espiga respondeu** (empírico, não inferido — 5 hipóteses testadas contra a API real):

| Dimensão | Resultado |
|---|---|
| Gateway | `/sync` ✓ · `/rest` ✗ (`InvalidApiPath`) |
| Hash | HMAC-SHA256 ✓ **e** MD5 ✓ |
| Timestamp | epoch-ms ✓ **e** datetime GMT+8 ✓ |
| OAuth | **não exigido** para `affiliate.product.query` |

Das combinações aceitas escolhemos **HMAC-SHA256 + epoch-ms**, por risco e não por gosto: MD5 é criptograficamente quebrado, e o timestamp em datetime exigiria a conversão para GMT+8 — cujo erro não falha como "hora errada" mas como "assinatura inválida", mandando o depurador atrás do hash. Epoch é `Date.now()`: zero lógica de fuso. **A espiga não só achou o que funciona, permitiu escolher a variante de menor superfície de bug.**

**Três achados que só apareceram com dado real:**

1. **Armadilha de moeda (o mais grave).** A resposta traz o mesmo preço em duas moedas, e os campos de nome mais óbvio são os errados: `sale_price` = 119.82 **CNY**, `target_sale_price` = 99.69 **BRL**. Ler o campo natural gravaria yuan rotulado como real, e o histórico — que é o produto — passaria a rastrear a moeda errada. O mapper lê exclusivamente `target_*` e **descarta a oferta** se a moeda declarada divergir; melhor perder uma oferta que gravar preço falso. Travado por teste usando o produto real da API.
2. **`tracking_id` é obrigatório, e a falha é silenciosa.** Sem ele a API responde normalmente, mas o `promotion_link` vem sem atribuição: a rodagem "funcionaria" e encheria o catálogo de links que não pagam nada. Por isso ele entrou na condição do gate, junto de chave e segredo — mesma filosofia de falha fechada do gate da Shopee e do `/go`.
3. **Nota em estrelas não existe nesta API.** `evaluate_rate` é `"100.0%"` — percentual de avaliações positivas, não média de 0 a 5. Testado também o `productdetail.get`: devolve exatamente o mesmo conjunto de campos. Decisão do dono: **não exibir estrela** em vez de converter percentual em nota, que seria afirmar equivalência que a loja não afirma. `ratingStar` fica ausente.

**M-R5 comprovado.** A fiação foi só o previsto: `bin/sweep-aliexpress.ts` (arquivo novo) + uma entrada em cada um dos quatro registros (`MARKETPLACES`, `CAPTURE_GATES`, `CAPTURE_TRIGGERS`, `RUN_PANELS`) + espelho web do gate. **`sweep()`, o store, a query da vitrine e o `/go` não mudaram uma linha.** A intercalação de lojas (M6) generalizou sozinha de duas para três: a home passou a servir **8/8/8 — `ML SH ALI ML SH ALI…`** sem nenhuma alteração no SQL, porque era `partition by marketplace` desde o início.

**Erros meus, pegos por teste e não em produção:** usei `toCents` (que multiplica por 100) para validar volume de vendas, o que transformaria 25 vendas em 2.500; e `percentToRate("")` devolvia `0` em vez de `undefined`, tratando campo vazio como "zero por cento" quando significa "não informado" — e zero é uma afirmação.

**Lição aplicada preventivamente:** adicionei `**.aliexpress-media.com` ao `next.config.ts` **antes** de rodar a captura. Foi exatamente o host de imagem ausente que derrubou a vitrine inteira quando a Shopee entrou; desta vez o incidente não se repetiu (16 imagens AliExpress renderizadas, zero quebradas).

**Pendente (não bloqueia):** logo oficial da AliExpress em `public/brand/marketplaces/aliexpress.png` — sem ele o card usa o carimbo textual tracejado, que é o fallback projetado. Mesmo caminho que ML e Shopee percorreram.

---

### 🗄️ M5 — histórico do bloqueio (27/08/2026)

Só começa com M1–M3 conferidas — a trilha (CLI, gate, rota, registro, link pré-gerado) já estará aberta e testada pela Shopee.

- `packages/capture/src/adapters/aliexpress/`: client do Open Platform (TOP), assinatura, `product.query` / `hotproduct.query` para captura e `link.generate` para o link.
- Adapter implementa `CaptureAdapter`; entra no registro com prefixo `ali-`.
- Gate próprio + `bin/sweep-aliexpress.ts` + entrada na aba Rodagens: só configuração, zero mudança de núcleo (é isso que M-R5 promete).

**Incógnita conhecida, registrada agora para não virar surpresa:** os tutoriais em `tutoriais/` são **conceituais** — descrevem capacidades e endpoints, mas **não trazem o algoritmo de assinatura nem o fluxo de `access_token`** da AliExpress (o tutorial da Shopee admite isso explicitamente para a própria Shopee, e ali o formato já foi resolvido em campo). A AliExpress usa o esquema TOP (parâmetros ordenados + segredo) e várias operações de afiliado exigem token e escopo aprovado. **Primeira tarefa de M5 é uma espiga de verificação**: uma chamada real autenticada que retorne 1 produto. Sem ela, nada de escrever adapter completo — assinatura inferida é a forma clássica de queimar dias.

**Confirmado em 27/08/2026:** a leitura completa de `tutoriais/tutorial-api-aliexpress-afiliados.md` fecha a questão — o documento cita nomes de endpoint (`aliexpress.affiliate.product.query`, `link.generate`), limites de paginação (50/página, até 100 páginas) e cota de referência (~5.000 chamadas/dia), mas **não contém uma linha sobre assinatura, gateway ou `access_token`**. A incógnita é real, não preguiça de leitura.

**Feito nesta entrega (o máximo honesto sem credencial):**

- `packages/capture/bin/aliexpress-probe.ts` — **a espiga**. Segue o precedente de `bin/link-lab.ts` (script de experimento do ML). Em vez de escolher uma variante de assinatura, enumera **cinco hipóteses coerentes** e dispara uma chamada real de cada contra a API, imprimindo a resposta crua: `sync-md5-datetime`, `sync-hmac-datetime`, `sync-hmac-epoch`, `sync-md5-epoch`, `rest-hmac-epoch-path`. As dimensões que variam (gateway `/sync` vs `/rest`, timestamp datetime-GMT+8 vs epoch-ms, MD5-envolvido vs HMAC-SHA256, base com ou sem prefixo de caminho) são exatamente as que divergem entre variantes reais do TOP. **Quem decide qual está certa é a API, não o autor do código.** Sem credencial, aborta com `[bloqueado]` sem fazer requisição (verificado por execução real). Rodar com `npm run probe:aliexpress` no pacote capture.
- `packages/capture/src/adapters/aliexpress/signing.ts` — só os primitivos que são **fato conhecido** do TOP (ordenação ASCII + concatenação `k+v`, as duas variantes de hash, timestamp GMT+8). Deliberadamente **não** existe uma função `sign()` opinativa: essa decisão pertence à espiga.
- `packages/capture/src/aliexpress-capture.ts` — kill switch próprio e isolado (M-R3), falha fechado. `ALIEXPRESS_ACCESS_TOKEN` **não** entra na condição de propósito: ainda não se sabe se o escopo exige OAuth (é uma das perguntas da espiga), e exigir um token possivelmente desnecessário deixaria a plataforma desligada sem motivo.
- Testes: `aliexpress-signing.test.ts` (15 casos) e `aliexpress-capture.test.ts` (6 casos). Capture passa de 83 para **104 testes**, todos verdes; `tsc --noEmit` limpo nos três pacotes.

**Por que os testes de assinatura existem antes do adapter:** `datetimeGmt8` e `baseString` são determinísticos e, se estiverem errados, fazem **toda** variante da espiga falhar com "assinatura inválida" — mandando o depurador atrás do algoritmo de hash, que não seria o culpado. Os testes removem esse confundidor antes de a espiga rodar. É o mesmo tipo de armadilha que a Shopee pregou com o `subId` hifenizado.

**O que deliberadamente NÃO foi feito, e por quê:**

| Não feito | Motivo |
|---|---|
| Entrada `aliexpress` em `packages/web/lib/marketplaces.ts` | Colocaria um filtro "AliExpress" na **vitrine pública** para uma plataforma que não tem adapter e nunca terá produto até M5 fechar. Estado vazio honesto vale para plataforma que *pode* capturar (Shopee sem credencial); aqui seria prometer ao usuário final algo que o código não entrega |
| Entrada em `capture-triggers.ts` / aba Rodagens | Mesma razão: botão "rodar agora" sem CLI por trás |
| `bin/sweep-aliexpress.ts` | Chamaria um adapter que não existe |
| Espelho web de `aliexpressCaptureEnabled` | Só faz sentido quando o painel tiver a plataforma |
| O adapter em si | **É o ponto do gate.** Assinatura inferida compila, passa em teste com mock, e só falha contra a API real |

**Situação em 27/08/2026:** o dono submeteu o formulário de solicitação da API com documentação; a chave só sai com a aprovação, prazo estimado de **2 a 5 dias**. Até lá M5 fica parada por dependência externa, não por falta de trabalho.

**Terreno preparado enquanto a chave não chega (27/08):**

- A intercalação de lojas na home (M6) é `partition by marketplace` — a AliExpress entra no rodízio **sem tocar na query**. No dia 1 ela terá catálogo sem histórico, exatamente a condição que tornava uma loja nova invisível; M6 já resolveu isso de forma geral.
- `packages/web/lib/platform-gates.ts` (novo): gate por slug num mapa único. Eliminou a cadeia `slug === "mercadolivre" ? … : slug === "shopee" ? …` que existia em `admin/page.tsx` — ela violava M-R5 e, pior, falhava em silêncio (ramo esquecido devolve `false` e a plataforma some do painel sem erro).
- `admin/page.tsx` passou a derivar rodagens e status **do registro** (`MARKETPLACES`), com `Promise.all` sobre a lista, em vez de buscar ML e Shopee com nomes fixos.
- Aviso de plataforma desligada mora em `RUN_PANELS`, explícito por loja **de propósito** — é prosa, não lógica: cada uma está desligada por motivo diferente, e genericizar produziria um "indisponível" que não ajuda ninguém a agir. Plataforma sem entrada ali simplesmente não ganha painel, que é o caso da AliExpress hoje: **ela não aparece prometendo um botão que não existe**.

**Checklist de quando a chave chegar** (o diff deve ser pequeno — é o teste de que o terreno estava mesmo pronto):
1. `ALIEXPRESS_APP_KEY`/`ALIEXPRESS_APP_SECRET`/`ALIEXPRESS_TRACKING_ID` em `packages/web/.env.local`.
2. `cd packages/capture && npm run probe:aliexpress` → a variante vencedora **é** a especificação.
3. Escrever o adapter conforme o veredito da espiga; `bin/sweep-aliexpress.ts` espelhando `sweep-shopee.ts`.
4. Uma entrada em `MARKETPLACES` (prefixo `ali-`), uma em `CAPTURE_GATES`, uma em `CAPTURE_TRIGGERS`, uma em `RUN_PANELS`. Vitrine, filtro, intercalação, slug e painel passam a funcionar sem mais nada.

**Bloqueio original (ação do dono):** configurar em `packages/web/.env.local` as variáveis `ALIEXPRESS_APP_KEY` e `ALIEXPRESS_APP_SECRET` (mais `ALIEXPRESS_TRACKING_ID`, provável, e `ALIEXPRESS_ACCESS_TOKEN` se o escopo exigir) e rodar `npm run probe:aliexpress`. O resultado da espiga **é** a especificação do adapter. Se nenhuma variante passar, a mensagem de erro distingue os dois casos possíveis: `Invalid signature` = algoritmo; `permission denied`/ISV = escopo da conta não aprovado no console da AliExpress — que é problema de conta, não de código.

### ✅ M6 — Diversidade de loja na home — feito e verificado 27/08/2026

**Pedido do dono (27/08):** "A página inicial deve misturar as ofertas, e sempre mostrar as 2 lojas. É o chamariz, e essa diversidade vai ser benéfica."

**O problema era pior do que parecia — medido antes de mexer:** os 24 primeiros da home eram **24/24 Mercado Livre**. A Shopee só aparecia na **página 2**. Ou seja: depois de capturar 50 produtos Shopee com sucesso, nenhum visitante da home veria um sequer.

**Causa (não era preferência por loja, era o critério de sinal):** produto recém-capturado tem UMA observação, então `previous_min_price_cents` é nulo, `lowest_verified` é falso e a queda percentual é nula. Ele perde **todos** os desempates do "melhores oportunidades" para produto com histórico. Como o catálogo Shopee inteiro nasceu hoje, ele inteiro perdia. **Consequência geral: nenhuma loja nova jamais apareceria na home** — o mesmo aconteceria com a AliExpress no dia 1.

**Solução:** `marketplace_rank` — `row_number()` particionado por marketplace usando os **mesmos** critérios de sinal, e a ordenação passa a ser pelo rank. Resultado: ML#1, SH#1, ML#2, SH#2… Cada loja entra com os seus melhores; ninguém é promovido por ser de loja nenhuma. Generaliza sozinho para N lojas — quando a AliExpress entrar vira ML/SH/ALI **sem tocar na query** (M-R5).

**Escopo deliberadamente estreito:** intercala só em `sort='signal'` (a vitrine curada) e sem filtro de loja. Em "menor preço" a pessoa pediu preço — intercalar poria um item de R$500 acima de um de R$100 e quebraria a promessa explícita do controle. Regra extraída para `shouldInterleaveMarketplaces()` em `deal-query.ts` e travada por teste, porque o modo de falha é silencioso (ninguém nota que "menor preço" parou de ordenar por preço até um usuário reclamar).

**Verificado contra o banco real (397 produtos: 347 ML + 50 Shopee):**

| Verificação | Resultado |
|---|---|
| Home (padrão) | **12 ML / 12 Shopee**, alternando `ML SH ML SH…` |
| "menor preço" | **não** intercalado; primeiro item R$9,90, preços estritamente crescentes |
| "mais populares" / "atualizados agora" | **não** intercalados |
| Filtro de loja | inalterado (50 Shopee) |
| Paginação (6 páginas, 144 produtos) | **0 duplicados**; Shopee esgota na pág. 5 e a home degrada para ML sozinho, naturalmente |
| Carrossel do topo | passou a mostrar **um produto de cada loja** (efeito emergente: ele pega os 2 primeiros com imagem) — a diversidade aparece no ponto mais nobre da página |

**Achado de bônus (bug do próprio autor, corrigido):** o `order by` referenciava `marketplace_rank` dentro de um `case when`, e o Postgres **não resolve alias de select dentro de expressão** no order by (só em referência nua) — `column "marketplace_rank" does not exist`. Resolvido materializando o rank numa CTE `ranked`. Um `tsc` limpo não pega isso; só a execução real pegou.

---

## 5. Escada de verificação (deste plano)

| Degrau | Como | Obrigatório em |
|---|---|---|
| 1 | `npm run typecheck` nos pacotes tocados | tudo |
| 2 | `node --test --experimental-strip-types` (capture, persistence, web) | tudo |
| 3 | Vitrine/painel abertos no dev server, com os dois marketplaces no banco | M2, M4 |
| 4 | Rodagem real + `bin/verify-multiplataforma.ts` lendo o banco | M1, M3, M5 |
| 5 | Julgamento do dono sobre o painel remodelado | M4 |

**Regra da evidência:** nenhuma entrega deste plano fecha com "rodei e funcionou". Afirmação sobre execução real vem do script de verificação, com ids e timestamps conferíveis.

---

## 6. Variáveis de ambiente novas (todas server-side, nunca `NEXT_PUBLIC_`)

| Variável | Para quê | Default seguro |
|---|---|---|
| `SHOPEE_APP_ID` / `SHOPEE_APP_SECRET` | credencial de captura da casa | ausente = plataforma desligada |
| `SHOPEE_CAPTURE_ENABLED` | gate explícito | ausente = desligado |
| `ALIEXPRESS_APP_KEY` / `ALIEXPRESS_APP_SECRET` | credencial de captura da casa (M5); as duas bastam para rodar a espiga | ausente = desligado |
| `ALIEXPRESS_TRACKING_ID` | id de afiliado; provavelmente exigido pelo `product.query` — a espiga confirma | ausente = espiga tenta sem ele |
| `ALIEXPRESS_ACCESS_TOKEN` | só se o escopo da conta exigir OAuth — **ainda não se sabe** (pergunta da espiga) | ausente = espiga tenta sem ele |
| `ALIEXPRESS_CAPTURE_ENABLED` | gate explícito (M5); não é lido pela espiga, só pela captura | ausente = desligado |

`ML_AUTOMATED_CAPTURE_ENABLED` **não muda de semântica e não é reaproveitada** (M-R3).
