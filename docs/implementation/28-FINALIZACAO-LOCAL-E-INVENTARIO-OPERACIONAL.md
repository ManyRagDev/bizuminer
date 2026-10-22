# 28 — Finalização local e inventário operacional

15/10/2026. **Os reparos locais de compatibilidade desta rodada foram implementados e verificados. A homologação Supabase e a implantação em produção permanecem impedidas pelos acessos e pelas condições operacionais abaixo.** Nenhuma migration remota, publicação, job externo, convite ou alteração de secret foi executado nesta rodada.

Este documento atualiza a [rodada27](27-MIGRATIONS-SUBSTITUTAS-E-VERIFICACAO.md), preservando o [plano24](24-CAMINHO-SEGURO-PARA-CONCLUSAO.md) e a [aderência25](25-ADERENCIA-AO-PLANO-ORIGINAL.md). A operação própria e o SaaS continuam permanentes e usam os mesmos contratos/motor. O parecer atual está em [auditoria independente28](28-AUDITORIA-INDEPENDENTE-FINALIZACAO.md); um PASS local não homologa o ambiente publicado.

## Reparos concluídos

1. **Backfill de famílias por conta.** `catalog-maintenance.ts` usa transação com contexto de trabalhador, tenant explícito e conta ativa. A prévia não escreve; `--apply` só classifica produtos ainda sem família daquele tenant, de forma idempotente. Não altera aprovação editorial.
2. **Bootstrap/configuração da casa como manutenção administrativa.** Exigem `BIZUMINER_MAINTENANCE_DATABASE_URL` explícita, sem fallback para `DATABASE_URL`; recusam o papel normal da aplicação. São prévias por padrão, com escrita somente por `--apply`. Bootstrap exige `ADMIN_EMAIL` explícito, uma identidade global autenticada e role afiliado ativa; conserva o home tenant e rejeita vínculo revogado/operator conflitante. Conta/identidade/vínculo são conferidos em transação; não se inventa owner por GUC. Configuração não imprime tracking/tool e sempre remove a validação anterior ao trocar os valores.
3. **Retirada das rotinas legadas inseguras.** `curate-initial-catalog.ts`, `purge-catalog.ts`, `cleanup-lifecycle.ts` e `verify-tenant-isolation.ts` abortam antes de qualquer conexão/ação. O corpo histórico foi conservado como referência, mas esses comandos não integram o procedimento V2. As limpezas pressupunham visibilidade integral de favoritos/alertas e poderiam tomar dados ocultos por inexistentes; o teste de isolamento criava/apagava tenants fixos em `DATABASE_URL`. Não foram convertidos em trabalhadores com visibilidade parcial. Para isolamento usam-se as suítes descartáveis; uma nova limpeza exige desenho que conserve todas as referências comerciais e de compradores, inclusive alertas inativos.
4. **Captura/importação sob RLS.** `BrowserCaptureStore` passa a usar uma transação única para contexto e revalidação de conta, role, membership e dispositivo não revogados antes de ler/escrever. Dispositivo continua identificado como dispositivo; não vira humano/owner. A captura manual exige o contexto humano real e recebe o tenant selecionado da rota. Leituras/status da contingência também recebem esse tenant.
5. **Pareamento e gestão de dispositivos.** Criação, listagem, renomeação, revogação e métricas usam contexto de proprietário real, revalidado no banco. O código não escolhe outra conta por ordenação de memberships. A troca de código sem sessão e a marcação de uso do dispositivo usam as duas fronteiras SQL restritas descritas abaixo, sem abrir as tabelas privadas nem atribuir owner ao dispositivo.
6. **Contexto sem autoridade herdada.** Transações normais limpam `platform_role`; os caminhos sem contexto humano limpam também papéis/identidades que poderiam vir da sessão. A área do comprador define sua identidade mesmo quando vazia. A elevação explícita posterior dos fluxos de plataforma autorizados é preservada. A ingestão transmite seu tenant ao finalizar uma rodagem, evitando fallback inadvertido à casa.
7. **Limite explícito dos coletores com credenciais globais.** O dispatcher exige tenant; a rota de captura automática nega contas externas antes de criar lote/disparar job enquanto não houver resolução validada de credenciais da conta. Isso evita job silenciosamente preso e uso de credenciais da casa em outro tenant. Não muda a arquitetura do motor nem libera automação SaaS sem suas pré-condições. Captura manual por conta e isolamento seguem disponíveis pelos serviços testados.

