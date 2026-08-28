# Tutorial detalhado: como conectar, configurar e capturar dados da Shopee Affiliate Open API

## Visão geral

A Shopee disponibiliza uma **Affiliate Open API** separada da Open Platform de sellers, voltada para criadores e afiliados que precisam consultar ofertas, produtos, campanhas, gerar links rastreáveis e acompanhar performance comercial.[cite:20][cite:21][cite:22] Na área autenticada da conta, a própria documentação apresenta um fluxo de integração baseado em **registro como afiliado, obtenção de AppID/Secret, seleção das APIs, desenvolvimento/teste e publicação online**.[cite:36]

Para um app estilo “achadinhos”, a Shopee é tecnicamente adequada porque combina descoberta de produtos, feeds promocionais, short links, relatórios de conversão e comissões em uma mesma stack de afiliado.[cite:36][cite:24] Isso permite montar uma automação muito parecida com a da AliExpress, mas com uma camada de tracking e relatórios que, na prática, é especialmente útil para canais de alto volume como feed, landing page, Telegram, WhatsApp e redes sociais.[cite:36][cite:24]

## Atenção com credenciais

A área autenticada expõe **AppID** e **Secret** da aplicação na seção da Open API, o que significa que essas credenciais são o principal ativo de segurança da integração.[cite:36] Se o Secret foi exibido em tela durante a inspeção ou compartilhado em ambiente inseguro, a ação correta é **rotacionar ou regenerar a credencial** antes de usar o backend em produção.[cite:36]

Boas práticas obrigatórias:

- Guardar AppID e Secret apenas no backend ou em secret manager.
- Nunca embutir o Secret no frontend web, app mobile ou automações client-side.
- Versionar somente placeholders, nunca segredos reais.
- Rotacionar o Secret quando houver suspeita de exposição.

## O que a Shopee permite automatizar

Na documentação autenticada da sua conta, a Shopee expõe diretamente estes grupos funcionais: **Oferta Shopee, Oferta da loja, Oferta de produto, Links personalizados, Feed do produto, Relatório de vendas, Relatório de cliques, Comissões validadas e Histórico de pagamento**.[cite:36] A página pública da Open API e a documentação complementar em português também descrevem a API como voltada a consulta de produtos, campanhas e relatórios de afiliado.[cite:20][cite:24]

Essas capacidades cobrem o núcleo de um app de afiliados:

| Capacidade | Fonte/área | Uso prático no app |
|---|---|---|
| Ofertas Shopee | Área autenticada “Oferta Shopee”[cite:36] | Descobrir promoções gerais e itens prioritários. |
| Ofertas de loja | Área autenticada “Oferta da loja”[cite:36] | Criar vitrines por seller, marca ou loja parceira. |
| Ofertas de produto | Área autenticada “Oferta de produto”[cite:36] | Buscar itens individuais para curadoria de achadinhos. |
| Feed do produto | Área autenticada “Feed do produto”[cite:36] | Ingerir catálogo/fluxo promocional para atualização periódica. |
| Links personalizados | Área autenticada “Links personalizados”[cite:36] | Gerar links rastreáveis por campanha, posição ou canal. |
| Relatório de vendas | Área autenticada “Relatório de vendas”[cite:36] | Medir pedidos e receita atribuída. |
| Relatório de cliques | Área autenticada “Relatório de cliques”[cite:36] | Medir CTR e tráfego por origem. |
| Comissões validadas | Área autenticada “Comissões validadas”[cite:36] | Consolidar comissão real já aprovada. |
| Histórico de pagamento | Área autenticada “Histórico de pagamento”[cite:36] | Fechamento financeiro e conciliação. |

## Modelo de integração

A área da Open API autenticada indica uso de **GraphQL** na integração, em vez de um conjunto clássico de endpoints REST isolados.[cite:36] Isso muda o desenho do client: em vez de criar dezenas de rotas rígidas, vale montar um serviço centralizado com operações GraphQL nomeadas, tipagem forte e persistência seletiva dos campos realmente necessários.[cite:36][cite:24]

Arquitetura recomendada para o seu stack Supabase + Vercel:[cite:17]

