# Relatório de Execução — OS-034 (Correção Focalizada da OS-028)

**Data de execução:** 19/10/2026  
**Skill utilizada:** `/executor-blindado`  
**Baseline:** `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` + working tree local extenso preservado.  
**Origem:** [AUDITORIA-OS-028](AUDITORIA-OS-028.md), achados de implementação BUG-017 a BUG-023 contra os critérios AC-028.1 a AC-028.5 de [OS-028](OS-028.md).

---

## 1. Sumário Executivo

A OS-034 foi executada estritamente dentro da lista fechada de arquivos autorizados. Todos os 7 achados de implementação da auditoria prévia (**BUG-017 a BUG-023**) foram reproduzidos, corrigidos no código e cobertos por testes unitários e de integração real em banco local isolado (PGlite).

Nenhum arquivo protegido foi alterado (sem migrations, sem backfill `--apply`, sem chamadas de rede ou APIs pagas de IA, sem deploy). Todas as alterações preexistentes no working tree foram integralmente preservadas.

---

## 2. Matriz de Correção dos Achados (BUG-017 a BUG-023)

### BUG-017 / AC-028.1 — Origem e sustentação da variante
- **Defeito auditado:** `resolveVariantEvidence` aceitava `variantKey`/`variantLabel` isolados sem procedência verificável, permitindo afirmar variante não confirmada.
- **Correção efetuada:**
  - Em `packages/web/lib/comparison-evidence.ts`: `resolveVariantEvidence` agora exige expressamente fonte auditável (`rec.source` contendo `marketplace` ou `url` E `method` ou `capturedAt` válido). Na ausência de fonte sustentada, retorna `confirmed: false`, `variantKey: null`, `variantLabel: null` e `description: "não confirmada"`.
  - Recaptura de anúncio existente (`external_id` idêntico): atualiza a observação e a evidência na mesma linha do produto sem duplicar IDs no catálogo.
- **Testes e evidências:**
  - `packages/web/test/comparison-evidence.test.mjs`: `resolveVariantEvidence` com fonte válida confirma; sem fonte retorna `confirmed: false` e campos nulos.
  - `tools/editorial-tests/comparison-flow.test.ts`: testado no fluxo PGlite com `caf_1` e `caf_2`.

### BUG-022 / AC-028.2 — Amostra desconhecida ou inválida de avaliações
- **Defeito auditado:** Valores nulos, negativos ou fracionários de `reviewCount` recebiam tratamento inadequado ou projeção incorreta no snapshot, gerando bônus indevido.
- **Correção efetuada:**
  - Em `packages/web/lib/comparison-evidence.ts`: `ratingConfidenceScore` retorna `null` para qualquer amostra nula, negativa ou não inteira (`!Number.isSafeInteger(reviews) || reviews < 0`).
  - Em `packages/web/lib/comparison-evidence.ts`: `compareReviewEvidence` não aplica bônus estatístico se `scoreA === null || scoreB === null`, caindo em desempate neutro de ID.
  - Em `packages/web/lib/curation-db.ts`: `toGroupMemberProduct` e `toSnapshotFacts` validam `Number.isSafeInteger(rawReviewCount) && rawReviewCount >= 0`; caso contrário, o valor permanece estritamente `null`.
- **Testes e evidências:**
  - `packages/web/test/comparison-evidence.test.mjs`: `ratingConfidenceScore(4.5, null)`, `ratingConfidenceScore(4.5, -3)` e `ratingConfidenceScore(4.5, 2.8)` retornam `null`.
  - `tools/editorial-tests/comparison-flow.test.ts`: verificado em PGlite no snapshot v2 e nas funções de evidência.

### BUG-018 / AC-028.2–.3 — Contagem de vendas entre lojas distintas
- **Defeito auditado:** O fallback de desempate em `selectRepresentatives` e a pontuação catalogual em `classifyHeroCandidate` utilizavam `salesCount` bruto entre marketplaces distintos, inflando o score sem denominador comparável.
- **Correção efetuada:**
  - Em `packages/web/lib/editorial-groups.ts`: no fallback de `selectRepresentatives`, vendas só comparam produtos do **mesmo** marketplace (`a.marketplace === b.marketplace ? (p.salesCount ?? 0) : 0`). Lojas distintas caem em desempate neutro por ID.
  - Em `packages/web/lib/hero-ranking.ts`: o sinal catalogual de vendas passa a atribuir `0` pontos (`add("Vendas informadas pelo marketplace", 0)`), mantendo o sinal puramente descritivo e sem peso na pontuação global.
