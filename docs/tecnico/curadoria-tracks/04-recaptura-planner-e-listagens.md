# T04 Conferência, planner e revisitas de listagens

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F4 e execução de conferência de F3**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T01](01-fatos-persistencia-e-ingestao.md), [T03](03-selecao-promocao-e-validade-publica.md)

**Situação de entrada:** Há fila/outbox, captura manual, extratores e consulta Shopee por ID. O manifesto atual usa activeTab; nova navegação dirigida depende de contrato, capacidade e permissão apropriados.

## Resultado observável

Uma sessão autorizada confere ofertas prioritárias pelas páginas com melhor cobertura, reporta somente o que realmente observou e deixa o restante pendente sem invalidar produtos por ausência.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 11: Planner de recaptura e contrato da extensão](../plano-integracao-captura-curadoria-vitrine-pauta.md#11-planner-de-recaptura-e-contrato-da-extensão).
- [Seção 12: Orçamento, jobs e recuperação](../plano-integracao-captura-curadoria-vitrine-pauta.md#12-orçamento-jobs-e-recuperação).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [monitoring-policy.ts](../../../packages/persistence/src/monitoring-policy.ts) — `packages/persistence/src/monitoring-policy.ts`.
- [monitoring-candidates.ts](../../../packages/persistence/src/monitoring-candidates.ts) — `packages/persistence/src/monitoring-candidates.ts`.
- [monitoring-lookup.ts](../../../packages/persistence/src/monitoring-lookup.ts) — `packages/persistence/src/monitoring-lookup.ts`.
- [monitor-prices.ts](../../../packages/persistence/bin/monitor-prices.ts) — `packages/persistence/bin/monitor-prices.ts`.
- [route.ts](../../../packages/web/app/api/extension/capture-batches/route.ts) — `packages/web/app/api/extension/capture-batches/route.ts`.
- [extension-request.ts](../../../packages/web/lib/extension-request.ts) — `packages/web/lib/extension-request.ts`.
- [manifest.json](../../../packages/extension/manifest.json) — `packages/extension/manifest.json`.
- [service-worker.ts](../../../packages/extension/src/background/service-worker.ts) — `packages/extension/src/background/service-worker.ts`.
- [outbox.ts](../../../packages/extension/src/lib/outbox.ts) — `packages/extension/src/lib/outbox.ts`.
- [batch-queue.ts](../../../packages/extension/src/lib/batch-queue.ts) — `packages/extension/src/lib/batch-queue.ts`.
- [page-extractor.ts](../../../packages/extension/src/content/page-extractor.ts) — `packages/extension/src/content/page-extractor.ts`.
- [marketplace-page.ts](../../../packages/extension/src/content/marketplace-page.ts) — `packages/extension/src/content/marketplace-page.ts`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T04.01** — Executar pedidos de conferência da T03 e renovação ativa da Shopee por ID, com coalescimento, quota, retry e interpretação fiel de faixa/variante/disponibilidade. Bloquear caminhos legados incompatíveis. *(Verificado em PGlite e testes unitários com executor/API simulados; chamada real Shopee pendente de autorização.)*
- [x] **T04.02** — Implementar orçamento persistido por conta/fonte/dia/sessão e tarefa com lease por dispositivo. Reservar antes de navegar/chamar API; repetir reporte não gera nova cota ou chamada. *(Verificado em `curation-journey-t03-t08-v2.test.ts`: replay de claim/reporte idempotente e respeito a cota.)*
- [x] **T04.03** — Construir planner sobre quentes, promoções pendentes e acompanhamentos explícitos. Usar as relações produto–página e taxa de reencontro, limitando reservas e tentativas. *(Verificado em `curation-journey-t03-t08-v2.test.ts` e `monitoring-plan.ts`.)*
- [x] **T04.04** — Implementar GET /api/extension/recapture-plan somente leitura, POST de claim e POST /api/extension/observations v2, com validação em execução, idempotência e capabilities. *(Verificado em PGlite via `curation-journey-t03-t08-v2.test.ts` — incluindo `POST` real de `app/api/extension/observations/route.ts` + `recapture-http.ts` + `validateRecaptureObservation`, rejeições 400/401/403/409 e `next build`; `GET /api/extension/recapture-plan` e `POST` de claim verificados no nível de serviço/contrato e build.)*
- [x] **T04.05** — Manter rotas/clientes manuais existentes e convergir no serviço factual da T01. Aceitar resultados sem preço, ausência em listagem e necessidade de login como estados distintos. *(Verificado em PGlite e via `POST /api/extension/observations` + `validateRecaptureObservation` para `not_found_on_listing`, `no_price`, `configuration_mismatch`, `observed` e `unavailable_confirmed`.)*
- [x] **T04.06** — Preservar URLs reproduzíveis na extração e validar host, redirecionamento, origem, alvo e conta no backend e navegador; rejeitar tarefas forjadas, revogadas ou incompatíveis. *(Verificado em PGlite — incluindo rejeições HTTP de origem, dispositivo revogado, conflito de idempotência e envelopes inválidos — além dos testes de extratores e extensão.)*
- [ ] **T04.07** — Implementar início explícito da sessão, concessão opcional por loja ou abertura assistida, pausa/cancelamento e uma aba por vez. Sem permissão, não simular activeTab em outra aba. *(Código implementado e compilado em `recapture-session.ts` + `service-worker.ts`; ainda sem teste unitário específico para `recapture-session.ts` nem ensaio interativo no navegador.)*
- [ ] **T04.08** — Processar listagens com os extratores existentes e reportar alvos realmente reencontrados e descobertas novas. Replanejar somente o resíduo e recuar em páginas que perderam cobertura. *(Extratores de listagem, planner, replanejamento de resíduo e reporte HTTP validados separadamente; falta teste integrado cobrindo a orquestração em `recapture-session.ts` na extensão.)*
- [ ] **T04.09** — Persistir progresso, próxima ação e reportes na storage/outbox; retomar por eventos/alarms, isolando origem/dispositivo/conta. Navegador fechado deixa trabalho pendente, sem polling do servidor. *(`service-worker.test.ts` e `outbox.test.ts` cobrem fila/outbox básica; falta cobertura automatizada da persistência/retomada de `recapture-session.ts` e ensaio com reinício real do navegador.)*
- [ ] **T04.10** — Exibir no popup/admin progresso, impedimentos, cotas e resíduo; conectar contagens e resultados de volta à promoção/renovação da T03. *(Conexão backend/telemetria verificada em PGlite e telas compilando em `next build`/Vite; conferência interativa no popup e admin no navegador pendente.)*

## Como demonstrar a conclusão

- Listagem que mudou renova somente os preços válidos encontrados; os ausentes permanecem pendentes e não viram indisponíveis.
- Dois dispositivos concorrem pela mesma tarefa/cota e não executam o mesmo trabalho aberto simultaneamente.
- Perda da resposta, suspensão, revogação e troca de conta preservam idempotência e isolamento.
- Permissão negada e orçamento esgotado produzem pendência legível; não geram fonte alternativa de servidor.
- Shopee agregada não renova opção exata que a resposta não confirmou. GET público continua sem consultas externas.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega à T05 os alvos residuais, o protocolo, a cota e o mecanismo de retomada. O MVP pode deixar esse resíduo vencer, sem alegar que houve conferência PDP.
