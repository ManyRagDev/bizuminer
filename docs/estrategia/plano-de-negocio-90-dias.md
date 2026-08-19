# Plano de Negócio — 90 dias até o lançamento

**Plataforma de curadoria e distribuição de ofertas para afiliados**
Documento interno · julho de 2026 · versão 2, revisada após auditoria

---

## Sumário executivo

Vamos construir uma plataforma que detecta ofertas de e-commerce, verifica se o desconto é real usando histórico de preço próprio, e distribui em canais que a audiência do cliente escolheu seguir.

O mercado está validado: mais de 5 milhões de afiliados cadastrados só na Shopee Brasil, e onze concorrentes ativos praticando de R$0 a R$497 por mês. Nenhum deles ocupa posição claramente dominante, e nenhum resolve os dois problemas que mais aparecem nas reclamações de usuários.

**O primeiro é o banimento de contas de WhatsApp.** É a dor mais citada da categoria. Todos prometem "anti-ban" e a pesquisa classifica a solução como parcial em todos os casos: os bloqueios continuam frequentes. Não é falha de implementação — é consequência da arquitetura que todos escolheram, baseada em automação fora da API oficial. Quatro empresas brasileiras que vendiam esse serviço já foram processadas pelo WhatsApp.

**O segundo é a ausência de curadoria confiável.** Nenhuma ferramenta analisada valida se o desconto anunciado é real. O afiliado publica promoção falsa sem saber e queima a credibilidade do próprio canal.

Nossa aposta ataca os dois com a mesma decisão: **construir dentro do que as plataformas permitem, e usar isso como posicionamento.** Telegram como canal principal via API oficial, WhatsApp por compartilhamento manual assistido e alerta 1:1 pela API oficial da Meta. Sem sessões conectadas e sem QR Code — o que elimina a exposição jurídica da empresa e o ban por padrão automatizado.

Os números sustentam bootstrapping: **12 clientes cobrem o custo operacional**, o desembolso em caixa dos 90 dias fica em torno de R$7 mil a R$10 mil, e a margem de contribuição é de 79% a 87% conforme o regime tributário. O projeto não precisa de capital externo para a infraestrutura — mas esse número **não inclui a subsistência dos sócios durante os 90 dias**, que é a maior despesa real do período.

---

## 1. O mercado

### Tamanho e crescimento

| Indicador | Valor | Fonte e natureza |
|---|---|---|
| Afiliados cadastrados na Shopee Brasil | mais de 5 milhões | Dado oficial Shopee, reafirmado em julho de 2026 |
| Crescimento do programa do Mercado Livre | +324% em afiliados cadastrados, Q3/2020 a Q3/2024 | Dado oficial Mercado Livre, janeiro de 2026 |
| Participantes em marketing de afiliados no Brasil | mais de 30 milhões | Estimativa de terceiros, abril de 2026 |
| Faturamento do e-commerce brasileiro | R$224 bilhões projetados para 2025 | ABComm |

### Comissões por programa

| Programa | Faixa | Natureza do dado |
|---|---|---|
| Amazon Associados | 7% a 13% por categoria | Tabela oficial |
| Shopee Afiliados | 3% a 15% | Estimativa de terceiros |
| Mercado Livre | 7% a 16% | Estimativa de terceiros |
| Influenciador Magalu | até 12% | Oficial, sem tabela detalhada |
| AliExpress | 3% a 9% | Estimativa de terceiros |

### Ressalva importante sobre o mercado endereçável

Cadastro não é uso, e uso não é disposição a pagar. Não existe dado público de quantos desses afiliados estão ativos, muito menos de quantos pagariam por ferramenta. **De "5 milhões de cadastrados" até "quantos assinam por R$97/mês" há várias ordens de grandeza que nenhuma fonte cobre.**

O que os números sustentam com segurança é que a categoria existe, cresce e tem demanda real. O tamanho do nosso mercado endereçável é premissa a validar, não fato estabelecido.

