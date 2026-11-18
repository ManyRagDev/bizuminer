# BizuMiner — plano de execução de capturas e pauta estável

Data: 11/11/2026. Estado: implementação local integrada em verificação; ativação e ensaio no destino pendentes. A seção 8 registra evidências e limites, sem tratar preparação local como publicação em produção.

**Revisão editorial de 13/11/2026:** o [plano integrado de curadoria](plano-integracao-captura-curadoria-vitrine-pauta.md) define a próxima evolução deste mesmo objetivo. Ele preserva durabilidade, commits atômicos, isolamento e leituras sem polling ocioso descritos aqui, mas substitui a regra de renovação exclusivamente por captura: jobs do backend poderão recalcular a seleção por frescor/TTL, e a pauta será selecionada na preparação do slot para uso. Leituras públicas continuam sem recompor o ranking nem consultar lojas ou IA. Esta atualização registra o plano; não afirma que a evolução esteja implementada ou ativada.

## 1. Objetivo e responsabilidade

Fazer a vitrine e a pauta funcionarem sobre uma versão estável dos dados. Capturas e operações relevantes movimentam o sistema; a passagem do tempo não recompõe o ranking. Uma captura prepara dados, valida o lote e publica uma atualização consistente, preservando o estado anterior enquanto trabalha.

Este é o plano individual do BizuMiner/Garimpa para corrigir execução, consultas e publicação. Substitui as instruções correspondentes do plano integrado da raiz. Não depende da implementação do PostSpark e não substitui as regras editoriais do [plano de curadoria existente](plano-motor-curadoria.md).

A instalação e administração da VPS estão sendo realizadas em outro chat, conforme informado pelo usuário. Este plano não instala stack, altera proxy/DNS, define backups ou conduz cópia de produção. Trata apenas das adaptações da aplicação e dos requisitos de integração com o ambiente entregue. A seção 5 delimita essa interface.

## 2. Ponto de partida e comportamento esperado

Segundo o [registro das correções anteriores](../../../implementacao-egress-2026-11-11.md), já existem implementações locais de seleção persistida por conta/canal, versões de origem/apresentação, invalidação transacional e respostas pequenas quando nada mudou. A migração correspondente é `packages/persistence/supabase/migrations/20261111042204_pauta_versioned_selection.sql`.

Conferir alterações locais, schema e estado de aplicação da migração antes de continuar. Os testes registrados anteriormente não demonstram o custo de um lote real nem significam que a migração esteja publicada. A [verificação de suspensão](../../../verificacao-egress-2026-11-11.md) é histórica; este documento não afirma estado operacional atual.

O comportamento pretendido é:

1. Abrir a vitrine/pauta consulta apenas a versão e os dados necessários à tela, com escopo/autorização apropriados.
2. Navegação e ações justificam consultas; tela ociosa não relê candidatos continuamente.
3. Captura explícita cria um trabalho durável e identificável; cada etapa pode ser retomada.
4. Produtos e observações são preparados sem expor uma edição intermediária da pauta.
5. Publicação validada avança a versão por escopo afetado. Leitores passam a usar a nova edição consistente.
6. Leituras seguintes reutilizam a seleção persistida. A primeira composição da nova versão é coordenada para não ocorrer repetidamente em concorrência.
7. Divulgação, remoção, curadoria e alterações relevantes de configuração continuam atualizando o que afetam. Alteração meramente visual ou de progresso não invalida ranking sem motivo.
8. Expiração/revogação pode retirar ou bloquear uma oferta, sem buscar uma substituta pelo relógio. A próxima captura fornece a renovação da pauta.

Validade de uma ação e atualização do ranking são responsabilidades diferentes. Uma pauta estável não autoriza divulgar uma oferta revogada nem acessar dados de outra conta.

## 3. Contratos de implementação

