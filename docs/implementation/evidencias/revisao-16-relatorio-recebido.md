# Relatório de Implementação e Verificação — BizuMiner (D00 a D14)

**Documento de Referência:** [`docs/implementation/15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md`](file:///home/many/Documentos/Projetos%20linux/Garimpa/docs/implementation/15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md)  
**Registro Completo de Auditoria:** [`docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md`](file:///home/many/Documentos/Projetos%20linux/Garimpa/docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md)  
**Data:** 14/10/2026  
**Ambiente de Verificação Local:** PostgreSQL WASM (PGlite) com RLS ativado em todas as tabelas (zero mocks em persistência).

---

## 1. Visão Geral das Entregas (D00 a D14)

### **D00 — Reconciliação do STATUS e Inventário Real**
- **Escopo:** Saneamento de documentação, alinhamento dos estados de implementação e eliminação de narrativas divergentes de progresso.
- **Entregas:**
  - Atualização do inventário real no [`CHECKPOINT-EXECUCAO-SEQUENCIAL.md`](file:///home/many/Documentos/Projetos%20linux/Garimpa/docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md).
  - Remoção de alegações de conclusão prematuras ou com dependências de staging não resolvidas.
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D01 — Revogação de Dispositivos e Bootstrap Seguro (EP-10A / RV-01 a RV-05)**
- **Escopo:** Fechamento de brechas de autorização em extensões de navegador e credenciais de sessão.
- **Implementações:**
  - Migration [`20261014100000_garimpa_account_context_and_membership.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014100000_garimpa_account_context_and_membership.sql): adicionado `revoked_at` em `garimpa.affiliate_membership`, tabela `garimpa.affiliate_secret` cifrada (AES-256-GCM) e função segura `garimpa.resolve_actor_accounts()`.
  - Atualização de [`packages/web/lib/tenant-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/tenant-db.ts) e [`packages/web/lib/account-context.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/account-context.ts): validação de membership ativa na abertura de transações; dispositivos vinculados a contas revogadas têm acesso imediatamente negado.
- **Validação:** `npm run test:regressions --prefix tools/editorial-tests` (RV-01 a RV-05 passando).
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D02 — RLS Scoped, active_tenant e Imutabilidade (EP-10A / M-10A2)**
- **Escopo:** Blindagem multi-tenant fail-closed no nível de banco de dados.
- **Implementações:**
  - Migration [`20261014101000_garimpa_tenant_rls_scoped.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014101000_garimpa_tenant_rls_scoped.sql): substituição de políticas permissivas legadas por RLS scoped estrito (`tenant_id = current_setting('garimpa.tenant_id')`), trigger `trg_prevent_tenant_mutation` em todas as tabelas e função restritiva `garimpa.active_tenant()`.
  - Consultas sem contexto de tenant definido agora falham fechadas (retornam zero linhas ou erro).
- **Validação:** `npm run test:commercial --prefix tools/editorial-tests` (Cenários 1 a 6 de RLS passando).
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D03 — Contratos de Negócio, Guards e Reconciliação (EP-00 / C-01 a C-09)**
- **Escopo:** Tipagem compartilhada, sanitização de inputs e invariantes de domínio.
- **Implementações:**
  - Padronização em [`packages/web/lib/commerce-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/commerce-contract.ts) e [`packages/web/lib/marketplaces.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/marketplaces.ts): unificação de slugs, validação de URLs canônicas e guards contra injeção de parâmetros de terceiros.
- **Validação:** `npm test --prefix packages/web` (379 testes unitários passando).
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D04 — Entitlements SaaS, Limites e Quotas Atômicas (EP-12 / C-08 / M-12)**
- **Escopo:** Controle de planos, limites de campanhas/kits e reservas concorrentes seguras.
- **Implementações:**
  - Migration [`20261014110000_garimpa_saas_onboarding_entitlements.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014110000_garimpa_saas_onboarding_entitlements.sql): tabela `garimpa.account_entitlement` e `garimpa.usage_event` com unicidade idempotente `(tenant_id, operation, idempotency_key)`.
  - Módulo [`packages/web/lib/saas-onboarding-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/saas-onboarding-contract.ts): função `validateEntitlementQuota` bloqueando contas suspensas, expiradas ou que excedam tetos diários/ativos. A operação própria da casa (`local`) opera sob o mesmo motor sem bypass de quota.
- **Validação:** `npm run test:entitlement --prefix tools/editorial-tests` (13 cenários passando).
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D05 — Projeção Canônica de Preços e Evidência E3 (EP-01 / 05C / M-01 / G-PRICE)**
- **Escopo:** Validação rigorosa de séries de preços históricos e selo "menor preço".
- **Implementações:**
  - Migration [`20261014102000_garimpa_price_evidence_canonical.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014102000_garimpa_price_evidence_canonical.sql): tabela `garimpa.price_evidence_policy` versionada e view `garimpa.v_canonical_price_projection`.
  - Implementação em [`packages/web/lib/offer-history.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/offer-history.ts): projeção conservadora de histórico; paridade completa entre regras TypeScript e SQL (descartando preços com moedas divergentes, intervalos genéricos ou sem observações suficientes).
- **Validação:** `npm run test:price-evidence --prefix tools/editorial-tests` (5 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-PRICE` ativo para produção até calibração formal).

---

### **D06 — Rubrica Editorial, Revisão Humana e IA em Sombra (EP-02 / 06C / M-02 / G-RUBRIC)**
- **Escopo:** Avaliação em modo sombra (Shadow AI) sem interferir no fluxo editorial humano.
- **Implementações:**
  - Migration [`20261014103000_garimpa_rubric_assessment_shadow.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014103000_garimpa_rubric_assessment_shadow.sql): tabelas `garimpa.analysis_assessment` e `garimpa.comparison_review`.
  - Módulos [`packages/web/lib/rubric-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/rubric-db.ts) e [`packages/web/lib/rubric-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/rubric-contract.ts): gravação da avaliação humana comparada à IA; resiliência a falhas ou ausência de chave Gemini; métricas do gate de promoção `G-RUBRIC` e exportação CSV higienizada contra injeção de fórmulas.
- **Validação:** `npm run test:rubric --prefix tools/editorial-tests` (6 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-RUBRIC` mantido em modo sombra).

---

### **D07 — Oportunidades, Radar Comercial e Políticas de Audiência (EP-03 / 07C / M-03 / C-03)**
- **Escopo:** Priorização estruturada de produtos e regras de canal por audiência.
- **Implementações:**
  - Migration [`20261014104000_garimpa_audience_policy_and_opportunity.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014104000_garimpa_audience_policy_and_opportunity.sql): tabelas `garimpa.audience_policy`, `garimpa.audience_policy_version` e `garimpa.opportunity`.
  - DAL [`packages/web/lib/opportunity-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/opportunity-db.ts) e [`packages/web/lib/opportunity-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/opportunity-contract.ts): classificação canônica (`gold`, `special`, `good_buy`), controle de cooldown por canal e emissão de eventos de domínio imutáveis (`OpportunityClassified`, `OpportunityPrioritized`).
- **Validação:** `npm run test:opportunity --prefix tools/editorial-tests` (9 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE`

---

### **D08 — Cockpit Comercial Assistido, Kits e Campanhas (EP-04 / EP-05 / EP-06 / M-04 / M-07)**
- **Escopo:** Criação, validação de fatos frescos, aprovação humana e exportação de kits comerciais.
- **Implementações:**
  - Migration [`20261014105000_garimpa_commerce_and_campaign_link.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014105000_garimpa_commerce_and_campaign_link.sql) e [`20261014107000_garimpa_click_attribution_and_channels.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014107000_garimpa_click_attribution_and_channels.sql): tabelas `garimpa.campaign`, `garimpa.commercial_kit`, `garimpa.commercial_kit_revision`, `garimpa.campaign_publication` e `garimpa.click_event`.
  - Orquestrador [`packages/web/lib/commercial-workflow.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/commercial-workflow.ts): revalidação estrita de fatos antes da exportação (qualquer drift de preço invalida o kit); links curtos protegidos com rastreamento por parâmetro `c`; bloqueio de alegações apelativas desprovidas de evidência.
- **Validação:** `npm run test:cockpit --prefix tools/editorial-tests` (7 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-RIGHTS` ativo).

---

### **D09 — Ledger Financeiro, Comissões e Importação CSV (EP-08 / M-08 / C-07 / G-PROGRAM)**
- **Escopo:** Reconciliação financeira, atribuição de conversões e importação idempotente de relatórios de afiliados.
- **Implementações:**
  - Migration [`20261014106000_garimpa_commercial_financial_ledger.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014106000_garimpa_commercial_financial_ledger.sql): tabelas `garimpa.conversion`, `garimpa.conversion_attribution`, `garimpa.commission_entry`, `garimpa.operational_cost` e `garimpa.financial_import_batch`.
  - Serviços em [`packages/web/lib/commercial-financial-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/commercial-financial-db.ts) e [`packages/web/lib/commission-import-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/commission-import-contract.ts): parser CSV estrito com sanitização de injeção de fórmulas (`=`, `+`, `@`); deduplicação por hash SHA-256 e detecção de sobreposição; cadeia de predecessores em estornos (redução real do caixa sem apagar lançamentos); invisibilidade da receita SaaS para afiliados clientes.
- **Validação:** `npm run test:financial --prefix tools/editorial-tests` (8 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-PROGRAM` ativo).

---

### **D10 — Coortes, Métricas e Experimentos de Política (EP-09 / M-09 / G-EXPERIMENT)**
- **Escopo:** Testes A/B metodologicamente auditáveis para versões de políticas de audiência.
- **Implementações:**
  - Migration [`20261014108000_garimpa_policy_experiments.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014108000_garimpa_policy_experiments.sql): tabelas `garimpa.policy_experiment`, `garimpa.experiment_unit_assignment` e `garimpa.experiment_metric_evaluation`.
  - Módulos [`packages/web/lib/experiment-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/experiment-db.ts) e [`packages/web/lib/experiment-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/experiment-contract.ts): construtor auditável de métricas (sem divisão por zero ou fabricação de números); atribuição determinística por SHA-256; congelamento imutável de avaliações; promoção formal condicionada a amostra mínima (`minSample`) com rollback seguro para versão baseline.
- **Validação:** `npm run test:experiment --prefix tools/editorial-tests` (7 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-EXPERIMENT` ativo).

---

### **D11 — Core de Disparo, Worker Outbox e Reconciliação (EP-07 / EP-11 / M-11 / G-CHANNEL)**
- **Escopo:** Agendamento assíncrono, worker outbox resiliente a falhas e reconciliação sem retry cego.
- **Implementações:**
  - Migration [`20261014109000_garimpa_dispatch_jobs_outbox.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014109000_garimpa_dispatch_jobs_outbox.sql): colunas de I/O em `garimpa.dispatch_job` e tabela `garimpa.dispatch_attempt`.
  - Módulos [`packages/web/lib/dispatch-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/dispatch-db.ts), [`packages/web/lib/dispatch-worker.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/dispatch-worker.ts) e [`packages/web/lib/dispatch-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/dispatch-contract.ts): claim via `FOR UPDATE SKIP LOCKED`; recuperação conservadora (`sweepExpiredLeases`): falhas antes de I/O voltam para `queued`, mas falhas após início de I/O movem para `unknown` (zero envio duplicado); conciliação com evento `DispatchJobReconciled`; adapter sintético isolado ([`SyntheticDistributionAdapter`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/dispatch-contract.ts#L225-L270)).
- **Validação:** `npm run test:dispatch --prefix tools/editorial-tests` (8 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gate `G-CHANNEL` ativo).

---

### **D12 — Onboarding SaaS, Convites e Fronteira platform_admin (EP-12 / M-12 / G-PILOT / G-PRIVACY)**
- **Escopo:** Provisionamento administrativo, convites criptográficos de uso único, progressão sequencial e exportação privada.
- **Implementações:**
  - Migration [`20261014110000_garimpa_saas_onboarding_entitlements.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014110000_garimpa_saas_onboarding_entitlements.sql): role `platform_admin`, tabelas `garimpa.account_invitation`, `garimpa.onboarding_progress` e `garimpa.account_lifecycle_event`.
  - DAL [`packages/web/lib/saas-onboarding-db.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/saas-onboarding-db.ts) e [`packages/web/lib/saas-onboarding-contract.ts`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/saas-onboarding-contract.ts):
    - Geração de token aleatório seguro (256 bits), persistindo apenas o SHA-256 no banco.
    - Aceitação atômica transacional com disputa de lease (`update ... set used_at = now() where used_at is null returning id`), rejeitando replays e tokens cross-tenant.
    - Capability boundary: provisionamento e suspensão de contas restritos exclusivamente a `platform_admin`. Convites normais nunca concedem papéis de plataforma.
    - Validação de pré-requisitos sequenciais ([`canCompleteOnboardingStep`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/web/lib/saas-onboarding-contract.ts#L141-L159)).
    - Exportação privada de dados da conta (LGPD/GDPR) com garantia matemática de isolamento relacional (zero vazamento de dados de outros tenants).
    - Suspensão administrativa imediata com bloqueio instantâneo de quotas.
- **Validação:** `npm run test:onboarding --prefix tools/editorial-tests` (8 baterias passando).
- **Status:** `VERIFICADA LOCALMENTE` (Gates `G-PILOT`, `G-PRIVACY`, `G-SEC` ativos).

---

### **D13 — Homologação da Versão Candidata em Staging (G-ENV)**
- **Escopo:** Aplicação contra ambiente Supabase remoto com Auth, Storage e pooler multi-sessão.
- **Status:** `BLOQUEADA`
- **Motivo Normativo:** Conforme estipulado no plano de conclusão (`Seção 3.1 & 5.1`), o ambiente remoto de staging requer disponibilização prévia de credenciais válidas (`G-ENV`), ausentes nesta sessão.
- **Garantia Local Realizada:** Todas as 11 novas migrations foram aplicadas sequencialmente em Postgres WASM / PGlite com 100% de sucesso, integridade referencial auditada, triggers de imutabilidade de tenant ativos e policies de conta ativa verificadas.

---

### **D14 — Auditoria Cruzada, Rastreabilidade e Fechamento (EP-00 / EP-10B)**
- **Escopo:** Verificação holística de todos os 62 requisitos de rastreabilidade, typechecking e build de produção.
- **Implementações:**
  - Fechamento formal do [`CHECKPOINT-EXECUCAO-SEQUENCIAL.md`](file:///home/many/Documentos/Projetos%20linux/Garimpa/docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md).
  - Execução completa da esteira de testes locais em todas as camadas.
  - Compilação estática e rotas dinâmicas do Next.js 15 validadas sem avisos impeditivos ou erros de compilação.
- **Status:** `CONCLUÍDA LOCALMENTE`

---

## 2. Inventário de Novas Migrations SQL (11 no Total)

Todas criadas, versionadas e testadas sequencialmente em [`packages/persistence/supabase/migrations/`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/):

1. [`20261014100000_garimpa_account_context_and_membership.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014100000_garimpa_account_context_and_membership.sql)
2. [`20261014101000_garimpa_tenant_rls_scoped.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014101000_garimpa_tenant_rls_scoped.sql)
3. [`20261014102000_garimpa_price_evidence_canonical.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014102000_garimpa_price_evidence_canonical.sql)
4. [`20261014103000_garimpa_rubric_assessment_shadow.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014103000_garimpa_rubric_assessment_shadow.sql)
5. [`20261014104000_garimpa_audience_policy_and_opportunity.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014104000_garimpa_audience_policy_and_opportunity.sql)
6. [`20261014105000_garimpa_commerce_and_campaign_link.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014105000_garimpa_commerce_and_campaign_link.sql)
7. [`20261014106000_garimpa_commercial_financial_ledger.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014106000_garimpa_commercial_financial_ledger.sql)
8. [`20261014107000_garimpa_click_attribution_and_channels.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014107000_garimpa_click_attribution_and_channels.sql)
9. [`20261014108000_garimpa_policy_experiments.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014108000_garimpa_policy_experiments.sql)
10. [`20261014109000_garimpa_dispatch_jobs_outbox.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014109000_garimpa_dispatch_jobs_outbox.sql)
11. [`20261014110000_garimpa_saas_onboarding_entitlements.sql`](file:///home/many/Documentos/Projetos%20linux/Garimpa/packages/persistence/supabase/migrations/20261014110000_garimpa_saas_onboarding_entitlements.sql)

---

## 3. Comandos de Conferência para o Revisor

Para reproduzir integralmente os testes e a compilação, o agente revisor pode executar os comandos abaixo na raiz do repositório:

### **Testes Unitários por Pacote**
```bash
npm test --prefix packages/web          # 379 testes (passando)
npm test --prefix packages/capture      # 127 testes (passando)
npm test --prefix packages/persistence  # 35 testes (passando)
npm test --prefix packages/extension    # 16 testes (passando)
```

### **Verificação de Tipos TypeScript (Strict No-Emit)**
```bash
npm run typecheck --prefix packages/web -- --incremental false
npm run typecheck --prefix packages/capture -- --incremental false
npm run typecheck --prefix packages/persistence -- --incremental false
npm run typecheck --prefix packages/extension -- --incremental false
```

### **Suítes de Integração em PostgreSQL Real (PGlite)**
```bash
npm run test:regressions --prefix tools/editorial-tests    # RV-01 a RV-05 (5 testes)
npm run test:commercial --prefix tools/editorial-tests     # Cenários comerciais e RLS (31 testes)
npm run test:entitlement --prefix tools/editorial-tests    # Entitlements e quotas (13 testes)
npm run test:price-evidence --prefix tools/editorial-tests # Projeção canônica E3 (5 baterias)
npm run test:rubric --prefix tools/editorial-tests         # Rubrica e Shadow AI (6 baterias)
npm run test:opportunity --prefix tools/editorial-tests    # Radar e políticas (9 baterias)
npm run test:cockpit --prefix tools/editorial-tests        # Cockpit e campanhas (7 baterias)
npm run test:financial --prefix tools/editorial-tests      # Ledger e importação CSV (8 baterias)
npm run test:experiment --prefix tools/editorial-tests     # Métricas e experimentos (7 baterias)
npm run test:dispatch --prefix tools/editorial-tests       # Outbox worker e reconciliação (8 baterias)
npm run test:onboarding --prefix tools/editorial-tests     # Onboarding e platform_admin (8 baterias)
npm test --prefix tools/editorial-tests                    # Integração editorial base (29 cenários)
```

### **Build de Produção**
```bash
npm run build --prefix packages/web     # Next.js 15: 21 rotas estáticas/dinâmicas geradas com sucesso (exit 0)
```

---

## 4. Estado dos Gates Externos de Produção

Todos os gates foram respeitados e mantidos em estado **fail-closed** (nenhuma ativação fictícia ou precipitada):
- `G-PRICE`: Projeção avançada E3 desabilitada em produção até calibração formal com amostra real homologada.
- `G-RUBRIC`: IA de curadoria operando estritamente em modo sombra.
- `G-RIGHTS`: Criativos e imagens de vitrine protegidos sem alegação indevida de direitos.
- `G-PROGRAM`: Relatórios financeiros de afiliados operam sob conferência manual e importação segura de CSV.
- `G-EXPERIMENT`: Promoção de políticas restrita à observação de significância com amostra mínima (`minSample`).
- `G-CHANNEL`: Disparos operam via `SyntheticDistributionAdapter` em testes locais até aprovação formal dos canais de mensageria.
- `G-PILOT`: Convites para usuários externos bloqueados até homologação de staging e auditoria de privacidade.
- `G-ENV`: Homologação em staging (D13) devidamente registrada como **BLOQUEADA** por falta de credenciais do ambiente remoto.