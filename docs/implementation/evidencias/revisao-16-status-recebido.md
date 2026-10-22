# Status de Execução — BizuMiner V2

Atualizado em 14/10/2026 após a abertura da rodada sequencial orientada por `15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md` e a auditoria diagnóstica da `14-REVISAO-DA-EXECUCAO-SEQUENCIAL.md`.

**Resultado Geral:** A rodada sequencial de conclusão foi iniciada com a execução de D00. O inventário de migrations e contratos financeiros foi corrigido. As 11 migrations reais estão registradas com seus nomes canônicos e testadas na base isolada (PostgreSQL PGlite em memória). Falhas estruturais (RV-01 a RV-05) foram capturadas na nova suíte de regressões `tools/editorial-tests/regressions-rv01-rv05.test.ts`. A operação de produção permanece preservada e intocada. Nenhuma migration foi aplicada remotamente.

---

## 1. Tabela de Estado por Entrega e Épico

| Etapa | Épico / Entrega | Estado de Implementação Local | Verificação & Evidências | Gates Operacionais Remanescentes |
|---|---|---|---|---|
| **D00** | **EP-00** Preflight & Rastreabilidade | **CONCLUÍDO** | Fixture sincronizada com baseline real (UNIQUE e views). Regressões RV-01 a RV-05 criadas com falha inicial observada. | Nenhum. |
| **D01** | **EP-10A** Contexto e Fronteiras Legadas | **EM EXECUÇÃO** | Correção de `withAccountDb`/`withTenantDb` e propagação de `AccountContext` em `affiliate-db`, `editorial-selection-db`, `capture-batch-db`, `curation-db` e layout/APIs. | `G-ENV`: Staging remoto para testes de concorrência multi-sessão. |
| **D02** | **EP-10A** Extensão e Revogação | **PENDENTE** | Correção do join de membership ativa (`revoked_at is null`) em `authenticate_extension_device` e `extension-db.ts`. | Validação de extensão em browser real em staging. |
| **D03** | **EP-08B / 11 / 12** Parser e Guards Estritos | **PENDENTE** | Validação estrita de inteiros, moedas, estados permitidos, digest sem colisão e guards de datas/expiração fail-closed. | `G-FIN`: Formato de fornecedor real. |
| **D04** | **EP-12-base / 10** Motor de Entitlement & Quotas | **PENDENTE** | Serviço transacional de consumo/reserva de quotas por plano/política sem defaults implícitos. | `G-PILOT`: Aprovação de termos e limites contratuais. |
| **D05** | **EP-01 / 05C** Evidência de Preço Canônica | **PENDENTE** | Projeção conservadora C-02 unificada em vitrine, triagem, radar e kit; supressão de alegações não verificadas. | `G-PRICE`: Calibração de thresholds para ativação de E3. |
| **D06** | **EP-02** Rubrica & Sombra Conectadas | **PENDENTE** | Persistência de avaliações humanas, digests de input determinísticos, ranking lexicográfico e shadow assessment. | `G-RUBRIC`: Amostra de 30-50 avaliações humanas homologadas. |
| **D07** | **EP-03** Política, Oportunidade e Radar | **PENDENTE** | Radar contextual na UI e integração de oportunidade ao invés de duplicar rascunhos manuais. | Conectado a D05/D06. |
| **D08** | **EP-04 a EP-07** Cockpit Comercial, Kits & Links | **PENDENTE** | Jornada completa: campanha → kit → validação factual → aprovação humana → exportação → confirmação. Redirecionamentos `/p/[code]` e `/go/[slug]`. | `G-RIGHTS`: Licenciamento de imagens comerciais. |
| **D09** | **EP-08 A/B/C** Ledger, Custos & Importação | **PENDENTE** | Estados financeiros C-07 (`estimated`, `pending`, `confirmed`, `reversed`, `received`), importação com upload privado, preview e commit idempotente. | `G-FIN`: Relatório real de fornecedor. |
| **D10** | **EP-09** Métricas & Experimentos | **PENDENTE** | Métricas descritivas com coortes e denominadores explícitos; experimentos com assignment e coortes sem contaminação causal. | `G-EXPERIMENT`: Coleta de amostras reais suficientes. |
| **D11** | **EP-11** Agendamento, Worker & Reconciliação | **PENDENTE** | Outbox, leases atômicos, marcador durável de I/O, estado `unknown` com reconciliação explícita. | `G-CHANNEL`: Homologação de canal oficial. |
| **D12** | **EP-12** Onboarding SaaS & Saída | **PENDENTE** | Convite com token hash, provisionamento atômico, separação de role `platform_admin` e suspensão isolada. | `G-PILOT`: Termos e condições comerciais de clientes externos. |
| **D13** | Homologação Staging | **BLOQUEADA** | Bloqueada até concessão de ambiente de staging isolado com pooler, Auth e Storage. | `G-ENV`: Fornecimento explícito de credenciais de staging. |
| **D14** | Auditoria Integral e Fechamento | **PENDENTE** | Auditoria cruzada das 13 specs e matriz de isolamento após conclusão das entregas locais. | Depende de D00-D13. |

