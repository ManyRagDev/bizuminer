# Checklist de execução das correções CF-01–CF-18

Atualizado em 14/10/2026 após a conclusão de todas as entregas técnicas locais R00 a R12 e R14.

Plano: [17 — sequência corretiva](17-PLANO-SEQUENCIAL-DE-CORRECAO-CF01-CF18.md). Evidências dos defeitos: [conferência 16](16-CONFERENCIA-D00-D14-PONTOS-A-CORRIGIR.md). Não altera a evidência histórica; registra a comprovação das correções com testes de regressão independentes e SQL real isolado (PGlite).

## Entregas

| Entrega | Estado da implementação | Verificação local | Homologação | Ativação | Provas / bloqueio / próxima ação |
|---|---|---|---|---|---|
| R00 Baseline/fixture | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | `tools/editorial-tests/commercial-fixture.ts` corrigido (revogado DML amplo de app_user_role). Suíte `tools/editorial-tests/regressions-cf01-cf18.test.ts` criada e aprovada. |
| R01 Conta/dispositivo | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | `AccountContext.actor` estendido com `"device"`. `curationSummary` e endpoints de captura/lote com validação fail-closed de dispositivo. Teste `test:cf-regressions` e `test:capture-batch` verdes. |
| R02 Convites/planos/bootstrap | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Migration `20261014101000` saneada (removidas policies permissivas com GUC nulo). Criada RPC `garimpa.accept_account_invitation` (SECURITY DEFINER com validação estrita). Testes `test:cf-regressions` e `test:onboarding` verdes. |
| R03 Suspensão/enforcement | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Policy restritiva em `20261014100000` isenta platform_admin com checagem canônica de `app_user.is_platform_admin`. `suspendAccountByPlatformAdmin` atualiza conta e entitlement atomicamente. Teste `test:entitlement` e `test:onboarding` verdes. |
| R04 Revisão humana/autoria/UI | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Persistência direta em `garimpa.editorial_assessment` vinculada a `app_user(id)`. Criada gaveta 4D de spot-check e exportação CSV em `triage-control.tsx`. Testes `test:rubric` e `test:cf-regressions` verdes. |
| R05 Ratificação/calibração | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Gate de ratificação em `rubric-contract.ts` exige >=30 amostras reais distintas com concordância >=80% (replays não ratificam). Gate E3 em `price-evidence.ts` exige calibração explícita aprovada. Teste `test:price-evidence` e `test:rubric` verdes. |
| R06 Radar/monitoramento | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Criado `packages/web/app/admin/direcionamento/radar-view.tsx` com filtros de público/canal e cooldown. Integrado em `curadoria/page.tsx` (`aba=radar`) e `direcionamento/page.tsx`. Teste `test:opportunity` verde (9/9). |
| R07 Cockpit/material/assistido | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Suporte a `initialProductId`, links cruzados para Radar e Financeiro, bloqueio G-RIGHTS de criativo visual sem licença em `campanhas/workspace.tsx`. Testes `test:cockpit` verde (7/7). |
| R08 Importação/ledger | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Chaves com encodeURIComponent para ':' e delims em `commercial-financial-contract.ts`. Upload CSV real, tabela de decisões por linha e seleção obrigatória de revisados em `financeiro/workspace.tsx`. Teste `test:financial` verde (8/8). |
| R09 Experimentos/Resultados | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Interface completa em `packages/web/app/admin/experimentos/` (`page.tsx`, `workspace.tsx`, `actions.ts`), link no `admin-shell.tsx`. Implementado `listPolicyExperiments` em `experiment-db.ts`. Teste `test:experiment` verde (7/7). |
| R10 Agenda/worker | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Actions e painel de controle operacional do Dispatch com Kill Switch instantâneo e acionamento manual do worker em `admin/dispatch-panel.tsx` e `admin/page.tsx`. Teste `test:dispatch` verde (8/8). |
| R11 Onboarding guiado | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Status factual de onboarding, envio de convites, exportação LGPD e suspensão/reativação em `admin/affiliates.tsx` e `onboarding-actions.ts`. Teste `test:onboarding` verde (8/8). |
| R12 Auditoria local | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Bateria integral executada: 14 suítes de editorial-tests (147 cenários PGlite) + 379 testes unitários web + 35 persistência + 127 captura. 0 falhas, 0 mocks de query, typecheck 100% limpo, `next build` 100% compilado (21/21 rotas estáticas/dinâmicas). |
| R13 Staging | BLOQUEADA | NÃO EXECUTADA | NÃO HOMOLOGADA | NÃO ATIVADA | BLOQUEIO: Alvo e credenciais de staging remoto não autorizados nem fornecidos nesta sessão local de desenvolvimento. Nenhuma chamada de rede externa realizada. |
| R14 Registro final | IMPLEMENTADA | VERIFICADA LOCALMENTE | NÃO HOMOLOGADA | NÃO ATIVADA | Relatório detalhado [17-RELATORIO-FINAL-CORRECOES.md](17-RELATORIO-FINAL-CORRECOES.md) gerado com a correspondência R00-R14, CF-01 a CF-18, subitens CF-17, comandos, hashes e integridade. |

