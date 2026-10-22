# 31 — Auditoria independente da reconciliação com a baseline real

Data: 15/10/2026, America/Sao_Paulo; leituras e ensaios registrados em 16/10/2026 UTC. Auditor solicitado pelo proprietário: GPT-6.1 Sol, raciocínio alto.

**Decisão: APROVADAS PARA ENSAIO ISOLADO as novas unidades A/B/C identificadas abaixo. Produção, aplicação no ativo e deploy NÃO estão aprovados por este parecer.** A baseline real revelou diferenças importantes em relação à fixture28; a candidata foi corrigida pelo executor e reensaiada. Não houve alteração remota pelo auditor. O único arquivo de código editado pelo auditor nesta rodada, por solicitação expressa do executor, foi `tools/editorial-tests/replacement-rollout-flow.test.ts`; SQL/gerador/fixture/código de aplicação foram alterados pelo executor, não pelo auditor.

## Artefatos desta decisão

| Unidade | Arquivo em `packages/persistence/supabase/rollouts/v2/` | SHA-256 aprovado para ensaio |
|---|---|---|
| A — fundação e pré-condições | `20261015194719_garimpa_v2_foundation.sql` | `33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c` |
| B — expansão e privilégios explícitos | `20261015194748_garimpa_v2_expansion.sql` | `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa` |
| C — corte selado | `20261015194759_garimpa_v2_scoped_cutover.sql` | `1114987e4108745492af6c3457ec6850a999ed16be79d815d001c4b156669a21` |

Manifesto selado, 59 fontes de compatibilidade: `dafa91ab8231fa0ebed32152412586100ec3c499dfa52f5703bf1d50493ab7eb`. Catálogo `rollout-31-expansion-catalog.json`: `26a510294648b9dd42e031ac7352fe5858d6a8db7b465b50893355447d69a0b7`. Matriz explícita `tools/editorial-tests/rollout-privilege-matrix.json`: `be957e08944d643d55c32982929c3c7ebff19c32c10f47cb475055d824fe4165`.

O verificador local retornou PASS para esses bytes e manteve `productionApproved=false`. São preservados os três arquivos já instalados e as onze originais substituídas; o corte continua enumerando exatamente 28 policies legadas e a expansão 37 tabelas comerciais novas. Os pareceres22/27/28 continuam históricos. As versões28 foram preservadas pelo executor em `evidencias/rollout-28-aprovado`; não devem ser confundidas com os bytes atuais de mesmos nomes. A rejeição automática anterior da original M2 não foi revogada nem contornada. Nenhum parecer técnico autoriza ignorá-la ou executá-la tardiamente.

## Leituras independentes no projeto ativo

Usei exclusivamente `get_project_url`, `list_migrations` e `execute_sql` com SELECTs de catálogo/contagens. Não consultei linhas de identidade, e-mail, dados comerciais individuais ou conteúdo de segredos; não alterei GUC, role, token, DDL ou dados remotos.

| Evidência | Constatação |
|---|---|
| [auditoria-31-project.json](evidencias/auditoria-31-project.json) | URL do projeto `spbuwcwmxlycchuwhfir` |
| [auditoria-31-identity.json](evidencias/auditoria-31-identity.json), 01:50:36UTC | PostgreSQL17.6, inspetor postgres; fundação, controle e projeção pública V2 ausentes; 29 policies |
| [auditoria-31-migrations.json](evidencias/auditoria-31-migrations.json) | M1 `20261015034755`, segredo `20261015035126`, reparo de autoria `20261015041540`; M2 e A/B/C ausentes |
| [auditoria-31-security.json](evidencias/auditoria-31-security.json) | 28 tabelas + uma view; policies, RLS/FORCE/owners/ACLs, roles e privilégios de coluna |
| [auditoria-31-structure.json](evidencias/auditoria-31-structure.json) | Quatro funções baseline, uma view, um trigger, 149 constraints e 99 índices |
| [auditoria-31-defaults.json](evidencias/auditoria-31-defaults.json), 01:54:55UTC | Defaults, atributos/memberships de roles, privilégios de schema e três sequences |
| [auditoria-31-counts.json](evidencias/auditoria-31-counts.json), 01:52:35UTC | 1.657 produtos, 9.221 observações, 1.494 publicações, 721 cliques, 172 shortlinks, 1.657 curadorias, zero edições e zero segredos |

Os arquivos preservam queries, retornos originais e interpretação dos delimitadores de dados do MCP. As contagens são um snapshot em ambiente ativo, não prova de imutabilidade nem comparação de aplicação: observações/cliques aumentaram desde28 sem que A/B/C fossem aplicadas. Não reutilizar os números antigos como se fossem atuais.

