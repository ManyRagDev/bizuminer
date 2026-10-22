# RESULTADO-OS-032 — recusa permanente dos executáveis de coleta ML

- Data: 19/10/2026. Intenção: execução, com `executor-blindado` e revisão prévia `auditor-red-team`, modo `contrato`.
- **Estado atual: CONCLUIDO localmente após a emenda BF-032-01.** A primeira execução ficou bloqueada por um terceiro executável HTTP fora da escrita autorizada. O histórico abaixo preserva esse bloqueio; a emenda da OS-032 autorizou o caminho, que agora recusa execução, e os testes de subprocessos passaram em ambiente local fora do sandbox.
- Baseline: `main`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, mais árvore local preexistente; nenhum commit criado.
- OS congelada: SHA-256 `76fa6a217fcc9c41525b1199de173fed8dd18d1a87e04a58cb4d4ccffc9653ae`.

## BLOQUEIO_DE_FRONTEIRA — BF-032-01

**Estado atual: FECHADO pela emenda da OS-032.** As evidências a seguir registram a descoberta original, antes da revisão do contrato.

**Caminho:** `packages/capture/bin/diagnose-ml-verification.mjs` (preexistente e não rastreado no Git; não foi executado nem alterado).

**Evidência estática:** linha 13 fixa o alvo `/ofertas` de ML; linhas 36–45 fazem `fetch(url)` e leem HTML; linhas 47–53 executam `curl` para o mesmo alvo; linhas 65–80 definem os casos; linhas 82–85 executam os casos no topo do módulo. Não há gate de captura manual nesse caminho. SHA-256: `7bcc430c929f0a807a67df44eafd567de16c33fd98238a06499f214b40918371`.

**Impacto:** a recusa de `sweep.ts` e `probe-ml-deals.ts` não basta para afirmar que todos os executáveis locais estão fechados. O diagnóstico continua sendo uma entrada HTTP automatizada ao ML, ainda que não persista ofertas. A OS exige revisão ao descobrir um caminho vivo adicional.

**Ação na primeira execução:** descoberta registrada antes de qualquer outra escrita após sua confirmação. Nenhum patch adicional de código foi feito naquele momento. A OS foi posteriormente emendada para autorizar explicitamente esse caminho e sua prova de recusa, sem reativar os gates existentes.

## Baseline e preservação

Antes da escrita foram lidos `git status --short`, branch/HEAD e diff dos seis caminhos existentes autorizados. `sweep.ts` já tinha alterações locais, incluindo `CaptureError` e o contrato `CAPTURE_FAILURE`; o probe já existia como arquivo não rastreado. Gates e seus testes não tinham delta rastreado. O diretório de contratos também já era não rastreado.

Snapshot local em `/tmp/os-032-baseline/`: cópias dos seis arquivos, `status.txt`, `diff.patch`, `hashes.json` e manifesto de hashes dos arquivos preexistentes. A comparação final de bytes encontrou mudanças somente nos seis caminhos autorizados abaixo. A lógica local preexistente dos CLIs foi preservada depois da barreira permanentemente fechada; importações operacionais passaram a ser dinâmicas. Não se usou reset, checkout, commit ou restauração geral.

## Arquivos escritos e comportamento

Todos pertencem à lista fechada da OS:

| Arquivo | Mudança / aceite |
|---|---|
| `packages/capture/src/automated-capture.ts` | Gate retorna sempre `false`, independentemente do ambiente; mantém assinatura e tipo legado. AC-032.3. |
| `packages/web/lib/automated-capture.ts` | Espelha a recusa; consentimento também retorna sempre `false`. AC-032.3. |
| `packages/persistence/bin/sweep.ts` | Retorna código 1, `CAPTURE_FAILURE` com `kind: manual_capture_only` e orientação humana antes de ler argumentos ou importar adapter/store/ingest/transporte. Preserva o código operacional preexistente atrás do gate. AC-032.1. |
| `packages/capture/bin/probe-ml-deals.ts` | Retorna código 1 e JSON com `ok: false`, `kind: manual_capture_only`, orientação humana e `requests: []`, antes das importações operacionais. AC-032.2. |
| `packages/capture/test/automated-capture.test.ts` | Matriz de 144 combinações de ambiente/flags, sempre recusadas, mais ambiente padrão. AC-032.3. |
| `packages/web/test/automated-capture.test.mjs` | Mesma matriz, acrescida de consentimento verdadeiro/falso e argumentos padrão. AC-032.3. |
| `packages/persistence/test/ml-manual-only-entrypoints.test.ts` | Novo teste executa cada CLI em seis cenários, sem herdar conexão, credenciais ou `NODE_OPTIONS`; instrumenta resolução de módulos e `fetch`, verifica código/JSON/saída e marcador de efeitos. AC-032.1/2. |
| `docs/implementation/contratos-fluxo-unico/RESULTADO-OS-032.md` | Este resultado, incluindo bloqueio e limites. |

