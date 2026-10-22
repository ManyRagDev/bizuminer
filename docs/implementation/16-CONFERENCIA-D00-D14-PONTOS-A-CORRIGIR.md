# Conferência D00–D14 — pontos a corrigir antes de homologar

Data: 14/10/2026. Skill: codex-investigador. **Somente conferência: nenhuma correção funcional, migration remota, deploy ou envio foi realizado.**

**Parecer: a alegação de conclusão de todas as implementações não se sustenta.** Houve progresso substancial e os checks existentes passaram, mas a conferência reproduziu **16 contraexemplos** e encontrou jornadas ainda sem consumidores operacionais. Há reparos locais pendentes; não faltam somente staging e decisões comerciais. Não recomendar ativação das policies V2, distribuição real ou entrada externa com base no relatório recebido.

## 1. Problema, ambiente e reprodução

### Esperado versus observado

O relatório anexo afirma D00–D12 verificados localmente e D14 concluída, deixando D13 bloqueada. O [plano 15](15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md) exige, além de contratos/tabelas/testes, autorização nas fronteiras, consumidores reais, entregas completas e evidências proporcionais ao aceite.

**Observado:** novos DALs, actions, importação financeira visível e testes SQL são reais. Entretanto, persistem acesso privado sem membership em caminhos legados e novos, policies que autorizam ausência de contexto, perda de avaliação humana, gate editorial automático, importação que descarta ajustes/duplica conversões, worker com dados inventados e falha de cancelamento, e onboarding sem comprovação do receptor/etapas/suspensão efetiva. Vários serviços só são chamados pelos testes.

### Snapshot e limites

- Repositório: working tree local; HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, com muitas alterações anteriores e arquivos não rastreados. HEAD sozinho não identifica esta versão: usar os hashes do [manifesto](evidencias/manifesto-revisao-16.json).
- O manifesto registra 501 arquivos de aplicação/testes/migrations antes da conferência. Seus conteúdos permaneceram inalterados durante os checks e reproduções. STATUS e checkpoint recebidos foram preservados e não corrigidos por esta revisão.
- Ensaios: Node v22.23.2, runners existentes, PostgreSQL WASM/PGlite em memória, onze migrations V2, role `garimpa_app` para operações de aplicação. Seeds administrativos somente em dados sintéticos isolados.
- Consulta MCP somente de metadados: projeto `spbuwcwmxlycchuwhfir`, schema `garimpa`, zero migrations `20261014%` no histórico; `account_entitlement`, `dispatch_job` e `policy_experiment` ausentes. Role de auditoria `postgres`; isto não prova acesso do usuário ou comportamento implantado. [Registro remoto](evidencias/revisao-16-remoto.json).
- Não foi identificado staging isolado, deployment/commit em produção, nem reproduzido incidente HTTP em produção. Os defeitos novos são do código/schema local ensaiado; não presumir que já estejam implantados.
- Não houve teste de compra, mensagem, cobrança, convite externo, alteração de dados remotos, Auth/Storage real ou concorrência com sessões PostgreSQL independentes.

### Como reproduzir os contraexemplos

Na raiz do repositório, com as dependências já instaladas:

```bash
node --import ./tools/editorial-tests/node_modules/tsx/dist/loader.mjs docs/implementation/evidencias/revisao-16-probes.mts
```

O [harness diagnóstico](evidencias/revisao-16-probes.mts) usa os serviços/SQL atuais e a fixture em memória. [Log](evidencias/revisao-16-probes.log) e [resultados completos](evidencias/revisao-16-contraexemplos.json) permitem conferir cada observação.

**Seu exit 0 confirma os defeitos descritos, não o aceite do produto.** As assertions esperam os resultados incorretos para documentar a reprodução. O executor deve criar regressões separadas esperando o comportamento correto e preservar a evidência histórica. Nenhum mock de resultado de SQL ou serviço externo real foi necessário; a prova de cancelamento controla uma intercalação na mesma sessão e não se apresenta como teste multi-sessão.

## 2. Evidências e pontos a corrigir

As prioridades P1 abaixo impedem homologar a capacidade afetada com segurança/correção. P2 identifica lacuna funcional ou documental que também precisa encerrar antes do respectivo aceite. “Confirmado em runtime” refere-se ao ensaio isolado; “estático” indica mecanismo/consumidor demonstrado no código, com limite de execução explícito.

### CF-01 — P1 — Policies novas autorizam convites e planos sem contexto

**Confirmado em runtime SQL.** `packages/persistence/supabase/migrations/20261014110000_garimpa_saas_onboarding_entitlements.sql:102` cria `account_invitation_token_lookup` permitindo SELECT quando `garimpa.tenant_id` é null/vazio. A policy de UPDATE repete essa condição. `account_entitlement_platform_manage`, a partir da linha 134, permite ALL quando `garimpa.membership_role` é null, mesmo sem capability de plataforma. A restrição `active_tenant` não exige membership/tenant selecionado e não corrige isso.

