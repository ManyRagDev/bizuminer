# Prompts de pesquisa — Perplexity

Oito pesquisas, em ordem de prioridade. As três primeiras destravam decisões imediatas; as demais alimentam o plano de negócio.

Cada prompt já pede fonte, data e sinalização de incerteza — sem isso o Perplexity mistura dado oficial com estimativa de blog e você não tem como distinguir.

**Dica de uso:** rode no modo de pesquisa profunda quando disponível, e sempre que um número for usar no deck, abra a fonte citada e confirme. O Perplexity acerta muito, mas erra em número específico com confiança total.

---

## 1. Tamanho e dinâmica do mercado (prioridade alta)

```
Preciso de um panorama atualizado (2025 e 2026) do mercado brasileiro de marketing de
afiliados voltado a e-commerce, especialmente o segmento de "achadinhos" e canais de
ofertas.

Levante:
1. Número de afiliados cadastrados nos programas brasileiros de Amazon Associados,
   Shopee Affiliate, Mercado Livre Afiliados, Parceiro Magalu e AliExpress, e a taxa
   de crescimento de cada um.
2. Volume estimado de GMV ou receita originada por afiliados no e-commerce brasileiro.
3. Faixas de comissão praticadas por categoria de produto em cada programa.
4. Qualquer dado específico sobre o subsegmento de grupos e canais de ofertas no
   WhatsApp e Telegram: número de canais, tamanho médio, taxa de engajamento.
5. Tendências de 2026 que afetem esse mercado — mudanças em programas de afiliados,
   políticas de plataforma, comportamento do consumidor.

Para cada número, informe a fonte e a data de publicação. Marque explicitamente quais
são dados oficiais das empresas e quais são estimativas de terceiros. Se não houver
dado confiável para algum item, diga isso em vez de estimar.
```

---

## 2. Compliance dos programas e política do WhatsApp (prioridade máxima)

> Esta é a pesquisa mais importante da lista. Se a resposta for restritiva, ela muda o produto — não só o roadmap.

```
Estou desenvolvendo uma ferramenta SaaS que monitora ofertas de e-commerce, injeta a
tag de afiliado do próprio cliente nos links e publica automaticamente em canais de
WhatsApp e Telegram.

Preciso saber, com base nos termos de uso vigentes:

1. Os termos do Programa de Associados da Amazon Brasil permitem distribuição
   automatizada em massa de links de afiliado via WhatsApp e Telegram? Existe cláusula
   sobre uso de ferramentas de terceiros ou automação? Cite a cláusula.
2. Mesma pergunta para Shopee Affiliate Brasil, Mercado Livre Afiliados e Parceiro
   Magalu.
3. Algum desses programas proíbe explicitamente o uso de APIs ou scraping para
   monitorar preços com fins de divulgação automatizada?
4. A política de mensageria do WhatsApp Business e os termos do WhatsApp pessoal
   tratam de envio automatizado em massa de forma diferente para: grupos comuns,
   Comunidades e Canais? Onde exatamente está o limite que gera banimento?
5. Existem casos documentados de afiliados ou ferramentas banidos por esse tipo de
   uso? O que aconteceu e por quê?

Cite o documento e a seção específica de cada termo, com link. Se algum ponto for
área cinzenta sem regra explícita, diga isso claramente em vez de interpretar.
```

---

## 3. Capacidade real das APIs oficiais (prioridade alta)

> Substitui parte do spike técnico de dois dias. Se a API já entregar preço em tempo real, boa parte da complexidade de scraping desaparece.

```
Preciso da capacidade técnica real das APIs de afiliados disponíveis no Brasil, para
decidir arquitetura de um sistema de monitoramento de preços.

Para cada um dos itens abaixo, informe: se a API existe e está aberta, requisitos de
elegibilidade, o que ela retorna, limites de requisição e se há feed de ofertas ou
promoções:

1. Shopee Affiliate Open API Brasil — endpoints, autenticação, se retorna preço atual
   e histórico, se há endpoint de ofertas relâmpago.
2. Mercado Livre — API de produtos e programa de afiliados, o que está disponível
   publicamente.
3. Amazon Product Advertising API 5.0 — confirmar os requisitos de acesso (número de
   vendas qualificadas necessárias, regra de manutenção do acesso) e os limites de
   requisição por segundo e por dia, incluindo como esses limites escalam.
4. Magazine Luiza e AliExpress — existe API de afiliado no Brasil?
5. Redes agregadoras como Awin, Rakuten e Lomadee — o que oferecem de API e quais os
   requisitos de entrada.

Priorize documentação oficial das plataformas. Informe a data da documentação
consultada, porque essas APIs mudam com frequência.
```

---

## 4. Concorrência aprofundada

```
Faça uma análise competitiva detalhada destas ferramentas brasileiras de automação de
ofertas para afiliados: Shozap, FluxoPromo, DivulgaLinks, DivulgaNinja, Hub do
Afiliado, Achadinhos Pro, ProAfiliados, TrocaLink, Linqor, Easyfy e IA Divulgadora.

Para cada uma, levante o que estiver disponível:
1. Preços atuais e o que cada faixa inclui.
2. Funcionalidades, com atenção a: quais marketplaces integram, se fazem curadoria
   própria ou espelhamento de grupos de terceiros, se validam desconto real via
   histórico de preço, e como tratam WhatsApp.
3. Tamanho estimado: número de clientes, tempo de mercado, tamanho do time, CNPJ.
4. Reclamações e crítica de usuários — Reclame Aqui, avaliações de app, comentários
   em YouTube e TikTok, grupos de afiliados, Reddit. Quais problemas aparecem
   repetidamente?
5. Como cada uma adquire cliente: influenciador, SEO, programa de afiliados, tráfego
   pago.

No final, sintetize: quais dores dos usuários aparecem em mais de uma ferramenta e
seguem sem solução? Essa lista é o que mais me interessa.
```

