# Verificação independente das correções CF-01–CF-18

Data: 14/10/2026, America/Sao_Paulo. Skill: `codex-investigador`, com orientações de Supabase e Postgres. Rodada de investigação; nenhuma correção funcional, migration remota, publicação, convite externo ou envio real executado.

**Parecer: implementação parcialmente corrigida; não aprovada como conclusão integral do plano 17.** Os 24 comandos de verificação passaram, mas os ensaios adicionais reproduziram comportamentos contrários aos aceites. Dos 18 apontamentos originais, **7 podem ser encerrados no escopo específico testado localmente e 11 permanecem parciais ou abertos**. Isso não certifica homologação ou ativação de nenhuma capacidade em produção.

## 1. Problema, escopo e reprodução

O usuário informou a conclusão da implementação e solicitou conferência. Foram confrontados o plano 17, seu checklist e relatório final com código, migrations, consumidores e testes efetivamente disponíveis. As decisões comerciais do blueprint e o uso permanente do mesmo motor pela casa e pelo SaaS foram preservados como critérios de avaliação.

Baseline: HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, árvore com mudanças preexistentes. Foram inventariadas 509 fontes; em relação à revisão 16, 31 fontes mudaram e 8 foram acrescentadas. Não foi encontrado AGENTS.md na inspeção inicial. O hash do commit sozinho não representa esta versão: usar o manifesto da árvore de trabalho.

Artefatos de evidência desta rodada:

- [Manifesto de fontes](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/manifesto-revisao-18.json>), com comparação à revisão anterior e integridade final.
- [24 checks e logs](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-checks.json>); [runner reproduzível](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-executar-checks.py>).
- [Harness diagnóstico](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-probes.mts>), [resultados estruturados](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-contraexemplos.json>) e [log](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-probes.log>).
- [Metadados remotos](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-remoto.json>) e [identificação do projeto conectado](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-projeto-conectado.json>).
- Cópias recebidas do [checklist 17](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-recebido-17-CHECKLIST-DE-EXECUCAO.md>), [relatório do executor](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-recebido-17-RELATORIO-FINAL-CORRECOES.md>) e [STATUS](</home/many/Documentos/Projetos linux/Garimpa/docs/implementation/evidencias/revisao-18-recebido-STATUS-EXECUCAO.md>), preservadas para rastrear as alegações examinadas.

Os ensaios usam SQL real em PGlite, dados sintéticos, role `garimpa_app` e a fixture existente, aplicando as onze migrations apenas em memória. As variáveis de credenciais foram removidas dos processos; onde o código exige DATABASE_URL, foi usada URL fictícia não conectável, com factory SQL injetada. Não foram chamados provedores de mensagem ou IA. O adaptador de teste do diagnóstico apenas captura o payload em memória.

Reprodução dos checks: `python3 docs/implementation/evidencias/revisao-18-executar-checks.py`. Para os contraexemplos: `python3 docs/implementation/evidencias/revisao-18-executar-probes.py`. O runner usa o loader local de tsx, DATABASE_URL fictícia, credenciais removidas e timeout de 120 segundos. As assertions dos contraexemplos descrevem o comportamento defeituoso observado; **exit 0 do harness não é aceite funcional**. Os testes antigos da revisão 16 não foram reaproveitados como se suas assertions de defeito fossem critérios de correção.

## 2. Evidências e achados

### V18-01 — P1 — A nova ação operacional confirma envios sem enviá-los

**Confirmado por inspeção do caminho ativo.** [dispatch-actions.ts:22](</home/many/Documentos/Projetos linux/Garimpa/packages/web/app/admin/dispatch-actions.ts:22>) define `noopAdapter`, que sempre devolve `kind: sent`, ID `msg-...` e confirmação temporal sem contatar provedor. A ação do painel o usa incondicionalmente, inclusive fora de teste; não há configuração de webhook que substitua esse adaptador no código lido. O worker finaliza o job com esse resultado.

