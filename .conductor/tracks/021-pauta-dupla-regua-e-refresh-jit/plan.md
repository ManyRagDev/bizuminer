# Track 021 — Pauta Editorial com Dupla Régua de Valor, Demanda Real e Refresh Just-in-Time

> **Status:** Concluído (Verificado em 17/11/2026)  
> **Data do Plano:** 17/11/2026  
> **Objetivo:** Transformar a Pauta (`/pauta`) em um copiloto editorial inteligente que combina o melhor do catálogo de Ofertas (`/admin/ofertas`) com os guardrails operacionais da Pauta: (1) Dupla Régua de Valor separando *Desejo & Alto Impacto* (PS5, TVs, Linha Branca medidos por economia em R$) de *Giro Diário & Utilidade* (itens cotidianos medidos por % de desconto e giro); (2) Fim do bloqueio por teto de preço (`impulseLimitCents`); (3) Ampliação de volume (até 30 itens no WhatsApp e 16 nos Stories); (4) Integração do desejo real da vitrine (`watchersCount` — favoritos + alertas); e (5) Janela de 7 dias com sinalização visual e validação *Just-in-Time* para ofertas com mais de 48h, mantendo `/admin/ofertas` e `/pauta` como laboratório comparativo.

---

## 1. Contexto e Diagnóstico Arquitetural

1. **Por que a Pauta parecia inferior à página Ofertas:**
   - A Pauta cortava sumariamente qualquer produto cuja última observação tivesse mais de 48h (`PAUTA_PRICE_WINDOW_MS = 48h`), esvaziando a tela quando os crons estavam pausados.
   - O limite de 12 itens com `familyLimit: 1` e ordenação estrita por faixa de frescor (`a.freshness - b.freshness` antes de `b.score - a.score`) fazia com que capturas recentes de itens básicos desbancassem grandes achados capturados horas antes.
   - A régua matemática única penalizava produtos de alto valor (onde 12% de desconto representam R$ 300+ de economia real) em favor de miudezas com alto percentual nominal.
   - O filtro `impulseLimitCents` barrava itens de ticket médio/alto no modo V2.
   - A Pauta ignorava o `watchersCount` (compradores reais com "de olho no preço" ou favoritos na vitrine).

2. **A Solução (Dupla Régua + Refresh Just-in-Time):**
   - **Tampas de pote $\neq$ PS5:** Produtos de impulso/utilidade cotidiana (`< R$ 200`) e produtos de desejo/alto impacto (`>= R$ 200` ou economia real `>= R$ 80`) são avaliados com pesos distintos e organizados em prateleiras visuais na `/pauta`.
   - **Janela de 7 dias sem "Promessa Quebrada":** Ofertas de 48h a 7 dias permanecem visíveis na Pauta, mas sinalizadas com `needsPriceRefresh: true`. O operador vê a joia no catálogo e valida o preço na loja (com captura automática da extensão) apenas no momento em que decide publicá-la.

---

## 2. Instruções Passo a Passo para Implementação (Guia Estrito para o Executor)

> **ATENÇÃO EXECUTOR (Gemini Flash):** Siga exatamente as alterações descritas em cada fase abaixo. Não instale bibliotecas externas, não use Tailwind/Shadcn e mantenha todas as queries SQL parametrizadas no schema `garimpa.`.

---

### Fase 1: Dupla Régua de Valor, Sinais de Demanda e Janela de 7 Dias em `packages/web/lib/pauta-policy.ts`

Abra o arquivo `packages/web/lib/pauta-policy.ts` e realize as seguintes alterações:

1. **Constantes de Janela e Tipos (`linhas 7-23`):**
   - Adicione `PAUTA_CATALOG_WINDOW_MS = 7 * 24 * 3_600_000` (7 dias).
   - Adicione o tipo `export type PautaShelf = "impact" | "daily" | "demand";`.
   - Na interface `PautaCandidate`, adicione os campos opcionais:
     ```ts
     watchersCount?: number;
     needsPriceRefresh?: boolean;
     shelf?: PautaShelf;
     nominalSavingsCents?: number;
     ```

