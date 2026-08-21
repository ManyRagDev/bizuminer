# Modelo de Dados

> 📁 **Documento histórico — congelado em 20/08/2026 (redação oficial).** Os *princípios* deste documento continuam valendo e foram absorvidos pelo documento mestre: append-only em histórico de preço, `tenant_id` em toda tabela de negócio, e identidade de produto modelada desde o início. O **corpo** abaixo descreve o modelo B2B suplantado (18 tabelas, `connection` de WhatsApp, piloto automático, Prisma) e **não se atualiza mais** — não o use para decidir. O estado vigente está em [`docs/estado-do-projeto.md`](../estado-do-projeto.md).

**Documento estrutural — entidades, relações e justificativa de cada decisão**

Escopo: PostgreSQL + Prisma. Nomes de tabela em inglês (convenção de código), explicação em português.

Este documento define **o que existe e por quê**. Tipos exatos, índices e constraints vêm no passo seguinte, depois que a estrutura for aprovada.

---

## Princípio que organiza tudo

Três coisas neste schema são **irreversíveis na prática**. Se saírem erradas, não se corrige com migration — se corrige com reescrita ou com perda de dados:

1. **Isolamento entre clientes.** Adicionar `tenant_id` depois significa auditar toda query já escrita.
2. **Histórico de preço.** Dado não gravado não se recupera. Cada dia sem essa tabela é um dia de diferencial perdido.
3. **Identidade de produto.** Se a chave natural de cada marketplace não for modelada desde o início, o histórico não liga com o produto.

O resto do schema pode evoluir tranquilamente. Esses três, não.

---

## 1. Multi-tenancy

### Entidades

**`tenant`** — a conta. Um afiliado individual, uma agência, ou uma das nossas operações internas.
Campos essenciais: nome, plano, status, data de criação.

**`user`** — pessoa que faz login. Pertence a um tenant.

**`membership`** — vincula usuário a tenant com um papel (`owner`, `operator`, `viewer`).

### Por que `membership` separado de `user`

Porque o plano Agência precisa de um usuário operando vários tenants — a agência gerencia a conta de cada afiliado cliente. Se o papel ficar direto em `user`, essa funcionalidade exige reescrita da autenticação inteira. Com `membership`, é só mais uma linha.

Custo hoje: uma tabela a mais. Custo depois: refazer login, sessão e autorização.

### A decisão que mais importa aqui

**`tenant_id` em toda tabela de negócio, mais Row Level Security no PostgreSQL.**

O Prisma não escopa nada sozinho. Um `findMany()` sem `where` retorna dados de todos os clientes, e esse bug não quebra nada — ele só vaza. Passa em teste, passa em code review, aparece quando um cliente vê a oferta de outro.

RLS no banco é a rede de segurança: mesmo que a aplicação erre, o Postgres não devolve linha de outro tenant. Configurar isso custa uma tarde agora e é praticamente impossível de adicionar com o produto rodando.

---

## 2. Marketplaces e credenciais

### Entidades

**`marketplace`** — Shopee, Awin, AliExpress, Lomadee, Mercado Livre, Magalu, Amazon.
Campos: slug, nome, método de captura (`official_api` / `scraping`), configuração de rate limit, template de conversão de link, status ativo.

**`affiliate_credential`** — as chaves do cliente para um marketplace.
Campos: tenant_id, marketplace_id, payload cifrado, status de validação, data da última verificação bem-sucedida.

### Por que `marketplace` é tabela e não enum

Enum exige migration para cada loja nova, e o Awin sozinho traz dezenas de lojas. Além disso, cada marketplace tem regra própria de conversão de link, limite de requisição e método de captura — e essas regras mudam sem aviso, como a Amazon mostrou em 2026. Tabela permite ajustar por configuração; enum exige deploy.

### Sobre a criptografia

O payload de credencial é cifrado **na aplicação**, com chave fora do banco, não com `pgcrypto`. Se a chave mora no mesmo Postgres que o dado cifrado, quem obtém um dump obtém os dois — a criptografia vira decoração.

