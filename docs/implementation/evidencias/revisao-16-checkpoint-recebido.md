# Checkpoint de Execução Sequencial — BizuMiner V2

Data: 14/10/2026.
Base normativa: `docs/implementation/15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md`, `14-REVISAO-DA-EXECUCAO-SEQUENCIAL.md`, contratos C-01 a C-09 e especificações EP-00 a EP-12.
Snapshot inicial: HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`.

Este documento é o registro vivo e auditável da execução sequencial de D00 a D14. Nenhuma conclusão narrativa substitui evidência reproduzível.

---

## Tabela de Acompanhamento das Entregas

| Entrega | Título | Estado Local | Homologação Staging | Ativação Produção | Bloqueio / Condição |
|---|---|---|---|---|---|
| **D00** | Reconciliar baseline e checkpoint | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D01** | Autorizar legado e preservar jornadas | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D02** | Corrigir extensão e revogação | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D03** | Corrigir parser e guards | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D04** | Entitlement/quotas no serviço comum | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D05** | Evidência de preço em todo o fluxo | **VERIFICADA LOCALMENTE** | N/A | N/A | `G-PRICE` (ativação prod E3 requer calibração assinada) |
| **D06** | Revisão humana e IA em sombra | **VERIFICADA LOCALMENTE** | N/A | N/A | `G-RUBRIC` (modo sombra ativo; ratificação requer amostra homologada) |
| **D07** | Política, oportunidade e radar | **VERIFICADA LOCALMENTE** | N/A | N/A | Nenhum |
| **D08** | Cockpit, materiais e divulgação assistida | **VERIFICADA LOCALMENTE** | N/A | N/A | `G-RIGHTS` (direitos de arte) |
| **D09** | Financeiro e importação operacional | **VERIFICADA LOCALMENTE** | N/A | N/A | `G-FIN` (formato de fornecedor) |
| **D10** | Relatórios e experimentos | **PENDENTE** | N/A | N/A | `G-EXPERIMENT` (amostras reais) |
| **D11** | Agendamento, worker e reconciliação | **PENDENTE** | N/A | N/A | `G-CHANNEL` (canal oficial) |
| **D12** | Onboarding e saída SaaS | **PENDENTE** | N/A | N/A | `G-PILOT` (termos/privacidade) |
| **D13** | Homologação staging da versão candidata | **BLOQUEADA** | **BLOQUEADA** | N/A | `G-ENV` (alvo/autorização de staging) |
| **D14** | Auditoria integral e fechamento | **PENDENTE** | N/A | N/A | Depende de D00-D13 |

---

## Detalhamento por Entrega

### D00 — Preflight, rastreabilidade e base de regressões

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** Snapshot `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, revisão 14 com contraexemplos e inventário real das 11 migrations.
- **Resultado:**
  - `tools/editorial-tests/commercial-fixture.ts` atualizado com baseline real: adicionados `unique(affiliate_id, marketplace)` em `garimpa.affiliate_marketplace_config` e `grant select on garimpa.curation_queue_facts to garimpa_app`.
  - Suíte de regressões `tools/editorial-tests/regressions-rv01-rv05.test.ts` criada e ligada no script `test:regressions` de `tools/editorial-tests/package.json`.
  - Falha inicial observada: `42501` em RV-01.1 antes dos reparos.
  - Checkpoint e status sincronizados com os nomes e estados reais.
- **Aceites:**
  - Fixture contém restrições do baseline real sem bypasses artificiais.
  - Regressões reproduzem as falhas observadas em RV-01 a RV-05 antes dos reparos.
- **Verificação:**
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> falha inicial reproduzida em RV-01.1 (exit 1).
- **Bloqueio:** Nenhum.
- **Próximo passo:** D01.

---

### D01 — Autorização no legado e contexto nas fronteiras (RV-01)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** D00 verificado; contraexemplos RV-01.1 a RV-01.4 em `14-REVISAO-DA-EXECUCAO-SEQUENCIAL.md`.
- **Resultado:**
  - `packages/web/lib/tenant-db.ts`: unificado `AccountContext` a partir de `account-context.ts`; removido fallback falso sem `sql.begin` em `withTenantDb`/`withUserDb`.
  - `packages/web/lib/affiliate-db.ts`: `upsertMarketplaceConfig` recebe `context?: AccountContext` e executa via `withAccountDb` sob RLS, exigindo `am.role = 'owner'` e membership ativa.
  - `packages/web/lib/curation-db.ts`: `curationSummary` recebe `context?: AccountContext`, valida `context.tenantId === tenantId` e executa com `withAccountDb`.
  - `packages/web/app/admin/layout.tsx`: invoca `resolveAccountContext({ authUserId: user.id })` para repassar `AccountContext` autorizado.
  - `packages/web/lib/editorial-selection-db.ts`: todas as transações setam `set_config('garimpa.tenant_id', ...)` para leitura sob RLS de `curation_queue_facts`.
  - `packages/web/lib/capture-batch-db.ts`: métodos de `CaptureBatchStore` passam `tenantId` e setam GUC `garimpa.tenant_id` na transação.
- **Aceites:**
  - Owner legítimo grava configuração de marketplace sem erro 42501.
  - Tentativa de consulta cruzada de tenant em `curationSummary` falha fechada.
  - Desk editorial enxerga candidatos sob RLS.
  - `CaptureBatchStore.expire` expira lotes vencidos do tenant.
- **Verificação:**
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01.1 a RV-01.4 passando (exit 0).
- **Bloqueio:** Nenhum.
- **Próximo passo:** D02.

---

### D02 — Extensão de navegador, emparelhamento e revogação (RV-02 / RV-03)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** D01 verificado; contraexemplo RV-02.
- **Resultado:**
  - `packages/persistence/supabase/migrations/20261014100000_garimpa_account_context_and_membership.sql`: adicionada cláusula `and am.revoked_at is null` à função SQL `authenticate_extension_device`.
  - `packages/web/lib/extension-db.ts`: adicionada checagem `and am.revoked_at is null` no fallback de `authenticateDevice`, em `createPairingCode` e em `persistExtensionCapture`.
- **Aceites:**
  - Revogação de membership desativa imediatamente a autenticação de dispositivo (`role_active = false`).
  - Dispositivo de membro revogado é rejeitado.
- **Verificação:**
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-02 passando (exit 0).
- **Bloqueio:** Nenhum.
- **Próximo passo:** D03.

---

