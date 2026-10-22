# Avaliação da triagem automática e dos fluxos de operação

Data: 10/10/2026. Estado: diagnóstico, correção do piso, simplificação da Curadoria e executor persistido implementados localmente. A substituição da captura automática ML pela importação manual foi rejeitada pelo dono como downgrade; revisão no checkpoint 18. O pedido atual é identificar o gatilho da verificação ML: oito comparações HTTP e controle no navegador estão documentados no checkpoint 19; o motivo interno do fornecedor não foi exposto. O teste de importação e triagem às 18:40 BRT comprova a contingência, não a recuperação da automação. Sem commit/deploy. Ativação em produção, recuperação da descoberta automática ML e identidade confiável de variantes continuam pendentes.

O objetivo é explicar por que as rodadas relatadas terminam em rejeição ou retenção, identificar se o painel de etapas e o botão “Capturar ofertas de hoje” operam sobre os mesmos produtos, e definir uma operação coerente da captura à pauta. Esta avaliação foi solicitada com registro contínuo para permitir retomada se a cota do Codex terminar.

**Conclusão do diagnóstico inicial:** a aprovação automática funciona e está habilitada, mas as últimas rodadas consumiram principalmente produtos barrados pelo piso fixo de R$ 20. Naquele momento, a descoberta pelo botão diário estava bloqueada por um lote antigo sem execução, enquanto o acompanhamento de preços continuava rodando. Os comandos de triagem compartilhavam uma fila geral, sem vínculo com o lote recém-capturado. Home e pauta compartilham a seleção; a auditoria escolhia uma amostra histórica diferente, embora o painel a apresentasse como etapa da seleção de hoje. Os checkpoints posteriores registram as correções e seus limites reais.

## Escopo e limites

- Avaliar implementação, documentação vigente, testes e, se houver acesso, dados reais das execuções.
- Distinguir comportamento comprovado de hipótese e separar aprovação no catálogo, seleção de destaque e preparação de pauta.
- Não alterar regras, executar captura/triagem paga, publicar produtos ou modificar o banco durante o diagnóstico.
- Preservar alterações preexistentes no painel e nos arquivos de marketing.

Os checkpoints 1–4 descrevem o estado anterior à correção. Após o diagnóstico, o dono autorizou corrigir a regra de preço; a implementação e os testes estão no checkpoint 5.

## Checkpoint 1 Registro iniciado

O projeto possui Next.js em `packages/web`, captura em `packages/capture` e persistência Supabase no schema `garimpa`. A documentação técnica já é mantida em `docs/tecnico`, por isso o checkpoint fica no mesmo local.

O botão “Capturar ofertas de hoje” está em `packages/web/app/admin/batch-capture-panel.tsx`. A aplicação das decisões automáticas e o registro de `triage_run` estão em `packages/web/lib/curation-db.ts`. Há documentação recente de integração em `docs/tecnico/plano-integracao-captura-curadoria-vitrine-pauta.md` e `docs/tecnico/entrega-integracao-curadoria-01.md`; seu conteúdo ainda precisa ser confrontado com o código atual.

## Checkpoint 2 Primeiras causas confirmadas no código

1. **Aprovação depende de configuração explícita.** O pipeline só gera `approved` quando `autoPublish=true` e a nota atinge `minScoreAutoPublish` (padrão 4). Nota 3 ou piloto desligado produz `pending` com anotação. Ausência de configuração ou erro ao carregá-la resulta silenciosamente em `autoPublish=false`. A configuração real ainda precisa ser lida.
2. **Retenção pode acontecer antes da IA.** Preço abaixo de R$ 20 gera `held/weak_offer`; excedente de três representantes por família gera `held/family_saturation`. A Bússola não altera esses filtros. Termos de blacklist e nota de anúncio abaixo de 4 podem rejeitar antes da IA.
3. **Os dois comandos usam o mesmo motor e a mesma fila.** O botão diário chama `runAutomatedTriageAction(100)` e o comando técnico chama `triggerAutoPilotTriageAction(limite)`; ambos chegam a `runPendingAutomatedTriage("local", limite)`. Nenhum informa lote ou marketplace à triagem. Selecionar Mercado Livre limita a captura, mas não limita a triagem ao Mercado Livre ou à captura recém-terminada.
4. **Produtos anotados deixam de ser elegíveis à próxima triagem automática.** A consulta exige `pending` e ausência de qualquer evento anterior `rule/llm`. Assim, habilitar o piloto depois não aprova retroativamente notas altas que ficaram pendentes; novas observações também não removem essa exclusão. Produtos `held` tampouco voltam por esse comando.
5. **A régua de etapas do admin não acompanha uma seleção real.** `TodayCommandCenter` marca “Seleção” concluída quando existe triagem concluída hoje e exibe aprovações da última triagem como “publicados”. O componente não consulta a seleção editorial persistida. “Pauta” fica sempre com `done:false`.
6. **A captura não encadeia a IA de forma durável.** A API inicia processos de captura; o navegador observa a conclusão e um `useEffect` dispara a triagem. Fechar ou recarregar a página perde esse encadeamento. Ainda falta conferir a relação entre home e pauta na versão atual.

Evidências: `lib/curation-pipeline.ts`, `lib/curation-db.ts` (função `runPendingAutomatedTriage`), `lib/editorial-compass.ts` (função `getEditorialGuideline`), `app/admin/batch-capture-panel.tsx`, `app/admin/direcionamento/actions.ts`, `app/admin/today-command-center.tsx`, `app/api/admin/rodagem/lote/route.ts`, todos em `packages/web`.

Primeira consulta real: ambiente local possui `DATABASE_URL` e chave Gemini configuradas (valores preservados). A conexão ao pooler falhou por resolução DNS (`ENOTFOUND`) no sandbox; a consulta somente leitura fora dessa restrição foi concluída no checkpoint seguinte. Nenhuma execução de captura ou IA foi acionada.

## Checkpoint 3 Banco real consultado

Consulta concluída em **10/10/2026 às 12:26 BRT**, em transação PostgreSQL `repeatable read read only`, sem disparar IA, captura ou alteração de decisões. Evidência integral: [evidencias-triagem-fluxos-2026-10-10.json](./evidencias-triagem-fluxos-2026-10-10.json). Script reproduzível: `packages/web/bin/inspect-triage-flows.mjs`.

**O piloto está ligado, com corte em nota 4**, desde a configuração salva em 07/09. A hipótese de piloto desligado não explica as rodadas recentes deste banco. Existem **272 eventos históricos de aprovação pela IA**, portanto a aprovação automática já aconteceu. Isso não elimina o problema observado nas últimas rodadas.

| Rodada no fuso de São Paulo | Processados registrados | Aprovados | Retidos | Rejeitados | Anotados pendentes |
|---|---:|---:|---:|---:|---:|
| 10/10 às 12:19 | 44 | 0 | 41 | 3 | 0 |
| 06/10 às 12:27 | 40 | 0 | 40 | 0 | 0 |
| 05/10 às 22:24 | 50 | 4 | 46 | 0 | 0 |
| 29/09 às 09:53 | 50 | 10 | 5 | 28 | 7 |

Na rodada de hoje, os eventos mostram retenções por **preço abaixo do piso de R$ 20**, inclusive utilidades como mixer de R$ 18,90, suporte de papel higiênico de R$ 19,90 e cesto para frutas de R$ 19,08. Os três rejeitados foram cabos/adaptador com nota 3, classificados como `peca_chata` pelo critério antigo. O detalhamento agregado confirmou: os 41 retidos de hoje, os 40 de 06/10 e os 46 de 05/10 foram todos retidos por `rule/weak_offer`, antes de qualquer avaliação semântica desses produtos.

Depois dessa rodada, há **488 produtos pendentes**, mas **zero pendentes elegíveis à triagem automática** no retrato consultado: 459 estão fora da janela de sete dias e os outros 29 já têm evento automático. O painel pode continuar mostrando backlog e oferecendo “rodar mais um lote”, embora a consulta não encontre produtos elegíveis. Não há eventos de nota 4/5 pendentes no histórico consultado; o bloqueio de reprocessamento existe, mas não há evidência de que notas altas estejam presas assim neste banco.

**Não existe avaliação multidimensional nem edição editorial registrada** (`editorial_assessment` e `editorial_selection` vazias). Na versão local, home e pauta usam o mesmo serviço `getPublishedEditorialSelection`: antes da primeira edição, ele seleciona pelo ranking do catálogo aprovado; depois, usa a edição persistida. A pauta atual não faz uma segunda chamada à IA para escolher outros produtos. Os destinos home/pauta podem ser diferentes por decisão explícita dentro da mesma edição.

Há um lote Mercado Livre de **25/09 ainda marcado `running`** (`c5c334a3-3783-4e3b-ae8c-2e35e6b4c1d0`). A consulta seguinte confirmou **zero execuções filhas**. O cálculo atual mantém “aguardando” indefinidamente e impede iniciar novos lotes pelo botão diário. Nenhum status foi corrigido nesta avaliação.

## Checkpoint 4 Fluxos e causas consolidados

### O que cada superfície realmente faz

| Superfície ou comando | Universo de produtos | Efeito real |
|---|---|---|
| Régua Captura → Triagem → Seleção → Auditoria → Pauta em `/admin` | Datas da última captura e da última triagem, contador diário de auditoria | Orienta a navegação; não executa outro motor e não representa uma execução única |
| Capturar ofertas de hoje | Fontes marcadas; APIs Shopee/AliExpress usam plano de consultas; ML usa seu adaptador de ofertas | Cria lote de descoberta; o navegador tenta iniciar a triagem geral quando a captura termina |
| Rodar triagem em Histórico da IA | Pendentes recentes, sem evento automático anterior, de todas as lojas | Mesmo motor do botão diário; não captura e não restringe ao último lote |
| Revisar e Retidos | Filas de pendentes, legado, retenções e adiamentos | Decisão humana sobre o mesmo catálogo; os produtos retidos não são aprovados pela simples repetição da triagem |
| Auditoria de hoje | Últimas aprovações da IA ainda sem confirmação/correção humana, de qualquer data | Amostra de controle de qualidade; não é a lista da seleção vigente |
| Seleção editorial | Catálogo aprovado recente; avaliações e edição, quando gravadas | Avalia, ordena e ativa destaques; atualmente opera na fase inicial sem edição |
| Home e `/pauta` | Mesmo serviço de seleção compartilhada | Retornaram 24 IDs na mesma ordem e os mesmos três destaques |
| Acompanhar preços pelo GitHub Actions | IDs de produtos conhecidos, priorizados por política de acompanhamento | Renova preços/presença; não busca um catálogo novo e não dispara triagem |

Portanto, **não há dois catálogos independentes, um para cada botão**, nem duas IAs escolhendo separadamente os produtos da home e da pauta na versão atual. Há diferentes operações e recortes sobre o mesmo catálogo, apresentados como uma sequência mais integrada do que o código efetivamente garante. A identidade persistida é `(tenant_id, marketplace, external_id)`, com upsert em `packages/persistence/src/pg-store.ts:100`.

### Descoberta bloqueada e acompanhamento ativo

