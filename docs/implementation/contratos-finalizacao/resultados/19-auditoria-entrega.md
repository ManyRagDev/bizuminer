# OS-13 a OS-19 — Auditoria de entrega técnica e segurança

**Veredicto formal: NAO_CONFORME.** A bateria solicitada passa no host, mas existem defeitos reproduzidos de integridade financeira, isolamento de credenciais, autenticação de transporte, integração dos canais, governança editorial e artefatos. As sete capacidades não estão integralmente superadas; o Blueprint BizuMiner V2 **não recebe homologação técnica integral neste estado**.

Modo `entrega`; intenção `auditoria`; 17/10/2026, America/Sao_Paulo. Skill aplicada: `auditor-red-team`, com revisão de Supabase/Postgres. Avaliação contra as OS e C-01 a C-09/CF-01 a CF-03, sem redesenhar contratos. Não houve correção de código, contrato, migration ou teste do repositório. A única escrita no repositório é este relatório.

## Versão e evidência congeladas

- HEAD/branch conferidos: `main`, `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`.
- As entregas estão no **workspace com alterações locais**, incluindo arquivos não rastreados. Não existem commits individuais OS-13…19 que permitam comprovar a sequência de integração pelo Git. A atribuição às ordens vem dos resultados do executor; o parecer vale para os bytes efetivamente inspecionados.
- Snapshot inicial: 958 arquivos de fontes/documentação/configuração, sem conteúdo de `.env`, dependências ou saídas de build. Manifesto `/tmp/bizuminer-audit-os19-aqgsdgt0/baseline.json`, SHA-256 `095cd0921ede9adb1be2a25d6c54932e72a6de544b28a4a8e044c57632636875`. Git status e diff inicial preservados no mesmo diretório. Comparação após testes e reproduções: **zero arquivos do manifesto alterados ou ausentes**.
- Node `v22.23.2`; npm `10.9.8`; Next `15.5.23`. Integrações SQL executadas em PGlite descartável, com grants/RLS da fixture do projeto. Sem homologação de Supabase Auth/Storage remoto, pooler, navegador autenticado ou concorrência entre sessões PostgreSQL nativas. Esses limites não são substituídos pelo build.
- Logs e probes independentes: `/tmp/bizuminer-audit-os19-aqgsdgt0/`. Os resultados essenciais estão transcritos abaixo, pois arquivos temporários não são arquivo permanente do projeto. Todas as credenciais/contas dos probes são sintéticas; HTTP dos adapters foi substituído por função local, sem envio externo.

Hashes SHA-256 das ordens usadas como critérios congelados:

| OS | SHA-256 |
|---|---|
| 13-parser-comissao | `23edb9fde98ff3ce81683e14bc932d3c8e9e9e2453ae6c81c55540abe0f8e7fa` |
| 14-resolver-credenciais | `3ed63f0c79c3180ef2c111e8082d6fecdf25fb78e1a5184f068be97fd8a835e3` |
| 15-dispatch-canal-oficial | `d526014c16eb228f1e3a747d9f966201339dd887065543e62bd0bed9c2e89fe4` |
| 16-rubrica-e-calibracao | `8f37a8ad4358075c0f8b17cc13996ccfb1bbaa0868513e6e04c34f9a009d19ba` |
| 17-storage-e-artefatos | `e33671af776c8284523b3e85762874efb4116cd2c48dcca3a88d3a52df906419` |
| 18-onboarding-e-experimentos | `73b184dd2507c15120d0c78815fa140f2f9da464e6ead9a257e9ae9284cd8651` |
| 19-homologacao-e-conclusao | `f335afdfcbaa85e701fce6ecbabdae64c3423fe03dc51d9727796aa391a937ec` |

Li os sete resultados do executor, STATUS-EXECUCAO, 08-RASTREABILIDADE, CAPACIDADES-PENDENTES, contratos compartilhados e critérios pertinentes dos épicos. Resultados anteriores são **relatos do executor**; as execuções desta seção são **do auditor**.

## Verificação independente

| Comando solicitado | Resultado independente |
|---|---|
| `npm test --prefix packages/web` | Host: **413/413**, zero falhas, exit 0 |
| `npm test --prefix packages/persistence` | Host: **36/36**, zero falhas, exit 0 |
| `npm test --prefix packages/capture` | Host: **127/127**, zero falhas, exit 0 |
| `npm test --prefix packages/extension` | Host: **16/16**, zero falhas, exit 0 |
| `npm test --prefix tools/editorial-tests` | **29 cenários**, exit 0 |
| `npm run test:cf-regressions --prefix tools/editorial-tests` | Suíte CF-01…CF-18 concluída, exit 0 |
| `npm run typecheck --prefix packages/web && npm run typecheck --prefix packages/persistence` | Ambos exit 0 |
| `npm run build --prefix packages/web` | Exit 0; compilação, tipos e geração de 22 páginas estáticas concluídas |