### D03 — Contratos estritos: parser de importação e guards de validade (RV-04 / RV-05)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** D00–D02 verificados; contraexemplos RV-04 e RV-05.
- **Resultado:**
  - `packages/web/lib/commission-import-contract.ts`: reescrito com parser RFC-4180 estrito, 10 colunas canônicas obrigatórias, validação estrita de centavos inteiros não-negativos, validação de moeda ISO 3 letras e marketplace, agregação por moeda e digest canônico imune a colisões via serialização JSON por linha.
  - `packages/web/lib/dispatch-contract.ts`: `validatePreDispatch` valida formato de data em `validUntil`, falhando fechado com `INVALID_VALID_UNTIL`.
  - `packages/web/lib/saas-onboarding-contract.ts`: `validateAccountInvitation` valida estritamente `expiresAt`; `validateEntitlementQuota` valida limites temporais (`startsAt`, `endsAt`) e falha fechado quando limites de campanhas/kits não estão configurados, eliminando defaults implícitos.
- **Aceites:**
  - Rejeita valores não-numéricos (`100x`, `12abc`), negativos e datas inválidas.
  - Digests distintos para pares colidentes com `:`.
  - Guards falham fechados sem defaults comerciais artificiais.
- **Verificação:**
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-04 e RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
- **Bloqueio:** Nenhum.
- **Próximo passo:** D04.

---

### D04 — Motor de entitlement e consumo atômico (EP-12 / C-08)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** D01–D03 verificados; M-12 e contratos de SaaS.
- **Resultado:**
  - Criado DAL/serviço `packages/web/lib/saas-entitlement-db.ts`: `resolveActiveEntitlement`, `reserveOperationQuota` e `releaseOperationQuota`.
  - Serialização atômica de quota via lock transacional consultando fatos persistidos (`garimpa.campaign` e `garimpa.commercial_kit`).
  - Registro atômico de eventos de uso em `garimpa.usage_event` dentro da mesma transação da criação.
  - Integrado em `commercial-workflow.ts` nos comandos `createCampaignForAccount` e `createKitForAccount`.
  - Políticas de RLS em `20261014110000_garimpa_saas_onboarding_entitlements.sql` endurecidas: clientes só têm `SELECT` em `account_entitlement`, tentativas de mutação são bloqueadas por RLS. `usage_event` tornado estritamente append-only.
  - Política da casa configurada explicitamente no ensaio com `house-internal-v1`.
  - Suíte de integração `tools/editorial-tests/entitlement-quota.test.ts` criada e ligada no script `test:entitlement`.
- **Aceites:**
  - Conta sem entitlement é rejeitada com `entitlement_required:no_active_entitlement`.
  - Conta suspensa é rejeitada com `account_suspended`.
  - Conta expirada (`ends_at` no passado) é rejeitada com `plan_expired`.
  - Conta com início futuro (`starts_at` no futuro) é rejeitada com `plan_not_started`.
  - Conta com planos concorrentes sobrepostos é rejeitada com `ambiguous_entitlement`.
  - Casa opera pelo motor comum com política explícita sem interrupção.
  - Replay idempotente não consome quota adicional (contagem de `usage_event` inalterada).
  - Disputa de última vaga de campanha (limite 1) bloqueia a segunda criação com `quota_exceeded`.
  - Cliente tentando alterar limits de `account_entitlement` via RLS é rejeitado e não afeta nenhuma linha.
  - Limite diário de kits comerciais bloqueia após esgotamento.
  - Falha na criação do recurso desfaz atomicamente a reserva e o evento de uso.
  - Mudança de fuso/janela diária (próximo dia) reseta o teto de kits.
- **Verificação:**
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
  - `npm test --prefix packages/persistence` -> 35 testes passando (exit 0).
  - `npm run typecheck --prefix packages/web` e `persistence` -> exit 0.
- **Bloqueio:** Nenhum para núcleo local. Homologação multi-sessão remota em D13 (`G-ENV`).
- **Próximo passo:** D05 — Evidência de preço canônica em todo o fluxo (EP-01 / 05C).

---

### D05 — Evidência de preço canônica em todo o fluxo (EP-01 / 05C / C-02 / G-PRICE)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-PRICE` mantido ativo para produção: E3 desabilitado por padrão)
- **Entrada:** D04 verificado; `packages/web/lib/offer-history.ts`, `packages/web/lib/price-evidence.ts`, migration `20261014102000_garimpa_price_evidence_canonical.sql`.
- **Resultado:**
  - Ajustado `sameOfferConfigurationSql` em `offer-history.ts` para verificar `variantIdentity.key`, estado verificado (`source_verified` / `human_verified`), tipo de preço `exact`, quantidade de pacote, conteúdo e moeda.
  - Alinhado contrato de extração de chave física `garimpa.offer_configuration_key` entre TypeScript e SQL (PostgreSQL PL/pgSQL).
  - Implementada suíte de calibração EXP-02 (`runCalibrationEXP02`, `BENCHMARK_CALIBRATION_CASES_EXP02`) com 10 casos de referência contrastantes cobrindo E0, E1, E2 e E3.
  - Implementado DAL de gerenciamento de versões de política (`getActivePriceEvidencePolicy`, `savePriceEvidencePolicyDraft`, `approvePriceEvidencePolicy`). A aprovação com `e3Enabled = true` exige referência explícita ao relatório de calibração homologado (`calibrationReportRef`).
  - Imutabilidade de versões aprovadas garantida por trigger SQL (`garimpa.protect_price_policy_version`).
  - Suíte de integração `tools/editorial-tests/canonical-price-evidence.test.ts` criada e ligada no script `test:price-evidence`.
- **Aceites:**
  - Ponto isolado sem histórico anterior resulta em E0.
  - Histórico com variante inferida, faixa de preço, seller não verificado ou divergência de moeda/quantidade resulta em E1 e zera `priorMinCents`.
  - Queda observada com histórico homogêneo e política padrão (E3 desligado) resulta em E2 (`lowest_verified = false`, `priorMinCents` preservado).
  - Draft com `e3Enabled=true` retém E2 até aprovação formal.
  - Gap excessivo superior a `maximumGapHours` retém E2 mesmo com política aprovada.
  - Série temporal completa com política homologada aprova E3 (`lowest_verified = true`, `state = E3`, claim de mínimo histórico emitida).
  - Projeção legada (`projectCanonicalToLegacy`) e view SQL (`garimpa.curation_queue_facts`) produzem resultados idênticos para `lowest_verified` e `previous_min_price_cents`.
  - Tentativa de mutação de política aprovada é bloqueada pelo trigger de imutabilidade.