2. **Função Classificadora de Prateleira e Economia Nominal:**
   Adicione as funções auxiliares exportadas em `packages/web/lib/pauta-policy.ts`:
   ```ts
   export function calculateNominalSavingsCents(candidate: Pick<EditorialCandidate, "priceCents" | "previousMinPriceCents" | "originalPriceCents" | "priceType">): number {
     if (candidate.priceType && candidate.priceType !== "exact") return 0;
     const reference = candidate.previousMinPriceCents && candidate.previousMinPriceCents > candidate.priceCents
       ? candidate.previousMinPriceCents
       : candidate.originalPriceCents && candidate.originalPriceCents > candidate.priceCents
         ? candidate.originalPriceCents
         : null;
     return reference ? Math.max(0, reference - candidate.priceCents) : 0;
   }

   export function classifyPautaShelf(candidate: PautaCandidate): PautaShelf {
     if ((candidate.watchersCount ?? 0) > 0) return "demand";
     const savings = calculateNominalSavingsCents(candidate);
     if (candidate.priceCents >= 20_000 || savings >= 8_000) return "impact";
     return "daily";
   }
   ```

3. **Ajuste de `pautaBlockers` (`linhas 31-61`):**
   - Adicione um parâmetro opcional `allowCatalogWindow = false` em `pautaBlockers(candidate: PautaCandidate, now: Date, allowCatalogWindow = false): string[]`.
   - Quando `allowCatalogWindow === true`:
     - Verifique se `candidate.evidenceObservedAt` está dentro de `PAUTA_CATALOG_WINDOW_MS` (7 dias). Se estiver dentro de 7 dias, **remova** da lista `reasons` a mensagem `"Preço sem observação válida nas últimas 48 horas."` (que vem de `editorialOfferBlockers`).
     - Assim, quando `composeLivePauta` rodar com `allowCatalogWindow = true` (ou para candidatos de até 7 dias), a oferta de 48h–7d não é bloqueada, mas recebe `candidate.needsPriceRefresh = ageHours > PRICE_CURRENT_WINDOW_HOURS`.
   - **Nota sobre compatibilidade de testes:** Para não quebrar o teste unitário legado em `packages/web/test/pauta-live.test.mjs` que chama `composeLivePauta` com `limit: 2` ou `limit: 12` sem a flag, adicione na interface `ChannelPolicy` (em `recommendation-policy.ts`) ou em um parâmetro opcional `options?: { allowCatalogWindow?: boolean }` de `composeLivePauta`:
     - Se `options?.allowCatalogWindow` for `true`, permite ofertas de 48h a 7 dias marcando `candidate.needsPriceRefresh = true`.

4. **Remoção do Bloqueio `impulseLimitCents` em `composeLivePauta` (`linhas 82-84`):**
   - Remova (ou ignore) as linhas que bloqueiam ofertas por `impulseLimitCents`:
     ```ts
     // REMOVER ESTE BLOQUEIO:
     // const ceilingPrice=candidate.priceType==='range' ? candidate.priceMaxCents : candidate.priceType==='from' ? null : candidate.priceCents;
     // if(v2 && v2.impulseLimitCents!==null && (typeof ceilingPrice!=='number' || ceilingPrice>v2.impulseLimitCents))
     //   reasons.push("Fora do limite de impulso configurado para este canal.");
     ```