Na primeira execução restrita, a suíte web retornou 67 arquivos aprovados e dois reprovados. Execuções diretas identificaram `uv_interface_addresses` bloqueado e stdout vazio de subprocesso. Repeti a suíte autorizada no host: 413 casos passaram. **Não classifico essas limitações da sandbox como BUG de produto.** Os demais pacotes também foram executados no host para obter contagens de casos, pois o runner restrito resumiu por arquivo.

Também executei os nove comandos `npm run test:<nome> --prefix tools/editorial-tests` indicados nas OS: `financial` (8), `capture-batch` (20), `dispatch` (8), `rubric` (6), `price-evidence` (5, incluindo benchmark EXP-02 10/10), `cockpit` (7), `onboarding` (8 baterias), `entitlement` (13) e `experiment` (protocolo pareado completo). **Todos exit 0.** As contagens descrevem os respectivos runners; não se apresentam como casos independentes adicionais sem sobreposição.

Os probes adicionais executaram código atual e SQL/RLS reais em fixture quando indicado. Seu resultado esperado era revelar contraprovas; sucesso das suítes existentes não cobre os cenários omitidos abaixo.

## Conformidade por aceite

`PARCIAL` não certifica cumprimento integral; `DIVERGENTE` identifica conflito entre documentos formais. `CONFORME` refere-se à verificação local descrita, sem certificação remota implícita.