| Fronteira | Contrato |
| --- | --- |
| Pedido → captura | Identidade de lote/operação, conta autorizada, origem, parâmetros e política de repetição. Repetição do mesmo pedido recupera o trabalho, sem duplicar efeitos. |
| Captura → persistência | Checkpoints por etapa, observações com identidade de origem e histórico preservado. Reinício não recomeça todo o lote desnecessariamente. |
| Preparação → publicação | Dados preparados fora da versão visível; validação de completude; confirmação final curta e idempotente. Nenhuma chamada externa dentro de transação longa. |
| Publicação → versões | Avançar a revisão uma vez por publicação e escopo afetado. Alterações legítimas concorrentes podem avançá-la novamente; não ocultá-las para cumprir artificialmente uma contagem. |
| Versão → seleção | Seleção identificada por conta/canal, revisão e formato do cache. Escrita concorrente invalida resultado antigo ou impede sua publicação como atual. |
| Seleção → interface | Resultado compacto/paginado quando necessário; confirmação de revisão permite resposta `unchanged`. Não transportar novamente evidências/documentos completos sem necessidade. |
| Operação de divulgação → servidor | Autorização e condições atuais verificadas no servidor, com confirmação idempotente. Estado em memória não substitui esse controle. |

Reutilizar schemas, IDs e mecanismos existentes. Atualizar `PAUTA_CACHE_FORMAT` quando mudar o contrato persistido. Não criar um cache somente em memória como fonte autoritativa; reinícios e múltiplas instâncias precisam observar a mesma edição.

## 4. Etapas de implementação

### B0 — Reconciliação do estado e medição inicial

- [ ] Registrar alterações locais, migrações aplicadas/pendentes e regras editoriais vigentes. Preservar trabalho existente.
- [x] Mapear todos os produtores: captura manual, extensão, automações, atualização de preços, curadoria, afiliados, canais e divulgação. Identificar qual versão cada mudança precisa invalidar.
- [x] Inspecionar `packages/web/lib/capture-batch-worker.ts`, `capture-batch-db.ts`, `curation-snapshot.ts`, `pauta-db.ts`, `pauta-ranking.ts`, rotas e consumidores de interface, cruzando com a persistência.
- [x] Inventariar timers, agendadores, reconciliações e supervisores da aplicação, inclusive caminhos suspensos. Diferenciar execução ativa de monitoramento ocioso.
- [x] Preparar fixtures representativas com duas contas, vários canais, lotes parciais, produtos repetidos, expiração e alterações concorrentes.
- [ ] Medir comportamento inicial local e declarar o que não pode ser reproduzido sem acesso ao destino/provedores. Definir dimensões de um lote representativo antes do ensaio real.

Aceite: mapa de escritas e invalidações, estado local preservado, base de comparação e lacunas explícitas. Não redesenhar fórmula editorial como efeito colateral da correção de tráfego.

### B1 — Capturas com início, retomada e encerramento

Depende de B0.

- [x] Reutilizar registro durável de lotes e execução por identificação, conferindo os pontos em que uma gravação pode ocorrer sem ativar o executor.
- [x] Acoplar ativação à persistência com mecanismo recuperável. Preferência, se o ambiente fornecer PostgreSQL com sessão persistente: notificação transacional como sinal e registro do lote como verdade durável. Confirmar compatibilidade com o chat da VPS antes de fixar o transporte.
- [x] Se usar listener, registrar a escuta antes de consultar pendências e recuperar trabalho na reconexão. Notificação duplicada ou perdida não pode duplicar nem esquecer lotes.
- [x] Preservar claim/lease ou proteção equivalente já existente e checkpoints por etapa. Ajustar concorrência por fonte e conta para não saturar provedores nem bloquear outros trabalhos indefinidamente.
- [x] Tratar espera por navegador/extensão ou autorização externa como estado explícito; não consultar continuamente uma fonte que não pode progredir.
- [x] Persistir prazos de tentativas adiadas; reconstruir temporizadores na retomada. Se necessário, usar recuperação residual local pequena e mensurável, em vez de busca frequente sem trabalho.
- [x] Diferenciar falha transitória, limite de provedor, quota, credencial inválida e erro definitivo. Estado de espera sobrevive ao restart; resultado externo desconhecido é reconciliado antes de repetir efeitos.
- [x] Encerrar acompanhamento de lote terminal. Revisar disponibilidade/health e supervisor para impedir que reinício reative retries rápidos.