- **Testes e evidências:**
  - `packages/web/test/editorial-groups.test.mjs`: produtos de lojas distintas com 10 vs 10.000 vendas mantêm diversidade de representantes.
  - `packages/web/test/hero-ranking.test.mjs`: produtos de lojas distintas com 10 vs 10.000 vendas recebem notas idênticas (0 pontos de bônus por vendas).

### BUG-019 / AC-028.3 — Retenção deliberada e confirmação de membros
- **Defeito auditado:** `retainRemainingAsSaturation: true` aceitava justificativa vazia ou ausente, e a confirmação de grupo não verificava se o conjunto de membros em tela divergia do banco de dados no momento da mutação.
- **Correção efetuada:**
  - Em `packages/web/lib/curation-contract.ts`: `validateGroupAction` valida que `saturationJustification` é obrigatória quando `retainRemainingAsSaturation: true` (mínimo de 3 caracteres não brancos), rejeitando com `saturation_justification_invalid`. Adicionado campo `expectedMemberProductIds?: string[] | null`.
  - Em `packages/web/lib/curation-db.ts`: `actOnGroup` confere `expectedMemberProductIds` contra os membros reais do grupo no banco de dados. Se houver divergência, rejeita com a exceção `curation_group_members_changed`.
  - Em `packages/web/app/admin/curadoria/group-reviewer.tsx`: a UI exibe a lista completa de membros afetados antes da confirmação, exige texto do operador sem preenchimento padrão do servidor e envia `expectedMemberProductIds`.
- **Testes e evidências:**
  - `packages/web/test/curation-bulk-group.test.mjs`: rejeita sem justificativa ou com justificativa em branco; aceita com justificativa válida.
  - `tools/editorial-tests/comparison-flow.test.ts`: `actOnGroup` rejeita com `curation_group_members_changed` quando os membros esperados divergem do banco.

### BUG-020 / AC-028.5 — Base comparativa estruturada e auditável
- **Defeito auditado:** A base comparativa permitia salvar sem critérios explícitos, sem recorte de uso/faixa de preço e sem vincular evidências canônicas do candidato e das alternativas observadas no banco.
- **Correção efetuada:**
  - Em `packages/web/lib/comparison-evidence.ts`: `validateComparativeBasis` exige `usageScope` ou `priceRange`, ao menos 1 critério em `criteria`, justificativa humana em `rationale`, e referências canônicas completas em `evidenceReferences` para o candidato e todas as alternativas.
  - Em `packages/web/lib/editorial-selection-db.ts`: `saveEditorialAssessment` deriva e confere as referências canônicas (`evidenceReferences`) diretamente a partir das observações recentes (< 48h) e aprovadas no banco para o candidato e alternativas.
  - Em `packages/web/lib/editorial-selection.ts`: `editorialSelectionBlockers` valida a presença de `criteria`, `usageScope`/`priceRange` e `evidenceReferences`.
  - Em `packages/web/app/admin/curadoria/selecao-view.tsx`: adicionados campos para recorte de uso, faixa de preço, critérios e alternativas, informando ao editor que as evidências canônicas são vinculadas e checadas pelo servidor.
- **Testes e evidências:**
  - `packages/web/test/comparison-evidence.test.mjs`: testes unitários de ausência de critérios, recorte e referências incompletas.
  - `packages/web/test/editorial-selection.test.mjs`: bloqueios em `editorialSelectionBlockers` e validação de `validateEditorialAssessment`.
  - `tools/editorial-tests/comparison-flow.test.ts`: persistência completa em PGlite com conferência de `evidenceReferences`.

### BUG-021 / AC-028.5 — Revalidação contínua em todos os caminhos públicos
- **Defeito auditado:** Mudanças materiais de preço ou rejeição de alternativas após ativação continuavam publicando o item com alegação de superioridade, tanto no modo editorial quanto no modo catálogo.
- **Correção efetuada:**
  - Em `packages/web/lib/editorial-selection-db.ts`: criada função `fetchAlternatives(tx, tenantId, altIds)`.
  - Em `replaceEditorialSelection` e em `getPublishedEditorialSelection` (ambos nos ramos `mode: "editorial"` e `mode: "catalog"`): revalidação em lote das alternativas referenciadas por itens portadores de alegação de superioridade. Se o preço material divergir do referenciado na base (ex.: R$ 499 -> R$ 900), se a alternativa for rejeitada ou se a observação tiver > 48h, o item é omitido da leitura pública sem deletar o registro histórico no banco de dados.
  - Isolamento estrito por tenant garantido via `set_config('garimpa.tenant_id', ...)` e cláusulas `where tenant_id = ...`.
