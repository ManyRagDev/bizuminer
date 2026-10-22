# 28 — Auditoria independente da continuidade e finalização local

Data: 15/10/2026, America/Sao_Paulo. Auditor independente solicitado pelo proprietário: GPT-6.1 Sol, raciocínio alto. Revisão local de SQL, fontes, inventário operacional e evidências, com contraprovas próprias em banco isolado. O auditor não alterou código ou migrations, não aplicou SQL remoto e não publicou deployment.

## Decisão técnica e bytes examinados

**APROVADA PARA ENSAIO ISOLADO a candidata desta rodada, pelo manifesto e hashes abaixo. Execução no projeto ativo e deploy de produção NÃO estão aprovados por este parecer.** Não ficou bloqueador local residual nos casos de continuidade examinados após os reparos. A aprovação não afirma cobertura integral do produto, conclusão de E2 ou homologação Supabase.

| Unidade | Arquivo em `packages/persistence/supabase/rollouts/v2/` | SHA-256 desta decisão |
|---|---|---|
| A — fundação | `20261015194719_garimpa_v2_foundation.sql` | `579fa86e8696d7bfcee701ed61e6c8b43b9538dfafa93f146883633bd3682c57` |
| B — expansão com compatibilidade | `20261015194748_garimpa_v2_expansion.sql` | `576784e3157c080051e1b23fa52c517530b93618b7ebe98adb2f2bb6931d2664` |
| C — corte explícito | `20261015194759_garimpa_v2_scoped_cutover.sql` | `bb7fec9f4fc8c73c8bb9762d30824e589af7da093b102791b68edb2787cd2f37` |

Manifesto final SHA-256: `f099288d245ac2c308f4298cdccf80e3bffecf4a6cef8f099f2aad0c3c5a7c51`. Catálogo `rollout-28-expansion-catalog.json`: `b3aa87ae61b76177b6dc3bc02ede97ccaf165fab7b89e6825e9595bd5dd5ec74`. O manifesto está selado, contém 58 fontes de compatibilidade com seus hashes individuais e mantém `productionApproved=false`. O verificador local confirmou esses arquivos, os três instalados, onze originais substituídas, 28 policies legadas enumeradas e 37 tabelas comerciais novas. Esse selo identifica fontes locais revisadas; não identifica, por si, o artefato servido pela Vercel ou executado em Actions.

B/C mudaram em relação à rodada27 para reparar continuidade da extensão. A fundação A permaneceu igual. Os bytes aprovados anteriormente foram preservados em [rollout-27-aprovado](evidencias/rollout-27-aprovado/manifest.json); conferi os três hashes SQL e o manifesto original `4343502e…`. O parecer [27](27-AUDITORIA-INDEPENDENTE-ROLLOUT.md) continua histórico e não deve ser lido como aprovação automática dos novos bytes. A rejeição automática da original M2 permanece válida; nenhuma destas decisões é override ou autorização de contorno dessa revisão.

## Achados desta rodada e reparos conferidos

**Manutenção legada:** `backfill-family` passou a classificar uma conta ativa por transação contextual, com prévia por padrão, sem aprovar curadoria ou migrar identidade. Bootstrap/configuração da casa agora exigem conexão administrativa dedicada `BIZUMINER_MAINTENANCE_DATABASE_URL`, sem fallback para `DATABASE_URL`, sem SET ROLE ou GUC owner/plataforma para obter poder. Recusam runtime/papel público, exigem privilégio administrativo real, bloqueiam a casa suspensa e usam transação/locks. Bootstrap exige e-mail explícito, uma única identidade autenticada global e role afiliado ativa; não muda sua conta de origem nem reativa silenciosamente membership revogada/operator. Escrita exige `--apply`; configuração de marketplace conserva `validated_at=null`. Falhas de URL/conexão dos novos comandos são sanitizadas para não imprimir credenciais.