Aceite: uma solicitação inicia um lote recuperável; queda ou sinal duplicado não multiplica efeitos; ausência de trabalho elimina o polling frequente; todos os controles residuais têm causa e custo identificados.

### B2 — Preparação e publicação consistente

Depende dos contratos B0; integra com B1.

- [x] Auditar a fronteira atual de commits: coalescer gatilhos por transação não basta se cada produto confirma isoladamente e se torna visível imediatamente.
- [x] Preparar dados em lotes/etapas identificadas e fora da edição visível. Escolher estrutura compatível com o modelo existente, sem reescrever histórico de preços.
- [x] Definir completude por fonte e escopo. Se publicação parcial for legítima, torná-la uma política explícita e auditável; falha não pode expor mistura acidental de etapas.
- [x] Validar o lote e publicar em transação curta, com troca de referência/revisão ou mecanismo equivalente. Leitores observam a edição anterior ou a nova, não uma montagem intermediária.
- [x] Garantir idempotência da publicação e deduplicação de observações nas retomadas. Uma nova observação legítima não deve ser confundida com repetição técnica da mesma operação.
- [x] Tratar duas capturas concorrentes e mudanças de curadoria durante a preparação. Uma publicação antiga não pode sobrescrever decisão mais nova; conflito deve provocar recomposição ou revalidação.
- [x] Preservar a edição anterior quando preparação/validação falhar. Planejar limpeza limitada de preparações abandonadas, preservando auditoria e histórico necessário.

Aceite: queda no meio da captura mantém a pauta anterior; retomada não duplica dados; uma publicação consistente avança a revisão por escopo; repetição da confirmação é inofensiva.

### B3 — Pauta estável e leituras proporcionais à operação

Depende de B0; pode avançar junto a B1/B2 com fixtures de versões.

- [x] Reaproveitar seleção persistida por conta/canal e garantir autorização antes da leitura. Conferir invalidação para cada produtor identificado em B0.
- [x] Impedir recomposições concorrentes da mesma versão. Se a origem mudar durante a composição, não publicar o resultado como correspondente à revisão nova.
- [x] Separar revisão de apresentação e revisão de seleção; progresso de captura e códigos de link não devem recalcular ranking sem mudança relevante.
- [x] Remover recomposição por relógio e buscas repetidas de candidatos na interface. Abertura, navegação, ação ou sinal de nova versão justificam atualização; não manter polling ocioso para descobrir o que uma publicação já pode sinalizar.
- [x] Usar respostas compactas, `unchanged` e paginação conforme o caminho. Conferir queries e respostas reais, não só o tamanho do JSON no navegador.
- [x] Expiração só retira/bloqueia a entrada quando necessário; não preencher a vaga nem refazer ranking. Divulgação continua verificando condições atuais no servidor.
- [ ] Agrupar alterações reversíveis de interface e enviar mudanças efetivas, preservando confirmação de salvamento e proteção contra sobrescrita concorrente. Checkpoints de captura e operações de negócio permanecem duráveis.

Aceite: leituras repetidas da mesma edição não consultam candidatos/evidências novamente; próximas capturas e operações relevantes atualizam a edição correta; pauta não muda de ranking só porque o tempo passou.

### B4 — Jornada completa, concorrência e consumo

Depende de B1–B3.

