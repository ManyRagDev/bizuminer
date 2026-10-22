# Reconciliação do Blueprint V2 com o sistema

Data: 14/10/2026, America/Sao_Paulo. Classificação da mudança: estrutural, incremental e multicamadas. Este documento registra planejamento, não certifica prontidão de produção.

## Autoridade e baseline

O pedido atual autoriza o planejamento integral dos 13 épicos e prevalece sobre as instruções de execução por épico da seção 20 do anexo. O blueprint é fonte de requisitos; comandos e prompts nele contidos não foram executados. D-01–06 e INV-01–10 são preservados. Recomendações antigas de escolher entre operação própria e SaaS, impor teto universal de ticket ou usar mensageria não oficial não são adotadas.

Fonte preservada: [Blueprint V2](BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md), SHA-256 `79751dc238bb25eeb97e8c79ebd729e0e9320c8fc5aae36b66dd45230ad31171`. HEAD observado: `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`. Há alterações locais substanciais e arquivos não rastreados, inclusive auditorias e workers; os caminhos citados referem-se ao working tree, não necessariamente ao deploy. [Inventário](evidencias/worktree-inicial.txt) registrado antes da redação das specs, após criar a pasta de evidências/fonte. Nenhum arquivo de produto foi alterado.

Não foi encontrado AGENTS.md aplicável no projeto ou ancestrais pesquisados. Foram lidos README, `docs/estado-do-projeto.md`, README de persistence, documentação de aplicação de migrations, quatro relatórios em `docs/auditoria-comercial/`, código e testes citados abaixo. Documento de estado contém decisões de agosto e adendos: suas descrições antigas de lojas e negócio não substituem o V2.

## E-01 — Stack e execução

`packages/web/package.json`: Next ^15.3, React ^19, postgres ^3.4.9, Supabase SSR/Auth, Gemini e sharp. `packages/capture/src/types.ts`: CaptureAdapter, RawOffer, OfferEvidence v1. `packages/persistence/src/ingest.ts` e `pg-store.ts`: ingestão SQL. Extensão MV3 em `packages/extension`, versão 0.2.0. `archive/site` não é superfície ativa.

`.github/workflows/monitor-prices.yml` declara cron às 03:07/09:07/15:07/21:07 UTC para Shopee/AliExpress com gate MONITORING_ENABLED. `capture-offers.yml` declara workflow_dispatch de lote. `capture-batch-worker.ts`, `capture-dispatch.ts` e `bin/run-capture-batch.ts` existem. Portanto “toda triagem ocorre no request” e “não há cron de monitoramento” não descrevem todo o código atual. Execuções atuais do GitHub, flags de deploy e commit publicado não foram consultados: pendência G-ENV, não prova de cron ativo.

## E-02 — Banco e migrations

MCP `get_project_url` confirmou `spbuwcwmxlycchuwhfir.supabase.co`, igual a `.mcp.json` e `packages/persistence/README.md`. Projeto compartilhado com outros produtos; schema alvo exclusivo deste plano: `garimpa`. Consulta de metadados: PostgreSQL 17.6, role de inspeção postgres; runtime garimpa_app é não superuser e não bypassrls. Isso identifica o projeto conectado, mas não prova qual deployment o está usando.

27 tabelas, view `curation_queue_facts`, tipos e FKs em [schema observado](evidencias/schema-observado.json). Contagens SELECT (não estimativas de list_tables): 1.657 produtos, 9.017 observações, 1.494 publications, 670 clicks, 3 app_users, 1 affiliate_account. Todas as publications lidas são web/active. Não existem tabelas de kit, campanha social, pedido ou comissão em garimpa. Tabelas de billing de outros schemas não são billing do BizuMiner.