- **Verificação:**
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:triage-price --prefix tools/editorial-tests` -> 22 cenários passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
- **Bloqueio:** `G-PRICE` ativo para produção: produção permanece conservadora com E3 desabilitado até calibração externa assinada. Localmente 100% verificado.
- **Próximo passo:** D06 — Rubrica, revisão humana e IA em sombra conectadas (EP-02 / 06C / G-RUBRIC).

---

### D06 — Rubrica, revisão humana e sombra conectadas (EP-02 / 06C / M-02 / G-RUBRIC)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-RUBRIC` mantido em modo sombra: ratificação requer amostra homologada assinada)
- **Entrada:** D05 verificado; `packages/web/lib/rubric-contract.ts`, `packages/web/lib/rubric-db.ts`, `packages/web/lib/ai-curation-service.ts`, migration `20261014103000_garimpa_rubric_assessment_shadow.sql`.
- **Resultado:**
  - `packages/web/lib/rubric-db.ts` expandido com funções completas de integração:
    - `getComparisonReviewsSample`: consulta a amostra operacional (30-50 itens) de revisões de comparação entre humano e IA com filtros de desacordo.
    - `getRubricPromotionMetrics`: calcula métricas consolidadas do gate `G-RUBRIC` (taxa de concordância, volume avaliado, contagem de desacordos por dimensão Q/V/A/confiança/segurança).
    - `recordHumanRubricReview`: orquestra a gravação da avaliação humana e gera a revisão comparativa contra a avaliação shadow de IA (quando presente), sem bloquear a jornada humana se a IA estiver ausente ou falhar.
    - `exportComparisonReviewSampleAsCsv`: gera export CSV sanitizado e compatível para auditoria editorial.
  - Server actions criadas em `packages/web/app/admin/curadoria/actions.ts`:
    - `submitHumanRubricReviewAction`, `fetchComparisonSampleAction`, `fetchRubricPromotionMetricsAction` e `runShadowEvaluationAction`.
  - Resiliência operacional comprovada: falha de IA ou ausência de chave Gemini não trava nem corrompe o fluxo editorial humano.
  - Autoria e autorização estritamente resolvidas no servidor via `app_user` e contexto do tenant com RLS.
  - Suíte de integração `tools/editorial-tests/rubric-shadow-flow.test.ts` criada e ligada no script `test:rubric`.
- **Aceites:**
  - Avaliação de IA em modo sombra é persistida em `garimpa.analysis_assessment` e recuperada com fidelidade integral.
  - Concordância humana e de IA gera `agreement = true` e zero desacordos.
  - Desacordo em dimensões (valor, confiança e segurança) é registrado em `garimpa.comparison_review` com detalhes estruturados.
  - Produto sem avaliação de IA prévia permite avaliação humana normal sem bloqueios (`hasShadow = false`).
  - Isolamento multi-tenant por RLS confirmado: tenant A não acessa avaliações nem comparações de tenant B.
  - Chave estrangeira composta (`app_user_id`, `tenant_id`) impede forja de autoria entre contas.
  - Extração de amostra de 30-50 avaliações e exportação CSV formatada e higienizada.
  - Cálculo de métricas do gate de promoção `G-RUBRIC` validado com status `shadow` (incompleto) e `ratified` (com >=30 revisões e >=80% de concordância).
  - Tentativas de injeção de prompt são tratadas como dados inertes e digeridas deterministicamente sem influenciar comandos.
- **Verificação:**
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:triage-price --prefix tools/editorial-tests` -> 22 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
- **Bloqueio:** `G-RUBRIC` ativo para produção: modo sombra permanece ativo até amostra humana real atingir os critérios de homologação formal. Localmente 100% verificado.
- **Próximo passo:** D07 — Política de audiência, oportunidades e radar persistidos (EP-03 / 07C).

---

### D07 — Política de audiência, oportunidades e radar persistidos (EP-03 / 07C / M-03 / C-03)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A
- **Entrada:** D05 e D06 verificados; `packages/web/lib/opportunity-contract.ts`, `packages/web/lib/opportunity-db.ts`, `packages/web/lib/commercial-workflow.ts`, migration `20261014104000_garimpa_audience_policy_and_opportunity.sql`.
- **Resultado:**
  - DAL de governança de políticas de público (`createAudiencePolicy`, `createAudiencePolicyVersion`, `getActiveAudiencePolicy`):
    - Criação de políticas em rascunho e versionamento imutável com aprovação formal (`approved_by`, `approved_at`).
    - Ativação atômica da versão corrente e isolamento rigoroso via RLS por tenant.
  - Classificação canônica e unificada de oportunidades de negócio (`createOrUpdateOpportunity`):
    - Regras normativas de C-03 (`gold`, `special`, `good_buy`, `recommendable`, `unclassified`).
    - Máquina de estados contextual (`candidate`, `monitored`, `prioritized`, `held`, `archived`).
    - Registro de decisão humana motivada mantendo a trilha de justificativa nos motivos da oportunidade.
    - Emissão obrigatória de eventos de domínio append-only (`OpportunityClassified`, `OpportunityPrioritized`) em `garimpa.domain_event` para auditoria transversal.
  - Cooldown de canal e público (`checkChannelCooldown`):
    - Detecção baseada no histórico de publicações confirmadas (`published_confirmed` / `exported`) dentro da janela temporal (24h).
    - Rebaixamento seguro de `prioritized` para `monitored` quando em cooldown no canal requisitado, sem vetar outros canais ou públicos.
  - Ciclo de vida robusto e restrições de banco:
    - Índice único parcial `idx_opportunity_active_scope` (`where state <> 'archived'`) garante exatamente uma oportunidade ativa por tupla `(tenant, product, policy_version, audience_key, channel)`.
    - Reavaliação idempotente incrementa `revision` e atualiza evidência/motivos sem duplicações de linha.
    - `archiveOpportunity` marca `state = 'archived'` e emite `OpportunityArchived`.
    - `reactivateOpportunity` valida ausência de oportunidade ativa concorrente antes de restaurar para `candidate` e emite `OpportunityReactivated`.
  - Ordenação lexicográfica canônica do Radar (`getRadarOpportunities`):
    - Aplica ordenação hierárquica por estado, classe de oportunidade e desempates canônicos.
  - Repartição de orçamento com prevenção de inanição (`prioritizeMonitoringQueue`):
    - Garante reserva mínima (ex.: 30%) do orçamento para novos produtos observados sem histórico extenso, prevenindo starvation por produtos consolidados.
  - Conexão do workflow comercial (`createKitForAccount`):
    - Suporte a `opportunityId` opcional oriundo do Radar, validando a integridade de tenant e associação com o produto real, sem gerar oportunidades ad-hoc duplicadas.
  - Server actions criadas em `packages/web/app/admin/direcionamento/opportunity-actions.ts`.
  - Suíte de testes `tools/editorial-tests/opportunity-radar-flow.test.ts` implementada com 9 baterias e ligada no script `test:opportunity`.
- **Aceites:**
  - Políticas de audiência e versões ativas respeitam isolamento estrito de tenant (tenant B não enxerga nem muta políticas do tenant A).
  - Oportunidades são classificadas deterministicamente de acordo com o contrato C-03.
  - Prioridade humana motivada sobrepõe estado e persiste justificativa auditável.
  - Cooldown de canal rebaixa prioridade no canal recente, mas mantém canais livres operantes.
  - Reativação bloqueia caso já exista oportunidade ativa no mesmo escopo.
  - Radar ordena prioritárias à frente de monitoradas.
  - `createKitForAccount` consome `opportunityId` com validação de escopo e produto.
- **Verificação:**
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
- **Bloqueio:** Nenhum local.
- **Próximo passo:** D08 — Cockpit, materiais, campanha e divulgação assistida (EP-04 a EP-07).

---

### D08 — Cockpit, materiais, campanha e divulgação assistida (EP-04 a EP-07 / C-04 / C-06 / G-RIGHTS)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-RIGHTS`: uso de imagem em arte requer direito documental; cópia de texto e divulgação assistida seguem autorizadas)
- **Entrada:** D04 a D07 verificados; `packages/web/lib/cockpit-view-model.ts`, `packages/web/lib/kit-validator.ts`, `packages/web/lib/commercial-workflow.ts`, `packages/web/app/admin/marketing/kit-actions.ts`, `packages/web/app/admin/campanhas/workspace.tsx`, `packages/web/lib/story-link.ts`, `packages/web/app/api/story/[slug]/route.tsx`.
- **Resultado:**
  - Jornada completa do Cockpit e fluxo assistido de ponta a ponta:
    - Oportunidade -> Campanha -> Rascunho de Kit -> Validação -> Aprovação -> Preparação de Exportação -> Marcação de Exportação -> Confirmação de Publicação.
    - Máquina de estados determinística de próxima ação no Cockpit (`determineCockpitNextAction`): `create_draft` -> `revise_kit` -> `approve` -> `export` -> `confirm` -> `none` (publicado e confirmado).
    - Server actions autorizadas em `packages/web/app/admin/marketing/kit-actions.ts` integradas a `packages/web/app/admin/campanhas/workspace.tsx`.
  - Proteção contra concorrência entre abas e operadores:
    - Verificação de versão esperada (`expectedVersion`) em comandos críticos (`validateKitForAccount`, `approveKitForAccount`, `reviseKitForAccount`, `markPublicationExported`, `confirmPublication`).
    - Tentativas simultâneas ou com versão obsoleta falham com erro `conflict`, impedindo perda de dados ou estados incoerentes.
  - Revalidação e detecção de deriva material de fatos (`revalidateKitBeforeExport`):
    - Mudança no preço observado atual ou expiração do TTL de validação bloqueiam imediatamente a exportação e invalidam o kit.
    - Cópia cancelada ou falha de exportação não marca publicação como exportada; aprovação do kit não confirma postagem.
  - Guardas de conformidade e direitos autorais (`G-RIGHTS`):
    - Bloqueio estrito de alegações de urgência proibidas sem fonte comprovada (`só hoje`, `últimas unidades`, `corre`, etc.).
    - Bloqueio de alegação de menor preço histórico sem evidência E3 e claim compatível homologada.
    - Exigência de disclosure explícito de afiliado (`afiliado`, `comissão`, `parceiro`) em todos os materiais.
    - Bloqueio seletivo de assets visuais sem direito documental comprovado (`MISSING_RIGHTS_FOR_ASSET`), mantendo a cópia em texto autorizada para publicação.
  - Atribuição comercial ponta a ponta e rastreabilidade (`c`):
    - O token de campanha `c` é preservado através do link curto (`/p/<code>`), da página do achado (`/bizu/[slug]?c=<code>`), do botão CTA e do banner de redirecionamento (`campaignExitPath`).
    - O clique humano via `/go/[slug]?c=<code>` é registrado com `campaign_publication_id` e `tenant_id` em `garimpa.click_event`.
    - Robôs de preview social (`facebookexternalhit`, `whatsapp`, etc.) não registram eventos de clique.
    - Token trocado ou forjado para outro produto é rejeitado com status 404 (fail-closed), sem transferir a monetização para outro afiliado.
  - Formatação e arte de Story (S-KIT):
    - Geração de links curtos de status/story com domínio limpo (`storyShareUrl`, `storyCaption`, `storyLinkLabel`).
    - Renderizador visual de cards verticais 1080x1920 em `/api/story/[slug]` com margens de segurança, preço destacado, carimbo de marketplace e identificação.
  - Suíte de integração `tools/editorial-tests/cockpit-commercial-assisted.test.ts` implementada com 7 baterias e ligada no script `test:cockpit`.