### O gargalo do cliente

Não é encontrar produto — é a latência entre a oferta existir e chegar ao público, somada ao trabalho manual de curadoria. Os concorrentes afirmam em seus materiais de venda que o afiliado tradicional gasta de 4 a 6 horas por dia garimpando ofertas. É alegação de marketing deles, não estudo, mas indica como a categoria descreve a própria dor.

---

## 2. Cenário competitivo

Onze players ativos, praticando de R$0 a R$497 por mês.

| Ferramenta | Canais | Preço mensal | Origem do preço |
|---|---|---|---|
| FluxoPromo | Telegram, WhatsApp (add-on) | R$37 / 97 / 197, WhatsApp +R$149,90 | Site oficial |
| Hub do Afiliado | Telegram, WhatsApp | R$97 / 297 / 497, WhatsApp R$100/sessão | Site oficial |
| DivulgaLinks | WhatsApp, Telegram, Instagram | R$69,90 / 129,90 / 169,90 | Site oficial |
| Shozap | WhatsApp, Telegram, Instagram | ~R$50 a 150 | Comparativo de terceiros |
| DivulgaNinja | WhatsApp, Telegram, Instagram | a partir de ~R$39 a 49,90 | Fontes divergentes |
| TrocaLink | WhatsApp, Telegram | ~R$99 | Comparativo de terceiros |
| Easyfy | WhatsApp, Telegram | ~R$39,92 | Comparativo de terceiros |
| IA Divulgadora | multicanal | R$69,90 (plano inicial) | Comparativo de terceiros |
| ProAfiliados | WhatsApp, Telegram | grátis, Premium ~R$50 | Comparativo de terceiros |
| Achadinhos Pro, Linqor | variados | não divulgado | — |

**Nota metodológica:** os quatro primeiros preços vieram das páginas oficiais das próprias empresas. Os demais vieram de material comparativo de terceiros e devem ser tratados como aproximação. Dois concorrentes não divulgam preço.

### O que virou commodity

Captura multi-marketplace, tag do próprio cliente, disparo em WhatsApp e Telegram, anti-duplicação, encurtador com rastreio, agendamento, templates, dashboard de cliques, copy com IA, programa de afiliados interno. Nada disso é diferencial — é o piso de entrada.

### As dores que ninguém resolve

Levantamento sobre reclamações e avaliações de usuários:

| Dor | Onde aparece | Status |
|---|---|---|
| Bloqueios e bans no WhatsApp | Citada em 4 das 11 ferramentas analisadas | **Parcial** — existe anti-ban e delay, mas os bloqueios seguem frequentes |
| Validação de desconto real | — | **Nenhuma ferramenta oferece** |
| Curadoria própria vs. espelhamento | Alta | Parcial |
| Transparência de preço | 4 das 11 operam sob consulta | Não resolvida |

### A leitura estratégica

Onze concorrentes indicam categoria **validada e fragmentada**. Não há dado público de participação de mercado, faturamento ou tempo de casa da maioria — então "nenhum dominante" é leitura da ausência de um nome que apareça sozinho nas buscas, não medição.

Eles nos entregam de graça três informações caras: a lista do que é obrigatório, a faixa de preço que o mercado aceita, e o canal de aquisição que funciona no nicho.

E o ponto central: **a dor mais citada da categoria é consequência da arquitetura que a categoria adotou.** Isso não se corrige com anti-ban melhor.

---

## 3. Posicionamento

### A decisão central

Construir dentro do que as plataformas permitem, e transformar isso em argumento comercial.

Não é postura moral. É análise de fragilidade: a feature central dos concorrentes é a que gera litígio. Isso não é vantagem competitiva — é um pavio aceso, e o momento em que uma empresa dessas mais tem a perder é justamente quando começou a faturar.

**Evidência:**

