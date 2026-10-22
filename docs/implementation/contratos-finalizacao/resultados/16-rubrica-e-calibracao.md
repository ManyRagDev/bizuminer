# Resultado da OS-16 — Rubrica Editorial V2, Ratificação de Política e Calibração E3

- **OS**: OS-16
- **Estado**: CONCLUIDO
- **Data**: 17/10/2026
- **Baseline**: `43700c59` + OS-15 concluída
- **Arquivos modificados / escritos**:
  - `packages/web/lib/rubric-db.ts` (comando `ratifyRubricPolicy` com validação de owner, amostragem e auditoria)
  - `packages/web/lib/price-evidence.ts` (validação de calibração em `calculatePriceEvidence` e export de `calculateCanonicalPriceEvidenceForProduct`)
  - `packages/web/app/admin/curadoria/actions.ts` (action `ratifyRubricPolicyAction` para ratificação formal via UI/Server Actions)
  - `packages/web/test/rubric-policy-ratification.test.mjs` (nova suíte de testes unitários para AC-16.1 a AC-16.4)
  - `tools/editorial-tests/canonical-price-evidence.test.ts` (ajuste do timestamp da fixture para temporalidade dinâmica em relação à janela de 48h)

## Comportamentos modificados e aceites:
- **AC-16.1**: Curadoria humana avalia e salva avaliação V2 diretamente na tabela editorial estruturada sem necessidade de IA Gemini síncrona; digest e autoria são vinculados à membership da conta.
- **AC-16.2**: Comparação em modo sombra (shadow mode) calcula e grava divergências dimensionais (qualidade, valor, público, confiança) na tabela `garimpa.comparison_review` sem que a IA sobrescreva a decisão humana.
- **AC-16.3**: Ratificação formal de política editorial via `ratifyRubricPolicy` / `ratifyRubricPolicyAction` exige permissão de `owner`, valida amostragem mínima e taxa de concordância, congela digest do método e grava evento auditável no outbox de governança.
- **AC-16.4**: Preço canônico no nível E3 degrada de forma segura e honesta para E2 ou E1 quando a calibração não estiver ratificada ou aprovada, prevenindo quebra de renderização e evitando alegações infladas ou falsos recordes.

## Verificações executadas:
1. `node --test packages/web/test/rubric-policy-ratification.test.mjs` -> 3 testes passaram (100%).
2. `npm run test:rubric --prefix tools/editorial-tests` -> 6 testes de integração de rubrica e shadow AI passaram com sucesso.
3. `npm run test:price-evidence --prefix tools/editorial-tests` -> 5 testes de integração de evidência canônica passaram com sucesso.
4. `npm test --prefix packages/web` -> Todos os 403 testes unitários passaram sem regressão.
