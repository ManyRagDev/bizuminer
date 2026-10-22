# Diagnóstico — continuidade do fluxo BizuMiner

Data: 2026-10-18. Modalidade: **investigação exploratória**, sem implementação.
Baseline: `main`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` **mais o working tree preexistente**, incluindo correções OS-020–026. HEAD sozinho não representa os arquivos examinados. Hashes em [evidências](evidencias/baseline.json) e [inventário](evidencias/inventario.json).

## Conclusão

**A integração da experiência diária está incompleta.** Há serviços conectados ao mesmo catálogo, mas a interface distribui decisões entre processos com elegibilidade, avaliações e estados próprios. O operador precisa reconstruir as ligações. Foram demonstrados três defeitos específicos; a multiplicidade de estados, por si só, não é um bug.

A proposta de uma fila única é compatível com o problema observado como **visão de trabalho contínua**. Ordenar por data resolve previsibilidade de apresentação, mas não resolve perda de contexto, avaliações sem continuidade, publicação fragmentada ou ações inacessíveis. O significado da data e da unidade da fila ainda é uma decisão de produto; nenhuma mudança de contrato foi feita.

Referência normativa: [Blueprint, seção 11](../../BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md), REQ-UX-01–04 e critério 11.6; [EP-05](../../epicos/EP-05.md), jornada diária, próxima ação e passagem oportunidade→material→resultado. Esses documentos já exigiam coerência operacional. Não é necessário inventar uma preferência arquitetural para constatar a lacuna.

## Esclarecimento posterior: entradas da coleta

Em 2026-10-18, o usuário definiu **ML exclusivamente manual** e explicitou a coleta periódica Shopee/AliExpress pelo GitHub. O [mapa, seção 0](MAPA.md) agora distingue reconsulta periódica de IDs conhecidos (`monitor-prices.yml`) e descoberta/triagem em lote sob demanda (`capture-offers.yml`). A rotina periódica já exclui ML; o executor de lotes ainda tenta captura automática de ML antes da contingência do navegador. Esse desalinhamento com a direção explicitada requer contrato posterior, sem atribuir novo BUG retroativamente aos aceites anteriores. Nenhum workflow ou coletor foi alterado.

## Método e limites

- Primário: `estado-interacoes`; complementares: `integracoes` e `dados-persistencia`, para seguir telas→ações→consultas→objetos persistidos. O primário é orientado a editores; foram usados seus princípios de estado/sequência, sem aplicar verificações geométricas irrelevantes.
- Inventário estático de 318 arquivos ativos em web/app, web/lib, web/bin, capture, persistence e extension: 47 páginas/handlers, 805 referências locais de import e 242 referências literais de rota. Foram identificados 76 objetos SQL referenciados, incluindo views e funções, não apenas tabelas. Migrations, middleware e workflows foram inspecionados complementarmente.
- Leitura aprofundada das fronteiras da rotina editorial/comercial. O inventário registra ligações do código; não demonstra que cada integração esteja ativa remotamente. Imports não equivalem a chamadas executadas, e strings de rota não equivalem a links visíveis.
- Reproduções de funções reais e TSX real com serviços/hooks simulados, sem rede; testes existentes com PostgreSQL WASM isolado. Nenhum banco remoto, API paga, envio, migration ou deploy foi acionado.
- A tentativa visual em `http://localhost:3100/admin/curadoria?aba=radar` chegou à tela de login. Não havia sessão autenticada disponível: não se afirma observação visual do admin, usabilidade em mobile, latência ou execução ponta a ponta com a conta do usuário.
- Não houve alteração de código de produção, contratos, migrations ou testes existentes. Foram criados apenas documentos e instrumentos desta investigação.

## Defeitos demonstrados

### BUG-014 — Radar navega para Seleção

**Estado:** confirmado. **Classificação:** implementacao. **Severidade:** alta para a jornada; não é achado de segurança.