O inventário de tabelas e as 29 policies iniciais de A combinam exatamente com o banco. `garimpa_app` tem LOGIN, não tem SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION nem parents. O papel público ainda não existe. O proprietário postgres real é **não superuser**, com BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION; isso não deve ser confundido com o administrador superuser do PostgreSQL descartável usado nos ensaios. `service_role` é NOLOGIN/BYPASSRLS, sem parents, e não tem USAGE no schema garimpa. Não recomendar abrir esse USAGE para fazer teste passar.

As quatro funções baseline (`authenticate_extension_device`, `resolve_actor_accounts`, `resolve_actor_identity`, `seed_product_curation`) combinam integralmente em definição/source/ACL/configuração com o catálogo ensaiado. As duas FKs globais de autoria estão validadas, com ON DELETE RESTRICT. Todas as 149 constraints observadas estão validadas. Os 51 FKs existentes combinam estruturalmente — nome, origem/destino, colunas e validação — com o inventário do estágio corrigido. Isso não inventa ações de cascata que a reconstrução histórica não continha.

O trigger real `product_seed_curation` está habilitado (`O`) e usa a função legada conhecida. Os três sequences existentes pertencem a postgres e concedem somente leitura/USAGE (`rU`) à aplicação. A view `curation_queue_facts` tem ACL/opções compatíveis; sua definição antiga é deliberadamente substituída por B (inclusive sua revisão posterior no mesmo arquivo), portanto essa diferença de definição não é um drift pendente do corte. Preservar grants/segurança da view antiga é diferente de exigir que sua regra antiga sobreviva à expansão.

## Achados reais que impediram promover a candidata28

1. **FORCE RLS omitido na fixture:** `app_user_role` real tem FORCE RLS=true. A fixture anterior registrava false. Não desabilitar essa proteção em produção para satisfazer C.
2. **ACLs legadas omitidas:** `capture_batch` e `triage_run` têm `service_role=arw/postgres`, além dos grants da aplicação. Essas permissões devem ser preservadas e representadas no ensaio; não removê-las para coincidir com a fixture.
3. **Default de tabela perigoso para a expansão:** `pg_default_acl` de postgres no schema garimpa concede `garimpa_app=arwd` a novas relações. Não havia default global relevante adicional no snapshot. GRANT SELECT/INSERT no arquivo não revoga UPDATE/DELETE já herdados. Esse default também alcança a nova view efetiva.

C28 corretamente rejeitaria ACLs divergentes; o risco seria recapturar seu selo usando uma baseline fiel sem antes reparar os privilégios da expansão. O auditor reproduziu essa hipótese somente em PGlite descartável: default real arwd, A+B anteriores à normalização, conta/ator/evento sintéticos e ativação administrativa **local** do controle exclusivamente para a contraprova, sem executar C. O runtime conseguiu UPDATE do payload e DELETE do evento de domínio, uma linha cada, contrariando o ledger imutável. Não houve ativação no projeto ativo nem demonstração de que C28 aceitaria aquela baseline. A saída dessa contraprova não registrou o digest do SQL naquele instante; o registro distingue essa limitação de uma execução formal por hash.

A reconciliação e o alcance desse experimento estão em [auditoria-31-comparacao.json](evidencias/auditoria-31-comparacao.json). A autorização isolada anterior era limitada aos casos/ambiente então documentados; não demonstrava que defaults de produção estavam ausentes.

## Reparos revisados e parecer por unidade

**A — aprovada para ensaio nos novos bytes.** Acrescenta guard de defaults globais/do schema do proprietário executor, negando divergência antes da fundação. Conserva as condições iniciais e o controle falso. A normalização não altera o DEFAULT ACL remoto.

**B — aprovada para ensaio nos novos bytes.** A fixture passou a reproduzir FORCE RLS, grants legados, sequences e default arwd depois da construção das tabelas legadas. A expansão agora normaliza somente as 37 tabelas novas por matriz explícita derivada dos GRANT/REVOKE intencionais: 20 com SELECT/INSERT/UPDATE, 17 com SELECT/INSERT, sem DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para runtime. Mantém três permissões de coluna: `audience_policy_version.approved_by`, `.approved_at` e `private_artifact.status`. Não concede UPDATE geral ao corpo da política, digest ou caminho do artefato. A nova view `effective_price_evidence_policy` fica somente SELECT. As tabelas/grants/defaults legados permanecem iguais.

