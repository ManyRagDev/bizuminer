# Auditoria técnica independente das migrations BizuMiner V2 — rodada 22

15/10/2026. Auditor separado do executor; inspeção do código, leitura remota administrativa e contraexemplos SQL isolados. **Parecer: NÃO APROVADA a aplicação da cadeia pendente no projeto ativo `spbuwcwmxlycchuwhfir`.** A migration 2 tem quebra de continuidade demonstrada; a 11 permite associação inconsistente de conta e tenant e consequente concessão indevida de membership em um contraexemplo SQL. Há também bloqueio de login, FK de autoria incompatível e vínculo incompleto de tentativa de dispatch.

**Leitura do estado final:** as seções 1–6 preservam o parecer da candidata original por hash. A seção 7 reavalia os reparos locais posteriores: M10/M11 reparadas passam a CONDICIONAL, uma nova migration autoral estreita recebe aprovação técnica independente, e **M2 continua REPROVADA para o rollout ativo**. Nenhum reparo foi aplicado remotamente por este auditor.

Nenhuma migration, deploy, escrita de dados/Storage ou envio externo foi realizado por este auditor. Foram criados somente este parecer, consultas reproduzíveis e evidências locais. O executor foi informado dos achados enquanto a auditoria prosseguia. Reparos locais posteriores precisam de reavaliação por hash; este documento não os aprova automaticamente.

## 1. Escopo, identidade e significado do parecer

Alvo remoto confirmado diretamente pelo MCP: `https://spbuwcwmxlycchuwhfir.supabase.co`, database `postgres`, PostgreSQL **17.6**. É banco ativo compartilhado com outros schemas, com uma conta BizuMiner e dados comerciais históricos; não foi demonstrado staging isolado. Role runtime `garimpa_app`: LOGIN, não superuser e sem BYPASSRLS. A role `garimpa_public_runtime` e `active_tenant` não existem no remoto observado.

Fontes auditadas: as **12 migrations originais da candidata 19 e o complemento de proteção**, identificados na seção 3, `packages/web/lib`, persistência e workers, instruções de `codex-investigador`, `supabase`, `supabase-postgres-best-practices`, relatório 21 e suas evidências. Não foi encontrado `AGENTS.md` aplicável no repositório. HEAD local `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`; árvore com muitas mudanças preexistentes. HEAD não identifica a candidata local nem o deployment publicado.

O parecer é específico para **os hashes listados, estado remoto observado e continuidade do runtime**. APROVADA significa manutenção do objeto já instalado no contexto indicado, ou aprovação estreita explicitamente descrita; CONDICIONAL significa **ainda não liberada para execução**, pois faltam condições verificáveis; REPROVADA significa que existe defeito impeditivo nesta candidata/ordem de aplicação. Não representa autorização de negócio para E3, canal oficial, piloto ou cliente externo.

A rejeição automática anterior da migration 2 continua vigente e independente deste parecer. Uma aprovação técnica futura não a substitui nem autoriza reenviar por CLI, `execute_sql` ou fracionamento. Uma nova avaliação automática exige mudança material e evidências, inclusive staging validado e transição de runtime. A autorização humana original não foi questionada nem reinterpretada como ausente.

## 2. Estado real reconfirmado

O MCP `list_migrations` confirmou somente M1 original, nome `garimpa_account_context_and_membership`, versão remota `20261015034755`, e complemento `garimpa_affiliate_secret_bootstrap_rls`, versão `20261015035126`, dentre os 13 arquivos deste escopo. Os timestamps remotos diferem dos nomes locais: **não reaplicar por timestamp nem executar `db push` sem reconciliação de conteúdo e histórico**.

Leitura remota nova, registrada em [auditoria-22-remote-catalog.json](evidencias/auditoria-22-remote-catalog.json), confirmou:

| Dado | Resultado |
|---|---:|
| Contas | 1 |
| Produtos | 1.657 |
| Observações | 9.146 |
| Publicações legadas | 1.494 |
| Shortlinks | 172 |
| Cliques | 685 |
| Segredos | 0 |
| Policies legadas | 28 preservadas, predominantemente `using(true)` |
| RLS de affiliate_secret | ativo, policy bootstrap específica |
| Grants de tabelas garimpa para anon/authenticated | 0 |
| active_tenant / projeções públicas V2 | ausentes |
| Bucket bizuminer-private | ausente |
| Órfãos na FK atual de reviewer de curadoria | 0 |

As três FKs de autoria/membership adicionadas por M1 estão validadas. **A FK antiga `product_curation_reviewer_tenant_fkey` permanece**, referenciando `(reviewed_by_app_user_id,tenant_id)` → `app_user(id,tenant_id)`. A ausência de órfãos hoje não valida operação de uma pessoa em tenant diferente do seu home.