**Consequência:** o operador pode receber confirmação e persistir sucesso fictício em um job comercial real. O bloqueio G-CHANNEL não autoriza simular sucesso na operação.

**Correção/aceite:** adaptador sintético restrito a execução de teste isolada; ambiente sem canal homologado deve bloquear a operação com motivo explícito, sem gravar envio confirmado. Testar a action com canal ausente e comprovar que job/publicação não avançam para sucesso; testar envio positivo somente com adaptador autorizado e resultado comprovado.

### V18-02 — P1 — Ainda há caminhos privados presos à conta da casa

**Confirmado em SQL e por rastreio dos consumidores.** `legacy_curation_reads_house_without_authorized_account` leu `p_house` por `curationQueue(..., 'local', ..., factory)` sem AccountContext. [curadoria/page.tsx:139](</home/many/Documentos/Projetos linux/Garimpa/packages/web/app/admin/curadoria/page.tsx:139>) ainda chama essa fila para `local`; a seleção chama `getEditorialSelectionDesk()` com default da casa. As actions legadas de revisão, seleção e triagem continuam apoiadas em `reviewerId()`/role afiliado e defaults `local`.

`checkAffiliateUser` agora exige que exista alguma conta resolvível, o que é avanço, mas [api-auth.ts:56](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/api-auth.ts:56>) descarta o contexto resolvido. A rota de policy de monitoramento continua chamando `houseMonitoringPolicies`/`setHouseMonitoringPolicy` sem autorizar a conta da casa. Ter membership em B não autoriza administrar a casa. Não foi executado HTTP autenticado contra produção; a exposição do caminho é evidência estática, e a leitura do serviço foi reproduzida localmente.

**Correção/aceite:** concluir o inventário e a propagação do contexto em páginas, APIs, actions e leitores privados; preservar a operação própria por contexto explícito. Testar B sem membership em A/casa em cada entrada privada e testar o operador legítimo da casa. A correção isolada de `curationSummary` não encerra CF-02.

### V18-03 — P1 — Avaliação humana v2 persiste, mas o leitor editorial não a entende

**Confirmado em runtime.** O serviço agora salva a avaliação humana sem IA em `editorial_assessment`. Contudo, [editorial-selection-db.ts:71](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/editorial-selection-db.ts:71>) continua interpretando todos os payloads como o contrato antigo, sem discriminar versões. O ensaio `human_v2_persisted_but_legacy_consumer_rejects` chamou o leitor real `getEditorialSelectionDesk`: a avaliação recém-salva produz **“Avaliação incompleta ou inválida.”**; a validação v1 retorna `invalid_product`.

O payload v2 contém quality/value/audience/evidenceConfidence; o leitor espera, entre outros campos, productId, evidenceFingerprint e dimensions. O snapshot novo usa a linha de produto, enquanto o leitor antigo espera `snapshot.price_cents`. Não é correto apenas converter nomes de dimensões ou inventar os dados comerciais ausentes. A UI ainda envia policyVersion fixo e digest `cockpit-review-${productId}`, sem vínculo demonstrado com a revisão factual corrente.

**Correção/aceite:** implementar o contrato canônico, discriminação/decoder v1 e v2, construção de fatos/digest no servidor e política explícita para consumo por seleção/radar/kit. Comprovar round-trip da avaliação v2, leitura do histórico v1 e preservação da seleção já publicada. Evitar que uma revisão v2 invalide indevidamente o consumo do histórico legado.

### V18-04 — P1 — Ratificação continua baseada em replay; aprovação E3 aceita referência inexistente

**Confirmado em runtime.** Em `rubric_thirty_replays_still_ratify`, 30 submissões idênticas de um único produto/revisor resultam em `totalReviewed=30`, concordância 1 e `status=ratified`. [rubric-db.ts:352](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/rubric-db.ts:352>) ainda fixa 30 e 80%, sem ratificação formal. A interface apresenta esse resultado como “Ratificada (Produção)”.

