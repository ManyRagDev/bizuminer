# Contrato de integração Garimpa → Supabase próprio

Conferência local iniciada em 12/11/2026 UTC, com atualizações nas seções posteriores. Este contrato registra implementação, requisitos e evidências da frente Garimpa. **Esta frente local não executou instalação, importação, deploy, troca de DNS ou reativação de rotinas na VPS.** Os registros de não execução e as pendências abaixo correspondem à etapa e à frente identificadas; não são uma declaração de que a infraestrutura continua no estado inicial.

**Autorização da frente de infraestrutura:** em conferência direta do [chat responsável pela VPS](codex://threads/01a1cbe0-c523-7982-9ffc-414213d2e325), foi verificada a mensagem humana “beleza. Execute todos os passos”, no turno `01a1cd93-31e3-7890-bc8a-148187ba2ab4`, posterior ao alinhamento inicial. O [README da infraestrutura, atualização operacional de 12/11](../../../infraestrutura-vps/README.md#atualização-operacional-posterior-12112026) registra o escopo e as condições de sua execução. Essa autorização pertence à frente de infraestrutura e às operações/destinos acordados naquele chat, incluindo ensaios e publicação gradual. O limite da frente local não a revoga nem impõe nova confirmação para passos já autorizados.

Este documento **não concede nem amplia autorização operacional**. A evidência de autorização continua sendo a instrução humana no chat responsável; este esclarecimento não substitui revisão de aprovação nem certifica testes ainda pendentes. Permanecem os critérios técnicos de aceite, a preservação dos dados selecionados e a distinção entre iniciar o web para ensaio e reativar consumidores ou rotinas antigas.

**Estado consolidado em 12/11/2026, após os ensaios comunicados pela infraestrutura:** baseline/deltas/ACLs e dados selecionados já foram aplicados no destino; PostgreSQL 17.11, HTTPS, login/sessão e os oito compartilhamentos passaram nos ensaios registrados no README. O listener BizuMiner está conectado, com uma conta e zero trabalhos ativos/agendados; fontes automáticas e IA continuam desligadas. BM1 e extensão manual passaram em captura/replay/revogação, sem publicação automática. A extensão 0.3.6 corrige a retomada ambígua de rascunhos; posteriormente a infraestrutura comunicou confirmação humana de três importações bem-sucedidas nas lojas testadas. Isso não constitui aceite da API automática Shopee. A configuração de conexões foi separada do gate comercial, conforme seção 22. Publicação durável/pauta têm prova local com SQL real, mas não receberam aceite remoto de lote automático completo. A janela SQL de uma hora incluiu uso/testes e não certifica repouso; janela de 24h, bytes de egress e medição isolada do navegador ainda não estão concluídos.

`migration-selection.json` permanece como manifesto da seleção original: seus estados `not_imported`, `pendingExceptions`, autorização pendente e aceite público pendente não acompanham o avanço operacional do README. Ele define o que preservar/excluir; **não é a fonte do estado de execução atual**. Esta frente não alterou esse arquivo da infraestrutura. As seções históricas abaixo mantêm o contexto de cada ensaio; o quadro atual e as atualizações posteriores prevalecem sobre pendências já superadas.

## 1. Fontes e fronteira da conferência

- [Plano e evidências da implementação](./plano-execucao-capturas-pauta.md), especialmente seção 8.
- [README da infraestrutura](../../../infraestrutura-vps/README.md), incluindo as atualizações da exportação seletiva e dos oito links.
- [Seleção da migração](../../../infraestrutura-vps/migration-selection.json), versão 1, `partial_export_verified_not_imported`.
- Código, migrações, scripts e testes presentes neste checkout. A revisão inicial foi somente leitura, além da documentação; a implementação local posterior do arquivo está na seção 10. Não houve ensaio remoto nem acesso a segredos, dados do snapshot privado ou destinos afiliados.

O ensaio Supabase inicial usava PostgreSQL 17.6 e oito serviços saudáveis: `db`, `auth`, `rest`, `storage`, `imgproxy`, `meta`, `studio`, `api-gw`; o README atual registra atualização para PostgreSQL 17.11. Saúde da stack não certifica o aplicativo. Na conferência inicial, os snapshots estavam exportados e verificados, **não importados**; o arquivo remoto `application-schema.sql` não havia sido inspecionado. A revisão posterior da cópia local do schema está registrada na seção 9; ela não verifica por si só o estado remoto. A execução e os aceites comunicados pela infraestrutura estão no quadro consolidado e nas seções posteriores.

## 2. Pronto localmente e bloqueios de integração

| Capacidade | Estado real |
| --- | --- |
| Capturas duráveis | Implementadas: pedido idempotente, claim/lease por conta, recuperação inicial/reconexão, prazos persistidos, espera por autorização ou reconciliação. Opt-in `CAPTURE_EXECUTOR=durable`. |
| Publicação | Staging privado e publicação SQL atômica do lote após todas as fontes concluírem; falha parcial conserva dados publicados anteriormente. Replay não duplica fatos/revisão. A captura CLI avulsa publica por run, não promete atomicidade entre todos os runs de um plano. |
| Pauta | Cache/versão por conta e canal, composição concorrente protegida, confirmação idempotente e invalidação por mudança relevante. Publicar fatos não equivale a aprovar automaticamente produto ou divulgar oferta. |
| Ociosidade | Removidos intervalos vazios de Pauta/vitrine/telemetria; Hoje consulta a cada 20s somente durante operação ativa. Listener usa NOTIFY e prazos existentes, sem varrer fila vazia saudável. Erro de recuperação/leitura do store agenda retry em 60s; reconexão LISTEN usa backoff próprio do driver. |
| Evidência local | Testes de unidades, build/typechecks, efeitos React com relógio virtual e PostgreSQL descartável 17.6/17.11; jornada com duas contas, dois canais, duas fontes, 40 ofertas, replay, concorrência e falhas. Provedores sintéticos. Baseline/ACLs reais também reproduzidos localmente; detalhes nas seções posteriores. |
| Destino | Infraestrutura informou baseline/deltas/ACLs e dados selecionados aplicados, login/HTTPS funcionando e listener vazio conectado. BM1 e API manual da extensão passaram; captura automática completa e seu controle de gasto/provedor ainda impedem aceite amplo. |
| Oito compartilhamentos | Arquivo público, migration, importador e rotas entregues. Oito registros importados e `/p` → `/bizu` → `/go`, bio e destinos passaram no ensaio HTTP do destino comunicado pela infraestrutura. Não aparecem na pauta nem dependem de curadoria antiga. |
| Medição | Uma hora SQL observada com atividade humana/testes, sem certificação de repouso. Pendentes: janela isolada ociosa de uma hora, 24h controladas concluídas e bytes reais/recursos/custos da jornada completa. |

O preflight existente detecta parte do schema, papel sem superuser/BYPASSRLS, contas ativas e lotes ativos. **Não certifica** ACLs completas, login, Storage, modo de pooler, credenciais dos provedores ou os oito links.

## 3. Schema e ordem de migração

Não aplicar os deltas diretamente a um banco vazio. Não executar toda a pasta histórica por ordem alfabética: o [rollout v2](../../packages/persistence/supabase/rollouts/v2/README.md) exige catálogo compatível, e a fixture `tools/editorial-tests/observed-baseline.ts` é reconstrução sintética para testes, não backup restaurável.

**No destino atual, a infraestrutura já registra essa sequência aplicada.** A ordem abaixo serve para reprodução/reconciliação, não é instrução para reaplicá-la. A correção cliente 0.3.6 não acrescenta migration, grant, variável de servidor ou build web.

Sequência de integração a preparar, com consumidores desligados:

1. Fixar revisão/artefato completo do código e inventariar o destino. Revisar `application-schema.sql` exportado (schemas Garimpa/PostSpark, sem donos/grants), dependências Supabase/Auth, extensões, funções, triggers, owners, RLS e ACLs. Produzir baseline revisável para destino vazio. A ordem exata desse baseline ainda depende dessa inspeção; este documento não certifica um script de bootstrap inexistente.
2. Aplicar o baseline revisado somente na etapa autorizada. Conferir objetos reais, não apenas timestamps do histórico de migrations: há aplicações antigas via SQL Editor e versões remotas diferentes das locais.
3. Reconciliar primeiro a dependência histórica **`20261020002440_garimpa_comparative_evidence_event.sql`**, ausente no dump real conferido. Aplicar a migration inteira em transação, com tabela, sequência, índice, RLS, funções e triggers. Depois comparar as definições do baseline com os deltas abaixo e aplicar **somente os ausentes e compatíveis**, nesta ordem. Se já estiverem incluídos no dump, verificar equivalência e registrar, sem reaplicar indiscriminadamente. A reprodução sobre o dump real está na seção 11.
4. Aplicar depois dos deltas a migration aditiva `20261112023232_shared_link_archive.sql`, com suas ACLs e reserva de namespace. Ela cria o arquivo vazio; não importa o snapshot nem ativa capturas.
5. Importar identidades/configurações reconciliadas e o arquivo dos oito links, em operações separadas, com validação de dependências. Inicializar políticas/configurações novas de forma deliberada. Não importar filas nem ativar schedulers.

| Ordem dos deltas | Arquivo em `packages/persistence/supabase/migrations/` | Dependência principal |
| --- | --- | --- |
| Pré-requisito histórico | `20261020002440_garimpa_comparative_evidence_event.sql` | Produtos com chave composta `(id,tenant_id)`, observações com `offer_evidence` e role `garimpa_app`, presentes no dump. Ausente do snapshot; indispensável antes da pauta. |
| 1 | `20261110192436_marketplace_performance.sql` | Contas, usuários, roles e funções comerciais. Necessário para entregar o painel de resultados junto deste checkout; independente da fila. |
| 2 | `20261111042204_pauta_versioned_selection.sql` | Schema editorial completo: canais, escolhas, exposições, evidências, produtos, capturas e links. |
| 3 | `20261112002243_capture_durable_execution.sql` | `capture_batch` completo; ausência de lotes ativos duplicados por conta. A migration deve falhar diante de duplicidade, não apagar lotes. |
| 4 | `20261112002247_capture_atomic_publication.sql` | Runs/produtos/observações/publicações, roles, `observation_option_key` e unicidade por opção anteriores; deltas de pauta e execução reconciliados. |
| 5 | `20261112023232_shared_link_archive.sql` | Contas preservadas, projeções públicas e reserva de namespace; aplicar antes do importador separado dos oito links. |

DDL usa credencial separada de proprietário/migração, nunca a credencial de runtime. Preservar `SECURITY INVOKER` das RPCs de captura e RLS das preparações. Conferir ACLs efetivas após criação: o histórico possui defaults que concedem CRUD ao runtime, portanto só adicionar `GRANT SELECT` não remove excessos. Não reaplicar A/B/C do rollout sobre um dump já atualizado.

## 4. Dados, identidade e permissões

Preservar UUIDs Auth e identidades de provedores, contas, associação de usuários e configurações de afiliados. Não presumir portabilidade de sessões: ensaiar login novo. A ordem Garimpa observada na seleção é `affiliate_account → app_user → affiliate_membership → affiliate_marketplace_config`; reconciliar também o vínculo de `app_user.auth_user_id` com Auth. Não atribuir registros sem proprietário por suposição.

Lacunas a fechar na seleção:

- **`app_user_role`** não está na lista preservada. O acesso humano exige role `afiliado` ativa, membership válida, conta ativa e Auth associado (`packages/web/lib/account-scope.ts`). Exportar/reconciliar a autorização legítima e revogações explicitamente; não promover todos a administrador nem reativar roles revogadas.
- **Configuração não é credencial.** `affiliate_marketplace_config` não substitui `affiliate_secret`. O código resolve credenciais da própria conta; apenas o tenant `local` admite fallback das variáveis de fonte. A seleção atual não inclui envelopes de segredos. Provisionar credenciais privadas separadamente; se a migração de envelopes for autorizada, manter chave/versão e AAD `tenantId:marketplace:secretId`, ou realizar recifragem controlada. Não copiar `.env` administrativo da stack.
- **Configurações operacionais novas:** schema-only não leva `rollout_control`; sem o singleton, `commercial_rollout_ready()` permanece falso. Reconciliar políticas, acesso ao workspace e canais necessários com configuração mínima deliberada, sem recuperar pauta, curadoria, autorizações financeiras ou automações antigas. A identidade da instalação/executor deve distinguir o destino da origem; não importar estado de execução nem presumir que o listener Garimpa tenha uma variável `installation_id` própria.

Runtime SQL: papel dedicado sem superuser, BYPASSRLS, criação de roles/bancos ou propriedade das tabelas. `USAGE` no schema e privilégios específicos previstos no baseline/migrations para as operações autorizadas; tenant estabelecido por transação e verificação de conta/membership. A allowlist do listener limita sua execução, mas **não é substituto de RLS nem limite criptográfico da credencial SQL**. Testar contas distintas e revogação com a credencial efetiva.

Público: `garimpa_public_runtime` sem LOGIN/herança privilegiada ou leitura direta das tabelas; login web pode executar `SET LOCAL ROLE` para as projeções permitidas. Projeções públicas são funções restritas com `search_path` fixo. Não conceder acesso às preparações/segredos a `anon`, `authenticated` ou runtime público. A fronteira pública do arquivo histórico deverá seguir o mesmo princípio.

Não migrar pauta, capturas, curadoria, filas, leases, seleções/cache ou publicações não compartilhadas. A seleção de dados PostSpark e seus objetos Storage permanece com a infraestrutura: os 47 registros de metadados não representam bytes copiados, e os 46 posts sem proprietário continuam pendentes. Isso não deve ser confundido com validação de Storage do Garimpa. Imagens dos oito produtos têm URL externa preservada, sem cópia dos bytes.

## 5. Exceção: oito links compartilhados

### Diagnóstico que motivou a implementação

O caminho normal de `/p/[code]` chama `public_short_link`, que depende de `public_offer_candidates`; a seleção exige curadoria aprovada, observação positiva, publicação web e conta ativas. A definição de `20261107185200_fix_price_comparability_and_currency_defaults.sql` limita slug explícito a 60 dias e catálogo a 7 dias. `/go` também depende da seleção; `/bizu/[slug]` e sua imagem OG usam `dealDetail`. Logo, importar aliases/publicações/produtos sem curadoria **não mantém os acessos**. A implementação nova consulta o arquivo antes desse caminho e preserva os gates das ofertas atuais.

Os códigos de bio são os três últimos caracteres do alias em maiúsculas (`app/api/pauta/route.ts`, `lib/affiliate-workspace-db.ts`). Antes eram apenas etiquetas. O arquivo agora fornece `/bio/<tenant>/<code>`, sem busca global por sufixo. `/p/BZR` continua sem substituir `/p/4bzr`.

| Alias a preservar | Código de bio |
| --- | --- |
| `4bzr` | `BZR` |
| `4jt3` | `JT3` |
| `ptej` | `TEJ` |
| `zpd7` | `PD7` |
| `bjjj` | `JJJ` |
| `autk` | `UTK` |
| `bnfx` | `NFX` |
| `k7e3` | `7E3` |

O snapshot privado contém 8 aliases, 8 publicações, 8 produtos e 8 últimas evidências; SHA-256 de `data.json.gz`: `41b6a5f602dac20189b7efd8716b436fcc1f7039782a6a9e775ce8219124741d`. Os slugs, IDs e destinos completos devem vir desse snapshot validado, não das descrições do manifesto. Não houve visita aos destinos externos nesta conferência.

### Contrato implementado localmente

O arquivo dedicado `garimpa.shared_link_archive` fica **fora de `product`, `price_observation`, `publication` e curadoria vivas**. O importador transforma o snapshot nessa representação; ele não é um dump relacional pronto para INSERT nas tabelas de produção.

- Conservar alias exato, bioCode, slug original, conta/tenant proprietário, marketplace, título, imagem e destino afiliado original. O importador exige a conta preservada correspondente; as projeções públicas verificam conta ativa e revogação a cada acesso. Uma conta suspensa pode ter seu arquivo preservado sem disponibilizar os links. Guardar estado ativo/revogado, origem/hash do snapshot e data da importação. Identificadores antigos de produto/publicação/observação/captura são proveniência histórica, sem FK a registros excluídos.
- Valores históricos podem ficar privados para rastreabilidade. A página inicial do arquivo deve omitir preços/descontos e mostrar “Compartilhado anteriormente” e “Preço atual não confirmado; consulte a loja”, com CTA explícito. Se futuramente exibir valores, rotulá-los com data e contexto históricos; mínimo/máximo de variações não é preço anterior/promocional. Nunca gerar desconto, “menor preço”, frescor ou `Offer` estruturado a partir deles.
- Resolver os aliases reservados por `/p/<alias> → 302 /bizu/<slug>`; a página detecta o arquivo pelo slug reservado e usa apresentação própria. `/go/<slug>` devolve `302` para o destino preservado após validar conta e revogação, com `Cache-Control: no-store`. A rota normal continua com seus gates de elegibilidade. Metadados e OG do arquivo não reutilizam preview de preço atual.
- Busca de bio em entrada pública **com conta explícita** `/bio/<tenant>/<code>`, normalizando só caixa do código e resolvendo a associação exata. Sem busca global por sufixo; unicidade por conta e tratamento de colisão. O alias original permanece como entrada canônica dos oito links já distribuídos.
- Reservar alias/slug também nos emissores de novos links. Reimportação idêntica é idempotente; colisão de conta, slug ou destino diferente falha para reconciliação, nunca sobrescreve silenciosamente. Conta suspensa ou registro revogado bloqueia página/saída conforme política de indisponibilidade, sem redirecionamento externo.
- Destino somente HTTPS em domínio Shopee validado por hostname exato/sufixo seguro, sem URL fornecida por query string. Não acrescentar parâmetros de campanha/opção recebidos do visitante sem vínculo validado. Leitura não chama API do marketplace, IA, encurtador nem captura.
- Nenhuma inclusão automática em catálogo, pauta, vitrine, ranking, monitoramento ou recomendações. Se no futuro o produto for capturado novamente, passa pela jornada normal; isso não converte automaticamente o arquivo em oferta atual.
- Telemetria normal pode ter FK para `publication`; não criar publicação fictícia para satisfazê-la. Inicialmente dispensar essa escrita no arquivo ou implementar evento próprio, sem polling.

### Referências às capturas excluídas

O README informa que os oito produtos/evidências apontam para capturas antigas ausentes. No schema, `product(last_capture_run_id,tenant_id)` e `price_observation(capture_run_id,tenant_id)` são FKs compostas; `price_observation.extension_device_id` pode depender de dispositivo também excluído. `short_link.slug` é vínculo lógico a conferir mesmo sem FK. Inserir produto normal ainda dispara curadoria `pending`.

Na representação de arquivo implementada, as quatro linhas originais de cada compartilhamento são preservadas literalmente em `provenance`, sem FK aos produtos, publicações, observações, capturas ou dispositivos excluídos. A única FK do arquivo aponta à conta preservada. Nenhuma captura é fabricada, marcada como concluída ou importada para satisfazer integridade. Esses IDs não são usados pelas rotas públicas, pauta ou executor. O importador valida hash/formato, conjunto dos oito aliases, associação, colisões e destino; imprime contagens/hash, **não um inventário de referências antigas saneadas**. Não afirmar que reescreveu IDs em JSON: eles são evidência privada inerte, não dependências do novo catálogo. Caso se adote outra representação, cada FK nullable e referência lógica sem pai terá de ser reconciliado explicitamente; desligar constraints ou copiar `last_capture_run_id` para tabelas vivas não é aceitável.

## 6. Serviços, dependências, comandos e ambiente

Web Next em serviço próprio, executor Node em serviço separado e conexão SQL direta privada. O listener requer sessão persistente dedicada em `db:5432` na rede Docker; pool transacional não serve para LISTEN. A infraestrutura já informa esse listener conectado; a falta da rede era bloqueio da conferência inicial. API interna `http://api-gw:8000`; entrada local de ensaio `http://127.0.0.1:18000`; o README atual registra HTTPS público em `https://www.bizuminer.com.br`. URLs de browser/OAuth precisam ser acessíveis ao navegador, com origem e redirects coerentes; não apontar browser a hostname Docker. Confirmar identidade/chaves do destino sem fallback à origem gerenciada. Realtime, pooler e Edge Functions não são requisitos do novo listener.

Entregar checkout completo de `packages/web`, `packages/persistence` e `packages/capture`, lockfiles e fontes TypeScript; build web isolado não contém necessariamente os scripts irmãos usados pelos subprocessos. Node 22 fixado em versão compatível com `--experimental-strip-types` (pacotes declaram >=22.6), dependências via lockfiles, `postgres`, SDK Supabase e SDK Gemini incluídos nos pacotes. Não é necessário browser headless para esse executor; captura pelo navegador usa a extensão do usuário, com novo login/vínculo no destino quando necessário. Reservar saída de rede somente aos serviços/provedores autorizados no ensaio.

Comandos de preparação previstos, a executar apenas na etapa autorizada, na raiz do checkout:

```sh
npm ci --prefix packages/capture
npm ci --prefix packages/persistence
npm ci --prefix packages/web
npm run typecheck --prefix packages/persistence
npm run typecheck --prefix packages/web
npm run build --prefix packages/web
```

Ambiente deve ser injetado pelo supervisor/arquivo privado fora do repositório, modo 600. Nenhum comando abaixo contém credencial. Variáveis `NEXT_PUBLIC_*` precisam estar corretas no build.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | SQL de trabalho do runtime, banco do destino e role limitada. Em Docker privado sem TLS, explicitar `sslmode=disable`; não transportar essa opção para acesso público. |
| `CAPTURE_EXECUTOR=durable` | Opt-in em web e executor; ausente mantém transporte legado, não representa modo desabilitado. |
| `CAPTURE_LISTEN_DATABASE_URL` | Sessão SQL dedicada persistente, SSL conforme transporte. |
| `CAPTURE_WORKER_TENANTS` | Allowlist explícita separada por vírgulas, sem tenants de outra instalação. |
| `CAPTURE_HEALTH_PORT` | Opcional; health ligado a 127.0.0.1, verificar de dentro do contêiner. |
| `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` | Auth servidor; aceita alternativa `SUPABASE_ANON_KEY`. Nunca service role no browser. |
| `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth/OAuth browser; alternativa `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Usar endpoints/chaves do destino. |
| `NEXT_PUBLIC_SITE_URL` | Origem pública canônica do aplicativo/links; no ensaio apontar para origem de ensaio apropriada. Preservação final dos oito URLs requer manter host/caminhos distribuídos. |
| `AFFILIATE_SECRETS_MASTER_KEY` | Descriptografia de segredos da conta; compatibilidade necessária se envelopes forem migrados. |
| `SHOPEE_CAPTURE_ENABLED`, `ALIEXPRESS_CAPTURE_ENABLED` | Habilitar somente fontes autorizadas na fase de ensaio; manter desligadas nesta junção. |
| `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET` | Fallback privado exclusivo de `local`; demais contas usam segredos próprios. |
| `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` | Mesmo contrato de fallback exclusivo de `local`. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Chave privada da triagem e modelo opcional. Limites/custo devem ser conferidos antes de chamar IA. |
| `NODE_ENV` | `production` no serviço final. Não contornar validação de segredos usando ambiente de desenvolvimento. |
| `AUTH_LOGIN_MODE` | `password` no novo ambiente por decisão do usuário. Ausente/`google` preserva login Google anterior; `both` oferece ambos. Flag server, sem valor secreto. Seção 12. |

O novo transporte não requer `GITHUB_ACTIONS_WRITE_TOKEN`. Não copiar credenciais de dispatch legado para fazê-lo funcionar. Mercado Livre nesta jornada usa captura manual/extensão, não o runner de API Shopee/AliExpress.

Preflight somente leitura, sem executar jobs:

```sh
node --experimental-strip-types packages/web/bin/inspect-capture-runtime.ts
```

Comandos de execução **documentados e não executados por esta frente local**; sua execução na VPS cabe à infraestrutura, dentro da autorização humana e das condições registradas no início deste contrato:

```sh
npm run start --prefix packages/web
node --experimental-strip-types packages/web/bin/listen-capture-batches.ts
```

Web usa porta 3100. O listener chama `run-capture-batch.ts --batch <UUID> --tenant <tenant>`; não rodar esse filho avulso como teste de saúde. Readiness `/health` exige conexão e recuperação inicial de todas as contas, não comprova fonte disponível. O supervisor deve ter backoff, limite de recursos e parada graciosa; filhos têm limites de 12 minutos por captura e 30 por triagem. Lease pode mudar entre fases; não impor corte global de 55 minutos. Dimensionar concorrência por quantidade de contas/filhos, medir CPU/RAM e definir budget antes da ativação. Não importar crons, webhooks ou jobs anteriores. Limpeza `prune_capture_preparations` é explícita e limitada; não criar cron de limpeza implicitamente.

## 7. Ensaio e critérios de aceite

Primeiro validar schema/configuração e dados sem consumidores; depois liberar uma execução controlada separadamente. Não usar preflight nem comandos antigos `verify:*` que carregam `.env.local` como prova automática de segurança para destino: conferir cada script/URI antes de executar.

| Etapa | Procedimento e aceite |
| --- | --- |
| Restauração seletiva | Hashes/contagens conferidos; IDs Auth preservados; contas/configurações e roles reconciliados; zero runs, curadoria, pauta/cache e filas importados. Arquivo contém exatamente 8 registros e repete importação sem alteração. Sem FK ou referência lógica pendurada. |
| Login e isolamento | Login novo, logout, reabertura; usuário só vê a conta permitida. Conta B não lê/altera lote/preparação/pauta de A; revogação/suspensão impede operação. Público não lê tabelas privadas; runtime não altera controles administrativos. Conferir redirects OAuth e objetos/imagens realmente acessíveis. |
| Arquivo público | Abrir os 8 `/p` e seguir só redirecionamentos internos; confirmar título/conta/destino por igualdade ao snapshot, inspecionando `Location` externo sem segui-lo. Testar bio com escopo, caixa, código desconhecido e colisão. Página e OG sem preço atual/discount/Offer histórico. Revogação/suspensão bloqueiam. Query manipulada não troca destino. Nenhum arquivo aparece na pauta/vitrine nem dispara captura/IA. |
| Captura | Duas contas/dois canais, fontes autorizadas, limites de chamadas explícitos. Repetir requestId e sinal sem duplicar lote. Captura preparada fica invisível até publicação; falha de uma fonte conserva versão anterior. Reiniciar somente serviço de ensaio autorizado; recuperar lease/reconexão sem repetir efeito externo incerto. Credencial/quota aguardam decisão; falha transitória/rate limit respeitam prazo persistido. |
| Publicação e pauta | Commit único torna fatos visíveis; replay não cria amostra/revisão extra. Nova seleção só quando fonte/decisão mudar. Aprovação/triagem seguem regras próprias; reabrir pauta conserva seleção e confirmação idempotente. Duas leituras frias simultâneas compõem uma vez; conta/canal isolados. Captura atrasada não sobrescreve fato mais recente. |
| Ociosidade real | Após aquecimento, sem job ativo, prazo pendente, aba mudando de foco ou eventos por enviar, observar Pauta, Hoje e vitrine por 1 hora. Registrar Network do navegador, requisições web e deltas de estatísticas SQL por papel/banco/query. Nenhum polling recorrente de pauta/candidatos/fila vazia; health local não consulta SQL. Isolar refresh Auth, monitoramento da stack, manutenção e atividade PostSpark da medição de aplicação. Não prometer zero queries globais do PostgreSQL. |
| Demanda legítima | Uma mudança relevante dispara atualização; foco retorna verificação versionada com debounce; resposta inalterada compacta sem releitura pesada de candidatos. Prazos de jobs e reconexão podem consultar legitimamente. Ensaio de falha/rede separado da janela ociosa. |
| 24 horas controladas | Medir consultas, bytes reais SQL→servidor, chamadas/bytes de fonte e IA, duração, repetidos/novos/úteis, CPU/RAM, erros e custo por lote. Confrontar limites acordados antes de liberar uso amplo; não extrapolar bytes JSON de fixture como tráfego real. |

Se disponível, usar `pg_stat_statements` por banco/role/query e snapshots inicial/final, sem resetar estatísticas compartilhadas. Se não estiver habilitado, acordar instrumentação equivalente antes do ensaio; sua instalação não está autorizada aqui. Identificar o listener por `application_name=bizuminer-capture-listener`; não registrar SQL com credenciais/destinos pessoais. Evitar que a própria ferramenta de observação introduza consultas atribuídas à aplicação.

Reprodução local já disponível (fixtures descartáveis, não apontar ao destino):

```sh
npm test --prefix packages/persistence
npm test --prefix packages/web
npm run test:egress --prefix tools/editorial-tests
npm run test:capture-batch --prefix tools/editorial-tests
npm run test:capture-facts --prefix tools/editorial-tests
npm run test:pauta-cache-native --prefix tools/editorial-tests
npm run test:capture-publication-native --prefix tools/editorial-tests
npm run test:capture-journey-native --prefix tools/editorial-tests
npm run test:capture-execution-native --prefix tools/editorial-tests
```

Instalar dependências de `tools/editorial-tests` via seu lockfile para reproduzir. Testes nativos requerem binários PostgreSQL e loopback local; `BIZUMINER_TEST_PG_BIN` pode indicar o diretório dos binários. Não certificam importação de Auth/Storage. O registro anterior de execução está na seção 8 do plano; as novas execuções do arquivo público estão na seção 10.

## 8. Responsabilidades e liberação

**Aplicação:** arquivo/resolvedores/importador restrito e testes locais entregues na seção 10; entregar revisão completa com scripts, migrations e evidências; reconciliar baseline com a infraestrutura e conferir o pacote real sem restaurar histórico vivo.

**Infraestrutura:** disponibilizar schema exportado para revisão controlada, preparar roles/rede/endpoints/Auth/Storage e segredos privados; ajustar seleção para permissões humanas legítimas; manter backups verificados e serviços/rotinas desligados até autorização de ensaio. Valores privados não transitam neste documento/chat.

**Junção:** aplicar somente baseline/deltas acordados no destino autorizado, validar identidade/isolamento/links, executar captura limitada e medir ociosidade/24h. Os links arquivados e as medições são critérios de aceite, não pendências que possam ser ignoradas por término dos subagentes. Nenhuma instalação, migração, deploy ou reativação remota foi realizada pela frente local para produzir este contrato. A infraestrutura registra suas próprias execuções no README e no chat responsável, sob a autorização humana conferida acima.

## 9. Revisão da cópia local do schema e configuração mínima (antes da implementação do arquivo)

Revisão adicional em 12/11/2026 UTC a pedido do chat de infraestrutura, que informou autorização do usuário para sua frente de integração. Esta frente permanece em revisão/documentação: não executou SQL remoto, deploy ou restart. O relato de Auth PostSpark `0068` pertence à outra aplicação e não substitui Auth, roles e memberships Garimpa.

### Evidência do baseline local

Foi lida a cópia `../infraestrutura-vps/private/application-schema.sql` (717.238 bytes), SHA-256 `2755297feb6a24506073569f2f10d7dac753c7fb01989d87c397500d3895351e`, igual ao registro da exportação. A inspeção estática confirma:

- Contém schema Garimpa/PostSpark e referências a `auth.users`, mas não cria roles nem inclui `GRANT`, `REVOKE` ou `ALTER DEFAULT PRIVILEGES`. As policies referem-se a roles existentes. Provisionar roles antes e restaurar ACLs deliberadamente depois; funções recém-criadas podem conservar EXECUTE para PUBLIC pelo default se não houver revogação explícita. Não expor API/aplicação entre restore e fechamento das permissões.
- Não contém INSERT/COPY de dados. Portanto, nem o singleton de rollout nem canais/políticas são inicializados pelo dump.
- Ausentes `marketplace_performance`, `pauta_source_version`, `pauta_selection_cache`, `capture_batch_notify`, `capture_prepared_offer` e `publish_capture_batch`. Os quatro deltas da seção 3 são necessários sobre este snapshot, após reconciliação de baseline/permissões. A ausência foi conferida no arquivo; aplicação e testes de compatibilidade integral no destino seguem pendentes.
- `public_short_link` continua usando `public_offer_candidates`. Não existe implementação de arquivo histórico identificada neste checkout nem no schema inspecionado. Nenhuma migration, importador ou rota especial dos oito links foi entregue nesta revisão; **o corte público permanece bloqueado por essa entrega**, mesmo que a stack e o restore terminem.

### Configuração nova sem recuperar histórico

Inicializar só configurações necessárias e auditáveis, com IDs/conta reconciliados. Separar preparação desabilitada de habilitação no ensaio autorizado:

| Objeto | Preparação mínima e condição de uso |
| --- | --- |
| `rollout_control` | Pode permanecer vazio: `commercial_rollout_ready()` retorna false. Singleton `id='bizuminer-v2',enabled=false` é opcional para registrar explicitamente o bloqueio. Não habilitar para destravar login, painel vazio ou arquivo; habilitação comercial é decisão separada (seção 13). |
| `app_user_role` / membership | Vínculo Auth preservado e role `afiliado` legítima, não revogada; membership/conta ativas para usuário autorizado. Não criar administrador por conveniência. |
| `workspace_rollout` | Registro por tenant, desabilitado na preparação. Habilitar somente as contas autorizadas para testar workspace; não é ativação de cron. |
| `account_entitlement` | Se ensaiar criação de materiais/campanhas, estabelecer concessão nova de piloto/interna com `plan_version`, status, início/fim, limites e `terms_ref` acordados. Não copiar saldo, assinatura, consumo ou condições antigas por suposição; não reutilizar números de uma autorização anterior como novos direitos. |
| `recommendation_channel` | Configurar somente canais desejados: `home`, `whatsapp`, `stories`. Nova configuração: `version=1`, `policy_version='recommendation-v1'`, `manual_order=null`, `valid_until=null`, inicialmente `enabled=false`. Preferir o fluxo `configureRecommendationChannel` com owner e controle de versão. Habilitar o canal alvo no ensaio para testar seleção; sem canal habilitado a pauta retorna vazia legitimamente. |
| Política de canal | Defaults reais de `recommendation-policy.ts`: home `{limit:24, repeatHours:0, familyLimit:2, improvementPercent:5}`; whatsapp `{limit:12, repeatHours:72, familyLimit:1, improvementPercent:5}`; stories `{limit:8, repeatHours:72, familyLimit:1, improvementPercent:5}`. São tetos, não metas ou autorização de publicação automática. |
| Público do workspace | Se o fluxo exigir público configurado, criar `audience_policy`, sua versão e `workspace_settings` pelo fluxo de configuração manual. Ele cria política draft/manual com `rubricStatus='not_homologated'`; não importar avaliações ou simular homologação. |
| Automação/editorial | `editorial_discovery_policy` ausente ou desabilitada, `homepage_renewal` ausente ou desabilitada, `editorial_guideline.auto_publish=false`. Não copiar políticas de monitoramento/scheduler, filas, leases, edições, exposições ou ordenação por produtos antigos. Não chamar inicializadores de edição como parte do restore. |

As permissões de controle permanecem administrativas: runtime não deve habilitar `rollout_control`/`workspace_rollout` por GRANT amplo. Configurar canais não cria produtos ou edições. Um catálogo inicialmente vazio é o resultado esperado até captura nova, avaliação e decisões editoriais válidas. Os oito registros de arquivo não podem preencher esse vazio automaticamente.

### Entregas faltantes e concorrência

Faltam para os compartilhamentos: migration/ACLs do arquivo; importador com hash/allowlist/idempotência/proveniência; reserva de aliases/slugs; rotas `/p`, `/bizu`, `/go`, OG histórico e busca de bio com conta; revogação; testes de isolamento, colisões, destino e ausência de efeitos no catálogo/pauta. Os critérios estão na seção 5 e na matriz de aceite.

Na conferência inicial, o checkout tinha mudanças locais não commitadas da captura/pauta, painel de resultados, extensão e documentação, e o arquivo ainda não estava em implementação. Essa pendência local foi tratada depois, conforme seção 10. Entregar artefato completo e fixar a revisão antes de empacotar; `HEAD` isolado não contém os arquivos novos ainda não rastreados. As alterações existentes foram preservadas.

## 10. Arquivo dos oito links — entrega local integrada

Implementado após delegação da infraestrutura em 12/11/2026 UTC, somente no projeto local. O snapshot privado não foi lido: o formato foi conferido em `infraestrutura-vps/export-shared-links.py`, e os ensaios usam oito registros sintéticos. Nenhum deploy, SQL remoto, acesso ao destino afiliado ou ativação de captura foi executado.

### Artefatos

- Migration `packages/persistence/supabase/migrations/20261112023232_shared_link_archive.sql`: tabela privada, proveniência histórica, imutabilidade dos dados, status revogável, RPCs mínimas e reserva de aliases/slugs contra `short_link`/`publication`. Não cria registros de catálogo. RLS habilitada, sem políticas ou grants de acesso direto para runtime, público, anon/authenticated/service_role. Credencial administrativa de importação/revogação permanece separada.
- `packages/persistence/src/shared-link-archive-import.ts` e `bin/import-shared-link-archive.ts`: hash fixo do pacote aprovado, limite gzip/JSON de 1 MiB, exatamente quatro conjuntos de oito registros, vínculos de conta/tenant/produto/publicação/evidência, destinos HTTPS Shopee sem credenciais ou porta explícita. Proveniência privada guarda os quatro registros de origem, incluindo IDs de capturas/dispositivos ausentes. Uma transação importa tudo ou nada; replay não atualiza nem reativa revogação.
- `packages/web/lib/shared-link-archive*.ts`, componente `app/_components/archived-shared-link.tsx`, `/p/[code]`, `/bio/[tenant]/[code]`, `/bizu/[slug]`, `/go/[slug]` e OG: apresentação separada, sem preços, histórico, acompanhamento ou telemetria de publicação. Campanhas/opções por query string são rejeitadas no arquivo. OG textual usa fontes locais; não consulta imagens do marketplace. A imagem histórica opcional é carregada diretamente pelo navegador, sem proxy servidor.
- Testes `packages/persistence/test/shared-link-archive-import.test.ts`, `packages/web/test/shared-link-archive.test.mjs`, `tools/editorial-tests/shared-link-archive-native.test.ts` e `shared-link-archive-journey-native.test.ts`. A jornada de captura/pauta existente também instala a nova migration para conferir compatibilidade.

Apenas `garimpa_public_runtime` recebe grants diretos das RPCs públicas novas. `garimpa_app` já é membro desse papel no baseline, portanto herda execução das projeções, mas não leitura ou escrita direta da tabela/namespace. Importação e mudanças de namespace adquirem o mesmo advisory lock e atualizam um gate privado: isso impede colisão inclusive com snapshot REPEATABLE READ antigo (erro de serialização). Há custo de serialização em novas publicações/aliases; atualizações que não mudam namespace não tocam esse gate. Não há timer, consulta ociosa ou worker novo para o arquivo.

### Operação prevista no destino

Após baseline/deltas/migration do arquivo e contas importadas, validar o pacote aprovado offline (substituir os placeholders pelos IDs preservados, sem inventar tenant):

```sh
node --experimental-strip-types packages/persistence/bin/import-shared-link-archive.ts --file /caminho/privado/data.json.gz --tenant TENANT_PRESERVADO --affiliate AFILIADO_PRESERVADO
```

O dry-run não conecta ao banco e não comprova seus privilégios ou ausência de colisões. Para a importação autorizada, injetar **`SHARED_LINK_IMPORT_DATABASE_URL`** por arquivo privado do operador, nunca `NEXT_PUBLIC_*`; repetir o comando com `--execute`. Não existe fallback para `DATABASE_URL` nem parâmetro CLI para ignorar/trocar o hash. Saída contém somente modo, contagens e hash; erros SQL/dados privados são suprimidos. Usar conexão de operador com acesso aos objetos, não conceder importação ao runtime.

Esperado: primeira execução `inserted=8,replayed=0`; repetição idêntica `inserted=0,replayed=8`, preservando registros revogados. Colisão de conta/alias/slug/conteúdo falha com rollback integral. Revogação é alteração administrativa de `status` para `revoked`, filtrando alias e tenant; não apagar registro para liberar o código. Não importar as quatro tabelas de origem em paralelo ao arquivo.

### Verificações realizadas

- Suítes completas: **60 testes de persistência e 593 da web passaram**; typechecks passaram e build Next de produção passou com endpoints locais fictícios, sem banco de produção.
- PostgreSQL 17.6 descartável: grants efetivos/RLS, projeção sem preço/proveniência, conta suspensa/revogação, colisões em ambas direções, concorrência real entre os três escritores e falha segura de snapshot REPEATABLE READ antigo.
- Next real por HTTP → RPC restrita → PostgreSQL descartável: importação/replay dos oito registros, rollback dos sete primeiros quando o oitavo colide, aliases/bio por conta/página/OG/Location de saída, recusa de campanha/opção, revogação após aquecimento e suspensão. Nenhum destino externo seguido. `product`, observações, curadoria, publicação, short_link, runs/lotes/triagem, cliques, edições/exposições e cache de pauta permaneceram vazios após a jornada; importar o arquivo não mudou a versão da pauta.
- A página usa o streaming existente do Next: `notFound()` depois do início do stream pode manter HTTP 200 em `/bizu`. O ensaio conferiu o conteúdo indisponível com `noindex`, sem título do produto nem CTA; `/p`, `/go`, `/bio` e OG revogados retornaram 404. Não é cache de conteúdo revogado.
- Jornada anterior de captura/pauta repetida com a migration do arquivo instalada: duas contas, duas fontes/40 ofertas, staging, publicação/replay, triagem sintética, reabertura e divulgação idempotente passaram; falha conservou a seleção anterior. Medidas locais dessa execução: publicação 92 ms, composição 87 ms, resposta serializada 20.421 bytes; não são medições de rede/provedores/VPS.

Para reproduzir, gerar build web com `BIZUMINER_DIST_DIR=.next-shared-links` e endpoints SQL/Auth locais de teste; depois, com `BIZUMINER_TEST_PG_BIN` apontando aos binários PostgreSQL:

```sh
npm run test:shared-link-archive-native --prefix tools/editorial-tests
npm run test:shared-link-archive-journey-native --prefix tools/editorial-tests
```

A jornada HTTP exige o build nesse diretório (ou `BIZUMINER_DIST_DIR` correspondente), inicia e encerra servidor Next/banco próprios e não aceita URL de banco externo. Os demais testes e comandos continuam nas seções 6–7.

**Pendente no destino:** conferir o pacote real pelo hash/formato, aplicar baseline/ACLs/deltas e importar com credencial separada; verificar títulos/slugs/destinos reais dos oito URLs e seus previews no host público; concluir Auth/isolamento/captura representativa e janelas de ociosidade/24h. A implementação local remove a lacuna de código do arquivo; não equivale a corte público realizado ou certificado.

## 11. Dependência histórica confirmada no baseline real

Em 12/11/2026, a infraestrutura relatou que o ensaio restaurou o baseline revisado e aplicou `marketplace_performance`, mas `pauta_versioned_selection` foi revertida por ausência de `garimpa.comparative_evidence_event`. A causa foi reproduzida localmente: essa tabela não existe nas duas cópias reais do dump. As outras 14 relações de invalidação estão presentes. Os testes anteriores incluíam explicitamente a migration histórica; a lista de restauração deste contrato não a destacava e foi corrigida na seção 3.

**Para o ensaio já descrito:** não reaplicar `marketplace_performance`; conferir que a pauta foi integralmente revertida, aplicar `20261020002440_garimpa_comparative_evidence_event.sql` em transação e retomar `20261111042204_pauta_versioned_selection.sql` → `20261112002243_capture_durable_execution.sql` → `20261112002247_capture_atomic_publication.sql` → `20261112023232_shared_link_archive.sql`. Não criar tabela substituta, apagar triggers ou usar `IF EXISTS` para omitir fontes de invalidação. O pré-requisito cria estrutura vazia, sem importar/backfill de curadoria ou capturas antigas.

A pauta agora verifica todas as relações antes de criar seus objetos e falha com `pauta_missing_source_relations` mais a lista ausente e orientação. O rollback permanece transacional. A migration histórica continua inteira e inalterada.

### Prova local sobre o export

`tools/editorial-tests/vps-baseline-capture-native.test.ts` lê somente schema privado com hash conferido, extrai literalmente os 941 objetos marcados `Schema: garimpa` mais o objeto de criação do schema (942 ao todo), restaura-os em PostgreSQL 17.6 descartável e aplica a sequência acima. Não chama `installObservedBaseline`, não substitui constraints/funções/triggers e não precisa de dados privados. O schema Garimpa das duas cópias é equivalente; o derivado usado tem SHA-256 `143131cb89882497c755261bfb64a49c4a05c8512cc6b31e37e5b0812dc17ce1`.

Resultados: falha por dependência reproduzida e rollback conferido; sequência corrigida passou com **45 triggers de pauta** (15 fontes × três operações), sem eventos antigos criados. Com role de runtime limitada, staging permaneceu invisível, publicação criou produto/observação e curadoria `pending` pelo trigger real do dump, além de dois eventos comparativos. Mudança posterior de produto e observação criou dois eventos adicionais e uma única revisão da pauta na transação. A conta B não leu dados de A e escrita direta no evento foi negada.

Executar localmente com `GARIMPA_BASELINE_SCHEMA` apontando à cópia privada revisada e `BIZUMINER_TEST_PG_BIN` aos binários PostgreSQL:

```sh
npm run test:vps-baseline-capture-native --prefix tools/editorial-tests
```

O teste não aceita URL de banco externo, não restaura PostSpark/Auth/Storage e não é uma certificação do pacote completo de ACLs da VPS. `native-postgres-fixture.ts` ganhou um inicializador opcional para este schema literal; os testes anteriores conservam o inicializador padrão.

### Permissões que precisam acompanhar a estrutura

O dump omite grants/owners. `seed_product_curation()` é **SECURITY INVOKER**, portanto o escritor precisa de `SELECT/INSERT` em `product_curation` além dos privilégios de produto/observação. A invalidação da pauta também é invoker e depende de leitura da conta/cache e `SELECT/INSERT/UPDATE` na versão, respeitando RLS.

Os dois triggers comparativos são **SECURITY DEFINER** com `search_path` fixo; manter owner administrativo capaz de inserir evento e usar a sequência identity. Runtime recebe apenas `SELECT` nos eventos, sem DML nem acesso à sequência. Na reconciliação das ACLs, revogar EXECUTE de PUBLIC/anon/authenticated nas funções `record_comparative_evidence_event_from_product()` e `record_comparative_evidence_event_from_observation()` e remover grants de escrita herdados na tabela/sequência. A migration histórica não contém esses revokes; não transformar seu owner no runtime nem dar DML direto para contornar falhas. Os triggers continuam funcionando sem EXECUTE público.

Todas essas verificações foram locais. A aplicação da sequência e a confirmação de catálogo/ACLs no ensaio remoto permanecem com a infraestrutura.

## 12. Login por e-mail/senha no destino

A infraestrutura comunicou a escolha do usuário por login de conta já provisionada com e-mail/senha. A interface anterior oferecia somente Google; foi adaptada localmente com **`AUTH_LOGIN_MODE=password`** no ambiente do serviço web. A variável é server-side, lida pela página dinâmica e pelo POST. Ausente ou `google` mantém a origem como antes; `both` é opção explícita. Valor desconhecido não habilita método algum.

Arquivos: `packages/web/lib/auth-contract.ts`, `app/entrar/page.tsx`, `app/entrar/password-form.tsx`, seu CSS e `app/auth/password/route.ts`. Não foi alterado o schema Auth nem lida a senha privada coletada pela infraestrutura. O formulário faz POST nativo, não guarda a senha em URL, estado persistente do browser ou log. Não há cadastro, envio de link mágico nem recuperação por e-mail apresentados como disponíveis; a página informa que esses recursos não estão disponíveis nesse ambiente.

O handler só aceita o modo habilitado, origem igual à da aplicação, corpo URL-encoded limitado e destino `next` interno. `signInWithPassword` usa o SDK Supabase existente; `getUser` confirma a identidade no servidor antes de anexar os cookies de sessão. Falhas retornam mensagem genérica e `no-store`, sem ecoar credenciais. O merge pessoal idempotente existente é preservado; login não concede role, membership ou acesso administrativo. Autorização por conta continua sendo verificada separadamente.

Requisitos da infraestrutura: provider de e-mail habilitado para autenticação, usuário provisionado com UUID preservado e senha configurada privadamente; situação de confirmação do e-mail compatível com a política Auth. Manter cadastro externo desabilitado conforme escopo. Preservar Host/protocolo corretos no proxy para que `Origin` do formulário corresponda à origem percebida pelo Next. SMTP não é necessário para entrar com senha em uma conta já provisionada; sua ausência continua impedindo os fluxos de envio de e-mail que não foram implementados aqui.

Validação local: dez testes do fluxo de senha, incluindo SDK `@supabase/ssr` real com transporte Auth simulado (`/token` → `/user`), cookies e rejeição de identidade divergente, além dos testes de contrato existentes. Os testes verificam senha intacta no corpo e ausente no redirect/log, CSRF, modo desabilitado, limites de entrada, erro genérico e ausência de cadastro/recovery. Não equivalem a login real no Supabase da VPS; esse aceite exige o usuário provisionado e sessão no host de destino.

O ensaio HTTP com Next real encontrou normalização de `127.0.0.1` para `localhost` em `NextURL`, que rejeitava o POST legítimo. O handler foi corrigido para preservar a origem por `Host` HTTP validado e protocolo da requisição, sem confiar em `X-Forwarded-Host` nem considerar localhost/127 a mesma origem. Build e jornada HTTP passaram depois da correção: `/entrar` mostra somente senha, POST de outra origem retorna 403 e entrada inválida da própria origem retorna 303 interno/no-store. Os oito links continuaram passando no mesmo ensaio.

Após essa correção final, a suíte web completa passou com **606 testes**. Os arquivos gerados de configuração do build de ensaio foram devolvidos à configuração original; o runtime do projeto está estabilizado para a infraestrutura gerar seu artefato completo.

## 13. ACLs de funções, roles de login e seeds mínimos

O catálogo `infraestrutura-vps/private/source-acl-metadata.json`, SHA-256 `f42a33a2985fb23847a1bfd717fbe363b7d23af59000216c6f7e536f227faea6`, foi auditado como metadados de permissões, sem credenciais. Contém 142 funções entre os dois aplicativos, 44 Garimpa, sendo 12 Garimpa invoker. **Não foi encontrada dependência de PUBLIC EXECUTE na cadeia Garimpa auditada**, desde que ACLs explícitas da origem e grants dos deltas sejam restaurados. Não usar GRANT EXECUTE em todas as funções como reparo.

Estes seis helpers invoker já têm EXECUTE explícito para `garimpa_app` na origem e devem conservá-lo:

| Assinatura | Cadeia |
| --- | --- |
| `observation_option_key(jsonb)` | Staging e coluna generated de observação; chama `offer_configuration_key`. |
| `offer_configuration_key(jsonb)` | Comparação de configuração/opções e evidência. |
| `commercial_rollout_ready()` | Policies comerciais; lê `rollout_control`, portanto SELECT nessa tabela também importa. |
| `product_presentation_offer_rows(text,text[])` | Chama `product_presentation_rows`. |
| `product_presentation_rows(text,text[])` | Chama `presentation_configuration`. |
| `presentation_configuration(jsonb)` | Comparação de apresentação e evidência. |

`active_tenant(text)` é definer e também possui grant explícito a `garimpa_app`. Os demais invokers Garimpa são cinco funções trigger e `uri_component(text)`, interno à cadeia pública definer. O disparo de trigger não exige ampliar EXECUTE direto do runtime, mas seus corpos invoker exigem os privilégios de tabelas do escritor. Nas entradas públicas definer, helpers internos executam sob o owner administrativo da entrada; não conceder esses helpers privados a `garimpa_public_runtime` por conveniência.

O teste da seção 11 foi ampliado: revoga EXECUTE de PUBLIC em todas as funções Garimpa, conserva grants explícitos dos deltas e restaura somente os helpers necessários à captura. Passou inclusive com variante sintética, exercitando `observation_option_key` → `offer_configuration_key` e a coluna generated. Também passou com a role de login de teste herdando `garimpa_app` e com acesso ao RPC de arquivo via `SET LOCAL ROLE garimpa_public_runtime`. Isso não substitui conferir todas as operações do painel sobre a ACL restaurada no destino.

### Identidade SQL recomendada para o código atual

`garimpa_app` e `garimpa_public_runtime` são grupos **NOLOGIN**, sem superuser/BYPASSRLS. O login dedicado web/executor deve ser **INHERIT**, sem privilégios administrativos, com membership explícita em `garimpa_app` que permita herdar seus grants. As consultas privadas não fazem `SET ROLE garimpa_app`: usar login NOINHERIT sem adaptar a conexão perde os privilégios necessários.

O caminho de membership para `garimpa_public_runtime` precisa permitir `SET`; a aplicação usa `SET LOCAL ROLE` nas leituras públicas. O baseline da aplicação concede `garimpa_public_runtime` a `garimpa_app`; preservar essa relação e conferir `pg_has_role(login,'garimpa_public_runtime','MEMBER')` e `'SET'`. O papel público não herda nenhum papel privilegiado nem recebe SELECT direto nas tabelas privadas. Memberships não são restauradas pelo JSON de ACLs de funções. Separar credencial de login runtime da credencial administrativa de importação/migração.

### Sem habilitação comercial implícita

| Uso no novo ambiente | Seed mínimo |
| --- | --- |
| Login e painel legado vazio | Nenhum comercial. Auth, vínculo `app_user.auth_user_id`, role afiliado não revogada, membership e conta ativas já reconciliados bastam. |
| Novo cockpit | Somente `workspace_rollout.enabled=true` para a conta escolhida, se esse painel for desejado. Ausente/false em produção mantém painel legado; não bloqueia login. Essa flag não habilita operações comerciais. |
| Vitrine vazia | Projeções e ACLs corretas; sem produtos elegíveis, vazio é esperado. Não requer entitlement, rollout global ou canal. |
| Oito links arquivados | Arquivo importado e registro/conta ativos; sem dependência de curadoria, recência, canal, entitlement ou rollout. |
| Pauta vazia | Canal ausente/desabilitado é estado válido. Para seleção futura, configurar/habilitar `recommendation_channel` pelo owner; não exige entitlement ou rollout global. |
| Criar material/campanha ou registrar/converter oferta no workspace | Exige gate comercial e entitlement novo legítimo, com termos/limites explicitamente definidos. Não conceder como consequência do restore/login. |
| Salvar público do workspace | Escrita em `audience_policy/version` passa pelo gate comercial; ler configuração vazia funciona sem essa ativação. |

`rollout_control` e `account_entitlement` podem permanecer vazios para o escopo login/painel básico/vitrine/arquivo. Não criar direitos financeiros, saldos ou quotas fictícios. Não inicializar edições, exposições, curadoria ou capturas antigas. Bússola editorial ausente já usa fallback `autoPublish=false`.

## 14. Dependências web corrigidas e artefato para novo ensaio

Em 12/11/2026, a infraestrutura reportou quatro pacotes vulneráveis no build web ainda desligado. A auditoria local reproduziu **1 critical e 3 high** em produção. A correção foi pontual em `packages/web/package.json` e seu lockfile, sem `npm audit fix` e sem mudança de major do Next:

| Pacote | Versão fixada/resolvida | Motivo |
| --- | --- | --- |
| `next` e `@next/third-parties` | `15.5.29` | Patch da linha 15; substitui o Next 15.5.23 instalado. Third-parties já resolvia 15.5.29 e agora tem versão exata no manifesto. |
| `sharp` | `0.35.5` | Corrige a cadeia nativa de imagens vulnerável; substitui 0.34.5 e é aceito pela dependência opcional do Next 15.5.29. |
| `postcss` | `8.5.32` | Override restrito a `next → postcss`: o manifesto upstream do Next ainda fixa 8.4.31. |
| `source-map-js` | `1.2.2` | Resolvido pela dependência corrigida de PostCSS, sem override global. |

Referências primárias verificadas: [release Next 15.5.29](https://github.com/vercel/next.js/releases/tag/v15.5.29), [advisory de imagens SVG do Next](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [manifesto Next dessa versão](https://raw.githubusercontent.com/vercel/next.js/v15.5.29/packages/next/package.json), [release Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5), [advisory PostCSS](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) e [release PostCSS 8.5.32](https://github.com/postcss/postcss/releases/tag/8.5.32). A revisão do lock confirmou mudanças restritas a essas cadeias, incluindo binários Next/Sharp, libvips e nanoid transitivo de PostCSS. React/React DOM permaneceram em 19.2.8.

Sharp 0.35 exige Node >=20.9; permanece válido o requisito mais restrito do projeto de Node 22, testado aqui em **22.23.4**. Instalar com o lockfile, incluindo os pacotes opcionais nativos apropriados à plataforma. Não copiar `node_modules` de outra arquitetura. O carregamento nativo local confirmou Sharp 0.35.5/libvips 8.18.7. A nova declaração ESM deixou de expor tipos pelo namespace do import default: `packages/web/lib/kit-renderer.ts` agora importa `OverlayOptions` explicitamente como tipo. A renderização não mudou de comportamento.

### Evidências após o ajuste final

- `npm audit --omit=dev --json` no pacote web: **0 vulnerabilidades** na consulta de 12/11/2026. Isso é resultado do catálogo consultado, não garantia permanente de ausência de vulnerabilidades.
- `npm test --prefix packages/web`: **606/606**, incluindo SDK Auth com transporte simulado, renderização PNG e leitura dos QR codes.
- `npm run typecheck --prefix packages/web`: passou com a configuração original restaurada após o build.
- Build Next **15.5.29** passou usando `.next-shared-links` e endpoints fictícios de SQL/Auth, sem acesso ao destino. Alterações automáticas de `tsconfig.json` e `next-env.d.ts` foram removidas; não fazem parte da entrega.
- `test:shared-link-archive-journey-native`: passou com esse build e PostgreSQL 17.6 descartável. Verificou formulário de senha/POST inválido/CSRF por HTTP, oito snapshots sintéticos, importação/replay/rollback, aliases, bio, página sem preços atuais, imagem OG, destino exato, isolamento, revogação e suspensão. Nenhuma linha criada em catálogo, pauta, capturas ou telemetria; destinos externos não visitados.

O login bem-sucedido com a identidade real ainda depende do Supabase Auth e proxy do destino; o teste SDK local simula o transporte Auth. Os oito registros reais importados pela infraestrutura precisam do aceite HTTP no seu host. As medições de ociosidade/24 horas da seção 7 permanecem pendentes. Nenhum serviço remoto foi iniciado, reiniciado ou implantado por esta frente.

### SHA-256 congelados para a transferência

Estes são os três arquivos alterados nesta correção de dependências. Devem acompanhar o checkout completo já reconciliado; não substituem migrations, resolvedores e importador das seções anteriores.

```text
3899da60f00a2c768366be60e3c8171fc7ff12bf456bfce95e484aa99ca58920  packages/web/package.json
520121e606e3db88d79352f5f6bd4a64e20f54c80a7d96849efc5ec826370fa0  packages/web/package-lock.json
2d2523e54d0d4afe5db0ff9a3e07536c2a60f5309b3c79549b346bce78f66a9b  packages/web/lib/kit-renderer.ts
```

Para o próximo build autorizado da infraestrutura: conferir os três hashes, reinstalar web com `npm ci --prefix packages/web`, repetir auditoria/typecheck e gerar o artefato com as variáveis públicas do destino. O build anterior do Next 15.5.23 não contém estas correções. Este registro entrega os insumos; não autoriza deploy, ativação de consumidores ou alteração de dados.

## 15. Persistência de sessão fragmentada e renovação no middleware

O ensaio privado da infraestrutura encontrou login com POST 303 seguido de retorno à entrada: a resposta HTTP continha somente `sb-api-gw-auth-token.1`, sem o fragmento `.0`. A reprodução local com NextResponse e SDK Supabase reais, transporte Auth sintético e sessão grande confirmou **três cookies produzidos pelo SDK, mas somente um header Set-Cookie enviado**. O caso de sessão pequena passava; a suíte anterior não exercitava essa diferença. A ausência já no header distingue o defeito da aplicação de uma interpretação incorreta pelo CookieJar.

A causa em `lib/supabase.ts` era `attachSink`: copiava cookies individualmente e depois repetia `headers.set` para cada Set-Cookie, sobrescrevendo os anteriores. A transferência agora preserva cada cookie e não repete esse header no loop genérico. A sessão reconstruída exclusivamente a partir dos headers enviados passa em um novo `getUser` do SDK.

Havia ainda dois defeitos no refresh: `createMiddlewareSupabase` expunha a resposta inicial antes de `setAll` substituí-la, e redirects/401 criados pelo middleware descartavam os cookies de renovação/remoção. O helper agora expõe a resposta atual, lida após `await getClaims`; respostas alternativas recebem cookies e headers de cache do SDK. Headers internos `x-middleware-*` não são copiados para redirects/401. Requests encaminhados conservam os cookies atualizados para os Server Components. Mantidos os gates de autenticação e autorização existentes.

Referências de contrato: [Supabase SSR/Next](https://supabase.com/docs/guides/auth/server-side/creating-a-client) e [múltiplos headers Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). Os testes `password-login.test.mjs` e `middleware-session.test.mjs` reproduziram as falhas antes do reparo e passaram depois: login com sessão simples/fragmentada, request seguinte, refresh, remoção de fragmentos antigos, redirects, API 401 e sessão inalterada sem cookies novos. A suíte web completa passou com **613 testes**, assim como typecheck, build Next 15.5.29 e novamente a jornada HTTP/PostgreSQL dos oito links.

Hashes adicionais de runtime, para acompanhar os três arquivos da seção 14 no próximo build autorizado:

```text
9199f54cef3406d0e184a74eaecacae17ccc7793bebb66456ea0d5424c465192  packages/web/lib/supabase.ts
b1678c2803286d4d2d696be45c2b880fec26c06c87928a1ff06e841a23680d01  packages/web/middleware.ts
```

O novo `tools/editorial-tests/password-session-http.test.ts` passou também no build final com configuração JavaScript: Next e SDK reais contra Auth sintético em loopback. Login transmitiu dois fragmentos, duas reaberturas de `/entrar` reconheceram a sessão e redirecionaram para `/minha-area`; uma sessão sintética expirada acionou um refresh, transferiu dois fragmentos modificados no redirect e a reabertura seguinte não repetiu o refresh. O teste usa apenas os headers HTTP recebidos para reconstruir a sessão e não acessa banco real. Reproduzir, após gerar `.next-shared-links`, com `npm run test:password-session-http --prefix tools/editorial-tests`.

O SDK evita reenviar fragmentos inalterados: não exigir quantidade fixa de Set-Cookie em toda renovação na VPS. Conferir o conjunto resultante e a próxima requisição. A contagem de dois fragmentos no teste é consequência da fixture controlada, que altera os dois. A verificação da sessão real após instalar o novo artefato cabe à infraestrutura. Esta frente não acessou senha, token ou serviço remoto.

## 16. Runtime sem dependências de desenvolvimento

A revisão do empacotamento encontrou uma dependência indireta: Next 15.5.29 carrega `next.config.ts` com TypeScript também no `next start`, podendo tentar instalar o compiler quando ausente. Para permitir imagem de produção sem esse comportamento, a configuração foi convertida para **`packages/web/next.config.mjs`**, removendo apenas o import/anotação de tipo e mantendo documentação JSDoc. Comparação direta confirmou todos os settings idênticos, inclusive `distDir`, tracing e hosts de imagem. **Remover `packages/web/next.config.ts` do artefato final; não manter as duas configurações.** Não houve mudança adicional nos manifests/lockfiles de dependências.

```text
bdd9fce5e6ae34a90152b25456adc440ce50face0e952d20928d2a456300c484  packages/web/next.config.mjs
```

Build com a configuração nova passou, assim como o teste HTTP de senha/refresh da seção 15. Uma cópia isolada em `/tmp`, sem `.env` ou credenciais, instalou `web`, `persistence` e `capture` com `npm ci --omit=dev --ignore-scripts`, mantendo dependências opcionais nativas. A coordenação central revisou e repetiu a verificação preparada pelo agente:

- `typescript`, `tsx` e `jsqr` ausentes nos três pacotes; `next start` iniciou, `/favicon.svg` e `/entrar` responderam 200 e exibiram o formulário de senha. Sem instalação automática de compiler ou alteração do lockfile.
- Sharp 0.35.5 gerou PNG nativo.
- Sweeps Shopee/AliExpress executaram `--dry-run`; importador executou `--help` e rejeitou argumentos ausentes. Listener, worker, triagem, preflight e probe foram carregados e pararam nos gates esperados de configuração/argumentos ausentes. Nenhum job, fornecedor, Auth real ou SQL remoto foi acionado.

Assim, após build e verificações na etapa de preparação, **é compatível remover devDependencies dos três pacotes** (`npm prune --omit=dev --prefix packages/web`, e equivalente em `persistence`/`capture`). Alternativamente, copiar os manifests/lockfiles para o estágio final e fazer `npm ci --omit=dev`. A validação local usou esta segunda estratégia; a imagem final da infraestrutura ainda precisa de seu próprio smoke test. Preservar os fontes TypeScript dos scripts, caminhos relativos entre os três pacotes, build/public/configuração web e dependências opcionais de Sharp/Next compatíveis com arquitetura/libc. Node 22 executa os CLIs com `--experimental-strip-types`, sem `tsx`.

Typecheck, build e suites de desenvolvimento devem terminar antes da remoção. `tools/editorial-tests` é ferramenta de ensaio, não parte necessária do runtime; seus testes usam `tsx` em ambiente separado. O listener não possui flag de inspeção: a inspeção somente leitura é o script separado `inspect-capture-runtime.ts`. O teste de gates dos CLIs não substitui ensaio de captura autorizada com banco e fontes disponíveis.

## 17. Ativação mínima: listener ocioso e uma captura humana sem IA

Contrato operacional conferido no código em 12/11/2026, em resposta à frente de infraestrutura. A infraestrutura comunicou autorização vigente para ativação gradual e orçamento agregado de US$ 1 controlado pela chave OpenRouter. **Nesta configuração, o ensaio mínimo é listener vazio + captura manual de um item; captura/triagem automáticas completas continuam pendentes.** Nenhum comando remoto, chamada paga ou mudança de configuração foi executado pela frente local nesta conferência. Os arquivos de runtime e hashes das seções 14–16 permanecem iguais.

### Listener: requisitos e início sem trabalho pendente

Manter somente a conta de ensaio em `CAPTURE_WORKER_TENANTS`; não usar allowlist de todas as contas. `garimpa_app`/login INHERIT limitado e caminho de SET ROLE público seguem a seção 13, com migrations/ACLs já reconciliadas. São necessários:

| Configuração | Estado mínimo |
| --- | --- |
| `NODE_ENV` | `production`; Node 22 e fontes/caminhos dos três pacotes preservados. |
| `DATABASE_URL` | Login runtime limitado, banco de destino. É usado pelo store e pelos filhos, separado da conexão LISTEN. |
| `CAPTURE_LISTEN_DATABASE_URL` | Sessão PostgreSQL dedicada e persistente em rede privada, sem pool transacional; `db:5432` no Compose. |
| `CAPTURE_EXECUTOR` | `durable` no web e no listener, evitando dispatch legado pelo GitHub. |
| `CAPTURE_WORKER_TENANTS` | Tenant exato da conta de ensaio; não é ID Auth nem `affiliate_account.id`. |
| `CAPTURE_HEALTH_PORT` | Porta privada escolhida pela infraestrutura; endpoint ligado a `127.0.0.1` dentro do contêiner. |
| Flags das fontes e IA | Manter `SHOPEE_CAPTURE_ENABLED=false`, `ALIEXPRESS_CAPTURE_ENABLED=false`, automação ML desligada e `GEMINI_API_KEY` ausente. Não há dependência de segredos marketplace/IA para iniciar uma fila realmente vazia. |

Antes do início, conferir por consulta somente leitura **zero `capture_batch` com `status='running'` da conta, em qualquer fase**, inclusive esperas, e zero execução antiga em andamento. Não basta `/health` ou `ready=true` do preflight: este reporta jobs, mas não condiciona readiness a fila vazia. Reconciliar qualquer execução existente antes deste ensaio; o startup recupera e pode despachar trabalho já persistido. Não importar políticas/crons/webhooks/workflows/filas antigos nem criar lote fictício para acordar o listener.

Com o ambiente já injetado privadamente, comandos para a frente autorizada de infraestrutura, na raiz do checkout:

```sh
node --experimental-strip-types packages/web/bin/inspect-capture-runtime.ts
node --experimental-strip-types packages/web/bin/listen-capture-batches.ts
```

O primeiro é preflight somente leitura; o segundo fica sob o supervisor dedicado, sem executar scripts de bootstrap/monitoramento. O listener assina `garimpa_capture_ready`, faz recuperação/leitura inicial uma vez por conta e depois espera sinais ou prazos persistidos. Sem jobs/prazos, não agenda varredura SQL. Erro de recuperação/leitura do store agenda retry em 60 segundos; a reconexão da sessão LISTEN é separada e usa o backoff variável do driver `postgres`. Não misturar falha/reconexão com o ensaio ocioso saudável. A prova nativa automatizada de repouso usa janela de 300ms e não substitui as medições de uma hora/24h no destino.

Aceite inicial: `/health` HTTP 200 com `ready=true`, `connected=true`, `accounts=1`, `active=0`, `scheduled=0`. O log `capture_listener_ready` sozinho não comprova a recuperação inicial concluída. O health usa somente estado em memória e pode ser consultado sem ler SQL.

Dentro do contêiner do listener, com a porta já configurada: `curl --fail --silent "http://127.0.0.1:${CAPTURE_HEALTH_PORT}/health"`. A infraestrutura pode usar cliente HTTP equivalente se a imagem não incluir curl; o loopback do host não é o loopback do contêiner.

Depois do aquecimento, fazer primeiro uma janela curta de observação e então a janela de **uma hora** da seção 7. Registrar deltas de `pg_stat_statements` por banco/role/query e requisições do web/browser; não zerar estatísticas compartilhadas. A sessão LISTEN identificada por `application_name=bizuminer-capture-listener` deve esperar cliente, sem transação ociosa aberta. Os acessos do store usam o pool `bizuminer-web`; não atribuir tudo à sessão LISTEN nem confundir consultas da ferramenta de medição com trabalho da aplicação. Sem foco/navegação/jobs/eventos, não deve haver repetição periódica de `recover`/fila vazia, leitura de candidatos/pauta ou subprocessos. Capturas, triagens e chamadas de provedores continuam sem incremento. Refresh Auth e manutenção de outros serviços devem ser identificados separadamente. A leitura inicial, um sinal legítimo e recuperação após reconexão são atividade esperada, não polling vazio.

### Uma captura real de produto, sem provedor de IA

Usar o bookmarklet **BM1**, que lê o DOM de uma página já aberta pelo humano. Não requer pareamento da extensão, segredo de marketplace, chave de IA, entitlement, rollout comercial global ou canal de pauta. Requer login válido, `app_user.auth_user_id` reconciliado, role `afiliado` não revogada, membership ativa e conta ativa; a operação revalida o escopo na transação. Permissões de produto/observação, trigger de curadoria e evidência comparativa seguem as seções 11/13.

1. Abrir `/admin?aba=captura-manual&conta=<tenant-da-conta-de-ensaio>` na origem do destino. A aba explícita usa o painel legado mesmo com `workspace_rollout` ausente/false; não habilitar operações comerciais para acessá-la.
2. Copiar o código do bookmarklet exibido ali e criar o favorito conforme a interface. Abrir **um produto Mercado Livre atual**, com ID, título e preço legíveis, executar o favorito e copiar o bloco BM1 recém-gerado. Conferir o preço/título contra a página. O bloco é dado de captura humano, sem atestado remoto da loja; não fabricar produto, preço ou data para simular captura real.
3. Colar o bloco na aba e clicar em gravar. A interface envia uma vez `POST /api/admin/captura`, JSON `{ "block": "BM1.…" }`, pela sessão e conta selecionadas. Esperar HTTP 200, `ok=true`, `productId` e preço coerentes. 401/403 indicam identidade/permissão/conta; 400 indica bloco inválido; 500 exige verificar schema/ACLs/erro concreto. Não corrigir essas falhas ampliando rollout/entitlement.
4. Conferir somente os registros dessa conta/produto: se o anúncio era novo, +1 produto e +1 observação com `capture_source='bookmarklet'`, `client_request_id`, `client_captured_at` e evidência; `capture_run_id` nulo é esperado. O trigger pode criar curadoria `pending` e eventos/versionamento correspondentes. Nenhuma execução de IA, lote, captura automatizada, publicação de afiliado ou exposição deve ser criada. Os oito registros do arquivo permanecem separados.
5. Reenviar **o mesmo bloco completo**, sem gerar outra captura: retornar o mesmo produto e não criar outra observação/evento. Uma coleta posterior com timestamp diferente é outra observação legítima, não o teste de replay.
6. Fechar interação/navegação, aguardar o aquecimento dessa mudança e repetir a observação ociosa. O listener continua `active=0/scheduled=0`: BM1 não cria lote nem é processado por ele. Esse ensaio valida autenticação, escopo, ingestão manual e persistência, **não** claim/lease, staging/publicação atômica de lote ou triagem automatizada.

Catálogo/pauta vazios após esse único item são esperados: novo produto fica em curadoria pendente, sem publicação/afiliado elegível; canal ausente/desabilitado também pode produzir pauta vazia. Não aprovar/publicar automaticamente nem inserir seleções para tornar a tela preenchida. A falta de chamada de IA é objetivo deste ensaio. `rollout_control` e `account_entitlement` podem continuar vazios. Ausência de produto no público não substitui conferir o registro privado salvo.

Se a etapa seguinte incluir **revisão humana real**, a interface existente fica em `/admin/curadoria?aba=excecoes&sub=singulars&conta=<tenant>`: a decisão é explícita e registra ator/evento humano, sem Gemini. Pauta também pode ser ensaiada sem IA, mas exige produto elegível (incluindo imagem, preço exato recente e evidência/presença válidas), configuração Mercado Livre ativa com `tracking_id` e `tool_id` legítimos, e canal `whatsapp`/`stories` habilitado pelo owner em `/admin/curadoria?aba=selecao`. Esses passos são escolhas/configurações separadas do ensaio mínimo; não criar credenciais fictícias nem aprovação em SQL para satisfazer contagem. Não dependem de habilitar entitlement ou rollout global. Canal ausente devolve `active:false/products:[]`; produto sem destino de afiliado válido não é selecionado.

### Requisitos separados para futura captura automática completa

| Caminho | Requisito adicional e limite atual |
| --- | --- |
| Shopee API | `SHOPEE_CAPTURE_ENABLED=true` e credencial da conta em `affiliate_secret`, campos `appId` e `appSecret`. |
| AliExpress API | `ALIEXPRESS_CAPTURE_ENABLED=true` e campos da conta `appKey`, `appSecret`, `trackingId`; tracking é obrigatório para atribuição. |
| Cofre da conta | Envelope AES-256-GCM com AAD `tenantId:marketplace:secretId`, key version compatível e `AFFILIATE_SECRETS_MASTER_KEY` ou `AFFILIATE_SECRETS_KEY_<VERSION>` de 32 bytes. Aceita `credentials_json` com os campos acima ou segredos individuais. Configuração pública de afiliado não substitui o cofre. Provisionamento privado e delimitado; não copiar `.env` administrativo. |
| Fallback de fonte | Variáveis `SHOPEE_APP_ID/SHOPEE_APP_SECRET` e `ALIEXPRESS_APP_KEY/ALIEXPRESS_APP_SECRET/ALIEXPRESS_TRACKING_ID` só são fallback para tenant literal `local`. Não funcionam como credencial de outra conta. |
| Triagem do lote | `run-capture-batch.ts` exige `GEMINI_API_KEY`; usa SDK Google, `GEMINI_MODEL` e possíveis `GEMINI_FALLBACK_MODELS`. Não usa OpenRouter e não aplica o teto agregado de US$ 1. Não provisionar Gemini nem habilitar esse caminho sob a suposição de que a chave OpenRouter o cobre. |

`POST /api/admin/rodagem/lote` não é ensaio de um único item: `pages=1` limita páginas **por consulta**; plano padrão percorre 12 departamentos e `keywords` percorre 10 entradas. A rota não permite reduzir a um keyword específico. Depois de captura completa, o worker publica fatos, gera links e sempre entra na etapa de triagem (`--limit 200`, podendo drenar até 15 ciclos). Sem Gemini, essa etapa retorna `gemini_key_not_configured` e o lote termina `partial` após possível commit dos fatos; não é um aceite de jornada completa. Não repetir lote ou ativar fonte para preencher catálogo vazio.

Uma CLI com `--keyword … --pages 1` é outro caminho: pode restringir a consulta da fonte, mas pode fazer validação/paginação/chamadas de link e não valida o lote durável; não a executar neste ensaio mínimo. A extensão tem contrato próprio de flag, pareamento e origem permitida. Nas versões 0.3.4–0.3.6, o modo manual salva fatos para revisão sem continuar para triagem; o caminho durável é opt-in separado. Ver seções 19–21.

No contrato antigo, `GET /api/extension/capture-batches` criava/renovava trabalho; isso nunca foi health check. **No modo manual atual, GET retorna 409 sem escrita e POST persiste sem despachar lote.** A origem da extensão é fixa por build; produção não faz fallback para localhost. `EXTENSION_CAPTURE_MODE` ausente também significa `manual`, e valor inválido fecha o caminho. BM1 continua disponível sem pareamento da extensão.

Fechamento honesto desta etapa: listener ocioso e captura BM1 podem ser aceitos separadamente; processamento real de lote completo e triagem ficam pendentes até decisão de provedor/credencial com controle de gasto compatível. Não criar entitlement nem habilitar rollout global para contornar essa dependência. O orçamento agregado e o consumo já ocorrido são acompanhados pela infraestrutura; esta frente não consumiu esse orçamento.

## 18. Aceite HTTP do artefato final na VPS, comunicado pela infraestrutura

Em 12/11/2026, o chat responsável pela VPS comunicou resultado positivo do ensaio **HTTP real do web final**, com dependências de desenvolvimento removidas e identificação de imagem iniciada por `46efc457` (prefixo informado; digest completo permanece com a infraestrutura). Este registro incorpora evidência da frente executora; esta frente local não repetiu o ensaio remoto nem acessou credenciais.

| Capacidade | Resultado comunicado |
| --- | --- |
| Login | Formulário de senha; origem inválida rejeitada com 403; senha incorreta com 303 seguro. Login válido seguido de **duas reaberturas de `/minha-area` com 200** e logout passaram. A correção de cookies da seção 15 foi validada no destino. |
| Oito compartilhamentos | Os oito aliases `/p`, páginas `/bizu` e saídas `/go` passaram; destinos externos comparados por igualdade ao original, sem visitar as lojas. |
| Bio | `/bio/<tenant>/<code>` redireciona para `/p/<alias>`, que redireciona para `/bizu/<slug>`. A infraestrutura corrigiu sua asserção que esperava bio → bizu direto; não houve mudança de aplicação para isso. |
| Exposição | Gateway Supabase em HTTPS disponível. DNS do web ainda aguardava o ensaio de atualização PostgreSQL 17.11 no momento do relato; não registrar troca pública como concluída. |
| Executor | Imagem final do listener ainda em construção no relato, com fontes automáticas mantidas desligadas. Não constitui aceite de execução nem de ociosidade. |

Continuam separados: smoke do listener final e janela ociosa da seção 17, captura humana BM1 no destino, eventual revisão/pauta manual e medições de uma hora/24 horas. Captura e triagem automáticas completas continuam condicionadas ao controle de gasto/provedor descrito na seção 17. Não houve chamada a marketplace, captura ou IA neste ensaio HTTP comunicado. O relato de funcionamento não certifica backup posterior dos oito registros, revogação com a imagem final, isolamento de todas as contas ou critérios que não foram explicitamente reensaiados.

## 19. Extensão 0.3.4: captura humana para revisão, sem continuação automática

Implementação local autorizada pela frente de infraestrutura após pedido humano de implementar a captura pela extensão. Ela substitui a pendência funcional da extensão descrita na seção 17; a publicação/ativação na VPS e a atualização da instalação no navegador continuam com a infraestrutura e o usuário. **Nenhum deploy ou flag foi aplicado por esta frente.** O BM1 real e seu replay foram aceitos separadamente pela infraestrutura; esta seção descreve a nova extensão.

### Entrega congelada

- [ZIP de produção para Chromium/Vivaldi](../../packages/extension/release/bizuminer-extension-v0.3.4.zip): 27.254 bytes, SHA-256 `91f81d8fb76d02c6d0f7ddc8a66d4d4552c267a34da042a4e00737e21a2dd5b4`.
- Pasta carregável `packages/extension/release/bizuminer-extension-v0.3.4/`, com `RELEASE.txt` e `release-manifest.json` que relaciona os sete arquivos do pacote com bytes/hashes. Seu manifesto de conteúdo tem SHA-256 `70d46ae7879376597941757b433d90de9c4f989adedef9a5ae449468391a6b2e`.
- [Manifesto de integração de fontes e artefatos](./extension-capture-v0.3.4-integration.json): 31 arquivos de runtime, cinco arquivos de validação e dois artefatos; SHA-256 `1c0ba3caa43ffe127a49615ec1dfaef5ef682ca9a38d744610a675e2f9449e34`. Contém hashes individuais dos scripts/popup/worker/bibliotecas da extensão e das oito fontes web necessárias.
- **Nenhuma migration nova.** Consumir esses arquivos junto do checkout reconciliado. Não transportar `.next*`, `node_modules` ou `*.tsbuildinfo` locais como artefatos do destino.

Build e empacotamento são produção por padrão. `build:dev`/`--dev` é escolha explícita e gera acesso somente a localhost; `package` força produção, recusa sobrescrever release existente e preserva versões anteriores. O manifesto de produção permite somente `https://www.bizuminer.com.br/*`, mantendo `activeTab`, `scripting`, `storage` e `alarms`, sem content script permanente nem permissão permanente nos marketplaces. Não foi adicionada `manifest.key`.

### Destino, pareamento e filas

O worker usa a origem compilada do pacote. Pareamento não tenta localhost após falha em produção e nenhuma preferência antiga permite trocar a origem. Token e filas ficam vinculados à origem e ao dispositivo. Estado legado sem esse vínculo exige novo pareamento; filas antigas/pausadas são mostradas e não são transferidas para outra conta após reconectar.

O usuário informou Vivaldi e ID instalado `cbcjpcldnpnkkncmgipikfmphcpbejfc`. Atualizar os arquivos no diretório efetivamente carregado e recarregar no Vivaldi preserva a instalação; carregar outra pasta pode mudar o ID. A infraestrutura coordena essa atualização e a allowlist, com cópia de reversão do diretório em uso. A pasta canônica 0.3.4 permanece separada; esta frente não sobrescreveu a instalação antiga nem alterou o navegador.

Cada envio preserva payload, timestamp e requestId originais, inclusive após reinício do service worker ou resposta perdida. Cliques e alarmes são serializados para evitar sobrescrita de filas. Outbox individual comporta até 200 entradas; há um snapshot de importação com até 200 produtos. Retentativas têm **máximo de seis tentativas totais**, timeout de 20 segundos incluindo leitura de resposta, backoff de 5 s/30 s/2 min/10 min e respeito a `Retry-After` quando enviado. A outbox para após 30 minutos; a validade do bulk é ancorada em `clientCapturedAt`, também 30 minutos. Não alterar a data de coleta para reutilizar payload vencido.

Alarmes são pontuais e só existem para trabalho devido; instalação, abertura do popup, consulta de pendências e filas vazias não fazem HTTP de captura. Erros permanentes interrompem retentativas e ficam visíveis; 401/revogação interrompem a sessão, com novo pareamento necessário. Falhas expiradas ou no limite não são descartadas silenciosamente nem migradas para outro dispositivo. Nenhuma captura é admitida por alarme sem um payload previamente confirmado pelo humano.

### API manual e configuração do servidor

| Variável | Contrato desta liberação |
| --- | --- |
| `EXTENSION_CAPTURE_ENABLED` | `true` somente na liberação autorizada pela infraestrutura; ausente/false fecha geração de código, exchange e ingestão. |
| `EXTENSION_CAPTURE_MODE` | `manual` explicitamente recomendado; ausente também significa manual. Valor inválido fecha a operação. `durable` é opt-in separado, não faz parte desta liberação. |
| `EXTENSION_ALLOWED_ORIGINS` | Lista exata, separada por vírgulas. Incluir `chrome-extension://cbcjpcldnpnkkncmgipikfmphcpbejfc` se esse continuar sendo o ID real. A origem própria usada no teste HTTP pode ser listada explicitamente. `*` não é aceito como autorização. |
| Fontes/IA/comercial | Manter Shopee/AliExpress API e Gemini desativados, sem ampliar orçamento, rollout global ou entitlement. Amazon/AliExpress browser continuam com seus opt-ins separados; o ensaio mínimo é Mercado Livre. |

Owner autenticado gera código em `/api/extension/pairing-codes` pela interface de dispositivos do Painel Admin. Exige Origin da própria aplicação, sessão/role/membership/conta ativas e role owner. Código dura dez minutos, é consumido uma vez por `POST /api/extension/pair/exchange` da origem permitida e retorna o token de dispositivo somente nessa troca. Nunca colocar token em URL/log/chat. Os dois endpoints limitam o corpo a 4 KiB e rejeitam JSON inválido/nulo como 400.

Captura individual usa `POST /api/extension/captures` com `mode:'manual'` e `Idempotency-Key` igual ao `requestId`; retorna `mode:'manual'`, produto/observação e **`publication:null`**. Captura de vários anúncios usa o endpoint existente `POST /api/extension/capture-batches` com `{mode:'manual',payload}` e **sem batchId**; não faz GET preparatório. Retorna quantidade de observações novas, IDs dos produtos e `duplicate` no replay. `GET /capture-batches` no modo manual retorna 409 `manual_import_required` sem criar/renovar trabalho, protegendo também contra o comportamento da versão antiga instalada.

Produto/observação/evidência são persistidos na conta derivada do dispositivo, com nova validação de autorização dentro da transação. Novos produtos recebem curadoria `pending` pelo trigger; decisões humanas anteriores são preservadas. A importação múltipla é atômica: falha num item reverte todo o conjunto. IDs de observação derivados de dispositivo/request/loja/produto reutilizam a unicidade existente; replay não reescreve preço/título nem duplica observações. Uso do dispositivo pode atualizar `last_used_at`. Não são criados publicação, alias, capture_run, capture_batch, triage_run ou chamadas de IA nesse modo. Continuam valendo revisão humana, recência, canal e atribuição para eventual entrada na pauta.

### Permissões verificadas

Mantêm-se `garimpa_app`/login limitado INHERIT, RLS e grants já reconciliados. Entradas de função necessárias: `authenticate_extension_device(text)`, `exchange_extension_pairing(text,text,text)` e `touch_extension_device(text)`, além dos helpers de identidade, tenant e evidência das seções 11/13. O runtime precisa ler conta/membership/roles/dispositivo e produto/observações/curadoria; gerar/revogar códigos exige as escritas de dispositivo já previstas, e ingerir fatos exige as escritas de produto/observação e o trigger de curadoria. O modo manual não exige INSERT de publicação. Não conceder EXECUTE a PUBLIC/anon/authenticated nem ampliar grants em todas as tabelas para corrigir uma falha isolada.

A suíte nativa usou **942 objetos literais** do baseline revisado, SHA-256 `143131cb89882497c755261bfb64a49c4a05c8512cc6b31e37e5b0812dc17ce1`, e **135 statements Garimpa literais** do arquivo de ACLs revisado, SHA-256 `0e6628c84f4c9611e7887e8009f4e39a451f1b0bb6a9ec55ad5d98799a2568a7`. `SELECT … FOR SHARE` da conta própria funciona com actor device/operator sem grant novo e impede suspensão concorrente atravessar a captura. A fronteira de atualização do dispositivo continua sendo `touch_extension_device` scoped/definer.

Limite do baseline explicitamente observado e comunicado à infraestrutura: grants/policy originais de `affiliate_account` já permitem UPDATE da própria conta sob o contexto SQL device/operator; UPDATE de outra conta foi negado. O probe de alteração foi revertido. Esta entrega não adicionou esse privilégio nem fornece SQL ao token da extensão; as rotas de ingestão não oferecem edição da conta. Não afirmar que o RLS legado nega essa atualização própria. O destino confirmou o mesmo catálogo de permissões; nenhum novo GRANT foi necessário para o lock.

### Evidência local e aceite no destino

Passaram typecheck da extensão e web, build web final, build/pacote de produção e verificação do manifesto. A suíte curta da extensão passou com 47 testes, incluindo execução direta de 11 cenários do worker; 27 testes web focais de contrato/origem/token/captura passaram. PostgreSQL 17.11 descartável validou atomicidade, replay concorrente, payload imutável, isolamento, revogações de dispositivo/membership/role/conta e suspensão concorrente. A prova literal de schema/ACL não foi substituída por alteração de SQL ou grants para fazer o teste passar.

O teste coordenado `test:extension-manual-http` passou com **Next e PostgreSQL reais locais**, Auth sintético e papel runtime limitado: geração/exchange de código de uso único, CORS exato, single/bulk manual, replay, payloads inválidos, GET legado bloqueado, ausência de publicações/execuções/IA, isolamento e revogação pela API. Nenhum marketplace ou provedor foi chamado. Os binários de teste foram apenas extraídos de pacotes oficiais em `/tmp`, sem instalação global ou ação na VPS.

Reprodução focal, em ambiente de teste com dependências próprias e build `.next-shared-links`:

```sh
npm run typecheck --prefix packages/extension
npm test --prefix packages/extension
node --experimental-strip-types packages/extension/test/service-worker.test.ts
npm run verify:manifest --prefix packages/extension
npm run test:extension-manual-native --prefix tools/editorial-tests
npm run test:extension-manual-http --prefix tools/editorial-tests
```

Os dois últimos aceitam `BIZUMINER_TEST_PG_BIN` para banco descartável; a prova literal também usa `GARIMPA_BASELINE_SCHEMA` e `GARIMPA_BASELINE_GRANTS` para arquivos locais de schema/ACL, nunca uma URL remota. No destino, a infraestrutura executará HTTP com papel real e o recibo humano original para captura individual. O bulk exige uma **nova coleta real** feita pelo usuário após recarregar a extensão: não fabricar timestamp nem afrouxar sua validade. Validar no Vivaldi o pareamento, a página/preview, a confirmação, o registro `pending`, replay e bloqueio após revogação, observando filas vazias sem chamadas. Aceite do navegador real e da imagem na VPS permanece com a infraestrutura; esta entrega não declara essa etapa concluída.

**Atualização do aceite no destino, comunicada em 12/11/2026:** a infraestrutura publicou o contexto `164757`, imagem identificada pelo prefixo `c7a01ce6`, com modo manual e CORS para o ID Vivaldi informado e a origem própria, mantendo automação/IA desligadas. O ensaio HTTP com o papel real `bizuminer_web` passou: geração de código 201, exchange 200 com ACAO exato, captura individual 200 e replay 200 com `duplicate=true` e o mesmo `observationId`. O produto humano já existente permaneceu único; ficaram duas observações (BM1 e extensão), curadoria `pending` e zero eventos de curadoria, publicações, lotes, rodagens ou triagens. Não houve nova coleta em marketplace nem IA.

A revogação respondeu 200 e a tentativa seguinte foi bloqueada com 401, sem alterar fatos/contagens. No destino, `authenticate_extension_device` oculta dispositivos revogados; por isso o aceite considera 401 ou 403, sem exigir exposição desse estado. A infraestrutura corrigiu essa expectativa no teste, conferiu o snapshot final e encerrou a sessão de teste local sem repetir a captura.

A pasta instalada no caminho da versão 0.3.3 foi atualizada pela infraestrutura com o conteúdo 0.3.4, após backup privado; os nove arquivos conferiram com o pacote canônico. Isso preserva o caminho carregado e seu ID, sem `manifest.key` nova. O usuário recebeu orientação para **Recarregar no Vivaldi, parear e realizar coleta bulk fresca**. Esse aceite do navegador continua pendente, assim como as medições operacionais já delimitadas. Esta atualização é documental: esta frente não executou código remoto, deploy ou testes adicionais.

## 20. Extensão 0.3.5: reconciliação de contagens e identidade do anúncio

No teste posterior do Vivaldi, o usuário informou **53 produtos identificados e 35 recebidos**. A infraestrutura conferiu 35 produtos/observações Mercado Livre na coleta de `2026-11-12T17:38:38.422Z`, além do produto humano anterior; zero publicação, lote, rodagem ou triagem. Esse resultado comprova persistência parcial da leitura, mas não identifica a causa dos outros 18 itens. O payload local foi limpo após o sucesso e o servidor não guardava rejeitados. **Não classificar retrospectivamente esses 18 como duplicados, inválidos ou erro de extração sem evidência.** A página externa atual não reproduz seu DOM histórico.

### Diagnóstico explícito, sem afrouxar a validação

`validateBrowserCaptureWithDiagnostics` preserva a normalização/rejeição anterior e informa `received`, `valid`, `duplicates`, `rejected` e `items`, com a igualdade `received = valid + duplicates + rejected`. Válidos são os anúncios únicos aceitos; duplicados são repetições dentro do payload; rejeitados têm índice original começando em 1, ID somente quando seguro e motivo de uma allowlist. Não são refletidos título, URL, parâmetros, HTML, sessão ou exceções brutas. Erros globais de versão/requestId/tempo continuam rejeitando o envelope, sem inventar um motivo por produto.

`POST /api/extension/capture-batches` manual acrescenta `diagnostics` à resposta e `alreadyRecordedCount` separado de `importedCount`. Este último conta **novas observações**, não produtos necessariamente inéditos; no replay, observações já gravadas não são reinseridas. Um lote com zero produtos válidos responde 400 com o diagnóstico completo e não chama a persistência. Lote parcialmente válido permanece aceito, mas a redução deixa de ser silenciosa. Não houve migration, alteração de RLS, grant, provedor ou ativação de automação.

A versão 0.3.5 apresenta “Última importação” com recebidos/válidos/duplicados/rejeitados, novas observações e já registrados, causas agrupadas e itens identificados por posição/ID. A exibição usa texto/DOM, sem interpolação HTML. Servidor antigo ou diagnóstico inconsistente produz **“informação indisponível”**, sem zeros ou explicações inferidos. O relatório é separado das mensagens temporárias do popup.

O worker guarda um recibo local limitado por **24 horas**, vinculado a origem/dispositivo/requestId, em gravação atômica com a limpeza do payload entregue. Assim ele continua visível após sucesso, fechamento/reabertura do popup, reinício ou alarme, sem novo HTTP. Rejeição definitiva também pode conservar o diagnóstico; entrega de resultado incerto continua na fila e não vira confirmação. Pareamento, logout, revogação ou mudança de escopo removem o relatório anterior. Cancelar uma leitura não apaga a explicação da tentativa já recebida na mesma sessão. Permanecem os limites de fila, seis tentativas e validade de coleta da seção 19.

### Divergência reproduzida e corrigida no leitor Mercado Livre

Os leitores `page-extractor.ts` e `card-extractor.ts` escolhiam o ID explícito de `wid` na query/fragmento ou de `pdp_filters=item_id:…`. Ao limpar uma **URL direta** fora de `/p/`, entretanto, removiam o identificador escolhido. Uma URL com ID A no caminho e anúncio B no parâmetro virava payload com `externalId=B` e URL de A; o servidor rejeitava corretamente esse par incoerente.

Os leitores agora preservam o anúncio explícito como `?wid=B` também nesse caso, mantendo host/caminho originais e removendo rastreadores. URL direta sem identificador adicional continua direta. A validação do servidor permanece estrita: catálogo sem anúncio, ID divergente de `wid` e a canonicalização antiga que perde B continuam recusados. Título, preço, timestamp e autorização não são reconstruídos nem alterados para passar na validação. Essa é uma falha demonstrada por fixtures, **não uma atribuição comprovada aos 18 itens históricos**.

### Artefatos e verificações

- [ZIP 0.3.5 de produção](../../packages/extension/release/bizuminer-extension-v0.3.5.zip): 31.196 bytes, SHA-256 `cdef99d2f472f04604bf970c50028e9ecf500a93abe11ca397ed0bb486021231`.
- [Manifesto de integração 0.3.5](./extension-capture-v0.3.5-integration.json): 33 fontes de runtime, oito fontes de validação e dois artefatos com hashes individuais; SHA-256 `8806d5e3279ca562278126e00f9409471b482e6701731839a5ddba4a95626a1f`.
- `release-manifest.json` do pacote: SHA-256 `cbec0a292ccd4d7a02556baeadcfd1632db3bd4ab9175942f42f6400bafe395d`. Os sete arquivos de conteúdo foram comparados a um novo build dos fontes finais. Releases anteriores e o caminho instalado não foram sobrescritos por esta frente.

Passaram typechecks web/extensão e build web, pacote/manifesto de produção, 60 testes da extensão (incluindo 16 cenários do worker e oito de relatório) e nove testes web focais. `test:extension-import-identity` liga os leitores reais de página/card ao validador estrito em fixtures de query, fragmento, `pdp_filters`, catálogo e URL direta; não navega nem captura uma página externa.

`test:extension-manual-http` passou novamente com Next/SQL reais locais, Auth sintético e PostgreSQL 17.11 descartável: uma fixture **deliberadamente sintética** de 53 entradas devolveu 35 válidas e 18 rejeitadas por preço inválido, com índices/motivos; replay devolveu zero novas observações e 35 já registradas; lote totalmente inválido retornou 400 sem escrita. Captura/pairing/revogação e ausência de publicação/execução/IA continuaram passando. Esses motivos pertencem à fixture, não ao envio histórico do usuário.

Ambiente, pareamento e grants continuam os da seção 19: modo manual, origem de produção fixa, CORS explícito para o ID real, sem wildcard ou fallback localhost. Atualização no caminho instalado, build/deploy e próxima coleta humana fresca ficam com a infraestrutura e o usuário. O aceite bulk do Vivaldi permanece condicionado a essa nova resposta explicada; esta frente não fez deploy, nova chamada de marketplace ou teste pago para esta correção.

### Discriminante posterior: URL real `/up/MLBU…`

O usuário informou depois que os 18 itens da nova tentativa foram rejeitados com `product_identity_invalid` e forneceu o link do anúncio `MLB7630035664`: caminho `/pisca-pisca-cascata-natal-400-leds-10m-8-funcoes-luz-quente/up/MLBU5148600495`, com `wid=MLB7630035664` no fragmento. Esse formato é diferente de uma URL direta `/MLB-…`; não foi presumido que trocar `/p/` por `/up/` resolveria o caso.

`extension-up-listing-probe.test.ts` executa os workers **empacotados** 0.3.4 e 0.3.5, a serialização de `executeScript`, o leitor DOM e o JSON de envio, usando esse href e um preço sintético somente para satisfazer o envelope. A versão 0.3.4 perde o `wid` antes do envio e reproduz a rejeição. A 0.3.5 preserva o anúncio no query `wid` e devolve um válido/zero rejeitados; trocar o ID por outro continua sendo rejeitado. O teste distingue a representação HTML `&amp;` do `&` exposto por `HTMLAnchorElement.href`; o literal não decodificado não prepara produto nessa fixture. Não houve visita ao marketplace ou nova captura real.

O harness standalone `tools/editorial-tests/extension-compiled-identity-probe.mjs`, SHA-256 `2f2f23c730ca0ad74246841f6a96fa88f4fb82a5030535a9af5174fd7ffde5f4`, reproduz a mesma cadeia com o export real do validador Next compilado, sem chamar o handler HTTP. A infraestrutura o executou também na imagem VPS `81866043`, sem rede ou credenciais/banco. Passou com `validatorSha256=c27f2c21d81f01dfcbfe11d48c4ab09eb44bcb3017c7321c2afaa82a8fc6c396` e `workerSha256=80e015c3f099dcbdd0cc13985080497c8051db6e2070f5e61d4fdbe874d50fed`, iguais aos locais. Para esse input, a hipótese de parsing da regex ou diferença do artefato publicado foi descartada; não se alterou runtime nem se gerou pacote adicional.

A conferência posterior dos dados reais explicou a repetição: as coletas registradas têm `client_captured_at=2026-11-12T17:38:38.422Z` e `2026-11-12T17:38:46.429Z` (14:38 em São Paulo), anteriores à atualização instalada 0.3.5 após 14:49. O recibo de 15:06:04 registrava a confirmação, não uma leitura nova. `PREPARE_BATCH` retomava o rascunho salvo, enquanto o botão “Ler” não esclarecia essa preservação. O leitor 0.3.5 correto, portanto, não era executado sobre a página nessa retomada. Esse discriminante comprova o mecanismo da tentativa repetida; não reconstrói o payload completo dos 18 rejeitados da primeira coleta.

## 21. Extensão 0.3.6: leitura identificada e releitura explícita

Correção exclusivamente do cliente, sem migration, grant, configuração de servidor ou novo build web. O pareamento e o modo manual continuam os da seção 19. Novos rascunhos registram `collectorVersion` como literal do build, além do `clientCapturedAt` original da coleta. A interface mostra data/versão da leitura e, no recibo, distingue coleta de confirmação. Rascunhos/recibos anteriores sem versão são identificados como versão não registrada; a extensão não inventa versão nem converte o horário do recibo em horário de coleta.

Com rascunho presente, **Retomar leitura** conserva payload, requestId e data. **Refazer leitura** é uma ação explícita para rascunho comprovadamente não enviado: `REFRESH_BATCH` só substitui o salvo após extração bem-sucedida, com novo requestId/data e versão 0.3.6. Falha de extração ou página sem ofertas conserva o rascunho anterior. Se houver envio, fila, tentativa ou identificador legado de lote, a substituição fica bloqueada; é necessário **Descartar leitura** explicitamente, com aviso de que o servidor pode já ter recebido os fatos e que descarte local não os remove. O worker revalida essa proteção independentemente dos botões. Filas vazias e a leitura do estado/recibo continuam sem HTTP.

### Pacote congelado e verificação

- [ZIP 0.3.6 de produção](../../packages/extension/release/bizuminer-extension-v0.3.6.zip): 32.570 bytes; SHA-256 `fb70fbba04991619bb86f0efc0cee13d0559d4e032835fda8e0ef3afbb546f87`.
- [Manifesto de integração 0.3.6](./extension-capture-v0.3.6-integration.json): 25 fontes somente do cliente, 14 fontes de validação e dois artefatos; SHA-256 `dd30567163f24badd4072c32c1903bfc9a386c91e3fa9c272ef2ccd15b9caf95`.
- `release-manifest.json`: SHA-256 `537fba9bfdec5f828eb5b00093d53e9ad8184062ad47f31a16fe2400471364a2`. Os sete payloads conferem com novo build de produção e os nove arquivos do ZIP conferem com a pasta canônica.

Passaram typecheck, **69 testes da extensão, incluindo 21 cenários do worker**, e pacote/verificação do manifesto. `tools/editorial-tests/extension-draft-upgrade-probe.mjs` executa os três workers empacotados: prepara no 0.3.4, retoma no 0.3.5 e reproduz `product_identity_invalid`; refaz explicitamente no 0.3.6 e o mesmo validador Next compilado aceita o `wid` correto. Confere também versão desconhecida do legado, falha de releitura preservando os dados, envio incerto bloqueado até descarte e metadados do recibo. Usa DOM/HTTP simulados e validador compilado real, **sem rede ou SQL**; não substitui coleta humana atual. Reprodução na raiz, com o build local de ensaio já existente em `packages/web/.next-shared-links`:

```sh
node tools/editorial-tests/extension-draft-upgrade-probe.mjs
```

A infraestrutura repetiu o probe causal independentemente e informou a atualização dos nove arquivos na pasta instalada estável `packages/extension/release/bizuminer-extension-v0.3.3`, preservando caminho/ID e backup privado 0.3.5. Esta frente apenas forneceu/conferiu o pacote e registrou a evidência; não fez deploy nem reativou rotinas. Naquele momento, a recarga e a coleta nova no Vivaldi ainda estavam pendentes. Posteriormente, a infraestrutura comunicou confirmação humana de três importações bem-sucedidas nas lojas testadas. Se existir envio incerto futuro, conferir o painel e usar descarte explícito antes da nova leitura. Nenhuma aprovação ou publicação de pauta é consequência automática da captura manual.

## 22. Conexões das lojas na conta existente, com rollout comercial desligado

Após a confirmação humana de três importações da extensão comunicada pela infraestrutura, o usuário tentou conferir a API Shopee em `/admin/onboarding`. A página dizia aguardar migration de workflows. O inventário somente leitura da infraestrutura confirmou `private_artifact`, `governance_decision` e `dispatch_control` presentes, com `commercial_rollout_ready()=false`. A causa não era estrutura ausente: o helper juntava estrutura e ativação num booleano, e a página bloqueava inclusive a configuração de lojas. Ela também buscava progresso SaaS e configurações que o componente não utilizava.

O link **Configurações → Conectar ou conferir minhas lojas** permanece em `/admin/onboarding`, agora limitado à conta existente resolvida pela sessão. A página não depende do gate comercial para renderizar conexões nem consulta progresso SaaS. A API `/api/admin/connections` continua a mesma: leitura com conta autorizada; salvar/testar exige ator humano proprietário, Origin válido e autorização transacional revalidada, inclusive depois da chamada externa. Operador não ganha escrita por ser administrador da plataforma. Tenant/affiliate fornecidos no corpo não substituem o escopo da sessão. Nenhum convite, entitlement, quota, rollout ou rotina é criado para liberar a tela.

A disponibilidade de envio privado de evidência Mercado Livre mantém seu gate separado e fechado; falha na sondagem desse gate não bloqueia as conexões. `verifiedWorkflowsStatus()` distingue `schema_missing`, `rollout_disabled` e `ready`; o wrapper booleano anterior permanece compatível. Governança e Experimentos continuam bloqueados quando necessário, com mensagem de ativação desligada quando a estrutura está instalada.

### Cofre e teste explícito da API

Shopee exige `appId`/`appSecret`; AliExpress exige `appKey`/`appSecret`/`trackingId`. Salvar usa o cofre cifrado da própria conta e redefine o resultado para `configured`, sem coleta, link, triagem ou publicação. A resposta não inclui credenciais/ciphertext. O campo adicional `secretStorageReady` é apenas booleano, calculado localmente pelo servidor; não cria endpoint, consulta SQL ou polling. Ausência/chave inválida bloqueia gravação de novas credenciais API com mensagem segura e mantém os campos Mercado Livre independentes. Para novas gravações, a configuração existente é `AFFILIATE_SECRETS_MASTER_KEY` ou a chave da versão padrão `AFFILIATE_SECRETS_KEY_V1`. Não gerar ou trocar chaves automaticamente; o booleano não atesta a capacidade de decifrar todos os envelopes históricos.

A infraestrutura informou que encontrou zero registros `affiliate_secret`, conferiu as ACLs de `bizuminer_web` e provisionou privadamente uma chave nova no web/executor, sem revelar valores. A carga do ambiente e o restart pertencem à frente de infraestrutura. Isso não habilita `SHOPEE_CAPTURE_ENABLED`, que permanece false. Credenciais reais da loja devem ser fornecidas pelo proprietário na interface; não foram lidas ou testadas por esta frente.

**Testar conexão** é ação explícita que chama somente a validação oficial da credencial, sem iniciar a rodagem. Corrigida uma falha do DAL: os adapters retornam `ValidationResult`, e o objeto `{ok:false}` era interpretado como sucesso por truthiness. Agora só `result?.ok === true` marca `verified`; recusa marca `failed`. Exceção/indisponibilidade devolve mensagem segura e preserva status/data anteriores, sem classificar falha de transporte como credencial recusada. Troca concorrente da credencial ou revogação durante a chamada impede registrar uma nova verificação. Uma chave versionada existente pode continuar testando seus envelopes mesmo sem habilitar a gravação com a chave padrão.

### Entrega e aceite

[Manifesto de fontes para o rebuild web](./store-connections-vps-integration.json): sete arquivos de runtime e quatro de validação, SHA-256 `34069dbcd4e8887f7cf6709d422a9c812182012697aa29f3e4a3385787df1327`. Não altera migration, grant, dependência, API de captura ou pacote da extensão. Preservadas as correções anteriores e seus artefatos congelados.

Passaram typecheck web, dez testes de página/UI/API, quatro de readiness e o teste específico em PostgreSQL 17.11 descartável. A prova nativa usa schema sintético de rollout compatível e adapters simulados; não é consulta à VPS nem validação de credenciais reais. Confere recusa/sucesso/transporte, armazenamento cifrado, chave ausente/inválida/versionada, owner/isolamento, rotação concorrente, suspensão e revogação antes/durante a validação, com rollout OFF e sem novos entitlements/convites/jobs/roles/memberships. O efeito da interface faz uma leitura ao abrir e após salvar/testar, sem timer de acompanhamento.

```sh
node --experimental-strip-types packages/web/test/account-connections-page.test.mjs
node --experimental-strip-types packages/web/test/workflow-readiness.test.mjs
```

Teste nativo, no diretório `tools/editorial-tests`, com `BIZUMINER_TEST_PG_BIN` e bibliotecas PostgreSQL locais já disponíveis:

```sh
node --import tsx account-connections-native.test.ts
```

**Aceite no destino comunicado pela infraestrutura em 12/11/2026:** contexto `20261112T192844.783647Z`, imagem web `sha256:34171b6eaba29b259ed006b5908c1632cb53cb837157cad7c87259bd01b6ecb8`; imagem anterior `81866043…` retida. Build de produção e smoke de inicialização sem rede/SQL passaram. A infraestrutura publicou somente o web e confirmou health, preservando os opt-ins das três lojas da extensão; o executor não foi reiniciado.

No ensaio HTTP autenticado do destino, `/admin/onboarding` retornou 200 com campos Shopee; `GET /api/admin/connections` retornou 200, `schemaReady=true` e `secretStorageReady=true`, sem segredos. Acesso anônimo foi bloqueado com 401 na cadeia HTTP completa, e o logout usou `scope=local`. Não houve POST de credenciais, teste externo de loja, captura ou IA. `SHOPEE_CAPTURE_ENABLED=false` permaneceu. Essa evidência comprova abertura/leitura da tela; **não comprova a aceitação do POST de salvar**, cuja falha de origem foi identificada depois e está na seção 23. Salvar/testar credenciais reais continua sendo ação do proprietário, e a jornada automática permanece condicionada às autorizações e ao controle de gasto das seções anteriores. Esta frente implementou/testou localmente e registrou o resultado comunicado; não executou deploy remoto.

## 23. Origem das mutações administrativas atrás do proxy

Ao salvar a conexão Shopee, o usuário recebeu “Origem inválida”. A infraestrutura reproduziu o defeito com sessão válida, HTTPS e Origin público correto, usando somente `{marketplace:"unsupported_probe",fields:{}}`: o POST retornou 403 antes da validação dos campos. GET da página/API continuava funcionando. Não foi um erro de credenciais, cofre ou SQL: nove rotas administrativas comparavam o Origin do navegador com `request.nextUrl.origin`, que no destino representa a URL HTTP interna do serviço atrás do Caddy. O ensaio anterior somente de leitura não cobria essa barreira de escrita.

`packages/web/lib/admin-request-origin.ts` centraliza a verificação em `adminMutationOrigin(request)`, que devolve a origem aprovada ou null, sem HTTP/SQL. Em produção, a única referência permitida é `NEXT_PUBLIC_SITE_URL` válida e HTTPS, já configurada como `https://www.bizuminer.com.br`; ausência/configuração inválida fecha a operação. Host, URL interna e headers Forwarded/X-Forwarded-* não escolhem nem ampliam a origem aceita. Não há fallback para HTTP/localhost em produção. Origin é obrigatório e deve ser exatamente a origem serializada, sem path, credenciais, query, fragmento, lista ou representação opaca `null`; `Sec-Fetch-Site: cross-site` e metadados desconhecidos também são recusados.

No desenvolvimento sem origem configurada, o fallback admite somente Host loopback exato (`localhost`, `127.0.0.1` ou `[::1]`), protocolo/porta correspondentes e Host sintaticamente válido. `localhost` e `127.0.0.1` não são intercambiáveis; o Host preserva essa distinção quando NextURL normaliza o loopback. Configuração explícita inválida não aciona fallback. HTTP configurado só é aceito fora de produção e em loopback.

Os guards foram substituídos nas nove rotas `/api/admin/connections`, `/workspace`, `/work-drafts`, `/marketing`, `/artifacts/upload`, `/rodagem/lote`, `/rodagem/navegador`, `/monitoring/dispatch` e `/monitoring/policy`. Workspace usa a origem validada também ao gerar o artefato, evitando URL interna nesse resultado. Permanecem autenticação, proprietário, isolamento, gates de conta/rollout, limites de corpo, respostas/cookies e condições de escrita existentes. GETs que já dispensavam Origin continuam assim. O helper não concede autorização por conta nem habilita rotina; as verificações de sessão/feature anteriores ao guard continuam existindo. Login, CORS/pareamento da extensão e pacote 0.3.6 foram preservados.

### Fontes e prova local

[Manifesto do delta de origem](./admin-origin-vps-integration.json), sobre a imagem `34171b6e…`: dez arquivos de runtime, quatro de validação e hashes de três fronteiras preservadas; 3.500 bytes, SHA-256 `9ca3c39606745981c33cf419b2b59976dc9de9966a11c0d909d77627cb59eacf`. Sem nova migration, grant, dependência ou variável de ambiente. Os manifestos anteriores registram os fontes/testes daquela entrega; este descreve a revisão atual dos testes de POST.

Passaram typecheck web e **38 testes focais**: sete do helper, 18 das rotas e 13 da página/API de conexões. As nove rotas tiveram 72 recusas de origem e 18 verificações de autenticação, antes de leitura do corpo, mutação ou efeito externo. A regressão usa NextRequest real com URL interna HTTP, origem pública HTTPS e metadados de proxy conflitantes: POST legítimo alcança a validação e retorna 400 de input inválido; origens ausentes/nulas/malformadas/externas e cross-site continuam 403 sem gravação/dispatch/chamada de loja. Há casos de configuração ausente/inválida, esquema/porta, lookalike, Host/Forwarded falsificados e loopback estrito. Dois revisores independentes não encontraram bypass na revisão focal.

```sh
node --experimental-strip-types packages/web/test/admin-request-origin.test.mjs
node --experimental-strip-types packages/web/test/admin-origin-routes.test.mjs
node --experimental-strip-types packages/web/test/account-connections-page.test.mjs
```

O fluxo existente `tools/editorial-tests/capture-route-flow.test.ts` também passou com o helper real e origem de fixture explícita: POST → SQL/RLS local em memória → dispatch simulado em duas contas, mantendo recusas por identidade, suspensão, credenciais e kill switch. Nenhuma chamada de marketplace/IA ou banco remoto foi realizada; não foi necessário repetir a suíte PostgreSQL nativa. Não houve build completo local adicional.

**Aceite no destino comunicado pela infraestrutura em 12/11/2026:** contexto `20261112T195942.898664Z`, imagem `sha256:67a6c07f50205cc1493508e7706801462b09e5552a7f62d0ba1cffa25fc03e72`; imagem anterior `34171b6e…` retida. Build de produção retornou 0, smoke de inicialização passou e somente o web foi publicado, saudável, preservando as três lojas da extensão.

O ensaio autenticado repetiu exatamente o payload inválido da reprodução: POST com Origin `https://www.bizuminer.com.br` retornou **400 de validação de campos**, superando o antigo 403 de origem. Origem externa, ausente, `null` e `Sec-Fetch-Site: cross-site` continuaram 403; acesso anônimo, 401. Login, `/admin/onboarding` 200, GET de conexões 200 com cofre disponível e logout `scope=local` passaram, sem segredos retornados. Recibo privado da infraestrutura: `store-connections-origin-fixed.json`.

Não houve POST com credencial válida, chamada à API da loja, captura ou IA. `SHOPEE_CAPTURE_ENABLED=false` permaneceu. A prova confirma a barreira de origem e os acessos dessa imagem; o proprietário ainda deve atualizar a página e salvar/testar sua conexão real. O runtime permaneceu congelado no manifesto acima. Esta frente implementou, revisou e testou localmente; não executou deploy remoto.

## 24. Conexão Shopee verificada e captura ainda desligada

Após o usuário salvar/testar a Shopee, a infraestrutura confirmou somente leitura: configuração ativa, conexão `verified` às 17:17:48 de São Paulo em 12/11/2026 e segredo ativo presente. Web e executor continuam com `SHOPEE_CAPTURE_ENABLED=false`; Gemini ausente. O web já carregou a chave do cofre; o contêiner antigo do executor ainda não, embora seu arquivo de ambiente tenha sido provisionado. Não é necessário duplicar as credenciais da conta nas variáveis globais antigas da Vercel ou em `.env`. O fallback dessas variáveis pertence apenas ao tenant `local`.

Identificada outra dependência legada da interface: `platform-gates.ts` verificava também credenciais globais para habilitar o botão, embora o preflight/worker resolvam as credenciais cifradas por conta. Corrigido localmente: o gate visual de API verifica somente a flag explícita da instalação; autorização, chave e credenciais da conta continuam sendo exigidas no backend. Mensagens de Shopee/AliExpress em Rodagens agora distinguem conexão salva de ativação da captura, sem alegar falta de variáveis globais. Dois testes focais e typecheck web passaram. Essa correção local ainda não foi publicada.

Continuam pendentes a liberação operacional delimitada da fonte, o executor carregar a chave existente e a decisão sobre a triagem: o lote atual chama Gemini, cuja chave está ausente e cujo gasto não está coberto pelo limite OpenRouter. Não ativar a rodagem para contornar essas dependências. Esta conferência não alterou flags, reiniciou serviços ou chamou provedores; a infraestrutura foi informada dos fontes locais e dessas condições antes de qualquer nova publicação/ativação.

## 25. Resolução autorizada: Shopee e triagem com orçamento limitado

O usuário respondeu **“então resolva”** ao diagnóstico da seção 24. A implementação local passou a suportar triagem explicitamente por OpenRouter, mantendo Gemini como contrato legado e preservando o teto agregado de US$ 1 da chave de ensaio. A infraestrutura confirmou por consulta de metadados, sem inferência: uso acumulado US$ 0,038827993, saldo US$ 0,961172007, sem reset periódico. Não copiar a chave padrão de outro serviço nem publicar valores privados. A mesma chave limitada é provisionada pela infraestrutura em variáveis privadas do web/executor; não em `NEXT_PUBLIC_*`. A seleção `AI_CURATION_PROVIDER=openrouter` nunca faz fallback para Google, outro modelo ou chave.

### Provedor e execução

`AI_CURATION_MODEL=openai/gpt-4.1-mini` foi conferido no catálogo oficial pela infraestrutura e na [página do modelo](https://openrouter.ai/openai/gpt-4.1-mini): suporta saída estruturada, com preço informado de US$ 0,40/M tokens de entrada e US$ 1,60/M de saída. Essas tarifas não são um contador monetário local; o limite financeiro continua aplicado pela chave externa. `AI_CURATION_MAX_OUTPUT_TOKENS` aceita 1–8192, com padrão normal 8192; o ensaio de um produto usa 1024. Não manter 1024 como promessa suficiente para lotes normais de 25 produtos.

O transporte usa somente `https://openrouter.ai/api/v1/chat/completions`, sem redirects, retries, fallback de provedor/modelo ou ferramentas. Há uma tentativa por chunk, timeout de 60s, corpo máximo 32KiB e resposta máxima 256KiB. JSON/schema, cardinalidade, IDs completos, campos e enums são conferidos; recusa, truncamento e `finish_reason` diferente de `stop` falham antes da aplicação das decisões. Erros devolvem apenas código/tipo/status seguros, sem chave, prompt ou corpo do provedor. Falha de quota/modelo/transporte não vira triagem bem-sucedida com lista vazia. `triage_run` registra o modelo e provedor realmente selecionados.

O preflight local `aiCurationReadiness()` não chama o provedor: exige provedor conhecido e chave/modelo/limites configurados. A rota de criar/retomar lote local ou durável devolve 503 antes da mutação quando a triagem está indisponível; cancelamento continua permitido. Os CLIs de lote/triagem conferem configuração antes do trabalho. Existência remota/permissão de inferência do modelo continuam sendo conferências distintas; HTTP 404/402/403 não dispara fallback. Não foram alterados rollout comercial, entitlement, convites, Auth ou histórico selecionado.

### Ensaio limitado persistido

Ativar explicitamente `CAPTURE_TRIAL_MODE=single_product` e `CAPTURE_TRIAL_TENANTS=local` no ambiente autorizado. A infraestrutura confirmou que o proprietário possui somente esse tenant ativo, já presente em `CAPTURE_WORKER_TENANTS`; antes do ensaio havia zero produtos/curadorias/publicações Shopee vivos, zero lotes/capturas, e quatro triagens antigas em erro sem execução ativa. Não recuperar essas triagens antigas automaticamente.

O lote exige Shopee exclusivamente e executor durável; persiste `execution.trial={mode:'single_product',version:1}`, uma página, um produto e o plano imutável `single-product-v1`/consulta `single-product-casa-v1` (“organizador para casa”). A seleção e os limites participam do conflito da chave idempotente. Resposta maior que a solicitada é truncada antes do ingest, inclusive para produtos já conhecidos. O plano normal permanece disponível fora do opt-in.

Máximo de efeitos externos por lote de ensaio:

| Etapa | Limite |
| --- | --- |
| Captura oficial Shopee | Uma consulta, uma página, uma tentativa HTTP; sem redução/fallback de página nem nova validação de credencial pela rede. |
| Link afiliado | Até um candidato do lote, uma tentativa HTTP, somente se ainda precisa de link. Mais de um candidato é recusado antes de gravar publicação/chamar o provedor. |
| Triagem | Até um produto, um ciclo e uma chamada OpenRouter, se sobreviver aos filtros determinísticos; sem drenar backlog ou repetir chamada. |

Cada etapa externa tem marca persistida **antes** da tentativa. Falha, resultado incerto, crash ou reentrada deixam o ensaio aguardando reconciliação, sem repetição automática; publicação SQL idempotente conserva staging/lease/tenant. No máximo três requisições externas, das quais até uma inferência paga, dentro do hardcap compartilhado. Uma resposta sem oferta/candidato elegível não prova triagem de IA e não autoriza inventar produto/preço para completar o teste.

O CLI de triagem recebe `--trial-single-product --limit 1`, exige batch/worker, aplica `autoPublish=false` e `autoDismissScore3=false`. O ensaio não recompõe a homepage nas fases de publicação de fatos, link ou triagem. Novos produtos continuam sujeitos à revisão humana; os fatos podem ser confirmados atomicamente e o link afiliado registrado internamente sem constituir oferta pública elegível. A pauta/vitrine vazia é resultado válido antes de aprovação/canal/elegibilidade. Os oito compartilhamentos arquivados continuam separados. Rodagens mostra aviso de ensaio e oculta o seletor de páginas da Shopee, evitando prometer um lote maior que o permitido.

### Entrega e validação local

[Manifesto da integração Shopee](./shopee-capture-vps-integration.json): 16 arquivos de runtime e nove de validação, 5.518 bytes, SHA-256 `e17cc6cb4d8d23eb894e44b42dc7ea7fa586d98069ef49bf7dbc0b2dd81c0ee8`, sobre a imagem `67a6c07f…`. Sem migration, dependência ou grant novo. Os fontes incluem a correção de gate/mensagem da seção 24; credenciais por conta não precisam ser duplicadas nas variáveis globais antigas.

Passaram typechecks web/persistence/capture, **694 testes web**, testes do cliente/plano de ensaio e jornada PostgreSQL 17.11 descartável. O sandbox inicialmente impediu testes de interfaces locais/subprocessos; a repetição local autorizada da suíte completa passou sem mudar fontes para contornar o teste. A prova SQL executa uma requisição Shopee simulada com três resultados, conserva somente um em staging invisível e publica um fato; confere idempotência e marcas anteriores às três etapas, falha/crash/reentrada sem nova chamada e retry normal preservado. Provas suplementares cobrem credenciais/configuração, schema/IDs/refusal/truncamento/quota/transporte OpenRouter, um link/limite de candidatos e CLI trial versus drain normal. Nenhum provedor real foi chamado pela frente local.

Comandos focais, com dependências já disponíveis:

```sh
npm test --prefix packages/web
npm run typecheck --prefix packages/web
node --experimental-strip-types packages/web/test/ai-curation-provider.test.mjs
node --experimental-strip-types packages/web/test/capture-ai-readiness.test.mjs
node --experimental-strip-types packages/web/test/triage-trial-cli.test.mjs
node --experimental-strip-types packages/web/test/capture-affiliate-trial.test.mjs
```

`tools/editorial-tests/capture-trial-native.test.ts` usa binários PostgreSQL descartáveis via `BIZUMINER_TEST_PG_BIN`, sem URL remota. Os testes não consomem a chave financeira real.

**Pendente no destino:** revisão do contrato/fontes, build web e executor novos, provisionamento privado da mesma chave limitada/modelo/cofre, preflight sem provedor e nova conferência de filas/backlog antes de recriar o executor. Só então habilitar a Shopee nos serviços necessários e executar um pedido idempotente do tenant/fonte autorizados. Conferir fatos, decisão/pendência, ausência de oferta pública indevida, replay, contagem de chamadas e uso real da chave. AliExpress API, rotinas antigas, rollout global e entitlements permanecem fora da ativação. A frente local não executa instalação/deploy na VPS e não declara jornada real concluída pelo término dos subagentes.

## 26. Correção do contrato GraphQL Shopee e retomada do ensaio

### Estado real e evidência remota

A infraestrutura informou publicação do contexto `20261112T204728.485625Z`, com imagens web `88b72792…` e executor `3423e578…`, após a entrega da seção 25. A tentativa real do lote `5bbef2af-1781-4a02-a650-1ce6da448796`, requestId `81c0a62f-a59e-407d-b75c-6700e730698e`, criou o capture_run `f04b08c8-1d7f-4b49-b610-f8055bfe895d`: erro `10010`, `graphql: got null for non-null`, entre `2026-11-12T20:55:52.535Z` e `20:55:52.911Z`, sem produtos/observações. **Houve chamada à API.** A contagem inicial que omitiu capture_run não sustentava a hipótese de falha anterior à rede; essa interpretação foi corrigida. O lote permanece aguardando reconciliação, com a marca de tentativa conservada, até cancelamento explícito autorizado pela API proprietária.

Foram relatadas quatro sondagens posteriores: omissão de variáveis nulas ainda produziu 10010; seleção somente de pageInfo também falhou; argumentos literais com limit 1 produziram 10000; pageInfo com argumentos literais e limit 10 funcionou. São cinco chamadas incluindo a captura original, não cinco capturas concluídas. O último resultado não comprova os campos de nodes, geração de link ou triagem. Não houve inferência OpenRouter nessa tentativa. Não atribuir retrospectivamente a causa a banco, credencial, variáveis GraphQL ou tamanho de página sem evidência adicional.

### Contrato oficial e correções locais

As páginas oficiais foram lidas no navegador autenticado: [requisição/resposta](https://affiliate.shopee.com.br/open_api/document?type=request_response), [Product Offer](https://affiliate.shopee.com.br/open_api/list?type=product_offer), [Short Link](https://affiliate.shopee.com.br/open_api/list?type=short_link) e [autenticação](https://affiliate.shopee.com.br/open_api/document?type=authentication). Variáveis GraphQL são opcionais e suportadas. A assinatura é SHA256 de AppId + timestamp + corpo efetivamente enviado + Secret; o cliente já assina esse mesmo corpo serializado, sem alteração de autenticação.

O builder de filtros gerais omite argumentos ausentes, remove listType (modo separado com matchId), aceita somente ordenações documentadas 1–5 e exige keyword para relevância. Departamento padrão omite sortType; vendas mantém 2; ordenação por desconto é recusada antes da rede. A seleção retira o campo legado price e mantém priceMin/priceMax. O builder literal fecha os nomes permitidos, valida inteiros e escapa strings; é uma alternativa compatível com os exemplos oficiais, não uma alegação de que variables não funciona. Erro GraphQL determinístico não recebe retry nem fallback de página.

O ensaio agora solicita até **dez ofertas remotas**, em uma página/tentativa, e corta o resultado antes do ingest para persistir **no máximo um produto**. Isso usa um valor observado funcionando, sem afirmar mínimo oficial de dez. O teto normal de 50 é a política local existente; menção isolada a SDK de terceiros não prova limite contratual. O resumo trazido pelo usuário cita schema do Explorer e 44 testes; sem os artefatos correspondentes, esses números/tipos não são usados como nova comprovação de rede.

O parser monetário aceita decimal com ponto e vírgula; tipo String/String! não prova formato regional. O mapper preservado mantém range quando máximo excede mínimo e from sem price legado, inclusive quando mínimo e máximo são iguais. Variante continua desconhecida; máximo não vira preço riscado e igualdade não confirma uma opção específica. productLink continua sendo a URL de origem; a geração de shortLink permite até cinco subIds e será conferida com o destino real do ensaio, sem inferir atribuição a partir de uma URL sintética.

### Delta, validação e aceite restante

[Manifesto do delta GraphQL/diagnóstico](./shopee-contract-fix-vps-integration.json) sucede o manifesto imutável da seção 25 e delimita os fontes para web/executor. Sem migration, grant, dependência ou segredo novo. Diagnósticos de falha passam a conservar somente fase/código permitidos, SQLSTATE permitido e medidas limitadas do subprocesso, sem mensagens brutas, SQL, caminhos, credenciais ou corpos de fornecedor. Reentrada mantém o primeiro diagnóstico e não libera repetição automática.

Passaram os testes focais de capture (quatro arquivos), 21 testes web de processo/link/CLI e sete testes de diagnóstico/plano persistence, além dos typechecks dos três pacotes. Um único teste de integração PostgreSQL 17 descartável passou com APIs simuladas: página de dez resultados limitada a um fato, staging invisível, publicação atômica, replay sem efeito, isolamento, marcas anteriores a cada etapa, falha/crash/reentrada sem repetição e diagnósticos sanitizados. Duas fixtures foram atualizadas para conferir a consulta literal atual e preços mínimo/máximo. A suíte completa de 694 testes pertence à entrega anterior; não foi repetida nem apresentada como prova deste delta. Nenhum teste local chamou Shopee/OpenRouter.

O usuário pediu pausa e posteriormente autorizou retomar. A infraestrutura receberá o freeze para um build de web/executor e um ensaio novo com requestId estável, depois da reconciliação do lote antigo. Conferir capture_run e resposta completa de nodes antes de inferir sucesso/falha; até um fato e link, triagem com autoPublish=false, pendência visível no admin, replay sem nova chamada e orçamento agregado preservado. Uma publicação interna para atribuição não equivale a oferta pública aprovada. A passagem para pauta exige revisão/aprovação explícita e elegibilidade vigente; os oito compartilhamentos arquivados permanecem separados. Encerrar verificando o executor ocioso em LISTEN, sem consultas repetitivas de trabalho, chamadas externas ou reativação de rotinas. O aceite remoto continua pendente até seu resultado ser registrado abaixo.

### Aceite remoto da captura, link e triagem em 12/11/2026

A infraestrutura construiu e publicou somente web/executor sobre o contexto `20261112T222136.904825Z`, após preflight sem trabalho executável/triagem ativa. Build e smokes passaram; os onze hashes runtime foram conferidos nas duas imagens: web `sha256:70d46e1d0f8fedde95f75a227a2138a89888fed08b03c518e718ae0e878b9a25` e executor `sha256:86935b621ec932cecd8057533facdbd0476fa7f1dec409067fc45dad5674ac7d`. Manifesto do contexto: `722cac6ee32f26a4578f9a40bd9abe42a0a1239274885df389e816790dbe4040`. O delta de integração tem 6.338 bytes, SHA-256 `b29eae08901be62ea07ab6ae36bc869747cda1384597a79ef883d67719894884`.

O painel autenticado respondeu 200, apresentou aviso de ensaio e deixou de mostrar a mensagem antiga sobre SHOPEE_APP_ID/SHOPEE_APP_SECRET. O cancelamento proprietário do lote original respondeu 200 e o encerrou preservando o capture_run, o erro e as marcas de tentativa. O novo requestId `19fb5ece-0d59-4604-af80-d269db28cfc0` gerou o lote `d9244be6-c5a6-4fa7-bebe-dbecd2332190`, concluído com status ok/fase finished. O capture_run `0d7633d9-1384-446b-8b70-e129849032f3` passou entre `22:30:23.867Z` e `22:30:30.077Z`: uma página remota com limite dez, um produto e uma observação persistidos. Isso comprova o contrato corrigido nessa consulta, sem isolar retrospectivamente qual incompatibilidade causou o erro anterior nem estabelecer limite mínimo universal.

O produto `a463be7a-95a6-4858-bce7-e7e7d75c77d2`, externo `22099046331`, preservou evidência BRL/range de 1.145 a 1.999 centavos (R$ 11,45–19,99). Foi gerado um destino afiliado em `s.shopee.com.br`, registrado em publicação interna. A triagem `1e31820b-c1f2-427f-acc0-1a66c52ed4df` concluiu com o modelo configurado, um item processado/anotado e zero aprovados. Curadoria permaneceu pending; zero candidatos públicos e rollout comercial false. Não foi realizada aprovação editorial nem publicação pública para forçar o aceite.

A coordenação comparou diretamente `infraestrutura-vps/private/shopee-contract-snapshot.json` e `shopee-contract-after-replay.json`: lote, capturas, produto/observação, vínculo afiliado, triagens, lote original e candidatos públicos permaneceram iguais após o replay. Continuaram um capture_run, uma observação, um produto, uma triagem e zero lotes executáveis. SHA-256 do recibo after-replay: `6157d77ae33b1ce9489b301da0827f9dbccab3e57d165bc1c36019edd30d5884`. Metadados privados de orçamento conferidos, sem ler a chave: uso acumulado US$ 0,039532393, saldo US$ 0,960467607, teto US$ 1 sem reset; diferença do ensaio US$ 0,0007044. A configuração de ensaio de um produto e a revisão humana permanecem; liberação de lotes maiores e rotinas não fazem parte desse aceite.

A infraestrutura observou o executor em LISTEN sem novas consultas de trabalho durante uma janela de aproximadamente **78 segundos**, após a conclusão/replay. Isso comprova a ociosidade nessa janela, sem prometer ausência de consultas de recuperação em uma futura perda de conexão. Rotinas automáticas, outras fontes API e rollout comercial não foram reativados. O aceite de captura oficial → fato persistido → link afiliado → triagem/pendência → replay e retorno à ociosidade está concluído no modo de ensaio delimitado. Aprovação editorial e entrada na pauta continuam sendo ações posteriores explícitas, sujeitas a elegibilidade e preço/variante confirmados.

[Recibo sanitizado consolidado](../../../infraestrutura-vps/reports/shopee-canary-20261112.json), SHA-256 `a0542cb4e1a64344402edbbad89b9306c481e129cd12faf53cb9678a4a0219ad`, conferido diretamente pela coordenação: onze fontes iguais ao manifesto, checks autenticados, contadores de replay, orçamento e ociosidade. Entre `22:30:45.529409Z` e `22:32:03.182896Z`, as chamadas SQL do executor ficaram em 474, com reset/deallocation inalterados, uma sessão idle/LISTEN e fila executável vazia. O link de origem HTTPS/host/ID e o host HTTPS do shortlink foram conferidos; não se seguiu redirecionamento para fabricar clique nem se alegou comprovação de conversão comercial.

## 27. Shopee liberada no fluxo normal de produção

Em novo pedido explícito, o usuário autorizou liberar a Shopee em modo total no fluxo de produção. A infraestrutura removeu **CAPTURE_TRIAL_MODE e CAPTURE_TRIAL_TENANTS**, em vez de atribuir a string false, dos ambientes do web e do executor, e recriou os dois serviços nas mesmas imagens aprovadas da seção 26. Ambos ficaram saudáveis, com SHOPEE_CAPTURE_ENABLED=true e executor durable; AI_CURATION_MAX_OUTPUT_TOKENS passou de 1024 para 8192 nos dois processos, adequado ao contrato normal de até 25 produtos por chunk. Não houve mudança de fonte, migration, grant ou novo build.

Novas rodagens deixam de receber o override de uma consulta/um produto. O endpoint individual da Shopee delega ao mesmo fluxo de lote: respeita as páginas selecionadas (1–3), plano padrão por departamentos, ordenação por vendas e tamanho normal de página (20 por padrão, até 50). O executor conserva staging, publicação atômica dos fatos, vínculo afiliado, triagem, isolamento por conta, idempotência e tratamento normal de falhas. Lotes antigos conservam seus próprios metadados de ensaio/histórico e não são convertidos nem reexecutados por essa configuração.

O limite agregado da chave OpenRouter continua US$ 1; a liberação do modo normal não amplia o orçamento nem adiciona fallback de provedor. As regras editoriais existentes também foram preservadas: a infraestrutura confirmou ausência de configuração personalizada e fallback autoPublish=false/minScoreAutoPublish=4. Não foi forçada aprovação para divulgar o produto do ensaio. A pauta permanece sujeita à revisão e elegibilidade, incluindo confirmação de preço/variante quando necessária.

Preflight e conferência após a recriação mantiveram dois lotes/dois capture_runs, 339 observações e cinco triage_runs, zero lotes executáveis e zero triagens em execução; nenhuma nova rodagem foi criada para testar a remoção do limite. O ensaio real anterior comprova captura/link/IA; a mudança atual é de configuração do modo de operação, validada nos serviços e no contrato normal. Outras fontes API, rollout comercial global, rotinas agendadas e configurações editoriais não foram ativados ou alterados por esse pedido.

A coordenação conferiu diretamente os recibos `infraestrutura-vps/private/shopee-production-mode.json` e `shopee-production-http.json`: web/executor saudáveis, flags trial ausentes, limite de saída 8192, Shopee habilitada e estado antes/depois idêntico. GET autenticado de `/admin` e da aba Rodagens respondeu 200; botão da Shopee habilitado, seleção normal de uma, duas ou três páginas disponível, controles de plano presentes e avisos de ensaio/credenciais globais ausentes. A sessão de conferência foi encerrada. Foram zero POSTs de captura nessa liberação. O modo normal está disponível ao proprietário no painel, sem o limite artificial de um produto.

[Recibo sanitizado da liberação em produção](../../../infraestrutura-vps/reports/shopee-production-20261112.json), SHA-256 `44f26fcbff4868bcbc17739cbde337d46a168d94e90a9a75bd2287bf7dd42b44`, consolidado pela infraestrutura e com integridade conferida pela coordenação.
