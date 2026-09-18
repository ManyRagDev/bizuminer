# Investigação da curadoria — 08/09/2026

Estado: diagnóstico e proposta para discussão; nenhuma alteração funcional, decisão editorial ou configuração de produção foi aplicada nesta investigação.

## Conclusão

O BizuMiner já tem componentes úteis: estados editoriais, eventos de decisão, snapshots, histórico de preços, famílias, revisão em lote e diretriz configurável. Falta um contrato comum que distinga adequação do produto, vantagem da oferta e escolha do que publicar hoje. Hoje, desejabilidade pode virar aprovação sem evidência suficiente de valor; a captura não fecha o ciclo com a triagem; e o retorno humano ainda não constitui um aprendizado confiável.

A recomendação é curadoria por exceções, com automação progressiva por categoria e evidência. O humano define padrões, julga ambiguidades e audita resultados. O sistema reúne evidências, elimina repetição, prepara decisões e reavalia quando preço ou contexto mudam.

## Evidência e limites

Leitura do working tree, incluindo mudanças ainda não commitadas, e consultas SELECT ao banco configurado em `packages/web/.env.local`, tenant `local`, dentro de transação READ ONLY. Auditoria: 08/09/2026, 11h24 de Brasília. O código local não foi comparado com o artefato exato do deploy. A consulta pública via ferramenta web não foi concluída; não houve verificação visual da interface publicada.

O grafo existente foi consultado para orientação; suas referências de curadoria são antigas e insuficientes para o pipeline novo. A execução do Python configurado do graphify estava indisponível; a leitura do JSON e de vizinhos foi feita em PowerShell. Os achados abaixo derivam dos arquivos atuais e do banco, não de suposições do grafo. Vocabulário pertinente encontrado: curadoria, editorial, vitrine.

Não foi identificado com segurança o produto específico do relato dos brincos e pulseira. O exemplo foi usado como requisito de comportamento, sem atribuir ao registro errado.

## 1. Por que só aparecem 13 produtos

| Estado atual | Total | Vistos nos últimos 7 dias |
|---|---:|---:|
| Legado (`legacy_visible`) | 499 | 37 |
| Pendente | 269 | 269 |
| Em espera | 88 | 56 |
| Aprovado | 34 | 13 |
| Rejeitado | 19 | 1 |
| Total | 909 | 376 |

A página comporta 24 produtos. A política pública exige `approved` e `last_seen_at` dentro de sete dias; a query padrão também restringe a última observação a sete dias. Nesta auditoria, ambas as contagens coincidem: 13. Os outros 21 aprovados estão fora da validade. Os 499 legados não são públicos, apesar do nome do estado sugerir visibilidade.

Fontes: [política](../../packages/web/lib/catalog-policy.ts), [query pública](../../packages/web/lib/db.ts), [paginação](../../packages/web/lib/deal-query.ts).

Dos 269 pendentes recentes, 266 atendem à seleção da triagem automática e três possuem evento anterior de automação. Há 185 pendentes sem família reconhecida (69% da fila recente). O agrupamento existente, portanto, ainda não reduz a maior parte do trabalho.

Não convém aumentar a janela ou aprovar em massa apenas para encher a vitrine. A recuperação deve vir de ofertas qualificadas e da atualização prioritária dos produtos que já provaram interesse editorial. Aprovação antiga não garante que o preço atual continue bom.

## 2. O que os painéis realmente fazem

`/admin/curadoria` é a mesa de decisões, com individuais, grupos, espera e aprendizados. `/admin/direcionamento` configura a diretriz, o limiar de autopublicação e acompanha lotes/auditoria. Os dois acionam `runPendingAutomatedTriage`. São duas experiências operacionais sobre o mesmo pipeline, não dois motores independentes de avaliação.

Existe ainda a curadoria da pauta de stories (`lib/curation.ts` e `/api/pauta`), com outro prompt/modelo e reordenação de produtos já elegíveis. Ela não resolve a aprovação do catálogo. Nessa implementação, o prompt pede IDs, mas a lista formatada fornece números de posição sem os IDs reais; o retorno é buscado por ID. É um defeito adicional a corrigir na distribuição, separado da causa dos 13 produtos.