O lote Mercado Livre começou em **25/09 às 13:22 BRT**, continua `running` e tem zero `capture_run` filhas. `captureBatchStatus` converte ausência de filhas em `waiting`, que mantém o lote em `running`; o POST de novos lotes retorna `batch_in_progress`. Não existe prazo máximo ou finalização dessa ausência.

Há também uma incompatibilidade reproduzida sem rede: em produção, `mlCaptureAllowedWithConsent(true, env)` permite o pedido com checkbox mesmo sem flags; o CLI `sweep.ts` exige as flags via `mlAutomatedCaptureEnabled()` e pode terminar antes de registrar qualquer execução. A API de lote passa `process.env` sem transportar esse consentimento ao CLI e descarta a saída do processo (`stdio: "ignore"`). **O bloqueio do lote é comprovado; essa incompatibilidade é uma causa possível de sua origem, não uma reconstrução comprovada do processo de 25/09.** Não foram consultadas variáveis do deploy daquela data.

Nos 15 dias anteriores à consulta, as **90 execuções registradas** eram todas `captureMode=monitoring`: 45 Shopee e 45 AliExpress; nenhuma de descoberta. Treze acompanhamentos AliExpress terminaram com erro; o tratamento desses erros está fora deste diagnóstico. Esse monitoramento renova ofertas já conhecidas, sem alimentar continuamente a fila com produtos novos. A sequência “rodar mais um lote de IA” acaba consumindo o estoque residual abaixo do piso e depois chega a zero elegíveis.

### Por que as aprovações recentes zeraram

- Nas três rodadas mais recentes, 127 de 134 decisões foram retenções pelo piso de R$ 20; houve quatro aprovações e três rejeições.
- O corte de ticket ocorre antes da IA e não considera utilidade, nota do anúncio ou oportunidade real. No código, um produto barato é rotulado `weak_offer` apenas pelo preço absoluto. Isso pode contrariar a proposta de achadinhos acessíveis; é uma escolha de política, não prova de que esses 127 anúncios sejam bons ou ruins.
- A consulta prioriza primeiro os produtos de pelo menos R$ 20. Depois que eles foram processados, os baratos passam a dominar as rodadas seguintes.
- A nota mínima do piloto é 4. Os três cabos/adaptador da rodada de hoje tiveram nota 3 e categoria `peca_chata`, que provoca rejeição mesmo com nota 3.
- O prompt atual favorece novidade, impulso e gadgets, enquanto a Bússola salva é “Foco em utilidades práticas de casa, cozinha e gadgets.” Alterar só a Bússola não remove o piso e as blacklists.
- O plano de descoberta contém consultas fixas, como “carregador usb c”, “kit ferramentas” e “cuidados com a pele”. Ele não é gerado pela Bússola e pode procurar itens que os filtros editoriais tendem a barrar.

**Não há motivo comprovado para trocar o modelo ou reduzir a nota de aprovação como primeira intervenção.** A causa dominante recente está no piso e na ausência de descoberta nova. Remover o piso sem calibrar utilidade, preço e evidências também não garante bons resultados.

### Refinamento do piso informado pelo dono

Em 10/10, o dono esclareceu: o objetivo é evitar produtos de baixo valor habitual, preservando a possibilidade de uma promoção tornar um produto interessante muito barato. Exemplo: um produto que normalmente custa R$ 100 em promoção relâmpago por R$ 11 deve poder avançar para avaliação. O piso atual sobre o preço promocional o reteria antes da IA.

Isso refina a correção proposta: separar **valor habitual do produto**, **mérito para o público** e **preço da oportunidade**. O preço final baixo, isoladamente, não deve impedir a avaliação de uma oportunidade excepcional. Também não deve aprovar automaticamente o item: utilidade, segurança, confiança e clareza da configuração continuam sendo critérios.

O preço original riscado do anúncio não comprova valor habitual. Uma exceção ao piso deve usar uma referência confiável, preferencialmente histórico comparável da mesma oferta/configuração, e identificar quando só existe um desconto declarado pelo vendedor. Sem referência suficiente, o caso pode seguir para verificação humana com motivo explícito, em vez de ganhar um desconto verificado ou uma aprovação automática sem base.

O contrato atual `CandidateProduct` transporta preço atual, título, categoria, nota, vendas e família; não transporta preço de referência nem histórico comparável. Portanto, implementar essa regra exige levar as evidências ao motor, além de substituir a condição `priceCents < 2000`. O limite de valor habitual, a força da evidência e o tamanho de desconto necessário ainda precisam ser calibrados; o exemplo não fixa esses parâmetros.

Casos de aceite adicionais: produto de valor habitual comprovado de R$ 100 ofertado por R$ 11 não é retido apenas pelo preço final; produto habitualmente barato não ganha exceção por um preço riscado inflado; variante/acessório de R$ 11 não é comparado ao produto completo de R$ 100; falta de referência permanece explícita e permite revisão.

### Auditoria e seleção mostram produtos diferentes

A leitura dos serviços reais contra o banco às **12:28 BRT** retornou modo `catalog`, 24 produtos na mesma ordem para home e pauta e os mesmos três IDs de hero. Evidência: [evidencias-selecao-compartilhada-2026-10-10.json](./evidencias-selecao-compartilhada-2026-10-10.json). Não foram criadas avaliações ou edições para essa verificação.

A amostra exibível na auditoria às **12:29 BRT** continha 12 aprovações antigas, de 05/10, 29/09 e 24/09; **nenhuma das 12 estava nos 24 produtos da seleção atual**. O progresso era 0/12. A consulta não restringe a amostra ao dia, lote, seleção ou frescor da oferta. Isso explica de forma concreta a sensação de que cada tela escolhe seus próprios produtos.

Auditar decisões históricas é útil para calibrar a IA, mas deve aparecer como auditoria do catálogo/histórico. Para “auditar a seleção de hoje”, a amostra deve partir da seleção efetivamente vigente ou da execução declarada, com tamanho adaptado ao material disponível. A meta fixa de 12 não pode tornar uma rotina sem aprovações novas uma obrigação impossível.

### Estados e falhas de comunicação

- “Aprovado no catálogo” significa elegibilidade editorial. Presença recente, validade do preço, bloqueios e seleção determinam o que aparece publicamente. O número de aprovados de uma triagem não é o número de destaques novos.
- `TodayCommandCenter` conclui “Seleção” só porque a triagem terminou, mesmo com zero aprovações, e chama esses aprovados de “publicados”. A edição editorial real não participa desse cálculo.
- O indicador de captura concluída hoje aceita uma execução de acompanhamento. Assim, “captura concluída” não comprova que houve descoberta de ofertas novas.
- “Pauta” permanece `done:false`; a cópia de links é mantida no `localStorage` do aparelho e não informa esse indicador. Copiar também não comprova postagem.
- O botão diário omite `annotatedPending` no resumo e perde o estado do lote ao recarregar. A triagem automática depende de um efeito do navegador; a API de captura em lote não passa `--trigger-triage` aos CLIs.
- A telemetria sobrescreve `total_input` com `decisions.length`. Produtos sem resposta da IA ficam pendentes e desaparecem desse total, e o serviço pode finalizar como `ok`. Uma reprodução sintética com um produto e avaliador retornando `[]` gerou zero decisões. Não há evidência de que essa falha explique a rodada real de hoje.
- O parser verifica lista e `productId`, mas não valida todos os campos nem faixa de nota. Uma resposta sintética com nota 999 passou pelo parser. Isso deve ser corrigido antes de ampliar a automação; não há evidência de nota inválida nos resultados reais examinados.

## Correções recomendadas e critérios de aceite

| Ordem | Correção | Critério de aceite |
|---|---|---|
| 1 | Recuperar o lote órfão e impedir novos lotes sem execução de permanecerem eternamente em andamento; registrar falhas de inicialização e prazo limite | Lote sem filhos termina com erro explicado; nova captura pode iniciar; falhas não desaparecem nos processos filhos |
| 2 | Alinhar autorização e capacidade do Mercado Livre entre interface, API e CLI | A interface informa corretamente o caminho disponível; pedido permitido chega à execução ou falha de forma explícita; preservar as restrições da fonte, sem habilitar scraping por correção incidental |
| 3 | Vincular captura e triagem por lote, com continuidade no servidor e retomada idempotente | Fechar/recarregar a página não interrompe o encadeamento; repetir consulta não duplica IA; um lote de uma loja não tria silenciosamente outra |
| 4 | Separar descoberta, reobservação e acompanhamento no painel e nos contadores | “Descoberta hoje” exige captura de descoberta; acompanhar preços não mascara ausência de produtos novos |
| 5 | Separar valor habitual de preço promocional e alinhar consultas de descoberta, Bússola e filtros | Promoção excepcional abaixo de R$ 20 pode avançar com evidência confiável; preço riscado isolado não libera a exceção; referência/configuração ausente leva a verificação explícita; limites são calibrados e versionados |
| 6 | Mostrar a fila elegível real e oferecer reavaliação controlada | Diferenciar pendente nunca avaliado, anotado, retido, vencido e decisão humana; mudança de evidência/política permite reavaliar os casos autorizados sem apagar histórico nem sobrescrever decisões humanas |
| 7 | Fazer a régua ler os estados reais da seleção e do trabalho diário | Aprovação, seleção, auditoria e pauta têm contadores próprios; zero resultado e fila vazia são estados explicados, sem recomendar indefinidamente “rodar outro lote” |
| 8 | Definir o escopo da auditoria e ajustar a meta ao material disponível | Auditoria da seleção mostra produtos da seleção; histórico fica identificado; ausência de produtos não bloqueia artificialmente a pauta |
| 9 | Corrigir validação e observabilidade da IA | Validar nota 1–5, booleanos, enum, IDs recebidos, duplicatas e cobertura; preservar total de entrada, respostas, decisões aplicadas, omitidos e erros; sucesso parcial é explícito |

Sugestão original de entrega: estabilizar captura e continuidade (itens 1–4), calibrar critérios e reavaliação (5–6), e ajustar a jornada e a confiança na automação (7–9). Por solicitação posterior do dono, a correção do piso (item 5, na triagem) e a reavaliação das retenções pelo piso (parte do item 6) foram antecipadas. Os demais itens continuam pendentes.

## Mapa de evidências para implementação

Todos os caminhos abaixo são relativos à raiz do projeto; as linhas identificam o código no momento do diagnóstico e podem ter mudado com a correção posterior.

| Evidência | Arquivo e linha |
|---|---|
| Piso e aprovação por nota | `packages/web/lib/curation-pipeline.ts:50`, `:74`, `:232`, `:246` |
| Fila geral e exclusão por evento anterior | `packages/web/lib/curation-db.ts:1373`, `:1385`, `:1388`, `:1394` |
| Total de decisões substitui total de entrada | `packages/web/lib/curation-db.ts:1360`, `:1465` |
| Piloto desligado silenciosamente em fallback | `packages/web/lib/editorial-compass.ts:104`, `:144`, `:152` |
| Auditoria histórica e meta fixa | `packages/web/lib/editorial-compass.ts:38`, `:262`, `:311` |
| Encadeamento no navegador sem lote na triagem | `packages/web/app/admin/batch-capture-panel.tsx:41`, `:67`, `:72` |
| Régua sem estado real da seleção e pauta | `packages/web/app/admin/today-command-center.tsx:31`, `:33` |
| Bloqueio de novo lote e processo sem saída persistida | `packages/web/app/api/admin/rodagem/lote/route.ts:69`, `:86` |
| Ausência de filhos mantém lote aberto | `packages/web/lib/admin-db.ts:324`, `:331` |
| Gate independente do CLI ML | `packages/persistence/bin/sweep.ts:37` |
| Home e pauta compartilhadas | `packages/web/lib/editorial-selection-db.ts:216`, `packages/web/app/page.tsx:23`, `packages/web/app/api/pauta/route.ts:15` |
| Monitoramento separado da descoberta | `packages/persistence/bin/monitor-prices.ts:59`, `.github/workflows/monitor-prices.yml:42` |
| Consultas fixas da descoberta | `packages/persistence/src/capture-plan.ts:26` |
| Validação incompleta do retorno da IA | `packages/web/lib/ai-curation-service.ts:109` |