O MCP não pode `SET ROLE garimpa_app` (42501 registrado na rodada 21). O auditor não tentou ampliar esse privilégio. A evidência [mcp-21-runtime-selects.json](evidencias/mcp-21-runtime-selects.json) usou credencial real da aplicação em transações READ ONLY e demonstrou role real, RLS de segredo ativa e leituras legadas preservadas **no estado parcial atual**. Não prova comportamento após M2.

Os advisors de segurança foram consultados nesta auditoria. Não apresentaram finding específico de garimpa; há findings preexistentes de outros produtos/Auth. Isso não exclui os defeitos reproduzidos abaixo. Referência do mecanismo do advisor: [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter).

Sobre a aplicação publicada, a evidência 21 mostra home com 24 links e `/convite` 404, antes/depois da aplicação parcial. A nova tentativa de leitura web pelo auditor retornou timeout/inacessível, portanto **não foi tratada como novo smoke aprovado**. Não há SHA/deployment comprovado da aplicação ativa. O 403 de escopo do MCP Vercel permanece uma lacuna de identificação; não demonstra que o código local está publicado.

## 3. Parecer por arquivo e hash SHA-256

Diretório de todos os arquivos: `packages/persistence/supabase/migrations/`. Os hashes foram recalculados antes dos reparos do executor e coincidem com o catálogo 21. O ensaio independente instalou a cadeia completa de 13 na fixture PGlite antes desses reparos.

| # | Arquivo | SHA-256 | Parecer para o alvo ativo |
|---|---|---|---|
| 1 | `20261014100000_garimpa_account_context_and_membership.sql` | `3cedb291754bd21a77fec13058ecdc10ec2f550f49b9c71950a7c65245244345` | **APROVADA para manter o estado já aplicado, em conjunto com 13; não reaplicar** |
| 2 | `20261014101000_garimpa_tenant_rls_scoped.sql` | `57e737818e44266dc7e59d6a4b8637cd3d83fba1637a0cc0837df3674c88e8a0` | **REPROVADA para aplicação na ordem/runtime atuais** |
| 3 | `20261014102000_garimpa_price_evidence_canonical.sql` | `5663b934ce2240efcafa8b069e54376f08cc392ec07d87d62d4c4c98deceb2b6` | **CONDICIONAL** |
| 4 | `20261014103000_garimpa_rubric_assessment_shadow.sql` | `fc2ebbd70c0c31f9a416b2026d1a0789aafa908b68031710fec41ba5e7483139` | **CONDICIONAL** |
| 5 | `20261014104000_garimpa_audience_policy_and_opportunity.sql` | `f7891a8b351f3efe3da146e520c1a2a0c2c05afd0a6e8d848c2f34302331341a` | **CONDICIONAL** |
| 6 | `20261014105000_garimpa_commerce_and_campaign_link.sql` | `0ac1aac79763568890d0ea5a6f8785898f338da0d981d3e49aa87e569763e648` | **CONDICIONAL, integrante obrigatório da transição pública** |
| 7 | `20261014106000_garimpa_commercial_financial_ledger.sql` | `64e3695d1defc2dc28b69fa61f3ea2eea71a2d8bffb3f4aac0475079618ed038` | **CONDICIONAL** |
| 8 | `20261014107000_garimpa_click_attribution_and_channels.sql` | `45da44abba0327b4d7c78c39f3f9ba29040f937ff291a6f9aa2961ba27686da9` | **CONDICIONAL, necessária antes da telemetria pública V2** |
| 9 | `20261014108000_garimpa_policy_experiments.sql` | `4dee052305d5d0d10a73e7139de358f2bfc9af54b9de5ae53dec4cb7e12e0f08` | **CONDICIONAL** |
| 10 | `20261014109000_garimpa_dispatch_jobs_outbox.sql` | `85d3074b17fda5814845d3b6dcb40c45b3c56b0bee69167edb6a9cec933a6f25` | **REPROVADA até corrigir vínculo composto da tentativa** |
| 11 | `20261014110000_garimpa_saas_onboarding_entitlements.sql` | `c43ce700b2e986ec4d2339c29c325dc09b32ac4bcf94388aac21bbaee9941c65` | **REPROVADA até reparar a integridade conta/tenant e revalidar convite** |
| 12 | `20261015021300_garimpa_verified_workflows.sql` | `d415601a55c672be654b666c006122aab028fdf3ee0e0ab49d9d4525a629c4f7` | **CONDICIONAL** |
| 13 | `20261015035001_garimpa_affiliate_secret_bootstrap_rls.sql` | `908a2d0c97245d443d86ddb89b187baf1cfdb5e242aef5efb5324842bb7be693` | **APROVADA para manter a proteção já aplicada; não reaplicar** |

### Fundamentação específica

**M1.** Expansão de coluna/tabela/resolvers e alteração localizada de autoria; a execução remota e contagens foram conferidas. Resolvers SECURITY DEFINER têm search_path fixado e EXECUTE revogado de PUBLIC/anon/authenticated; são uma API interna privilegiada confiando no backend, não comprovação SQL autônoma do JWT. A tabela de segredos criada sem RLS tornou o complemento necessário. O conjunto M1+13 mantém o runtime observado. M1 não conclui a autoria transversal: a FK de `product_curation` ainda precisa de reparo aditivo, com membership autorizado. Não editar/reaplicar M1 para simular correção do remoto já instalado.

