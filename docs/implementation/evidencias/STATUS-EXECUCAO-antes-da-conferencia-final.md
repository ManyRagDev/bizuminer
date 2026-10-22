# Status de Execução do Planejamento BizuMiner V2

Documento vivo de acompanhamento da execução sequencial, incremental e verificável do planejamento integral e da rodada corretiva.
Data da última atualização: 14/10/2026.

---

## 1. Entrega Atual e Resumo da Rodada Corretiva (RX-01 a RX-08)

A rodada corretiva foi executada com sucesso, solucionando integralmente os achados RX-01 a RX-08 identificados na investigação técnica:

- **RX-01 (Ledger Financeiro & Autorização de Conta):**
  - Assinaturas de `recordManualConversion`, `recordCommissionEntry` e `recordSaaSRevenueEntry` agora exigem `AccountContext` autorizado pelo servidor.
  - Rejeição estrita de qualquer `tenantId` divergente do contexto da requisição/sessão.
  - Criadas Server Actions em `packages/web/app/admin/financeiro/actions.ts` integrando `getPageAuth`, `resolveAccountContext` e o banco transacional.
- **RX-02 (Link de Campanha `/p/[code]` e Preservação de Links):**
  - `resolveCampaignLinkByCode` atualizado para suportar chamadas diretas e transacionais com overload transparente.
  - Rota `/p/[code]` consome o retorno real (`resolved.slug`) e redireciona 302 para `/bizu/<slug>?c=<code>`.
  - Preserva integralmente os links curtos de 4 caracteres legados (`/bizu/<slug>`), os cards OG do WhatsApp e a barreira de telemetria (evita contaminação por robôs de redes sociais).
- **RX-03 (RLS Scoped e Políticas Permissivas do Baseline):**
  - Migration `20261014101000_garimpa_tenant_rls_scoped.sql` (M-10A2) atualizada para remover explicitamente as policies permissivas `${rel}_app_access` (`USING (true) WITH CHECK (true)`).
  - `getUserMemberships` em `account-context.ts` atualizado para invocar a função `SECURITY DEFINER` `garimpa.resolve_actor_accounts(auth_user_id)` (M-10A1) com fallback direto, resolvendo o problema do "ovo e a galinha" no bootstrap inicial de conta.
- **RX-04 (Segredos de Afiliados, Master Key e Rotação):**
  - Removido o fallback de chave fixa de desenvolvimento.
  - Em ambiente de produção (`NODE_ENV === "production"`), a ausência ou invalidade da chave interrompe a execução com erro fatal explícito.
  - Suporte completo a chaves sintéticas explícitas em testes e resolução versionada de chaves (`resolveKeyForVersion`).
- **RX-05 (Unificação de GUC e Correção de Tipos FK / Composite Ownership):**
  - **GUC Unificado:** Todas as migrations (`M-10A2`, `M-02`, `M-03`, `M-04`, `M-08`, `M-07`, `M-09`, `M-11`, `M-12`) e a aplicação (`tenant-db.ts`) agora utilizam o contrato canônico `nullif(current_setting('garimpa.tenant_id', true), '')`.
  - **Tipos de FK:** Corrigidas as colunas `campaign_publication_id`, `kit_revision_id`, `destination_id` e `campaign_link_id` de `uuid` para `text`, compatíveis com o PK `id text` das tabelas de origem.
  - **Composite Keys:** Adicionadas foreign keys compostas com `tenant_id` garantindo isolamento relacional e grants a `garimpa_app`.
- **RX-06 (Oráculo de Teste de Isolamento de Segurança):**
  - `validateCampaignTokenForSlug` refatorado para permitir injeção de `sqlFactory`.
  - Teste `security-isolation-matrix.test.mjs` atualizado para testar tokens legítimos (`valid: true`) e adulterados (`valid: false`, `reason: "mismatched_or_inactive_token"`), sem aceitar falha de infraestrutura (`db_lookup_unavailable`) como prova de rejeição.
- **RX-07 (Cálculo Canônico SQL de Evidência de Preço e E3):**
  - View `garimpa.curation_queue_facts` em `20261014102000_garimpa_price_evidence_canonical.sql` atualizada para exigir estritamente `status = 'approved'`. Políticas em draft NUNCA habilitam E3.
  - Aplicados filtros de janela temporal (`o.observed_at >= l.observed_at - (window_days * interval '1 day')`), frescor da oferta (`(now() - l.observed_at) <= max_age_hours`) e contagem mínima de dias distintos.
- **RX-08 (Demonstração das Jornadas e Verificabilidade E2E):**
  - Criado script CLI de verificação estrutural e compatibilidade remota: `packages/persistence/bin/verify-remote-compatibility.ts` (disponível via `npm run verify:remote-compatibility` em persistence).
  - Criadas Server Actions para o ciclo de vida do kit comercial em `packages/web/app/admin/marketing/kit-actions.ts` (criação, validação, aprovação, reserva de link e revalidação contra deriva antes de exportar).
  - Criada suíte de testes de integração ponta a ponta: `packages/web/test/e2e-commercial-flow.test.mjs` comprovando os quatro fluxos principais.