## Verificação do diagnóstico e limites

- Consultas ao banco em transações somente leitura, com timeout por instrução; nenhum veredito, lote, produto ou seleção foi alterado.
- Serviços reais locais de home, pauta e auditoria executados contra o banco conectado, sem chamar a API que gera links curtos.
- Seis arquivos de testes direcionados passaram: `ai-curation`, `editorial-compass`, `batch-capture-plan`, `curation-pauta`, `editorial-selection` e `admin-run-groups`. Eles confirmam regras existentes; não comprovam uma orquestração durável que ainda não existe.
- `node --check` passou no script de inspeção. As reproduções sintéticas de piso, consentimento divergente e resposta ausente usaram avaliadores simulados, sem chamada à IA ou marketplace.
- Durante o diagnóstico, não foi necessário executar build: naquele momento o comportamento da aplicação não foi alterado. As verificações da implementação posterior estão no checkpoint 5. As mudanças preexistentes de marketing e navegação foram preservadas.
- A versão implantada e sua configuração não foram confrontadas com o checkout nesta sessão. As regras descritas vêm do código local; as contagens vêm do banco configurado em `packages/web/.env.local`. A comparação home/pauta prova esses serviços locais contra esse banco.

## Próximos passos para retomada

O diagnóstico e a correção local do piso estão concluídos. O próximo trabalho sugerido é estabilizar a captura, começando pelo lote órfão e pela inicialização/continuidade. A recuperação de estado persistido deve ficar registrada, sem apagar histórico e sem habilitar Mercado Livre automaticamente. A implementação desta sessão ficou restrita à regra de valor e à reavaliação segura das retenções correspondentes.

Para repetir somente a inspeção, sem captura ou IA:

```bash
cd packages/web
node --env-file=.env.local bin/inspect-triage-flows.mjs
```

O script pode exigir acesso de rede fora do sandbox. Ele apenas imprime JSON, não grava no banco. Não confundir com `bin/run-triage.ts`, que executa a IA e muda decisões.

## Checkpoint 5 Correção do piso aplicada e validada

O dono autorizou aplicar a correção após esclarecer a diferença entre valor habitual e preço promocional. O escopo desta implementação é a regra de valor e o caminho necessário para levar suas evidências à triagem; os demais problemas de captura, orquestração e auditoria continuam no plano.

Regra aplicada: preservar R$ 20 como limite de valor, permitir preço promocional inferior quando o menor preço anterior comparável estiver pelo menos nesse limite e acima do preço atual, e exigir ao menos três observações anteriores distribuídas em sete dias, dentro de uma janela de 90 dias. Usar somente a mesma variante/quantidade/conteúdo, nunca o preço original riscado. A observação atual não integra essa referência. Os parâmetros de histórico são conservadores; não há percentual extra de desconto para liberar avaliação, porque a aprovação ainda depende dos critérios editoriais.

Sem histórico suficiente, reter por `insufficient_evidence` com motivo explícito; valor anterior comprovadamente abaixo do limite continua retido por `weak_offer`. Retenções automáticas pelo piso podem voltar à triagem quando preço ou evidência as tornarem elegíveis, desde que não exista decisão humana posterior. Aprovações, rejeições, saturação e produtos já anotados pela IA permanecem fora dessa recuperação. Não houve liberação em massa nem chamada paga à IA.

Política pura e consulta de candidatos implementadas em `packages/web/lib/triage-value-policy.ts` e `triage-candidates-db.ts`. O pipeline envia a referência comparável à IA e registra os fatos e a versão da política no evento. A aplicação confere se a decisão humana, o preço e a configuração continuam iguais depois da avaliação; uma retenção recuperada que receba recomendação de revisão passa efetivamente para `pending`.

O pipeline agora é `curation-pipeline-v3`, os eventos usam `ai-triage-v2` e os fatos do piso usam `triage-value-v1`. A interface explica a exceção e deixa de recomendar indefinidamente outra rodada sem candidatos. Não há migration nova.

**Verificação final:** 52 testes passaram em sete arquivos, incluindo sete casos novos do piso, regressão da IA, benchmark, Bússola, transições, snapshots e seleção. Os 16 cenários de PostgreSQL isolado passaram, executando a consulta e a aplicação reais: R$ 100 → R$ 11, evidência ausente, configuração diferente, faixa de preço, janela histórica, tenant, recuperação, preservação de decisão humana, persistência da aprovação e de seus fatos, ausência de duplicação e transição efetiva `held → pending` com piloto desligado. `npm run typecheck --prefix packages/web`, `git diff --check` e a verificação sintática do novo script passaram. Os testes usam avaliador sintético e não consomem IA. PGlite não comprova concorrência entre conexões; o código usa lock e confere a versão da entrada antes de aplicar a decisão.

**Banco conectado, 10/10 às 13:33 BRT:** a consulta nova foi executada em transação `repeatable read read only`, sem alterações. Retornou zero candidatos. Havia 83 retidos recentes, todos abaixo de R$ 20, e 29 pendentes recentes; nenhum desses 112 tinha `variantKey` válida. Portanto, o histórico disponível não permite comprovar a exceção desses produtos, e a correção não promete aprová-los na próxima rodada. Evidência: [evidencias-correcao-piso-2026-10-10.json](./evidencias-correcao-piso-2026-10-10.json).

Os mapeadores atuais de Shopee, AliExpress e Mercado Livre registram a fonte e alguns fatos do anúncio, mas não produzem `variantKey` (`packages/capture/src/adapters/shopee/mapper.ts`, `aliexpress/mapper.ts`, `mercadolivre/deals.ts`). **Para que a exceção funcione automaticamente nas novas capturas, falta obter e persistir a identidade real da configuração pela fonte ou por enriquecimento verificável.** Repetir a captura atual por sete dias, sozinho, não resolve essa ausência. Não foi inventada identidade a partir do ID genérico do anúncio; decisões humanas continuam disponíveis para os casos não comprovados. Essa integração de evidência é uma pendência registrada, fora da alteração da regra nesta entrega.

Arquivos centrais: `packages/web/lib/triage-value-policy.ts`, `triage-candidates-db.ts`, `curation-pipeline.ts`, `curation-db.ts`, contrato/prompt da IA e `app/admin/direcionamento/pipeline-view.tsx`. Testes novos: `packages/web/test/triage-value.test.mjs` e `tools/editorial-tests/triage-price.test.ts`.

Para reproduzir a verificação isolada:

```bash
npm run test:triage-price --prefix tools/editorial-tests
npm run typecheck --prefix packages/web
```

Para repetir apenas a leitura da regra nova no banco, sem captura ou IA:

```bash
cd packages/web
node --env-file=.env.local --experimental-strip-types bin/inspect-triage-value.mjs
```

**Estado de entrega:** código local alterado e testes concluídos; sem commit, deploy ou alteração de decisões no banco real. Não interpretar a verificação local como confirmação do ambiente implantado.

## Checkpoint 6 Esclarecimento sobre cron e captura manual

O cron do GitHub e o botão “Capturar ofertas de hoje” do admin não fazem a mesma operação. O workflow `monitor-prices.yml` executa `monitor-prices.ts`: escolhe IDs já existentes, priorizados por alertas, aprovação, cliques e pendência, e reconsulta preços de Shopee/AliExpress. Não descobre um catálogo novo nem dispara a IA. Executar esse mesmo workflow manualmente no GitHub continua sendo acompanhamento.

O botão do admin executa os CLIs de descoberta (`sweep-shopee.ts`, `sweep-aliexpress.ts` e, quando permitido, `sweep.ts` para ML). Busca por consultas/ofertas e pode trazer anúncios novos ou reencontrar anúncios existentes. Os dois caminhos gravam no mesmo catálogo. A chave `(tenant_id, marketplace, external_id)` mantém o produto único e cada execução acrescenta sua observação de preço. Portanto, “os mesmos produtos” significa identidade compartilhada quando reencontrados, não uma lista igual garantida entre os dois caminhos.

Exemplo: a descoberta encontra o anúncio Shopee 123 e cria o produto; depois o cron consulta o ID 123 e registra outro preço no mesmo produto. O cron pode acompanhar apenas parte do que foi descoberto. Na auditoria de hoje, as 90 execuções dos 15 dias anteriores eram de acompanhamento e a descoberta diária estava bloqueada pelo lote órfão; isso ajuda a explicar a recorrência dos produtos antigos. A triagem continua lendo uma fila geral, sem restringir ao lote/loja recém-capturado.

## Checkpoint 7 Relação da Curadoria com captura, triagem e acompanhamento

Leitura do código atual, sem disparar captura, IA ou mudanças no banco. A página `/admin/curadoria` reúne cinco abas, duas com subdivisões, sobre o mesmo catálogo. A distinção entre operações existe, mas a navegação mistura rotina, exceções, qualidade, configuração e diagnóstico técnico; algumas contagens e ações reforçam a sensação de repetir o trabalho.

| Área atual | Produtos e efeito real | Papel correto na operação |
|---|---|---|
| Revisar → Itens individuais | `curationQueue(...,"awaiting")` traz pendentes/legado recentes e não adiados, inclusive produtos com família. Aprovar, rejeitar, reter ou adiar registra decisão humana. Também contém botão de triagem por IA. | Resolver casos que precisam de decisão humana, com acesso ao contexto da triagem. |
| Revisar → Produtos semelhantes | `curationGroupCards` agrupa pendentes/legado por família e oferece decisões em lote, podendo reter os demais por saturação. | Outra forma de trabalhar a mesma fila, útil para reduzir repetição; não é uma segunda etapa obrigatória. |
| Controle de qualidade → Auditoria de hoje | `getRecentSpotCheckProducts` escolhe produtos já aprovados cuja última decisão é da IA. “Manter” confirma; “Descartar” muda a decisão e guarda feedback. Progresso diário conta só ações de auditoria, com meta fixa de 12. | Amostra para conferir a IA; não reavaliar manualmente todo aprovado nem selecionar os destaques. |
| Controle de qualidade → Retidos pela IA | `deferredQueue` mistura produtos retidos e adiados para o futuro. A tela oferece abrir o anúncio e antecipar adiamento, mas não aprovar/rejeitar diretamente um retido comum. | Exceções para revisão, que deveriam ficar junto da fila Revisar. |
| Seleção editorial | Catálogo aprovado; avaliação editorial detalhada, ordenação e ativação de uma edição compartilhada por home/pauta. Antes da primeira edição, os serviços usam o ranking do catálogo aprovado. | Escolher o que destacar entre os produtos admitidos no catálogo; é diferente de aprovar a entrada no catálogo. |
| Critérios e automação | Configura Bússola, piloto automático e nota de corte; exibe exemplos humanos recentes enviados ao modelo como contexto. | Configuração ocasional, sem obrigação diária nem treinamento de pesos da IA. |
| Histórico da IA | Mostra lotes e decisões e permite executar a triagem geral. Usa o mesmo motor do botão em Revisar e do encadeamento pós-captura. | Diagnóstico e recuperação operacional; não é uma outra IA ou catálogo. |