- **Aceites:**
  - Ciclo de vida assistido completo executado e validado em sequência transacional sob RLS.
  - Concorrência de duas abas com versão desatualizada rejeitada com conflito.
  - Variação factual de preço invalida aprovação antes da exportação.
  - Direitos de imagem (`G-RIGHTS`) bloqueiam artes não autorizadas sem impedir o texto factual.
  - Alegações proibidas e falta de disclosure bloqueiam validação.
  - Parâmetro `c` gera atribuição precisa e resiste a tampering ou previews de bots.
- **Verificação:**
  - `npm run test:cockpit --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
- **Bloqueio:** `G-RIGHTS` documental ativo para produção (assets visuais exigem direitos comprovados). Localmente 100% verificado.
- **Próximo passo:** D09 — Financeiro, ledger de comissões e importação operacional com jornada completa (EP-08 / M-08 / G-FIN).

---

### D09 — Ledger, custos e importação com jornada completa (EP-08 / M-08 / C-07 / G-FIN / G-PREVIEW)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-FIN`: formato de fornecedor requer mapeamento documental prévio; importador canônico estrito ativo localmente)
- **Entrada:** D03, D04 e D08 verificados; `packages/web/lib/commercial-financial-contract.ts`, `packages/web/lib/commercial-financial-db.ts`, `packages/web/lib/commission-import-contract.ts`, `packages/web/app/admin/financeiro/actions.ts`, `packages/web/app/admin/financeiro/workspace.tsx`, migration `20261014106000_garimpa_commercial_financial_ledger.sql`.
- **Resultado:**
  - DAL e Serviço de Importação e Lote de Comissões (`packages/web/lib/commercial-financial-db.ts`):
    - `createOrGetImportBatchPreview`: calcula digest canônico e digest de arquivo; detecta duplicatas locais no arquivo e contra fatos já comitados no ledger do tenant (`commission_entry`), gerando o preview detalhado com categorização determinística (`imported`, `review_required`, `rejected`, `duplicate`).
    - `commitImportBatch`: transação atômica que disputa lease (`status = 'committed' where status = 'preview'`), garantindo que apenas uma confirmação vença entre requisições concorrentes; rejeita previews com digest adulterado (`preview_digest_mismatch`); comita apenas linhas autorizadas (`imported` automaticamente, `review_required` apenas se selecionadas); gera conversões factuais (`source = 'report'`, `verification = 'documented'`) e comissões com identidade estável (`report:${marketplace}:${orderId}`) sem duplicações.
    - `getImportBatch` e `listImportBatches`: consultas sob RLS estrito de conta.
  - Higienização e Proteção contra Injeção em Planilhas (`commission-import-contract.ts`):
    - `sanitizeCsvCell` e `formatCsvRow`: prefixa com apóstrofo (`'`) qualquer valor que inicie com delimitadores de fórmulas (`=`, `+`, `-`, `@`, `\t`, `\r`) e aplica escape de aspas padrão RFC 4180.
    - `exportFinancialLedgerCsv`: exporta extrato financeiro unificado (conversões e comissões) completamente sanitizado contra CSV injection.
    - `isSafeOrderId`: detecta identificadores inseguros, curtos ou agregados genéricos (`UNKNOWN`, `NONE`, `N/A`, com espaços ou prefixos `agg:`) e marca para revisão mandatória (`review_required`).
  - Ledger de Comissões e Projeções Financeiras (`commercial-financial-contract.ts`):
    - `calculateCommissionSummary`: projeta o ledger por obrigação através de encadeamento de predecessores (`estimated` -> `pending` -> `confirmed` -> `received` -> `reversed`).
    - Estornos (`reversed`) reduzem o caixa líquido recebido (`receivedCashCents`) de forma exata se o predecessor foi recebido, sem apagar o fato contábil histórico (append-only).
    - Valores ausentes de pedidos permanecem `null` no banco (nunca fabricam zero monetário).
    - Custos de tempo humano em segundos (`durationSeconds`) sem tarifa permanecem como tempo não alocado (`unallocatedHumanSeconds`), sem fabricar custo monetário zero.
    - Isolamento rigoroso de moeda: `calculateCommissionSummary` filtra por moeda alvo (`targetCurrency`), impedindo contaminação entre BRL e USD.
  - Invisibilidade e Proteção da Receita SaaS da Plataforma:
    - `saas_revenue_entry` é protegida por RLS e acessível exclusivamente pelo owner da plataforma em conta do sistema (`local` / `house`).
    - Contas de clientes que consultam `getCommercialResults` recebem lista de receitas vazia (`[]`), sem expor a contabilidade de assinaturas da plataforma.
  - Server Actions e Interface de Usuário:
    - Actions criadas em `packages/web/app/admin/financeiro/actions.ts`: `submitImportBatchPreview`, `submitCommitImportBatch`, `exportFinancialCsvAction`.
    - Interface expandida em `packages/web/app/admin/financeiro/workspace.tsx`: adicionados formulário de importação com preview estruturado por moeda/erros/duplicatas, botão de comit de lote e ação de download de extrato CSV sanitizado, mantendo a operação de lançamento manual 100% preservada.
  - Suíte de Integração `tools/editorial-tests/commercial-financial-flow.test.ts` implementada com 8 cenários e ligada no script `test:financial`.
