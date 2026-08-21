# Brief: OfertaFlow (nome de trabalho)

> 📁 **Documento histórico — suplantado (marcado em 20/08/2026).**
> Este é o brief inicial do projeto, de julho/2026. Ele descreve o **OfertaFlow**, um SaaS B2B vendido a afiliados. O produto que existe é o **BizuMiner**: site B2C de curadoria com a comissão de afiliado da casa.
> As decisões tomadas entre 17/08 e 20/08 substituíram este brief. Ele fica congelado como registro de onde o projeto começou — **não se atualiza e não se usa para decidir**. O estado vigente está em `docs/estado-do-projeto.md`.

> **v2** — atualizado após confirmação de que existe sócia com rede de afiliados ativa (validadora real) e que o fundador construirá a própria operação em paralelo.

---

## Essência

Plataforma que cobre o ciclo completo do afiliado de achadinhos — da pesquisa e monitoramento de preços até o disparo no WhatsApp e Telegram com link já afiliado. Valida em duas operações reais internas antes de virar SaaS B2B.

---

## Os três estágios (e por que a ordem importa)

**Estágio 1 — Validação com a sócia.**
Ela já tem rede, audiência e comissão rodando. É o único ambiente onde o produto pode ser julgado por um critério objetivo: *a comissão dela subiu?* Nenhuma métrica de vaidade substitui isso. Este estágio prova a **tese de eficiência** — a ferramenta acelera quem já opera.

**Estágio 2 — Sua própria operação, do zero.**
Você é literalmente a persona "quem quer entrar nesse mercado". Isso é um ativo, não uma lacuna: cada fricção que você sentir montando sua operação é um bug de onboarding do produto, descoberto de graça. Este estágio prova a **tese de acessibilidade** — a ferramenta permite que um iniciante chegue a resultado.

**Estágio 3 — Venda.**
Chega com duas provas sociais de naturezas opostas: "acelerou quem já era grande" e "fez um zero virar operação". Esse par vale mais que qualquer landing page.

**A armadilha aqui:** tentar servir os dois perfis ao mesmo tempo no MVP. A sócia precisa de *escala e velocidade*; você precisa de *mão na roda e simplicidade*. São roadmaps diferentes. Construa primeiro para ela — o feedback é imediato e mensurável em dinheiro. Sua jornada roda em paralelo como teste de UX, não como fonte de requisitos concorrentes.

---

## Proposta de Valor

O documento original vendia automação de disparo. Com o escopo ampliado ("tudo, da pesquisa de preços ao envio"), a proposta fica mais forte e mais defensável:

1. **Cobertura de ponta a ponta.** A maioria das ferramentas do nicho resolve *um* pedaço — ou é raspador de oferta, ou é disparador. Quem entra no mercado hoje precisa costurar 3 ou 4 ferramentas. Uma plataforma única é diferenciação real.
2. **Velocidade de detecção.** Quem publica primeiro leva a comissão. O ativo defensável é o pipeline de captura, não o painel.
3. **Tag do próprio cliente.** Comissão integral e risco de compliance no lado certo. Ferramentas que "emprestam" a tag do dono são rejeitadas pelo mercado.
4. **Operação sem banimento.** Delays humanizados, spintax, e o padrão de UI empurrando para Canais/Comunidades. Feature de sobrevivência, não de conforto.

---

## Usuários

**Validadores internos (fases 1 e 2):** a sócia (operação madura) e você (operação nascente).

**Clientes (fase 3), em ordem de facilidade de aquisição:**

- **Super afiliado / gestor de comunidades** — dezenas de canais, já paga por ferramentas, ROI visível na primeira semana. Cliente de entrada.
- **Iniciante entrando no mercado** — perfil que o documento original ignorava e que agora você conhece por dentro. Precisa de curadoria assistida, templates de copy e onboarding guiado. Ticket menor, volume maior, suporte maior.
- **Agência / coprodutor** — multi-tenancy e relatórios. Só depois do core estável.

---

## Funcionalidades Core (MVP)

**Pesquisa e monitoramento de preços**
- Busca de produto por termo/categoria/loja no catálogo capturado
- Histórico de preço por SKU com detecção de desconto real (mata o "falso desconto" de preço inflado)
- Alertas por regra: SKU específico, categoria, ou variação percentual
- Deduplicação de ofertas já publicadas

**Afiliação**
- Parser de URL por e-commerce + injeção da tag do usuário
- Cofre de credenciais por usuário (criptografado)
- Encurtador próprio com rastreio de clique — indispensável para provar valor na fase 3

**Disparo**
- Feed em tempo real com curadoria em 1 clique
- Piloto automático com filtros (desconto mínimo, faixa de preço, categoria, loja)
- Fila com delays randomizados, spintax e rate limit por conexão
- Telegram (bot oficial) e WhatsApp (WAHA)
- Templates de mensagem por canal

