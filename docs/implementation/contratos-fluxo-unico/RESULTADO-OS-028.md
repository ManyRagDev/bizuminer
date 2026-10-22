# RESULTADO-OS-028 — Comparação de modelos e confiança da evidência

- **OS:** OS-028 (`docs/implementation/contratos-fluxo-unico/OS-028.md`).
- **Data de execução:** 19/10/2026.
- **Skill utilizada:** `/executor-blindado` (modo estrito de execução local).
- **Estado:** `CONCLUIDO`.
- **Baseline:** `main` `43700c59` mais working tree local preexistente inspecionado e preservado intacto.
- **Bloqueio de fronteira:** Nenhum (`BLOQUEIO_DE_FRONTEIRA: NENHUM`). Nenhuma alteração fora da lista fechada autorizada.

---

## 1. Arquivos Escritos e Fronteira Autorizada

Todas as alterações foram restritas estritamente aos caminhos autorizados pela OS-028:

### Módulos Existentes Autorizados
1. `packages/persistence/src/product-family.ts`:
   - Adicionada família `cafeteiras` com regra conservadora por palavras-chave do título.
   - Versão da regra explicitada como `v2` para cafeteiras; regras preexistentes mantêm `v1`.
2. `packages/web/lib/curation-contract.ts`:
   - Adicionado campo opcional `saturationJustification` em `GroupActionInput` e `ValidGroupAction`.
   - Validação em `validateGroupAction`: quando `retainRemainingAsSaturation: true` e a justificativa for informada, valida tamanho mínimo (>= 3 caracteres) retornando `saturation_justification_invalid` caso inválida.
3. `packages/web/lib/editorial-groups.ts`:
   - Atualizada interface `GroupMemberProduct` com `reviewCount`, `variant` (suportando `key/label` e `variantKey/variantLabel`, `confirmed`, `description`) e `offerEvidence`.
   - Na ordenação de evidência dos membros (`compareEvidence`), se os candidatos forem do mesmo marketplace e possuírem contadores de avaliações, utiliza `compareReviewEvidence` para preferir amostras robustas para revisão humana sem declarar vitória de qualidade.
4. `packages/web/lib/curation-db.ts`:
   - Leitura lateral de `offer_evidence` da última `garimpa.price_observation` via `left join lateral (...) latest_obs on true` escopada por `tenant_id` e `product_id` em `curationQueue`, `curationGroupCards`, `groupMembers`, `queueFacts` e `actOnGroup`.
   - Em `toSnapshotFacts`: extração de `variant` e estruturação de `OfferEvidenceSourceSnapshot` (marketplace, method, url, capturedAt).
   - Em `actOnGroup`: repasse de `saturationJustification` às decisões retidas por `family_saturation`; propagação do `sqlFactory` recebido para transação com `withTenantDb`.
5. `packages/web/lib/curation-snapshot.ts`:
   - `CURATION_SNAPSHOT_VERSION` promovido para `2`.
   - Inclusão de `reviewCount` (inteiro não negativo ou null se ausente), `variant` (resolvida com `confirmed`) e `offerEvidenceSource` em `CurationSnapshotFacts`.
   - Compatibilidade total mantida para leitura de snapshots v1 históricos.
6. `packages/web/lib/curation-pipeline.ts`:
   - Remoção da retenção artificial por posição em `family_saturation`: itens que excedem `maxRepresentatives` permanecem como `status: 'pending'`, `reasonCode: null`, aguardando exame humano sem inflar orçamento de IA.
7. `packages/web/lib/hero-ranking.ts`:
   - Classificação hero integrada com `editorialSelectionBlockers` e validação de alegações de superioridade.
   - Fórmula de pontuação de catálogo preserva equilíbrio de 100 pontos sem tratar vendas brutas de lojas distintas como falsa equivalência de qualidade.
8. `packages/web/lib/editorial-selection.ts`:
   - Adicionado `ComparativeBasis` e campo `comparativeBasis` em `EditorialAssessmentInput` e `EditorialAssessment`.
   - `validateEditorialAssessment`: validação estrita com `hasSuperiorityClaim` e `validateComparativeBasis`.
   - `editorialSelectionBlockers`: bloqueia ativação se houver alegação pública de superioridade sem base comparativa, com alternativas vazias ou com checagem com mais de 48 horas.
