# T00 Reconciliação e base de verificação

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F0**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** Nenhuma; entrada do objetivo.

**Situação de entrada:** Há implementação anterior e avanços locais incompletos. Esta organização não homologa esses avanços nem repete o trabalho já comprovado.

## Resultado observável

O implementador sabe qual comportamento está ativo, o que existe apenas localmente e qual é a próxima tarefa executável, com uma base de testes segura para continuar.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 1: Resultado funcional e limites](../plano-integracao-captura-curadoria-vitrine-pauta.md#1-resultado-funcional-e-limites).
- [Seção 3: Base existente a aproveitar e diferenças a reconciliar](../plano-integracao-captura-curadoria-vitrine-pauta.md#3-base-existente-a-aproveitar-e-diferenças-a-reconciliar).
- [Seção 17: Migração, ativação e retorno seguro](../plano-integracao-captura-curadoria-vitrine-pauta.md#17-migração-ativação-e-retorno-seguro).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [plano-execucao-capturas-pauta.md](../../../docs/tecnico/plano-execucao-capturas-pauta.md) — `docs/tecnico/plano-execucao-capturas-pauta.md`.
- [capture-dispatch.ts](../../../packages/web/lib/capture-dispatch.ts) — `packages/web/lib/capture-dispatch.ts`.
- [capture-batch-worker.ts](../../../packages/web/lib/capture-batch-worker.ts) — `packages/web/lib/capture-batch-worker.ts`.
- [monitoring-policy.ts](../../../packages/persistence/src/monitoring-policy.ts) — `packages/persistence/src/monitoring-policy.ts`.
- [monitoring-lookup.ts](../../../packages/persistence/src/monitoring-lookup.ts) — `packages/persistence/src/monitoring-lookup.ts`.
- [ai-curation-v2-contract.ts](../../../packages/web/lib/ai-curation-v2-contract.ts) — `packages/web/lib/ai-curation-v2-contract.ts`.
- [curation-score-v2.ts](../../../packages/web/lib/curation-score-v2.ts) — `packages/web/lib/curation-score-v2.ts`.
- [package.json](../../../tools/editorial-tests/package.json) — `tools/editorial-tests/package.json`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T00.01** — Inventariar alterações locais e produtores de captura, reconsulta, triagem, seleção e manutenção; identificar a conta e o destino de cada configuração, sem imprimir segredos. *(Concluído no inventário local do repositório.)*
- [ ] **T00.02** — Conferir as migrações existentes e distinguir arquivo local, aplicação no banco e versão instalada. Registrar lacunas do destino sem usar o banco de desenvolvimento como prova da VPS. *(PGlite validado; em 14/11, 20 migrations pendentes reconciliadas e aplicadas ao Supabase usado pelo localhost após autorização. Banco/VPS e versão instalada da extensão ainda não certificados; ver registro operacional no plano central.)*
- [x] **T00.03** — Conferir os bloqueios locais de AliExpress por API, a retirada da formação de histórico e a triagem sem rejeição por baixo apelo. Preservar o que estiver correto e localizar consumidores legados ainda incompatíveis. *(Conferido no código local e protegido por suítes locais.)*
- [x] **T00.04** — Identificar workflows e timers sobrepostos, especialmente GitHub Actions e qualquer chamada de servidor às lojas DOM. Preparar a substituição pelo executor existente, respeitando o destino autorizado. *(Workflows legados bloqueados localmente e `monitoring-plan.ts` corrigido para `amazon` como navegador.)*
- [x] **T00.05** — Levantar a compatibilidade das versões de captura manual/extensão, modos habilitados, permissões e procedimentos de volta à versão anterior. *(Contrato v2 compatível com captura manual, build e `verify:manifest` da extensão aprovados localmente.)*
- [x] **T00.06** — Preparar fixtures reaproveitáveis com duas contas, quatro lojas, configurações diferentes, preços estáveis/alterados, evidência vencida, veto humano e relógio controlado. *(Fixtures determinísticas com duas contas em PGlite em `tools/editorial-tests/curation-t01-t02-v2.test.ts` e `tools/editorial-tests/curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T00.07** — Executar somente as verificações locais pertinentes para obter uma base de comparação; separar falhas preexistentes das introduzidas e distinguir adapters simulados de chamadas reais. *(Typechecks, testes unitários dos 4 pacotes, `test:egress`, `pauta-live-flow`, builds e suítes PGlite executados; provedores/lojas permanecem simulados localmente.)*
- [x] **T00.08** — Atualizar o índice do plano com a situação reconciliada das tracks e a primeira tarefa pendente. Continuar na T01 quando houver autorização de implementação do objetivo. *(Situação atualizada em `docs/tecnico/plano-integracao-captura-curadoria-vitrine-pauta.md`.)*

## Como demonstrar a conclusão

- Inventário aponta cada caminho de escrita/seleção e seu estado local ou instalado; nenhum produtor relevante fica sem responsável.
- Fixtures distinguem ausência em listagem, preço inválido e indisponibilidade confirmada; o relógio pode ser avançado sem aguardar horas reais.
- Resultados de testes possuem comando, saída e escopo; arquivos existentes sem teste não aparecem como capacidade concluída.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega à T01 o mapa de escritores e identidades; às demais tracks, fixtures, limitações do ambiente e avanços que devem ser integrados. Não exige outro documento de planejamento.
