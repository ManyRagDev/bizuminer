# Tutorial detalhado: como conectar, configurar e capturar dados da API de Afiliados da AliExpress

## Visão geral

A AliExpress disponibiliza um ecossistema oficial para afiliados por meio do Affiliate Portals e do Open Platform, com APIs voltadas para busca de produtos afiliados, geração de links rastreáveis, consulta de frete, detalhes de SKU, campanhas promocionais e acompanhamento de pedidos/comissões.[cite:2][cite:3][cite:5] Para um app de “achadinhos”, isso permite automatizar boa parte do fluxo operacional, desde a descoberta do produto até a publicação e a mensuração de resultado.[cite:2][cite:3]

Na prática, o modelo mais eficiente não é espelhar a AliExpress inteira, e sim construir uma esteira de curadoria automática sobre os endpoints afiliados: buscar itens por nicho, enriquecer com preço/frete/SKU, gerar links com tracking, publicar no app e depois fechar o ciclo com dados de pedido e comissão.[cite:2][cite:5]

## Pré-requisitos

Antes de integrar, é necessário ter uma conta válida no AliExpress Affiliate Program pelo Portals, pois a Central de Ajuda vincula o uso da Affiliate API ao programa de afiliados e à gestão no ambiente Portals.[cite:2] Também é preciso criar acesso no AliExpress Open Platform, que centraliza a documentação, o catálogo de APIs, guias de quick start, developer guide e webhook guide.[cite:3][cite:14][cite:15]

Pré-requisitos práticos:

- Conta no AliExpress Portals aprovada para afiliado.[cite:2]
- Acesso ao AliExpress Open Platform para registrar a aplicação e obter credenciais.[cite:3][cite:14]
- Backend próprio para guardar chaves, aplicar cache, controlar rate limit e orquestrar jobs de coleta.[cite:3][cite:5]
- Banco de dados para produtos, snapshots de preço, links afiliados e performance por campanha.[cite:2][cite:5]

## O que é possível automatizar

A Central de Ajuda da Portals descreve a Affiliate API como um conjunto para obter informações de produtos, gerenciar pedidos, converter links em lote e integrar com serviços S2S.[cite:2] O catálogo oficial do Open Platform lista grupos de API como AE-Affiliate, AE-Logistics e AE-Settlement, o que confirma que o ecossistema é organizado por domínios de negócio e não apenas por um endpoint único.[cite:5]

Para um app de afiliados, as automações mais úteis são estas:

| Capacidade | Endpoint/fonte | Uso prático no app |
|---|---|---|
| Buscar produtos afiliados | `aliexpress.affiliate.product.query`[cite:2] | Alimentar feed por keyword, categoria, faixa de preço e país. |
| Obter detalhe de itens | `aliexpress.affiliate.productdetail.get`[cite:2] | Enriquecer cards, validar atributos e fazer refresh em lote. |
| Gerar links afiliados | `aliexpress.affiliate.link.generate`[cite:2] | Criar URL final com tracking por campanha, creator ou canal. |
| Consultar categorias | `aliexpress.affiliate.category.get`[cite:2] | Montar navegação temática e segmentação automática. |
| Capturar produtos quentes | `aliexpress.affiliate.hotproduct.query`[cite:2] | Descobrir oportunidades de tendência. |
| Ler promoções oficiais | `featuredpromo.get` e `featuredpromo.products.get`[cite:2] | Criar coleções temporárias e vitrines sazonais. |
| Consultar frete | `product.shipping.get`[cite:2] | Filtrar itens inviáveis para o país-alvo. |
| Consultar SKUs | `product.sku.detail.get`[cite:2] | Mostrar variantes reais e evitar link quebrado. |
| Ler pedidos/comissão | `order.get`, `order.list`, `order.listbyindex`[cite:2] | Medir retorno, ranking e ROI por campanha. |

## Arquitetura recomendada

Para evitar acoplamento com o frontend, a integração deve ficar em um backend intermediário. O Open Platform organiza sua documentação em quick start, developer guide, APIs e webhook guide, o que sugere um modelo tradicional de aplicação registrada no lado servidor com autenticação, chamadas oficiais e possível consumo de eventos.[cite:3][cite:15]

Uma arquitetura recomendada para app de “achadinhos” inclui:

- **Collector**: jobs programados para buscar produtos e promoções por nicho.[cite:2]
- **Enricher**: camada que resolve detalhes, frete e variações de SKU.[cite:2]
- **Normalizer**: padronização de moeda, país, categoria, imagem e estrutura de produto.[cite:2]
- **Link generator**: serviço que cria e armazena links com `tracking_id` por contexto de campanha.[cite:2]
- **Publisher API**: endpoint interno consumido pelo app, site, bot ou painel administrativo.
- **Attribution/analytics**: consolidação de pedidos, comissão e ranking por origem.[cite:2]
- **S2S/Webhook listener**: captura de eventos quando a conta e o fluxo habilitarem esse modo.[cite:2][cite:15]