Os helpers privados de monitoramento e extensão mantêm EXECUTE somente para app, path fixo e validação estreita; a troca de pareamento não se torna função pública. O controle comercial continua falso durante a expansão e as 37 tabelas continuam protegidas por `rollout_pending`, inclusive contra SQL direto. Não houve alteração de autorização comercial, quota, canal, piloto ou regra editorial.

**C — aprovada para ensaio nos novos bytes.** O catálogo foi recapturado com a baseline fiel e os privilégios normalizados. As tabelas legadas têm zero diferença de RLS/FORCE/owner/ACL contra o snapshot remoto observado. C verifica também o inventário de ACLs explícitas de coluna, além dos controles já revisados. ACL vazia `{}` deixada por GRANT/REVOKE é tratada como ausência de grant efetivo; grants de coluna reais continuam detectados. O guard de defaults reaparece antes dos DROPs. O corte preserva as policies especializadas e só ativa o controle ao final com uma linha atualizada e estado verdadeiro.

Não basta atualizar o hash de C ou dispensar uma comparação para executar uma baseline divergente. Qualquer diferença futura requer nova investigação; não há autorização para mudar owners/grants/FORCE/defaults legados em produção a fim de acomodar o teste.

## Verificação executada pelo auditor e checks do executor

Por solicitação expressa, ampliei somente `replacement-rollout-flow.test.ts`. SHA-256 final do teste: `332d37ea1c3f2e48ff02b2a46aecd8c047fcb2e0aaaf64ae702f76561a335d17`. O teste usa expectativas independentes da matriz de implementação, derivadas dos GRANTs intencionais, e verifica:

- default arwd real, FORCE RLS e grants legados presentes; default inesperado faz A negar antes de criar objetos;
- privilégios efetivos das 37 tabelas e da view, as três colunas permitidas e as colunas sensíveis negadas;
- preservação integral da segurança/grants legados e do DEFAULT ACL antes/depois da expansão/corte;
- EXECUTE dos cinco helpers de monitoramento/extensão ausente para papel público/anon/authenticated;
- GRANT UPDATE(sha256) inesperado faz C abortar com controle falso e policies intactas;
- INSERT legítimo de eventos/uso/versão funciona, UPDATE/DELETE indevidos são negados com 42501, e UPDATE das colunas aprovadas de ratificação continua funcionando;
- os controles anteriores de drift, isolamento A/B/A, concorrência, plataforma/owner, monitoramento, rollback e recuperação continuam válidos.

Executei a suíte em PostgreSQL17.6 descartável ligado somente a localhost, sem aceitar DATABASE_URL externa. O sandbox negou o bind inicial; a execução local com permissão apropriada concluiu. Uma primeira tentativa encontrou erro do próprio teste (`object_key` em vez de `object_path`), preservado em [execucao-31-replacement-native-intermediario-1.json](evidencias/execucao-31-replacement-native-intermediario-1.json). Corrigi o teste e a expectativa nominal da checagem de coluna; não alterei SQL para fazê-lo passar.

| Evidência | Resultado conferido |
|---|---|
| [execucao-31-replacement-native.json](evidencias/execucao-31-replacement-native.json), 02:02:09UTC | **33 checks + seis aplicações = 39 PASS**, execução pelo auditor, mesmos hashes A/B/C acima |
| [execucao-31-operational-native.json](evidencias/execucao-31-operational-native.json), 02:03:06UTC | **21 PASS**, serviços reais/manutenção/extensão/trigger legado, mesmos hashes finais |
| [execucao-31-final-checks.json](evidencias/execucao-31-final-checks.json) | Runner amplo inicial: 25 comandos aprovados e web-tests falhou em dois arquivos sob sandbox; não é arquivo 26/26 verde |
| [execucao-31-web-unsandboxed.log](evidencias/execucao-31-web-unsandboxed.log) | Rerun web separado sem sandbox: **379 aprovados, zero falhas**; executor reportou EPERM/saída de subprocess ausente no ambiente restrito, sem alteração de código |
| [execucao-31-capture-extension-checks.json](evidencias/execucao-31-capture-extension-checks.json) | Quatro comandos de testes/typechecks de capture/extension com exitCode0 |
| [execucao-31-build-node24-unsandboxed.log](evidencias/execucao-31-build-node24-unsandboxed.log) | Build Node24.11.0 em cópia isolada, URL fictícia, aprovado; não build autenticado do deployment nem teste da conexão real |

As diferenças entre primeira execução e reruns permanecem explícitas; não se substituiu retrospectivamente o resultado inicial por um PASS. Os resultados locais não comprovam Auth/Storage/Supavisor ou a versão servida.

