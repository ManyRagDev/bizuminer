# Como o BizuMiner escolheu os produtos em 18/11/2026

O primeiro problema visível para o criador foi um jogo de panelas desaparecer da pauta. Para o comprador, foi uma garantia estendida avulsa aparecer como terceira oferta da página inicial. Os dois casos têm explicações diferentes. A pauta agrupou utensílios que atendem a necessidades distintas e ocupou duas vagas com anúncios de uma mesma panela. A página inicial exibiu uma grade de catálogo cuja ordem diverge da edição escolhida pela curadoria.

O que o dono espera é capturar livremente, receber uma pauta que já valha a pena trabalhar e encontrar as melhores escolhas em destaque na vitrine. O diagnóstico acompanha essa jornada desde a extensão até as ações de quem prepara e de quem compra. [Evidências numéricas e produtos examinados](evidencias-escolha-produtos-2026-11-18.json)

## O que aconteceu com os lotes do dia

Cruzei todos os recibos manuais da conta publicada de 18/11 até 21h39, horário de Brasília. Cada um dos 512 pares de produto e observação declarado pela extensão correspondeu a uma observação distinta no banco. Foram 197 criações e 315 atualizações. Um mesmo produto pode aparecer em vários recebimentos.

| Origem | Lotes | Observações recebidas e gravadas | Produtos distintos |
| --- | ---: | ---: | ---: |
| Mercado Livre | 6 | 265 | 194 |
| Amazon | 3 | 109 | 80 |
| AliExpress | 3 | 138 | 78 |
| **Total** | **12** | **512** | **352** |

Dos 352 produtos, 351 estavam aprovados e tinham uma avaliação registrada e uma nota ligada à observação mais recente. Um anúncio do AliExpress estava recusado por baixa qualidade. A demora chegou antes da decisão editorial. Entre os 197 produtos novos, a mediana até a primeira avaliação foi de **9h04** e **162 esperaram pelo menos oito horas**. A pauta usava a janela padrão de 12 horas após a conferência no navegador. Uma avaliação que chega nove horas depois deixa cerca de três horas para aproveitar aquele preço. A causa da espera entre a chegada e a primeira avaliação ainda precisa ser isolada.

Reproduzi a seleção completa de cada canal com o mesmo código em execução na aplicação. Cada coluna abaixo soma os mesmos 352 produtos. Os dois canais também concorrem com ofertas capturadas em outras datas.

| Destino do produto capturado | WhatsApp | Stories |
| --- | ---: | ---: |
| Selecionado | 23 | 11 |
| Apto, abaixo do corte | 214 | 217 |
| Outra oferta ocupou a vaga da família | 32 | 46 |
| Sem link de afiliado válido | 77 | 77 |
| Intervalo após divulgação recente | 5 | 0 |
| Fora da lista de candidatos | 1 | 1 |

**26 produtos distintos do dia** entrariam em pelo menos um dos canais às 21h39. A edição da vitrine continha **16 dos 352**. Considerando a conta inteira, havia 30 selecionados para WhatsApp, 16 para Stories e 24 na edição da vitrine. Nove desses 24 estavam fora das duas pautas naquele instante.

O histórico responde a outra pergunta. Entre a primeira captura de cada produto no dia e 21h39, **32 produtos distintos do lote tiveram preparação arquivada, seis tiveram cópia registrada e cinco tiveram divulgação confirmada pelo operador**, todos no WhatsApp. Até aquele horário não havia preparação arquivada de Stories para os produtos do dia. Uma oferta pode ter estado disponível antes, sair quando o preço vence e voltar depois de uma nova captura.

## As panelas e o Deco

Encontrei três jogos de panelas do Mercado Livre compatíveis com a lembrança do criador. Os três tinham preço exato, estavam aprovados e receberam a mesma justificativa nos dois canais. A política calcula a família pelo título e inclui “panela” e “frigideira” em “utensílios de cozinha”.