Em `e3_approval_accepts_nonexistent_calibration_reference`, um owner autorizado criou draft E3 e o aprovou com `calibrationReportRef='nonexistent-calibration'`: a policy ficou `approved`, `e3Enabled=true`. [price-evidence.ts:916](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/price-evidence.ts:916>) verifica apenas se a string foi informada; não comprova experimento/relatório homologado nem preserva essa referência no update mostrado. Isso demonstra insuficiência do DAL, sem afirmar que E3 tenha sido ativado remotamente.

**Correção/aceite:** separar métricas de ratificação, deduplicar unidades/revisões, segregar versão/coorte, registrar método e decisão autorizada. Aprovar E3 somente com calibração existente e rastreável. Não substituir decisão comercial por threshold inventado. Repetições não aumentam amostra; referência inexistente não aprova policy.

### V18-05 — P1 — Experimento revisado ainda promove sem comparação válida

**Confirmado em runtime.** Foram corrigidas a checagem de versões, a exigência de assignment e a autoria da promoção. Mesmo assim, `experiment_one_empty_candidate_evaluation_promotes` criou versões reais, atribuiu uma unidade à candidata, registrou `output={}`, revisou via serviço autorizado e promoveu com `minSample=1`, baseline com zero avaliações e nenhum método/coorte significativo. O relatório trata score ausente como zero e o gate aceita o total bruto de avaliações.

Referências: [experiment-db.ts:286](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/experiment-db.ts:286>) e [experiment-db.ts:380](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/experiment-db.ts:380>). `reviewPolicyExperiment` muda status, mas não registra as notas recebidas nem uma aprovação metodológica equivalente ao gate definido no plano.

**Correção/aceite:** validar a métrica e o protocolo aprovado, definir a unidade experimental prevista no contrato, exigir cobertura/amostra por grupo ou pareamento conforme o método, registrar revisão e promover atomicamente contra a política/versão correntes. Rejeitar o ensaio acima sem inventar tamanho universal de amostra. O plano pede comparação verificável; a nova distribuição exclusiva de uma unidade a uma variante também precisa ser reconciliada com a comparação pareada especificada.

### V18-06 — P1 — Ajustes sucessivos de comissão no mesmo estado se perdem silenciosamente

**Confirmado em runtime.** Importados quatro arquivos do mesmo pedido/item/estado, com comissões 100 → 150 → 175 → 200. Todos reportam uma linha comitada; o ledger só contém 100 e 150. A chave de ajuste em [commercial-financial-db.ts:772](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/commercial-financial-db.ts:772>) é `${baseSourceKey}:${commissionState}`. O terceiro evento colide, `ON CONFLICT DO NOTHING` o descarta e os contadores ainda anunciam ajuste/commit.

**Correção/aceite:** identidade canônica de evento/revisão, recuperação determinística e conflito explícito quando não for possível identificar o evento. Preservar cadeia de predecessores e replay idempotente; não fabricar identidade de fornecedor não homologada. Demonstrar quatro eventos distintos preservados, replay sem duplicação e contadores iguais aos registros efetivamente inseridos. Parser real continua condicionado a G-FIN; este defeito já ocorre no parser interno sintético.

### V18-07 — P2 — Seleção vazia pode importar todas as linhas elegíveis

**Confirmado em runtime e UI.** `explicit_empty_selection_imports_all_eligible_rows` envia `selectedRowIds=[]` e comita uma linha. O serviço converte conjunto vazio em ausência de seleção; [financeiro/workspace.tsx:49](</home/many/Documentos/Projetos linux/Garimpa/packages/web/app/admin/financeiro/workspace.tsx:49>) também converte o vazio em undefined. As caixas começam desmarcadas, mas o botão permite confirmar.

**Correção/aceite:** distinguir claramente “todas as elegíveis” de seleção explícita vazia; preservar IDs/digest revisados no backend e refletir a semântica na UI. Desmarcar todas deve lançar zero ou impedir o commit com explicação. Esta pendência é da jornada R08/CF-17; não reabre a duplicação de conversão específica de CF-10, que foi corrigida.

### V18-08 — P1 — Marcador de I/O não é durável antes do envio; revalidação permanece incompleta

