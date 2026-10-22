# Resultado da OS-027 — fronteira de captura exclusivamente manual do Mercado Livre

- **OS:** OS-027 (`docs/implementation/contratos-fluxo-unico/OS-027.md`).
- **Baseline inicial:** `main` `43700c59` mais alterações locais preexistentes.
- **Estado:** `CONCLUIDO`.

## Arquivos escritos e autorização

Todos os caminhos alterados pertencem à lista de escrita autorizada na OS-027:

1. `packages/web/lib/batch-capture-plan.ts`: restringe `BatchMarketplace` a Shopee e AliExpress; lança `ManualCaptureOnlyError` (`manual_capture_only`) caso haja solicitação explícita de Mercado Livre (isolada ou mista).
2. `packages/web/lib/capture-dispatch.ts`: `prepareAccountCapture` trata Mercado Livre como `manual_capture_only` no array de `skipped` sem nunca adicioná-lo a `enabled`; `dispatchCaptureBatch` dispensa resolução de credenciais para Mercado Livre em lotes legados.
3. `packages/web/lib/capture-batch-worker.ts`: `executeCaptureBatch` não invoca `runStep(capture)` para Mercado Livre (0 chamadas); direciona para contingência humana (`awaiting_browser`) se houver consentimento e dono no lote, ou rejeita com `manual_capture_only` sem loops; lotes mistos legados concluem Shopee/AliExpress e triagem fecha como `partial` sem marcar ML ausente como sucesso.
4. `packages/web/bin/run-capture-batch.ts`: remove `mercadolivre` do mapeamento de scripts executáveis pelo worker; rejeita requisições diretas de ML em `runStep` com `manual_capture_only`; remove completamente as variáveis `ML_AUTOMATED_CAPTURE_ENABLED` e `ML_AUTOMATED_CAPTURE_PRODUCTION` do ambiente.
5. `packages/web/app/api/admin/rodagem/route.ts`: responde diretamente com `{ ok: false, error: "manual_capture_only", message: "..." }` com status 409 sob autenticação válida, sem criar lote e sem acionar GitHub; mantém 401/403 para ausência de sessão/permissão.
6. `packages/web/app/api/admin/rodagem/lote/route.ts`: captura erro `manual_capture_only` de `batchCapturePlan` e responde com HTTP 409 seguro, sem persistir lote nem despachar.
7. `packages/web/app/admin/batch-capture-panel.tsx`: trata erro `manual_capture_only` com orientação explícita; ajusta rótulos e mensagens de `awaiting_browser` para indicar espera de importação manual pelo navegador.
8. `packages/web/test/batch-capture-plan.test.mjs`: testes unitários atualizados para cobrir exclusão de ML do plano automático e disparo de erro `manual_capture_only` em pedidos isolados ou mistos.
9. `tools/editorial-tests/capture-batch.test.ts`: 18 cenários PostgreSQL isolados atualizados para validar AC-027.2 (0 chamadas de captura ML, 1 chamada Shopee, resolução em `partial` em omissão e avanço para triagem somente após importação).
10. `tools/editorial-tests/capture-route-flow.test.ts`: valida rejeição HTTP 409 com `manual_capture_only` para pedidos de ML isolados, mistos e via rota legada `/api/admin/rodagem`, sem criação de lote ou despacho (`creates === 0`, `transports === 0`).
11. `docs/implementation/contratos-fluxo-unico/RESULTADO-OS-027.md`: este relatório de entrega e evidências.

## Comportamentos modificados e critérios de aceite

- **AC-027.1:** POST autenticado tentando ML (isolado em `/api/admin/rodagem` ou `/api/admin/rodagem/lote`, ou misto em `/api/admin/rodagem/lote`) não cria nova execução ML nem dispara GitHub; retorna instrução manual com status 409 e código `manual_capture_only`; nenhuma credencial é exposta; 401/403 preservados na falta de sessão/papel.
- **AC-027.2:** Lote legado com ML e consentimento chama `runStep(capture)` zero vezes para ML; entra em fase `awaiting_browser` sem loop; Shopee/AliExpress do mesmo lote continuam normalmente (1x cada); quando ML é omitido pelo operador, o lote fecha como `partial` e a triagem não considera o ML ausente como sucesso.
- **AC-027.3:** Captura humana de ML via extensão/bookmarklet persiste produto e observação de preço normalmente e passa à triagem elegível; monitoramento periódico continua restrito a Shopee e AliExpress sem ML.

## Verificações executadas

1. **Testes unitários de batch-capture-plan:**
   - Comando: `node --test packages/web/test/batch-capture-plan.test.mjs`
   - Resultado: 4 testes passaram (0 falhas).
2. **Testes de integração de lote (PostgreSQL isolado com PGlite):**
   - Comando: `npm run test:capture-batch --prefix tools/editorial-tests`
   - Resultado: 18 cenários passaram (0 falhas).
3. **Testes de fluxo de rotas HTTP com injeção de transporte sem rede:**
   - Comando: `npx tsx tools/editorial-tests/capture-route-flow.test.ts`
   - Resultado: Passou (rejeições 409 para ML isolado, misto e `/api/admin/rodagem` verificadas com `creates === 0` e `transports === 0`).
4. **Testes unitários e de integração de web:**
   - Comando: `npm test --prefix packages/web`
   - Resultado: 428 testes passaram (0 falhas).
5. **Testes editoriais gerais:**
   - Comando: `npm test --prefix tools/editorial-tests`
   - Resultado: 29 cenários editoriais passaram (0 falhas).
6. **Verificação de tipos:**
   - Comando: `npm run typecheck --prefix packages/web`
   - Resultado: Executou `tsc --noEmit` com código de saída 0 (sem erros).

## Operações remotas
Nenhuma operação remota foi executada ou autorizada. Todos os testes utilizaram fixtures em memória (PGlite) e injeção controlada de transporte sem requisições reais de rede.

## Pendências e bloqueios
Nenhum bloqueio de fronteira (`BLOQUEIO_DE_FRONTEIRA`). Fronteira de captura manual do Mercado Livre integralmente isolada e protegida.
