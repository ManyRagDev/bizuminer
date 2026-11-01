# Plano de implementação do desempenho de navegação

Data: 21/10/2026. Atualizado em 31/10/2026. Estado: implementado, revisado e publicado em produção; execução efetiva em São Paulo verificada. Escopo restrito a região efetiva, duplicidades, reaproveitamento por requisição e carregamento da aba aberta. Preservar consultas e regras de negócio. As entregas de 23/10 e as etapas amplas ao fim deste documento são referências históricas, não o escopo da implementação atual.

O objetivo é fazer os cliques responderem imediatamente e reduzir o tempo para abrir vitrine, produto, área pessoal e painel, em localhost e em produção. A implementação deve reduzir o trabalho no banco, reaproveitar leituras da mesma requisição, preservar a interface durante a navegação e corrigir a gestão de conexões e a localização das funções.

Em 23/10/2026 o usuário autorizou aplicar as otimizações. A migration incremental `20261023041600_optimize_public_link_reads.sql` foi aplicada no Supabase `spbuwcwmxlycchuwhfir`; o domínio `www.bizuminer.com.br` foi direcionado ao deployment `dpl_4yKZYb6goUuEtQnyrNUm41hsr7R3`, projeto Vercel `web`, com região `gru1`. O código publicado inclui as alterações locais de navegação reconciliadas com este plano. Não é necessário criar outra cadeia de OS para este objetivo.

## Plano vigente — eficiência da aplicação, sem reescrita das consultas de negócio

Este roteiro atende ao pedido final de 31/10/2026, foi implementado e publicado conforme o registro abaixo e substitui o roteiro amplo histórico. A entrega reduz trabalho redundante mantendo produtos, preços, histórico, critérios, ordenação, paginação e contratos HTTP. A quantidade de comandos SQL será um indicador diagnóstico; o aceite depende da experiência e dos resultados preservados.

### 1. Corrigir a região efetiva

- Manter Vercel e Supabase atuais, com execução das funções que acessam o banco em São Paulo (`gru1`). Alinhar `vercel.json`, `preferredRegion` do Next.js e o processo de publicação; usar `--regions gru1` no deploy via CLI.
- Conferir a região dos artefatos de função e do deployment que atende `www.bizuminer.com.br`, projeto `web` (`prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`). Não considerar o arquivo de configuração ou a região da CDN como prova suficiente.
- Preservar transporte, porta do pooler, `prepare:false`, limite de uma conexão compartilhada por processo/destino e os tempos de vida atuais. Não aumentar capacidade nesta entrega.

### 2. Eliminar duplicidades de preparação e autorização

- Fazer a autorização ocorrer uma vez por transação. Deduplicar apenas dentro do ciclo de vida dessa transação e para a mesma identidade completa: tenant, afiliado, ator, usuário autenticado, usuário de aplicação e papel. Rejeitar uma tentativa de usar outra identidade na mesma transação e limpar o marcador ao encerrar, inclusive após erro.
- Manter suporte tanto ao contexto herdado de `inAccountScope` quanto ao contexto explícito de `withAccountDb`, sem deixar um dos caminhos sem autorização. Conservar a consulta de membership e a revalidação antes das escritas.
- Enviar os seis `set_config` em um comando; executar a validação de membership depois, em comando separado, garantindo que o contexto já esteja estabelecido. Preservar a duração transacional das configurações e os caminhos de compatibilidade atuais.
- Manter as consultas de negócio e seus parâmetros necessários ao resultado. Não unificar leituras de roles públicas e privadas em uma transação para reduzir contagem de comandos.

### 3. Reaproveitar leituras dentro da requisição

- Compartilhar autenticação, memberships, resolução da conta e contadores idênticos entre layout e página. Usar memoização de render nos Server Components e contexto explícito nas APIs, com chave que inclua identidade, conta e parâmetros da leitura.
- Compartilhar o resultado/promessa de uma leitura repetida, sem criar uma nova consulta agregadora. Reutilizar também verificações idênticas de prontidão durante a requisição.
- Encerrar esse reaproveitamento com a requisição. Descartar dados anteriores após mutação, troca de conta ou logout; atualizar os blocos afetados pelos mecanismos de revalidação existentes.
- Preservar personalização de salvos, acompanhamento e permissões. Não introduzir cache público de HTML personalizado, cache global de autorização ou nova chave editorial.

### 4. Carregar a aba aberta e preservar a navegação

Manter as URLs atuais e o transporte de Server Components do Next. Normalizar `aba` antes de buscar os dados; aba ausente ou inválida abre `visao-geral`. Retirar o carregamento global de todas as abas e renderizar apenas a selecionada.

| Aba | Dados necessários |
|---|---|
| Visão geral | Indicadores e ações do dia, curadoria, diretriz, estado atual da seleção, bancada e resumo das lojas exibidas |
| Rodagens | Histórico, execução atual, monitoramento e políticas mostrados nessa aba |
| Captura manual | Bookmarklet e dispositivos; sem carregar os indicadores das outras abas |
| Publicação | Composer e lista de mais clicados |
| Afiliados | Contas e configurações de afiliados |

- Manter a shell administrativa interativa e reservar espaço para os blocos em carregamento. Colocar dados secundários em limites independentes de Suspense/erro, com nova tentativa local. Os gates de autenticação e conta continuam obrigatórios antes de renderizar dados privados.
- Guardar rascunhos de formulários em memória no layout persistente, separados por usuário, conta e formulário; não acrescentar persistência em navegador. Preservá-los ao navegar entre abas e limpar no logout. Respostas de uma conta ou navegação anterior não podem atualizar a conta/tela atual.
- Usar navegação do Next nos links internos, com indicação imediata de carregamento, histórico voltar/avançar e estado ativo sincronizado com a URL. Manter prefetch privado desabilitado para evitar rajadas de leituras.
- Cancelar requisições de leitura substituídas e ignorar respostas fora de ordem. Pausar polling de seções inativas. Não cancelar operações de escrita já aceitas pelo servidor; reconsultar seu estado ao retornar.
- Preservar retorno do produto com filtros, paginação e posição. Nas operações comuns, sinalizar processamento e impedir envio duplicado enquanto a mesma operação estiver pendente.

### 5. Verificar efeito e preservar qualidade

Registrar a baseline autenticada e repetir os mesmos fluxos após cada grupo de mudanças. Instrumentar tempos por serviço, início/fim da resposta, conteúdo utilizável, comandos emitidos e espera pela conexão, com diagnóstico controlado e sem cookies, tokens, parâmetros privados ou conteúdo pessoal nos logs.

| Medição no cenário controlado | Meta |
|---|---|
| Resposta visual ao clique | p95 até 150 ms |
| Início da resposta aquecida | p75 até 800 ms; p95 até 1,5 s |
| Home e produto utilizáveis | p95 até 2,5 s |
| Admin com dados principais utilizáveis | Mediana até 1,5 s; p95 até 3 s |
| Filtros e salvamentos comuns | p95 até 1 s |

