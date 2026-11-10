# Plano de implementação da descoberta na Shopee e no AliExpress

Amplie a variedade de ofertas do BizuMiner com buscas por departamento nas APIs oficiais da Shopee e do AliExpress. A descoberta deve alimentar a curadoria e a vitrine. O acompanhamento continua por ID. A pauta escolhe ofertas recentes que atendam aos critérios de qualidade, evidência e atribuição de afiliado.

Use os lotes e workers atuais como entradas normais. Entregue a implementação em revisão para que o responsável do Bizu possa validar o comportamento. A ativação em produção e a primeira gravação ampla dependem dessa validação e da escolha do ambiente e da conta.

## Decisões de produto

- **Capacidade e volume ampliados**: O objetivo principal é capturar bons produtos e opções reais sem descartes artificiais por cotas cegas. Os 12 recortes e 20 a 50 anúncios por recorte (com suporte a 1 a 3 páginas por departamento onde houver rendimento e variedade) formam a base. O volume inicial de consulta expande de 240 até 600 anúncios por marketplace por lote quando habilitado.
- **Alternância de ordenação**: Não depender apenas de "mais vendidos" (que vicia o catálogo nos mesmos itens consolidados). Permitir rotação entre ordenação por vendas (`sales`), relevância/padrão da API (`default`) e campanhas promocionais/novidades (`campaign`/`discount`), trazendo variedade contínua.
- **Expansão para subcategorias (L2/L3)**: Usar os 12 departamentos raiz como núcleo, expandindo e rotacionando subcategorias específicas (o AliExpress possui 524 subcategorias e a Shopee possui árvore profunda) para cobrir nichos de alto interesse.
- **Preservação e exibição de variações de produto**: Diferenças de kit, voltagem (110V/220V), cor, tamanho, capacidade e especificação técnica não devem ser suprimidas. O filtro de equivalentes elimina apenas clones/duplicatas idênticas de revenda do mesmo produto. Na vitrine, produtos com faixa de preço exibem a amplitude (`R$ Min a R$ Max`) e opções confirmadas ganham destaque e links próprios.
- Fazer a busca inicial sem palavra-chave obrigatória, teto de preço ou desconto declarado mínimo. Uma queda comprovada de R$ 1.000 para R$ 500 pode ser uma ótima oferta. O filtro de faixa de preço escolhido pelo visitante permanece uma opção de navegação da vitrine.
- Classificar pelo uso principal. O departamento solicitado é um dado de origem. Um boneco articulado que aparece em Casa e Jardim pode ser encaminhado a Brinquedos.
- Exibir **um vencedor entre anúncios equivalentes idênticos** na vitrine e na pauta, preenchendo a vaga liberada com outro produto ou variação legítima.
- Separar descoberta de atualização de preços. Selecionar a pauta por qualidade e recência em conjunto. Usar histórico comparável para sustentar a economia, a data da queda e afirmações de menor preço.
- A limpeza foi pontual. Em **8 de novembro de 2026**, o Supabase confirmou **70 produtos do Mercado Livre e zero fora da janela de sete dias de primeira captura** na conta da casa. Esse número é um retrato do início do trabalho. A operação regular controla o que entra no catálogo e o que fica na fila ativa, preservando histórico, alertas e publicações vinculados.

A automação deste plano cobre Shopee e AliExpress. A captura manual, o acompanhamento humano e a publicação do Mercado Livre mantêm seus fluxos. Cada conta usa suas próprias permissões, política de descoberta e credenciais.

## Evidências das consultas piloto

As consultas foram de leitura, feitas com a credencial da conta da casa antes da limpeza. Os números abaixo descrevem anúncios da API. IDs diferentes podem representar o mesmo produto.

| Piloto | Retorno | Implicação |
| --- | --- | --- |
| AliExpress sem recorte | A primeira e a segunda páginas de 20 e a página de 50 ficaram na mesma subcategoria de cosplay. | Distribuir o volume entre recortes e medir saturação. |
| AliExpress em 12 departamentos | 238 IDs distintos em 66 subcategorias. Casa e Jardim retornou 19 de 20 anúncios com o ID solicitado. O preço máximo da amostra com ordenação por volume foi R$ 129,77. | Conferir o recorte retornado e classificar pelo uso antes da vitrine. |
| AliExpress com ordem padrão em três departamentos | Seis anúncios de R$ 500 ou mais, incluindo itens de nicho. | Variar a origem do ranking e aplicar a seleção editorial depois. |
| Shopee em 12 recortes | 240 linhas, 238 IDs distintos, 199 fora do catálogo da época e 169 anúncios com faixa de preço. Os 12 grupos tinham próxima página. A consulta de Beleza funcionou após repetir um erro de sistema. | Deduplicar entre recortes, preservar a faixa e isolar falhas de consulta. |
| Shopee em Brinquedos | 20 anúncios no recorte 100684. O recorte mais amplo 100632 também trouxe itens de bebê. | Usar 100684 para Brinquedos na estratégia inicial. |

