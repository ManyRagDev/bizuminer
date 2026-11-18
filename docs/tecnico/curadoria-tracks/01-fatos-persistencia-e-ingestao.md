# T01 Fatos, persistência e ingestão independente

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F1**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T00](00-reconciliacao-e-base-de-verificacao.md)

**Situação de entrada:** O escritor, a agregação de interesses e a independência de publicação por fonte continuam pendentes segundo o registro local. Preservar preparação atômica e posse do worker.

## Resultado observável

Uma captura legítima acrescenta fatos, renova apenas o relógio correto e não depende da conclusão de outra loja. Retry não duplica preço e vencimento não apaga histórico.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 5: Persistência e migração compatível](../plano-integracao-captura-curadoria-vitrine-pauta.md#5-persistência-e-migração-compatível).
- [Seção 6: Ingestão por fonte e tratamento de cada captura](../plano-integracao-captura-curadoria-vitrine-pauta.md#6-ingestão-por-fonte-e-tratamento-de-cada-captura).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [ingest.ts](../../../packages/persistence/src/ingest.ts) — `packages/persistence/src/ingest.ts`.
- [pg-store.ts](../../../packages/persistence/src/pg-store.ts) — `packages/persistence/src/pg-store.ts`.
- [store.ts](../../../packages/persistence/src/store.ts) — `packages/persistence/src/store.ts`.
- [browser-capture-db.ts](../../../packages/web/lib/browser-capture-db.ts) — `packages/web/lib/browser-capture-db.ts`.
- [extension-db.ts](../../../packages/web/lib/extension-db.ts) — `packages/web/lib/extension-db.ts`.
- [browser-capture-contract.ts](../../../packages/web/lib/browser-capture-contract.ts) — `packages/web/lib/browser-capture-contract.ts`.
- [extension-contract.ts](../../../packages/web/lib/extension-contract.ts) — `packages/web/lib/extension-contract.ts`.
- [capture-batch-worker.ts](../../../packages/web/lib/capture-batch-worker.ts) — `packages/web/lib/capture-batch-worker.ts`.
- [20261112002247_capture_atomic_publication.sql](../../../packages/persistence/supabase/migrations/20261112002247_capture_atomic_publication.sql) — `packages/persistence/supabase/migrations/20261112002247_capture_atomic_publication.sql`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T01.01** — Definir e migrar aditivamente os campos factuais e a associação produto–página, reutilizando evidências, IDs e chave por tenant/marketplace/external_id. Conferir o schema real antes de escrever a migração. *(Validado em PGlite descartável; aplicação em produção pendente.)*
- [x] **T01.02** — Preservar URL de produto e URL de origem reproduzíveis, com parâmetros funcionais permitidos e sem tokens/sessão. Guardar várias páginas por produto; histórico sem URL recuperável permanece explicitamente incompleto. *(Verificado em PGlite e testes locais.)*
- [x] **T01.03** — Implementar presença, verificação e disponibilidade como informações distintas, vinculadas à observação/configuração que sustentam. Faixa, cupom ou outra variante não renovam uma conferência exata antiga. *(Verificado em `curation-t01-t02-v2.test.ts` com `validateBrowserCaptureWithDiagnostics` + `persistManualExtensionBatch`, provando `option_key` distintos por `variantKey`, replay idempotente, evento atrasado e independência frente a listagem `from`.)*
- [x] **T01.04** — Convergir captura manual, extensão e Shopee no escritor comum. Tratar preço ausente como resultado sem nova verificação e indisponibilidade somente quando diretamente confirmada. *(Verificado em PGlite com fontes simuladas.)*
- [x] **T01.05** — Registrar toda observação independente de preço válido, inclusive estável; preservar requestId no retry. Ajustar o coalescimento de vinte horas do caminho v2 sem duplicar fatos em replays técnicos. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T01.06** — Preservar A→B→A e eventos atrasados; observação antiga entra no histórico, mas não substitui a condição atual mais recente. *(Verificado em `curation-t01-t02-v2.test.ts`.)*
- [x] **T01.07** — Fazer cada fonte concluir e publicar seus fatos independentemente, mantendo atomicidade da operação e leases/checkpoints. Um agrupador visual multiloja não bloqueia resultados já completos. *(Verificado em PGlite e suíte `persistence`.)*
- [x] **T01.08** — Emitir mudança de revisão por escopo e evento durável para avaliação/seleção depois do commit; não chamar IA/loja dentro da transação nem publicar editorialmente na captura. *(Verificado em PGlite.)*
- [ ] **T01.09** — Adicionar RLS, referências da mesma conta e índices para os novos acessos; executar backfill limitado sem atribuir data atual ou identidade de configuração por inferência. *(PGlite validado; migrations e backfill aplicados ao Supabase usado pelo localhost em 14/11 após autorização: 3.042 observações em 13 lotes, 1.381 verificações com datas originais, RLS preservada. Aplicação e verificação na VPS continuam pendentes; ver plano central.)*
- [x] **T01.10** — Expor as contagens mínimas de ingestão, erros e replays para as tracks seguintes e verificar o fluxo com fixtures de duas contas. *(Verificado em PGlite com duas contas isoladas.)*

## Como demonstrar a conclusão

- Duas lojas concluem em horários diferentes e uma falha sem apagar os fatos da outra ou expor meia operação.
- Nova conferência estável produz fato novo e data correta; replay devolve o resultado anterior sem duplicar.
- Preço inválido, evento atrasado e configuração alterada não prolongam a oferta antiga; TTL mantém os registros históricos.
- ID/referência de outra conta é recusado no serviço e no banco. Migração/backfill preservam vetos, links e acompanhamentos.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Fornece observações e relações de páginas à T02/T04, relógios à T03 e baseline factual à T07. Avaliações, pedidos de promoção, tarefas de navegação e slots pertencem às tracks seguintes.