- Ferramentas que operam o WhatsApp fora da API oficial — seja por reconstrução do protocolo, como o Baileys, seja por automação de navegador, como Venom e WPPConnect — têm vida útil relatada de 2 a 8 semanas antes do banimento do número
- O WhatsApp declarou banir cerca de 2 milhões de contas por mês por comportamento automatizado **à época do anúncio de dezembro de 2019**; não há número atualizado público
- Desde dezembro de 2019, declara que toma ação legal contra os envolvidos em abuso de envio automatizado ou em massa, inclusive com base em evidência fora da plataforma. A Política de Mensagens Business acrescenta que quem *usa ou trabalha com* serviço violador pode ter o acesso restringido
- Já processou quatro empresas brasileiras que vendiam disparo em massa: Autland, VB Marketing, SallApp e Yacows
- A Groups API oficial da Meta limita grupos a 8 membros, o que a torna inaplicável a canal de ofertas. **Este dado veio de busca web em documentação da Meta e precisa ser confirmado na fonte primária antes de virar decisão final**, porque sustenta boa parte da arquitetura

### As três frentes de diferenciação

**1. Desconto verificado.** Histórico de preço próprio por SKU. Nenhum concorrente oferece hoje. Ressalva honesta: isso é replicável por qualquer um dos onze em algumas semanas. **O fosso é temporal, não estrutural** — a vantagem real está em começar a acumular histórico antes deles, porque dado passado não se compra.

**2. Curadoria de origem.** A maioria do mercado espelha os mesmos grupos-fonte, o que satura os canais com ofertas repetidas. Captura direta na origem gera feed exclusivo.

**3. Operação que não expõe a empresa.** Sem sessão conectada e sem QR Code, eliminamos a exposição jurídica da empresa e o padrão automatizado que dispara detecção.

**Precisão sobre a promessa:** não podemos afirmar "zero risco de ban para o cliente". O gestor continuará publicando manualmente em grupos de WhatsApp, e a plataforma não define limite numérico formal — o gatilho é o padrão de uso e o volume de bloqueios e denúncias. O que eliminamos é o ban causado por automação e a nossa própria exposição. É menos do que "risco zero", e ainda assim é muito mais do que qualquer concorrente entrega.

### A vantagem de largada

Uma rede de afiliados real validando desde a primeira versão, com feedback semanal e comissão medida antes e depois.

---

## 4. Produto

### Arquitetura de canais

| Canal | Mecanismo | Custo por mensagem | Papel |
|---|---|---|---|
| **Telegram** | Bot API oficial | zero | Canal principal, audiência ilimitada |
| **Grupo de WhatsApp** | Link pronto e compartilhamento nativo, envio manual pelo gestor | zero | Volume alto, audiência opt-in |
| **WhatsApp 1:1** | Cloud API oficial da Meta | ~R$0,35 | Alerta pessoal de preço, baixo volume |

Sobre o terceiro canal: template de marketing no Brasil custa cerca de US$0,0625 por mensagem entregue, o que a US$1 ≈ R$5,60 dá aproximadamente R$0,35, mais o markup do provedor. As fontes indicam ausência de desconto por volume. Isso inviabiliza broadcast 1:1, mas **viabiliza alerta pessoal**: "o produto que você marcou caiu para o menor preço em 90 dias" vale muito mais de R$0,35 e não é bloqueada, porque foi pedida.

*Preço e política da Cloud API vêm de agregadores de mercado, não da tabela oficial da Meta. Confirmar antes de precificar o add-on.*

### Módulos

**Garimpo** — captura contínua via API oficial, histórico de preço por SKU, cálculo de desconto verificado, deduplicação.

**Afiliação** — conversão de URL com a tag do próprio cliente, cofre de credenciais cifradas, encurtador com rastreio e atribuição ponta a ponta.

**Curadoria e disparo** — feed em tempo real, publicação em 1 clique, piloto automático com filtros para Telegram, conteúdo pronto para WhatsApp.