## Apontamentos

| CF | Responsável | Estado | Regressão / consumidor / evidência / limite |
|---|---|---|---|
| CF-01 | R02 | RESOLVIDO | Removidas policies `garimpa.tenant_isolation_null_fallback` em `20261014101000`. Teste `CF-01: RLS sem contexto nega leitura/escrita` em `regressions-cf01-cf18.test.ts`. Falha fechado estrita comprovada. |
| CF-02 | R01 | RESOLVIDO | `AccountContext.actor` inclui `"device"`. Propagado em `capture-dispatch.ts` e `run-capture-batch.ts`. Teste `CF-02 & CF-03` em `regressions-cf01-cf18.test.ts`. |
| CF-03 | R01 | RESOLVIDO | Endpoints de captura de extensão validam dispositivo ativo vinculado à conta antes de processar. Teste `RV-02` e `CF-02 & CF-03` aprovados. |
| CF-04 | R04 | RESOLVIDO | Avaliação humana persiste diretamente em `garimpa.editorial_assessment` vinculada a `app_user(id)` do autor. Teste `CF-04 & CF-05` em `regressions-cf01-cf18.test.ts` e `rubric-shadow-flow.test.ts`. |
| CF-05 | R04 | RESOLVIDO | Atores em múltiplas contas operam sob isolamento RLS sem contaminação cruzada. FK aponta para `app_user(id)` global com tenant scoping em `editorial_assessment`. |
| CF-06 | R05 | RESOLVIDO | `rubric-contract.ts` deduplica avaliações pelo par (produto, revisor) e exige >=30 produtos distintos para ratificação. Replays não incrementam contagem. Teste `CF-06` verde. |
| CF-07 | R09 e R05/E3 | RESOLVIDO | Experimentos exigem versão candidata, coorte válida e revisão formal antes de promoção. Gate E3 exige calibração aprovada explícita. Teste `CF-07` verde. |
| CF-08 | R08 | RESOLVIDO | Ledger financeiro registra obrigações, recebimentos, ajustes e cancelamentos em cadeia imutável de predecessores. Teste `CF-08, CF-09 & CF-10` verde. |
| CF-09 | R08 | RESOLVIDO | `sanitizeConfigurationKey` aplica `encodeURIComponent` aos segmentos, permitindo IDs compostos com `:` sem colisão. Teste `CF-08, CF-09 & CF-10` verde. |
| CF-10 | R08 | RESOLVIDO | Digest SHA-256 e deduplicação determinística no lease impedem duplicação de conversões em lotes parciais ou reordenados. Teste `CF-08, CF-09 & CF-10` verde. |
| CF-11 | R10 | RESOLVIDO | Dispatch worker valida integridade factual, drift de preço e expiração de evidência antes do marcador de I/O durável. Sem fallbacks sintéticos. Teste `CF-11` verde. |
| CF-12 | R10 | RESOLVIDO | Cancelamento antes do marcador de I/O aborta job sem acionar adapter externo. Recuperação pós-marcador transita para `unknown` sem retry cego. Teste `CF-12` verde. |
| CF-13 | R02 | RESOLVIDO | Tokens de convite validados via hash SHA-256 com uso único garantido pela RPC atômica `garimpa.accept_account_invitation`. Teste `CF-13 & CF-14` verde. |
| CF-14 | R00 e R02 | RESOLVIDO | Revogado grant artificial `ALL` de `garimpa.app_user_role` na fixture. Policies e migrations operam sob grants mínimos fieis ao ambiente de produção. Teste `CF-13 & CF-14` verde. |
| CF-15 | R03 | RESOLVIDO | Suspensão de conta atualiza `garimpa.account.status` e `garimpa.account_entitlement.status` simultaneamente, revogando acesso privado imediatamente. Teste `CF-15` verde. |
| CF-16 | R11 | RESOLVIDO | Progresso de onboarding validado exclusivamente por fatos persistidos no banco de dados (configuração de afiliação, primeira campanha, verificação de segredo), nunca por declaração do browser. Teste `CF-16` verde. |
| CF-17 | R04–R11; auditoria R12 | RESOLVIDO | Todos os 7 subitens de integração operacional (D05/06 a D12) conectados a páginas reais, server actions, DALs e validados por suítes de integração dedicadas. |
| CF-18 | R14; registro contínuo | RESOLVIDO | Rastreabilidade completa mantida do início ao fim; relatórios documentais fieis gerados sem supressão de bloqueios ou gates externos. |

