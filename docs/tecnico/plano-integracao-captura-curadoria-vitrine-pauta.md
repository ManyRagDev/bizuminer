# Plano de integração da captura curadoria vitrine e pauta

**Revisão operacional da seção 21:** fases 1–5 implementadas e homologadas localmente em 16/11/2026; pacote verificável e retorno preparados. Esta entrega não alterou a produção. O registro atual está na seção 21.6; tracks e implantações anteriores conservam seus próprios escopos e limites.


**Atualização:** 15/11/2026. **Próxima implementação:** [revisão operacional do painel na seção 21](#21-plano-de-implementação-da-revisão-operacional-do-painel). A auditoria autenticada de produção confirmou capturas manuais das três lojas, lote API Shopee, avaliação automática v2 e pauta disponível, mas demonstrou lacunas de acompanhamento e recuperação. A seção 21 define a entrega atual, seus esboços de telas, contratos, sequência e aceite. O pedido desta etapa autoriza gerar o plano; implementação e operações externas mantêm suas autorizações próprias.

**Para o agente implementador:** comece pela seção 21 e pela [auditoria operacional](manual-operacional-curadoria.md#5-auditoria-da-jornada-operacional-em-15-de-novembro-de-2026). Reutilize as capacidades existentes, preserve alterações locais e execute a sequência até integrar e verificar a jornada quando houver autorização para implementar. A seção 16 e suas tracks localizam a construção anterior do motor; suas caixas e pendências de 14/11 não comprovam o estado atual nem exigem reiniciar aquela sequência.

**Proteção vigente:** todos os crons permanecem desativados por decisão do dono, inclusive descoberta e acompanhamento de preços. Esta revisão não restaura `schedule`, não habilita workflows nem cria agendamento equivalente em outro executor. Acompanhamento da interface significa consultar o trabalho existente; não significa agendar novas capturas. Preservar o comportamento automático já existente da curadoria sem ampliar fontes, escopo ou orçamento.

**Registro da preparação de 14/11/2026:** implementação e verificação local avançadas em PGlite descartável, rotas/contratos HTTP simulados e suítes dos pacotes; migrations e backfill aplicados ao Supabase usado pelo localhost, com leitura autenticada da pauta conferida no navegador. As pendências e restrições de ativação dos parágrafos seguintes pertencem àquela conferência. Os registros de produção do [manual operacional](manual-operacional-curadoria.md), incluindo a ativação posterior e a auditoria de 15/11, prevalecem para capacidades comprovadas no destino; isso não certifica os testes dedicados ainda não executados.

**Situação real vs. escopo autorizado:** existem código local, migrações aditivas, contratos e verificações em PGlite descartável + suítes unitárias/build (diversidade estrita com escassez determinística em `curation-selection-v2.ts`, protocolo HTTP `POST /api/extension/observations`, relógios por `option_key` via captura em lote, pauta por slots, expiração/indisponibilidade sem worker, equivalência e isolamento entre contas). IA, lojas e transporte da extensão foram exercitados apenas com fixtures e adapters simulados. **Pendências locais:** cobertura automatizada da sessão/PDP na extensão (`T04.07`–`T04.09`, `T05.01`, `T05.03`), casos dedicados de exceções/timeout/reconsideração/holdout (`T07.03`–`T07.06`), comprovação completa de todas as rotas públicas (`T03.07`) e ensaio interativo completo em UI/popup (`T04.10`, `T06.10`, `T07.08`). **Pendências remotas / autorização específica:** conferir e aplicar migrations/backfill na VPS (`T00.02`, `T01.09`; concluídos somente no Supabase usado pelo localhost), configuração/flags e desligamento de legados no destino (`T08.04`), ensaios reais com lojas/IA/navegador (`T08.05`) e canário/medição em produção (`T08.06`–`T08.09`).

**Correção operacional de 14/11/2026 — localhost:** após autorização expressa, foram reconciliadas e aplicadas 20 migrations pendentes no projeto Supabase já configurado em `packages/web/.env.local`, incluindo dependências anteriores à v2 e `20261114141730_restrict_comparative_trigger_execution.sql`. A cadeia inicial foi ensaiada com rollback antes do commit; o histórico de migrations foi atualizado no mesmo commit de cada aplicação. O backfill existente percorreu 3.042 observações em 13 lotes de até 250, mantendo as datas originais: 1.381 verificações derivadas, nenhuma com timestamp diferente da observação correspondente. Permanecem 1.851 produtos e 3.042 observações; todas as tabelas Garimpa têm RLS, sem permissões de escrita para os papéis de API pública. Nenhuma política v2 foi habilitada.

O erro `pauta_unavailable` decorria de schema ausente. Além disso, o servidor Next de desenvolvimento compartilhava `.next` com `next build`, que removia os chunks servidos e deixava a tela em carregamento. `npm run dev` agora usa `.next-dev` por padrão, preservando um `BIZUMINER_DIST_DIR` explícito. A leitura autenticada de `/api/pauta` e `/api/pauta/slots` voltou a HTTP 200, e `/pauta` exibe o estado vazio normal no navegador. Na conferência, a observação mais recente era de **10/11/2026 às 19:46:04 (America/Sao_Paulo)**, sem fatos nas últimas 48 horas: aplicar migrations/backfill não renova preços. Isso não certifica deploy/VPS nem o fluxo interativo completo de preparação/envio. Verificação desta correção: 707 testes web, typecheck web, build web, 5 testes do preload de desenvolvimento e suítes PGlite T01/T02 e jornada T03–T08 aprovados.

O resultado esperado é uma captura que abastece um conjunto contínuo de candidatos, uma vitrine que seleciona ofertas verificadas e uma pauta preparada perto do uso. O esforço de revalidação se concentra no que será apresentado ao público e nos acompanhamentos explicitamente solicitados. Não haverá desconto percentual mínimo para publicação. Qualidade, utilidade, preço, interesse e confiança nas informações participam da escolha.

As seções 1 a 20 mantêm as regras do motor integrado. A seção 21 prevalece para a próxima revisão de operação, interfaces e verificação, sem reabrir capacidades já comprovadas. Os registros anteriores, preservados ao final, documentam entregas e decisões de outras datas; não devem ser executados como planos paralelos. O [plano de execução de capturas e pauta estável](plano-execucao-capturas-pauta.md) continua sendo referência para durabilidade, publicação atômica e leituras econômicas. A renovação editorial pode recalcular a seleção por frescor e vencimento dentro do comportamento autorizado, mantendo a interface sem recomposição por visita ou polling ocioso; essa regra não autoriza reativar qualquer cron suspenso.

## 1. Resultado funcional e limites

Ao concluir a implementação, o aplicativo deverá permitir:

- Capturar Shopee pela API oficial e Mercado Livre, Amazon e AliExpress exclusivamente pelo DOM do navegador logado, com ação de sessão da extensão e ritmo humano.
- Receber cada loja independentemente, atualizar produtos conhecidos e preservar candidatos anteriores ainda válidos, sem sessão editorial global nem limpeza por leva.
- Avaliar atributos e recalcular os candidatos relevantes sem reenviar todo o pool à IA.
- Escolher uma vitrine estável e diversa, com informações verificadas antes da entrada e validade controlada durante a permanência.
- Preparar os produtos da pauta no uso do slot, com atualização das condições, cooldown e confirmação manual de envio.
- Priorizar revisitas dos produtos expostos, das promoções pendentes e dos acompanhamentos solicitados, dentro de um orçamento explícito.
- Explicar por que uma oferta foi selecionada, aguardou conferência ou ficou de fora, preservando o histórico real de preços.

A promessa pública será acompanhar os preços efetivamente observados dos produtos selecionados e dos acompanhamentos aceitos, com datas e lacunas claras. Descobrir um anúncio não cria obrigação de monitorá-lo para sempre. O sistema não garante que uma oferta permaneça disponível entre duas observações.

Este pedido autoriza escrever o plano. Implementação, chamadas pagas de IA, consultas às lojas, permissões da extensão, migrações e ativação remotas serão executadas apenas no escopo da autorização correspondente. A implementação local poderá avançar integralmente quando solicitada, sem confirmações por arquivo.

## 2. Invariantes que orientam todas as etapas

1. Captura registra fatos; seleção editorial decide exposição. Persistir observações e preparar identidades de links não equivale a publicar na vitrine.
2. Uma leva não apaga vitrine, pauta, produtos ou histórico. A conclusão de uma loja não depende da captura de outra.
3. IA preenche atributos e sinaliza dúvidas; código aplica elegibilidade, ranking e composição. Vetos humanos e bloqueios de segurança prevalecem.
4. Posição baixa significa não selecionado neste ciclo, sem rejeição editorial permanente.
5. Ausência numa listagem não prova indisponibilidade. Login, bloqueio, timeout e erro de extração também não provam produto morto.
6. Só observação válida de preço renova a verificação correspondente. Reprocessamento, visita sem preço e resposta de IA não renovam o relógio.
7. Conferência da configuração específica prevalece sobre listagem agregada. Faixa, preço inicial e cupom não se tornam preço exato por inferência.
8. Vencimento retira a oferta da seleção atual e mantém seus registros. Rediscovery atualiza a identidade existente.
9. Oferta aguardando verificação não aparece como conferida. Falta de orçamento ou navegador pode deixar vagas abertas.
10. Pauta futura é previsão; produtos finais são escolhidos ao preparar o slot para uso. Mensagens enviadas e confirmações são permanentes.
11. WhatsApp continua com envio humano. Abrir ou copiar não é enviar; não implementar automação de sessão nem disparos.
12. Sem scraping de servidor para Mercado Livre, Amazon ou AliExpress. Shopee não recebe fallback DOM. Falha numa fonte não amplia suas permissões.
13. Sem serviço externo de fila ou orquestração. Reutilizar PostgreSQL e o executor Node persistente da instalação.
14. Identidade, configuração, histórico, scores, orçamento, plano e exposição são escopados por conta. Nenhum cliente escolhe o tenant de uma operação.
15. Acompanhamento explícito não perde prioridade silenciosamente por ter saído da vitrine. Favorito e pedido de acompanhamento têm semânticas diferentes.
16. Sem desconto percentual mínimo. Nenhum fallback ou motivo automático pode recriar indiretamente esse gate.
17. Agendamentos suspensos permanecem suspensos. Correção, teste, migração, retorno de versão ou deploy não reativam cron, descoberta, monitoramento ou agendamento equivalente; uma futura reativação exige pedido explícito do dono.

## 3. Base existente a aproveitar e diferenças a reconciliar

| Área | Base localizada | Evolução necessária |
| --- | --- | --- |
| Ingestão | `packages/persistence/src/ingest.ts`, `pg-store.ts`, `store.ts` | Convergir todas as entradas no mesmo escritor de observações, com relógios separados e identidade por configuração. |
| Execução | `packages/web/lib/capture-batch-db.ts`, `capture-batch-worker.ts`, `capture-lease.ts`, `bin/listen-capture-batches.ts` | Preservar claim, checkpoints e recuperação; acrescentar trabalhos editoriais e de conferência sem segundo orquestrador. |
| Commit de fatos | Migrations `20261112002243` e `20261112002247`, `capture-publication.ts` | Manter preparação fora da edição visível e commit curto; completude limitada à operação de uma fonte. |
| Captura DOM | `browser-capture-contract.ts`, `browser-capture-db.ts`, `extension-db.ts`, rotas `/api/extension/*` | Evoluir protocolo sem quebrar os clientes atuais; aceitar resultados de conferência sem exigir lote de descoberta. |
| Avaliação | `curation-pipeline.ts`, `ai-curation-contract.ts`, `ai-curation-service.ts`, `ai-curation-provider.ts` | Atributos versionados em lugar de aprovação/rejeição por nota; manter provedores e controles de custo existentes. |
| Histórico | `price_observation`, `offer-history.ts`, `price-evidence.ts`, `price-history.ts` | Preservar comparabilidade, acrescentar mediana temporal e registrar reobservação estável legítima. |
| Seleção | `homepage-policy.ts`, `hero-ranking.ts`, `recommendation-policy.ts`, `pauta-policy.ts` | Compartilhar elegibilidade e score, com composição própria por destino e histerese explícita. |
| Edições e leitura | `homepage-db.ts`, `recommendation-db.ts`, `pauta-db.ts`, `public-offer-db.ts` e projeções SQL | Reutilizar edição/cache persistidos; validar prazo em toda superfície sem IA/API na leitura pública. |
| Monitoramento | `monitoring-policy.ts`, `monitoring-candidates.ts`, `monitoring-lookup.ts`, `bin/monitor-prices.ts` | Restringir API à Shopee, remover formação de histórico como causa editorial de captura, preservar pedidos ativos. |
| Aprendizado | `curation_event`, `triage_run`, `editorial-compass.ts`, rubrica editorial existente | Reaproveitar log, exemplos e amostragem; não criar um segundo sistema de decisões. |
| Extensão | `service-worker.ts`, extratores, `batch-queue.ts`, `outbox.ts`, `storage.ts` | URLs reproduzíveis, revisitas dirigidas, persistência de progresso e permissões opcionais por loja. |

Antes de codificar, conferir a relação entre a base local, o schema realmente aplicado e a imagem do destino. Os números levantados nesta conversa pertencem ao banco configurado na análise, não certificam a VPS. Alterações locais ainda não commitadas fazem parte do ponto de partida; não restaurá-las para uma versão antiga.

As restrições de fontes desta revisão substituem caminhos legados de captura/reconsulta AliExpress por API e fallback de execução em GitHub Actions. Inspecionar também `.github/workflows/capture-offers.yml`, `discover-shopee.yml`, `monitor-prices.yml` e o agendamento do destino para evitar dois produtores. Desabilitar o caminho proibido na aplicação, e não apenas esconder seu botão.

## 4. Pool rolante e classes derivadas

O banco conserva o catálogo histórico. O pool de disputa é uma projeção rolante dos candidatos com evidência ainda elegível, junto dos pedidos de promoção pendentes dentro do prazo de recuperação. Vencer no pool não remove nem recria o produto no catálogo.

| Classe derivada | Composição | Revalidação editorial |
| --- | --- | --- |
| Quente | Vitrine ativa, reserva limitada do próximo slot e candidatos aguardando conferência para promoção | Ativa e limitada por prioridade/orçamento. |
| Morna | Demais candidatos até uma fronteira inicial de três vezes a capacidade da vitrine | Oportunista, ao reaparecerem nas páginas normais ou dirigidas. |
| Fria | Restante dos candidatos | Sem trabalho dirigido; pode mudar de classe após nova evidência. |

Não persistir um campo `classe`. Derivar a classe do estado autoritativo de edição, score e promoção. Os volumes de 40–60 quentes e 100–200 mornos são cenários, não metas: com vitrine inicial de 24 produtos a fronteira morna precisa ser calculada, sem capturar extras para atingir um número.

Pedidos explícitos de `price_watch` entram como motivo adicional de prioridade, sem precisar inventar outra classe editorial. São atendidos por conta e produto/configuração, agrupando pedidos do mesmo anúncio. A quantidade de usuários interessados não revela suas identidades ao dispositivo. Salvar como favorito, isoladamente, não cria promessa de conferência regular; revisar a agregação atual que junta favoritos e acompanhamentos.

Preservar acompanhamentos existentes. A interface mostra última conferência, pendência e dependência do navegador; impedir novos compromissos com frequência garantida quando não houver capacidade. A fila reserva capacidade para os pedidos ativos e informa atraso quando a demanda excede o orçamento, sem removê-los ou fabricar atualização. Não criar tarefas apenas para preencher quantidade mínima de histórico.

Um produto vencido sem acompanhamento pode sair do pool. Um pedido explícito de promoção já aberto pode manter a tentativa de recuperação até seu prazo; nunca torna o preço público enquanto espera. Pedidos expirados são encerrados e não se renovam indefinidamente só pelo score antigo.

## 5. Persistência e migração compatível

Os nomes novos abaixo são alvos de implementação; conferir tabelas equivalentes antes de criar. Manter IDs de produto existentes e a chave única `(tenant_id, marketplace, external_id)`, usando `mercadolivre` como slug interno, não introduzir `ml` como segunda identidade. Dinheiro continua em centavos inteiros com limites validados; instantes são `timestamptz`; timestamps do cliente não substituem validação pelo servidor.

| Entidade | Campos ou responsabilidade |
| --- | --- |
| `product` | Preservar primeira observação e URL de produto. Separar presença da verificação; referência da observação atual, `last_seen_at`, `last_verified_at`, instante/estado de disponibilidade confirmada e validade projetada. |
| `price_observation` | Fonte dos fatos imutáveis: preço, moeda, tipo, configuração, condições, método, URL do produto, página de origem, instante observado/recebido, identidade do pedido e opção. Manter evidências e snapshots existentes. |
| Associação produto–página | URL reproduzível normalizada, marketplace, produto, configuração quando conhecida, primeira/última presença e quantidade de reencontros. Permite várias páginas por produto. |
| Avaliação IA versionada | Atributos, fatos usados, dúvidas, input fingerprint, versão da rubrica/prompt/modelo, avaliação anterior e estado da execução. Reutilizar estrutura de avaliações se compatível. |
| Projeção de score | Por conta/produto/oferta: componentes brutos/normalizados, disponibilidade dos dados, confiança, cohort, revisão de origem, versão, `score_vitrine`, `score_pauta`, `potential_score`, instante e próxima necessidade de cálculo. |
| Promoção/conferência | Motivo, produto e configuração alvo, revisão solicitada, estado, prioridade, prazo, próxima tentativa, dono/lease, tentativas e resultado. Deduplicar trabalho aberto equivalente. |
| Política de curadoria | Configuração versionada por conta/canal; pesos, prazos, diversidade, slots, cooldown e orçamentos. Reutilizar `recommendation_channel` para parâmetros do canal. |
| Slots da pauta | Ocorrência única por conta/canal/horário, estado, previsão limitada, preparação corrente, política/revisão, validade e referência das confirmações. |
| Orçamento | Consumo e reservas por conta/fonte/dia e sessão; chave da ação externa para retry técnico não abrir nova cota. |
| `curation_event` e exposições | Continuar como log de decisão e de envio confirmado. Selecionar, esperar e sair da edição são eventos distintos de bloquear editorialmente. |

### 5.1 Relógios e comparabilidade

`last_seen_at` pode avançar com presença observada. `last_verified_at` só avança com preço válido, moeda/tipo declarados e evidência suficiente para a apresentação correspondente. A verificação aponta para os fatos que sustenta; uma faixa atualizada não renova a conferência de uma variante específica antiga. Ler validade por oferta/configuração, e não apenas pelo timestamp agregado do produto.

Preço ausente não apaga o último preço conhecido nem renova sua data. `unavailable` só vem de evidência direta inequívoca. Disponibilidade desconhecida permanece desconhecida; resposta de catálogo afiliado da Shopee não prova estoque quando o endpoint não entrega esse fato.

Eventos atrasados entram no histórico com o instante original validado, mas não sobrescrevem fatos mais recentes. Em divergência entre listagem agregada e PDP da mesma configuração, preservar a prioridade da conferência específica. Uma divergência nova abre necessidade de conferência; não renova silenciosamente o preço escolhido.

### 5.2 História e idempotência

Cada nova observação válida e independente acrescenta preço ao histórico, mesmo estável. Retry do mesmo `requestId`/execução/opção não acrescenta outro ponto. Atualizar o coalescimento atual de 20 horas no escritor v2: ele não pode ocultar uma conferência recente nem ser interpretado como nova série. O caminho legado mantém compatibilidade durante a transição, mas o v2 tem uma única semântica.

Não inferir datas intermediárias, variantes, frete, avaliações ou conteúdo ausentes. Uma mudança A→B→A permanece três fatos. Timestamps de processamento e respostas de IA não contam como observações. TTL não executa `DELETE` em produtos, preços, decisões, links enviados ou acompanhamentos.

### 5.3 Segurança, índices e aplicação

- Reutilizar contexto de autorização, RLS e roles existentes. Toda entidade interna carrega tenant; referências entre entidades validam a mesma conta. Dispositivo revogado ou membro suspenso perde acesso também durante uma sessão.
- Sem grants diretos de escrita para runtime público, `anon` ou `authenticated`. Novas funções seguem privilégios mínimos; não recorrer a `SECURITY DEFINER` para contornar erro de autorização. Projeções públicas expõem apenas fatos permitidos.
- Criar índices para último preço por conta/produto/opção/data, candidatos por elegibilidade/validade/score, tarefas pendentes por conta/estado/próxima tentativa e relações página–produto. Índices parciais usam estados estáveis, sem predicado dependente de `now()`.
- Evitar N+1 e reprocessamento de JSON/histórico inteiro por visita. Validar planos com `EXPLAIN (ANALYZE, BUFFERS)` em base descartável representativa, separando ingestão, cálculo e leitura pública.
- Migrações aditivas primeiro, backfill limitado depois, endurecimento de constraints ao final. Não inventar timestamps de migração nem reaplicar arquivos apenas porque existem localmente. Conferir a cadeia real do destino antes da ativação.

## 6. Ingestão por fonte e tratamento de cada captura

1. Autorizar origem, dispositivo/ator, conta, fonte habilitada, tamanho e versão do payload. Validar URLs e timestamps antes de persistir.
2. Distinguir repetição técnica de nova observação. Manter relatório por item e atomicidade do pedido conforme contrato; dados inválidos não viram confirmação.
3. Preparar os fatos da operação de uma fonte; fazer upsert e append pelo escritor comum, preservando o commit atômico e os checkpoints existentes.
4. Atualizar relações com páginas e invalidar somente as projeções afetadas. A etapa aqui é publicação de fatos internos; entrada pública continua dependente da seleção.
5. Aplicar bloqueios determinísticos e identificar o delta de avaliação: novo candidato sem atributos válidos, mudança material de preço, título/configuração/condições ou versão de política.
6. Enfileirar IA quando necessária, sem manter transação ou request de captura aberto durante a chamada. Recaptura estável reaproveita os atributos.
7. Calcular os produtos e cohorts afetados, derivar fronteiras de disputa e criar pedidos de conferência limitados. Atualizar a previsão do próximo slot, sem congelar sua seleção final.
8. Compor nova edição somente com ofertas elegíveis e verificadas. Captura parcial de outra fonte não derruba a edição atual.

Revisar a exigência atual de completude global em lotes multiloja: a unidade de commit v2 será a operação de uma loja. Um pedido de várias lojas pode manter um agrupador visual, mas cada resultado avança de forma independente. A página ou operação de uma fonte continua atômica; não expor metade de um payload nem quebrar os mecanismos de posse do worker.

Falha da IA deixa o produto aguardando avaliação, sem publicar com campos inventados nem bloquear produtos já aptos. Retry tem limites e observabilidade; resultado externo desconhecido segue reconciliação existente antes de repetir custo.

## 7. Avaliação IA e decisões humanas

Evoluir o contrato atual e adaptar consumidores da nota 1–5. Não converter matematicamente uma nota antiga em novos atributos como se fosse uma avaliação real. O legado pode sustentar a edição anterior durante o rollout; candidatos v2 precisam de avaliação compatível ou avaliação humana equivalente.

Contrato lógico mínimo por item:

```json
{
  "productId": "id existente",
  "qualidade": 78,
  "genuinidade_oferta": 55,
  "apelo_whatsapp": 72,
  "categoria": "Casa",
  "flags": [],
  "confianca": 0.68,
  "justificativa": "Benefício e limites da avaliação",
  "fatos_usados": [],
  "duvidas": []
}
```

Notas vão de 0 a 100; confiança de 0 a 1, validada como estimativa do modelo, não probabilidade calibrada. Campos ausentes/inaplicáveis são tratados explicitamente no schema de execução. `genuinidade_oferta` representa plausibilidade diante das evidências fornecidas; nunca cria referência de preço nem autoriza uma alegação de desconto. Qualidade inclui utilidade aparente e deve distinguir fato de inferência.

- JSON estrito com validação de faixa, categoria, flags, IDs únicos e pertencentes ao lote; rejeitar item extra/duplicado e não aceitar avaliação parcial silenciosamente.
- Temperatura inicial 0, lotes de até 20 e poucos exemplos versionados, reaproveitando limites dos provedores existentes. Não migrar provedor como efeito lateral do pipeline.
- Fingerprint inclui campos materiais, política e prompt. Repetição de captura idêntica não dispara IA. Queda/subida acumulada de cerca de 10% desde o último preço avaliado é gatilho inicial; comparar com a avaliação anterior, não apenas com a última captura.
- Mudança de variante, quantidade, condições, título material ou bloqueio pode exigir nova avaliação mesmo abaixo de 10%. Preço que muda e volta entre observações permanece no histórico.
- Aplicar resposta apenas se evidência e decisões relevantes continuarem atuais. Se houve nova observação ou veto humano, descartar a aplicação antiga e reconciliar o delta sem sobrescrever o humano.
- Termos proibidos e risco material mantêm bloqueio. Termos de baixo apelo e nota baixa viram atributos/penalidades, sem rejeição permanente por ranking. Revisar os falsos positivos da blacklist atual de peças técnicas.
- Rating ausente, poucas avaliações, marca desconhecida ou falta de frete não autorizam inventar valor, reprovar por zero ou afirmar qualidade comprovada.

Separar no estado editorial `blocked`, `awaiting_evaluation` e `eligible`, ou equivalentes compatíveis com `product_curation`. A seleção pública passa a exigir elegibilidade semântica atual e conferência, não apenas um `approved` legado. Vetos humanos não são reabertos por preço; rejeições automáticas históricas por baixo mérito podem ser reconsideradas em backfill auditável, sem liberar motivos de segurança.

## 8. Referência de preço, score e deduplicação

### 8.1 Referências e sinais

Manter três campos conceitualmente distintos: diferença histórica observada, desconto declarado e suspeita transversal por categoria.

- Histórico próprio: mediana dos preços diários comparáveis da mesma oferta na janela inicial de 60 dias, com cobertura e período efetivo registrados. Excluir a observação corrente da referência. Medianas por dia evitam que recapturas frequentes mudem artificialmente o peso de um dia.
- Critério inicial para usar referência histórica: pelo menos três dias com observações anteriores comparáveis e amplitude de ao menos sete dias. Uma série de sete dias é apresentada como sete dias, sem afirmar acompanhamento de 30–60 dias. Histórico menor pode ser exibido como pontos, sem fabricar desconto comprovado.
- Categoria: distribuição das diferenças históricas de produtos com séries aptas, usada para suspeita de alegação incomum. Recalcular semanalmente com amostra/cobertura, loja e faixa de preço registradas. Com amostra insuficiente, desativar o sinal; ponto de partida de vinte produtos distintos por agrupamento é hipótese a testar. `p95` não prova fraude e não exclui uma oferta automaticamente.
- Apenas preço riscado: persistir como declarado. Se participar da ordenação, confiança inicial de 0,5, contribuição limitada e penalidade explicável para alegação suspeita. Referência por categoria não recebe confiança fixa de 0,7 como se confirmasse o preço do item.

Não atribuir confiança factual 1,0 só porque há histórico próprio; comparabilidade, cobertura e idade continuam necessárias. O campo público de diferença histórica fica nulo quando ela não é demonstrável. Não usar mediana de outra loja/variante como histórico do anúncio.

### 8.2 Hipótese inicial de score e ausência de dados

Implementar função determinística versionada com componentes em escala 0–100, mantendo matéria-prima, normalização, confiança e contribuição final. Hipótese inicial para o modo de comparação:

```text
score_vitrine = 0,35 qualidade_utilidade
              + 0,20 popularidade
              + 0,20 sinal_desconto
              + 0,10 economia_absoluta
              + 0,10 frescor
              + 0,05 sinais_loja
              - penalidades_explicadas

score_pauta = 0,75 score_vitrine + 0,25 apelo_whatsapp
```

Esses pesos são ponto de partida de ensaio, não ganho comprovado nem requisito inegociável. Reduzem a dependência dos 50% de desconto/economia da proposta original. O ajuste final ocorre sobre os mesmos candidatos e uma amostra humana, preservando a regra de ausência de piso percentual.

Componentes sem dado recebem contribuição neutra explícita, em vez de zero ou máxima qualidade. Para sinais frágeis, contrair a contribuição em direção ao neutro pela confiança. A ausência de histórico não elimina o candidato, e ausência de prova social não equivale a nota ruim. Sinais neutros não satisfazem um requisito factual obrigatório de publicação.

Normalizar métricas comparáveis por categoria e faixa de preço. Com cohort inicial menor que vinte itens, recorrer à categoria e depois ao conjunto geral; registrar o fallback. Notas de IA já normalizadas podem manter escala absoluta no fallback. Atualizar o cohort inteiro afetado por entrada/saída, mudança de faixa/categoria ou nova referência; não recalcular apenas o produto alterado.

Popularidade usa vendas e quantidade de avaliações com transformação logarítmica e nota bayesiana quando houver volume/escala adequados. Sem `rating_count`, o sistema não afirma ter calculado rating bayesiano. Flags Full, Prime, Mall e Choice só contam quando observadas e não provam qualidade do produto.

Frescor é monotônico pela idade da evidência válida; meia-vida inicial DOM de 15 horas. Nunca usar percentil de idade que faça todo um pool envelhecido parecer fresco. Persistir cálculo/data e atualizar nos jobs. `potential_score` estima mérito antes da penalidade de envelhecimento e ordena conferências de candidatos promissores; não libera publicação nem cria busca interminável de produtos frios.

### 8.3 Equivalência e escolhas entre lojas

Usar tokens/Jaccard como gerador de pares, com limiar inicial 0,8, sem fundir registros. Confirmar marca/modelo, capacidade, quantidade e diferenças materiais; preço próximo não é condição obrigatória, pois a melhor oportunidade pode ter grande diferença.

O grupo mantém ofertas/históricos independentes e escolhe representante por elegibilidade, preço total conhecido, condições e score. Veto humano e cooldown do mesmo item reconhecido não podem ser burlados por uma variante irrelevante ou loja diferente; permitir exceção somente por regra explícita do canal. Produto sem identidade suficiente permanece independente, sem equivalência inventada.

## 9. Vitrine, promoção e validade pública

### 9.1 Seleção e continuidade

Capacidade inicial de 24 produtos, preservando o formato atual. Diversidade inicial: categoria alvo de até 20%, loja alvo de até 30% e controle por família/equivalência. Arredondamento é explícito e calculado sobre a capacidade configurada. Não excluir toda uma loja por falta de concorrentes.

Aplicar tetos estritos quando houver oferta diversa suficiente. Sob escassez, flexibilizar categoria/loja em passos determinísticos e registrar a exceção; nunca relaxar segurança, validade, fidelidade do preço, equivalência ou ausência de link necessário. Continuar aceitando vitrine menor. Ordem manual permanece sujeita aos mesmos gates factuais.

Um desafiante apto substitui o ocupante comparável mais fraco quando superar seu score em 10% inicialmente, respeitando a composição resultante. Substituição por concorrente melhor é causa explícita de saída. Preencher vaga aberta não exige vantagem percentual.

Remover imediatamente por vencimento, indisponibilidade confirmada, bloqueio humano/material ou preço inválido da condição exposta. Queda de mérito superior a 20% também pode ejetar, comparando fatos atuais e snapshot de entrada sob a mesma versão/normalização; não comparar números calculados com pesos distintos. Preservar o snapshot de entrada para essa comparação. A decadência de frescor não precisa atingir 20% para o TTL atuar.

### 9.2 Gate de promoção assíncrono

1. Montar disputa e selecionar finalistas com limite de reservas. Não fazer chamada de loja dentro da transação de composição.
2. Shopee: pedir confirmação por ID na API oficial para a promoção; reaproveitar pedido equivalente já em andamento e verificar se a resposta confirma a condição anunciada.
3. DOM: aceitar evidência compatível de até 12 horas; caso contrário criar promoção pendente e pedido dirigido. Listagem pode resolver; PDP resolve o resíduo compatível.
4. O planner inclui explicitamente promoções pendentes, mesmo fora da vitrine. Revalidar relevância do pedido antes de abrir a página.
5. Após o resultado, recalcular preço, mérito necessário e posição. Revalidar identidade, política, vetos, origem e revisão na transação curta que troca a edição.
6. Enquanto aguarda, manter ocupante ainda válido, usar reserva já verificada ou deixar vaga. Falha não afirma que o próximo será publicado instantaneamente; ele também precisa passar pelo gate.

Relação pendente pode sobreviver ao vencimento do candidato apenas até seu prazo de recuperação, sem exposição pública. Expirada, é cancelada; redescoberta válida pode abrir nova disputa. Usar precedência estável para não alternar continuamente os mesmos pedidos.

### 9.3 Permanência e todas as superfícies

Padrões iniciais: DOM até 24 horas após a verificação compatível; ajuste para 48 horas fica configurável após medir reencontro. Shopee tem retenção máxima de 72 horas no pool, mas a apresentação atual usa confirmação recente com validade inicial de uma hora; renovar pelo backend antes do prazo, em lotes, e ocultar preço/oferta atual se falhar. Essa distinção impede chamar um preço de três dias de atual.

Uma projeção única de elegibilidade determina `offer_valid_until` para vitrine, busca, categorias, detalhes, cards OG/Stories, links curtos, saída afiliada, bio e recomendações. Aplicar também no SQL do runtime público, sem depender de filtros React. Cache/ISR e artes servidas têm prazo máximo coerente ou invalidação; se a validade não puder ser garantida, omitir o preço da imagem persistente.

GET público não consulta marketplace nem IA e não cria tarefa por visitante. Pode retirar conteúdo vencido e exibir referência histórica datada; preenchimento vem de nova edição do worker. Uma resposta já aberta não é apagada do navegador de terceiros: a interface remove/desabilita oferta vencida localmente quando aberta e o servidor confere novamente ações sensíveis.

Manter página histórica explicativa e URL dos links enviados. Links vencidos levam à página de estado/histórico, sem alegação de preço atual nem redirect afiliado que burle o gate. Restaurar saída somente após nova oferta apta; não apagar cliques ou arquivos do link compartilhado.

## 10. Pauta por slots e confirmação manual

Reutilizar canais WhatsApp e Stories, preservando suas apresentações e permissões. Começar com quatro slots por dia e até três produtos por slot, dentro das faixas propostas de três a cinco slots e dois a quatro itens. Horários são configuração da conta em `America/Sao_Paulo`; copiar horários existentes quando houver e manter agenda desativada até sua configuração válida.

A previsão de próximos slots é um conjunto pequeno de candidatos para conferir, não uma reserva definitiva de produto ou preço. Preparar a seleção final quando o horário chegar ou quando o operador abrir a preparação para uso. Se a preparação falhar, mostrar pendência sem reciclar automaticamente uma mensagem antiga como nova.

Gates do canal:

- Sem desconto mínimo; nenhum aviso/estado pode tratar sua ausência como impedimento.
- Preço e condições recentes, oferta elegível, link afiliado válido e ausência de conflito material.
- Shopee conferida no máximo uma hora antes da preparação. DOM conferido no máximo doze horas; até 24 horas é ajuste explícito de política, não fallback automático.
- Teto inicial de impulso de R$ 200 é parâmetro opcional da pauta, nunca filtro global de ingestão/vitrine. Pode ser desativado por configuração; medir seu efeito por categoria/loja no ensaio.
- Cooldown inicial v2 de dez dias por conta/canal/produto e equivalência reconhecida. Copiar configurações legadas como legado, sem sobrescrever silenciosamente outros canais/contas. Exceção por melhoria de preço não fica ativa por padrão; se habilitada, exige observação nova comparável e motivo auditado.
- Rotacionar categorias considerando envios realmente confirmados, não apenas previsões/preparações. Respeitar disponibilidade de opções sem inventar diversidade.
- Preço inicial/faixa pode aparecer somente em apresentação fiel já suportada, sem desconto histórico/economia exata e sem insinuar opção confirmada. Gate avalia o tipo anunciado e a evidência que o sustenta.

Ao preparar, guardar snapshot dos fatos, produtos, texto, revisão, condições e validade. Atualização posterior não altera mensagem já copiada: a tela sinaliza mudança e oferece nova preparação. Se o operador demorar e vencer, reconferir antes de voltar a oferecer como pronta.

Confirmação humana de envio é idempotente e registra o snapshot efetivamente declarado como enviado, mesmo se as condições já mudaram; não negar a existência de um envio manual ocorrido fora do aplicativo. Caso esteja vencido, registrar também o aviso e solicitar atualização das próximas mensagens. A confirmação atual que exige pertencimento à edição corrente precisa evoluir para aceitar preparação histórica autenticada, sem aceitar produto/snapshot forjado. Preparar/copiar não inicia cooldown.

Ocorrências usam chave única por conta/canal/instante programado. Reinício não duplica slot nem dispara mensagens. Slot passado sem confirmação fica pendente/expirado segundo janela de uso; não acumular os atrasados para envio em massa. Pausar/desativar canal cancela futuras preparações, preservando envios.

## 11. Planner de recaptura e contrato da extensão

### 11.1 Seleção do trabalho

O planner olha ofertas quentes, promoções pendentes e pedidos explícitos de acompanhamento. Prioridade considera prazo de expiração, slot próximo, exposição ativa, pedido do usuário e mérito potencial. Balancear esses motivos com capacidade reservada; uma sequência de finalistas não pode consumir todo o orçamento dos acompanhamentos ativos.

Camada 0: toda captura normal pode renovar os produtos conhecidos que tenham preço válido. Camada 1: escolher páginas com maior cobertura esperada por custo, usando a relação histórica produto–página e a taxa real de reencontro. Camada 2: conferir PDP dos alvos restantes, após reavaliar necessidade e orçamento.

A cobertura histórica é previsão, não conferência. Após cada reporte, retirar somente os alvos efetivamente reobservados; recalcular o plano e não repetir indefinidamente a mesma página se ela deixou de entregar os produtos. Novos itens encontrados pela revisita também passam pela ingestão normal. Ausência gera resíduo, sem indisponibilidade.

Sem URL de origem utilizável, recorrer à PDP se houver permissão/capacidade. Sem nenhuma URL segura, registrar pendência específica. URLs preservam busca, paginação e parâmetros de configuração necessários, removendo tokens, sessão, identificação pessoal e rastreadores não necessários. Não enviar HTML, cookies ou sessão ao backend.

### 11.2 Rotas e compatibilidade

Manter `/api/extension/captures` e `/api/extension/capture-batches` durante a transição. Extrair serviço comum de observação; as novas rotas não devem chamar handlers HTTP antigos internamente. O modo manual atual continua operante e nenhum upgrade troca origem/dispositivo/conta automaticamente.

Contrato alvo, com validação em execução e capabilities negociadas:

| Operação | Efeito |
| --- | --- |
| `GET /api/extension/recapture-plan` | Plano limitado para a conta do dispositivo, revisão, tarefas, alvos, prioridade, prazos e orçamento restante. Somente leitura; não reserva cota nem inicia captura. |
| `POST /api/extension/recapture-plan/claim` | Reserva tarefa e orçamento atomicamente, com lease por dispositivo e chave idempotente. Retorna trabalho autorizado ou motivo de conflito/adiamento. |
| `POST /api/extension/observations` | Reporta evidências/resultados de uma ação reclamada ou descoberta normal. Aceita resultado sem preço e ausência de alvos, preservando o significado de cada caso. |

Envelope novo v2 inclui `requestId`, `taskId` quando houver, token de claim, `sessionId`, `marketplace`, `observedAt`, página com URL/tipo e lista de produtos/resultados. Produto carrega `externalId`, título/URL quando observados, preço em centavos ou ausência explícita, moeda/tipo/faixa, identidade/condições, rating/volume/vendas/frete/flags somente quando presentes.

Resultados mínimos: `observed`, `unavailable_confirmed`, `not_found_on_listing`, `needs_login`, `blocked`, `parse_error`, `timeout`, `configuration_mismatch`. Somente `observed` com preço e evidências aptas renova verificação. Resultado negativo sem prova de indisponibilidade mantém a última evidência até seu vencimento.

O servidor resolve produto/tenant e verifica fonte, host, configuração e correspondência com alvos; rejeita ID de outra conta, tarefa de outra sessão/dispositivo ou observação incompatível. Allowlist de URLs exata por loja, HTTPS, sem credenciais, IP/local e redirecionamento para host estranho; revalidar também no navegador após navegação. Login/captcha não é resolvido pelo código.

Mesma chave e mesmo conteúdo retornam resultado anterior. Chave reaproveitada com conteúdo diferente recebe conflito. Replay após falha de resposta não duplica preços, tarefas ou consumo. Resposta traz contagens e motivos por item, conferências satisfeitas e necessidade de buscar nova revisão do plano; sem segredos ou dados de outros usuários.

### 11.3 Sessão e permissões do navegador

A extensão atual usa `activeTab` e não tem permissão para injetar extrator em qualquer aba background. Implementar permissões opcionais de host por loja, solicitadas pela UI no início de sessão autorizada. Sem concessão, oferecer abertura assistida da página ativa; não ampliar o manifesto para acesso irrestrito a sites.

Sessão: iniciar atualização → consultar/reclamar plano → revisitar listagens → reportar/replanejar → processar resíduo PDP → devolver controle para descoberta. O operador pode pausar/cancelar. Uma aba por vez; pausa aleatória inicial de 5–15 segundos entre ações, além do carregamento, sem retries rápidos ou automação de contorno de bloqueio. Definir duração e cota que preservem tempo para descoberta.

Persistir próxima ação, sessão/origem/dispositivo, claim, contadores e prazo na storage/outbox existente. Retomar por eventos/alarms após suspensão, sem depender de um loop longo em memória. Suspensão pode aumentar a pausa, nunca autoriza acelerar ações para recuperar atraso. Revogação, logout da conta ou troca de origem interrompem a sessão e isolam a outbox.

Mini-extratores PDP evoluem a base existente de Amazon/AliExpress e acrescentam o necessário para Mercado Livre. Extrair preço, disponibilidade e identidade/condições suficientes; não transformar o resíduo em robô de navegação genérico. 404 deve ser do produto e não de login/desafio. Não seguir fontes da Shopee pela extensão.

## 12. Orçamento, jobs e recuperação

Reutilizar o listener Node/executor durável e um agendamento próprio no backend. Não criar segundo runtime Python nem dependência Redis/fila hospedada. Agendamento é sinal; o trabalho e a próxima execução ficam persistidos. Instâncias concorrentes disputam claim no banco.

| Trabalho | Gatilho | Responsabilidade |
| --- | --- | --- |
| Ingestão/delta | Commit de observação | Avaliação necessária, cohort afetado, novas disputas e invalidação por escopo. |
| Seleção vitrine | Mudança relevante e job inicial a cada 60 minutos | Recalcular frescor/TTL, histerese e edição sem chamadas de fonte dentro da transação. |
| Conferência Shopee | Promoção, renovação e preparação de slot | Consulta oficial por ID, com cache factual de validade curta, coalescimento e orçamento. |
| Planner DOM | Sessão explícita e reportes | Plano por revisão, claim, listagens e resíduo. Sem polling se o navegador não pode avançar. |
| Slot | Horário configurado ou preparação manual | Finalistas, conferência e mensagem pronta; nenhum envio automático. |
| Manutenção | Diário | Timeouts de revisão, leases e promoções expiradas; limpeza limitada de preparações temporárias. |
| Auditoria | Semanal | Comparação de seleções, qualidade de dados, amostra humana e atualização versionada dos exemplos/sinais. |

Timers são reconstruídos no restart e a varredura de recuperação é limitada. Sem trabalho, não consultar o banco a cada poucos segundos. No retorno após indisponibilidade, consolidar jobs de seleção vencidos em uma execução atual; slots preservam suas ocorrências e não se multiplicam. Usar fuso da conta para agenda/dia de cota e UTC para instantes persistidos.

Orçamento de listagens, PDP, API e IA é separado do número de candidatos armazenados. Reservar consumo atomicamente antes da ação, registrar resultados e distinguir tentativa externa de retry de transporte do mesmo reporte. Uma tentativa externa sem resposta pode ter consumido cota; reconciliar conservadoramente e não executar novamente sem limite. Duas extensões compartilham a cota diária da conta.

O teto inicial de PDP é 30 por sessão e 30 por dia por conta, ajustável até a faixa proposta de 40 após medição. Reabrir a extensão não zera a cota. Listagens têm orçamento próprio, começando com até cinco dirigidas por sessão; APIs/IA usam os limites já provisionados da conta/instalação, sem inventar quota do provedor. O teste controlado mede demanda e permite ajustar configuração, sem garantia de preencher a vitrine.

Prioridades não burlam os limites. Produto fora da cota fica pendente ou vence. Rate limit usa recuo e `Retry-After`; credencial expirada pede ação do dono. Sem API/permissão/navegador, não há fallback para scraping de servidor.

## 13. Fila manual, auditoria e aprendizado

A fila manual é exceção para candidatos perto da fronteira cuja confiança estimada esteja inicialmente entre 0,4 e 0,7. Ordenar por impacto potencial, não por chegada. Limitar a quinze novos casos por dia por conta e a quinze casos abertos; a fila não se torna estacionamento de todo o pool.

Dúvida factual obrigatória permanece na fila de conferência, não vira aprovação por timeout. Confiança abaixo de 0,4 com evidência insuficiente aguarda nova observação; não encher a revisão humana automaticamente. Uma avaliação com confiança alta não contorna bloqueios.

Após 24 horas, encerrar a exceção e aplicar o resultado determinístico que seria válido sem decisão humana: selecionar somente se todos os requisitos forem satisfeitos, ou manter fora desta edição. Não reprovar definitivamente por tempo e não reabrir o mesmo caso diariamente sem dado novo. Se perdeu relevância ou venceu, sai da revisão ativa.

Toda decisão humana registra snapshot, motivo e fonte. Amostra semanal inclui vinte selecionados, vinte próximos do corte e uma amostra estratificada dos demais/novos/sem histórico. A extensão dessa amostra é configurável, sem revisão obrigatória de todo o catálogo.

Reaproveitar exemplos humanos versionados e separar holdout de avaliação dos few-shots. Não alimentar automaticamente o modelo com suas próprias aprovações como se fossem decisões humanas. Exemplos de baixo mérito não removem vetos de segurança. Auditoria pode propor regras/pesos; alterações materiais entram como nova versão comparada, não otimização silenciosa por clique.

## 14. Interfaces e apresentação da promessa

- **Admin/captura:** mostrar descobertos, atualizados, inválidos, aguardando avaliação, aptos e aguardando conferência. Separar conclusão da captura de publicação na vitrine. Preservar feedback por loja e dados locais da sessão.
- **Admin/seleção:** explicar classe derivada, posição, principais componentes, fonte de referência e impedimentos. Exibir número de vagas válidas, promoções pendentes e orçamento, sem exigir entender a fórmula para operar.
- **Extensão:** botão de iniciar atualização, lojas/permissões, progresso legível, pausa/cancelamento, pendência de login e limites atingidos. A captura manual continua acessível.
- **Pauta:** agenda, previsão do próximo slot, preparação atual, quantidade disponível, validade e envio confirmado. Distinguir preparação vencida de mensagem já enviada; preservar texto local ao chegar nova evidência.
- **Vitrine/detalhe:** data da última conferência, preço exato/faixa fiel, condições relevantes e histórico quando comparável. Oferta vencida não mantém selo de atual. Página histórica diz quando o preço foi visto.
- **Minha área:** pedidos ativos continuam visíveis fora da vitrine; mostrar data, atrasos e dependência de navegador. Não apresentar baseline de outra configuração como queda. Preservar parar/retomar e consentimentos existentes.
- **Configuração:** política versionada com validação e controle de concorrência. Ajustes por conta/canal, sem sobrescrever alterações feitas em outra aba ou resetar fontes/permissões.

## 15. Parâmetros iniciais e decisões configuráveis

Valores abaixo são hipóteses explícitas de partida, sujeitas a ensaio. Não tratá-los como constantes espalhadas nem alterar automaticamente a política de outras contas.

| Parâmetro | Inicial v2 |
| --- | --- |
| Vitrine | 24 produtos, capacidade máxima e formato atuais preservados |
| Zona morna | Até três vezes a capacidade; excluir quentes do conjunto contado |
| Pool DOM / Shopee | 48h / 72h desde a evidência válida; presença sem preço não renova |
| Entrada vitrine DOM | Evidência compatível de até 12h ou conferência antes da promoção |
| Permanência vitrine DOM | 24h; ampliar até 48h somente por configuração avaliada |
| Apresentação atual Shopee | Confirmação válida por até 1h; retenção de 72h não amplia essa promessa |
| Pauta Shopee / DOM | Até 1h / 12h na preparação; DOM até 24h é opção explícita |
| Decay DOM | Meia-vida de 15h, sem substituir TTL |
| Substituição / queda de mérito | +10% / -20%, calculados sob mesma base |
| Categoria / loja | Alvos de 20% / 30%, com escassez e arredondamento auditáveis |
| Slots / tamanho | Quatro por dia / até três produtos; horários configurados pelo operador |
| Cooldown | Dez dias v2; confirmação manual, escopo por canal/conta e equivalência |
| Desconto mínimo | Inexistente |
| Teto de impulso da pauta | R$ 200, opcional/desativável, sem efeito no pool/vitrine |
| Revisão manual | Confiança 0,4–0,7 perto do corte; quinze novos/dia e quinze abertos; timeout 24h |
| IA | Até vinte itens por lote; temperatura 0; mudança acumulada de preço de 10% como um dos gatilhos |
| Preço de referência | Mediana diária comparável; janela 60 dias; cobertura mínima registrada |
| Normalização pequena | Fallback abaixo de vinte candidatos no cohort |
| PDP | Uma aba; pausa 5–15s; até trinta/sessão e trinta/dia/conta |
| Listagens dirigidas | Até cinco/sessão inicialmente; respeitar orçamento diário configurado |
| Seleção periódica | 60min inicialmente, ajuste entre 30–60min |
| Pendência de promoção | Até 24h, limitada à relevância e cancelável a qualquer momento |

API, IA e acompanhamento explícito exigem orçamento provisionado e informado no destino. Sem configuração de limite, não ativar novas chamadas externas automaticamente. Não usar esses limites como justificativa para descartar observações já recebidas e válidas.

## 16. Etapas de implementação e dependências

As specs abaixo registram a construção do motor e seu andamento na conferência de 14/11. Elas continuam úteis para localizar código, testes e pendências, sem uma nova cadeia de planos ou OS. Para a revisão operacional de 15/11, executar a seção 21; reconciliar apenas as dependências que afetem sua capacidade. As seções 1 a 15 continuam definindo comportamento e parâmetros; as seções 17 a 20 definem ativação, verificação e conclusão, sempre sujeitas à suspensão dos agendamentos.

### Como o agente deve executar

1. Ler os invariantes da seção 2, reconciliar o avanço local registrado no início e abrir a T00. A autorização de implementar o objetivo permite continuar entre tracks prontas, sem pedir aprovação por tarefa ou arquivo.
2. Usar a spec da track atual para localizar dependências, arquivos e tarefas. Cada tarefa tem ID estável e um checkbox de execução; as caixas começam abertas porque esta organização não comprova a implementação.
3. Aproveitar código parcial compatível. Existência de função, contrato ou teste não demonstra integração; conferir transporte, persistência, consumidor e saída conforme a tarefa.
4. Integrar e testar a capacidade da track antes de declará-la concluída. Registrar o que foi comprovado e a próxima tarefa pendente, atualizando o andamento abaixo sem abrir outro plano.
5. Se uma parte depender do destino, permissão de navegador ou chamada externa ainda sem autorização, registrar o impedimento específico e continuar o trabalho local independente. Não confundir esse limite com exigência de aprovação de toda a track.
6. Manter métricas, isolamento, compatibilidade e recuperação junto dos produtores. A T07 finaliza operação e a T08 comprova a integração; elas não adiam testes ou proteções das demais.

### Índice e andamento

| Track e spec | Resultado observável | Dependências | Situação nesta organização |
| --- | --- | --- | --- |
| [T00 — Reconciliação e base de verificação](curadoria-tracks/00-reconciliacao-e-base-de-verificacao.md) | O implementador sabe qual comportamento está ativo, o que existe apenas localmente e qual é a próxima tarefa executável, com uma base de testes segura para continuar. | Entrada | Base local reconciliada e fixtures em PGlite (`curation-t01-t02-v2`, `curation-journey-t03-t08-v2`); falta inventário remoto (T00.02 em VPS/DB) |
| [T01 — Fatos, persistência e ingestão independente](curadoria-tracks/01-fatos-persistencia-e-ingestao.md) | Uma captura legítima acrescenta fatos, renova apenas o relógio correto e não depende da conclusão de outra loja. Retry não duplica preço e vencimento não apaga histórico. | T00 | Implementada e verificada localmente em PGlite (`garimpa_app`); pendente aplicação das migrações e backfill limitado no banco remoto (T01.09) |
| [T02 — Avaliação, referência de preço e score explicável](curadoria-tracks/02-avaliacao-referencias-e-score.md) | O sistema avalia somente o delta necessário, explica a pontuação de cada candidato e compara a seleção proposta com a atual sem alterar a vitrine. | T01 | Implementada e verificada em PGlite com provedor simulado (`curation-t01-t02-v2`); pendente chamada paga real de IA e janela ao vivo |
| [T03 — Seleção, promoção e validade pública](curadoria-tracks/03-selecao-promocao-e-validade-publica.md) | A vitrine escolhe candidatos com estabilidade e diversidade, coloca ofertas antigas em espera de conferência e impede exposição atual de informações vencidas em todas as rotas. | T01, T02 | Verificada localmente em PGlite e testes unitários (`curation-selection-v2`, expiração/indisponibilidade sem worker em `home`, `publicDealDetail`, `/oferta` e bloqueio de `/go`) e `next build`; comprovação dedicada das demais rotas públicas (`T03.07`) e ativação remota pendentes |
| [T04 — Conferência, planner e revisitas de listagens](curadoria-tracks/04-recaptura-planner-e-listagens.md) | Uma sessão autorizada confere ofertas prioritárias pelas páginas com melhor cobertura, reporta somente o que realmente observou e deixa o restante pendente sem invalidar produtos por ausência. | T01, T03 | Planner, protocolo HTTP `/api/extension/observations`, cota, lease/claim e extratores verificados em PGlite, testes unitários e build/manifest; testes unitários de sessão na extensão (`T04.07`–`T04.09`), inspeção interativa (`T04.10`) e Shopee real pendentes |
| [T05 — Conferência individual de produto e recuperação](curadoria-tracks/05-recaptura-pdp-e-recuperacao.md) | O resíduo de uma sessão pode ser conferido na página do produto, com ritmo e custo limitados, permitindo promover uma oferta antiga somente quando a condição for confirmada. | T04 | Precedência PDP, `configuration_mismatch`, indisponibilidade/erro e reavaliação verificadas no backend em PGlite; cobertura dedicada de DOM PDP/sessão na extensão (T05.01, T05.03) e ensaio real pendentes |
| [T06 — Pauta por slots e confirmação de envio manual](curadoria-tracks/06-pauta-slots-e-envio-manual.md) | Ao preparar o slot, o operador recebe produtos elegíveis e atuais; o envio continua manual e sua confirmação permanece íntegra após mudança de preço ou edição. | T03, T04 | Fluxo completo de slots, previsão, preparação e confirmação idempotente (atual e vencida) verificado em PGlite e `next build`; verificação interativa de UI no navegador (T06.10) pendente |
| [T07 — Acompanhamentos, revisão de exceções e operação](curadoria-tracks/07-acompanhamentos-excecoes-e-operacao.md) | O operador entende pendências e custos, a revisão humana fica limitada e os acompanhamentos solicitados continuam com prioridade mesmo fora da vitrine. | T01, T02, T03, T04, T06 | `price_watch` por opção, equivalência/veto, métricas operacionais e isolamento entre contas verificados em PGlite e manual atualizado; testes específicos de timeout/exceções/holdout (T07.03–T07.06) e UI interativa (T07.08) pendentes |
| [T08 — Integração, migração e ativação gradual](curadoria-tracks/08-integracao-migracao-e-ativacao.md) | A capacidade integrada é comprovada no escopo autorizado e ativada por conta/fonte com medição e retorno seguro, sem misturar sucesso local com produção. | T00, T01, T02, T03, T04, T05, T06, T07 | Em andamento (T08.01–T08.09 abertas): base backend/HTTP e cadeias aditivas exercitadas em PGlite com adapters simulados; permanecem pendentes aceites locais (`T03.07`, `T04.07`–`T04.10`, `T05.01`, `T05.03`, `T06.10`, `T07.03`–`T07.06`, `T07.08`) além de configuração, ensaio real e ativação no destino (`T08.04`–`T08.09`) |

### Ordem de execução e fronteiras

```text
T00 → T01 → T02 → T03 → T04 → T05
                    │      │
                    └──────┴────→ T06
T01 a T06: construir acompanhamento, métricas e UI junto dos produtores
T01 + T02 + T03 + T04 + T06 → T07
T00 a T07, incluindo T05 para PDP DOM → T08
```

A T03 define e persiste o pedido de promoção/conferência; a T04 executa esse pedido por Shopee ou listagem DOM, com cota e protocolo; a T05 completa o resíduo por PDP. A T03 pode ser verificada localmente com executor simulado, sem afirmar conferência real. A T06 usa os mesmos gates e executores, em vez de construir uma fila própria.

A T07 começa nas interfaces de cada produtor e fecha seu aceite após a T06. Pedidos ativos, telemetria básica e isolamento acompanham as tracks desde o início. Não existe dependência circular: proteger acompanhamento não precisa esperar a tela final de auditoria.

A T08 pode ensaiar/ativar Shopee antes das demais fontes. Um MVP DOM com T04 e evidência recente pode deixar o resíduo vencer; conferir candidatos antigos por PDP requer T05. Toda ativação continua sujeita aos limites da seção 17. Os nomes anteriores F0 a F8 aparecem nas specs somente para localizar as etapas existentes.

## 17. Migração, ativação e retorno seguro

1. Preservar checkpoint e edição atual; inventariar migrações aplicadas, roles, protocolo e fontes de trabalho. Não usar o banco configurado do desenvolvedor como substituto do destino.
2. Aplicar mudanças aditivas no ambiente autorizado e publicar leitores compatíveis. Clientes antigos continuam enviando captura manual; recebem aviso de atualização quando tentam recurso novo.
3. Backfill por lotes: URLs somente quando recuperáveis de fatos reais, relógios pela última observação válida, identidade/configuração sem inferência e motivos humanos preservados. Nada de `now()` para fingir conferência recente. Registrar o que não pode ser recuperado.
4. Ativar escrita v2 e cálculo em modo de comparação por conta. Usar cache de atributos existente apenas se contrato/input realmente compatíveis; controlar custo do primeiro preenchimento.
5. Conferir pelo menos um ciclo de descoberta, atualização, promoção e vencimento para cada fonte a ativar. Confirmar histórico estável, links e pedidos ativos.
6. Ativar conferência e seleção em canário por conta/fonte. Desligar produtores legados sobrepostos e garantir que retorno de flag não os religue. Não apertar TTL global antes de haver candidatos verificados suficientes ou estado de escassez bem apresentado.
7. Ativar pauta após provar preparação/confirmar envio idempotente, inclusive caso de mensagem já copiada. Definir horários e cotas no destino; sem isso, preparar manualmente continua possível.
8. Observar uma janela controlada de 24–48h e a auditoria semanal. Ampliar após ausência de falhas de identidade, validade e custo; não exigir preencher todas as vagas como critério.

Retorno: pausar novas promoções/jobs externos, preservar ingestão e logs, manter somente edições/ofertas que ainda passam pelo gate factual e permitir recompor com a política anterior quando compatível. Uma flag não devolve preço vencido ao público nem apaga envios. Não executar down migration destrutiva nem descartar observações produzidas no canário.

Push, deploy, migração no destino, abertura de sessões de captura e chamadas reais respeitam destino/operação autorizados. Preparar código, migrações, comparações e comandos verificáveis antes da aprovação final que eventualmente faltar. Não iniciar infraestrutura, DNS ou migração de hospedagem como parte desta entrega.

## 18. Verificação por capacidade e cenários de falha

Testes novos devem exercitar decisões e saídas, não copiar a implementação. Manter suítes existentes pertinentes e acrescentar fixtures com duas contas, quatro lojas, dados ausentes, várias configurações e relógio controlado.

| Cenário | Resultado exigido |
| --- | --- |
| Levas em horários diferentes | Resultado de uma fonte incorpora fatos sem apagar as outras nem esperar por elas. |
| Falha antes/durante commit | Edição anterior permanece consistente; retomada não duplica observação. |
| Preço estável e replay | Conferência nova renova data e histórico; mesmo pedido repetido não cria ponto novo. |
| Evento atrasado e A→B→A | Histórico preservado; versão antiga não substitui a atual. |
| Faixa/variante/cupom alterados | Verificação e comparação da condição antiga não são transportadas. |
| Falta de rating/volume/frete/histórico | Sem números inventados, sem exclusão por desconto mínimo e sem falsa certeza. |
| Categoria com p95 baixo | Desconto anunciado alto gera sinal de suspeita; não vira desconto real nem veto automático. |
| Candidato sem histórico de alto mérito | Pode disputar; gates factuais continuam obrigatórios. |
| Entrada/saída muda percentis | Cohort afetado é recalculado e revisões ficam coerentes. |
| Similaridade com capacidade diferente | Ofertas não são fundidas; histórico/cooldown não são misturados indevidamente. |
| Desafiante melhor e histerese | Troca legítima ocorre sem exigir queda do ocupante; mudança pequena não provoca flicker. |
| Uma ou duas lojas elegíveis | Escassez gera composição explicada, sem relaxar validade ou bloquear toda a vitrine. |
| DOM antigo vence disputa | Pedido entra no planner antes da exposição; orçamento/navegador ausente mantém pendência. |
| Listagem mudou | Só alvos reencontrados renovam; ausentes viram resíduo, sem indisponibilidade. |
| PDP com login/captcha/erro | Não renova preço, não marca produto morto e não tenta contornar. |
| PDP confirma indisponível | Retira oferta atual; link/histórico continuam acessíveis com estado fiel. |
| Shopee devolve faixa sem estoque | Não confirma variante exata ou disponibilidade que a resposta não informou. |
| Duas extensões e restart | Claim, cota e outbox impedem trabalho duplicado; estado retoma na mesma conta/origem. |
| Revogação durante conferência/IA | Resultado não publica por conta sem acesso nem substitui veto novo. |
| Política/evidência muda em voo | Resposta é reconciliada e edição não mistura revisões. |
| Job atrasado e cache público | Oferta vence na leitura/ação mesmo sem execução pontual do job; cache não serve preço antigo. |
| Slot durante alteração de preço | Seleção usa fatos revalidados; snapshot/validade são claros. |
| Copiar, não enviar | Nenhuma exposição/cooldown é registrado. |
| Enviar e confirmar após edição mudar | Registra o snapshot declarado, uma vez, com aviso se vencido; não duplica envio. |
| Cooldown e equivalência | Próxima pauta respeita envios confirmados e não repete via anúncio equivalente. |
| Revisão excede teto/timeout | Não bloqueia seleção nem libera falha factual; não reabre caso sem dado novo. |
| Watch fora da vitrine e sem navegador | Pedido permanece, mostra última conferência/pendência e mantém prioridade. |
| Tarefa/URL/ID de outra conta | Negação no serviço e RLS; sem vazamento de preço privado, cota, URL ou plano. |
| Superfícies alternativas e rollback | Busca, detalhes, imagens e redirects não contornam expiração; retorno não reativa fonte proibida. |

Executar testes unitários de contratos/scoring e integração PostgreSQL para escritor, RLS, tarefas, orçamento, concorrência, edição e confirmações. Reutilizar `tools/editorial-tests` e os testes nativos de captura/pauta; fixtures não são evidência de uso real de loja ou VPS.

Comandos existentes de referência: `npm test` e `npm run typecheck` nos pacotes afetados; `npm run build --prefix packages/web`; `npm run test:egress --prefix tools/editorial-tests`; suítes `test:pauta-cache-native`, `test:capture-publication-native`, `test:capture-journey-native` e `test:extension-manual-native` quando o ambiente comportar. Adicionar scripts das novas capacidades somente ao implementá-las. Não executar CLIs de captura/triagem real como se fossem testes sem efeito externo.

O ensaio final exercita navegador → observação → banco → avaliação → disputa → pedido → conferência → edição → pauta → confirmação, com reabertura e expiração. Conferir outputs persistidos, mensagens e UI; build/typecheck não substituem a jornada. Chamada real da Shopee e sessão real por loja DOM devem ser explicitamente distinguídas dos adapters simulados.

## 19. Métricas, ganhos esperados e limite de custo

Medir antes/depois na mesma conta, fontes e quantidade de capturas. Registrar volume processado e custo por etapa para não atribuir economia de verificação a um aumento oculto de IA.

- Qualidade: avaliação humana dos selecionados e dos próximos do corte; produtos úteis deixados de fora; motivos de bloqueio e proporção sem histórico.
- Frescor: idade da evidência exposta, vencidos impedidos antes da resposta, atraso de renovação, vagas abertas e casos em que um preço mudou após divulgação.
- Conferência: solicitações, claims, sucesso/ausência/falha por loja, reencontro por página e custo por observação útil; backlog e idade dos pedidos ativos.
- Continuidade: trocas por captura, tempo de permanência, trocas por vantagem real e reincidência de anúncios equivalentes.
- Operação humana: entradas/abertos/timeouts da revisão, minutos gastos e preparações efetivamente enviadas.
- Recursos: chamadas/tokens/retries de IA, API, listagens/PDPs, bytes banco–servidor e servidor–cliente, CPU/tempo e preparações abandonadas.
- Resultado: CTR com impressões elegíveis por posição/categoria; links de cada canal identificados para medir cliques. CTR da vitrine é pista, não medida direta de apelo no WhatsApp nem de venda.

Ganhos verificáveis: sem descarte permanente por posição; esforço ativo concentrado na fronteira; preços vencidos impedidos nas superfícies; conferências estáveis acumulando histórico e revisão com teto. Não prometer porcentagem de CTR, conversão ou redução de links mortos sem ensaio.

Cenários aritméticos úteis, sem tratá-los como benchmark: TTL DOM de 24–48h em lugar de sete dias reduz a janela máxima sem nova observação em 71–86%; quinze revisões de 30–60s somam cerca de 8–15min; cinco páginas que reencontrem quarenta alvos substituem 87,5% das navegações individuais. Trinta PDPs têm de 2,5 a 7,5min só de pausas, além do carregamento. Cooldown de dez dias com seis a vinte produtos enviados por dia exige sessenta a duzentos produtos distintos ao longo do período.

O custo de **revalidação dirigida** deve seguir o conjunto quente mais os compromissos explícitos e as promoções tentadas. Ingestão, armazenamento e avaliação inicial continuam proporcionais ao volume recebido. A afirmação “800 capturas → cinco páginas + até trinta PDPs” é cenário a medir; o teto protege o gasto, não garante cobertura nem publicação.

## 20. Critério de conclusão e riscos residuais

A capacidade estará concluída quando a jornada integrada for demonstrada para cada fonte ativada, incluindo atualização estável, falta de dados, pendência de conferência, expiração, retomada e isolamento, e quando o operador conseguir explicar uma seleção pelos fatos registrados.

A entrega registra separadamente código local, migrações aplicadas, versão instalada da extensão, flags/políticas ativas, ensaio real e limites ainda presentes. Manter este documento e o manual operacional existentes atualizados, sem criar nova cadeia de planos para pendências do mesmo objetivo.

Riscos residuais a apresentar na entrega: navegador fechado impede conferência DOM; listagens podem não reencontrar produtos; API agregada pode não confirmar variante/estoque; históricos iniciais podem ser curtos; vieses de seleção persistem na cauda fria; cookies/região podem mudar condições; mensagem manual enviada não é corrigível remotamente; orçamento pode reduzir a seleção. O sistema responde com datas, pendências e escassez explícitas, sem inventar frescor ou ampliar métodos de coleta.

Referências técnicas para implementação: [políticas de segurança do PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [ciclo de vida do service worker de extensão](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) e [opções de agendamento do node-cron](https://www.nodecron.com/scheduling-options.html). Conferir a versão instalada e documentação pertinente antes de usar uma API nova; o plano não exige atualizar dependências por conta própria.

### Estado local verificado em 14/11/2026

- **Código e migrações locais**: cadeia v2 implementada nos quatro pacotes, migrações aditivas aplicáveis do zero em PGlite descartável com os papéis `garimpa_app` e `garimpa_public_runtime`. Durante os testes de integração em RLS foram corrigidos defeitos reais de produção (`SELECT ... FOR SHARE` substituído por advisory locks em `curation_policy_v2` e `recommendation_channel`, casts explícitos `::timestamptz`, `GRANT EXECUTE` de `garimpa.equivalence_group_for_observation` para `garimpa_app`, preservação de `optionKey` em `inputs` de `recommendation_edition` e repropagação de `forbidden_account_scope` em `readCurationOperationsMetrics`).
- **Suítes de integração em PGlite (`tools/editorial-tests`)**: `curation-t01-t02-v2.test.ts` (ingestão independente por fonte, A→B→A, evento atrasado, delta/reconciliação IA simulada, referência de preço, cohort/p95 e score) e `curation-journey-t03-t08-v2.test.ts` (histerese, promoção → recaptura → vitrine → pauta → confirmação atual/atrasada, expiração imediata sem worker mantendo `/oferta` e bloqueando `/go`, veto por equivalência, métricas e isolamento entre contas).
- **O que permanece dependente de autorização/ambiente**: conferência e aplicação das migrações e backfills no banco de produção/VPS; deploy web/worker/extensão; ativação de flags/política v2; ensaios interativos no navegador (popup/PDP/pauta); chamadas pagas reais de IA e consultas reais à Shopee/lojas DOM.

## 21. Plano de implementação da revisão operacional do painel

**Estado em 16/11/2026:** fases 1 a 3 implementadas e verificadas localmente, ainda sem publicação; fases 4 e 5 pendentes. **Objetivo:** permitir ao responsável capturar nas quatro lojas, acompanhar o processamento, entender e encaminhar falhas e encontrar a pauta pelo próprio painel, inclusive após sair e voltar. Esta seção é a sequência de execução desse objetivo no plano existente; não exige novas OS ou specs para cada fase.

Base de aceite: [auditoria da jornada](manual-operacional-curadoria.md#5-auditoria-da-jornada-operacional-em-15-de-novembro-de-2026) e [evidências de produção](evidencias-auditoria-operacao-2026-11-15.json). Os números daquele retrato servem para reproduzir os problemas; não são metas fixas de catálogo, pauta ou aprovação.

### 21.1 Escopo e decisões funcionais

A entrega compreende Hoje, início e histórico das capturas, detalhe de uma captura, andamento e problemas da Curadoria, ligações com a Pauta e navegação administrativa da conta. A revisão aplica-se primeiro ao painel auditado da casa. Contas que usam o workspace comercial conservam seus acessos e proteções; leitores e detalhes compartilhados devem funcionar conforme as capacidades efetivas de cada conta.

Decisões para implementação:

- A conclusão do recebimento e o processamento posterior são estados independentes. Uma captura pode estar concluída com itens aguardando avaliação, vínculo ou conferência. A disponibilidade da pauta também é independente.
- O responsável deve reconhecer cada importação manual e cada lote API. Conferências automáticas internas ficam identificadas e não substituem o histórico do trabalho solicitado.
- A ação principal de uma pendência leva ao item e à conta correspondentes. Problemas de execução, decisões editoriais opcionais e impedimentos de configuração têm grupos e contagens próprios.
- A pauta mantém sua seleção e seus gates atuais. Esta revisão explica o resultado e corrige acessos; não muda pesos, aprovação, validade, diversidade, capacidade dos canais ou a política de reutilização de avaliações.
- Nenhum novo cron, executor, canal de envio, serviço de fila ou coleta de servidor. Não ativar recaptura dirigida, descoberta, monitoramento, slots ou flags comerciais como atalho para viabilizar uma tela.
- Não alterar permissões da extensão, pareamento, credenciais, provedor, limites de IA ou regras de idempotência. Novos dados de acompanhamento devem ser compatíveis com a extensão instalada.
- O produto deve funcionar para quem divulga na mesma sessão e para quem volta depois. Não exigir que a aba permaneça aberta para conservar o histórico ou concluir trabalho já aceito.

### 21.2 Telas e navegação

**Hoje** será a entrada da operação, nesta ordem: conta e horário da consulta; processamento em curso e problemas acionáveis; pauta por canal; atividades recentes; atalhos para captura. A bancada manual completa, totais históricos do banco, formulários de infraestrutura e critérios avançados saem da abertura e continuam acessíveis onde fazem sentido.

Esboço funcional, sem fixar o desenho visual final:

```text
HOJE                                      Conta: BizuMiner
Consultado às HH:MM                        [Atualizar]

EM ANDAMENTO
Avaliação automática: N na fila · N em execução
Conferências: N aguardando navegador · N em processamento
[Acompanhar curadoria]

PRECISA DA SUA AÇÃO
N avaliações com resultado incerto         [Conferir avaliações]
N ofertas sem vínculo afiliado             [Ver ofertas afetadas]
Cada linha informa o que foi preservado e a ação possível.

PAUTA DISPONÍVEL
WhatsApp: N ofertas  [Abrir]     Stories: N ofertas  [Abrir]
A pauta disponível pode coexistir com processamento pendente.

ATIVIDADES RECENTES
HH:MM | Shopee        | API      | Captura concluída | [Detalhes]
HH:MM | AliExpress    | Extensão | Importação salva  | [Detalhes]
HH:MM | Amazon        | Extensão | Importação salva  | [Detalhes]
HH:MM | Mercado Livre | Extensão | Importação salva  | [Detalhes]
[Todas as capturas]                         [Capturar ofertas]
```

Quando não houver trabalho ativo, mostrar esse fato sem declarar a operação inteira resolvida. Quando uma consulta falhar, manter a última leitura identificada como desatualizada ou mostrar indisponibilidade; não transformar falha em zero. Cada canal pode estar disponível, vazio, inativo ou com consulta indisponível. Um erro em Stories não deve ocultar a pauta conhecida de WhatsApp.

**Capturas** reunirá o início das modalidades existentes e uma lista paginada, com filtros por data, loja, origem e situação. As quatro lojas aparecem com capacidades distintas: captura manual disponível, API disponível ou indisponível e vínculo afiliado configurado ou pendente. Captura disponível não significa capacidade de publicação. O AliExpress deve explicar a falta de configuração afiliada antes de sugerir novas importações como solução para a pauta vazia.

Cada recibo manual confirmado é uma atividade; um lote API reúne suas buscas. Agrupar visualmente por loja/dia é permitido, mas deve ser expansível e preservar os recibos individuais. Não criar uma identidade por proximidade de horário. Consultas de verificação entram em filtro próprio ou como detalhe ligado ao produto; seu rótulo é “Conferência de oferta”, com finalidade conhecida. A lista principal não fica limitada aos últimos 20 runs de todos os tipos.

**Detalhe de captura** deve abrir por referência persistida e manter contexto de volta à lista:

```text
CAPTURA SHOPEE · API · DD/MM às HH:MM        [Voltar às capturas]
RECEBIMENTO: concluído com pendências de vínculo
Início / fim · N buscas · N itens recebidos · N produtos distintos

RESULTADO REGISTRADO DA CAPTURA
Buscas concluídas / falhas · itens salvos / recusados conhecidos
Problema registrado no encerramento e resultado das fontes

SITUAÇÃO ATUAL DOS PRODUTOS                  Consultada às HH:MM
Avaliação: fila / execução / compatível / resultado incerto
Vínculo e conferência: pendências e motivos
Seleção: na pauta / apto fora do corte / bloqueado / indisponível
Contagens de etapas diferentes podem se sobrepor.

PRODUTOS                                   [Filtrar por problema]
Produto | Fato desta captura | Situação atual | Motivo | [Abrir item]

AÇÕES DISPONÍVEIS
Somente as permitidas para esta operação e esta pessoa.
[Ver pendências]   [Retomar consultas pendentes, quando seguro]
[Detalhes técnicos e histórico]
```

Para importação manual, trocar as informações de buscas pelas informações do recibo, com horário de leitura do navegador e recebimento no servidor quando conhecidos. Falta de informação histórica aparece como “não registrado”. O detalhe não se resume a uma tabela de logs nem exige copiar IDs para outro formulário.

**Curadoria** passa a ter três entradas claras: Andamento, Problemas para resolver e Revisão editorial opcional. Andamento mostra o motor efetivamente ativo, avaliações novas ou reaproveitadas demonstráveis e histórico v2. Problemas separa resultado incerto, falha confirmada, credencial, vínculo, cota, prazo e espera de navegador. Exceções editoriais e amostragem não somem, mas deixam de representar toda a operação. O histórico de triagem antiga fica rotulado como histórico anterior, sem apresentar suas falhas como diagnóstico da fila atual.

**Pauta** conserva WhatsApp, Stories, preparação e confirmação manual. Mostrar quantidade disponível, edição e validade próprias do canal. Reutilizar a explicação de exclusão por produto: sem vínculo, aguardando avaliação compatível, conferência necessária, condição vencida, bloqueio editorial ou apto fora do corte. O histórico de produtos recentes continua disponível com esse nome; “Histórico de capturas” passa a designar atividades de recebimento. Um link de resolução sempre conserva produto, opção e conta.

| Área do menu | Destino funcional | Regra de exposição |
| --- | --- | --- |
| Hoje | Resumo e próximo passo | Entrada principal |
| Capturas | Iniciar, localizar recebimentos e recuperar operações | Entrada principal |
| Curadoria | Acompanhar motor, resolver problemas, revisar opcionalmente | Entrada principal |
| Pauta | Consultar ofertas e preparar divulgação | Entrada principal |
| Resultados | Retorno comercial existente | Principal quando disponível para a conta; explicar indisponibilidade no acesso secundário sem ativar o módulo |
| Conteúdo | Marketing, Campanhas e criador existente | Grupo secundário, preservando capacidades disponíveis |
| Configurações | Lojas e extensão; critérios e canais; conta/equipe conforme permissão | Entrada secundária com nomes explícitos; reutilizar formulários existentes |
| Ferramentas avançadas | Governança, Experimentos, diagnóstico técnico e histórico antigo | Acesso secundário condicionado às permissões atuais |

Primeiros Passos deixa de ser o endereço obrigatório para gerenciar conexões; o fluxo inicial permanece disponível para contas em configuração. URLs antigas continuam válidas por adaptação ou redirecionamento que preserve `conta`, produto, opção, filtros e âncora relevante. Não trocar a navegação comercial inteira por uma experiência da casa sem conferir seus consumidores.

### 21.3 Estados e significado das contagens

Usar um modelo de leitura compartilhado entre Hoje, lista, detalhe, Curadoria e indicadores da Pauta. Ele compõe os estados existentes; não cria outra máquina de execução.

| Dimensão | Estados de apresentação | Fonte e restrição |
| --- | --- | --- |
| Recebimento | Salvo, em execução, parcial, falhou, aguardando confirmação/conferência | Recibo confirmado, lote e checkpoints; ausência de recibo não comprova falha |
| Avaliação | Na fila, em execução, avaliação compatível, reaproveitada quando comprovada, resultado incerto, substituída/não aplicável | Job, avaliação e compatibilidade com fatos/política; `pending` legado sozinho não determina o estado v2 |
| Preparação da oferta | Sem vínculo, aguardando credencial/cota/prazo/navegador, em conferência, compatível, bloqueada | Publicação, promoção e evidência atuais; fila não demonstra worker trabalhando |
| Seleção por canal | Selecionada, apta fora do corte, impedida com motivo, sem consulta disponível | Leitor e gates reais do canal; aprovação no catálogo não equivale a seleção |
| Ação humana | Necessária, opcional, sem ação agora | Regras do servidor e permissão do ator; separar reconciliação técnica de julgamento editorial |

Evitar um único percentual para o fluxo inteiro. As etapas podem correr em paralelo, receber atualização de outra captura ou reutilizar avaliação. Não estimar previsão de término sem base medida. Mostrar última atividade, última consulta e, quando persistidos, prazo, próxima tentativa e motivo da espera.

Contagens obrigatórias com denominação explícita:

- Itens enviados pelo cliente, recebidos e validados no servidor são medidas distintas. Diagnósticos de rejeição de entrada não são rejeições editoriais.
- Observações salvas, produtos distintos e produtos novos são medidas distintas. Reencontrar o mesmo anúncio em três páginas não cria três produtos.
- Na lista, repetir a mesma requisição não cria outra atividade nem novos fatos. No detalhe, manter o resultado original e indicar que a resposta é de replay.
- Avaliações são contadas por produto/fato compatível, não pelo total de jobs históricos. Jobs substituídos e avaliações de fatos antigos não significam trabalho pendente atual.
- Quando só for possível comprovar avaliação existente, usar esse rótulo. Não classificar automaticamente como nova, reutilizada ou atual sem aplicar as mesmas regras de compatibilidade do motor.
- Contagens de espera por vínculo, resultado incerto e seleção não formam automaticamente uma partição. Deduplicar produtos dentro de cada categoria e indicar sobreposição entre dimensões.
- A quantidade disponível em WhatsApp e Stories vem de seus leitores, filtros de validade e configuração. O intervalo visual de frescor não cria uma obrigação de recaptura diferente da validade factual vigente.

Exibir datas em `America/Sao_Paulo`; persistir instantes com fuso e conservar relógios de leitura, recebimento, execução e observação. Não renovar a data factual ao enriquecer um recibo ou atualizar a tela.

### 21.4 Fontes de dados e evolução mínima da persistência

| Capacidade | Base existente a reutilizar | Trabalho necessário |
| --- | --- | --- |
| Recebimento manual em lote | `extension_capture_receipt`, `price_observation`, `manualExtensionItemRequestId` | Ler recibo sob contexto autorizado; ligar itens/observações por identidade exata e enriquecer novos recibos |
| Captura API | `capture_batch`, `capture_run`, `capture_prepared_offer`, metadados de execução | Compor resultado do lote e suas buscas; conservar staging privado e fonte de publicação |
| Importação individual e dados antigos | `price_observation`, procedência e identidade existentes | Mostrar registro individual quando essa for a única identidade demonstrável; não fabricar sessão ou run |
| Processamento automático | `curation_attribute_job`, `curation_attribute_assessment`, deltas e projeções | Determinar trabalho atual e compatibilidade; separar fila, execução, incerteza e reaproveitamento demonstrado |
| Preparação e seleção | `curation_promotion`, publicação, edição e eventos de seleção | Explicar bloqueio e histórico; não derivar presença pública apenas de existência de publicação |
| Pauta | `pauta-db.ts`, cache/versionamento e preparação persistida | Reutilizar quantidade e validade por canal; manter separação entre preparar/copiar e confirmar envio |

A identidade de atividade será a origem mais sua chave existente, sempre dentro da conta. Para recibos, respeitar a composição dispositivo/requisição; para API, usar o lote; para registros individuais, usar a observação. A referência usada na URL não concede acesso. Conferências avulsas conservam o run de origem e sua finalidade. Não acrescentar uma tabela genérica de jobs ou de operações apenas para alimentar a interface.

Novos recibos manuais devem conservar, na mesma transação dos fatos, dados normalizados de loja, página segura de origem, horário de leitura, resultado da validação, produtos e observações correspondentes, contagens verificadas de criação/atualização e uma versão do resultado. Aproveitar os diagnósticos já calculados em `POST /api/extension/capture-batches`; hoje eles são devolvidos ao popup, mas o recibo persiste apenas `productIds`. Enriquecer o resultado ou metadado privado existente e adicionar colunas/índices apenas onde a consulta exigir; não duplicar payload integral, cookies, HTML, tokens ou credenciais.

Preservar `productIds`, respostas, modo manual, chaves de idempotência e fingerprint dos fatos aceitos. Informação adicional de diagnóstico não deve mudar a identidade ou provocar `capture_request_conflict` em replay de um envio antigo. Preferir campos aditivos calculados no servidor e resposta com referência do recibo, opcional para clientes antigos. Alteração do popup, se necessária para oferecer “Acompanhar no painel”, deve ser aditiva e não exigir novo pareamento, nova permissão ou abertura automática de abas.

Para recibos antigos, recuperar produtos pela lista persistida e observações somente por vínculo determinístico comprovado de dispositivo/requisição/item. Nunca correlacionar apenas por janela de horário ou escolher a observação mais recente e apresentá-la como fato da captura original. Quando a associação não puder ser provada, conservar o recebimento e mostrar separadamente a situação atual do produto, identificando a lacuna histórica. Quantidades de produtos novos ou rejeitados não registrados permanecem desconhecidas. Backfill não chama IA nem loja, não publica ofertas e não regrava os fatos.

Uma importação ainda não aceita pelo servidor continua sob responsabilidade da fila/recibo local da extensão. O painel não deve afirmar que acompanha envios que nunca recebeu. O popup conserva envio incerto e sua orientação de consulta/replay seguro. Não criar heartbeat ou requisições em segundo plano para simular esse acompanhamento.

Se houver DDL, usar migração aditiva pelo fluxo existente. Conferir grants e RLS reais para leitura dos recibos por `owner`/`operator` autorizados; o acesso do dispositivo não prova que o leitor administrativo funciona. Manter FKs e joins com tenant, sem `service_role`, BYPASSRLS ou função definer nova para contornar permissão. Provar leitura/negação com papéis reais de runtime. Planejar índices e paginação por conta, origem e data/chave; validar a consulta antes de criar índices adicionais. Ensaio e aplicação no destino são operações distintas.

### 21.5 Consulta, atualização e resolução de problemas

Evoluir `/api/admin/operacao` de forma aditiva: manter os campos consumidos durante a transição e fornecer resumo por dimensão, problemas acionáveis, horário da consulta e disponibilidade independente de cada leitura. Usar um único compositor em vez de reproduzir regras em cada componente. Lista e detalhe poderão usar rotas autenticadas de leitura próprias, com referência de atividade, filtros validados e paginação por cursor. Validar os dados nas fronteiras; tipo TypeScript não substitui validação de resposta, autorização ou formato do cursor.

O contrato de leitura deve explicitar versão, instante da consulta e disponibilidade por seção. Cada atividade carrega origem/referência estável, loja, instantes conhecidos, resultado registrado, situação atual e ações permitidas. Cada contagem informa sua unidade e escopo; valor desconhecido é `null`, distinto de zero. Problemas informam categoria, certeza do resultado, itens afetados, estado atual e ação de resolução quando disponível. Cursor e orientação de atualização são dados do servidor; não podem ampliar permissões. Campos extras na resposta existente não quebram o consumidor antigo. Respostas parciais utilizáveis mantêm os estados indisponíveis explícitos; falha total retorna indisponibilidade, mantendo 401/403 para sessão/acesso. Referência alheia não revela existência de registro; filtro ou cursor malformado retorna erro de entrada.

A lista deve ordenar por data estável do recebimento/início e chave de desempate, paginando atividades antes de expandir seus itens. Mostrar inicialmente seis atividades em Hoje, 30 na lista e 50 produtos no detalhe, com limite máximo validado de 100 registros por página. Esses tamanhos de leitura não alteram limites da captura ou dos canais. Consultas permanecem limitadas à conta e ao conjunto solicitado, sem carregar todo o catálogo a cada atualização. Busca por referências e joins de dados novos também precisam funcionar sob RLS. Conta recebida por header/query é resolvida pela autorização existente no servidor, sem fallback silencioso para a casa. Trocar a conta cancela requisições antigas e limpa resultados, cursores e rascunhos do escopo anterior.

Nenhuma consulta de status inicia, reenvia ou acorda trabalho. Conferir também funções chamadas indiretamente pelo resumo: leitores de cache devem conservar sua semântica existente e não ganhar chamadas de IA, loja ou recomposição editorial por visita. Separar indisponibilidade de consulta de ausência de registros. Não omitir uma dimensão com falha e declarar “tudo pronto” a partir das outras.

Para atualização, reutilizar o acompanhamento visível já existente, com base de 20 segundos somente enquanto houver trabalho ativo a acompanhar. Hoje e detalhe compartilham uma leitura por escopo, sem intervalos duplicados. Pausar quando a aba ficar oculta, em repouso, em espera exclusivamente humana ou após falha de consulta; oferecer atualização explícita e retomar ao voltar/focar ou após uma ação conhecida. Para espera com prazo futuro, respeitar a próxima transição informada em vez de consultar fila vazia continuamente. Encerrar com uma leitura final após o trabalho terminar. A Curadoria deve usar a mesma fonte de progresso, deixando explícita a data da última leitura.

| Problema | Resposta visível e ação permitida | Proteção preservada |
| --- | --- | --- |
| Falha conhecida em parte das buscas | Mostrar fatos preservados e consultas faltantes; oferecer retomada quando o executor declarar segura | Reutilizar checkpoint/idempotência; não repetir consultas concluídas |
| Resultado de IA incerto | Abrir avaliações afetadas, evidência disponível e justificativa antes de liberar tentativa | Dono autorizado, custo possível, limite diário e trava de incerteza |
| Vínculo afiliado ausente | Abrir oferta exata e configuração da loja ou preparação de vínculo já suportada | Não prometer que recapturar resolve; não ativar conta, API ou publicação inativa |
| Credencial recusada | Abrir conexão da conta com mensagem sanitizada; mostrar ação de retomada existente quando aplicável | Sem revelar credencial ou liberar resultado incerto automaticamente |
| Conferência DOM pendente | Explicar a necessidade de navegador e apresentar a ação manual disponível | Sem iniciar sessão dirigida, ampliar permissão ou ativar planner |
| Cota, tentativa futura ou prazo esgotado | Mostrar motivo, horário conhecido e o que ainda pode ser usado | Sem zerar contadores, alterar limite ou reativar cron |
| Consulta indisponível ou worker sem confirmação de progresso | Distinguir dado não consultado, fila e execução; permitir consultar novamente e acessar diagnóstico | Não declarar worker saudável só porque há fila; não disparar nova operação para testar |

O servidor determina as ações permitidas e volta a verificar estado, conta, papel e identidade ao executá-las. Cliques repetidos, resposta perdida ou ação já resolvida não criam efeitos duplicados; estados superados retornam orientação para atualizar. Reutilizar ações existentes e seus registros de auditoria. Não retirar justificativa, lease ou verificação de revisão para simplificar um botão.

Corrigir o detalhe operacional sem liberar o workspace comercial inteiro: oferecer uma superfície de revisão sob Curadoria, reutilizando componentes autorizados e preservando `produto`, opção e `conta`; adaptar os links da Pauta, reconciliação e métricas. O detalhe deve explicar o bloqueio que motivou a navegação. Links comerciais continuam respeitando seu gate. Um redirect que perde o item não é um caminho de resolução válido.

Registrar para futuras falhas códigos sanitizados, etapa, horário, identidade de execução e certeza do resultado. Persistir esse diagnóstico junto ao estado correspondente, com erro conhecido separado de resultado incerto. Não gravar prompt, resposta bruta, segredos ou dados de sessão como justificativa de UX. As 13 ocorrências antigas continuam “resultado incerto; causa detalhada não registrada” quando essa for a evidência disponível; não inventar causa nem liberá-las na migração.

### 21.6 Sequência de implementação

Cada fase entrega uma capacidade observável e sua verificação. Os caminhos indicam pontos de partida, sem congelar a divisão final dos componentes. Ao iniciar a execução, reconciliar apenas mudanças de código/schema relevantes desde a auditoria; preservar trabalho local. Concluída uma fase, continuar a próxima dependência autorizada sem pedir confirmação por arquivo.

**Fase 1 — Restabelecer os caminhos de resolução e a semântica do motor ativo.**

- Corrigir os links operacionais que caem no gate de `/admin/ofertas`, preservando conta, produto e opção, e conferir navegação de volta.
- Expor acesso direto às avaliações incertas e separar seu contador das exceções editoriais.
- Em modo v2, retirar de Hoje as chamadas para iniciar a triagem antiga, notas/pendências legadas como instrução principal e afirmações de cron ativo sem estado comprovado. Conservar uma conta em modo legado com sua apresentação correta.
- Bases: `app/admin/curadoria`, `app/admin/ofertas/layout.tsx`, `app/pauta/pauta-client.tsx`, `today-command-center.tsx`, `curation-automation.ts` e `account-admin-shell.tsx`.
- **Saída verificável:** abrir uma oferta bloqueada e um job incerto a partir do painel chega ao item autorizado, sem alterar flags comerciais; o estado v2 não pede aprovação manual de todo o catálogo.

**Entrega local da fase 1 — 15/11/2026.** Pauta, avaliações incertas e métricas encaminham à nova rota `/admin/curadoria/ofertas/[id]`, com conta, opção quando fornecida, origem e canal. O detalhe consulta os seletores vigentes de WhatsApp/Stories em snapshot somente leitura e explica seus impedimentos sem preparar links ou edições. Uma opção solicitada diferente da atual é identificada e impede a conferência da opção errada. O gate comercial de `/admin/ofertas` permanece preservado.

Hoje e a abertura da Curadoria apresentam fila, execução e avaliações registradas do motor v2; avaliações incertas têm aba e contador próprios, separados das exceções editoriais. O histórico antigo está identificado como triagem anterior. A interface mantém a apresentação de contas legadas. A liberação de resultado incerto continua exigindo dono, conferência e justificativa, com aviso de possível novo custo.

**Provas e limites:** build web e TypeScript aprovados; testes de renderização de Hoje nos dois modos, detalhe e navegação aprovados; regressões de filtros, conexões, atualização de operação, workflow e seleção da pauta aprovadas. O ensaio `npm run test:operational-curation --prefix tools/editorial-tests` executa SQL/RLS real em PGlite isolado com papéis de runtime: conta sem rollout acessa seu produto bloqueado, 13 avaliações incertas coexistem com zero exceções editoriais, operador não libera nova tentativa e conta alheia/vínculo revogado são recusados. As leituras conservam jobs, observações, links e edições. Isso não substitui ensaio HTTP autenticado em PostgreSQL nativo nem conferência visual em navegador, pendentes no aceite integrado. Não houve migration, deploy, liberação de jobs reais ou alteração de agendamentos nesta fase. Histórico unificado de capturas, acompanhamento contínuo v2 e revisão completa do menu/indicadores continuam nas fases seguintes.

**Fase 2 — Integrar o recebimento e a rastreabilidade. Depende da fase 1.**

- Implementar o compositor de atividades com recibos da extensão, lotes API e identidades legadas demonstráveis; separar conferências internas.
- Enriquecer novos recibos de forma compatível e implementar a leitura conservadora dos antigos, incluindo diagnóstico de entrada e observações associadas quando comprovadas.
- Criar Capturas e seu detalhe com filtros, paginação e distinção entre resultado histórico e situação atual. Conservar bookmarks e rotas antigas por adaptação.
- Bases: `extension-db.ts`, rota `api/extension/capture-batches`, `capture-batch-db.ts`, `admin-db.ts`, `admin-run-groups.ts` e novas superfícies sob `app/admin/capturas`.
- **Saída verificável:** as nove importações do cenário de referência e o lote Shopee ficam localizáveis; 71 conferências posteriores não os escondem; replay não cria atividade ou observação extra. Novos e desconhecidos históricos usam contagens corretas.

**Entrega local da fase 2 — 15/11/2026.** `/admin/capturas` reúne recibos manuais, lotes e execuções/observações individuais quando essa é a identidade comprovada. Filtros por loja, origem, finalidade, situação, data em São Paulo e referência; paginação por cursor com data em microssegundos e desempate por referência, sem a janela antiga de 20 runs. Conferência de oferta e acompanhamento de preço têm finalidade própria e ficam fora da lista principal. O detalhe de um lote consulta todas as suas buscas por identidade, com paginação independente de produtos e buscas. Hoje mostra seis recebimentos recentes. O menu passa a oferecer Capturas; os controles e bookmarks de `/admin?aba=rodagens` e `captura-manual` permanecem acessíveis, com ligação ao histórico unificado.

O resultado privado dos novos recibos tem versão 2: conserva `productIds` e acrescenta loja, origem sanitizada, instante do navegador, IDs das observações, contagens de validação/criação/atualização e diagnósticos do servidor. A gravação permanece na transação dos fatos. Fingerprint, chaves dos itens e resposta antiga são preservados; a resposta recebe apenas campos aditivos `receiptRef` e `replayed`. Reenvio conserva o primeiro resultado, inclusive quando o diagnóstico recebido novamente é diferente. A extensão instalada não precisa de atualização ou pareamento novo.

Recibos novos usam os IDs gravados; antigos recuperam observações pela mesma derivação SHA-256 de `manualExtensionItemRequestId`, validada contra a função JS. Nunca se usa o último preço como fato daquela importação. O detalhe separa fatos associados do preço mais recente, preserva moeda/tipo de preço conhecidos, mostra lacunas e abre a oferta com conta, opção histórica e retorno aos mesmos filtros/páginas. Validação desconhecida e quantidade desconhecida de produtos novos permanecem `null`, apresentadas como “Não registrado”.

**Banco e limites de autorização.** Migração aditiva local `20261115234320_capture_activity_history.sql`: política de SELECT para donos/operadores ativos da mesma conta, inclusive recibos de dispositivos revogados; função de identidade `SECURITY INVOKER`; índices de histórico, associação a lote e procura de produtos em recibos. A escrita do dispositivo conserva a política anterior. Não há nova tabela de jobs nem backfill dos fatos. As leituras usam snapshot `REPEATABLE READ READ ONLY` com autorização revalidada. APIs `/api/admin/capturas` e `/api/admin/capturas/[reference]` são privadas, sem cache, com 401/403, entrada inválida 400, referência alheia/inexistente 404 e indisponibilidade 503. Antes da migração, a interface informa indisponibilidade em vez de inventar um histórico vazio. Atualização é explícita nesta fase; não há polling novo.

**Provas e limites.** Build web e TypeScript aprovados; 38 testes direcionados de apresentação, navegação, entrada, filtros, API, atualização e pauta aprovados, além dos ensaios SQL/RLS das fases 1 e 2 em PGlite isolado. `npm run test:capture-activity --prefix tools/editorial-tests` reproduz nove importações com 498 observações/397 produtos distintos, lote Shopee com 12 buscas/220 observações/216 produtos e 71 conferências posteriores; percorre todas as páginas, verifica replay imutável, recibo antigo sem observação demonstrável, preço posterior separado, dono/operador, dispositivo revogado e negação de conta alheia/vínculo revogado. Grants públicos e ausência de definer foram conferidos. Plano da consulta inspecionado com `EXPLAIN ANALYZE` e estatísticas atualizadas no banco de teste; não constitui medição de produção. Prévia dos componentes reais com dados sintéticos conferida no navegador, incluindo ausência de rolagem horizontal no detalhe em largura de celular. Essa prévia não demonstra a sessão Supabase nem a aplicação Next completa; ensaio HTTP autenticado em PostgreSQL nativo e jornada integrada continuam no aceite da fase 5. Não houve deploy, migração remota, chamada a loja/IA, liberação de job real ou alteração de agendamento. Andamento contínuo v2 e consolidação de problemas continuam na fase 3; revisão geral do menu/indicadores, na fase 4.

**Fase 3 — Unificar andamento, problemas e histórico atual. Depende da fase 2.**

- Integrar jobs v2, compatibilidade/reuso, promoções, vínculos e resultados de seleção ao compositor.
- Evoluir a API de operação e o acompanhamento da interface; atualizar Andamento e Problemas da Curadoria e seu histórico v2.
- Tratar falha parcial, cota, espera, resultado incerto e diagnóstico sanitizado com ações escopadas. Não aumentar disponibilidade externa para preencher uma lacuna da tela.
- Bases: `today-operation.ts`, `today-operation-db.ts`, `api/admin/operacao`, `curation-automation.ts`, `curation-attributes-db.ts`, `curation-attribute-worker.ts`, `curation-operations-metrics.ts`, histórico da Curadoria e ações existentes.
- **Saída verificável:** dois recebimentos concorrentes e uma falha não se apagam mutuamente; Hoje, detalhe e Curadoria concordam sobre cada dimensão e continuam corretos após recarga, fim do processamento e troca de conta.

**Entrega local da fase 3 — 16/11/2026.** O compositor `operation-progress-db.ts` usa o leitor comum `operation-processing-db.ts` para as dimensões de avaliação e preparação. `/api/admin/operacao` mantém `activities`, `issues` e `pauta` e acrescenta contrato v2 com conta/escopo, instante da consulta, disponibilidade por seção, problemas paginados e orientação de atualização. A leitura inclui todos os jobs abertos pertinentes à conta ou aos produtos solicitados; o último lote não substitui o trabalho originado em outros recebimentos. Distingue fila aplicável, espera futura/cota, execução com prazo válido, execução sem confirmação, resultado incerto, falha atual e revisão anterior. Histórico físico de avaliações não equivale a compatibilidade atual: a prova de compatibilidade/reutilização usa `has_current_curation_assessment`, com observação/opção e projeção correspondentes. Avaliação compatível não promete presença no canal.

Promoções têm fila, prazo, conexão, cota, conferência no navegador, execução, perda de confirmação e revisão superada separados. A disponibilidade de vínculo reutiliza as mesmas leituras e gates de destino da Pauta, na janela recente de 48 horas; a presença na seleção é outra dimensão. O status global lê a edição já preparada e sua revisão/validade sem reconstruir cache. Se ela ainda não for consultável, informa isso em vez de zero. O detalhe de produtos reutiliza o seletor somente leitura dos canais. Falha em uma seção/canal conserva as outras; o detalhe da oferta também preserva seus dados quando a avaliação ou um canal falha. As leituras novas não chamam lojas/IA, não preparam edições nem liberam tentativas.

Hoje, Andamento da Curadoria e a página corrente de produtos de uma captura usam o mesmo acompanhamento. Há uma requisição/timer por conta, conjunto de produtos e filtro compartilhados. Consulta de 20 segundos enquanto há trabalho a acompanhar, leitura final ao terminar, pausa em aba oculta, espera humana e falha, e consulta após prazo futuro conhecido. Fila sem mudança e sem execução confirmada pausa após três consultas consecutivas estáveis; atualização explícita, foco/retorno ou operação conhecida retomam a leitura. Respostas são validadas em runtime; assinatura de escopo e cancelamento impedem que resposta tardia da conta anterior substitua a atual. A tela não declara “Tudo pronto” com base só na pauta.

**Problemas e histórico.** Curadoria oferece filtro e paginação de 30 problemas, incluindo avaliações incertas além da antiga janela de 20. Os controles existentes de liberação continuam exclusivos do dono, com conferência/justificativa, validação de estado e custo possível; a retomada após credencial Shopee mantém sua ação e corte temporal originais. Operadores consultam a situação sem ganhar liberação de tentativas. Item, opção, conta, filtro e página são preservados no retorno. O histórico v2 pagina estados dos jobs, mudanças da seleção e, para o dono conforme a RLS existente, liberações auditadas; a liberação não é apresentada como execução já iniciada. A triagem anterior continua identificada e uma falha na sua leitura não impede o histórico v2.

**Correção encontrada na revisão.** Uma falha na contagem do motor não pode impedir toda a Curadoria nem acionar a apresentação de triagem antiga como fallback. O shell mostra contagem indisponível, mantém a navegação e a página oferece o status parcial e nova consulta. O detalhe da oferta usa a mesma leitura atual de execução e não chama uma lease vencida de avaliação em andamento. Esses dois comportamentos têm regressões de apresentação e SQL específicas.

**Persistência e pacote.** Migração local aditiva `20261116195549_curation_operation_diagnostic.sql`: diagnóstico JSON privado em `curation_attribute_job`, índice para histórico e limite efetivamente configurado pelo worker em `curation_external_budget`. O worker registra somente etapa, categoria/código controlados, instante e certeza; não copia mensagem/cause/body, prompt, resposta ou segredo. Falha de readiness anterior à chamada é `not_started`; resposta/commit incerto e perda de prazo preservam a trava e a classificação conservadora de incerteza. Ocorrências antigas sem diagnóstico continuam desconhecidas, sem backfill inventado. O limite observado é gravado pelo worker sem alterar consumo; a web não presume conhecer a configuração do executor a partir de seu próprio ambiente. Worker antigo/schema anterior continuam compatíveis pelos guards de coluna. Eventual publicação inclui web e o processo de atributos efetivamente alterado, sem habilitar flags, cron ou outro executor.

**Provas e limites.** TypeScript e build web aprovados; 56 testes direcionados de observação, resposta/UI, falha de contagem, filtros/retornos, recebimentos, provedor, workflow e pauta aprovados. Cinco ensaios de integração SQL/RLS em PGlite isolado passaram: fases 1, 2 e 3, T01/T02 v2 e regressão de jornada T03–T08. O ensaio `npm run test:operation-progress --prefix tools/editorial-tests` verifica coexistência de dois recebimentos com lote parcial, reutilização de avaliação comprovada pelo gate real, cota registrada, espera de configuração/navegador, lease expirada, diagnósticos sanitizados, 37 resultados incertos em duas páginas, falha injetada em um canal sem perda das outras leituras, histórico e liberação única auditada, operador/conta alheia/vínculo revogado e conservação de fatos/edições/orçamento pelas consultas. A concorrência de rede é coberta no observador por respostas atrasadas e cancelamento; isso não substitui ensaio de múltiplas sessões em PostgreSQL nativo nem a jornada completa com sessão Supabase/navegador, que continuam no aceite da fase 5. Não houve migração remota, deploy, liberação de jobs reais, chamada paga ou reativação de agendamento. Reorganização geral de Hoje/menu/indicadores permanece na fase 4.

**Fase 4 — Entregar Hoje, navegação e indicadores coerentes. Depende das fases 2 e 3.**

- Montar Hoje conforme o esboço, substituindo a abertura carregada de bancada e controles técnicos.
- Implementar o menu por tarefa/capacidade, com configurações claras e caminhos antigos preservados.
- Reconciliar saúde das quatro lojas, modalidade manual/API, produtos recebidos, elegibilidade e seleção real por canal. Remover o uso de catálogo aprovado como “ofertas na pauta”.
- Reorganizar a ligação da Pauta com atividades, mantendo canal, preparação, validade e confirmação manual; conferir todos os links de resolução.
- Bases: `admin-shell.tsx`, `account-admin-shell.tsx`, `admin-navigation.ts`, `app/admin/page.tsx`, `platform-status.tsx`, bancada, configurações/onboarding e `pauta-client.tsx`.
- **Saída verificável:** percorrer a jornada exige decisões de negócio e ações identificáveis; IDs, leases, modos de executor e histórico GitHub ficam em diagnóstico secundário. Desktop e mobile mantêm leitura e ações utilizáveis.

**Entrega local da fase 4 — 16/11/2026.** Hoje passa a abrir com conta/hora da consulta, processamento e pendências acionáveis, pauta independente por canal, seis recebimentos recentes e as quatro lojas/atalhos. Loja distingue disponibilidade manual/API, configuração afiliada, produtos com preço observado nas últimas 48h, aprovação no catálogo e seleção efetiva por canal; o resumo não recompõe pauta nem confunde catálogo aprovado com seleção. Os dados compartilham o observador da fase 3, incluindo retomada, erro e repouso. O menu principal da casa reúne Hoje, Capturas, Curadoria, Pauta e Resultados; Configurações é explícito, Conteúdo/Ferramentas avançadas ficam recolhidos. A navegação comercial existente permanece com seu gate. Capturas leva aos controles anteriores sem exigir passagem por Curadoria. Configurações e conexões retornam à conta certa. A Pauta liga ao histórico real de recebimentos e identifica sua lista de produtos recentes separadamente; a cópia, preparação e confirmação manual continuam válidas.

A seleção de conta na URL é propagada pelo middleware para os layouts, que não recebem searchParams, e continua sujeita à sessão/membership no servidor. Um cabeçalho vindo do cliente é removido antes dessa propagação; conta alheia ou seleção ambígua não é aceita. Links de navegação preservam explicitamente a conta, sem depender só do cookie.

**Fase 5 — Verificar a jornada e preparar a publicação. Depende das fases anteriores.**

- Executar os cenários da seção 21.7 com serviços reais em banco descartável e verificar a interface no navegador; corrigir os defeitos encontrados no mesmo objetivo.
- Preparar migração, pacote web e eventual alteração compatível da extensão, identificando exatamente os serviços afetados e o retorno seguro. Worker só entra no pacote se houver diagnóstico/persistência alterados nele.
- Atualizar o manual operacional com o fluxo final e uma orientação curta para cada falha recuperável; substituir a recomendação de terminal/triagem antiga na rotina vigente, preservando histórico técnico identificado.
- **Saída verificável:** entrega local integrada, esboços substituídos por telas verificadas, verificações registradas e pacote revisável para o destino autorizado. Publicação efetiva e aceite remoto são registrados separadamente.

**Entrega local da fase 5 — 16/11/2026.** Foram exercitados Next real, SDK Supabase instalado com Auth sintético em loopback e PostgreSQL 17.12 nativo descartável, com baseline/ACLs e papéis restritos. A jornada interativa percorreu login, Hoje, filtro Amazon, recibo, oferta e retorno ao mesmo filtro, troca A→B→A sem dados anteriores, pauta pronta e preparação/cópia, configurações e conexões. Hoje e filtros foram conferidos em viewport 390px por DOM/dimensões; menu/Enter/Escape e retorno de foco funcionaram, sem controles fora da largura. Não houve aparelho físico; a captura automatizada de imagem em viewport emulada teve limitação do navegador, identificada no registro de provas. O screenshot desktop usa somente dados sintéticos.

A homologação encontrou e corrigiu dois defeitos que os testes anteriores não mostravam: **operador via zero jobs incertos** por RLS privativa do dono, e **página do recibo abria 404** porque o parâmetro chegava codificado no transporte da página, diferentemente do handler da API. A expansão `20261117003000_curation_operation_reader.sql` entrega projeção mínima somente leitura a dono/operador, revalida vínculo/role ativa e conserva job bruto, prompts, worker id e liberação/auditoria privativos. Sem a expansão, o operador recebe indisponibilidade, não zero. A referência de path é normalizada uma vez e passa pela validação de identidade; dupla codificação continua recusada. A reprodução HTTP agora confere também o digest de not-found do stream Next, além do HTML, e a abertura interativa confirmou o recibo Amazon e seu retorno.

**Provas:** 88 testes direcionados de UI/observação, sessão, conexão, conta, contratos e pauta; integração nativa de recebimentos (9 importações / 498 observações / 397 produtos; Shopee 12 buscas / 216 produtos após 71 conferências), andamento/permissões/compatibilidade, T01/T02, jornada T03–T08 e concorrência de pauta em sessões independentes. HTTP real adicional verifica pareamento/protocolo v1, repetição idêntica, conflito de fingerprint, diagnóstico 53→35/18 e revogação. O teste HTTP da jornada comprova pauta preparada nos dois canais ao lado de 13 resultados incertos, contagens por loja e vencimento sem recomposição, rotas/detalhes autenticados, conta da URL/cabeçalho falsificado, operador/alheio/revogado e conservação de fatos/jobs/orçamento/publicações/edições nas leituras. As avaliações e conexões são fixtures; isso não é prova de loja, modelo ou Supabase hospedado. A referência de publicação e retorno está em [publicacao-revisao-operacional.md](publicacao-revisao-operacional.md); o registro compacto está em [operacao-fases4-5.json](../implementation/evidencias/operacao-fases4-5.json).

**Preparação e limite:** três expansões aditivas, fonte verificável de web/executor, manifesto por arquivo e retorno conservador; extensão sem atualização obrigatória. O manifesto inclui o checkout atual, não apenas HEAD. A etapa remota ainda precisa confrontar schema/digests/ACLs reais, aplicar somente expansões pendentes e registrar aceite humano. Não houve push, deploy, migração remota, chamada paga, envio real ou reativação de cron. O pacote não certifica autonomia permanente da operação.

### 21.7 Verificação e critérios de aceite

Usar os testes existentes de captura durável, extensão manual, provedor/curadoria, pauta/cache, sessão e isolamento. Acrescentar cenários de integração que comparem fatos gravados, leituras autenticadas e saída visível, sem espelhar a implementação. O banco descartável deve reproduzir baseline e ACLs relevantes com papéis de runtime; nunca usar `.env` de produção para os ensaios. Typecheck e build são necessários às partes alteradas, mas não substituem a jornada.

| Cenário | Prova exigida |
| --- | --- |
| Três importações por loja manual e um lote Shopee | Recibos, lotes e detalhe identificáveis; quantidades de observações/produtos corretas, inclusive reencontros entre páginas |
| Conferências posteriores excedem a janela de 20 runs | Captura solicitada continua localizável; finalidade das conferências é explícita; paginação não corta buscas filhas de um lote |
| Reenvio, resposta perdida e extensão antiga | Mesma identidade, nenhum fato/atividade duplicado, nenhuma perda de pareamento e fingerprint preservado |
| Avaliação nova, compatível reaproveitada e job substituído | Estado e contagem sem nova chamada indevida; conclusão não depende da aba aberta; ausência de prova aparece como desconhecida |
| Lote parcial, 13 resultados incertos e vínculo ausente | Dimensões separadas; ação abre itens certos; recuperação segura conserva fatos e não repete efeitos incertos; evidência antiga não ganha causa inventada |
| Oferta fora do corte ou com validade encerrada | Motivo correto por canal; leitura não publica, reavalia ou renova preço; aprovação não aparece como seleção garantida |
| Pauta pronta com fila ainda ativa | Os dois estados aparecem simultaneamente; falta de consulta em um canal não zera ou oculta o outro |
| Fechar, reabrir, voltar à aba e mudar de conta | Histórico persistido, leitura atualizada, sem resposta tardia da conta anterior nem rascunho vazado; acesso direto negado à conta alheia |
| Dono, operador, vínculo revogado e conta sem rollout comercial | Leitura e ações obedecem permissões reais; dono acessa resolução operacional sem habilitar área comercial; operador não ganha liberação privativa do dono |
| Falha de rede/banco, espera humana e repouso | Sem falso “tudo pronto”, fila vazia ou worker ativo; consulta limitada, pausa em aba oculta e ausência de polling ocioso |
| Links antigos, filtros, detalhe e retorno | Conta/produto/opção preservados; nenhum ciclo de redirect ou retorno genérico que perca o item |
| Desktop, mobile e teclado | Filtros e tabelas utilizáveis, foco e rótulos claros, ações visíveis sem depender de cor; atualização de status não rouba foco nem anuncia cada poll |
| Suspensão dos agendamentos | Nenhum `schedule` restaurado, flag ou executor equivalente habilitado; workflows continuam desativados após eventual publicação |

Nos ensaios locais, usar provedores controlados e contagem de chamadas para provar que abrir Hoje, filtros, detalhes e Pauta não inicia efeitos externos. Recuperação com mutação é exercitada no ambiente descartável; resultados incertos reais não são liberados como teste. No destino, priorizar leitura das operações já existentes. Uma captura ou chamada real adicional só integra o aceite se sua operação e destino estiverem autorizados; envio real não é necessário para homologar este painel.

O aceite do responsável deve percorrer: entrar em Hoje, reconhecer as capturas, abrir uma operação, entender trabalho em andamento, localizar um problema e seu item, conferir a pauta e repetir a consulta após sair e voltar. Registrar os passos que ainda exigirem chat e classificá-los como defeito de informação, caminho indisponível ou decisão administrativa legítima. Não declarar autonomia operacional apenas porque o menu ficou menor.

### 21.8 Integração no destino e conclusão

**Publicação autorizada e concluída — 17/11/2026, 00:20 (São Paulo).** As três expansões aditivas foram ensaiadas em cópia privada do banco real e aplicadas numa transação, preservando fatos, recibos, jobs e consumo de orçamento. O contexto `contexts-operation-20261117T030142Z` publicou somente web e executor BizuMiner; ambos saudáveis, arquivos privados de configuração preservados e os outros 14 serviços nos mesmos containers. Os três workflows continuam `disabled_manually`, sem execuções pendentes ou em andamento. As provas de imagem com o login restrito real, operador somente na cópia, conta alheia, jornada autenticada, recibo/oferta/retorno, WhatsApp/Stories e viewport móvel estão no [registro de publicação](publicacao-revisao-operacional.md#aplicação-e-conferência-em-produção--17112026) e no [recibo remoto sanitizado](../implementation/evidencias/operacao-publicacao-20261117.json). O backup e as imagens anteriores foram conservados; a cópia de ensaio foi removida. Não houve push, envio a clientes, liberação de avaliações incertas nem teste com chamada paga/captura externa. A configuração anterior do executor foi retomada, sem nova ativação. **Publicação e conferência técnica concluídas; aceite humano de uso/autonomia ainda pendente.** Os textos de preparação abaixo e das entregas locais acima conservam as condições nas respectivas datas.

Antes de publicar, identificar a revisão completa do checkout, o schema aplicado, a versão da extensão instalada e os consumidores afetados; HEAD isolado não representa todas as alterações locais. Comparar o pacote com a versão em produção, preparar backup e manter a reversão das imagens. Aplicar expansão compatível de schema antes dos leitores que a exijam; durante a transição, leitores distinguem versão antiga de ausência de dados. Publicar o web e apenas os outros serviços realmente modificados. Não alterar PostSpark, infraestrutura, DNS ou outras aplicações.

O pedido de plano não autoriza deploy, migração remota, novas chamadas pagas ou captura externa. Preparar a implementação e suas evidências antes de qualquer aprovação final que ainda falte; autorizações já existentes continuam vinculadas à operação e ao destino, sem nova confirmação por arquivo. A futura execução autorizada pode ajustar detalhes técnicos dentro deste escopo, registrando a decisão neste documento.

O retorno seguro reverte leitores/imagens compatíveis e conserva colunas/metadados aditivos, recibos, observações, avaliações, jobs e confirmações. Não executar down migration destrutiva, fabricar status de sucesso, resetar orçamento ou reativar produtor antigo. Conferir explicitamente os agendamentos suspensos antes e depois da publicação.

Checklist de conclusão desta revisão — aceite local das fases 1–5; publicação e aceite humano no destino continuam separados:

- [x] As quatro fontes têm recebimentos localizáveis e detalhes que sobrevivem à recarga, com contagens e lacunas históricas honestas.
- [x] Hoje, Curadoria e Pauta usam estados coerentes do motor ativo, com disponibilidade e problemas independentes.
- [x] Todo problema apresentado tem explicação, item/contexto e próximo passo permitido; ações incertas conservam suas proteções.
- [x] Navegação, configurações e indicadores correspondem à tarefa e à capacidade da conta; rotas antigas não perdem contexto.
- [x] Jornada, falhas, concorrência, permissões, repouso e mobile foram verificados nas superfícies alteradas, com limites de prova registrados.
- [x] Manual final, pacote, migração quando necessária e retorno seguro estão atualizados; nenhuma rotina suspensa foi reativada.
- [x] Estado local, estado publicado e aceite humano estão separados na entrega. Somente capacidades efetivamente demonstradas são marcadas como concluídas.

## Registros históricos anteriores a esta revisão

Os registros abaixo preservam o estado e as autorizações de suas datas. Onde divergem das seções 1 a 20, prevalece a revisão de 13/11/2026 para a nova implementação. O acompanhamento de formação por tempo, a seleção congelada sem renovação no backend e as fontes legadas são exemplos de regras substituídas; histórico, vetos, isolamento e execução durável continuam protegidos.

**Criado em:** 05/10/2026. **Atualização e revisão:** 01/11/2026. **Estado atual:** código web/worker sincronizado no GitHub, web publicada e nova migration aplicada em produção em 01/11/2026, após autorização explícita. A primeira ativação editorial permanece pendente: nenhum canal configurado e nenhuma opção factual confirmada no novo modelo. Os critérios iniciais são conservadores e ajustáveis; conversão e cobertura real precisam ser acompanhadas em operação.

O BizuMiner deve procurar candidatos alinhados ao seu público, avaliar se merecem indicação e preparar ofertas específicas para cada destino. WhatsApp e Stories de indicação devem concentrar as recomendações mais fortes; a página inicial pode oferecer uma seleção mais ampla. Os destinos podem partir da mesma base de evidências e critérios, sem receber obrigatoriamente os mesmos produtos ou a mesma ordem.

**Como ler este documento:** o registro de implementação abaixo atualiza o estado e explicita como a direção revisada foi integrada. A revisão intermediária e os registros anteriores preservam a evolução do objetivo. A autorização posterior para implementar encerrou a pausa; a publicação foi autorizada e concluída no registro abaixo. Envios a clientes não foram executados. Não executar as fases antigas como outro plano em paralelo.

## Implementação autorizada e verificação — 01/11/2026

O usuário autorizou implementar o plano na íntegra após a revisão. O trabalho foi integrado na base local existente, preservando as melhorias anteriores de navegação, autenticação e rascunhos. Não houve push, deploy, migration remota, ativação de descoberta, mudança de curadoria em produção ou envio a clientes nesta implementação.

### Capacidade entregue

- Home, WhatsApp e Stories têm configuração, escolha manual ou automática, ordem, vigência e versão próprias. A leitura pública usa edições preparadas e elegibilidade atual; não compõe a pauta a cada visita. A mesa lê os três canais em uma consulta de projeção, sem abrir três transações independentes para o diagnóstico.
- WhatsApp/Stories exigem avaliação forte ou excepcional em público, utilidade, valor, confiança e clareza, sem dúvidas essenciais, com preço exato em BRL e opção confirmada. A home admite exploração mais ampla de aprovados, preservando veracidade. Canais diretos sem configuração não recebem preenchimento pelo ranking legado.
- Os limites iniciais são **tetos ajustáveis, não metas**: home 24, WhatsApp 12 e Stories 8; até duas opções da mesma família na home e uma na indicação direta. Intervalo inicial entre divulgações: 72 horas por canal. Uma nova observação comparável, posterior à divulgação e pelo menos 5% mais barata, pode justificar retorno antecipado. Os parâmetros estão na mesa; não são probabilidades de compra nem calibração comercial comprovada.
- A confirmação factual registra opção, quantidade, conteúdo, vendedor/tamanho, preço, moeda, condições, origem e instante. `NA` exige afirmação explícita de inaplicabilidade; ausências não são completadas. A nota de conferência fica privada e separada da identidade material. Reconfirmar apenas preço/data não exige refazer todo o mérito; mudar configuração, frete, cupom ou outras condições materiais exige revisão.
- Detalhe, link curto, saída afiliada, pauta, preview e Story preservam a opção escolhida. Quantidade/composição e condições aparecem também nas artes. Quando não cabem completas, a imagem explicita que há condições/composição a consultar. A loja pode abrir sem a opção pré-selecionada; o detalhe informa qual selecionar, sem prometer uma capacidade que a fonte não fornece.
- O histórico mantém os registros anteriores e compara somente configurações conhecidas compatíveis na janela de 90 dias. Preço estável forma série; faixa e opção desconhecida não viram pontos exatos retroativamente. A página distingue registros totais, comparáveis e exclusões. A promessa pública passou a mencionar histórico comparável quando disponível.
- A gravação distingue opções na mesma rodada. Repetições idempotentes preservam as observações; uma resposta agregada não herda a certeza nem a data da opção conferida. A transição A→B→A mantém a observação atual correta. O escritor reconhece os esquemas anterior e novo.
- Acompanhamento independe da vitrine. Aprovados continuam elegíveis fora dela; retidos por preço, falta de evidências ou dado antigo podem receber prioridade de formação quando há mérito/interesse. Essa formação compartilha a reserva de 10% de candidatos/histórico, sem retirar a prioridade dos alertas. Rejeições humanas não são reabertas por queda de preço. Candidatos novos sem interesse deixam a formação após 14 dias da primeira entrada, sem renovar esse prazo a cada captura.
- Descoberta é opt-in por conta e fonte suportada, dentro do orçamento existente. Uma busca rotativa por rodada tem limite próprio e auditoria separada; produto novo entra pendente. Não foram reativadas fontes restritas nem aumentado o orçamento total.
- Copiar/abrir não confirma envio nem compra. A declaração explícita de divulgação é idempotente, por canal e edição, inclusive uma edição preparada anteriormente nos últimos sete dias. O intervalo passa a valer na leitura mesmo antes da próxima preparação. Se a preparação falhar após salvar a declaração, a interface distingue registro salvo e atualização incompleta.
- Rascunhos permanecem em memória e por conta. Novas evidências preservam o texto e exigem reconhecimento antes de salvar outra revisão. Links da fila permitem reconferir produtos fora da janela recente; abrir a revisão não atualiza o preço nem os aprova.

### Evidências reais e limites das fontes

Duas consultas somente leitura às APIs oficiais em 01/11, entre 19:53:52 e 19:53:54 UTC, confirmaram a dependência: a Shopee retornou faixa, moeda não confirmada e variante desconhecida; a AliExpress retornou BRL, tipo de preço desconhecido e variante desconhecida. Nenhuma entregou conteúdo/quantidade suficientes para aquela opção. Foram duas chamadas e nenhuma gravação remota. Isso não representa toda a capacidade de cada marketplace.

Uma amostra pública de 24 produtos, nesta implementação, teve zero séries com pelo menos duas observações comparáveis; 20 tinham preço não exato e quatro moeda não confirmada. São diagnósticos priorizados, não categorias independentes nem medida de todo o catálogo. O diagnóstico de acompanhamento, às 20:44 UTC, encontrou Shopee com 120 acompanhados/5 vencidos e AliExpress com 148/43, antes das supressões e dos limites de seleção. Mercado Livre permanece no caminho humano. Coletar mais respostas agregadas não resolve por si só a comparabilidade.

O caminho de confirmação/reconferência pelo editor está implementado. A API agregada mantém a data real da conferência específica e não a substitui. Opções vencidas saem da indicação até nova evidência apta. Não foi demonstrada reconferência automática de opção completa pelas duas APIs testadas. A formação contínua de uma série específica exige esse caminho suportado ou conferências factuais posteriores. Não houve aprovação comercial de um produto real nem estimativa validada de compra; os níveis iniciais continuam sujeitos à avaliação editorial e aos resultados observados.

### Verificação realizada

- **700 testes de unidade** aprovados: web 527, persistência 47 e captura 126; TypeScript nos três pacotes e build otimizado aprovados.
- **43 cenários de integração**: 21 da nova política em PostgreSQL 17.6 descartável; 17 de compatibilidade em PGlite e cinco da rotina anterior em PostgreSQL nativo. Os testes históricos chamam explicitamente o caminho legado; não aprovam suas antigas quotas como política atual.
- Os cenários novos cobrem isolamento/RLS e permissões, opção parcial bloqueada, várias variantes/idempotência, reconsulta agregada, série estável, canais independentes, escolha vazia, expiração, divulgação de edição anterior, intervalo imediato e retorno por melhora comparável, mudança de condição material, concorrência e rollback atômico.
- Navegação verificada com sessão normal e banco exclusivamente descartável: escolha/reordenação por nome, preço reconferido, recuperação do rascunho, canais e marcadores de cópia independentes, confirmação explícita e retirada no canal correspondente. A checagem de largura isolada não foi tratada como aprovação visual. A captura de página inteira mostrou-se distorcida; a captura normal e a geometria real da fixture visual confirmaram cartão com a largura disponível, botões em linha e alvos de toque de 44 px. Foram reforçadas a largura do contêiner e a quebra do cabeçalho. A fixture visual usa dados estáticos e não acessa contas ou ofertas reais. Na conferência final: viewport de 375 px/cartão de 343 px e desktop de 1280 px/painel da pauta de 480 px, com zero erros/avisos de console. A captura nativa da viewport, e não a captura de página inteira, foi usada como prova visual. Nenhuma autenticação foi desabilitada e a rota auxiliar da fixture não faz parte da candidata.
- HTTP local conferiu link curto interno, preservação da saída afiliada e detalhe com quatro pontos comparáveis sintéticos. Story 1080×1920 e preview 1200×630 responderam 200 e foram inspecionados visualmente, com opção, composição, preço e condições. A foto da fixture é propositalmente indisponível: o preview marcou `fallback` e TTL zero; isso não é evidência de cache pronto ou de correspondência de uma fotografia real.
- A automação do navegador deixou de responder na última repetição autenticada; o inventário mostrou páginas de entrada. Essa repetição autenticada não foi contada como aprovada. Após o usuário abrir a fixture visual, foi possível concluir a conferência do layout sem acesso ao banco. As últimas proteções também foram verificadas no PostgreSQL nativo e no build. O conteúdo da área de transferência não foi confirmado; foram conferidos o marcador da interface, o destino e a ausência de evento de divulgação/clique ao copiar.

### Integração externa publicada — 01/11/2026

Após a autorização da candidata e a retomada depois da queda de energia, foram reconstruídas as fontes em um diretório isolado, excluindo segredos, arquivos temporários e alterações documentais alheias. A fonte Git efetivamente publicada passou novamente pelos 700 testes, 43 cenários de integração, TypeScript dos três pacotes e build otimizado. As melhorias de desempenho e a base de marketing já publicadas foram preservadas.

- **GitHub:** `ManyRagDev/bizuminer`, `main`, commit de código `e0ee7c50d245503bf853e7a9c557d377508f72c7`. A atualização usou comparação com o HEAD anterior, sem force push. O worker agendado agora lê esse código; seu planejamento foi executado somente em leitura contra o banco real, sem chamadas aos marketplaces ou gravação de observações. Uma rodada agendada posterior com esse commit ainda não foi observada nesta publicação.
- **Vercel:** projeto `web`, equipe `emanuels-projects-aa92a126`, deployment `dpl_FNWGZ6i2MaAzYeJCtHLPE41yKrsj`, região `gru1`, build `READY`. A candidata foi construída como produção com atribuição automática de domínios temporariamente suspensa, conferida pela sessão autenticada e promovida a `www.bizuminer.com.br`. O mapeamento do domínio foi conferido e a atribuição automática foi reativada. A proteção das URLs de deployment foi preservada.
- **Supabase:** projeto `spbuwcwmxlycchuwhfir`, arquivo `20261101193221_improve_editorial_recommendations.sql`, registrado remotamente como `20261101221820_improve_editorial_recommendations`. SHA-256 do arquivo: `04da7e6e57c2c93cf9c0356372bf3371aa1335546651102bf1bb8055052c2701`. A primeira tentativa encontrou uma leitura longa e sofreu rollback integral por `lock_timeout`; após seu encerramento, a mesma migration foi aplicada. Não havia capturas/Actions antigos em andamento. Os escritores compatíveis foram publicados antes da troca do índice.
- **Integridade:** 11.096 observações antes e depois, nova unicidade `(capture_run_id, product_id, option_key)` conferida. As seis tabelas novas têm RLS e não permitem leitura direta por `anon`, `authenticated` ou runtime público. O advisor de segurança não apontou achados no schema `garimpa` antes/depois.
- **Conferência real:** home e detalhe públicos, mesa autenticada com os três canais e pauta WhatsApp foram acessados na versão publicada. A home respondeu 200 em 2,37 s e o detalhe em 0,27 s em amostras pontuais após a migration; não são percentis nem metas de desempenho comprovadas. A API de pauta sem sessão manteve 401. O servidor de desenvolvimento foi restabelecido em `http://localhost:3100`.

**Instabilidade observada:** ocorreram timeouts da conexão e do Supabase Auth durante a publicação, inclusive antes da nova versão. Uma troca para Stories excedeu o limite de 25 s do middleware. Os logs do serviço de autenticação registraram respostas 500/504 e falha de conexão ao PostgreSQL; a projeção de Stories pela conexão da aplicação retornou em 207 ms. Isso distingue a falha da dependência de autenticação do tempo da projeção, sem demonstrar a causa operacional final da instabilidade. Não houve mudança de credenciais, ampliação de permissões, reinício do projeto ou enfraquecimento da autenticação para contornar o problema.

**Condição editorial atual:** zero canais configurados, zero edições novas e zero opções factuais confirmadas. O controle antigo habilitado não ativa a nova política. Home mantém o catálogo de transição; indicação direta não é preenchida pelo ranking legado. A primeira edição exige conferir opções/preços/condições reais, revisar o mérito e salvar explicitamente a configuração de cada canal. Não houve aprovação comercial de produtos, ativação arbitrária de descoberta, aumento de orçamento ou envio a clientes.

A detecção de schema do escritor é por instância; processos anteriores devem ser encerrados na transição. A reversão preserva o histórico e mantém um escritor compatível com a nova unicidade, em vez de restaurar o escritor antigo. A descoberta permanece opt-in e sujeita às capacidades e restrições de cada fonte.

## Plano intermediário da pauta melhorada — 01/11/2026

**Documento aberto para novos insumos.** A revisão consolida o que já foi alinhado, confere dependências no código e organiza a futura execução. Arquitetura, pesos, limites, cadência, escolha de modelo e autonomia ainda serão especificados dentro dessa direção; os ajustes de calibração não reabrem automaticamente os princípios abaixo.

### Decisões consolidadas na revisão

- WhatsApp e Stories de indicação recebem as recomendações de maior exigência editorial para o público geral de achadinhos. A home permite exploração mais ampla; todos os destinos preservam informações verdadeiras e segurança.
- A indicação deve explicar uma opção de compra identificável e seu preço/condições conhecidos. O menor valor de um anúncio só representa a indicação quando corresponder à opção escolhida.
- Acompanhamento, descoberta e exposição têm responsabilidades distintas. Um produto relevante que sai da vitrine por preço ou momento deve continuar elegível ao acompanhamento; permanecer acompanhado não exige divulgação repetida.
- O histórico sustenta afirmações de preço quando comparável. Ausência de série, isoladamente, não prova que o produto seja ruim; quantidade de registros, isoladamente, não comprova um histórico útil.
- Renovação prioriza a força da indicação e a validade da oferta. Não exige uma quantidade fixa de substituições nem torna as metas antigas de seis trocas/dia e retorno em 48 horas regras aprovadas.
- A discussão trata de preparar e escolher indicações. A publicação da nova política e qualquer envio a clientes não são autorizados por esta revisão documental.

### Objetivo funcional e direção já alinhada

Preparar uma pauta de indicações com o maior potencial de compra possível para o público geral de achadinhos, combinando interesse do público, mérito do produto, oportunidade da oferta, confiança e clareza. O usuário considera os participantes dos grupos um público já interessado em comprar; a escolha de cada oferta ainda precisa corresponder aos interesses desse público.

| Destino | Direção editorial alinhada | A esclarecer |
|---|---|---|
| Grupos de WhatsApp | Indicações mais fortes e específicas, prontas para apresentar diretamente aos interessados | Segmentação dos grupos, quantidade e frequência de envio |
| Stories de indicação | Mesmo nível elevado de exigência editorial; benefício e oferta precisam ser compreendidos rapidamente | Se compartilham exatamente o conjunto do WhatsApp ou têm escolha própria por formato |
| Página inicial | Leque mais amplo para descoberta e exploração, preservando informações confiáveis | Relação entre destaques principais, grade e seleção de envio |
| Conteúdos e exemplos a publicar | A escolha também precisa servir ao propósito do conteúdo | Quais conteúdos são abrangidos por “exemplos” e como se relacionam com a indicação comercial |

A pauta não deve ser uma cópia obrigatória dos 24 produtos da home. A direção discutida é aumentar a exigência conforme a força da recomendação e o contexto de exposição. Ter informação completa, aparecer recentemente ou ter preço baixo, isoladamente, não comprova que o produto seja uma boa indicação.

### O que entendemos por qualidade nesta discussão

Separar três avaliações relacionadas:

1. **Produto:** desejo, utilidade, benefício concreto e adequação ao público.
2. **Oferta:** configuração, quantidade, preço e condições que tornam aquela compra interessante naquele momento.
3. **Indicação:** por que essa oferta merece aquele espaço, naquele canal, considerando alternativas e exposição recente.

Confiança e clareza sustentam essas avaliações. Dado ausente permanece desconhecido; não equivale automaticamente a produto ruim. Precisamos distinguir a dúvida que muda materialmente a compra de um campo sem relevância para aquela família. Essa classificação ainda será alinhada, preservando as proteções existentes enquanto não houver uma decisão e uma validação explícitas.

“Maior probabilidade de compra” é o objetivo de seleção. Sem compras atribuídas e dados suficientes para validar uma estimativa, o sistema deve tratar os sinais disponíveis como indícios de mérito e interesse, sem apresentar uma porcentagem de conversão inventada. Cliques, cópias de link, favoritos, vendas declaradas pelo marketplace e compras atribuídas têm significados diferentes.

### Problema confirmado: faixa de preço e perda de especificidade

Na averiguação pública de 01/11/2026, **8 dos 24 produtos retornados pelo catálogo** apresentavam faixa de preço. É uma amostra daquela consulta, não uma contagem permanente de todo o acervo. Exemplo: o anúncio “Kit 10 Saco a Vácuo Mix Roupa Organizador Mala Viagem Guarda Roupa M G GG 50x60 60x80 70x110” (`shp-23394279813`) retornou `43,50 a 66,99`, sem associação de cada valor a uma configuração. A moeda não estava confirmada nesse retorno; não assumir BRL por essa observação isolada.

O código atual distingue preço exato, faixa, “a partir de” e desconhecido. Na captura Shopee examinada, mínimo e máximo pertencem ao anúncio e a identidade da variante permanece desconhecida. Na pauta, título, imagem e preço não oferecem navegação; existe a ação de copiar o link. Isso transfere ao operador e ao comprador parte da investigação sobre o que está sendo indicado.

Direção para o desenho da oferta específica:

- Associar a indicação a uma **opção identificável de compra**, com configuração/variante, quantidade, conteúdo relevante, moeda, preço observado, condições materiais, fonte e data. Os campos necessários variam com o produto; isso ainda será definido.
- Usar o menor preço como principal quando ele corresponder à opção editorialmente recomendada e estiver confirmado. Não substituir uma faixa pelo mínimo apenas para tornar o anúncio mais atraente.
- Manter título, imagem, descrição do que vem e preço coerentes com a mesma opção. Um anúncio com várias versões pode fornecer uma boa oferta, mas a faixa sozinha não explica essa escolha.
- Informar condições conhecidas que mudem a compra, como cupom, forma de pagamento ou quantidade mínima. Distinguir preço do item e custos adicionais; não prometer total final desconhecido.
- Tornar o acesso à conferência da oferta evidente na pauta. A combinação de título, imagem, preço e ações deve permitir entender e abrir a indicação sem depender de copiar e colar uma URL.
- Preservar a opção escolhida no destino quando houver suporte comprovado da fonte. Se isso não for possível, explicar a opção com precisão e avaliar se a oferta continua adequada à indicação direta.
- A visita à loja deve permitir concluir a decisão e comprar com uma expectativa já esclarecida. A etapa de checkout do marketplace permanece; o atrito a reduzir é a investigação adicional.

O destino das ações da pauta ainda será desenhado: detalhe interno, conferência na fonte e compra podem ter funções distintas. Os links curtos, previews e a atribuição de afiliado existentes devem ser preservados até que qualquer alternativa seja validada de ponta a ponta.

### Histórico de preços, descoberta e escolha editorial

**Novo insumo do usuário em 01/11/2026:** o histórico de preços é apresentado como um diferencial do projeto, mas aparece pouco nas visitas aos produtos. Concentrar toda a operação nos mesmos anúncios pode limitar a descoberta de oportunidades; trocar sempre o conjunto pode impedir a formação de séries úteis. Essa tensão precisa ser tratada como parte central do produto, e não apenas como frequência de um cron.

A direção consolidada é separar **o que acompanhamos ao longo do tempo**, **o que buscamos descobrir** e **o que escolhemos apresentar agora**. Sair da home ou da pauta não deve, por si só, encerrar o acompanhamento de uma boa oferta. Um produto adequado ao público, temporariamente sem preço atraente, pode ganhar interesse amanhã. Continuar acompanhando um produto também não obriga a divulgá-lo repetidamente.

#### Evidência pontual e limites do diagnóstico

Leitura das páginas públicas em 01/11/2026, sem alteração de dados ou chamadas aos marketplaces:

| Produto consultado | Registros coletados informados pela página | Comparáveis exibidos nos últimos 90 dias | Explicação exibida |
|---|---:|---:|---|
| [Kit 10 sacos a vácuo](https://www.bizuminer.com.br/bizu/shp-23394279813) | 21 | 0 | Anúncio com várias versões ou preço a partir de um valor |
| [Organizador de roupas/cobertores](https://www.bizuminer.com.br/bizu/shp-58257273463) | 27 | 0 | Anúncio com várias versões ou preço a partir de um valor |
| [Anúncio AliExpress consultado](https://www.bizuminer.com.br/bizu/ali-1005009830682959) | 13 | 0 | Anúncio com várias versões ou preço a partir de um valor |

Esses exemplos demonstram uma causa real, mas não medem a cobertura de todo o catálogo. Não concluir que toda ausência de gráfico decorra da mesma causa.

O código atual separa o total de registros coletados da série comparável: a apresentação exige correspondência da configuração identificada, moeda e condições relevantes, na janela de 90 dias. Uma faixa ou uma identidade desconhecida pode deixar a série vazia mesmo depois de muitas consultas. A definição da configuração também exige campos que precisam ser confrontados com as capacidades das fontes e com a materialidade para cada família, conforme a discussão de clareza da oferta acima. Não haverá relaxamento automático por este plano.

A persistência examinada já admite uma nova observação após uma janela de aproximadamente 20 horas mesmo sem mudança de preço; recapturas idênticas mais próximas podem ser deduplicadas. Portanto, preço estável não deveria ser confundido com ausência de histórico. Esse mecanismo, isoladamente, não prova que o conjunto relevante esteja sendo reconsultado na cadência desejada.

Precisamos medir separadamente: produtos realmente novos; produtos sem reobservação suficiente; registros que não identificam uma opção comparável; lacunas de moeda/condições; registros fora da janela; e eventual problema de leitura/apresentação. Aumentar o orçamento de consultas antes dessa distinção pode acumular mais dados que continuam sem utilidade comparativa.

#### Organização funcional consolidada; dimensionamento a definir

| Frente | Finalidade | Relação com a exposição |
|---|---|---|
| Acompanhamento contínuo | Formar e manter histórico de um conjunto de produtos/opções com mérito editorial ou interesse real do público | A retirada por preço/momento não encerra automaticamente o acompanhamento; frequência e prioridades respeitam a capacidade |
| Descoberta e formação | Buscar novas oportunidades e dar a candidatos promissores condições de formar uma série de observações | Encontrar um candidato não garante indicação imediata; ele também não precisa aguardar um histórico longo para toda e qualquer indicação |
| Seleção para cada canal | Escolher as ofertas mais convincentes naquele momento, com o nível de exigência e o contexto do destino | Combina oportunidades conhecidas e recém-descobertas conforme mérito, validade e exposição recente, sem cota de novidade já fixada |

São responsabilidades lógicas; não implicam três tabelas, três serviços ou três quotas obrigatórias. A alocação de capacidade, frequência, entrada e saída do acompanhamento será definida com dados de cobertura, retorno das fontes e orçamento. Preservar favoritos/alertas e as restrições existentes de cada marketplace. O plano não estabelece novas porcentagens nem aumento de capacidade.

Um produto recém-descoberto pode merecer indicação pelo preço confirmado, utilidade e demais evidências disponíveis. O histórico insuficiente limita a alegação histórica que podemos fazer; não define sozinho o mérito do produto. Uma oferta conhecida pode voltar à seleção após uma melhora de preço sustentada por dados comparáveis. O histórico não é o único sinal de qualidade, e o menor preço absoluto não é equivalente à melhor indicação.

#### Promessa e experiência do histórico

- Apresentar claramente o que já sabemos: preço observado, data da conferência, quantidade de registros comparáveis, período efetivamente coberto e limitações. Diferenciar produto recém-chegado de produto reobservado com dados ainda incompatíveis.
- Tratar preço estável em observações de datas diferentes como informação útil. Não exigir uma queda para existir uma série; não inventar pontos, preencher lacunas como se houvesse captura ou transformar consultas repetidas no mesmo instante em cobertura de vários dias.
- Relacionar histórico à mesma opção de compra. O esclarecimento atual de uma variante não autoriza atribuir retroativamente essa identidade a registros antigos sem suporte nas evidências preservadas.
- Distinguir “preço atual confirmado”, “queda observada” e “menor entre preços comparáveis registrados em um período”. Uma alegação de menor preço exige escopo e cobertura compatíveis; não significa menor preço de todo o mercado nem observação contínua de todos os instantes.
- Investigar a promessa pública e a presença efetiva do histórico nos produtos que as pessoas veem, não apenas o número de linhas no banco. Textos comerciais e estados da interface precisam refletir a cobertura sustentada.
- Definir se há informação útil de observações agregadas que possa ser exposta com escopo próprio, sem ser confundida com comparação da mesma versão ou usada para sustentar desconto. Essa possibilidade permanece aberta; não está autorizada a mistura de configurações em um gráfico comparativo.

#### Medições propostas para calibrar a decisão

Medir tanto o acervo acompanhado quanto os itens efetivamente mostrados na home e preparados para WhatsApp/Stories: proporção com série comparável, número de dias distintos, período coberto, idade da última observação, maiores lacunas, motivos de exclusão e retorno de reconsultas. Separar isso da entrada de candidatos novos e do aproveitamento editorial dessas descobertas.

Contagem de execuções, número bruto de registros e gráfico desenhado não bastam para demonstrar que o diferencial está sendo entregue. As metas de cobertura pública, o período prometido, a cadência sustentável e a parcela de capacidade dedicada a descoberta/formação seguem em aberto. O desenho deverá preservar o histórico acumulado e permitir renovação editorial sem depender de manter os mesmos itens visíveis.

### Renovação orientada pelo mérito da indicação

A renovação deve acompanhar boas oportunidades disponíveis, preço confirmado, adequação ao público e exposição recente. Uma quantidade fixa de substituições não pode obrigar a inclusão de uma oferta inferior. Se houver poucas indicações fortes, a pauta pode ser menor.

Um produto já divulgado pode voltar a fazer sentido, por exemplo após melhora relevante da oferta ou um intervalo adequado de exposição. Reconsultar o mesmo anúncio, mudar a data ou reordenar a lista não comprova novidade. Intervalo, tolerância à repetição, reposição e critérios de retorno permanecem em discussão.

Os parâmetros da candidata anterior — 24 itens, até seis trocas por dia, retorno após 48 horas e piso relativo de 85% do mérito — **não estão ratificados como regra desta pauta melhorada**. A nova discussão também exige revisar o acoplamento entre home, hero e pauta. Enquanto a implementação estiver pausada, esses parâmetros não serão alterados nem publicados por este plano.

### Dependências identificadas na revisão do código

Conferência local dos contratos, persistência, políticas e serviços em 01/11/2026. Não foi uma nova auditoria do estado remoto. Os cenários abaixo são dependências para a implementação futura, não mudanças já realizadas.

| Dependência ou problema demonstrado | Cenário e consequência | Ajuste necessário no plano de implementação |
|---|---|---|
| Retenção sem acompanhamento pode criar uma espera sem saída | A triagem pode colocar um item em `held` por histórico insuficiente. A política de acompanhamento, sem favorito/alerta, clique recente ou oportunidade explicitamente acompanhada, o classifica como `archive`. Ele não recebe consultas dedicadas para formar justamente o histórico que falta | Considerar mérito e motivo de espera na decisão de acompanhar. Diferenciar oferta temporariamente fraca, dados a esclarecer e rejeição de produto; não acompanhar todos os retidos indiscriminadamente nem reaprovar uma rejeição humana por queda de preço |
| Avaliação editorial não confirma automaticamente a observação de preço | Salvar público, benefício e conteúdo em `editorial_assessment` não associa uma variante ao `offer_evidence` da captura. A API pode continuar devolvendo mínimo do anúncio ou variante desconhecida na consulta seguinte | Definir como a opção e seu preço são confirmados, persistidos e reobservados com origem/data. Uma revisão de texto não deve emprestar certeza a novas capturas agregadas nem reclassificar observações antigas sem evidência |
| Várias opções do mesmo anúncio podem disputar a identidade de gravação | A ingestão atual deduplica por rodada/produto (`capture_run_id, product_id`). Duas variantes capturadas nessa mesma identidade podem sobrescrever a observação em vez de formar séries distintas | Resolver identidade e idempotência da oferta antes de habilitar captura de múltiplas opções. Reaproveitar a estrutura possível; não presumir uma nova tabela ou duplicação de produto antes dessa conferência |
| Escolhas por destino exigem rever a persistência atual | Há destinos `home`/`pauta` em uma seleção ativa por conta e uma edição materializada com até 24 itens. Ordenações ou conjuntos independentes não são obtidos apenas trocando o filtro da tela | Especificar o escopo da escolha, ordem, vigência, versão e retirada por destino, com evidências centrais compartilhadas. Conciliar home/hero, pauta, API, previews e métricas; conservar o que for comum sem exigir listas idênticas |
| Requisitos de comparabilidade e capacidade da fonte precisam se encontrar | As séries exigem configuração conhecida, moeda e condições materiais; os adapters examinados podem entregar apenas dados agregados. Aumentar frequência sem resolver identidade não cria uma série comparável | Antecipar a verificação de viabilidade por fonte e família. Distinguir campo essencial, inaplicável e desconhecido com justificativa; definir um caminho autorizado de confirmação quando houver lacuna. Não transformar ausências em `not_applicable` para passar nas regras |
| A configuração anterior pode acionar comportamento novo durante a transição | O registro anterior informou `homepage_renewal.enabled=true`. Publicar um worker que passe a consumir essa configuração pode iniciar composição quando aparecer um apto, mesmo que o novo fluxo ainda não tenha sido conferido | Reconciliar configurações, versões e ordem de publicação antes de executar a nova política. A habilitação antiga não é autorização de ativação com critérios novos; a pausa deve ser respeitada por web, worker e rotinas pós-captura até a retomada e ativação deliberadas |

**Evidências usadas:** `packages/web/lib/curation-pipeline.ts`, `packages/web/lib/curation-contract.ts`, `packages/persistence/src/monitoring-policy.ts`, `packages/persistence/src/monitoring-candidates.ts`, `packages/persistence/src/pg-store.ts`, `packages/web/lib/editorial-selection.ts`, `packages/web/lib/editorial-selection-db.ts`, `packages/web/lib/homepage-db.ts` e migrations existentes de seleção/histórico. Um ensaio sintético, sem banco, rede ou gravação, confirmou o encadeamento `held/insufficient_evidence → archive, targetHours=null`; um item `approved` equivalente permaneceu elegível à reconsulta. Isso demonstra a condição do código, não quantos produtos reais estão afetados.

### Estado real do trabalho que precisa ser preservado

- O deploy anterior de desempenho está publicado e deve ser preservado em uma futura integração.
- Há uma candidata local de renovação com código, testes e build aprovados, ainda sem publicação web nem atualização do worker no GitHub. Ela contém partes aproveitáveis, mas não representa a implementação concluída desta direção editorial mais recente.
- A migration aditiva `20261101125432_renew_editorial_pauta.sql` já foi aplicada no banco conectado como `20261101130216_renew_editorial_pauta`. O controle da conta `local` foi habilitado pelo painel antes da pausa. Na verificação registrada, estava em `awaiting_review`, sem edição criada. A pausa não desfez essa mudança no banco.
- A conferência anterior encontrou 245 candidatos recentes e zero aptos pela composição estrita então implementada. **Isso mede o atendimento àquelas regras, não a qualidade comercial dos 245 produtos.** A relação entre regras, dados disponíveis e mérito precisa ser revisada com exemplos.
- Os 582 testes/cenários registrados validam a mecânica da candidata anterior. Não medem probabilidade de compra, não calibram o critério editorial novo e não substituem a validação deste plano.
- Não houve envio a clientes por essa implementação. As rotinas anteriores de monitoramento continuam distintas da descoberta de novos produtos; sua execução não comprova entrada de novidades ou renovação editorial.
- O usuário pediu pausa antes de autorizar a publicação da candidata. A edição deste plano é documental; não implica retomada, rollback, ativação de edição, novo deploy ou alteração de automações.

### Sequência proposta para uma futura implementação

As etapas abaixo são uma organização provisória. Serão ajustadas conforme acrescentarmos informações.

| Etapa | Trabalho a definir e executar após a retomada | Evidência esperada para avaliar a etapa |
|---|---|---|
| 1. Calibrar com exemplos | Selecionar uma amostra de achados fortes, medianos e inadequados, incluindo anúncios com várias versões; registrar por que seriam ou não indicados por canal | Exemplos concretos de decisão editorial, com dúvidas e condições explícitas |
| 2. Conferir capacidade das fontes e cobertura histórica | Identificar o que cada captura entrega sobre variante, quantidade, preço, moeda e link; medir reobservação, comparabilidade e exclusões dos produtos apresentados; verificar a espera sem acompanhamento | Mapa das lacunas reais e dos caminhos viáveis de confirmação; distinguir ausência de coleta de ausência de comparação útil. Demonstrar como obter e reobservar uma opção em cada caminho que será habilitado |
| 3. Definir a representação da oferta e da seleção | Aproveitar entidades existentes; esclarecer identidade/idempotência da opção ao longo do tempo, proveniência e validade, além de escopo, ordem e vigência da seleção por destino | Contrato revisável; variantes não sobrescrevem observações umas das outras, dados antigos são preservados e a escolha por canal não depende apenas de um filtro visual |
| 4. Desenhar a mesa da pauta | Apresentar benefício, público, oferta específica, preço/condições e ações clicáveis; tornar a revisão material compreensível e preservar o trabalho em andamento | Fluxo navegável no celular e desktop, com estados de pronto, pendente e inválido claros |
| 5. Separar escolhas por destino | Reutilizar evidências e critérios centrais, permitindo seleções e ordens adequadas a WhatsApp, Stories e home | Comparação entre conjuntos reais e justificativa das diferenças, sem duplicar julgamentos contraditórios |
| 6. Conciliar acompanhamento, descoberta e renovação | Decidir acompanhamento pelo mérito, interesse e motivo de espera, mesmo fora da seleção; distribuir capacidade entre retenção e descoberta/formação; selecionar por mérito e exposição; aproveitar ou ajustar a candidata pausada | Simulação de vários ciclos, incluindo retido por preço/histórico insuficiente que continua acompanhado, melhora de oferta, escassez, novidades e invalidações, sem forçar preenchimento nem reaprovar rejeições |
| 7. Validar e integrar | Conferir seleção, experiência e cobertura histórica dos produtos apresentados, primeiro sem modificar a pauta publicada; reconciliar flags, versões e ordem de publicação antes da ativação | Fluxo completo aprovado com exemplos reais suportados, configurações de ativação explícitas, possibilidade de reversão que preserve elegibilidade e observação da entrega real da promessa de histórico |

Mudanças de captura dependem das capacidades verificadas e das proteções de cada marketplace. O plano não reativa caminhos de acesso restritos. Revisão humana, regras e IA ainda terão suas responsabilidades delimitadas; não presumir que toda lacuna exigirá preenchimento manual, nem que IA possa confirmar fatos ausentes.

O primeiro incremento deverá demonstrar uma jornada útil com caminhos de fonte realmente suportados: opção confirmada → observação preservada → indicação compreensível e clicável → nova consulta da mesma opção → histórico/avaliação atualizados. Não exigir resolver todo o acervo nem todas as fontes para conferir essa jornada, e não declarar cobertura universal a partir dessa amostra. A impossibilidade de identificar/reconsultar uma opção é uma dependência a resolver ou uma limitação explícita daquele caminho, não uma pendência invisível delegada ao usuário final.

### Critérios preliminares de aceitação

- Uma indicação pronta para WhatsApp/Stories permite compreender qual produto/opção está sendo indicado, o benefício e o preço/condições conhecidos, com informações suficientes para aquela compra.
- A faixa de um anúncio não é apresentada como preço exato de uma versão não confirmada. Uma opção específica só usa o mínimo quando a associação estiver demonstrada.
- Imagem, título e conteúdo da compra correspondem à oferta selecionada. O acesso de conferência funciona e o caminho de compra mantém o destino e a atribuição esperados.
- A home pode ampliar a exploração sem transformar automaticamente todos os itens em recomendações de envio. A política de exposição de preços agregados nesse catálogo ainda precisa ser definida.
- A seleção privilegia mérito e contexto. Não há preenchimento forçado para alcançar uma quantidade ou uma meta diária de trocas; variantes do mesmo produto não ocupam a pauta de modo artificial.
- Sair da seleção não elimina observações nem encerra automaticamente o acompanhamento de um item relevante. A entrada de novidades e a continuidade do histórico são verificadas como capacidades distintas.
- Espera por preço ou formação de histórico não produz um ciclo sem reconsulta para candidatos ainda relevantes. Rejeição por inadequação/segurança, indisponibilidade confirmada e simples ausência na resposta da fonte têm tratamentos próprios.
- O estado público explica a diferença entre falta de registros, série ainda curta e dados não comparáveis. Uma sequência estável de preços observados pode ser mostrada quando comparável, sem fabricar variação.
- Uma oferta nova pode ser avaliada sem alegação histórica. Alegações de queda ou menor preço permanecem limitadas às evidências e ao escopo sustentados.
- Produtos reprovados, retirados ou materialmente inválidos não reaparecem por recaptura, fallback ou falha de atualização. A manutenção de uma seleção anterior depende de sua elegibilidade continuar válida.
- O operador distingue preparação, cópia de link, divulgação confirmada e resultados observados. Dados de cliques não são apresentados como compras.
- Persistência, avaliações, histórico, links e qualquer controle de exposição respeitam conta, destino e identidade da oferta. Não há reaproveitamento de contexto entre contas.
- A página permanece fluida, com processamento editorial fora do carregamento público sempre que possível, consultas limitadas, cancelamento de leituras obsoletas e preservação das melhorias de desempenho já entregues.

Esses critérios serão refinados com o usuário. Eles ainda não constituem uma especificação final nem autorização de implementação.

### Cenários que deverão comprovar a futura entrega

| Cenário | Resultado a conferir |
|---|---|
| Bom produto temporariamente caro e fora da vitrine | Continua elegível ao acompanhamento na prioridade definida; uma melhora confirmada provoca reavaliação, sem depender de reaparecer em uma busca |
| Candidato retido por falta de histórico | Recebe o tratamento de formação/esclarecimento apropriado; a retenção não impede silenciosamente os dados necessários à reavaliação |
| Duas opções do mesmo anúncio na mesma rodada | Identidades e observações preservadas, sem preço/quantidade trocados nem sobrescrita entre opções |
| Oferta esclarecida pelo editor, seguida de resposta agregada da API | A informação humana tem origem/data; a resposta agregada não recebe o preço exato da opção por herança nem renova indevidamente sua validade |
| Opção acompanhada em datas distintas pelo mesmo preço | Série estável quando comparável, com datas/cobertura reais; nenhuma variação ou captura intermediária inventada |
| Novidade interessante sem série histórica | Pode ser avaliada pelas evidências atuais, com estado de histórico honesto e sem alegação de queda ou mínimo não demonstrada |
| Home ampla e pauta de maior exigência | Conjuntos/ordens podem diferir; a verdade factual da mesma oferta é consistente. Versão, vigência e retirada obedecem ao escopo definido, sem vazar conta ou destino |
| Oferta expira, muda materialmente ou é reprovada | Indicação/preço/preview afetados deixam de sustentar a oferta; uma falha do worker não mantém uma indicação inválida nem reabre fallback incompatível |
| Não há oportunidade nova melhor que as atuais | Mantém-se a seleção ainda válida ou uma pauta menor, com explicação de escassez; não há substituição automática apenas para cumprir quota |
| Link preparado no celular e conferido na loja | Opção, preço e condições permanecem coerentes; preview e atribuição funcionam; copiar ou abrir o link não é registrado como envio ou compra |
| Retomada com configuração antiga de renovação habilitada | Simulação e reconciliação precedem a execução da nova política. Publicar uma dependência não ativa silenciosamente uma seleção ainda não validada |

Usar os cenários para ajustar os testes existentes: igualdade obrigatória entre as listas da home e pauta e limites de rotação da candidata anterior deixam de ser prova da nova intenção. Permanecem as verificações de validade, isolamento, concorrência, rollback, preservação do histórico e desempenho. Conferir o fluxo no navegador e a cobertura apresentada, além de testes e build. Nenhuma dessas execuções futuras foi realizada por esta revisão.

### Parâmetros e esclarecimentos a calibrar na especificação

As perguntas seguintes localizam ajustes do desenho. Público geral, exigência elevada das indicações, especificidade da oferta e acompanhamento independente da exposição já estão consolidados. Quantidades, pesos e cadências não precisam ser inventados para encerrar esta revisão; deverão ser definidos com exemplos, capacidade e cobertura medidas. Uma lacuna que impeça identificar a oferta ou preservar uma decisão humana exige solução antes de habilitar aquele caminho.

1. Quais produtos reais exemplificam uma indicação excelente, mediana e inadequada para esse público? Que diferenças pesam mais na escolha?
2. WhatsApp e Stories usam a mesma seleção de maior exigência ou têm ajustes por público, momento e formato? Há grupos segmentados?
3. O que está incluído em “exemplos a serem postados”, e qual é a exigência de oferta específica em cada tipo de conteúdo?
4. Quais dúvidas são materiais por família de produto? Que evidências bastam e quando entra revisão humana? Como evitar tanto a ambiguidade quanto o bloqueio por campos irrelevantes?
5. Como tratar cupons, Pix, frete, kits, tamanhos, região e opções que não permitem um link com versão pré-selecionada?
6. Qual é o ritmo desejável de preparação/divulgação, e quando uma boa oferta pode ser repetida? Quantidade, intervalo e tolerância à escassez ainda serão definidos.
7. Qual autonomia terão regras, IA e editor na avaliação, escolha e publicação? A preparação da pauta não autoriza envio automático a clientes.
8. Quais resultados conseguimos observar de verdade para calibrar o critério: interesse, clique, divulgação e/ou compra atribuída? Como interpretar volume e denominadores insuficientes?
9. Qual promessa de histórico queremos sustentar: para quais produtos, com qual período e cobertura? Qual presença desse diferencial esperamos na home e nas indicações?
10. Como dividir a capacidade entre manter séries de itens relevantes, formar histórico de candidatos e descobrir novos produtos? Quando acompanhar, reduzir frequência ou arquivar um item, preservando histórico e interesses dos usuários?

### Próximos insumos

Acrescentar aqui as novas decisões, exemplos e restrições conforme a conversa continuar. Uma nova decisão deve atualizar a seção correspondente e indicar quais hipóteses ou partes da candidata anterior ela substitui. Não criar uma cadeia paralela de planos ou ordens de serviço para o mesmo objetivo.

### Resultado desta revisão — 01/11/2026

O plano tem direção funcional suficiente para orientar a especificação da futura implementação. Foram explicitadas seis dependências e os cenários de validação correspondentes, com destaque para a espera sem acompanhamento, a identidade da opção nas reconsultas e a persistência de escolhas por destino. A revisão não afirma que as fontes já oferecem todos os dados necessários nem que o código pausado implementa essa direção.

Escopo conferido: documentação relacionada, contratos e serviços locais, mais o ensaio sintético descrito acima. Não houve nova verificação remota, mudança de dados, alteração das regras em execução, alteração de testes usados como prova, publicação, chamada a marketplace ou retomada da implementação. As medições públicas citadas são os retratos datados das averiguações anteriores.

## Registros técnicos e plano anterior — referência histórica

Os registros seguintes preservam decisões e evidências anteriores. Quantitativos, fases, acoplamento home/pauta e hipóteses de automação aqui presentes não substituem a direção revisada acima. Consultá-los para reaproveitar trabalho e proteções, não como uma segunda especificação vigente.

### Diagnóstico da pauta repetida em 31/10/2026

Consulta de produção para a conta da casa (`local`), após o deploy de desempenho `dpl_6oC3wkMgRWoinNcv6h2zWLm6PLsa`, confirmou que a pauta continua no caminho de transição, sem edição persistida. Foi diagnóstico: não houve ativação editorial, captura, alteração de critérios ou escrita de conteúdo.

- `homepage_edition`, `editorial_selection` e `editorial_assessment` não tinham registros para a conta. Assim, `getPublishedEditorialSelection` recai no ranking de catálogo, com `compose=false`, sem a composição e continuidade da edição renovável em 24 horas. Os mesmos candidatos podem continuar nas primeiras posições.
- O workflow remoto de monitoramento já contém a atualização da edição. Na [execução 41233233020](https://github.com/ManyRagDev/bizuminer/actions/runs/41233233020), ambos os jobs terminaram com sucesso, mas a etapa de atualização retornou `ready:true, changed:false, count:0, blocked:"initialization_required"`. O script não falha nesse caso sem `--initialize`; o verde do job não comprova renovação.
- A simulação atual, executada sem `--execute`, retornou `count:0, heroCount:0`. Isso confirma a condição já registrada em 28/10: ativar a edição exige antes resolver aptidão/evidências, sem forçar conteúdo ou preencher fatos desconhecidos.
- Entre 203 produtos aprovados com preço nas últimas 48 horas, presença em sete dias, preço positivo e imagem, nenhum tinha conteúdo ou quantidade do pacote registrados; 105 tinham moeda BRL e 45 preço explicitamente exato. A política nova exige clareza de configuração, conteúdo, quantidade e preço, ou avaliação editorial completa; os dados atuais não produziram item apto na simulação.
- Não entrou produto novo nos últimos sete dias. A última entrada geral foi em 13/10 (Mercado Livre); em Shopee e AliExpress, em 24/09. As rodadas mais recentes reconsultaram 20 produtos por loja, sem produtos novos, com 3 mudanças de preço na Shopee e 20 no AliExpress. Monitoramento por ID mantém preços, não faz descoberta de catálogo.
- O cliente da pauta consulta `/api/pauta` com `cache:no-store` a cada 60 segundos e ao recuperar foco. A repetição vem da seleção e do abastecimento, não de uma edição nova sendo escondida por esse cache.

O caminho de fechamento é conferir e completar os fatos disponíveis ou a revisão editorial, validar uma primeira edição apta antes de ativá-la e conferir a renovação persistida nos workers. A variedade também depende de entrada de novos candidatos pelas fontes autorizadas. Não basta incluir `--initialize` no cron nem relaxar os critérios para variar a lista.

### Renovação contínua — implementação em 01/11/2026

**Registro da candidata anterior à pausa.** O código e as verificações abaixo existem, mas a publicação foi suspensa e os parâmetros de quantidade, rotação e seleção compartilhada estão em revisão no plano intermediário acima.

Direção confirmada: público geral de achadinhos. A renovação preserva as decisões editoriais e a elegibilidade; a quantidade de itens e a variedade dependem de ofertas válidas. Os parâmetros de rotação são decisões editoriais iniciais, não uma probabilidade medida de conversão.

- `home-v2` mantém até 24 itens e renova a composição a cada 24 horas, na rodada de execução seguinte. Até um quarto pode mudar por ciclo; os incumbentes de maior mérito são preservados. A continuidade de uma edição `home-v1` é respeitada durante a transição.
- A exclusão permanente por já ter aparecido foi substituída por histórico de última presença. Um produto ainda apto pode voltar após 48 horas desde a última inclusão, ou antes se suas evidências melhorarem frente ao incumbente mais fraco. Recapturar sem mudança não é novidade. Entre candidatos da mesma base de pontuação, a rotação exige ao menos 85% do mérito do incumbente mais fraco; avaliações humanas e sinais de catálogo continuam em escalas distintas.
- Preço observado em até 48 horas, presença recente, aprovação, publicação ativa, clareza da compra e avaliação negativa/desatualizada permanecem barreiras. Edições manuais vazias, retiradas ou vencidas não ganham reposição pelo catálogo, nem têm a vigência prorrogada automaticamente.
- A conta pode habilitar a rotina pela curadoria mesmo com zero aptos. A intenção fica persistida; a primeira edição só é criada depois que uma captura/revisão ou worker encontra itens qualificados. Leituras públicas continuam sem criar edições ou consultar o conjunto completo de candidatos depois da inicialização.
- O painel mostra habilitação, última tentativa, resultado, composição possível, impedimentos discriminados e links para revisar os candidatos. A pauta identifica o catálogo de transição e a data da renovação real. Os marcadores locais de links copiados são relidos na mudança de dia mesmo com a aba aberta.
- Itens da edição atual passam à conferência por ID a cada 24 horas, antes da janela de preço de 48 horas. Favoritos e alertas preservam prioridade; o orçamento por loja e as pausas/recuos existentes continuam valendo. Mercado Livre permanece na fila humana. Renovação não descobre produtos novos: a captura alimenta o conjunto de candidatos.
- `refresh-homepage.ts --execute --require-renewal` sinaliza impedimento/falha no código de saída. Uma edição automática que perde todos os aptos fica vazia e registra `awaiting_review`; não reabre o fallback. O workflow de acompanhamento foi ajustado localmente para esse modo explícito.
- A gravação de `selection` e `dependencies` agora usa o encoder JSON do driver. O envio de `JSON.stringify(...)` como parâmetro `jsonb` podia armazenar um texto JSON em vez do objeto/array exigido. A integração em PostgreSQL nativo verifica o caminho efetivo, incluindo concorrência, retry de serialização e rollback.

#### Persistência e estado operacional

Migration local: `20261101125432_renew_editorial_pauta.sql`, gerada pelo CLI oficial. Aplicada no projeto Supabase conectado como **`20261101130216_renew_editorial_pauta`**, após validar em bancos descartáveis. Adiciona `last_featured_at` sem alterar `first_featured_at`, e `homepage_renewal` privada com RLS por tenant. Apenas responsável pela conta e worker escrevem a configuração; `anon` e runtime público não recebem acesso. O verificador de segurança não apontou ocorrências novas relativas às tabelas da renovação.

A conta `local` foi habilitada no painel local autenticado em **01/11/2026 às 10:03 (São Paulo)**. Resultado confirmado no banco: `enabled=true`, `outcome=awaiting_review`, **zero edições criadas**. A conferência do painel encontrou **245 candidatos recentes e zero aptos**; configuração, conteúdo e quantidade não estavam confirmados nas capturas. Esses dados não foram preenchidos por inferência, e nenhuma avaliação humana ou publicação de produto foi fabricada.

**Publicação do novo código web e atualização do worker no GitHub ainda pendentes.** A habilitação no banco, sozinha, não altera o comportamento do worker antigo. Para iniciar a primeira edição, publicar o código validado e conferir evidências/avaliações de produtos. Depois da primeira composição apta, a rotação e a revalidação seguem automaticamente. Não há envio automático a clientes nesta implementação.

#### Verificação

- Web: 518 testes e typecheck aprovados; persistência: 42 testes e typecheck aprovados.
- Simulação de 14 dias com 40 produtos: renovação continua depois de todos aparecerem, com até seis trocas por dia, intervalo de retorno, mérito e validade preservados.
- Integração PGlite: 17 cenários, incluindo habilitação vazia, início posterior, ordem compartilhada entre home/pauta, perda dos aptos, RLS e decisões manuais.
- PostgreSQL 17.6 descartável: cinco cenários, com dois workers simultâneos, uma única inicialização/rotação, gravação JSON real, rollback de falha e isolamento entre contas. Nenhum desses testes grava em produção.
- Build de produção aprovado em candidata isolada (`/tmp/garimpa-pauta-release`), preservando o servidor de desenvolvimento e a base já publicada de desempenho. Os 27 arquivos desta entrega foram conferidos por hash entre workspace e candidata.
- Navegador autenticado, em desenvolvimento e na candidata compilada: habilitação, estado pendente, abertura do formulário com apenas o produto escolhido e pauta com 24 links do catálogo de transição conferidos. Nenhum erro de console nos fluxos da candidata. Em 390 px configurados (375 px de área útil), curadoria e pauta não apresentaram rolagem horizontal. A contagem de aptos é da composição estrita, sem confundir o catálogo transitório com uma edição renovável.

### Registro da primeira implementação

O percurso captura → evidências → avaliação humana → seleção versionada → home/pauta está implementado. A mesa permite avaliar cinco dimensões, esclarecer o conteúdo da compra, registrar dúvidas e preço máximo, incluir/ordenar/retirar produtos e ativar uma versão com vigência. Home e pauta leem essa seleção; o catálogo geral continua identificado como catálogo, e a pauta não faz uma segunda escolha por IA.

A [classificação da hero](./classificacao-hero.md), na política `hero-v2`, ordena os melhores disponíveis sem corte de nota: até três itens válidos da edição destinados à home. Antes da primeira edição, home e pauta compartilham até 24 melhores produtos do catálogo aprovado, com os três primeiros na hero, com prioridade a avaliações válidas e ranking separado dos sinais disponíveis para produtos ainda não avaliados. Essa leitura não fabrica avaliações nem edições. A seleção geral mantém sua ordem editorial; uma edição vazia, vencida ou retirada continua prevalecendo sobre o catálogo.

A migration `20261005235546_editorial_selection.sql` foi executada em PostgreSQL isolado via PGlite, com 18 cenários dos serviços reais. Testes e typechecks dos três pacotes e build web passaram. No navegador local foram conferidos home, ordenação por preço, paginação, detalhe, estado administrativo sem migration e pauta vazia; o encaixe mobile também foi conferido. A ativação de produtos reais ainda não foi conferida no navegador.

A migration foi aplicada via MCP ao projeto `spbuwcwmxlycchuwhfir`, com versão remota `20261005235546`; o arquivo local foi alinhado a essa versão. Schema, constraints, RLS e permissões foram conferidos no destino. A configuração de privilégios padrão do banco foi incorporada ao teste e neutralizada nas tabelas novas para preservar avaliações/itens sem UPDATE ou DELETE. Os serviços reais, usando `garimpa_app`, reconheceram o schema e carregaram 238 candidatos, sem avaliação ou seleção fabricada. Produtos, observações e decisões existentes foram preservados.

Esta entrega cobre a evidência opcional da fase 1, a avaliação humana central da fase 2 e o núcleo supervisionado da fase 3. Permanecem pendentes a amostra e calibração humana da fase 0, sugestões de IA pela nova rubrica, comparação em modo sombra, orquestração da fase 4 e realimentação/sincronização da fase 5. Não há afirmação de qualidade editorial medida nem autorização técnica de decisões automáticas pela política nova.

Detalhes de operação, capacidades das fontes, validação e transição: [registro da entrega](./entrega-integracao-curadoria-01.md).

### Objetivo e definição editorial

Um bom candidato é um produto adequado ao público do BizuMiner, com utilidade ou interesse compreensível, uma oferta que vale considerar e informações suficientes para indicar sem criar uma expectativa errada.

A hipótese inicial de público é quem procura utilidades para casa e rotina, acessórios práticos e presentes acessíveis. Produtos de nicho podem participar de coleções específicas quando houver contexto e evidências. Essa hipótese será calibrada com decisões reais do dono.

Separar três perguntas:

1. **Mérito do produto:** merece indicação para esse público e finalidade?
2. **Mérito da oferta:** essa configuração, nesse preço e nessas condições, merece atenção agora?
3. **Mérito do destaque:** entre os elegíveis, esse item merece o espaço que ocupará na seleção atual?

Desconto anunciado, novidade, vendas e comissão não substituem essas respostas. Um produto aprovado pode aguardar um preço melhor ou perder prioridade por repetição sem se tornar um produto rejeitado.

### Componentes existentes e diferenças atuais

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

### Regras da integração

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

### Fluxo alvo

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

### Contratos a implementar

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

### Critérios da avaliação

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

### Fase 0 Calibração e diagnóstico operacional

**Entregas**

- Inventariar schema aplicado, automação ativa, conferências pendentes, capacidades dos adapters e caminhos de captura individual, lote, CLI, extensão e acompanhamento.
- Comparar a seleção da home com a pauta usando os mesmos fatos e instante de referência; registrar as divergências.
- Criar amostra inicial proposta de 60 casos, distribuída entre bons candidatos, casos inadequados e casos ambíguos, com variedade de famílias, preços e fontes.
- Usar 40 casos para construir as âncoras editoriais e reservar 20 para avaliação. Anúncios equivalentes e variantes próximas ficam no mesmo conjunto, evitando vazamento.
- Registrar decisões humanas com motivo e fatos vistos. Reutilizar eventos anteriores somente quando tiverem contexto suficiente.
- Incluir tesoura de alto preço, organizador com conteúdo ambíguo, tradutor para público específico, mínimos empatados, kit de variante incerta e produto útil redundante.

**Aceite:** rubrica inicial versionada, divergências atuais documentadas e conjunto reservado identificado. Os quantitativos são orçamento inicial de calibração, não prova de desempenho estatístico ou autorização de automação.

### Fase 1 Evidências e identificação da oferta

**Entregas**

- Ampliar os contratos de captura, ingestão, persistência e leitura para transportar dados adicionais sem torná-los obrigatórios em fontes que não os fornecem.
- Registrar por fonte a disponibilidade de variante, quantidade, dimensões, descrição, contagem de avaliações, vendedor e condições do preço.
- Normalizar ausência de nota, rótulos aproximados de vendas e descontos inconsistentes sem inventar informação.
- Permitir esclarecimento humano de dúvidas essenciais, com autoria, fonte e data; alterações conflitantes do anúncio reabrem a dúvida.
- Tratar mudança de configuração como quebra de comparabilidade. Dados antigos sem identidade de variante mantêm seu escopo limitado.
- Frete, cupons e tributos personalizados permanecem desconhecidos quando não houver contexto confiável. Não apresentar custo total universal a partir de um valor parcial.

**Arquivos principais:** `packages/capture/src/types.ts`, adapters e fixtures, `packages/persistence/src/ingest.ts`, `store.ts`, `pg-store.ts`, `packages/web/lib/deal-view.ts` e snapshots.

**Aceite:** a evidência faz o percurso fonte → persistência → avaliação sem perder origem/data; campos ausentes não viram fatos; mudança de variante não gera queda histórica fictícia. A fase entrega cobertura mínima útil e esclarecimento manual, sem depender de todas as fontes fornecerem todos os campos.

### Fase 2 Avaliação central e comparação com o humano

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

### Fase 3 Seleção persistida compartilhada

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

### Fase 4 Continuidade entre captura acompanhamento e seleção

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

### Fase 5 Aprendizado da captura e operação da pauta

**Entregas**

- Relatar aproveitamento por consulta, família e fonte, separando rejeição editorial, falta de informação, preço ruim e redundância.
- Medir lacunas de cobertura e propor ajustes do plano de captura em versões revisáveis.
- Preservar exploração; manter o orçamento atual 80/20 como referência inicial, sem tratá-lo como ótimo comprovado.
- Persistir na pauta ações de preparação e divulgação por usuário/canal, com horário de São Paulo para agrupamento diário. Copiar um link não marca postagem.
- Relacionar impressões, cliques, favoritos e conversões disponíveis à seleção/item e período. Relatórios comparam taxas e exposição, não somente contagens brutas.
- Inicialmente, revisar manualmente alterações do plano. Popularidade não elimina exploração nem transforma dúvidas de qualidade em aprovação.

**Aceite:** o sistema explica por que recomenda uma próxima consulta; ajustes preservam rastreabilidade e reobservação; outro aparelho vê as atividades da pauta; cópia e divulgação confirmada são eventos distintos.

### Ordem de entrega e transição

Executar fases 0 → 1 → 2 → 3 para a primeira entrega funcional. A fase 1 fornece o mínimo necessário, com esclarecimentos humanos onde a fonte for limitada. Seleção supervisionada pode operar sem esperar que a IA alcance desempenho suficiente para automação. Fases 4 e 5 completam a continuidade operacional e a realimentação da captura.

1. Introduzir campos e contratos de forma aditiva e manter leitura compatível com registros antigos.
2. Avaliar o catálogo atual sem apagar decisões ou remover produtos em massa.
3. Preparar uma seleção supervisionada com avaliações atuais e esclarecimentos necessários.
4. Comparar as projeções novas e antigas antes de ativar o caminho compartilhado.
5. Ativar home e pauta juntas por configuração versionada, com confirmação de schema aplicado e conferência da seleção.
6. Encerrar o caminho editorial antigo da pauta e a seleção por amostra da home após a validação.

A reversão restaura a versão anterior válida da seleção e desativa a política nova de forma rastreável. Itens rejeitados ou vencidos continuam bloqueados. A primeira ativação só ocorre com uma seleção válida e uma alternativa de apresentação vazia; não usar ranking antigo como fallback silencioso em caso de falha.

### Verificação e critérios de conclusão

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

### Limites e decisões futuras

A integração inicial não inclui fine-tuning, busca de novas plataformas, checkout, cálculo universal de frete/tributos nem envio automático de mensagens. As capacidades disponíveis de cada fonte determinam o enriquecimento possível; campos materiais inacessíveis exigem esclarecimento ou restringem a indicação.

Antes de automatizar decisões da política nova, revisar os resultados do modo sombra e a estabilidade por classe. A revisão dos exemplos também deve distinguir produto ruim de produto redundante, inadequado para a home geral ou temporariamente sem boa oferta.

A publicação de uma seleção é trabalho reversível de curadoria; a divulgação externa continua uma ação explícita do operador. A execução começa pela fase 0 e só marca entregas concluídas com evidência técnica e conferência editorial.
