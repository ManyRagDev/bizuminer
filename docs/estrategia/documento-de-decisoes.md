# Documento de Decisões

**Triagem das oito pesquisas — julho de 2026**

Cada item abaixo é uma decisão, não um resumo. Três baldes: o que muda o produto, o que muda o roadmap, o que apenas confirma.

---

## Correções ao que dissemos antes

Três afirmações anteriores não sobreviveram à pesquisa. Registro para que ninguém decida com base nelas.

| Afirmação anterior | O que a pesquisa mostrou |
|---|---|
| Canais e Comunidades do WhatsApp são seguros porque o envio é unilateral | Os termos do WhatsApp **não distinguem** grupos, Comunidades e Canais. A proibição de "mensagens automáticas ou em massa" vale para qualquer produto WhatsApp |
| A Amazon PA-API exige 3 vendas qualificadas | São **10 vendas em pedidos distintos, em janela móvel de 30 dias**. E a PA-API 5.0 está sendo descontinuada, substituída pela Creators API |
| Shopee e Mercado Livre primeiro, por terem API | O Mercado Livre **não tem API de afiliados** — confirmado pela própria empresa em resposta pública no ReclameAqui |

---

# BALDE A — Muda o produto

## A1. O componente central da arquitetura é o que o WhatsApp processa judicialmente

Este é o achado mais importante das oito pesquisas.

**O que foi encontrado:**

- Ferramentas que fazem engenharia reversa do protocolo do WhatsApp — **Baileys, whatsmeow, Evolution API, WAHA, Venom** — têm vida útil típica de **2 a 8 semanas** antes de detecção e banimento do número. A regra prática citada: se exige leitura de QR Code, é não-oficial e está sujeita a ban.
- Desde 7 de dezembro de 2019, o WhatsApp declara que toma **ações legais** contra quem pratica *ou facilita* envio automatizado em massa — inclusive com base em evidência fora da plataforma.
- A plataforma banía cerca de **2 milhões de contas por mês** por comportamento automatizado já na época do anúncio.
- O WhatsApp **já processou empresas brasileiras** por vender exatamente esse serviço: Autland, VB Marketing, SallApp e Yacows, com liminares proibindo a oferta sob pena de multa.
- A Política de Mensagens do WhatsApp Business: *"Se você usa ou trabalha com um serviço que usa o WhatsApp e viola nossos termos, como enviar mensagens em massa de forma não autorizada, temos o direito de restringir ou remover seu acesso."*

**Por que isso é diferente do risco que já tínhamos mapeado:**

No deck, "banimento de número" aparece como risco operacional — algo que gera suporte e churn, mitigável com delays e spintax. A pesquisa mostra que a exposição não é do cliente, é **nossa**: o precedente brasileiro é de ação judicial contra o fornecedor da ferramenta, não contra quem a usa.

Delays, spintax e simulação de digitação não mitigam isso. Reduzem a chance de detecção; não alteram a natureza da atividade.

**O que os concorrentes fazem:** todos os onze operam nessa zona. É informação relevante sobre a norma do mercado — não é proteção jurídica, e não foi testada em juízo contra nenhum deles.

**A decisão que precisa ser tomada agora — as três opções:**

**Opção 1 — Telegram como produto, WhatsApp pela API oficial.**
Telegram Bot API é oficial, gratuita e sem risco de ban; suporta todo o pipeline. WhatsApp entra via Cloud API oficial, com opt-in e templates aprovados. Custo maior por mensagem e fricção de onboarding, mas zero exposição jurídica. Diferenciação possível: ser a única ferramenta do nicho que não coloca o cliente e a empresa em risco.

**Opção 2 — WAHA como conexão do próprio cliente.**
O cliente conecta o número dele, por conta e risco, com termos de uso que deixam a responsabilidade explícita. É o modelo dos onze concorrentes. Mantém o produto competitivo em features e mantém a exposição — o precedente Autland/VB Marketing é justamente contra quem oferece a infraestrutura.

**Opção 3 — Híbrido.** Telegram e WhatsApp Cloud API no produto principal; WAHA como integração opcional que o cliente instala e opera na infraestrutura dele. Reduz exposição sem abrir mão do público que quer WhatsApp barato.

**Recomendação:** opção 3, com a opção 1 como padrão da interface. E, dado que existe precedente judicial concreto no Brasil, essa decisão merece uma consulta a advogado antes de qualquer linha de código de WhatsApp — não depois.

---

## A2. A Shopee resolve quase todo o produto por API — e proíbe scraping

**A API existe, é brasileira, e é melhor do que esperávamos.** Shopee Affiliate Open API, GraphQL, em `open-api.affiliate.shopee.com.br/graphql`, autenticação HMAC-SHA256.

Operações disponíveis:

| Operação | O que entrega |
|---|---|
| `productOfferV2` | Produtos com `priceMin`, `priceMax`, `priceDiscountRate`, `commissionRate`, `sales`, `ratingStar` |
| `shopeeOfferV2` | Campanhas e ofertas especiais, **incluindo ofertas flash**, com `periodStartTime` e `periodEndTime` |
| `generateShortLink` | Shortlink com tracking e até 5 `subIds` para atribuição |
| `listItemFeeds` | Catálogo em massa, modo `FULL` ou `DELTA` |
| `conversionReport` / `validatedReport` | Cliques, pedidos, comissão estimada e validada |

Isso cobre captura, afiliação, detecção de promoção e relatório de conversão. Sem uma linha de scraping.

**Duas ressalvas:**
- Não há campo de histórico de preço. Os valores são o preço atual na consulta — confirmando que **precisamos persistir snapshots**. A fundação `price_history` do slide 8 é o que transforma essa API no nosso diferencial.
- Não há limite numérico publicado. O código de erro `10030` sinaliza rate limit; a cadência precisa ser calibrada empiricamente com backoff exponencial.

**E a proibição:** a Seção 4.3(d) dos Termos de Afiliados da Shopee proíbe *"qualquer meio ou forma automatizada de sucateamento, ou outros métodos de extração de dados"*. **Scraping na Shopee está fora.** Não é área cinzenta — é cláusula expressa.

**Decisão:** Shopee é a primeira integração, exclusivamente por API oficial. O worker de scraping não toca a Shopee.

---

## A3. Amazon sai do roadmap de curto prazo

Três fatos que se acumulam:

1. **PA-API 5.0 em descontinuação**, substituída pela Creators API. Integrar hoje é construir sobre algo que a Amazon já sinalizou que vai desligar.
2. **Acesso exige 10 vendas qualificadas em janela móvel de 30 dias** — e a manutenção do acesso depende de continuar vendendo via links de API. É uma trava recorrente, não só de entrada.
3. **A Amazon cortou comissões em até 50%** em algumas categorias entre o fim de 2025 e março de 2026, removeu bônus por metas e reduziu a granularidade dos relatórios. Publishers projetam receita ~50% menor em 2026.

**Decisão:** Amazon sai da Fase 4 e vira "reavaliar quando a Creators API estiver documentada". Não vale queimar prazo numa API em fim de vida, com trava de acesso recorrente e comissão em queda.

---

# BALDE B — Muda o roadmap

## B1. Nova ordem de integração

O Mercado Livre não tem API de afiliados; o Magalu também não. Ambos só por scraping — e o Mercado Livre reserva o direito de encerrar a participação de qualquer afiliado "a qualquer tempo e a seu exclusivo critério".

A ordem que faz sentido agora:

| Ordem | Fonte | Por quê |
|---|---|---|
| 1º | **Shopee** | API completa, nativa BR, 5 milhões de afiliados cadastrados no país |
| 2º | **Awin** | Tem `Offers API` com feed de ofertas. **Uma integração dá acesso a Kabum, Casas Bahia, Americanas, Centauro e dezenas de outras** |
| 3º | **AliExpress** | Affiliate API oficial via Open Platform, ~5.000 requisições/dia |
| 4º | **Lomadee** | Rede brasileira, API REST com `x-api-key`, campanhas e marcas |
| 5º | Mercado Livre / Magalu | Só scraping. Avaliar depois, com o risco de descredenciamento em mente |
| — | Amazon | Aguardar a Creators API |

**A mudança de maior impacto é a Awin.** Integrar uma rede agregadora entrega dezenas de lojas pelo custo de uma integração. É o oposto da estratégia loja a loja do documento original, e resolve o problema de cobertura sem multiplicar o custo de manutenção.

## B2. A infraestrutura custa muito menos do que assumimos

Benchmarks oficiais do WAHA, por engine:

| Engine | Consumo por sessão | 100 sessões |
|---|---|---|
| WEBJS (Chromium) | 250–400 MB | ~20–30 GB |
| **NOWEB (sem browser)** | **60–80 MB** | **8 GB** |

Um Hetzner CX42 (16 GB, ~R$96/mês) comporta cerca de 200 sessões NOWEB.

Custo total mensal para **100 clientes com WhatsApp conectado**, receita de R$20.000/mês:

| Item | Custo |
|---|---|
| 2 VPS de 16 GB | R$ 190–220 |
| Proxies residenciais BR (30–50 GB) | R$ 150–500 |
| Gateway (Stripe) | ~R$ 819 |
| Contabilidade e ferramentas | R$ 300–700 |
| Simples Anexo III (com Fator R) | ~R$ 1.500 |
| **Total** | **R$ 3.000–3.700** |

Margem bruta de 80–85%.

**Decisão:** engine NOWEB, não WEBJS. E **o projeto não precisa de investimento externo.** Bootstrapping é viável e é o padrão observado nessa categoria. Capital externo só faz sentido para acelerar aquisição depois do product-market fit — não para colocar a infra de pé.

## B3. Fator R vale nove pontos de margem

Simples Nacional, receita de R$240 mil/ano:

- **Anexo III** (folha ≥ 28% da receita): carga efetiva **7–8%** → DAS ~R$1.500/mês
- **Anexo V** (folha baixa): carga efetiva **16%** → DAS ~R$3.200/mês

**Decisão:** estruturar pró-labore desde o início para atingir o Fator R. É uma decisão contábil que vale R$1.700/mês já em R$20 mil de faturamento — e que fica difícil de corrigir retroativamente.

## B4. Trocar o gateway

O documento original citava Hotmart. Comparação para assinatura de R$200:

| Gateway | Custo efetivo |
|---|---|
| **Stripe Brasil** | 3,9% + R$0,39 → ~4,1% |
| Pagar.me | ~4,9% |
| Asaas | ~5,2% |
| Kirvano | ~8,5% |
| **Hotmart** | **~10,7%** |

**Decisão:** Stripe ou Asaas. Hotmart é feito para infoproduto; num SaaS puro custa 6,6 pontos de receita bruta a mais.

---

# BALDE C — Confirma o que já pensávamos

**C1. A lacuna do desconto verificado é real.** A pesquisa competitiva, feita de forma independente, concluiu: *"Nenhuma ferramenta analisada oferece validação automática de histórico de preço para garantir que a promoção é real."* Era hipótese; virou achado. E aparece como a primeira das oportunidades de diferenciação listadas pela própria pesquisa.

**C2. Anti-ban é a dor número 1 dos usuários** — citada em Shozap, Achadinhos Pro, DivulgaNinja e ProAfiliados. Conecta diretamente com A1: a dor que mais aparece é a que ninguém resolve, porque a causa raiz não é técnica, é a natureza da operação.

**C3. O mercado é maior do que o deck diz.** Shopee tem **mais de 5 milhões de afiliados cadastrados no Brasil** (dado oficial, reafirmado em julho de 2026). Mercado Livre cresceu **324% em afiliados cadastrados** entre Q3/2020 e Q3/2024. Comissões: Amazon 7–13%, Shopee 3–15%, Mercado Livre 7–16%.

**C4. O go-to-market confirma o que os concorrentes já mostravam.** SEO e conteúdo, comunidades e parcerias com criadores, mais programa de afiliados próprio com 20–30% recorrente. Tráfego pago não fecha a conta nesse ticket. Com ticket de R$150, margem de 70% e churn de 3%, o LTV é ~R$3.500 e o **CAC máximo sustentável fica entre R$875 e R$1.100**. Trial converte cerca do dobro de freemium.

**C5. Estrutura societária.** LTDA com contrato social registrado (incluindo a cláusula do Marco Legal das Startups, LC 182/2021) mais acordo de quotistas privado. Vesting de 4 anos com cliff de 12 meses é o padrão. Para a sócia que entra com acesso a mercado: **5–10% de equity direto mais advisory ou phantom shares atreladas a metas** — faturamento originado pela rede dela, contratos assinados. Vesting não tem lei própria no Brasil; é contrato atípico, executável, mas exige advogado societário pelos reflexos trabalhistas e tributários.

---

# Roadmap revisado

| Fase | Prazo | Escopo |
|---|---|---|
| **0** | Semana 1 | Decisão sobre WhatsApp (A1) com parecer jurídico. Solicitar credenciais da Shopee Open API — aprovação manual leva 5 a 15 dias. Docker, Postgres, Redis, schema multi-tenant com `price_history` |
| **1** | Semanas 2–3 | Pipeline vertical completo: Shopee via API → `price_history` → desconto verificado → fila → Telegram |
| **2** | Semanas 4–5 | Painel de curadoria em 1 clique. Awin como segunda fonte (dezenas de lojas numa integração) |
| **3** | Semanas 6–7 | Camada de WhatsApp conforme a decisão A1. Piloto automático com filtros. Alpha com a rede da sócia |
| **4** | Semana 8+ | AliExpress e Lomadee. Billing com Stripe. Programa de afiliados próprio |
| — | Reavaliar | Amazon, quando a Creators API estiver documentada |

**Mudança de caminho crítico:** a aprovação da Shopee Open API leva de 5 a 15 dias e é manual. Solicitar no dia 1 da Semana 1, antes de qualquer código.

---

# Decisões pendentes — só vocês três podem tomar

1. **A camada de WhatsApp** (A1). É a decisão de maior consequência do projeto. Recomendo consulta jurídica antes de escolher.
2. **Divisão societária e vesting**, com a estrutura da C5 como base.
3. **Pró-labore para o Fator R** (B3) — decidir com contador antes de abrir o CNPJ.
4. **Prazo real de dedicação.** As 7 semanas assumem dedicação alta da dupla técnica. Em tempo parcial, são 12 a 16.

---

## O que atualizar no deck

Slides que ficaram desatualizados: **5 e 6** (arquitetura e stack, conforme a decisão A1), **7** (Amazon e Mercado Livre saem da ordem de integração), **9** (roadmap acima), **11** (a mitigação de ban por Canais não se sustenta) e **12** (gateway e Fator R).