O código examinado liga a triagem aos botões dos painéis; não foi encontrado acionamento por conclusão da ingestão nos fluxos de captura examinados. A opção `auto_publish=true` controla o destino dos resultados quando a triagem executa; não cria por si só um trabalhador que processa a fila.

## 3. Problemas que impedem uma metodologia confiável

### Desejabilidade não demonstra oportunidade

O payload da IA contém ID, título, categoria e preço formatado. Não inclui imagem, comparáveis, histórico, custo total, condição do cupom ou variante. O prompt privilegia novidade, utilidade e compra por impulso; a resposta tem uma nota de 1 a 5. Com autopublicação habilitada, nota maior ou igual ao limiar pode virar `approved`.

Na configuração consultada, autopublicação está ligada e o limiar é 4. A diretriz é “Foco em utilidades práticas de casa, cozinha e gadgets.” Isso não demonstra que o mecanismo chegou a publicar: não há eventos de aprovação LLM no banco consultado.

Fontes: [pipeline](../../packages/web/lib/curation-pipeline.ts), [contrato IA](../../packages/web/lib/ai-curation-contract.ts), [prompt](../../packages/web/lib/ai-curation-service.ts).

### Não há evidência de uma comparação real entre motores

Todos os 44 eventos `actor_type=llm` pertencem a `bootstrap-clean-v1`: 32 retenções e 12 rejeições. O script `curate-initial-catalog.ts` usa regras e decisões predefinidas e registra ator LLM. A política nova `ai-triage-v1` tem 54 retenções e três rejeições por regras, sem eventos semânticos registrados.

Isso não prova que nenhuma chamada ao provedor foi tentada: ausência de chave, falha de API ou ausência de resultados podem não gerar evento por produto. Prova que os eventos disponíveis não permitem medir o desempenho semântico do pipeline novo. O primeiro diagnóstico de execução deve registrar tentativas, falhas e cobertura, sem confundir uma limpeza pontual com inferência do modelo.

### Aprendizado humano incompleto

- `getGoldenExamples` limita a seis exemplos depois de ordenar por ID de produto e evento, não por recência global ou semelhança com o candidato.
- O prompt transforma toda decisão diferente de `approved`, inclusive `held`, em “REJEITADO”. Saturação ou preço ruim temporário podem ensinar aversão ao próprio produto.
- O preço dos exemplos não entra no prompt; a correção “interessante, mas caro” perde um dado essencial. O spot-check também não usa o snapshot completo das outras decisões.
- A seleção ignora qualquer candidato com evento anterior de regra/LLM, sem verificar mudança de política ou evidência. Mudar a diretriz não reprocessa o acervo automaticamente.
- A auditoria seleciona as últimas aprovações automáticas; não mede sistematicamente os rejeitados ou retidos. Nesta auditoria não há eventos `spotCheckReject`.

Fonte: [bússola editorial](../../packages/web/lib/editorial-compass.ts), [seleção e aplicação](../../packages/web/lib/curation-db.ts).

### Regras e famílias misturam conceitos

O piso de R$20 retém produtos como `weak_offer`, embora preço baixo sozinho não demonstre oferta fraca. A exclusão por nota inferior a 4 não considera quantidade de avaliações. As famílias são amplas (cozinha, áudio, organização); não demonstram equivalência comercial. Os representantes são escolhidos por sinais como nota e vendas, sem comparação de valor/preço.

A saturação do pipeline olha apenas o lote recebido. Assim, lotes diferentes podem publicar mais representantes da mesma família; e uma família ampla pode ocultar produtos com usos diferentes antes da análise semântica. Deduplicação, comparação de preço e diversidade editorial precisam de agrupamentos distintos.

### Observabilidade e validade precisam fechar o ciclo

Lotes são reconstruídos por minuto do evento, sem um identificador persistido de execução. Isso dificulta explicar tentativas sem resultados e comparar políticas. O parsing da resposta IA verifica se é array, mas não valida integralmente em runtime a correspondência de IDs, duplicações, cobertura, tipos e limites.