### Sobreposições e inconsistências confirmadas

1. **Individual e grupos se sobrepõem.** O contador “Itens individuais” conta somente produtos sem família (`curationDecisionLoad`), mas a lista individual não aplica esse filtro (`curationQueue`). Assim, produtos com família podem aparecer nas duas apresentações. A decisão gravada é compartilhada; o mesmo produto não precisa receber uma aprovação em cada aba.
2. **Controle de qualidade mistura aprovados e retidos.** O badge da aba conta `summary.held`, mas a abertura padrão mostra aprovações da IA. A auditoria de hoje usa um recorte histórico, não a seleção vigente, conforme o checkpoint 4. Revisão comum não aumenta a meta de auditoria: são eventos diferentes.
3. **Retidos têm uma tela de acompanhamento sem conclusão da revisão.** A aba recebe todo `held` recente, inclusive decisão de regra ou humana, mas chama todos de “retidos pela IA”. Sua ação de antecipar apenas limpa `deferred_until`; não altera `held` para pendente. Retidos não adiados não têm ação de julgamento nessa tela, e Revisar normalmente os exclui. Falta um acesso efetivo à decisão humana desses casos. A recuperação automática pelo piso do checkpoint 5 não resolve os outros motivos nem os casos sem evidência.
4. **Existem vários disparos do mesmo motor.** Revisar, Histórico da IA e o pós-captura chamam a triagem geral. Na revisão, o resumo exibido omite o contador de aprovados, embora o motor possa aprovar. Isso pode esconder uma aprovação real para quem executa por essa tela.
5. **Aprovação, seleção e auditoria não formam uma sequência de aprovações obrigatórias.** Aprovação admite o produto no catálogo; seleção define os destaques; auditoria confere uma amostra da IA. A auditoria não é um bloqueio técnico da publicação pública. A régua do admin e o convite para ir à pauta após a meta passam uma impressão de dependência maior que a existente.
6. **Contagens não descrevem sempre a tela.** “Produtos ativos no catálogo” usa o total de `approved`, sem exigir presença recente. O badge da seleção também usa aprovados totais; o badge de retidos conta todos os retidos, enquanto a lista exige presença recente e limita resultados. Os números não equivalem à quantidade selecionável/visível agora.
7. **Há texto desatualizado depois da correção do piso.** `held-queue-view.tsx` ainda diz que retidos nunca voltam sozinhos à triagem; isso precisa distinguir a recuperação automática de retenções pelo piso implementada no checkpoint 5 dos demais motivos. Nesta análise não foi alterada a interface.

### Proposta de simplificação, ainda não implementada

A rotina deve apresentar uma sequência principal: **descobrir ofertas → triar → resolver exceções necessárias → conferir a seleção → preparar pauta**. O acompanhamento por cron corre em paralelo e atualiza fatos de produtos conhecidos. Auditoria da IA é uma atividade de qualidade com escopo explícito e meta adaptada à amostra disponível, sem virar segunda aprovação de todo produto.

- **Hoje / Seleção:** mostrar o resultado da captura e triagem, a seleção realmente vigente e uma próxima ação coerente, com origem/lote/frescor visíveis. Home e pauta continuam compartilhando a mesma edição.
- **Pendências:** uma fila humana com filtros claros “aguardando decisão”, “retidos” e “adiados”. Individual/agrupado são modos de visualização dessa fila. O detalhe permite decidir e explica o motivo real da retenção.
- **Qualidade da IA:** amostra de aprovados, explicitamente separada das pendências e identificada como seleção de hoje ou histórico, conforme a política escolhida. Não exigir meta impossível quando não há candidatos.
- **Configurações e histórico:** critérios, piloto, logs e execução técnica em área secundária. Manter um disparo principal de triagem e uma ação técnica de recuperação identificada, com o mesmo contexto/lote.

Essa proposta preserva aprovação, retenção, rejeição, adiamento, decisão em grupo, auditoria e edição editorial. Ela reorganiza o trabalho em torno de decisões distintas, em vez de pedir que o operador percorra todas as abas.

Evidências principais: `packages/web/app/admin/curadoria/page.tsx`, `curation-reviewer.tsx`, `group-reviewer.tsx`, `held-queue-view.tsx`, `spot-check-view.tsx`, `selecao-view.tsx`; `packages/web/lib/curation-db.ts` (`curationQueue`, `curationDecisionLoad`, `deferredQueue`, `clearDeferredReview`), `editorial-compass.ts` (`getRecentSpotCheckProducts`, `getDailyAuditProgress`, `getGoldenExamples`); `packages/web/app/admin/today-command-center.tsx`.

## Checkpoint 8 Reorganização autorizada e iniciada

O dono pediu rearranjo e otimização do fluxo. Entrega em implementação: três áreas principais (Seleção, Pendências e Qualidade da IA), critérios/histórico secundários, filtros de pendências sem sobreposição, julgamento humano de retidos, adiamento separado, motivos reais visíveis, auditoria recente com meta possível e sem bloqueio de pauta, e estados reais da seleção no ponto de entrada do admin. Links antigos serão redirecionados para os destinos equivalentes. Aprovação e seleção continuam distintas; decisões e histórico serão preservados.

A captura/cron continuam sendo as operações descritas no checkpoint 6. Esta reorganização não deve ser confundida com a implementação de uma fila durável de captura/triagem ou com a integração de identidade de variantes, pendências técnicas registradas anteriormente. Nenhuma IA paga ou captura real será necessária para validar a nova curadoria.

## Checkpoint 9 Curadoria simplificada — implementada localmente

O dono autorizou remover recursos dispensáveis e delegou as decisões de otimização. A navegação agora tem **Seleção, Pendências e Qualidade da IA**, com **Configurações e histórico** recolhidos. A Seleção é a entrada padrão e mostra os produtos realmente publicados pelo serviço compartilhado de home/pauta. Personalizar uma edição editorial é opcional e fica recolhido. Não exige preencher avaliações editoriais para utilizar a seleção automática inicial.

Fluxo de trabalho vigente na interface:

1. **Hoje → Capturar ofertas:** descobre ofertas nas lojas escolhidas. A triagem encadeada continua lendo a fila geral, até 100 produtos; a interface informa que é preciso acompanhar nessa tela até terminar. Seu resultado distingue aprovados no catálogo, retidos, rejeitados e casos para revisão e leva à Seleção.
2. **Seleção:** conferir os destaques vigentes e abrir a pauta. O único disparo manual da IA fica aqui, com o número de candidatos elegíveis e desabilitado quando não há candidatos. Esse disparo usa o mesmo serviço do pós-captura.
3. **Pendências:** filtros disjuntos “Aguardando decisão”, “Retidos” e “Adiados”, todos com recorte recente de sete dias. Retidos agora podem ser aprovados, rejeitados, retidos com novo motivo ou adiados. Motivo persistido e justificativa automática são apresentados. Antecipar um adiado retido o devolve a Retidos, sem fingir que virou pendente.
4. **Item a item / Agrupar semelhantes:** duas apresentações da mesma fila aguardando decisão; não são duas etapas. Decisões em grupo atualizam representantes e contagens pela leitura do servidor. Desfazer continua disponível mesmo ao resolver o último grupo. Reter o grupo não depende dos representantes pré-selecionados.
5. **Qualidade da IA:** atividade opcional sobre últimas aprovações da IA feitas nos últimos sete dias, de produtos também recentes. Meta de até 12, adaptada à amostra disponível; sem candidatos a meta é zero. Confirmar/corrigir exige que a aprovação exibida ainda seja a última decisão, para preservar ações humanas posteriores e impedir dupla confirmação. Essa atividade não bloqueia home, seleção ou pauta.

Removidos: tela passiva de retidos, componente não utilizado de aprendizados, aprovação emergencial em massa por nota 3, disparo duplicado da IA no histórico, resumo duplicado da carga decisória no painel Hoje e auxiliares sem uso relacionados a essas telas. Critérios, exemplos humanos, histórico de decisões, revisão em grupo, adiamento, desfazer e edição editorial foram preservados. Links antigos para espera/retidos redirecionam para Pendências; os demais aliases continuam funcionando.

Também foi removido o resumo operacional duplicado do Histórico: exibia 488 pendentes antigos e um estado de repouso calculado sem o lote pai de captura. Os registros de execução e a inspeção de decisões foram preservados em `app/admin/direcionamento/execution-history.tsx`; a tabela de consultas agora distingue captura de acompanhamento. O histórico permanece identificado como parte da Curadoria no menu lateral. As consultas de resumo sem uso (`getOperationalPulse` e `curationDecisionLoad`) foram removidas, reduzindo leituras redundantes.

Hoje agora calcula disponibilidade da pauta com a seleção real, não com o simples término da triagem. A conclusão diária de descoberta ignora execuções de acompanhamento do cron. Aprovação deixou de ser apresentada como publicação garantida. O badge de Curadoria soma produtos recentes das três filas, sem misturar número de grupos com número de produtos.

**Verificação:** 287 testes da aplicação passaram, mais 21 cenários de preço/triagem/filas/qualidade e 29 da seleção editorial em PostgreSQL isolado. Typecheck e compilação de produção passaram; build feito numa cópia temporária para preservar o servidor de desenvolvimento aberto. A execução inicial no sandbox restringiu `os.networkInterfaces` nos testes de QR e a compilação; ambos passaram executados fora dessa restrição. Navegação autenticada verificada em `localhost:3100`: Seleção com 24 produtos/3 destaques, Pendências com 26 aguardando + 73 retidos + 0 adiados, Qualidade com quatro aprovações disponíveis, agrupamento, filas vazias e estados reais no painel Hoje. Também inspecionada a versão estreita da interface. Esses números são um retrato desta verificação, não metas fixas. Nenhuma decisão humana foi executada no banco real, nem captura ou chamada paga à IA para testar a interface. Ações de escrita foram verificadas no PostgreSQL isolado.

Arquivos principais desta reorganização: `app/admin/curadoria/page.tsx`, `curation-reviewer.tsx`, `group-reviewer.tsx`, `spot-check-view.tsx`, novos `triage-control.tsx` e `published-selection.tsx`; `app/admin/today-command-center.tsx`, `batch-capture-panel.tsx`, `page.tsx`, `layout.tsx`; `lib/curation-db.ts`, `editorial-compass.ts`, `admin-db.ts`, `admin-query-aliases.ts` e novo `curation-workflow.ts`, todos sob `packages/web`. Não houve nova migration.

**Estado da entrega:** implementação local, sem commit ou deploy. A reorganização torna a operação mais clara, mas **não resolve as pendências da captura**: lote órfão encontrado anteriormente, inicialização/timeout/continuidade do processo e triagem encadeada ainda dependente do navegador. Também continua faltando a identidade verificável da configuração nas observações para abrir automaticamente a exceção de preço abaixo do piso (checkpoint 5). Não interpretar esta entrega como garantia de novas aprovações automáticas no catálogo atual.

