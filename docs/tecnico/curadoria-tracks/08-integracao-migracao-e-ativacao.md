# T08 Integração, migração e ativação gradual

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F8**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T00](00-reconciliacao-e-base-de-verificacao.md), [T01](01-fatos-persistencia-e-ingestao.md), [T02](02-avaliacao-referencias-e-score.md), [T03](03-selecao-promocao-e-validade-publica.md), [T04](04-recaptura-planner-e-listagens.md), [T05](05-recaptura-pdp-e-recuperacao.md), [T06](06-pauta-slots-e-envio-manual.md), [T07](07-acompanhamentos-excecoes-e-operacao.md)

**Situação de entrada:** Esta é a validação e ativação do mesmo objetivo. Nenhuma caixa de conclusão é preenchida apenas pela organização das specs ou por build/typecheck.

## Resultado observável

A capacidade integrada é comprovada no escopo autorizado e ativada por conta/fonte com medição e retorno seguro, sem misturar sucesso local com produção.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 16: Etapas de implementação e dependências](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências).
- [Seção 17: Migração, ativação e retorno seguro](../plano-integracao-captura-curadoria-vitrine-pauta.md#17-migração-ativação-e-retorno-seguro).
- [Seção 18: Verificação por capacidade e cenários de falha](../plano-integracao-captura-curadoria-vitrine-pauta.md#18-verificação-por-capacidade-e-cenários-de-falha).
- [Seção 19: Métricas, ganhos esperados e limite de custo](../plano-integracao-captura-curadoria-vitrine-pauta.md#19-métricas-ganhos-esperados-e-limite-de-custo).
- [Seção 20: Critério de conclusão e riscos residuais](../plano-integracao-captura-curadoria-vitrine-pauta.md#20-critério-de-conclusão-e-riscos-residuais).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [package.json](../../../tools/editorial-tests/package.json) — `tools/editorial-tests/package.json`.
- [capture-publication-native.test.ts](../../../tools/editorial-tests/capture-publication-native.test.ts) — `tools/editorial-tests/capture-publication-native.test.ts`.
- [capture-publication-journey-native.test.ts](../../../tools/editorial-tests/capture-publication-journey-native.test.ts) — `tools/editorial-tests/capture-publication-journey-native.test.ts`.
- [pauta-cache-native.test.ts](../../../tools/editorial-tests/pauta-cache-native.test.ts) — `tools/editorial-tests/pauta-cache-native.test.ts`.
- [extension-manual-native.test.ts](../../../tools/editorial-tests/extension-manual-native.test.ts) — `tools/editorial-tests/extension-manual-native.test.ts`.
- [inspect-capture-runtime.ts](../../../packages/web/bin/inspect-capture-runtime.ts) — `packages/web/bin/inspect-capture-runtime.ts`.
- [contrato-integracao-supabase-vps.md](../../../docs/tecnico/contrato-integracao-supabase-vps.md) — `docs/tecnico/contrato-integracao-supabase-vps.md`.
- [plano-execucao-capturas-pauta.md](../../../docs/tecnico/plano-execucao-capturas-pauta.md) — `docs/tecnico/plano-execucao-capturas-pauta.md`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [ ] **T08.01** — Integrar os aceites locais das tracks e executar a matriz de cenários da seção 18, com duas contas, concorrência, falta de dados, relógio avançado e revogação. *(Base verificada em PGlite via `curation-t01-t02-v2.test.ts`, `curation-journey-t03-t08-v2.test.ts`, `curation-selection-v2.test.mjs` e suítes dos pacotes com adapters simulados; permanecem pendentes os aceites locais de `T03.07`, `T04.07`–`T04.10`, `T05.01`, `T05.03`, `T06.10` e `T07.03`–`T07.06`/`T07.08`.)*
- [ ] **T08.02** — Exercitar o percurso navegador → observação → banco → avaliação → disputa → pedido → conferência → edição → pauta → confirmação, incluindo reabertura e vencimento. *(Percurso backend/DB e rota HTTP `/api/extension/observations` exercitados em PGlite com transporte/adapters simulados; orquestração real na extensão e UI interativa seguem pendentes.)*
- [ ] **T08.03** — Conferir diferenças aditivas de migração, compatibilidade de extensão/leitores, backfills limitados e proteção de histórico, vetos e links já enviados. *(Cadeia aditiva validada em PGlite do zero + builds/typechecks de extensão e web; em 14/11, migrations/backfill aplicados ao Supabase usado pelo localhost, com pauta autenticada HTTP 200 e conferência no navegador. Aplicação na VPS e ensaios completos no destino permanecem pendentes; esse banco não comprova `T00.02`/`T01.09` na VPS.)*
- [ ] **T08.04** — Preparar configuração de modo de comparação, cotas, política, horários e comandos de ativação/retorno; interromper produtores legados sobrepostos no destino da operação. *(Workflows legados bloqueados localmente e documentação operacional atualizada; aplicação de env/flags e conferência de desligamento no destino pendentes.)*
- [ ] **T08.05** — Executar o ensaio real autorizado por fonte, distinguindo chamadas de loja/IA, sessão da extensão, fixtures e imagem instalada. Ausência de escopo remoto mantém essa parte pendente, sem impedir verificação local.
- [ ] **T08.06** — Ativar canário por conta/fonte quando o contrato correspondente estiver demonstrado. Shopee pode entrar antes; MVP DOM de listagem informa resíduo e não promete PDP antes da T05.
- [ ] **T08.07** — Conferir validade em todas as rotas, caches, artes e ações após expiração; ensaiar retorno de política sem ressuscitar oferta antiga ou fonte proibida.
- [ ] **T08.08** — Medir a janela controlada e comparar qualidade/custo com a base da T00; registrar escassez e limitações em vez de exigir preencher todas as vagas.
- [ ] **T08.09** — Atualizar situação de cada track com evidências, distinguir local/instalado/ativado/ensaio real e entregar o resultado funcional e pendências específicas no plano central. *(Plano e tracks atualizados com a etapa local; entrega definitiva de ativação depende de T08.04–T08.08 no destino.)*

## Como demonstrar a conclusão

- Cada fonte ativada possui uma jornada completa comprovada; adapters simulados não são apresentados como loja real.
- Expiração, restart e rollback mantêm o gate factual e os envios permanentes; nenhum dado cruza contas.
- Testes apropriados, typechecks e build passam para o escopo alterado; falha relevante permanece explicitamente pendente.
- Demanda, orçamento e capacidade são medidos; ganhos de clique/venda não são inventados.
- Permissões, migrações e ativação são conferidas no destino autorizado; a entrega informa as condições que ainda dependem de navegador/API.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Conclui o objetivo quando não houver capacidade obrigatória pendente no escopo acordado. Um canário parcial ou uma track pronta não equivale a todo o pipeline entregue.
