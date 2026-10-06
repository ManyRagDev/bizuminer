# Plano de integração da captura curadoria vitrine e pauta

**Data:** 05/10/2026. **Estado:** primeira entrega supervisionada implementada; migration aplicada via MCP e verificada no banco conectado; calibração humana pendente.

O BizuMiner deve procurar candidatos alinhados ao seu público, avaliar se merecem indicação e manter uma seleção editorial compartilhada pela página inicial e pela pauta. O resultado esperado é que cada destaque tenha uma justificativa verificável, uma oferta válida e uma apresentação que deixe claro o que será entregue.

A seleção persistida supervisionada controla home e pauta depois da primeira ativação. Antes dela, o ranking global compartilhado permite começar com os melhores disponíveis no catálogo aprovado. A adaptação do plano de captura virá depois, usando os motivos das decisões e as lacunas dessa seleção.

## Registro da primeira implementação

O percurso captura → evidências → avaliação humana → seleção versionada → home/pauta está implementado. A mesa permite avaliar cinco dimensões, esclarecer o conteúdo da compra, registrar dúvidas e preço máximo, incluir/ordenar/retirar produtos e ativar uma versão com vigência. Home e pauta leem essa seleção; o catálogo geral continua identificado como catálogo, e a pauta não faz uma segunda escolha por IA.

A [classificação da hero](./classificacao-hero.md), na política `hero-v2`, ordena os melhores disponíveis sem corte de nota: até três itens válidos da edição destinados à home. Antes da primeira edição, home e pauta compartilham os três melhores do catálogo aprovado, com prioridade a avaliações válidas e ranking separado dos sinais disponíveis para produtos ainda não avaliados. Essa leitura não fabrica avaliações nem edições. A seleção geral mantém sua ordem editorial; uma edição vazia, vencida ou retirada continua prevalecendo sobre o catálogo.

A migration `20261005235546_editorial_selection.sql` foi executada em PostgreSQL isolado via PGlite, com 18 cenários dos serviços reais. Testes e typechecks dos três pacotes e build web passaram. No navegador local foram conferidos home, ordenação por preço, paginação, detalhe, estado administrativo sem migration e pauta vazia; o encaixe mobile também foi conferido. A ativação de produtos reais ainda não foi conferida no navegador.

A migration foi aplicada via MCP ao projeto `spbuwcwmxlycchuwhfir`, com versão remota `20261005235546`; o arquivo local foi alinhado a essa versão. Schema, constraints, RLS e permissões foram conferidos no destino. A configuração de privilégios padrão do banco foi incorporada ao teste e neutralizada nas tabelas novas para preservar avaliações/itens sem UPDATE ou DELETE. Os serviços reais, usando `garimpa_app`, reconheceram o schema e carregaram 238 candidatos, sem avaliação ou seleção fabricada. Produtos, observações e decisões existentes foram preservados.

Esta entrega cobre a evidência opcional da fase 1, a avaliação humana central da fase 2 e o núcleo supervisionado da fase 3. Permanecem pendentes a amostra e calibração humana da fase 0, sugestões de IA pela nova rubrica, comparação em modo sombra, orquestração da fase 4 e realimentação/sincronização da fase 5. Não há afirmação de qualidade editorial medida nem autorização técnica de decisões automáticas pela política nova.

Detalhes de operação, capacidades das fontes, validação e transição: [registro da entrega](./entrega-integracao-curadoria-01.md).

## Objetivo e definição editorial

Um bom candidato é um produto adequado ao público do BizuMiner, com utilidade ou interesse compreensível, uma oferta que vale considerar e informações suficientes para indicar sem criar uma expectativa errada.

A hipótese inicial de público é quem procura utilidades para casa e rotina, acessórios práticos e presentes acessíveis. Produtos de nicho podem participar de coleções específicas quando houver contexto e evidências. Essa hipótese será calibrada com decisões reais do dono.

Separar três perguntas:

1. **Mérito do produto:** merece indicação para esse público e finalidade?
2. **Mérito da oferta:** essa configuração, nesse preço e nessas condições, merece atenção agora?
3. **Mérito do destaque:** entre os elegíveis, esse item merece o espaço que ocupará na seleção atual?

Desconto anunciado, novidade, vendas e comissão não substituem essas respostas. Um produto aprovado pode aguardar um preço melhor ou perder prioridade por repetição sem se tornar um produto rejeitado.

## Componentes existentes e diferenças atuais