`cleanup-lifecycle`, `purge-catalog`, `curate-initial-catalog` e `verify-tenant-isolation` foram retirados do procedimento operacional: encerram antes de conexão ou ação externa. Essa retirada é relevante: os dois primeiros assumiam visibilidade irrestrita de favoritos/alertas/referências; apenas adicionar contexto worker poderia interpretar dados ocultos por RLS como inexistentes. O script de isolamento criava/apagava tenants fixos e não era SELECT de auditoria; a curadoria inicial continha decisões históricas fixas. Não foram promovidos a rotinas V2 nem substituídos por limpeza privilegiada automática.

**Captura por navegador/extensão:** reproduzi independentemente o defeito anterior: `BrowserCaptureStore.pending` retornou 42501 sob a cadeia A/B/C e papel `garimpa_app`, mesmo com casa e autor válidos. A suíte antiga de capture-batch usava fixture própria administrativa, sem a barreira completa, portanto seu PASS não provava esse caminho após C. O serviço reparado define tenant/ator real na mesma transação e revalida conta, role, membership não revogada e dispositivo quando presente, antes de `pending`/`complete`. Zera privilégios de owner/plataforma e distingue ator device de humano. Tenant explícito passou também às leituras/status/dispatcher das rotas envolvidas.

**Pareamento e dispositivos:** criação, listagem, renomeação, revogação e métricas usam contexto humano proprietário real, revalidado por `withAccountDb`. A captura manual usa contexto/autor/tenant selecionado e membership ativa. O registro de uso do dispositivo deixou de tentar UPDATE sob owner fictício. A integração de monitoring GitHub limita a leitura da casa e nega o caminho de outra conta antes de fetch.

**Estado de conexão:** `authorizeAccountTransaction`, `withTenantDb` e `withUserDb` limpam poderes de plataforma herdados; os fallbacks também limpam membership/identidade inadequadas. Reproduzi o caso adicional de `withUserDb` com usuário vazio herdando o ator da sessão. Foi corrigido e reconferido: mesmo com sessão previamente marcada como platform_admin/owner/outro usuário, o contexto vazio termina com plataforma, membership e ator vazios. Isso não concede papel de plataforma ao contexto normal; os caminhos administrativos autorizados continuam tendo elevação explícita própria.

## Avaliação SQL da extensão e do corte

**A: aprovada para ensaio, inalterada.** Permanecem os controles e condições descritos em27: fundação aditiva, papel público restrito e singleton persistida falsa, sem abertura comercial antecipada.

**B: aprovada para ensaio nos novos bytes.** Adiciona duas funções privadas estreitas para preservar o protocolo existente, mantendo a separação entre as 37 tabelas comerciais pendentes e a captura legada. Não abre policies gerais nem modifica M1 histórica.

- `exchange_extension_pairing(text,text,text)` recebe somente hashes SHA-256 em formato validado e prefixo limitado. Trava o dispositivo pendente, exige prazo válido, código exato, token ainda ausente e dispositivo não revogado. Confere conta ativa, membership owner não revogada e role afiliado ativa, com SHARE locks da autoridade; o UPDATE final repete as condições de consumo. Retorna somente ID e nome de exibição. Não reativa linha revogada e não aceita/devolve token bruto no SQL. A emissão do token bruto fica no backend após sucesso da transação.
- `touch_extension_device(text)` exige ator device e coincidência de usuário/tenant/dispositivo e autoridade ativa. Atualiza somente `last_used_at`, retorna booleano e não concede UPDATE geral. O chamador desfaz a captura se a revalidação falhar.
- As duas funções são SECURITY DEFINER com search_path fixo em `pg_catalog` e referências qualificadas. EXECUTE fica somente para `garimpa_app`, não PUBLIC/anon/authenticated/papel público. O prazo de lock do exchange é limitado.
- Unicidade de `token_hash` e `pairing_code_hash` é pré-condição explícita em B/C, por estrutura de índice válido/pronto/único não parcial. Esses índices são preexistentes no SQL original da extensão, reconstruídos na fixture; a candidata nega ausência/divergência e não cria índices remotos para esconder drift.