**Confirmado em runtime.** A action chama o ciclo dentro de `withAccountDb`, cuja transação só termina depois do adaptador. Em `dispatch_assisted_expired_plan_link_and_uncommitted_io`, o worker chamou o adaptador sintético e declarou sucesso; um rollback posterior deixou o job **queued e `io_started_at=null`**. Assim, o comentário “fora de qualquer transação” não descreve a execução real. Uma falha nessa janela permite repetir efeito externo sem marcador durável.

No mesmo ensaio, destino `assisted` e entitlement com `ends_at` vencido não impediram o ciclo. O payload recebeu `https://garimpa.app/l/audit_code18`, embora a rota de campanha existente seja `/p/[code]`. O worker ainda prefere `campaign_link.target_url` quando preenchido, em vez de sempre compor o link rastreável previsto. A checagem de revisão compara o ID carregado pelo job com o próprio ID solicitado, sem comprovar revisão atual/publicação; não reaproveita a revalidação factual completa do fluxo comercial.

O kill switch de [dispatch-panel.tsx:11](</home/many/Documentos/Projetos linux/Garimpa/packages/web/app/admin/dispatch-panel.tsx:11>) é estado React enviado por requisição, sem efeito persistente entre operadores/processos. Não foi encontrada reserva atômica de quota/cooldown de envio no ciclo examinado.

**Correção/aceite:** dividir aquisição/validação/marker e finalização em transações curtas, com commit do marker antes de I/O; revalidar modo, plano/vigência, conta, destino, credencial, revisão/publicação, condições materiais, quota/cooldown e switch persistido. Comprovar crash/rollback com sessões independentes em staging e reconciliação conservadora, sem retry cego. O reparo específico de CF-12 — cancelar antes do marker aborta o adaptador — foi confirmado e deve ser preservado.

### V18-09 — P1 — Convite ainda usa e-mail declarado e impede adesão entre contas

**Confirmado em serviço/RPC e leitura da action.** Foi corrigida a falta de auth_user_id e o aceite agora usa rotina atômica. Porém, [onboarding-actions.ts:51](</home/many/Documentos/Projetos linux/Garimpa/packages/web/app/admin/onboarding-actions.ts:51>) repassa o input do cliente. [saas-onboarding-db.ts:128](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/saas-onboarding-db.ts:128>) envia `input.invitedEmail` como `p_verified_email`. A RPC confere a ligação app_user/auth_user_id e a igualdade com o convite, sem provar que aquele e-mail pertence à sessão autenticada. O ensaio aceita a adesão sem fornecer/verificar o e-mail da sessão.

Além disso, `invitation_rejects_existing_other_account_context` demonstra que um usuário de B não consegue aceitar convite para A: o serviço rejeita se o tenant do contexto inicial divergir do convite. A action ainda exige resolver membership antes do aceite, o que inviabiliza o primeiro ingresso de usuário sem conta. Isso contraria pessoa global e múltiplas memberships.

**Correção/aceite:** bootstrap por identidade autenticada com e-mail verificado obtido no servidor; token determina o destino. Não exigir membership prévia no destino nem tratar a conta anterior como limite de adesão. Testar usuário novo, usuário de B entrando em A, e-mail divergente/não verificado, expiração, uso único e aceite concorrente. Sem conceder permissão ampla para contornar o bootstrap.

### V18-10 — P2 — Onboarding termina com referência inventada e sem fatos

**Confirmado em runtime.** A checagem nova cobre somente credenciais e é ultrapassada por qualquer string em evidenceRef. `onboarding_finishes_with_unresolved_evidence_reference` concluiu todas as sete etapas com `nonexistent-evidence`, zero credenciais e zero publicações confirmadas. O progresso retornou `finished`.

**Correção/aceite:** cada etapa deriva do comando que criou o fato ou consulta referência existente, autorizada e pertencente à conta. Existência de configuração inválida/suspensa não equivale a credencial validada. Rejeitar referência inexistente/estrangeira e conclusão de publicação sem confirmação; comprovar o caminho positivo com fatos sintéticos reais da conta.