| Aceite | Avaliação | Evidência e limite |
|---|---|---|
| AC-13.1 | PARCIAL | Quatro formatos cobertos nos unitários; CSV brasileiro válido é corrompido e arquivo só com header causa recursão: BUG-001/003. Seleção forçada existe na lib; não foi demonstrada na UI. |
| AC-13.2 | NAO_CONFORME | `150,50;15,05` vira 15000/5000 centavos e status pending, em lugar de 15050/1505 e confirmed: BUG-001. |
| AC-13.3 | NAO_CONFORME | Data ausente vira horário atual, sem error/review, e o digest muda entre parses: BUG-002; lote vazio de marketplace causa BUG-003. |
| AC-13.4 | CONFORME, no fluxo coberto | Fluxo financeiro e regressões de ledger/deduplicação passaram; não certifica correção dos dados produzidos pelo adapter nos BUG-001/002. |
| AC-14.1 | PARCIAL | AES-GCM/AAD funcionam quando recebe tx corretamente contextualizado; chamador de dispatch usa conexão sem esse contexto: BUG-004. |
| AC-14.2 | PARCIAL | Resolver não usa house para tenant externo; ausência é rejeitada. Dispatch troca o código por `capture_account_credentials_required`, e não chega a consumir credenciais próprias nos workers: BUG-004. |
| AC-14.3 | NAO_CONFORME | Conta `local` suspensa recebe credenciais pelo resolver: BUG-005. Teste existente só cobre suspensão não local com SQL mockado. |
| AC-14.4 | NAO_CONFORME | AAD impede transplante, mas não há execução de captura/monitoramento A/B consumindo as credenciais resolvidas: BUG-004. |
| AC-15.1 | NAO_CONFORME | Escape de texto e timeout do worker existem; canais não se integram ao fluxo entregue: BUG-007. Resolver nulo permite credencial global: BUG-006. |
| AC-15.2 | PARCIAL | HMAC do corpo funciona com segredo fornecido; ausência usa chave pública padrão e o canal não é aceito pelo fluxo de kit: BUG-006/007. Payload contém texto/link, sem objetos explícitos de oferta/campanha. |
| AC-15.3 | NAO_CONFORME | 429 é retryable; reagendamento usa atraso fixo, sem crescimento exponencial/jitter: BUG-008. |
| AC-15.4 | CONFORME | CF-12 e suíte dispatch verificaram cancelamento antes do marker sem chamada do adapter; marker/I/O fora da transação preservados. |
| AC-16.1 | CONFORME, local | Persistência humana solo/autoria e digest do servidor verificados na implementação, unitários e integração rubric. Dimensões interpretadas conforme C-03, com oportunidade temporal vinda de C-02. |
| AC-16.2 | CONFORME, local | Comparações/desacordos persistidos e decisão humana preservada na suíte rubric. |
| AC-16.3 | NAO_CONFORME | Novo caminho ratifica amostra de uma oferta, contornando gate existente de 30–50 casos; digest cobre amostra, não os critérios completos: BUG-009. |
| AC-16.4 | CONFORME, no caminho persistido | Flag false degrada E3→E2; aprovação e view efetiva exigem calibração vinculada. Benchmark 10/10 não equivale a calibração operacional real. Limite da API pura em R-03. |
| AC-17.1 | PARCIAL | Rota usa sharp/magic, limite 10 MiB, SHA-256 e metadados com tenant. Driver local novo aceita escape de raiz: BUG-010. Helpers novos não são os usados pela rota. |
| AC-17.2 | DIVERGENTE / PARCIAL | DB filtra tenant e rota oculta metadados. B recebe 404, conforme C-09, mas AC exige 403; anônimo retorna 403, onde AC/C-09 pedem 401. R-01; HTTP autenticado não executado nesta auditoria. |
| AC-17.3 | CONFORME, local | `validateKitArtifacts` exige disclosure/licença; testes passaram. Pipeline existente revalida direitos por asset/canal/fonte/validade em `validateStored`; usa nomenclatura própria compatível com C-04. |
| AC-17.4 | NAO_CONFORME | Story, Feed e Banner resultam no mesmo PNG 1080×1920: BUG-011. Story inspecionado visualmente; leitura do QR por câmera não testada. |
| AC-18.1 | DIVERGENTE | Convite vincula membro a conta já criada; provisionamento/plano são operação separada. Não cria conta/plano ao aceitar token emitido por platform_admin como o AC descreve: R-02. Hash/replay/identidade passam na integração. |
| AC-18.2 | PARCIAL / DIVERGENTE | Limite de campanhas ativas e rollback passam; o AC fala em 10 mensais, mas a API/plano controla `maxActiveCampaigns`: R-02. PGlite não prova concorrência nativa entre conexões. |
| AC-18.3 | PARCIAL | Revalidação de contexto/RLS e suspensão passam nas suítes comerciais; exceção local do resolver viola o bloqueio universal: BUG-005. Não foi comprovada revogação do token Supabase em runtime. |
| AC-18.4 | CONFORME, local | Método anterior e congelado, pares/fatos/digest, revisão, aprovação candidata, promoção transacional/evento e rollback verificados na suíte experiment. |
| AC-19.1 | CONFORME | Todos os comandos solicitados concluíram sem falhas no ambiente adequado; não implica cobertura dos probes negativos. |
| AC-19.2 | CONFORME | Typechecks e build executados com exit 0. |
| AC-19.3 | NAO_CONFORME | Código existente não fecha integrações/segurança das sete capacidades; ver matriz final e BUG-001…011. |
| AC-19.4 | NAO_CONFORME | Documentos afirmam conclusão/homologação total apesar das contraprovas e alteram a associação de requisitos: BUG-012. |

## Achados confirmados

IDs `BUG-001`…`BUG-012` são locais a esta auditoria de OS-13…19. Todos estão `confirmado`, com zero tentativas de correção nesta auditoria; responsável por implementação é o executor. Prioridades: P1 bloqueia homologação da capacidade afetada; P2 exige fechamento do aceite indicado, sem alegar incidente em produção. Como os arquivos são alterações locais, a autoria temporal de cada linha não é inferida apenas do Git.

### BUG-001 — CSV com decimal brasileiro altera valores e status

**Tipo:** `implementacao`; **P1**; AC-13.1/13.2; probe P01. Local: `packages/web/lib/commission-import-adapters.ts:48`.

Entrada reproduzida:

```csv
Order id;Order time;Order amount;Estimated commission;Currency;Status
ORDER123;2026-10-15;150,50;15,05;BRL;Completed
```

O parser separa simultaneamente por vírgula e ponto-e-vírgula. Resultado real: `orderValueCents=15000`, `commissionCents=5000`, `status=pending`, `errors=[]`. Esperado: 15050, 1505 e confirmed. Pode levar valores incorretos ao preview/ledger, sem alerta. **Fechamento:** detectar um delimitador por arquivo e comprovar centavos/moeda/status com CSV brasileiro e CSV com decimal ponto, incluindo commit financeiro.

### BUG-002 — Data ausente é inventada e torna digest instável

**Tipo:** `implementacao`; **P1**; AC-13.3, C-07; probe P02. Local: `commission-import-adapters.ts:325`.

