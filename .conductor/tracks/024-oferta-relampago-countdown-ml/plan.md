# Track 024 — Captura de Oferta Relâmpago (Countdown Mercado Livre), Exibição na Vitrine/Anúncio e Validade na Pauta

> **Status:** Concluída  
> **Data de Criação:** 18/11/2026  
> **Data de Conclusão:** 18/11/2026  
> **Objetivo:** Identificar automaticamente quando um produto capturado no Mercado Livre está em **Oferta Relâmpago**, extrair o tempo restante do contador regressivo (`.poly-component__countdown` / `.poly-countdown__block` e metadado `period_end`), calcular o horário limite exato (`promotionEndsAt`) cruzando com o instante da captura (`clientCapturedAt`) e exibir **"⚡ Oferta Relâmpago · Válido até às X horas"** na Pauta (`/pauta`), na Copy do WhatsApp (`copy-styles.ts`), nos cards da Vitrine (`/`) e na página do anúncio (`/bizu/[slug]`).

---

## 1. Diagnóstico Técnico e Arquitetura da Solução

### 1.1. Extração na Extensão (`packages/extension`)
No Mercado Livre (listagens de `/ofertas`, buscas e página do produto/PDP), uma Oferta Relâmpago apresenta duas fontes complementares no HTML:
1. **DOM Visual (`.poly-component__countdown`):**
   - Contém 3 blocos `.poly-countdown__block` separados por `.poly-countdown__separator` (`:`), representando **`HH : MM : SS`**.
   - Cada `.poly-countdown__block` possui 2 `.poly-countdown__roller-container`, cada um exibindo o dígito ativo em `span.poly-countdown__digit--static` (ou o primeiro `.poly-countdown__digit`).
   - Exemplo: Bloco 1 = `05`, Bloco 2 = `28`, Bloco 3 = `14` → restam `5h 28m 14s` (`19.694` segundos).
   - Cruzando com o horário da captura (`clientCapturedAt`):
     `promotionEndsAt = new Date(Date.parse(clientCapturedAt) + remainingSeconds * 1000).toISOString()`
2. **JSON de Hidratação da Página (`widget_components` em `<script>`):**
   - Na página de ofertas do ML, os scripts de hidratação associam o `metadata.id` (`MLB...`) ao objeto `poly_label_component.countdown.period_end` (ex: `"2026-11-18T23:59:59Z"`).
   - Quando disponível e válido no futuro, `period_end` fornece o segundo exato cravado pelo servidor do Mercado Livre; caso contrário, o cálculo `clientCapturedAt + HH:MM:SS` dos blocos visuais do DOM assume automaticamente.
3. **Na Página de Produto Individual (PDP):**
   - Além do badge `"OFERTA RELÂMPAGO"` (`.ui-pdp-promotions-pill-label`), caso haja contador regressivo na PDP ou no JSON embutido, o extrator registra `promotionType: "lightning"` e `promotionEndsAt`.

### 1.2. Contrato de Ingestão e Persistência (`packages/capture`, `packages/web`, `packages/persistence`)
- **Contratos TypeScript (`ExtensionCaptureProduct` e `OfferEvidenceV2`):**
  - Adicionado `promotionType?: "lightning"` e `promotionEndsAt?: string` (ISO 8601 UTC validado: deve ser uma data válida posterior a `clientCapturedAt` e dentro de uma janela máxima plausível de até 7 dias).
  - Em `browserOfferEvidence` (`extension-contract.ts`), `promotionType` e `promotionEndsAt` são persistidos diretamente no JSONB `offer_evidence` de `garimpa.price_observation`.
  - Como `observationOptionIdentity` ignora campos de promoção temporária, a chave de deduplicação (`option_key`) e a comparabilidade de histórico permanecem 100% intactas.
- **Projeção SQL Pública e Validade (`packages/persistence/supabase/migrations/20261118224500_oferta_relampago_countdown.sql`):**
  - Migration aplicada no PostgreSQL de produção com o usuário `supabase_admin`:
    1. `garimpa.product_presentation_offer_rows`: projeta `'promotionType'` e `'promotionEndsAt'` a partir de `latest.offer_evidence` para que a Vitrine (`/`) e a Página de Produto (`/bizu/[slug]`) recebam esses campos nativamente.
    2. `garimpa.current_offer_valid_until` e `garimpa.public_offer_deadline`: quando `offer_evidence->>'promotionEndsAt'` estiver presente, limita o deadline público ao `least(..., (offer_evidence->>'promotionEndsAt')::timestamptz)`, fazendo o `OfferExpiryBoundary` expirar pontualmente no minuto em que a Oferta Relâmpago terminar.

### 1.3. Exibição nas 3 Superfícies (Vitrine/Anúncio, Copy WhatsApp e Pauta)
1. **Formatador de Horário Limite (`America/Sao_Paulo`):**
   - Helper compartilhado `packages/web/lib/flash-sale.ts` (`formatFlashSaleDeadline`, `formatFlashSaleTime`, `formatFlashSaleRemaining`, `isFlashSaleActive`).
2. **Anúncio Público — Vitrine (`/`) e Página do Produto (`/bizu/[slug]`):**
   - Nos cards da Vitrine (`vitrine.tsx`): badge `.flash-sale-badge-small` (`⚡ Relâmpago · até HH:mm`).
   - No cabeçalho de preço do produto (`/bizu/[slug]/page.tsx`): badge `.flash-sale-badge` (`⚡ Oferta Relâmpago · Válido até às HH:mm`) enquanto `promotionEndsAt > now`.