**M2.** Substitui policies de todas as tabelas tenantizadas, limita linhas pessoais, passa tabelas de membership/config/device a gestão owner, cria triggers de tenant imutável e role pública. É mudança ampla, não aditiva do ponto de vista do runtime. As leituras públicas diretas de HEAD e o fallback local de `db.ts` não definem contexto. As projeções só aparecem em M6; o gravador público de cliques só em M8. A ordem numérica atual contém estados intermediários incompatíveis. Além disso, o callback de login atual usa transação sem contexto. Resultado: **reprovação técnica independente da rejeição automática anterior**. Exige transição expand/contract ou janela controlada explicitamente ensaiada, código identificado, bootstrap corrigido e matriz completa de callers/workers; não apenas execução rápida da cadeia.

**M3.** Cria política versionada com seed draft e `e3Enabled=false`; preserva forma observada da view `curation_queue_facts`, transforma cálculo de evidência e fixa segurança invoker. Instalação da cadeia passou. Condições: view/colunas/grants compatíveis no alvo, medir custo da consulta com distribuição/volume representativos, não promover seed a approved para satisfazer testes, e instalar M12 antes de habilitar qualquer consumidor E3. O estado intermediário M3 não tem a exigência de calibração verificável adicionada em M12. A mudança é semântica para curadoria antiga, mesmo preservando colunas.

**M4.** Cria avaliações/comparações com grants SELECT/INSERT, RLS tenant e checagem de membership na autoria de comparação. A autoria humana de `editorial_assessment` é global, repetindo FK já instalada por M1; não destrói avaliações. Condições: antecessoras compatíveis, fluxo humano/IA com os mesmos produto/tenant/política e nenhum UPDATE/DELETE de fatos. A coluna opcional `editorial_assessment_id` não tem FK composta; o DAL precisa continuar validando correspondência com o produto/tenant, e essa obrigação deve constar da homologação. Contagem atual de avaliações zero não substitui teste negativo.

**M5.** Cria audiência, versões, oportunidade e eventos com FKs tenant e eventos somente SELECT/INSERT. Não popula campanha/público real. Condições: M4 presente, política aprovada por ato real e fluxo do DAL provando revisão/idempotência por conta. `current_version`, `assessment_ref` e `predecessor_id` são referências de aplicação sem FK suficiente para certificar sua semântica; testar consumidores, não presumir pelo schema.

**M6.** Cria kits, revisões, aprovações, publicação/código de 12 caracteres e FKs que relacionam kit/campanha/revisão dentro do tenant; revoga UPDATE/DELETE de revisões/validações/aprovações. Cria projeções públicas privilegiadas estreitas, que filtram conta ativa/publicação web/curadoria/validade e evitam expor DTO privado de configuração. Os grants são exclusivamente da role pública criada em M2. Isso evidencia a dependência cíclica operacional: M2 restringe antes de M6 oferecer o caminho público. Condições: redesenhar/ensaiar a implantação, validar `/`, `/bizu`, OG, shortlinks, `/p`, `/go` com monetização e vigência, assegurar que a detecção `publicProjectionReady` só selecione uma superfície completa (incluindo M8). Não executar `public_mint_short_link` em consultas de preflight: ela escreve.

**M7.** Ledger novo, sem backfill de vendas/comissões, entradas append-only por grants e FKs compostas de origem/predecessor/import. Condições: contagens sem fatos sintéticos no ativo; CSV/artefato privado/M12 e DAL de ajustes/idempotência homologados antes de uso; confirmar house-only/SaaS com papel de plataforma correto. A policy de SaaS usa `app.is_platform_operator` ou tenants `local/house`, enquanto os fluxos de plataforma usam `garimpa.platform_role`: não assumir que um platform_admin de tenant cliente possa registrar receita ali. O DAL atualmente limita essa visão à casa. A FK de atribuição social tem `ON DELETE SET NULL` composto incluindo tenant NOT NULL; operações de exclusão administrativa devem ser explicitamente tratadas como restritas/retentivas ou ter semântica corrigida, sem prometer cascade funcional.

**M8.** Colunas de cliques nullable/default e índices não apagam histórico; escritor público re-resolve dono/link e não aceita tenant externo. Condições: M6 íntegra e telemetria exercitada só com dados sintéticos em staging, mantendo cliques legados sem atribuição fabricada; não chamar `record_public_click` por SELECT para verificar existência. As FKs de clique com `ON DELETE SET NULL` também incluem tenant NOT NULL: a retenção deve evitar apagar a origem ou corrigir ação referencial.

**M9.** Experimento e pares novos, RLS tenant e uniques por unidade/variante; não promove política ao instalar. Condições: M12 antes do uso verificado, pois ela acrescenta metodologia, pares e revoga reescrita dos outputs. Confirmar FK histórica NOT VALID e regras de promoção no DAL, revisão humana real e ausência de ativação por default. M9 isolada ainda concede UPDATE em assignments/evaluations.