**C: aprovada para ensaio nos novos bytes.** O catálogo foi recapturado com as funções/ACLs/definições completas novas. Permanecem o preflight de RLS/owner/ACL/constraints/FKs/triggers/roles, singleton falsa, remoção exclusiva das 28 policies legadas e preservação das especializadas. A ativação só termina após UPDATE de exatamente uma linha e confirmação de estado verdadeiro. Não executar a original M2 antes ou depois desta sequência.

## Contraprovas independentes e evidência final

Nos hashes finais acima, o auditor executou em PGlite isolado:

| Alteração sintética antes de C | Resultado |
|---|---|
| EXECUTE de exchange para papel público | `rollout_function_mismatch` |
| EXECUTE de touch para anon | `rollout_function_mismatch` |
| search_path de exchange alterado para public | `rollout_function_mismatch` |
| RLS de product desabilitada | `rollout_table_security_mismatch` |
| UNIQUE de pairing_code_hash removida | `extension_unique_hash_required: pairing_code_hash` |
| Singleton removida | `rollout_gate_must_be_closed` |
| Membership privilegiada concedida ao runtime | `runtime_can_enable_rollout` |

Após rollback dos desvios, C íntegra concluiu. Chamada de exchange com papel público foi negada com 42501. Em integração própria com os serviços reais e factory do papel app, uma identidade global cuja origem era a conta B conseguiu atuar legitimamente pela membership owner da conta A: `pending`, criação/consumo único do pareamento, listagem de um dispositivo e captura manual funcionaram; retry de exchange retornou null; revogação da membership passou a negar `pending`. Nenhum token/segredo real foi usado ou impresso. A contraprova de limpeza de GUCs descrita acima também foi executada pelo auditor.

Conferi as evidências finais do executor, separadas dos erros intermediários:

| Evidência | Resultado conferido |
|---|---|
| [execucao-28-replacement-native.json](evidencias/execucao-28-replacement-native.json), `2026-10-16T01:11:03.124Z` | PostgreSQL17.6, 26 verificações + seis aplicações = **32 PASS**, sem erro, mesmos hashes A/B/C |
| [execucao-28-operational-native.json](evidencias/execucao-28-operational-native.json), `2026-10-16T01:11:05.714Z` | **21 PASS**, serviços reais sob runtime, trigger legado exato, manutenção, browser/manual, pareamento concorrente, dispositivos e revogação |
| [execucao-28-final-checks.json](evidencias/execucao-28-final-checks.json) | **26/26 comandos exitCode0**: 21 suítes SQL, 379 testes web, 36 testes persistence, typechecks web/persistence e build web |

O ensaio nativo usa duas conexões reais para concorrência e inclui o trigger original `product_seed_curation`, além das unicidades/identidades conhecidas. Isso melhora a prova de continuidade em relação à fixture anterior, mas não transforma a reconstrução sintética em dump completo do projeto. As falhas intermediárias de rebuild não selado, expectativa antiga de autorização e caminho de subprocess com URL encoding foram registradas separadamente; não foram contabilizadas como PASS nem como resultado final.

## Inventário operacional e limite de compatibilidade