| Componente | Base existente | Integração necessária |
|---|---|---|
| Descoberta | `packages/persistence/src/capture-plan.ts`, plano por intenções, famílias e exploração | Consumir uma versão do direcionamento editorial e registrar resultados úteis por consulta |
| Ingestão | `ingest.ts`, `store.ts`, `pg-store.ts`, observações e proveniência | Preservar evidências adicionais e sinalizar alterações que exigem reavaliação |
| Curadoria | `product_curation`, `curation_event`, grupos, snapshots, Bússola e triagem | Avaliação multidimensional compartilhada e reprodução do contexto de cada decisão |
| Seleção administrativa | `app/admin/curadoria/selecao-view.tsx` lista produtos aprovados | Separar catálogo aprovado de seleção vigente e permitir escolher, ordenar e retirar destaques |
| Home | `topDeals()` ordena por sinal e intercala lojas; o carrossel pontua `initialProducts` | Ler destaques globais da seleção persistida; eliminar seleção dependente da página |
| Pauta | `/api/pauta` chama `globalHeroProducts(40)` e `curateProducts(..., 20)` | Consumir a mesma seleção, sem uma segunda avaliação editorial independente |
| Acompanhamento | `monitoring-policy.ts`, CLI e workflow `monitor-prices.yml` | Considerar seleção vigente e reavaliar oportunidade após mudanças de preço |
| Operação | Rodagens, lotes e `triage_run` | Registrar continuidade entre captura, avaliação e preparação da seleção |

A triagem semântica atual recebe título, categoria e preço; a reordenação da pauta recebe também nota e vendas, mas usa outro prompt. A proposta unifica critérios, contexto e resultado, conservando as bordas específicas de cada marketplace.

Este plano detalha a integração prevista em M4-I e a calibração de M4-F/G/H do [plano do motor](./plano-motor-curadoria.md). Os registros históricos permanecem como histórico; nenhuma etapa antiga passa a concluída por este documento. Conferências pendentes e o estado das migrations devem ser conciliados na fase inicial.

## Regras da integração

- Captura gera candidatos e reobservações; aprovação e seleção têm contratos separados.
- Decisões humanas prevalecem. Reprocessamento não sobrescreve silenciosamente seus vereditos.
- Falta de dados permanece desconhecida. Zero avaliações, campo ausente e nota zero não recebem a mesma interpretação.
- Informação materialmente ambígua impede destaque até esclarecimento; não implica rejeição definitiva.
- Histórico compara a mesma oferta/configuração. Quando isso não for verificável, restringir a afirmação ao preço informado pelo anúncio.
- Produto conhecido continua sendo reobservado, mesmo quando uma consulta atingiu seu limite de descoberta.
- Diversidade serve ao público; não há cota de destaque por loja. Saturação gera espera, não um rótulo negativo de qualidade.
- Comissão não participa do julgamento editorial inicial.
- Preço atual mantém a janela existente de 48 horas; presença pública mantém o teto de sete dias. Expiração do destaque pode ocorrer antes. Mudanças nesses parâmetros serão decisões explícitas.
- A política nova começa em modo sombra. O estado e as configurações da automação existente serão inventariados, sem alteração implícita pelo planejamento.
- Mercado Livre mantém suas restrições e caminhos humanos existentes. O plano não reativa scraping nem cria mecanismos alternativos de acesso.

## Fluxo alvo

```text
Diretriz editorial versionada e exemplos humanos
    → plano de descoberta por intenção e capacidade da fonte
    → captura e normalização de candidatos
    → evidências disponíveis e dúvidas registradas
    → agrupamento conservador e avaliação central
    → catálogo elegível e espera por causas explícitas
    → seleção editorial vigente
        → destaques e ordem editorial da home
        → preparação e divulgação manual pela pauta
    → decisões, exposição e resultados disponíveis
    → propostas de ajuste do plano de captura

Acompanhamento de produtos conhecidos
    → novas observações
    → reavaliação da oferta e da validade da seleção
```

## Contratos a implementar

Os nomes abaixo são propostos. O desenho final deve aproveitar entidades existentes e evitar armazenar duas versões concorrentes do mesmo estado.

