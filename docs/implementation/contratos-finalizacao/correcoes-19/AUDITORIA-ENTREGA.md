# Auditoria seletiva de entrega — OS-020 a OS-025

**Parecer vigente após tentativa #2: CONFORME no escopo local dos BUG-001…012, todos verificados.** Ver adendo final com manifesto `f4e512c9…`. O parecer contrário abaixo refere-se exclusivamente à primeira fonte congelada e permanece como histórico. Sem homologação nova no ativo.

18/10/2026; auditor-red-team, modo `entrega`, restrito aos BUG-001…012 e R-01/R-02 da auditoria original OS-19. **Veredicto local: NAO_CONFORME.** Dez achados têm fechamento local verificado; BUG-004 e BUG-008 permanecem parcialmente corrigidos. Não há parecer de homologação no ativo.

## Versão concreta e preservação

HEAD `main 43700c59f4e24f68f3a2e32c20ee5147fa4816cd` mais alterações preexistentes e correções sequenciais. Manifesto examinado: `/tmp/bizuminer-correcao-os19/delivery-source.json`, SHA-256 `ab104fbccbdc25ed11d76736c63afb215bb3dfd87ac5ecabc07772d437abcd04`, 982 arquivos. Contratos corretivos revisados até revisão5; resultados OS-020…025 e `resultados/25-correcao-conclusao.md` lidos.

O auditor recalculou todos os hashes do manifesto: zero divergências. Comparação independente com `baseline.json` inicial `f4fb6cbd…`: 41 arquivos existentes alterados, todos dentro das listas de escrita atuais; zero alterações em migrations/rollouts. Auditoria original, conclusão original e PNG histórico `execucao-19-story.png` preservados byte a byte. Resultado em `/tmp/bizuminer-correcao-os19/audit-preservation.json`. Esta etapa escreveu somente este relatório e evidências em `/tmp`; não alterou produção, contratos ou testes.

## Estado dos mesmos achados

| ID / aceite original | Estado desta versão | Evidência independente e limite |
|---|---|---|
| BUG-001 / AC-13.1/13.2 | **verificado localmente** | Unitários parser e integração financeira passaram; CSV BR mantém 15050/1505 centavos, BRL/confirmed e commit no ledger. |
| BUG-002 / AC-13.3 | **verificado localmente** | Parser rejeita data ausente/inválida, com linha/motivo; lote misto e digest determinístico cobertos nos unitários reexecutados. Não fabrica `new Date()` como ocorrência. |
| BUG-003 / AC-13.1/13.3 | **verificado localmente** | Header-only termina pelos dois entrypoints sem redetecção recursiva; testes reexecutados. |
| BUG-004 / AC-14.1/14.2/14.4 | **persistente, correção parcial** | Resolver/worker/helpers A/B funcionam sob RLS em fixture; entretanto a rota humana de criação do lote ainda bloqueia toda conta externa antes de consultar credenciais. Contraprova A abaixo. |
| BUG-005 / AC-14.3/18.3 | **verificado localmente** | Local suspensa e externa suspensa não resolvem; conta ausente/credencial ausente/adulterada falham fechadas. Integração independente confirmou revogação entre chamadas Shopee com apenas uma chamada ao provedor. |
| BUG-006 / AC-15.1/15.2 | **verificado localmente** | Removido fallback global/padrão. Matriz adicional do auditor: resolver ausente/null/lançando erro faz zero HTTP em ambos adapters. A/B e HMAC do corpo exato passaram. |
| BUG-007 / AC-15.1/15.2/19.3 | **verificado localmente** | Reexecução de `official-channel-flow`: criação, validação, aprovação, agendamento e worker oficial Telegram/Webhook passam, com fatos congelados e HTTP mockado fora da tx. Factory/CLI inspecionados, canais/alias compatíveis; não foi executado `--execute` remoto. |
| BUG-008 / AC-15.3 | **persistente, correção parcial** | Crescimento exponencial/jitter persistido passa (+66s/+132s). Webhook ainda descarta Retry-After recebido do HTTP, violando o piso contratado na revisão corretiva. Contraprova B abaixo. |
| BUG-009 / AC-16.3 | **verificado localmente** | Ambos caminhos recusam 1/29 casos, duplicação/conta alheia/não owner; aceitam30 distintos. Integração reexecutada verifica snapshot/digests estáveis/evento transacional e UPDATE negado. Nenhuma política real ratificada. |
| BUG-010 / AC-17.1 | **verificado localmente** | Testes reexecutados negam caminho absoluto, traversal/prefixo irmão e symlink nos três métodos; legítimo funciona. Avaliação limitada ao driver local contratado. |
| BUG-011 / AC-17.4 | **verificado localmente** | Testes reexecutados decodificam QR dos PNGs finais Story/Feed/Banner e conferem dimensões/presets distintos. Integração do serviço persiste seleção e template; Feed/Banner inspecionados visualmente. |
| BUG-012 / AC-19.3/19.4 | **verificado quanto à correção documental** | Identidade REQ-DOM-05 restaurada e histórico preservado; consolidações não alegam conclusão integral no ativo e condicionam fechamento ao auditor. As afirmações de correção local de BUG-004/008 nos resultados devem receber este parecer contrário; esta verificação documental não fecha essas duas capacidades. |