CSV com header `Order id,Order time,Order amount,Estimated commission,Currency,Status` e linha `ORDER123,,150.50,15.05,BRL,Completed`: dois parses separados por 30 ms retornaram **zero errors/reviews** e digests diferentes. A data é substituída por `new Date()`. **Fechamento:** dados ausentes/inválidos devem receber linha/motivo, sem fabricar data, preservando digest determinístico das linhas válidas. Não foi demonstrada duplicação de ledger em produção.

### BUG-003 — Relatório apenas com header causa estouro da pilha

**Tipo:** `implementacao`; **P2**; AC-13.1/13.3; probe P03. Local: `commission-import-adapters.ts:223` e `commission-import-contract.ts:259`.

`parseMarketplaceCommissionReport('Order id,Estimated commission')` lança `RangeError: Maximum call stack size exceeded`: fallback para parser canônico redetecta Shopee e retorna ao mesmo adapter. **Fechamento:** relatório sem dados retorna preview vazio/erro descritivo sem recursão; repetir pelos dois entrypoints.

### BUG-004 — Resolver de credenciais não fecha o caminho de captura/monitoramento

**Tipo:** `implementacao`; **P1**; AC-14.1/14.2/14.4, CF-03. Locais: `capture-dispatch.ts:15`, `account-credential-resolver.ts:58`, `packages/web/bin/run-capture-batch.ts`, `packages/persistence/bin/monitor-prices.ts:34`.

Probe P09: segredo cifrado de A gravado sob RLS; resolver com tx autorizado decifrou corretamente. O mesmo resolver com `factory()` sem contexto retornou `account_credentials_missing`, embora o segredo exista. `dispatchCaptureBatch` chama a asserção sem tx e sem marketplace; a asserção nem resolve credenciais, apenas conta segredos nesse caminho. Workers não consomem `resolveAccountMarketplaceCredentials`; herdam env. `sweep-shopee.ts`/`sweep-aliexpress.ts` continuam com tenant `local` e credenciais globais; monitoramento rejeita explicitamente execução não local. Nenhuma captura externa foi disparada pelo auditor.

**Fechamento:** executar o caminho real dispatch→worker→adapter com A/B em fixture, comprovar credenciais/tenant corretos, marketplace solicitado, ausência sem fallback e monitoramento não local autorizado. Manter house funcionando. Não há evidência de que o fluxo completo atual tenha capturado dados de A com êxito.

### BUG-005 — Resolver ignora suspensão da conta local

**Tipo:** `implementacao`; **P1**; AC-14.3/18.3; probe P10. Locais: `account-credential-resolver.ts:50`, `:82`, `:187`.

Após `affiliate_account.status='suspended'` para `local` na fixture, `resolveAccountMarketplaceCredentials('local','shopee',factory())` retornou credenciais. `assertAccountActive` retorna antes da consulta, e o precheck de captura também permite local incondicionalmente. Barreiras comerciais posteriores não corrigem esse contrato do resolver. **Fechamento:** local suspensa bloqueada antes de segredo/I/O; local ativa preservada. Não se afirma que todas as rotas comerciais ignoram suspensão.

### BUG-006 — Adapters usam segredo global/padrão quando resolução falha

**Tipo:** `implementacao`; **P1 de segurança**; proibição explícita de fallback da OS-15 e C-01. Locais: `distribution-channel-adapters.ts:85` e `:238`; probes P04/P05.

Com resolver retornando null, webhook sem env fez HTTP mockado e devolveu `sent`; assinatura era reproduzível com a constante pública embutida no código. Telegram com resolver null e token global **sintético** também enviou usando esse token global. **Fechamento:** referência não resolvida rejeita antes do transporte, sem chave fixa nem herança de outra conta; testar ausência, revogação e credenciais distintas A/B. A rechecagem de existência do segredo no worker não garante que o adapter tenha recebido sua chave decifrada; não foi alegado envio real indevido.

### BUG-007 — Canais oficiais incompatíveis com o fluxo entregue

**Tipo:** `implementacao`; **P1**; AC-15.1/15.2 e AC-19.3; probe P12. Locais: `commerce-contract.ts:20`, `commercial-workflow.ts:152`, `distribution-channel-adapters.ts:29`, `packages/web/bin/run-dispatch.mts`.