Comandos de verificação:

```bash
npm test --prefix packages/web
npm run typecheck --prefix packages/web
npm run test:triage-price --prefix tools/editorial-tests
npm test --prefix tools/editorial-tests
```

## Checkpoint 10 Estabilização autorizada — em implementação

O dono autorizou prosseguir. Confirmada a causa estrutural: as rotas tentam iniciar CLIs locais desacoplados no ambiente Vercel, sem acompanhar erro assíncrono de inicialização; a triagem depende de um efeito do navegador. Além disso, inferir a conclusão do lote pelas consultas filhas pode encerrar a operação entre duas consultas da mesma loja, ou deixá-la eternamente aberta quando nenhum processo inicia.

Decisão: usar GitHub Actions em produção e um único executor local em desenvolvimento, ambos com a mesma operação persistida. Captura por loja e triagem do próprio lote serão sequenciais, com confirmação de inicialização, prazo de execução, trava de proprietário e resultados persistidos. Reabrir o painel apenas acompanha o lote; não executa IA. Operações expiradas serão encerradas com motivo, preservando o histórico. Consentimento do Mercado Livre vale exclusivamente para a execução selecionada. A tabela existente já possui `metadata` e índice único por operação ativa; não é necessária mudança de esquema.

O token `GITHUB_ACTIONS_WRITE_TOKEN` está ausente no ambiente local; isso ainda não comprova o estado de produção. Workflow novo precisa estar na branch configurada antes do despacho. Não houve captura real, chamada paga à IA, deploy ou reparo do banco real nesta etapa inicial.

### Progresso persistido da estabilização

Implementados `capture-batch-db.ts`, `capture-batch-worker.ts`, `capture-dispatch.ts`, CLI `run-capture-batch.ts` e workflow `capture-offers.yml`. As três rotas antigas de captura agora entram na mesma operação pai. Uma operação ativa por tenant, claim atômico por executor, até 15 minutos para inicialização e 55 minutos após claim, subprocessos de captura limitados a 12 minutos por loja e triagem a 10 minutos. O navegador apenas lê estado/resultado salvo; ao reabrir, encontra o último lote. A conclusão depende do término dos CLIs, não de uma consulta filha ter acabado. Falha de despacho encerra o lote ainda na fila; uma entrega duplicada ou tardia não repete coleta/IA.

A triagem encadeada usa os produtos observados no próprio lote (até 200 candidatos elegíveis por execução). O disparo manual da Curadoria continua usando a fila geral. Decisões humanas e alterações de evidência invalidam a aplicação da IA como antes; adicionalmente, o dono e o prazo do lote são verificados antes de aplicar decisões. Erro/timeout de triagem fecha seu registro vinculado para não manter a trava ativa. A consulta de acompanhamento agora transporta `offerEvidence` para a observação; não copia identidade de uma observação antiga para uma configuração desconhecida.

**Reparo real executado em 10/10/2026 às 17:37 BRT:** confirmado por nova leitura que o lote `c5c334a3-3783-4e3b-ae8c-2e35e6b4c1d0`, aberto desde 25/09 e sem nenhuma consulta filha, continuava `running`. O CLI de reconciliação encerrou exclusivamente esse lote como `error`, motivo `execution_timeout`. Produtos e decisões não foram alterados. Evidência: `evidencias-estabilizacao-captura-2026-10-10.json`. O CLI é somente leitura por padrão e exige `--execute` para encerrar registros expirados.

**Verificação parcial:** 11 cenários PostgreSQL isolado da captura passaram; 22 cenários de preço/triagem passaram, incluindo o novo filtro por lote; 287 testes web passaram e typecheck passou. Ainda faltam revisão final, build isolado e conferência visual desta entrega.

**Configuração externa:** listagem autenticada do GitHub confirmou credenciais das lojas e `DATABASE_URL`, mas `GEMINI_API_KEY` ainda está ausente dos secrets do repositório. Consulta dos nomes das variáveis na Vercel foi negada com HTTP 403 para o projeto conhecido; fallback CLI sem credenciais disponíveis. Não foi possível confirmar `GITHUB_ACTIONS_WRITE_TOKEN` em produção. Nenhum segredo foi exibido, copiado ou alterado nesta verificação. Nenhum workflow novo foi publicado ou disparado. Para ativação após revisar/publicar o código: provisionar o secret da IA no GitHub e token com permissão Actions:write para esse repositório no servidor Vercel; workflow na referência configurada (`main` por padrão, `GITHUB_CAPTURE_REF` opcional). Não tratar implementação local como executor já ativo em produção.

## Checkpoint 11 Estabilização validada — entrega local concluída

**Verificação final:** 291 testes web passaram, incluindo subprocesso inexistente, término forçado por timeout, saída não zero e transporte de resultado sem exibir stderr. Os 11 cenários da operação em PostgreSQL isolado e os 22 de preço/triagem passaram novamente após revisão; suíte da persistência passou. Typecheck e compilação de produção passaram. A compilação foi feita em `/tmp/garimpa-capture-build-t131le0j`, com arquivos finais e sem alterar o `.next` do servidor aberto; cópia temporária removida após a verificação. Logs desta sessão em `/tmp/garimpa-capture-build-final.log`, `/tmp/garimpa-web-tests-capture.log`, `/tmp/garimpa-capture-postgres-tests.log` e `/tmp/garimpa-triage-postgres-tests.log`.

Verificado no navegador autenticado em `localhost:3100/admin`: painel recupera a última operação, mostra sua data e motivo de encerramento e permite nova captura. Disponibilidade das lojas permanece separada do resultado histórico, evitando apresentar uma falha antiga como indisponibilidade atual. Não foi pressionado o botão de captura nem executada decisão humana para testar. Não houve nova captura nem chamada paga à IA.

Na revisão, também corrigidos: resposta de despacho perdida depois de o executor já ter iniciado (preserva e acompanha a execução existente); falha ao finalizar `triage_run` não é mais silenciosamente anunciada como sucesso; CLI sinaliza ao GitHub falhas/parcialidades persistidas com código de saída diferente de zero. Rotas legadas continuam disponíveis, mas usam o mesmo executor/lote. O cron de acompanhamento por ID permanece separado da descoberta e continua compartilhando o catálogo.

O despacho foi preparado conforme a [API oficial de workflow_dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event). **Não foi ativado em produção.** A pendência concreta é publicar o workflow/código e configurar `GEMINI_API_KEY` no GitHub e `GITHUB_ACTIONS_WRITE_TOKEN` no ambiente servidor da Vercel (confirmar presença, pois o acesso aos nomes das variáveis retornou 403). Não enviar tokens pelo chat. Não substituir esse token por uma credencial pessoal ampla do CLI. Configurar apenas acesso ao repositório `ManyRagDev/bizuminer` e permissão necessária para despachar Actions. As credenciais das lojas e `DATABASE_URL` já existem no GitHub; não precisam ser recriadas para esta entrega. Configuração local de desenvolvimento usa o executor local, sem token GitHub.

**Limite da exceção de preço:** os contratos atuais de descoberta e de reconsulta das APIs não fornecem `variantKey` verificado. Preservar `offerEvidence` no monitoramento corrige a perda de dados, mas não cria uma identidade inexistente. Não foi usado ID genérico de anúncio, título, desconto riscado ou igualdade de faixa de preço como substituto de identidade. Uma oferta abaixo do piso ainda vai para revisão quando faltar histórico da mesma configuração. A integração de uma fonte real de SKU/configuração continua sendo uma etapa separada; não foi implementado um endpoint sem contrato oficial e resposta verificável.

**Arquivos principais desta etapa:** `.github/workflows/capture-offers.yml`; `packages/web/lib/capture-batch-db.ts`, `capture-batch-worker.ts`, `capture-dispatch.ts`, `capture-process.ts`, `triage-candidates-db.ts`, `curation-db.ts`, `admin-db.ts`; `packages/web/bin/run-capture-batch.ts`, `run-triage.ts`, `reconcile-capture-batches.ts`; as três rotas sob `app/api/admin/rodagem`, `app/admin/batch-capture-panel.tsx`; `packages/persistence/bin/monitor-prices.ts`; testes em `packages/web/test/capture-process.test.mjs` e `tools/editorial-tests/{capture-batch,triage-price}.test.ts`. Sem migration nova, mudança em segredo remoto, publicação de código ou alterações na frente de marketing.

Comandos adicionais desta entrega:

```bash
npm run test:capture-batch --prefix tools/editorial-tests
npm run test:triage-price --prefix tools/editorial-tests
npm test --prefix packages/web
npm run typecheck --prefix packages/web
# Somente leitura por padrão; não usar --execute apenas para retomar contexto.
cd packages/web
node --env-file=.env.local --experimental-strip-types bin/reconcile-capture-batches.ts
```

## Checkpoint 12 Falha do Mercado Livre em 10/10/2026 às 17:50 BRT

A pedido do dono, consultados o lote `f09adc8c-eb71-4a4e-8872-4f741ad83d45` e a consulta `055f72b6-6130-4eb3-bd3d-70bd4934e0bc`. O executor **local** iniciou normalmente, com consentimento do Mercado Livre registrado. O lote abriu às 17:50:34 e encerrou às 17:50:39 como `error/capture_failed`; a loja registrou `step_exit_failed`. A consulta iniciou às 17:50:35 e falhou às 17:50:38, antes de entregar a primeira página ao serviço de ingestão. Contadores: zero itens vistos, capturados e novos; zero páginas concluídas. Nenhuma execução de triagem foi criada para esse lote.

Erro específico persistido: **“nenhuma oferta extraída da página de ofertas — layout mudou?”**. A mensagem é gerada em `packages/capture/src/adapters/mercadolivre/deals.ts` após receber uma resposta HTTP bem-sucedida, ler seu HTML e obter zero ofertas no parser da primeira página. Esse parser depende da assinatura `poly-card poly-card--grid-card` e do título/link/preço reconhecíveis nos cards. A última consulta bem-sucedida anterior registrada foi em 24/09 às 15:16, com 37 itens.

**Conclusão comprovada:** falha de extração da listagem, anterior à triagem e à aplicação do piso de preço. O executor encadeado iniciou e encerrou o lote corretamente. **Limite:** “layout mudou?” é uma hipótese da mensagem, não uma mudança confirmada. O HTML, a URL final e os detalhes da resposta dessa consulta não foram preservados; a evidência atual não distingue mudança de marcação de uma página alternativa de verificação ou resposta sem cards reconhecidos. Não foi realizada nova consulta ao Mercado Livre para tentar reproduzir a falha, nem alterado o parser ou qualquer registro real nesta investigação.

Evidência salva em `evidencias-erro-mercadolivre-2026-10-10-1750.json`. Próxima investigação técnica, caso solicitada: obter uma resposta verificável da listagem, classificar a página recebida e só então ajustar o parser e/ou o diagnóstico; preservar a distinção entre falha de transporte, página alternativa e zero ofertas.

## Checkpoint 13 Investigação aprofundada do Mercado Livre — concluída