### V18-11 — P2 — A nova reativação falha para administrador legítimo

**Confirmado em runtime.** `reactivation_rejects_valid_platform_admin_without_actor_GUC` atribuiu platform_admin a `u_a`, suspendeu B pelo serviço administrativo e tentou reativá-la pelo novo serviço. Recebeu `platform_admin_required`; B permaneceu suspensa.

[saas-onboarding-db.ts:568](</home/many/Documentos/Projetos linux/Garimpa/packages/web/lib/saas-onboarding-db.ts:568>) consulta `app_user_role` sem configurar o ator antes da leitura, ao contrário da suspensão. A policy filtra pelo ator da transação. A action também depende de resolver uma conta ativa previamente.

**Correção/aceite:** contexto administrativo explícito e autenticado, role ativa/revogada revalidada e leitura sob identidade correta. Demonstrar suspender B, preservar A/casa e reativar B pelo mesmo caminho operacional; testar administrador revogado e afiliado comum. Não afrouxar a policy para tornar o teste verde.

### V18-12 — P1 — CF-17 continua parcial, apesar das novas interfaces

**Confirmado por inventário de consumidores; sem ensaio de browser autenticado nesta rodada.** Há progresso concreto: formulário 4D/CSV, Radar com actions, deep-link para campanha, arquivo CSV lido no navegador com linhas/seleção, painel de experimentos e ações de onboarding. Esses consumidores não devem ser descritos como inexistentes. Ainda faltam os seguintes aceites:

| Entrega do plano | Pendência verificável |
|---|---|
| R04/D06 | Decoder/compatibilidade e digest factual da revisão, conforme V18-03; ratificação segue V18-04. |
| R06/D07 | `prioritizeMonitoringQueue` continua sem consumidor de produção encontrado. Cooldown ainda recebe tenant/produto/canal e default 24h, sem audience_key/política específica. O novo filtro de estados oferece planned/sent/cooldown, ausentes de OpportunityState; faltam candidate/monitored/prioritized/held. |
| R07/D08 | Navegação/deep-link não equivale ao pipeline S-KIT. A tela exibe/copia texto; o fluxo cria `assetRefs:[]` e valida imagem como rights unknown. Não foi demonstrada geração, revisão privada e exportação de arte com asset próprio autorizado/sintético. G-RIGHTS limita o asset real, não impede esse núcleo local. |
| R08/D09 | O input de arquivo faz `file.text()` e envia csvContent. Import batch tem digest/linhas, mas não referência a original privado em Storage, retenção ou proveniência do arquivo. Persistir somente normalizados não encerra “arquivo privado”. Somam-se V18-06/07. |
| R09/D10 | Painel de criar/revisar/promover/rollback existe; assignment e avaliação continuam sem consumidor de app/runner fora dos testes encontrado. O ciclo operacional de coleta/coorte/método ainda não está completo; gate insuficiente em V18-05. |
| R10/D11 | Painel novo não substitui agenda/runner com contexto e transações adequadas, switch persistente, quota/cooldown e reconciliação operacional; V18-01/08 impedem aceite. |
| R11/D12 | Actions e botões não completam provisionamento/aceite guiado por identidade global e primeira campanha baseada em fatos; V18-09/10/11 permanecem. Não foi encontrado consumidor ativo de provisionamento de piloto que encerre a jornada. |

**Correção/aceite:** seguir as entregas funcionais já definidas no plano 17, com entrada autorizada → serviço → persistência → resposta/estado visível. Não trocar escopo por mensagens de bloqueio ou links. Produzir provas de jornada e manter somente os efeitos externos dependentes dos gates desligados.

### V18-13 — P2 — Checklist e relatório ainda exageram a comprovação

**Confirmado por comparação documental.** O checklist declara todos os 18 CF resolvidos e R00–R12/R14 verificados. Isso é incompatível com os resultados acima. STATUS ainda descreve D00 concluído, D01 em execução e D02–D12 pendentes; não foi atualizado para esta rodada.

