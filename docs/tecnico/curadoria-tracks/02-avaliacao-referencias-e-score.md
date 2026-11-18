# T02 Avaliação, referência de preço e score explicável

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F2**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T01](01-fatos-persistencia-e-ingestao.md)

**Situação de entrada:** Existem ai-curation-v2-contract.ts e curation-score-v2.ts, ainda sem aceite de persistência, transporte, normalização por grupo ou integração. Aproveitar as funções compatíveis e verificar seus limites.

## Resultado observável

O sistema avalia somente o delta necessário, explica a pontuação de cada candidato e compara a seleção proposta com a atual sem alterar a vitrine.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 7: Avaliação IA e decisões humanas](../plano-integracao-captura-curadoria-vitrine-pauta.md#7-avaliação-ia-e-decisões-humanas).
- [Seção 8: Referência de preço, score e deduplicação](../plano-integracao-captura-curadoria-vitrine-pauta.md#8-referência-de-preço-score-e-deduplicação).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [ai-curation-v2-contract.ts](../../../packages/web/lib/ai-curation-v2-contract.ts) — `packages/web/lib/ai-curation-v2-contract.ts`.
- [curation-score-v2.ts](../../../packages/web/lib/curation-score-v2.ts) — `packages/web/lib/curation-score-v2.ts`.
- [ai-curation-service.ts](../../../packages/web/lib/ai-curation-service.ts) — `packages/web/lib/ai-curation-service.ts`.
- [ai-curation-provider.ts](../../../packages/web/lib/ai-curation-provider.ts) — `packages/web/lib/ai-curation-provider.ts`.
- [curation-pipeline.ts](../../../packages/web/lib/curation-pipeline.ts) — `packages/web/lib/curation-pipeline.ts`.
- [curation-db.ts](../../../packages/web/lib/curation-db.ts) — `packages/web/lib/curation-db.ts`.
- [triage-candidates-db.ts](../../../packages/web/lib/triage-candidates-db.ts) — `packages/web/lib/triage-candidates-db.ts`.
- [offer-history.ts](../../../packages/web/lib/offer-history.ts) — `packages/web/lib/offer-history.ts`.
- [editorial-compass.ts](../../../packages/web/lib/editorial-compass.ts) — `packages/web/lib/editorial-compass.ts`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T02.01** — Integrar atributos v2 aos provedores e consumidores com validação de schema, faixa, IDs, lote e campos ausentes. Não converter nota legada 1–5 em atributos v2 fictícios. *(Validado em suíte unitária e PGlite com provedor simulado; chamadas reais pagas de IA pendentes de autorização.)*
- [x] **T02.02** — Persistir avaliações com input, política, prompt/modelo e fatos usados; reaproveitar a estrutura de avaliação compatível, preservando eventos humanos. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T02.03** — Implementar seleção incremental: novo candidato, mudança material de conteúdo/condição, alteração acumulada de preço desde a última avaliação ou nova política. Recaptura estável reutiliza atributos. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T02.04** — Aplicar resultado da IA somente se evidência e decisões humanas ainda forem atuais; tratar indisponibilidade/quota/resultado desconhecido sem publicar nem repetir custo indefinidamente. *(Verificado em PGlite com simulação de erro/reconciliação.)*
- [x] **T02.05** — Separar bloqueio de segurança, espera por evidência e baixo mérito. Retirar rejeição permanente por ranking e integrar as correções locais da triagem, mantendo vetos humanos. *(Verificado em `packages/web/test` e `curation-t01-t02-v2.test.ts`.)*
- [x] **T02.06** — Construir referência diária comparável e separar diferença histórica, desconto declarado e sinal de categoria. Sem série suficiente, não preencher desconto real; o p95 gera suspeita, sem veto automático. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T02.07** — Completar normalização por categoria/faixa, fallback em grupos pequenos, sinais neutros e confiança; recalcular o grupo afetado e persistir componentes/revisão. Usar os pesos do plano como hipótese configurável. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T02.08** — Implementar potential_score para priorizar conferências sem liberar publicação. Conferir sinal das diferenças de preço, limiares e fronteiras temporais nas funções locais existentes. *(Verificado em PGlite e testes unitários.)*
- [x] **T02.09** — Agrupar anúncios possivelmente equivalentes sem fundir históricos/configurações. Similaridade de título gera comparação, não identidade comprovada. *(Verificado em PGlite.)*
- [x] **T02.10** — Produzir comparação explicável do ranking atual e v2 sobre os mesmos candidatos, com custo e amostra de qualidade; manter a exposição anterior até a track de seleção. *(Modo comparação local implementado e verificado com dados simulados em PGlite; medição em janela real pendente.)*

## Como demonstrar a conclusão

- Produto útil sem histórico continua disputando; nenhum gate recria desconto percentual mínimo.
- Série incompatível ou agregada não produz economia histórica; várias capturas do mesmo dia não simulam dias de acompanhamento.
- Alteração em voo/veto humano impede aplicar resposta antiga; lote duplicado/incompleto/extra falha de forma explícita.
- Entrar ou sair um concorrente atualiza o grupo afetado; todos os componentes finais têm origem e fallback rastreáveis.
- Comparação roda com avaliador simulado; chamadas reais e custo inicial ficam separados e dependem do escopo autorizado.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega à T03 elegibilidade semântica, scores por revisão, equivalência conservadora e motivos explicáveis. A T07 reaproveita avaliações/eventos para exceções e exemplos.