**M10.** Jobs têm FKs tenant para publicação/revisão/destino, mas `dispatch_attempt(job_id)` referencia apenas `dispatch_job(id)`. A FK tenant geral acrescentada por M11 só prova que a conta existe; **duas FKs independentes não ligam tentativa e job à mesma conta**. O catálogo da cadeia completa reproduziu exatamente essa lacuna. Reparar com FK `(job_id,tenant_id)` e negativos da role runtime. Mantém também condição de sessões independentes para claim/lease/marker e concorrência do kill switch; PGlite serializado não cobre isso. Nada autoriza ligar canal real.

**M11.** O enum `platform_admin`, lifecycle e rotina de aceite são novas capacidades. A rotina faz lock e valida usuário/auth_id/token/email/expiração, mas não valida que `affiliate_id` e `tenant_id` sejam da mesma conta. Invitation, entitlement, progress e lifecycle têm FKs independentes; a RLS por tenant não corrige a associação. O contraexemplo P1 abaixo concede owner em outra conta na camada SQL. Corrigir FKs compostas, validar consistência/status da conta na rotina e testar falha atômica. `garimpa.platform_role`/`invitation_claim` são GUCs de backend confiável, não claims de JWT verificadas pelo Postgres; manter credencial somente no servidor. O laço final amplia FKs/triggers e adiciona restrição de conta ativa a tabelas anteriores; precisa ensaio sobre schema efetivo, sem tocar outros schemas.

**M12.** Acrescenta governança, calibração, artefatos privados, controles/reservas, metodologia, compatibilidade de avaliações históricas e uma view efetiva que impede E3 sem calibração não sintética compatível. Grants/colunas preservam imutabilidade de fatos, e o default do controle tem kill switch ligado; nenhum controle é criado automaticamente para ligar envio. Condições: antecessoras reparadas, candidato completo nos consumidores, bucket privado real e teste de upload/download/hash/negação cruzada; criação usa storage.buckets e portanto não é escrita restrita ao schema garimpa. Se o bucket existente for público, o script deve falhar e interromper. Não interpretar Storage ausente na fixture como teste de segurança aprovado. Recuperação conserva evidências, reservas e objetos reconciliáveis; não fazer down destrutivo.

**M13.** Complemento estreito e independente após M1, aplicável também ao final da cadeia: RLS só da tabela nova, owner/worker do próprio tenant ativo, sem alterar policies legadas. Remoto vazio, grants públicos ausentes e guard confirmado. Aprovação limita-se a **manter essa proteção**, sem criar segredos nem ampliar o isolamento alegado para outras tabelas. Quando M2 vier a ser autorizada em outro contexto, seu laço substitui a policy bootstrap; verificar equivalência por testes, não presumir pelo nome.

## 4. Contraexemplos independentes e mecanismo causal

Harness e saída: [auditoria-22-probes.mts](evidencias/auditoria-22-probes.mts), [auditoria-22-probes.json](evidencias/auditoria-22-probes.json). Comando: `node --import ./tools/editorial-tests/node_modules/tsx/dist/loader.mjs docs/implementation/evidencias/auditoria-22-probes.mts`. PGlite em memória, fixture observada, dados sintéticos, queries executadas como garimpa_app. Não conecta a banco remoto. Não é ensaio de Auth/Storage/Supavisor/browser. Saída de sucesso do harness significa diagnóstico concluído; os erros e acessos indevidos intencionais são **falhas da candidata**, não testes de aceite verdes.

| Achado | Entrada/resultado | Conclusão |
|---|---|---|
| A22-01 / P1 / M2 | Mesma leitura de produtos sem GUC: M1 retorna 2, após M2 retorna 0; `public_deal_detail` ausente | Janela pública incompatível demonstrada em SQL; a mesma falha no deployment atual é risco fundamentado, pois SHA remoto é desconhecido |
| A22-02 / P1 / M2 | `select app_user where auth_user_id=...` sem contexto retorna vazio; insert do bootstrap sem contexto falha 42501 | `auth-merge.ts` usa exatamente essa forma sem GUC; callback de login não está compatível com M2, inclusive no código local auditado |
| A22-03 / P1 / autoria transversal | user_a tem home A e membership operator válida em B; contexto B/ator A; update product_curation falha 23503 na FK reviewer_tenant | M1 relaxou eventos/assessment, mas o agregado de curadoria continua incompatível. Também revisar joins RLS de app_user em A durante operação B |
| A22-04 / P1 / M11 | Role app no tenant B insere convite tenant B / affiliate A; aceite autenticado B retorna accepted; resolver depois mostra owner em A | Integridade conta/tenant ausente permite escalada na API SQL interna. Não foi demonstrado caminho HTTP equivalente; o DAL atual insere campos corretos, mas a barreira de banco alegada falha |
| A22-05 / P2 / M10 | Após 13 arquivos, dispatch_attempt só tem FK job_id e FK tenant→account separadas | Integridade cruzada do job não é imposta. Confirmado pelo catálogo SQL; nenhum envio executado |

