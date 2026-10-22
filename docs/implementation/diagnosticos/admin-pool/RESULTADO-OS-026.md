# Resultado OS-026 — BUG-013

18/10/2026; tentativa#1. Baseline main43700c59 + alterações locais anteriores, manifesto be4dbc372fa4753c944234c6dfefb742c2c877d3f8bce7315fcab85123098df3 em /tmp/bizuminer-admin-pool-correcao/baseline.json. Contrato aprovado antes da execução em AUDITORIA-OS-026.md. Estado vigente: **CONCLUIDO no escopo local**, após parecer independente CONFORME.

## Delta autorizado

Somente db.ts (imports/factory/comentário), novo database-pool.ts, database-pool.test.mjs, admin-pool-native.test.ts e admin-pool-flow.cjs, mais este resultado. Comparação do delta usa cópia inicial, não o diff integral contra HEAD já modificado. Nenhuma alteração em env, Next config, migrations, rollouts, página admin, diagnóstico/probe histórico ou entregas anteriores.

Pool Postgres.js único por processo/destino em globalThis, máximo3, fila do driver, prepare:false, idle5s, connect10s, lifetime60s. Handles independentes encerram seu uso lógico sem fechar sockets/transações de outros; sessões físicas são reaproveitadas e expiram por ociosidade. begin mantém contexto por handle/tx e opções, sem mutar o pool; SQL lazy de handle fechado não pode iniciar depois. Query/cursor/cancelamento preservam métodos do driver. Destinos diferentes não compartilham pool. A alteração reduz conexões físicas em vez de redesenhar consultas/abas.

## Verificações do executor

| Aceite / comando | Evidência |
|---|---|
| AC-026.1 `node tools/editorial-tests/admin-pool-flow.cjs` | exit0. Página/DAL reais transpiladas, driver/auth/UI sintéticos. Factory legada reconstruída preserva pico14 e recusa sob2 renders. Factory atual:2 renders+6 chamadas reais de publicStatus resolvem, pico3, um pool, zero recusa. Recarga dos módulos mantém pool. Modelo não executa SQL/RLS reais. |
| AC-026.2/3 `BIZUMINER_TEST_PG_BIN=<bin local existente> node --import tsx admin-pool-native.test.ts` (tools/editorial-tests) | exit0. PostgreSQL17.11 descartável localhost, driver/pool/handles/withAccountDb e SQL/RLS reais. 28 transações A/B concorrentes, pg_stat_activity pico3, resultados próprios A/B/A, identidade alheia negada, rollback22012, GUC limpa, endA não mataB, opções repeatable-read/read-only preservadas. Cancelamento real57014 libera capacidade, próximo SELECT42 passa; sessões ociosas chegam0. |
| `npm test --prefix packages/web` | 428/428, exit0; inclui3 testes novos de handles/SQL lazy/destinos. |
| `npm run typecheck --prefix packages/web` | exit0. Primeira execução detectou retorno unknown de Reflect.apply no wrapper; anotação local do retorno dinâmico corrigida e typecheck repetido, sem mudança contratual. |
| `npm run build --prefix packages/web` | exit0. |
| `npm test --prefix tools/editorial-tests` | 29 cenários, exit0. |
| `npm run test:cf-regressions --prefix tools/editorial-tests` | CF01…18, exit0. |
| `npm run test:capture-batch --prefix tools/editorial-tests` | 20 cenários, exit0. |
| `npm run test:dispatch --prefix tools/editorial-tests` | 8 cenários, exit0. |

Logs em /tmp/bizuminer-admin-pool-correcao/: native.log, flow-final.log, web-final.log, types-final.log, build.log, editorial.log, cf.log, capture.log, dispatch.log. Teste nativo usa binários existentes /tmp/bizuminer-finalizacao/os-01/pg-tools/root/usr/lib/postgresql/17/bin; sem instalação, sem Supabase remoto. O harness final é autocontido para comparar a factory legada; não depende da cópia temporária para ser repetido.

## Runtime e limites

Navegação real no browser para http://localhost:3100/admin chegou a /entrar?next=%2Fadmin com formulário normal de login; sem sessão autenticada disponível. Não foi ultrapassada autenticação nem criado usuário. Esse teste verifica a barreira sem sessão, não a renderização autenticada ou métricas do Supavisor no instante original. Dados privados de A/B foram exercitados na fixture nativa.

A correção trata o mecanismo confirmado no código; limite3 é por processo/destino, não um teto distribuído entre réplicas, CLIs ou aplicações externas. Não houve alteração de pool_size, porta, credenciais, serviço remoto, deploy ou reinício do servidor local. Homologação autenticada no ambiente do incidente permanece NAO_VERIFICADA; não equivale a defeito novo ou motivo para afirmar produção homologada.

Rollback só do delta desta OS a partir da cópia inicial, preservando demais alterações; restauraria o mecanismo de saturação. Fechamento do BUG no escopo local depende da contraprova independente desta fonte, sem apagar o diagnóstico original.

Fechamento independente — [AUDITORIA-OS-026.md](AUDITORIA-OS-026.md), adendo de entrega: fluxo/hot reload,3 unitários e nativo PostgreSQL17.11 foram reexecutados pelo auditor e passaram. BUG-013 verificado localmente, tentativa#1. Manifesto de992 arquivos df1f047c9844b27c77c3cc25b8b963a64d9272acda56df730b973e761647b220 conferido sem drift. Após esse parecer, somente este resultado foi atualizado para registrar o fechamento; nenhuma fonte/teste mudou. Limites de homologação autenticada/remota acima permanecem vigentes.