9. `packages/web/lib/editorial-selection-db.ts`:
   - `saveEditorialAssessment`: validação de alternativas da base comparativa dentro do mesmo `tenantId` (rejeita alternativas inexistentes ou de outras contas) e com observações com menos de 48 horas.
   - `replaceEditorialSelection`: verificação de alegações de superioridade tanto no `publicRationale` quanto no `context` do item da seleção; bloqueia ativação (`selection_item_blocked`) se houver alegações sem alternativas válidas, atualizadas e da mesma conta.
   - `getPublishedEditorialSelection`: revalidação na leitura pública; omite da publicação qualquer produto com alegação de superioridade cuja base comparativa tenha vencido (> 48h) ou cujas alternativas tenham sido alteradas/descartadas.
10. `packages/web/app/admin/curadoria/group-reviewer.tsx`:
    - Adicionado aviso explícito de que família editorial não implica mesmo modelo.
    - Exibição de badge para variantes ("confirmada" vs "não confirmada").
    - Diálogo modal para inserção da justificativa editorial de saturação ao reter membros excedentes.
11. `packages/web/app/admin/curadoria/selecao-view.tsx`:
    - Adicionados campos de base comparativa (`alternativeProductIds`, `checkedAt`, `rationale`) quando alegação de superioridade for detectada ou preenchida.
    - Mapeamento e exibição de mensagens de erro amigáveis para falhas de validação comparativa.

### Novo Módulo Puro
12. `packages/web/lib/comparison-evidence.ts`:
    - `resolveVariantEvidence`: resolve configuração/variante via `offerEvidence` (`variantKey`/`variantLabel`); marca como não confirmada se ausente. Suporta entrada direta ou encapsulada.
    - `ratingConfidenceScore`: cálculo conservador de confiança estatística de avaliação ponderando nota e volume amostral.
    - `compareReviewEvidence`: ordenação para exame de curadoria no mesmo marketplace sem declarar "melhor".
    - `explainEvidenceComparison`: justificativas reproduzíveis sobre limites de comparação (ausência de contagem, vendas aproximadas, piso de nota, lojas distintas).
    - `hasSuperiorityClaim`: regex Unicode para detecção de termos inequívocos de superioridade pública.
    - `validateComparativeBasis`: validação da estrutura da base comparativa (versão, alternativas distintas da mesma conta, checagem temporal, justificativa humana).

### Testes e Fixtures Autorizados
13. `packages/persistence/test/product-family.test.ts`: testada regra `cafeteiras` v2 e preservação de v1 nas regras existentes.
14. `packages/web/test/comparison-evidence.test.mjs`: testes unitários do novo módulo puro cobrindo variantes, pontuação de confiança, limites de lojas distintas e alegações de superioridade.
15. `packages/web/test/curation-snapshot.test.mjs`: testes do snapshot v2 e retrocompatibilidade com v1.
16. `packages/web/test/curation-pipeline.ts` & `packages/web/test/fixtures/curation-benchmark-dataset.json`: ajuste da expectativa de 1 caso de saturação automática eliminada por posição (permanece `pending`).
17. `packages/web/test/editorial-groups.test.mjs`: testes de agrupamento por família e ordenação por evidência de avaliações.
18. `packages/web/test/curation-contract.test.mjs` & `packages/web/test/curation-bulk-group.test.mjs`: testes de validação de ação em grupo e justificativa de saturação.
19. `packages/web/test/editorial-selection.test.mjs`: testes de base comparativa, alegações e bloqueios editoriais.
20. `tools/editorial-tests/comparison-flow.test.ts`: fixture de integração ponta a ponta com PostgreSQL isolado (PGlite), cobrindo multi-tenant (contas A/B), salvamento, ativação e leitura pública.

### Garantias de Proteção Observadas
- **Zero migrações criadas ou alteradas.**
- **Zero operações remotas realizadas.**
- **Zero execuções de backfill com `--apply`** (apenas dry-run local verificado).
- **Zero chamadas reais a APIs de IA pagas.**
- **Zero deploys ou comandos externos.**
- **Working tree preexistente integralmente preservado.**

---

## 2. Evidências por Critério de Aceite

