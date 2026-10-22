# 27 — Auditoria independente da candidata substituta de rollout

Data: 15/10/2026. Auditor técnico independente: agente solicitado pelo proprietário, GPT-6.1 Sol, raciocínio alto. Escopo desta rodada: leitura dos artefatos locais, revisão SQL/código e contraprovas em PostgreSQL isolado; nenhuma escrita remota, deploy ou alteração de código/migration pelo auditor.

## Decisão vinculada aos artefatos

**APROVADA PARA ENSAIO ISOLADO a sequência A → B → C abaixo, nas transações e condições do manifesto. NÃO APROVADA para execução no projeto ativo nesta rodada.** Não encontrei bloqueador local residual nos casos revisados após as correções descritas neste parecer. A aprovação para ensaio não equivale a conclusão de E2, homologação Supabase, aprovação comercial ou autorização de produção.

| Unidade | Arquivo em `packages/persistence/supabase/rollouts/v2/` | SHA-256 aprovado para ensaio |
|---|---|---|
| A — fundação | `20261015194719_garimpa_v2_foundation.sql` | `579fa86e8696d7bfcee701ed61e6c8b43b9538dfafa93f146883633bd3682c57` |
| B — expansão | `20261015194748_garimpa_v2_expansion.sql` | `e2c2dc82c2a9fd562d326f68414bf7337541f86cfc26c5126e36a11e88a75611` |
| C — corte explícito | `20261015194759_garimpa_v2_scoped_cutover.sql` | `28e08ebbb89d4d453eb0149d93f22d0e4084ea93e3ca60a87b38a5963367fa8b` |

O manifesto examinado tem SHA-256 `4343502eacc7291769b9bc816fbd98cc19d9531898e3c92a8089bb2988fd15c5`, `sealed=true` e `productionApproved=false`. O catálogo de expansão tem SHA-256 `c5be5467176006212661059da04977ac15128aa439844599d238a342e97c377e`, presente no manifesto e no cabeçalho de C. Alterar qualquer unidade ou sua fonte invalida esta identificação até nova conferência. O gerador não deve ser executado durante a aplicação.

Esta decisão preserva o parecer histórico [22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md). A original M2 permanece reprovada para a cadeia ativa e foi anteriormente rejeitada pela revisão automática antes da execução. Esta auditoria não substitui nem contorna essa revisão. Os onze arquivos originais pendentes são fontes históricas expressamente substituídas; não executar `db push` sobre a pasta histórica completa, nem executar M2 tardiamente.

## Base conhecida e limites

O último estado remoto independentemente conferido, antes da remoção do MCP pelo cliente, é o projeto `spbuwcwmxlycchuwhfir`, com M1 e os dois complementos estreitos já instalados; M2 ausente. As versões relevantes são `20261015034755`, `20261015035126` e `20261015041540`. Os hashes dos três arquivos locais correspondentes estão em `installedSubset` do manifesto. Não houve reconferência remota nesta rodada.

O snapshot remoto mais recente consultado como evidência nesta revisão, [mcp-26-r26finalSql.json](evidencias/mcp-26-r26finalSql.json), é de `2026-10-15T13:45:44.668458+00:00`: 1.657 produtos, 9.146 observações, 1.494 publicações, **712 cliques** e zero segredos; 29 policies e duas constraints de autoria validadas. Também registra ausência de `active_tenant`, `public_catalog` e papel público naquele momento. Os 685 cliques, 172 shortlinks, 1.657 curadorias, zero edições e 317 grants citados na rodada anterior pertencem a referências anteriores, não foram todos reconfirmados nesse snapshot. Esses números não são assertivas de estado atual. Dados legítimos podem mudar: toda comparação de aplicação deve usar baseline imediatamente anterior da mesma janela e explicar alterações concorrentes.

O site publicado e o código local não foram demonstrados idênticos. O histórico registrou catálogo público funcional e `/convite` 404 na versão publicada. Build e testes locais não identificam o deployment em produção nem os escritores efetivamente executados.

A fixture é reconstrução sintética de metadados e SQL conhecidos, não backup completo. Agora inclui a função legada `seed_product_curation()` e a unicidade/identidade usadas por `affiliate_monitoring_skip`, mas **não instala o trigger legado de seed de curadoria**. O selo de triggers cobre os instalados pela cadeia ensaiada. A semântica integral de triggers, constraints, privilégios e defaults legados do banco real exige inspeção própria: não se deve alterar o banco real para fazê-lo parecer com a fixture. O inventário estrutural das FKs legadas não inventa ações `ON DELETE` que não foram capturadas; as constraints novas/alteradas têm definição e validação seladas.

