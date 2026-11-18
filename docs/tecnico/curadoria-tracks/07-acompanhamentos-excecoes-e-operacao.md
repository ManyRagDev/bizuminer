# T07 Acompanhamentos, revisão de exceções e operação

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F7**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T01](01-fatos-persistencia-e-ingestao.md), [T02](02-avaliacao-referencias-e-score.md), [T03](03-selecao-promocao-e-validade-publica.md), [T04](04-recaptura-planner-e-listagens.md), [T06](06-pauta-slots-e-envio-manual.md)

**Situação de entrada:** A separação entre favoritos e pedidos ativos, o teto/timeout de revisão e a operação v2 continuam pendentes. Esta track acompanha os produtores desde T01 e não serve para adiar proteções.

## Resultado observável

O operador entende pendências e custos, a revisão humana fica limitada e os acompanhamentos solicitados continuam com prioridade mesmo fora da vitrine.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 4: Pool rolante e classes derivadas](../plano-integracao-captura-curadoria-vitrine-pauta.md#4-pool-rolante-e-classes-derivadas).
- [Seção 13: Fila manual, auditoria e aprendizado](../plano-integracao-captura-curadoria-vitrine-pauta.md#13-fila-manual-auditoria-e-aprendizado).
- [Seção 14: Interfaces e apresentação da promessa](../plano-integracao-captura-curadoria-vitrine-pauta.md#14-interfaces-e-apresentação-da-promessa).
- [Seção 19: Métricas, ganhos esperados e limite de custo](../plano-integracao-captura-curadoria-vitrine-pauta.md#19-métricas-ganhos-esperados-e-limite-de-custo).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [monitoring-candidates.ts](../../../packages/persistence/src/monitoring-candidates.ts) — `packages/persistence/src/monitoring-candidates.ts`.
- [monitoring-policy.ts](../../../packages/persistence/src/monitoring-policy.ts) — `packages/persistence/src/monitoring-policy.ts`.
- [member-db.ts](../../../packages/web/lib/member-db.ts) — `packages/web/lib/member-db.ts`.
- [route.ts](../../../packages/web/app/api/minha/acompanhar/route.ts) — `packages/web/app/api/minha/acompanhar/route.ts`.
- [member-area.tsx](../../../packages/web/app/minha-area/member-area.tsx) — `packages/web/app/minha-area/member-area.tsx`.
- [editorial-compass.ts](../../../packages/web/lib/editorial-compass.ts) — `packages/web/lib/editorial-compass.ts`.
- [curation-db.ts](../../../packages/web/lib/curation-db.ts) — `packages/web/lib/curation-db.ts`.
- [triage-control.tsx](../../../packages/web/app/admin/curadoria/triage-control.tsx) — `packages/web/app/admin/curadoria/triage-control.tsx`.
- [manual-operacional-curadoria.md](../../../docs/tecnico/manual-operacional-curadoria.md) — `docs/tecnico/manual-operacional-curadoria.md`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T07.01** — Separar favorito de price_watch ativo na agregação, preservando pedidos existentes, baseline e parar/retomar. Não transportar baseline entre configurações incompatíveis. *(Verificado em PGlite com `option_key` e `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T07.02** — Incluir pedidos ativos no planner com reserva de capacidade e comunicação de atraso/dependência do navegador. Nenhum acompanhamento desaparece só por sair da vitrine. *(Verificado em `curation-journey-t03-t08-v2.test.ts`.)*
- [ ] **T07.03** — Implementar seleção de exceções perto do corte, faixa de confiança, limite diário/de abertos e deduplicação; dúvidas factuais continuam como conferência, não como dívida de revisão sem fim. *(Lógica implementada em `curation-exceptions-db.ts` e compilando; falta caso dedicado exercitando abertura/dedup/teto 15 em teste automatizado.)*
- [ ] **T07.04** — Aplicar timeout pelo resultado determinístico válido sem humano; requisito factual ou bloqueio não é liberado por tempo e caso não reabre sem informação nova. *(Lógica `deterministic_timeout` implementada em `curation-exceptions-db.ts`; falta teste dedicado de avanço de relógio fechando exceção.)*
- [ ] **T07.05** — Logar decisões e motivos com snapshot, preservando veto humano; integrar reconsideração auditada das antigas rejeições automáticas de baixo mérito. *(Veto humano, equivalência e métricas de auditoria verificados em PGlite; ensaio específico de `curation-reconsider` pendente.)*
- [ ] **T07.06** — Implementar amostragem de selecionados, próximos do corte e cauda, com conjunto humano de referência e holdout separados. Atualizar exemplos/pesos de forma versionada. *(Implementado em `editorial-compass.ts` / `curation_audit`; prova específica em suíte automatizada pendente.)*
- [x] **T07.07** — Consolidar as métricas emitidas pelas tracks anteriores: qualidade, frescor, reencontro, custo, vagas, pendências, trocas, minutos de revisão e exposições por canal. *(Verificado via `readCurationOperationsMetrics` em `curation-journey-t03-t08-v2.test.ts` com isolamento multi-tenant.)*
- [ ] **T07.08** — Finalizar telas de captura, seleção, minha área e configuração com linguagem clara, validade visível e proteção contra edição concorrente; não perder rascunhos ou consentimentos. *(Telas e actions compilando em `next build`; verificação interativa no navegador pendente.)*
- [x] **T07.09** — Atualizar o manual operacional existente com iniciar/pausar sessão, login pendente, falta de cota, oferta vencida, revisão e confirmação de envio. Registrar o que o sistema efetivamente consegue prometer. *(Documentado em `docs/tecnico/manual-operacional-curadoria.md`.)*

## Como demonstrar a conclusão

- Pedido ativo fora da vitrine permanece na fila e na minha área; favorito isolado não vira obrigação regular.
- Fila acima da capacidade e timeout não bloqueiam a seleção nem aprovam preço não confirmado.
- Uma decisão humana prevalece sobre IA em voo e sobre uma nova queda de preço quando for veto.
- Operador identifica última conferência, motivo da pendência e custo/limite; telas distinguem descoberta, avaliação e publicação.
- Auditoria permite comparar bons produtos de fora e de dentro, sem tratar aprovação da própria IA como exemplo humano.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega operação, métricas e comunicação coerentes para T08. Tarefas de interesse/telemetria devem começar nas tracks produtoras; sua integração final é requisito de ativação.