| Contrato | Conteúdo e responsabilidade |
|---|---|
| `EditorialPolicy` | Versão da diretriz, público, critérios, exemplos de referência e parâmetros de seleção |
| `ProductEvidence` | Fatos, origem, data, identificação da configuração e campos desconhecidos; inclui esclarecimentos humanos atribuídos e datados |
| `EditorialAssessment` | Avaliação por dimensão, evidências utilizadas, dúvidas, recomendação, origem humana/regra/IA e versões da política e dos dados |
| `OfferAssessment` | Comparabilidade do histórico, mudança de preço, condições conhecidas, frescor e bloqueios de oportunidade |
| `EditorialSelection` | Versão da seleção, estado de preparação/ativação/encerramento, vigência e responsável pela ativação |
| `SelectionItem` | Produto, avaliações utilizadas, posição, destinos, justificativa pública e condições de retirada |
| `DistributionActivity` | Item selecionado, canal, usuário, datas e ações confirmadas de preparação ou divulgação |

Reutilizar `editorial_guideline` e seus exemplos para a política, `curation_event` para decisões e `publication` para links afiliados. A entidade `publication` não comprova divulgação social e não deve receber esse significado por associação.

Avaliações preservam um snapshot suficiente para reproduzir a decisão, incluindo a imagem/URL apresentada quando relevante, sem reconstruir os fatos a partir do anúncio atual. Guardar identidade de modelo, versão do prompt, exemplos usados e execução. Exemplos humanos não podem carregar valores novos para uma decisão antiga.

Na persistência, usar relações por tenant, restrições de integridade e índices para leituras de seleção ativa, itens, avaliações e candidatos. Campos de estado, identidade e vigência devem ser estruturados; snapshots extensíveis podem usar JSON. As migrations devem preservar histórico e o acesso server-side existente, com verificação das permissões e isolamento. Não expor avaliações internas na resposta pública.

Uma seleção ativa por escopo será publicada em transação. Home e pauta receberão a mesma identificação de versão. Mudanças de vigência, rejeição ou oferta inválida bloqueiam o item também na leitura, mesmo que uma execução de atualização tenha falhado. A ativação deve conferir se as evidências usadas continuam válidas.

## Critérios da avaliação

| Dimensão | Avaliação esperada |
|---|---|
| Adequação ao público | Público e situação de uso definidos; indicação geral ou restrita a uma coleção |
| Utilidade ou interesse | Benefício concreto, diferencial ou interesse que possam ser explicados sem repetir publicidade |
| Valor da oferta | Preço coerente com configuração, quantidade e referências realmente disponíveis |
| Confiança | Evidências de características, avaliações, vendedor e histórico, com limites explícitos |
| Clareza da compra | Conteúdo do pacote, variante, tamanho, compatibilidade e condições necessárias para compreender a indicação |

Usar níveis `fraco`, `adequado`, `forte` e `desconhecido`, com justificativa por dimensão. A primeira versão não terá uma soma arbitrária que permita compensar ambiguidade crítica com preço baixo. Definir âncoras concretas para cada nível na calibração.

Regras objetivas verificam identidade, validade, links e comparabilidade. A IA sugere público, benefício, dúvidas e classificação a partir das evidências; não confirma funcionamento, autenticidade ou composição sem base. Conteúdo do anúncio é dado, não instrução ao modelo. Saídas inválidas, IDs desconhecidos ou evidências inexistentes seguem para revisão.

Separar sinais de preço: novo mínimo, igualdade com o mínimo, preço acima do mínimo e histórico insuficiente. A etiqueta de desconto do vendedor continua atribuída ao anúncio. Histórico suficiente não comprova qualidade nem determina sozinho o melhor destaque.

## Fase 0 Calibração e diagnóstico operacional

**Entregas**

- Inventariar schema aplicado, automação ativa, conferências pendentes, capacidades dos adapters e caminhos de captura individual, lote, CLI, extensão e acompanhamento.
- Comparar a seleção da home com a pauta usando os mesmos fatos e instante de referência; registrar as divergências.
- Criar amostra inicial proposta de 60 casos, distribuída entre bons candidatos, casos inadequados e casos ambíguos, com variedade de famílias, preços e fontes.
- Usar 40 casos para construir as âncoras editoriais e reservar 20 para avaliação. Anúncios equivalentes e variantes próximas ficam no mesmo conjunto, evitando vazamento.
- Registrar decisões humanas com motivo e fatos vistos. Reutilizar eventos anteriores somente quando tiverem contexto suficiente.
- Incluir tesoura de alto preço, organizador com conteúdo ambíguo, tradutor para público específico, mínimos empatados, kit de variante incerta e produto útil redundante.