Todos permanecem classificados como `implementacao`, incluindo o achado documental BUG-012. Não há novo ID ou requisito arquitetural nesta rodada. Tentativa de implementação avaliada: #1. Os dez estados `verificado localmente` não certificam APIs reais, sessões Supabase, Storage/pooler ou efeitos comerciais.

## Contraprovas dos impedimentos

### A — BUG-004: rota ainda recusa universalmente conta externa

**P1; implementação; AC-14.4 e AC-021.2/021.3.** `packages/web/app/api/admin/rodagem/lote/route.ts:71` mantém:

```ts
if (check.context.tenantId !== 'local')
  return sinkJson(check.sink, { ok: false, error: 'capture_account_credentials_required' }, { status: 409 });
```

O auditor executou o POST real transpilado em VM, com autenticação autorizando owner externo, origin válido, gates de marketplace habilitados, banco e transporte substituídos por stubs sem rede. Resultado: **HTTP409**, `capture_account_credentials_required`, zero leitura do corpo, zero criação de lote, zero transporte. A recusa antecede qualquer resolução de credencial; assim alcança também contas com credenciais próprias válidas. As integrações A/B novas chamam diretamente `dispatchCaptureBatch` e não percorrem essa rota.

Há segundo bloqueio no mesmo caminho: `captureTriggerFor(...).enabled()` em `route.ts:117` usa gates web que dependem de `SHOPEE_APP_ID/SECRET` ou `ALIEXPRESS_APP_KEY/SECRET/TRACKING_ID` globais; remover apenas o early return ainda deixa uma conta externa com segredo próprio dependente da configuração house. Esta consequência é confirmada por leitura dos helpers/gates; o probe acima força esse gate habilitado para isolar a primeira falha.

**Correção mínima:** substituir a proibição genérica pela autorização e resolução por tenant/marketplaces do pedido, preservando kill switches, consentimento e indisponibilidade ML externa. Teste deve atravessar o handler da rota, com credenciais próprias válidas e env house ausente, além de ausência/suspensão/conta alheia; sem efeitos reais. Arquivos já pertencem à OS-021; eventual helper adicional requer revisão de fronteira.

Reprodução: `node /tmp/bizuminer-correcao-os19/audit-route.cjs`; evidência `/tmp/bizuminer-correcao-os19/audit-route.log`. Falha inicial do próprio harness por nome `exports` reservado foi corrigida somente em `/tmp`; o probe final executou com exit0 e confirmou a recusa descrita. Não houve teste de sessão remota.

### B — BUG-008: Retry-After do webhook perde-se antes do helper

**P2; implementação; AC-022.3 e contrato complementar.** `packages/web/lib/distribution-channel-adapters.ts:279` retorna sempre `retryAfterSeconds:30` no429. O helper corrigido respeita o valor que recebe, mas o adapter não lê o header real.

Probe independente, HTTP mockado429 com `Retry-After: 600`: adapter devolve30; tentativa1 e random0.5 agendam **66 segundos**, antes do piso de600. Prova executa o adapter real e `computeNextAttempt` real. Não representa envio real ou falha do crescimento exponencial já corrigido.

**Correção mínima:** ler Retry-After do provedor e transmiti-lo ao helper, contemplando segundos/data HTTP conforme o header adotado; fallback seguro quando ausente/inválido. Acrescentar cenário de integração429 em que o piso exceda backoff+jitter e conferir `next_attempt_at` persistido. Preservar maxAttempts, cancelamento e unknown sem retry.

Reprodução: `node --experimental-strip-types /tmp/bizuminer-correcao-os19/audit-provider.mjs`; evidência `/tmp/bizuminer-correcao-os19/audit-provider.log`, exit0 confirma a contraprova e a matriz negativa de BUG-006.

