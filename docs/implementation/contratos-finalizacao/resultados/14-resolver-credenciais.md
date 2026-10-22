# Resultado da OS-14 — Resolver de Credenciais de Conta para Captura e Monitoramento

- **OS**: OS-14
- **Estado**: CONCLUIDO
- **Data**: 17/10/2026
- **Baseline**: `43700c59` + OS-13 concluída
- **Arquivos escritos**:
  - `packages/web/lib/account-credential-resolver.ts` (novo)
  - `packages/web/lib/capture-dispatch.ts` (atualizado para usar assertAccountCanDispatchCapture)
  - `packages/web/test/account-credential-resolver.test.mjs` (novo teste de segurança e isolamento)

## Comportamentos modificados e aceites:
- **AC-14.1**: `resolveAccountMarketplaceCredentials` resolve e decifra segredos de `garimpa.affiliate_secret` para a conta solicitada usando AES-256-GCM e AAD específico da conta e marketplace.
- **AC-14.2**: Isolamento estrito fail-closed: se a conta não possui credenciais configuradas para o marketplace, a operação falha com erro `account_credentials_missing` / `capture_account_credentials_required`, sem qualquer fallback para as credenciais da casa.
- **AC-14.3**: Contas com status `suspended` são bloqueadas imediatamente na resolução com erro `account_suspended`.
- **AC-14.4**: Transplante de segredos entre contas é prevenido através de autenticação criptográfica por AAD (`tenantId:marketplace:secretId`), rejeitando qualquer tentativa com `credential_tampered`.

## Verificações executadas:
1. `node --test packages/web/test/account-credential-resolver.test.mjs` -> 6 testes passaram (100%).
2. `node --test packages/web/test/affiliate-secret.test.mjs` -> 6 testes passaram sem regressão.
3. `npm run test:capture-batch --prefix tools/editorial-tests` -> 20 cenários passaram com sucesso.