**Migração de audiência** — ferramenta para o cliente levar o público do grupo de WhatsApp para o canal do Telegram: convite formatado, acompanhamento de migração e publicação em paralelo durante a transição. É a resposta à objeção que mais vai aparecer em vendas, e é o momento de maior custo de mudança do cliente.

### Fora do escopo dos 90 dias

Instagram, geração de imagem por IA, landing pages e loja própria, matching de produto entre marketplaces, app mobile nativo, integração com Amazon.

---

## 5. Arquitetura e stack

### Visão do sistema

```
Painel Web  →  API Server  →  Fila (Redis + BullMQ)
                                   ↓            ↓
                        Workers de Captura   Workers de Publicação
                                   ↓            ↓
                            Marketplaces      Canais
                          (APIs oficiais)  (Telegram · Cloud API)

                     PostgreSQL + Prisma (persistência)
```

### Stack por camada

| Camada | Escolha |
|---|---|
| Frontend | React / Next.js, TypeScript, Tailwind, WebSockets para o feed |
| Backend | Node.js LTS, Fastify, JWT com multi-tenant e RBAC |
| Filas | Redis e BullMQ, com backoff exponencial e rate limit por marketplace |
| Captura | APIs oficiais como camada primária; scraping apenas onde não há API |
| Distribuição | Telegram Bot API, WhatsApp Cloud API, geração de links |
| Dados | PostgreSQL, Prisma, Row Level Security, credenciais cifradas na aplicação |
| Infra | Docker Compose, VPS Linux, Caddy com SSL automático |

### Decisões de sequenciamento

**Shopee é a primeira e única integração da Fase 1.** A Open API entrega `productOfferV2` com preço, desconto e comissão; `shopeeOfferV2` com campanhas e ofertas flash; `generateShortLink` com até 5 subIds; `listItemFeeds` para catálogo em massa; `conversionReport` e `validatedReport` para conversão. Cobre quase todo o produto sem scraping — e os Termos da Shopee proíbem scraping expressamente na Seção 4.3(d), então API é o único caminho.

**A aprovação da credencial é manual.** Material técnico de terceiros menciona 5 a 15 dias; a Shopee não publica prazo. Tratar como incerteza no caminho crítico e solicitar no primeiro dia.

**Awin é a segunda fonte.** Tem `Offers API` com feed de ofertas, e uma integração dá acesso à rede de anunciantes. O Hub do Afiliado lista Kabum, Casas Bahia, Americanas, Centauro, Fast Shop e Carrefour como lojas acessíveis via Awin — a confirmar diretamente com a rede.

**Amazon fica fora.** A PA-API 5.0 está em descontinuação, substituída pela Creators API. Há relato de exigência de 10 vendas qualificadas em janela móvel de 30 dias, **originado em fórum e não em página oficial** — precisa ser confirmado. E a Amazon cortou comissões em até 50% em algumas categorias no fim de 2025 na APAC e em março de 2026 nos EUA; **não há registro de corte equivalente no Brasil**, o que enfraquece o argumento para o nosso mercado, mas indica a direção da política global.

**Mercado Livre e Magalu não têm API de afiliados.** No caso do Mercado Livre, a própria empresa respondeu isso em reclamação pública. Só por scraping, e o Mercado Livre reserva o direito de encerrar a participação de qualquer afiliado a seu exclusivo critério. Ficam para depois da Fase 3.

### Quatro fundações que não dá para adicionar depois

1. **`tenant_id` em toda tabela, com Row Level Security no Postgres.** O Prisma não escopa sozinho; RLS é a rede de segurança contra vazamento entre clientes.
2. **Histórico de preço gravando intervalos, não pontos.** Gravando `(preço, first_seen_at, last_seen_at)` e abrindo linha nova só quando o preço muda, o volume cai uma a duas ordens de grandeza em relação a uma linha por leitura. A magnitude exata depende de quantos SKUs monitoramos e com que frequência — parâmetros ainda a definir.
3. **Uma fila por marketplace.** Rate limit isolado — uma fila global faria um marketplace lento travar os demais.
4. **Alerta de captura zerada.** Worker que retorna zero itens por N ciclos dispara notificação.