Exemplos específicos: o checklist atribui o reparo de CF-01 a M-10A2, embora as policies problemáticas estejam em M-12; cita `app_user.is_platform_admin` como mecanismo de suspensão, que não corresponde à implementação examinada; atribui deduplicação de 30 produtos a código que ainda usa `count(*)`; declara pipeline de material/arquivo privado concluído sem o comportamento correspondente.

A nova suíte também contém verificações insuficientes para suas mensagens de sucesso: o teste “30 replays” consulta métricas sem efetuar 30 replays; CF-07 testa candidata inexistente, mas não uma promoção com método/amostra inválidos; CF-12 usa kit vazio e não exige que `cancelledCf12` seja true, podendo terminar antes de alcançar o marker. O nosso controle positivo usa fatos válidos, exige cancelamento efetivo no marker e comprova zero chamadas ao adaptador.

**Correção/aceite:** corrigir cobertura e documentação após os reparos; registrar implementação, verificação local, homologação e ativação separadamente. Exigir que os testes reproduzam o trigger e comprovem persistência/efeito, em vez de confiar na mensagem impressa. Preservar as evidências históricas e atualizar o status corrente com links para provas reais.

## 3. Conclusão por apontamento original

“Corrigido localmente” abaixo encerra o defeito específico identificado na revisão 16, sem certificar a jornada inteira ou o ambiente remoto.

| CF | Classificação independente | Fundamento / trabalho restante |
|---|---|---|
| CF-01 | CORRIGIDO LOCALMENTE | Policies de convites/planos negam contexto ausente; controle positivo desta rodada. |
| CF-02 | PARCIAL | Summary e novas actions melhoraram; fronteiras legadas ainda dependem de local/role; V18-02. |
| CF-03 | CORRIGIDO LOCALMENTE | Captura de dispositivo agora propaga ator e factory; suíte de regressão executa persistExtensionCapture positiva. Homologação de extensão real continua externa. |
| CF-04 | PARCIAL | Persiste sem IA; leitura canônica/legada e vínculo factual não concluídos; V18-03. |
| CF-05 | CORRIGIDO LOCALMENTE | FKs permitem pessoa global; comparação exige membership ativa e o caso de revisor em duas contas passa. Não encerra os demais leitores legados de autoria. |
| CF-06 | ABERTO | Replay ratifica, thresholds continuam fixos e não há ratificação formal; V18-04. |
| CF-07 | PARCIAL | Versões, assignment, revisão e autoria melhoraram; método/amostra ainda não protegem promoção; V18-05. |
| CF-08 | PARCIAL | Primeiro ajuste/estado pode encadear; revisões seguintes no mesmo estado somem; V18-06. |
| CF-09 | CORRIGIDO LOCALMENTE | Casos de colisão por ':' agora coexistem com encode dos segmentos; regressão executada. Não certifica formato de fornecedor. |
| CF-10 | CORRIGIDO LOCALMENTE | Chave da conversão é estável entre lotes; cenário de sobreposição passa sem duplicar conversão. Seleção vazia é pendência distinta de R08. |
| CF-11 | PARCIAL | Fatos vazios são bloqueados; links, vigência/modo, revalidação e durabilidade ainda falham; V18-01/08. |
| CF-12 | CORRIGIDO LOCALMENTE | Worker respeita falha do marker; controle com cancelamento efetivo nesta rodada comprovou zero I/O. Não confundir com durabilidade transacional pendente. |
| CF-13 | PARCIAL | Auth ID e atomicidade foram incluídos; e-mail continua declarado e bootstrap entre contas falha; V18-09. |
| CF-14 | CORRIGIDO LOCALMENTE | DML de app_user_role foi revogado na fixture e aceite usa rotina com privilégios restritos. A fixture ainda reconstrói outros grants em bloco; não certifica equivalência integral do ambiente. |
| CF-15 | PARCIAL | Suspensão canônica e bloqueio de acesso privado passam; reativação e enforcement de vigência no worker falham; V18-08/11. |
| CF-16 | PARCIAL | Sem configuração e sem referência há rejeição; string arbitrária contorna a prova factual; V18-10. |
| CF-17 | PARCIAL | Consumidores novos comprovados; sete jornadas ainda possuem aceites ausentes; V18-12. |
| CF-18 | ABERTO | Registro de conclusão contraditório e testes insuficientes para as alegações; V18-13. |