Regra que precisa estar no código desde o primeiro commit: **credencial nunca entra em log, nunca vai para Sentry, nunca aparece em resposta de API.** A API devolve status de validação, nunca o valor.

### Campo que parece detalhe e não é

`last_validated_at`. Chave de afiliado expira, é revogada, e o cliente troca sem avisar. Sem esse campo, a primeira notícia de que a credencial morreu é o cliente reclamando que parou de ganhar comissão — e por quantos dias isso rodou publicando link quebrado.

---

## 3. Produto e identidade

### Entidade

**`product`** — a identidade canônica de um item dentro de um marketplace.
Campos: marketplace_id, external_id, external_shop_id, título, imagem, categoria, URL canônica.

Chave única: `(marketplace_id, external_id, external_shop_id)`.

### Por que a chave é composta

Cada marketplace identifica produto de um jeito. A Shopee usa `itemId` **mais** `shopId` — o mesmo item em lojas diferentes é registro diferente. A Amazon usa ASIN. O Awin traz IDs por anunciante.

Modelar isso como um campo `sku` genérico funciona até a segunda integração, e aí quebra em silêncio: dois produtos diferentes colidem na mesma linha, e o histórico de preço de um contamina o outro.

### O que este produto deliberadamente NÃO faz

Não tentamos unificar o mesmo produto entre marketplaces — reconhecer que o Echo Dot da Amazon e o da Shopee são o mesmo item. Isso é um problema difícil (matching de catálogo) que não é necessário para o MVP. Se um dia formos comparar preço entre lojas, entra uma tabela `product_group` por cima, sem tocar no que já existe.

---

## 4. Histórico de preço — o núcleo do diferencial

Esta é a tabela que nenhum concorrente tem, e a única que **não pode esperar**.

### Granularidade do histórico e proveniência

**Decisão implementada em 18/08/2026: uma observação por produto em cada execução de captura.**

**`price_observation`** guarda o fato observado naquele momento: `product_id`,
`capture_run_id`, preço, preço original, `observed_at` e snapshots normalizados de
título, URL, imagem e categoria. A restrição única `(capture_run_id, product_id)`
torna a gravação idempotente dentro de uma execução.

Mesmo quando o preço não muda, a execução seguinte cria uma nova observação. O
registro não serve apenas para detectar variações: ele prova que o produto apareceu
naquela coleta, com aqueles dados, e permite reproduzir auditorias e debugging. O
estado agregado de presença fica em `product.first_seen_at`, `product.last_seen_at`
e `product.last_capture_run_id`.

A ausência de um produto em uma execução **não** prova indisponibilidade ou remoção.
Ela significa somente que a fonte não o devolveu naquela varredura. Qualquer estado
de indisponibilidade futuro exigirá evidência própria e uma regra explícita.

Observações legadas permanecem válidas com `capture_run_id` nulo quando não existe
proveniência histórica que possa ser reconstruída sem inventar dados. O prazo de
retenção `X` será decidido com volume e necessidade jurídica reais; até lá, o
histórico é preservado e não há exclusão automática nem particionamento prematuro.

### Como isso vira o "desconto verificado"

**`price_reference`** — snapshot calculado periodicamente por produto, com o que precisamos para julgar uma oferta:

- `min_price_30d`, `min_price_90d` — o menor preço praticado na janela
- `median_price_30d` — mediana, que resiste a outlier
- `current_percentile` — em que percentil o preço atual está no histórico
- `is_lowest_in_days` — há quantos dias não fica tão barato
- `observation_count` — quantas leituras sustentam esse cálculo

O último campo é o que impede o erro mais provável do produto: anunciar "menor preço em 90 dias" com base em três leituras de uma semana. Sem `observation_count`, o sistema faz afirmação forte com dado fraco — e queima exatamente a credibilidade que o diferencial existe para proteger.

**Regra de produto que precisa estar no schema:** abaixo de um número mínimo de observações e de uma janela mínima de cobertura, a oferta sai marcada como *desconto não verificado*, não como desconto real.

---

## 5. Oferta

**`offer`** — uma oportunidade detectada e julgada digna de publicação.
Campos: product_id, preço, desconto percentual, `verified_discount` (boolean), `verification_basis` (snapshot do `price_reference` no momento), origem, `expires_at`, status.

