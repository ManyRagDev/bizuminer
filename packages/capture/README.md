# Camada de Captura

Primeiro módulo do sistema. Define o contrato que toda fonte de ofertas implementa e traz a Shopee como primeira implementação.

```
src/
  types.ts                    contrato CaptureAdapter e oferta normalizada
  errors.ts                   erros tipados por natureza da falha
  rate-limit.ts               token bucket e backoff com jitter
  money.ts                    conversão monetária sem ponto flutuante
  adapters/shopee/
    client.ts                 transporte GraphQL com assinatura HMAC-SHA256
    queries.ts                documentos GraphQL
    mapper.ts                 resposta da Shopee → oferta normalizada
    index.ts                  ShopeeAdapter
  adapters/mercadolivre/
    oauth.ts                  OAuth 2.0 com refresh token de uso único
    index.ts                  MercadoLivreAdapter e mapeamento da busca
test/capture.test.ts          26 testes da base e da Shopee
test/mercadolivre.test.ts     19 testes, foco no OAuth
```

45 testes no total. Nenhum toca a rede.

```bash
npm test          # node --test com type stripping nativo
npm run typecheck # tsc --noEmit, modo strict
```

---

## As decisões e o porquê

### Node/TypeScript, não Python

A API é Fastify, a fila é BullMQ, o ORM é Prisma — tudo Node. Adicionar Python significaria segundo runtime, segundo gerenciador de dependências, segundo deploy e tipos que não conversam com o resto da base.

A vantagem do ecossistema Python em scraping é real, mas não decisiva: o Playwright tem API de primeira classe em Node e `got-scraping` também é Node. Para dois desenvolvedores em treze semanas, unificar a linguagem vale mais.

### API oficial, nunca scraping na Shopee

A Seção 4.3(d) dos Termos do Programa de Afiliados da Shopee proíbe expressamente *"qualquer meio ou forma automatizada de sucateamento, ou outros métodos de extração de dados"*.

Não é área cinzenta, e a penalidade recai sobre a **conta de afiliado do cliente** — não sobre nós. Seria o mesmo erro do WAHA em outra camada: construir sobre algo proibido e transferir o dano para quem paga.

Toda oferta carrega o campo `source` (`official_api`, `http_json` ou `browser`). Isso torna a procedência auditável e permite responder com precisão quando alguém perguntar como o dado foi obtido.

### Captura e afiliação são coisas separadas

**Nós capturamos com a nossa credencial; o cliente afilia com a dele.**

Essa separação resolve o portão de onboarding identificado como risco de churn: a aprovação da API da Shopee é manual e pode demorar. Sem a separação, o cliente assina e fica semanas sem ver nada funcionando — e cancela antes de descobrir se o produto presta.

Com ela, o feed curado aparece no primeiro minuto e a credencial dele entra em paralelo, bloqueando apenas a geração do link.

Por isso `buildAffiliateLink` é opcional no contrato e recebe a `AffiliateTag` como parâmetro distinto da `Credential`.

### Dinheiro em centavos inteiros

`29.90 * 100` resulta em `2989.9999999999995` em ponto flutuante. Num relatório de comissão, isso vira divergência de centavos que ninguém consegue explicar.

`toCents()` converte por manipulação de texto, aceita os formatos pt-BR e en-US, arredonda o terceiro decimal e devolve `undefined` em vez de lançar — porque um campo malformado numa oferta não pode derrubar a captura de um lote inteiro.

### Erros tipados por natureza da falha

O worker precisa reagir diferente a cada caso: limite de taxa espera e repete, credencial inválida notifica o cliente e para, falha de rede repete algumas vezes.

`CaptureError` expõe `retryable` e `needsOperatorAttention` para que essa decisão não dependa de inspecionar texto de mensagem — que quebra na primeira mudança de redação do fornecedor.

### O código 10030 é o nosso único sinal de limite

A Shopee não publica limite numérico de requisições. Sinaliza excesso pelo código `10030`.

Consequência prática: a cadência precisa ser **calibrada empiricamente**. O `TokenBucket` começa em 1 requisição por segundo — conservador de propósito — e o número deve subir observando a frequência do 10030 em produção.

O backoff usa jitter completo. Não é enfeite: sem ele, várias filas que estouram o limite ao mesmo tempo repetem sincronizadas e estouram de novo.

### Mapeamento defensivo

Apenas `itemId`, `productName`, preço e URL são obrigatórios. Qualquer outro campo ausente vira `undefined` e a oferta segue.

Campo novo ou removido pela Shopee é o modo de falha mais comum em integração com API de terceiro — e não pode custar um lote inteiro. `mapProductNodes` devolve `skipped` para que o worker registre quantos caíram.

### Credencial nunca vaza

Não aparece em log, em mensagem de erro nem em `toLogSafe()`. O teste `rejeita credencial incompleta sem vazar o segredo na mensagem` verifica isso explicitamente — porque essa é a regra que se quebra por acidente numa refatoração apressada.

### Cursor opaco em vez de número de página

A Shopee pagina por página; o `conversionReport` pagina por `scrollId`. Expor cursor opaco no contrato permite trocar a estratégia dentro do adapter sem tocar no núcleo.