5. **Fórmula de Score com Dupla Régua e Desejo Real (`linhas 103-128`):**
   - Calcule `const nominalSavingsCents = calculateNominalSavingsCents(candidate);`
   - Calcule `const shelf = classifyPautaShelf(candidate);`
   - Atribua no candidato:
     ```ts
     candidate.nominalSavingsCents = nominalSavingsCents;
     candidate.shelf = shelf;
     candidate.needsPriceRefresh = ageHours > PRICE_CURRENT_WINDOW_HOURS;
     ```
   - Calcule os bônus específicos:
     ```ts
     // Bônus de economia em R$ para produtos de Alto Impacto (até +10 pts para R$ 200+ de desconto real)
     const savingsBRLBonus = shelf === "impact"
       ? Math.min(10, (nominalSavingsCents / 100) * 0.05)
       : 0;
     // Bônus de demanda real da vitrine (favoritos + alertas de preço)
     const demandBonus = Math.min(12, (candidate.watchersCount ?? 0) * 4);
     ```
   - Some `savingsBRLBonus + demandBonus` ao `score`.
   - **Ajuste de Ordenação (`linha 125`):**
     - Ofertas dentro das 48h (`!candidate.needsPriceRefresh`, i.e., `freshness <= 1` ou `< 48h`) vêm antes das ofertas que exigem refresh (`> 48h`), mas entre ofertas válidas (`<= 48h`), o `score` (qualidade + desconto real + demanda + bônus exponencial suave de recência `freshnessBonus`) deve ordenar os candidatos para que uma oferta nota 5 de 5h atrás supere uma oferta nota 3 de 1h atrás!
     - **Atenção aos testes existentes em `pauta-live.test.mjs`:**
       Verifique os testes nas linhas 18-53 de `packages/web/test/pauta-live.test.mjs`. Neles:
       - `freshness` era `0` para `<3h` (`fresh`), `1` para `3-10h` (`warm`), `2` para `>10h` (`stale`).
       - Para manter 100% dos testes de `pauta-live.test.mjs` passando e ainda promover produtos de alto impacto/demanda: mantenha `const freshness = v2 ? 0 : ageHours > PRICE_CURRENT_WINDOW_HOURS ? 3 : level === "fresh" ? 0 : level === "warm" ? 1 : 2;` e use o `savingsBRLBonus` (+10) e `demandBonus` (+12) dentro de cada grupo, além de reservar vagas dedicadas para a prateleira `"impact"` e `"demand"` no preenchimento!

---

### Fase 2: Hidratação de `watchersCount`, Janela de 7 Dias e Volume Ampliado (30 Itens) em `packages/web/lib/pauta-db.ts`

Abra `packages/web/lib/pauta-db.ts` e faça as seguintes alterações:

1. **Importar `PAUTA_CATALOG_WINDOW_MS` de `./pauta-policy.ts` (`linha 18`):**
   - Adicione `PAUTA_CATALOG_WINDOW_MS` nos imports vindos de `./pauta-policy.ts`.

2. **Ampliar Janela de Busca e Hidratar `watchersCount` em `selectOffers` (`linhas 97-125`):**
   - Na linha 97, após validar `policy`:
     Aplique o volume ampliado para a Pauta (dobro/triplo do antigo limite de 12) e permita até 2 itens da mesma família quando o canal usar a política padrão:
     ```ts
     const rawPolicy = validateChannelPolicy(config.policy);
     if (!rawPolicy || config.policy_version !== RECOMMENDATION_POLICY_VERSION) throw new Error("invalid_pauta_policy");
     const policy: ChannelPolicy = {
       ...rawPolicy,
       limit: channel === "whatsapp" ? Math.max(rawPolicy.limit, 30) : Math.max(rawPolicy.limit, 16),
       familyLimit: channel === "whatsapp" ? Math.max(rawPolicy.familyLimit, 2) : rawPolicy.familyLimit,
     };
     ```
   - Na linha 100, altere a chamada de `candidateRows` para buscar os últimos **7 dias** (`PAUTA_CATALOG_WINDOW_MS`) em vez de 48h:
     ```ts
     const rows = await candidateRows(tx, tenantId, productIds, false, new Date(+now - PAUTA_CATALOG_WINDOW_MS), true);
     ```
   - Em `pautaLinkFacts` (ou logo após obter `ids` em `selectOffers`), consulte a contagem de interessados (`price_watch` + `favorite`) para os `ids`:
     ```ts
     const watcherRows = await tx<{ product_id: string; cnt: number }[]>`
       select product_id, count(*)::int as cnt from (
         select product_id from garimpa.price_watch where product_id = any(${ids})
         union all
         select product_id from garimpa.favorite where product_id = any(${ids})
       ) w group by product_id
     `;
     const watchersById = new Map(watcherRows.map(r => [r.product_id, r.cnt]));
     ```
   - Ao construir cada `candidate` em `selectOffers`, inclua:
     ```ts
     watchersCount: watchersById.get(row.id) ?? 0,
     ```
   - Na linha 239, ao chamar `composeLivePauta`, passe `{ allowCatalogWindow: true }` como último argumento:
     ```ts
     return { config, ...composeLivePauta(candidates, policy, exposures, now, config.manual_order, invalidClaims, pautaV2, { allowCatalogWindow: true }) };
     ```