## R-01 e R-02

- **R-01 reconciliada no contrato corretivo:**401 sem sessão,403 conta não autorizada,404 artefato alheio/inexistente. Helper/rotas inspecionados; helper e serviço sob RLS reexecutados, com zero object-store para recurso alheio. HTTP com sessão Supabase gerenciada não foi executado; não se transforma essa limitação em vulnerabilidade nova.
- **R-02 reconciliada explicitamente:** provisionamento por platform_admin é separado de convite de membership por owner; aceitar token associa identidade à conta existente. Quota é `maxActiveCampaigns`. Reexecuções onboarding/entitlement/experimentos passaram. O parecer aplica a reconciliação versionada e não certifica o enunciado literal divergente das OS históricas.

## Verificações independentes

| Comando / cenário | Resultado nesta auditoria |
|---|---|
| `node --test --experimental-strip-types` nos oito arquivos de parser/credenciais/canais/retry/ratificação/storage/HTTP | 8 arquivos, zero falhas, exit0; `audit-target-unit.log` |
| `node --import tsx account-credentials-flow.test.ts` | exit0; A/B, worker/tenant/triagem, helpers e revogação entre links |
| `node --import tsx official-channel-flow.test.ts` | exit0; dois canais, HMAC/fatos congelados, next_attempt_at66/132s |
| `node --import tsx rubric-ratification-flow.test.ts` | exit0; ambos entrypoints e recusas |
| `node --import tsx artifact-isolation-flow.test.ts` | exit0; serviço privado, RLS/zero object-store alheio e formatos |
| `npm run test:financial` | 8 cenários, exit0; `audit-financial.log` |
| `npm run test:dispatch` | 8 cenários, exit0; `audit-dispatch.log` |
| `npm run test:onboarding` | 8 baterias, exit0; `audit-onboarding.log` |
| `npm run test:entitlement` | 13 cenários, exit0; `audit-entitlement.log` |
| `npm run test:experiment` | protocolo pareado, exit0; `audit-experiment.log` |
| Probes A/B acima | exit0, reproduzem impedimentos; mocks sem remoto |
| Hashes/fronteiras/histórico | zero drift/protected changes/outside order; `audit-preservation.json` |

Integrações e comandos npm acima executados em `tools/editorial-tests`; unitários na raiz. Os arquivos `audit-*.log` e probes ficam em `/tmp/bizuminer-correcao-os19/`. A bateria completa web424/persistence36/capture127/extension16/editorial29/CF/typechecks/build foi executada pelo executor, com logs `final-*` inspecionados; não foi repetida integralmente pelo auditor. A verificação independente priorizou os mesmos BUGs e os dois caminhos omitidos pelas suítes existentes. `verified-workflows` não foi reexecutada para evitar regenerar o PNG histórico.

## Fechamento

A segurança de resolução por conta, suspensão local, segredo dos canais, gate de ratificação e contenção/formato de artefatos receberam contraprovas locais satisfatórias. A captura multicliente permanece bloqueada na rota de entrada e o webhook não respeita o piso real de429. **Não homologar integralmente a entrega local das correções nem declarar todos os BUGs fechados nesta versão.** Devolver somente BUG-004/008 ao executor/arquiteto, com os testes de fechamento acima; manter os outros dez IDs verificados e não reabrir por preferências novas. Nenhuma autorização de remoto/deploy/ativação é derivada deste parecer.

## Adendo final — contraprova da tentativa #2, BUG-004/008

18/10/2026; revisão contratual6 aprovada antes da implementação. **Veredicto vigente: CONFORME para a entrega técnica local das correções OS-020…025 nos doze achados delimitados.** BUG-004/008 passam de persistentes para `verificado localmente`; os dez IDs já verificados acima mantêm o fechamento. R-01/R-02 mantêm a reconciliação contratual explícita. O parecer inicial não foi apagado nem aplicado à nova fonte por inferência.

### Versão e fronteira verificadas

Manifesto `/tmp/bizuminer-correcao-os19/delivery-source-retry2.json`, SHA-256 **`f4e512c932a6c3de4f789afdd57aa5c6cc444bb3cd083811050a4546221da391`**, 983 arquivos. O auditor recalculou os983 hashes: zero divergências. Comparação com fonte1 identifica14 deltas: seis caminhos de fonte/teste autorizados e oito documentos de contrato/resultados/auditoria; nenhum arquivo anterior removido. Demais fontes examinadas no primeiro parecer permanecem com os mesmos bytes. Evidência `/tmp/bizuminer-correcao-os19/audit-preservation-retry2.json`.

