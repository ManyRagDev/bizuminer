# Estado da implementação do BizuMiner em 20 de outubro de 2026

O núcleo tem implantação comprovada em 16/10. As capacidades comerciais e as correções posteriores estão amplamente implementadas e testadas localmente, mas o fluxo único de trabalho e a homologação integral no ambiente ativo ainda não estão concluídos. A próxima implementação da sequência contratada é a OS-029, desbloqueada pelo fechamento local do BUG-021 na OS-037.

## Baseline e alcance

- Intenção: investigação exploratória do estado da implementação, sem correções de código. Aplicado o núcleo da skill `investigador`; a biblioteca de protocolos não contém protocolo específico para inventário geral de entregas.
- Baseline: branch `main`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, Node `v22.23.2`, mais árvore de trabalho preexistente. Antes deste relatório: 131 caminhos rastreados alterados e 648 arquivos não rastreados, incluindo documentação, material de marketing e releases. O HEAD sozinho não representa a implementação examinada.
- Evidência atual: leitura de contratos, resultados, auditorias e código; reexecução de testes locais. Não houve leitura nova de produção, autenticação de usuário, chamada de marketplace/IA, dispatch, migration ou deploy nesta investigação.
- A última comprovação de implantação examinada registra o commit `f60b6187ada88addd37ff5b967f1d0f2e8eca2b9`, diferente do HEAD local. Esse registro não certifica a versão que atende produção hoje.
- Fonte da implantação: [fechamento OS-10](../../contratos-finalizacao/resultados/10-fechamento.md). Fontes das correções posteriores: [OS-020–025](../../contratos-finalizacao/resultados/25-correcao-conclusao.md), [OS-026](../admin-pool/RESULTADO-OS-026.md) e [auditoria OS-037](../../contratos-fluxo-unico/AUDITORIA-OS-037.md).

## O que foi feito

| Área | Implementação e evidência | Alcance confirmado |
|---|---|---|
| Núcleo público e conta própria | Vitrine, catálogo, histórico, links, contexto privado e monitoramento existente; rollout A/B/C, isolamento, backup e restauração registrados | Implantação comprovada em 16/10; não revalidada remotamente nesta investigação |
| Captura | Extensão/navegador/manual; lotes persistidos, recuperação e triagem; APIs Shopee/AliExpress e monitoramento por IDs | Implementação local. Monitoramento real registrado na implantação; discovery/dispositivos não homologados ficaram parados naquele fechamento |
| Mercado Livre manual | OS-027 bloqueia automação em rotas/lotes/workers; OS-032 fecha gates e três CLIs, independentemente das flags | Recusas verificadas localmente. Captura humana preservada. Captura automatizada ML não é entrega futura pendente |
| Curadoria | Aprovação, retenção, adiamento, grupos, snapshots, seleção compartilhada, pauta e apoio de IA | Implementação e testes locais; jornada diária continua distribuída em telas |
| Comparação editorial | Procedência de variantes, amostras de avaliações, justificativa de retenção e de superioridade; memória durável de mudanças materiais | BUG-019 fechado localmente pela OS-035; BUG-018/020 pela OS-036; BUG-021 pela OS-037. Ressalvas de UI e concorrência nativa permanecem |
| Contas e infraestrutura de acesso | Contexto/membership, RLS, credenciais por conta, revalidação de suspensão/revogação e pool compartilhado | Correções locais OS-021/026 auditadas. Pool máximo de três conexões é por processo/destino, não limite distribuído |
| Oportunidades, campanhas e kits | Radar, políticas por público/canal, campanhas, revisões, aprovação, exportação, confirmação e atribuição | Serviços e telas existem; continuidade Radar→Campanhas ainda perde a identidade da oportunidade |
| Materiais | Artefatos privados, contenção de diretório, Story/Feed/Banner e QR | Correção OS-024 testada localmente; Storage/Auth gerenciados, direitos dos assets e uso real ainda precisam homologação |
| Financeiro | Importação de comissão, CSV BR, validação de datas, preview/commit, ledger, custos e resultados | Parser corrigido pela OS-020; relatórios reais das redes e operação no ativo ainda precisam conferência |
| Canais oficiais | Outbox, worker, fábrica de adapters, segredo próprio, HMAC e retries persistidos | Correção OS-022 testada com transporte simulado; envio real depende de configuração, destino e aprovação |
| Experimentos e SaaS | Protocolo pareado, provisionamento, convites, onboarding, quotas e suspensão | Base implementada; piloto, política real e comprovação de valor pendentes. Cobrança automatizada não foi implementada |