---

## 2. Registro Detalhado de Entregas e Verificações

| Entrega | Status | Alterações Principais | Testes Executados | Resultado Observável |
|---|---|---|---|---|
| **EP-00** | CONCLUÍDO | Inspeção do working tree, compatibilidade e baseline de 4 pacotes. | `npm test` em capture, persistence, extension, web e editorial-tests | Baseline verde em todos os pacotes. |
| **EP-01-0** | CONCLUÍDO | `deal-signal.ts` e `curation-pipeline.ts`: sem variantKey comprovada, projeta conservadoramente. | `npm test --prefix packages/web` | Preços e links legados intactos; claims sem suporte contidos. |
| **EP-10A1** | CONCLUÍDO | Migration `M-10A1`, `tenant-db.ts` (`withAccountDb`), `account-context.ts`. | `node --test test/account-context.test.mjs` (3/3) | Contexto de transação real isolado com GUC unificado `garimpa.tenant_id`. |
| **EP-10A2** | CONCLUÍDO | Migration `M-10A2` (RLS scoped), `affiliate-secret.ts` (AES-256-GCM com AAD). | `node --test test/affiliate-secret.test.mjs` (6/6) | Cifragem segura, sem chave fallback em prod, suporte a rotação e revogação. |
| **EP-01** | CONCLUÍDO | Migration `M-01`, `packages/capture/src/types.ts`, `packages/web/lib/price-evidence.ts`. | `node --test test/price-evidence.test.mjs` (10/10) | E0, E1, E2, E3 funcionais; E3 exige policy approved e janela (G-PRICE). |
| **EP-02** | CONCLUÍDO | Migration `M-02`, `packages/web/lib/rubric-contract.ts`, `rubric-db.ts`. | `node --test test/rubric-contract.test.mjs` (5/5) | Rubrica Q/V/O/A, Gemini schema tipado, persistência de sombra auditável. |
| **EP-03** | CONCLUÍDO | Migration `M-03`, `packages/web/lib/opportunity-contract.ts`, `monitoring-policy.ts`. | `node --test test/opportunity-contract.test.mjs` (6/6) | Oportunidades com classes e estados; ranking lexicográfico sem pesos arbitrários. |
| **EP-04** | CONCLUÍDO | Migration `M-04`, `commerce-contract.ts`, `commerce-db.ts`, `app/p/[code]/route.ts`. | `node --test test/commerce-contract.test.mjs` (4/4) | Campanhas, kits, revisões com SHA-256, links de 12 chars e proteção contra purge. |
| **EP-05** | CONCLUÍDO | `cockpit-view-model.ts`, `today-command-center.tsx`, `/bizu/[slug]/page.tsx`. | `node --test test/cockpit-view-model.test.mjs` (6/6) | Cockpit com ações tipadas, sem botões falsos, T08 e T18 verificados. |
| **EP-08 A/C** | CONCLUÍDO | Migration `M-08`, `commercial-financial-contract.ts`, `commercial-financial-db.ts`, `actions.ts`. | `node --test test/commercial-financial-contract.test.mjs` (4/4) | Conversões com AccountContext, comissões sem tripla soma, SaaS e custos separados. |
| **EP-06** | CONCLUÍDO | `packages/web/lib/kit-validator.ts`, `packages/web/app/admin/marketing/kit-actions.ts`. | `node --test test/kit-validator.test.mjs` (6/6) | Validação T11 (urgência), T12 (preço sem E2/E3), T10 (deriva antes de exportar). |
| **EP-07** | CONCLUÍDO | Migration `M-07`, `packages/web/lib/campaign-attribution.ts`, `app/go/[slug]/route.ts`. | `node --test test/campaign-attribution.test.mjs` (2/2) | Token `?c=` validado contra slug/produto; fail-closed se adulterado. |
| **EP-10B** | CONCLUÍDO | `packages/web/test/security-isolation-matrix.test.mjs`. | `node --test test/security-isolation-matrix.test.mjs` (3/3) | Matriz negativa T17/T18/J2 comprovada com oráculo real e falhas fechadas. |
| **EP-09** | CONCLUÍDO | Migration `M-09`, `packages/web/lib/experiment-contract.ts`. | `node --test test/experiment-contract.test.mjs` (3/3) | MetricResult auditável, divisão por zero protegida, promoção humana G-EXPERIMENT. |
| **EP-11** | ESTRUTURAL | Migration `M-11` (dispatch outbox). | Schema e contratos validados | Preparado no banco com tipos text; bloqueado para envios reais por G-CHANNEL. |
| **EP-12** | ESTRUTURAL | Migration `M-12`, `saas-onboarding-contract.ts`. | `node --test test/saas-onboarding-contract.test.mjs` (2/2) | Entitlements, limites de uso e etapas sequenciais de onboarding validados. |
| **E2E** | CONCLUÍDO | `packages/web/test/e2e-commercial-flow.test.mjs`. | `node --test test/e2e-commercial-flow.test.mjs` (4/4) | Jornada completa: Financeiro → Kit → Revalidação → Links → Telemetria. |

