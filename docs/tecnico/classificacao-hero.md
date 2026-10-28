# Seleção da página inicial e classificação dos destaques

A política `home-v1` compõe uma edição compartilhada de até 24 produtos e até três destaques. A rubrica individual `hero-v2` continua separada da composição da página: ter boa nota individual não garante ocupar uma posição se a seleção já contém produtos semelhantes.

## Qualidade antes de variedade

Toda indicação respeita aprovação, publicação web e conta ativas, imagem, preço positivo observado em 48 horas e presença em sete dias. Uma avaliação existente nunca é apagada para transformar uma revisão negativa ou desatualizada em candidato automático.

As avaliações editoriais usam público (30%), utilidade (25%), valor (25%), confiança (10%) e clareza (10%). Dimensões fracas ou desconhecidas, dúvidas essenciais, mudança material do anúncio e preço acima do teto avaliado bloqueiam a indicação. Avaliações compatíveis anteriores continuam comparáveis; dados de variante, moeda, condições e estados da evidência também fazem parte da identidade material.

Sem avaliação, a seleção automática exige configuração confirmada, conteúdo e quantidade informados e preço exato. Um campo explicitamente marcado pela fonte como não aplicável é diferente de um dado ausente. Título e imagem não comprovam conteúdo ou variante. O painel indica o que falta e permite registrar uma avaliação completa com as limitações da compra explicadas.

O índice factual existente ordena evidências, sem inventar notas humanas de utilidade ou público. Avaliações editoriais válidas precedem esse índice; as duas escalas não são somadas. Desconto anunciado, preço riscado e vendas brutas não comprovam valor da oferta. Percentual positivo e estrelas mantêm suas unidades e amostras distintas.

## Composição e continuidade

Os parâmetros iniciais são hipóteses editoriais para acompanhar com dados de uso:

- Até dois produtos da mesma família em cada janela de 12 posições. Uma edição pode conter menos itens; a regra não é relaxada para preencher espaços.
- Penalidades graduais por concentração de família, categoria, marketplace e faixa de preço, sem cotas que obriguem incluir uma oferta inadequada.
- Até três destaques de famílias diferentes. Produtos sem família reconhecida permanecem independentes, sem um balde genérico de “outros”. O dicionário de famílias do projeto é reutilizado, com reconhecimento adicional de fones/earbuds para controlar repetição na home.
- Ordem e destaques preservados entre renovações, enquanto continuarem aptos. A renovação é diária, processada na próxima atualização do worker; na edição completa, até um quarto das posições pode receber produtos ainda não apresentados ou candidatos já conhecidos com evidências melhores que as dos itens substituídos. Invalidações podem exigir substituições adicionais.
- O histórico de apresentação usa identidade do produto. Atualizar a data da captura não cria novidade nem apaga exposições anteriores.

Edições manuais continuam respeitando destino, avaliação mais recente, vigência e retirada explícita. Uma edição vazia, vencida ou retirada não é preenchida automaticamente. A composição da home também organiza a seleção compartilhada, mantendo produtos exclusivos da pauta fora da disputa pelos destaques.

## Persistência e leitura pública

A migration `20261027030237_compose_homepage_editions.sql` acrescenta somente objetos privados do schema `garimpa`:

- `homepage_edition`: edição atual, produtos públicos e provas privadas usadas para revalidar sua origem.
- `homepage_product_history`: primeira apresentação de cada produto, para controlar descoberta.
- `homepage_engagement`: ações deduplicadas por visita, produto, superfície e posição.

A computação ampla acontece na atualização, dentro de uma transação com snapshot consistente e bloqueio por conta. A leitura pública consulta a edição guardada e revalida somente seus produtos: aprovação, conta/publicação canônica, última observação, título, imagem, categoria, fonte, avaliação e prazos. Alegações comparativas também guardam dependências das alternativas. Uma captura que substitui a observação retira o item até a atualização concluir; nunca conserva preço anterior como atual.