A [matriz de capacidades de 18/10](../../contratos-finalizacao/CAPACIDADES-PENDENTES.md) distingue correção local de ativação comercial. Os impedimentos técnicos antigos de parser, resolver de credenciais e adapter oficial receberam implementação posterior à implantação do núcleo; não devem ser apresentados como software ainda inexistente.

## O que ainda falta implementar

| Ordem | Entrega pendente | Dependência atual |
|---|---|---|
| [OS-029](../../contratos-fluxo-unico/OS-029.md) | Consulta única da bancada por produto, ações/contextos, paginação, isolamento e `actionableSince` da ação atual | Desbloqueada localmente pela auditoria OS-037; arquivos `workbench-contract.ts`/`workbench-db.ts` e resultado ainda ausentes |
| [OS-030](../../contratos-fluxo-unico/OS-030.md) | Expor a bancada em Hoje, organizar a navegação e preservar oportunidade/público/canal entre Radar e Campanhas | Depende da OS-029; fecha BUG-014–016 |
| [OS-031](../../contratos-fluxo-unico/OS-031.md) | Verificar a mesma oferta da captura ao resultado, duas contas e dois contextos, com regressões e parecer por aceite | Depende da OS-030 e parecer OS-033; teste transversal e resultado ainda ausentes |

A ausência da bancada foi confrontada com o código: não há os módulos previstos pela OS-029; `determineCockpitNextAction` existe em `cockpit-view-model.ts`, mas não foi encontrado consumidor de produção. A área do comprador usa a palavra “bancada” com outro significado e não satisfaz esta entrega operacional.

## Bloqueios e verificações pendentes

| Frente | Situação | Critério para avançar |
|---|---|---|
| Sequência da bancada | OS-029 pronta para execução; OS-030/031 aguardam suas dependências | Executar as ordens delimitadas e verificar os aceites, sem ampliar escopo tacitamente |
| [OS-033](../../contratos-fluxo-unico/OS-033.md) | Continua preparada, sem resultado formal. A reexecução desta investigação resolveu a dúvida dos testes web/persistência no sandbox, mas não executou toda a ordem | Congelar snapshot, produzir parecer e completar a prova nativa de captura humana. O binário PostgreSQL no caminho histórico consultado não existe nesta sessão; outros locais não foram inventariados |
| OS-037 no ativo | Migration aditiva preparada e auditada localmente; aplicação remota não comprovada | Confirmar destino, autorização, sequência compatível e validar aplicação. Não executar automaticamente a pasta histórica de migrations |
| Concorrência e interface | PGlite comprova SQL/transações na sua sessão; não comprova concorrência real da nova evidência comparativa nem interação autenticada | Provas PostgreSQL nativo multi-sessão e jornada autenticada, conforme OS-033/031 e limites da auditoria OS-037 |
| Comparabilidade E3 e rubrica | Motor/gates existem, mas benchmark sintético não ratifica política | Calibração real e amostra humana de 30–50 ofertas com critérios congelados e aprovação |
| Captura por conta | Shopee/AliExpress implementadas; ML multicliente sem adapter contratado permanece indisponível | Credenciais e APIs reais por conta, com isolamento/revogação demonstrados; preservar ML exclusivamente manual |
| Kits e atribuição | Serviços locais existem; material/campanha reais e Storage gerenciado não homologados integralmente | Assets com direitos, campanha/canal legítimos, exportação e atribuição conferidas no destino |
| Canal oficial | Nenhum envio real nas correções examinadas | Canal, destino, segredo, aprovação persistida e kill switch, seguidos de envio explicitamente autorizado |
| Financeiro | Parser local corrigido; isso não demonstra compatibilidade com todo relatório real | Relatório sanitizado de cada rede e conferência de importação/reconciliação no ativo |
| Piloto SaaS e experimentos | Base de software não demonstra operação multicliente ou resultado comercial | Termos, privacidade, suporte, método/coorte/amostra e piloto autorizado |
| Consolidação da versão | Extenso trabalho local sem commit; implantação registrada usa outro commit | Identificar e consolidar os bytes que compõem a próxima entrega, antes de publicar |

Falta de staging pago e a reprovação da migration M2 original são registros históricos, não bloqueios gerais atuais do núcleo. O fechamento OS-10 registra que o caminho direto autorizado foi cumprido. Isso não autoriza aplicar as novas alterações por inferência.

## Achados rastreáveis

