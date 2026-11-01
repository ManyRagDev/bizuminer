# Plano de integração da captura curadoria vitrine e pauta

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