**Reprodução:** sessão `garimpa_app` sem tenant/membership lê os dois convites sintéticos, incluindo hashes, e os planos de A/B; altera `terms_ref` dos dois planos sem contexto. Probe `RLS_without_context_reads_invites_and_plans`.

**Causa → efeito:** ausência de contexto tratada como autorização de bootstrap/plataforma → leitura/mutação privada entre contas. Não é reclamação de que GUC protege contra servidor comprometido: o caso é uma sessão runtime sem contexto, que o contrato manda negar.

**Reparo/aceite:** retirar alternativas permissivas por null/vazio; bootstrap limitado ao token/identidade validado por rotina mínima, e gestão de plano por capability comprovada. Demonstrar leitura/gravação negadas sem contexto e por cliente, aceite legítimo de convite e gestão administrativa legítima, sem tornar toda a tabela legível para bootstrap.

### CF-02 — P1 — Membership continua opcional em serviços legados e ausente em novas actions

**Runtime SQL + rastreamento estático das fronteiras.** `curationSummary` em `packages/web/lib/curation-db.ts:121` recebe contexto opcional; sem ele, retorna ao `withTenantDb`. O layout foi adaptado, mas `app/admin/page.tsx` continua chamando serviços da casa/defaults; `api-auth.ts::checkAffiliateUser` continua verificando apenas role global. Diversas actions legadas continuam passando `local`.

Nas novas `app/admin/direcionamento/opportunity-actions.ts`, `createAudiencePolicyAction`, `createAudiencePolicyVersionAction` e `fetchRadarOpportunitiesAction` validam apenas reviewer afiliado e definem GUC com `input.tenantId/options.tenantId`. As actions de rubrica em `app/admin/curadoria/actions.ts:266–396` repetem o padrão. `createOrUpdateOpportunityAction` ainda recebe assessment/evidência do cliente em vez de recarregar fatos autorizados no serviço.

**Reprodução:** `withAccountDb` corretamente recusa contexto A forjado para B; executando a transação tenant-only usada pela action, `createAudiencePolicy` grava em B. `curationSummary('local',factory)` retorna uma pendência privada da casa sem ator/membership. Probe `private_legacy_and_policy_mutation_without_membership`.

**Reparo/aceite:** tornar contexto autorizado obrigatório nos comandos privados e adaptar todas as entradas/consumidores. Resolver conta e fatos no servidor; tenant recebido é lookup. Testar não membro, owner/operator, revogado e pessoa em duas contas, incluindo entrada/action real. O layout adaptado não certifica as demais páginas/actions. O alcance HTTP das novas actions não foi exercitado; não afirmar exploração real ou acessibilidade de action órfã no deployment.

### CF-03 — P1 — Dispositivo legítimo autentica, mas a captura perde o contexto do ator

**Confirmado no SQL exato da revalidação; persistência HTTP não executada.** O filtro `am.revoked_at is null` foi corrigido, o que é progresso. Porém, `packages/web/lib/extension-db.ts::persistExtensionCapture` usa `withTenantDb`, sem definir `actor_app_user_id`. Sua revalidação consulta `app_user_role`, cuja policy de M-10A2 exige esse ator.

**Reprodução:** dispositivo/membership/role ativos: bootstrap retorna `role_active=true`; mesma query de acesso da captura em tenant-only retorna `allowed=false`; com `withAccountDb` autorizado retorna true. Probe `legitimate_device_bootstraps_but_capture_guard_loses_actor_context`.

**Reparo/aceite:** propagar identidade/conta verificada do dispositivo no caminho de captura e auditar pareamento/exchange. Provar captura legítima completa primeiro, e recusa após revogação depois. O teste novo que chama somente `authenticate_extension_device` não encerra D02 nem comprova preservação da extensão.

### CF-04 — P1 — Revisão humana sem IA informa sucesso e não salva a avaliação

**Confirmado em runtime.** `packages/web/lib/rubric-db.ts::recordHumanRubricReview`, linhas 401–408, retorna `agreement=true/hasShadow=false` quando não há análise shadow, sem persistir a avaliação humana. Com shadow, grava comparação/desacordos, mas não grava o payload completo da avaliação humana; `editorialAssessmentId` pode continuar null.

**Reprodução:** salvar avaliação de produto sem IA retorna sucesso; contagens de `editorial_assessment` e `comparison_review` permanecem ambas zero. Probe `human_review_without_AI_returns_success_without_saving`.

**Reparo/aceite:** persistir primeiro a revisão humana, com payload/fatos/digest/autor/versão e idempotência; comparação é um resultado opcional posterior. Salvar→reabrir deve recuperar integralmente a avaliação mesmo sem chave/provider/resultado IA. Não usar “comparação criada” como substituto do registro humano.

### CF-05 — P1 — Nova FK de autoria impede uma pessoa de revisar em duas contas