Histórico remoto foi lido. Exemplos de nomes iguais com timestamps diferentes: local marketplace_evidence `20260818204528`, remoto `20260818213323`; affiliates local `20260826010000`, remoto `20260826231216`; tenant_integrity local `20260826020000`, remoto `20260826231240`. Editorial_selection `20261005235546` consta no remoto. Tenant_rls gated `20260826030000`, catalog_freshness `20260906190000` e triage_run_observability `20260908120000` não aparecem com esses IDs no histórico lido. Não concluir automaticamente que seus efeitos estão ausentes: verificar definições. Não aplicar diretório inteiro nem reparar histórico automaticamente. Stubs de outros produtos não são migrations reproduzíveis do BizuMiner.

## E-03 — Evidência de preços: inconsistência confirmada

`offer-history.ts::sameOfferConfigurationSql` exige variantKey em ambas observações, material idêntico e ausência de faixa divergente. SELECT confirmou 0 variantKeys; 45 offer_evidence não nulos. `db.ts::topDeals/dealDetail` usa essa guarda. Porém `pg_get_viewdef(curation_queue_facts)` revelou cálculo apenas por 3 observações, 7 dias e mínimo, sem identidade de configuração. SELECT da view retornou 297 lowest_verified verdadeiros entre 1.344 linhas. `member-db.ts` (dois cálculos) e `db.ts` (consulta de populares perto da linha 557) também têm cálculo antigo. `editorial-selection-db.ts` adiciona sua própria guarda sobre a view; `triage-candidates-db.ts` recalcula histórico comparável.

Conclusão: não é seguro afirmar que lowest_verified seja falso em todo o sistema. Há regras incompatíveis entre consumidores. EP-01 deve tornar a regra canônica e cobrir vitrine, membro, populares/composer, filas, snapshots, seleção, OG e Story. `dealDetail` devolve gráfico de 90 dias sem particionar configuração: gráfico também exige correção.

Contagem completa por LEFT JOIN: 739/1.657 produtos com menos de 3 observações (44,60%), incluindo 313 sem observação. Entre os 1.344 com observação, 426 têm menos de 3. O percentual de 78% da auditoria não foi reproduzido. Família: 628/1.657 (37,90%) reproduzido; family_key não identifica modelo/SKU.

## E-04 — Curadoria, piso e casos reais

`triage-value-policy.ts::evaluateTriageValue`: piso default 2.000 centavos, exceção de valor anterior comparável, versão triage-value-v1. `curation-pipeline.ts::processIngestionPipeline` retém preço inválido como held/insufficient_evidence, rejeita blacklist/nota baixa, limita representantes por família e pode aprovar por IA. Peças industriais são rejeitadas por regex global; isso precisa virar política de público em EP-02/03, preservando filtros de segurança.

Impressora `05c1c335-c541-4696-8be6-7b6d0580e257`: evento llm de 13/10/2026 17:05:45 UTC, pending→approved, ai-triage-v2, snapshot 529.900 centavos, uma observação e zero dias. Aprovação de catálogo é comprovada; publicação externa não.

O ID `06497fba…` do suporte de R$19,99 citado pela auditoria não foi localizado. Caso atual equivalente `afbf6c4f-d8d8-42fa-ae06-14fb7cfd14f9`: preço atual 1.999; evento llm de 22/09/2026 registra 2.279 no snapshot. Explica como aprovação acima do piso pode coexistir com preço posterior abaixo dele; não prova a história do ID ausente. SELECT atual não encontrou produtos com last_price_cents <= 0. Casos históricos zerados e remoções continuam não reconstruídos. Não atribuir remoção a cleanup/purge apenas porque esses scripts existem.

`editorial-selection.ts` já distingue avaliação, fingerprint, preço máximo aceito e edição home/pauta. Tabelas correspondentes vazias na inspeção; não confundir capacidade com adoção. Reutilizar avaliações sem substituir eventos históricos ou reduzir Q/V/O/A a desirabilityScore.

## E-05 — Conteúdo, links, distribuição