- Esperado: os links de Radar presentes no layout, Curadoria e Campanhas abrem a área de oportunidades.
- Observado: `canonicalAdminQuery({aba:'radar'})` retorna `{aba:'selecao', sub:'', redirectNeeded:false}`. Na execução do componente real com dependências simuladas, a página solicita Seleção uma vez e Radar zero vezes; o conteúdo é “Sem produtos selecionados”.
- Primeiro desvio: `packages/web/lib/admin-query-aliases.ts`, tabela `ABA_ALIASES`, não contempla `radar`; `packages/web/app/admin/curadoria/page.tsx` decide o conteúdo pelo valor normalizado. O ramo Radar existe, mas não é alcançado por esse parâmetro. `/admin/direcionamento` também redireciona para o endereço afetado.
- Reprodução: executar `probes.cjs` e `componentes.cjs` conforme [EVIDENCIAS.md](EVIDENCIAS.md). Nenhum produto ou configuração é necessário para reproduzir a normalização.
- Hipótese rival descartada para este defeito: “Radar está vazio por falta de oportunidades”. O serviço de Radar sequer é chamado na reprodução.
- Fechamento: links atuais e legado chegam ao Radar; teste do normalizador e da página cobre a mesma rota; confirmar navegação autenticada sem alterar os demais aliases. Responsável seguinte: arquitetura/execução de correção delimitada.

### BUG-015 — Localização incorreta em Primeiros passos e Governança

**Estado:** confirmado. **Classificação:** implementacao. **Severidade:** média, orientação de navegação.

- Esperado: o contexto de navegação identifica a área efetivamente aberta.
- Observado: `resolveActiveId('/admin/onboarding','')` e `resolveActiveId('/admin/governanca','')` retornam `hoje`; o título derivado é “Painel · Hoje”. As duas rotas estão expostas pelo layout.
- Primeiro desvio: `packages/web/app/_components/admin-shell.tsx`, fallback de `resolveActiveId`, sem tratamento dessas rotas. A função foi extraída da AST do arquivo e executada sem reimplementar a regra.
- Reprodução: `probes.cjs`; controles `/admin` e `/admin/campanhas` retornam suas áreas esperadas.
- Hipótese rival descartada: atraso de banco. A identificação é função local de caminho/query.
- Fechamento: cada destino exposto apresenta localização coerente em acesso direto e navegação; checar desktop/mobile e retorno. Responsável seguinte: arquitetura/execução.

### BUG-016 — Passagem Radar→Campanhas perde a oportunidade de origem

**Estado:** confirmado na composição e submissão dos componentes. **Classificação:** implementacao. **Severidade:** alta para continuidade e rastreabilidade. Atualmente parcialmente encoberto pelo BUG-014.

- Esperado: “Preparar no Cockpit” continua a oportunidade escolhida, preservando sua identidade e contexto de público/canal, conforme EP-05 e contrato contextual C-03.
- Observado: o link transmite `conta` e `productId`, mas não `opportunityId`. A página de Campanhas recebe somente esses parâmetros. O formulário envia produto, campanha, canal escolhido e motivo digitado novamente; a identidade da oportunidade e seu público não seguem na ação.
- Evidência: componente Radar real com oportunidade sintética gera `/admin/campanhas?conta=tenant_fixture&productId=product_fixture`. O formulário real de CampaignDesk submetido a uma ação simulada omite `opportunityId`. O produto é preservado; a oportunidade não.
- Primeiro desvio: `app/admin/direcionamento/radar-view.tsx`, href “Preparar no Cockpit”; continua em `app/admin/campanhas/page.tsx` e `workspace.tsx`.
- Consequência no serviço: `lib/commercial-workflow.ts:createKitForAccount` já aceita `opportunityId`, mas sem esse campo segue o caminho de oportunidade manual (`audience_key='manual'`, `class='unclassified'`). Essa consequência foi rastreada no código; não foi criada publicação remota para demonstrá-la.
- Hipótese rival: “Campanhas recupera automaticamente a mesma oportunidade pelo produto”. O caminho sem ID usa a política da campanha e público manual; não busca a oportunidade originalmente selecionada no Radar.
- Fechamento: abrir duas oportunidades do mesmo produto com públicos/canais diferentes e verificar que cada kit referencia a origem correta; apresentar conflito/incompatibilidade explicitamente. Preservar também a criação manual legítima. Responsável seguinte: arquitetura/execução.

## Lacunas gerais e ambiguidades — sem inflar a lista de bugs

