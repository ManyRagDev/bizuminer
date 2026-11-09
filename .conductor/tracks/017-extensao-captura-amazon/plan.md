# Track 017 — Extensão de Captura Assistida para Amazon

## Continuação aprovada — captura em lote

O operador autorizou executar o plano apresentado na conversa. A mesma ação no popup lê a aba aberta do Mercado Livre, AliExpress ou Amazon. A extensão envia apenas os campos do anúncio. O servidor valida a origem, persiste o lote sob a conta do dispositivo e continua a triagem existente.

- [x] Integrar leitura de listagem e produto no AliExpress e na Amazon, com prévia e deduplicação.
- [x] Preservar preço observado, faixa e condições disponíveis. Priorizar a observação recente do navegador no AliExpress sem mesclar evidências.
- [x] Resolver atribuição pela tag da Amazon e pela API oficial do AliExpress, com falhas sinalizadas.
- [x] Verificar importação, repetição, triagem, Pauta e redirecionamento em ambiente isolado. O teste da etapa de afiliação também passou com a API real do AliExpress.
- [x] Conferir a leitura da listagem real da Amazon no Vivaldi. O operador encontrou 69 produtos. A tentativa de importar usou a versão antiga em Prod. Ela abriu um lote vazio de Mercado Livre que foi encerrado após confirmar que não tinha capturas. A extensão agora verifica o suporte do servidor antes de abrir lote. O produto real também abriu com o ASIN e a tag da conta preservados.
- [x] Confirmar a leitura de uma listagem real do AliExpress no Vivaldi. Dos 77 IDs encontrados, a primeira versão montou 6 ofertas, teve 26 preços indefinidos e 45 sem preço detectado. A correção que separa o selo percentual do preço recuperou os 26. O operador confirmou 32 ofertas prontas na listagem real, sem preços ambíguos. Os 45 restantes não tinham preço reconhecido e nenhum foi sinalizado como visível no momento da leitura. Exemplo capturado: relógio masculino por R$ 28,14.
- [x] Importar um lote real do AliExpress no piloto isolado. O operador salvou 40 ofertas. A aprovação de teste levou o relógio `1005012161493725` à Pauta por R$ 28,14. A API oficial gerou o destino afiliado e o link interno respondeu com HTTP 302.
- [x] Importar um lote real da Amazon no piloto isolado. O operador salvou 109 ofertas. A aprovação de teste levou o Motorola Moto G35 (ASIN `B0DHWFBYVC`) à Pauta por R$ 829,00. O link interno respondeu com HTTP 302 para o mesmo ASIN na Amazon Brasil com a tag da conta.
- [ ] Liberar cada piloto em produção após validar as condições do programa e o destino real. A importação em produção é habilitada por loja em `AMAZON_BROWSER_CAPTURE_ENABLED` e `ALIEXPRESS_BROWSER_CAPTURE_ENABLED`. A Amazon requer a migration de monetização e a tag da conta. O link compartilhado abre a ficha da oferta, com ação do visitante para ir à Amazon.

> **Status:** Concluída  
> **Data:** 09/11/2026  
> **Objetivo:** Adaptar a extensão de navegador do operador (`packages/extension`) e o backend do BizuMiner (`packages/web` e `packages/persistence`) para capturar ofertas da Amazon Brasil (`amazon.com.br`), gerando catálogo verificado e links de afiliado com tag canônica para atingir as primeiras vendas e destravar a Creators API oficial.

---

## 1. Contexto e Motivação

A Amazon Brasil exige que novas contas de associados gerem pelo menos 10 vendas qualificadas em 30 dias para liberar acesso à Creators API / PA-API v5.
Para viabilizar a entrada da Amazon no BizuMiner de forma legítima, ética e em conformidade estrita com o Contrato Operacional da Amazon:
- O scraping automatizado massivo via robôs é proibido pela Amazon e pelas diretrizes do BizuMiner.
- A extensão do BizuMiner é uma ferramenta interna de retaguarda (*backoffice*) do operador (não distribuída para compradores finais).
- O operador navega normalmente na Amazon, encontra ofertas de alto valor e aciona a captura assistida pela extensão.
- A extensão extrai os dados estruturados (ASIN, título, preço, imagem) e monta o link de afiliado oficial canônico com a tag do associado.
- Os produtos entram na esteira de triagem, vitrine e pauta para disparo manual nos grupos do WhatsApp.

---

## 2. Escopo e Dependências Técnicas

