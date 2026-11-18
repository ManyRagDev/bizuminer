# T03 Seleção, promoção e validade pública

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F3**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T01](01-fatos-persistencia-e-ingestao.md), [T02](02-avaliacao-referencias-e-score.md)

**Situação de entrada:** Há edições e cache persistidos. O novo score ainda não está integrado, e o pedido de conferência antes da promoção precisa ser construído.

## Resultado observável

A vitrine escolhe candidatos com estabilidade e diversidade, coloca ofertas antigas em espera de conferência e impede exposição atual de informações vencidas em todas as rotas.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 4: Pool rolante e classes derivadas](../plano-integracao-captura-curadoria-vitrine-pauta.md#4-pool-rolante-e-classes-derivadas).
- [Seção 9: Vitrine, promoção e validade pública](../plano-integracao-captura-curadoria-vitrine-pauta.md#9-vitrine-promoção-e-validade-pública).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [homepage-policy.ts](../../../packages/web/lib/homepage-policy.ts) — `packages/web/lib/homepage-policy.ts`.
- [hero-ranking.ts](../../../packages/web/lib/hero-ranking.ts) — `packages/web/lib/hero-ranking.ts`.
- [recommendation-policy.ts](../../../packages/web/lib/recommendation-policy.ts) — `packages/web/lib/recommendation-policy.ts`.
- [homepage-db.ts](../../../packages/web/lib/homepage-db.ts) — `packages/web/lib/homepage-db.ts`.
- [recommendation-db.ts](../../../packages/web/lib/recommendation-db.ts) — `packages/web/lib/recommendation-db.ts`.
- [pauta-db.ts](../../../packages/web/lib/pauta-db.ts) — `packages/web/lib/pauta-db.ts`.
- [public-offer-db.ts](../../../packages/web/lib/public-offer-db.ts) — `packages/web/lib/public-offer-db.ts`.
- [catalog-policy.ts](../../../packages/web/lib/catalog-policy.ts) — `packages/web/lib/catalog-policy.ts`.
- [shared-link-archive.ts](../../../packages/web/lib/shared-link-archive.ts) — `packages/web/lib/shared-link-archive.ts`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T03.01** — Implementar projeção do pool e derivação das classes quente/morna/fria, incluindo candidatos do próximo slot e promoções pendentes; vencimento não exclui a identidade do catálogo. *(Verificado em PGlite com `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T03.02** — Compor a vitrine com capacidade, família/equivalência, categoria/loja e tratamento explícito de escassez. Ordem manual passa pelos mesmos gates factuais. *(Verificado em PGlite e em `packages/web/test/curation-selection-v2.test.mjs`, cobrindo tetos estritos de loja/categoria quando há oferta diversa, passos determinísticos apenas sob escassez real e proteção contínua dos gates factuais.)*
- [x] **T03.03** — Implementar histerese: vantagem do desafiante, preenchimento de vaga e causas de saída, com comparação sob a mesma versão/normalização e snapshot de entrada. *(Verificado em `curation-journey-t03-t08-v2.test.ts` e `packages/web/test/curation-selection-v2.test.mjs`, incluindo troca por desafiante sujeita à diversidade e reequilíbrio após escassez anterior.)*
- [x] **T03.04** — Persistir pedidos de promoção por oferta/configuração/revisão/motivo, com prazo e deduplicação. Definir entrada, resultado e cancelamento que a T04 vai consumir. *(Verificado em `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T03.05** — Separar disputa de conferência externa: Shopee pede confirmação oficial; DOM antigo pede revisita. Oferta pendente ainda não é publicada, e ocupante só permanece dentro da própria validade. *(Verificado em PGlite com role `garimpa_app`.)*
- [x] **T03.06** — Ao receber resultado, recalcular os fatos/score necessários e confirmar elegibilidade, vetos e revisão na troca atômica da edição. Resposta antiga não ganha uma vaga já perdida. *(Verificado em PGlite com corrida e veto humano/equivalente.)*
- [ ] **T03.07** — Unificar offer_valid_until nos leitores SQL e interfaces: home, busca/categoria, detalhe, OG/Stories, bio, links curtos, redirects e recomendações. Cache ou imagem persistente não contorna expiração. *(Verificado em `curation-journey-t03-t08-v2.test.ts` para `readRecommendationEdition("home")`, `publicDealDetail`, `publicGo` e `publicOfferHistory` sem worker, e compilado em `next build`; comprovação automatizada dedicada das demais rotas como busca/categoria, OG/Stories e bio ainda pendente.)*
- [x] **T03.08** — Preservar página/arquivo histórico de links enviados, com data e estado; oferta vencida deixa de autorizar redirect como oferta atual. *(Verificado em PGlite: `publicOfferHistory` mantém curva após expiração e `publicGo` retorna 404.)*
- [x] **T03.09** — Integrar atualização por mudança relevante e por job de frescor ao executor existente, com próxima execução persistida. GET público só lê/filtra a edição; não dispara API, IA ou recomposição. *(Integrado em `listen-capture-batches.ts` / `curation-scheduler.ts` e verificado em PGlite/build; execução contínua em VPS pendente de deploy.)*
- [x] **T03.10** — Instrumentar vagas, pendências e trocas por motivo; exercitar o contrato com um executor de conferência simulado antes da integração externa. *(Verificado em `curation-journey-t03-t08-v2.test.ts` e `readCurationOperationsMetrics`.)*

## Como demonstrar a conclusão

- Candidato antigo vence a disputa, gera pedido fora da vitrine e só entra após resultado válido reavaliado.
- Desafiante melhor pode substituir o ocupante sem exigir queda deste; pequenas oscilações não remontam a página inteira.
- Sem orçamento/navegador, mantém-se apenas ocupante válido ou vaga aberta; não há falso preenchimento.
- Avançar o relógio impede oferta vencida em todas as superfícies e ações, mesmo se o job estiver atrasado.
- Publicação concorrente, mudança de política e veto humano não misturam revisões nem contas.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega à T04 o pedido factual persistido e consome seu resultado. É possível fechar o comportamento local com simuladores; ativação real exige a conferência apropriada de T04/T05. A T06 reutiliza os mesmos gates.