## 4. Recomendações de correção — não executadas

Usar o plano 17 como fila, incorporando estes triggers e critérios. Priorizar a confirmação fictícia e as fronteiras privadas; depois identidade/convites, compatibilidade da avaliação e ratificação, eventos financeiros, método experimental e o ciclo durável de despacho. Completar as jornadas e corrigir o registro final antes de pedir homologação integral. Não há necessidade de redesenhar o blueprint ou reiniciar módulos que já funcionam.

Não aplicar as onze migrations no projeto conectado como consequência desta conferência. As versões locais M-02 e M-12 foram editadas; confirmar histórico/checksums de cada alvo antes de decidir entre baseline ainda não aplicado e migration corretiva aditiva. A ausência de tabelas no projeto consultado não prova ausência em todos os ambientes.

## 5. Verificação realizada e limites

| Verificação | Resultado |
|---|---|
| Unitários web/capture/persistence/extension | 557 aprovados: 379 + 127 + 35 + 16; zero falhas. |
| Typechecks | Quatro pacotes aprovados, incremental desativado. |
| Suítes SQL | Todas as 15 entradas de scripts de tools/editorial-tests passaram, incluindo a nova test:cf-regressions. Não converter mensagens agregadas em número independente de aceites. |
| Build web | Aprovado; log preservado. Build com URL fictícia não prova conectividade com o banco V2. |
| Diagnóstico adicional | 14 ensaios concluídos: 2 controles positivos e 12 contraexemplos, sem probe_error na execução final. |
| Integridade de fontes | 509 hashes de fontes preservados entre início e fim desta auditoria; somente documentos/evidências foram acrescentados por ela. |
| Supabase MCP | Duas chamadas somente de leitura: identidade do projeto e metadados de três objetos. Nenhum DML/DDL remoto. |

O projeto conectado é `spbuwcwmxlycchuwhfir`. Na consulta desta rodada, `to_regclass` retornou null para `garimpa.policy_experiment`, `garimpa.account_entitlement` e `garimpa.dispatch_job`. Isso demonstra ausência desses objetos nesse projeto, não identifica staging, deployment ou histórico completo de migrations. A execução local não deve ser apresentada como versão remota homologada.

Não foram validados navegador autenticado com usuários A/B/casa, Auth real, Storage privado, pooler, concorrência em conexões independentes, recovery operacional, deployment, canal real, EXP-02 editorial, rubrica humana homologada ou parser de relatório real. Os testes PGlite não substituem esses ensaios. Foi consultada a [documentação oficial de RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security): permissões e policies são verificações distintas; os testes locais usam role de aplicação, e o acesso administrativo MCP foi usado somente para metadados, sem alegar prova de isolamento.

Os gates G-ENV, G-PRICE, G-RUBRIC, G-FIN/G-PROGRAM, G-RIGHTS, G-EXPERIMENT, G-CHANNEL e G-PILOT/PRIVACY/SEC continuam dependentes das respectivas evidências/decisões. Eles não justificam encerrar o núcleo local incompleto listado aqui.

## 6. Próximo passo e critério de encerramento

Devolver V18-01–13 ao executor como adendo corretivo do plano 17. A próxima conferência deve confirmar os reparos dos triggers reproduzidos e as jornadas listadas, revalidando as fontes atualizadas. Só então encerrar os CF remanescentes e registrar a prontidão para staging, mantendo os gates externos separados e explícitos.

**Conclusão objetiva desta rodada:** verificação concluída; correções não executadas; implementação integral ainda não comprovada. O funcionamento da operação de produção não foi alterado por esta auditoria.