### AC-028.1: Família cafeteiras, identidade de variantes e recaptura de anúncio
- **Comportamento:** Cafeteiras de marcas e preços distintos ("Cafeteira Expresso Oster Prima Latte" vs "Cafeteira Elétrica Três Corações Lov") agrupam sob `fam:cafeteiras:title-keywords:v2` preservando IDs (`caf_1`, `caf_2`), lojas (`mercadolivre`, `shopee`), preços e configurações separados.
- **Variantes:** Variante sem origem sustentada por evidência resulta em `confirmed: false`, `description: "não confirmada"`. Variante com `variantKey`/`variantLabel` e fonte na oferta resulta em `confirmed: true`.
- **Recaptura:** Inserção de nova `price_observation` para o mesmo anúncio atualiza a evidência e o preço sem criar novo modelo ou duplicar produto no banco (`select count(*) from garimpa.product` permanece estável).
- **Evidência:** `tools/editorial-tests/comparison-flow.test.ts` (PASS AC-028.1).

### AC-028.2: Robustez da amostra vs popularidade sem alegação de "melhor"
- **Comportamento:** Oferta com 4,6★ e 1.500 avaliações no mesmo marketplace (`mercadolivre`) tem pontuação de confiança estatística (`ratingConfidenceScore: 4.582`) superior à oferta de 4,9★ com 8 avaliações (`ratingConfidenceScore: 4.148`), sendo priorizada para exame humano (`compareReviewEvidence > 0`).
- **Sem alegação de melhor:** `explainEvidenceComparison` gera relatório técnico descritivo (`isClaimOfBest: false`), e `hasSuperiorityClaim(explanation)` é estritamente falso.
- **Conservadorismo reproduzível:** Falta de `reviewCount` relata amostra desconhecida; lojas distintas não aplicam precedência estatística de avaliações (caem em desempate neutro de ID); nota abaixo de 4,0★ não recebe benefício de amostra.
- **Evidência:** `packages/web/test/comparison-evidence.test.mjs` e `tools/editorial-tests/comparison-flow.test.ts` (PASS AC-028.2).

### AC-028.3: Saturação de família, limites de cards e ação humana com justificativa
- **Comportamento do Pipeline:** Quarta cafeteira excedendo `maxRepresentatives: 3` não é movida para `held/family_saturation` por posição no pipeline automático. Ela permanece com `status: 'pending'`, `reasonCode: null`, eliminando retenções artificiais e poupando custos de IA.
- **Ação em Grupo com Justificativa:** Ação em lote com `retainRemainingAsSaturation: true` exige justificativa editorial válida (mínimo 3 caracteres); valor vazio ou curto falha com `saturation_justification_invalid`.
- **Snapshot v2:** Eventos de curadoria persistidos em `garimpa.curation_event` registram `metadata.snapshot_version: 2`, contendo `reviewCount`, `variant` e `offerEvidenceSource`.
- **Vendas entre Lojas:** Vendas brutas de diferentes marketplaces não são somadas nem distorcem a ordenação global da hero.
- **Evidência:** `packages/web/test/curation-pipeline.test.mjs`, `packages/web/test/curation-snapshot.test.mjs` e `tools/editorial-tests/comparison-flow.test.ts` (PASS AC-028.3).

### AC-028.4: Regra nova de família (v2) e ensaio dry-run de backfill multi-tenant
- **Versão da Regra:** Regra de cafeteiras retorna `{ key: "cafeteiras", label: "Cafeteiras", method: "title-keywords", version: "v2" }`. Regras legadas (ex.: cozinha, unhas, manoplas) retornam `v1`.
- **Dry-run Multi-tenant:** Ensaio local com `backfillFamilies(sql, "a", false)` e `backfillFamilies(sql, "b", false)` contra contas com produtos não classificados reporta `mode: 'dry-run'`, `wouldClassify: 1` e `applied: 0`. No banco, nenhum registro foi alterado (`family_key` permanece `null` em ambas as contas, sem vazamento cruzado).
- **Sem `--apply`:** Nenhum comando de aplicação ou conexão remota executado.
- **Evidência:** `packages/persistence/test/product-family.test.ts` e `tools/editorial-tests/comparison-flow.test.ts` (PASS AC-028.4).