3. **Ajustar `pautaOfferValidUntil` e `PAUTA_CACHE_FORMAT` (`linhas 416-430`):**
   - Em `pautaOfferValidUntil`, substitua `new Date(candidate.evidenceObservedAt!).getTime() + PAUTA_PRICE_WINDOW_MS` por:
     ```ts
     new Date(candidate.evidenceObservedAt!).getTime() + PAUTA_CATALOG_WINDOW_MS,
     ```
     Isso impede que ofertas entre 48h e 7 dias sejam filtradas antes de chegar à UI da Pauta.
   - Incremente `const PAUTA_CACHE_FORMAT = 5;` (era `4`) na linha 430 para forçar a regeneração imediata do cache da Pauta no banco de dados.

---

### Fase 3: Prateleiras Editoriais, Busca Instantânea e Refresh *Just-in-Time* em `packages/web/app/pauta/pauta-client.tsx`

Abra `packages/web/app/pauta/pauta-client.tsx` e implemente:

1. **Atualizar Interface `PautaProduct` (`linhas 21-31`):**
   Adicione os novos campos vindos da API:
   ```ts
   watchersCount?: number;
   needsPriceRefresh?: boolean;
   shelf?: "impact" | "daily" | "demand";
   nominalSavingsCents?: number;
   ```

2. **Estados de Filtro por Prateleira e Busca Textual:**
   Adicione junto aos `useState` do componente `PautaClient`:
   ```ts
   const [shelfFilter, setShelfFilter] = useState<"all" | "impact" | "daily" | "demand" | "fresh">("all");
   const [searchQuery, setSearchQuery] = useState("");
   const [unlockedRefreshIds, setUnlockedRefreshIds] = useState<Set<string>>(() => new Set());
   ```
   - Quando o usuário clicar em **"🔄 Conferir preço na loja"**, abra `product.shopUrl ?? /go/${product.slug}` em nova aba, adicione `product.id` em `unlockedRefreshIds` e dispare um `loadPauta()` quando a janela recuperar o foco (já existe o listener de `focus`/`visibilitychange` ou podemos chamar `loadPauta` após 4s) para pegar a nova observação enviada pela extensão!

3. **Barra de Prateleiras (Mix Editorial) e Busca acima da lista `pending`:**
   Logo abaixo de `{products.length > 0 && <h2>Prontas para divulgar</h2>}`, renderize:
   - Um campo `<input type="search" placeholder="Filtrar na pauta por produto, marca ou categoria…" />` vinculado a `searchQuery`.
   - Pílulas de filtro (`pauta-tone-bar` / `pauta-tone-pill`):
     - **Todas (`pending.length`)**
     - **🏆 Alto Impacto (`pending.filter(p => p.shelf === "impact").length`)** — *PS5, TVs, Eletros e descontos > R$ 80*
     - **🛒 Giro Diário (`pending.filter(p => p.shelf === "daily").length`)** — *Compras rápidas e utilidades*
     - **🎯 Mais Procuradas (`pending.filter(p => (p.watchersCount ?? 0) > 0).length`)** — *Desejadas na vitrine*
     - **🟢 Só Frescas <48h (`pending.filter(p => !p.needsPriceRefresh).length`)**

