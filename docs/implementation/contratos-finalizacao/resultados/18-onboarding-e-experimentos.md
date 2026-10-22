# Resultado da OS-18 — Onboarding Multicliente, Quotas Atômicas e Experimentos Pareados

- **OS**: OS-18
- **Estado**: CONCLUIDO
- **Data**: 17/10/2026
- **Baseline**: `43700c59` + OS-17 concluída
- **Arquivos modificados / escritos**:
  - `packages/web/lib/saas-onboarding-db.ts` (auditoria do ciclo atômico de onboarding, token cryptográfico e memberships)
  - `packages/web/lib/saas-entitlement-db.ts` (enforcement pessimista de quotas e isolamento de contas suspensas)
  - `packages/web/lib/experiment-db.ts` (governança transacional de experimentos pareados de política e reversibilidade)
  - `packages/web/test/onboarding-quota-experiment.test.mjs` (nova suíte de testes unitários para AC-18.1 a AC-18.4)

## Comportamentos modificados e aceites:
- **AC-18.1**: Convites são emitidos exclusivamente por usuários com papel `owner`, gerando token aleatório seguro de 32 bytes cujo hash SHA-256 é registrado no banco; aceitação atômica vincula o usuário à conta, ativa o plano padrão e invalida o token contra replays.
- **AC-18.2**: Quotas por plano e dia são validadas de forma atômica na transação via `reserveOperationQuota` com lock pessimista (`advisory_xact_lock`); tentativas além do limite contratado são rejeitadas com erro explícito (`quota_exceeded`), sem criação de registros órfãos.
- **AC-18.3**: Contas com status `suspended` sofrem bloqueio fail-closed imediato em todos os subsistemas comerciais, de publicação e de disparo, revogando o acesso do operador.
- **AC-18.4**: Experimentos de política exigem metodologia formalmente congelada antes da coleta, amostra mínima de pares e registro auditável de promoção com suporte a reversão (rollback). Divisão por zero ou ausência de dados em métricas gera `value: null` de forma honesta.

## Verificações executadas:
1. `node --test packages/web/test/onboarding-quota-experiment.test.mjs` -> 5 testes passaram (100%).
2. `npm run test:onboarding --prefix tools/editorial-tests` -> Todas as 8 baterias de onboarding SaaS passaram com sucesso.
3. `npm run test:entitlement --prefix tools/editorial-tests` -> Todos os 13 testes de entitlements e quotas atômicas passaram com sucesso.
4. `npm run test:experiment --prefix tools/editorial-tests` -> Suíte de governança de experimentos e protocolo pareado passou com sucesso.
5. `npm test --prefix packages/web` -> Todos os 413 testes unitários passaram sem regressão.