- **BFF/API interna**: endpoint server-side na Vercel para proteger credenciais e assinar requisições.
- **ShopeeAffiliateClient**: módulo único para assinatura, envio e tratamento de erro das operações GraphQL.
- **Collector jobs**: cron jobs para ingestão de ofertas, feed e campanhas.
- **Normalizer**: normalização de preço, moeda, loja, categoria, URL de imagem e IDs externos.
- **Tracking service**: geração e armazenamento de links personalizados e short links.
- **Analytics service**: ingestão de cliques, vendas, comissões e reconciliação financeira.
- **Supabase**: persistência do catálogo bruto, snapshots publicáveis e fatos analíticos.[cite:17]

## Passo 1: habilitar e obter acesso

O fluxo descrito pela própria página autenticada é: **registrar-se como afiliado, obter AppID/Secret, selecionar as APIs necessárias, desenvolver/testar e subir para online**.[cite:36] Em termos práticos, isso significa que a Shopee trata a Open API como uma capability adicional do programa de afiliados, e não como uma API pública aberta sem contexto de conta.[cite:20][cite:22][cite:36]

Passo a passo operacional:

1. Tornar a conta elegível no Programa de Afiliados Shopee.[cite:22][cite:36]
2. Acessar a área da Open API autenticada dentro do painel de afiliados.[cite:20][cite:36]
3. Copiar AppID e Secret e armazenar em ambiente seguro.[cite:36]
4. Identificar quais módulos da API serão usados no MVP: ofertas, feed, links e relatórios.[cite:36]
5. Testar chamadas em ambiente controlado antes de conectar o app final.[cite:36]

## Passo 2: montar o backend seguro

Mesmo quando a API parece simples, a integração nunca deve acontecer diretamente do frontend. Como a Shopee Affiliate Open API depende de credenciais sensíveis e da sua conta autenticada, o correto é concentrar toda a comunicação em um backend interno.[cite:36][cite:20]

Estrutura recomendada:

```text
app web/mobile
   -> API interna / BFF
      -> shopee-affiliate-client
         -> Shopee Affiliate Open API (GraphQL)
```

Esse desenho traz vantagens objetivas:

- Protege o Secret.
- Permite cache por operação e parâmetro.
- Centraliza assinatura e tratamento de erro.
- Facilita retry, observabilidade e fallback.
- Permite aplicar regras de negócio antes de publicar qualquer item.

## Passo 3: autenticar e assinar chamadas

A documentação visível na área autenticada indica o modelo de integração com AppID/Secret e GraphQL, o que implica um client server-side responsável por montar headers, assinatura e payload da operação.[cite:36] A documentação pública adicional em português reforça que a API foi pensada para desenvolvedores integrarem dados oficiais do programa de afiliados em aplicações próprias.[cite:24]

Como o detalhe fino da assinatura não apareceu integralmente no trecho recuperado da página, a implementação deve seguir exatamente o método descrito no painel autenticado da Open API da sua conta, sem inferir campos ou algoritmo além do que a Shopee expuser ali.[cite:36] No tutorial, a abordagem correta é tratar a autenticação como um bloco encapsulado no client, para que o restante do app nunca manipule a assinatura manualmente.[cite:36]

Padrão recomendado de código:

- `buildHeaders()` para credenciais e metadados.
- `signRequest()` para a lógica criptográfica definida pela Shopee.
- `executeGraphQL()` para envio da operação.
- `parseResponse()` para tratamento uniforme de sucesso e erro.

## Passo 4: descobrir produtos e ofertas

A Shopee expõe na sua conta áreas distintas para **Oferta Shopee, Oferta da loja, Oferta de produto e Feed do produto**, o que já sugere um modelo de coleta em camadas.[cite:36] Em vez de depender de uma única consulta genérica, o ideal é combinar fontes: usar ofertas para descobrir oportunidade comercial e o feed para manter atualização recorrente do catálogo.[cite:36]

Estratégia de captura recomendada:

- **Oferta Shopee**: excelente para detectar itens promocionais amplos e tendência de marketplace.[cite:36]
- **Oferta da loja**: útil para vitrines de seller, collabs ou segmentos específicos.[cite:36]
- **Oferta de produto**: ideal para seleção manual ou semiassistida de itens âncora.[cite:36]
- **Feed do produto**: melhor para sincronização programada e refresh do catálogo.[cite:36]