**Confirmado em runtime SQL.** M-02 cria `comparison_review(reviewed_by_app_user_id,tenant_id) → app_user(id,tenant_id)`. Isso contradiz C-01: pessoa é global por auth_user_id; tenant de app_user é home, enquanto memberships dão acesso a outras contas. O reparo de autoria de M-10A1, executado antes de M-02, não corrige essa tabela futura.

**Reprodução:** usuário home B, com membership operator válida também em A, tenta salvar comparação em A; recebe `23503`. Probe `multi_membership_reviewer_rejected_by_home_tenant_FK`.

**Reparo/aceite:** referenciar usuário global e membership/autoria na conta por vínculo apropriado, preservando histórico. Não duplicar app_user nem trocar home para permitir o write. Mesma pessoa deve revisar em A/B; pessoa sem membership deve ser recusada.

### CF-06 — P1 — G-RUBRIC é ratificado por contagem/replay e threshold inventado

**Confirmado em runtime.** `rubric-db.ts::getRubricPromotionMetrics`, linhas 352–365, fixa 30 e 80% e devolve `ratified` automaticamente. Não exige ratificação do responsável, método/versão/coorte aprovados ou amostra distinta. `recordHumanRubricReview` não exige chave idempotente.

**Reprodução:** 30 submissões idênticas do mesmo produto/revisor resultam em `totalReviewed=30`, `agreementRate=1`, `status=ratified`, sem aprovação humana da política. Probe `rubric_ratifies_thirty_replays_of_one_product_without_approval`.

**Reparo/aceite:** separar métricas de amostra de ratificação formal, que deve ser evento/configuração aprovada. Remover threshold comercial não aprovado; deduplicar unidade/revisão e separar versões/coortes. Replay não amplia amostra; preencher contagem não muda status para homologado. Não foi demonstrada ativação da rubrica em produção.

### CF-07 — P1 — Experimento promove shadow sem revisão, usa amostra inadequada e pode apontar versão inexistente

**Confirmado em runtime.** `experiment-db.ts::createPolicyExperiment` escolhe `minSample=30` quando ausente e já cria `shadow`. `recordExperimentEvaluation` aceita unidade sem assignment. O relatório conta linhas de avaliação, não pares/unidades elegíveis, e transforma score ausente em zero. `promotePolicyExperiment` usa `promotedBy` do input; o validator aceita estado shadow. Atualiza `audience_policy.current_version` sem criar/verificar a versão candidata aprovada.

**Reprodução:** experimento sem método aprovado, `minSample=1`, uma avaliação candidate `{}` sem baseline/assignment: relatório dá valor 0; promoção aceita `promotedBy='invented-approver'` diretamente do estado shadow e aponta política para `missing-candidate`, sem qualquer versão candidata correspondente. Probe `experiment_promotes_shadow_unpaired_sample_with_forged_approver`.

**Reparo/aceite:** metodologia aprovada antes de medir; assignments e outputs vinculados/coortes pareadas quando previstas; faltante permanece desconhecido. Revisor autorizado vem da identidade server-side; exigir reviewed, amostra válida e revisão concorrente. Criar/validar versão aprovada e promoção/evento atomicamente, com rollback consistente. Rejeitar os casos do probe, mesmo quando o caller envia minSample/contagem/aprovador convenientes.

**Lacuna estática adicional de gate:** `price-evidence.ts::approvePriceEvidencePolicy:904–924` exige somente referência não vazia para E3, sem comprovar calibração homologada e sem persistir essa referência no update. D05 ainda precisa ligar aprovação à evidência auditável; uma string não comprova G-PRICE. Não se demonstrou E3 ativado remotamente.

### CF-08 — P1 — Importador trata correção/recebimento como duplicata e perde o ajuste

**Confirmado em runtime.** `commercial-financial-db.ts::createOrGetImportBatchPreview:435–452` considera duplicata toda comissão com mesmo sourceKey. O commit usa chave sem eventKind/revisão de provedor e sempre predecessor null.

**Reprodução:** importar comissão confirmed=100; segundo relatório com o mesmo pedido/item, received=150, fica duplicate, zero linhas comitadas; ledger permanece confirmed=100, sem ajuste/recebimento. Probe `import_suppresses_commission_adjustment`.

**Reparo/aceite:** separar obrigação de evento/revisão; quando o formato interno/fornecedor provar identidade da correção, gravar novo fato com predecessor e conciliar. Se identidade for insuficiente, mostrar revisão humana, não suprimir como duplicata. Confirmado→recebido→correção/estorno deve funcionar pelo importador, e não apenas pelo formulário manual que o teste financeiro usa para essa parte.

### CF-09 — P1 — Digest foi corrigido, mas sourceKey do ledger ainda colide

**Confirmado em runtime.** Linhas 438 e 697 de `commercial-financial-db.ts` concatenam marketplace/pedido/item com `:`. A correção da serialização de `calculateCanonicalReportDigest` não foi propagada à identidade financeira.