### AC-028.5: Base comparativa estruturada, isolamento e validação de superioridade
- **Rejeição sem Base:** Tentar salvar `editorial_assessment` com "melhor cafeteira" sem `comparativeBasis` falha com `superiority_claim_requires_comparative_basis`.
- **Rejeição de Alternativas Vazias:** Tentar salvar com `alternativeProductIds: []` falha com `comparative_basis_alternatives_required`.
- **Isolamento de Contas:** Tentar apontar alternativa pertencente à conta B a partir da conta A falha com `comparative_basis_alternative_not_found`.
- **Validação de Frescor Temporal:** Alternativa com observação de preço > 48 horas falha com `comparative_basis_alternative_expired`.
- **Sucesso com Base Estruturada:** Comparação com alternativa válida da mesma conta, preço fresco (< 48h) e justificativa humana é salva e ativada com sucesso.
- **Bloqueio no Contexto de Seleção:** Inserir alegação de superioridade no `context` da seleção sem base no assessment bloqueia a ativação (`selection_item_blocked`).
- **Defesa na Leitura Pública:** Se a observação da alternativa expirar (> 48h) após a ativação, `getPublishedEditorialSelection` detecta o vencimento e omite o item com alegação de superioridade da vitrine pública até nova revisão humana.
- **Texto Descritivo:** Avaliação descritiva ("Cafeteira com bomba de 19 bar") passa e é ativada normalmente sem necessidade de base comparativa.
- **Evidência:** `packages/web/test/editorial-selection.test.mjs` e `tools/editorial-tests/comparison-flow.test.ts` (PASS AC-028.5).

---

## 3. Comandos Executados e Resultados Reais

### 3.1. Execução direta da fixture `comparison-flow.test.ts`
```bash
node --import tsx comparison-flow.test.ts # em tools/editorial-tests
```
**Resultado:** Código de saída 0.
```
PASS AC-028.1: cafeteiras agrupam na mesma família mantendo IDs, lojas e configurações separados
PASS AC-028.2: 4,6★/1500 avaliações priorizado para exame frente a 4,9★/8 avaliações no mesmo marketplace
[ai-curation] GEMINI_API_KEY ausente; pulando triagem semântica.
PASS AC-028.3: quarta cafeteira permanece pending sem family_saturation por posição; retenção exige justificativa
PASS AC-028.4: regra v2 com método explícito e backfillFamilies(apply=false) com applied=0 em duas contas
PASS AC-028.5: alegação de superioridade sem base falha; base comparativa estruturada passa e valida expiração/conta

TODOS OS 5 TESTES DO FLUXO COMPARATIVO PASSARAM COM SUCESSO!
```

### 3.2. Suíte de testes do pacote persistence
```bash
npm test --prefix packages/persistence
```
**Resultado:** Código de saída 0.
```
✔ visto na rodagem atual é ativo mesmo com dias desde a última aparição
...
✔ reconhece famílias com evidência explícita no título
✔ não agrupa produto sem pista forte numa família genérica
✔ familyInfoForTitle devolve chave, rótulo, método e versão do classificador
ℹ tests 39
ℹ suites 1
ℹ pass 39
ℹ fail 0
```

### 3.3. Suíte de testes do pacote web
```bash
npm test --prefix packages/web
```
**Resultado:** Código de saída 0.
```
ℹ tests 432
ℹ suites 0
ℹ pass 432
ℹ fail 0
```

### 3.4. Suíte de integração editorial
```bash
npm test --prefix tools/editorial-tests
```
**Resultado:** Código de saída 0.
```
Editorial integration: 29 scenarios passed. PostgreSQL fixture only; no remote database touched.
```

### 3.5. Checagem de tipos (Persistence e Web)
```bash
npm run typecheck --prefix packages/persistence
npm run typecheck --prefix packages/web
```
**Resultado:** Ambos com código de saída 0 (sem erros de compilação ou tipagem).

### 3.6. Build do pacote web
```bash
npm run build --prefix packages/web
```
**Resultado:** Código de saída 0.
```
   ▲ Next.js 15.5.23
   Creating an optimized production build ...
 ✓ Compiled successfully in 3.7s
 ✓ Linting and checking validity of types 
 ✓ Collecting page data 
 ✓ Generating static pages (22/22)
 ✓ Finalizing page optimization
```

---

## 4. Conclusão

A OS-028 foi implementada com rigor no ambiente local, atendendo integralmente aos critérios AC-028.1 a AC-028.5. O catálogo e a curadoria agora distinguem com precisão semelhança aproximada de identidade real de modelo e variante, priorizam amostras robustas para revisão humana sem gerar falsas alegações de qualidade, exigem base comparativa auditável para afirmações públicas de superioridade com isolamento absoluto multi-tenant, e preservam a integridade dos contratos, histórico e custos de IA.