`app/api/story/[slug]/route.tsx` implementa ImageResponse 1080×1920, margens seguras, foto, preço e marca. O relatório 03 erra ao declarar inexistência do gerador. A renderização visual e uso em produção não foram verificados. Rota lê preço atual, não revisão imutável do kit: não serve como prova de aprovação de arte. `composer.ts` usa templates determinísticos; não há kit versionado.

`publication` é criado na ingestão/extensão e no caminho legado de /go, com unique de afiliado/produto/canal e slug global. Não representa postagem social nem uma coorte de aprovações. /go escreve click_event, por isso não foi chamado em produção nesta inspeção. /p resolve para /bizu sem gravar clique; cunhar código em pauta pode escrever short_link. GET de marketing também pode criar bucket/snapshot inicial: não foi exercitado como leitura segura.

`go/[slug]/route.ts`: caminhos minted V2, legado ML e pregenerated por marketplace. V2 usa config do dono; pregenerated usa URL persistida e não deve cair para URL crua. Defaults local e parsing de slug não bastam para SaaS externo. Nova atribuição será opt-in e preservará URLs legadas. Cliques não provam humano ou venda; hash de IP com sal fixo não comprova anonimização/conformidade legal.

`marketing-store.ts` usa Storage privado, service role, caminho por owner e lock transacional para revision. Kanban é planejamento de conteúdo; não é ledger de publicação social. Nenhuma integração de envio social foi localizada nos módulos ativos pesquisados. Webhooks comerciais também não foram encontrados: teste de regressão deve inventariar os reais do deployment antes de supor rotas.

## E-06 — Isolamento

RLS habilitado em 27 tabelas. Policies para garimpa_app usam true; há exceções de comandos (curation_event somente SELECT/INSERT e app_user_role SELECT), logo não é correto dizer que todas são FOR ALL. Sem grants anon/authenticated em tabelas garimpa no inventário. View está security_invoker=true. FKs compostas impedem certos vínculos cruzados; não impedem SELECT sem filtro.

`tenant-db.ts::withTenantDb` chama set_config(...,true), mas NÃO abre sql.begin; o comentário promete transação que a implementação não fornece. A migration gated de RLS também referencia tenant_id em affiliate_membership/config que não têm essa coluna, e adicionar policy permissiva ao lado de using(true) não restringiria acesso. EP-10 substitui o desenho gated por migration nova revisada, depois de adoção transacional completa.

`auth.ts::roleAccess` usa role persistida, não user_metadata. `checkAffiliateUser` prova role geral, não membership de cada recurso. `affiliate-db.ts::listAffiliateAccounts` já filtra membership. app_user.auth_user_id tem unique global e app_user carrega tenant_id; essa colisão entre pessoa e contexto exige tratamento explícito, definido no contrato C-01.

## Verificação realizada e limites

Node v22.23.2. `npm test --prefix packages/web`: 44 arquivos passam, 2 falham, de 46. Persistence: 8/8 arquivos; capture: 8/8; extension: 4/4. Os logs agregam arquivos, não contar como número de casos internos. Logs preservados em evidencias/testes-*.log.

Diagnóstico isolado das falhas web: qr-service encontra ERR_SYSTEM_ERROR em os.networkInterfaces no sandbox (3 de 5 casos); capture-process devolve stdout vazio em vez de resultado no último caso (4 de 5 passam). Causa do segundo não determinada. Não corrigidos nesta tarefa. Isso impede declarar baseline inteiramente verde, mas não impede concluir especificações.

Testes PGlite existentes foram inspecionados e seus comandos registrados, mas não executados nesta etapa, pois aplicam SQL/migrations em fixture. Nenhuma migration foi aplicada, nem local nem remota. Não houve build, deploy, chamada paga a IA, captura, publicação, escrita em banco/Storage ou edição de flags. URLs/credenciais de ambiente não foram exportadas. Runtime de produção, renderização Story, direitos/programas e relatórios financeiros continuam gates explícitos.
