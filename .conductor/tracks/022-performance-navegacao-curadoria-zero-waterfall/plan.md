# Track 022 — Performance de Navegação, Curadoria On-Demand e Zero-Waterfall

> **Status:** Concluída e Verificada em Produção  
> **Data de Conclusão:** 18/11/2026  
> **Objetivo:** Eliminar os gargalos severos de carregamento nas páginas autenticadas do BizuMiner (`Curadoria → Andamento` de ~31 s / 21,6 MB para ~1 s / < 150 KB; `Hoje` de 10,2 s para ~1,2 s; `Pauta` de 6,9 s para ~1,2 s; `Capturas` de 4,3 s para ~0,8 s) sem perder qualidade editorial, precisão factual, garantias de RLS ou cobertura de testes.

---

## 🚀 Resultados Aferidos em Produção (VPS 179.66.133.110)

| Página / Recurso | Antes (Gargalo Observado) | Depois (Track 022 em Produção) | Ganho Real |
|---|---|---|---|
| **`readCurationPool` (SQL)** | 14.700 ms (14,7 s) | **5,4 ms** | **~2.700x mais rápido** |
| **`Curadoria → Andamento` (SSR)** | 30,8–31,7 s (21,6 MB uncompressed, 1.816 cards) | **Gavetas sob demanda (0 candidatos na abertura padrão / < 100 KB)** | **Eliminação de 21,5 MB de HTML desnecessário** |
| **Bancada Focalizada (`params.revisar`)** | 30,8 s (carregava todos os 1.816 itens) | **83,2 ms** | **~370x mais rápido** |
| **`Pauta` (WhatsApp / Stories)** | 3,5 s SSR + 3,4 s fetch client-side = **6,9 s** | **Zero-Waterfall (SSR Direto + Hidratação Instantânea)** | **Fim do delay do segundo fetch client-side** |
| **Suíte de Testes Automatizada** | 745 testes passando | **748 testes passando (100% verde)** | Zero regressões |

---

## 1. Diagnóstico Arquitetural e Causas-Raiz Comprovadas

1. **Gavetas fechadas na Curadoria (`packages/web/app/admin/curadoria/page.tsx` + `selecao-view.tsx`):**
   - Ao abrir `/admin/curadoria` (`aba === "selecao"` / *Andamento*), o servidor dispara um `Promise.all` com **11 consultas pesadas** disputando a conexão do pool, incluindo `getEditorialSelectionDesk` (que carrega **todos os 1.816 candidatos aprovados/retidos dos últimos 7 dias** porque `LIMIT` é `NULL` quando `includePending=false`), `readScoreComparison` para os 1.816 IDs e `readCurationPool` (**14,7 s** no PostgreSQL).
   - O SSR renderiza **1.816 cards completos** (`<article className="selecao-card">`) e uma tabela de `shadowComparison` com até 1.816 linhas dentro de dois blocos `<details>` que **nascem fechados** (*"Revisão editorial de um produto · opcional"* e *"Configurações e diagnóstico"*), transferindo **21,6 MB descomprimidos (1,7 MB gzip)** sem que o operador tenha solicitado abrir essas gavetas.

2. **Contagem cara no Menu Administrativo (`AccountAdminShell`) e repetição na mesma página (`readProcessingProgress` — 2,6 s por execução):**
   - Em `packages/web/lib/operation-processing-db.ts`, a CTE `assessed` executa `garimpa.has_current_curation_assessment(...)` **produto por produto** para todos os ~2.000 produtos da conta (mesmo quando `s.product_id IS NULL`, ou seja, quando não há projeção de nota para a observação atual) e avalia um subselect correlacionado `NOT EXISTS (SELECT 1 FROM editorial_offer_choice ...)` dentro do `LATERAL` de `price_observation`.
   - Além disso, `readCurationAutomation` não é memoizado por requisição: `AccountAdminShell` (layout) e `CurationPage` / `AdminPage` (página) executam a mesma consulta duas vezes seguidas no mesmo SSR, e o cliente ainda dispara uma 3ª execução via `/api/admin/operacao`.