### Por que `offer` é separado de `price_observation`

`price_observation` é **fato bruto**: o preço era X às 14h32. `offer` é **interpretação**: isto é um desconto real e vale publicar.

Separar permite mudar a lógica de detecção — e ela vai mudar muito nos primeiros meses — sem perder nem reprocessar o histórico. Se a regra de "o que é desconto real" ficar embutida na tabela de observação, cada ajuste de critério exige recalcular tudo ou conviver com dados inconsistentes.

### Por que `verification_basis` guarda um snapshot

Se o cliente perguntar "por que vocês disseram que era o menor preço em 60 dias?", precisamos responder com o que o sistema sabia **naquele momento**, não com o que sabe hoje. Isso é auditoria do nosso próprio diferencial — e o dia em que um cliente questionar, essa coluna é a resposta.

`expires_at` vem do `periodEndTime` da Shopee. Oferta com validade vencida não deve ser publicada nem entrar em fila.

---

## 6. Conexões e destinos

### Entidades

**`connection`** — um canal conectado: um bot do Telegram ou uma sessão de WhatsApp.
Campos: tenant_id, tipo, status, identificação externa, dados de sessão cifrados, `last_health_check_at`.

**`destination`** — um grupo ou canal específico dentro de uma conexão.
Campos: connection_id, identificador externo do chat, nome, tipo (`group` / `channel`), status.

### Por que separar os dois

Porque é assim que o custo e o preço funcionam.

Uma sessão de WhatsApp consome de 60 a 80 MB de RAM na engine NOWEB, independentemente de publicar em um ou em vinte grupos. **O custo é por conexão; o volume é por destino.**

Se o schema tratasse "grupo" como unidade, o limite comercial ficaria desalinhado do custo real de infraestrutura — exatamente o erro de precificação que identificamos nos concorrentes, que travam por número de lojas.

Com essa separação, o plano limita conexões e volume de disparo, que é o que nos custa. Schema e modelo de negócio ficam alinhados.

### Reflexo da decisão sobre WhatsApp

O modelo de destino opt-in que você propôs cabe aqui sem mudança estrutural: `destination` é o grupo que o cliente administra, e o volume por destino cai para uma dezena de mensagens por dia.

O que muda é a **ênfase**: `spintax` e `delay` deixam de ser propriedade central do sistema e viram configuração opcional por conexão. Eles existem para disfarçar envio em massa; num modelo de baixo volume para destino próprio, são detalhe, não arquitetura.

---

## 7. Publicação e deduplicação

**`publication`** — o registro de que uma oferta foi enviada a um destino.
Campos: tenant_id, offer_id, destination_id, rule_id (se automático), status, `published_at`, id da mensagem externa, `price_at_publication`.

Esta tabela faz três trabalhos ao mesmo tempo:

**Deduplicação.** Chave única sobre `(destination_id, product_id, faixa de preço)` dentro de uma janela de tempo. Impede republicar o mesmo produto no mesmo grupo — que é a reclamação recorrente contra as ferramentas atuais. A faixa de preço, e não o preço exato, evita que uma variação de um centavo seja tratada como oferta nova.

**Idempotência.** O `job id` no BullMQ deriva dessa mesma chave. Worker que reinicia no meio do processamento não duplica mensagem.

**Auditoria.** Quando o cliente perguntar por que uma oferta foi publicada, a resposta está aqui: qual regra disparou, com qual preço, em que momento.

`price_at_publication` existe porque o preço muda depois. Sem congelar o valor publicado, é impossível investigar reclamação de "anunciou R$99 e estava R$149".

---

## 8. Regras do piloto automático

**`rule`** — condições que fazem uma oferta ser publicada automaticamente.
Campos: tenant_id, destination_id, filtros (desconto mínimo, faixa de preço, categoria, marketplace, exigir desconto verificado), limite de publicações por período, janela de horário, status.

### Duas decisões

**Filtros em JSONB, não em colunas.** As condições vão mudar toda semana nos primeiros meses. Cada novo filtro como coluna é uma migration; em JSONB é uma mudança de validação. A perda em performance de query é irrelevante no volume de regras que teremos.

