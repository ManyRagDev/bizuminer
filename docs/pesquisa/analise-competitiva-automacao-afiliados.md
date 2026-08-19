# Análise Competitiva — Automação de Ofertas para Afiliados (Brasil)

**Data:** julho de 2026
**Objetivo:** avaliar o cenário competitivo antes de decidir construir o SaaS descrito no Plano Estratégico.
**Método:** levantamento dos players ativos a partir dos sites oficiais e de material comparativo público do nicho. Preços e recursos refletem o que cada fabricante divulga e podem mudar.

---

## 1. Conclusão em uma página

O nicho **não é uma oportunidade aberta — é um mercado consolidado** com pelo menos 10 concorrentes ativos, alguns com CNPJ, checkout Stripe, programa de afiliados próprio e mais de 10.000 usuários declarados.

Três constatações que mudam a decisão:

**O produto do plano já existe, pronto, na faixa de R$50 a R$150/mês.** O Shozap entrega hoje: três modos de disparo (automático, manual, espelhado), IA para texto e imagem, múltiplas instâncias de WhatsApp com rotação anti-ban, extensão de Chrome para adicionar produto em 1 clique, cinco marketplaces, Instagram, Link Bio, landing pages e loja própria. É um superconjunto do MVP planejado.

**A faixa de preço do plano é exatamente a do mercado.** O documento propõe R$57 / R$97 / R$197. O FluxoPromo pratica R$37 / R$97 / R$197. A coincidência valida seu instinto comercial e, ao mesmo tempo, elimina preço como alavanca — não há margem para entrar por baixo quando já existe camada gratuita.

**Existe camada gratuita.** FluxoPromo (20 ofertas/dia, 3 lojas, 1 canal) e ProAfiliados (bot completo) são grátis. Para um entrante sem marca, isso corrói o topo do funil inteiro.

**Recomendação:** assinar uma ferramenta existente e investir o tempo dos dois desenvolvedores nas operações de afiliado. O retorno está na comissão, não na mensalidade — e a comissão pode começar nesta semana, não em três meses.

---

## 2. Panorama do mercado

| Ferramenta | Canais | Lojas | Preço mensal | Grátis |
|---|---|---|---|---|
| **Shozap** | WhatsApp, Telegram, Instagram | 5 (Shopee, ML, Amazon, Magalu, Shein) | ~R$50–150 | Cadastro grátis |
| **FluxoPromo** | Telegram, WhatsApp (add-on) | 12 | R$37 / 97 / 197 + R$149,90 WhatsApp | Sim — 20 ofertas/dia |
| **DivulgaLinks** | WhatsApp, Telegram, Instagram | 15+ programas | R$69,90 / 129,90 / 169,90 | Trial 7–14 dias |
| **Hub do Afiliado** | Telegram (PromoBot), WhatsApp (ZapSync) | Amazon, Shopee, ML, Magalu, AliExpress, rede Awin | R$97 / 297 / 497 (metade nos 3 primeiros meses) + R$100/sessão WhatsApp | Garantia 7 dias |
| **Achadinhos Pro** | WhatsApp | Shopee, ML, Amazon | Não divulgado | Trial 7 dias sem cartão |
| **DivulgaNinja** | WhatsApp, Telegram, Instagram | — | A partir de R$49,90 | — |
| **ProAfiliados** | WhatsApp, Telegram | — | **Grátis** (plano base) | Sim |
| **TrocaLink** | WhatsApp, Telegram | — | Sob consulta | — |
| **Linqor** | WhatsApp, Telegram | — | Sob consulta | — |
| **Easyfy** | WhatsApp, Telegram | — | Sob consulta | — |
| **IA Divulgadora** | Vários marketplaces | — | Sob consulta | — |

**Faixa de preço consolidada do mercado: R$0 a R$250/mês.** Exatamente onde o plano pretendia entrar.

---

## 3. Os concorrentes que importam

### Shozap — o mais completo
Cobre WhatsApp, Telegram e Instagram com três modos de operação. Além do core, entrega Link Bio, landing pages com editor drag-and-drop, loja própria, cupons, follow-ups com IA, agendamento com fuso horário, extensão para Chrome e Firefox, link redirecionador que distribui membros entre grupos cheios, e IA de texto *e* imagem (menciona GPT-4, Claude, Gemini e Llama, com tokens inclusos). Programa de afiliados próprio com 30% recorrente.

