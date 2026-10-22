# Revisão de viabilidade antes da implementação

**Data:** 14/10/2026. **Pedido:** conferir o plano, confrontá-lo com o objetivo do aplicativo e avaliar sua viabilidade. **Parecer:** viável como evolução incremental, com condições explícitas; inadequado como uma única rodada de implementação e deploy dos 13 épicos. Não há evidência suficiente para garantir prazo, custo, rentabilidade ou prontidão SaaS em produção.

A revisão preserva o objetivo estratégico: a operação própria de afiliação e o SaaS são negócios permanentes, atendidos pelo mesmo motor. Corrige dependências técnicas e ambiguidades sem escolher nicho, canal, preço de assinatura ou política comercial pelo proprietário. A classificação continua **4 PRONTAS, 7 CONDICIONAIS e 2 BLOQUEADAS**, referente às specs, não à implementação. A contenção 01-0 é uma entrega parcial pronta dentro de EP-01 condicional.

## 1. Base e limites da revisão

Foram confrontados o blueprint preservado, os documentos globais, as 13 specs, a rastreabilidade, as evidências de banco/auditoria e os logs do planejamento anterior. O manifesto de 410 arquivos de fonte foi recalculado: **nenhuma divergência**. Foram relidos os caminhos críticos de tenant, comparabilidade, membro, populares e composição de claims. Isso reforça a validade da reconciliação anterior para este working tree; não prova que o deployment use esse mesmo código.

Não houve nova consulta ao banco remoto nesta revisão, execução de testes de aplicação, build, coleta ou ensaio de rollout. Os dois arquivos de testes web que falharam anteriormente continuam pendências; não foram convertidos em passes. Banco remoto, capacidade do pooler, imagens renderizadas em produção e provedor de envio não foram certificados. A revisão documental foi feita pelo mesmo agente, sem auditor independente. As verificações desta rodada constam em [evidências](evidencias/revisao-viabilidade.json).

## 2. Aderência ao objetivo do aplicativo

| Objetivo do blueprint | Como o plano atende | Condição para não desviar do produto |
|---|---|---|
| Encontrar boas compras pela qualidade e pelo valor, não apenas pelo preço baixo | EP-02 separa qualidade, valor, confiança e audiência; EP-03 contextualiza piso, temas e pauta | Homologar rubrica e exemplos humanos; não transformar unknown em reprovação universal nem repetir score IA como verdade |
| Diferenciar boa compra constante de oportunidade temporal | EP-01 separa evidência E0–E3; classes de EP-03 não são status de catálogo | Sem variante/condições verificadas, não há comparação segura. Ainda é possível recomendar com motivos qualitativos e preço observado |
| Transformar inteligência em divulgação rastreável | EP-04/06/07 liga oportunidade→kit→aprovação→exportação→confirmação→clique | Primeira entrega útil precisa completar a jornada assistida; tabelas, telas isoladas ou botão de exportar não comprovam postagem |
| Conhecer vendas, comissões e eficiência | EP-08 admite venda manual sem origem; EP-09 usa coortes e limites de observação | Não esperar integração de marketplace para registrar fatos manuais; não alegar ROI sem custo/comissão comprovados |
| Operação própria e SaaS sobre o mesmo motor | C-01, políticas por conta e EP-10/12; módulos compartilhados no monorepo | Casa percorre os mesmos serviços; dados privados e trackers não são compartilhados; piloto não depende de automação completa |
| Preservar produção e vendas reais | Compatibilidade de URLs, publication web, adapters, flags e recuperação | Revalidar o deployment, resolver impacto de falhas e testar compra/monetização antes de ativar cada mudança |

Não foi encontrada necessidade de substituir a stack, criar microsserviços ou manter dois motores. Composer, Story, contas, ingestão, políticas de monitoramento e avaliações humanas oferecem pontos concretos de reutilização. O volume observado de dados, sozinho, não demonstra limite de capacidade nem justifica migração de plataforma. Também não permite prometer escala sem medições.

## 3. Problemas encontrados e corrigidos

