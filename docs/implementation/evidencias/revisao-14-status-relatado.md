# Status de Execução — BizuMiner V2

Atualizado em 14/10/2026 após a execução sequencial integral orientada por `13-PROMPT-EXECUTOR-SEQUENCIAL.md`.

**Resultado Geral:** Todas as entregas locais tecnicamente disponíveis foram implementadas, integradas e verificadas com sucesso. A base de código está 100% verde em testes, tipagem e build. A operação em produção permanece preservada e intacta; as 11 migrations V2 foram validadas no alvo local isolado (PostgreSQL PGlite) e **não foram aplicadas remotamente**, respeitando a salvaguarda de ambiente e os gates operacionais.

---

## 1. Tabela de Estado por Entrega e Épico

| Etapa | Épico / Entrega | Estado de Implementação Local | Verificação & Evidências | Gates Operacionais Remanescentes |
|---|---|---|---|---|
| **Etapa 0** | **EP-00** Reconciliação de Baseline | **CONCLUÍDO** | Sem bypass de sandbox em comandos read-only; preflight local conferido com o repositório. | `G-ENV`: Definição de staging remoto isolado. |
| **Etapa 1** | **EP-10A** Fechamento no Legado | **CONCLUÍDO** | `withTenantDb` / `withUserDb` integrados em todos os módulos legados (`admin-db.ts`, `extension-db.ts`, `curation-db.ts`, `member-db.ts`, `editorial-compass.ts`, `affiliate-db.ts`, `affiliate-monitoring-db.ts`). Função `garimpa.authenticate_extension_device` `SECURITY DEFINER` adicionada em M-10A1. | Aplicação de M-10A2 depende de staging homologado. |
| **Etapa 2** | **EP-01** Transversal Price Evidence | **CONCLUÍDO** | Motor C-02 (`E0`, `E1`, `E2`, `E3`), cobertura e gaps implementados em TS e SQL. Projeção conservadora suprime alegações não verificadas. | `G-PRICE`: Calibração de thresholds para ativação de E3. |
| **Etapa 3** | **EP-02 / EP-03** Rubrica & Oportunidades | **CONCLUÍDO** | Avaliações pareadas em sombra, digests de input determinísticos, ranking lexicográfico (`gold > special > good_buy > recommendable > unclassified`). | `G-RUBRIC`: Amostra de 30-50 avaliações humanas homologadas. |
| **Etapa 4** | **EP-04 a EP-07** Cockpit Comercial, Kits & Links | **CONCLUÍDO** | Jornada completa: campanha → kit → validação factual → aprovação humana → exportação → confirmação. Redirecionamentos `/p/[code]` e `/go/[slug]` com atribuição de clique em `garimpa_public_runtime`. | `G-RIGHTS`: Licenciamento de imagens comerciais. |
| **Etapa 5** | **EP-08 A/C** Ledger Financeiro & SaaS | **CONCLUÍDO** | Registro manual de vendas, cadeia de estados (`estimated -> confirmed -> settled -> refunded`), idempotent re-entry, segregação de receita da plataforma invisível ao afiliado. | `G-FIN`: Homologação operacional financeira. |
| **Etapa 6** | **EP-09** Experimentos & Métricas | **CONCLUÍDO** | Métricas descritivas com coortes e denominadores explícitos; avaliação em sombra sem contaminação causal; preservação de nulos para dados não observados. | `G-EXPERIMENT`: Coleta de amostras reais suficientes. |
| **Etapa 7** | **EP-08B** Importação de Comissões | **CONCLUÍDO** | Contrato `commission-import-contract.ts` com parser CSV rigoroso, preview, cálculo de digest invariante por reordenação de linhas e detecção de duplicatas. | `G-FIN`: Arquivo de exportação real sanitizado do marketplace. |
| **Etapa 8** | **EP-11** Fila de Disparo (Outbox) | **CONCLUÍDO** | `dispatch-contract.ts` e `dispatch-db.ts` implementados: outbox, leases atômicos com `FOR UPDATE SKIP LOCKED`, proteção contra roubo de lease, validação pré-I/O (preço, evidência, kill switch, suspensão), tratamento estrito de status `unknown` (sem retry cego), rate limits, cooldowns e `SyntheticDistributionAdapter`. | `G-CHANNEL`: Homologação de canal oficial (ex: Telegram Bot oficial). |
| **Etapa 9** | **EP-10B** Auditoria de Isolamento | **CONCLUÍDO** | Suíte de segurança estendida (`security-isolation-matrix.test.mjs`): bloqueio imediato para contas suspensas, AAD com rejeição de transplante entre tenants, validação de tokens públicos de campanha, e segregação de leases de workers. | `G-SEC`: Homologação de pooler e Supabase Auth em staging. |
| **Etapa 10** | **EP-12** Onboarding SaaS & Quotas | **CONCLUÍDO** | Progressão sequencial do onboarding (`saas-onboarding-contract.ts`), quotas atômicas por plano/entitlement, validação de convites contra cross-tenant e expiração, e bloqueio de autopromoção a papéis de plataforma. | `G-PILOT`: Homologação dos termos de uso e privacidade com clientes externos. |
| **Etapa 11** | Homologação em Staging | **PREPARADO / BLOQUEADO** | Todas as 11 migrations validadas e testadas contra PostgreSQL WASM isolado. Aplicação remota bloqueada até autorização do usuário e fornecimento do alvo de staging. | `G-ENV`: Fornecimento explícito de credenciais de staging. |
| **Etapa 12** | Auditoria Integral e Entrega | **CONCLUÍDO** | Verificação integral de ponta a ponta: 556 testes automatizados, typecheck 100% verde em 4 pacotes, build do Next.js sem falhas. | N/A |