**Aceite:** rubrica inicial versionada, divergências atuais documentadas e conjunto reservado identificado. Os quantitativos são orçamento inicial de calibração, não prova de desempenho estatístico ou autorização de automação.

## Fase 1 Evidências e identificação da oferta

**Entregas**

- Ampliar os contratos de captura, ingestão, persistência e leitura para transportar dados adicionais sem torná-los obrigatórios em fontes que não os fornecem.
- Registrar por fonte a disponibilidade de variante, quantidade, dimensões, descrição, contagem de avaliações, vendedor e condições do preço.
- Normalizar ausência de nota, rótulos aproximados de vendas e descontos inconsistentes sem inventar informação.
- Permitir esclarecimento humano de dúvidas essenciais, com autoria, fonte e data; alterações conflitantes do anúncio reabrem a dúvida.
- Tratar mudança de configuração como quebra de comparabilidade. Dados antigos sem identidade de variante mantêm seu escopo limitado.
- Frete, cupons e tributos personalizados permanecem desconhecidos quando não houver contexto confiável. Não apresentar custo total universal a partir de um valor parcial.

**Arquivos principais:** `packages/capture/src/types.ts`, adapters e fixtures, `packages/persistence/src/ingest.ts`, `store.ts`, `pg-store.ts`, `packages/web/lib/deal-view.ts` e snapshots.

**Aceite:** a evidência faz o percurso fonte → persistência → avaliação sem perder origem/data; campos ausentes não viram fatos; mudança de variante não gera queda histórica fictícia. A fase entrega cobertura mínima útil e esclarecimento manual, sem depender de todas as fontes fornecerem todos os campos.

## Fase 2 Avaliação central e comparação com o humano

**Entregas**

- Criar contrato puro da rubrica e um serviço de avaliação compartilhado, reaproveitando a Bússola, grupos e eventos existentes.
- Separar julgamento do produto, oportunidade da oferta e saturação editorial.
- Ampliar o input da IA com as evidências disponíveis e exemplos humanos compatíveis, retornando dimensões, dúvidas e referências utilizadas.
- Gravar a sugestão separadamente da decisão humana; aplicar validação de saída e fallback para a fila manual.
- Reavaliar o catálogo aprovado existente em lotes no modo sombra. A consulta atual, que busca apenas pendentes sem evento de regra/IA, não atende esse reprocessamento.
- Marcar avaliações desatualizadas por mudança relevante de fatos ou política. Atualização de preço recalcula sinais objetivos; chamada à IA exige motivo semântico relevante.
- Retirar a responsabilidade editorial independente de `curation.ts` quando a pauta migrar; manter somente funções reutilizáveis necessárias.

**Arquivos principais:** `ai-curation-contract.ts`, `ai-curation-service.ts`, `curation-pipeline.ts`, `curation-db.ts`, `editorial-compass.ts`, `curation-snapshot.ts` e `deal-signal.ts`.

**Aceite:** desligar a IA mantém a operação; reprocessar é idempotente; decisões humanas permanecem intactas; o conjunto reservado produz relatório por classe, família e motivo. Campos críticos desconhecidos não recebem confirmação fabricada.

## Fase 3 Seleção persistida compartilhada

**Entregas**

- Criar seleção e itens com versão, vigência, ordem, destinos, avaliações e justificativa.
- Evoluir a tela existente de seleção para mostrar separadamente catálogo elegível, candidatos a destaque e seleção vigente.
- Permitir incluir, retirar e ordenar sem rejeitar um produto apenas por falta de espaço.
- Selecionar sobre todo o catálogo elegível. Primeiro filtrar validade e adequação; depois comparar oportunidade e evidências; por fim reduzir repetição.
- Substituir a intercalação obrigatória de marketplaces na ordem editorial. Filtros e ordenações explícitas de preço, popularidade e recentes continuam obedecendo ao pedido do usuário.
- Home lê destaques globais e apresenta os itens selecionados primeiro na visão editorial padrão; o restante do catálogo segue acessível com contexto. Filtros não redefinem a seleção institucional do carrossel.
- Pauta lê os itens destinados à divulgação da mesma seleção. Uma diferença entre home e pauta deve estar registrada no destino/contexto do item.
- Usar a mesma justificativa e apresentação factual no card, detalhe e material da pauta. Preparar links compartilháveis válidos na preparação da seleção.
- Não completar espaços com produtos fracos. Se não houver seis destaques válidos, apresentar menos.