O dono solicitou confirmar a hipótese e descobrir a causa real. Às **17:59:12 BRT de 10/10**, uma requisição de diagnóstico à mesma URL `/ofertas`, com os mesmos cabeçalhos do adaptador e sem cookies/autenticação, foi **redirecionada para `/gz/account-verification`**. A resposta final foi HTTP 200, `text/html`, título “Mercado Libre”, 41.327 bytes. O texto visível pede acesso à conta (“Olá! Para continuar, acesse sua conta”) e apresenta “Sou novo” / “Já tenho conta”. Não há cards, títulos ou preços de ofertas reconhecíveis; o parser retorna zero.

**Causa reproduzida:** o coletor recebeu uma página de verificação/acesso à conta, não a listagem. O código aceita o HTTP 200 após redirecionamento e não classifica a URL final ou o conteúdo; assim, diagnostica a página de acesso como possível mudança de layout. Não há evidência de que atualizar seletores resolveria essa resposta.

**Limites importantes:** o corpo original das 17:50 não foi salvo. A reprodução ocorreu nove minutos depois, no mesmo ambiente e com os mesmos cabeçalhos, mas não prova que o corpo original era idêntico. O mecanismo exato que motivou o Mercado Livre a exigir conta nessa requisição (sessão, política de acesso, sinalização automatizada etc.) não é informado pela página. Não atribuir especificamente a bloqueio de IP ou CAPTCHA sem evidência.

HTML bruto mantido apenas em arquivo privado temporário (`/tmp/garimpa-ml-diagnostico-20261010/ofertas-node.html`), pois contém identificadores de navegação. Manifesto sanitizado em `/tmp/garimpa-ml-diagnostico-20261010/manifest-node.json`. Nenhum produto/decisão foi gravado e nenhuma IA foi executada nesta investigação.

### Evidências cruzadas

| Verificação | Resultado observado | Implicação |
|---|---|---|
| Node com os cabeçalhos do adaptador, 17:59:12 | `/ofertas` termina em `/gz/account-verification`, HTTP 200; zero cards e zero ofertas extraídas. | A resposta recebida não é uma listagem vazia nem um card com seletor novo. |
| Primeiro salto sem seguir redirecionamento, 18:04:45 | HTTP **302**, destino `/gz/account-verification`, parâmetro de retorno aponta para `/ofertas`. | Confirma que o servidor exige a verificação antes de entregar a listagem a esse cliente. Não houve tentativa de contornar a tela. |
| Navegador normal, DOM às 18:02:43 | URL continua `/ofertas`; **48 cards**, todos com assinatura de classe, título e preço reconhecíveis. Menu mostra “Crie a sua conta” / “Entre”; não foi feito login. | A página funciona nesse contexto de navegador. Não é correto concluir que todo visitante precisa entrar em uma conta. O coletor Node não compartilha o contexto/sessão do navegador. |
| Replay offline do HTML de acesso pelo **adaptador real** | Uma chamada de fetch simulada gera `malformed_response`, sem retry, com a **mesma mensagem exata persistida às 17:50**. | A página de acesso explica integralmente o erro observado; a sugestão de layout é produzida pelo nosso código. |
| Controle histórico e três recortes mínimos do DOM atual | Fixture de agosto: 3 ofertas. Recortes de hoje: 3 ofertas, preços R$ 899,10 / R$ 506,70 / R$ 2.727,00 e preços anteriores correspondentes. | Não foi necessário mudar os seletores para esses cards. O recorte não valida identidade de SKU/anúncio, nem equivale ao HTML bruto recebido do servidor. |

### Encadeamento da causa

1. O executor local inicia o CLI; o adaptador usa `fetch` sem cookies ou autenticação, mesmo se o operador estiver usando o painel em um navegador com sessão própria.
2. O Mercado Livre responde 302 para verificação de conta. O `fetch` segue redirecionamentos por padrão, e a página final responde 200.
3. `fetchPage` verifica `response.ok`, mas ignora `response.url`/`redirected` e não reconhece a página de acesso. Passa seu HTML ao parser de ofertas.
4. O parser encontra zero cards. O adaptador lança a mensagem genérica “layout mudou?”, classificada como `malformed_response`, não repetível. Isso é compatível com a falha rápida e sem páginas concluídas.
5. `sweep` persiste somente a mensagem em `capture_run`; não preserva URL final, tipo de página ou amostra sanitizada. O processo termina com erro; o lote pai registra `step_exit_failed/capture_failed` e não inicia triagem.

**Conclusão:** a hipótese de alteração de layout **não se confirmou como causa da reprodução**. A causa concreta reproduzida é **restrição/verificação de acesso aplicada à requisição do coletor**, agravada pelo diagnóstico incorreto do adaptador. Esta é uma explicação forte para a execução das 17:50, com a ressalva de que sua resposta original não foi retida. Não envolve piso de preço, configuração da IA, aprovação automática, timeout do novo executor ou falha de consentimento.

### Consequências para a correção

- **Diagnóstico:** classificar redirecionamento/página de acesso antes de tentar extrair ofertas; registrar status, host/caminho final, tipo de página e contagem de cards, sem cookies, valores de query ou HTML completo. Diferenciar “verificação de acesso exigida” de “listagem recebida sem cards reconhecidos”. Preservar o erro específico da loja no painel, além do erro genérico do processo pai.
- **Operação:** mudar seletores ou aumentar retries não remove a verificação. O botão do admin dispara o coletor no servidor; clicar manualmente nesse botão não equivale a capturar no navegador. O caminho humano já existente, por bookmarklet/extensão, lê a página que o operador consegue abrir e importa para o catálogo; a investigação confirmou a rota de importação, mas não executou nem validou uma nova importação real.
- **Automação futura:** qualquer fonte oficial precisa de acesso/contrato efetivamente validado. Não presumir que adicionar um token da API ao `fetch` HTML ou copiar a sessão do navegador resolverá a descoberta. Não foram alterados flags, credenciais, métodos de acesso ou código funcional nesta investigação.

Evidências permanentes: **`evidencias-diagnostico-mercadolivre-2026-10-10.json`** e **`evidencias-cards-mercadolivre-2026-10-10.html`**. O JSON inclui horários, status, hash do HTML bruto, contagens, resultado do replay e limites. Os arquivos privados em `/tmp` são auxiliares e podem desaparecer; o checkpoint e as evidências sanitizadas são o registro para retomada. A documentação histórica de engenharia reversa recebeu ressalva datada sobre a suposição de que a listagem sempre responderia ao fetch simples.

## Checkpoint 14 Login e continuação da captura — esclarecimento de arquitetura

O dono perguntou se bastaria fazer login no Mercado Livre e se o painel poderia abrir o redirecionamento e continuar a busca. **No fluxo atual, login no navegador não autentica o coletor Node.** O servidor executa seu próprio `fetch`, sem a sessão do navegador. Abrir a tela de acesso para o operador e depois repetir o mesmo fetch continuaria sem essa sessão e não garante remover a verificação. A investigação abriu a listagem no navegador com menu de visitante; portanto, nem sequer foi demonstrado que login é necessário nesse contexto de navegador.

É possível construir a experiência “abrir Mercado Livre → resolver acesso se necessário → continuar no mesmo lote”, desde que a captura aconteça **no contexto do navegador** e envie os produtos ao painel. Proposta, **ainda não implementada**:

1. O painel identifica a verificação e apresenta uma etapa acionável “Continuar no Mercado Livre”, preservando a referência da operação e os resultados das demais lojas.
2. Abre a listagem em outra aba; o operador realiza o acesso no próprio ML se solicitado.
3. A extensão captura os cards da página aberta mediante ação do operador e envia uma importação vinculada à operação, com validação e deduplicação no servidor.
4. O painel acompanha a importação e encadeia triagem/seleção sobre os produtos desse lote. Conclusão exige confirmar produtos importados, não apenas assumir que fechar a aba significa login concluído.

**Infraestrutura existente confirmada por leitura de código:** `packages/extension` injeta botões nos cards após “Ativar nesta página”; a captura atual é por clique em cada card. O contrato `/api/extension/captures` recebe um produto por pedido, sem referência de `capture_batch`. O bookmarklet recebe uma página individual e gera um bloco BM1 para colagem; tampouco retoma o lote ou dispara a triagem encadeada. Assim, reaproveitar a extensão é viável como direção técnica, mas importação da listagem, vínculo com o lote e retomada precisam ser implementados e validados. Não afirmar que já existe “login e continuar” ou que o bookmarklet atual importa todas as ofertas.

Nenhum login, captura, alteração funcional, nova permissão da extensão ou cópia de sessão foi realizado para este esclarecimento.

## Checkpoint 15 Continuação pelo navegador — decisões da implementação (concluída no checkpoint 16)

O dono autorizou preparar e testar a experiência do checkpoint 14. Decisão: novas operações com Mercado Livre usarão a página aberta pelo operador; não repetir o fetch que já reproduziu verificação de acesso. As demais lojas continuam pelo executor. O lote aguarda a importação do navegador, com prazo e opção de concluir sem ML; a importação confirma os produtos gravados e libera a triagem do mesmo lote, sem repetir as lojas concluídas. A extensão será reaproveitada para importar os cards mediante clique; um bloco copiado pelo bookmarklet permite testar a mesma importação sem depender da instalação da extensão. Os dois caminhos usarão a mesma validação/operação, não filas independentes.

Implementar sem nova tabela/migration, usando os metadados existentes e as observações vinculadas a `capture_run`. Exigir identidade do solicitante, consentimento por execução, importação atômica/idempotente e retomada com claim único. Não transportar cookies ou login ML para o servidor. Primeiro validar em banco isolado e no navegador; registrar separadamente qualquer teste real, sem presumir sucesso.

### Validação parcial e estado para retomada

Implementação local pronta para teste: lote aguarda `awaiting_browser` por até 30 minutos; extensão prepara uma prévia e importa mediante confirmação; alternativa BM2 pelo painel usa a mesma validação e transação. Importação exige o usuário do lote, revalida o dispositivo quando utilizado, grava produtos/observações/run de captura atomicamente, impede repetição e retoma somente a triagem. Demais lojas concluídas não são repetidas. O adaptador antigo agora distingue verificação de acesso de listagem sem ofertas.

Passaram tipagem web/extensão, testes de captura e extensão, contrato BM2 e 15 cenários em PostgreSQL isolado, incluindo rollback, usuário/dispositivo indevido, expiração e retomada sem duplicar IA. Na suíte web, dois arquivos falharam sob restrições do sandbox e passaram separadamente com subprocessos/interfaces de rede liberados (9 testes); os demais 44 grupos já haviam passado. Ainda falta build e confirmação real no painel/extensão; não declarar isso concluído.

Na primeira tentativa do painel houve `EMAXCONNSESSION`, limite de 15 sessões do pooler. A segunda abertura carregou normalmente; nenhuma sessão foi encerrada e nenhuma configuração do banco foi alterada. Esse episódio é separado da restrição do Mercado Livre. O teste real controlado está autorizado nesta conversa; selecionar somente ML e importar uma oferta, registrando IDs/resultados. Até este registro, nenhum novo lote/captura/IA havia sido iniciado.

## Checkpoint 16 Continuação pelo navegador — teste real concluído