## Candidata SQL revisada

A revisão encontrou regressões implementáveis, portanto **B/C foram revisadas e recebem novos hashes**. O parecer27 não é atribuído aos bytes novos. Os SQLs, manifesto e catálogo exatos aprovados na rodada27 foram copiados para [rollout-27-aprovado](evidencias/rollout-27-aprovado/). Os quatorze arquivos históricos de migrations V2 permanecem inalterados.

| Unidade atual em `packages/persistence/supabase/rollouts/v2/` | SHA-256 |
|---|---|
| `20261015194719_garimpa_v2_foundation.sql` | `579fa86e8696d7bfcee701ed61e6c8b43b9538dfafa93f146883633bd3682c57` |
| `20261015194748_garimpa_v2_expansion.sql` | `576784e3157c080051e1b23fa52c517530b93618b7ebe98adb2f2bb6931d2664` |
| `20261015194759_garimpa_v2_scoped_cutover.sql` | `bb7fec9f4fc8c73c8bb9762d30824e589af7da093b102791b68edb2787cd2f37` |

A ordem continua A → B → aplicação/escritores compatíveis → C, com uma transação por unidade e limites 5s/45s. O [manifesto](../../packages/persistence/supabase/rollouts/v2/manifest.json) está selado e mantém `productionApproved=false`. Lista 58 fontes de compatibilidade, incluindo guardas comerciais da rodada27 e workflows. Isso identifica fontes locais; não substitui identificação de deployment, commit executado ou configurações do ambiente.

B acrescenta `exchange_extension_pairing(text,text,text)` e `touch_extension_device(text)`. Ambas usam SECURITY DEFINER com caminho fixo e EXECUTE só para `garimpa_app`; anon/authenticated/papel público não recebem acesso. A primeira aceita somente hashes/prefixo válidos, bloqueia o dispositivo e confere autoridade owner ativa, prazo e código não consumido; a atualização é condicional e não reativa dispositivo revogado. Retorna somente ID/nome público, nunca o token. O token bruto é gerado no servidor e entregue somente depois do commit. A segunda só altera `last_used_at` do dispositivo que corresponde ao contexto device/usuário/tenant e à autoridade ativa; não concede UPDATE genérico.

B e C exigem a unicidade preexistente de `token_hash` e `pairing_code_hash`, oriunda da migration original da extensão. Não criam índices em produção para mascarar divergência. O baseline reconstruído foi complementado com essas constraints conhecidas, e C foi novamente selada contra o catálogo capturado em PostgreSQL17.6. Não se deve executar os arquivos históricos ou usar `db push` indiscriminadamente.

O código novo de troca de pareamento/marcação de uso depende de B; a publicação compatível ocorre após a expansão, antes de C. Não publicar esse pacote sobre o banco anterior à expansão. A antiga M2 não foi reenviada, aplicada ou aprovada por outro transporte.

## Verificações finais

| Verificação | Resultado e evidência |
|---|---|
| Cadeia A/B/C em PostgreSQL17.6, duas conexões reais sem bypass | 26 verificações e seis aplicações locais PASS; [resultado](evidencias/execucao-28-replacement-native.json) |
| Serviços operacionais reais, mesma cadeia e trigger legado de seed | 21 verificações PASS; [resultado](evidencias/execucao-28-operational-native.json) |
| Fechamento geral | 26 comandos com exit zero: 21 suítes SQL, 379 testes web, 36 de persistência, typechecks web/persistência e build; [resultado](evidencias/execucao-28-final-checks.json) |
| Integridade local de manifesto/fontes/catálogo/envelopes | Verificador somente leitura; [resultado](evidencias/execucao-28-rollout-verify.json) |
| Revisão independente | Contraprovas SQL e serviços sob runtime, por hashes atuais; [parecer28](28-AUDITORIA-INDEPENDENTE-FINALIZACAO.md) |