- Testar a autorização única com contexto herdado e explícito, duas contas e atores distintos, revogação, commit, rollback e falha. Conferir que uma leitura com autorização única devolve os mesmos dados da referência.
- Testar compartilhamento dentro da requisição e ausência de compartilhamento entre requisições/contas. Após mutação, conferir atualização dos dados e das permissões.
- Verificar que abrir uma aba não chama serviços exclusivos das demais; conferir rascunhos, troca de conta, logout, respostas atrasadas, foco, voltar/avançar e estados de erro.
- Comparar catálogo, histórico, ordenação, totais, filtros e salvos com a baseline. Reexecutar os testes pertinentes da home, apresentação, navegação e isolamento. Executar testes web, tipagem e build; manter alterações locais de marketing e outros trabalhos existentes.
- Usar os testes nativos isolados de autorização/pool para ciclo transacional e concorrência. Testes PGlite continuam complementares, sem alegação de prova de Supavisor, Auth ou Storage reais.
- Medir `next build` + `next start` em cópia isolada do servidor dev e medir a candidata publicada. Separar primeira abertura/compilação, acesso após ociosidade e execução aquecida. Documentar rede, viewport e dispositivo; conferir desktop e celular.
- Coletar ao menos 100 amostras por jornada no ensaio isolado e conferir cinco sessões simultâneas com dados sintéticos. Produção recebe apenas amostra pequena. Aferir tempos em ensaio dedicado, sem tornar testes unitários dependentes de latência da máquina.

As metas são critérios de medição, não ganhos antecipadamente garantidos. Se algum fluxo continuar acima delas, registrar o tempo restante e a etapa responsável; não ampliar automaticamente este escopo para reescritas de SQL.

### Ordem de implementação, publicação e recuperação

1. Registrar a baseline e preparar a configuração efetiva de região.
2. Implementar e testar autorização única e agrupamento do contexto.
3. Implementar reaproveitamento por requisição.
4. Implementar carregamento por aba e preservação de rascunhos/navegação.
5. Executar os ensaios funcionais e de desempenho em conjunto; produzir a candidata com todos os ajustes revisados e região `gru1`.
6. Após validação, publicar no mesmo projeto/domínio, identificar o deployment atendido e conferir vitrine, produto e painel autenticado. Registrar antes/depois e limitações neste documento.
7. Em regressão de dados, acesso, salvamento ou navegação, retornar ao deployment anterior. Esta entrega não altera schema ou dados de negócio, portanto não requer reversão de migration.

**Limites do plano:** consultas de negócio, funções SQL, índices, RLS, ranking, evidência de preço, paginação, composição/ativação editorial, chave de atualização, Storage do marketing, jobs e agendamentos permanecem como estão. O marketing recebe as melhorias comuns de região, layout e autorização. Não criar endpoints públicos, migrations, serviços pagos ou nova cadeia de OS para este trabalho.

## Implementação e revisão em 31/10/2026

O plano vigente foi implementado no código local, preservando alterações preexistentes. Não houve reescrita de consultas de negócio, migration, alteração de RLS/índices, transporte do pooler, capacidade, regras editoriais ou jobs. O servidor de desenvolvimento permaneceu na porta 3100; builds e medições usaram cópia isolada em `/tmp`, porta 3101. O marketing preexistente foi preservado e seus arquivos correspondentes conferidos com a fonte publicada.

### Comportamento entregue no código

- Autorização e instalação dos seis parâmetros de contexto convergem para uma única preparação por transação. Outra identidade na mesma transação é rejeitada; falha, rollback e encerramento mantêm o isolamento. Cada nova transação continua revalidando membership.
- Memberships, conta e contadores idênticos compartilham a promessa na requisição; APIs usam o objeto de request como escopo. Não há cache global de autorização. Mutações do fluxo de Server Actions e troca de conta invalidam as leituras desse escopo.
- Apenas a aba normalizada é carregada. Visão geral, rodagens e blocos secundários têm limites de carregamento/erro; shell e links continuam disponíveis. Prefetch privado permanece desativado, com indicação de navegação pendente.
- Rascunhos e estado de operações ficam na memória do layout, separados por usuário, conta, ator, formulário e loja. Expiram códigos temporários e convites; logout e desmontagem real descartam a memória. Não foi acrescentado localStorage/sessionStorage para esses rascunhos.
- Leituras substituídas são abortadas na vitrine e no Composer. A busca interrompida retoma ao voltar; polling não sobrepõe GETs, pausa oculto e aborta ao sair. Escritas aceitas continuam sem reenvio, com reconsulta do estado quando necessário. Formulários de dispatch mantêm campos em erro e limpam apenas o formulário confirmado.
- O cabeçalho administrativo pode quebrar linha no celular, mantendo o menu acessível. O manifesto do build final contém 51 funções com `gru1`, sem exceções.

### Revisão independente e falhas corrigidas

O agente revisor executou PostgreSQL 17 real, ReactDOM/JSDOM com componentes reais e cenários instrumentados da página. Foram corrigidos assim que identificados: identidade descartada após falha de autorização; contexto de tenant ausente na chave de contagem; perda de resultado de pareamento/convite ao sair durante POST; timers após desmontagem do layout; busca abortada apresentada como vazia; campos compartilhados entre lojas; referência de execução perdida na volta; reset nativo de select após erro. O teste móvel identificou e fechou o transbordamento do cabeçalho.

Na revisão final não restaram achados abertos. A comparação AST preservou 40 templates SQL de negócio; sete serviços completos de catálogo/editorial/histórico/marketing mantiveram seu conteúdo. Os contratos das sete chamadas e as implementações das Server Actions de dispatch foram preservados.

### Verificação e efeito observado

- 513 testes web passaram; tipagem e build passaram. As duas falhas da primeira execução confinada eram limitações de subprocessos/interfaces de rede do sandbox e passaram sem alteração desses serviços ao repetir fora dessa limitação.
- 14 cenários integrados da home e 15 de apresentação de produtos passaram em PostgreSQL WASM isolado, incluindo filtros, edição vazia/vencida, ordenação e isolamento. O ensaio nativo confirmou pool físico máximo 1, concorrência, revogação, rollback, cancelamento e limpeza de contexto.
- A mesma leitura de resumo passou de 19 para 6 comandos no caminho com contexto herdado (membership 2→1); o caminho explícito passou de 11 para 6. Os resultados foram iguais. Em 100 amostras locais, a mediana registrada foi 3,564→2,625 ms e o p95 4,792→3,597 ms; com cinco sessões lógicas, p95 19,562→11,823 ms. A carga da máquina variou: esses tempos são de fixture pequena, não um ganho garantido da aplicação ou de Supavisor.
- No navegador autenticado foram conferidos painel único, rascunho após sair/voltar, feedback de carregamento e histórico voltar/avançar em `next start`. O render inicial registrou uma leitura de memberships, uma resolução de conta e uma contagem compartilhada. Troca de conta/ator/logout e conclusão tardia foram verificadas em cenários isolados. Nenhuma captura, publicação editorial ou disparo real foi executado.
- Em viewport configurado 390 px (área útil 375 px), o cabeçalho corrigido ficou com scrollWidth 375 px e o menu abriu/fechou sem transbordamento.