**Resultado confirmado no painel e no banco:** lote `321bb45e-b185-4736-b5e2-9ce67b2434e4`, iniciado às 18:36 BRT e concluído às 18:40:10 BRT, estado `ok/finished`. O coletor compilado do painel leu **48 cards reais, sem ignorar nenhum**; para limitar o teste autorizado, foi montado um bloco BM2 com somente a primeira oferta desse resultado e importado pela interface autenticada. Não houve login ML, cópia de cookies, navegação automática para produtos ou importação das outras 47 ofertas.

- Captura filha `4c88ab9a-b1d0-4701-aaaa-fbcaee4f3fc5`: `ok`, modo `browser`, **1 observação**, vinculada ao lote.
- Triagem `82adfd64-1f99-4d65-b932-7b96e8823e4a`: **1 avaliado, 0 aprovados, 0 retidos, 1 rejeitado**. O Galaxy A17 recebeu nota 2 da IA e `low_utility`, por inadequação ao foco editorial de achadinhos/utilidades menores. A rejeição é uma decisão editorial; não é falha de captura ou de encadeamento. Não alterar a Bússola ou afrouxar aprovação só para tornar o teste verde.
- Nenhuma outra loja foi executada. A operação real produziu somente uma captura filha e uma triagem; ausência de duplicação confirmada nas contagens. Idempotência concorrente, rollback e retomada sem repetir lojas/IA foram testados separadamente no PostgreSQL isolado.

**Ajustes encontrados durante o teste:** o anúncio dos cards de catálogo vem em `#wid=MLB...`, não necessariamente na query. O coletor passou a ler esse ID e normalizá-lo para `?wid=`, sem confundir o ID de catálogo com o anúncio. Outro ajuste foi informar explicitamente `capture_run.id` (texto), pois o banco real não possui default para essa coluna. A primeira importação falhou atomicamente; nenhum produto/run parcial permaneceu. O fixture do teste foi alinhado a esse contrato para impedir regressão.

**Validação final:** 295 testes web passaram (zero falhas); 15 cenários PostgreSQL isolado; testes de captura e extensão, incluindo roundtrip completo do bookmarklet BM2 e identificação de anúncio no fragmento; tipagem web e extensão; build web de produção em cópia isolada; build/manifesto/pacote da extensão 0.2.0. O manifesto mantém as permissões anteriores, sem acesso permanente ao ML. A extensão foi empacotada em `packages/extension/release/bizuminer-extension-v0.2.0`; **não foi instalada, pareada ou testada ao vivo**. O teste real usou o painel e a leitura DOM do mesmo coletor compilado; o clique no favorito e sua área de transferência foram validados por roundtrip isolado, sem alegar execução real dessa parte no navegador.

Evidências: `evidencias-captura-navegador-2026-10-10.json` (sanitizado) e `evidencias-captura-navegador-2026-10-10.jpg` (painel concluído). A mudança permanece local, sem commit/deploy. Não criar outro lote nem rodar IA para apenas retomar esta conversa. Próxima etapa de disponibilização: revisar/publicar backend e extensão juntos e validar extensão instalada; o executor GitHub ainda depende das configurações de produção registradas nos checkpoints 10–11. O incidente pontual de conexões do banco recuperou sem intervenção e não foi tratado como causa da falha ML das 17:50.

## Checkpoint 17 Orientação acionável da captura ML

O dono relatou que “Continue a captura do Mercado Livre pelo navegador” não explica o que fazer. Confirmado no painel: a etapa pressupunha extensão instalada/pareada e escondia a alternativa em “Testar sem a extensão”. A interface foi corrigida no lote do usuário que já aguardava importação (início visível às 19:23 BRT), sem iniciar outro lote, importar ofertas ou executar IA.

O caminho principal agora é visível em três passos: **criar uma vez o favorito de captura → abrir ofertas e clicar nesse favorito → voltar, colar e importar**. A tela explica como editar nome/URL do favorito no Opera; mostra o campo de colagem, a ação “Importar ofertas e iniciar triagem” e o horário limite real. A extensão passou para alternativa secundária “Já uso a extensão BizuMiner”, com as ações reais de leitura e importação; o link de pareamento abre a aba existente de captura manual. A etapa de espera humana perdeu o indicador de processamento e informa que depende da importação. O aviso de disparo também distingue a ação humana necessária no ML.

Foi encontrado e corrigido outro problema de uso: o favorito gerado continha quebras de linha literais da função serializada, inclusive delimitando comentários `//`. Ao salvar como URL, essas quebras podem desaparecer. Agora o corpo é codificado com `encodeURIComponent`, preservando-as em uma única linha copiável, sem `eval`, requisições ao ML ou acesso à sessão. O roundtrip do teste passa pela normalização de `new URL(...).href` e decodificação, reproduzindo o contrato do navegador.

Verificação: teste focado do contrato/favorito passou e tipagem web passou; orientação e formulário confirmados no navegador no lote existente, com importação desabilitada enquanto vazia. Código gerado pela interface confirmado em uma linha. Screenshot em `evidencias-guia-captura-2026-10-10.jpg`. Nenhum favorito foi criado na configuração do navegador do usuário e não foi executada nova importação/triagem nesta correção. O usuário ainda precisa salvar o favorito e seguir os passos, ou utilizar a extensão já instalada. Sem commit/deploy.