---

## 5. Cenários de risco de plataforma

```
Quero entender o risco histórico de negócios que dependem de programas de afiliados
de grandes marketplaces.

Levante casos concretos, com datas e desdobramentos:
1. Mudanças abruptas em taxas de comissão de programas de afiliados — o corte da
   Amazon em 2020, e casos posteriores no Brasil e no mundo. Qual foi o impacto em
   negócios que dependiam desses programas?
2. Casos de encerramento, restrição ou mudança de regra de programas de afiliados que
   inviabilizaram ferramentas ou operações de terceiros.
3. Ondas de banimento ou aperto de fiscalização do WhatsApp contra automação e envio
   em massa — quando ocorreram, o que motivou, e como as ferramentas afetadas
   reagiram.
4. Casos de marketplaces que lançaram ferramenta própria de automação e deslocaram
   fornecedores terceiros do mercado.
5. Que estratégias de mitigação as empresas sobreviventes adotaram? Diversificação de
   marketplace, mudança de canal, pivô de produto?

Priorize casos com números e datas verificáveis, não análise genérica de risco.
```

---

## 6. Go-to-market de micro-SaaS brasileiro em 2026

```
Como micro-SaaS brasileiros voltados a empreendedores digitais e criadores de conteúdo
adquirem clientes em 2025 e 2026, na faixa de ticket de R$50 a R$250 por mês?

Levante, com números e casos reais quando possível:
1. Canais de aquisição que efetivamente funcionam nessa faixa de ticket no Brasil:
   parceria com criadores, programa de afiliados próprio, SEO de conteúdo,
   comunidades, tráfego pago. Qual o custo e a eficácia relativa de cada um?
2. Benchmarks de CAC e LTV para SaaS B2B brasileiro nesse ticket.
3. Taxas de conversão típicas de plano gratuito para pago, e de trial para pago.
4. Churn mensal médio nessa categoria — e o que os que retêm melhor fazem de
   diferente.
5. Casos brasileiros documentados de micro-SaaS que chegaram a receita relevante nos
   últimos dois anos: o que fizeram nos primeiros seis meses?
6. O papel de programa de afiliados próprio como motor de crescimento — comissões
   típicas e resultados observados.

Distinga claramente dado brasileiro de dado do mercado americano, porque as métricas
divergem bastante.
```

---

## 7. Estrutura de custos e necessidade de capital

```
Preciso montar a estrutura de custos real de um SaaS brasileiro que roda automação de
WhatsApp e Telegram com scraping e integração de APIs de e-commerce.

Levante custos atuais (2026), em reais quando possível:
1. VPS: consumo de RAM por instância de WAHA ou biblioteca equivalente de WhatsApp
   (Baileys, Venom, Puppeteer). Quantas sessões simultâneas cabem em servidores de 8,
   16 e 32 GB? Preço atual de VPS na Hetzner, Contabo, DigitalOcean e provedores
   brasileiros.
2. Proxies residenciais brasileiros: provedores, modelo de cobrança e custo por GB ou
   por IP.
3. Gateways de pagamento com assinatura recorrente no Brasil — Asaas, Pagar.me,
   Stripe Brasil, Hotmart, Kirvano: taxas, custo de recorrência e taxa de falha de
   cobrança.
4. Carga tributária para SaaS: MEI, Simples Nacional por anexo, ISS sobre software.
   Qual regime faz sentido em cada faixa de faturamento?
5. Quanto custa, na prática, operar 100 clientes ativos com WhatsApp conectado?

Ao final, avalie: nessa estrutura de custo, um SaaS assim consegue se financiar por
bootstrapping ou precisa de capital inicial? Qual o padrão observado em negócios
brasileiros semelhantes?
```

---

## 8. Estruturação societária entre sócios

```
Três sócios vão construir juntos um SaaS no Brasil, com contribuições de naturezas
diferentes: um entra com capital e gestão de produto, um com desenvolvimento técnico,
e uma com acesso a mercado e uma rede de clientes já existente que valida o produto.

Preciso entender como estruturar isso na prática, no contexto jurídico brasileiro em
2025 e 2026:
1. Como se divide participação societária quando as contribuições são de naturezas
   diferentes — dinheiro, trabalho técnico e acesso a mercado? Que métodos ou
   frameworks são usados na prática?
2. Como funciona vesting e cliff em sociedade brasileira? É juridicamente executável
   em contrato social ou acordo de quotistas?
3. Diferença prática entre contrato social e acordo de quotistas: o que deve estar em
   cada um?
4. Como formalizar a participação de um sócio que contribui com validação, audiência
   ou rede de clientes em vez de capital ou código? Existe modelo consolidado?
5. Cláusulas essenciais que evitam conflito depois: saída, diluição, deadlock,
   dedicação mínima, propriedade intelectual do código.
6. Erros mais comuns em acordo entre sócios de startup brasileira, e casos concretos
   de sociedade que quebrou por falha contratual.

Foque em prática brasileira, citando legislação e modelos usados por startups no
Brasil. Se algum ponto exigir advogado, diga isso.
```

---

## Ordem sugerida

Rode 2 e 3 primeiro. Elas podem mudar o produto e a arquitetura, e não faz sentido detalhar mercado antes de saber se a operação é permitida e o que as APIs entregam.

Depois 1 e 4, que alimentam o posicionamento. Em seguida 7 e 8, que são decisões de estruturação. Por último 5 e 6, que informam estratégia de médio prazo.