- **Testes e evidências:**
  - `tools/editorial-tests/comparison-flow.test.ts`:
    - Alternativa `alt_a` tem preço alterado de R$ 499 para R$ 900 -> `getPublishedEditorialSelection` omite `best_a` (0 produtos).
    - Restauração do preço para R$ 499 -> `getPublishedEditorialSelection` volta a exibir `best_a` (1 produto).
    - Alternativa `alt_a` marcada como `rejected` -> `getPublishedEditorialSelection` omite `best_a` (0 produtos).
    - Reaprovação de `alt_a` -> `best_a` volta a ser publicado (1 produto).
    - Catálogo do tenant B verificado de forma isolada e sem contaminação.

### BUG-023 / AC-028.5 — Detector de superlativos de preço
- **Defeito auditado:** Expressões de superioridade de preço ("a mais barata entre as cafeteiras", "a opção mais barata da loja", "menor preço") não eram capturadas pelo detector, contornando o gate de base comparativa.
- **Correção efetuada:**
  - Em `packages/web/lib/comparison-evidence.ts`: regex `SUPERIORITY_CLAIM_PATTERN` expandida para incluir `mais barat[oa]s?`, `menor(es)? pre[çc]o(s)?` e `mais em conta`.
- **Testes e evidências:**
  - `packages/web/test/comparison-evidence.test.mjs`: testa "A mais barata entre as cafeteiras", "A opção mais barata da loja", "O produto mais barato da categoria", "Menor preço garantido", "Com os menores preços" e "A escolha mais em conta". Todas retornam `true`.
  - Frases descritivas legítimas continuam retornando `false`.
  - `tools/editorial-tests/comparison-flow.test.ts`: `saveEditorialAssessment` com publicRationale "A mais barata entre as cafeteiras do catálogo" sem base comparativa falha com `superiority_claim_requires_comparative_basis`.

---

## 3. Registro Real de Execução dos Testes

### 3.1. Testes focados dos módulos alterados (76/76 PASS)
Comando executado:
```bash
node --test \
  packages/web/test/comparison-evidence.test.mjs \
  packages/web/test/curation-contract.test.mjs \
  packages/web/test/curation-bulk-group.test.mjs \
  packages/web/test/curation-snapshot.test.mjs \
  packages/web/test/editorial-groups.test.mjs \
  packages/web/test/hero-ranking.test.mjs \
  packages/web/test/editorial-selection.test.mjs
```
Saída real:
```text
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 158.159327
```

### 3.2. Fixture PGlite do fluxo comparativo (5/5 PASS)
Comando executado a partir de `tools/editorial-tests`:
```bash
node --import tsx comparison-flow.test.ts
```
Saída real:
```text
PASS AC-028.1: cafeteiras agrupam na mesma família mantendo IDs, lojas e configurações separados
PASS AC-028.2: 4,6★/1500 avaliações priorizado para exame frente a 4,9★/8 avaliações no mesmo marketplace
[ai-curation] GEMINI_API_KEY ausente; pulando triagem semântica.
PASS AC-028.3: quarta cafeteira permanece pending sem family_saturation por posição; retenção exige justificativa
PASS AC-028.4: regra v2 com método explícito e backfillFamilies(apply=false) com applied=0 em duas contas
PASS AC-028.5: alegação de superioridade sem base falha; base comparativa estruturada passa e valida expiração/conta

TODOS OS 5 TESTES DO FLUXO COMPARATIVO PASSARAM COM SUCESSO!
```

### 3.3. Suíte de integração editorial (29/29 PASS)
Comando executado:
```bash
npm test --prefix tools/editorial-tests
```
Saída real:
```text
Editorial integration: 29 scenarios passed. PostgreSQL fixture only; no remote database touched.
```

### 3.4. Suíte do pacote de persistência (39/39 PASS)
Comando executado:
```bash
npm test --prefix packages/persistence
```
Saída real:
```text
ℹ tests 39
ℹ suites 1
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 746.285825
```

### 3.5. Suíte completa de testes web (435/435 PASS)
Comando executado:
```bash
npm test --prefix packages/web
```
Saída real:
```text
ℹ tests 435
ℹ suites 0
ℹ pass 435
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1950.797176
```

### 3.6. Checagem de tipos (Typecheck)
Comandos executados:
```bash
npm run typecheck --prefix packages/persistence
npm run typecheck --prefix packages/web
```
Saídas reais:
- `packages/persistence`: código 0 (sem erros).
- `packages/web`: código 0 (sem erros).