## Passo 1: criar acesso e credenciais

O primeiro passo operacional é entrar no Open Platform e registrar uma aplicação, porque é nesse ambiente que ficam o guia de início, o catálogo de APIs e os mecanismos de integração para desenvolvedores.[cite:3][cite:14][cite:15] A documentação pública não detalha, no trecho recuperado, todos os campos do formulário de registro, mas deixa claro que o ecossistema é o ponto central para gerenciamento das APIs oficiais.[cite:3][cite:14]

Fluxo recomendado:

1. Entrar no Open Platform e localizar a área de criação/gestão de app.[cite:14][cite:15]
2. Registrar a aplicação com nome, descrição e cenário de uso do app afiliado.[cite:3][cite:14]
3. Obter as credenciais do app e armazená-las apenas no backend, nunca no cliente mobile/web.
4. Vincular o contexto da conta afiliada do Portals à aplicação usada para chamadas dos endpoints afiliados.[cite:2][cite:3]

Boas práticas:

- Guardar `app_key`, `app_secret` e credenciais relacionadas em cofre de segredo, como variáveis protegidas ou secret manager.
- Rotacionar segredos se houver suspeita de vazamento.
- Nunca gerar chamadas oficiais diretamente do frontend do app, porque isso expõe credenciais e aumenta o risco de abuso.

## Passo 2: validar escopo e permissões

A própria Central de Ajuda indica que algumas operações exigem permissões avançadas, incluindo `product.shipping.get`, `product.sku.detail.get`, `product.smartmatch` e, em certas descrições, `hotproduct.query`.[cite:2] Isso significa que a integração deve ser desenhada em camadas: começar com endpoints básicos e liberar enriquecimentos adicionais conforme a conta for aprovada para escopos mais amplos.[cite:2]

Estratégia de liberação:

- **Base mínima**: `product.query`, `productdetail.get`, `link.generate`, `category.get`.[cite:2]
- **Camada de descoberta avançada**: `hotproduct.query`, promoções e smart match, quando autorizado.[cite:2]
- **Camada de qualidade comercial**: frete e SKU, que melhoram muito a curadoria no Brasil.[cite:2]
- **Camada de fechamento de ciclo**: pedidos, comissão e S2S/webhook.[cite:2][cite:15]

## Passo 3: conectar no backend

A conexão deve ser feita por um serviço de backend que assina e envia as requisições para a API oficial do Open Platform. O material público recuperado confirma o uso de HTTP e SDK, o que permite adotar tanto integração direta por request quanto SDK de comunidade/oficial quando fizer sentido.[cite:2][cite:5][cite:9]

Um padrão seguro de implementação é:

- Criar um módulo `AliExpressClient` no backend.
- Centralizar autenticação, assinatura e tratamento de erro nesse módulo.
- Expor ao restante da aplicação apenas métodos internos como `searchProducts`, `getProductDetail`, `generateAffiliateLink` e `listOrders`.
- Aplicar retry com backoff e observabilidade em todas as chamadas.

Exemplo de estrutura lógica:

```text
app móvel/web
   -> API interna / BFF
      -> serviço aliexpress-client
         -> Open Platform / AE-Affiliate APIs
```

Esse desenho facilita cache, deduplicação, rotação de credenciais e fallback quando a API externa oscilar.

## Passo 4: capturar produtos

A captura principal para seu caso começa com `aliexpress.affiliate.product.query`, porque a própria documentação do help center descreve esse endpoint como a forma de recuperar produtos afiliados com filtros por preço, palavra-chave, categoria, moeda e país, além de ordenação por preço e vendas.[cite:2] O mesmo material destaca que a API retorna apenas itens afiliados, o que é ideal para evitar publicar produto sem comissão.[cite:2]

Campos de filtro úteis para coleta periódica:

- Keyword por nicho, como “kitchen organizer”, “desk lamp” ou “pet hair remover”.[cite:2]
- Categoria afiliada via `category.get`.[cite:2]
- Faixa de preço mínima e máxima.[cite:2]
- País e moeda para aproximar o catálogo do seu mercado-alvo.[cite:2]
- Ordenação por preço ou volume de vendas.[cite:2]

Estratégias de captura:

- **Captura por nicho**: um cron por tema do app.
- **Captura por faixa de preço**: excelente para “achadinhos até R$ 50”, “até R$ 100”, “até R$ 150”.
- **Captura por sazonalidade**: Black Friday, volta às aulas, organização de casa, verão.
- **Captura por tendência**: usar produtos quentes e promoções oficiais quando disponíveis.[cite:2]

## Passo 5: enriquecer os dados