Essa combinação permite montar um ranking híbrido: oportunidade promocional + adequação editorial + histórico de conversão.

## Passo 5: capturar e normalizar o feed

O módulo **Feed do produto** é o melhor ponto de entrada para automação recorrente do catálogo, porque ele tende a concentrar os itens em formato mais adequado para ingestão programática.[cite:36] Para um app de achadinhos, o fluxo ideal é armazenar primeiro o retorno bruto, depois gerar um snapshot derivado já limpo, com apenas os campos usados pelo frontend.[cite:36]

Campos que normalmente valem persistir no snapshot publicável:

- ID externo do produto.
- Nome/título normalizado.
- Loja/merchant.
- Imagem principal.
- URL base do item.
- Preço atual e, quando houver, preço promocional.
- Categoria, tags e selo de campanha.
- Flags internas de destaque, score e status de publicação.

Separar bruto e derivado ajuda a reprocessar scoring e layout sem chamar a API novamente.

## Passo 6: gerar links personalizados

A área autenticada mostra explicitamente a funcionalidade **Links personalizados**, que é central para atribuição e análise de performance no seu app.[cite:36] Em vez de criar um único link afiliado universal por item, a melhor prática é gerar links contextuais por origem de tráfego, experimento, coleção e posição no feed.[cite:36]

Exemplos úteis de convenção de tracking:

- `home_top_achados_01`
- `push_noite_utilidades`
- `feed_cozinha_slot_3`
- `landing_organizacao_banner`
- `telegram_ofertas_manha`

Com essa convenção, os relatórios de cliques e vendas passam a responder perguntas operacionais reais, como qual coleção converte melhor, qual posição do card performa mais e qual canal entrega a melhor comissão líquida.[cite:36]

## Passo 7: acompanhar cliques, vendas e comissões

A Shopee já entrega na sua conta as áreas de **Relatório de cliques, Relatório de vendas, Comissões validadas e Histórico de pagamento**, o que fecha o ciclo de attribution analytics de forma bastante útil para afiliados.[cite:36] Isso significa que o app pode sair de um modelo puramente editorial e evoluir para um motor de decisão orientado por performance real.[cite:36]

Métricas recomendadas:

- Cliques por produto, coleção e canal.[cite:36]
- CTR por posição do card no feed.[cite:36]
- Conversão por tracking/link personalizado.[cite:36]
- Comissão validada por categoria, loja e campanha.[cite:36]
- Receita por mil impressões internas do app.
- Tempo médio de vida útil de um item com boa conversão.
- Relação entre clique, pedido e comissão liquidada.[cite:36]

## Passo 8: montar um score de “achadinho”

A Shopee fornece sinais suficientes para criar um score operacional interno a partir de ofertas, feed, cliques, vendas e comissão.[cite:36] O diferencial do seu app não estará apenas em puxar produtos, mas em priorizar automaticamente os que têm maior chance de virar venda com boa remuneração.[cite:36][cite:18]

Critérios recomendados para o score:

- Preço dentro da faixa-alvo do canal.
- Presença em oferta geral ou destaque de loja.[cite:36]
- Histórico de CTR interno.
- Histórico de vendas por tracking.[cite:36]
- Comissão validada do cluster ou loja.[cite:36]
- Persistência de performance ao longo dos dias.
- Compatibilidade editorial com o nicho do feed.

Exemplo conceitual:

```text
score = peso_preco + peso_oferta + peso_ctr + peso_vendas + peso_comissao + peso_recencia
```

## Rate limit, cache e operação

Como a documentação visível recuperada não trouxe integralmente a tabela de limites por operação, o melhor desenho é assumir cota finita e projetar a integração com parcimônia.[cite:36] A documentação pública da Shopee Open Platform existe, mas é mais ampla e voltada ao ecossistema de seller, então o comportamento da Affiliate Open API deve ser validado no seu painel autenticado e nos retornos reais de produção.[cite:21][cite:23][cite:34]

Boas práticas operacionais:

- Cache por operação GraphQL e conjunto de parâmetros.
- Revalidação incremental em vez de full refresh.
- Prioridade maior para ofertas e campanhas recentes.
- Deduplicação por product ID e seller ID.
- Retry com backoff exponencial para erros transitórios.
- Circuit breaker em caso de falha repetida.
- Observabilidade com logs estruturados e correlação por request.