A fixture não replica toda a infraestrutura nem todos os CHECKs do schema; os contraexemplos usam as FKs/grants/policies concretas relevantes, comparadas ao catálogo remoto e às migrations. Isso limita conclusões sobre runtime completo, sem invalidar os mecanismos demonstrados. O achado A22-04 usa somente nomes/IDs sintéticos e não foi tentado em produção.

## 5. Pré-condições exatas e critérios para reavaliação

Consultas prontas e ordenadas em [auditoria-22-precondicoes.sql](evidencias/auditoria-22-precondicoes.sql). P0 pode rodar no estado parcial atual; P1 depende dos objetos instalados **no staging**; P2 é roteiro de leitura com role runtime. Não executar as consultas P1 sobre relações ausentes e mascarar erro como resultado aprovado. O SQL não contém aplicação de migrations nem chamada de funções com escrita.

Antes de qualquer nova recomendação de aplicação:

1. Congelar novos hashes e identificar explicitamente projeto/branch de staging, baseline e artefato de aplicação. A conexão ativa atual não pode ser declarada staging pelo nome. Confirmar M1/M13 já aplicadas por conteúdo, não reaplicação cega. Exportar catálogo/grants/policies/view/funções/constraints e ter recuperação comprovada; contagens não são backup.
2. Corrigir e reexecutar A22-02..05 com casos positivos e negativos, preservando M1 já aplicada e usando reparo aditivo necessário. A migração pendente pode ser corrigida antes da aplicação, mas isso gera novo hash/parecer. A FK de curadoria deve trocar o vínculo home por identidade global e autorização membership correta, sem simplesmente remover a proteção de autoria.
3. Preparar uma transição sem intervalo de tabela privada restrita e projeção pública ausente/incompleta. Provar código antigo+expansão e código novo+expansão, depois código novo+RLS final. O código antigo não volta a ser compatível com a RLS nova por rollback de deployment. Uma transação única de DDL também não corrige consumidores antigos em execução.
4. Identificar deployment ativo e todos os workers externos (captura/monitoramento/extensão/cron/GitHub). Testar a superfície completa de `/`, detalhe/OG, `/go`, shortlink, login callback, comprador, owner/operator A/B e usuário com home diferente da conta. Não usar `/convite` 404 como prova de versão precisa; é evidência de lacuna.
5. Provar A/B/A e rollback com **duas sessões reais independentes**, corrida de convite/última quota/claim/reserva/marker e recuperação. Somente 557 unitários, 17 suítes SQL, typechecks/build ou advisors não substituem essas provas. Se PostgreSQL nativo e staging não estiverem disponíveis, registrar pendente e manter não aprovado.
6. Medir locks/tempo e consulta canônica com volume representativo. Indexes não concorrentes e FKs validadas podem bloquear tabelas ativas; definir orçamento operacional e abortar em bloqueio, sem avançar para outro arquivo sobre estado presumido. Testar interrupção e retomada na versão correta.
7. Provar Storage privado e Auth de verdade em staging com identidades sintéticas, mantendo kill switch ligado e E3/canal/piloto desligados. Migrations de expansão não concedem aprovação comercial.
8. Submeter os novos fatos à revisão automática competente. Este auditor não recomenda outro transporte nem reenvio do mesmo pedido rejeitado para tentar obter aprovação.

Pós-condições por bloco: contagens/baseline preservados salvo novos dados sintéticos conhecidos no staging; FKs instaladas/validadas como previsto; nenhuma policy permissiva antiga sobrevivente; RLS efetiva na role app; zero visibilidade privada sem contexto; contexto correto lê somente a conta esperada; segredos e bucket privados; código público lê a mesma elegibilidade/monetização; histórico dos arquivos exatos e catálogo remoto reconciliados. Não chamar aceite de convite, click recorder ou mint de shortlink por SELECT administrativo para fingir teste sem escrita.

## 6. Recuperação e decisão operacional

**Estado atual:** manter M1+13; não criar segredos como teste, não apertar RLS e não iniciar as demais migrations no banco ativo. A leitura independente reconfirmou a continuidade parcial e os dados preservados. Nenhum achado exige desfazer M1 nem remover o guard de segredos.

**Ensaio futuro:** backup restaurável e catálogo antes do primeiro DDL; ambiente sintético isolado, aplicação identificada, controle de automação desligado. Se uma migration falhar, confirmar rollback real, catálogo e histórico antes de retomar. Esses arquivos não são todos idempotentes (`add constraint`, `create policy`, `create table`); repetir um arquivo sem saber se houve commit pode falhar ou divergir.