**Arquivos principais:** `app/page.tsx`, `app/vitrine.tsx`, `lib/db.ts`, `lib/desirability.ts`, `/api/deals`, `/api/pauta`, `app/pauta/pauta-client.tsx`, `app/admin/curadoria/selecao-view.tsx` e ações administrativas. Criar serviço server-side dedicado para seleção e projeções públicas.

**Aceite:** home e pauta conciliam por versão e destinos; carrossel independe de paginação; nenhum selecionado está rejeitado, expirado ou com ambiguidade crítica aberta. Retirar um item do destaque não destrói sua aprovação. Empate com mínimo histórico é apresentado como empate.

## Fase 4 Continuidade entre captura acompanhamento e seleção

**Entregas**

- Introduzir execução correlacionada por lote com etapas de captura, normalização, avaliação e preparação da seleção, com estados, falhas, duração e retomada registrados.
- Unificar o acionamento pós-captura. Os CLIs hoje podem disparar triagem por flag, enquanto a rota de lote inspecionada inicia captura sem essa flag. O coordenador deve enfileirar os candidatos de cada etapa de maneira explícita.
- Processar novos candidatos e alterações relevantes por uma fila retomável; agrupar mudanças repetidas e impedir execuções concorrentes conflitantes.
- Usar executor adequado ao ambiente: CLI local para desenvolvimento e GitHub Actions para trabalho prolongado em produção, aproveitando o padrão do acompanhamento. O painel dispara e consulta o trabalho; não depende de processos locais destacados na hospedagem web.
- Captura manual e extensão entram no mesmo caminho de avaliação, mantendo sua proveniência específica.
- Acompanhamento considera os destaques vigentes dentro dos orçamentos das fontes e preserva a prioridade existente de interesse explícito do usuário.
- Expiração, indisponibilidade confirmada e alteração material invalidam os itens afetados. Ausência de resposta da fonte não é prova de indisponibilidade, mas a evidência envelhecida deixa de sustentar destaque.
- Falha parcial de uma loja permite continuar com candidatos válidos das demais. Falha de IA deixa casos para revisão. Preparação incompleta não substitui a seleção ativa.

**Aceite:** uma execução pode ser retomada sem duplicar avaliações, itens ou decisões; captura não termina como “fluxo concluído” enquanto houver falha posterior não registrada; falha do executor não mantém item vencido nas leituras públicas.

## Fase 5 Aprendizado da captura e operação da pauta

**Entregas**

- Relatar aproveitamento por consulta, família e fonte, separando rejeição editorial, falta de informação, preço ruim e redundância.
- Medir lacunas de cobertura e propor ajustes do plano de captura em versões revisáveis.
- Preservar exploração; manter o orçamento atual 80/20 como referência inicial, sem tratá-lo como ótimo comprovado.
- Persistir na pauta ações de preparação e divulgação por usuário/canal, com horário de São Paulo para agrupamento diário. Copiar um link não marca postagem.
- Relacionar impressões, cliques, favoritos e conversões disponíveis à seleção/item e período. Relatórios comparam taxas e exposição, não somente contagens brutas.
- Inicialmente, revisar manualmente alterações do plano. Popularidade não elimina exploração nem transforma dúvidas de qualidade em aprovação.

**Aceite:** o sistema explica por que recomenda uma próxima consulta; ajustes preservam rastreabilidade e reobservação; outro aparelho vê as atividades da pauta; cópia e divulgação confirmada são eventos distintos.

## Ordem de entrega e transição

Executar fases 0 → 1 → 2 → 3 para a primeira entrega funcional. A fase 1 fornece o mínimo necessário, com esclarecimentos humanos onde a fonte for limitada. Seleção supervisionada pode operar sem esperar que a IA alcance desempenho suficiente para automação. Fases 4 e 5 completam a continuidade operacional e a realimentação da captura.

1. Introduzir campos e contratos de forma aditiva e manter leitura compatível com registros antigos.
2. Avaliar o catálogo atual sem apagar decisões ou remover produtos em massa.
3. Preparar uma seleção supervisionada com avaliações atuais e esclarecimentos necessários.
4. Comparar as projeções novas e antigas antes de ativar o caminho compartilhado.
5. Ativar home e pauta juntas por configuração versionada, com confirmação de schema aplicado e conferência da seleção.
6. Encerrar o caminho editorial antigo da pauta e a seleção por amostra da home após a validação.