| ID | Estado neste levantamento | Evidência atual e encaminhamento |
|---|---|---|
| BUG-013 | Resolvido no escopo local registrado | Pool corrigido e auditado na OS-026; não houve nova homologação autenticada do incidente nesta investigação |
| BUG-014 | Confirmado por reinspeção estática | `admin/direcionamento/page.tsx` redireciona `aba=radar`; `admin-query-aliases.ts` não reconhece `radar` e adota `selecao`. Fechamento previsto na OS-030 |
| BUG-015 | Confirmado por reinspeção estática | `resolveActiveId` em `admin-shell.tsx` não trata onboarding/governança e cai em Hoje. Fechamento previsto na OS-030 |
| BUG-016 | Confirmado por reinspeção estática | Link do Radar transmite conta/produto; página e formulário de Campanhas não transportam `opportunityId`. Fechamento previsto na OS-030 |
| BUG-019 | Resolvido localmente com ressalva de UI | Parecer OS-035; não houve browser autenticado nesta investigação |
| BUG-018/020 | Resolvidos localmente | Parecer OS-036; resultado público/interação visual não homologados aqui |
| BUG-021 | Resolvido localmente | Auditoria OS-037 conforme, seis hashes conferidos sem divergência e nove cenários de histórico comparativo reexecutados com sucesso. Migração remota e concorrência nativa continuam separadas |
| OBS-ESTADO-01 | Confirmado, documental | O plano ainda chama OS-037 de próxima correção e OS-029 ainda menciona dependência aberta; a auditoria OS-037 posterior já libera OS-029. Atualizar a navegação de status em entrega documental própria, preservando histórico |

Os BUGs reaproveitam os IDs existentes; este levantamento não cria nova ordem de correção nem declara homologadas todas as OS anteriores. O [diagnóstico do fluxo](../fluxo-unico/DIAGNOSTICO.md) continua a fonte dos critérios de fechamento de BUG-014–016.

## Testes executados neste levantamento

Logs desta sessão em `/tmp/bizuminer-levantamento-*.log`; são temporários. Nenhum teste abaixo usa banco remoto ou API paga.

| Comando | Resultado observado |
|---|---|
| `npm test --prefix packages/web` | Sandbox: 70/72 arquivos. Repetição local fora da restrição: **438/438 testes**, exit 0 |
| `npm test --prefix packages/persistence` | Sandbox: 8/9 arquivos. Repetição local fora da restrição: **40/40 testes**, exit 0 |
| `npm test --prefix packages/capture` | **8/8 arquivos**, exit 0 no sandbox |
| `npm test --prefix packages/extension` | **4/4 arquivos**, exit 0 no sandbox |
| `npm test --prefix tools/editorial-tests` | **29 cenários**, exit 0, PGlite |
| `node --import tsx comparison-flow.test.ts` em `tools/editorial-tests` | **5 cenários**, exit 0, PGlite |
| `node --import tsx comparison-history-flow.test.ts` no mesmo diretório | **9 cenários**, exit 0, PGlite |
| `npm run test:capture-batch --prefix tools/editorial-tests` | **18 cenários**, exit 0, PGlite |

Diagnóstico dos testes isolados no sandbox: entrypoints falham em `spawnSync ... EPERM`; QR falha em `uv_interface_addresses`; processo de captura recebe stdout vazio em vez de `resultado`. Os mesmos arquivos passam na execução local externa ao sandbox, sem alteração de fonte. Portanto essas falhas não demonstram regressão do produto; são uma diferença reproduzida entre ambientes. A OS-033 permanece sem fechamento integral porque exige outras provas além desses testes.

Typecheck/build não foram repetidos nesta investigação, que não alterou implementação. Seus passes mais recentes constam da auditoria OS-037 e não foram apresentados como testes novos. A qualidade atual de respostas reais da IA e o estado do ambiente ativo não foram medidos por estas fixtures.

## Ordem de continuidade

1. Executar OS-029, já desbloqueada localmente.
2. Executar OS-030 para tornar a bancada utilizável e corrigir BUG-014–016.
3. Completar OS-033 e OS-031, incluindo as provas nativas e autenticadas disponíveis, sem converter ausência de acesso em aceite.
4. Consolidar a versão e preparar implantação das alterações posteriores ao núcleo, incluindo a migration OS-037, com destino e autorização próprios.
5. Homologar as capacidades comerciais por frente com dados, materiais, contas e canais legítimos; só então promover políticas/automação/piloto correspondentes.

Esta investigação adicionou apenas este diagnóstico. Não houve correção de produção, alteração de contratos/aceites, commit ou operação remota.