---

## 3. Estado das Suítes de Testes e Typecheck

- **Typecheck:**
  - `packages/web`: **0 erros** (`npm run typecheck --prefix packages/web -- --incremental false`).
  - `packages/persistence`: **0 erros** (`npm run typecheck --prefix packages/persistence`).
- **Suítes de Testes Automatizados:**
  - `packages/web`: **363/363 testes passaram (100% verde)**.
  - `packages/persistence`: **35/35 testes passaram (100% verde)**.
  - `packages/extension`: **16/16 testes passaram (100% verde)**.
  - `tools/editorial-tests`: **29/29 cenários de integração passaram (100% verde)**.
  - Total geral: **443 testes automatizados passando**.

---

## 4. Inventário de Migrations Reconciliadas

| Arquivo de Migration | Status no Ambiente Local | Status Remoto (Produção/Staging) |
|---|---|---|
| `20261014100000_garimpa_account_context_and_membership.sql` (M-10A1) | Reconciliada com `SECURITY DEFINER` | **Pendente de Autorização Operacional** |
| `20261014101000_garimpa_tenant_rls_scoped.sql` (M-10A2) | Reconciliada (remove `_app_access` e usa `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014102000_garimpa_price_evidence_canonical.sql` (M-01) | Reconciliada (E3 estrito a `approved`, window e freshness) | **Pendente de Autorização Operacional** |
| `20261014103000_garimpa_rubric_assessment_shadow.sql` (M-02) | Reconciliada (GUC `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014104000_garimpa_audience_policy_and_opportunity.sql` (M-03) | Reconciliada (GUC `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014105000_garimpa_commerce_and_campaign_link.sql` (M-04) | Reconciliada (GUC `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014106000_garimpa_commercial_financial_ledger.sql` (M-08) | Reconciliada (FK `text`, composite FKs, GUC `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014107000_garimpa_click_attribution_and_channels.sql` (M-07) | Reconciliada (colunas `text`, composite FKs) | **Pendente de Autorização Operacional** |
| `20261014108000_garimpa_policy_experiments.sql` (M-09) | Reconciliada (GUC `garimpa.tenant_id`, grants adicionados) | **Pendente de Autorização Operacional** |
| `20261014109000_garimpa_dispatch_jobs_outbox.sql` (M-11) | Reconciliada (FKs `text`, composite FKs, GUC `garimpa.tenant_id`) | **Pendente de Autorização Operacional** |
| `20261014110000_garimpa_saas_onboarding_entitlements.sql` (M-12) | Reconciliada (GUC `garimpa.tenant_id`, grants adicionados) | **Pendente de Autorização Operacional** |

*Observação estrita:* Nenhuma migration foi aplicada no banco remoto de produção, mantendo conformidade com os limites do pedido.

---

## 5. Gates Pendentes e Próximas Ações Operacionais

1. **G-ENV / Deploy:** Aplicar as migrations reconciliadas em ambiente de staging isolado e rodar `npm run verify:remote-compatibility` em `packages/persistence` antes de qualquer rollout.
2. **G-PRICE / OPEN-03:** Conduzir calibração de cobertura E3 (`EXP-02`) com o responsável editorial para homologar thresholds de frequência antes de aprovar formalmente uma política E3 com `e3Enabled: true`.
3. **G-RUBRIC / OPEN-01, 02:** Homologar 30 a 50 amostras humanas da rubrica de curadoria para calibrar o modo assistido e ratificar promoção de políticas.
4. **G-RIGHTS / OPEN-08:** Coletar a política formal de direitos de imagem por marketplace/programa antes de habilitar export de banners e artes comerciais visuais com fotos de terceiros.
5. **G-FIN / OPEN-05:** Disponibilizar arquivo de relatório real sanitizado da primeira venda para construção do parser específico de lote de comissões (`08-B`). O registro manual (`08-A/C`) e suas Server Actions já estão 100% operacionais.
6. **G-CHANNEL / OPEN-04, 06:** Seleção e autorização formal do canal de mensagens assistido/automático (ex: Telegram oficial ou canal próprio de WhatsApp) antes da ativação de workers de disparo em `EP-11`.
7. **G-PILOT / OPEN-07:** Aprovação das condições comerciais, quotas e termos do piloto de afiliados externos antes da emissão de convites reais em `EP-12`.
