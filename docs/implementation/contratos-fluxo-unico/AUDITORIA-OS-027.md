# Auditoria de entrega — OS-027

**Veredicto: CONFORME_COM_RESSALVAS.** A fronteira exigida pela OS-027 foi observada nos caminhos de rota, lote e worker auditados: pedido novo de Mercado Livre é recusado antes de criação/despacho, e lote legado não invoca captura automática de ML. A homologação integral da bateria alegada pelo executor não se reproduziu neste ambiente; há duas falhas na suíte geral de `web` fora dos arquivos da OS e o teste com PostgreSQL nativo não pôde iniciar.

- **Modo e critérios congelados:** `entrega`, [OS-027](OS-027.md), AC-027.1 a AC-027.3. Auditoria em 2026-10-19, sem alterar código, testes, contratos ou migrations.
- **Versão:** `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` mais árvore de trabalho suja. A OS e parte dos arquivos implementados estão ainda não rastreados; outros estão modificados. O diff contra `HEAD` contém trabalho anterior à OS, portanto não permite atribuir isoladamente cada linha à OS-027. Os hashes SHA-256 da OS e dos sete arquivos de produção centrais foram conferidos no início e no fim da inspeção, sem mudança durante a auditoria.
- **Ambiente:** verificações locais, PGlite e transporte HTTP injetado; nenhum banco ou workflow remoto acionado.

| Aceite | Parecer | Evidência independente |
|---|---|---|
| AC-027.1 | Conforme | `batchCapturePlan` lança `manual_capture_only` para ML isolado ou misto; `/api/admin/rodagem/lote` responde 409 antes de `captureBatches.create` e `dispatchCaptureBatch`; `/api/admin/rodagem` responde 409 após autenticação. `capture-route-flow.test.ts` passou com `creates` e `transports` inalterados; respostas não contêm segredos. Os gates 401/403 precedem a recusa. |
| AC-027.2 | Conforme | `executeCaptureBatch` trata ML antes de `runStep(capture)`. Os 18 cenários PGlite passaram, incluindo ML com/sem contingência, lote misto, importação, omissão `partial`, titularidade/tenant, idempotência e retomada para triagem. O despachante executável só mapeia Shopee/AliExpress. |
| AC-027.3 | Conforme com ressalva de ambiente | Importação de ML em lote legado persistiu produto e observação e avançou à triagem nos testes PGlite. A rota manual existente chama `persistManualCapture`, que insere produto e observação sob conta autorizada; a fila de triagem lê pendências com observação. O cron em `.github/workflows/monitor-prices.yml` tem somente Shopee/AliExpress. O teste específico em PostgreSQL nativo não pôde rodar por ausência de `BIZUMINER_TEST_PG_BIN`. |

## Verificações desta auditoria

| Comando | Resultado |
|---|---|
| `node --test packages/web/test/batch-capture-plan.test.mjs` | Passou (arquivo TAP; quatro asserções de cenário no teste). |
| `npm run test:capture-batch --prefix tools/editorial-tests` | 18 cenários PGlite passaram. |
| `node --import tsx capture-route-flow.test.ts` em `tools/editorial-tests` | Passou; POSTs de ML isolado/misto e rota legada recusados sem criação/despacho. |
| `npm test --prefix tools/editorial-tests` | 29 cenários passaram. |
| `npm run test:triage-price --prefix tools/editorial-tests` | 22 cenários passaram. |
| `npm run typecheck --prefix packages/web` | Passou. |
| `npm test --prefix packages/web` | **Falhou:** 69/71 arquivos de teste passaram. Falhas em `capture-process.test.mjs` e `qr-service.test.mjs`, detalhadas abaixo. |
| `npm run test:operational-maintenance --prefix tools/editorial-tests` | Não iniciou: falta `BIZUMINER_TEST_PG_BIN` (binários locais de PostgreSQL). |

## Achados e limites

| ID | Tipo | Estado | Evidência e impacto | Fechamento / responsável |
|---|---|---|---|---|
| HIPOTESE-027-A | `diagnostico` | `nao_verificado` quanto à causa | `capture-process.test.mjs`, fora da escrita da OS, falha de modo reproduzível: subprocesso sai com código zero, mas `runBoundedCaptureProcess` retorna `output: ''` quando o teste espera `resultado`. Isso invalida a alegação de suíte `web` integralmente verde neste ambiente; não há evidência de causalidade com a OS-027. | Investigar captura de stdout no ambiente de execução e repetir o mesmo teste. Não atribuir BUG à OS sem causa confirmada. |
| OBS-027-B | `diagnostico` | `confirmado` no ambiente | `qr-service.test.mjs`, também fora da escrita da OS, falha porque `os.networkInterfaces()` devolve `uv_interface_addresses ... Unknown system error 1`; reprodução isolada. | Reexecutar onde interfaces de rede estejam disponíveis; responsável pelo ambiente de teste. |
| OBS-027-C | `diagnostico` | `confirmado` no ambiente | Teste de manutenção operacional com PostgreSQL nativo exige `BIZUMINER_TEST_PG_BIN`, indisponível aqui. A evidência de AC-027.3 combina teste PGlite de importação/triagem e inspeção estática do caminho manual. | Repetir teste nativo em ambiente provisionado; responsável pela verificação de integração. |
| OBS-027-D | `contrato` | `registrado` | A OS protege `packages/persistence/bin/sweep.ts`, que ainda contém um caminho CLI de varredura ML condicionado por flag. Nenhuma rota/lote/worker auditado o invoca e o cron não o agenda. A conclusão “exclusivamente manual” vale para a fronteira operacional definida pela OS; eliminar também a invocação manual desse CLI exigiria contrato separado. | Arquiteto, somente se o escopo pretendido incluir bloquear toda execução direta do CLI. |

Não foi confirmado defeito de implementação da OS-027 que justifique `BUG-###`. As falhas da suíte geral não devem ser tratadas como testes aprovados, apesar do resultado declarado em [RESULTADO-OS-027](RESULTADO-OS-027.md). A OS-027 está conforme aos três aceites na fronteira definida, com homologação condicionada à repetição dos dois testes de `web` e do teste nativo no ambiente apropriado.