As funções públicas usam a role restrita existente, com `search_path` fixo e sem privilégios diretos nas novas tabelas. Políticas RLS e chaves por tenant protegem a edição, o histórico e o relatório. Evidências, avaliações e notas internas não entram no DTO público.

A grade inicial usa a mesma edição dos destaques. Busca, filtros e ordens explícitas continuam consultando o catálogo completo, com a mesma assinatura de estado. O link “Explorar catálogo completo” fica disponível no celular e desktop. A assinatura de versão é compacta e não retransmite os produtos. A home verifica a versão a cada cinco minutos enquanto visível, ao receber foco e no prazo local de validade.

## Atualização e ativação inicial

Os workflows existentes atualizam a edição depois da captura/triagem e do monitoramento, inclusive quando o lote não encontra produtos. Revisões no painel e capturas da extensão também solicitam atualização. Nenhum novo agendamento é criado.

A ativação inicial é explícita. Antes dela, o catálogo de transição permanece disponível, mesmo com a migration instalada. Atualizações rotineiras não inicializam a edição; o primeiro catálogo automático vazio também é recusado. Depois de inicializada, uma edição que perder todos os produtos permanece vazia até haver candidatos aptos ou uma nova decisão editorial.

Para ativar, primeiro complete evidências ou avaliações suficientes para uma seleção útil. Confirme a conta e a autorização de produção antes da migration e publicação. A interface permite preparar a edição e ativá-la. Pela CLI, a partir de `packages/web`:

```sh
# Prévia sem gravação, após instalar a migration no ambiente escolhido:
node --env-file=.env.local --experimental-strip-types bin/refresh-homepage.ts --tenant local

# Primeira ativação deliberada, somente após conferir a prévia:
node --env-file=.env.local --experimental-strip-types bin/refresh-homepage.ts --tenant local --execute --initialize

# Atualizações seguintes; este comando não inicializa uma conta por acidente:
node --env-file=.env.local --experimental-strip-types bin/refresh-homepage.ts --tenant local --execute
```

Instalar a migration não significa que a edição foi ativada. Sem a migration, a aplicação mantém a leitura anterior durante a transição. A primeira ativação pelo painel ocorre ao publicar uma edição editorial, sem atribuir autoria humana a avaliações automáticas.

## Interesse observado

A coleta exige um ticket assinado emitido pelo servidor para uma visita pública. Administradores não recebem ticket. Robôs conhecidos são ignorados, requisições exigem mesma origem, tamanho e quantidade limitados, e a persistência aceita somente produto e posição presentes na edição.

Uma exibição exige metade do cartão visível por um segundo, com aba visível. Desktop/mobile, carrossel e eventos repetidos compartilham deduplicação. Exibições são enviadas em lote; detalhes, salvamento e saída para loja podem antecipar o envio. Não há insert periódico quando a fila está vazia. Nenhum IP, e-mail, termo de busca ou identificador de conta do visitante é gravado nessa medição.

O relatório privado da seleção mostra contagens dos últimos sete dias por produto, superfície e posição; as taxas usam somente ações de visitas com exibição registrada. Abaixo de 50 exibições por posição, informa amostra insuficiente. Esse é um parâmetro inicial, não prova estatística de preferência. As taxas ainda não alteram automaticamente o ranking. Não representam compras ou conversão confirmada. A limpeza de registros antigos ocorre nas atualizações da edição, dentro da própria conta.

## Verificação

Os testes puros cobrem admissão, repetição, estabilidade, renovação, ausência de evidências, filtros e tickets. A suíte `tools/editorial-tests/homepage-flow.test.ts` executa serviços e SQL reais em PostgreSQL PGlite isolado, incluindo RLS, projeção pública, transição, inicialização explícita, expiração, retirada, preço alterado e deduplicação. A suíte editorial anterior continua verificando as decisões manuais e o modo de transição. A prévia de navegador utiliza dados fictícios e banco isolado; não comprova latência ou interesse do público em produção.

Para executar a verificação integrada: `npm run test:homepage --prefix tools/editorial-tests`.