---

## 6. Go-to-market

### Onde está o cliente no momento de comprar

A pesquisa de aquisição para micro-SaaS brasileiro na faixa de R$50 a R$250 aponta **conteúdo e SEO, comunidades e parcerias com criadores, mais programa de afiliados próprio.** Tráfego pago não fecha a conta nesse ticket — testes em B2B brasileiro partem de R$5.000 a R$8.000 por mês só para validar canal.

Nosso caso tem um momento de intenção altíssima e localizável: **alguém que acabou de perder um número de WhatsApp**, pesquisando "recuperar conta banida" ou desabafando em comunidade de afiliado. Essa pessoa não precisa ser convencida de que o problema existe.

### Sequência de aquisição

**Fase 1 — Prova social antes de vender.** A operação da sócia rodando com números medidos. Isso exige levantar a comissão histórica dela **antes** de começar, na sessão de mapeamento — sem a linha de base, não existe "antes e depois".

**Fase 2 — Conteúdo de intenção.** Artigos e vídeos respondendo às buscas de quem foi banido, explicando por que acontece. Resposta técnica honesta que termina apresentando a alternativa.

**Fase 3 — Comunidades.** Presença nos grupos onde administradores de achadinhos conversam, respondendo dúvida sobre ban e migração.

**Fase 4 — Programa de afiliados próprio.** Comissão recorrente de 20% a 30%, padrão que atrai afiliado no Brasil. Só depois que o funil converter.

### A mensagem

> *O bloqueio que você já viveu não foi azar. Ele acontece porque a ferramenta que você usa opera o WhatsApp fora da API oficial, e a plataforma detecta isso. Construímos de outro jeito.*

### A objeção que vai aparecer

"Mas meu público está no WhatsApp." Resposta: o WhatsApp continua no produto, com conteúdo pronto para o gestor publicar e alerta pessoal pela via oficial. E existe a ferramenta de migração, que leva o público para o Telegram sem deixar ninguém sem conteúdo durante a transição.

---

## 7. Modelo comercial

### Planos

| Plano | Preço | Inclui |
|---|---|---|
| **Starter** | R$57/mês | 1 canal do Telegram, curadoria manual, todas as lojas, volume limitado |
| **Pro** | R$97/mês | Piloto automático, filtros avançados, canais ilimitados, WhatsApp assistido, suporte prioritário |
| **Agência** | R$197/mês | Sub-contas por afiliado, relatórios de conversão, marca própria |

Alerta 1:1 pela Cloud API entra como add-on com custo repassado.

### Princípio de precificação

**Limite por canal e volume, nunca por número de lojas.** Há evidência de que ao menos FluxoPromo e Easyfy travam por marketplace; para os demais o critério é desconhecido.

Vantagem estrutural: como não mantemos sessão de WhatsApp conectada, **destino de WhatsApp não custa nada para nós.** Hub do Afiliado cobra R$100 por sessão e FluxoPromo cobra R$149,90 de add-on, porque cada sessão consome RAM no servidor deles.

Ressalva honesta na comparação: a sessão deles entrega disparo automático; o nosso destino ilimitado é limitado pelo tempo de um humano publicando. Não é a mesma entrega — é outra proposta, com outro perfil de risco.

### Unit economics

Premissas: ticket de R$97 e churn mensal de 3%.

| Item | Com Fator R (Anexo III) | Sem Fator R (Anexo V) |
|---|---|---|
| Receita por cliente | R$ 97,00 | R$ 97,00 |
| Gateway (Stripe, 3,9% + R$0,39) | −R$ 4,17 | −R$ 4,17 |
| Simples Nacional | −R$ 7,08 (7,3%) | −R$ 15,04 (15,5%) |
| Infra variável | −R$ 1,50 | −R$ 1,50 |
| **Margem de contribuição** | **R$ 84,25 (86,9%)** | **R$ 76,29 (78,6%)** |
| **LTV** com churn de 3% | **R$ 2.808** | R$ 2.543 |
| **CAC máximo** (3:1) | **R$ 936** | R$ 848 |