**Reprodução:** pedido `colon:a`, item `b`, e pedido `colon`, item `a:b` têm digests canônicos diferentes; segunda importação é descartada por colisão do sourceKey. Probe `ledger_key_still_collides_despite_fixed_digest`.

**Reparo/aceite:** representação estrutural sem ambiguidade para todas as chaves persistidas, com versão/migração compatível e revisão de colisões existentes. Dois fatos distintos devem coexistir; mesmo fato reordenado/repetido deve ser deduplicado.

### CF-10 — P1 — Lotes sobrepostos criam conversões duplicadas apesar da comissão única

**Confirmado em runtime SQL.** Commit gera request de conversão por `batch.id + row.id`. Diferentes previews criados antes de qualquer commit não veem a sobreposição no ledger. No segundo commit, a comissão usa ON CONFLICT DO NOTHING, mas a conversão já foi criada com chave nova; o contador/evento de importação também não depende de uma comissão nova válida.

**Reprodução sem concorrência:** criar preview 1 com pedido X e preview 2 com X+Y; comitar 1 e depois 2. X fica com **duas conversões e uma comissão**. Probe `overlapping_previews_duplicate_conversion_not_commission`.

**Reparo/aceite:** deduplicar fatos no commit por identidade global de pedido/item/programa/conta/revisão, não pelo lote. Revalidar preview contra fatos atuais; contadores/eventos devem representar o que realmente ocorreu. Testar previews sobrepostos sequencialmente e em sessões independentes, inclusive arquivo reordenado.

### CF-11 — P1 — Worker usa fatos de fallback e link fixo, sem revalidação comercial completa

**Confirmado em runtime + inspeção do fluxo.** `dispatch-worker.ts::executeDispatchCycle` usa preço 1000 se faltante, validade agora+24h, status active/approved de fallback e `linkMonetizationStatus:'valid'` constante. Envia `https://garimpa.app/p/test`, não o campaign_link validado. Não carrega a validação/aprovação vigente nem comprova revisão corrente, mudança de variante/condições, credencial, período do entitlement, automation_mode, quota/cooldown de dispatch ou kill switch persistido. O parâmetro opcional killSwitch é snapshot do caller.

**Reprodução:** kit com snapshot `{}`, sem materiais e sem campaign_link, publication ainda planned e destino assisted, alcança o adapter sintético e vira succeeded com texto `Oferta Especial` e o link fixo. Probe `dispatch_sends_synthetic_facts_and_hardcoded_link`. Nenhuma mensagem real foi enviada.

O worker também recebe `Sql | TransactionSql`, sem orquestrar transações de claim/precheck/finalize. O próprio teste `dispatch-worker-flow.test.ts:520` chama o ciclo inteiro dentro de `asTenant(...tx...)`; portanto o I/O está dentro daquela transação, apesar do comentário que promete o contrário. Essa arquitetura não prova marcador durável após crash/rollback.

**Reparo/aceite:** serviço de agendamento ligado à UI; worker orquestrador controla transações curtas e confirma o marcador antes de I/O externo. Reutilizar revalidação factual completa, link e revisão corretos; dados ausentes negam. Quota/periodicidade/kill switch/segredos vêm da configuração real. Provar que snapshot vazio, publicação não pronta, destino assistido, link revogado e revisão superada nunca chamam adapter; comprovar persistência do marker antes da chamada. Core corrigido não equivale a canal real homologado.

### CF-12 — P1 — Cancelamento vence o marker, mas o worker envia mesmo assim

**Confirmado com intercalação controlada e SQL real.** `dispatch-db.ts::markIoStarted:252–278` retorna false quando perde posse/status. `executeDispatchCycle` ignora esse booleano e chama o adapter. O predicate do marker também não valida vencimento do lease.

**Reprodução:** cancelar o job depois do precheck e antes do marker; cancelamento retorna sucesso, marker não consegue marcar; adapter é chamado uma vez. Finalização falha com `LEASE_NOT_HELD`, depois do possível efeito externo. Probe `dispatch_ignores_lost_marker_after_controlled_cancel`.

**Reparo/aceite:** marcador/autorização de I/O deve ser transição atômica condicionada a posse, status e prazo válidos; não chamar adapter se ela falhar. Intercalar cancelamento/lease expirado/novo worker nesse ponto e verificar zero chamadas. Validar ainda com duas sessões independentes em homologação. Não confundir recusa de finalize com prevenção do envio.

### CF-13 — P1 — Aceite de convite confia no e-mail fornecido e não comprova identidade receptora

**Confirmado em runtime do serviço; não há endpoint público de aceite localizado.** `saas-onboarding-db.ts::acceptAccountInvitation` compara `input.invitedEmail` com o convite, mas não com e-mail verificado da sessão. Não verifica authenticatedAuthUserId nem vínculo dele com actorAppUserId. Token+tenant/ator/email informado dão origem à membership.