- [x] Conferir scripts atuais e executar testes pertinentes, incluindo `npm run test:egress --prefix tools/editorial-tests`, testes web afetados e testes nativos de concorrência da pauta quando disponíveis.
- [ ] Validar abertura → captura → progresso → publicação → pauta → divulgação, com persistência e reabertura. Distinguir fixtures de integrações reais.
- [ ] Ensaiar queda após persistir o pedido, no meio do lote e após commit antes da resposta; duas capturas simultâneas; leitura fria simultânea; curadoria concorrente e revogação de acesso.
- [ ] Medir consultas, bytes e tempo por abertura, navegação, operação, lote e publicação. Separar preparação, primeira composição e leituras reutilizadas; não extrapolar um teste sintético para consumo mensal.
- [ ] Medir tráfego banco → servidor, servidor → navegador e provedores, além de CPU/memória, tentativas e observações úteis por lote. Identificar telemetria separadamente, com payload e retenção limitados.
- [ ] Observar uma hora ociosa e uma janela controlada de 24 horas antes de liberação ampla, coordenadas com o responsável do ambiente. Não reiniciar serviços compartilhados unilateralmente para testar.
- [ ] Estabelecer concorrência e alertas a partir da medição, sem limite global arbitrário que interrompa uma captura válida. Se o volume necessário continuar alto, apresentar ao usuário custo por lote e alternativas antes de reduzir cobertura/frequência.

Aceite: consistência e isolamento demonstrados, custo conhecido e nenhuma repetição sem causa. Build/testes unitários sozinhos não validam a pauta publicada nem a ação de divulgação.

### B5 — Entrega da aplicação e preparação da ativação

- [x] Entregar artefatos, comandos, variáveis sem segredos, migrações ordenadas, permissões e requisitos de processo ao responsável da VPS.
- [ ] Conferir schema/RPCs e compatibilidade de Auth/Storage usados pela aplicação antes de ativar consumidores. Coordenar migrações em banco compartilhado.
- [ ] Reconciliar lotes em execução/espera e versões persistidas antes de mudar executores. Garantir uma única origem de escrita/execução para cada trabalho.
- [ ] Validar a aplicação no ambiente fornecido e preparar liberação restrita, métricas e reversão de código. Retorno a uma cópia antiga de dados exige coordenação para não perder novas capturas/decisões.
- [x] Manter capturas automáticas desativadas na primeira liberação. Propor frequência e abrangência depois da medição por lote e da decisão do usuário.
- [x] Entregar evidências, pendências e instruções de retomada. Instalação da VPS não é confirmação de que automações antigas possam ser reativadas.

Aceite: aplicação pronta no destino, migrações compatíveis e jornada verificada. Corte de infraestrutura e cópia física de dados pertencem ao outro chat.

## 5. Integração necessária com o chat da VPS

Receber: endpoints de ensaio/destino, versões e recursos disponíveis, mecanismo seguro de credenciais, acesso a dados/objetos necessários, condições para processos de captura e eventual listener, limites de recursos, health checks e política de supervisão. Confirmar suporte das capturas que dependem de navegador, extensão ou serviços externos sem presumir que funcionam só por instalar o banco.

Fornecer: migrações e permissões, comandos de aplicação/executor, variáveis sem valores secretos, requisitos de navegador/runtime, comportamento de parada graciosa, recuperação de lotes e recursos medidos.

B0–B3 e testes locais avançam independentemente da instalação. Ensaio real e ativação dependem do ambiente confirmado. Se existir banco compartilhado com outra aplicação, coordenar mudanças de schema; isso não cria dependência funcional do motor do PostSpark.

## 6. Matriz de aceite

| Cenário | Resultado exigido |
| --- | --- |
| Abrir e reler a pauta | Versão autorizada reutilizada; sem nova consulta de candidatos a cada leitura. |
| Tela e executor ociosos | Ausência de recomposição e polling frequente sem trabalho. |
| Captura repetida | Mesmo trabalho recuperado, sem duplicar efeitos. |
| Captura parcial/falha | Pauta anterior preservada até publicação válida. |
| Duas capturas e curadoria concorrente | Nenhuma decisão nova sobrescrita por publicação antiga. |
| Leitores simultâneos | Uma composição por versão/escopo quando necessária, sem tempestade de consultas. |
| Expiração e revogação | Bloqueio/retirada quando necessário, sem preenchimento automático pelo relógio. |
| Divulgação | Autorização e condições verificadas; confirmação idempotente. |
| Contas e canais distintos | Isolamento e invalidações corretos. |
| Banco/provedor indisponível | Espera controlada e retomada durável, sem ciclo rápido de retries/reinícios. |
| Nova captura publicada | Nova versão consistente disponível, sem exposição de etapas intermediárias. |