### 2.1. Extensão de Navegador (`packages/extension`)
- **Manifest V3 (`manifest.json`):** Permissões via `activeTab` e `scripting` (least privilege), sem expor credenciais.
- **Contratos (`src/lib/contracts.ts`):** Expandido com `marketplace: 'mercadolivre' | 'amazon'` e detecção de rotas em `pageKindFor`.
- **Extrator de DOM da Amazon (`src/content/amazon-extractor.ts`):**
  - Detecção da página de produto da Amazon via hostname e padrão de rota (`/dp/`, `/gp/product/`).
  - Extração do código único **ASIN** (via URL canônica ou seletor oculto `#ASIN`).
  - Extração do título (`#productTitle`).
  - Extração de preço atual e preço de lista (`.a-price .a-offscreen`, `#corePrice_feature_div`).
  - Extração de imagem principal em alta resolução (`#landingImage`).
- **Interface do Popup e Injeção (`src/popup/` e `src/content/`):**
  - Identificar automaticamente páginas da Amazon e Mercado Livre.
  - Injetar botão de captura nos cards e PDP da Amazon.

### 2.2. Backend e Contratos de Ingestão (`packages/web`)
- **Validação de Payload (`lib/extension-contract.ts`):**
  - Aceita `marketplace: 'amazon'`.
  - Valida host do produto (`amazon.com.br`) e hosts de imagem.
  - Valida formato do ASIN (10 caracteres alfanuméricos).
- **Ingestão e Persistência (`lib/extension-db.ts`):**
  - Gera slug com prefixo próprio (`amz-${externalId}-${affiliatePublicSlug}`).
  - Persiste em `garimpa.product` com `marketplace = 'amazon'`.
  - Grava `price_observation` inicial com timestamp e evidências.

### 2.3. Redirecionamento e Atribuição (`packages/persistence` e `packages/web`)
- **Configuração de Afiliado:**
  - Cadastro da tag de associado Amazon na tabela `garimpa.affiliate_marketplace_config` (marketplace `'amazon'`, campo `tracking_id`).
- **Resolução de Link Monetizado (`garimpa.public_monetized_target` e `public-offer-db.ts`):**
  - Migration SQL `20261109120000_amazon_monetized_target.sql` para montar a URL canônica com a tag do afiliado:
    `https://www.amazon.com.br/dp/[ASIN]?tag=[tracking_id]`
  - Adicionado `amazon.com.br` na lista de hosts autorizados em `publicMonetizedTarget`.

### 2.4. Vitrine, Pauta e Disclaimer Legal
- Marketplace Amazon registrado em `packages/web/lib/marketplaces.ts` com prefixo `amz-` e label "Amazon".
- Disclaimer contratual obrigatório da Amazon integrado no rodapé da vitrine (`packages/web/app/vitrine.tsx`):
  > *"Alguns links são de afiliado. Como participantes de programas de parceiros (incluindo o Programa de Associados da Amazon), somos remunerados por compras qualificadas elegíveis sem custo adicional para você."*

---

## 3. Tarefas de Implementação

- [x] **1. Contratos e Validação do Backend (`packages/web`)**
  - [x] Atualizar `packages/web/lib/extension-contract.ts` para aceitar `marketplace: 'amazon'`, hosts da Amazon e formato ASIN.
  - [x] Atualizar testes em `packages/web/test/extension-contract.test.mjs`.

- [x] **2. Extrator e Adaptador na Extensão (`packages/extension`)**
  - [x] Atualizar `packages/extension/src/lib/contracts.ts` com o tipo `'amazon'`.
  - [x] Implementar `src/content/amazon-extractor.ts` com extração precisa de ASIN, título, preço e foto.
  - [x] Integrar no Popup (`popup.ts` / `popup.html`) e no observer (`catalog-observer.ts`, `bizu-button.ts`) para suporte a Mercado Livre e Amazon.
  - [x] Criar testes unitários do extrator em `packages/extension/test/amazon-extractor.test.ts`.
  - [x] Executar build da extensão e validar integridade do manifesto (`npm run build && npm run verify:manifest`).

- [x] **3. Ingestão e Redirecionamento Monetizado (`packages/web` & `packages/persistence`)**
  - [x] Atualizar `extension-db.ts` para tratar ingestão de itens da Amazon e geração de slug `amz-...`.
  - [x] Criar migration SQL adicionando suporte à Amazon na resolução de monetização (`garimpa.public_monetized_target`).
  - [x] Atualizar `public-offer-db.ts` liberando `amazon.com.br` no redirecionamento `/go/[slug]`.
  - [x] Adicionar o disclaimer obrigatório de associado Amazon no rodapé público.

- [x] **4. Verificação de Ponta a Ponta & Definition of Done**
  - [x] Executar suíte de testes de todos os pacotes afetados (`extension`, `web`, `persistence`, `capture`).
  - [x] Typecheck 100% limpo em `packages/extension` e `packages/web`.
  - [x] Atualizar status da track em `plan.md` e `.conductor/tracks.md`.