3. **Anúncio / Copy do WhatsApp (`copy-styles.ts`):**
   - Injeção automática da linha `⚡ Oferta Relâmpago: válido hoje até às HH:mm (ou enquanto durar o estoque).` em `buildRelampagoCopy`, `buildSinceroCopy` e `buildDiretoCopy`.
4. **Pauta do Operador (`/pauta` e `pauta-db.ts`):**
   - Exibição de `.pauta-lightning-badge` (`⚡ Relâmpago · até HH:mm (faltam Xh Ym)`).
   - Quando expirada: exibe `.pauta-lightning-expired-badge` e alerta contextual recomendando conferência na loja antes do disparo.

---

## 2. Plano de Execução Passo a Passo

### Fase 1: Extração do Countdown na Extensão (`packages/extension`)
- [x] Criar parser determinístico de countdown do Mercado Livre (`extractMlCountdown`) para ler:
  - Os 3 blocos `.poly-countdown__block` (`HH:MM:SS`) dentro de `.poly-component__countdown` / `.poly-component__highlight-countdown`.
  - O mapa `period_end` do script JSON da página (quando presente para o `MLB...`), usando o cálculo `clientCapturedAt + (HH*3600 + MM*60 + SS)*1000` como fonte primária/fallback do DOM vivo.
- [x] Integrar a extração em [`page-extractor.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/extension/src/content/page-extractor.ts) (`collectBrowserOffers`), [`card-extractor.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/extension/src/content/card-extractor.ts) (`extractCard`) e [`ml-product-extractor.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/extension/src/content/ml-product-extractor.ts).
- [x] Atualizar [`contracts.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/extension/src/lib/contracts.ts) na extensão e adicionar testes unitários com o HTML real do `.poly-countdown__block` (71/71 testes passando).

### Fase 2: Contrato de Ingestão, Evidência e Migration SQL (`packages/capture`, `packages/web`, `packages/persistence`)
- [x] Atualizar [`OfferEvidenceV2`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/capture/src/types.ts) com `promotionType?: "lightning"` e `promotionEndsAt?: string`.
- [x] Validar e normalizar `promotionType` e `promotionEndsAt` em [`extension-contract.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/extension-contract.ts) e [`browser-capture-contract.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/browser-capture-contract.ts).
- [x] Criar migration SQL em `packages/persistence/supabase/migrations/20261118224500_oferta_relampago_countdown.sql` atualizando `garimpa.product_presentation_offer_rows` e `garimpa.public_offer_deadline` para projetar `promotionType` e `promotionEndsAt` e respeitar o horário de término da oferta relâmpago.
- [x] Aplicar migration com sucesso no PostgreSQL de produção via `supabase_admin`.
- [x] Propagar `promotionType` e `promotionEndsAt` em [`product-presentation.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/product-presentation.ts), [`deal-view.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/deal-view.ts), [`editorial-selection-db.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/editorial-selection-db.ts) e [`pauta-db.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/pauta-db.ts).

### Fase 3: Exibição no Anúncio (Vitrine & Produto), Copy do WhatsApp e Pauta (`packages/web`)
- [x] Criar helper de formatação no fuso `America/Sao_Paulo` em `packages/web/lib/flash-sale.ts`.
- [x] **Copy do WhatsApp ([`copy-styles.ts`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/lib/copy-styles.ts)):** Incluir automaticamente a linha `"⚡ Oferta Relâmpago: válido hoje até às HH:mm (ou enquanto durar o estoque)."` quando a promoção relâmpago estiver ativa.
- [x] **Vitrine ([`vitrine.tsx`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/app/vitrine.tsx)) e Página de Produto ([`/bizu/[slug]/page.tsx`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/app/bizu/%5Bslug%5D/page.tsx)):** Exibir os selos `.flash-sale-badge` e `.flash-sale-badge-small`.
- [x] **Pauta ([`pauta-client.tsx`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/app/pauta/pauta-client.tsx)):** Exibir o badge com contagem regressiva e aviso de expiração.
- [x] Estilizar `.flash-sale-badge`, `.flash-sale-badge-small`, `.pauta-lightning-badge` e `.pauta-lightning-expired-badge` em [`globals.css`](file:///home/emanuel/Documentos/Projetos%20linux/Garimpa/packages/web/app/globals.css) para tema claro e escuro.

### Fase 4: Testes, Empacotamento da Extensão e Deploy em Produção
- [x] Executar suítes de testes (`packages/extension` e `packages/web`) e typecheck (100% verde).
- [x] Criar suíte de testes `packages/web/test/flash-sale.test.mjs` (6/6 testes passando).
- [x] Gerar build atualizado da extensão Chrome (`npm run build --prefix packages/extension`).
- [x] Aplicar a migration no banco de produção e realizar o deploy na VPS (`contexts-track024-20261118T224918Z`).
- [x] Verificar endpoints de produção (`/`, `/entrar`, `/pauta`, `/admin`, `/admin/curadoria`) e saúde dos contêineres (`healthy`).
- [x] Atualizar `.conductor/tracks.md` e `plan.md`.