As provas incluem: falha/rollback/retomada; policies especializadas; projeção pública e monetização; A/B/A; privilégio herdado limpo; drift de permissões/funções/RLS/FKs/triggers/uniques; concorrência de quota, convite e pareamento; preview e escrita de manutenção; identidade global com home diferente; revogação de role/membership/dispositivo/conta; importação e retry idempotentes; curadoria pendente pelo trigger legado; não divulgação de credenciais em erro.

O trigger legado foi instalado no ensaio adicional a partir do SQL original, e serviços reais de captura o exercitaram sob `garimpa_app`. Isso fecha aquela lacuna local específica; não comprova que todo o catálogo de produção é igual à fixture. Auth, Storage, Supavisor, browsers/dispositivos reais, volume/locks e recuperação Supabase continuam sem homologação nesta rodada.

As falhas intermediárias são preservadas em `execucao-28-fechamento-*` e `execucao-28-operational-native-intermediario-1.json`: rejeição de pacote temporariamente não selado durante regeneração, ajuste de expectativa para negar usuário não autorizado no pending e caminho de subprocess com espaço codificado. O prefixo `execucao-28-final-*` contém o fechamento geral depois das correções; não se oculta a primeira execução.

## Inventário operacional e procedimento suportado

| Caminho | Estado local / condição de operação |
|---|---|
| Web autenticada: comercial, financeiro, kits, governança, experimentos, onboarding e dispatch | Guardas persistidos e contexto de conta testados; homologar artefato exato com Auth/Storage/pooler antes do corte. Gates comerciais continuam individuais. |
| Público: catálogo, detalhe, saída monetizada, links e cliques | Projeções completas antes de C; provas locais de continuidade e recuperação; conferir URLs reais em staging e depois da implantação. |
| Captura manual, importação de navegador e extensão | Serviços reais corrigidos e ensaiados sob RLS/trigger; pareamento exige B. Testar transporte/sessões/dispositivo reais em staging. |
| `monitor-prices.yml` → `monitor-prices.ts` | Contexto worker/helpers agregados corrigidos; chamadas externas fora da transação. Publicar revisão exata dos workers; execução por credenciais globais permanece limitada à casa. |
| `capture-offers.yml` → `run-capture-batch.ts` → sweeps/triagem | Caminho da casa; nega despacho externo sem resolução de credenciais. Lotes, subprocessos e serviços testados localmente; workflow real precisa existir/apontar para revisão compatível. |
| `run-triage.ts` | Usa IA e escreve avaliações; não executar como diagnóstico sem efeitos. Verificar fornecedor/configuração/gates no ensaio autorizado. |
| `run-dispatch.mts` | Guarda comercial antes do adapter; não executar envio real como verificação. Requer canal autorizado e artefato compatível. |
| `reconcile-capture-batches.ts` | Prévia por padrão; `--execute` altera lotes expirados. Usar somente no contexto/tenant suportado e janela autorizada. |
| `backfill-family.ts` | Suportado por conta ativa, prévia padrão, escrita `--apply`; aprovado nos estados S0/A/B/C locais. |
| `bootstrap-affiliate-house.ts`, `seed-house-marketplace-config.ts` | Manutenção administrativa explícita, prévia padrão; não usar o segredo `DATABASE_URL` do runtime para esses comandos. |
| Curadoria inicial histórica, purga, lifecycle e `verify:tenant-isolation` antigos | Retirados do procedimento V2, bloqueados antes de conexão. Fonte histórica preservada; não usar como checklist do ativo. |
| Demais `verify:*` e `inspect-triage-*` | Diagnósticos legados têm pressupostos próprios e podem produzir zeros sem contexto sob C. Não são prova de isolamento nem homologação. O diagnóstico remoto de compatibilidade é read-only e não substitui login real. |
| `probe-monitoring-endpoints.ts` | Consulta banco e chama APIs; não é simples SELECT/diagnóstico sem rede. |
| `configure-monitoring-github.ts` | Altera secrets/vars via GitHub; não foi executado e não faz parte desta conferência. |