| Caminho | Situação local conferida / condição de uso |
|---|---|
| Cron `monitor-prices.yml` → monitor-prices/plan/PostgresStore | Contexto worker e helpers privados; provas locais de leitura, interesses, suspensão, skip e escrita. Credenciais globais somente para casa; execução externa não liberada por esta prova |
| `capture-offers.yml` → run-capture-batch → sweeps/triage | Adapters atuais da casa. Rota/dispatcher negam outra conta antes de criar/despachar captura automática. Provar artefato real de Actions e cadeia com configurações reais antes de ativação |
| Browser/importação de extensão/captura manual | Serviços reparados com contexto e revalidação; trigger cria curadoria pending; idempotência/revogação ensaiadas. Não confundir importação manual com autorização de API automática para outras contas |
| Pareamento/admin de dispositivos | Proprietário humano real para gestão; prova secreta de código para exchange; runtime device para captura/touch. Testes incluem consumo concorrente e negativas de autoridade |
| Dispatch comercial | Barreira persistida antes do adapter e contexto da conta; não houve envio oficial nesta auditoria |
| Backfill de família | Prévia por padrão; aplicação explícita, conta ativa e escopo por tenant; não ratifica curadoria |
| Bootstrap/configuração da casa | Manutenção administrativa explícita e conexão separada; prévia/--apply e autoridade real; não é worker nem função de runtime |
| Lifecycle/purge/curadoria inicial/verify-tenant-isolation antigos | Retirados, falha antes de conexão; não executar como manutenção ou auditoria do ativo |
| `reconcile-capture-batches` | Leitura por padrão; --execute altera apenas registros expirados via store contextual. Continua precisando de prova operacional do artefato escolhido |
| Demais verify/inspect e compatibility audit | Leitura não equivale a homologação. Diagnósticos raw legados sem contexto podem retornar zeros sob C; não usar como prova de ausência/integridade. O compatibility audit escolhe alvo explícito/read-only, mas SET ROLE administrativo não prova login/pooler real |
| `probe-monitoring-endpoints` / `configure-monitoring-github` | Primeiro chama APIs externas; segundo escreve secrets/vars. Não são checks sem efeitos e não foram executados pelo auditor |

Deploy web a partir da árvore local não atualiza automaticamente os writers: capture usa `GITHUB_CAPTURE_REF` ou main, e cron usa código da branch padrão. A homologação futura deve registrar commit/ref/hash efetivamente executado por Actions, deployment servido e configuração por ambiente. Não deduzir isso do HEAD local antigo, do manifesto ou de um build verde.

## Condições pendentes e recuperação

O usuário autorizou prosseguir, mas **não foi obtida a evidência externa necessária para uma decisão de execução no ativo**: o cliente removeu as ferramentas Supabase desta sessão e o executor reportou Vercel403 no escopo correto. O auditor não reconectou nem tentou escrita por outro caminho. Não existe nesta rodada prova Supabase S0–S3, Auth/Storage/Supavisor, versão publicada e writers implantados. A ausência desses dados é impedimento técnico de homologação/implantação, não uma nova exigência comercial ou revogação da autorização humana.

Antes de futura aplicação no projeto `spbuwcwmxlycchuwhfir`, reconferir history e baseline real imediatamente anterior: M1 e os dois complementos estreitos conhecidos, nenhuma M2; policies/grants/owners/RLS/constraints/triggers/índices e dados. O último snapshot disponível continua histórico (13:45:44UTC, 1.657 produtos/9.146 observações/1.494 publicações/712 cliques/zero segredos, 29 policies e duas FKs de autoria validadas); não foi reconfirmado nesta rodada. Os SELECTs e condições detalhadas de27 permanecem aplicáveis, agora incluindo os índices únicos da extensão e as funções novas. Não ajustar schema real para fazê-lo coincidir artificialmente com fixture.

O ensaio autorizado deve usar banco descartável isolado, papéis/credenciais próprios, exatamente os bytes e fontes selados, uma transação por unidade, lock_timeout5s e statement_timeout45s, provas S0/A/B/C, dois logins reais do runtime, rollback/retomada e recuperação. Nenhuma unidade pode ser dividida ou ter guard removido para passar. Cada nova alteração exige reconferência dos hashes/evidências afetados.

Após C, recuperação continua significando negar capacidades comerciais pelo controle persistido, preservar isolamento/projeções públicas/dados e manter código/writers compatíveis. Não restaurar `using(true)`, reaplicar M2, apagar tabelas ou voltar a um deployment antigo sem a compatibilidade necessária. A execução de recuperação no projeto ativo também depende do procedimento autorizado no ambiente correspondente; não foi realizada aqui.

**Conclusão desta auditoria:** candidata local reparada e aprovada para o ensaio isolado identificado; homologação Supabase, implantação e conclusão do produto continuam pendentes das provas externas específicas. Não houve nova escrita remota nem deploy nesta revisão.