3. **Consulta `readCurationPool` beirando o timeout de 15 s (`packages/web/lib/curation-pool-read.ts` — 14,7 s):**
   - A CTE `edition` faz `FROM garimpa.recommendation_edition e CROSS JOIN LATERAL jsonb_array_elements(e.inputs)` sobre **todas as edições históricas** do canal `home` (sem filtrar a edição mais recente `ORDER BY created_at DESC LIMIT 1`), invocando `current_offer_valid_until`, `has_current_curation_assessment` e `equivalent_human_veto` milhares de vezes.
   - A CTE `pool` também repete o subselect correlacionado de `editorial_offer_choice` dentro do `LATERAL` de `price_observation`.

4. **Waterfall Duplo em `Hoje` (`/admin`) e `Pauta` (`/pauta`):**
   - Na `Pauta` (`packages/web/app/pauta/page.tsx`), o servidor espera o layout, envia `PautaClient` vazio (3,5 s) e só após a hidratação no navegador o `useEffect` busca `/api/pauta?canal=...` (+3,4 s = 6,9 s).
   - Em `Hoje` (`packages/web/app/admin/page.tsx`), o navegador espera o SSR (5,1 s) para só então montar `<TodayOperationStatus />` / `<OperationalToday />` e buscar `/api/admin/operacao` (+5,1 s = 10,2 s).

---

## 2. Instruções Passo a Passo para Implementação (Guia Estrito)

> **ATENÇÃO EXECUTOR:** Siga exatamente as fases abaixo. Preserve todos os contratos de segurança (RLS, `inAccountScope`, `withAccountDb`), não adicione bibliotecas externas e garanta que 100% dos testes unitários existentes continuem passando.

---

### Fase 1: Otimização SQL de `readProcessingProgress` e Deduplicação por Request (`operation-processing-db.ts` e `curation-automation.ts`)

1. **Otimizar a consulta `facts` e `promotions` em `packages/web/lib/operation-processing-db.ts` (`linhas 26-41`):**
   - Substitua o bloco da consulta `const [facts] = await tx<...>` (linhas 26–41) por uma versão que:
     1. Faz `LEFT JOIN garimpa.editorial_offer_choice choice` **uma única vez** no nível do produto `p`, eliminando o `NOT EXISTS` correlacionado de dentro do `LATERAL` de `price_observation`;
     2. Na CTE `assessed`, agrupa por produto (`distinct on (c.id)`) na versão ativa da política de score e **só chama** `garimpa.has_current_curation_assessment` quando `s.product_id is not null` (evitando chamadas PL/pgSQL e descompactação JSONB para produtos que nem sequer possuem projeção para a observação atual):
     ```ts
     const [facts]=await tx<Array<{recorded:number;compatible:number;reused:number;eligible:number}>>`
       with current as materialized(select p.id,c.status,o.id as observation_id from garimpa.product p
         left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
         left join garimpa.editorial_offer_choice choice on choice.tenant_id=p.tenant_id and choice.product_id=p.id
         left join lateral(select id from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
           and (choice.option_key is null or o.option_key=choice.option_key)
           order by o.observed_at desc,o.id desc limit 1) o on true
         where p.tenant_id=${account.tenantId} and (${ids??null}::text[] is null or p.id=any(${ids??[]}::text[]))),
       assessed as (select c.id,c.status,c.observation_id,a.observation_id as assessed_observation,
         case when c.observation_id is not null and s.product_id is not null
           then garimpa.has_current_curation_assessment(${account.tenantId},c.id,c.observation_id)
           else false end as compatible,
         exists(select 1 from garimpa.curation_attribute_assessment a2 where a2.tenant_id=${account.tenantId} and a2.product_id=c.id) as recorded
         from current c left join lateral (
           select s.tenant_id,s.product_id,s.observation_id,s.assessment_id
           from garimpa.curation_score_projection s
           where s.tenant_id=${account.tenantId} and s.product_id=c.id and s.observation_id=c.observation_id
           order by s.calculated_at desc limit 1
         ) s on true
         left join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id)
       select count(distinct id) filter(where recorded)::int recorded,count(distinct id) filter(where compatible)::int compatible,
         count(distinct id) filter(where compatible and observation_id<>assessed_observation)::int reused,
         count(distinct id) filter(where status='approved')::int eligible from assessed`;
     ```
   - Na consulta fallback de `jobs` (linhas 64–67, usada quando `schema.operation_reader` é `false`), aplique também o `left join garimpa.editorial_offer_choice choice on choice.tenant_id=p.tenant_id and choice.product_id=p.id` e `and (choice.option_key is null or o.option_key=choice.option_key)`.