O inventário é de caminhos inspecionados no repositório. Não afirma inexistência de processos externos desconhecidos. Antes de C, confrontá-lo com o deployment, cron e workflows realmente habilitados.

## Proveniência e acessos

A leitura do GitHub confirmou execuções bem-sucedidas do cron no SHA `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, que também é o HEAD local. **A árvore local contém alterações posteriores a esse commit**; HEAD igual não significa que os reparos estão publicados. A [comparação de arquivos e workflows](evidencias/execucao-28-proveniencia-github.json) registra disponibilidade e hashes dos caminhos operacionais selecionados. Não houve push nem dispatch de workflow. A publicação precisa fixar um commit/ref compatível; `GITHUB_CAPTURE_REF`/branch do cron não podem continuar implicitamente numa revisão anterior ao corte.

O [registro de acessos](evidencias/execucao-28-acessos.json) confirma:

- Supabase está configurado para `spbuwcwmxlycchuwhfir`, mas **zero ferramentas MCP Supabase** estão disponíveis nesta sessão. Não foi lido/aplicado SQL remoto por transporte alternativo. A leitura26 continua histórica.
- A Vercel respondeu **403 forbidden** para o projeto vinculado `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`, equipe `team_CdqNeIvhoe03YClNYUpP6C1w` / `emanuels-projects-aa92a126`. A consulta sem escopo também não revelou o projeto. CLI/credenciais próprias de Vercel não estão disponíveis.
- Staging Supabase não foi identificado/criado, e Auth/Storage/Supavisor/backup-restauração não foram ensaiados. Não houve criação de recurso pago.

Esses são impedimentos externos de acesso/ambiente, distintos das regressões locais efetivamente corrigidas. A autorização humana persiste condicionada ao parecer técnico. O usuário foi avisado e recebeu solicitação de disponibilização de acesso/ID de staging, sem pedido para colar credenciais.

## O que falta para encerrar a implantação

1. Disponibilizar o MCP e o acesso ao projeto/equipe Vercel corretos; identificar staging isolado, sem presumir que o projeto ativo é staging.
2. Reconferir histórico, catálogo, triggers/índices reais, roles/grants e baseline imediatamente anterior; verificar backups e restauração autorizada. Uma diferença abre análise, não flexibilização do preflight.
3. Fixar/publicar em staging a candidata e os escritores por commit/ref/hashes verificáveis. Ensaiar A/B com controle falso, aplicação compatível e C, incluindo Auth/Storage/pooler, operação existente e recuperação. Novos serviços de pareamento exigem B antes da publicação.
4. Obter decisão independente para produção sobre os bytes/ambiente/resultados exatos e cumprir a revisão automática aplicável. O parecer de ensaio não satisfaz essa condição sozinho.
5. Promover A/B → consumidores compatíveis → C, conferir por SELECTs catálogo/contagens/órfãos/permissões e exercitar a operação autorizada. Registrar cada versão remota e pós-condição.

As capacidades de automação multicliente com credenciais específicas continuam condicionadas à resolução validada por conta; o dispatcher agora explicita essa condição, sem fallback para a casa. Os gates E3/rubrica/financeiro/direitos/canal/piloto do blueprint não foram preenchidos artificialmente. Nenhuma dessas limitações deve ser apresentada como implementação integralmente publicada ou SaaS liberado.
