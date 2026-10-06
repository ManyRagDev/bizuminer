# Primeira entrega da integração editorial

Data: 05/10/2026. Código implementado, sem publicação externa. Migration validada em PostgreSQL isolado e aplicada ao banco conectado via MCP em 05/10/2026 às 23:55 UTC.

## Comportamento entregue

- A captura transporta `OfferEvidence` opcional e atribuída à fonte, preservada por observação. Campos ausentes continuam desconhecidos. Repetição na mesma rodagem não reaproveita evidência se título, URL, preço, imagem ou categoria mudarem.
- A mesa `/admin/curadoria` separa aprovação no catálogo, avaliação do destaque e seleção vigente. A avaliação registra níveis e motivos para público, utilidade, valor, confiança e clareza; público, benefício, conteúdo da compra, justificativa pública, dúvidas e preço máximo aceitável são explícitos.
- Avaliações são anexadas com autor, horário real de inserção, versão da rubrica, fingerprint e snapshot. Uma nova avaliação suspende o destaque baseado na anterior até ativar uma seleção que use a revisão atual.
- A seleção permite até 24 produtos, ordem definida pelo editor, vigência, destinos e contexto para diferenças entre home/pauta. Substituição usa transação, lock por conta e versão esperada. Retirar destaque não rejeita o produto.
- Carrossel global, prioridade inicial do catálogo e pauta usam seleção persistida; filtros e paginação não escolhem os destaques. Ordenações explícitas por preço, vendas ou atualização respeitam o pedido da pessoa. Não há intercalação obrigatória por marketplace.
- A pauta conserva os links afiliados/reduzidos existentes, apresenta justificativa e conteúdo da compra. Cópias continuam locais ao aparelho, agrupadas no dia de São Paulo, sem afirmar postagem.
- Home e detalhe apresentam “Por que indicamos”/justificativa e “O que vem” apenas quando o produto participa de uma seleção válida. O catálogo geral é identificado como catálogo.

## Regras de validade

Um destaque exige aprovação vigente, imagem, preço positivo observado nas últimas 48 horas, presença nos últimos sete dias, avaliação atual da política `achadinhos-v1`, fingerprint compatível, preço dentro do limite avaliado e nenhuma dimensão fraca/desconhecida ou dúvida essencial aberta. Faixa de preços de variantes impede destaque até obter evidência do preço da configuração exata. A ativação e as leituras públicas verificam esses critérios.

Sem identidade confirmada da configuração, mínimos anteriores e selo de menor preço não são apresentados como comparação verificável. O histórico genérico do anúncio permanece disponível. A comparação exige configuração conhecida e igual em todas as observações usadas (variante, quantidade, conteúdo e dimensões), sem faixa ambígua. Registros legados desconhecidos tornam a comparação conservadora; não foram reescritos ou inferidos.

## Evidências disponíveis por fonte nesta entrega

| Fonte | Dados adicionais efetivamente preenchidos | Limite |
|---|---|---|
| Shopee | Origem/data/URL e preços mínimo/máximo declarados | Faixa não identifica variante. `priceMax` não vira preço riscado; somente desconto declarado válido pode derivar o preço de referência. |
| AliExpress | Origem/data/URL e taxa positiva de avaliações disponível | Taxa positiva não é nota em estrelas nem quantidade de avaliações. |
| Mercado Livre | Origem/data/URL da captura existente | Nenhum caminho de captura foi reativado. Conteúdo/variante não são inferidos. |

Descrição, conteúdo do pacote, quantidade, dimensões, identificação de variante e contagem de avaliações têm contrato opcional; os adapters atuais não confirmam esses dados. A revisão humana registra o conteúdo da compra e suas evidências, mas não cria automaticamente identidade de variante nem ignora faixas de preço.

## Banco e publicação

Arquivo: [migration](../../packages/persistence/supabase/migrations/20261005235546_editorial_selection.sql). Adiciona `price_observation.offer_evidence` e três tabelas editoriais. Não altera decisões do catálogo, links ou observações anteriores. Relações por conta e constraints evitam mistura de tenant/produto/avaliação; novas tabelas têm RLS e acesso apenas pelo servidor `garimpa_app`, com avaliações/itens sem UPDATE ou DELETE concedidos.