Há também uma inconsistência potencial de frescor: a política afirma que uma nova captura sem mudança de preço renova `last_seen_at`, mas `topDeals` aplica adicionalmente o timestamp da observação. Não causou perda extra nesta auditoria; deve ser testada na manutenção de ofertas com preço estável.

## 4. Metodologia recomendada

### Três decisões separadas

1. **Produto:** combina com o público, resolve algo relevante, tem qualidade/evidência suficiente e possui diferencial?
2. **Oferta:** neste preço e nestas condições, existe vantagem verificável ou um valor editorial justificável?
3. **Publicação:** merece espaço hoje, considerando diversidade, atualidade e alternativas já publicadas?

Um produto interessante pode aguardar preço melhor. Um produto comum pode merecer publicação por uma oferta excepcional. Um produto excelente pode aguardar porque já há equivalente melhor na vitrine. A decisão deve preservar esses motivos separadamente.

Para o conjunto de brincos/pulseira acima de R$100: verificar atributos, material, quantidade, comparáveis e adequação ao público. Se só há beleza ou aparente valor intrínseco, falta uma razão para chamar de achado. Não inventar teto universal de R$100; usar contexto por tipo e um preço-alvo quando houver fundamento.

### Funil operacional

Captura orientada → normalização e deduplicação → adequação editorial → evidência de valor → proposta de seleção → revisão de exceções/auditoria → publicação → acompanhamento de preço e resultado.

Três destinos visíveis ao operador:

| Destino | Condição | Trabalho humano |
|---|---|---|
| Pronto para seleção | Adequação e valor sustentados; sem alertas materiais | Revisão em mosaico inicialmente; automação por segmento após validação |
| Precisa de julgamento | Preço ambíguo, novidade, evidência insuficiente, divergência | Mostrar dúvida específica e evidências comparáveis |
| Fora da seleção atual | Inadequado, saturado, caro ou sem prioridade | Auditoria amostral; retorno por gatilho quando aplicável |

Manter regras rígidas para impedimentos claros e integridade dos dados. Preferências como ticket, categoria e repetição devem ser configuráveis e geralmente reversíveis. A IA pode se abster: “não há evidência suficiente” precisa ser uma resposta válida.

Comparação exige distinguir mesmo SKU/variante, equivalentes funcionais e mera semelhança visual. Comparar custo total disponível, quantidade, tamanho/capacidade, frete, impostos e restrições. Campo ausente não vale zero. Histórico raso não impede toda descoberta editorial, mas impede afirmação de desconto comprovado e restringe autopublicação.

### Rotina com orçamento de atenção

Hipótese inicial para o piloto: 10–15 minutos por dia, ajustáveis após medir. Uma mesa única apresenta uma seleção curta e visual, 5–10 exceções prioritárias e uma pequena amostra de aprovados e descartados. Os números são metas de desenho, não produtividade já comprovada.

A correção humana deve oferecer motivos com efeitos diferentes: “caro neste preço”, “não combina com o público”, “falta evidência” e “já temos equivalente melhor”. “Caro” pode registrar preço-alvo; “saturado” pode voltar quando a seleção mudar. O backlog antigo não deve virar uma obrigação de zerar tudo: preservar para busca/histórico e priorizar reaparição, mudança relevante ou demanda.

Para reduzir miopia, combinar amostra aleatória com casos de fronteira, categorias novas e divergências. Registrar como a amostra foi escolhida; não tratar a taxa de erro de uma amostra concentrada em casos difíceis como taxa global. A nota/confiança declarada pela IA não é uma probabilidade calibrada de acerto.

## 5. O que aproveitar dos concorrentes