Parser, fixtures, rotas, interface manual, adaptadores API, workflows, migrations e configurações de credenciais não foram alterados.

## Revisão de contrato e integração

Antes da implementação, a revisão da OS e das referências pesquisadas não apontou impedimento nos dois CLIs/gates autorizados. A pesquisa encontrou `platform-gates.ts` como consumidor web; não exige gate ML verdadeiro. `admin/page.tsx`, `platform-status.tsx` e `admin-panel.tsx` já apresentam o fluxo manual de ML independentemente desse gate. Os scripts de Shopee/AliExpress são próprios; nenhuma chamada operacional aos CLIs ML foi encontrada nos workflows examinados. As referências de README aos comandos antigos permanecem históricas, fora da escrita autorizada.

A checagem final da primeira execução identificou BF-032-01. **Na versão inicial, o contrato era insuficiente para o objetivo global**; não era defeito confirmado do delta implementado. A emenda posterior acrescentou o caminho descoberto. Este resultado documenta a execução; não substitui auditoria independente de entrega.

## Verificações locais

Ambiente: Node `v22.23.2`, Linux/sandbox; sem uso de `.env` para os CLIs. Logs temporários em `/tmp/os-032-*.log`.

| Comando / cenário | Exit code e resultado |
|---|---|
| `npm test --prefix packages/capture` | 0; 8/8 arquivos passaram, incluindo parser/fixtures offline e matriz do gate. |
| `npm test --prefix packages/persistence` | 1; 8/9 arquivos passaram. Somente o novo teste dos CLIs falhou. |
| `node --experimental-strip-types packages/persistence/test/ml-manual-only-entrypoints.test.ts` | 1; diagnóstico explícito: `spawnSync …/node EPERM` em ambos os CLIs. A suíte não é verde; não houve skip nem alteração para ocultar o erro. |
| `npm test --prefix packages/web` | 1; 69/71 arquivos passaram. Falhas em `capture-process.test.mjs` e `qr-service.test.mjs`, já ressalvadas pela auditoria OS-027. |
| `node --experimental-strip-types packages/web/test/capture-process.test.mjs` | 1; 4/5 testes passaram; stdout esperado `resultado`, recebido vazio. Causa continua hipótese ambiental, como HIPOTESE-027-A; não atribuída ao delta OS-032. |
| `node --experimental-strip-types packages/web/test/qr-service.test.mjs` | 1; falhas em `networkInterfaces`: `uv_interface_addresses … Unknown system error 1`, conforme OBS-027-B. |
| `npm run test:capture-batch --prefix tools/editorial-tests` | 0; 18 cenários PGlite passaram, incluindo recusa ML legado, lote misto, importação humana e avanço para triagem. |
| `node --import tsx capture-route-flow.test.ts` em `tools/editorial-tests` | 0; recusa ML isolado/misto/rota legada antes de criar/despachar; Shopee/AliExpress aceitos com isolamento de conta e transporte injetado. |
| `npm run typecheck --prefix packages/capture` | 0. |
| `npm run typecheck --prefix packages/persistence` | 0. |
| `npm run typecheck --prefix packages/web` | 0. |
| `git diff --check -- <cinco caminhos rastreados alterados>` | 0. A checagem global apontou espaços/linhas preexistentes fora da OS, preservados. |

**Prova adicional dos CLIs sem subprocesso Node interno:** foram executadas quatro invocações diretamente pelo shell, dois CLIs × `development`/`production`, ambas as flags `true`, com argumentos de consentimento e triagem. Comando base: `env -i NODE_ENV=<ambiente> ML_AUTOMATED_CAPTURE_ENABLED=true ML_AUTOMATED_CAPTURE_PRODUCTION=true <node-absoluto> --import /tmp/os-032-direct-guard.mjs --experimental-strip-types <CLI> --trigger-triage --consent true --operation-batch synthetic-private-argument`.

O preload local usa `registerHooks` permitindo resolver apenas as duas entradas e o gate puro; qualquer importação operacional ou `fetch` escreve um marcador e lança erro. As quatro invocações retornaram código **1** e a recusa tipada correta; `/tmp/os-032-direct-effects.txt` permaneceu vazio. As saídas mostraram somente o código/orientação, sem o argumento sintético privado, credenciais, URL de banco ou resposta do ML. Logo os módulos capazes de criar adapter/store/`capture_run` sequer foram resolvidos nesses ensaios. Isso evidencia AC-032.1/2 nas combinações perigosas, mas não transforma o teste automatizado que falhou em passe.

## Aceites e pendências da primeira execução, antes da emenda