## 7. Ordem e decisões de produto

Sequência: **B0 → B1/B2/B3 → B4 → B5**. As três frentes intermediárias compartilham o contrato de versão/publicação definido em B0; integrar mudanças de persistência em ordem compatível. Não abrir outro motor editorial nem alterar critérios de aprovação como consequência incidental deste trabalho.

Frequência/abrangência automática, eventual publicação parcial que altere a experiência e consumo inevitavelmente alto devem voltar ao usuário com alternativas concretas. Não prometer economia percentual nem tráfego zero antes da medição.

A implementação autorizada está registrada abaixo. Migrações foram executadas somente em bancos locais descartáveis; nenhuma instalação, migração remota, captura de fornecedor real ou reativação de automação foi feita por esta frente.

## 8. Implementação local e contrato de ativação — 11/11/2026

Os itens marcados abaixo significam implementação/conferência local, com os limites desta seção. Não certificam ativação remota.

### Estado reconciliado (B0)

O trabalho começou com alterações locais na extensão (0.3.2/0.3.3), painel de resultados, plano de desempenho, seleção persistida da pauta, fixtures e duas migrações ainda não versionadas no Git. Foram preservadas, incluindo o submódulo `archive/site`. A migração de pauta `20261111042204` foi usada como base, sem reescrever seu histórico. Não foi consultado nem modificado o schema remoto nesta frente: aplicado localmente não significa aplicado no destino. O Supabase de ensaio informado pela infraestrutura ainda está vazio de schema/dados Garimpa.

Mapa dos produtores e invalidações:

| Produtor | Fronteira de commit e efeito |
| --- | --- |
| Lote solicitado pela UI/API | `capture_batch`, chave de pedido por conta e parâmetros conferidos; progresso altera somente revisão de apresentação. |
| Captura API, descoberta e atualização de preços | `PostgresStore` prepara por `capture_run`; run independente publica ao concluir OK, lote publica somente após todas as fontes OK. `product`/`price_observation` alteram revisão de seleção e apresentação uma vez na transação. |
| Extensão/navegador em lote | `BrowserCaptureStore` prepara toda a importação e enfileira continuação na mesma transação; publicação usa a fronteira comum do lote. |
| Extensão unitária, bookmarklet e registro manual de oferta | Transação por pedido já existente; deduplicação pela identidade do pedido. Não há chamada de marketplace dentro do commit. |
| Curadoria, triagem, confirmação de opção e evidência comparativa | `product_curation`, `curation_event`, `editorial_assessment`, `editorial_offer_choice`, `comparative_evidence_event` invalidam seleção; decisões humanas não são regravadas pela publicação de captura. |
| Conta/afiliados/publicação | `affiliate_account`, `affiliate_marketplace_config`, `publication` invalidam seleção dos canais afetados. Autorização é conferida antes do cache. |
| Canal/divulgação | `recommendation_channel` e `recommendation_exposure` invalidam o canal correspondente. Confirmação usa fatos atuais e identidade idempotente. |
| Código curto/progresso | `short_link`, `capture_run`, `capture_batch` alteram apenas revisão de apresentação, sem buscar candidatos para ranking. |
| Apresentação editorial | Derivada de produto/avaliação/curadoria; esses produtores já invalidam a seleção. Não há nova fonte autoritativa em memória. |

Regras editoriais do plano de curadoria e políticas de recomendação permanecem vigentes. AliExpress continua exigindo confirmação de opção quando aplicável; capturar/triagem não autoriza automaticamente divulgação. O Mercado Livre continua sem captura automatizada de servidor.

Inventário de execução/temporizadores:

- Pauta: abertura, troca de canal/filtro, foco/retorno à aba, ação explícita e evento `bm:operation-changed` da conta. Sem intervalo ocioso; expiração só retira entradas.
- Hoje: acompanha trabalho ativo; espera por navegador, credencial, reconciliação ou prazo de retry não consulta continuamente. Eventos de navegação/ação permitem consultar novamente.
- Painel de lote: consultas de progresso somente em fase progredível; terminal e esperas interrompem acompanhamento periódico.
- Vitrine: foco/retorno à aba verifica versão com debounce. Relógio só esconde destaque vencido, sem recarregar nem preencher vaga. Telemetria agenda envio somente com eventos pendentes, até 50 eventos/payload; retenção existente de sete dias é distinta do ranking.
- Executor durável: LISTEN antes de consultar fila; recuperação no início/reconexão e temporizador para prazo persistido. Fila vazia não agenda varredura. Falha de banco possui retry de transporte de 60 segundos, identificado em log; não cria pedidos novos.
- Workflows existentes `discover-shopee.yml` e `monitor-prices.yml` mantêm agendamento declarativo, condicionado a `MONITORING_ENABLED` (e switch da fonte). Nenhuma variável remota foi reativada. Rotas de cron e comandos de manutenção continuam dependentes de invocação externa; não presumir sua instalação no novo ambiente.

### Publicação e retomada (B1/B2)

Política `complete-operation-v1`: lote completo ou edição anterior. Produtos e observações ficam em `capture_prepared_offer` até confirmação única. Um lote parcial/falho não publica suas fontes bem-sucedidas isoladamente. A triagem e os links de afiliado são operações posteriores à captura publicada; cada alteração editorial legítima pode avançar novamente a revisão. Não se oculta essa alteração para produzir uma contagem artificial de uma revisão para toda a jornada.

Repetir pedido usa a mesma chave por conta; reutilizar a chave com outros parâmetros é conflito. Há no máximo um lote ativo por conta (contas distintas progridem em paralelo). Duplicados legados precisam ser reconciliados antes da migração. Claims têm identidade de executor e prazo; produtor vencido não grava preparação nem publicação. Consultas já concluídas são checkpoints reaproveitados. Uma consulta interrompida pode repetir páginas de leitura do fornecedor; a identidade run/produto/opção mantém a primeira observação preparada e impede efeitos duplicados. Não há promessa de checkpoint por página nem de tráfego zero após queda.

Falha de triagem com resultado externo incerto exige conferência, sem repetição automática de IA. A interface permite encerrar uma espera e repetir após corrigir credencial/quota; encerrar não desfaz produtos já publicados. Uma nova captura mantém a política de amostragem existente: mudanças reais geram observações; recaptura idêntica dentro da janela de 20 horas reaproveita a amostra anterior, e fora da janela volta a registrar histórico. Publicação mais antiga preserva preço/dados mais novos e decisões humanas concorrentes.

Limpeza é explícita e limitada: `garimpa.prune_capture_preparations(tenant, limite)` aceita 1–5000 (padrão 500), remove preparação publicada há mais de sete dias ou falha terminal elegível há mais de 30 dias. Não apaga observações, eventos ou auditoria de execução; não instala cron de limpeza.

### Verificações e dimensões (B3/B4)

Verificação integrada local: suítes web e persistência passaram; build/typechecks passaram; egress, 18 cenários de lote, fatos de captura, publicação/jornada/pauta em PostgreSQL nativo passaram. Listener foi executado como processo real em banco descartável, com readiness, reconexão após terminar sua sessão SQL e SIGTERM; não houve fornecedor real.

Baseline anterior às mudanças desta frente: `test:egress` passou, com 60 verificações versionadas retornando 10.500 bytes de resultados SQL e sem releitura de candidatos; a concorrência fria nativa já convergia em uma composição. Isso mede o trabalho local anterior preservado, não economia atribuída integralmente a esta implementação.

