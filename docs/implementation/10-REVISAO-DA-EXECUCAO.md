# Investigação da execução antes da homologação operacional

Data: 14/10/2026. Referência: STATUS-EXECUCAO.md recebido após execução em outro ambiente/agente. Estruturado conforme a skill [codex-investigador](/home/many/.codex/skills/codex-investigador/SKILL.md), em modo diagnóstico. Nenhuma correção funcional ou aplicação de migration autorizada/executada nesta investigação. Os identificadores RX foram preservados para continuidade do handoff.

## 1. Problema e reprodução

**Esperado:** as entregas declaradas concluídas satisfazem os contratos C-01/C-02/C-06/C-07 e os critérios das specs, com fluxo integrado e testes que comprovam a propriedade alegada. O registro manual aceita uma conta autenticada; links de campanha resolvem pelo contrato real; isolamento e E3 obedecem às regras aprovadas.

**Observado:** STATUS-EXECUCAO declara conclusão e transição para gates operacionais, mas a compilação encontra contratos incompatíveis e a inspeção mostra divergências de segurança, schema e cobertura dos testes. O gatilho desta investigação foi o handoff para homologação, não um incidente comprovado em produção.

**Ambiente observado:** `/home/many/Documentos/Projetos linux/Garimpa`; HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`; working tree com alterações anteriores e módulos/migrations não rastreados. Node `v22.23.2`, npm `10.9.8`. O diagnóstico se refere ao conteúdo local, não apenas ao commit. [Manifesto com hashes de 27 arquivos e estado Git](evidencias/manifesto-investigacao-execucao.json). Nenhum AGENTS.md foi encontrado na busca do repositório fora de node_modules/archive ou nos diretórios ancestrais consultados.

**Limite de ambiente:** commit implantado e staging não confirmados nesta rodada. Policies remotas são evidência histórica preservada do projeto `spbuwcwmxlycchuwhfir`, schema `garimpa`; não houve nova consulta nem confirmação do estado remoto atual. Arquivos SQL não demonstram aplicação. Não há demonstração de vazamento real, indisponibilidade ou uso da chave fixa em produção.

**A conclusão de que restam apenas gates operacionais não é sustentada pelo código inspecionado.** Há componentes implementados, mas também erros de compilação, contratos incompatíveis, lacunas de integração e defeitos de isolamento. Não recomendar o conjunto atual como release candidato nem ativar E3, envios ou clientes externos. Staging isolado permanece necessário para testes posteriores; não tratar a aplicação das onze migrations como mera formalidade.

Esta é uma revisão dirigida aos riscos do handoff, não uma auditoria exaustiva de todas as mudanças. O relatório original foi preservado como declaração do executor, não ratificado.

### Reprodução mínima executada

Comando: `npm run typecheck --prefix packages/web -- --incremental false`.

Passos: partir da raiz do repositório com as dependências já instaladas; executar o comando acima; comparar os diagnósticos com as assinaturas produtoras/consumidoras. Não requer credencial, usuário, relatório financeiro ou banco. Resultado esperado: exit 0. Resultado obtido: **exit 2, cinco erros iguais nas duas execuções observadas**, uma na revisão inicial e uma nesta formatação. [Primeiro log](evidencias/typecheck-revisao-execucao.log) e [segunda execução](evidencias/typecheck-investigador.log). As falhas apontam arquivos de fonte, não código gerado. Não houve erro de preparação.

O comando não gera build nem arquivo incremental. Não foram repetidas as suítes completas, executados scripts de banco, requests de compra, criptografia com dados reais ou fixtures SQL. Os experimentos propostos abaixo estão explicitamente separados dos resultados obtidos.

## 2. Evidências e rastreamento causal

“Confirmada por inspeção” significa demonstração do mecanismo no código, não execução no banco ou deploy. “Provável” conserva uma observação discriminante pendente. Ausência de cobertura de teste não é prova de exploração ou vazamento.

### RX-01 — Financeiro manual não está operacional

**Conclusão:** incompatibilidade confirmada em compilação e por inspeção; execução da função/UI não realizada. **Cadeia causal:** chamada de registro com input.tenantId string → consumidor exige AccountContext → context.tenantId fica ausente → validação rejeita antes do SQL. A primeira divergência está na chamada, não numa migration ausente. A ausência de integração de UI é evidência distinta, consolidada em RX-08.

`packages/web/lib/commercial-financial-db.ts:35`, `:159` e `:217` passam uma string tenantId para withAccountDb, que exige AccountContext. O TypeScript reproduz TS2345. O helper acessa context.tenantId antes de abrir conexão; a chamada atual falha na validação de tenant. Busca de referências em app/lib não encontrou integração de recordManualConversion em formulário/Server Action.

**Consequência:** “registro manual 100% operacional” não é uma classificação válida. **Saída exigida:** contexto obtido de autenticação/membership no servidor, chamada integrada à UI, validação/idempotência, inserção real em fixture e leitura do resultado, com negativa para outra conta.

### RX-02 — Link de campanha não atende ao contrato do resolver

**Conclusão:** incompatibilidades confirmadas em compilação e por inspeção; HTTP/browser não executados. **Cadeia causal:** código de campanha válido de 12 caracteres → rota passa code no lugar do handle SQL e omite o segundo argumento → resolver tenta usar uma string como função SQL → catch mascara a causa e tenta o legado. Mesmo ajustando a chamada, resolved_destination_url permanece fora do retorno contratado. Isso independe da existência da tabela.

`packages/web/app/p/[code]/route.ts:29` chama resolveCampaignLinkByCode(code), mas `commerce-db.ts` exige (sql,code). A rota também acessa resolved_destination_url, que não existe no retorno tipado. TS2554 e TS2339 reproduzidos. O catch pode ocultar a falha e cair no caminho legado.

**Consequência:** testes de formato do código não demonstram navegação funcional. **Saída exigida:** percorrer /p de campanha→/bizu com c→/go com c em fixture integrada, cobrindo duas contas, lojas habilitadas e códigos legados, sem assumir que erro de banco é token adulterado.

### RX-03 — M-10A2 conserva as policies permissivas do baseline

**Conclusão:** remoção incompleta confirmada por inspeção da migration contra o baseline; efeito em PostgreSQL/staging não reproduzido. **Cadeia causal:** aplicar M-10A2 sobre schema que conserva *_app_access → DROP não corresponde ao nome existente → policy true permanece ao lado da scoped → combinação permissiva autoriza acesso que deveria ser limitado. A condição é coexistência dessas policies; o estado remoto atual continua aberto.

`20261014101000_garimpa_tenant_rls_scoped.sql` remove sufixos _permissive, _tenant_scope e _isolation, mas não _app_access. O baseline `evidencias/policies-view-constraints.json` e a migration existente `20260826070000_garimpa_rls_defense.sql:21` mostram policies _app_access com USING(true)/WITH CHECK(true). A nova policy é permissiva por default; sua coexistência com a antiga não fecha o acesso.

Policies permissivas são combinadas por OR: [documentação oficial PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Logo, a migration não cumpre a substituição afirmada no relatório para o estado observado. Não foi feito novo inventário remoto nesta revisão.

**Saída exigida:** reconciliar todas as policies por tabela/role/command contra o alvo real; substituir as amplas; comprovar A/B/casa, ausência de contexto e concorrência como role runtime. O bootstrap getUserMemberships atualmente faz joins diretos antes de estabelecer contexto, apesar da função resolve_actor_accounts criada pela migration: integrar o bootstrap para não quebrar autenticação ao finalmente fechar RLS. Inventariar também consumidores públicos e workers antes da ativação.

### RX-04 — Chave mestra fixa quando configuração está ausente ou inválida

**Conclusão:** ramo incorreto confirmado por inspeção; nenhuma operação criptográfica foi executada nesta investigação. **Cadeia causal:** NODE_ENV=production com chave ausente/inválida → getMasterKey não lança erro → escolhe a constante de desenvolvimento → cifra com chave previsível. A divergência acontece na seleção da chave, antes de AES-GCM/AAD. A configuração real de produção não foi consultada.

`packages/web/lib/affiliate-secret.ts:20–30` usa uma constante de desenvolvimento para qualquer NODE_ENV diferente de test quando não recebe chave válida. Isso inclui production. Não é um fallback restrito ao ambiente local.

**Consequência:** segredos podem ser cifrados com chave conhecida no código; AAD não corrige esse problema. **Saída exigida:** produção falha antes de usar segredo se faltar chave válida; testes injetam chave própria; versões/rotação efetivamente resolvem a chave correta. Não habilitar credenciais reais enquanto isso permanecer.

### RX-05 — Migrations financeiras incompatíveis com o contexto e os tipos anteriores

**Conclusão:** duas causas distintas confirmadas por inspeção; SQL não aplicado. **RX-05A, contexto:** operação via withAccountDb → grava garimpa.tenant_id → policy lê app.current_tenant → ausência do contexto esperado não autoriza a linha. O efeito depende da role, grants e policies efetivos; teste como superusuário não é discriminante. **RX-05B, FK:** M-04 cria PK text → M-08 declara FK uuid → tipos de referência incompatíveis impedem estabelecer a FK conforme escrita. Schema remoto divergente não foi testado.

M-08 (`20261014106000_garimpa_commercial_financial_ledger.sql:118` e seguintes) lê app.current_tenant; `tenant-db.ts:49` define garimpa.tenant_id. O relatório atribui ao helper o primeiro nome incorretamente. Sem outro contexto válido, as policies financeiras não autorizam os registros esperados.

Além disso, M-08:26 declara campaign_publication_id uuid referenciando campaign_publication.id, criado como text por M-04. É incompatibilidade de tipos na FK, detectada por inspeção, não por aplicação nesta rodada. As FKs financeiras também precisam ser reconciliadas com a exigência de ownership composto do plano.

**Saída exigida:** um único contrato de contexto, tipos/FKs compatíveis, grants runtime explícitos e ensaio da cadeia sobre schema base fiel, não apenas revisão sintática isolada de arquivos.

### RX-06 — “Matriz T17/T18/J2 comprovada” excede os testes existentes

**Conclusão:** lacuna de evidência confirmada por inspeção do teste; não constitui prova de falha de isolamento em runtime. **Cadeia causal:** ausência de DATABASE_URL ou erro SQL → validator retorna valid=false → teste só exige false → passa sem distinguir indisponibilidade de recusa por ownership. Os outros casos usam mock de membership e AAD, sem executar RLS/Storage/worker. A primeira divergência é o oráculo de teste aceitar causas diferentes como se comprovassem a mesma propriedade.

`packages/web/test/security-isolation-matrix.test.mjs` possui três testes: memberships com SQL mockado; autenticação criptográfica AAD; validação de token negativo. Não exercita policies reais, PostgreSQL concorrente, Storage, workers ou jornada comercial completa. O último aceita simplesmente valid=false; `campaign-attribution.ts` retorna esse valor também quando DATABASE_URL não existe ou a consulta falha. Portanto, pode passar sem testar associação de token/produto no banco.

**Saída exigida:** EP-10B permanece pendente. Criar ambiente isolado comprovado, testar permissões positivas e negativas com banco disponível, diferenciar indisponibilidade de negativa autorizativa e produzir relatório contra versão exata. Testes unitários continuam úteis, mas não são certificação de isolamento.

### RX-07 — E3 SQL ainda diverge do contrato aprovado no planejamento

**Conclusão:** divergências do algoritmo SQL confirmadas por inspeção; fixture SQL e emissão real de claim não executadas. **Cadeia causal:** política draft com e3Enabled=true e contagens suficientes, ou amostra fora da janela/cobertura → active_policy aceita draft e a consulta não aplica todas as condições de C-02 → lowest_verified pode ser true sem homologação/cobertura exigidas. O seed atual com E3=false mitiga a ativação inicial, mas não corrige o mecanismo.

M-01 inclui políticas draft em active_policy e usa e3Enabled sem exigir status approved. Extrai windowDays, mas não restringe a série pela janela; a condição de lowest_verified verifica contagem/dias/mínimo sem coverageRatio/maxGap/frescor. A calibração editorial, sozinha, não conserta esses caminhos.

**Saída exigida:** manter E3 desligado, reconciliar implementação TS/SQL e consumidores com C-02, testar limites de janela, condições de comparabilidade, cobertura, validade e draft/approved; somente depois executar EXP-02 e promover política aprovada.

### RX-08 — Módulos e contratos não demonstram a jornada completa declarada

**Conclusão:** integração incompleta provável; ausência de referências diretas confirmada apenas no escopo pesquisado. **Cadeia causal suspeita:** módulos novos sem produtor/consumidor no fluxo do usuário → testes puros passam → status extrapola presença de componente para conclusão funcional. Para confirmar o alcance, é necessário localizar outra entrada/alias ou percorrer a jornada em fixture; busca textual isolada não descarta toda ligação dinâmica.

Na busca pelos consumidores, createCampaign e recordManualConversion apareceram como definições sem integração em app; revalidateKitBeforeExport apareceu no módulo e nos testes, sem ligação encontrada a fluxo de exportação. Não foi localizado o script verify-remote-compatibility citado no status em packages/persistence/bin/package.json.

**Saída exigida:** apontar entradas reais de UI/API/worker e exercitar selecionar→campanha→kit→validar→aprovar→exportar→confirmar→resultado. Ausência de consumidor deve ser classificada como implementação parcial, não “concluída”. Localizar ou implementar explicitamente o verificador; não orientar homologação por comando presumido.

## 3. Conclusão, hipóteses e lacunas

| Hipótese | Evidência a favor/contra | Experimento discriminante | Resultado e estado |
|---|---|---|---|
| H1: só falta banco/configuração para o financeiro e link funcionarem | Assinaturas incompatíveis em fontes locais; typecheck independe de banco | Typecheck sem emissão, repetido; confrontar chamada e assinatura | Enfraquecida como explicação suficiente; RX-01/02 confirmados em compilação |
| H2: M-10A2 substitui as policies permissivas observadas | DROP não contempla *_app_access | Comparar DDL com baseline (feito); depois aplicar em fixture fiel e consultar policies como runtime | Contradita estaticamente para o baseline; runtime pendente |
| H3: fallback criptográfico só existe em desenvolvimento | Condição distingue test de qualquer outro ambiente, incluindo production | Inspeção dos ramos (feita); teste isolado com NODE_ENV=production e chave sintética/ausente (pendente) | Contradita por demonstração estática; ocorrência em deploy desconhecida |
| H4: SQL financeiro usa o mesmo contexto e tipos do produtor | GUCs diferentes; FK uuid→text | Comparação de fontes (feita); cadeia SQL e operação com role runtime (pendentes) | RX-05A/B confirmados estaticamente |
| H5: três testes comprovam toda a matriz de isolamento | Mock e erro de infraestrutura podem satisfazer asserts | Inspeção do oráculo (feita); DB disponível, permissões positivas/negativas e concorrência (pendentes) | Cobertura insuficiente confirmada; segurança real permanece não certificada |
| H6: calibrar thresholds basta para E3 cumprir C-02 | Draft aceito e predicados ausentes no SQL | Comparação com C-02 (feita); fixture que varia aprovação/janela/gap separadamente (pendente) | Enfraquecida como solução suficiente; divergência algorítmica confirmada |
| H7: UI e verificador existem por outra entrada | Busca direta não encontrou consumidores nem comando no escopo | Localizar alias/entrada e demonstrar fluxo/browser; inspecionar scripts de outro pacote se apontados | Aberta quanto ao alcance; RX-08 provável |

Nenhuma falha de sandbox/rede explica os cinco erros de contratos reproduzidos. Falhas antigas de QR/captura são problemas distintos e não foram reavaliadas. Não há base para atribuir todas as causas a uma única migration ou para concluir “zero falhas novas” a partir dos logs de contratos.

### Classificação recomendada para o handoff

- EP-10A: parcial, com bloqueadores de segurança e integração.
- EP-10B: pendente de testes reais; não concluído.
- EP-08 A/C: parcial; erros de contrato e fluxo operacional não demonstrado.
- EP-04/06/07: parcial; link com erro reproduzido e jornada integrada não demonstrada.
- EP-01: implementação a reconciliar antes de qualquer promoção E3.
- Demais épicos: não ratificados nesta revisão; a existência de arquivos/testes de contrato não basta para aceitar a conclusão integral.

Esses são status de execução recomendados; não alteram os status documentais das specs. Não foi estimado percentual de conclusão.

## 4. Correção recomendada — não executada

Os reparos devem seguir os contratos já definidos, com menor alteração que corrija cada cadeia causal. Corrigir RX-01/02 não resolve RX-03/04/05/07; não reunir todos sob um tratamento genérico de exceções. Desligar E3/manter externos suspensos é contenção, não correção. Não há backfill necessário para reparar assinaturas TS. Alteração SQL exige verificar se o arquivo já foi aplicado no alvo antes de decidir entre corrigir arquivo ainda não aplicado e criar migration aditiva; nunca presumir histórico remoto pelo status local. Preservar dados existentes e proibir rollback que restaure permissões amplas.

1. Corrigir e repetir typecheck; fechar contratos quebrados sem enfraquecer tipos ou silenciar erros.
2. Corrigir secrets, contexto, policies e tipos/FKs; integrar bootstrap/callsites antes de ativar isolamento.
3. Completar entradas de UI/serviço e jornadas das entregas que ficaram apenas estruturais.
4. Ensaiar migrations em banco local isolado com baseline fiel e role runtime; preservar logs e comparação de schema/grants/policies. Fixtures novas não devem omitir as policies legadas que causam o problema.
5. Executar integração e regressão completas. Depois levar release candidato a staging identificado, sem dados/credenciais reais desnecessários.
6. Realizar calibração editorial, relatório financeiro e decisões de canal/piloto sobre funcionalidades já demonstradas. Nenhuma dessas decisões substitui a correção técnica.

## 5. Verificação e critérios de aceite

| Achado | Teste de regressão a executar durante a correção | Checagem integrada / condição de aceite |
|---|---|---|
| RX-01 | Serviço recebe contexto autorizado completo; tenant avulso não serve como autoridade; request repetido não duplica | Formulário→ação autenticada→SQL→resultado; outra conta negada; typecheck verde |
| RX-02 | Resolver recebe os dois argumentos e rota usa apenas campos reais; erro de banco não é tratado como autorização | /p→/bizu→/go conserva c e monetização; 4 caracteres legado funciona; duas contas/lojas testadas |
| RX-03 | Fixture inclui policies *_app_access do baseline; após correção não resta acesso amplo privado | PostgreSQL real com garimpa_app e contextos A/B/A concorrentes; sem contexto nega; bootstrap, público e worker continuam funcionais |
| RX-04 | Chave ausente/malformada em production falha; chave sintética explícita cifra/decifra; AAD e versão testados | Nenhuma constante usada em produção; rotação e revogação sem perda dos segredos autorizados |
| RX-05A/B | Aplicar cadeia em banco isolado; tipos/FKs/grants e único GUC inspecionados | Escrita/leitura financeira pela role real; vínculo entre contas rejeitado; nenhum teste como postgres substitui runtime |
| RX-06 | Banco ausente gera resultado de indisponibilidade, que não satisfaz teste de adulteração; caso positivo obrigatório | Matriz inclui SQL/Storage/URLs/workers e concorrência; relatório por versão exata |
| RX-07 | Variar somente um fator: draft/approved, janela, gap, cobertura, frescor e condições de variante | TS/SQL e consumidores concordam; seed false não é a única barreira; EXP-02 só após mecanismo validado |
| RX-08 | Localizar todos os produtores/consumidores e confirmar script real antes de executá-lo | Jornada completa demonstrada; se faltar entrada, reclassificar entrega parcial e completá-la |

**Executado:** typecheck duas vezes com os mesmos cinco erros; inspeções e buscas listadas. **Não executado:** testes acima, build, fixtures SQL, matriz concorrente, HTTP/browser, deploy ou operações remotas. Não há teste “passou depois” porque não houve correção.

Typecheck verde; cadeia SQL aplicada com sucesso em isolamento; contratos/ownership e grants comprovados; segredo sem fallback fixo; jornadas funcionais concluídas; matriz real de isolamento; relatório de execução atualizado com logs, versão e limites. Staging é parte da prova; produção continua separada e depende de autorização.

## 6. Próximo passo e passagem ao executor

Encaminhar RX-01/02/04 ao executor para reparos delimitados nos contratos existentes; RX-03/05/07 exigem executor com verificação SQL isolada e comparação com o schema real antes de aplicar remotamente. RX-06 exige evidência integrada; RX-08 exige localizar as entradas ou completar a entrega. Arquiteto só é necessário se surgir mudança material que contradiga os contratos, não para redesenhar decisões já tomadas.

Antes de editar, o executor deve conferir HEAD, hashes do manifesto, instruções atuais e condições de reprodução. Se houver drift, revalidar o achado afetado. Atualizar STATUS-EXECUCAO com provas novas após correções; não apagar os logs históricos nem ratificar conclusões apenas porque este relatório está formatado. Dados/credenciais de produção e autorização de aplicação remota continuam fora do escopo desta investigação.

Somente artefatos de investigação foram escritos: este relatório, logs de typecheck e manifesto de contexto. Nenhuma instrumentação ou patch funcional temporário foi introduzido; não há alteração diagnóstica de código a remover. Nenhuma funcionalidade, configuração, migration, segredo ou banco foi alterado. A inspeção parcial já basta para rejeitar a afirmação de que só faltam decisões operacionais, mas não identifica necessariamente todos os defeitos. Testes numéricos declarados no STATUS-EXECUCAO não foram reproduzidos integralmente e não são apresentados aqui como resultados verificados.