Na fixture autorizada, `createKitForAccount` rejeitou `telegram` e `webhook` com `invalid_channel`. `telegram_channel` passou a validação de canal, mas `getDistributionAdapter('telegram_channel')` lançou canal não suportado. Worker compara o canal persistido com `adapter.channel`, sem tradução. O entrypoint exige módulo com `createApprovedAdapter`; o arquivo entregue só exporta classes/factory com outra interface e não há consumidor dessas classes fora dos testes. **Fechamento:** canal persistido, criação de kit, factory/módulo aprovado e preflight devem interoperar; teste de ciclo completo com adapter oficial e HTTP mockado, mantendo aprovação de canal e marker.

### BUG-008 — 429 não recebe backoff exponencial com jitter

**Tipo:** `implementacao`; **P2**; AC-15.3. Local: `dispatch-worker.ts:274`; contraprova adicional em `dispatch-contract.ts:234`.

O worker usa `Date.now() + max(1,retryAfterSeconds ?? 60)*1000`, sem fator pela tentativa nem jitter. O helper também não aplica jitter e mantém atraso fixo quando o adapter fornece Retry-After, como fazem ambos os adapters. Repetindo `computeNextAttempt` com tentativas 1/2, 429 e Retry-After 30, todos os resultados foram exatamente `2026-10-15T12:00:30.000Z` para relógio `12:00:00Z` (`retry.log`). **Fechamento:** verificar no worker progressão exponencial, jitter limitado, respeito ao mínimo do provedor e limite de tentativas; não basta testar a flag retryable.

### BUG-009 — Novo caminho de ratificação contorna gate editorial existente

**Tipo:** `implementacao`; **P1**; AC-16.3, C-03, S-RUBRICA; probe P11. Local: `rubric-db.ts:625`, `:672`; comparação com `governance-db.ts:16`.

Com uma única oferta/comparação real na fixture, `ratifyRubric` existente recusou `minUnits=1` (`approved_method_required`), mas `ratifyRubricPolicy` novo retornou **ratified, sampleCount=1** e gravou decisão. EP-02 e S-RUBRICA determinam **30–50 casos**, não 50 avaliadores presenciais. O novo default aceita o tamanho fornecido; o único `sampleDigest` congela IDs/concordância da amostra, sem digest dos critérios completos da política. **Fechamento:** ambos os caminhos respeitam o gate contratual, preservam aprovador e critérios versionados/digest e não promovem amostra insuficiente. Não se exige quantidade de avaliadores não contratada.

### BUG-010 — Contenção de caminho aceita diretório irmão com mesmo prefixo

**Tipo:** `implementacao`; **P2 de segurança**; isolamento do driver na OS-17/CF-02; probe P06. Local: `marketing-storage-core.ts:189`.

Driver com raiz temporária `<temp>/private` aceitou `put('../private-escape/proof.txt', bytes, mime)`. O arquivo foi lido com sucesso em `<temp>/private-escape/proof.txt`, **fora da raiz**, porque `startsWith(rootDir)` aceita prefixo textual. **Fechamento:** negar caminhos absolutos/traversal/irmãos e manter caminhos legítimos; testar get/put/exists. Impacto comprovado no driver local novo; rota atual gera object_path no servidor e usa `privateObjectStore`, portanto não se afirma IDOR remoto ou leitura de outro tenant pela API.

### BUG-011 — Feed/Banner renderizam o mesmo Story

**Tipo:** `implementacao`, capacidade herdada incompleta certificada pela OS-17; **P2**; AC-17.4; probe P07. Local: `kit-renderer.ts:51`; consumidor `kit-artifact-db.ts`.

Renderizações com canais `instagram_stories`, `instagram_feed` e `banner` produziram **1080×1920** e SHA-256 idêntico `78597571f38fbb8be8b8c2b7548cda7dddc98d741ec6c3d7e23ec1048835d560`. Não existe seleção de template/formato. O teste de aceite só confere PNG não vazio. Story tem preço, disclosure e QR visíveis na inspeção realizada. **Fechamento:** renderizar os três formatos contratados, com dimensões e layout próprios, validar legibilidade e QR/link, sem inventar dimensões de Feed/Banner ausentes da OS.

### BUG-012 — Consolidação declara homologação que a evidência não sustenta

**Tipo:** `implementacao` documental; **P1 para fechamento da OS-19**; AC-19.3/19.4. Responsável: executor da OS-19. Locais: `CAPACIDADES-PENDENTES.md:3`, `STATUS-EXECUCAO.md:5`, `08-RASTREABILIDADE.md:5`, `:28`, `resultados/19-conclusao-blueprint.md`.