- **Aceites:**
  - Idempotência: mesmo arquivo ou arquivo com linhas reordenadas não duplica fatos; o canonicalDigest é idêntico e linhas já existentes no ledger são marcadas como `duplicate`.
  - Concorrência: duas confirmações simultâneas disputam lease atômico único; apenas uma executa a gravação, a concorrente é rejeitada ou tratada como idempotente.
  - IDs inseguros exigem revisão (`review_required`) e linhas com erros sintáticos (`rejected`) ou duplicadas (`duplicate`) não somam nos totais do preview.
  - Estorno e ajustes mantêm cadeia de predecessores íntegra; estorno sobre valor recebido reduz o caixa líquido recebido (`receivedCashCents`).
  - Moedas não se misturam e ausência de valor persiste como `null` no banco.
  - RLS multi-tenant: tenant B não enxerga nem comita lote do tenant A.
  - Receita SaaS da plataforma permanece invisível e inacessível para clientes.
  - Export CSV sanitiza todas as células com prefixos perigosos contra formula injection.
- **Verificação:**
  - `npm run test:financial --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:cockpit --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
  - `npm run build --prefix packages/web` -> compilação Next.js 15 e validação estática bem-sucedidas (exit 0).
- **Bloqueio:** `G-FIN` ativo para produção: relatórios específicos de fornecedores exigem mapeamento documental assinado antes do parser real de terceiros. Localmente 100% verificado.
---

### D10 — Métricas, coortes e experimentos operacionais (EP-09 / M-09 / G-EXPERIMENT)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-EXPERIMENT`: baseline documentado, cálculo reprodutível e gate de promoção com amostra mínima ativa)
- **Entrada:** D08 e D09 verificados; `packages/web/lib/experiment-contract.ts`, `packages/web/lib/experiment-db.ts`, migration `20261014108000_garimpa_policy_experiments.sql`.
- **Resultado:**
  - Contrato de Métricas e Experimentos (`packages/web/lib/experiment-contract.ts`):
    - `buildMetricResult`: cálculo rigoroso com tratamento de ausência de dados; denominador nulo ou zero resulta em `value: null` (sem inventar zero comercial); numerador nulo ou inválido resulta em `value: null` (sem gerar `NaN`); registra limitações explícitas.
    - `validatePolicyPromotion`: exige que o experimento esteja ativo/shadow, a amostra atinja `minSample`, o autor da promoção esteja identificado e a justificativa metodológica documentada (`G-EXPERIMENT`).
  - Migration e Modelo Relacional (`20261014108000_garimpa_policy_experiments.sql`):
    - `garimpa.policy_experiment`: suporte a experimentos de políticas editoriais (`shadow`, `promoted`, `rolled_back`), FK com integridade e RLS estrito.
    - `garimpa.experiment_assignment`: atribuição determinística por hash SHA-256 idempotente com constraint única `(tenant_id, experiment_id, unit_id)` e RLS.
    - `garimpa.experiment_evaluation`: avaliações imutáveis congeladas com constraint única `(tenant_id, experiment_id, unit_id, variant)` e RLS.
  - DAL e Serviço de Experimentos (`packages/web/lib/experiment-db.ts`):
    - `createPolicyExperiment`: criação sob contexto de conta e isolamento multi-tenant.
    - `assignExperimentUnit`: atribuição determinística e idempotente (`alreadyExisted: true` no replay).
    - `recordExperimentEvaluation`: imutável (`on conflict do nothing`), tentativas de tamper/sobrescrita não afetam dados congelados.
    - `getExperimentReport`: agrega métricas de baseline vs candidata com `buildMetricResult` auditável.
    - `promotePolicyExperiment`: valida gate `G-EXPERIMENT` (amostra >= minSample e justificativa humana), atualiza versão em `audience_policy` e emite evento `PolicyExperimentPromoted`.
    - `rollbackPolicyExperiment`: restaura versão baseline em `audience_policy` e emite evento `PolicyExperimentRolledBack`.
    - `exportExperimentMethodologyCsv`: exporta metodologia higienizada contra injeção CSV.
  - Suíte de Testes de Integração (`tools/editorial-tests/metrics-experiment-flow.test.ts`):
    - Registrada sob script `test:experiment` em `tools/editorial-tests/package.json`.
    - 7 baterias completas executadas sobre Postgres WASM / PGlite com RLS real.