### 3.7. Compilação de produção (Build)
Comando executado:
```bash
npm run build --prefix packages/web
```
Saída real:
```text
✓ Compiled successfully in 3.0s
Linting and checking validity of types     ✓ Linting and checking validity of types 
Collecting page data     ✓ Collecting page data 
✓ Generating static pages (22/22)
Collecting build traces     ✓ Collecting build traces 
Finalizing page optimization     ✓ Finalizing page optimization 
```

---

## 4. Distinção de Limitações Ambientais e Bloqueios de Fronteira

- **Bloqueios de fronteira (`BLOQUEIO_DE_FRONTEIRA`):** Nenhum. Todos os 7 achados foram resolvidos dentro dos caminhos estritamente autorizados pela OS-034.
- **Limitações ambientais observadas na auditoria prévia:**
  - `ml-manual-only-entrypoints.test.ts`: falha com `EPERM` na chamada `spawnSync` dentro da sandbox;
  - `qr-service.test.mjs`: limitação de interface de rede (`uv_interface_addresses`) da sandbox;
  - `capture-process.test.mjs`: timeout aguardando subprocesso de captura na sandbox.
  Estas limitações são inerentes ao isolamento da sandbox do ambiente de execução e não foram mascaradas nem representam regressões introduzidas por esta OS.

---

## 5. Arquivos Alterados (Diff Restrito)

Os seguintes arquivos compõem a entrega da OS-034:
- `packages/web/lib/comparison-evidence.ts` (lógica de variantes, confiança de amostra, detector de superlativos, validação de base comparativa)
- `packages/web/lib/curation-contract.ts` (contrato de saturação e membros esperados)
- `packages/web/lib/curation-db.ts` (conferência de membros concorrentes e saneamento de reviewCount)
- `packages/web/lib/editorial-groups.ts` (desempate neutro de vendas entre lojas distintas)
- `packages/web/lib/hero-ranking.ts` (sinal de vendas descritivo com 0 pontos)
- `packages/web/lib/editorial-selection.ts` (blockers de base comparativa estruturada)
- `packages/web/lib/editorial-selection-db.ts` (revalidação pública de preço, status e frescor das alternativas)
- `packages/web/app/admin/curadoria/group-reviewer.tsx` (interface com transparência de membros e justificativa humana obrigatória)
- `packages/web/app/admin/curadoria/selecao-view.tsx` (interface para recorte, critérios e alerta de evidências canônicas)
- `packages/web/test/comparison-evidence.test.mjs` (testes de BUG-017, BUG-020, BUG-022, BUG-023)
- `packages/web/test/curation-bulk-group.test.mjs` (testes de BUG-019)
- `packages/web/test/curation-contract.test.mjs` (testes de contrato)
- `packages/web/test/curation-snapshot.test.mjs` (testes de snapshot)
- `packages/web/test/editorial-groups.test.mjs` (testes de BUG-018)
- `packages/web/test/hero-ranking.test.mjs` (testes de BUG-018)
- `packages/web/test/editorial-selection.test.mjs` (testes de BUG-020)
- `tools/editorial-tests/comparison-flow.test.ts` (fixture de integração completa PGlite dos 5 aceites e dos 7 contraexemplos)
- `docs/implementation/contratos-fluxo-unico/RESULTADO-OS-034.md` (este relatório)

---

## 6. Conclusão e Homologação

Todos os contraexemplos identificados na auditoria prévia foram eliminados e comprovados por testes comportamentais reproduzíveis:
1. Variante sem fonte verificada não é mais confirmada (`BUG-017`).
2. Amostras inválidas ou desconhecidas de avaliações não recebem bônus estatístico (`BUG-022`).
3. Vendas brutas de lojas diferentes não alteram posições editoriais nem rankings factuais (`BUG-018`).
4. Retenção deliberada por saturação exige justificativa humana e valida a integridade dos membros do grupo (`BUG-019`).
5. Alegações públicas de superioridade exigem base comparativa auditável com critérios explícitos e evidências canônicas (`BUG-020`).
6. A leitura pública revalida continuamente o preço, estado e frescor das alternativas, omitindo o item de forma limpa caso as referências sejam invalidadas (`BUG-021`).
7. Superlativos de preço ("a mais barata", "menor preço") são identificados e subordinados ao mesmo gate de evidência (`BUG-023`).

Com isso, os critérios **AC-028.1 a AC-028.5** foram plenamente implementados e verificados, restabelecendo a conformidade dos contratos da OS-028 para homologação pela auditoria de entrega.