1. **Caminho crítico excessivo para corrigir preço.** A ordem anterior colocava a migração inteira de isolamento antes da contenção de claims sem suporte. Foi definida 01-0: projeção conservadora na aplicação, sem DDL ou acesso externo. As correções canônicas da view, captura e evidência continuam em 01-A/B/C após 10A. Não é correção integral do banco e não altera fatos antigos.
2. **Serialização desnecessária do piloto e da medição manual.** O índice linear sugeria aguardar EP-09 antes de 10B/12; 08-C dependia de importador até para receita manual. Agora 08-A/C manual pode seguir 04, enquanto 10B audita os módulos instalados. Experimentos e automação permanecem no roadmap, mas não bloqueiam o primeiro piloto assistido. Segurança continua obrigatória.
3. **Receita tratada como espécie de custo.** C-07 incluía subscription_revenue em operational_cost. O planejamento agora separa saas_revenue_entry, despesas e comissões, com faturamento/caixa distintos e ownership da conta operadora. Piloto pago exige essa parte de EP-08; não se presume piloto gratuito.
4. **Dependência antecipada de política.** A assinatura de analysis_assessment contradizia a nota que evitava FK para política ainda inexistente. EP-02 passa a usar rubric_version explicitamente; EP-03 adiciona policy_version_id nullable depois da entidade referenciada, preservando avaliações antigas.
5. **Erros de serviço ambíguos.** A correspondência HTTP implícita foi substituída por mapeamento explícito em C-09; o executor não precisa escolher o significado de cada erro.
6. **Disponibilidade de dados confundida com contrato.** Criado G-EVIDENCE: uma estrutura v2 não resolve a ausência de variantes confirmadas. É necessário demonstrar obtenção factual por fonte; quando isso não for possível, a fonte fica em E0/E1 e o produto continua útil sem alegação histórica.

As correções estão nos documentos normativos e specs afetadas, não apenas neste parecer. Rastreio: AX-26–31 em [auditoria cruzada](06-AUDITORIA-CRUZADA.md), ADR-15/16 em [arquitetura](02-ARQUITETURA-GLOBAL.md).

## 4. Viabilidade e risco real

| Dimensão | Avaliação | Evidência / limite | Medida necessária |
|---|---|---|---|
| Implementação na stack atual | Plausível | Existem pontos de extensão; contratos novos ainda não exercitados | Incrementos completos, sem reescrita global |
| Histórico de preços | Parcialmente viável hoje | 0 variantKeys no baseline; 297 flags true na view sem guarda | Conter claims; provar captura comparável antes de promover E2/E3 |
| Curadoria de qualidade e valor | Viável em modo humano/sombra | Input IA atual é limitado; amostra nova não homologada | Formulário reutilizável, labels e política aprovada; sem aprovação automática nova por conveniência |
| Segurança SaaS | Maior risco estrutural | Helper sem transação real; policies permissivas; autoria multi-conta e Storage exigem integração | 10-A1 antes de A2, ensaio em PostgreSQL/pooler real, inventário completo, 10B antes de externos |
| Kit e divulgação assistida | Viável com validação | Composer/Story existem; render, direitos de imagem e links dependem de verificação | Reusar recursos, aprovar versão e confirmar postagem explicitamente |
| Conciliação externa | Condicional | Nenhum relatório real disponível para fechar parser | Entrega manual primeiro; parser apenas com formato autorizado |
| Automação de canal | Bloqueada para entrega completa | Não há canal/destino autorizado definido nem adapter de envio demonstrado | Resolver G-CHANNEL/PROGRAM, testar unknown/retry/kill switch |
| Operação em produção | Não certificada | Working tree não está vinculado ao commit publicado; dois arquivos de teste falharam | G-ENV/G-BASE e regressão do fluxo antes de ativar |
| Economia e demanda SaaS | Não demonstradas | Venda relatada não estima margem; faltam custos, termos/preço e comportamento de piloto | Medir eficiência, receita/custo e uso recorrente sem prometer retorno |