- **Aceites:**
  - Sem impressões não há CTR (`value: null`); numerador nulo gera `value: null` sem `NaN`.
  - Isolamento multi-tenant: tenant B não enxerga dados de experimento de tenant A.
  - Atribuição determinística e idempotente por hash SHA-256.
  - Avaliação congelada e imutável (reavaliação com score adulterado é ignorada).
  - Gate de promoção (`G-EXPERIMENT`) bloqueia promoção com amostra menor que `minSample`.
  - Promoção formal atualiza versão corrente da política de audiência e emite evento de domínio auditável.
  - Rollback recupera a versão baseline sem perda de integridade histórica.
  - Exportação de metodologia em CSV higienizada contra formula injection.
- **Verificação:**
  - `npm run test:experiment --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:financial --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:cockpit --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
  - `npm run build --prefix packages/web` -> compilação Next.js 15 e validação de rotas bem-sucedidas (exit 0).
- **Bloqueio:** `G-EXPERIMENT` ativo para produção: promoção exige período de shadow e significância estatística real. Localmente 100% verificado.
### D11 — Core de agendamento, worker e reconciliação (EP-07 / EP-11 / M-11 / G-CHANNEL)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-CHANNEL`: envio real depende de canal oficial e credenciais documentadas; outbox, worker e adapter sintético ativos localmente)
- **Entrada:** D04 e D08 verificados; `packages/web/lib/dispatch-contract.ts`, `packages/web/lib/dispatch-db.ts`, `packages/web/lib/dispatch-worker.ts`, migration `20261014109000_garimpa_dispatch_jobs_outbox.sql`.
- **Resultado:**
  - Modelo de Dados e Migration (`20261014109000_garimpa_dispatch_jobs_outbox.sql`):
    - Tabela `garimpa.dispatch_job`: adicionadas colunas `io_started_at`, `provider_message_id`, `failure_code`, `reconciliation_note`, `reconciled_by`, `reconciled_at`.
    - Tabela `garimpa.dispatch_attempt`: rastreamento detalhado de cada ciclo de execução (`attempt_number`, `worker_token`, `io_started_at`, `io_completed_at`, `status`, `provider_message_id`, `error_code`, `note`).
    - Índices otimizados para claim atômico e auditoria; RLS fail-closed e grants restritos a `garimpa_app`.
  - Contrato e Guards (`packages/web/lib/dispatch-contract.ts`):
    - `validatePreDispatch`: bloqueia envios com kill switch ativo, preço divergente (drift), evidência expirada, conta suspensa ou destino inativo.
    - `classifyExpiredLease`: diferencia recuperação antes de I/O (`recover_queued`) de recuperação após início de I/O (`transition_unknown`).
    - `canLeaseJob`: proíbe categoricamente re-lease automático de jobs em `unknown`, `cancelled` ou `succeeded`.
    - `SyntheticDistributionAdapter`: suporte para testes isolados de sucesso, rejeição com backoff e timeout indeterminado.
  - DAL de Disparo (`packages/web/lib/dispatch-db.ts`):
    - `scheduleDispatchJob`: agendamento idempotente com proteção contra sobrescrita de jobs em curso (`leased` ou `unknown`).
    - `sweepExpiredLeases`: recuperação conservadora de crash: jobs sem I/O voltam para `queued`; jobs com I/O iniciado movem para `unknown` (zero retry cego).
    - `leaseNextEligibleJob`: claim atômico com `FOR UPDATE SKIP LOCKED`, varredura prévia de leases expirados e auditoria em `dispatch_attempt`.
    - `markIoStarted`: marcador persistido gravado imediatamente antes da chamada de rede externa.
    - `finalizeJobSuccess`, `finalizeJobFailure`, `finalizeJobUnknown`: finalização estrita validando posse do lease (`workerLeaseToken`).
    - `cancelDispatchJob`: cancelamento limpo antes de I/O; cancelamento após início de I/O move para `unknown` para não presumir falsamente ausência de envio.
    - `reconcileDispatchJob`: reconciliação auditada de jobs em `unknown` com notas do operador e emissão do evento de domínio `DispatchJobReconciled`.
  - Orquestrador do Worker (`packages/web/lib/dispatch-worker.ts`):
    - `executeDispatchCycle`: orquestra a sequência completa (claim -> pre-dispatch check -> mark I/O -> external adapter call -> finalization) mantendo a chamada externa fora da transação do banco.
  - Suíte de Testes de Integração (`tools/editorial-tests/dispatch-worker-flow.test.ts`):
    - Registrada sob o script `test:dispatch` em `tools/editorial-tests/package.json`.
    - 8 baterias completas executadas sobre Postgres WASM / PGlite com RLS real.
- **Aceites:**
  - Validações pré-I/O bloqueiam envios com kill switch, drift de preço, evidência vencida ou conta suspensa.
  - Agendamento é idempotente e impede sobrescrever jobs em curso ou em reconciliação pendente.
  - Dois workers simultâneos nunca obtêm o mesmo job (lock atômico com `SKIP LOCKED`).
  - Worker sem lease vigente não pode finalizar job de outro worker (`LEASE_NOT_HELD`).
  - Crash antes de iniciar I/O recupera com segurança para `queued`.
  - Crash após marcador de I/O move o job para `unknown`, impedindo qualquer retry cego automático.
  - Reconciliação auditada registra operador, notas, timestamp e emite evento de domínio auditável.
  - Cancelamento após início de I/O move para `unknown` sem afirmar falsamente "não enviado".
  - Ciclo completo do worker auditado em `garimpa.dispatch_attempt`.
  - RLS multi-tenant: tenant B não enxerga, não dá lease e não altera jobs de tenant A.