Os documentos dizem todas as capacidades resolvidas e prontas, e a matriz marca “Homologado no ativo” usando testes locais como prova. BUG-001…011 contradizem o fechamento técnico. Há ainda troca verificável de identidade do requisito: REQ-DOM-05 aparece como **outbox/mensageria** na nova linha 28; a matriz e limite original nas linhas 191/219 o associam a **identidade/matching entre lojas**. O resultado da OS-19 não apresenta novas verificações no ativo para os novos adapters. Isto não contesta a implantação anterior do núcleo documentada na OS-10.

**Fechamento:** reconciliar as três consolidações com o requisito original e evidência correspondente; separar implementado/testado/homologado/ativado e registrar gates abertos. Corrigir apenas a declaração não fecha os bugs técnicos. Nenhum desses documentos foi alterado pelo auditor.

## Divergências e limites sem novo BUG de segurança

| Ref. | Classificação | Evidência, impacto e responsável |
|---|---|---|
| R-01 | `contrato` | AC-17.2 exige 403 entre contas, C-09 determina 404 sem revelar existência; implementação segue C-09. Não tratar 404 como vazamento. Arquiteto deve conciliar códigos sem reduzir isolamento. A resposta anônima 403, em vez de 401, é divergência de implementação identificada por leitura da rota, ainda sem probe HTTP autenticado/anônimo; executor deve verificar o mapeamento. |
| R-02 | `contrato` | AC-18.1 descreve criação de conta/plano ao aceitar convite de platform_admin; C-01/C-08 e código separam provisionamento de convite de membership emitido por owner. AC-18.2 fala quota mensal, contrato/API usam campanhas ativas. Suítes aprovam o modelo existente, não esses enunciados literais. Arquiteto/dono do produto devem reconciliar o aceite versionado; não cabe ao auditor redesenhar o fluxo nem dar aceite integral silencioso. |
| R-03 | `melhoria_opcional` na borda da API pura | Probe P08: `calculatePriceEvidence` com política aprovada e `calibrationVerified` omitido chega a E3; explicitamente false chega a E2. A view `effective_price_evidence_policy` já exige calibração persistida/vinculada e os consumidores de produção inspecionados usam essa view. **Não foi comprovado bypass desse controle no fluxo persistido.** Uma precondição explícita na API pura e teste no consumidor tornariam o contrato menos ambíguo; o probe isolado não bloqueia AC-16.4 por si só. |
| R-04 | `diagnostico` de ambiente | Falhas iniciais de subprocesso/rede da sandbox desapareceram na execução host, sem patches. Não são bugs novos nem evidência de regressão. |

Não há achado de categoria `produto` ou `preexistente` autônomo confirmado nesta rodada. BUG-011 descreve implementação anterior cuja conclusão foi certificada indevidamente na nova OS; não se atribui sua introdução à OS-17 sem histórico por commit. Nenhuma melhoria opcional foi convertida em bloqueio obrigatório.

## Parecer de fechamento das sete capacidades

| Capacidade declarada superada | Parecer desta auditoria |
|---|---|
| Comparabilidade e E3 | Mecanismo conservador/fallback e políticas persistidas **verificados localmente**; benchmark sintético não certifica ratificação/calibração real no ativo. |
| Rubrica humana e sombra | Persistência/comparação funcionam; ratificação **não conforme** (BUG-009). |
| Parser de comissão multi-rede | **Não conforme** (BUG-001/002/003). Ledger existente passa seus testes. |
| Credenciais de captura por conta | **Não concluída ponta a ponta**, com exceção indevida de suspensão (BUG-004/005). |
| Storage e kits | Isolamento SQL e validações existentes preservados; driver local e formatos **não conformes** (BUG-010/011). |
| Canal oficial/outbox | Core de lease/marker/cancelamento passa; integração, credenciais e backoff **não conformes** (BUG-006/007/008). |
| Experimentos/onboarding/quotas | Protocolo pareado e limites ativos verificados localmente; AC-18.1/18.2 exigem reconciliação formal, bloqueio universal de suspensão incompleto (R-02/BUG-005). |

**Fechamento negado para a conclusão integral das OS-13 a OS-19.** Há implementação substancial e testes verdes, mas AC-19.3/19.4 não se sustentam. Correções devem voltar ao executor com estes IDs e testes de fechamento; divergências R-01/R-02 voltam ao arquiteto. Uma nova auditoria deve verificar os mesmos achados e aceites na versão corrigida. Este parecer não autoriza alteração de contrato, migration, ativação de canal, convite real, deploy ou operação remota.
