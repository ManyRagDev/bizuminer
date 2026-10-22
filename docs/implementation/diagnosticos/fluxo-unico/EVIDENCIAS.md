# Evidências e reprodução

Executar a partir da raiz do repositório. Node observado: v22.23.2. Baseline e hashes: [baseline.json](evidencias/baseline.json), [inventario.json](evidencias/inventario.json). Instrumentos desta pasta não modificam código de produção e usam somente fixtures sintéticas; escrevem seus resultados em `/tmp/bizuminer-fluxo-unico`.

## Inventário e probes

```bash
mkdir -p /tmp/bizuminer-fluxo-unico
node docs/implementation/diagnosticos/fluxo-unico/evidencias/inventario.cjs
node docs/implementation/diagnosticos/fluxo-unico/evidencias/probes.cjs
node docs/implementation/diagnosticos/fluxo-unico/evidencias/componentes.cjs
```

- [probes.json](evidencias/probes.json): executa normalização real de rotas; extrai e executa `resolveActiveId` da AST; consulta consumidores do modelo no inventário. `radar → selecao`; `onboarding/governanca → hoje`; zero imports de produção do modelo de próximas ações.
- [componentes.json](evidencias/componentes.json): transpila TSX real com `typescript` já instalado; representa JSX como árvore, simula hooks e serviços; executa ramo de página e submissão do formulário. A página solicitada com Radar lê Seleção; o rascunho submetido não contém oportunidade nem público de origem. Sem React DOM, navegador autenticado ou banco: não é evidência visual de layout.
- `requestId` da fixture pode variar a cada execução. Todos os IDs de negócio dessas evidências são sintéticos.

## Testes existentes executados

```bash
node --experimental-strip-types packages/web/test/admin-query-aliases.test.mjs
node --experimental-strip-types packages/web/test/curation-workflow.test.mjs
node --experimental-strip-types packages/web/test/cockpit-view-model.test.mjs
node --experimental-strip-types packages/web/test/curation-benchmark.test.mjs
node --experimental-strip-types packages/web/test/triage-value.test.mjs
npm run test:triage-price --prefix tools/editorial-tests
npm run test:cockpit --prefix tools/editorial-tests
```

| Comando / log | Resultado |
|---|---|
| [admin-query-aliases](evidencias/admin-query-aliases.log) | 9/9; não contém caso Radar |
| [curation-workflow](evidencias/curation-workflow.log) | 1/1 |
| [cockpit-view-model](evidencias/cockpit-view-model.log) | 6/6; função isolada, não navegação |
| [curation-benchmark](evidencias/curation-benchmark.log) | 5/5; dataset de 50, IA simulada |
| [triage-value](evidencias/triage-value.log) | 7/7 |
| [triage-price](evidencias/triage-price.log) | 22 cenários; PGlite isolado |
| [cockpit](evidencias/cockpit.log) | 7 cenários; serviços comerciais em PGlite, não browser |

Uma execução inicial conjunta com `node --test` reportou apenas cinco arquivos como unidades no ambiente. Para obter contagens auditáveis, cada arquivo foi executado diretamente; os logs individuais acima são a evidência adotada. Não somar as duas execuções como cobertura diferente.

## Inspeção visual disponível

Ferramenta de navegador, aba temporária sem sessão: tentativa em `http://localhost:3100/admin/curadoria?aba=radar` resultou em `http://localhost:3100/entrar?next=%2Fadmin%2Fcuradoria`, título “Entrar | BizuMiner” e botão “CONTINUAR COM GOOGLE”. Nenhum login ou ação de negócio foi executado. O campo `browser` de `probes.json` transcreve essa observação da ferramenta, não uma navegação efetuada pelo script.

## Leituras discriminantes

```bash
rg -n 'radar|ABA_ALIASES|resolveActiveId' packages/web/lib/admin-query-aliases.ts packages/web/app/_components/admin-shell.tsx packages/web/app/admin/curadoria/page.tsx
rg -n 'opportunityId|productId|Preparar no Cockpit' packages/web/app/admin/direcionamento/radar-view.tsx packages/web/app/admin/campanhas/page.tsx packages/web/app/admin/campanhas/workspace.tsx packages/web/lib/commercial-workflow.ts
rg -n 'cockpit-view-model|determineCockpitNextAction' packages/web/app packages/web/lib packages/web/bin
rg -n 'schemaVersion|latestAssessments' packages/web/lib/editorial-selection-db.ts packages/web/lib/rubric-db.ts
rg -n 'order by|queued_at|last_seen_at' packages/web/lib/curation-db.ts packages/web/lib/triage-candidates-db.ts packages/web/lib/opportunity-db.ts
```

Preservação final: [preservacao.json](evidencias/preservacao.json). O manifesto inicial completo está em `/tmp/bizuminer-fluxo-unico/baseline.json`; o relatório permanente contém seu hash e os hashes dos fontes inventariados. Mudanças prévias do working tree não foram sobrescritas ou atribuídas a esta investigação.