## Pacote revisável e limites externos

O executor preparou o pacote final de fontes de 462 arquivos, sem publicação, descrito em [execucao-31-release-fontes.json](evidencias/execucao-31-release-fontes.json). Conferi o SHA-256 de `/tmp/bizuminer-release31-r3.tar.gz`: `7fcbb0dd4a541cb6bd400f96877e2dbe4eff20a36f7f458023f40801eb605040`, os 462 hashes/quantidades de bytes do inventário e o manifesto `dafa91ab8231fa0ebed32152412586100ec3c499dfa52f5703bf1d50493ab7eb`. Comparei também todos os arquivos com o pacote intermediário `/tmp/bizuminer-release31-final.tar.gz`, SHA-256 `a8d9687af46ed133a43caeb5c70d200e3eb1ce19cd12331fb1f0b48c964e2529`: somente `packages/persistence/supabase/rollouts/v2/README.md` mudou, sem arquivos adicionados/removidos; fontes de runtime, SQL e manifesto permanecem idênticos entre esses dois pacotes. Quatro entradas das 59 `compatibilitySources` são a matriz e os fragmentos/preflight de geração em `tools/editorial-tests`, ausentes do tar; portanto, o pacote não contém sozinho todas as entradas necessárias para reexecutar o verificador do selo. É **pacote de fontes**, não deployment prebuilt aprovado, commit publicado ou evidência de execução de Actions. As exclusões declaradas do pacote não substituem a revisão de configuração no ambiente de destino.

O acesso de leitura Supabase foi restabelecido e os impedimentos antigos de ferramenta não devem ser repetidos como se continuassem iguais. O executor também identificou o projeto Vercel/produção e sua proveniência. Entretanto, a produção e os crons conhecidos continuam no commit antigo `43700c59…`; não se comprovou implantação das fontes atuais. Preview com variável DATABASE_URL herdada para targets production/preview, sem isolamento demonstrado, não é staging seguro. Não ler valores de credenciais para deduzir isso nem usar tal preview para ensaiar escrita.

O executor informou `list_branches=[]` e tentativa de branch recusada por falta de `confirm_cost_id`, sem ferramentas get_cost/confirm_cost expostas. Nenhum recurso foi criado. A autorização humana para finalizar não é prova de ambiente isolado criado nem substitui a revisão/custo exigidos pelo serviço.

## Condições para avançar e recuperação

1. Ensaiar os bytes finais em ambiente Supabase separado, com configurações/credenciais próprias e sem apontar preview ou Actions ao banco ativo por herança. Confirmar papéis/proprietário reais do serviço gerenciado; o superuser do ensaio nativo não prova toda capacidade DDL do postgres gerenciado.
2. Provar S0/A/B/C e recuperação com Auth/Storage/Supavisor, dois logins runtime reais, experiência pública monetizada, comprador/curadoria, pareamento/extensão, workers e idempotência/revogação. Registrar deployment e ref/commit efetivo de Actions; build web local não atualiza o cron/default branch ou `GITHUB_CAPTURE_REF`.
3. Reconferir imediatamente antes da janela projeto/history, as mesmas policies/defaults/grants/roles/functions/views/triggers/constraints/índices e contagens por SELECTs equivalentes às evidências31. Mudança de catálogo exige nova decisão; crescimento legítimo de dados exige baseline atualizado, não redução ao número histórico.
4. Aplicar somente unidades explícitas, em ordem, uma transação por unidade, lock_timeout5s/statement_timeout45s, com pré/pós-condições e rollback confirmados. Não rodar db push da pasta histórica inteira, original M2, fragmentos ou SQL alternativo para contornar rejeição/preflight.
5. Obter parecer correspondente ao ambiente e artefato efetivamente homologados antes de execução no ativo. Não declarar E2 ou produto concluídos apenas por este ensaio e pela existência de um pacote revisável.

A recuperação após C continua preservando dados, isolamento, privilégios mínimos e projeções públicas, desativando capacidades comerciais pelo controle persistido sob procedimento autorizado. Não restaurar policies irrestritas, DEFAULT ACL diferente, owners privilegiados ou código antigo incompatível como atalho de rollback. Nenhuma dessas ações foi executada no projeto ativo nesta auditoria.

**Fechamento:** a reconciliação descobriu e corrigiu lacunas reais de baseline e de herança de privilégios. Os novos bytes estão aprovados para ensaio isolado pelos hashes indicados; homologação Supabase e implantação de produção continuam pendentes de evidência específica, sem nova aprovação comercial presumida.