**Reprodução:** convite destinado a `victim@example.invalid`; serviço aceita para `u_new` usando esse e-mail no input, mesmo com `authenticatedAuthUserId=null`. Probe `onboarding_invitation_accepts_unverified_email_and_missing_identity`.

**Reparo/aceite:** resolver receptor/identidade autenticada no servidor; lookup do token por bootstrap mínimo; uso único e autoria comprovados. Negar actor inventado/ausência de sessão/receptor divergente mesmo com token válido. Construir a fronteira de aceite e testar o caminho real, não somente o validator puro. Não se afirma abuso ocorrido em produção.

### CF-14 — P1 — Fixture concede permissões extras e mascara falha do aceite real

**Confirmado em runtime e por metadados remotos.** `tools/editorial-tests/commercial-fixture.ts:36` faz GRANT SELECT/INSERT/UPDATE/DELETE em todas as tabelas existentes para garimpa_app. O baseline real, migration `20260929015526_affiliate_access_role.sql:37–38`, revoga DML em app_user_role e só concede SELECT. M-12 cria policy INSERT, mas não concede INSERT nessa tabela.

**Reprodução:** com fixture original o aceite de convite funciona. Restaurando no ensaio somente o grant real SELECT de app_user_role, o mesmo caminho falha com `42501` ao inserir a role afiliado. Probe `invite_acceptance_breaks_when_baseline_grant_is_faithful`. MCP confirma `has_table_privilege('garimpa_app','garimpa.app_user_role','INSERT')=false` no remoto atual.

**Reparo/aceite:** reconstruir a fixture com grants/revokes reais, além de tabelas/constraints/policies; não conceder ALL para fazer serviços passarem. Implementar a concessão limitada e autorizada necessária ao convite, preservando proibição de autoconcessão de platform_admin. Repetir todos os runners SQL com baseline fiel. Isto não exige liberar DML genérico de roles ao runtime.

### CF-15 — P1 — Suspensão do plano não suspende conta nem revoga acesso privado

**Confirmado em runtime.** `saas-onboarding-db.ts::suspendAccountByPlatformAdmin:568–573` muda somente account_entitlement.status. `affiliate_account.status` fica active; `active_tenant` e resolver de membership continuam autorizando. Nem todos os caminhos de leitura/segredo/worker consultam entitlement.

**Reprodução:** suspender A pelo serviço; entitlement passa a suspended, mas withAccountDb continua autorizando e lê suas políticas privadas; affiliate_account permanece active. Probe `suspension_does_not_revoke_private_reads_or_mark_account_suspended`.

**Reparo/aceite:** fazer suspensão administrativa de conta alcançar o estado canônico de acesso, comandos, secrets e jobs. Se existir leitura/export residual permitida na saída, defini-la explicitamente com projeção/papel restritos; não deixar acesso geral como consequência involuntária. Testar próximo comando, worker/segredo e preservação de A/casa ao suspender B. Término do plano deve impedir também capacidades dependentes e não apenas novas campanhas.

### CF-16 — P2 — Progresso de onboarding é declaração do caller, não comprovação da etapa

**Confirmado em runtime.** `recordOnboardingProgress` valida apenas sequência e grava status/evidenceRef recebidos. Não verifica credencial, link, política, campanha, aprovação ou postagem correspondentes.

**Reprodução:** marcar account_created e depois marketplace_credentials_configured como completed, sem evidenceRef e com zero configurações de marketplace; serviço aceita. Probe `onboarding_marks_credentials_complete_without_evidence`.

**Reparo/aceite:** cada conclusão consulta o fato autorizado ou é emitida pelo comando que o cria; referências devem existir na conta. Rejeitar etapa inexistente, evidência ausente/estrangeira e “credencial configurada” sem credencial. UI pode solicitar ação, não declarar a etapa provada.

### CF-17 — P1 — Ainda faltam integrações operacionais do plano, além dos reparos

**Confirmado por inventário de consumidores em áreas ativas; deployment externo não inspecionado.** [Inventário reproduzível](evidencias/revisao-16-consumidores.json).