Fixture integrada: PostgreSQL 17.6 descartável, dois tenants, WhatsApp/Stories, duas fontes e 40 ofertas preparadas, dois replays técnicos, publicação repetida, reabertura, divulgação repetida e captura falha. Usa `executeCaptureBatch`, `PostgresStore`, RPC de publicação e DAL da pauta reais; fornecedores/IA são substituídos por dados sintéticos. Um ensaio local mediu publicação de 40 ofertas em 61 ms, primeira composição em 75 ms e resposta completa da pauta de 20.421 bytes. São medidas de uma fixture pequena, não estimativa de produção ou consumo mensal.

Comandos reproduzíveis (a partir da raiz; o binário PostgreSQL deve estar previamente disponível):

```sh
npm test --prefix packages/web
npm test --prefix packages/persistence
npm run typecheck --prefix packages/web
npm run typecheck --prefix packages/persistence
npm run build --prefix packages/web
npm run test:egress --prefix tools/editorial-tests
npm run test:capture-batch --prefix tools/editorial-tests
BIZUMINER_TEST_PG_BIN=/caminho/postgres/bin npm run test:capture-execution-native --prefix tools/editorial-tests
BIZUMINER_TEST_PG_BIN=/caminho/postgres/bin npm run test:pauta-cache-native --prefix tools/editorial-tests
BIZUMINER_TEST_PG_BIN=/caminho/postgres/bin npm run test:capture-publication-native --prefix tools/editorial-tests
BIZUMINER_TEST_PG_BIN=/caminho/postgres/bin npm run test:capture-journey-native --prefix tools/editorial-tests
```

Os testes nativos exigem abrir uma porta de loopback e criam/removem seu próprio banco; nunca usam a `DATABASE_URL` de produção. Testes dos efeitos React executam código TSX real com relógio/browser virtual: uma hora virtual ociosa não fez novas requisições. Isso não substitui uma hora observada no navegador real nem a janela de 24 horas do ambiente.

### Entrega para a VPS (B5)

Para a migração seletiva ao Supabase próprio, o [contrato de integração](./contrato-integracao-supabase-vps.md) complementa esta entrega: baseline de banco vazio antes dos deltas, permissões humanas/credenciais e arquivo dos oito compartilhamentos. O arquivo público foi implementado e validado localmente (seção 10 do contrato), com migration `20261112023232_shared_link_archive.sql` após os deltas abaixo. Ainda requer validação/importação do snapshot real e ensaio no destino; os testes locais não certificam restauração nem liberação pública.

Contrato confirmado pelo chat de infraestrutura e registrado em `../infraestrutura-vps/README.md` na raiz de Projetos linux: PostgreSQL 17.6, conexão direta persistente no serviço Docker `db:5432`; executor ainda não conectado à rede. API de ensaio no host `http://127.0.0.1:18000`, na rede da stack `http://api-gw:8000`. Sem porta SQL publicada; domínio/HTTPS, usuários, dados, roles de aplicação e integração Auth/Storage ainda dependem da frente de infraestrutura. Esta frente não instalou ou alterou a VPS.

Entregar checkout completo com `packages/web`, `packages/persistence` e `packages/capture`; Node 22 compatível com `--experimental-strip-types`, dependências dos lockfiles dos pacotes. O listener não usa browser headless: capturas dependentes de navegador continuam na extensão do usuário.

Migrações incrementais, depois de reconciliar a cadeia já instalada (não aplicar cegamente toda a pasta a uma base antiga):

No dump seletivo real da VPS, falta também a dependência histórica `20261020002440_garimpa_comparative_evidence_event.sql`. Aplicá-la inteira antes da pauta; a seção 11 do contrato reproduz a falha e valida a sequência sobre os objetos literais do export. Não omitir os triggers de invalidação para contornar sua ausência.

1. `20261111042204_pauta_versioned_selection.sql` — seleção/revisões preexistentes nesta entrega.
2. `20261112002243_capture_durable_execution.sql` — chave idempotente e sinal transacional.
3. `20261112002247_capture_atomic_publication.sql` — staging/RPCs/publicação e limpeza limitada.