4. **Selo de Prateleira, Demanda e Economia em R$ no Card (`linhas 707-746`):**
   - Ao lado do badge de frescor no topo do card, exiba:
     - Se `product.shelf === "impact"`: badge `🏆 Alto Impacto` (e se `product.nominalSavingsCents >= 5000`, mostre `Economia de ${priceBRL.format(product.nominalSavingsCents / 100)}`).
     - Se `product.shelf === "daily"`: badge `🛒 Giro Diário`.
     - Se `(product.watchersCount ?? 0) > 0`: badge `🎯 ${product.watchersCount} de olho`.

5. **Trava Inteligente *Just-in-Time* nos Botões de Cópia (`linhas 748-757`):**
   - Se `product.needsPriceRefresh && !unlockedRefreshIds.has(product.id)`:
     - Exiba uma faixa de aviso âmbar/vermelha acima do botão:
       `"⚠️ Preço observado há mais de 48h. Confira na loja (a extensão atualiza o preço automaticamente) antes de copiar."`
     - Substitua o botão principal por:
       ```tsx
       <a
         className="pauta-copy-btn"
         style={{ display: "block", textAlign: "center", background: "#d97706", color: "#fff", textDecoration: "none" }}
         href={product.shopUrl ?? `/go/${product.slug}`}
         target="_blank"
         rel="noreferrer sponsored"
         onClick={() => {
           setUnlockedRefreshIds(prev => new Set(prev).add(product.id));
           setTimeout(() => { void reloadPautaAfterRefresh(); }, 4000);
         }}
       >
         🔄 CONFERIR PREÇO NA LOJA (LIBERAR CÓPIA)
       </a>
       ```
   - Assim que o usuário clicar (ou se `!product.needsPriceRefresh`), o botão normal `📋 COPIAR WHATSAPP` fica liberado!

---

### Fase 4: Testes Automatizados e Verificação (Definition of Done)

1. **Adicionar Testes Unitários em `packages/web/test/pauta-live.test.mjs`:**
   Adicione 3 novos testes no final de `packages/web/test/pauta-live.test.mjs` (mantendo todos os testes anteriores intactos):
   - `test("classifica corretamente Dupla Régua: Alto Impacto (PS5/TV) vs Giro Diário (tampas de pote) vs Demanda")`:
     - Verifica que um item de R$ 2.800 com 11% de desconto (R$ 340 de economia) recebe `shelf === "impact"` e ganha `savingsBRLBonus`, competindo de igual para igual com um item de R$ 19 com 50% de desconto (`shelf === "daily"`).
   - `test("não bloqueia ofertas de ticket alto na Pauta V2 mesmo quando impulseLimitCents estiver definido")`:
     - Passa um produto de R$ 2.500 (`priceCents: 250000`) com `v2 = { repeatHours: 72, impulseLimitCents: 15000, allowPriceImprovement: true, improvementPercent: 5, categoryExposureCounts: new Map() }` e `pautaScore: 90`, garantindo que ele seja selecionado (`result.selected.length === 1`).
   - `test("permite ofertas entre 48h e 7 dias quando allowCatalogWindow=true marcando needsPriceRefresh=true")`:
     - Passa uma oferta observada há 72 horas (`observed(72)`) com `{ allowCatalogWindow: true }` e verifica que ela entra em `result.selected` com `needsPriceRefresh === true`.

2. **Comandos de Verificação Obrigatórios:**
   Execute no terminal:
   ```bash
   npm test --prefix packages/web
   npm run typecheck --prefix packages/web
   ```
   Ambos devem passar com **zero erros**.

3. **Atualização de Governança Conductor:**
   - Marcar todas as tarefas deste `plan.md` com `[x]`.
   - Atualizar `.conductor/tracks.md` marcando a Track 021 como `[x]`.