### Mercado Livre: API de marketplace, não de afiliados

O acesso obtido no DevCenter é a API geral do Mercado Livre, com OAuth 2.0. Ela dá **produto, preço, imagem e vendedor** — tudo que a captura precisa — e tira o Mercado Livre da categoria "só por scraping".

O que ela **não** dá é geração de link de afiliado: o token autentica um usuário do Mercado Livre, não um programa de afiliados. Por isso `capabilities.linkGeneration: false` e `buildAffiliateLink` não implementado.

Isso reforça a separação entre captura e afiliação: capturamos com a nossa credencial; o link do cliente sai por outro caminho.

### O refresh token do Mercado Livre é de uso único

É o detalhe operacional mais perigoso de toda a camada.

Cada renovação devolve um par novo e **invalida o anterior**. Dois processos renovando ao mesmo tempo: um ganha, o outro fica com um token morto, e a conta sai do ar até alguém refazer a autorização à mão. Em desenvolvimento nunca acontece; com dois workers, acontece.

Três defesas no código:

1. **Single-flight.** Chamadas concorrentes esperam a mesma promessa em vez de dispararem renovações paralelas. Há um teste que falha se isso regredir.
2. **Persistir antes de devolver.** Se gravar o par novo falhar, abortamos — melhor falhar a requisição do que seguir com um token que não conseguimos salvar, porque o antigo já morreu.
3. **Releitura sob o lock.** Antes de renovar, relê o armazenamento: outro processo pode ter renovado enquanto esperávamos.

Para múltiplos contêineres, o single-flight em memória não basta. A porta `TokenStore.withLock` existe para receber um lock em Redis — a implementação fica na camada de infraestrutura.

Margem de renovação: 5 minutos antes de expirar, não no vencimento.

### O desconto declarado não é o desconto verificado

`claimedDiscountRate` é o que a Shopee afirma. O `originalPriceCents` é derivado dele quando disponível.

**Nada disso é o nosso diferencial.** O desconto verificado vem do nosso histórico de preço — da tabela `price_observation` — e não do que o marketplace declara. O campo se chama `claimed` justamente para que ninguém confunda os dois seis meses depois.

---

## Testes

26 testes, nenhum toca a rede. O cliente HTTP é injetado por construtor.

Isso permite rodar em CI sem credencial e testar caminhos que a API real não produz sob demanda: código 10030, HTTP 401, erro de GraphQL com status 200, resposta malformada.

Cobertura das partes que mais custam se estiverem erradas:

- assinatura HMAC no formato exato exigido, e que ela muda quando o corpo muda
- conversão monetária, incluindo o caso do ponto flutuante
- retentativa que repete o que deve e não repete o que não deve
- jitter determinístico via injeção do gerador aleatório
- paginação que percorre e para no fim
- credencial incompleta que não vaza o segredo

---

## O que falta

> **Ver também:** [`docs/tecnico/mercadolivre-engenharia-reversa.md`](../../docs/tecnico/mercadolivre-engenharia-reversa.md) — registro completo da engenharia reversa do link de afiliado do ML (17–18/08/2026): anatomia do link (`matt_word` + `matt_tool`, `ref` dispensável), prova de campo da atribuição, descoberta da página pública `/ofertas` como fonte de produtos, e a regra de usar o `href` real do card em vez de construir permalinks.

**O Mercado Livre já pode rodar contra a API real** — o acesso existe (`/users/me` OK). Porém, desde 2025 a política do ML bloqueia `/search` e `/items` para apps não certificadas (403) — a descoberta automática de produtos usa a página pública `/ofertas` (ver doc acima).

**A Shopee ainda depende de aprovação manual** do App ID e App Secret no painel de afiliado, sem prazo publicado.

Na ordem:

1. **Endpoint de callback OAuth** — recebe o `code`, valida o `state` contra CSRF, chama `exchangeCode` e persiste
2. **`TokenStore` sobre PostgreSQL** com criptografia na aplicação, mais `withLock` em Redis para o caso de múltiplos workers
3. **Persistência de ofertas** — gravar `RawOffer` em `product` e `price_observation`, com a lógica de intervalo (abre linha nova só quando o preço muda)
4. **`capture_run`** — registrar cada execução para viabilizar o alerta de captura zerada
5. **Worker BullMQ** — uma fila por marketplace, agendamento e concorrência
6. **Adapter do Awin** — terceira fonte, `Offers API`
7. **`shopeeOfferV2`** — feed de campanhas e ofertas relâmpago, hoje só declarado em `capabilities`

**Verificar contra a API real:** os nomes de campo em `queries.ts` (Shopee) vieram de documentação pública e material de terceiros; os do Mercado Livre, da documentação oficial. A primeira chamada real pode exigir ajuste — é esperado, e o mapeamento defensivo existe para que isso não vire incidente.

**Confirmar nos termos do Mercado Livre** se há restrição a armazenamento ou redistribuição de dados de produto, já que vamos manter histórico de preço. Não encontramos vedação, mas é leitura que vale fazer antes de acumular volume.