### Duas armadilhas do Fator R

**O Fator R exige folha de pelo menos 28% da receita.** Isso cria duas consequências que o modelo precisa respeitar:

*No começo,* um cenário sem pró-labore não tem folha e portanto **não tem direito ao Anexo III**. O break-even "sem pró-labore" precisa ser calculado com a alíquota do Anexo V — é o que está na seção 8.

*Na escala,* pró-labore fixo de R$6.000 sustenta o Fator R até uma receita de aproximadamente **R$21.400 por mês**. Acima disso, ou a folha aumenta ou a empresa cai no Anexo V e a margem encolhe oito pontos. No cenário otimista isso acontece por volta do sétimo mês. Não é problema — é um marco a monitorar, e está na planilha.

### Sensibilidade do churn

O benchmark de 3% ao mês é de SaaS B2B brasileiro em geral. A mesma pesquisa registra que **micro-SaaS de ticket baixo vendendo para criadores costuma ver churn de 4% a 8% ao mês** — que é exatamente o nosso perfil de cliente.

A 6% ao mês, o LTV cai de R$2.808 para R$1.404 e o CAC máximo de R$936 para R$468. **Isso não muda o break-even, mas muda quanto podemos gastar para adquirir cliente e quanto tempo levamos para chegar lá.** A planilha traz o cenário alternativo.

### Duas decisões que valem dinheiro real

**Gateway: Stripe, não Hotmart.** Sobre um ticket de R$97, Stripe custa cerca de 4,3% efetivo e Hotmart cerca de 11,4% com o player de recorrência. São 7,1 pontos — aproximadamente R$690 por mês a cada 100 clientes.

**Fator R vale a estruturação.** A diferença entre Anexo III e Anexo V é de aproximadamente R$1.740 por mês em R$20 mil de faturamento, respeitados os limites da seção anterior.

---

## 8. Estrutura de custos

### Desembolso dos 90 dias de construção

| Item | Mínimo | Máximo |
|---|---|---|
| Abertura de CNPJ e contabilidade (3 meses) | R$ 2.400 | R$ 2.400 |
| Assessoria jurídica (acordo societário e parecer) | R$ 3.000 | R$ 6.000 |
| Infraestrutura durante o desenvolvimento | R$ 180 | R$ 180 |
| Domínio, e-mail e ferramentas | R$ 450 | R$ 450 |
| Reserva para imprevistos | R$ 1.000 | R$ 1.000 |
| **Total** | **R$ 7.030** | **R$ 10.030** |

**Duas omissões que precisam ser reconhecidas:**

*Não há linha de aquisição.* O plano coloca conteúdo e SEO como canal principal, mas o orçamento assume que a produção sai da mão de obra dos sócios. Se for terceirizar qualquer parte, entra linha nova.

*Não há subsistência dos sócios.* Estes R$7 a 10 mil cobrem a empresa, não as pessoas. Três meses de custo de vida de dois a três fundadores é a maior despesa real do período, e é ela que determina se o projeto é realmente autofinanciável. **Cada sócio precisa responder como se sustenta nesses 90 dias antes da Semana 1.**

### Custo fixo mensal após o lançamento

| Item | Valor | Observação |
|---|---|---|
| VPS (aplicação, banco e workers) | R$ 150 | |
| Proxies residenciais | R$ 150 | Só necessários a partir da Fase 3, quando entrar scraping. Nos primeiros meses é zero |
| Contabilidade | R$ 300 | |
| Observabilidade e ferramentas | R$ 200 | |
| Domínio e e-mail transacional | R$ 50 | |
| **Total** | **R$ 850** | R$ 700 nos primeiros meses, sem proxies |

A infraestrutura é mais barata que a dos concorrentes porque não mantemos sessões de WhatsApp.