**Por que importa:** é o benchmark. Qualquer conversa sobre construir o produto do plano precisa explicar o que se faria melhor que isso.

### FluxoPromo — o mais agressivo comercialmente
12 lojas, camada gratuita real, garantia de 7 dias, checkout Stripe, e uma máquina de SEO relevante — dezenas de artigos, comparativos "FluxoPromo vs [concorrente]", calculadora de ganhos, páginas por marketplace. Prova social com prints de comissão (R$10.501 em fevereiro, R$4.566 na Magalu).

**Por que importa:** define o preço de referência do nicho e domina a busca orgânica. Um entrante disputaria atenção com quem já ocupa a primeira página.

### DivulgaLinks — o de maior base declarada
10.000+ afiliados ativos, 1M+ posts criados. Forte em Instagram (artes automáticas para Feed e Stories, respostas automáticas em comentários e direct), site próprio para o afiliado, e monitoramento de grupos de terceiros. Distribuição via criadores no YouTube e TikTok com vídeos de dezenas de milhares de views.

**Por que importa:** mostra que o canal de aquisição do nicho é influenciador, não outbound. O plano previa prospecção ativa de admins de canais — o mercado real é vencido com conteúdo e afiliados.

### Hub do Afiliado — o mais caro, e o mais informativo
Ecossistema de quatro produtos vendidos separadamente. Tem CNPJ público, garantia de preço por 12 meses e desconto de fundador.

**Por que importa:** é o único que expõe claramente o custo do WhatsApp — **R$100/mês por sessão (número conectado), com teto de 10 grupos por sessão.** O FluxoPromo confirma com um add-on de R$149,90. Isso valida diretamente a correção de precificação sugerida no brief: o custo real é a instância, não o número de lojas. E revela que ninguém no mercado conseguiu tornar o WhatsApp barato.

### ProAfiliados — o problema estrutural
Bot gratuito de WhatsApp e Telegram com "Feed Global P2P", onde afiliados compartilham ofertas entre si.

**Por que importa:** existe uma opção gratuita e funcional. Qualquer plano Starter pago disputa com o grátis.

---

## 4. O que virou commodity

Estes recursos aparecem em três ou mais concorrentes. Nenhum deles é diferencial — são o piso de entrada:

- Captura automática de ofertas multi-marketplace
- Injeção da tag de afiliado do próprio usuário (100% da comissão para o cliente)
- Disparo automático em Telegram e WhatsApp
- Anti-duplicação de ofertas
- Delays aleatórios e throttle anti-ban
- Encurtador com rastreio de cliques
- Agendamento e horários otimizados
- Templates de mensagem
- Dashboard de cliques
- Geração de copy com IA
- Programa de afiliados interno (30% recorrente)
- Espelhamento de grupos de terceiros

**Praticamente todo o escopo core do Plano Estratégico está nesta lista.**

---

## 5. Onde ainda há espaço real

Três lacunas legítimas apareceram na pesquisa. Registro por honestidade intelectual — mas nenhuma delas, sozinha, justifica construir uma plataforma inteira.

**Ninguém valida se o desconto é real.** Todos capturam "ofertas"; nenhum menciona histórico de preço por SKU ou detecção de preço inflado antes do desconto. Um afiliado que anuncia desconto falso queima credibilidade com o público. Este era um dos pontos do seu documento e continua sem dono no mercado.

**Todo mundo espelha as mesmas ofertas.** Como a maioria opera por espelhamento de grupos-fonte, os canais recebem os mesmos produtos. O resultado é saturação: o público vê a oferta repetida em cinco grupos e para de clicar. O Achadinhos Pro ataca isso com "garimpo original por IA" — é o único que reconhece o problema publicamente, o que sugere que ainda é uma dor viva.

**Ninguém atende agência de verdade.** Não há oferta clara de multi-tenancy ou white-label para quem gere a operação de vários afiliados terceiros. É um mercado menor, mas desocupado — e o único onde o ticket suportaria um produto novo.

---

## 6. Comprar vs. construir: a matemática

**Custo de assinar (duas operações — você e a sócia):**

| Item | Mensal |
|---|---|
| 2 assinaturas de plano intermediário (~R$100 cada) | R$200 |
| WhatsApp adicional, se necessário | R$100–150 |
| **Total** | **~R$300–350/mês** |

**Custo de construir:**