PostgreSQL nativo 17.6 em localhost comprova SQL e sessões reais nesse motor. PGlite comprova os casos SQL/RLS executados em memória, mas sua sessão administradora não substitui uma autenticação real de `garimpa_app`. Nenhum deles comprova Supabase Auth, Storage, Supavisor, credenciais de marketplace, cron publicado ou comportamento da versão servida pela Vercel.

## Avaliação por unidade

**A — aprovada para ensaio.** Valida inventário inicial de tabelas/policies, a presença de M1 e reparos de autoria, papel privado sem capacidades administrativas e ausência dos objetos novos. Cria papel público restrito, helpers e controle persistido inicialmente falso. O runtime tem somente leitura da singleton por RLS e não pode ativá-la. Mantém as policies e leituras legadas. Não libera a superfície pública incompleta.

**B — aprovada para ensaio.** Reúne a expansão antes da restrição legada e congela as listas de tabelas dos laços históricos. Instala as projeções públicas completas e conserva as 28 policies antigas durante a transição. As 37 tabelas comerciais novas recebem a policy restritiva `rollout_pending`; convite tem barreira no corpo SECURITY DEFINER e EXECUTE revogado do runtime enquanto pendente. Os guardas de backend negam ausência/falso do controle, inclusive revisão humana que escreve tabela legada, entrada da análise de IA e dispatch antes do adapter. A expansão é uma transação única: a prova de falha no fim deve produzir rollback integral, sem meia instalação.

Os três helpers privados de monitoramento são compatibilidade de funcionalidade existente, não ativação comercial nova. Exigem trabalhador e tenant coincidente; retornam agregados de interesse sem identidades individuais, estado mínimo da própria conta e registro idempotente de skip com motivo validado. Não concedem SELECT de favoritos/alertas individuais ao trabalhador nem simulam papel owner. EXECUTE fica apenas para `garimpa_app`, com search_path fixo. `withMonitoringDb` usa GUCs locais e encerra a transação antes de chamadas a marketplace; o CLI bloqueia execução externa para tenant diferente de `local` até existir resolução de credenciais da conta.

**C — aprovada para ensaio.** Antes do primeiro DROP, exige singleton única e falsa, catálogo de policies exato, definições completas/inventário de funções, views canônicas com opções/ACL/owner, segurança/owner/ACL das tabelas, constraints novas/alteradas, inventário estrutural de todas as FKs e triggers ensaiados com estado habilitado. Nega privilégios efetivos de tabela/coluna do papel público, inclusive views/materialized views/foreign tables, parentes de roles inesperados e capacidades administrativas. Verifica SET ROLE efetivo e USAGE de schema. Remove exclusivamente as 28 policies legadas enumeradas e conserva as especializadas, inclusive controles de owner, conta ativa, segredos e reativação de plataforma. O fim exige uma única atualização do controle e confirmação de estado verdadeiro; falha causa rollback de toda C.

`publicProjectionReady` verifica nove assinaturas públicas, SECURITY DEFINER/search_path, ACLs, papel/SET/USAGE e ausência de privilégios privados de relação/coluna. Não invoca mint nem registro de clique como sonda. É seleção de caminho compatível, não certificado geral de integridade do banco; o selo completo é o preflight de C e sua conferência operacional.

## Achados corrigidos e contraprovas do auditor

Os hashes intermediários não recebem aprovação por esta decisão. Na revisão anterior, C `a2281c…` admitiu grant de view privada; C `298839…` admitiu alteração STRICT de `public_offer_rows(text)` e membership sem SET efetivo. As correções passaram a selar relações privadas, opções/definições de views, definição integral/inventário de funções e SET/USAGE. Foram também encontrados e reparados: singleton ausente com UPDATE final zero; falta de selo de RLS/owner/constraints/triggers; membership privada privilegiada; verificador que aceitava combinação intermediária B/C; e incompatibilidade concreta do monitoramento legado após a restrição. Lacunas de UNIQUE/IDENTITY da fixture foram corrigidas sem atribuir os erros sintéticos ao schema de produção.

O auditor executou o verificador local final, que retornou PASS para os três hashes acima, três arquivos instalados preservados, onze originais substituídas, 28 policies legadas e 37 tabelas comerciais novas. Executou também contraprovas independentes em PGlite, com alterações sintéticas revertidas por transação:

| Desvio antes de C | Resultado observado no hash final |
|---|---|
| `product DISABLE ROW LEVEL SECURITY` | `rollout_table_security_mismatch: product` |
| Proprietário de `product` alterado para runtime | `rollout_table_security_mismatch: product` |
| FK composta de `dispatch_attempt` removida | `rollout_constraint_mismatch: dispatch_attempt_job_tenant_fkey` |
| Trigger de imutabilidade de `product` desabilitado | `rollout_trigger_mismatch: trg_prevent_tenant_mutation` |
| Singleton de controle removida | `rollout_gate_must_be_closed` |
| Membership em `postgres` concedida ao runtime | Rejeitada por `runtime_can_enable_rollout`, devido ao privilégio efetivo herdado |
| View privada com SELECT para papel público | `public_runtime_private_privilege` |
| Função pública alterada para STRICT | `rollout_function_mismatch: garimpa.public_offer_rows(text)` |
| Grant de membership pública com SET falso | `missing_public_role_set` |

Depois dos rollbacks dessas alterações, a mesma C íntegra concluiu e `commercial_rollout_ready()` retornou true. A prova de SET ROLE real permanece atribuída ao ensaio nativo, não à identidade administrativa do PGlite.

O auditor executou ainda os serviços reais `loadMonitoringCandidates`, `monitoringScheduleDecision` e `recordMonitoringSkip`, sob `withMonitoringDb`, antes e depois de C. A conta A conservou somente seu produto com dois interesses (um alerta ativo e um favorito); B não apareceu. Tenant divergente foi negado. Conta ativa sem política habilitada resolveu `policy_disabled`; conta suspensa resolveu `account_suspended`; os dois skips foram gravados uma única vez cada. Motivo incompatível foi negado, e interesses da conta suspensa foram negados. A API externa não foi chamada.

A evidência nativa do executor e os checks gerais devem ser lidos em [execucao-27-replacement-native.json](evidencias/execucao-27-replacement-native.json), [execucao-27-final-checks.json](evidencias/execucao-27-final-checks.json) e [execucao-27-web-native.json](evidencias/execucao-27-web-native.json). A execução histórica da cadeia antiga está separada em [execucao-27-legacy-native.json](evidencias/execucao-27-legacy-native.json). Uma falha intermediária de asserção esperou nome de erro de membership diferente do erro seguro efetivamente retornado. O runner grava sempre no mesmo JSON, substituído pelo rerun final: não há cópia integral daquele JSON intermediário. O diagnóstico consta das saídas de ferramentas/conversa e será identificado como nota retrospectiva, sem tratá-la como log original. Os logs originais das falhas de sandbox dos primeiros checks permanecem separados. O resultado final nativo é registrado no adendo de fechamento abaixo.

## Condições para o ensaio autorizado

1. Usar somente banco descartável isolado, motor compatível, dados sintéticos ou cópia expressamente autorizada e credenciais próprias do ensaio. Não apontar scripts para o projeto ativo por variável ambiente herdada. Não criar recurso pago sem autorização correspondente.
2. Verificar bytes/hashes, manifesto selado, digest do catálogo e os três arquivos de `installedSubset`. Executar uma transação por unidade, com `lock_timeout='5s'` e `statement_timeout='45s'`. Não fragmentar B ou C nem ignorar erro do preflight.
3. Medir S0 antes de A, S1 após A, S2 após B e S3 após C: catálogo público, detalhe, destino monetizado, shortlink e clique controlado; autenticação/curadoria/área do comprador; trabalhadores e cron; isolamento A/B/A; revogação/suspensão/reativação; convites/quotas concorrentes; falha/rollback/retomada e recuperação com controle falso.
4. Provar acesso com duas conexões reais do papel runtime sem bypass. `SET ROLE` por administrador, ausência de finding de advisor ou sucesso de build não substituem essa prova.
5. Registrar versão do artefato web e de cada escritor, configuração sem segredos, ambiente, hashes, resultados e limites. Qualquer falha reabre o trecho afetado; não promover por ausência de exceção no SQL.

## Pré-condições adicionais para uma futura decisão sobre produção

O projeto ativo **não está autorizado por este parecer**. A decisão futura requer reconexão autorizada para leitura, baseline atual do projeto exato e ensaio Supabase S0–S3 da candidata exata. Deve identificar o deployment servido, testar a versão candidata com Auth/Storage/Supavisor e demonstrar implantação dos consumidores compatíveis antes de C. Verificar todos os triggers legados reais, inclusive seed de curadoria, e efeitos de execução/constraints sem completar lacunas com suposições da fixture. C deve executar com o proprietário esperado dos objetos; não alterar owners/ACLs para contornar a comparação.