| Ref. | Evidência / estado | Implicação |
|---|---|---|
| L-01 | **Confirmado:** `cockpit-view-model.ts` define próximas ações, mas o inventário de imports não encontrou consumidores de produção; os testes usam o módulo diretamente. | Testar o modelo não comprova sua presença na jornada. O cockpit integrado descrito em EP-05 não é entregue apenas por esse arquivo. |
| L-02 | **Confirmado:** Seleção usa avaliação editorial anterior; Qualidade da IA persiste rubrica V2. `latestAssessments` exclui `schemaVersion=2`, enquanto Radar exige avaliação humana V2 atual. | Uma avaliação feita em Seleção não satisfaz automaticamente a fronteira do Radar. A interface não reúne essas decisões no produto. Decidir quais avaliações continuam distintas requer produto/arquitetura. |
| L-03 | **Confirmado:** Pauta copia links; Composer copia mensagens; Marketing persiste calendário próprio; Campanhas controla kits, revisões e confirmações. | São quatro experiências relacionadas a publicação, com registros diferentes. Copiar ou marcar conteúdo no calendário não confirma a publicação comercial. A finalidade de cada uma precisa ficar evidente. |
| L-04 | **Confirmado:** triagem global, triagem por lote, pendências humanas, seleção e Radar têm conjuntos/ordenações diferentes. | “Fila geral” não representa todos os produtos nem todos os estados do trabalho. [MAPA.md](MAPA.md) discrimina os conjuntos. |
| L-05 | **Ambiguidade:** fila por produto, oportunidade ou tarefa; data de entrada, observação ou mudança de etapa; ASC/DESC. | Uma ordenação única ainda não foi especificada. A fila deve preservar conta, produto e contexto de público/canal, sem tratar timestamps como identidade. |
| L-06 | **Confirmado no código; decisão de produto pendente:** seleção compartilhada possui teto 24 e hero até 3; a Pauta deriva da seleção. | Reconciliar o limite editorial herdado com a pauta operacional sem quota artificial prevista no Blueprint. Não presumir que aumentar o número resolve a continuidade. |

## Hipóteses sobre a causa geral

1. **Apenas rótulos/ordenação ruins:** explica parte da confusão, mas não explica BUG-014/016 nem os contratos de avaliação distintos. Insuficiente como causa única.
2. **Integração feita por módulos e links, sem concluir composição da jornada:** fortemente sustentada pelas fronteiras demonstradas, módulo de próximas ações sem consumidor e quatro caminhos de publicação. Esta é a explicação estrutural melhor apoiada pelo código.
3. **Localhost desatualizado ou migration ausente:** pode explicar outros sintomas de ambiente; não é necessária para os defeitos reproduzidos no código atual. A investigação não atestou o estado remoto nem a sessão autenticada.
4. **Necessidade legítima de estados diferentes:** confirmada. Aprovar catálogo, comprovar preço, escolher destaque e confirmar envio respondem a perguntas diferentes. Unificar a experiência não autoriza eliminar esses controles.

## Verificações executadas

- 28 testes individuais em cinco arquivos, executados diretamente: aliases 9, workflow 1, cockpit model 6, benchmark 5, triage-value 7; todos passaram.
- 22 cenários SQL de preço/triagem e 7 cenários de serviço comercial em PGlite; todos passaram.
- Probes: rota Radar incorreta, localização incorreta e contexto perdido reproduzidos; controles positivos preservados.
- O benchmark usa respostas de IA simuladas. Não mede qualidade atual do Gemini nem homologa a rubrica; [plano de avaliação](PLANO-AVALIACAO.md).
- Não se repetiu build/typecheck: esta investigação não modificou implementação, e esses checks não discriminam os defeitos encontrados. Os testes verdes acima não anulam as falhas de composição.

## Critério de encerramento da investigação e encaminhamento

O mapa de ligações do código e o diagnóstico das rupturas principais estão concluídos dentro dos limites declarados. **Não está homologado um fluxo único nem foi implementada uma fila nova.**

Próximo responsável de produto: decidir a unidade da fila, o papel humano e a semântica das datas; confirmar o papel de Marketing no trabalho diário. Próximo responsável de arquitetura: transformar a direção escolhida e BUG-014–016 em ordens delimitadas, preservando os contratos de domínio. A aceitação deve acompanhar o mesmo produto da entrada ao resultado, inclusive duas oportunidades do mesmo produto, e comprovar continuidade visual/funcional com sessão autenticada — além dos testes de serviços.