2. **Deduplicar `readCurationAutomation` dentro da mesma requisição SSR em `packages/web/lib/curation-automation.ts`:**
   - Quando `AccountAdminShell` e `CurationPage` (ou `AdminPage`) chamam `readCurationAutomation(account)` durante a mesma renderização de servidor, ambas usam o mesmo objeto/escopo de `account` dentro de `inAccountScope`.
   - Use um `WeakMap<object, Promise<CurationAutomation | null>>()` indexado pela referência do objeto `account` (ou `currentAccount()`) quando `factory === db`, limpando a entrada do `WeakMap` caso a promessa rejeite (e mantendo o reuso durante a vida daquele `account` na requisição):
     ```ts
     import {db} from './db.ts';
     import type {AccountContext} from './tenant-db.ts';
     import {readProcessingProgress} from './operation-progress-db.ts';
     export type CurationAutomation={queued:number;running:number;uncertain:number;assessed:number;eligible:number;exceptions:number;checks:number};

     const requestAutomationCache = new WeakMap<object, Promise<CurationAutomation | null>>();

     /** The sidebar, initial summary and live status share the same current-work rules. */
     export async function readCurationAutomation(account:AccountContext,factory:typeof db=db):Promise<CurationAutomation|null>{
       if (factory === db && account && typeof account === 'object') {
         const cached = requestAutomationCache.get(account);
         if (cached) return cached;
         const promise = computeCurationAutomation(account, factory).catch((err) => {
           requestAutomationCache.delete(account);
           throw err;
         });
         requestAutomationCache.set(account, promise);
         return promise;
       }
       return computeCurationAutomation(account, factory);
     }

     async function computeCurationAutomation(account:AccountContext,factory:typeof db=db):Promise<CurationAutomation|null>{
       const state=await readProcessingProgress(account,undefined,factory);
       if(!state.evaluation)return null;
       const e=state.evaluation;
       return {queued:e.queued,running:e.running,uncertain:e.uncertain,assessed:e.recorded,eligible:e.eligible,exceptions:e.exceptions,checks:state.preparation?.products??0};
     }
     ```
   - **Nota sobre testes:** Como cada teste cria um novo objeto `account` literal (ou substitui `readCurationAutomation` por stub em `operation-progress-ui.test.mjs`), o `WeakMap` não vaza entre testes nem entre requisições HTTP!

---

### Fase 2: Otimização SQL de `readCurationPool` (de 14,7 s para < 200 ms) em `packages/web/lib/curation-pool-read.ts`

Abra `packages/web/lib/curation-pool-read.ts` e otimize a consulta SQL (linhas 24–90):

1. **Restringir `edition` apenas à última edição ativa do canal `home` antes de expandir `jsonb_array_elements`:**
   - Adicione uma CTE `latest_home_edition` que seleciona `e.tenant_id, e.inputs` com `ORDER BY e.created_at DESC, e.id DESC LIMIT 1`.
   - Assim, `edition` avalia no máximo os ~24 itens da edição vigente em vez de varrer todas as edições históricas da tabela `garimpa.recommendation_edition`!