- **AC-032.1/2:** recusa antecipada demonstrada por execução direta instrumentada; parser offline passou. Teste automatizado completo dos subprocessos: `NAO_VERIFICADO` por EPERM.
- **AC-032.3:** demonstrado pela matriz dos gates nos dois pacotes; nenhuma flag/consentimento concede permissão.
- **AC-032.4:** regressões de lote e rota passaram em PGlite/transporte injetado. Inspeção confirmou cron restrito a Shopee/AliExpress e preservação do caminho manual com autorização/conta, produto e observação. Teste nativo, visual e homologação integral não executados; ressalvas ambientais continuam destinadas à OS-033.
- **BF-032-01:** requeria revisão de escopo antes de alterar o diagnóstico HTTP adicional; naquela versão impedia declarar o objetivo global concluído.
- **Operações remotas:** nenhuma. Nenhuma requisição real ao Mercado Livre, conexão a banco remoto, dispatch, migration ou deploy.

O snapshot permite revisão/rollback seletivo do delta, preservando as recusas verificáveis. Não restaurar o contrato antigo que autorizava captura por flags.

## Identificação do delta entregue

Diff isolado dos sete arquivos de código/testes: `/tmp/os-032-delta.patch` (comparado ao snapshot local, não apenas ao HEAD). SHA-256: `fd70f49ce9027852ed566a95580247e34f0a27f5a78569b7b26cdc2fdd96dddf`. Artefatos de `/tmp` são locais e temporários.

| Arquivo | SHA-256 final |
|---|---|
| `packages/persistence/bin/sweep.ts` | `8c7893b211ffcf0f4503d8f7a133fddd53c75112024045c9062f0be15b5ca418` |
| `packages/capture/bin/probe-ml-deals.ts` | `03c0013cbb01617cbb417b58cdb922f611f91f9f6032a4316ea1e0a391d7be05` |
| `packages/capture/src/automated-capture.ts` | `04c3ab4636d4dac338ff0ff3961043d602e8e5af9d7f5b22ce4b704d15b4b2e1` |
| `packages/web/lib/automated-capture.ts` | `98b68e906239e3c2feae45da4c1846b75c016ccf4f976d2850aed49b5386fa96` |
| `packages/capture/test/automated-capture.test.ts` | `358496d02331ed1da0bacff48aa63dc7f4be180061e65a188ec90849e0213ddd` |
| `packages/web/test/automated-capture.test.mjs` | `d1b1f8ac9042e088726a616374fa152201d6459d1168cd4e0d43e0efd4de2cf8` |
| `packages/persistence/test/ml-manual-only-entrypoints.test.ts` | `8720b215fcf6eae8bfd20876f729cd7a037a1a7936c02698911b9016fc25f3b2` |

## Retomada após emenda BF-032-01

A [OS-032](OS-032.md) foi emendada para incluir somente `packages/capture/bin/diagnose-ml-verification.mjs` e ampliar o teste já autorizado dos entrypoints. O diagnóstico legado era um terceiro caminho de rede: fazia `fetch` e `curl` para `/ofertas` no topo do módulo. Agora retorna `manual_capture_only` e código 1 antes de importar transporte ou avaliar os casos. A opção `--output` não cria arquivo. O código histórico foi preservado atrás da recusa. Não foram alterados adapter, parser, rotas manuais, migrations, credenciais ou workflows.

| Caminho | SHA-256 após a retomada |
|---|---|
| `docs/implementation/contratos-fluxo-unico/OS-032.md` | `7117760d054a604a1e51a582825a70ffde2c1330a5d92be1acd39aa64c451999` |
| `packages/capture/bin/diagnose-ml-verification.mjs` | `acbf4d9a2b3290e262a55bee1d5bf33503fbeb6f4d2df5bdd6fb59a1c20cb697` |
| `packages/persistence/test/ml-manual-only-entrypoints.test.ts` | `13d1472221815969475b4859041da736d507b7d8225eaa9af0d8a4e3d02057b0` |

**Verificação nova, mesmo snapshot:** o teste dos três CLIs falhou no sandbox com `spawnSync EPERM` antes de criar filhos. Repetido fora dessa restrição, com ambiente filho sanitizado e `fetch`/importações operacionais bloqueados, passou **3/3**. O teste novo confirmou código 1, resposta `manual_capture_only`, marcador de efeitos vazio e ausência do arquivo solicitado por `--output`. A invocação direta do diagnóstico no sandbox também recusou e não criou arquivo. `npm test --prefix packages/persistence` passou **39/39** fora do sandbox; `npm test --prefix packages/capture` passou **8/8**; `npm test --prefix packages/web` passou **424/424** fora do sandbox; `npm run typecheck --prefix packages/persistence` passou. As integrações PGlite de lote (18 cenários) e rota já aprovadas na primeira execução não foram repetidas porque o delta da retomada só afeta o diagnóstico CLI e seu teste.

**AC-032.5:** verificado. **AC-032.1–4:** evidência da primeira execução preservada, agora com suíte de persistência e web integralmente verdes em ambiente local capaz de executar subprocessos e consultar interfaces de rede. BF-032-01 não impede mais a conclusão da OS-032. O teste de PostgreSQL nativo e a homologação transversal permanecem na [OS-033](OS-033.md) e [OS-031](OS-031.md), respectivamente; não houve banco remoto, requisição real ao ML, GitHub dispatch, migration ou deploy.