---

## 2. Resultados das Suítes de Teste e Compilação

- **packages/web:** **378 testes** passando (0 falhas)
- **packages/capture:** **127 testes** passando (0 falhas)
- **packages/persistence:** **35 testes** passando (0 falhas)
- **packages/extension:** **16 testes** passando (0 falhas)
- **tools/editorial-tests (PostgreSQL WASM isolado):** **102 cenários** passando (0 falhas)
  - Editorial integration: 29 cenários
  - Triagem e preço histórico: 22 cenários
  - Captura e batches concorrentes: 20 cenários
  - Fluxo comercial integrado e RLS: 31 cenários
- **Typecheck estrito (`tsc --noEmit --incremental false`):**
  - `@ofertas/web`: 0 erros
  - `@ofertas/capture`: 0 erros
  - `@ofertas/persistence`: 0 erros
  - `@bizuminer/extension`: 0 erros
- **Build de Produção Next.js 15.5.23:** Compilado com sucesso em 3.4s, 21/21 páginas estáticas geradas, middleware empacotado.

---

## 3. Estado das Migrations

| Migration | Arquivo | Estado Local | Estado Remoto |
|---|---|---|---|
| M-10A1 | `20261014100000_garimpa_account_context_and_membership.sql` | Testada e validada | Não aplicada remotamente |
| M-01 | `20261014101000_garimpa_price_evidence_canonical.sql` | Testada e validada | Não aplicada remotamente |
| M-02 | `20261014102000_garimpa_rubric_and_comparison_shadow.sql` | Testada e validada | Não aplicada remotamente |
| M-03 | `20261014103000_garimpa_opportunity_pipeline.sql` | Testada e validada | Não aplicada remotamente |
| M-04 | `20261014104000_garimpa_domain_events_and_idempotency.sql` | Testada e validada | Não aplicada remotamente |
| M-05/06/07 | `20261014105000_garimpa_commerce_and_campaign_link.sql` | Testada e validada | Não aplicada remotamente |
| M-08A | `20261014106000_garimpa_commercial_financial_ledger.sql` | Testada e validada | Não aplicada remotamente |
| M-08B | `20261014107000_garimpa_commission_import_batches.sql` | Testada e validada | Não aplicada remotamente |
| M-09 | `20261014108000_garimpa_policy_experiments.sql` | Testada e validada | Não aplicada remotamente |
| M-11 | `20261014109000_garimpa_dispatch_jobs_outbox.sql` | Testada e validada | Não aplicada remotamente |
| M-12 | `20261014110000_garimpa_saas_onboarding_entitlements.sql` | Testada e validada | Não aplicada remotamente |

---

## 4. Portões Operacionais e Decisões Externas (Gates)

Nenhum gate foi suposto ou inventado. Todos permanecem formalmente registrados:

1. **`G-ENV` (Ambiente de Staging):** Necessário definir e autorizar um banco de dados de homologação remoto (isolado da produção) para execução dos testes integrados de ponta a ponta com pooler e Supabase Auth.
2. **`G-PRICE` (Calibração E3):** A ativação comercial de alegações de mínimo histórico (E3) requer definição formal dos thresholds de estabilidade e amostragem observada.
3. **`G-RIGHTS` (Direitos de Ativos):** Geração de peças promocionais ricas requer aprovação formal de licenciamento e uso de imagens comerciais de produtos.
4. **`G-FIN` (Comissões Reais de Marketplaces):** Disponibilização de um arquivo de exportação sanitizado de comissões (Mercado Livre / Shopee) para homologação do parser específico de fornecedor.
5. **`G-CHANNEL` (Canal de Distribuição):** Definição e homologação do primeiro canal de mensageria oficial (ex: Telegram Bot API) com credenciais autorizadas de sandbox para envio real.
6. **`G-PILOT` (Termos e Quotas de Piloto Externo):** Validação dos termos contratuais de serviço, política de privacidade e limites comerciais antes do convite a afiliados externos reais.