**Base**
- Multi-tenant com isolamento no schema desde o dia 1. Mesmo em uso interno — você já terá dois tenants (você e a sócia). Retrofit disso depois é caro.

---

## Funcionalidades Secundárias (v2+)

- Geração de copy com IA (gatilho de urgência, adaptação por canal)
- Dashboard de conversão por canal, oferta e horário
- "Melhor horário para postar" com base em engajamento histórico
- Biblioteca de templates e curadorias prontas para iniciantes
- Programa de afiliados interno do SaaS (growth loop)
- PWA para aprovar ofertas fora do desktop
- Comparador de preço entre lojas para o mesmo produto

---

## Fora do Escopo

- **Não é** rede de afiliados própria — não intermedia nem paga comissão
- **Não é** app de cupom para consumidor final (B2C)
- **Não** fornece a tag de afiliado; o usuário traz a dele
- **Não** dispara para listas frias / sem opt-in
- **Não** vende "burlar proteção anti-bot" como feature

---

## Modelo de Negócio

SaaS recorrente em três faixas (R$ 57 / R$ 97 / R$ 197), Pro como carro-chefe. O racional é sólido: a mensalidade se paga com a comissão gerada, virando custo operacional e não despesa.

**Duas correções ao plano original:**

- **Limite por conexão e volume de disparo, não por e-commerce.** Seu custo real é RAM de instância WAHA/Chromium. Precifique o que te custa. Travar lojas só frustra.
- **Trial de 7 dias sem cartão é caro aqui** — cada trial sobe uma instância de WhatsApp. Trial só com Telegram (custo ~zero), WhatsApp liberado no pago.

Nas fases 1 e 2, o "modelo de negócio" é a comissão das operações de vocês — que também financia a infra.

---

## Riscos e Incertezas

**Resolvido — Fundador fora do mercado.** A sócia com rede ativa cobre isso. Só formalize o acordo: o que ela ganha (acesso vitalício? equity? % de receita?) e o que ela entrega (feedback estruturado, dados de comissão antes/depois, direito de uso do case). Fazer isso agora, escrito, evita atrito exatamente quando o produto começa a valer dinheiro.

**Alto — Manutenção de scrapers.** Seletores e endpoints quebram sem aviso. É custo permanente, não tarefa de setup. Priorize API oficial (Amazon PA-API, Shopee) onde existir; scraping só onde não há alternativa.

**Alto — Banimento de WhatsApp.** Principal gerador de suporte e churn nessa categoria. Direcionar para Canais/Comunidades resolve a maior parte — mas precisa ser o padrão da interface, não uma nota na documentação.

**Alto — Escopo.** "Tudo que alguém que quer entrar no mercado possa ter" é a definição de produto que nunca lança. A visão de ponta a ponta está certa; a execução precisa ser em fatias. Regra prática: **1 e-commerce, 1 canal (Telegram), fluxo completo funcionando**. Só depois amplie na horizontal. Um pipeline completo em Amazon vale mais que meio pipeline em cinco lojas.

**Médio — Concorrência.** Continua sem mapear. Existem players nacionais nesse nicho. 2–3 dias de pesquisa antes de codar define posicionamento e preço — e revela o que os usuários já reclamam, que é sua lista de features gratuita.

**Médio — Prazo.** As 7 semanas do documento assumem dupla dedicada em tempo integral. Em tempo parcial, o número honesto é 12 a 16 semanas.

**Médio — Compliance.** Automação de disparo em massa é área cinzenta em alguns termos de uso. O modelo de chave própria do cliente mitiga bastante; ainda assim vale ler os termos de Amazon e Shopee antes da fase 3.

---

## Premissas Assumidas

Confirme ou corrija:

1. A sócia opera principalmente em **WhatsApp** (padrão do mercado brasileiro de achadinhos). Se for Telegram, o MVP fica mais barato e mais rápido.
2. O sócio técnico domina **Node/TypeScript e Docker** — stack do documento executável sem curva.
3. Há capital para VPS + proxies residenciais (~R$ 150–400/mês no MVP; proxies são o item caro e imprevisível).
4. **Amazon e Shopee** são as duas primeiras lojas, por terem programa maduro e API.
5. Brasil como mercado único no primeiro ano.
6. A sócia entra como validadora/parceira, **não** como cliente pagante — e o acordo ainda não foi formalizado.

---

## Próximo passo recomendado

1. **Spike técnico de 2 dias** — o que Amazon PA-API e Shopee entregam de verdade? Se a API oficial já der preço em tempo real, metade do risco de scraping evapora e a arquitetura simplifica muito. **Esta é a decisão que mais afeta a stack — faça antes do blueprint.**
2. **Conversa estruturada com a sócia** (1 dia) — mapear o fluxo atual dela minuto a minuto. Onde exatamente o tempo vai embora? Essa é sua especificação de MVP, e ela já existe pronta na cabeça dela.
3. **Mapeamento de concorrentes** (2–3 dias) — posicionamento, preço e lista de reclamações.
