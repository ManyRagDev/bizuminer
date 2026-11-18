# T05 Conferência individual de produto e recuperação

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F5**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T04](04-recaptura-planner-e-listagens.md)

**Situação de entrada:** Há extração de produto em partes dos adapters DOM de Amazon/AliExpress. Reaproveitar e conferir cobertura; isso não prova a execução dirigida nem a disponibilidade nas três lojas.

## Resultado observável

O resíduo de uma sessão pode ser conferido na página do produto, com ritmo e custo limitados, permitindo promover uma oferta antiga somente quando a condição for confirmada.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 9: Vitrine, promoção e validade pública](../plano-integracao-captura-curadoria-vitrine-pauta.md#9-vitrine-promoção-e-validade-pública).
- [Seção 11: Planner de recaptura e contrato da extensão](../plano-integracao-captura-curadoria-vitrine-pauta.md#11-planner-de-recaptura-e-contrato-da-extensão).
- [Seção 12: Orçamento, jobs e recuperação](../plano-integracao-captura-curadoria-vitrine-pauta.md#12-orçamento-jobs-e-recuperação).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [amazon-extractor.ts](../../../packages/extension/src/content/amazon-extractor.ts) — `packages/extension/src/content/amazon-extractor.ts`.
- [marketplace-page.ts](../../../packages/extension/src/content/marketplace-page.ts) — `packages/extension/src/content/marketplace-page.ts`.
- [card-extractor.ts](../../../packages/extension/src/content/card-extractor.ts) — `packages/extension/src/content/card-extractor.ts`.
- [service-worker.ts](../../../packages/extension/src/background/service-worker.ts) — `packages/extension/src/background/service-worker.ts`.
- [api.ts](../../../packages/extension/src/lib/api.ts) — `packages/extension/src/lib/api.ts`.
- [storage.ts](../../../packages/extension/src/lib/storage.ts) — `packages/extension/src/lib/storage.ts`.
- [marketplace-page.test.ts](../../../packages/extension/test/marketplace-page.test.ts) — `packages/extension/test/marketplace-page.test.ts`.
- [browser-capture-contract.ts](../../../packages/web/lib/browser-capture-contract.ts) — `packages/web/lib/browser-capture-contract.ts`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [ ] **T05.01** — Implementar ou adaptar mini-extrator PDP por loja DOM para preço, tipo/moeda, disponibilidade e identidade/condições suficientes, usando fixtures reais sanitizadas quando disponíveis. *(Código presente em `packages/extension/src/content/` e compilado no build; cobertura específica de fixtures PDP e ensaio em DOM real pendentes.)*
- [x] **T05.02** — Antes de abrir a PDP residual, conferir se o alvo ainda precisa de atualização, está autorizado e tem cota/lease. Captura oportunista anterior pode ter satisfeito a tarefa. *(Verificado em `recapture-db.ts` via PGlite.)*
- [ ] **T05.03** — Executar somente uma aba por vez e pausas configuradas entre ações, respeitando cota diária e da sessão, inclusive depois de reiniciar a extensão. *(Implementado e compilado em `recapture-session.ts`; sem teste dedicado para `recapture-session.ts` ou reinício real em Chrome/Vivaldi.)*
- [x] **T05.04** — Distinguir observação válida, indisponibilidade inequívoca, login/bloqueio, erro, timeout e configuração divergente. Um desafio de acesso não é 404 do produto. *(Verificado no backend em PGlite e contratos da extensão; falta ensaio real nas páginas.)*
- [x] **T05.05** — Aplicar preço/identidade conforme o escritor comum; respeitar a precedência PDP para a configuração confirmada e abrir divergência quando não houver compatibilidade. *(Verificado em `curation-journey-t03-t08-v2.test.ts`: `configuration_mismatch` preservando baseline incompatível.)*
- [x] **T05.06** — Encaminhar alteração de preço ao score e, quando material desde a última avaliação, ao delta de IA. Publicar só depois da reavaliação factual/semântica necessária. *(Verificado em `curation-t01-t02-v2.test.ts` e `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T05.07** — Retirar imediatamente condição indisponível confirmada sem apagar links/histórico. Erro técnico mantém o fato antigo até seu vencimento, sem renovar a data. *(Verificado em PGlite.)*
- [x] **T05.08** — Encerrar ou adiar tarefas de acordo com resultado, prazo e orçamento; não deixar o mesmo candidato monopolizar a sessão nem acelerar ações para compensar atraso. *(Verificado em PGlite/contratos de planner e orçamento.)*

## Como demonstrar a conclusão

- Conferência de candidato antigo fecha o percurso pedido → PDP → observação → rescore → edição, ou mantém fora se perdeu mérito.
- 404 real retira a oferta; login/captcha/timeout não marcam indisponibilidade nem atualizam o preço.
- Variantes distintas não se confirmam mutuamente; mudança material torna a avaliação antiga inaplicável.
- Pausas, número de abas, limite diário e retomada são verificáveis; a sessão devolve controle à descoberta.
- Sem navegador ou permissão, a pendência continua visível e nenhuma coleta de servidor é executada.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Completa a conferência DOM usada por T03/T06 e fornece casos reais de falha à operação. A infraestrutura de claim e cota continua sendo a mesma de T04.