### Break-even

| Cenário | Regime | Clientes |
|---|---|---|
| Cobrir custo operacional, sem pró-labore | Anexo V | **12** |
| Cobrir custo + pró-labore de R$3.000 para dois sócios | Anexo III | **82** |
| Cobrir custo + pró-labore de R$5.000 para dois sócios | Anexo III | **129** |

Doze clientes para o negócio se pagar. É o número que sustenta a decisão de não buscar capital externo para a operação — lembrando que ele não cobre a subsistência dos sócios.

---

## 9. Cenários

Projeção dos 12 meses seguintes ao lançamento, com churn de 3% ao mês e ticket de R$97. Todas as premissas são ajustáveis na planilha que acompanha este documento.

| Mês | Conservador (5 novos/mês) | Base (15 novos/mês) | Otimista (35 novos/mês) |
|---|---|---|---|
| 1 | 5 | 15 | 35 |
| 3 | 15 | 44 | 102 |
| 6 | 28 | 84 | 195 |
| 12 | 51 | 153 | 357 |
| **Receita no mês 6** | **R$ 2.700** | **R$ 8.101** | **R$ 18.902** |
| **Receita no mês 12** | R$ 4.950 | R$ 14.849 | R$ 34.647 |
| **Break-even operacional** | mês 3 | mês 1 | mês 1 |
| **Break-even com pró-labore** | não atinge em 12 meses | mês 6 | mês 3 |

### Como ler isto, e o que a projeção não considera

Mesmo o cenário conservador cobre o custo de operar a partir do terceiro mês. O que separa os cenários é quando o negócio passa a remunerar os sócios — **desde que o churn real fique próximo de 3%.** A 6%, os prazos se alongam bastante e o cenário conservador deixa de ser sustentável.

Três limitações do modelo:

**Não há rampa nem trial.** O cenário base assume 15 clientes pagantes no mês 1. Se houver degustação de 7 a 14 dias, que é o padrão do nicho e converte de 10% a 25%, o mês 1 tem receita quase nula em todos os cenários e todos os prazos escorregam cerca de um mês.

**Não há falha de cobrança.** Cartão recusado é realidade em recorrência brasileira.

**As taxas de aquisição são premissa, não previsão.** Devem ser substituídas por dado real assim que os primeiros clientes entrarem.

---

## 10. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| **Mudança nas regras dos programas de afiliados** | Alto | Precedente: a Amazon cortou comissões em 2020 e ~694 mil afiliados perderam cerca de US$800 milhões; novo ciclo de cortes em APAC e EUA em 2025–2026. Mitigação: nunca depender de um marketplace |
| **Churn acima de 3%** | Alto | É a premissa mais frágil do plano. Medir desde o primeiro cliente e revisar CAC máximo mensalmente |
| **Aprovação da Shopee atrasar** | Alto no cronograma | Solicitar no dia 1. Se passar de duas semanas, antecipar Awin como primeira fonte |
| **Fricção do WhatsApp gerar churn** | Médio-alto | Ferramenta de migração, conteúdo educativo, destinos ilimitados sem custo |
| **Concorrente copiar o desconto verificado** | Médio | O fosso é temporal. A defesa é acumular histórico antes deles e transformar em marca |
| **Marketplace lançar ferramenta própria** | Médio | Histórico mostra que acontece. Diversificação de fontes |
| **Prazo em tempo parcial** | Médio | As 13 semanas do roadmap assumem dedicação alta. Em tempo parcial, o número honesto é 22 a 30 semanas |
| **Sociedade sem acordo escrito** | Alto | Resolver antes da Semana 1 |

---

## 11. Roadmap de 90 dias