---

## 2. Inventário Real das Migrations V2

| Ordem | Contrato | Arquivo Real | Estado Local | Estado Remoto |
|---|---|---|---|---|
| 1 | M-10A1 | `20261014100000_garimpa_account_context_and_membership.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 2 | M-10A2 | `20261014101000_garimpa_tenant_rls_scoped.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 3 | M-01 | `20261014102000_garimpa_price_evidence_canonical.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 4 | M-02 | `20261014103000_garimpa_rubric_assessment_shadow.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 5 | M-03 | `20261014104000_garimpa_audience_policy_and_opportunity.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 6 | M-04 | `20261014105000_garimpa_commerce_and_campaign_link.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 7 | M-08 | `20261014106000_garimpa_commercial_financial_ledger.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 8 | M-07 | `20261014107000_garimpa_click_attribution_and_channels.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 9 | M-09 | `20261014108000_garimpa_policy_experiments.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 10 | M-11 | `20261014109000_garimpa_dispatch_jobs_outbox.sql` | Testada e validada (PGlite) | Não aplicada remotamente |
| 11 | M-12 | `20261014110000_garimpa_saas_onboarding_entitlements.sql` | Testada e validada (PGlite) | Não aplicada remotamente |

---

## 3. Estados Financeiros Conforme Contrato C-07

- **Conversão:** `reported` -> `pending` -> `confirmed` / `cancelled` / `refunded`
- **Comissão:** `estimated` -> `pending` -> `confirmed` / `reversed` / `received`
- **Receita SaaS da Plataforma:** `billed` -> `received` / `reversed`

---

## 4. Portões Operacionais e Decisões Externas (Gates)

1. **`G-ENV` (Ambiente de Staging):** Necessário definir e autorizar um banco de dados de homologação remoto (isolado da produção) para execução dos testes integrados de ponta a ponta com pooler e Supabase Auth.
2. **`G-PRICE` (Calibração E3):** A ativação comercial de alegações de mínimo histórico (E3) requer definição formal dos thresholds de estabilidade e amostragem observada.
3. **`G-RIGHTS` (Direitos de Ativos):** Geração de peças promocionais ricas requer aprovação formal de licenciamento e uso de imagens comerciais de produtos.
4. **`G-FIN` (Comissões Reais de Marketplaces):** Disponibilização de um arquivo de exportação sanitizado de comissões (Mercado Livre / Shopee) para homologação do parser específico de fornecedor.
5. **`G-CHANNEL` (Canal de Distribuição):** Definição e homologação do primeiro canal de mensageria oficial (ex: Telegram Bot API) com credenciais autorizadas de sandbox para envio real.
6. **`G-PILOT` (Termos e Quotas de Piloto Externo):** Validação dos termos contratuais de serviço, política de privacidade e limites comerciais antes do convite a afiliados externos reais.
