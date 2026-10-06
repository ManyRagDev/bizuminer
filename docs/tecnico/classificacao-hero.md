# Classificação dos melhores produtos para a hero

A política `hero-v2` escolhe até três melhores produtos disponíveis por posição relativa. Não existe nota mínima de 90 nem exigência de todas as dimensões fortes. A nota organiza os candidatos; validade da oferta e decisões editoriais continuam sendo requisitos.

## Avaliação editorial

| Critério | Peso |
| --- | --- |
| Adequação ao público | 30% |
| Utilidade ou interesse | 25% |
| Valor da oferta | 25% |
| Confiança | 10% |
| Clareza da compra | 10% |

Os níveis mantêm seus descritores em `hero-policy.ts`: desconhecido = sem nota; fraco = 20; adequado = 60; forte = 80; excepcional = 100. A soma ponderada permite comparar os produtos. Todas as dimensões adequadas resultam em 60/100 e todas fortes em 80/100; ambos podem ocupar a hero se estiverem entre os melhores disponíveis.

A política v2 altera a admissão, mantendo as dimensões anteriores. Avaliações `hero-v1` e avaliações sem versão específica da hero continuam comparáveis. Novas gravações usam `hero-v2`; uma versão desconhecida exige revisão, sem reetiquetar avaliações históricas.

A indicação precisa continuar aprovada, com imagem, preço positivo observado em 48 horas e presença em sete dias. Avaliação inválida, mudança material do anúncio, dúvida essencial, dimensão fraca/desconhecida ou preço acima do teto aceito suspendem a indicação. O preço pode subir dentro do máximo explicitamente avaliado sem criar um impedimento exclusivo da hero. O snapshot permanece imutável e não é um campo aceito do formulário.

Dentro de uma edição ativa, a hero compara todos os itens válidos destinados à home. Nota decrescente, posição editorial e ID resolvem a ordem. Os três primeiros aparecem; produtos destinados apenas à pauta não competem pela hero. A ordem geral da edição permanece editorial.

## Antes da primeira edição

A leitura pública também funciona quando ainda não existe edição editorial: classifica o catálogo aprovado completo e fornece os mesmos três produtos para home, pauta e detalhe. É uma projeção calculada, sem inserir avaliações, atribuir autoria humana ou inventar uma versão publicada.

Avaliações editoriais válidas têm prioridade. Produtos sem avaliação são ordenados por um índice separado de evidências disponíveis. Essas escalas não são comparadas como se medissem a mesma qualidade:

| Sinal do catálogo | Pontos possíveis | Restrição |
| --- | --- | --- |
| Menor preço e redução no histórico | 35 | Somente histórico da mesma configuração comprovada; preço riscado e desconto anunciado não pontuam. |
| Avaliações do marketplace | 25 | Estrelas ou percentual positivo, mantendo suas unidades distintas; amostra desconhecida reduz o peso pela metade, amostra de 0–20 aumenta gradualmente o peso. |
| Clareza informada na fonte | 25 | Conteúdo do pacote (12), quantidade (3) e configuração identificada (10). |
| Histórico suficiente | 10 | Configuração comparável, ao menos três observações em sete dias. |
| Vendas informadas | 5 | Crescimento logarítmico com teto; popularidade não determina sozinha o ranking. |

Dados ausentes não recebem pontos. Preço absoluto, categoria, ticket médio, marketplace e percentual anunciado não dão bônus. Sem sinais extras, um produto com oferta válida ainda pode ser o melhor disponível: não existe corte mínimo do índice.

O índice não atribui notas de público ou utilidade e não comprova qualidade. É o ponto de partida até registrar avaliações pela rubrica. Na conferência inicial, havia 238 candidatos aprovados recentes, 151 preços observados em 48 horas e nenhuma avaliação detalhada, edição ou evidência estruturada de configuração. Por isso, o ranking atual depende principalmente de avaliações e vendas informadas; referências comparáveis e conteúdo do pacote poderão melhorar a classificação conforme forem capturados.

Uma avaliação existente é respeitada: produto com revisão negativa, incompleta ou desatualizada não volta à disputa como se nunca tivesse sido avaliado. A apresentação automática usa apenas sinais observados e identifica o marketplace como fonte; não afirma conteúdo do pacote ausente nem deduz conteúdo pela imagem.

**Depois da primeira ativação, a edição editorial passa a controlar as superfícies.** Uma edição explicitamente vazia, vencida, retirada ou cujos produtos foram invalidados não é preenchida pelo catálogo. Essa regra preserva a decisão do editor de retirar os destaques.

## Operação e atualização

A mesa mostra a origem da classificação: avaliação editorial ou sinais do catálogo. Os pontos de evidência não aparecem como nota de qualidade. A prévia inicial reproduz os destaques públicos; ao preparar um rascunho, passa a mostrar a próxima edição destinada à home.

O botão Preparar os 3 melhores candidatos usa avaliações válidas para montar um rascunho local; a ativação publica a edição. Impedimentos para incluir na edição são identificados separadamente da elegibilidade do catálogo inicial.

Home e pauta usam `getPublishedEditorialSelection`. Busca, filtros, marketplace, ordenação e paginação não alteram o pool da hero. A projeção pública não expõe avaliações internas, dúvidas, snapshots ou notas. O prazo vem das observações e, quando houver, da vigência da edição; não é renovado artificialmente em cada leitura.

A home verifica mudanças a cada 60 segundos enquanto visível e ao receber foco. Sua assinatura incorpora política, modo, produtos, preços, prazos e apresentação pública, incluindo mudanças de avaliação sem nova edição. A pauta usa o mesmo serviço e marca os destaques da hero. Prazos locais ocultam itens vencidos; a verificação remota pode levar até o próximo ciclo. A rotação do carrossel pausa durante foco por teclado e passagem do mouse.

## Verificação

- 27 testes puros do ranking: classificação relativa, compatibilidade, desempates, escassez, sinais e bloqueios.
- 265 testes da suíte web passaram.
- 27 cenários PostgreSQL isolados passaram: serviços e SQL reais, integridade, isolamento, ativação, projeções, ranking inicial sem escrita, decisão vazia/vencida/retirada e atualização sem nova versão.
- Typecheck e build de produção web passaram. O build usou uma cópia isolada em `/tmp`, preservando o servidor ativo na porta 3100.
- No ambiente conectado, os serviços reais retornaram os mesmos três IDs e prazos para home e pauta, sem criar avaliações ou edições. Navegador conferido: hero preenchida, pauta com os mesmos produtos e prévia do painel, sem erros de console observados.

Nenhuma nova migration é necessária. O mecanismo ainda não agrupa famílias automaticamente nem dispõe de qualidade editorial calibrada; a revisão humana continua sendo a melhor fonte para comparar utilidade, público e custo-benefício.