| HTTP anônimo no build de produção local | Mediana início / documento completo | Amostras |
|---|---:|---:|
| Home `/` |0,827 /0,829 s |3 |
| `/api/deals?limit=24` |0,807 /0,807 s |3 |
| Produto de referência |0,008 /0,846 s |3 |

Essas leituras consultam o mesmo banco remoto, mas excluem imagens e hidratação e usam `next start`; a baseline local anterior era `next dev`. Não estabelecem um antes/depois controlado da experiência ou p95. O fallback editorial da home permanece no escopo original, sem otimização de SQL. Metas completas de conteúdo utilizável, percentis e primeira abertura após ociosidade continuam a depender do ensaio dedicado.

### Publicação concluída e estado remoto

Com autorização explícita do usuário ("Pode fazer o deploy"), a candidata foi criada e testada em produção sem atribuir o domínio, depois promovida sem rebuild. O build remoto terminou em aproximadamente 85 s; o deployment `dpl_6oC3wkMgRWoinNcv6h2zWLm6PLsa` ficou `READY`, URL `web-osfn6qmyq-emanuels-projects-aa92a126.vercel.app`. O domínio `www.bizuminer.com.br` passou a atendê-lo às 19:05:18 UTC de 31/10/2026. `bizuminer.com.br` e o alias alternativo também concluíram a promoção.

A API do deployment indica `gru1`; os cabeçalhos de home, API e produto apresentaram `x-vercel-id: gru1::gru1::…`, confirmando execução em São Paulo além da região de entrada. As três rotas responderam 200 e `x-vercel-cache: MISS`, com as políticas de cache privado/no-store preservadas. O build foi executado fisicamente em Washington, o que é distinto da região de execução das funções.

A atribuição automática de domínios foi reativada por API e conferida no painel de produção: `Auto-assign Custom Production Domains` mostrou `Enabled`, checkbox marcado. Os bloqueios anteriores da revisão automática foram resolvidos com a autorização explícita; não resta bloqueio de publicação ou configuração temporária desligada.

A candidata protegida passou no navegador com a sessão Vercel existente: home, produto com histórico, API com 24 produtos e gate anônimo do admin. O fetch autenticado do conector não conseguiu aceitar seu share link; nenhuma proteção foi desativada. Após a promoção, o login Google com usuário existente, visão geral, rodagens, captura manual, painel único, rascunho após sair/voltar e menu móvel foram verificados no domínio final. O rascunho de teste foi limpo; nenhum formulário de captura, política ou disparo foi enviado.

| Rota, mediana de 3 GETs anônimos | Baseline: documento completo | Após deploy: início / documento completo |
|---|---:|---:|
| Home `/` | 5,358 s | 1,000 / 1,019 s |
| `/api/deals?limit=24` | 4,622 s | 0,912 / 0,912 s |
| Produto de referência | 4,981 s | 0,088 / 0,873 s |

A amostra pequena mostra redução do tempo HTTP nas mesmas rotas. Foram momentos distintos contra dados vivos; não é um ensaio controlado de p95, imagens, hidratação, LCP ou INP. As metas completas continuam dependendo do ensaio dedicado, sem necessidade de reescrever SQL nesta entrega.

As APIs de erros e logs error/fatal após a promoção não retornaram erros. Recarga do painel, home e navegação de produto ficaram sem erro novo no console do navegador. Uma ocorrência isolada de React 418 na candidata protegida, antes da promoção, não se reproduziu no domínio: a revisão estática não encontrou mudança de SSR em login/tema/header público nem evidência concreta de regressão introduzida; a causa ficou indeterminada e não foi feito ajuste especulativo. O inventário de drains retornou 404 no conector e não foi estabelecido por essa checagem.

A fonte publicada contém 545 arquivos, baseada no HEAD `ca3a9516f14cf9b8f7fe9f501660b1049d59d8a0` com as mudanças revisadas e o marketing já publicado preservado; não houve commit/push ou migration. O deployment anterior `dpl_BRHx7ejh75JfYZyutCux9d67bJZm` permanece como referência de recuperação. Em regressão material, promover esse deployment e conferir novamente a atribuição automática. IDs, amostras, manifesto e limites estão no JSON de evidências.

## Baseline do levantamento em 31/10/2026

Pedido desta rodada: investigar a lentidão local, de produção e das funções internas. Somente diagnóstico: nenhum código funcional, configuração remota, job ou migration foi alterado. Alterações locais de marketing e demais trabalhos preexistentes foram preservados. Os experimentos ficaram em `/tmp`; medições sem credenciais ou identidade pessoal estão em [evidencias-desempenho-2026-10-31.json](evidencias-desempenho-2026-10-31.json).

### Reprodução e limites da comparação

O domínio `www.bizuminer.com.br` apontou para `dpl_BRHx7ejh75JfYZyutCux9d67bJZm`, URL `web-2tsef6356-emanuels-projects-aa92a126.vercel.app`, projeto `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`. A API identificou publicação via CLI, sem SHA Git em `meta`, criada em 29/10, Next.js 15.5.23. O HEAD local é `ca3a9516f14cf9b8f7fe9f501660b1049d59d8a0`, com alterações não commitadas. Os arquivos centrais de pool, contexto, transação, leitura da home e seleção foram encontrados no deployment pelos hashes SHA-1 dos arquivos locais; isso não identifica todo o artefato com o HEAD.

O servidor local existente em `localhost:3100` foi preservado, sem reinício, limpeza de `.next` ou build concorrente. É desenvolvimento, não um `next start` equivalente ao deployment. Ambos consultam o banco remoto Supabase em São Paulo. Os tempos HTTP abaixo são medianas de três leituras anônimas consecutivas por rota, sem imagens/hidratação; não são p95 nem medição completa da experiência autenticada.

| Rota | Local: início / documento completo | Produção: início / documento completo |
|---|---:|---:|
| `/` | 1,015 / 1,019 s | 5,137 / 5,358 s |
| `/api/deals?limit=24` | 0,934 / 0,934 s | 4,618 / 4,622 s |
| `/bizu/ali-1005009830682959` | 0,062 / 1,010 s | 0,203 / 4,981 s |

A home em produção variou de 4,622 a 8,842 s até o primeiro byte; uma leitura inicial, anterior à série, levou 9,033 s. DNS + conexão + TLS terminaram em aproximadamente 22–31 ms na série. `/entrar`, sem a carga de catálogo, respondeu em 0,193–0,256 s em produção. Localmente seu primeiro acesso levou 0,800 s e a repetição 0,037 s: há custo de compilação, mas ele não explica a lentidão persistente das rotas aquecidas. No produto, a estrutura de carregamento chega antes do conteúdo por streaming; TTFB baixo não significa que o produto esteja pronto.

### Causas demonstradas