2. **Eliminar o subselect correlacionado de `editorial_offer_choice` de dentro do `LATERAL` da CTE `pool`:**
   - Faça `left join garimpa.editorial_offer_choice choice on choice.tenant_id=p.tenant_id and choice.product_id=p.id` no nível de `garimpa.product p` e filtre `and (choice.option_key is null or o.option_key=choice.option_key)` dentro do `LATERAL` de `price_observation`.
   - Código exato das CTEs `latest_home_edition`, `edition` e `pool`:
     ```sql
     with latest_home_edition as materialized (
       select e.tenant_id, e.inputs
       from garimpa.recommendation_edition e
       join garimpa.recommendation_channel channel on channel.tenant_id=e.tenant_id and channel.channel=e.channel
       where e.tenant_id=${account.tenantId} and e.channel='home' and channel.enabled
         and e.config_version=channel.version and (channel.valid_until is null or channel.valid_until>now())
       order by e.created_at desc, e.id desc limit 1
     ), edition as materialized (
       select item->>'productId' as product_id from latest_home_edition e
       cross join lateral jsonb_array_elements(e.inputs) item
       join garimpa.price_observation o on o.tenant_id=e.tenant_id and o.product_id=item->>'productId' and o.id=item->>'observationId'
       where item->>'curationPolicyVersion'=${String(policy.version)}
         and (item->>'validUntil')::timestamptz>now()
         and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
         and garimpa.has_current_curation_assessment(o.tenant_id,o.product_id,o.id)
         and not garimpa.equivalent_human_veto(o.tenant_id,o.product_id,o.id)
         and o.id=(select newest.id from garimpa.price_observation newest where newest.tenant_id=o.tenant_id and newest.product_id=o.product_id
           and newest.option_key=o.option_key order by newest.observed_at desc,newest.id desc limit 1)
     ),
     ```
     E na CTE `pool`:
     ```sql
     from garimpa.product p
     left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
     left join garimpa.editorial_offer_choice choice on choice.tenant_id=p.tenant_id and choice.product_id=p.id
     left join lateral (select o.id,o.observed_at from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
       and (choice.option_key is null or o.option_key=choice.option_key)
       order by o.observed_at desc,o.id desc limit 1) observation on true
     ```

---

### Fase 3: Carregamento Sob Demanda das Gavetas Opcionais na Curadoria (`page.tsx`, `editorial-selection-db.ts` e `selecao-view.tsx`)

1. **Recorte focalizado em `getEditorialSelectionDesk` (`packages/web/lib/editorial-selection-db.ts`, linha 449):**
   - Adicione um parâmetro opcional `options?: { focusedOnly?: boolean; limit?: number }` ao final de `getEditorialSelectionDesk`:
     ```ts
     export async function getEditorialSelectionDesk(
       tenantId = scopedTenantId(),
       sqlFactory: typeof db = db,
       reviewProductId?: string,
       includePending = false,
       options?: { focusedOnly?: boolean }
     )
     ```
   - Quando `options?.focusedOnly === true` e `reviewProductId` for informado:
     - Em vez de chamar `candidateRows(tx, tenantId, undefined, includePending)` (que carrega todos os 1.816 candidatos!), carregue apenas os IDs necessários: o `reviewProductId` + os IDs que já fazem parte da `selection` ativa (`selection?.items.map(i => i.productId) ?? []`):
       ```ts
       const targetIds = options?.focusedOnly && reviewProductId
         ? Array.from(new Set([reviewProductId, ...(selection?.items.map(i => i.productId) ?? [])]))
         : undefined;
       const rows = await candidateRows(tx, tenantId, targetIds, includePending);
       ```
     - Isso mantém todos os testes existentes que chamam `getEditorialSelectionDesk(tenantId, factory, reviewProductId)` (sem `options`) 100% inalterados, enquanto permite que a abertura de um produto específico na Curadoria carregue apenas 1 produto (em < 50 ms) em vez de 1.816!