A migração de resultados `20261110192436_marketplace_performance.sql` é alteração local anterior, independente da fila, e também precisa ser reconciliada se o painel correspondente for entregue. Novas tabelas usam RLS, funções de captura são `SECURITY INVOKER`, sem acesso a `anon`, `authenticated` ou runtime público. Conexões da aplicação/executor devem usar papel sem superuser/BYPASSRLS; listener não precisa receber credenciais administrativas da stack.

Variáveis, sem valores secretos:

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | Conexão de trabalho do papel da aplicação com escopo por transação; na rede privada sem TLS usar explicitamente `?sslmode=disable`; TLS aceita `require` ou `verify-full`. |
| `CAPTURE_EXECUTOR=durable` | Opt-in explícito da web e do listener novo; sem isso mantém transporte anterior. |
| `CAPTURE_LISTEN_DATABASE_URL` | Sessão PostgreSQL dedicada; nunca pool transacional. Configurar `sslmode` conforme transporte fornecido. |
| `CAPTURE_WORKER_TENANTS` | Lista explícita de tenants permitidos, separada por vírgulas. |
| `CAPTURE_HEALTH_PORT` | Porta opcional de health local do listener, sem publicação na internet. |
| `AFFILIATE_SECRETS_MASTER_KEY` | Acesso aos segredos de fonte por conta; provisionar por arquivo privado. |
| `GEMINI_API_KEY` | Triagem existente, somente quando a etapa for autorizada no ensaio. |
| `SHOPEE_CAPTURE_ENABLED`, `ALIEXPRESS_CAPTURE_ENABLED` | Switches por fonte, ativação controlada; não equivalem a ativar cron. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e variáveis server-side Auth/Storage existentes | Conferir com endpoints/chaves do destino, OAuth e objetos migrados. Nunca publicar service role. |

Com o ambiente injetado por arquivo privado fora do repositório, o preflight é somente leitura:

```sh
node --experimental-strip-types packages/web/bin/inspect-capture-runtime.ts
node --experimental-strip-types packages/web/bin/listen-capture-batches.ts
```

O segundo comando inicia o consumidor e só deve ser executado após a liberação do ensaio; não é instalação nem scheduler. Preflight verifica schema, papel, contas e lotes ainda ativos; não certifica modo do pooler, Auth/Storage ou credenciais de fornecedor. Health `/health` deve ser consultado de dentro do contêiner quando estiver ligado ao loopback; prontidão não significa que provedores estão disponíveis.

Antes de trocar consumidor: inventariar lotes antigos por executor/fase, encerrar ou reconciliar resultados externos desconhecidos, impedir dois mecanismos de escrita para o mesmo trabalho. Não alterar `executor` em lote vivo só para fazê-lo aparecer ao novo listener. O consumidor usa o prazo durável da etapa e relê a propriedade no vencimento; a extensão do prazo de triagem não é cortada por um timeout global de 55 minutos. Os subprocessos de captura/triagem conservam seus limites próprios, a conferir no ensaio real. Parada graciosa deixa filhos concluírem; kill forçado é recuperado pelo lease e requer margem apropriada do supervisor, sem restart agressivo. Rollback de código precisa respeitar o novo staging; voltar o writer antigo durante preparação pode expor dados parciais. Não voltar uma cópia antiga de dados sem coordenação.

### Limites para liberação ampla

B4/B5 permanecem abertos para: migrações/roles no destino compartilhado, Auth/Storage e objetos reais, navegador/extensão contra o destino, captura representativa com provedores autorizados, bytes reais banco→servidor/provedor, CPU/RAM e custo por lote, uma hora ociosa real e janela controlada de 24 horas. Dimensionar inicialmente um ensaio de duas contas, dois canais, duas fontes, 3–5 consultas por fonte e 20 resultados por consulta; registrar repetidos/novos/úteis sem extrapolar a fixture de 40 ofertas. Ajustar volume após confirmar os limites dos provedores. Capturas automáticas continuam desligadas até medição e decisão do usuário.