A migration foi aplicada via MCP ao projeto `spbuwcwmxlycchuwhfir` com a versão `20261005235546`. O arquivo local foi renomeado para corresponder ao histórico efetivamente registrado pelo MCP, sem duplicar migrations.

A inspeção prévia encontrou privilégios padrão `SELECT/INSERT/UPDATE/DELETE` para tabelas novas de `garimpa_app`. A migration revoga esses grants nas três tabelas novas antes de conceder apenas os necessários; a fixture passou a reproduzir essa configuração. No destino foram confirmados RLS, constraints validadas, ausência de acesso anon/authenticated e ausência de UPDATE/DELETE em avaliações/itens (a seleção admite UPDATE para encerramento de versão). Nenhum novo alerta de segurança foi identificado para essas entidades.

Contagens antes/depois: 1.958 produtos, 11.372 observações e 1.958 estados de curadoria, sem alteração pela migration. Os serviços reais com a credencial `garimpa_app` retornaram `schemaReady=true` e 238 candidatos; zero avaliações e seleções. Home e pauta estão prontas para consumir a primeira seleção supervisionada.

Para concluir a transição editorial:

1. Revisar os candidatos e registrar avaliações com evidências conferidas.
2. Preparar e ativar a primeira seleção supervisionada na mesa `/admin/curadoria`.
3. Conferir versão, ordem, justificativa e conteúdo na home/pauta/detalhe. A ativação de produtos reais no navegador continua pendente da revisão humana.
4. Publicar a aplicação e as capturas conforme o fluxo de entrega do projeto. A aplicação da migration não fez deploy do código.

Sem schema ou sem seleção vigente, o web mantém o catálogo geral disponível e não preenche carrossel/pauta por pontuação antiga. Falhas de banco não são convertidas silenciosamente em sucesso.

## Verificação executada

- Captura: oito arquivos de teste passaram; typecheck passou.
- Persistência: oito arquivos de teste passaram; typecheck passou.
- Web: 238 testes passaram, incluindo 12 testes da nova rubrica; typecheck e build passaram. Os testes de QR foram executados fora do sandbox restrito para permitir leitura de interfaces de rede.
- PostgreSQL isolado: 18 cenários executaram a migration e SQL dos serviços reais, incluindo permissões, tenant, snapshots, validade, revisão substituída, preço/configuração/confiança, destinos, conflito, rollback, ranking, filtros e paginação.
- Banco conectado: migration registrada e schema/permissões conferidos; leitura dos serviços reais reconheceu a estrutura.
- Navegador local: ordenação por preço e segunda página, detalhe, estado da mesa antes da migration, pauta vazia e encaixe mobile; sem erro de execução observado após reiniciar o servidor de desenvolvimento antigo. A seleção com produtos reais ainda depende da revisão humana.

Verificador reproduzível: [tools/editorial-tests](../../tools/editorial-tests/README.md).

```bash
npm ci --prefix tools/editorial-tests
npm test --prefix tools/editorial-tests
```

PGlite usa uma sessão e fixture das entidades anteriores; não comprova concorrência entre conexões, pooler ou aplicação remota. Os locks, a versão esperada e a transação foram implementados, mas a verificação com conexões simultâneas reais permanece pendente.

## Próximas entregas do plano

A integração supervisionada não conclui a calibração humana, a nova avaliação por IA, a orquestração durável, o acompanhamento prioritário da seleção, o ajuste das consultas de captura nem o registro sincronizado de preparação/divulgação. Esses itens continuam no [plano](./plano-integracao-captura-curadoria-vitrine-pauta.md), fases 0/2/4/5. A Bússola e a triagem existentes não foram transformadas silenciosamente em autoridade da política nova.

## Atualização: classificação relativa da hero

A política `hero-v2` substitui o corte de qualidade por ranking relativo. Antes da primeira edição editorial, os melhores do catálogo aprovado já preenchem home e pauta pelo mesmo serviço; depois da ativação, a edição controla ambas. Não são fabricadas avaliações ou autorias. Regras de validade, revisões negativas e retirada explícita continuam prevalecendo. Operação e verificação atualizadas: [classificação da hero](./classificacao-hero.md).