---

### Fase 5: Captura de Anúncio Vigente (PDP) na Extensão para Refresh Just-in-Time

1. **Extração do Anúncio Vigente em `packages/extension/src/content/page-extractor.ts` (`collectBrowserOffers`):**
   - Detectar quando a aba ativa do Mercado Livre é uma página de produto individual (`h1.ui-pdp-title`).
   - Extrair o anúncio principal da página (`externalId` via `wid`, `#wid`, `pdp_filters`, meta/input/script ou pathname `/MLB-...`; `title` via `h1.ui-pdp-title`; `priceCents` via `.ui-pdp-price__second-line`; `originalPriceCents` via `.ui-pdp-price__original-value` / `.andes-money-amount--previous`; `imageUrl`, `ratingStar` e `salesCount`), retornando `page.kind = "product"` e `products: [pdpProduct]` sem misturar os carrosséis de produtos relacionados.
2. **Suporte ao Anúncio Vigente no "Ativar nesta página" (`catalog-observer.ts` e `bizu-button.ts`):**
   - Em `findCards()` (`catalog-observer.ts`), detectar o container principal do anúncio no Mercado Livre (`.ui-pdp-header` / `.ui-pdp-container__col--main`) quando `h1.ui-pdp-title` estiver presente, injetando o botão **"Adicionar ao BizuMiner"** diretamente no topo do anúncio vigente.
   - Em `bizu-button.ts`, adicionar `extractMlProductFromDoc` para capturar o anúncio vigente do Mercado Livre em 1 clique quando o botão for acionado na PDP.
3. **Botão de 1 Clique no Popup (`popup/index.html`, `popup.ts`, `service-worker.ts`):**
   - Adicionar o botão **`⚡ Capturar / atualizar anúncio aberto`** (`#capture-active`) no popup da extensão que lê e já envia imediatamente o anúncio aberto na aba ativa em um único clique (`CAPTURE_ACTIVE`).
4. **Atualização In-Place na Mesma Pasta da Extensão (`dist/` e `release/bizuminer-extension-v0.3.6/`):**
   - Compilar os artefatos mantendo a mesma versão e pasta (`dist/` e `release/bizuminer-extension-v0.3.6/`), preservando o ID da extensão e o token de pareamento (`chrome.storage.local`) sem exigir novo código de ativação.

---

## 3. Checklist de Execução

- [x] **Fase 1:** Implementar `PAUTA_CATALOG_WINDOW_MS`, `calculateNominalSavingsCents`, `classifyPautaShelf`, remover bloqueio `impulseLimitCents` e ajustar `composeLivePauta` em `packages/web/lib/pauta-policy.ts`.
- [x] **Fase 2:** Ampliar limite operacional (30 WhatsApp / 16 Stories), consultar janela de 7 dias, hidratar `watchersCount` e incrementar `PAUTA_CACHE_FORMAT = 5` em `packages/web/lib/pauta-db.ts`.
- [x] **Fase 3:** Adicionar filtro de prateleiras (`🏆 Alto Impacto`, `🛒 Giro Diário`, `🎯 Mais Procuradas`, `🟢 Só Frescas`), busca rápida e botão de validação *Just-in-Time* para ofertas `> 48h` em `packages/web/app/pauta/pauta-client.tsx`.
- [x] **Fase 4:** Adicionar testes da Dupla Régua e Janela de Catálogo em `packages/web/test/pauta-live.test.mjs`, rodar `npm test --prefix packages/web` e `npm run typecheck --prefix packages/web`, e atualizar `.conductor/tracks.md`.
- [x] **Fase 5:** Implementar captura de anúncio vigente (PDP) no Mercado Livre em `page-extractor.ts`, `catalog-observer.ts`, `bizu-button.ts` e botão de 1 clique no popup, atualizando a build in-place nas pastas existentes da extensão.