**Após expansão:** conservar colunas/tabelas e ledger, desabilitar novas capacidades e restaurar somente código compatível. Não apagar avaliações, reservas, tentativas ou artefatos para voltar contagens. Depois da M2, rollback de código antigo sozinho mantém a quebra; a estratégia precisa de caminho público compatível e recuperação de autenticação já ensaiados. Reabrir `using(true)` indiscriminadamente não é recuperação aceitável de multi-tenant.

**Decisão final desta rodada:** aprovadas exclusivamente a manutenção de M1 e do complemento M13 já aplicados no projeto confirmado. Nenhuma das 11 originais pendentes recebeu aprovação incondicional. M2, M10 e M11 reprovadas pelos motivos concretos acima; as demais permanecem condicionais à reparação da cadeia e à homologação real. A aprovação técnica não foi concedida por conveniência, ausência de advisorfinding, autorização humana genérica ou validade sintática do SQL.

Referências técnicas consultadas: [RLS e combinação de grants/policies](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog atual do Supabase](https://supabase.com/changelog). O endpoint `.md` do changelog não foi aceito pela ferramenta web; a página HTML foi lida, sem mudança relevante encontrada para o mecanismo Postgres examinado. Evidências históricas: [rodada 21](21-APLICACAO-MCP-E-CONFERENCIA.md), [catálogo 21](evidencias/mcp-21-catalogo-migrations.json), [aplicações/rejeição](evidencias/mcp-21-aplicacao.json), [roteiro de homologação 19](19-HOMOLOGACAO-E-RECUPERACAO.md).

## 7. Adendo independente: reavaliação dos reparos locais

Ainda em 15/10/2026, o executor reparou arquivos locais e solicitou nova avaliação. O auditor leu os novos SQLs/consumidores e executou independentemente `auth-merge-flow.test.ts`, `migration-integrity-flow.test.ts` e `public-readiness-flow.test.ts` no runner PGlite. Os comandos passaram, incluindo login sem membership, adoção/replay de anônimo, conflito de dados pessoais, cookie já autenticado alheio, homes diferentes sem cópia, rollback da transação, escopo sem vazamento, quatro negativos de associação conta/tenant, convite de conta suspensa sem consumo, curadoria/autoria válidas e inexistentes, serviços reais de assessment/edição cross-home e revogação. O dispatch foi conferido por catálogo composto; o ensaio não faz envio nem certifica corrida entre sessões.

O novo preflight remoto [auditoria-22-author-repair-preflight.json](evidencias/auditoria-22-author-repair-preflight.json) confirmou novamente o alvo parcial M1+13, somente uma conta, M2 ausente, duas FKs antigas validadas, duas novas ausentes e **zero órfãos globais** tanto em product_curation quanto em editorial_selection. Foi somente SELECT. O catálogo não foi confundido com execução do reparo.

### Novos hashes e decisão

| Arquivo alterado/novo | SHA-256 reavaliado | Parecer atualizado |
|---|---|---|
| `20261014109000_garimpa_dispatch_jobs_outbox.sql` | `89165a429250169ec34f11bd7db62d306fdcb429aacaa70ac6bb9a0e481225ff` | **CONDICIONAL para a cadeia futura**: corrigida FK composta de tentativa/job |
| `20261014110000_garimpa_saas_onboarding_entitlements.sql` | `0c247052eb42a56ac97edf845fda5d548f0c7194d5745d4d51ed2739d9978a7b` | **CONDICIONAL para a cadeia futura**: quatro FKs compostas e aceite validando/SHARE-lockando a conta ativa e coincidente |
| `20261015021300_garimpa_verified_workflows.sql` | `f2566ff5f61b5ad605bb28ae40ed7062e81f773ca3937fe22311730525182038` | **CONDICIONAL**, mantidas condições de M12; UNIQUE de job duplicado foi retirado porque existe em M10 reparada |
| `20261015040727_garimpa_curation_membership_author.sql` | `da4c85fe662e644a7bf663152366eec4f06c9818f39b3ae53953a34779c1dd23` | **APROVADA TECNICAMENTE como reparo estreito independente no estado M1+13 confirmado**; limites abaixo |

Os demais 10 SQLs originais deste escopo continuam nos hashes da seção 3, incluindo M1/M2 intactas. A nova cadeia local tem **14 arquivos**, mas não recebeu aprovação global. A reprovação de M10/M11 pelos hashes antigos é histórica e não se transfere aos bytes reparados; as dependências de rollout/staging continuam abertas.

Código reavaliado: `packages/web/lib/auth-merge.ts`, SHA-256 `85b118c1c887bab41cf5239886c97cd2d4ac8b6278b543f70d530ca4a8e37810`; `packages/web/lib/editorial-selection-db.ts`, `16ca404003de2b9c603e2f778cb2e848ac16c523a9785b5560ffe6a62507eb77`; `packages/web/lib/public-offer-db.ts`, `64ceea3416a9414575e8c0ef88e51142187904a4bba1b6de20ab9bdb4b893cbd`. Manifesto separado: [auditoria-22-reavaliacao.json](evidencias/auditoria-22-reavaliacao.json). Não foram publicados.

O merge agora usa resolver interno de identidade e escopa tenant/ator por fase, com lock transacional por identidade, conserva dados de outro home e não desliga RLS. Assessment/edição consultam membership→conta, sem exigir visibilidade da linha app_user de outro home. A checagem de prontidão pública agora exige as **nove assinaturas** consumidas, incluindo click recorder e mint, somente via catálogo. Resultado independente: após M1 false, após M6 false, após M8 true, perda de stats false e nenhum clique/shortlink criado pela checagem. **Isso corrige seleção prematura da superfície, mas não a janela M2→M8**: o caminho legado continua sem contexto durante essa janela. M2 permanece REPROVADA para o ativo.

### Limite exato da aprovação do novo reparo autoral

A aprovação técnica é somente para `20261015040727_garimpa_curation_membership_author.sql` no hash acima, projeto `spbuwcwmxlycchuwhfir`, schema garimpa, estado M1+13 e FKs confirmadas no preflight. O script adiciona e valida FKs globais de autoria **antes** de remover as duas compostas antigas; não atualiza/exclui dados, não muda grants/policies, não modifica produto/tenant nem FKs dos itens de seleção, não cria capacidade pública/Storage e não exige o cutover V2. Os autores atuais continuam válidos. O vínculo passa a permitir uma pessoa global, enquanto autorização de conta continua responsabilidade da transação de aplicação e das policies correspondentes.

Para executar esse reparo de forma independente, reconfirmar hash/alvo/histórico imediatamente antes, manter zero órfãos e ausência de constraints novas divergentes, preservar o catálogo das duas FKs antigas, aplicar atomicamente em transação com `lock_timeout=5s` e `statement_timeout=45s`. Esses dois limites fazem parte desta aprovação estreita; devem vigorar na transação que executa a migration pelo MCP. Não tentar outro transporte ou retirar o limite se ocorrer timeout. Se qualquer FK não validar ou houver drift, abortar e reavaliar, sem executar drops isolados. Depois, conferir ambas as FKs novas validadas e antigas ausentes, contagens/policies/grants inalterados e leitura runtime/pública preservada. Se não houver commit, confirmar rollback; se o novo vínculo já tiver recebido dados cross-home no futuro, não tentar restaurar a FK antiga sem verificar esses registros. Preferir conservar a expansão compatível e impedir a funcionalidade defeituosa no código.

Esta aprovação estreita não autoriza aplicar M2, reaplicar M1/M13, antecipar outras migrations, publicar código, criar/aceitar convite real, abrir canal, E3 ou piloto; tampouco substitui a revisão automática de segurança. O auditor não aplicou o reparo. **A cadeia V2 pendente continua NÃO APROVADA para o banco ativo**, aguardando ambiente isolado, transição/publicação identificada e provas de runtime/concorrência/recuperação das seções anteriores.

O harness original `auditoria-22-probes.mts` passou a verificar os hashes do catálogo 21 e recusar execução sobre a candidata alterada, preservando a evidência histórica em vez de sobrescrevê-la com resultados dos reparos. As consultas P1 do roteiro foram compiladas/executadas na fixture atual: 14 consultas passaram; somente a consulta Storage encontrou a ausência esperada do schema Supabase na fixture, sem ser chamada de aprovada. Registro: [auditoria-22-verificar-selects.json](evidencias/auditoria-22-verificar-selects.json). O teste adicional [auditoria-22-editorial-cross-home.json](evidencias/auditoria-22-editorial-cross-home.json) documenta por que o join antigo ocultava o membro, mesmo com resolver e FK já reparados; os serviços atualizados foram verificados separadamente.

## 8. Adendo independente: conferência após aplicação do reparo autoral

15/10/2026. Após o executor informar a aplicação pelo MCP com `lock_timeout=5s` e `statement_timeout=45s`, o auditor reconfirmou o projeto `https://spbuwcwmxlycchuwhfir.supabase.co` e consultou diretamente catálogo e histórico, somente por leitura. O histórico confirmou `garimpa_curation_membership_author`, versão **`20261015041540`**; entre as versões desde 14/10, existem somente M1, proteção de segredos e esse complemento. O arquivo local mantém o SHA-256 aprovado `da4c85fe662e644a7bf663152366eec4f06c9818f39b3ae53953a34779c1dd23`.

As FKs `product_curation_reviewer_user_fkey` e `editorial_selection_actor_user_fkey` estão **validadas**, referenciando globalmente `garimpa.app_user(id)` com ON DELETE RESTRICT. As duas FKs antigas compostas de autoria estão ausentes; as outras três FKs dessas tabelas permanecem iguais ao baseline. Autores órfãos globais: **zero em ambas**. Comparação estrutural exata dos JSONs com [mcp-23-author-baseline.json](evidencias/mcp-23-author-baseline.json): **29 policies e 317 grants integralmente iguais**, além de todas as contagens e indicadores do bloco baseline. Permanecem 1.657 produtos, 9.146 observações, 1.494 publicações, 685 cliques, 172 shortlinks, 1.657 linhas de curadoria e zero edições. Essa comparação certifica contagens/catalogação, não identidade byte a byte de todo conteúdo comercial.

**Pós-condições do reparo estreito aprovadas. M2 continua ausente:** sem registro no histórico, sem `active_tenant` e sem role pública V2; a RLS de segredos continua ativa. Evidências independentes: [SELECT e catálogo após aplicação](evidencias/auditoria-22-author-after-independent.json), [comparação com baseline](evidencias/auditoria-22-author-after-comparison.json) e [histórico consultado diretamente](evidencias/auditoria-22-author-after-history.json). O auditor não efetuou escrita remota. Os registros do executor de [runtime READ ONLY](evidencias/mcp-23-runtime-selects.json) e [smoke público](evidencias/mcp-23-public-smoke.json) complementam a continuidade: role real, leitura da casa/guard de segredos e mesmos 24 links/título, sem atestar o deployment da candidata local.

O [registro final de testes 23](evidencias/execucao-23-verificacao-final.json) foi inspecionado: 21 suítes SQL isoladas, 379 testes web no rerun sem credenciais, typecheck e build aprovados; a falha inicial de sandbox e sua repetição estão preservadas. Esses resultados não substituem as pendências de ambiente isolado, código publicado identificado, sessões independentes, Auth/Storage e transição/recuperação descritas no [relatório 23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md). **O parecer sobre a cadeia completa permanece: NÃO APROVADA para aplicação no banco ativo; M2 não recebeu nova aprovação.**

## 9. Parecer final da cadeia atual após a prova nativa 26

15/10/2026. **Decisão técnica: IMPEDIMENTO à aplicação da cadeia atual no projeto ativo `spbuwcwmxlycchuwhfir`; a condição humana de segurança técnica continua não satisfeita.** Não há candidata substituta de expansão/corte final materializada para aprovar, e a entrega 2 do plano 24 não está concluída. M2 mantém SHA-256 `57e737818e44266dc7e59d6a4b8637cd3d83fba1637a0cc0837df3674c88e8a0` e continua REPROVADA tanto na posição inicial quanto como substituição genérica tardia de policies. A autorização humana para prosseguir está reconhecida; a ausência de autorização não é o motivo do impedimento.

O auditor revisou, sem modificar código ou executar escrita remota, `native-postgres-fixture.ts`, `native-migration-flow.test.ts`, `observed-baseline.ts` e [execucao-26-native-postgres.json](evidencias/execucao-26-native-postgres.json). Os 14 hashes SQL registrados coincidem com os arquivos atuais; há dez verificações PASS e nenhum erro gravado. A fixture cria servidor descartável próprio, fixa clientes em `127.0.0.1`/porta local, não aceita DATABASE_URL como alvo e injeta dois clientes reais nos serviços de aplicação. A baseline compartilhada continua sendo reconstrução sintética do catálogo observado, sem restaurar dados de produção. O auditor inspecionou os resultados gravados; não repetiu o ensaio nativo nesta conferência.

A evidência supera a limitação de sessão única do PGlite **nos casos exercitados**: PostgreSQL 17.6 nativo, backends distintos sem superuser/BYPASSRLS para o runtime, contexto A/B/A e rollback, disputa da última quota pelo serviço real, aceite simultâneo de convite e timeout com rollback integral. O resultado também confirma os impeditivos: M2 inicial deixa a leitura legada vazia antes das projeções; M2 tardia remove `owner_write`, admite INSERT de operador em `governance_decision` e bloqueia reativação de conta pela plataforma. A contraprova tardia roda em transação sintética revertida, com policies restauradas e sem persistir o fato indevido. Esses PASS diagnosticam os defeitos da cadeia; não são aceite dela para produção. As [21 suítes SQL repetidas após a extração da baseline](evidencias/execucao-26-checks.json) continuam sendo verificação local, sem corrigir essa sequência.

Não foram comprovados staging Supabase, Auth/Storage/Supavisor, versão publicada e inventário de escritores, nem a transição/recuperação S0–S3 com artefatos compatíveis. A tentativa de branch relatada pelo executor encontrou a dependência de ferramentas de custo indisponíveis; nenhuma ferramenta `get_cost`/`confirm_cost` do Supabase está disponível nesta conferência. Não presumir recurso criado, homologação realizada ou liberação de custo. Uma nova leitura independente do MCP confirmou o mesmo projeto e somente M1, proteção de segredos e reparo autoral no histórico desde 14/10; M2 permanece sem aplicação.

Continuam válidas a aprovação/manutenção dos três objetos já aplicados e as pós-condições da seção 8. **Não há nova aprovação de migration, deploy, canal, E3 ou piloto.** O próximo parecer depende da candidata revisada por hashes, manifesto fechado, controles de novas escritas e provas correspondentes dos planos 24/25. Esta decisão técnica não substitui nem contorna a rejeição automática anterior da M2.