| Entrega | Progresso real | Parte técnica ainda pendente |
|---|---|---|
| D06 | DAL, métricas e actions de rubrica existem | submitHumanRubricReviewAction/runShadowEvaluationAction só aparecem nas definições; formulário de nova rubrica/sombra/amostra não consome as actions nas telas pesquisadas. Persistência humana também falha em CF-04. |
| D07 | DAL e actions de política/radar | fetchRadarOpportunitiesAction sem caller de UI; prioritizeMonitoringQueue sem integração ao monitor real. Cooldown não recebe/filtra audience_key e usa 24h padrão; não comprova isolamento por audiência exigido em C-03. |
| D08 | Campanhas/fluxo manual e copy têm consumidores | Não demonstrado cockpit Pauta/Radar/Resultados completo ligado aos novos serviços, nem arte/revisão privada com direitos e render S-KIT. G-RIGHTS condiciona usar asset real sem licença; não impede construir/testar material com asset próprio/sintético autorizado. |
| D09 | **Existe UI** de CSV colado→preview agregado→commit, com actions autorizadas | Não há upload/arquivo bruto privado/proveniência conforme plano; preview só mostra contadores/totais, não linhas/erros/seleção para review_required. Tela não passa selectedRowIds. Contrato de lote não referencia arquivo bruto privado. Parser de fornecedor continua condicionado a G-FIN. |
| D10 | Serviços/SQL de experimento | createPolicyExperiment e demais operações sem consumidor de app/CLI encontrado; faltam painel de coortes/Resultados integrado e revisão/promoção operacional. Método/amostra reais não bloqueiam essa construção local. |
| D11 | DAL, marker/tentativas, recovery/reconcile e função de ciclo | executeDispatchCycle sem caller fora de testes; faltam runner/worker executável com contexto, agendamento autorizado/painel/kill switch persistido e reserva atômica de quota/cooldown de envio. G-CHANNEL bloqueia adapter real, não o core/painel. |
| D12 | Serviços de convite/progresso/provisionamento/export | Serviços sem actions/UI/runner operacional encontrados para onboarding/provisionamento/suspensão/saída. Não há primeira campanha guiada ligada a evidências. G-PILOT/PRIVACY bloqueia convidado real, não a jornada de teste isolada. |

Não confundir essas ausências com a rodada anterior: importação agora **tem** consumidor de UI, e o core de dispatch/onboarding/experimento foi expandido. A conclusão permanece parcial porque o aceite pede a jornada completa, não porque todo o código esteja ausente.

**Reparo/aceite:** entregar cada integração de D06–D12 com entrada autorizada, consumidor visível/executável, persistência, resposta e histórico observáveis. Testes de serviço/SQL são necessários, mas não substituem UI/action/API→serviço→banco→UI. Gate deve bloquear somente o resultado externo correspondente.

### CF-18 — P2 — Registro de conclusão ainda contém contradições e provas excessivas

**Confirmado por leitura dos documentos/testes.**

- O topo do CHECKPOINT ainda marca D10/D11/D12/D14 como PENDENTE; os detalhamentos e matriz final os marcam verificados/concluídos. Relatório/STATUS também renomeiam D01/D02 em relação ao plano, prejudicando rastreabilidade.
- STATUS/matriz final referenciam `offer-evidence.ts`, `cockpit-actions.ts`, `financial-db.ts`, `financial-import.ts` e `STATUS.md`, que não correspondem aos arquivos citados/encontrados nessas áreas; os módulos reais têm outros nomes.
- D06 considera a FK por tenant do usuário uma garantia, mas ela causa CF-05. Considera 80% uma homologação, mas o threshold não foi aprovado no plano.
- Novos testes intitulados “concorrentes” executam chamadas serializadas na fixture; `dispatch-worker-flow` testa um ciclo sintético de sucesso dentro de transação. Não prova integração real, I/O fora de transação nem todos os resultados de transporte anunciados.
- D14 afirma auditoria integral de 62 requisitos sem matriz de prova requisito→consumidor→execução que encerre as lacunas acima.
- G-ENV é ausência de staging comprovado/autorizado, e não simplesmente falta de autenticação MCP: o MCP está utilizável nesta conferência, apontando para o projeto existente sem V2.

**Reparo/aceite:** sincronizar topo/detalhamentos/matriz/STATUS; preservar histórico; usar nomes reais, hashes e provas por capacidade. Separar implementado, verificado localmente, homologado e ativado. Não declarar todas as implementações concluídas nem “falta só staging” antes de CF-01–17.

## 3. Conclusão e hipóteses discriminadas

| Hipótese | Experimento / evidência | Conclusão |
|---|---|---|
| Os testes verdes relatados são fictícios | Reexecução dos quatro pacotes, 14 runners SQL, quatro typechecks e build | Descartada: passaram no ambiente preparado corretamente. |
| Só falta staging/gates de negócio | 16 contraexemplos, chamadas e consumers reais inspecionados | Descartada: há bugs e integrações locais ainda disponíveis. |
| Tenant-GUC equivale a conta autorizada | Contexto completo recusa B; tenant-only cria política em B e lê resumo da casa | Refutada; propagação de contexto nas fronteiras ainda incompleta. |
| Novas policies negam tudo quando falta contexto | Consultas/mutação runtime sem GUC em convites/entitlements | Refutada; CF-01 reproduzido. |
| Digest novo resolve deduplicação financeira | Dois pares de IDs com ':' e previews sobrepostos | Refutada; identidade do ledger/conversão continua divergente. |
| Cancelamento/posse impedem chamada externa | Intercalação controlada entre precheck e marker | Refutada; adapter chamado após cancelamento, finalize recusa tarde. |
| D12 opera sob o mesmo baseline de privilégios do remoto | Fixture com grant fiel SELECT-only em app_user_role | Refutada para aceite: falha 42501 mascarada por grant extra da fixture. |
| V2 já está aplicado no projeto conectado | Metadados e histórico MCP, sem escrita | Não: zero versões 20261014 e tabelas V2 consultadas ausentes. Isso não identifica deployment de código. |