| Fase | Período | Entregas |
|---|---|---|
| **0 — Fundação** | Semana 1 | Solicitar credencial da Shopee. Abrir CNPJ com estrutura de Fator R. Fechar acordo societário. Docker, Postgres, Redis e schema multi-tenant com histórico de preço |
| **1 — Pipeline vertical** | Semanas 2–4 | Shopee via API → histórico de preço → desconto verificado → fila → publicação no Telegram |
| **2 — Curadoria e WhatsApp** | Semanas 5–7 | Painel de curadoria em 1 clique. Conteúdo e links para WhatsApp. Awin como segunda fonte |
| **3 — Automação e alpha** | Semanas 8–10 | Piloto automático com filtros. Alerta 1:1 pela Cloud API. Onboarding de credenciais. Alpha com a rede da sócia |
| **4 — Lançamento** | Semanas 11–13 | Billing com Stripe. Ferramenta de migração de audiência. Conteúdo de aquisição publicado. Abertura de vendas |

**Caminho crítico:** aprovação da Shopee (manual, prazo não publicado) e acordo societário. Ambos começam no primeiro dia e não dependem de código.

---

## 12. Time e responsabilidades

| Frente | Responsável | Escopo |
|---|---|---|
| Backend e infraestrutura | Sócio técnico | Workers, fila, integrações, deploy, decisões de arquitetura |
| Produto, frontend e comercial | Emanuel | Painel, onboarding, precificação, conteúdo, relação com plataformas |
| Validação e operação | Sócia da rede | Uso real desde a Fase 1, feedback semanal, medição de comissão antes e depois |

### Pendência societária

**LTDA com contrato social** registrado, incluindo a cláusula do Marco Legal das Startups (LC 182/2021), mais **acordo de quotistas** privado, onde entram vesting, deadlock, propriedade intelectual e dedicação mínima.

Vesting padrão de 4 anos com cliff de 12 meses. Para a sócia que entra com acesso a mercado, o modelo usual é 5% a 10% de equity direto mais advisory ou phantom shares atreladas a metas.

Vesting não tem lei própria no Brasil; é contrato atípico, executável, mas com reflexos trabalhistas e tributários que exigem advogado societário.

**Isto precisa estar assinado antes da primeira linha de código.**

---

## 13. Próximos 14 dias

1. **Solicitar credencial da Shopee Open API.** Maior incerteza do caminho crítico e não depende de nós.
2. **Fechar o acordo societário** com advogado.
3. **Abrir CNPJ** com contador, estruturando pró-labore para o Fator R.
4. **Sessão de mapeamento com a sócia** — reconstruir o dia de operação dela minuto a minuto **e levantar a comissão histórica**, que é a linha de base sem a qual não existe prova social.
5. **Definir os cinco parâmetros do modelo de dados**: janela de deduplicação, faixa de preço que caracteriza oferta nova, mínimo de observações para verificar desconto, retenção de cliques e frequência de recálculo.
6. **Cada sócio responder como se sustenta nos 90 dias.**

---

## Anexo — Premissas frágeis, em ordem de risco

1. **Churn de 3% ao mês.** Benchmark de B2B em geral; o nosso segmento pode ficar entre 4% e 8%. É a premissa que mais afeta o resultado.
2. **Aquisição de 5, 15 ou 35 clientes por mês.** Estimativa pura. Os primeiros 60 dias de conteúdo dirão qual cenário é real.
3. **Mercado endereçável.** Não há dado de afiliados ativos nem de disposição a pagar.
4. **Ticket médio de R$97.** Assume o plano Pro como carro-chefe, ainda não validado.
5. **Limite de 8 membros da Groups API da Meta.** Sustenta a arquitetura; confirmar na fonte primária.
6. **Preço da Cloud API.** De agregadores de mercado, não da tabela oficial da Meta.
7. **Exigência de 10 vendas da Amazon PA-API.** Originada em fórum, não em documentação oficial.
8. **Prazo de aprovação da Shopee.** Material de terceiros menciona 5 a 15 dias; a empresa não publica.
9. **Custo de assessoria jurídica.** Faixa ampla, depende do escritório.
10. **Preços de sete dos onze concorrentes.** Vieram de comparativos de terceiros, não das páginas oficiais.