| Item | Valor |
|---|---|
| 2 desenvolvedores × 3 meses (custo de oportunidade a R$8.000/mês cada)* | R$48.000 |
| Infra no MVP (VPS, proxies residenciais, gateway) | ~R$300/mês |
| Manutenção de scrapers | permanente, indefinido |

\* *Ajuste esse número para a sua realidade. Se o desenvolvimento sai do tempo livre, o desembolso em caixa é próximo de zero — mas o custo continua existindo na forma dos três meses em que as operações de afiliado não foram construídas.*

**A conta:** R$48.000 ÷ R$350/mês ≈ **11 anos de assinatura**. E isso antes da primeira linha de suporte ao cliente, do primeiro real de CAC e do primeiro scraper quebrado às duas da manhã.

**O ponto que fecha o argumento:** vocês não precisam da ferramenta para vender a ferramenta. Precisam dela para **vender produtos como afiliados**. A ferramenta é insumo, não produto. Comprar o insumo pronto por R$100/mês e concentrar o esforço no que gera comissão é a alocação de capital mais eficiente disponível.

---

## 7. Recomendação

**Fase 1 — Próximos 30 dias.** Assinar duas ou três ferramentas (Shozap, FluxoPromo e Achadinhos Pro cobrem abordagens diferentes) e rodá-las nas operações reais. Custo total abaixo de R$400. O aprendizado sobre o mercado é imediato e a comissão começa a entrar enquanto ele acontece.

**Fase 2 — 30 a 90 dias.** Concentrar o esforço dos dois desenvolvedores em construir e escalar as operações de afiliado: audiência, canais, nicho, conversão. Aqui está a receita real e o conhecimento que hoje falta.

**Fase 3 — Reavaliar com dados.** Depois de 90 dias operando de verdade, vocês terão a única coisa que a pesquisa não pode dar: a lista concreta do que as ferramentas existentes não fazem e que dói todo dia. Se essa lista for grande e específica o suficiente, aí sim existe um produto — nascido de dor comprovada, e não de suposição.

**Uma oportunidade lateral:** os programas de afiliados dessas ferramentas pagam 30% recorrente. Se a sócia tem rede, indicar a ferramenta que ela já usa gera receita recorrente sem nenhum desenvolvimento. Não é o negócio principal, mas é caixa a custo zero e testa a disposição do público a pagar por essa categoria.

---

## 8. O que precisaria ser verdade para construir mesmo assim

Se a decisão for seguir com o SaaS, estas condições precisariam se sustentar. Vale usá-las como teste honesto:

1. Existe uma lacuna específica e dolorosa, comprovada por uso real de 30 dias — não por suposição.
2. Existe um canal de distribuição próprio. Os concorrentes vencem com influenciadores e SEO; sem audiência, um produto melhor perde para um produto conhecido.
3. Alguém no time aguenta manutenção de scrapers de forma indefinida, não como projeto.
4. Existe caixa para 12 meses sem receita. O mercado tem camada gratuita — a conversão será lenta.
5. Há resposta clara para: *"por que eu trocaria o Shozap por isso?"* — em uma frase que um afiliado entenda.

Se três ou mais dessas condições não se sustentam hoje, a Fase 1 da recomendação acima é o caminho de menor risco e maior aprendizado.

---

## Fontes

- [Shozap — site oficial](https://shozap.com.br/)
- [FluxoPromo — site oficial e planos](https://fluxopromo.com/)
- [DivulgaLinks — landing e planos](https://pro.divulgalinks.com.br/landing)
- [Hub do Afiliado — site oficial e planos](https://hubdoafiliado.com/)
- [Achadinhos Pro — comparativo de ferramentas para afiliados Shopee 2026](https://achadinhopro.com.br/blog/melhores-ferramentas-afiliados-shopee-2026)
- [DivulgaNinja — automação para afiliados](https://www.divulganinja.com.br/blog/automacao-para-afiliados-no-instagram/)
- [FluxoPromo — WhatsApp add-on](https://fluxopromo.com/whatsapp)
- [E-Commerce Brasil — Programa de Afiliados Shopee atinge 3 milhões de participantes](https://www.ecommercebrasil.com.br/noticias/shopee-programa-de-afiliados)
- [O Hoje — Marketing de afiliados cresce 8% e soma 30 milhões de participantes no Brasil](https://ohoje.com/2025/07/02/marketing-de-afiliados-cresce-8-e-ja-soma-30-milhoes-de-participantes-no-brasil/)
- [Meta for Developers — políticas de enforcement do WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement)