### Estado recomendado de cada entrega

Esta tabela expressa a conclusão da conferência, sem editar o STATUS recebido.

| Entrega do plano 15 | Resultado da conferência |
|---|---|
| D00 | Parcial: regressões e fixture evoluíram; inventário/status/grants ainda inconsistentes. |
| D01 | Parcial: layout/contexto completos em alguns caminhos; CF-01/02 impedem encerramento. |
| D02 | Parcial: filtro de revogação foi corrigido; captura positiva sob RLS não encerrada, CF-03. |
| D03 | Reparos originais de parser/guards verificados nos casos ensaiados; não estender isso à importação completa ou a todos os limites de configuração. |
| D04 | Núcleo integrado a campanha/kit e testes aprovados; falta encerrar segurança de plano, propagação aos demais comandos, política/janela aprovada e prova multi-sessão. |
| D05 | Progresso/paridade nos casos SQL/TS ensaiados; calibração/aprovação auditável e cobertura de todas as jornadas não encerradas. G-PRICE permanece. |
| D06 | Parcial: CF-04/05/06 e consumidor operacional ausente. |
| D07 | Parcial: serviços reais; autorização, audiência/cooldown e radar/monitor operacional incompletos. |
| D08 | Parcial: fluxo manual preservado/testado; cockpit/material/arte e integrações integrais não encerrados. |
| D09 | Parcial: UI e serviços de importação existem; CF-08/09/10, revisão de linhas e arquivo privado pendentes. |
| D10 | Parcial: CF-07 e painel/consumidores pendentes. |
| D11 | Parcial: CF-11/12 e core operacional/painel/quota pendentes; canal real condicionado. |
| D12 | Parcial: CF-13–16 e jornada operacional pendentes; piloto real condicionado. |
| D13 | Bloqueada para homologação remota, por staging/alvo/autorização e pelos reparos prévios. |
| D14 | Não aprovada como fechamento: checks passam, mas requisitos/contratos e relatório não encerraram as pendências. |

Não afirmar que uma função não usada já causou falha em cliente real. Tampouco aceitar função não usada como implementação operacional concluída. O ambiente remoto e os efeitos externos continuam separados dos resultados locais.

## 4. Correções recomendadas — não executadas

Executar sobre o snapshot reconfirmado, reaproveitando o [plano 15](15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md), nesta ordem:

1. **CF-01/02/03/14:** fechar policies, restaurar fixture fiel e concluir contexto em fronteiras/extension. Testar acesso legítimo e negativo antes de qualquer aplicação remota de RLS. Não corrigir 42501 com grants administrativos amplos.
2. **CF-13/15:** concluir receptor autenticado do convite e suspensão canônica. Manter prova positiva de onboarding, acesso e operação da casa/A/B.
3. **CF-04/05/06:** persistir revisão humana, corrigir autoria por membership e separar ratificação formal de métricas. Não duplicar identidade ou inventar aprovação.
4. **CF-08/09/10:** corrigir identidade e evolução dos fatos financeiros, commit/preview e proveniência. Preservar ledger append-only e compatibilidade; fornecedor real continua dependente de G-FIN.
5. **CF-07/11/12:** fechar gates/versões de experimentos e revalidação/orquestração do worker, com marcador durável antes de I/O e recusa após cancelamento/perda de posse.
6. **CF-16/17:** completar interfaces/serviços/CLI e vínculos de evidência que faltam em D06–D12, sem chamar adapter real ou convidar pessoa externa.
7. **CF-18:** sincronizar documentação e repetir auditoria/coverage da versão candidata inteira; só então homologar staging identificado/autorizado.

### Migrations, compatibilidade e recuperação

Correções de RLS/grants/autoria/identidade de fatos e consistência podem exigir DDL. Reconfirmar histórico por alvo: projeto consultado não tem V2, mas isso não autoriza reescrever arquivo aplicado em outro ambiente compartilhado. Alteração já aplicada exige migration aditiva; arquivo local não aplicado exige reensaio e novo hash. Criar/revisar migration e aplicá-la remotamente são ações distintas.

Antes de UNIQUE/backfill de chaves financeiras, auditar colisões/duplicatas e definir reconciliação sem apagar receita/histórico. Ajustes são novos lançamentos/predecessores, não DELETE de fatos. Corrigir FK de usuário sem mudar sua identidade/home e sem perder autoria antiga. Recuperação por configuração/versão compatível/forward-fix e snapshot ensaiado, nunca por reabertura genérica de RLS. Aprovação do negócio não é inferida de coluna ou string não vazia.

