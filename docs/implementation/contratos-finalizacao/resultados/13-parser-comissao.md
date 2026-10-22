# Resultado da OS-13 — Adapters de Importação de Comissões e Relatórios de Afiliados

- **OS**: OS-13
- **Estado**: CONCLUIDO
- **Data**: 17/10/2026
- **Baseline**: `43700c59` + alterações locais do núcleo
- **Arquivos escritos**:
  - `packages/web/lib/commission-import-adapters.ts` (novo)
  - `packages/web/lib/commission-import-contract.ts` (atualizado para expor e delegar aos adapters)
  - `packages/web/test/commission-import-adapters.test.mjs` (novo teste unitário)

## Comportamentos modificados e aceites:
- **AC-13.1**: Implementada detecção automática de formatos de relatório (`Shopee`, `AliExpress`, `MercadoLivre`, `Canonical`) através de cabeçalhos normalizados (incluindo tratamento de acentuação Unicode NFD).
- **AC-13.2**: Implementada normalização resiliente de valores monetários para centavos inteiros (`orderValueCents`, `commissionCents`) e datas para ISO 8601 UTC.
- **AC-13.3**: Tratamento estrito de erros por linha, classificação de identificadores que exigem revisão manual e garantia de cálculo de digest canônico invariante à ordem das linhas.
- **AC-13.4**: Delegação automática transparente em `parseCanonicalCommissionCsv` para que qualquer interface existente passe a aceitar relatórios de múltiplos marketplaces.

## Verificações executadas:
1. `node --test packages/web/test/commission-import-adapters.test.mjs` -> 8 testes passaram (100%).
2. `node --test packages/web/test/commission-import-contract.test.mjs` -> 4 testes contratuais passaram sem regressão.
3. `npm run test:financial --prefix tools/editorial-tests` -> Todos os 8 testes de integração do ledger financeiro e importação passaram com sucesso.