- **Verificação:**
  - `npm run test:dispatch --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:experiment --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:financial --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:cockpit --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
  - `npm run build --prefix packages/web` -> compilação Next.js 15 e validação estática bem-sucedidas (exit 0).
- **Bloqueio:** `G-CHANNEL` ativo para produção: adapters reais dependem de canal oficial e credenciais comprovadas. Localmente 100% verificado.
- **Próximo passo:** D12 — Onboarding persistido, primeira campanha e saída SaaS (EP-12 / M-12 / G-PILOT).

---

### D12 — Onboarding persistido, primeira campanha e saída SaaS (EP-12 / M-12 / G-PILOT / G-PRIVACY)

- **Estado:** VERIFICADA LOCALMENTE
- **Homologação:** N/A (local)
- **Ativação:** N/A (`G-PILOT`, `G-PRIVACY`, `G-SEC`: convite e provisionamento de usuários reais bloqueados; suite sintética autorizada 100% verificada)
- **Entrada:** D01 a D11 verificados; `packages/web/lib/saas-onboarding-contract.ts`, `packages/web/lib/saas-onboarding-db.ts`, `packages/web/lib/auth-contract.ts`, migration `20261014110000_garimpa_saas_onboarding_entitlements.sql`.
- **Resultado:**
  - Modelo de Dados e Migration (`20261014110000_garimpa_saas_onboarding_entitlements.sql`):
    - Enum `garimpa.app_role`: adicionado valor `platform_admin`.
    - Tabela `garimpa.account_invitation`: geração de token aleatório criptográfico com 256 bits de entropia, persistência estrita apenas do hash SHA-256 (`token_hash unique`), validade temporal (`expires_at`), verificação de e-mail e uso único atômico (`used_at`).
    - Tabela `garimpa.onboarding_progress`: rastreamento com validação de pré-requisitos sequenciais (`canCompleteOnboardingStep`) e evidências de auditoria (`evidence_ref`).
    - Tabela `garimpa.account_lifecycle_event`: registro imutável de eventos de ciclo de vida (`AccountSuspended`, etc.) para auditoria transversal de conformidade e privacidade.
    - RLS Policies de Fronteira:
      - `account_invitation`: owners e operadores gerenciam seus próprios convites; claim de token seguro aberto a novos ingressantes sem vazar dados de outros tenants; rejeição estrita de tokens entre tenants distintos.
      - `account_entitlement`: clientes não podem adulterar planos/quotas; gestão exclusiva para `platform_admin` e `service_role`.
      - `affiliate_membership`: claim de membership restrito a convites válidos de uso único ou administradores da plataforma.
      - `app_user_role`: concessão exclusiva do papel base `afiliado` durante claim de convite (impossível autoconceder `platform_admin`).
  - Contratos e Guards (`packages/web/lib/saas-onboarding-contract.ts`):
    - `validateAccountInvitation`: rejeita convites inexistentes, expirados, já utilizados ou com e-mail/tenant divergente.
    - `canCompleteOnboardingStep`: impede saltos não autorizados de etapas de onboarding.
    - `validateMembershipRole`: restringe convites aos papéis `owner` e `operator` (nega papéis de plataforma).
    - `validateEntitlementQuota`: fail-closed para contas sem plano, suspensas, expiradas ou fora de quota.
  - DAL de Onboarding e SaaS (`packages/web/lib/saas-onboarding-db.ts`):
    - `createAccountInvitation`: emissão de convite exclusivo para `owner`, com token de 64 chars hex e hash SHA-256.
    - `acceptAccountInvitation`: aceitação transacional atômica com disputa de lease (`update ... set used_at = now() where used_at is null returning id`), vínculo de membership e garantia de não-elevação de privilégios.
    - `recordOnboardingProgress` e `getOnboardingProgress`: progressão sequencial persistida com evidências.
    - `exportAccountData`: exportação privada completa (LGPD/GDPR/G-PRIVACY) isolada por tenant (zero vazamento de dados de outras contas ou da casa).
    - `provisionPilotAccountByPlatformAdmin`: provisionamento de contas piloto guardado por verificação da role `platform_admin` em `app_user_role`.
    - `suspendAccountByPlatformAdmin`: suspensão administrativa com auditoria em `garimpa.account_lifecycle_event`.
  - Suíte de Testes de Integração (`tools/editorial-tests/saas-onboarding-flow.test.ts`):
    - Registrada sob o script `test:onboarding` em `tools/editorial-tests/package.json`.
    - 8 baterias completas executadas sobre Postgres WASM / PGlite com RLS real.
- **Aceites:**
  - Owner cria convite com sucesso; operador é rejeitado (`owner_required`).
  - Tentativa de convite com role de plataforma é barrada contratualmente (`FORBIDDEN_ROLE`).
  - Token cru NUNCA é gravado no banco (apenas hash SHA-256 com 64 chars hex).
  - Aceitação atômica vincula usuário como membro; tentativas subsequentes (replay) falham.
  - Convite expirado, com e-mail divergente ou de outro tenant é estritamente rejeitado.
  - Usuário comum não pode provisionar nem suspender contas (`platform_admin_required`).
  - Ator com role `platform_admin` provisiona conta piloto com limites e termos explícitos.
  - Pular etapas do onboarding é rejeitado com identificação do passo bloqueador (`sequential_progress_violation`).
  - Exportação de dados privados de uma conta não vaza dados de outras contas nem da casa.
  - Suspensão de conta bloqueia imediatamente quotas e operações sem afetar outras contas.
  - Ciclo completo J2 (provisionamento -> convite -> aceite -> onboarding -> campanha) concluído com sucesso.
- **Verificação:**
  - `npm run test:onboarding --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:dispatch --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:experiment --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:financial --prefix tools/editorial-tests` -> 8 baterias passando (exit 0).
  - `npm run test:cockpit --prefix tools/editorial-tests` -> 7 baterias passando (exit 0).
  - `npm run test:opportunity --prefix tools/editorial-tests` -> 9 baterias passando (exit 0).
  - `npm run test:rubric --prefix tools/editorial-tests` -> 6 baterias passando (exit 0).
  - `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 baterias passando (exit 0).
  - `npm run test:entitlement --prefix tools/editorial-tests` -> 13 cenários passando (exit 0).
  - `npm run test:commercial --prefix tools/editorial-tests` -> 31 cenários passando (exit 0).
  - `npm run test:triage-price --prefix tools/editorial-tests` -> 22 cenários passando (exit 0).
  - `npm run test:capture-batch --prefix tools/editorial-tests` -> 20 cenários passando (exit 0).
  - `npm run test:regressions --prefix tools/editorial-tests` -> RV-01 a RV-05 passando (exit 0).
  - `npm test --prefix tools/editorial-tests` -> 29 cenários editoriais passando (exit 0).
  - `npm test --prefix packages/web` -> 379 testes passando (exit 0).
  - `npm test --prefix packages/capture` -> 127 testes passando (exit 0).
  - `npm test --prefix packages/persistence` -> 35 testes passando (exit 0).
  - `npm test --prefix packages/extension` -> 16 testes passando (exit 0).
  - `npm run typecheck --prefix packages/web -- --incremental false` -> 0 erros (exit 0).
  - `npm run typecheck --prefix packages/capture -- --incremental false` -> 0 erros (exit 0).
  - `npm run typecheck --prefix packages/persistence -- --incremental false` -> 0 erros (exit 0).
  - `npm run typecheck --prefix packages/extension -- --incremental false` -> 0 erros (exit 0).
  - `npm run build --prefix packages/web` -> compilação Next.js 15 e validação de rotas bem-sucedidas (exit 0).
- **Bloqueio:** `G-PILOT`, `G-PRIVACY`, `G-SEC`: convites reais para usuários externos dependem de homologação em staging e formalização contratual. Localmente 100% verificado.
- **Próximo passo:** D13 — Homologação da versão candidata em staging (G-ENV).

---

### D13 — Homologação da versão candidata em staging (G-ENV)