O inventário operacional deve distinguir o cron ativo corrigido dos CLIs manuais ainda não demonstrados compatíveis: `backfill-family.ts`, `curate-initial-catalog.ts`, `seed-house-marketplace-config.ts` e `bootstrap-affiliate-house.ts` conservam caminhos sem o novo contexto. Não declarar todos os escritores locais validados. Antes do corte, definir quais continuam suportados e testar/corrigir esses, ou retirá-los expressamente do procedimento operacional. Isso é condição técnica de implantação, não gate comercial inventado.

Antes da janela, preservar snapshot das policies, grants de tabela/coluna/função/role, owners, RLS/FORCE, constraints, triggers e contagens. Congelar DDL concorrente durante a conferência/corte. As consultas mínimas de identificação e estado são:

```sql
select current_database(), current_user, version();
select version, name from supabase_migrations.schema_migrations order by version;
select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
from pg_roles where rolname in ('garimpa_app','garimpa_public_runtime');
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='garimpa' order by tablename,policyname;
select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       c.relowner::regrole, c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='garimpa' order by c.relname;
select c.relname, k.conname, pg_get_constraintdef(k.oid), k.convalidated
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='garimpa' order by c.relname,k.conname;
select c.relname, t.tgname, pg_get_triggerdef(t.oid), t.tgenabled
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='garimpa' and not t.tgisinternal order by c.relname,t.tgname;
```

Após A e B, conferir `select * from garimpa.rollout_control` como administrador: exatamente `bizuminer-v2,false`; runtime não altera a linha. Após C: exatamente true, somente as policies enumeradas substituídas, especializadas integralmente iguais, dados/grants/objetos conservados conforme efeito autorizado e nenhum órfão. Não executar consultas de escrita pública como probes no banco ativo sem a autorização/caso de teste correspondente.

## Retomada e recuperação

Cada unidade é atômica. Falha por timeout ou preflight exige rollback confirmado, investigação e nova conferência da mesma baseline; não aumentar permissões, omitir guards ou dividir a unidade para fazê-la passar. Após unidade confirmadamente instalada, retomar somente da seguinte com prova de histórico/artefato correspondente; não reaplicar às cegas nem reconciliar histórico por suposição.

Depois de C, a recuperação prevista desativa administrativamente o controle persistido para negar as capacidades comerciais novas, preservando projeções públicas, isolamento e dados. Isso exige procedimento autorizado e verificado no ambiente correspondente. Não recriar policies `using(true)`, não reaplicar M2 e não remover tabelas como rollback operacional. Reverter o deployment para código antigo incompatível também não é recuperação segura: manter um artefato compatível de contingência e os escritores contextualizados.

## Adendo de fechamento dos checks

Conferi a evidência nativa final de `2026-10-15T20:28:00.105Z`: PostgreSQL 17.6 descartável em localhost, **23 verificações e seis aplicações, 29 resultados PASS, sem erro registrado**, com A/B/C nos hashes aprovados acima. Inclui SET ROLE real, duas sessões A/B/A, preservação integral das policies especializadas, concorrência de quota/convite, monitoramento/skip e recuperação com controle falso. O ajuste entre a falha nominal intermediária e esse resultado foi na regex da asserção, sem mudança dos SQLs congelados.

Conferi também o fechamento ampliado em [execucao-27-fechamento-checks.json](evidencias/execucao-27-fechamento-checks.json): **26 comandos com exitCode zero**, incluindo 21 suítes SQL, testes web (379 aprovados), testes persistence (35 aprovados), typecheck de web/persistence e build web. A evidência geral anterior `execucao-27-final-checks.json` mantém os 24 comandos anteriores, igualmente verdes. Esses resultados não substituem o ensaio Supabase nem prova da versão publicada. Os nove desvios e a integração de monitoramento descritos neste parecer foram executados independentemente pelo auditor nos hashes finais indicados.

Fechamento técnico desta rodada: não há pedido de escrita remota ou deploy aprovado neste documento. Estão aprovados os bytes da candidata para o ensaio isolado; permanecem exigidas as condições de baseline real, homologação Supabase, artefato publicado/escritores e futura decisão por ambiente antes de execução no projeto ativo.