O [Promobit](https://www.promobit.com.br/institucional/criterios-de-moderacao/) descreve avaliações separadas de confiabilidade, preço, duplicidade e validade. Usa histórico e comparação com outras ofertas; permite solicitar reavaliação de uma recusa.

O [Slickdeals](https://slickdeals.net/corp/how-slickdeals-works/) combina interesse/votos da comunidade com editores que verificam histórico, avaliações e disponibilidade. Seus editores têm especialização por categoria.

As fontes públicas sustentam processos híbridos, mas não revelam os algoritmos internos completos, custos ou uso atual de IA. Não há fundamento para afirmar que tenham eliminado a conferência humana. Para o lançamento do BizuMiner, que ainda não conta com comunidade em escala, a adaptação é evidência + padrões editoriais + revisão concentrada, sem depender de votos para funcionar.

## 6. Sequência proposta até o lançamento

### Entrega 1 — tornar o fluxo observável e corrigir semântica

- Execução persistida com ID, contagens de entrada/saída/falha, versão de política/modelo/prompt e custo/latência quando disponíveis.
- Diferenciar regra, importação/limpeza, IA e decisão humana; não reescrever silenciosamente a auditoria histórica.
- Corrigir exemplos, preservar `held`, incluir contexto/preço da decisão e validar respostas IA.
- Preparar reavaliação por versão/evidência, idempotência, proteção de decisão humana e fila com tentativas limitadas.
- Unir os painéis como abas de uma operação: seleção de hoje, exceções, auditoria e critérios.

Saída verificável: um lote pode ser rastreado da entrada ao resultado, inclusive se a IA falha. A mudança de política seleciona os casos afetados e não repete chamadas indefinidamente.

### Entrega 2 — calibrar valor com uma amostra pequena e útil

- Escolher 2–3 segmentos dentro de casa/cozinha/gadgets, já indicados pela diretriz, onde exista comparação viável.
- Montar aproximadamente 40–60 casos variados, incluindo barato porém ruim, caro porém adequado, bonito mas sem vantagem, útil comum, duplicado e novidade sem histórico. Essa é uma amostra inicial, não prova estatística de automação segura.
- Aproveitar decisões humanas anteriores depois de conferir sua qualidade; completar os casos que faltam em sessões curtas.
- Separar exemplos de orientação e conjunto reservado de avaliação. Comparar regra atual e proposta nos mesmos casos, sem publicá-los automaticamente.
- Medir aprovação indevida, achado perdido, abstinência, cobertura e minutos humanos. Revisar limites por segmento, não apenas uma nota média global.

Saída verificável: melhora contra a base atual no conjunto reservado, revisão dos erros relevantes e orçamento de atenção viável. Se a evidência não sustenta automação, manter aprovação visual rápida para esse segmento.

### Entrega 3 — abastecer e operar o catálogo

- Acionar triagem em trabalho de fundo após captura, com limites e recuperação de falhas.
- Priorizar manutenção dos 34 aprovados, verificando quais dos 21 antigos ainda são boas ofertas; recapturar pelas fontes já autorizadas e suportadas.
- Processar os pendentes recentes em lotes rastreáveis, fazendo o sistema preparar a seleção.
- Criar gatilhos de retorno por queda de preço, nova evidência, alteração editorial e mudança de saturação.
- Mostrar no painel o funil e os motivos de saída; usar achados qualificados para abastecer a vitrine, sem cota que obrigue a publicar ofertas fracas.

Saída verificável: capturas novas chegam à seleção sem depender de botão, exceções cabem na rotina e itens expirados não permanecem anunciados como atuais.

### Entrega 4 — liberar automação gradualmente e preparar venda do workflow

Liberar somente segmentos com evidência e qualidade observada suficientes. Manter teto de publicação, auditoria dos dois lados e retorno à revisão quando a qualidade cair. Os limiares devem ser pactuados após a amostra; não prometer uma taxa de acerto com base em poucos exemplos.

Para o cliente final, o produto é uma seleção útil com preço/condições claros e uma explicação concreta de por que vale olhar. Para o comprador do workflow, o produto é um processo configurável, auditável e econômico: público, critérios, exemplos, fontes, rotina e resultados por cliente.

Registrar desde já essas configurações e decisões por tenant, mas validar a operação da própria marca antes de ampliar para um SaaS completo. O teste comercial posterior é um segundo operador conseguir usar o método em outro nicho sem correções de código a cada preferência.

## 7. Métricas de sucesso

Tempo humano por seleção publicável; minutos de revisão diária; custo de IA por seleção; latência captura→decisão; cobertura da triagem; fração publicada sem revisão; aprovados indevidos na auditoria; bons candidatos encontrados entre os descartados; diversidade; oferta desatualizada; correções por motivo e segmento.

Cliques, salvamentos e conversões ajudam a entender demanda, mas devem ser relacionados à exposição e à posição. Não usar clique isolado como prova de qualidade: curiosidade e títulos exagerados também atraem atenção. Separar interesse comercial e validação da oferta.

Não recomendo fine-tuning como primeira entrega. Antes disso, o ganho provável está na qualidade das evidências, recuperação correta de exemplos, separação das decisões e medição do fluxo completo.

## 8. Requisito reforçado pelo dono: atualidade e abastecimento

O dono explicitou que divergência entre preço divulgado e preço encontrado na loja é um risco central do produto. Também exige capacidade de descobrir volume suficiente de itens novos e qualificados. Esses requisitos passam a anteceder a liberação de autopublicação; não são otimizações posteriores.

### Achados adicionais no código

- `capture-plan.ts` usa dez consultas, uma página por consulta, teto de oito itens novos por consulta e cinco por família. O teto teórico do plano padrão é 80 novos por marketplace, frequentemente menos por repetição, saturação, retorno da fonte e outros descartes. Produtos conhecidos podem ser atualizados além do limite de novos.
- Os adaptadores de AliExpress e Shopee pedem por padrão 50 resultados por página. Portanto, “poucos gravados” não significa necessariamente “poucos retornados pela API”. Não foram auditadas nesta etapa as contagens específicas da última rodagem relatada pelo dono.
- A ingestão admite os primeiros novos que cabem nos limites, na ordem recebida, antes de uma comparação editorial. Se esses forem reprovados posteriormente, os candidatos seguintes descartados pelo teto não são recuperados nessa mesma execução.
- A CLI permite mais páginas, mas aumentar páginas sem mudar o teto de oito novos por consulta não aumenta esse teto. A interrupção por saturação também pode encerrar a consulta.
- Na Shopee, o código fixa `sortType: 2`, documentado localmente como ordenação por comissão. A correspondência atual desse valor deve ser verificada com a documentação oficial antes de mudar a chamada. O critério de aquisição precisa favorecer valor e adequação, sem comissão comandar a seleção.
- O `/go` usa resolução e dados persistidos; não confirma novamente preço/estoque na fonte antes do redirecionamento. O contrato `CaptureAdapter` examinado não expõe atualização direcionada por produto/variante. Isso precisa ser projetado e validado por fonte, não presumido pela existência de uma API de busca.
- O link curto `/p/<code>` já leva à página própria do produto, o que permite apresentar estado atualizado ou encerramento. É uma base útil para proteger links antigos.

Fontes: `packages/persistence/src/capture-plan.ts`, `packages/persistence/src/ingest.ts`, `packages/persistence/bin/sweep-aliexpress.ts`, `packages/capture/src/types.ts`, adaptadores de AliExpress/Shopee, `packages/web/app/go/[slug]/route.ts` e `packages/web/app/p/[code]/route.ts`.

### Atualidade como condição de mostrar preço e comprar

Separar a adequação editorial, que pode durar, da validade comercial da oferta, que expira rapidamente. Sete dias podem servir para memória do catálogo, mas não devem autorizar tratar preço como atual.

Proposta:

1. Criar capacidade de atualização direcionada por fonte, incluindo preço, disponibilidade, moeda, variante/quantidade, condições e URL. Fazer prova de viabilidade com as credenciais reais e medir divergência API→loja. A fonte pode ter atraso próprio; requisição recém-executada não prova preço atual do checkout.
2. Manter uma fila prioritária para ofertas publicadas, destacadas, compartilhadas e mais clicadas, com orçamento de requisições reservado. Descoberta não pode consumir os recursos que mantêm a vitrine confiável.
3. Definir prazo curto de confirmação por fonte e volatilidade, medido em minutos/horas conforme a evidência e a capacidade disponível. Não escolher um número universal antes da prova de viabilidade.
4. Antes de publicar ou gerar material, confirmar novamente as condições. Durante exibição prolongada, invalidar/atualizar cards quando a oferta mudar. No caminho de compra, revalidar conforme a política de validade e a capacidade da fonte, agregando requisições simultâneas do mesmo produto.
5. Mudança de preço atualiza a página e reavalia se ainda há vantagem; não herdar aprovação comercial indefinidamente. Se houve mudança depois que o visitante viu o preço, apresentar a mudança antes da saída para a loja, evitando redirecionamento silencioso.
6. Falha, timeout ou evidência vencida: não apresentar o preço antigo como vigente nem manter CTA automático que implique a oferta antiga. Mostrar indisponibilidade de confirmação/encerramento e alternativas confirmadas. Preservar página explicativa para links antigos, em vez de simplesmente devolver erro sem contexto.

Não é possível garantir identidade absoluta com checkout de terceiro sem controlar a oferta. Ela pode mudar entre consulta e compra, ou depender de CEP, login, primeira compra, variante, cupom e impostos. A promessa operacional controlável é não publicar como atual um preço sem confirmação válida e condições conhecidas. Para uma exigência absoluta de igualdade, limitar a divulgação de preço às fontes/ofertas capazes de sustentar esse contrato; as demais ficam fora da publicação com preço exato.

Nos materiais enviados, distinguir página dinâmica de imagem/texto já distribuído. Atualizar o site não modifica os pixels de um story ou imagem já enviada. A opção mais consistente com a exigência rígida é não colocar preço exato em materiais permanentes: destacar o produto e encaminhar ao preço atual na página própria. Se houver preço em uma peça, tratá-lo como observado no momento indicado, confirmar imediatamente antes de gerar e levar o clique à página que informa mudança/encerramento. Isso reduz confusão, mas não elimina a divergência visual em peças antigas e precisa ser aceito como trade-off editorial explícito.

### Descoberta orientada a rendimento, com volume controlado

Ampliar o conjunto de candidatos antes da curadoria, mantendo separados os limites de coleta, avaliação IA e publicação. Aumentar volume de coleta não deve aumentar proporcionalmente a fila humana.

- Guardar candidatos normalizados com custo baixo, inclusive os que ainda não ganharam orçamento de análise; aplicar deduplicação por identidade/variante e descarte técnico antes de gastar com IA.
- Substituir admissão por ordem de chegada por seleção comparativa entre candidatos, sem eliminar alternativas úteis por famílias amplas.
- Paginar e diversificar consultas enquanto surgem candidatos únicos promissores. Parar por orçamento, falha da fonte ou baixo rendimento marginal, registrando o motivo.
- Medir por consulta: retornados → válidos → únicos → armazenados → avaliados → aprovados → publicados. Separar reprovação editorial de limite de ingestão, repetição, falta de evidência e falha técnica.
- Realocar consultas que repetidamente entregam itens caros/inadequados; preservar exploração para não estreitar o catálogo apenas ao que o sistema já conhece.
- Se um lote não render publicação, buscar outro conjunto dentro do orçamento e das regras da fonte. Não diminuir os critérios para cumprir uma cota de ofertas.

Exemplo apenas de dimensionamento: para obter 20 candidatos aprovados com rendimento medido de 5%, seriam necessários aproximadamente 400 candidatos únicos avaliáveis. Se forem 10%, aproximadamente 200. O custo de atualização dos itens já publicados deve ser reservado antes de definir esse orçamento. Não há garantia de rendimento ou de quantidade diária.

### Revisão da ordem de entrega

A primeira entrega passa a reunir diagnóstico observável do funil e prova de atualização por fonte. Depois vêm proteção da página/clique/compartilhamento e fila de manutenção. A ampliação da descoberta e a calibração editorial avançam sobre esse contrato; autopublicação só é liberada quando atualidade e qualidade estiverem demonstradas.

Critérios de aceite adicionais: preço expirado não aparece como vigente; alteração/falha é tratada antes da compra; atualização sem mudança de preço renova evidência corretamente; condições e variante são consistentes; links antigos explicam mudança/encerramento; descoberta não atrasa manutenção; rodagem sem novidade mostra a razão e o próximo movimento do sistema. Incluir testes controlados de aumento de preço, estoque encerrado, timeout, variante divergente e material compartilhado antigo, além de amostra real por fonte.