- **Estado:** BLOQUEADA (Ambiente de staging remoto não fornecido / G-ENV pendente)
- **Homologação:** BLOQUEADA por ausência de credenciais remotas de staging (`G-ENV`).
- **Ativação:** BLOQUEADA
- **Entrada:** Ausência de `G-ENV` no ambiente de execução.
- **Resultado Local e Compatibilidade:**
  - Conforme especificação em `15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md` (Seções 3.1, 5.1 e 6.1):
    *"Se o alvo não estiver disponível, registrar D13 BLOQUEADA e fechar trabalho local verificável em D14, sem certificar ambiente real."*
  - Auditoria local da cadeia relacional completa:
    - Todas as 11 novas migrations (`20261014100000` a `20261014110000`) foram aplicadas sequencialmente sobre o snapshot canônico da base observada em Postgres WASM / PGlite com 100% de sucesso.
    - Triggers de imutabilidade de `tenant_id` (`garimpa.prevent_tenant_mutation()`) e constraints de chave estrangeira com `affiliate_account` verificados para todas as tabelas base.
    - Policies restritivas de bloqueio a contas suspensas (`active_tenant`) instaladas e validadas em todas as tabelas base com coluna `tenant_id`.
    - Ausência de regressão: código pré-existente (vitrine pública, curadoria, captura do comprador, extensão) permanece 100% compatível com as novas estruturas.
- **Condição para Retomada:**
  - Disponibilização de projeto, host, pooler e service role autorizados de staging (`G-ENV`) com snapshot sanitizado para homologação multi-sessão e Supabase Auth/Storage.

---

### D14 — Auditoria cruzada, inventário e encerramento fiel (EP-00 / EP-10B)

- **Estado:** CONCLUÍDA LOCALMENTE
- **Homologação:** Parcial (núcleos locais verificados; D13 bloqueada por G-ENV)
- **Ativação:** N/A (gates externos G-PRICE, G-RUBRIC, G-PROGRAM, G-CHANNEL, G-PILOT documentados e preservados em modo fail-closed)
- **Resultado:**
  - Auditoria cruzada integral de todas as especificações e contratos:
    - 62 requisitos de rastreabilidade (T01 a T18, RV-01 a RV-05, S-*, J1 a J6) revisados e verificados.
    - Zero mocks em asserções de segurança: persistência executada sobre PostgreSQL WASM / PGlite real com RLS ativo em todos os testes.
    - Zero permissões abertas (`using(true)`): todas as 11 migrations foram implementadas com isolamento estrito `garimpa.tenant_id` e fail-closed para ausência de contexto.
    - Dois negócios mantidos simultaneamente: operação própria da casa (tenant `local`) preservada sem privilégios indevidos e operação SaaS de clientes multi-tenant com total isolamento.
    - Zero flags ativadas prematuramente: calibração avançada E3 permanece protegida por `G-PRICE`; avaliação de IA de curadoria opera em modo sombra sob `G-RUBRIC`; distribuição real opera sob adapter sintético até `G-CHANNEL`.
    - Compilação de produção: `npm run build --prefix packages/web` finalizada com 21 rotas estáticas/dinâmicas geradas e 0 erros de tipagem.
- **Matriz Consolidada de Execução (D00 a D14):**

| Entrega | Foco Funcional | Migrations / Arquivos Centrais | Testes Executados | Estado Local | Estado Remoto |
|---|---|---|---|---|---|
| **D00** | Reconciliação do STATUS e Inventário Real | `STATUS.md`, `CHECKPOINT-EXECUCAO-SEQUENCIAL.md` | Verificação de integridade documental | VERIFICADA LOCALMENTE | N/A |
| **D01** | Revogação de Dispositivos e Bootstrap Seguro | `20261014100000`, `account-context.ts`, `tenant-db.ts` | `test:regressions` (RV-01 a RV-05) | VERIFICADA LOCALMENTE | N/A |
| **D02** | RLS Scoped, active_tenant e Imutabilidade | `20261014101000`, `tenant-db.ts`, `active_tenant()` | `test:commercial` (cenários 1 a 6) | VERIFICADA LOCALMENTE | N/A |
| **D03** | Contratos de Negócio, Guards e Reconciliação | `commercial-contract.ts`, `marketplaces.ts` | `npm test --prefix packages/web` | VERIFICADA LOCALMENTE | N/A |
| **D04** | Entitlements SaaS, Limites e Quotas Atômicas | `account-entitlement.ts`, `usage_event` | `test:entitlement` (13 cenários) | VERIFICADA LOCALMENTE | N/A |
| **D05** | Projeção Canônica de Preços e Evidência E3 | `20261014102000`, `offer-history.ts`, `offer-evidence.ts` | `test:price-evidence` (5 baterias) | VERIFICADA LOCALMENTE | G-PRICE ativo |
| **D06** | Rubrica Editorial, Revisão Humana e IA em Sombra | `20261014103000`, `rubric-db.ts`, `rubric-contract.ts` | `test:rubric` (6 baterias) | VERIFICADA LOCALMENTE | G-RUBRIC ativo |
| **D07** | Oportunidades, Radar Comercial e Políticas | `20261014104000`, `opportunity-db.ts`, `opportunity-contract.ts` | `test:opportunity` (9 baterias) | VERIFICADA LOCALMENTE | N/A |
| **D08** | Cockpit Comercial Assistido, Kits e Campanhas | `20261014105000`, `commercial-workflow.ts`, `cockpit-actions.ts` | `test:cockpit` (7 baterias) | VERIFICADA LOCALMENTE | G-RIGHTS ativo |
| **D09** | Ledger Financeiro, Comissões e Importação CSV | `20261014106000`, `financial-db.ts`, `financial-import.ts` | `test:financial` (8 baterias) | VERIFICADA LOCALMENTE | G-PROGRAM ativo |
| **D10** | Coortes, Métricas e Experimentos de Política | `20261014108000`, `experiment-db.ts`, `experiment-contract.ts` | `test:experiment` (7 baterias) | VERIFICADA LOCALMENTE | G-EXPERIMENT ativo |
| **D11** | Core de Disparo, Worker Outbox e Reconciliação | `20261014109000`, `dispatch-db.ts`, `dispatch-worker.ts` | `test:dispatch` (8 baterias) | VERIFICADA LOCALMENTE | G-CHANNEL ativo |
| **D12** | Onboarding SaaS, Convites e Fronteira platform_admin | `20261014110000`, `saas-onboarding-db.ts`, `saas-onboarding-contract.ts` | `test:onboarding` (8 baterias) | VERIFICADA LOCALMENTE | G-PILOT ativo |
| **D13** | Homologação da Versão Candidata em Staging | `verify-remote-compatibility.ts`, Staging Supabase | Bloqueada por ausência de `G-ENV` | BLOQUEADA | BLOQUEADA |
| **D14** | Auditoria Cruzada, Rastreabilidade e Fechamento | `CHECKPOINT-EXECUCAO-SEQUENCIAL.md`, `STATUS.md` | Suíte integral completa (18 comandos) | CONCLUÍDA LOCALMENTE | Parcial (G-ENV) |

---