| Jogo capturado | Preço observado | O que ficou registrado |
| --- | ---: | --- |
| Brinox Ceramic Life Smart Plus, 8 peças | R$ 479,90 | Teve preparação no WhatsApp em 17/11 às 20h51. Em 18/11 ficou fora dos dois canais por família. |
| Cerâmica para indução, 10 peças | R$ 320,05 | Fora por família. Nenhuma preparação desse produto encontrada até o corte da auditoria. |
| Cerâmica para gás e indução, 19 peças | R$ 549,99 | Fora por família. Nenhuma preparação desse produto encontrada até o corte da auditoria. |

No WhatsApp, as posições **2 e 10** foram para dois anúncios Amazon da **Tramontina Vancouver 4,5 L, R$ 161,90**, com o mesmo título e preço. Os códigos de anúncio eram diferentes. A consulta também encontrou um terceiro anúncio com a mesma apresentação e nenhuma equivalência ativa para as opções examinadas. O headset HyperX Cloud III se repetiu nas posições 5 e 13. Para quem lê, 30 vagas produziram 28 títulos diferentes. Esses dados sustentam comparar as ofertas pela compra que representam. Título e preço, sozinhos, seriam evidência insuficiente para fundir os registros. [Famílias de produtos](../../packages/persistence/src/product-family.ts) · [Composição da pauta](../../packages/web/lib/pauta-policy.ts)

No catálogo e nos títulos históricos encontrei quatro **TP-Link Deco**, todos do Mercado Livre, aprovados e com avaliação registrada. O preço abaixo é o observado na última captura da extensão.

| Modelo | Unidades | Preço observado | Última captura |
| --- | ---: | ---: | --- |
| Deco X50 AX3000 | 2 | R$ 640,05 | 17/11, 20h47 |
| Deco X10 AX1500 | 3 | R$ 652,31 | 17/11, 20h46 |
| Deco X50 AX3000 | 3 | R$ 924,80 | 17/11, 20h46 |
| Deco BE22 BE3600 | 3 | R$ 1.204,00 | 16/11, 16h47 |

Os quatro chegaram pela extensão. Às 21h46 de 18/11, o motivo informado para cada um nos dois canais era **“A oferta precisa de uma conferência atual antes da preparação.”** Até 21h39, nenhum tinha preparação arquivada nos registros consultados. Havia apenas um ou dois dias de observações por modelo. Isso permite identificar o preço visto, mas deixa em aberto qual modelo o criador tinha em mente, quão excepcional era o preço e por que cada um ficou fora enquanto ainda estava válido. A oportunidade para o criador seria recuperar aquela oferta pelo nome e pedir uma nova conferência.

## O que o comprador encontrou

Às 21h46, a página inicial anônima respondeu com **282 ofertas no catálogo, 24 produtos na edição editorial e nenhum produto na capa**. Dos primeiros 24 cartões distintos exibidos sob “ordem editorial”, **nove pertenciam à edição**. Essa comparação usa os dados da edição e os cartões da **mesma resposta HTTP**. A diferença persiste mesmo quando se elimina qualquer efeito de atualização entre consultas.

O terceiro cartão era uma **garantia estendida de 12 meses, R$ 138,70**, sem identificação do bem coberto no título. Esse serviço estava fora dos destaques editoriais, tinha sido avaliado sem alertas e também foi escolhido na posição 22 do WhatsApp às 21h39. Os 24 destaques traziam a mesma justificativa pública, **“Produto aprovado para exploração.”** O comprador consegue ver preço e histórico, mas essa frase não explica a vantagem de escolher um produto específico.

A página carrega a edição de recomendações e o catálogo por caminhos diferentes. Na função publicada que ordena a grade, a referência editorial vem de uma lista anterior e o resultado intercala lojas. A edição atual pode complementar a opção e a apresentação de um produto que coincida com o catálogo. O nome “ordem editorial” encobre essa diferença. Na mesma visita o site exibia “19 de nov.”, embora ainda fossem 21h46 de 18/11 em Brasília. [Leitura da página inicial](../../packages/web/app/page.tsx) · [Consulta da grade](../../packages/web/lib/db.ts) · [Ordenação pública](../../packages/persistence/supabase/migrations/20261109022751_balance_public_catalog_marketplaces.sql) · [Texto editorial de reserva](../../packages/web/lib/recommendation-db.ts)

## Onde o criador perde controle