**Esforço:** trata-se de evolução estrutural de produto, não de ajuste pequeno. EP-10, EP-01, o conjunto EP-04/06/07 e EP-08 concentram integração, compatibilidade e risco. Mais documentos não reduzem esse esforço automaticamente. Não há estimativa defensável em dias ou reais sem conhecer capacidade de execução, ambiente de teste e a duração das primeiras entregas. Registrar esforço observado em 01-0 e 10-A1 e revisar a previsão de execução, sem reabrir estratégia ou domínio por rotina.

**Controle de complexidade:** não criar de uma vez todas as tabelas propostas; cada migration acompanha um fluxo verificável. Não exigir catálogo global, matching universal, múltiplos canais automáticos ou billing automático para o primeiro valor. Esses recortes não eliminam isolamento, contexto por conta, auditoria, atribuição ou o negócio SaaS. Funções públicas restritas e secrets de EP-10 continuam decisões justificadas pela superfície existente, porém exigem prova de grants/runtime antes de rollout.

## 5. Marcos recomendados e critérios de passagem

| Marco | Entregas | Entrada | Saída observável |
|---|---|---|---|
| M0 — Confiar na próxima mudança | 00 e 01-0 | Identificar ambiente/versão e baseline afetado | Nenhum claim histórico sem suporte na aplicação; preço observado e caminho de compra preservados; limitação da view registrada |
| M1 — Base comum protegida e curadoria justificável | 10A, 01-A/B/C, 02/03 | Contexto adotado antes de policies; fontes e amostra humana disponíveis conforme gates | Conta isolada em testes, razões/evidência coerentes, política homologada; fonte incompleta permanece identificada |
| M2 — Operação comercial assistida completa | 04, 05, 06, 07; antecipar 08-A/C manual após 04 | M1 e permissões do material/programa | Selecionar→gerar→validar→aprovar→exportar→confirmar→acompanhar clique; venda/custos manuais sem atribuição inventada |
| M3 — Primeiro piloto SaaS seguro | 10B e 12; 08-A/C conforme promessa financeira/cobrança | Jornada M2 e G-PILOT/SEC/PRIVACY/PROGRAM encerrados | Afiliado autorizado usa seu público, monetização e dados; suporte, suspensão e saída testados; casa continua operando |
| M4 — Aprendizado e escala graduais | 08-B, 09, 11, conforme dependências próprias | Relatório, amostra e canal autorizados | Importação real idempotente; comparação mensurável; envio comprovado com recuperação segura |

M4 não precisa aguardar M3 quando seus próprios gates já estiverem satisfeitos; tampouco pode atrasar M3 por depender de mais amostra. A ordem detalhada e autoritativa está em [07-PRONTIDAO-E-DECISOES](07-PRONTIDAO-E-DECISOES.md). Marcos M0–M4 são agrupamentos de resultado, **não IDs de migration M-***.

Em M2, comparar tempo e erros de preparação com o baseline observado de kits, registrando tamanho e composição da amostra; não inventar redução percentual mínima. Em M3, medir tempo até primeira campanha, uso recorrente e esforço de suporte conforme termos aprovados. Em M4, promoção depende da metodologia de experimento, não de uma melhora casual em cliques.

## 6. Decisão para a próxima rodada

**Recomendada:** iniciar futuramente por EP-00 e, com suas entradas satisfeitas, implementar apenas 01-0 como primeira correção funcional. Em seguida, 10-A1/A2 com atenção à continuidade de /go, captura, cron e área de membros. A futura autorização de implementação deve identificar a entrega; esta revisão não iniciou implementação nem autorizou migrations.

**Não liberar ainda:** convite SaaS, nova automação de postagem, alegações E3, parser específico sem relatório ou claims de rentabilidade. Cada restrição tem gate concreto no índice; não é razão para paralisar entregas independentes.

O plano revisado oferece uma trajetória coerente para entregar valor e preservar o produto existente. A conclusão técnica é condicional à execução e às verificações descritas; a conclusão econômica depende das medições reais. Documentação completa não substitui essas provas.