Referências consultadas para instruções/contrato: [Opera — favoritos](https://help.opera.com/en/latest/features/#bookmarks) e [HTML Standard — avaliação de URL javascript](https://html.spec.whatwg.org/#evaluate-a-javascript:-url).

## Checkpoint 18 Automação preservada como requisito — revisão em andamento

O dono rejeitou a substituição do scraping por favorito/colagem: **a captura deve continuar automática; intervenção humana é contingência, não o caminho principal.** Os checkpoints 15–17 registram uma importação funcional, mas não satisfazem esse requisito. Não publicar essa solução como recuperação da automação.

Confirmado no código: `capture-batch-worker.ts` testa a presença de `execution.browser` e envia todo lote ML novo diretamente a `awaiting_browser`, sem tentar seu coletor. O metadata é criado para o usuário autenticado, portanto essa condição virou o caminho normal. Corrigir a escolha incondicional é necessário, mas voltar ao mesmo `fetch` não resolve sozinho a restrição reproduzida no checkpoint 13.

Direção da correção: manter descoberta e triagem automáticas no mesmo lote; separar erro de acesso de erro de parser/transporte; oferecer contingência humana somente quando realmente necessária, preservando as demais lojas. Um navegador automatizado é uma alternativa técnica a verificar, não garantia de acesso: navegador do operador abrir ofertas não demonstra que Chromium em um runner do GitHub terá o mesmo resultado. A API oficial existente também não pode ser declarada solução sem confirmar suas permissões reais; o histórico do projeto registra acesso ao usuário, mas 403 na busca de catálogo.

Esta revisão começou por leitura de código/documentação. Nenhum novo lote, importação, IA ou alteração de dados reais foi executado. A implementação e a validação desta correção serão registradas aqui antes da conclusão.

**Restrição informada pelo dono durante a revisão:** Mercado Livre não deve ir para o GitHub; sua captura é sob demanda no site. Não confundir disparo manual de uma captura automática com coleta manual de ofertas. O código anterior escolhe `github` em toda execução de produção, inclusive ML, e precisa ser ajustado. Foi solicitada somente uma definição de ambiente (site publicado também ou apenas local), enquanto a correção da escolha incondicional da importação e seus testes prosseguem; não iniciar implementação dependente dessa resposta.

### Correção local e confirmação do limite real

O executor agora tenta o coletor ML antes da contingência, mesmo quando existe metadata de navegador. O CLI transmite somente um erro tipado/sanitizado (`CAPTURE_FAILURE`); a verificação de acesso habilita a contingência e erros de parser, timeout ou inicialização encerram a captura com falha, sem inventar necessidade de login. A interface deixa de exigir importação na criação de todo lote e mantém o guia manual recolhido como opção de contingência. As demais lojas, o vínculo das observações e a triagem única do lote foram preservados.

O parser HTTP também foi alinhado ao anúncio real: considera `wid` na query/fragmento, `pdp_filters` e permalink `MLB-...`; descarta catálogo sem anúncio e preserva `?wid=` quando necessário. Evita criar uma identidade de catálogo diferente da identidade obtida pelo navegador.

**Sonda real somente leitura em 10/10 às 19:53:47 BRT:** o próprio adaptador recebeu HTTP 200 final em `/gz/account-verification`, 41.327 bytes e zero cards. A restrição continua; restaurar a tentativa automática não equivale a recuperar seu acesso. Evidência sanitizada em `evidencias-retomada-automacao-ml-2026-10-10.json`; sonda reproduzível `packages/capture/bin/probe-ml-deals.ts`. Sem dados brutos de sessão, banco, ingestão ou IA.

Validação: **20 cenários PostgreSQL isolado**, incluindo sucesso automático com dono de contingência, falhas que não podem virar login e retomada sem repetir lojas/IA; **5 testes do processo**; **8 grupos da suíte de captura**; tipagem web e captura; `git diff --check`. O teste de processos precisou da mesma liberação de subprocessos já usada anteriormente; passou fora da restrição. Nenhum novo lote real foi criado. Não foi validado novo build de produção nem a nova apresentação no navegador nesta revisão; o primeiro limite real confirmado permanece o acesso HTTP ao ML.

**Pendências obrigatórias:** (1) responder ao alcance local/publicado, (2) fazer ML permanecer no executor do site também em produção, substituindo o roteamento GitHub anterior, (3) implementar e comprovar uma fonte/coletor automático que obtenha ofertas nesse ambiente. Um browser worker é candidato técnico, mas não foi criado nem validado nesta revisão. A API de promoções oficial trata integração do vendedor; não assumir que substitui a descoberta de todo o catálogo. Referências verificadas: [permissões funcionais ML](https://developers.mercadolivre.com.br/pt_br/permissoes-funcionais/) e [ofertas do dia](https://developers.mercadolivre.com.br/pt_br/ofertas-do-dia). A causa do 403 histórico não foi revalidada com token atual. Sem commit/deploy; não publicar como automação recuperada.

## Checkpoint 19 Gatilho da verificação ML — comparações concluídas; motivo interno não exposto

O dono esclareceu que quer descobrir **o que dispara a verificação e como conferir**, antes de novas soluções de captura. Nesta etapa, foco em diagnóstico causal, sem alterar arquitetura, executar ingestão/IA ou publicar código.

Primeira evidência nova do HTML privado já salvo: a página carrega scripts oficiais sob `frontend-assets/suspicious-traffic-frontend`, incluindo `gz-account-verification-index`. Isso vincula a tela ao frontend de tráfego suspeito do próprio ML, mas não identifica sozinho o sinal usado na decisão. Não assumir bloqueio de IP, falta de login ou CAPTCHA. A próxima comparação controla cliente/cabeçalhos e examina metadados sanitizados de resposta/sessão anônima, sem transportar cookies do navegador do usuário.

### Resultado das comparações de 20:01–20:05 BRT

Oito leituras HTTP somente da listagem, com o controle original repetido e intervalo de pelo menos cinco segundos. Nenhum redirecionamento foi seguido nessa matriz. A última comparação de cabeçalhos foi adicionada separadamente às 20:04. A sonda reutilizável agora inclui os oito casos em uma sequência.

| Caso | Resultado | O que permite concluir |
|---|---|---|
| Node/Undici e cabeçalhos originais | 302 → `/gz/account-verification` | O próprio servidor redireciona antes de qualquer JavaScript ou parser. |
| Acrescentar somente `Accept-Language: pt-BR` | Mesmo 302 | O idioma ausente, isoladamente, não explica uma correção de acesso. |
| Trocar somente o UA por `BizuMiner-capture/0.1` | Mesmo 302 | Remover o UA antigo não basta; não elimina possíveis regras combinadas de UA. |
| Conjunto usual de cabeçalhos de navegação desktop | Mesmo 302 | Não basta adicionar esse conjunto; não é replay de uma requisição real do Opera nem teste de um único campo. |
| curl/OpenSSL com HTTP/1.1 | Mesmo 302 | O problema não é exclusivo de `fetch`/Undici. |
| Mesmo curl com HTTP/2 negociado | Mesmo 302 | Mudar somente o protocolo nessa comparação não basta. Não equivale a TLS/HTTP de Chromium. |
| Node com os cookies anônimos emitidos no primeiro 302 | Mesmo 302 | Simplesmente devolver `_d2id`, `_csrf`, `_mldataSessionId` e `x-theme` não basta. Não foram testados/exportados cookies do usuário ou uma sessão já validada. |
| Controle original ao final | Mesmo 302 | O resultado se manteve durante a comparação; não é evidência de indisponibilidade transitória que terminou no meio dos casos. |

As respostas têm `Date` atual, `Cache-Control: private, ... no-cache, no-store` e `X-Cache: Miss from cloudfront`. Isso enfraquece a hipótese de uma resposta antiga presa em cache. Não houve HTTP 429; isso não exclui políticas de risco que considerem frequência. As variáveis usuais de proxy não estão presentes no processo Node, mas isso não comprova que o navegador use a mesma saída/IP ou exclui VPN/proxy configurado em outra camada.

**Controle no Opera às 20:05:32 BRT:** mesma URL `/ofertas`, 48 cards, links “Crie a sua conta” e “Entre”; não foi feito login nem resolvido CAPTCHA. É um perfil existente com contexto próprio; não equivale a uma janela anônima. Sua localização e cookies não foram exportados.

**Inspeção do frontend:** o contexto de renderização da página de verificação registra `isBot:false` e `outdated:false`. Esses campos são do framework da página; não revelam a decisão do filtro que redirecionou `/ofertas`. Portanto, nem o nome do componente nem uma flag isolada autorizam concluir “bot detectado por tal regra”. O `tid` tem formato UUID, sem motivo legível; os cabeçalhos examinados tampouco expõem um código específico de risco. O bundle público de entrada confirma o nome da aplicação, mas carrega componentes e não revela a política do servidor. `/v3/security.js` respondeu 403 à leitura técnica; seu conteúdo não foi obtido nem executado, e não pode ser usado como explicação comprovada para o 302 anterior.

**Conclusão:** a decisão acontece no filtro de acesso do ML, antes da listagem. Os testes não sustentam uma correção simples por idioma, troca de UA, HTTP/2 ou cookies anônimos recém-emitidos. A diferença entre o contexto do navegador e os clientes HTTP é comprovada; **a regra exata que separa os contextos ainda não é conhecida**. Reputação da conexão/IP, sinais de dispositivo/navegação e características de TLS continuam hipóteses, sem eleger uma como causa comprovada. Uma confirmação final da regra pode exigir logs/suporte do ML; nenhuma mensagem foi enviada.

Evidência permanente: `evidencias-gatilho-verificacao-ml-2026-10-10.json`, com matriz, horários, análise do frontend e limites. Nenhum lote, produto, IA, login, instalação ou mudança de rede foi acionado. Somente a sonda e a documentação foram adicionadas nesta etapa; a arquitetura do fluxo não foi alterada.

### Como o dono pode verificar e separar as causas restantes

1. **Janela anônima, sem login:** abrir `https://www.mercadolivre.com.br/ofertas` e observar se aparecem ofertas ou verificação. A pergunta já foi enviada na conversa; resposta ainda não recebida neste registro. Se as ofertas abrirem também assim, login e histórico daquele perfil não são requisitos para esse navegador/rede. Se apenas o perfil normal abrir, isso aponta para contexto/sessão do navegador, sem provar que um cookie específico seja a causa.
2. **Sonda do coletor, no ambiente em que ele executa:** no terminal do projeto, usar o comando abaixo. É somente leitura, sem banco, importação ou IA. `kind: auth` com caminho final `/gz/account-verification` confirma a restrição no coletor; uma resposta com `ok:true` e ofertas confirma acesso naquele momento.

```bash
node --experimental-strip-types packages/capture/bin/probe-ml-deals.ts
```

3. **Comparação técnica reproduzível**, somente se quiser conferir a matriz completa. Faz oito leituras públicas espaçadas; não executar em loop. O arquivo de saída contém somente metadados sanitizados. A saída de processo zero significa que a comparação terminou, não que a captura foi liberada: conferir `status` e `location.path` de cada caso.

```bash
node packages/capture/bin/diagnose-ml-verification.mjs --output /tmp/diagnostico-ml.json
```

4. **Rede versus cliente:** se necessário, repetir a sonda curta em outra conexão disponível, mantendo computador e comando iguais, e anotar eventual VPN/proxy. Se o resultado mudar apenas ao trocar conexão, a rede influencia a decisão. Se o navegador anônimo abre e o coletor falha nas duas conexões, ganha força a hipótese dos sinais do cliente/navegação. Não é necessário fazer login, copiar cookies, desativar proteções ou instalar extensão para esses testes.
5. **Conferência visual do redirecionamento no navegador:** em uma janela anônima, abrir as ferramentas do desenvolvedor (`F12`), aba **Network/Rede**, habilitar **Preserve log/Preservar registro** e carregar `/ofertas`. Observar a primeira requisição do tipo documento, status e eventual `Location` para `/gz/account-verification`. Não compartilhar cookies, tokens ou HAR completo. A aba Rede do **admin** mostra o pedido ao nosso backend; ela não mostra diretamente o `fetch` ML executado pelo servidor, por isso é preciso comparar com a sonda.

Para o suporte do ML verificar sua regra interna, os dados úteis são horário com fuso, caminho `/ofertas`, status 302, caminho de destino e identificador da requisição (`x-request-id` ou `tid`), obtido privadamente na resposta da tentativa relevante. Este relatório público do repositório omite os valores desses identificadores e não contém cookies. Só uma resposta correlacionada do fornecedor poderia confirmar uma regra interna não exposta ao cliente.

## Checkpoint 20 Extensão como coletor no navegador — avaliação em 11/10/2026

O dono propôs aproveitar a extensão do navegador como caminho potencialmente mais confiável. Revisão somente de código e documentação oficial; nenhum lote, importação, IA, instalação, login ou deploy foi executado nesta etapa.

**Base já existente:** a extensão v0.2.0 usa `collectBrowserOffers` para ler os cards carregados no DOM da aba `/ofertas`, sem buscar a listagem por `fetch` no servidor. `prepareBrowserBatch` consulta o lote em espera, coleta a página e guarda o payload; `importBrowserBatch` envia as ofertas ao endpoint de lotes do BizuMiner. Esse caminho de lote é distinto do recurso legado de adicionar um card individual: para a captura diária, usar o mesmo lote e sua continuação, sem exigir seleção manual produto por produto. A preparação atual captura somente os cards carregados (limite 200), sem percorrer páginas automaticamente.

**Confiabilidade:** é uma candidata coerente com o checkpoint 19, pois a coleta aproveita uma página que o navegador conseguiu carregar. Isso é uma inferência a testar com a extensão instalada, não prova de imunidade à verificação ou identificação da regra interna do ML. O teste controlado anterior comprovou o coletor compartilhado e a importação/triagem, mas não executou o fluxo completo de uma extensão instalada e pareada.

**Limite atual:** o popup ainda exige preparação e confirmação; depende de lote em `awaiting_browser` e não é um executor automático iniciado pelo painel. O manifesto concede `activeTab` e não acesso permanente ao ML. Essa permissão é temporária e nasce de um gesto do usuário na extensão; não assumir que clicar no site autoriza leitura de outra aba. Os alarmes atuais reenviam capturas individuais pendentes; não descobrem ofertas nem executam automaticamente o lote ML.

**Direção proposta, ainda não implementada:** um único comando de captura, com o navegador disponível e extensão conectada, realiza a coleta em lote, envia ao mesmo lote do painel e continua triagem/seleção. Intervenção humana somente se o ML efetivamente exigir uma verificação. O desenho precisa resolver a autorização de acesso à aba (gesto na extensão ou permissão restrita e explicitamente concedida ao ML), comunicação painel/extensão, retomada e execução da continuação no site. Não transportar cookies/credenciais do ML para o backend. Não usar GitHub para ML. Enquanto depender do navegador do operador, não prometer execução com ele fechado. A separação do executor de produção do GitHub continua pendente.

Referências oficiais verificadas: [Chrome — activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) e [Chrome — scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting). Nenhum código de produto foi alterado nesta etapa.

## Como continuar em outra sessão

**Diagnóstico causal, checkpoint 19; alternativa avaliada no checkpoint 20:** o dono quer descobrir o sinal que dispara a verificação e como conferir. Já foram realizados os oito testes HTTP e a comparação no Opera; não repetir a matriz sem uma variável nova. A resposta sobre a janela anônima ainda é necessária para essa comparação. Não tratar o resultado como prova de IP bloqueado, login obrigatório ou uma regra específica de fingerprint. Não substituir esse diagnóstico por mais rearranjo da captura manual. Mercado Livre deve permanecer sob demanda no site, fora do GitHub.

Para continuar: “Leia `docs/tecnico/avaliacao-triagem-fluxos-2026-10-10.md`, sobretudo os checkpoints 5, 9, 10, 11, 13, 16 e 18. O dono rejeitou a importação manual como substituta da automação e determinou que Mercado Livre seja somente sob demanda no site, fora do GitHub. A tentativa automática foi restaurada localmente, mas o acesso HTTP continua restrito; seu executor de produção ainda precisa ser separado do GitHub. Correção do piso, simplificação da Curadoria e executor persistido estão implementados localmente, sem commit/deploy. O lote órfão real já foi encerrado; não refazer o reparo. Preserve essas alterações, as evidências e a frente de marketing. Confira o estado do Git e siga pelas pendências, sem executar captura ou IA apenas para retomar contexto.”

Próxima etapa operacional: resolver as pendências de automação e execução no site do checkpoint 18 antes de publicar o fluxo ML. Configuração Vercel e executor GitHub continuam pendentes para as lojas que efetivamente usarão GitHub; ML não deve ser incluído nele. O teste real controlado do checkpoint 16 validou somente a contingência, não a recuperação da automação. A etapa de evidência de variantes precisa de contrato oficial e resposta real de SKU/configuração antes de relaxar a exceção de preço. O disparo manual de IA na Curadoria permanece sobre a fila geral; o pós-captura passa a triar somente o próprio lote, até 200 candidatos.

Ao retomar, conferir `git status --short`, pois já havia mudanças de outra frente em marketing e em `packages/web/app/_components/admin-shell.tsx` antes desta análise.