Este adendo e a chamada de atenção no topo são as únicas alterações no repositório feitas pelo auditor nesta contraprova; probes e logs adicionais ficam em `/tmp`. Nenhum código, contrato, migration ou teste foi modificado pelo auditor. O hash do manifesto identifica a fonte anterior à escrita deste adendo.

### Contraprovas dos dois achados

| ID | Resultado independente da tentativa #2 |
|---|---|
| BUG-004; AC-021.5 | **Verificado localmente.** Inspeção confirma remoção do early return externo e do gate dependente de credencial house. `prepareAccountCapture` autoriza AccountContext com `withAccountDb` antes do resolver worker, aplica flags e retorna códigos seguros. Reexecução do POST real transpilado em VM, mantendo preflight/DAL/RLS reais: A/B com próprios segredos e sem env house recebem202; tenant fornecido no body não muda a conta persistida; ausência/revogação, suspensão, identidade estrangeira, flag desligada e ML externa terminam409/403 sem criar lote ou transportar. `account-credentials-flow` repetido confirma composição posterior dispatch→worker→adapter e publicação/revogação. A falha original de entrada está superada sem retirar o isolamento. |
| BUG-008; AC-022.5 | **Verificado localmente.** O adapter agora lê Retry-After segundos/data HTTP e fornece o piso ao mesmo helper. Probe adicional do auditor, com relógio fixo, confirma header600→adapter600→delay600, e data futura equivalente→600; ausência/inválido usam30 e o backoff+jitter mantém66. `official-channel-flow` reexecutado confirma `next_attempt_at` real de600/600 no Webhook e66/132 no Telegram. Regressão de dispatch mantém maxAttempts, cancelamento e tratamento unknown. |

O teste de rota substitui autenticação e efeitos externos por fronteiras sintéticas; os wrappers fornecem a factory da fixture aos serviços reais, e a DAL executa SQL/RLS real. Não há stub que simplesmente aprove o preflight. Essa evidência satisfaz o aceite local, sem alegar uma sessão autenticada no serviço Supabase gerenciado.

### Comandos independentes desta contraprova

Todos com exit0:

- `node --import tsx capture-route-flow.test.ts`: `audit-route-retry2.log`.
- `node --import tsx account-credentials-flow.test.ts`: `audit-credentials-retry2.log`.
- `node --import tsx official-channel-flow.test.ts`: `audit-channels-retry2.log`.
- `npm run test:dispatch`: `audit-dispatch-retry2.log`.
- `node --test --experimental-strip-types packages/web/test/distribution-channel-adapters.test.mjs packages/web/test/dispatch-contract.test.mjs`: `audit-unit-retry2.log` (dois arquivos).
- `node --experimental-strip-types /tmp/bizuminer-correcao-os19/audit-provider-retry2.mjs`: `audit-provider-retry2.log`; probe novo preserva os probes contrários originais sem sobrescrevê-los.
- Recálculo983 hashes/comparação14 deltas: `audit-preservation-retry2.json`.

Comandos de integração executados a partir de `tools/editorial-tests`; demais na raiz. Web425/425, typecheck web e build web desta tentativa foram executados pelo executor, com logs `final-*-retry2.log` inspecionados; não são apresentados como execução independente do auditor.

### Fechamento vigente e limites

**BUG-001,002,003,004,005,006,007,008,009,010,011 e012: verificados localmente.** Não resta impedimento de implementação nesses doze IDs para esta versão. O encerramento é seletivo: não representa auditoria geral irrestrita ou conclusão comercial de todos os requisitos do Blueprint.

As sete capacidades têm as correções locais delimitadas verificadas, com as fronteiras operacionais mantidas: ML multicliente sem adapter contratado permanece indisponível; Telegram/Webhook exigem configuração/aprovação reais; E3/rubrica exigem calibração e ratificação autorizadas; testes sintéticos não substituem políticas/amostras reais. Auth, Storage gerenciado, pooler, APIs reais, jobs GitHub, entrega externa, onboarding de clientes e efeitos no ativo **não foram homologados nesta rodada**. Nenhum deploy, migration, convite ou envio real foi feito ou autorizado pelo parecer. O Blueprint continua sem novo selo de homologação integral no ativo.
