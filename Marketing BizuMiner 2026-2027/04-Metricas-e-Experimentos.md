# Métricas e experimentos de divulgação do BizuMiner

Revisado em 09/10/2026 para o ciclo de carrosséis, imagens e stories.

## O que queremos aprender

Compreensão da proposta → interesse no serviço → visita → primeira ação útil → retorno.

A compra na loja e a comissão podem ser resultados posteriores. A primeira pergunta é se a comunicação faz pessoas conhecerem e experimentarem o BizuMiner.

## O que medir

| Sinal | Onde observar | Como interpretar |
| --- | --- | --- |
| Alcance | Estatísticas da publicação, se disponíveis | Quantas pessoas tiveram contato com a mensagem |
| Visitas ao perfil | Estatísticas que a plataforma fornecer | Interesse em saber quem é o BizuMiner |
| Compartilhamentos e salvamentos | Estatísticas de cada peça | Relevância percebida ou utilidade da explicação |
| Respostas e dúvidas | Stories, comentários e mensagens recebidas | Se a proposta e o uso ficaram claros |
| Cliques no link | Perfil ou story, conforme os dados disponíveis | Interesse em experimentar o serviço |
| Visitas ao site por origem | Medição do site, se existente | Se o caminho até o BizuMiner funciona |
| Ação no site | Eventos realmente implementados | Se a visita explora o que foi prometido |
| Retorno | Coortes, se houver medição adequada | Se o serviço começa a fazer parte da pesquisa de compra |

Não inventar dados ausentes. Cliques para a loja, receita, sessão engajada e retorno só entram no painel quando houver medição confirmada.

## Atribuição com cuidado

Um post do feed que manda ao link da bio não permite, por si só, atribuir cada visita àquela publicação. Há também outras peças e visitas ao perfil no mesmo período.

Para o feed, observar visitas ao perfil e resultados agregados da janela. Para stories que tenham link próprio, usar parâmetros específicos. Exemplo:

```text
utm_source=instagram
utm_medium=story
utm_campaign=apresentacao-bizuminer-ciclo01
utm_content=s1-03-primeiro-acesso
```

No link fixo da bio, usar identificação estável, por exemplo:

```text
utm_source=instagram
utm_medium=profile
utm_campaign=apresentacao-bizuminer-ciclo01
```

Parâmetros identificam a origem quando o site os registra; adicionar UTM não implementa analytics. Confirmar o que já é medido antes de prometer relatório por post.

## Três hipóteses de mensagem

| Hipótese | Abordagem | Sinais a observar |
| --- | --- | --- |
| Tempo de pesquisa | “Comece sua pesquisa mais organizada” | Interesse no perfil e visitas ao site |
| Contexto de preço | “Entenda a informação antes de decidir” | Compartilhamentos, dúvidas e visitas aos tutoriais |
| Facilidade para começar | “Veja o BizuMiner em poucos passos” | Dúvidas resolvidas e primeiro uso, se observável |

Os formatos têm papéis diferentes: não comparar automaticamente alcance de imagem de lembrança com salvamentos de tutorial para declarar um vencedor. As doze publicações iniciais geram indícios exploratórios, não um teste estatístico conclusivo.

## Ritual simples

Em 24 horas e sete dias, registrar para cada ID da pauta: formato, mensagem, alcance disponível, visitas ao perfil disponíveis, respostas e observações. Para links clicáveis e visitas ao site, registrar o que realmente pode ser atribuído.

Ao fim da semana, responder:

1. Qual dúvida apareceu mais?
2. Qual peça pareceu explicar melhor o serviço?
3. O perfil e o site entregaram o que o post prometeu?
4. Qual será a única melhoria da semana seguinte?

Ao fim do ciclo, decidir qual benefício aprofundar, qual explicação repetir e onde melhorar a primeira visita.

## Quando avaliar vídeo

Só considerar um teste se uma ação ficar difícil de explicar com capturas ou se houver interesse e tempo para experimentar outro formato. O vídeo mostrará o próprio site, conforme o [documento 05](./05-Producao-de-Videos.md).

O teste não é obrigatório após quatro semanas. Se ocorrer, comparar interesse, visitas e esforço de produção. Mais visualizações isoladas não justificam uma rotina que o dono não consegue manter.
