# Acompanhamento de preços como produto

**Estado em 24/09/2026:** política, auditoria de cobertura, lookup por ID, worker de retenção e workflow ativos. Piloto de um produto por loja executado em produção: ambos retornaram correspondência exata, gravaram uma observação e passaram na verificação de tenant, preço atual e histórico anterior. Rodadas `c9dd26a6-6e92-4c51-8afe-bf9a115620e8` (Shopee) e `27a78eb8-9592-4c60-affa-89b5ff35f744` (AliExpress). Na AliExpress houve uma mudança de preço. Lotes de 20: Shopee 20/20 correspondências; AliExpress 12/20 e depois 9/20, com as demais respostas vazias para o ID, sem erro ou preço inválido. Essas ausências recebem recuo progressivo, sem alterar a data de preço. Os segredos e flags de captura estão configurados no GitHub e `MONITORING_ENABLED=true`. As cadências abaixo são metas de seleção, não uma promessa pública até a cobertura ser medida em operação.

**Validação do executor (24/09):** primeiro disparo no GitHub confirmou a Shopee (10 tentativas, 7 correspondências, 3 ausências, zero falhas) e mostrou 2 bloqueios temporários de frequência na AliExpress (17 correspondências, 1 ausência, 2 falhas). A agenda foi desligada, a retenção AliExpress passou a espaçar chamadas a 0,4/s e um novo lote local de 20 terminou com 17 correspondências, 3 ausências e zero falhas. Após o novo commit, o [workflow 36076100696](https://github.com/ManyRagDev/bizuminer/actions/runs/36076100696) concluiu com ambos os jobs aprovados: Shopee sem item vencido naquele momento; AliExpress 20 tentativas, 18 correspondências, 2 ausências e zero falhas. Agenda religada.

## Promessa que podemos sustentar

O usuário deve ver o preço registrado, a data da última conferência e o histórico que realmente existe. Um produto sem nova resposta da fonte permanece com a última observação datada; ausência na resposta, erro ou limite da API nunca renovam o preço. “De olho no preço” ganha prioridade operacional. Nenhum alerta parte apenas do desconto declarado pelo anúncio.

O produto tem dois ciclos distintos:

1. **Descoberta:** busca por categoria e termo encontra novos anúncios e pode reencontrar antigos.
2. **Retenção:** reconsulta anúncios já conhecidos pelo ID externo exato, independentemente de voltarem às buscas.

## Política v1

| Faixa | Entrada | Meta de reconsulta | Canal |
| --- | --- | --- | --- |
| Interesse explícito | `price_watch.active` | 24 h | API oficial em Shopee/Ali; fila humana no ML |
| Curadoria | `product_curation.status = approved` | 48 h | API oficial em Shopee/Ali; fila humana no ML |
| Interesse observado | clique nos últimos 7 dias | 72 h | API oficial em Shopee/Ali; fila humana no ML |
| Formação de histórico | `pending` | 7 dias | API oficial em Shopee/Ali; fila humana no ML |
| Arquivo | demais estados, inclusive `legacy_visible` sem interesse | sem revisão dedicada | reencontro eventual na descoberta |

Quando há várias razões, vale a primeira faixa da tabela. Dentro de uma faixa, vence o item mais atrasado. O orçamento é separado por loja. A partir de 10 consultas por rodada, 10% são reservados para candidatos e 10% para itens com clique, desde que existam itens vencidos; interesses explícitos têm precedência. O orçamento não define disponibilidade nem prova que o produto sumiu.

**ML:** a restrição vigente ao acesso automatizado impede prometer revisão individual recorrente. A fila informa ao operador o que merece nova captura humana. Um usuário que marcar um item do ML deve ver a data real da última captura; a interface não deve sugerir revisão diária garantida.

## Primeira medição

Consulta somente leitura em 24/09/2026, com o orçamento ilustrativo de 50 itens por loja:

| Loja | Catálogo | Elegíveis pela política | Vencidos | “De olho” vencidos |
| --- | ---: | ---: | ---: | ---: |
| Mercado Livre | 491 | 104 | 52 | 3 |
| Shopee | 639 | 375 | 31 | 0 |
| AliExpress | 828 | 474 | 83 | 0 |

Esses números são um retrato da política aplicada ao banco, não medição de cumprimento de cadência. `npm run monitoring:plan` reproduz o relatório. O estado `legacy_visible` não equivale a aprovação editorial e, sozinho, não deve consumir o orçamento premium.

## Execução técnica

- `npm run monitoring:run -- --marketplace shopee --limit 20` mostra a fila, sem consultar a API nem gravar.
- `npm run monitoring:run -- --marketplace aliexpress --limit 20` faz o mesmo para a AliExpress.
- `--execute` habilita a reconsulta e grava uma observação apenas quando o ID retornado é exatamente o do produto selecionado e o mapper aceita preço e moeda. A rodada registra tentativas, correspondências, ausências, falhas e mudanças de preço em `capture_run`.
- O lookup da Shopee usa `productOfferV2(itemId)`; o da AliExpress usa `aliexpress.affiliate.productdetail.get(product_ids)` com moeda BRL e tracking ID. Ambos foram aceitos pelas credenciais brasileiras numa espiga somente de leitura, e as ofertas passaram pelos mappers existentes. A [documentação oficial da AliExpress](https://open.alitrip.com/docs/api.htm?apiId=48595) descreve o endpoint por IDs e os campos de preço na moeda alvo.
- Um resultado vazio é **não confirmado**, não indisponível. Erros por item não derrubam as demais consultas da rodada e ficam contados no audit trail. IDs sem retorno entram em recuo de 24 h, 72 h, 7 dias e 14 dias; para itens marcados “de olho”, 6 h, 24 h e 72 h. O recuo usa os IDs e resultados persistidos em `capture_run.parameters`.

## Ativação gradual

1. **Concluído:** piloto de 1 item por loja; `npm run monitoring:verify -- <run IDs>` confirmou observação nova no mesmo produto, tenant e `capture_run`, com histórico anterior. Consulta AliExpress devolveu BRL e tracking ID presente; não houve substituição da publicação/link afiliado.
2. **Concluído:** lote de 20 por loja, seguido de novo lote de 20 na AliExpress para classificar ausências. O retorno vazio da AliExpress é frequente em anúncios antigos aprovados; não afirmar disponibilidade ou preço novo nesses casos. Reavaliar orçamento e cobertura semanalmente.
3. **Concluído na v1:** IDs sem retorno e falhas registrados por rodada; recuo progressivo evita reconsultas repetidas. Evoluir para tabela individual de tentativas quando o volume justificar e distinguir indisponibilidade confirmada de simples ausência na API.
4. **Ativo:** workflow de Shopee e AliExpress quatro vezes ao dia com orçamento inicial de 20 itens por loja por rodada, isolamento de concorrência e segredos no executor. Subir o orçamento com dados de rate limit e cobertura; o teto do CLI é 100 por rodada. Não agendar scraping do ML.
5. Exibir cobertura no admin: elegíveis, vencidos por faixa/loja, idade p50/p95 da última observação, `matched / attempted`, falhas e itens de usuários vencidos. O indicador público deve usar apenas `price_observation.observed_at`.
6. Só depois de cumprir a cadência por 14 dias, declarar uma frequência pública. Alertas pessoais exigem observação nova com queda real versus baseline/alvo, deduplicação e canal consentido; são uma etapa separada.

## Critérios de aceite do produto

- Um item marcado “de olho” vence antes de um item apenas aprovado, por loja.
- Uma captura de descoberta ou retenção só atualiza o histórico do ID exato.
- Falha, ausência, moeda divergente e preço inválido preservam a última data observada.
- O painel mostra o atraso e o resultado das rodadas; a página do produto informa a idade do preço sem transformar meta interna em promessa.
- A frequência divulgada corresponde à cobertura p95 observada, inclusive em dias com erros.
