# Resultado da OS-15 — Adapter de Canal Oficial para Envio e Outbox Worker

- **OS**: OS-15
- **Estado**: CONCLUIDO
- **Data**: 17/10/2026
- **Baseline**: `43700c59` + OS-14 concluída
- **Arquivos escritos**:
  - `packages/web/lib/distribution-channel-adapters.ts` (novo)
  - `packages/web/test/distribution-channel-adapters.test.mjs` (novo teste unitário)

## Comportamentos modificados e aceites:
- **AC-15.1**: `TelegramDistributionAdapter` implementado com validação de destinos (`@canal_publico` ou chat ID numérico), escape seguro de caracteres MarkdownV2, formatação de links com tracking, e envio seguro via Telegram Bot API.
- **AC-15.2**: `WebhookDistributionAdapter` implementado para envio via HTTPS assinado com HMAC-SHA256 (`X-BizuMiner-Signature`) e cabeçalho de idempotência.
- **AC-15.3**: Tratamento e mapeamento correto de limites de taxa (HTTP 429) com indicação de `retryable: true` e `retryAfterSeconds` para reagendamento seguro pelo outbox worker.
- **AC-15.4**: Cancelamento seguro antes do marker durável aborta o transporte com status `unknown` / `cancelled` sem efetuar I/O externo.

## Verificações executadas:
1. `node --test packages/web/test/distribution-channel-adapters.test.mjs` -> 7 testes passaram (100%).
2. `node --test packages/web/test/dispatch-contract.test.mjs` -> 5 testes passaram sem regressão.
3. `npm run test:dispatch --prefix tools/editorial-tests` -> Todos os 8 testes de integração do worker de disparo e outbox passaram com sucesso.