Buscar o produto bruto não basta para um app com boa conversão. A Central de Ajuda lista endpoints de detalhe do produto, frete e SKU, o que permite validar se o item faz sentido antes de publicar.[cite:2]

Pipeline recomendado de enriquecimento:

1. Capturar uma lista inicial com `product.query`.[cite:2]
2. Selecionar candidatos com base em preço, desconto, comissão ou popularidade.
3. Consultar `productdetail.get` para refinar título, mídia, atributos e metadados.[cite:2]
4. Consultar `product.sku.detail.get` para obter variantes reais, quando permitido.[cite:2]
5. Consultar `product.shipping.get` para verificar viabilidade do envio ao país alvo, quando permitido.[cite:2]
6. Persistir um snapshot pronto para consumo pelo app.

Isso reduz três problemas comuns em apps afiliados: link para item indisponível, destaque de preço pouco competitivo e publicação de produto com frete ruim para a região de destino.

## Passo 6: gerar links rastreáveis

A geração de link é uma parte central do fluxo, e a documentação do help center cita `aliexpress.affiliate.link.generate` para isso.[cite:2] Em um app real, o ideal é não usar um único tracking para tudo, mas segmentar por origem, coleção, banner, creator, experimento A/B e até posição no feed.

Exemplos de convenção de tracking:

- `home_top_10`
- `categoria_casa_banner_1`
- `push_noite_eletronicos`
- `telegram_ofertas_manha`
- `creator_joao_review`

Com essa convenção, os endpoints de pedido e comissão ficam mais valiosos porque permitem análise por contexto de publicação.[cite:2]

## Passo 7: acompanhar pedidos e comissão

A Central de Ajuda informa suporte a `order.get`, `order.list` e `order.listbyindex`, o que permite consolidar dados de pedido e comissão no backend.[cite:2] Para um app de afiliados, isso transforma a operação de catálogo em operação orientada a performance, porque o ranking de “bom achadinho” deixa de depender só de preço e passa a considerar conversão real.[cite:2]

Métricas recomendadas:

- Cliques por produto.
- CTR por card, posição do feed e coleção.
- Pedidos por tracking ID.[cite:2]
- Comissão por categoria, criativo e janela de tempo.[cite:2]
- EPC interno estimado por produto ou cluster.
- Taxa de sobrevivência do item, isto é, quantos dias continua competitivo.

## Passo 8: usar S2S e webhook quando disponível

O help center menciona integração com serviço S2S, e o Open Platform expõe um Webhook Guide entre os materiais principais de desenvolvedor.[cite:2][cite:15] Isso sugere que, além do modelo de polling, há suporte a integrações orientadas a evento em cenários compatíveis com a conta e o caso de uso.[cite:15]

Quando usar cada abordagem:

- **Polling**: melhor para catálogo, revalidação de preço, refresh de promoções e sync periódico.
- **Webhook/S2S**: melhor para pedido, confirmação, atualização de estado e redução de latência operacional.[cite:2][cite:15]

Se o webhook estiver disponível no seu setup, vale processar eventos de forma idempotente, com fila e deduplicação por `event_id` ou equivalente.

## Rate limit, paginação e volume

A FAQ da Portals informa um limite prático de paginação de 50 produtos por página e até 100 páginas por busca, totalizando até 5.000 itens em uma consulta, e recomenda particionar a pesquisa por faixa de preço quando a base ultrapassar isso.[cite:2] Esse ponto é importante porque um app de “achadinhos” normalmente trabalha melhor com coleta seletiva do que com ingestão massiva sem recorte.[cite:2]

Um guia externo sobre setup da Affiliate API cita 5.000 chamadas por dia como referência operacional, o que é útil para planejamento, embora o limite real deva ser confirmado no console da conta e nas permissões aprovadas.[cite:6] A recomendação prática é projetar como se a cota fosse escassa, usando cache agressivo, revalidação parcial e jobs distribuídos por prioridade.[cite:2][cite:6]

Boas práticas:

- Cache por keyword, categoria e país.
- Atualização incremental em vez de refresh completo.
- Janela de coleta diferenciada por tipo de produto, por exemplo itens quentes a cada 2 horas e itens estáveis a cada 24 horas.
- Circuit breaker quando a API começar a falhar.
- Dead-letter queue para requisições que excederem tentativas.

## Modelo de dados sugerido

Para suportar captura, atualização e mensuração, o backend deve separar catálogo bruto, snapshot publicável e performance. Isso é compatível com o fluxo documentado de produto, link e pedido na stack afiliada da AliExpress.[cite:2][cite:5]

Tabela mínima sugerida:

| Tabela | Finalidade |
|---|---|
| `ae_products_raw` | Resposta normalizada da API por produto e coleta. |
| `ae_product_snapshots` | Estado publicável do item no app. |
| `ae_product_skus` | Variantes, atributos e disponibilidade. |
| `ae_shipping_quotes` | Resultado por país/região e janela de coleta. |
| `ae_affiliate_links` | URL final e tracking ID por contexto. |
| `ae_campaigns` | Coleções, vitrines e regras editoriais. |
| `ae_click_events` | Cliques internos do app/site. |
| `ae_order_events` | Pedidos vindos da API/webhook. |
| `ae_commission_facts` | Comissão consolidada por dimensão analítica. |

## Regras de curadoria automática

A API permite automação, mas o diferencial do app estará nas regras de seleção. Como a documentação confirma filtros de preço, vendas, país e endpoints de enriquecimento, o backend pode transformar a captura crua em um ranking de oportunidade.[cite:2]

Critérios úteis de score:

- Preço final dentro do teto do canal.
- Indício de boa tração comercial, como volume de vendas ou presença em hot products, quando disponível.[cite:2]
- Frete aceitável para Brasil, quando o endpoint estiver liberado.[cite:2]
- Diversidade de SKU sem complexidade excessiva.
- Comissão atrativa versus ticket do item.[cite:2]
- Taxa histórica de clique e pedido por tipo de produto.[cite:2]

Exemplo simples de score conceitual:

```text
score = peso_preco + peso_desconto + peso_comissao + peso_frete + peso_tracao + peso_ctr_historico
```

Esse score não substitui curadoria humana, mas reduz muito o esforço manual na operação do app.

## Fluxo de automação recomendado

Um fluxo diário viável para um app de “achadinhos” pode seguir esta sequência:

1. Rodar jobs por categoria e faixa de preço usando `product.query`.[cite:2]
2. Salvar catálogo bruto e deduplicar por ID do produto.
3. Enriquecer top candidatos com detalhe, SKU e frete.[cite:2]
4. Aplicar score e regras editoriais.
5. Gerar links com `tracking_id` específico por origem.[cite:2]
6. Publicar no app e, se houver, em canais auxiliares como Telegram ou landing pages.
7. Capturar cliques internos.
8. Consultar pedidos/comissões ou receber eventos S2S/webhook.[cite:2][cite:15]
9. Retroalimentar o ranking com dados reais de performance.

## Erros comuns a evitar

Os problemas mais comuns em integrações afiliadas vêm menos do endpoint em si e mais do desenho operacional. Como o ecossistema da AliExpress separa APIs por permissão, paginação e contexto de afiliado, erros de arquitetura acabam custando mais que erros de código.[cite:2][cite:5]

Erros frequentes:

- Fazer chamadas direto do frontend e expor credenciais.
- Não separar catálogo bruto de snapshot publicável.
- Usar um único tracking ID para tudo e perder capacidade analítica.
- Ignorar limitação de paginação e tentar varrer o marketplace inteiro de uma vez.[cite:2]
- Publicar item sem validar frete ou SKU quando esses dados forem relevantes.[cite:2]
- Não aplicar cache e estourar cota desnecessariamente.[cite:6]
- Tratar webhook sem idempotência, causando duplicidade de eventos.[cite:15]

## MVP recomendado

O caminho mais seguro é implementar em três fases. A primeira fase cobre busca, detalhe e geração de link; a segunda adiciona frete/SKU e score; a terceira fecha o loop com pedidos, comissão e eventos em tempo real.[cite:2][cite:15]

### Fase 1

- `product.query`.[cite:2]
- `productdetail.get`.[cite:2]
- `link.generate`.[cite:2]
- Feed básico no app com tracking por coleção.

### Fase 2

- `category.get`.[cite:2]
- `product.shipping.get`, se aprovado.[cite:2]
- `product.sku.detail.get`, se aprovado.[cite:2]
- Score automático por faixa de preço, nicho e frete.

### Fase 3

- `order.list` e correlatos.[cite:2]
- Promoções oficiais e hot products, conforme escopo liberado.[cite:2]
- Webhook/S2S para fechamento de ciclo quase em tempo real.[cite:2][cite:15]

## Conclusão

A stack oficial da AliExpress é suficiente para automatizar um app afiliado com foco em “achadinhos”, desde que a arquitetura seja pensada como pipeline de curadoria e performance, e não como espelhamento bruto do marketplace.[cite:2][cite:3][cite:5] O maior ganho vem da combinação entre busca filtrada, enriquecimento seletivo, link rastreável e leitura de pedidos/comissão para retroalimentar o ranking interno.[cite:2]

O melhor ponto de partida é integrar os endpoints básicos de produto, detalhe e link em um backend com cache e tracking por campanha.[cite:2] A partir daí, a expansão natural é adicionar frete, SKU, promoções e, por fim, eventos e analytics de comissão para operar o app com inteligência comercial contínua.[cite:2][cite:15]