## 5. Verificação executada, cobertura e limitações

### Resultados obtidos

| Verificação | Resultado desta conferência | Evidência |
|---|---|---|
| Web | 379 testes, zero falhas | [Log](evidencias/revisao-16-web-tests.log) |
| Capture | 127 testes, zero falhas | [Log](evidencias/revisao-16-capture-tests.log) |
| Persistence | 35 testes, zero falhas | [Log](evidencias/revisao-16-persistence-tests.log) |
| Extension | 16 testes, zero falhas | [Log](evidencias/revisao-16-extension-tests.log) |
| Typechecks dos quatro pacotes | Exit 0 em todos | [Manifesto de comandos/logs](evidencias/revisao-16-checks.json) |
| Integração editorial, triagem/preço, captura, comercial e dez runners adicionais | 14 suítes SQL concluídas com exit 0, incluindo regressions/entitlement/price-evidence/rubric/opportunity/cockpit/financial/experiment/dispatch/onboarding | [Manifesto](evidencias/revisao-16-checks.json) |
| Build Next.js | Exit 0 | [Log](evidencias/revisao-16-web-build.log) |
| Probes diagnósticos | 16 contraexemplos confirmados, zero erros na execução final | [JSON](evidencias/revisao-16-contraexemplos.json), [log](evidencias/revisao-16-probes.log) |
| Metadados remotos | Projeto identificado, V2 ausente nos objetos/histórico consultados, grant de role INSERT ausente | [Registro](evidencias/revisao-16-remoto.json) |
| Integridade das fontes | Nenhuma alteração nos 501 arquivos inventariados | [Manifesto](evidencias/manifesto-revisao-16.json) |

Total dos pacotes: **557 testes**. Não somar baterias SQL, assertions e testes de pacote como se fossem uma unidade equivalente ou cobertura integral de requisitos.

O [runner de conferência](evidencias/revisao-16-executar-checks.py) executou 23 comandos existentes. O manifesto lista comando, exit code, duração e log. Usar esses registros, não a contagem narrativa do anexo.

### Preparação e interrupção

- A rodada inicial foi interrompida pelo usuário antes de concluir todos os comandos; logs parciais foram preservados como `*-antes-da-interrupcao.log`. Não foram contados como resultado final.
- Na repetição nativa, a URL fictícia destinada a build/SQL ativou dois testes web que tentam leitura de banco quando DATABASE_URL existe. Eles falharam com ECONNREFUSED. Removendo DATABASE_URL e credenciais dos testes web, os 379 passaram; a falha de preparação não foi classificada como bug de produto. [Log anterior](evidencias/revisao-16-web-tests-preparacao-url-ficticia.log).
- O primeiro ensaio do probe de cancelamento leu o retorno objeto de `cancelDispatchJob` como booleano. Corrigiu-se somente o harness para ler `.cancelled`; nenhum código funcional foi modificado. [Log de preparação](evidencias/revisao-16-probes-preparacao-cancel.log).
- A fixture concede permissões adicionais: isso é precisamente CF-14, não detalhe descartável de ambiente. O probe de contraprova restaura SELECT-only de app_user_role **somente em memória**, mantendo código e migrations locais intactos.

### O que os checks ainda não certificam

Não houve browser autenticado→action/API→SQL→resposta com Auth e Storage reais, sessões independentes/Supavisor, crash real entre commits e API, compatibilidade de deployments antigo/novo em staging, nem adapter oficial com destino autorizado. Busca de consumidores e execução de DAL são evidências distintas; tabelas/roles presentes no PGlite não certificam grants reais nem uso operacional.

Critérios gerais para nova conferência: regressões corretas para cada CF confirmado; fixture fiel; produtor/consumidor integrado por entrega; caminhos positivos e negativos com owner/operator/nonmember/revogado/suspenso; idempotência e conflito de versão; provas de recuperação e versão/hash correspondente. Concorrência, pooler, Auth/Storage e browser precisam de seu ambiente apropriado; testes omitidos devem permanecer pendentes, não virar aprovados por aproximação.

## 6. Próximo passo

Encaminhar este documento e o plano 15 ao executor para **reparos delimitados e conclusão das integrações**, confirmando o snapshot antes de editar. O relatório recebido e o checkpoint foram preservados para comparação; não se deve implementar novamente as partes corretas ou perder o progresso real.

O planejamento fundamental dos dois negócios permanece válido. As lacunas acima são predominantemente implementação, autorização, persistência e verificação; não justificam redesenhar unilateralmente estratégia, rubrica, quotas, termos ou canais.

Depois dos reparos, repetir a conferência dos CFs e a auditoria cruzada D14. D13 e gates reais continuam separados: staging/autorizações, calibração/avaliações humanas, relatório de fornecedor, direitos/capabilities/canal e condições/privacidade do piloto. **Nenhum desses gates elimina as correções locais comprovadas neste documento.**