**`max_publications_per_hour` é obrigatório, não opcional.** É o freio que impede uma regra mal configurada de despejar duzentas ofertas num grupo em dez minutos — o que irrita a audiência do cliente e, no WhatsApp, cria exatamente o padrão de volume que dispara detecção. O limite protege o cliente de si mesmo.

---

## 9. Rastreio e conversão

**`short_link`** — link encurtado próprio, com atribuição.
Campos: tenant_id, publication_id, slug, URL de destino, `sub_id` enviado ao marketplace.

**`click_event`** — append-only: slug, timestamp, user agent, referer, hash de IP.

**`conversion`** — importado do `conversionReport` e do `validatedReport` da Shopee.
Campos: tenant_id, marketplace_id, id externo do pedido, `sub_id`, valor, comissão, status, datas.

### Por que o encurtador próprio é infraestrutura, não conveniência

O `generateShortLink` da Shopee aceita até cinco `subIds`. Se gravarmos o `publication_id` no `sub_id`, fechamos o ciclo inteiro: **esta oferta, publicada neste grupo, por esta regra, gerou esta comissão.**

Nenhum concorrente entrega isso. É o dado que transforma "a ferramenta funciona" em "a ferramenta gerou R$X este mês" — e é o que sustenta a renovação da assinatura.

### Sobre `click_event`

Cresce rápido e não precisa viver para sempre. Retenção de 90 dias no detalhe, com agregação diária permanente numa tabela separada. Definir isso agora evita a conversa desagradável de "o banco está com 400 GB" no mês seis.

Hash de IP, não IP puro — LGPD, e não precisamos do endereço para nada além de deduplicar clique.

---

## 10. Observabilidade

**`capture_run`** — cada execução de worker de captura.
Campos: marketplace_id, início, fim, status, itens capturados, itens novos, mudanças de preço detectadas, erro.

Esta tabela existe por um motivo específico: **scraper e API quebram em silêncio.** O worker roda, não dá erro, e retorna zero itens. O sistema continua "funcionando" — só parou de encontrar ofertas.

Com `capture_run`, a regra de alerta é trivial: N execuções consecutivas com zero itens em um marketplace dispara notificação. É a diferença entre descobrir em uma hora e descobrir pelo cliente na segunda-feira.

**`audit_log`** — quem mudou o quê. Relevante sobretudo no plano Agência, onde uma pessoa opera a conta de terceiros e vai existir a pergunta "quem alterou essa regra?".

---

## Resumo das entidades

| Domínio | Tabelas |
|---|---|
| Tenancy | `tenant`, `user`, `membership` |
| Integração | `marketplace`, `affiliate_credential` |
| Catálogo | `product` |
| Preço | `price_observation`, `price_reference` |
| Curadoria | `offer` |
| Distribuição | `connection`, `destination`, `rule`, `publication`, `message_template` |
| Rastreio | `short_link`, `click_event`, `click_daily`, `conversion` |
| Operação | `capture_run`, `audit_log` |

Dezoito tabelas. É mais do que um MVP costuma ter, e a razão é que quatro delas — `price_observation`, `price_reference`, `publication` e `capture_run` — são as que não dá para adicionar depois sem perder dado ou reescrever.

---

## Pontos que precisam de decisão antes do SQL

1. **Janela de deduplicação.** Quanto tempo sem republicar o mesmo produto no mesmo destino? Sugestão: 7 dias, configurável por regra.
2. **Faixa de preço para dedupe.** Que variação caracteriza oferta nova? Sugestão: 5%.
3. **Mínimo de observações para verificar desconto.** Sugestão: 10 observações cobrindo pelo menos 14 dias.
4. **Retenção de `click_event`.** Sugestão: 90 dias no detalhe, agregado diário permanente.
5. **Frequência de recálculo do `price_reference`.** Sugestão: a cada 6 horas, ou sob demanda quando uma oferta candidata surgir.

São cinco números. Definidos agora, entram como default no schema; deixados em aberto, viram constante mágica espalhada pelo código.