O AliExpress devolveu 564 IDs na árvore de categorias, com 40 departamentos e 524 subcategorias, incluindo entradas de teste. Use a árvore para encontrar recortes novos e verifique a disponibilidade para o Brasil ao consultar produtos. [API oficial de categorias](https://open.alitrip.com/docs/api.htm?apiId=45801)

### Recortes iniciais e IDs

| Recorte do lote | AliExpress | Shopee | Observação |
| --- | ---: | ---: | --- |
| Casa e Jardim | 15 | 100636 | Casa e Decoração na Shopee. Pode sobrepor Ferramentas e Iluminação. |
| Eletrodomésticos | 6 | 100010 | Modelo, capacidade e voltagem podem mudar a compra. |
| Eletrônicos | 44 | 100535 | O recorte testado na Shopee é de áudio. |
| Informática | 7 | 100644 | Comparar especificações de acessórios e consumíveis. |
| Ferramentas | 1420 | 100715 | Ferramentas e Melhorias para a Casa na Shopee. |
| Beleza | 66 | 100630 | Usar fatos demonstráveis na apresentação. |
| Esporte e Lazer | 18 | 100637 | A classificação final segue o uso principal. |
| Auto | 34 | 102187 | Preservar compatibilidade com o veículo quando relevante. |
| Brinquedos | 26 | 100684 | Na Shopee, a rodada principal usou 100632 e o teste específico confirmou 100684. |
| Iluminação | 39 | 100719 | Subcategoria de Casa na Shopee. |
| Papelaria | 21 | 100638 | Material escolar e escritório. |
| Bolsas | 1524 | 100016 | Manter tamanho e configuração quando relevantes. |

Mantenha esse mapa versionado no código, com uma chave estável por recorte e IDs separados por marketplace. A categoria pública é um campo distinto. Preserve os rótulos e as URLs de categorias já usados pelo catálogo e reaproveite as facetas da vitrine para expor categorias novas conforme houver ofertas elegíveis. [Classificação atual](../../packages/persistence/src/category.ts) · [Leitura do catálogo](../../packages/web/lib/db.ts) · [Vitrine](../../packages/web/app/vitrine.tsx)

## Estado do código e pontos de integração

| Componente | Estado atual e mudança esperada |
| --- | --- |
| Contrato dos adaptadores | `FetchParams` aceita palavra-chave, loja e paginação. Acrescente a consulta de origem como opção compatível. [Tipos](../../packages/capture/src/types.ts) |
| Captura em lote | Os CLIs de Shopee e AliExpress recebem o lote do painel. `category-first-v1` usa palavras-chave apesar do nome. O worker executa as lojas e depois a triagem daquele lote. [Plano atual](../../packages/persistence/src/capture-plan.ts) · [Handoff anterior](./handoff-capture-category-first-v1.md) · [Worker do painel](../../packages/web/bin/run-capture-batch.ts) |
| Descoberta agendada | O acompanhamento pode reservar até 20 itens para uma página de descoberta por palavra-chave, conforme a capacidade disponível. A reconsulta por ID usa a mesma rodada com orçamento próprio. [Política](../../packages/persistence/src/editorial-discovery.ts) · [Executor de descoberta](../../packages/persistence/src/editorial-discovery-run.ts) · [Monitor](../../packages/persistence/bin/monitor-prices.ts) |
| Persistência | `sweep` aplica cota de novos por consulta e registra cada execução. O store atualiza o anúncio existente pela chave da conta, marketplace e ID externo. [Ingestão](../../packages/persistence/src/ingest.ts) · [Store](../../packages/persistence/src/pg-store.ts) |
| Vitrine e pauta | O catálogo público exige aprovação editorial e frescor. A pauta dinâmica tem bloqueios de preço exato em BRL, condição e link. A home e a pauta já têm controles de diversidade por família. [Catálogo](../../packages/web/lib/catalog-policy.ts) · [Home](../../packages/web/lib/homepage-policy.ts) · [Pauta](../../packages/web/lib/pauta-policy.ts) |

## Consultas oficiais e contratos

Adicione ao contrato um parâmetro opcional como `sourceQuery`. Um item do plano escolhe busca por termo, por departamento ou por campanha. A forma abaixo especifica os dados necessários. Preserve os chamadores atuais, inclusive `--keyword` explícito, e valide combinações incompatíveis antes de chamar a API.

~~~ts
type SourceQuery =
  | { kind: "department"; categoryId: string; order: "sales" | "default" }
  | { kind: "campaign"; name: string; categoryId?: string;
      order: "sales" | "discount" | "default" };
~~~

- Valide IDs decimais positivos e, na Shopee, a faixa de `Int` do GraphQL. Preserve paginação, cancelamento e teto de 50 itens dos adaptadores. O perfil inicial pede 20.
- Preserve `RawOffer`, `OfferEvidence` e seus mappers. Se precisar de IDs de categoria de origem, adicione campos opcionais com semântica explícita. Hoje o caminho da Shopee contém IDs e o do AliExpress usa nomes.
- Separe retorno bruto, mapeamento válido e descarte por dado inválido ou moeda. `sweep().itemsSeen` hoje já recebe ofertas mapeadas. Acrescente diagnósticos de forma compatível com os contadores legados. Diferencie resposta vazia válida, falha de negócio e falha de transporte.
- Use `resolveWorkerCredential` e `accountCaptureAdapter` em cada página, com os gates de conta e marketplace. A listagem de campanhas e a geração de links devem resolver a credencial da mesma conta antes da chamada. Reuse os clientes assinados, retries e limites atuais. Faça I/O externo fora de transações SQL e mantenha credenciais, assinaturas e URLs de afiliado fora dos logs. [Credenciais e wrapper da conta](../../packages/persistence/src/account-credentials.ts)

### Shopee

Use `productOfferV2(productCatId: ..., listType: 0, sortType: 2, page: 1, limit: 20)` e omita `keyword` no modo por departamento. Leia `itemId`, `shopId`, `productCatIds`, `price`, `priceMin`, `priceMax`, `offerLink` e `pageInfo`. O `sales` retornado não veio em ordem estritamente decrescente. A ordenação da fonte ajuda a descobrir candidatos, e a seleção do Bizu aplica critérios próprios.

Registre se o ID consultado aparece em `productCatIds`. No modo novo, trate o erro `10000 System Error` com uma repetição limitada e registrada. Uma falha persistente encerra aquele recorte e os demais seguem. Preserve o tratamento de limites e transporte do cliente. [Adaptador](../../packages/capture/src/adapters/shopee/index.ts) · [GraphQL](../../packages/capture/src/adapters/shopee/queries.ts) · [Portal de Afiliados](https://affiliate.shopee.com.br/open_api)

### AliExpress

Use `aliexpress.affiliate.product.query` com `category_ids`, `page_no=1`, `page_size=20`, `ship_to_country=BR`, `target_currency=BRL`, `target_language=PT` e `tracking_id` da conta. Use `LAST_VOLUME_DESC` na rodada comparável ao piloto. Permita explorar a ordem padrão omitindo `sort`. Leia `target_sale_price` e valide `target_sale_price_currency=BRL`. Os campos de preço sem prefixo podem estar em CNY ou USD. Registre se o primeiro nível retornado corresponde ao recorte. [Adaptador](../../packages/capture/src/adapters/aliexpress/index.ts) · [Mapper](../../packages/capture/src/adapters/aliexpress/mapper.ts) · [API oficial de busca](https://open.alitrip.com/doc2/apiDetail.htm?apiId=45803)

Implemente as campanhas complementares depois da busca por departamento. Quando habilitadas, resolva os nomes disponíveis com `aliexpress.affiliate.featuredpromo.get` uma vez por lote. Liste itens com `aliexpress.affiliate.featuredpromo.products.get` usando `promotion_name`, `country=BR`, `target_currency=BRL`, `target_language=PT`, `tracking_id` e paginação. Nesse endpoint, o filtro opcional é `category_id` no singular. Valide o código de negócio além do HTTP.

| Lista | Nome que funcionou no piloto |
| --- | --- |
| Estoque no Brasil | `AEB_BR_ShipFromBR_20241114` |
| Mais vendidos de Casa e Cozinha | `DS_Home&Kitchen_bestsellers` |
| Mais vendidos de Eletrônicos | `DS_ConsumerElectronics_bestsellers` |
| Novidades | `DS_NewArrivals` |

Revalide a disponibilidade das listas. Campanhas sazonais entram quando habilitadas e disponíveis. `Super Deals`, `SuperOfertas` e os nomes genéricos `Best Seller`, `New Arrival`, `Hot Product` e `weeklydeals` voltaram vazios no teste. O endpoint separado `hotproduct.query` retornou `InsufficientPermission`. Quando as campanhas estiverem vazias ou indisponíveis, a rodada de departamentos continua. [Lista oficial de campanhas](https://open.alitrip.com/docs/api.htm?apiId=48596) · [Produtos por campanha](https://open.alitrip.com/docs/api.htm?apiId=48597)

## Execução, persistência e controle de volume

### Ativação por conta

1. Acrescente o plano de departamentos aos dois CLIs e um caminho explícito de prévia, como `--plan departments --dry-run`. A prévia mostra IDs, ordem e orçamento, sem chamar API ou banco. Um modo de amostra com API, se disponível, deve ser somente leitura e emitir resultados sanitizados.
2. Use a política por conta e marketplace para selecionar a estratégia no caminho normal. Acrescente de forma aditiva um modo de origem, como `source_mode = keywords | departments`, com `keywords` como padrão dos registros antigos. Mantenha autorização de owner, RLS, versão e validação no servidor. O painel usa o modo salvo no próximo lote. O campo `enabled` mantém a função de habilitar descoberta dentro do acompanhamento agendado. O lote solicitado no painel usa o modo escolhido mesmo quando a descoberta agendada estiver desligada.
3. O lote amplo começa com uma página em cada recorte. No acompanhamento agendado, consulte **um recorte por rodada** dentro da capacidade de descoberta que o alocador já liberar. Preserve o teto atual de `items_per_run` e a precedência dos alertas. As 12 consultas da rodada ampla pertencem ao lote do painel.
4. Registre modo, versão de política, `operationBatchId` e `captureExecutionId`. Reuse a posse do lote e a idempotência do store. Informe falha parcial sem perder itens aceitos. A triagem continua restrita ao lote. Ao atualizar a vitrine, trate a execução ampla como conjunto para que ofertas dos primeiros departamentos continuem elegíveis depois da última consulta. Onde o código usa o último `capture_run` como sinal de atualidade, confira se a projeção precisa considerar a execução que contém as consultas filhas.
5. Mantenha o caminho por termo como retorno operacional. A fase inicial não precisa de outro cron. A implantação da migração e a ativação do modo novo devem ser operações separadas, cada uma com o ambiente e a conta identificados. [Política persistida](../../packages/web/lib/discovery-policy-db.ts) · [Controle de descoberta](../../packages/web/app/admin/curadoria/discovery-control.tsx) · [Lote e triagem](../../packages/web/lib/capture-batch-worker.ts)

### Validação e admissão

- Valide toda a página antes de gastar a cota de novos. Priorize candidatos com uso claro, compra compreensível e variedade. Reclassifique desvios claros. Use uma parte pequena da cota para candidatos promissores com classificação incerta e registre por que precisam de revisão.
- Elimine IDs repetidos no mesmo lote por conta e marketplace. Shopee Casa e Ferramentas compartilharam dois IDs. Se a fonte entregar evidências materialmente diferentes para opções do mesmo anúncio, preserve a separação do `option_key`. A unidade de cadastro continua sendo o anúncio, e uma nova evidência compatível atualiza a observação.
- Comece com os limites do executor existente de **8 novos por recorte** e **5 novos por família reconhecida na consulta**. Isso dá até **96 admissões novas por marketplace** na rodada de 12 recortes, além de atualizações válidas de conhecidos. Esses limites são valores iniciais para calibrar após a primeira rodada. A cota de novos deixa passar um conhecido válido.
- Use `upsertProductWithObservation` pela chave `(tenant_id, marketplace, external_id)`. Preserve `first_seen_at`, as decisões de curadoria e a regra atual de suprimir observações idênticas dentro de 20 horas. Observe mudanças de preço, opção ou condição de acordo com as regras existentes. Guarde a evidência normalizada e os contadores. A resposta bruta serve à análise da execução.
- Registre por consulta o recorte, ordenação, páginas, bruto, válidos, IDs distintos, novos admitidos, conhecidos reobservados, divergências de categoria, descartes por motivo, concentração por família, falhas, mudanças de preço e estado dos links. Use `capture_run.parameters` e o resumo do lote antes de criar outra estrutura de métricas. Registre a diferença entre uma atualização do anúncio e uma nova observação histórica.

### Distribuição de páginas extras

Na primeira rodada, use uma página para cada recorte. Depois de três rodadas válidas, compare o rendimento dos últimos até sete resultados por recorte. Use **novos candidatos distintos admitidos divididos por IDs válidos consultados** como sinal inicial. Registre também quantos viram ofertas aprovadas depois da triagem. Trate falhas da API como problema operacional, fora da média de rendimento.

Com orçamento para páginas extras, mantenha a página-base de cada recorte inicial. Comece com extras desligadas e teste até duas extras por marketplace por lote na primeira calibração, dentro do limite de páginas configurado. Direcione as extras aos recortes com rendimento, variedade e próxima página. Reserve a primeira vaga extra de exploração, quando houver, para um recorte novo ou há mais tempo sem consulta complementar. Use o detector de saturação atual como referência, com 60% de uma família entre pelo menos dez candidatos. Se saturar, avance para outro recorte. Mantenha a decisão determinística e isolada por conta e marketplace.

### Acompanhamento por ID

Reaproveite `MonitoringLookup` e a política de prioridade. Shopee usa `productOfferV2(itemId)`. AliExpress usa `aliexpress.affiliate.productdetail.get(product_ids)`. Exija correspondência exata do ID e preserve a última leitura válida quando houver ausência, outro ID, moeda inválida, erro ou limite. Use o recuo atual e preserve a prioridade de alertas, edição vigente e candidatos promissores.

A consulta de vários IDs de AliExpress é uma otimização posterior. Antes de ativá-la, comprove o limite, o tratamento de retornos parciais e a correspondência por ID. Preserve o espaçamento conservador usado pelo monitor enquanto isso. [Lookup](../../packages/persistence/src/monitoring-lookup.ts) · [Política de monitoramento](../../packages/persistence/src/monitoring-policy.ts) · [Plano de acompanhamento](./plano-acompanhamento-precos.md)

## Curadoria por IA, Vitrine, Pauta e Painel `/admin` (Reintegração da Plataforma)

O aumento de volume e variedade dos 12 departamentos exige que a captura, a triagem por IA, a vitrine, a pauta e o painel `/admin` operem como um funil único em dois estágios, sem gargalos artificiais.

### 1. Integração Contínua com o Mercado Livre (Captura Manual)

- **Entrada desacoplada e imediata**: A captura do Mercado Livre ocorre via Extensão/Bookmarklet (`POST /api/admin/capturar`), gravando produtos com `curation_status = 'pending'` independentemente dos lotes agendados de Shopee e AliExpress.
- **Triagem unificada**: O worker de triagem e o botão rápido de triagem no `/admin` avaliam tanto os produtos do lote automático quanto as capturas manuais pendentes do Mercado Livre.
- **Prioridade na Pauta**: Como toda captura manual do Mercado Livre já passou por um pré-filtro visual humano na loja, os itens aprovados recebem bônus de frescor e reserva mínima de vagas na `/pauta` quando houver estoque recente (< 72h).

### 2. Fila de Triagem e Adequação dos Prompts (Gemini 2.5 Flash)

- **Fim do corte cego pré-IA por família**: Remover a trava SQL que cortava a fila em 3 itens por `familyKey` antes da IA (`triage-candidates-db.ts`). Variações legítimas (kits de 40 vs 46 peças, 110V vs 220V, capacidades distintas) chegam à IA; apenas duplicatas idênticas são consolidadas na exibição.
- **Drenagem elástica de lotes grandes**: O executor (`run-capture-batch.ts` / `curation-pipeline.ts`) processa lotes acima de 200 produtos em sub-lotes de 25 itens com concorrência controlada, sem deixar resíduo represado.
- **Payload enriquecido para o modelo (`AICurationItemInput`)**: Além de `title` e `priceFormatted` (com suporte a faixa `R$ Min a R$ Max`), enviar `ratingStar`, `salesCount`, desconto/preço original e `originDepartment`.
- **Prompt Multidepartamento e Classificação Semântica (`catalogCategory`)**:
  - Atualizar `SYSTEM_PROMPT` e `DEFAULT_GUIDELINE` para valorizar bons produtos de uso final em **todos os 12 departamentos** (Casa, Eletrodomésticos, Eletrônicos, Informática, Ferramentas, Beleza, Esporte e Lazer, Auto, Brinquedos, Iluminação, Papelaria e Bolsas/Moda), restringindo a rejeição automática (Notas 1–2) a insumos industriais avulsos, peças de reposição soltas sem utilidade direta ou anúncios defeituosos.
  - O schema de resposta do Gemini passa a devolver `catalogCategory` (classificando o produto pelo **uso principal**, independentemente do departamento de origem na loja) e `publicBenefit` (frase curta e factual pronta para vitrine/pauta).
  - Expandir a taxonomia `editorialCategory` para `["achadinho_impulso", "utilidade_pratica", "destaque_departamento", "peca_tecnica_avulsa", "outro"]`.
  - Balancear o few-shot dinâmico (`getGoldenExamples`) com até 3 aprovações + 3 rejeições/retenções recentes, evitando viés de recência.
- **Roteamento inteligente da Nota 3**: Produtos com `score = 4` ou `5` são aprovados automaticamente (quando `autoPublish` ativo); produtos com `score = 3` e alta prova social (`ratingStar >= 4.7` ou alto volume de vendas) vão para revisão rápida (`awaiting`) em vez de ficarem retidos (`held`).

### 3. Funil em 2 Estágios: Vitrine (Ampla) → Pauta (Seleta)

- **Estágio 1 — Vitrine (Catálogo Público)**:
  - Recebe todos os produtos aprovados (`approved`), organizados pelas 12 categorias canônicas.
  - Exibe faixas de preço (`R$ Min a R$ Max`) com a nota *"O preço varia conforme a opção escolhida."*
- **Estágio 2 — Pauta Derivada da Vitrine (`/pauta`)**:
  - É uma projeção de elite da Vitrine (Top 25–30 ofertas ativas), ranqueada por score composto (avaliação/vendas + queda/desconto + frescor + diversidade entre departamentos e lojas).
  - **Ponte Rápida de Variação para a Pauta**: Produtos aprovados na Vitrine com faixa de preço (`priceMax > priceMin`) podem ter uma opção exata confirmada rapidamente pelo curador no `/admin` (`OfferConfirmation`), habilitando sua entrada imediata na Pauta com preço exato e link atribuído.

### 4. Remodelação do Painel `/admin` (Dinamismo e Precisão)

1. **Painel de Captura de Hoje (`BatchCapturePanel`)**:
   - Controle explícito da estratégia de captura: modo `12 Departamentos` vs. `Palavras-chave`, escolha da ordenação (`Mais vendidos`, `Padrão/Relevância`, `Maior Desconto`) e tamanho de página (`20` ou `50` itens).
   - Contador em tempo real de capturas manuais pendentes (Mercado Livre) e botão de triagem imediata sem exigir novo disparo de API.
2. **Bancada de Trabalho Unificada (`WorkbenchInteractiveTable` e `CurationReviewer`)**:
   - Exibição completa de sinais reais: **Avaliação (★) e Vendas**, **Faixa de Preço (`R$ Min a R$ Max`)**, **Desconto**, **Categoria recomendada pela IA (editável em 1 clique)** e **Justificativa/Benefício da IA**.
   - Filtros dinâmicos por Departamento, Loja (`Shopee`, `AliExpress`, `Mercado Livre`), Nota da IA e presença de variação de preço.
   - Ações em lote (*Aprovar selecionados* / *Rejeitar selecionados*) para resolver dezenas de itens com rapidez.
3. **Controle de Descoberta e Bússola (`DiscoveryControl` e `BussolaView`)**:
   - Suporte na política da conta ao modo `departments` e ordenação rotativa.
   - Atualização da Bússola Editorial (`BussolaView`) com as diretrizes reais dos 12 departamentos, preservação de variações e status fiel das proteções do funil.
4. **Aba Seleção & Ponte Rápida de Variações (`SelecaoView` / `curadoria/page.tsx`)**:
   - Atalho direto para confirmar a opção exata (`OfferConfirmation`) de produtos aprovados com faixa de preço, destravando-os para a `/pauta` sem exigir o preenchimento completo da ficha de 5 dimensões da Hero.
5. **Governança Pós-Auditoria da Triagem Semântica**:
   - **Triagem Aberta (Sem Descarte Cego Pré-IA)**: No pipeline multidepartamento, `MAX_REPRESENTATIVES_DEFAULT` é aberto (`Infinity`) para que todas as variações e ofertas legítimas de uma família avancem para a avaliação do Gemini. O filtro `never_triaged` do banco foi calibrado para não travar produtos que tenham ficado pendentes por regra anterior.
   - **Reclassificação Semântica de Categorias**: A categoria canônica em `garimpa.product` passa a ser atualizada diretamente pelo `catalogCategory` do Gemini quando atribuído (`!= 'Geral'`), substituindo deduções frágeis de regex baseadas apenas em palavras do título.
   - **Deadlines Elásticos de Lotes**: Lotes de 12 departamentos recebem prazos ampliados (30 a 45 min) e extensão automática de 20 minutos ao transicionar para a fase `triaging`, eliminando riscos de timeout falso durante o processamento em lote da IA.

### Filtro de anúncios equivalentes

- Separe ID de anúncio, família editorial e equivalência. Use família para diversidade. Use equivalência para escolher um vencedor quando houver evidência compatível de marca e modelo ou identificador confiável, configuração, quantidade e atributos que alteram a compra. Um `variantKey` de origem pode valer apenas naquele anúncio.
- Os dois filamentos Print Pulse podem disputar a mesma vaga se material, diâmetro e peso coincidirem. Carretéis de 500 g e 1 kg, kits de 40 e 46 peças e voltagens diferentes continuam candidatos distintos. Quando faltar prova de equivalência, mantenha a distinção e use a diversidade por família.
- Entre equivalentes elegíveis, compare preço e condições da mesma configuração. Considere disponibilidade, frescor, confiabilidade e custo final quando verificável. Resolva empates com identificador estável. Preserve a possibilidade de outro anúncio vencer quando o preço ou a disponibilidade mudar.
- Aplique o filtro antes do limite e da paginação e preencha a vaga liberada com o próximo candidato elegível. O total da listagem deve usar a mesma regra. Confira a composição da home, a pauta e os dois caminhos de catálogo usados por `topDeals`. Reuse a seleção atual. Se a consulta SQL precisar de uma chave derivada para paginar, use uma chave opcional, versionada e calculada no escopo da conta. Registros antigos sem chave continuam utilizáveis. [Política da home](../../packages/web/lib/homepage-policy.ts) · [Projeção pública](../../packages/web/lib/public-offer-db.ts) · [Comparação de evidências](../../packages/web/lib/comparison-evidence.ts)

### Faixas, ofertas recentes e pauta

A pauta dinâmica prioriza ofertas aprovadas pela idade da evidência de preço: primeiro as observadas há menos de três horas, depois as do dia com até dez horas e, por último, as mais antigas ainda válidas. A diversidade por loja e família é aplicada dentro de cada grupo; uma lista manual continua prevalecendo. Quando há ofertas recentes suficientes, elas substituem as envelhecidas automaticamente após captura e triagem. A prioridade usa a data da observação que sustenta a oferta, inclusive quando há uma opção confirmada: reencontrar o anúncio não renova por si só o preço ou as condições de uma opção.

Na Shopee, quando `priceMax > priceMin`, exiba os dois limites e a nota **“O preço varia conforme a opção escolhida.”** A escolha da opção acontece na loja. Hoje `offerPriceNote` informa a variação, mas `offerPriceLabel` retorna só o mínimo para `range`. Atualize o helper compartilhado e confira a vitrine e o detalhe. Preserve `from` quando só houver mínimo e o formato de preço exato quando for aplicável. [Formatação atual](../../packages/web/lib/offer-price.ts)

No AliExpress, a API de afiliados devolveu um `sku_id` e um preço por anúncio no teste. O envio experimental de `sku_id` na consulta de detalhes manteve o retorno do controle. Preserve o preço como evidência do anúncio, com a classificação apropriada. Exija identificação e condições comparáveis antes de alimentar o histórico de uma opção. [API de detalhes](https://open.alitrip.com/docs/api.htm?apiId=48595) · [Histórico comparável](../../packages/web/lib/offer-history.ts)

A vitrine exige aprovação editorial e evidência dentro da validade atual. A **pauta automática** exige preço exato em BRL, evidência recente, condições conferidas quando aplicáveis e destino válido. Preserve esses requisitos. Uma faixa pode aparecer na vitrine se passar pelos critérios daquela superfície. Encaminhe opções promissoras ao fluxo existente de confirmação da curadoria para que uma opção exata com prova própria possa concorrer na pauta. Uma leitura agregada posterior do anúncio preserva seu próprio escopo de evidência. [Política do catálogo](../../packages/web/lib/catalog-policy.ts) · [Pauta](../../packages/web/lib/pauta-policy.ts) · [Confirmação de opção](../../packages/web/lib/offer-option-db.ts)

Na seleção, considere o histórico de preço comparável, inclusive a economia absoluta. Um produto novo começa com a evidência disponível e forma histórico nas próximas leituras. Preserve os requisitos atuais do selo de menor preço, incluindo pelo menos três observações comparáveis e sete dias de histórico. O desconto derivado da Shopee e o preço original declarado pelo AliExpress têm proveniência diferente de uma queda observada no Bizu. [Sinais de preço](../../packages/web/lib/deal-signal.ts) · [Mapper da Shopee](../../packages/capture/src/adapters/shopee/mapper.ts) · [Mapper do AliExpress](../../packages/capture/src/adapters/aliexpress/mapper.ts)

### Link afiliado da conta

O destino compartilhado começa no BizuMiner. A rota interna resolve a publicação ativa e redireciona com o link de afiliado atribuído à conta. Preserve os slugs, as páginas de opções confirmadas e a validação de host e propriedade.

- Na Shopee, use `ensureShopeeAffiliateLinks` com credencial da conta e `subId` vinculado à publicação. Confira a atribuição da publicação gravada.
- No AliExpress, use `ensureAliExpressPublications` com `promotion_link` da chamada assinada com o `tracking_id` daquela conta. Se só houver URL pública do anúncio, a oferta só fica apta a compartilhar depois de gerar e gravar o link atribuído.
- Restrinja os helpers usados pelo modo novo ao conjunto admitido ou selecionado pelo lote. Hoje eles buscam candidatos sem link na conta toda. Acrescente filtro opcional e preserve os chamadores atuais. Leve o candidato descoberto pelo monitor ao mesmo caminho de publicação quando ficar elegível.
- Depois da captura, triagem e publicação, reuse a atualização da edição e a leitura dinâmica de `/pauta`. Preserve retiradas manuais, ordem editorial, regras por canal e invalidação quando preço, condições ou link mudarem. [Links Shopee](../../packages/persistence/src/shopee-links.ts) · [Links AliExpress](../../packages/persistence/src/aliexpress-links.ts) · [Destino da pauta](../../packages/web/lib/pauta-db.ts) · [Atualização da edição](../../packages/web/bin/refresh-homepage.ts)

## Sequência e testes de aceite

| Ordem | Entrega | Evidência esperada |
| --- | --- | --- |
| 1 | Parâmetros dos adaptadores e plano por departamento | Teste dos argumentos de cada API, mapa de 12 recortes e prévia sem rede. Busca manual por termo preservada. |
| 2 | Lote amplo, admissão e auditoria | Rodada com respostas simuladas, cota de novos, atualização de conhecidos, deduplicação entre recortes e falha parcial. |
| 3 | Ativação por conta, rotação e acompanhamento | Testes de owner, isolamento, versão concorrente e prioridade de alertas. Orçamentos separados para lote amplo e agendado. |
| 4 | Vitrine, faixa, pauta e afiliado | Teste de seleção por equivalência, paginação, preço comparável e caminho do link interno. |
| 5 | Campanhas complementares | Teste de lista disponível, campanha vazia e falha de negócio. Departamentos seguem funcionando nesses casos. |

Inclua estes cenários nos testes:

1. **Cobertura.** O lote consulta os 12 IDs iniciais de cada marketplace e solicita 20 anúncios por recorte. Uma resposta curta e um erro de departamento têm contadores distintos. O lote continua depois da falha de um recorte.
2. **Admissão.** Um boneco encontrado em Casa não aparece na vitrine de Casa. Uma oferta útil de alto valor passa pela descoberta. O mesmo ID em Casa e Ferramentas ocupa uma vaga de gravação. A cota cheia permite atualizar um conhecido válido.
3. **Diversidade.** Anúncios equivalentes geram um vencedor e a vaga liberada recebe outro produto. Um kit diferente mantém sua candidatura. Filtros, totais e paginação permanecem coerentes nas duas projeções do catálogo.
4. **Preço.** R$ 28,99 a R$ 32,99 aparece com a nota. Uma faixa sem opção confirmada não recebe afirmação de preço exato nem entrada automática na pauta. Uma queda comparável de R$ 1.000 para R$ 500 pode ser selecionada.
5. **Resiliência.** Ausência, ID divergente, moeda errada e erro preservam a leitura válida. Retry não duplica anúncio ou observação equivalente e reaproveita uma publicação atribuída existente.
6. **Conta e atribuição.** Um link do Bizu resolve a oferta correta com o afiliado da conta. Link inválido bloqueia a divulgação. Uma conta não lê, altera ou reutiliza política, captura, credencial ou publicação de outra. O Mercado Livre mantém o caminho manual e afiliado vigente.
7. **Frescor e volume.** Um produto elegível encontrado no início ainda está encontrável no fim do lote. Compare tempo de execução, chamadas externas, observações gravadas e latência da vitrine com a estratégia anterior.

Rode testes e typechecks dos três pacotes e as suítes de integração correspondentes ao schema, ao lote e às projeções alteradas. Use PostgreSQL local ou ambiente isolado para testes de escrita, RLS e concorrência. [Suítes de integração](../../tools/editorial-tests/package.json)

~~~bash
npm test --prefix packages/capture
npm test --prefix packages/persistence
npm test --prefix packages/web
npm run typecheck --prefix packages/capture
npm run typecheck --prefix packages/persistence
npm run typecheck --prefix packages/web
npm run test:homepage --prefix tools/editorial-tests
npm run test:recommendations --prefix tools/editorial-tests
npm run test:capture-batch --prefix tools/editorial-tests
~~~

## Entrega para validação

- Commit ou branch revisável, caminhos alterados e resultados dos comandos executados.
- Prévia dos dois marketplaces. Se houver autorização para uma amostra real de leitura, inclua produtos sanitizados por departamento e as contagens de bruto, válidos, repetidos, novos, faixas, divergências e falhas.
- Evidência de um lote persistido em ambiente isolado, com um conhecido reobservado, um novo admitido, um descarte justificado, um vencedor entre equivalentes e uma faixa na vitrine.
- Evidência do link interno até o destino afiliado em ambiente de teste, com credencial ocultada e cliques de teste fora da produção.
- Migração, ordem de ativação e reversão do modo, se aplicáveis. Informe ambiente, conta, marketplaces, orçamentos e o que ainda depende da validação do responsável do Bizu.