- **A navegação da curadoria atrasa a resolução.** Na inspeção em desktop, o botão “Conferir avaliações incertas” abriu a lista geral de problemas e exigiu escolher de novo o tipo de pendência. O resumo operacional também ocupava espaço antes do conteúdo da aba selecionada. O efeito é particularmente ruim para quem acabou de capturar um lote e quer encontrar uma oferta pelo nome. A entrada deve levar diretamente ao filtro ou ao produto que motivou o clique. [Navegação da curadoria](../../packages/web/app/admin/curadoria/page.tsx) · [Destino do botão](../../packages/web/app/admin/curadoria/automation-status.tsx)
- **O recibo começa depois da leitura da página.** No Mercado Livre o coletor percorre até 200 cartões e descarta, por exemplo, cartões sem link identificável. O preparo local informa quantos foram ignorados. O recibo no servidor conta os produtos efetivamente enviados e guarda o diagnóstico da validação deles. É possível seguir um produto recebido até seu destino. Para um cartão apenas visto e descartado na extensão, falta evidência durável que identifique o motivo daquele item. [Coleta na página](../../packages/extension/src/content/page-extractor.ts) · [Preparo do lote](../../packages/extension/src/background/service-worker.ts) · [Recibo gravado](../../packages/web/lib/extension-db.ts)
- **As ofertas aprovadas do AliExpress ficam sem link no fluxo manual.** Dos 78 produtos distintos, 77 ficaram fora dos dois canais por falta de link afiliado e um foi recusado no catálogo. Na conferência de 19/11 às 10h22, os 138 registros de preço dos três lotes tinham preço exato em reais e o endereço do anúncio correspondia ao identificador do produto. Nenhuma dessas observações estava vinculada a uma execução de lote do painel. Os 77 aprovados continuavam sem registro de publicação web na conta e, portanto, sem URL de afiliado gravada. [Evidência da conferência](evidencias-escolha-produtos-2026-11-18.json)

  A extensão entrega o endereço normal do anúncio. A rota manual grava a captura e devolve o recibo. A preparação automática que roda após aprovação cobre Mercado Livre e Amazon. Para o AliExpress, o gerador de links de lotes usa a API da loja e a identificação de afiliado da conta, mas é acionado pelo fluxo de publicação de um lote do painel. É essa ligação que falta à captura manual. A possibilidade de monetizar cada anúncio continua dependente da resposta da loja ao pedido de link. [Recebimento manual](../../packages/web/app/api/extension/capture-batches/route.ts) · [Preparação após aprovação](../../packages/web/lib/curation-publications.ts) · [Geração no lote publicado](../../packages/web/lib/browser-affiliate-links.ts) · [Verificação pela pauta](../../packages/web/lib/pauta-db.ts)

  A separação das rotas que podem ser preparadas localmente foi documentada em 14/11. Em 19/11 às 10h28, a leitura da conta publicada também devolveu o estado de painel `missing` para a conexão AliExpress, sem verificação gravada. Há duas pendências independentes para o fluxo automático funcionar nessa conta. A operação precisa configurar o vínculo afiliado e o aplicativo precisa encaminhar as ofertas escolhidas na captura manual ao gerador. [Decisão registrada em 14/11](manual-operacional-curadoria.md#curadoria-automática-em-produção--14112026) · [Estado de conexão exibido pelo painel](../../packages/web/lib/account-connections.ts)
- **A configuração exibida não governa a quantidade entregue.** O painel chama o campo de “Máximo de produtos na pauta”. A conta guardava 12 para WhatsApp e 8 para Stories. A leitura impunha um mínimo de 30 e 16, respectivamente. O limite de família salvo como 1 também subia para pelo menos 2 no WhatsApp. Isso explica por que reduzir o valor na tela pode não produzir o efeito esperado. [Campo do painel](../../packages/web/app/admin/curadoria/recommendation-control.tsx) · [Limites aplicados](../../packages/web/lib/pauta-db.ts)
- **O julgamento da IA chega ao público transformado por outras regras.** A escolha parte de uma avaliação de cada produto. A nota da pauta incorpora apelo para WhatsApp e é usada também por Stories. Depois entram demanda registrada, economia nominal e ajustes por loja, categoria e família. Quando falta referência histórica comparável, o preço anterior informado pela loja pode alimentar o bônus de economia nominal. “Abaixo do corte” mostra o resultado final, mas dá pouca informação para saber por que uma oportunidade perdeu. O caso das panelas demonstra um efeito concreto da composição. O peso de cada fator sobre os demais itens precisaria de comparação controlada. [Cálculo da nota](../../packages/web/lib/curation-score-v2.ts) · [Escolha final](../../packages/web/lib/pauta-policy.ts)
- **Falta a indicação individual da vitrine para a pauta.** O cartão permite salvar, abrir a oferta e copiar o link. A configuração avançada permite editar uma lista manual que passa a restringir os candidatos do canal. A preparação de texto e link, por sua vez, exige uma oferta já arquivada na pauta da conta. Nenhum desses caminhos permite que o criador acrescente só aquela oferta à própria pauta automática. [Cartão da vitrine](../../packages/web/app/vitrine.tsx) · [Ações da pauta](../../packages/web/app/api/pauta/route.ts) · [Construção do link de compartilhamento](../../packages/web/lib/pauta-response.ts)

## Ordem de correção e como conferir o resultado

1. **Fazer a seleção editorial chegar ao comprador.** A entrada da vitrine deve mostrar as escolhas atuais com uma razão concreta de compra. O catálogo completo continua acessível para busca e filtros. Conferir a edição e os cartões da mesma resposta pública e abrir as fichas para verificar se a opção, o benefício e o preço apresentados correspondem à escolha.
2. **Dar ao criador o caminho do lote até a oferta.** No detalhe de um recebimento, buscar pelo nome e ver o último destino por canal, quando mudou e a ação disponível. Ofertas promissoras que perderam validade podem voltar para conferência e ofertas do AliExpress com vínculo pendente podem seguir para geração do link da conta. Medir o tempo de espera por avaliação e quantas ofertas ainda têm preço utilizável quando ela chega.
3. **Acrescentar “Adicionar à pauta” na vitrine e na ficha para quem opera a conta.** Guardar produto, opção e canal com a indicação. Uma segunda indicação da mesma oferta deve reencontrar o item. Se faltar preço atual ou vínculo comercial, o criador deve poder recuperar a indicação e resolver a pendência. Quando a oferta estiver pronta, reutilizar a preparação de texto e link da pauta. Copiar, confirmar divulgação e descartar preservam seus significados atuais.
4. **Avaliar a qualidade da escolha com lotes reais antes de mudar pesos.** Comparar a seleção atual e a revisada com as escolhas que o criador faria. Incluir os jogos de panelas, as variações aparentes, os kits Deco e a garantia avulsa. Pedir à IA que explique com evidências para quem aquela compra vale a pena e por quê. Tratar variedade e afinidade do canal como preferências ajustáveis. Manter verificáveis o preço, as condições, a identidade da opção, o vínculo afiliado da conta e a decisão humana de divulgação. Aumentar o volume selecionado, sozinho, manteria os problemas demonstrados.

## Como a auditoria foi conferida

Usei a aplicação que atende o domínio público e transações de leitura na conta da operação. Cruzei recibo, produto e observação, executei `previewLivePauta` para cada canal e li a edição pública e os arquivos de preparação, cópia e confirmação. Na contagem histórica entram as preparações com validade registrada. A confirmação é a declaração do operador. O envio externo não foi observado. Comparei 16 arquivos do contêiner publicado com a cópia de trabalho por SHA-256. Os 33 testes locais de seleção, pauta e vitrine executados em quatro arquivos passaram.

O levantamento mede uma conta, todos os lotes manuais do dia até o corte e o histórico disponível para os exemplos indicados. A inspeção da página pública usou a resposta entregue a um visitante anônimo. Preferência de compra, conversão e facilidade de uso por pessoas ainda precisam de observação direta. As mudanças desta entrega são documentais no repositório. [Dados conferidos, horários, exemplos e arquivos comparados](evidencias-escolha-produtos-2026-11-18.json) · [Diário de mudanças](../../.conductor/tracks.md#diário-de-mudanças)