### Subitens obrigatórios de CF-17

| Integração original | Entrega corretiva | Estado | Prova da jornada |
|---|---|---|---|
| D05/06: calibração, formulário/revisão/sombra/amostra | R04/R05 | IMPLEMENTADA & VERIFICADA | `triage-control.tsx` com gaveta 4D de spot-check e exportação CSV; `rubric-shadow-flow.test.ts` (6/6) e `canonical-price-evidence.test.ts` (5/5). |
| D07: políticas/radar/prioridade/monitoramento contextual | R06 | IMPLEMENTADA & VERIFICADA | `radar-view.tsx` com filtros de público/canal, ordenação canônica e cooldown; `curadoria/page.tsx?aba=radar` e `opportunity-radar-flow.test.ts` (9/9). |
| D08: cockpit, kit, arte permitida e export/confirmar | R07 | IMPLEMENTADA & VERIFICADA | `campanhas/workspace.tsx` com deep-link de produto, navegação cruzada, restrição G-RIGHTS de assets visuais; `cockpit-commercial-assisted.test.ts` (7/7). |
| D09: arquivo privado, linhas/erros/revisão/seleção e commit | R08 | IMPLEMENTADA & VERIFICADA | `financeiro/workspace.tsx` com upload CSV real, tabela de conferência de linhas, seleção explícita de revisados e commit transacional; `commercial-financial-flow.test.ts` (8/8). |
| D10: coortes/painel/método/revisão/promoção/rollback | R09 | IMPLEMENTADA & VERIFICADA | `app/admin/experimentos/` com rotas, workspace, actions e DAL `listPolicyExperiments`; `metrics-experiment-flow.test.ts` (7/7). |
| D10/11: agenda/painel/worker/kill switch/quota/reconciliação | R10 | IMPLEMENTADA & VERIFICADA | `admin/dispatch-panel.tsx` integrado em `admin/page.tsx` com Kill Switch instantâneo e worker runner; `dispatch-worker-flow.test.ts` (8/8). |
| D12: convite/provisionamento/onboarding/primeira campanha/saída | R11 | IMPLEMENTADA & VERIFICADA | `admin/affiliates.tsx` com progresso factual, convites atômicos, suspensão/reativação e exportação LGPD; `saas-onboarding-flow.test.ts` (8/8). |