1. **Produção distante do banco.** `get_deployment` retornou `regions: ["iad1"]`; o header das leituras públicas também marcou `gru1::iad1`. O banco usado pela aplicação está em `aws-1-sa-east-1.pooler.supabase.com:5432`. O próprio `packages/web/vercel.json` do deployment contém `regions: ["gru1"]`, portanto existe divergência entre configuração em fonte e região efetiva. O mecanismo exato de precedência/consumo dessa configuração ainda não foi determinado. A distância amplifica cada espera sequencial pelo banco; não foi feita publicação A/B para atribuir a ela um número exato de segundos. A [documentação da Vercel](https://vercel.com/docs/functions/configuring-functions/region) recomenda aproximar a função da fonte de dados e descreve os diferentes pontos de configuração.

2. **Autorização de conta repetida na mesma transação.** `lib/database-pool.ts`, no wrapper de `begin`, chama `authorizeAccountTransaction`; `lib/tenant-db.ts:withAccountDb` chama a mesma função novamente. Cada chamada humana faz seis `set_config`, uma verificação de prontidão e uma consulta de membership, todos aguardados separadamente. Uma `curationSummary` sob `inAccountScope` produziu 19 comandos: BEGIN, 16 de contexto/autorização, um agregado e COMMIT. Experimento com a mesma função, identidade e contexto explícito, sem o scope ambiente que dispara o segundo wrapper, manteve a autorização e o resultado e produziu 11 comandos. Na comparação isolada: 262 ms contra 173 ms. Não se propõe remover a checagem de membership nem trocar identidade por cache global.

3. **Muitas leituras bloqueantes disputam uma conexão.** `WEB_DATABASE_CONNECTIONS=1`, `idle_timeout=5`, `max_lifetime=60`. O `Promise.all` de `app/admin/page.tsx` prepara visão geral, cliques, contagens, curadoria, histórico e execução atual de três marketplaces, auditoria, diretriz, seleção e bancada antes de devolver o conteúdo. Reproduzir esse mesmo conjunto, sob contexto real da conta e proteção de leitura, gerou **294 comandos SQL em 5,444 s**, sem incluir Supabase Auth, layout, HTML ou hidratação. Foram 175 comandos contendo `set_config` e 29 consultas de revalidação de membership. As transações concorrem pela mesma conexão. O layout ainda lê curadoria e memberships; `resolveAccountContext` já consultou memberships e não compartilha essa leitura com o switcher. Abas renderizadas e apenas ocultadas por `hidden` também mantêm custo de montagem. Aumentar o pool isoladamente não é solução comprovada, pois existe histórico de esgotamento de sessões.

4. **A home volta ao cálculo completo em cada leitura.** `garimpa.homepage_edition` não tem linha para `local`, apesar de a função de leitura existir. `getPublishedEditorialSelection` recebe `null` e executa `computeEditorialSelection`. Foram 15 comandos e aproximadamente **0,8–1,7 s** por leitura local; a seguir, o catálogo público com a seleção já carregada levou somente 99–113 ms no harness. O fallback passa por `curation_queue_facts`: EXPLAIN ANALYZE sob a role de aplicação e tenant local mostrou **561,9 ms**, 245 candidatos, duas varreduras de `price_observation` com 10.944 e 10.890 linhas e 69.547 blocos encontrados em cache. A consulta percorre histórico antes de compor a seleção entregue. Esse carregamento também é usado por `/api/deals` e por `topDeals` nos relacionados do produto. Persistir/ativar uma edição exige respeitar a seleção editorial e sua renovação; não deve ocorrer como escrita automática de um GET nem restaurar oferta retirada.

### Outros custos e hipóteses delimitadas

- **Marketing:** o cliente espera a página/contexto e depois chama `/api/admin/marketing`. `loadMarketing` abre exclusão transacional; o adapter cria uma conexão Postgres separada por operação e mantém o advisory lock enquanto consulta o bucket e baixa o JSON do Supabase Storage. `bucketReady` pertence à nova instância do adapter, então uma requisição posterior verifica o bucket novamente. É custo adicional demonstrado pelo código, sem latência autenticada de Storage medida nesta rodada. O GET pode inicializar dados ausentes; por isso não foi invocado como experimento de leitura. Preservar revisão e conflito ao otimizar.
- **Autenticação/personalização:** `getPageAuth` usa `getUser` na rede, memoizado por render. Layout e APIs também resolvem role e conta. A home espera salvos e suas apresentações quando há sessão. Isso acrescenta etapas para usuários logados; o custo exato do Auth não foi isolado sem sessão de navegador disponível.
- **Bancada:** `getWorkbenchPage` lê as listas de pendências e faz filtros, ordenação e `slice(0, limit)` em memória. O `limit:15` do painel não limita as leituras SQL dessas listas. É risco de crescimento, sem evidência de ser o maior custo no volume atual; a leitura isolada ficou em 314–382 ms.
- **SQL público já otimizado:** EXPLAIN atuais, administrativos, de `public_catalog_stats` e `public_catalog` levaram 73,5 e 364,8 ms. No harness de aplicação, detalhe público isolado levou 44–55 ms incluindo transação. As médias de `pg_stat_statements` (estatísticas acumuladas desde 17/09) incluem versões antigas; não comprovam a latência atual de cada função. A consulta editorial de fallback é um gargalo atual medido.
- **Frontend e erros:** vitrine aberta no navegador sem erros/warnings de console observados. O build publicado informa First Load JS de 131 kB na home, 128 kB no admin e 152 kB na curadoria. Esses valores não substituem perfil de CPU/LCP, mas a espera longa já ocorre antes de o HTML completo chegar. Os logs de runtime da janela de 30 minutos vieram vazios; a consulta de 24 horas excedeu a retenção Hobby. A rodada não reproduziu `EMAXCONNSESSION` e não prova sua ausência fora da amostra. A API de observabilidade consultada retornou 404, sem percentis históricos disponíveis.

### Prioridade de correção e verificação

1. Corrigir a região **efetiva** da próxima publicação e conferir o deployment que atende o domínio em `gru1`, sem se limitar ao arquivo versionado.
2. Executar autorização uma vez por transação e agrupar os `set_config`, preservando role, revogação, tenant e identidade transacionais. Validar resultados, negação entre contas e revalidação antes de escritas.
3. Carregar os dados da aba ativa, reaproveitar curadoria/memberships na requisição e retirar dados secundários do caminho bloqueante. Preservar os estados de formulários que hoje motivam manter abas montadas.
4. Fechar a ativação e renovação da edição persistida da home ou remover o recálculo editorial desnecessário dos caminhos de catálogo/relacionados, respeitando disponibilidade e retirada editorial.
5. Otimizar as leituras/locks do marketing e a paginação da bancada depois de medir suas jornadas autenticadas. Reavaliar transporte/pool só com orçamento de conexões e concorrência ensaiada: a [orientação do Supabase para Postgres.js](https://supabase.com/docs/guides/database/postgres-js) registra limitações de pipelining no pooler transacional; trocar apenas a porta não é validação.

Conferir depois: mesmas rotas e volume, início **e fim** do documento, SQL por etapa, abertura autenticada do painel e páginas internas, dois contextos de conta, primeira abertura versus execução aquecida e comportamento concorrente. O levantamento demonstra os mecanismos acima; ainda não mede p95, carga, LCP/INP, o custo individual do Auth, o ganho de um novo deploy ou todas as ações internas de ponta a ponta.

## Entrega de consultas e links em 23/10/2026

As funções públicas passam por uma projeção interna de candidatos elegíveis, com conta ativa, curadoria aprovada, publicação web canônica, preço positivo e a mesma janela de disponibilidade anterior. Resolver um slug restringe primeiro o produto pelo índice de publicação. Links curtos, monetização e contagens usam apenas esses dados; detalhe e catálogo calculam histórico e comparabilidade no conjunto elegível. Não foram alterados RLS, regras de E3, proprietário das funções existentes, grants de tabelas privadas ou arquivos selados A/B/C. Os dois novos helpers não têm EXECUTE para o runtime público, `anon`, `authenticated` ou `garimpa_app`.

O catálogo inclui facetas na mesma resposta; o detalhe é reaproveitado entre metadata e renderização na requisição. A nova função de links em lote é opcional para o aplicativo manter compatibilidade com o banco anterior; colisões e concorrência repetem somente os slugs ainda ausentes. Mesmo um código existente revalida a disponibilidade da oferta. A pauta envia explicitamente sua conta e aquece imagens novamente apenas quando versão, slugs ou URLs de imagem mudam, com nova tentativa após falha.

A aplicação remota foi atômica e comparou, no mesmo instante transacional, todas as linhas públicas, estatísticas, catálogo ordenado, detalhe e destino monetizado antes/depois. A consulta de prontidão comercial permaneceu verdadeira, o código curto existente permaneceu igual e o runtime público continuou sem acesso direto às relações privadas. Não houve execução de captura para homologar o ajuste.

O teste `test:public-navigation-native` usa PostgreSQL 17 descartável e cobre filtros, paginação, contas distintas, evidência comparável, suspensão, expiração, retirada da curadoria, preço inválido, códigos existentes, colisões, concorrência individual e em lote, monetização e cliques. A reconstrução sintética reaplica explicitamente os índices legados de links e observações usados nessa verificação; o catálogo antigo da fixture não os reconstrói automaticamente. Build, tipagem, testes web/persistência, prontidão pública e evidência canônica também foram conferidos. Os testes de subprocessos/QR que a sandbox bloqueou passaram na repetição com os acessos locais necessários.

| Jornada HTTP no domínio público | Antes: uma amostra | Depois: mediana de três amostras |
|---|---:|---:|
| Vitrine | 11,12 s | 0,81 s |
| Produto `shp-18199069887` | 13,05 s | 0,72 s |
| Link curto `xcf9`, sem seguir o redirect | 4,89 s | 0,26 s |

São tempos de transferência do documento por curl, sem imagens ou hidratação, e uma amostra pequena, sem garantia de p95. O primeiro link curto após a ativação levou 1,06 s. Em EXPLAIN remoto posterior, detalhe levou 31,7 ms, resolução do link 14,0 ms, estatísticas 436,4 ms e catálogo 646,8 ms; os dois últimos ainda ultrapassam a meta proposta de SQL. O fluxo vitrine → produto foi conferido no navegador sem erro de console. APIs privadas sem sessão retornaram 401, link inexistente retornou 404 e o HEAD comercial retornou o destino afiliado sem registrar clique.

O pool continua em modo sessão, limitado a uma conexão por instância web. Não foi homologada troca de transporte nem ensaio completo de carga/autenticação de todas as etapas deste plano. A seleção por marketplace do monitor foi implementada e comparada localmente com a fila original, sem antecipar LIMIT antes das regras; sua ativação nos jobs depende de enviar o código ao GitHub. Os agendamentos remotos não foram modificados. A publicação Vercel exclui arquivos de ambiente, credenciais, artefatos e o protótipo arquivado por `.vercelignore`.

## Prévia de compartilhamento publicada em 23/10/2026

Implementação publicada em `www.bizuminer.com.br`, deployment `dpl_45ayiao8kDEQ8n8Vh3PeyTqy5zee` (`web-rm3d28tld-emanuels-projects-aa92a126.vercel.app`), no mesmo projeto Vercel `web`, com funções em `gru1`. A página declara explicitamente a imagem em Open Graph e Twitter. `lib/product-preview.ts` gera uma URL por versão dos dados visíveis da oferta, observação de preço, frescor e selo. O desenho continua o mesmo; foi movido para `lib/product-preview-image.tsx`. A rota pública permanece `/bizu/[slug]/opengraph-image`, agora um Route Handler. URLs antigas, versões vencidas ou uma dica da seleção privada diferente dos fatos públicos redirecionam sem cache para a versão calculada pela projeção pública. Oferta indisponível retorna 404 sem renderizar nem cachear um cartão.

`/api/pauta` fornece a URL de prévia junto dos dados já lidos, sem outra consulta por produto. O navegador baixa até dez imagens finais, duas por vez, consome o corpo completo e deduplica requisições em andamento e imagens ainda válidas. Mudança de preço, foto, texto ou frescor altera a versão. A cópia mantém a chamada de clipboard no gesto do usuário, inclusive no iOS; não espera uma requisição de rede. O detalhe público prepara sua própria prévia ao abrir, enquanto os botões da vitrine continuam sem aquecer todas as ofertas da página. O antigo POST de warmup é mantido para compatibilidade, mas a pauta nova não o chama.

Somente a imagem pública pronta recebe cache específico da CDN Vercel por até cinco minutos, limitado também pelo fim da janela existente de 48 horas do preço atual. O HTML personalizado continua sem cache público. Falha ao baixar a foto gera fallback sem cache, permitindo nova tentativa. O navegador não envia cookies ao aquecer e a imagem pública permite CORS para que a pauta local prepare a mesma URL do domínio compartilhado. O tempo restante considera o header `Age` da CDN. Não há cache global de autorização ou de resultados de `dealDetail`, novas tabelas, migrations, serviços ou jobs.

Conferidos localmente: sete testes de versão, validade, indisponibilidade, fallback, limite de concorrência, deduplicação, prioridade, consumo completo, retry e cancelamento; suíte web completa com 453 testes; build e tipagem; HTML com UA de WhatsApp, PNGs 1200×630 de Shopee/AliExpress, cabeçalhos de cache/CORS, redirects de URLs antigas, link curto e APIs privadas sem sessão. O bundle inclui as duas fontes e o navegador abriu o detalhe sem erros. A publicação foi conferida primeiro na versão protegida e depois no domínio público: PNGs válidos, URLs antigas redirecionando, API privada anônima com 401, oferta inexistente com 404 e link curto preservado. No domínio, duas imagens levaram 1,00–1,42 s sem cache; quatro repetições com HIT levaram 0,078–0,299 s (mediana 0,101 s). São poucas amostras HTTP, sem garantia de p95 e sem medir o aplicativo WhatsApp.

A pauta autenticada abriu 24 produtos sem erros de console. Depois de abrir a pauta, a primeira leitura externa da imagem do produto visível `hnd7` (`shp-49107392414`) já retornou HIT, com Age de 43 s e 0,135 s de transferência: o navegador havia preparado exatamente a URL declarada nos metadados. O HTML do link, incluindo redirect, levou 1,49 s; esse tempo se soma ao da imagem para um cliente que espere o documento completo. Nenhum erro de runtime foi encontrado na janela consultada das rotas afetadas. Não foi enviada mensagem pelo WhatsApp nem foi medido seu cliente; essa conferência continua dependendo de colar um link no aplicativo. A publicação não alterou banco, jobs, configurações de autenticação ou proteção da Vercel.

## Evidências e ponto de partida

As medições da investigação foram requisições sem login e uma amostra curta. Representam o tempo até começar a resposta HTTP; não são p50/p95 nem medição completa de clique até tela utilizável.

| Verificação | Localhost | Produção |
|---|---|---|
| Vitrine | 3,4–6,1 s | 9,1–9,6 s |
| Página de produto | HTTP 500 por módulo de build ausente | 8,5–9,2 s |
| `/api/deals` | 5,2 s | 5,5 s |
| `/entrar` | 1,7 s, sem isolamento do custo de compilação | 0,22 s |

Consultas usadas pelo catálogo e produto levaram 1,4–2,3 s. `EXPLAIN ANALYZE` confirmou aproximadamente 1,5 s de execução no banco em consultas públicas. Um experimento restrito aos fatos de um produto levou 4,7 ms; ele demonstra uma oportunidade de restringir o processamento, mas não substitui a função pública completa nem comprova equivalência de autorização e resultados.

Outros fatos confirmados:

- `dealCategories` e `marketplaceCounts` chamam a mesma `public_catalog_stats` separadamente.
- `generateMetadata` e a página de produto chamam `dealDetail` sem deduplicação explícita dessa consulta SQL.
- Muitos links internos usam `<a>`, e não há `loading.tsx` nas rotas examinadas. O painel prepara dados de várias abas antes de apresentar a página.
- Os logs de produção registram `EMAXCONNSESSION`, com limite de 15 sessões atingido. Isso comprova falhas intermitentes de conexão, não que toda navegação lenta seja causada por saturação.
- O código local já possui pool compartilhado por processo, com máximo de três conexões; essa melhoria precisa ser preservada e validada, não reimplementada.
- O frontend local conecta ao pooler remoto em São Paulo, na porta de modo sessão. Localhost não significa banco isolado.
- A função do domínio público foi identificada em `iad1`, enquanto o banco está em `sa-east-1`. O custo exato dessa distância ainda deve ser separado das consultas e da abertura de conexões.
- Na consulta à Vercel, `www.bizuminer.com.br` resolveu para `dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp`, commit `f60b6187ada88addd37ff5b967f1d0f2e8eca2b9`. O HEAD local era `170a26066674c6924833801fe9ab6196e84f4e04`; o deploy mais recente listado não era o artefato atendendo o domínio. Reconfirmar essa associação antes de publicar.

As mudanças de navegação já existentes continuam válidas. Este trabalho trata sua latência e não reabre a organização funcional do painel descrita em [handoff de navegação](handoff-navegacao-integrada.md) e no [status atual](../implementation/STATUS-EXECUCAO.md).

## Metas e método de medição

Os números abaixo são metas de aceite propostas, não resultados já obtidos. Usar o mesmo conjunto de dados e registrar volume, versão, ambiente, sessão, filtros e concorrência de cada comparação.

| Aspecto | Meta após as correções |
|---|---|
| Resposta visual a clique entre páginas | Indicador ou novo estado visível em até 150 ms no p95, com o cliente já hidratado |
| TTFB de vitrine, produto e `/api/deals` | p50 até 800 ms e p95 até 1,5 s em execução aquecida |
| TTFB das páginas administrativas representativas | p95 até 2 s em execução aquecida, com sessão válida |
| Tela pública utilizável depois do clique | p95 até 2 s no cenário desktop de referência; medir também mobile |
| Consultas públicas principais | Produto até 100 ms e catálogo/estatísticas até 300 ms no p95, com volume representativo |
| Estabilidade | Sem erro 500, `EMAXCONNSESSION`, timeout ou mistura de contas no ensaio definido |

Medir separadamente: primeira compilação do `next dev`, requisição após ociosidade do pool, inicialização de função e navegação aquecida. Comparar produção com `next build` + `next start` local; o primeiro acesso compilado pelo `next dev` fica em série própria.

Para p50/p95, coletar pelo menos 30 amostras por cenário no ambiente isolado. Ensaiar cinco sessões simultâneas e pelo menos 100 requisições distribuídas entre os fluxos, sem misturar resultados de concorrência com os de requisição isolada. Usar volume atual e uma massa maior explicitamente sintética. Em produção, fazer somente amostra pequena de leitura e conferir os logs existentes; testes de carga ficam no ambiente isolado.

Registrar clique → primeiro feedback → conteúdo utilizável no navegador, além de TTFB, tempo de SQL, número de consultas, abertura/espera de conexão e erros. `loading.tsx` não pode mascarar uma regressão: medir também quando o conteúdo termina de chegar.

## Etapa 1 Preparar a verificação e estabilizar o localhost

1. Reconfirmar Git, alterações existentes, processos web, versão do Node, build e associação entre domínio, deployment e commit. Preservar `archive/site` e trabalho de autoria alheia.
2. Reproduzir o erro `Cannot find module './vendor-chunks/postgres.js'`. Verificar processos concorrentes e artefatos antes de atribuir a causa. Não executar `next build` e `next dev` sobre o mesmo `.next` ao mesmo tempo.
3. Parar de forma controlada a instância de desenvolvimento necessária, remover somente os artefatos gerados identificados como inconsistentes e reiniciar uma única instância. Usar checkout ou diretório de saída separado para ensaiar build e servidor simultaneamente.
4. Criar uma forma reproduzível de medir os fluxos públicos e autenticados. Adicionar temporização por etapa, ativada para diagnóstico, sem registrar cookies, tokens, URLs de conexão, parâmetros privados ou conteúdo pessoal.
5. Preparar PostgreSQL descartável a partir das fixtures existentes, seguido da migration incremental deste trabalho. Para Auth e pooler, usar ambiente Supabase isolado quando disponível e autorizado; uma URL de preview com o banco ativo não é isolamento.

**Saída:** produto local retorna 200, somente uma instância usa cada diretório de build e a medição distingue compilação, servidor, banco e renderização. Se o erro de módulo persistir após reconstrução limpa, corrigir a resolução/empacotamento demonstrada pelo novo erro, sem repetir limpezas como tratamento permanente.

## Etapa 2 Restringir o trabalho das consultas públicas

Alterar as funções públicas mantendo suas assinaturas, projeções e condições de disponibilidade, para que a aplicação atual e a candidata possam coexistir durante a publicação.

- **Produto:** resolver primeiro a publicação/slug e a conta ativa, com as mesmas condições de publicação e curadoria. Calcular histórico e comparabilidade apenas para o produto elegível. Um filtro colocado fora de `public_offer_rows` não basta se a função continuar materializando o catálogo amplo.
- **Estatísticas:** calcular categorias, contagens e `categoryStats` a partir das informações realmente necessárias. Preservar preço, vendas, janela temporal e elegibilidade usados hoje, sem executar todas as comparações históricas apenas para contar produtos.
- **Catálogo:** aplicar cedo tenant, publicação ativa, curadoria, categoria, loja, busca e os demais filtros seguros. Calcular campos históricos somente no conjunto necessário. Quando filtro ou ordenação depender de histórico, aplicar a regra antes de paginar, preservando total, desempate e ordem editorial.
- **Destaques e relacionados:** restringir candidatos e reutilizar a seleção já carregada quando o contrato permitir. Preservar revalidação de evidências, expiração editorial e omissão de alegações sem suporte.
- Conferir planos reais e índices existentes antes de criar índices. Acrescentar somente os sustentados por `EXPLAIN (ANALYZE, BUFFERS)`; tratar criação concorrente e timeouts conforme o mecanismo escolhido.

Preservar `SECURITY DEFINER`, proprietário, `search_path` fixo e grants restritos quando fizerem parte do contrato instalado. A otimização não concede acesso direto às relações privadas nem relaxa RLS, suspensão, revogação, autoria ou prova de menor preço.

Versionar uma **nova migration incremental posterior ao estado instalado** e testar sua aplicação depois do corte C. Não editar migrations históricas, arquivos selados A/B/C, seus hashes ou snapshots para acomodar a mudança. Não executar a pasta antiga com `db push`. O [guia do rollout](../../packages/persistence/supabase/rollouts/v2/README.md) e o [fechamento implantado](../implementation/contratos-finalizacao/resultados/10-fechamento.md) dão o contexto histórico; não são instruções para reaplicar A/B/C.

**Saída:** consultas atingem o orçamento de SQL e mantêm resultados equivalentes numa massa congelada. Cobrir todos os filtros/ordenações, slug inexistente, publicação inativa, conta suspensa e limites de frescor. Comparar a política atual com a otimizada usando o mesmo instante de referência para não confundir expiração com regressão.

## Etapa 3 Reaproveitar leituras e reduzir esperas da aplicação

- Introduzir um carregamento único das estatísticas para alimentar categorias e contagens na home e em `/api/deals`.
- Deduplicar `dealDetail` entre metadata e renderização, usando memoização limitada à requisição para Server Components. Reutilizar seleção editorial e verificações de prontidão na mesma requisição, sem criar um resultado global permanente de autorização/prontidão.
- Em Route Handlers, fazer a composição explicitamente e passar o resultado aos consumidores; não depender de `React.cache` para deduplicar chamadas fora da renderização React.
- Iniciar em paralelo apenas leituras independentes, depois de resolver a autorização e o contexto necessários. Preservar as verificações de identidade, role, membership e revogação.
- Carregar no painel somente os dados necessários à aba solicitada. Retirar consultas de abas ocultas do caminho inicial. Decidir a persistência de formulários por componente e testar a troca de abas, pois `AdminTabs` hoje mantém conteúdos montados para preservar estado.
- Reduzir o bloqueio do layout administrativo: manter o gate de acesso; carregar contadores secundários em uma fronteira de `Suspense` após a autorização. Evitar a repetição de resumo/membership entre layout e página.
- Agrupar configurações transacionais de contexto numa única consulta quando equivalente, sem remover validações de membership. Contexto continua na requisição/transação, nunca no pool compartilhado.

Arquivos iniciais de referência: `lib/db.ts`, `lib/public-offer-db.ts`, `lib/editorial-selection-db.ts`, `lib/auth.ts`, `lib/account-scope.ts`, `app/page.tsx`, `app/api/deals/route.ts`, `app/bizu/[slug]/page.tsx` e `app/admin/{layout,page}.tsx`. A lista orienta o trabalho, sem impedir ajustes necessários dentro do mesmo objetivo.

Nesta entrega, manter personalização dinâmica. Não transformar páginas com sessão, favoritos ou conta ativa em HTML globalmente cacheado. A proposta antiga de ISR integral em [plano de UX](plano-ux-vitrine.md) não deve ser aplicada automaticamente à arquitetura autenticada atual. Cache entre requisições só entra se a medição ainda exigir, com projeção pública separada, chaves corretas e invalidação de revogação/publicação/expiração demonstrada.

**Saída:** uma chamada de estatísticas por requisição; uma leitura de detalhe por renderização de produto, incluindo metadata; abas não solicitadas não executam seus carregadores. Sessões, favoritos e permissões mantêm os resultados corretos.

## Etapa 4 Dar resposta imediata à navegação

- Usar `next/link` nos destinos internos de página da vitrine, detalhe, área pessoal, shell, abas e subnavegações administrativas pertinentes.
- Manter o comportamento de âncoras na mesma página, downloads, links externos e saídas comerciais `/go`. Uma saída que registra clique não deve ser buscada antecipadamente.
- Adicionar `loading.tsx` e fronteiras de `Suspense` adequadas às páginas públicas e privadas. A estrutura já autorizada permanece utilizável; o estado de carregamento não expõe dados privados.
- Exibir feedback perceptível e acessível durante transições, com foco, teclado, `aria-busy`/status e movimento reduzido preservados.
- Controlar prefetch nas rotas dinâmicas custosas. Começar sem antecipar todos os produtos/abas e liberar antecipação seletiva só quando a medição mostrar ganho sem multiplicar consultas.
- Sincronizar o item ativo do shell e a aba com pathname **e query string**, inclusive quando só muda `?aba=`. Preservar aliases, voltar/avançar, filtros, paginação, conta selecionada e os identificadores carregados entre oportunidade e campanha.
- Tratar `/pauta` explicitamente: ela envolve seu próprio `AdminShell`, fora do layout `/admin`; não presumir que uma mudança apenas nesse layout cubra essa transição.

**Saída:** feedback do clique dentro da meta, transições internas preservam o layout quando compartilhado e o navegador não recarrega o documento inteiro nesses trajetos. Testar header, sidebar, drawer mobile e links de cards, não apenas navegação digitando URLs.

## Etapa 5 Conexões e localização das funções

### Pool de conexões

Preservar o pool compartilhado já implementado em `lib/database-pool.ts`. Medir espera na fila e o total de conexões por instância, incluindo localhost, funções e workers. Avaliar iniciar com uma conexão por instância serverless e aumentar somente se houver espera medida que justifique, considerando o limite agregado do pooler. Não elevar o limite do banco como primeira correção.

Conferir liberação após erro, rollback, ociosidade e recarga do desenvolvimento. `handle.end()` continua encerrando o handle lógico, sem derrubar conexões de outra operação. Revalidar a resolução de conta em cada transação pertinente e testar A → B → A em conexões reutilizadas.

A mudança para pooler de transações **não é uma simples troca para a porta 6543**. A documentação atual do Supabase alerta para incompatibilidade entre pipelining de Postgres.js e o pooler compartilhado em modo transação, incluindo problemas com `sql.begin()`. `prepare: false` sozinho não resolve esse ponto; não aplicar `max_pipeline: 0` como correção presumida. [Orientação oficial sobre Postgres.js](https://supabase.com/docs/guides/database/postgres-js).

Executar um experimento isolado com a versão instalada e o transporte candidato: transações reais, consultas simultâneas, parâmetros, resultados associados à chamada correta, erro/rollback e contexto A/B/A. Adotar modo transação somente se a compatibilidade estiver demonstrada. Se falhar, manter modo sessão com pool compartilhado pequeno e dimensionamento aprovado pela carga, ou escolher transporte compatível antes de liberar essa mudança. Não trocar o driver de todo o projeto sem necessidade demonstrada. A conclusão deve declarar o modo escolhido e o limite de concorrência validado.

### Região e configuração por ambiente

Em produção, configurar as funções que acessam o banco para São Paulo (`gru1`), respeitando o plano Vercel disponível. Versionar a configuração na raiz efetivamente consumida pelo projeto e revisar overrides por rota. Verificar a região da **função executada**, não apenas a região da CDN no header. A Vercel recomenda aproximar função e fonte de dados. [Configuração oficial de regiões](https://vercel.com/docs/functions/configuring-functions/region).

No localhost, manter a execução local e configurar somente o transporte homologado para o banco de destino. Documentar separadamente Development, Preview e Production; não sobrescrever `.env.local` com segredos de outro ambiente. Qualquer contratação necessária para isolamento ou mudança de plano depende da autorização de custo correspondente.

**Saída:** sem saturação ou respostas trocadas no ensaio definido; contexto eliminado no fim da transação; região real `gru1` na candidata; credenciais e acessos preservados. A decisão de transporte pode ser investigada cedo, mas não substitui as otimizações de SQL das etapas anteriores.

## Etapa 6 Validar o conjunto antes da publicação

| Frente | Verificações necessárias |
|---|---|
| Dados públicos | Mesmos produtos, total, ordenação, filtros, histórico comparável, campos de metadata e regras de expiração |
| Sessão e isolamento | Anônimo, usuário comum, afiliado owner/operator, troca de conta, suspensão/revogação e sessões A/B/A concorrentes |
| Navegação | Vitrine → produto → voltar; home → minha área; painel → curadoria/marketing/campanhas/pauta; mudança só de query; drawer mobile |
| Formulários e estado | Filtros, paginação, salvos, drafts e parâmetros de oportunidade/campanha preservados conforme o fluxo existente |
| Transporte | Falha de conexão, timeout, rollback, reuso após erro, ociosidade e concorrência com workers |
| Integrações | Links comerciais e atribuição preservados em fixture; login/redirecionamento/refresh com Auth real no ambiente autorizado |
| Desempenho | Metas medidas por etapa, servidor e navegador; sem prefetch criando uma rajada de consultas ao abrir a tela |

Reutilizar as suítes existentes e acrescentar somente testes que protejam os comportamentos alterados. Executar teste PostgreSQL nativo para SQL, planos, privilégios e concorrência; PGlite e mocks não homologam pooler/Auth. Preservar os testes de prontidão pública e de evidência canônica.

Comandos existentes úteis, selecionados conforme os arquivos e contratos alterados:

```bash
npm run typecheck --prefix packages/web
npm test --prefix packages/web
npm run test:public-readiness --prefix tools/editorial-tests
npm run test:price-evidence --prefix tools/editorial-tests
npm run rollout:verify --prefix tools/editorial-tests
npm run build --prefix packages/web
```

O build exige seu diretório de saída livre da instância de desenvolvimento. As suítes nativas e o novo ensaio de desempenho devem declarar que usam banco descartável. Não usar a `DATABASE_URL` do banco ativo para gerar dados sintéticos ou aplicar fixtures.

**Saída:** testes adequados aprovados, navegação autenticada conferida no navegador e comparação de desempenho anexada ao resultado da implementação. Falha em meta ou isolamento mantém a etapa aberta.

## Etapa 7 Publicar e conferir o domínio de produção

A aplicação remota da migration e a publicação são operações posteriores à implementação revisável. Reconfirmar projeto Supabase/schema `garimpa`, equipe/projeto Vercel, domínio e artefato antes de cada escrita. A base compartilhada recebe a migration uma vez; ela não é aplicada novamente por existir também um frontend em localhost.

Sequência de publicação:

1. Selecionar a candidata e revisar seu diff contra o commit realmente publicado. Como o HEAD local contém outras mudanças, não promover automaticamente o deploy mais recente como se ele contivesse apenas esta correção.
2. Testar em ambiente isolado tanto a aplicação atual quanto a candidata com a migration nova. Preservar compatibilidade de assinaturas e resultados durante a transição.
3. Capturar definições e privilégios anteriores das funções afetadas, estado de migrations e configuração/deployment de recuperação. Preparar o retorno das funções sem restaurar dados nem desfazer o isolamento instalado.
4. Após a autorização aplicável, aplicar a migration incremental compatível pelo procedimento explícito e transacional escolhido, registrando o resultado. Reconciliar uma execução incerta antes de repetir.
5. Conferir a aplicação atualmente publicada após a mudança SQL, pois ela começa a consumir as funções novas imediatamente.
6. Publicar a candidata com a configuração de região e conexão homologadas, respeitando o escopo de variáveis de Production. Validar mudanças de transporte separadamente para identificar regressões.
7. Promover/associar o domínio público à candidata validada. Confirmar por consulta à Vercel e requisições ao domínio que ele atende o deployment, commit e região esperados. Não remover proteção de acesso para facilitar o teste.
8. Fazer amostra pequena das páginas públicas, navegar com sessão autorizada e conferir logs de erro/conexão na janela posterior à publicação. Repetir medições após ociosidade e aquecimento.

Para produção, não gerar eventos comerciais sintéticos, vendas ou envios. Provas de escrita ficam nas fixtures; eventual teste real de uma integração deve ter destino e efeito autorizados. Não criar automação de monitoramento como efeito deste plano.

### Recuperação

- Se houver regressão de frontend, voltar ao artefato anterior compatível, mantendo a migration de desempenho se seus resultados e privilégios permanecerem corretos.
- Se a regressão estiver no SQL, aplicar a restauração previamente preparada como mudança incremental registrada, preservando dados, histórico de migrations, owners e grants.
- Se o transporte falhar, restaurar a configuração anterior e republicar o artefato compatível; não relaxar autorização, SSL ou isolamento.
- Interromper a promoção diante de qualquer mistura de contas, publicação indevida, perda de atribuição, erro recorrente ou desempenho pior. Não reinstalar policies permissivas para recuperar disponibilidade.

## Ordem de execução e fechamento

Executar **baseline e localhost → SQL → composição das leituras → navegação → conexão/região → validação integrada → publicação → conferência do domínio**. O experimento de transporte pode ocorrer após a preparação para esclarecer a decisão antes de implementar sua configuração. Não há dependência de refazer a organização visual do painel nem de reabrir o rollout V2.

A entrega final deve mostrar:

- Tempos antes/depois, com tamanho da amostra e separação entre desenvolvimento, build local e domínio público.
- Resposta visual rápida ao clique e chegada do conteúdo dentro das metas, com sessão e navegação reais.
- Ausência de erros de build, conexão e isolamento nos cenários definidos.
- Migration instalada e deployment/commit efetivamente atendendo o domínio, se a implantação tiver sido autorizada e realizada.
- Limites de carga, modo de conexão adotado e qualquer verificação essencial ainda pendente.

Se somente a implementação local estiver concluída, registrar esse alcance. Produção só é corrigida quando o domínio público e o banco ativo estiverem conferidos no conjunto implantado.