## Modelo de dados sugerido

Para o seu stack, a melhor abordagem é separar ingestão, publicação e analytics, aproveitando Supabase como backbone relacional e analítico leve.[cite:17] Esse desenho combina bem com a estrutura funcional observada no painel da Shopee, que já separa oferta, link e relatório.[cite:36]

Tabela mínima sugerida:

| Tabela | Finalidade |
|---|---|
| `shopee_raw_feed_items` | Respostas brutas do feed e de ofertas. |
| `shopee_product_snapshots` | Estado normalizado usado pelo app. |
| `shopee_offer_items` | Itens marcados como oferta/campanha. |
| `shopee_affiliate_links` | Links personalizados, short links e tracking context. |
| `shopee_click_facts` | Cliques agregados por item/canal/período. |
| `shopee_sales_facts` | Vendas atribuídas por tracking e período. |
| `shopee_validated_commissions` | Comissão efetivamente validada. |
| `shopee_payment_history` | Conciliação financeira e recebimentos. |
| `shopee_campaigns` | Coleções editoriais, regras e janelas de promoção. |

## Fluxo de automação recomendado

Um fluxo diário robusto para seu app pode seguir esta sequência:

1. Coletar ofertas gerais, de loja e de produto.[cite:36]
2. Sincronizar o feed de produtos.[cite:36]
3. Deduplicar e normalizar os itens.
4. Aplicar score com regras comerciais e editoriais.
5. Gerar links personalizados por contexto.[cite:36]
6. Publicar no app, landing pages e canais auxiliares.
7. Registrar cliques internos.
8. Importar relatórios de cliques, vendas e comissões validadas.[cite:36]
9. Reprocessar o ranking com base na performance observada.[cite:36]

## Erros comuns a evitar

As integrações afiliadas costumam falhar menos por ausência de API e mais por desenho ruim de operação. No caso da Shopee, como a conta já oferece módulos separados para ofertas, links e relatórios, ignorar essa separação faz o sistema perder granularidade analítica e eficiência operacional.[cite:36]

Erros frequentes:

- Chamar a API a partir do frontend.
- Expor AppID/Secret em app mobile ou web.
- Não separar dado bruto de snapshot publicável.
- Usar o mesmo tracking para todos os canais.
- Ignorar relatório de cliques e olhar só comissão final.[cite:36]
- Não reprocessar score com base em vendas reais.[cite:36]
- Tratar o feed como verdade absoluta sem regra editorial.

## MVP recomendado

O melhor caminho é implementar em três fases, começando pelo núcleo operacional que já aparece no painel autenticado da Shopee.[cite:36] Isso reduz risco, acelera validação e preserva espaço para evoluir analytics depois.[cite:36][cite:18]

### Fase 1

- Coleta de Oferta Shopee, Oferta de produto e Feed do produto.[cite:36]
- Geração de Links personalizados.[cite:36]
- Publicação no app com tracking por coleção.

### Fase 2

- Integração com Relatório de cliques e Relatório de vendas.[cite:36]
- Score automático por nicho, posição e canal.
- Reordenação dinâmica do feed com base em performance.

### Fase 3

- Integração com Comissões validadas e Histórico de pagamento.[cite:36]
- Conciliação financeira e painel executivo.
- Automação de campanhas e otimização por ROI.

## Conclusão

A Shopee Affiliate Open API é adequada para automatizar um app de “achadinhos” porque a própria conta afiliada já reúne descoberta de oferta, ingestão de feed, criação de links e leitura de performance em um mesmo ambiente.[cite:36][cite:20] O caminho mais eficiente é tratar a integração como um pipeline de curadoria, tracking e analytics, e não apenas como importação de catálogo.[cite:36][cite:18]

Com seu perfil técnico e stack atual, o ponto de partida ideal é um backend em Vercel com client GraphQL encapsulado, persistência no Supabase e tracking granular por coleção/canal.[cite:17][cite:36] A partir disso, o app pode evoluir para um motor de seleção automática baseado em ofertas, cliques, vendas e comissão validada.[cite:36]