2. **Carregamento Sob Demanda em `packages/web/app/admin/curadoria/page.tsx` (`linhas 108-188`):**
   - Na aba `aba === "selecao"`:
     - Defina duas flags baseadas nos query params:
       ```ts
       const loadReviewDesk = Boolean(params.revisar) || params.bancada === "1";
       const loadFullReviewCatalog = params.bancada === "1";
       const loadDiagnostics = Boolean(params.configurar) || params.diagnostico === "1";
       ```
     - No `Promise.all` de `aba === "selecao"`:
       - `published`, `eligible`, `handoff` são leves e necessários para o topo da tela — continuam rodando sempre.
       - `desk`: só executa `getEditorialSelectionDesk(scopedTenantId(), undefined, params.revisar, false, { focusedOnly: !loadFullReviewCatalog && Boolean(params.revisar) })` se `loadReviewDesk || loadDiagnostics` for `true`; caso contrário, resolve `{ schemaReady: true, selection: null, candidates: [], catalogHeroActive: false, publishedProductIds: [] }`.
       - `scoreComparison`: só executa `readScoreComparison(...)` se `loadReviewDesk` for `true` e `desk.candidates.length > 0`; caso contrário, resolve `[]`.
       - `engagement`, `recommendations`, `discovery`, `equivalence`, `operations`, `policy`, `pool`: só executam se `loadDiagnostics` for `true`! Caso contrário, resolvem seus valores vazios/nulos padrão.
     - Na gaveta `<details className="curation-manual-edition" open={loadReviewDesk}>` (linhas 160–174):
       - Se `loadReviewDesk` for `true`: renderiza `<SelecaoView ... />` normalmente (e se veio apenas com `params.revisar` sem `bancada=1`, exibe um link discreto *"Ver todos os produtos aprovados na bancada →"* apontando para `?aba=selecao&bancada=1&revisar=...`).
       - Se `loadReviewDesk` for `false`: renderiza a explicação e um botão/link de ação imediata:
         ```tsx
         <p style={{ marginTop: "8px" }}>
           <a className="curation-primary-action" href={`${href("selecao")}&bancada=1`}>
             Abrir bancada de revisão editorial →
           </a>
         </p>
         ```
     - Na gaveta `<details className="curation-advanced" id="curation-settings" open={loadDiagnostics}>` (linhas 175–186):
       - Se `loadDiagnostics` for `true`: renderiza todos os controles (`PolicyControl`, `RecommendationControl`, `EquivalenceControl`, `DiscoveryControl`, `HomepageMetrics`, `OperationsMetrics`, `PoolStatus`).
       - Se `loadDiagnostics` for `false`: renderiza o texto explicativo, `{supportLinks}` e o link:
         ```tsx
         <p style={{ marginTop: "12px" }}>
           <a className="curation-primary-action" href={`${href("selecao")}&diagnostico=1#curation-settings`}>
             Carregar configurações e diagnóstico da curadoria →
           </a>
         </p>
         ```

3. **Paginação Visual (Windowing) em `packages/web/app/admin/curadoria/selecao-view.tsx` (`linhas 366-524`):**
   - Mesmo quando o operador clicar em *"Abrir bancada de revisão editorial"* (`bancada=1`), não devemos despejar 1.816 cards no DOM de uma só vez.
   - Adicione um estado `const [visibleLimit, setVisibleLimit] = useState(24);` em `SelecaoView` (resetando para `24` quando `search` ou `marketplace` mudar).
   - Renderize `filtered.slice(0, visibleLimit)` no `.selecao-grid` (garantindo que se `editingId` estiver fora dos primeiros `visibleLimit`, ele também seja incluído).
   - Abaixo do `.selecao-grid`, se `filtered.length > visibleLimit`, exiba um botão:
     ```tsx
     {filtered.length > visibleLimit && (
       <div style={{ marginTop: "16px", textAlign: "center" }}>
         <button type="button" className="filter-pill" onClick={() => setVisibleLimit((prev) => prev + 48)}>
           Mostrar mais produtos ({visibleLimit} de {filtered.length} exibidos)
         </button>
       </div>
     )}
     ```
   - Na tabela `shadowComparison` (linha 441), limite a renderização a `shadowComparison.slice(0, 50)` para evitar montar 1.800 `<tr>` ocultos.

---

### Fase 4: Fim do Waterfall Duplo na `Pauta` (`/pauta`) e em `Hoje` (`/admin`)

1. **SSR Direto (Zero-Waterfall) na `Pauta` (`packages/web/app/pauta/page.tsx` e `pauta-client.tsx`):**
   - Em `packages/web/app/pauta/page.tsx`:
     - Importe `inAccountScope` de `../../lib/account-scope.ts` e `readLivePauta` de `../../lib/pauta-db.ts`.
     - Busque `qrBundle`, `policy` e `initialPauta` em paralelo:
       ```ts
       const [qrBundle, policy, initialPauta] = await Promise.all([
         getPautaQrBundle(host),
         readCurationPolicy(account),
         inAccountScope(account, () => readLivePauta(account, initialChannel)).catch(() => null),
       ]);
       ```
     - Passe `initialPauta={initialPauta}` para `<PautaClient ... />`.
   - Em `packages/web/app/pauta/pauta-client.tsx`:
     - Adicione a prop opcional `initialPauta?: PautaResponse | null` na assinatura de `PautaClient`.
     - Inicialize os estados com `initialPauta` quando presente:
       - `products`: `useState<PautaProduct[]>(() => initialPauta?.products ?? [])`
       - `recent`: `useState<RecentCaptureItem[]>(() => initialPauta?.recent ?? [])`
       - `recentTotal`: `useState(() => initialPauta?.recentTotal ?? initialPauta?.recent?.length ?? 0)`
       - `captureActions`: `useState<CaptureActions>(() => initialPauta?.captureActions ?? { review: 0, triage: 0, retry: 0 })`
       - `pautaActive`: `useState(() => initialPauta?.active ?? true)`
       - `updatedAt`: `useState<string | null>(() => initialPauta?.updatedAt ?? null)`
       - `loading`: `useState(() => !initialPauta)`
       - `revisionRef`: `useRef<string | null>(initialPauta?.revision ?? null)`
     - No `useEffect` inicial que chama `loadPauta(channel)`:
       - Se `initialPauta` foi fornecido para o `initialChannel` na primeira montagem, **não dispare** o `fetch("/api/pauta")` redundante na montagem inicial (apenas aqueça o `warmerRef.current.warm(...)` se houver produtos)!
       - **Importante para os testes:** Se `initialPauta` for `undefined` ou `null` (como nos testes de `packages/web/test/operation-refresh.test.mjs`), o `useEffect` continua disparando `loadPauta(channel)` exatamente como antes!

2. **Hidratação Inicial Opcional em `TodayOperationStatus` e `OperationalToday`:**
   - Com a otimização SQL da Fase 1, `/api/admin/operacao` já cairá de ~5 s para ~100 ms e o SSR de `Hoje` cairá de 5,1 s para ~0,8 s (pois `AccountAdminShell` e `AdminPage` compartilharão a mesma leitura rápida de `readCurationAutomation`).

---

### Fase 5: Testes Automatizados, Verificação e Deploy em Produção (Definition of Done)

1. **Adicionar Testes de Regressão de Performance e Contratos:**
   - Verificar que todos os testes de `packages/web/test/operation-progress-ui.test.mjs`, `packages/web/test/operation-observer.test.mjs`, `packages/web/test/operation-refresh.test.mjs`, `packages/web/test/operational-curation.test.mjs` e `packages/web/test/pauta-live.test.mjs` passam sem alterações.
   - Adicionar teste em `packages/web/test/operation-progress-ui.test.mjs` (ou arquivo dedicado) validando que:
     - `CurationPage` com `aba=selecao` sem `bancada=1` / `diagnostico=1` **não invoca** `readCurationPool` nem renderiza a grade pesada de candidatos fechada, mantendo os links para abrir a bancada e o diagnóstico sob demanda.
     - `PautaClient` com `initialPauta` já renderiza as ofertas imediatamente no primeiro passe sem exigir requisição extra no mount.

2. **Comandos de Verificação Obrigatórios:**
   ```bash
   npm test --prefix packages/web
   npm run typecheck --prefix packages/web
   npm run build --prefix packages/web
   ```

3. **Publicação e Aferição em Produção (`https://www.bizuminer.com.br`):**
   - Publicar a revisão atualizada na VPS (`179.66.133.110`) preservando os crons desativados e todos os demais contêineres.
   - Aferir os tempos reais de resposta e tamanho do documento em produção para `Curadoria → Andamento`, `Hoje`, `Pauta` e `Capturas`.
   - Atualizar este `plan.md` e `.conductor/tracks.md` marcando a Track 022 como `[x]`.