A reversão restaura a versão anterior válida da seleção e desativa a política nova de forma rastreável. Itens rejeitados ou vencidos continuam bloqueados. A primeira ativação só ocorre com uma seleção válida e uma alternativa de apresentação vazia; não usar ranking antigo como fallback silencioso em caso de falha.

## Verificação e critérios de conclusão

| Cenário | Resultado obrigatório |
|---|---|
| Organizador fotografado com cobertores, conteúdo não confirmado | Dúvida registrada; sem destaque até esclarecimento; explicação pública compatível com os fatos |
| Tesoura cara sem diferencial demonstrável | Valor insuficiente ou desconhecido; sem promoção por ser inox ou ter desconto |
| Tradutor com uso específico | Público/contexto registrado; nenhuma promessa de funcionamento inferida do título |
| Preço igual ao mínimo anterior | Comunicação de igualdade, sem nova queda inventada |
| Alteração de quantidade ou variante | Histórico não mistura configurações nem fabrica oportunidade |
| Categoria ou nota ausente | Ausência preservada; não preencher com classificação ou qualidade fictícia |
| Muitos produtos semelhantes | Representantes revisados e demais em espera por saturação, sem rejeição de qualidade indevida |
| Produto bom fora da primeira página | Pode entrar no carrossel e na pauta pela seleção global |
| Produto rejeitado depois de selecionado | Removido das projeções de home e pauta mesmo antes da próxima execução |
| Preço envelhecido ou seleção vencida | Destaque bloqueado na leitura; histórico preservado |
| Falha de IA ou de uma fonte | Revisão manual e seleção anterior ainda válida disponíveis; falha registrada |
| Dois trabalhos concorrentes ou uma retomada | Sem duplicação e sem ativação com evidências superadas |
| Outro tenant ou usuário sem autorização | Sem leitura ou alteração indevida de seleção e avaliações internas |
| Link copiado no celular | Atividade sincronizada, sem afirmar divulgação |

Executar testes direcionados aos contratos e cenários; depois as suítes e typechecks dos pacotes alterados e build web. Registrar a baseline para distinguir falhas existentes de regressões.

```bash
npm test --prefix packages/capture
npm run typecheck --prefix packages/capture
npm test --prefix packages/persistence
npm run typecheck --prefix packages/persistence
npm test --prefix packages/web
npm run typecheck --prefix packages/web
npm run build --prefix packages/web
```

Criar verificador de seleção derivado do banco e validadores da execução integrada. Aproveitar `verify:capture-plan`, `verify:curation`, `verify:editorial-context`, `verify:lowest` e `monitoring:verify` quando pertinentes. Verificar migrations no ambiente usado; arquivo versionado não comprova aplicação.

Conferir em navegador home, detalhe, filtros, paginação, mesa de seleção e pauta em desktop/mobile, incluindo um item retirado e uma oferta expirada. O fluxo de aceitação é captura de fixture ou rodada controlada → fatos persistidos → avaliação → seleção → home/pauta → nova observação → reavaliação. Rodadas e migrations reais pertencem à execução futura, não ao planejamento.

**Integridade:** zero itens públicos inelegíveis, zero divergências sem destino/contexto registrado entre home e pauta e zero decisões novas sem contexto reproduzível.

**Qualidade editorial:** medir a fração de destaques mantidos pelo dono, as causas das retiradas, o tempo de revisão e os bons candidatos omitidos. Meta inicial proposta: pelo menos 90% dos destaques mantidos numa amostra de 30 revisões novas, sem casos críticos de expectativa errada. Informar sempre denominador e período; a amostra não autoriza automação por si só. Desempenho da IA deve ser avaliado também em rodadas posteriores e por família/motivo.

## Limites e decisões futuras

A integração inicial não inclui fine-tuning, busca de novas plataformas, checkout, cálculo universal de frete/tributos nem envio automático de mensagens. As capacidades disponíveis de cada fonte determinam o enriquecimento possível; campos materiais inacessíveis exigem esclarecimento ou restringem a indicação.

Antes de automatizar decisões da política nova, revisar os resultados do modo sombra e a estabilidade por classe. A revisão dos exemplos também deve distinguir produto ruim de produto redundante, inadequado para a home geral ou temporariamente sem boa oferta.

A publicação de uma seleção é trabalho reversível de curadoria; a divulgação externa continua uma ação explícita do operador. A execução começa pela fase 0 e só marca entregas concluídas com evidência técnica e conferência editorial.
