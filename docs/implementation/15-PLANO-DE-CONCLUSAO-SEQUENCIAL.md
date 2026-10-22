# Plano da próxima implementação — conclusão sequencial do BizuMiner V2

## Atualização operacional de16/10/2026 — OS10

A fila histórica permanece abaixo. O rollout direto33/36 foi executado com backup, versão compatível, C e retomada verificados. [Resultado10](contratos-finalizacao/resultados/10-fechamento.md). Fechamento do núcleo não conclui automaticamente entregas comerciais/externas.

| Entrega | Estado atual | Prova/ordem |
|---|---|---|
| D00 — Baseline e checkpoint | CONCLUIDO baseline/registro | OS01/02/10 |
| D01 — Conta e continuidade | CONCLUIDO no núcleo; escopo externo/dispositivo mantém limite | OS06–09; regressões locais31/OS01/12 |
| D02 — Dispositivo/revogação | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D03 — Contratos/guards | CONCLUIDO no núcleo; escopo externo/dispositivo mantém limite | OS06–09; regressões locais31/OS01/12 |
| D04 — Entitlements/quotas | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D05 — Evidência de preço | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D06 — Revisão/rubrica | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D07 — Política/radar/monitoramento | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D08 — Campanhas/materiais | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D09 — Financeiro/importação | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D10 — Experimentos | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D11 — Agenda/envio | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D12 — Onboarding/SaaS | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| D13 — Homologação de implantação | CONCLUIDO rollout direto do núcleo33/36; multicliente/Storage completos não certificados | OS01–09; staging pago não é pré-condição deste caminho |
| D14 — Auditoria/fechamento | CONCLUIDO fechamento do núcleo; Blueprint integral permanece parcial | OS10; continuidade específica OS11 |

---

## Registro anterior preservado — não representa o estado atual


Data: 14/10/2026. Skill: codex-arquiteto. **Artefato de planejamento; nenhuma funcionalidade ou migration foi aplicada nesta rodada.**

Este documento é a fila executável da próxima rodada. Complementa as treze specs e substitui a ordem operacional do [prompt 13](13-PROMPT-EXECUTOR-SEQUENCIAL.md), incorporando os defeitos e lacunas comprovados na [revisão 14](14-REVISAO-DA-EXECUCAO-SEQUENCIAL.md). Não substitui os requisitos do blueprint nem seus contratos compartilhados. O STATUS atual contém conclusões contestadas; não serve como prova de conclusão.

## 1. Resultado esperado

Concluir as correções e todas as integrações programadas, com o mesmo motor comercial atendendo permanentemente a operação própria e o SaaS. O executor deverá percorrer a fila inteira, verificar cada entrega e continuar as partes independentes quando uma capacidade estiver bloqueada por informação externa.

Ao final, o operador deve conseguir selecionar conta autorizada, capturar/revisar oferta, consultar evidência, trabalhar rubrica e radar, criar campanha e material, validar/aprovar/exportar/confirmar divulgação, registrar e conciliar resultados e consultar relatórios. Agendamento e onboarding deverão ter jornadas persistidas, proteção no backend e operação verificável em ambiente isolado. Uso de fornecedor real, ativação de E3/rubrica assistida e entrada de clientes dependem dos gates correspondentes.

**Conclusão local não equivale a homologação, ativação ou lançamento.** Se faltarem entradas externas, a resposta final deve identificar precisamente a capacidade indisponível e suas dependências. Não declarar “só faltam gates” enquanto houver código ou integração técnica disponível pendente.

## 2. Evidências e estado atual

### 2.1 Fontes e precedência

1. Pedido atual autoriza planejamento; a execução será solicitada ao agente executor com o prompt ao final deste arquivo.
2. [Blueprint V2 preservado](BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md), [contratos C-01–C-09](03-CONTRATOS-COMPARTILHADOS.md), [specs EP-00–12](README.md), [rastreabilidade](08-RASTREABILIDADE.md) e gates de [prontidão](07-PRONTIDAO-E-DECISOES.md) estabelecem resultado e invariantes.
3. Código e provas reproduzíveis determinam o que já existe. [Relatório 12](12-RELATORIO-DE-IMPLEMENTACAO-E-CONFERENCIA.md) registra os fluxos comerciais implementados; a revisão 14 descreve o estado posterior e suas falhas. Revalidar ambos contra o próximo snapshot.
4. README e `docs/estado-do-projeto.md` contêm decisões operacionais e descrições históricas. A instrução explícita do usuário e o blueprint preservam os dois negócios, mesmo onde texto antigo descreve apenas a comissão da casa. WhatsApp manual e rejeição de integrações não oficiais permanecem restrições; G-CHANNEL não autoriza reabri-las.

Snapshot inspecionado: HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, working tree com muitas alterações e arquivos não rastreados. Sem `AGENTS.md` encontrado na busca do repositório; o executor deve verificar instruções aplicáveis novamente. Não atribuir todo o diff a esta rodada, descartar arquivos ou restaurar o checkout.

### 2.2 O que aproveitar e o que reparar

| Evidência verificável | Estado / implicação |
|---|---|
| `packages/web/lib/commercial-workflow.ts`, `commerce-db.ts`; `app/admin/campanhas/{page,workspace}.tsx`, `admin/marketing/kit-actions.ts` | Campanha, revisão, validação, aprovação, exportação e confirmação manual já possuem serviço e interface. Integrar e preservar; não recriar tudo. Oportunidades manuais ainda não substituem o radar contextual. |
| `commercial-financial-db.ts`; `app/admin/financeiro/{page,workspace}.tsx`, `actions.ts` | Registro manual, ledger/custos e receita SaaS possuem consumidores. Importação e relatórios completos continuam pendentes. |
| `tenant-db.ts`, `api-auth.ts`, layout/admin, `affiliate-db.ts`, `editorial-selection-db.ts`, `capture-batch-db.ts` | RV-01: autorização na fronteira incompleta, contexto incompleto ou ausente. Owner tem escrita legítima recusada; mesa editorial fica vazia; lote vencido não encerra; leitura privada da casa não exige membership no serviço legado ensaiado. Alcance HTTP precisa de teste integrado. |
| M-10A1 `authenticate_extension_device`; `extension-db.ts::persistExtensionCapture` | RV-02: revogar membership não revoga a decisão do bootstrap/revalidação. Não foi comprovado incidente em produção. |
| `rubric-db.ts`, `opportunity-contract.ts`, `experiment-contract.ts`, `dispatch-db.ts`, `saas-onboarding-contract.ts` | RV-03: há contratos/DAL/helpers, mas faltam consumidores e jornadas descritas como completas. |
| `commission-import-contract.ts` | RV-04: parser aceita números truncados, estados inexistentes e defaults que inventam confirmação; digest tem representação ambígua; não há commit operacional. |
| `dispatch-contract.ts`, `saas-onboarding-contract.ts` | RV-05: datas inválidas passam; entitlement vencido passa; limites 5/10 são assumidos sem aprovação comercial. |
| `auth-contract.ts::APP_ROLES`, migration `20260929015526_affiliate_access_role.sql` | Role persistida atual é somente `afiliado`, com concessão administrativa. Ainda não existe capability de plataforma para provisionamento SaaS. Implementar uma fronteira específica, sem promover todo owner a administrador. |
| `marketing-store.ts` | Storage atual usa objeto privado por owner e service_role no servidor; seu lock envolve I/O externo. É referência histórica, não autorização de conta nem modelo a copiar para importação/arte comercial. |
| STATUS e inventário real das migrations | RV-06: cinco nomes inexistentes; comissão usa `received/reversed`, e não `settled/refunded`. |
| Evidências da revisão 14 | RV-07: 378 testes web, 35 persistence, 31 cenários SQL, typechecks web/persistence e build passaram nesse snapshot. Não provam as jornadas ausentes, sessões concorrentes, Auth, Storage ou browser. Capture/extension e demais SQL não foram repetidos naquela revisão. |

As reproduções históricas estão em `evidencias/revisao-14-contraexemplos.json` e `revisao-14-probes.mts`. **Exit 0 desse harness confirma os defeitos antigos; não é aceite de correção.** Criar regressões que esperem o comportamento correto, falhem antes do reparo e passem depois. Preservar a evidência histórica.

### 2.3 Inventário real das migrations V2

Diretório existente: `packages/persistence/supabase/migrations/`. A tabela abaixo usa nomes reais; não criar arquivos para corresponder aos nomes errados do STATUS.

| Ordem local | Contrato | Arquivo |
|---|---|---|
| 1 | M-10A1 | `20261014100000_garimpa_account_context_and_membership.sql` |
| 2 | M-10A2 | `20261014101000_garimpa_tenant_rls_scoped.sql` |
| 3 | M-01 | `20261014102000_garimpa_price_evidence_canonical.sql` |
| 4 | M-02 | `20261014103000_garimpa_rubric_assessment_shadow.sql` |
| 5 | M-03 | `20261014104000_garimpa_audience_policy_and_opportunity.sql` |
| 6 | M-04 | `20261014105000_garimpa_commerce_and_campaign_link.sql` |
| 7 | M-08 | `20261014106000_garimpa_commercial_financial_ledger.sql` |
| 8 | M-07 | `20261014107000_garimpa_click_attribution_and_channels.sql` |
| 9 | M-09 | `20261014108000_garimpa_policy_experiments.sql` |
| 10 | M-11 | `20261014109000_garimpa_dispatch_jobs_outbox.sql` |
| 11 | M-12 | `20261014110000_garimpa_saas_onboarding_entitlements.sql` |

As onze foram ensaiadas no runner comercial isolado. Este planejamento não consultou o banco remoto atual. Histórico remoto anterior não certifica o estado de hoje. Arquivo já aplicado em qualquer alvo compartilhado exige evolução aditiva; revisão de arquivo local não aplicado exige confirmar histórico, renovar hashes e repetir a cadeia completa. Não aplicar indistintamente todas as pendências do diretório.

## 3. Escopo

**Incluído na próxima execução:** correções RV-01–07, consumidores reais, serviços, telas/actions, workers locais, migrations complementares necessárias, testes, preparação de recuperação, atualização fiel de status e auditoria integral dos treze épicos. Revisar o que já funciona antes de ampliar.

**Fora de escopo automático:** produção, DDL/backfill remoto não autorizado, cobrança/gateway novo, convite ou mensagens reais, novas lojas sem credenciais/capabilities, labels humanas inventadas, limiares comerciais arbitrários, merge destrutivo de catálogo, outro provedor de IA ou integração não oficial. O plano não ordena executar CLIs de captura ao vivo para obter baseline.

**Premissas:** Node e dependências locais existentes; SQL puro/postgres.js; Next App Router e CSS do projeto; reutilização dos runners atuais. Novos caminhos mencionados abaixo são explicitamente propostos. A compatibilidade deverá ser reconfirmada, sem redesenhar fundamentos já decididos.

### 3.1 Entradas externas e alcance dos bloqueios

| Gate | Entrada objetiva | Bloqueia | Trabalho que continua |
|---|---|---|---|
| G-ENV | Staging isolado identificado, autorização de escrita, runtime/pooler, Auth/Storage de teste e recuperação | D13 e prova remota; nenhum efeito em produção | D00–D12, migrations/ensaios locais e preparação de D13 |
| G-PRICE / OPEN-03 | EXP-02, parâmetros de cobertura/janela/gaps/frescor e ratificação editorial | Ativar claims E3 com política nova | Evidência canônica, UI conservadora, coleta e comparação/calibração |
| G-RUBRIC / OPEN-01,02 | 30–50 avaliações humanas e rubrica/política ratificadas | Promoção para assistido/decisão automática nova | Formulário, persistência, sombra, radar manual e comparação |
| G-FIN / OPEN-05 | Relatório sanitizado da primeira venda, identificação do programa e semântica de IDs/estados | Parser específico e documentação da venda real | Registro manual e importação canônica interna, preview/commit/ajustes |
| G-RIGHTS / OPEN-08 | Proveniência/licença/escopo do asset | Arte comercial que depende daquela imagem | Copy factual e arte com asset próprio autorizado |
| G-PROGRAM / OPEN-09 | Programa/credencial/canal permitidos; documentação oficial das capabilities | Monetização/adapters e subIDs ainda não comprovados | Links e programas já validados, atribuição interna e configuração pendente |
| G-CHANNEL / OPEN-04,06 | Canal oficial selecionado, destino de teste e permissão de envio | Adapter real e teste de envio; ativação de automação | Core outbox, painel, cancelamento, simulação isolada e reconciliação |
| G-EXPERIMENT | Hipótese, coorte, janela, métrica, amostra mínima e critérios aprovados antes da medição | Promoção/prova causal sem método | Relatórios descritivos, draft e comparação em sombra |
| G-PILOT / OPEN-07 | Termos, preço, duração, quotas, escopo e suporte aprovados | Ativação/convidados externos e cobrança | Motor de entitlement, configuração draft, onboarding fictício isolado |
| G-PRIVACY | Política de dados, compartilhamento, retenção e saída aprovada | Lançamento, compartilhamento e descarte dependentes de política | Export privado mínimo, isolamento, suspensão e preservação dos dados |
| G-SEC | Matriz da versão candidata sem brecha conhecida, incluindo Auth/Storage/concorrência | Entrada externa e ativação piloto | Construção isolada e testes progressivos |

Consultar decisões/respostas existentes antes de perguntar. Pedir as entradas ausentes de forma consolidada no começo da execução e continuar o trabalho independente. Silêncio não é aprovação. Ao resolver um gate, voltar à capacidade condicionada na sua ordem de dependências; não reiniciar os épicos nem abandonar a fila restante.

## 4. Decisões e contratos

### 4.1 Contratos preservados

- **C-01, existente:** servidor valida identidade, role e membership não revogada. Seleção de conta enviada pelo cliente não concede acesso. `withAccountDb` revalida no comando; transação e contexto são inseparáveis. Comprador usa identidade própria; worker/dispositivo usa escopo verificado no servidor. Role de plataforma é distinta de membership owner/operator.
- **C-02, existente:** identidade/configuração/quantidade/moeda/condições e proveniência determinam comparabilidade. Ausente não equivale a zero, igual ou indisponível. TS e SQL usam o mesmo resultado sem afirmar E3 antes do gate. Preço válido não exige um piso comercial universal.
- **C-03, existente:** rubrica e política têm versão, digest, razões e desconhecidos; IA shadow não muda aprovação legada. Oportunidade contextual é diferente de elegibilidade do catálogo. Ordenação: elegibilidade/integridade, prioridade humana aprovada, classe, aderência ao público, confiança, frescor e desempate por ID, conforme contrato compartilhado. Não inventar pesos/thresholds. Classes especiais dependem de política aprovada; sem ela manter decisão manual/unclassified ou sombra.
- **C-04/05, existentes:** kit/revisão/aprovação/exportação/postagem são estados separados. Editar exige nova revisão; validar/aprovar/exportar reconsulta fatos. Material exportado e postagem confirmada preservam a revisão e os fatos históricos. Copiar ou criar publicação web não confirma envio social.
- **C-06, existente:** preserve slugs/códigos antigos e atribuição `c` no percurso público. Publicação resolve dono; client/customer não recebe segredo da casa. Analytics indisponível não remove monetização válida; ownership/link inválido não permite redirect indevido. SubID externo depende de capability comprovada.
- **C-07, existente:** estados de conversão `reported/pending/confirmed/cancelled/refunded`; comissão `estimated/pending/confirmed/reversed/received`; receita SaaS `billed/received/reversed`. Ledger imutável por obrigação/moeda/predecessor, sem somar a mesma comissão em todos os estados. Receita da plataforma pertence à conta operadora; cliente não a lê. Valor/custo/atribuição desconhecidos permanecem desconhecidos.
- **C-08/09, existentes:** comando idempotente compara chave e conteúdo; conflito de versão observável; evento e alteração de estado atômicos. Experimento não promove sem revisão/método/amostra. Job incerto não repete sozinho. Entitlement e quotas são verificados pelo backend, nunca por contagem informada no browser.

### 4.2 Complementos técnicos necessários, fundamentados nos contratos

Estas decisões fecham lacunas do código atual; não aprovam parâmetros de negócio.

| Decisão proposta | Regra a implementar | Evidência / motivo |
|---|---|---|
| Contexto nas fronteiras legadas | Propagar AccountContext resolvido no servidor nos serviços privados. Remover defaults `local` de entradas humanas privadas; contextos trusted de CLI exigem seleção/escopo explícitos. Sem begin válido, wrapper falha em vez de simular transação. | RV-01; resolveAuthorizedAccount e withAccountDb já existem. Não setar owner constante para contornar RLS. |
| Validade temporal | Datas obrigatórias inválidas rejeitadas; início futuro/período encerrado nega operação. `endsAt=null` só significa sem término quando permitido pelo contrato explícito; não confundir null legítimo com texto inválido. Instante corrente do servidor, intervalos [início,fim), armazenamento UTC. Janela/fuso comercial vêm da configuração versionada. | RV-05; guards aceitam datas inválidas/ignoram período. |
| Entitlement e reserva de uso | Serviço comum bloqueia/cria consumo dentro da transação do comando, com lock da política/conta, idempotência e compensação auditável. Campanhas ativas usam estado atual; kits/dia usam eventos de criação na janela definida; dispatch usa reserva e política do destino. Não contar replay como novo uso. | EP-12/C-08, RV-03/05; funções atuais não impõem quotas. |
| Compatibilidade da casa com quotas | Usar política própria explícita, sem condição `tenant=local` que bypassa o motor. Ensaio isolado recebe política de teste identificada. Preparar configuração de operação própria que preserve capacidades existentes; sua aprovação e ativação antecedem rollout do enforcement. Não ativar limites 5/10 ou interromper produção por ausência de backfill/termos. | Estratégia dual, preservação da operação, quotas comerciais ainda abertas. |
| Importação interna estrita | CSV canônico com cabeçalho exato versionado e parsing de aspas/linhas válido; inteiros seguros em centavos, moeda/programa/estados explícitos, timestamps inequívocos. Montantes não negativos; estorno usa state/predecessor e magnitude positiva conforme ledger, não um número negativo silencioso. Order value pode ser null explícito. | RV-04; contrato interno existente não demonstra formato de fornecedor. |
| Identidade de importação | Serialização estrutural versionada e sem ambiguidade para digest. Unicidade do fato por conta/programa/chave do fornecedor/tipo/revisão; hash do arquivo é proveniência, não deduplicação financeira suficiente. Sem identidade demonstrável, revisão humana obrigatória. Totais separados por moeda. | IDs com ':' colidem na representação; reordenação/ajuste/concorrência previstos em EP-08B. |
| Commit do lote | Preview é persistido e imutável para o commit, com versão/digest. Confirmar lote uma vez, transacionar fatos/eventos/decisões de linhas. Linhas rejeitadas/review_required não entram no ledger; UI lista explicitamente as linhas válidas selecionadas e excluídas. Mesmo request/lote não duplica; lote diferente com mesmas linhas também não. | import_batch/import_row existem, sem consumidor ou identidade global de fatos. |
| Tentativa de dispatch | Persistir início do possível I/O e resultado/prova por tentativa; lease vencido com I/O iniciado/indeterminado vira unknown. Recuperação automática somente antes de I/O ou após rejeição definitiva comprovada. Idempotência do provedor só é usada quando oficial e verificada. | leaseNextEligibleJob hoje retoma qualquer leased vencido; risco de envio duplicado em crash. |
| Cancelamento e kill switch | Cancelamento garantido antes do marcador de início do I/O. Depois de possível envio, registrar pedido de cancelamento/reconciliação sem afirmar ausência de envio. Revalidar token, conta, revisão, link, destino, segredo e reserva imediatamente antes de I/O; chamada fora da transação. | C-08; cancelDispatchJob atual cancela leased sem distinguir transporte iniciado. |
| Convites/provisionamento | Convite com token aleatório guardado como hash, tenant/papel/receptor/validade, uso único atômico. Aceitação autenticada verifica receptor e não confia no tenant fornecido. Provisionar conta/membership/plano/progresso com comando idempotente privilegiado já autorizado; owner pode convidar operator, não promover a role de plataforma. | EP-12; apenas AccountInvitation puro existe, sem storage/serviço. |
| Capability administrativa da plataforma | Proposta técnica: role persistida `platform_admin`, separada de `afiliado` e de membership owner/operator. Concessão/revogação continua administrativa; não há endpoint de autoconcessão nem backfill automático de todos os owners. Leitura mínima/validação no servidor; provisioning usa rotina interna limitada e auditada quando o CRUD comum não pode operar antes de existir membership. Não conceder acesso SQL administrativo geral ao runtime. Identidade real habilitada exige decisão explícita; fixture de teste é identificada. | C-01 exige caminho separado; APP_ROLES e enum atuais só incluem afiliado. É extensão de autorização necessária ao SaaS, não nova política comercial. |
| Arquivos comerciais privados | Objeto identificado por tenant/artifact/revisão, com ownership conferido no serviço a partir do contexto; nome/path enviado pelo cliente não autoriza acesso. Para importação/exports sensíveis, download por handler autenticado que revalida conta/membership, sem URL pública ou signed URL duradoura. Credencial Storage privilegiada só no backend mínimo e nunca como prova de RLS. I/O de Storage fora de transação SQL. | C-01/C-04/EP-08B, RV-03; marketing-store pessoal não implementa esse contrato. Arquivo já baixado não pode ser revogado retroativamente. |
| Assignment e promoção | Persistir associação única experimento/unidade/coorte/fatos e outputs pareados congelados. Promover exige estado reviewed, autorização humana e amostra calculada no servidor; criar versão e referência de reversão. Default SQL min_sample=30 não é aprovação de método. | EP-09/C-08; policy_experiment não contém assignments nem comprova critérios aprovados. |

Para esses complementos, seguir o workflow de schema já usado e as skills Supabase/Postgres. Não adicionar SECURITY DEFINER para resolver erro de permissão de CRUD. Bootstrap existente precisa grants mínimos, search_path fixo e escopo verificável. RLS, grants, views, FKs entre conta/tenant, autoria e indexes fazem parte do aceite do novo schema. Referências oficiais consultadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [observabilidade](https://supabase.com/docs/guides/observability), [changelog](https://supabase.com/changelog). Reconfirmar documentação/versões antes de integrar APIs reais.

### 4.3 Fronteiras mínimas das integrações propostas

Usar os tipos existentes de C-01–C-09; os nomes abaixo identificam operações a entregar, não funções já presentes. Server Actions são o padrão inicial; API separada somente para consumidor que a exija.

| Operação proposta | Entrada do cliente | Dados/decisão exclusivamente do servidor | Saída observável |
|---|---|---|---|
| Entitlement/uso | operação, resourceId quando aplicável, requestId | contexto, plano aprovado, período, janela, uso atual, lock/reserva | resultado ou bloqueio de plano/quota; replay recupera o mesmo resultado |
| Avaliação/comparação | produto, política selecionada, revisão esperada, labels humanas e requestId | fatos/digest, role/autoria; output IA validado e persistido | assessment/review com versão e desacordos consultáveis |
| Oportunidade | produto/política/público/canal, transição/motivo, versão esperada/requestId | eligibility, evidência, classe candidata/ratificada, histórico social | oportunidade/revisão/evento; conflito ou pendência explicado |
| Importação | arquivo ou batchId, versão/digest esperado, linhas selecionadas, requestId | objeto privado, parser, preview persistido, identidade/duplicata/fatos do ledger | lote/decisões/totais por moeda; nunca preview financeiro autorizado pelo browser |
| Experimento | draft de método e versões; decisão humana/motivo, expectedVersion/requestId | autorização, outputs/assignments, amostra/coorte/gates calculados | status/relatório/versão promovida ou recusa fundamentada |
| Dispatch | publicationId, revisionId, destinationId, instante, requestId; cancel/reconcile com evidência | autorização, fatos frescos, credenciais, quota/cooldown, lease/token/prova | job/status/tentativa; resultado incerto explícito |
| Onboarding | token e sessão autenticada para aceitar; progresso solicitado e requestId | hash/receptor/role/período, direito de provisionar, termos/plano e evidência da etapa | conta/membership/progresso próprio, ou recusa; nunca role/limite autoatribuído |

Todas as mutações têm revalidação e idempotência do serviço, evento atômico e conflito de versão quando há revisão concorrente. Erros/payloads respeitam C-09 e não revelam existência de recurso privado de outra conta. Owner configura política operacional dentro do envelope de seu plano; não altera os termos/limites contratados da plataforma.

## 5. Plano executável

### 5.1 Fila e critérios de entrada/saída

**PRONTA:** trabalho especificado e executável localmente após preflight. **CONDICIONAL:** núcleo local executável, mas parte da entrega depende de gate. **BLOQUEADA:** resultado remoto/externo sem pré-condições comprovadas. É prontidão da entrega, não estado de execução. Todas as etapas abaixo devem iniciar PENDENTES até revalidação.

| Ordem | Entrega | Specs / achados | Entrada | Saída obrigatória | Prontidão |
|---|---|---|---|---|---|
| D00 | Reconciliar baseline e checkpoint | EP-00; RV-06/07 | Repositório/instruções acessíveis | Inventário e status fiel, provas e fila completa | PRONTA |
| D01 | Autorizar legado e preservar jornadas | EP-10A; RV-01 | D00 | Entradas/consumidores privados contextualizados; acessos legítimos e negativos | PRONTA |
| D02 | Corrigir extensão e revogação | EP-10A; RV-02 | D01 | Dispositivo legítimo captura; revogado não autentica/persiste | PRONTA |
| D03 | Corrigir parser e guards | EP-08B/11/12; RV-04/05 | D00–D02 | Todos os contraexemplos rejeitados; contratos estritos testados | PRONTA |
| D04 | Entitlement/quotas no serviço comum | EP-12-base/10; RV-03/05 | D01–D03 | Reserva/consumo transacionais ligados aos comandos atuais; política explicitada | CONDICIONAL |
| D05 | Evidência de preço em todo o fluxo | EP-01/05C | D01–D04 | Produtores/consumidores coerentes; calibração preparada | CONDICIONAL |
| D06 | Revisão humana e IA em sombra | EP-02; RV-03 | D05 | Formulário→assessment→comparação→consulta reais | CONDICIONAL |
| D07 | Política, oportunidade e radar | EP-03; RV-03 | D05/D06 | Radar persistido, transições e fila de monitoramento | CONDICIONAL |
| D08 | Cockpit, materiais e divulgação assistida | EP-04/05/06/07 | D04–D07 | Jornada completa com revisão, arte permitida, atribuição e confirmação | CONDICIONAL |
| D09 | Financeiro e importação operacional | EP-08 A/B/C; RV-03/04 | D03/D04/D08 | Upload privado→preview→commit→ledger→resultados; manual preservado | CONDICIONAL |
| D10 | Relatórios e experimentos | EP-09; RV-03 | D06–D09 | Coortes/assignment/revisão/promover ou bloquear/rollback reais | CONDICIONAL |
| D11 | Agendamento, worker e reconciliação | EP-11; RV-03/05 | D04/D08; leituras D09/10 quando cabíveis | Core conectado; enviar só com canal/destino autorizados | CONDICIONAL |
| D12 | Onboarding e saída SaaS | EP-12; RV-03/05 | D01–D11; auditoria incremental da base | Convite→conta→primeira campanha→suspensão/export privado isolados | CONDICIONAL |
| D13 | Aplicação/homologação staging | EP-00/10B transversal | D00–D12, G-ENV | Versão exata, schema, Auth/Storage/pooler e browser comprovados | BLOQUEADA |
| D14 | Auditoria integral e fechamento | EP-00–12; RV-06/07 | Todos os núcleos locais; D13 para certificação remota | Cobertura total, status verdadeiro e impedimentos nominados | CONDICIONAL |

D04 antecipa infraestrutura de EP-12 sem antecipar convite externo; D12 integra sua jornada. D09 precede D10 para que relatórios consumam também resultados importados. D13 pode ser preparado cedo, mas sua aprovação final refere-se ao código completo; qualquer superfície posterior requer repetir os testes afetados. Nenhuma etapa muda a ordem de dependência das migrations sem revisão explícita.

### D00 — Preflight, rastreabilidade e base de regressões

**Objetivo/resultado:** executor sabe o que existe, o que falta e onde retomar; deixa de usar conclusão narrativa como baseline.

**Arquivos/áreas existentes:** docs 01–14, specs, STATUS, package.json dos pacotes; `tools/editorial-tests/{commercial-fixture,commercial-flow.test}.ts`; migrations e manifestos. **Dependência:** acesso local; nenhuma escrita remota.

**Implementação:** inventariar entradas/serviços/consumidores, distinguir negócio/público/comprador/worker; preservar mudanças preexistentes. Completar fixture com baseline real (inclusive UNIQUE affiliate_id/marketplace e grant da view encontrados pela revisão 14), roles/triggers/projections sem bypass. Criar regressões RV-01–05 nos runners atuais e registrar falha inicial esperada. Atualizar STATUS com estados verdadeiros e nomes financeiros/migrations reais; preservar a cópia histórica.

**Aceite:** inventário de cada callsite privado com contexto/role/destino; sete achados ligados a entregas; todas as treze specs no checklist; fixture não contém permissões artificiais; cada regressão diferencia caso válido/inválido. **Verificação:** scripts da seção 6 e comparação de inventário/nomes. Não alterar produto para “fazer baseline passar”.

**Recuperação/restrição:** nenhuma migration remota, cleanup/reset ou segredo em log. Arquivos de evidência antigos imutáveis.

### D01 — Conta autorizada em todas as fronteiras privadas

**Resultado funcional:** casa e afiliados legítimos operam; não membro não lê/grava a casa por role global ou default tenant.

**Áreas:** `api-auth.ts`, `auth.ts`, `account-context.ts`, `tenant-db.ts`, `app/admin/{layout,page}.tsx`, actions/APIs privadas; `admin-db`, `curation-db`, `affiliate-db`, `editorial-selection-db`, `member-db`, `browser-capture-db`, `capture-batch-db`; PgStore e CLIs/triagem/monitoramento. Busca cobre demais consumidores; lista não limita a correção. **Dependência:** D00.

**Implementação:** usar resolução autorizada nas entradas, propagar contexto na mesma transação, revalidar membership/role/conta no comando. Retirar default house de serviços humanos; separar operações de plataforma da conta selecionada. Unificar o tipo AccountContext duplicado por referência ao contrato canônico, sem alterar seu significado. Comprador autenticado mantém dados próprios e merge anônimo; worker não recebe autoridade do payload do cliente. Resolver bootstrap explicitamente, sem policy ampla ou conexão administrativa de rotina. Wrappers exigem begin real.

**Aceite:** owner grava configuração; operator não ganha gestão de segredo/papel; não membro com role afiliado não consulta casa; mesa editorial mostra oferta autorizada; lote vencido encerra; captura/triagem/monitoramento legítimos funcionam; A/B/casa e mesma pessoa em duas memberships não misturam dados. Fora da transação e sem contexto privado nega; public runtime continua com projeção mínima. **Verificação:** regressões reais RV-01, SQL editorial/captura/comercial e testes web/persistence; teste integrado da entrada HTTP/layout em D13. Teste de serviço não certifica HTTP.

**Banco/recuperação:** corrigir policies/bootstraps somente se contexto/grants reais exigirem, registrando alteração aditiva quando aplicada. Não ativar M-10A2 remotamente antes de adaptação e homologação. Restaurar versão de aplicação compatível/impedir novas escritas diante de erro; nunca recuperar abrindo `using(true)`.

### D02 — Dispositivo, pareamento e revogação

**Resultado funcional:** extensão captura na conta autorizada e perde acesso no próximo comando após revogação de vínculo/dispositivo/role ou suspensão.

**Áreas:** `extension-db.ts`, `extension-admin.ts`, APIs extension/capture-batches, pacote extension; M-10A1. **Dependência:** D01.

**Implementação:** exigir membership não revogada no bootstrap e revalidação; auditar pareamento/leitura do token/persistência e autoria. Trazer contexto correto para captura legítima; não apenas fazer negativa passar porque toda gravação falha. Token hash/segredo não chega à UI/log de outra conta.

**Aceite/verificação:** capturar e observar produto/lote da conta; revogar apenas membership e repetir autenticação/persistência, ambas recusadas; testar isoladamente suspensão, role e dispositivo; token de A não captura em B; repetir suites extension/capture/capture-batch e SQL da função de autenticação como runtime. Browser/extensão real fica para D13.

**Banco/recuperação:** ajustar função existente localmente apenas se comprovadamente não aplicada; caso contrário migration substitutiva com grants/search_path preservados. Reverter código compatível ou revogar dispositivo sem apagar observações. Não relaxar RLS para bootstrap.

### D03 — Contratos estritos antes de integrar

**Resultado funcional:** importação, convite e envio não aceitam a mesma entrada inválida que passou na revisão 14.

**Áreas:** `commission-import-contract.ts`, `dispatch-contract.ts`, `saas-onboarding-contract.ts`, respectivos testes. **Dependência:** D00–D02; sem fornecedor/canal necessário para reparar núcleo.

**Implementação:** aplicar decisões da seção 4.2: CSV interno explícito, números/estados/datas/moedas estritos, totais por moeda, serialização não ambígua, prazos/período e limites sem defaults comerciais. Exibir erros por linha sem conteúdo sensível em logs. Convite sem receptor verificado ainda não é autorização; guard puro não substitui D12. Validar inputs desconhecidos também na fronteira, não apenas via TypeScript.

**Aceite:** rejeitar `100x`, `12abc`, comissão negativa, estados inexistentes, linha de cinco campos sem estados/moeda, data inválida de convite/job, plano antes do início/encerrado e limites obrigatórios ausentes. Digests distintos para os dois pares de IDs com ':'; mesmo conjunto reordenado preserva digest; CSV quoted e erros de formato são tratados; campos null permitidos permanecem null. **Verificação:** regressões positivas/negativas no runner web, inclusive limites de inteiros seguros/Unicode/CRLF/BOM se aceitos pelo formato documentado. Não alegar suporte a CSV de fornecedor desconhecido.

**Recuperação:** nenhuma escrita de fatos neste passo; versão do parser preservada no futuro lote. Consumidores quebrados por ajuste de assinatura devem ser corrigidos na mesma fatia, não silenciados com casts.

### D04 — Motor de entitlement e consumo atômico

**Resultado funcional:** commands atuais de campanha/kit respeitam configuração explícita; replay não consome outra quota; conta suspensa/expirada não cria novos recursos.

**Existentes:** M-12 e contratos SaaS, `commercial-workflow.ts::createCampaignForAccount/createKitForAccount`, conta/membership e usage_event. **Propostos:** serviço/DAL comum de entitlement e reserva de uso, gestão privada de configuração versionada, migrations de vínculos/consistência. **Dependência:** D01–D03.

**Implementação:** validar plano/período/termos/limites server-side e calcular uso a partir dos fatos persistidos. Serializar reserva e criação por conta/política/operação dentro da transação, com chave/conteúdo e rollback; garantir uma configuração aplicável por operação/instante ou negar ambiguidade. Proteger alteração do plano por papel autorizado; owner cliente não altera termos/limites da plataforma. Ligar agora campanha/kit; ligar dispatch em D11 e marketplace/onboarding em D12. Registrar perda/cancelamento/liberação de reserva conforme unidade definida, sem apagar histórico. Sem plano/configuração aprovada, a nova capacidade dependente nega com motivo.

**Aceite/verificação:** duas criações concorrentes disputando última vaga resultam em uma criação e um bloqueio; replay retorna resultado anterior sem consumo; falha do command desfaz reserva; cliente adultera contagem/limite e não muda decisão; mudança de período/fuso, suspensão e expiração testadas; casa usa o serviço comum com política explícita no ensaio. SQL serializado prova persistência/rollback; concorrência exige sessões independentes em D13 ou Postgres local isolado comprovado.

**Banco/recuperação:** M-12 já possui usage_event/entitlement/progresso; adicionar apenas elementos necessários para approval/versionamento, reserva/unicidade e ownership composto, sem duplicar motor. Configuração da casa e backfill precisam aprovação antes de ativar enforcement no ambiente existente. Não implantar mudança que interrompa a operação por falta de política. Reversão suspende novas capacidades, preserva uso/fatos e versão de configuração.

### D05 — Evidência canônica, captura e vitrine

**Resultado funcional:** mesma oferta mostra evidência coerente na vitrine, triagem, radar e kit; fonte incompleta permanece conservadora.

**Áreas:** `price-evidence.ts`, offer-history/deal/public-offer readers, `commercial-workflow.ts`, kit-validator, view SQL M-01; capture types/adapters/extensão/browser; persistence ingest/PgStore/verify-marketplace-evidence e UI de histórico. **Dependência:** D01–D04; G-PRICE só condiciona ativação E3.

**Implementação:** completar produção de proveniência/configuração/condições nas fontes habilitadas; substituir leituras heurísticas incompatíveis pela projeção canônica. Não preencher dado desconhecido com título inferido. Exibir fonte/data/janela/gaps/cobertura de forma útil, mobile/teclado. Preparar interface/persistência da calibração EXP-02 e versão aprovada de política; não aplicar thresholds de teste à operação real.

**Aceite/verificação:** igualdade TS/SQL para moeda, variante, seller, quantidade, frete/cupom/forma de pagamento, faixa, datas futuras/vencidas, lacunas e falta de observações. Sem configuração comprovada não sobe E2/E3 indevidamente. Mudança material invalida revisão/digest. Repetir testes preço/triagem/comercial e T06–08/T18; preservar href/preço/data/slugs e histórico. Calibração real exige responsável e amostra, registrada como gate se ausente.

**Banco/recuperação:** schema aditivo para dados comprovados, sem backfill inferindo comparabilidade antiga. Reversão desativa claim/política nova mantendo fatos e redirects; não retorna ao selo sem guarda.

### D06 — Rubrica, revisão humana e sombra conectadas

**Resultado funcional:** curador salva avaliação, acompanha desacordo humano/legado/IA e consulta fonte/digest/versão; falha de IA deixa operação válida.

**Existentes:** rubric-contract/db, `evaluateRubricShadowItem`, editorial-selection, spot-check/bússola/curadoria e M-02. **Propostos:** orquestração e actions de rubrica/comparação, consultas/painel de amostra. **Dependência:** D05.

**Implementação:** ligar formulário às gravações/leituras reais e chamar análise shadow na jornada apropriada, sem bloquear avaliação humana. Congelar input/output/modelo/prompt/versão; persistir comparação e revisão. Uso/custo do modelo só quando observado. Oferecer fila/export privado de amostra 30–50, sem fabricar labels. Gate de promoção visível; role/autor resolvidos no servidor.

**Aceite/verificação:** salvar→reabrir preserva avaliação e reasons/unknowns; consumo operacional de saveAnalysisAssessment/saveComparisonReview demonstrado; replay/digest desatualizado e conflito tratados; inputs maliciosos não viram instrução; timeout/provider failure não altera aprovado legado. T01/T02/T04–06, SQL com owner/operator/não membro e testes IA mockados identificados. Com amostra real aprovada, ratificar versão; sem ela manter shadow.

**Banco/recuperação:** completar vínculos/constraints de assessments se necessário; não transformar score antigo em labels Q/V/O/A. Reverter modo/versão, preservando comparações e histórico.

### D07 — Política de audiência, oportunidades e radar persistidos

**Resultado funcional:** curador escolhe público/canal, enxerga classe/motivos/desconhecidos e muda prioridade/monitoramento; fila real respeita contexto.

**Áreas:** opportunity-contract, M-03, triage-value-policy/curation-pipeline, editorial-selection/curation DB, monitoring-policy/candidates/affiliate-monitoring/bin; **propostos:** opportunity service/DAL/actions e radar na UI existente. **Dependência:** D05/D06.

**Implementação:** CRUD/versionamento de política e oportunidade com ownership, revisão esperada e eventos. Ligar classify/rank a consumidor real; impedir duplicata ativa e preservar histórico de arquivamento/reativação. Adaptar createKitForAccount para usar oportunidade escolhida e não regenerar manual paralela; guardar compatibilidade do rascunho manual existente. Piso/blacklist temáticos entram na política v2; legado só muda mediante promoção/canary aprovada. Priorizar monitoramento com budget e razões, reservando candidatos sem histórico; ML sem fonte confiável mostra coleta humana. Cooldown usa publicação social confirmada, não export/click/publication web.

**Aceite/verificação:** caro maker/generalista, barato útil, preço estável e marca desconhecida não recebem veto universal; pending policy não cria classificação homologada; prioridade humana motivada persiste; A/B separados; replay não duplica; conflito não perde decisão. Publicação recente limita público/canal correspondente, outro contexto permanece elegível; candidato não sofre starvation. Testes web/persistence, SQL, T01–03/T09 e fila reproduzível. Não disparar cron/captura remota para “ver se funciona”.

**Banco/recuperação:** M-03 existente; adicionar referência de predecessor/versão/vínculos somente quando necessária para C-03. Reverter ponteiro de política, manter eventos/observações; jamais reprocessar decisões humanas em massa.

### D08 — Cockpit, materiais, campanha e divulgação assistida

**Resultado funcional:** Pauta/Radar/Resultados conduz até material aprovado e divulgação manual confirmada, com arquivos e links da conta correta.

**Áreas:** admin page/today-command-center/cockpit-view-model; curadoria/direcionamento/campanhas/marketing, commercial-workflow/commerce/kit-validator/messages; QR/story/OG/assets; public routes `/p`, `/bizu`, `/go`. Reusar financeiro D09/metrics D10 posteriormente. **Dependência:** D04–D07.

**Implementação:** conectar ações reais do cockpit aos serviços, sem telas paralelas com estados conflitantes. Criar/corrigir geração factual e preview por canal, incluindo Story/legenda/WhatsApp/Telegram assistidos; arte só de asset com direito documentado. Edição cria revisão, validation/approval referenciam digest atual, export revalida fatos. Persistir direitos/proveniência e assets privados por conta/revisão, entrega autorizada. Reservar publicação/link por destino; histórico confirmado nunca é retargetado. UX deve mostrar indisponível/motivo e próxima ação, sem mínimo artificial de pauta.

**Aceite/verificação:** usuário percorre oportunidade→campanha→kit→validar→aprovar→exportar→confirmar e vê histórico; duas abas produzem conflito; preço/condição/variante alterados bloqueiam uso como pronto; imagem sem direito bloqueia apenas arte correspondente, copy autorizada segue. Download falho/cópia cancelada não marca exportado; aprovação não confirma postagem. `c` atravessa CTA/sticky/banner/QR/share; slug/código trocado falha; monetiza dono correto; preview/HEAD não viram tráfego humano; URL antiga continua. Testes web/SQL, T10–14/T18, arte renderizada e inspeção mobile/teclado; browser integrado em D13.

S-KIT inclui render PNG em 1080×1920/mobile com preço, disclosure, recorte, acentos e contraste; o download entrega a revisão congelada, sem recalcular preço silenciosamente. Preparar EXP-03 para medir cinco kits comparáveis com tempos observados; EXP-04 em dois canais fica condicionado a destinos/publicações autorizados, sem publicar por este plano.

**Banco/recuperação:** aproveitar M-04/M-07, armazenamento e revisões existentes; adicionar registro de direitos/artifact apenas se inexistente. Download/export falhado é recuperável; desativar template/material defeituoso e preservar revisões/link/histórico. Não abrir arquivo privado por URL previsível.

### D09 — Ledger, custos e importação com jornada completa

**Resultado funcional:** manual continua funcionando; usuário envia arquivo interno, revê erros/duplicatas, confirma linhas e vê conciliação por moeda/obrigação.

**Áreas:** financeiro actions/workspace, commercial-financial-contract/db, commission-import-contract, M-08; marketing storage-core/store como referência a inspecionar; **propostos:** DAL/serviço de importação, upload privado e consultas de lote/ajuste. **Dependência:** D03/D04/D08.

**Implementação:** separar armazenamento de arquivo da transação financeira: upload autenticado privado com owner/limites técnicos explícitos e digest; registrar lote/preview com referência privada/versionamento/parser. Preview mostra válidas, erros, review_required, duplicatas e totais por moeda. Confirmação usa preview persistido/digest e seleciona apenas linhas autorizadas; transaciona decisões/fatos/eventos/estado do lote. Acrescentar identidade estável de fato além do digest do arquivo e predecessores de ajuste. Na importação interna, não marcar relatório de programa/provider_confirmed sem evidência. Relatório específico só após G-FIN e mapeamento documentado. Completar instrumentação de tempo/tokens/custo real e resultados manuais/C-07; ligar cockpit ao mesmo read model.

**Aceite/verificação:** mesmo request/arquivo, arquivo reordenado e lotes sobrepostos não duplicam fatos; duas confirmações disputam uma gravação; correção/estorno mantém predecessor e reconcilia estados; falta de ID seguro exige revisão; linha inválida não soma; sem pedido/campanha pode existir comissão agregada com origem explícita. Arquivo de A inacessível para B/anon; preview adulterado/versão vencida negados. Ausência de valor não vira zero; moeda não mistura; confirmado não é caixa; assinatura da plataforma invisível ao cliente. Testes web, SQL comercial e S-FIN; concorrência/Storage em D13.

Exports CSV tratam fórmula/injeção de planilha como dado, preservam encoding documentado e não expõem arquivo bruto privado. EXP-05 depende do relatório autorizado; registro sintético não é conferência da primeira venda.

**Banco/recuperação:** import_batch/import_row já estão em M-08. Complementar referência do objeto/digest do preview, unicidade do fato/revisão e consistência de decisão conforme necessidade; não criar uma segunda contabilidade. Arquivo órfão de upload falhado exige registro/reconciliação, sem inventar retenção definitiva. Reverter importador impede novos commits; ajustes por ledger, não DELETE de comissão/sales. Primeiro arquivo real não será criado pelo agente.

### D10 — Métricas, coortes e experimentos operacionais

**Resultado funcional:** Resultados consulta dados reais por conta/janela/política/canal e registra experiência em sombra, revisão e decisão com rollback.

**Áreas:** experiment-contract, M-09, financeiro/read model, rubric comparisons, audience_policy_version, cockpit; **propostos:** metrics-query/report e experiment DAL/service/actions/UI. **Dependência:** D06–D09.

**Implementação:** métrica com fonte, numerador/denominador, amostra, cobertura, janela e limites; tempo/custo conhecido e não alocado separados. Validar builder também para numerador ausente/inválido, sem NaN fingindo métrica. Draft com método/coorte/minsample explícitos; assignment idempotente por unidade e avaliações pareadas imutáveis. Estado shadow não altera ranking. Revisão humana qualificada precede promote; serviço calcula amostra/coorte e valida aprovação, não aceita contagem/client-authority. Promover cria versão e pointer com baseline recuperável; rejeitar mantém resultados. Export privado de metodologia; nenhuma publicação de case externo.

**Aceite/verificação:** período/fuso/atraso/janela imatura e falta de exposição exibidos; sem impressões não há CTR; sem custo não há margem comprovada; dados de B não entram em A. Reexecutar assignment não duplica; mudança de entrada não reescreve o output congelado; tentativa de promover sem método/amostra/aprovador/review nega. Aprovação em fixture explícita cria versão e rollback retorna baseline. Testes builder, SQL e jornada shadow/review/UI; G-EXPERIMENT continua aberto onde não houver aprovação/amostra real.

**Banco/recuperação:** policy_experiment existe, mas assignments/coortes/outputs e aprovação metodológica não estão completos. Complementos com FKs/ownership/uniques; nenhum backfill atribuindo observação antiga a experimento fictício. Rollback troca versão ativa e registra evento, preservando ledger/reviews.

### D11 — Core de agendamento, worker e reconciliação

**Resultado funcional:** usuário agenda/cancela/acompanha; worker local processa destino de teste; transporte incerto exige reconciliação e não gera retry cego.

**Existentes:** dispatch-contract/db, M-11, campaign_publication/kit/link/destination. **Propostos:** serviço de agendamento, worker CLI local/runner, tentativas/prova/reserva, actions/painel integrado à campanha e revisão de unknown. **Dependência:** D04/D08; gates canal/programa para adapter real.

**Implementação:** ligar UI→serviço autorizado→DAL→worker→resultado. Na transação de schedule, revalidar revisão/publicação/destino/conta e quota/cooldown; impedir reagendar leased/unknown por upsert. Lease atômico, token único por tentativa, recuperação conservadora do crash conforme seção 4.2. Revalidar fatos/kill switch/credencial/reserva antes do marcador de possível I/O; chamada fora da transação; persistir id/prova do provedor e finalizar com token vigente. Não marcar succeeded/published_confirmed apenas porque um mock retornou true. Unknown tem tela/serviço de reconciliação com evidência/autoria; rejeição definitiva permite retry controlado. Cancelamento após possível aceitação não afirma “não enviado”.

**Aceite/verificação:** job inválido não agenda; replay não duplica; two workers não possuem lease/finalização alheia; crash antes do I/O recupera com segurança e após marcador vai unknown; timeout após possível envio não repete; conta/revisão/link/segredo vencidos ou suspensos bloqueiam antes do I/O. Kill switch e cancelamento exercitados nos dois lados do marcador. Reserva/cooldown concorrentes obedecem política; falha externa e retry não consomem uso duplicado sem unidade definida. Testes serviço+SQL+adapter sintético claramente identificado; sessões independentes em D13. Via manual D08 permanece disponível.

**Banco/recuperação:** M-11 hoje não guarda tentativas/prova/início de I/O, que precisam evolução aditiva ligada ao job/tenant; revisar CHECKs de estado, FK kit-publicação/destino e índices de claim. Alterar DAL e migration como fatia única. Kill switch impede novos envios; jobs incertos são reconciliados, nunca apagados/reenviados automaticamente.

**Parte condicionada:** depois de G-CHANNEL/G-PROGRAM, implementar somente adapter oficial aprovado, confirmar docs atuais, testar no destino autorizado e medir prova/reconciliação. Core com SyntheticDistributionAdapter é implementação local de core, não canal real liberado. Escolha/ativação não deriva deste plano; WhatsApp permanece assistido/manual.

### D12 — Onboarding persistido, primeira campanha e saída

**Resultado funcional:** em ambiente isolado, convite/provisionamento cria conta própria, recebe condições explícitas, conecta programa e completa primeira campanha; suspensão protege dados/segredos e não atinge casa/A.

**Áreas:** account-context/auth/member/affiliate/secret, contratos/M-12/serviço D04, campanhas/material/financeiro/dispatch; **propostos:** storage de convite, onboarding DAL/service/actions/UI, gestão de plano/progresso/suporte/export. **Dependência:** D01–D11, auditoria incremental da base. Convite real só após G-PILOT/PRIVACY/SEC e D13.

**Implementação:** aceitar convite autenticado com receptor/token/hash/validade/tenant/papel verificáveis e uso único transacional; provisionar sem duplicar identidade da pessoa. Persistir progresso a partir de evidência, sem step marcado complete apenas pelo browser. Conta traz credenciais e tag próprias; allowed marketplaces vêm do entitlement/capability. Owner adiciona operator autorizado; nenhum se autoconcede role de plataforma. Implementar limites backend D04 na jornada inteira, suspensão/expiração/saída e export privado do dono, registrando suporte/fricções/uso. Termos/preço/quota/política em draft são exibidos como pendentes; fixtures sintéticas não ativam pessoas reais.

Implementar a capability `platform_admin` proposta na seção 4.2 e seu boundary auditado antes de expor provisionamento. Enum/tipos/lookup/grants evoluem juntos; concessão real permanece administrativa e não é executada automaticamente. Aceitar operador de conta existente não concede papel de plataforma. Para primeiro owner de conta piloto, o convite já se vincula à conta/condições provisionadas pelo administrador autorizado; signup livre não cria plano ativo. Registrar EXP-06 (tempo, fricções e suporte da primeira campanha) somente com piloto seguro e consentido, mantendo ensaio sintético identificado.

**Aceite/verificação:** token de outro receptor/conta, expirado, inválido, já usado e papel proibido negam; duas aceitações geram uma membership; mesma pessoa em A/B alterna sem vazamento; plano encerrado/suspenso impede novos commands/leases/secret read; campanha própria usa tag correta em todos os redirects e tem confirmação explícita. Export de B não expõe casa/A; suspensão de B não interrompe A/casa. Resultado financeiro sem fonte fica não monitorado/desconhecido; não há promessa de ROI. Testes web/SQL, D04 concorrente, J2 e nova matriz de segurança; Auth/Storage/browser em D13.

**Banco/recuperação:** criar elementos de convite/aceite ausentes e consistência dos vínculos affiliate/tenant/plano/progresso. Proteger role/termos/limites por autorização específica. Recuperar revogando convite/acesso e bloqueando novos comandos; preservar fatos e ledger. Exclusão/retencão só pela política aprovada; não criar período legal arbitrário.

### D13 — Homologação da versão candidata em staging

**Resultado funcional:** versão exata funciona com Auth, pooler, SQL multi-sessão, Storage, navegador e runtime sem bypass.

**Áreas:** migrations reais/complementares, `bin/verify-remote-compatibility.ts`, deploy/ambiente de staging e protocolo de [verificação integral](05-VERIFICACAO-INTEGRAL.md). **Entrada obrigatória:** G-ENV comprovado; código adaptado, cadeia isolada validada e recuperação preparada. Login no MCP sozinho não comprova alvo/autorização.

**Sequência:** confirmar project/branch/host/schema/histórico/runtime e isolamento; revisar exatamente as pendências e hashes, escopo exclusivo garimpa; preparar snapshot sanitizado recuperável e versão anterior compatível; aplicar migrations na ordem das dependências ao staging autorizado, verificar objetos/grants/policies/FKs/constraints a cada bloco; instalar código correspondente com automações desligadas; executar jornadas reais e matriz. Registrar SQL/query plano de verificação, resultado, versão e ambiente sem DSN/token.

**Aceite:** A/B/A em pooler/conexões reutilizadas não cruza GUC; owner/operator/nonmember/suspenso corretos; sem contexto nega; UPDATE não troca tenant; viewers públicos não lêem segredos. Duas sessões disputam quota/import/convite/lease com resultado único. Browser autenticado usa action/API→serviço→Postgres→UI; Storage protege download/list/upload/upsert e arquivos assinados; extensão/comprador/captura/curadoria seguem válidos. Permissões não são provadas apenas como postgres/service_role. Não se exigem mensagens/cobranças reais para completar a homologação técnica dos núcleos.

**Recuperação:** testar recuperação do snapshot em isolamento ou demonstrar mecanismo equivalente autorizado; registrar ordem código/schema/backfill, forward-fix e desativação de módulos. RLS não volta permissiva; evitar rollback DDL destrutivo com dados comerciais. Se o alvo não estiver disponível, registrar D13 BLOQUEADA e fechar trabalho local verificável em D14, sem certificar ambiente real.

### D14 — Auditoria cruzada e encerramento fiel

**Resultado:** todas as specs têm consumidores, provas ou impedimentos reais; relatório não repete os erros RV-06/07.

**Dependência:** verificar todos os núcleos locais; homologação completa depende D13. **Áreas:** docs/specs/rastreabilidade/STATUS/evidências e diff integral da rodada.

**Execução:** percorrer os 62 requisitos de rastreabilidade, T01–18, S-* e J1–J3; checar contratos, owners, migrations/dependências, duplicação de ledger/UI, orphan helpers e estruturas futuras consumidas antes de existir. Buscar consumidores reais de cada novo serviço e comprovar jornada; teste unitário não basta para ausência de integração. Repetir matriz de segurança depois de onboarding e de qualquer superfície nova. Revisar produção compatível sem escrever nela; citar limites de evidência.

**Aceite/verificação:** todos RV-01–05 têm regressão correta e consumidor funcional; RV-06 inventário coerente; RV-07 cobertura/ambiente exatos. Nenhum requisito sem entrega ou exclusão fundamentada; dois negócios preservados; nenhum gate substituído por default. Testes afetados, cadeia SQL, typechecks e build passam; omitidos têm impacto explícito. Todos os fatos de conclusão apontam a prova executada.

**Saída documental:** STATUS reconciliado; checkpoint completo; relatório final com por-entrega e por-épico separação de implementação/verificação local/homologação/ativação; manifesto de hashes/inventário e logs; migrations criadas/ensaiadas/aplicadas/confirmadas separadas. Se falta código disponível, estado PARCIAL e seguir corrigindo. Não encerrar rodada com outro prompt.

### 5.2 Migrations complementares — dependências e recuperação

Não há filenames aprovados para complementos ainda não criados. O executor deve gerar pelo workflow/CLI verificado, registrar nome real e usar a tabela como desenho de dependências. Criar arquivo e ensaiar não significa aplicar remotamente.

| Complemento planejado | Necessidade / dependência | Migração/evolução segura |
|---|---|---|
| Revogação/bootstrap/contexto | D01/D02, M-10A1/A2 | Função/grants/policies ajustados com regressão positiva/negativa; sem reatribuir usuários ou abrir policies. |
| Entitlement/uso/convites | D04/D12, M-12 + identidade | Tenant/affiliate consistentes por vínculo composto; aprovação/versão/período, unicidade aplicável, reserva idempotente, convite/hash/aceite; valores reais somente aprovados. |
| Capability de plataforma | D12, enum/role da migration 20260929015526 + C-01 | Adição de role e resolução/grants limitados; tratar restrições de transação para uso de novo valor enum conforme versão Postgres. Sem autoatribuição/backfill de privilégios. |
| Política/oportunidade | D06/D07, M-02/03 | Predecessor e versionamento somente se ausentes; dados antigos preservados; nova versão sem reclassificação retroativa fictícia. |
| Rights/artifacts | D08, M-04 e storage existente inspecionado | Proveniência/revisão/ownership, objeto privado; nenhum asset público vira licenciado por backfill. |
| Importação | D09, M-08 | Referência privada, preview versionado e identidade global da linha/fato; auditar duplicatas antes de UNIQUE; históricos por predecessor. |
| Experimentos | D10, M-09 + rubrica/política | Método aprovado/assignments/outputs/review/promoção; min_sample de negócio explícito; sem atribuições históricas inventadas. |
| Dispatch | D11, M-11 + D04/M-04/07 | Tentativa/início de I/O/prova/reserva/estado; vínculo kit-publicação/destino da mesma conta; fila legada não autoriza envio automático. |

Cada complemento nasce com RLS/grants scoped, FKs/constraints/índices adequados e teste como runtime. Verificar especialmente novos tenant-scoped objetos criados **depois** de M-12: os loops de proteção de M-12 não protegem tabelas futuras automaticamente. Aprovação de terms/plan e mutações privilegiadas não se resolvem apenas com `tenant_id = GUC`.

Antes de constraints em dados existentes: contar inconsistências/deduplicar mediante regra auditável aprovada; expansão→backfill documentado→validação→restrição. Sem regra legítima, bloquear backfill afetado, não escolher registro vencedor silenciosamente. Novas colunas compatíveis/nullable primeiro quando necessário; nunca apagar ledger/revisões para viabilizar DDL. Recuperação preferencial por forward-fix/configuração/código compatível; registrar caso que exija recuperação de snapshot.

## 6. Verificação de ponta a ponta e protocolo do executor

### 6.1 Comandos existentes

Reconfirmar package.json no início. Não há comando npm raiz presumido.

```bash
npm test --prefix packages/web
npm test --prefix packages/capture
npm test --prefix packages/persistence
npm test --prefix packages/extension
npm run typecheck --prefix packages/web -- --incremental false
npm run typecheck --prefix packages/capture -- --incremental false
npm run typecheck --prefix packages/persistence -- --incremental false
npm run typecheck --prefix packages/extension -- --incremental false
npm test --prefix tools/editorial-tests
npm run test:triage-price --prefix tools/editorial-tests
npm run test:capture-batch --prefix tools/editorial-tests
npm run test:commercial --prefix tools/editorial-tests
npm run build --prefix packages/web
```

Executar verificações focadas em cada fatia e a regressão ampla após integrações materiais e no fechamento. Adicionar testes necessários aos runners ou registrar script novo real, com instrução reproduzível; não inventar comando que ainda não existe. Use endpoint/factory isolados para SQL; não deixar `.env.local` escolher produção. Alguns `verify:*` legados carregam env-file e podem escrever: inspecionar antes de usar; não executá-los automaticamente só por terem nome verify. O preflight remoto existente recebe alvo explicitamente, não comprova todos os fluxos. Build/typecheck não certificam acesso a dados.

SQL/PGlite real é válido para persistência/RLS serializados; não é prova de duas sessões PostgreSQL, Supabase Auth/Storage ou browser. A prova concorrente exige backend real isolado e duas conexões/transações independentes; se indisponível, implementar o teste/harness e registrar execução BLOQUEADA, nunca trocar por mocks para declarar aceite.

### 6.2 Jornadas obrigatórias

| Jornada | Percurso e prova |
|---|---|
| J1 — Operação própria | Captura autorizada→evidência→revisão/radar→campanha→kit→aprovação→export/manual→confirmação→clique→registro/conciliação→Resultados→experimento em sombra. Saída afiliada da casa preservada; nada inventado como venda/receita. |
| J2 — SaaS isolado | Provisionamento/convite de teste→A/B→política/tag própria→mesmo motor de J1→resultados próprios; mesma pessoa nas duas contas; revogação/suspensão/expiração→negativa no próximo comando e worker. |
| J3 — Compatibilidade | Flags novas desligadas e casa habilitada em teste; visitante sem login compra pelos links antigos; comprador usa salvos/preço/perfil; catálogo/web publication e curation preservados; extensão e lotes funcionam sob RLS; nenhuma migration exige limpar produção. |
| J4 — Importação | Upload privado→preview→erro/duplicata/review→confirmar→ajuste/estorno→relatório; reordenação/lote sobreposto/duas confirmações não duplicam receita. |
| J5 — Distribuição | Agendar→quota→lease→revalidação→I/O de teste→prova/unknown→reconciliar/cancelar; crash e revogação entre etapas exercitados. Adapter sintético não certifica fornecedor. |
| J6 — Experimento | Método aprovado de teste→assignment→outputs pareados→review→promover ou recusar→rollback; shadow não muda ranking e métrica desconhecida não vira percentagem. |

Registrar por jornada entradas sintéticas/reais, papel runtime, ambiente, versão, caminho de UI/API/serviço, consulta/fato/evento resultantes e limites. Não usar redirect público de produção que grava clicks como “leitura inofensiva”.

### 6.3 Checklist e retomada obrigatórios

O executor criará/atualizará `docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md` na execução, sem apagar evidências antigas. Para cada D00–D14 manter:

| Campo | Conteúdo exigido |
|---|---|
| Estado | PENDENTE / EM EXECUÇÃO / PARCIAL / IMPLEMENTADA / VERIFICADA LOCALMENTE / BLOQUEADA; homologação/ativação em campos separados |
| Entrada | Snapshot e dependências confirmadas; diferenças materiais do repositório |
| Resultado | Jornada/consumidor efetivamente entregue; arquivos e migrations reais |
| Aceites | Cada caso com prova positiva/negativa e tipo de teste |
| Verificação | Comando, exit code, resumo, log, ambiente, versão/hash; omitido/falhado e impacto |
| Bloqueio | Capacidade, evidência, entrada faltante, trabalho disponível, dependentes e condição para retomar |
| Próximo passo | Ação concreta, não “continuar implementação”; estado necessário para retomada |

Rotina: confirmar entrada→implementar fatia integrada→verificar→corrigir falhas→revisar diff/contratos→checkpoint/STATUS→avançar. Não esperar confirmação para trabalho técnico autorizado. Não pular aceite para avançar dependente; núcleo implementado com verificação remota bloqueada pode liberar construção local seguinte, mas não ativação externa. Ao fim de cada entrega verificar gates recebidos e retomar capacidades que se tornaram executáveis.

Para declarar uma integração concluída, registrar pelo menos um consumidor real e uma prova atravessando suas camadas. `rg` encontrar import não é prova suficiente; definir tabela/função/mock também não. Se contexto terminar, retomar checkpoint, conferir alterações e continuar; não reiniciar a rodada.

### 6.4 Prompt de entrada para enviar ao executor

> Execute a conclusão sequencial do BizuMiner usando sua skill de execução. Leia integralmente `docs/implementation/15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md`, a revisão 14, contratos compartilhados e todas as treze specs antes de editar. Este pedido autoriza implementação local, migrations locais e testes isolados necessários ao plano; preserve mudanças preexistentes e a operação própria em produção. Siga D00–D14, confirme pré-condições, entregue consumidores e jornadas reais, verifique cada aceite, atualize checkpoint/STATUS com provas e continue até concluir todo trabalho tecnicamente disponível. Repare RV-01–05 antes de ampliar as jornadas dependentes; não trate STATUS narrativo, helpers ou mocks como conclusão. Um gate externo bloqueia somente a capacidade dependente; registre e prossiga nos independentes, retomando quando a entrada chegar. Não invente thresholds E3, labels humanas, quotas/termos, direitos, relatório financeiro ou canal. Não aplique migrations/deploy em produção, envie mensagens, cobre ou convide clientes reais. Staging/escrita/envio externo exigem alvo e autorização específica comprovados na sessão. Termine com auditoria cruzada e relatório de implementação/verificação/homologação/ativação separados, cobrindo todas as specs e impedimentos exatos. Não devolva apenas outro plano nem pare no primeiro épico.

O prompt é para a próxima sessão de execução. Nesta sessão de arquitetura ele não constitui ordem de implementar.

## 7. Riscos, auditoria do plano e conclusão

### 7.1 Riscos e contenção

| Risco concreto | Contenção e prova |
|---|---|
| RLS interrompe configuração/curadoria/captura | D01/D02, fixture fiel, matriz positiva/negativa e D13 antes de ativar restrições |
| Membership revogada ainda autoriza dispositivo | Bootstrap e revalidação corrigidos juntos; captura positiva antes e negativa após revogação |
| Enforcement novo bloqueia operação própria | Política da casa explícita e rollout aprovado/compatível; nenhum default de quota ou bypass por tenant |
| Importação duplica/forja receita | Parser estrito, identidade de fatos, transação, moeda separada e revisão de linhas inseguras |
| Worker repete envio após crash/timeout | Marcador durável de possível I/O, unknown/reconciliação e retries somente com rejeição comprovada |
| Cancelamento aparenta impedir efeito já iniciado | Limite temporal do cancelamento exposto; prova/reconciliação, sem promessa falsa |
| Helpers sem consumers são declarados completos | Checklist exige consumidor e prova multicamada; D14 revisa todos os requisitos |
| Testes puros substituem RLS/concorrência/Storage | Tipos de evidência separados, suites reais e bloqueio explícito de verificação remota |
| Nova tabela criada após M-12 perde proteção | Cada migration instala grants/RLS/active-account/immutabilidade/FKs próprias e testes |
| Código posterior invalida auditoria de segurança | Repetir matriz sobre versão exata depois de D12 e de novas integrações |

### 7.2 Auditoria cruzada deste planejamento

| Conflito/lacuna examinada | Resolução registrada |
|---|---|
| Quotas previstas só no onboarding, depois de campanhas/jobs | Núcleo antecipado em D04, conectado aos comandos; D12 completa UX/provisionamento. Sem motor duplicado. |
| Radar exige rubrica ratificada, mas não há amostra | D06 entrega revisão/sombra; D07 permite política manual/pending em isolamento; promoção condicionada. Não transformar fixture em rubrica homologada. |
| Kits manuais criam oportunidade paralela ao radar | D07 adapta serviço atual para consumir oportunidade selecionada com compatibilidade e eventos, antes de D08. |
| Relatórios dependeriam de importação ainda inexistente | D09 antecede D10; read model único para manual/importado; unknown permanece explícito. |
| Dispatch reobtém lease após possível envio/cancela sem saber efeito | Complemento de tentativa/marker obrigatório em D11, retomada conservadora e reconciliação. |
| 10B exigiria onboarding pronto antes de poder construir onboarding | Auditoria incremental permite construção isolada; auditoria final da superfície D12 antecede cliente externo. Sem ciclo de implementação. |
| Não existe role de plataforma no enum atual | Capability técnica proposta e boundary em D12; sem promover todos os owners nem conceder acesso administrativo de banco ao runtime. |
| Storage pessoal seria reutilizado como autoridade de tenant | Novo ownership comercial explícito, I/O fora de SQL e download sensível autenticado/revalidado. Workspace pessoal preservado sem copiar credenciais/dados para novas contas. |
| Novos objetos dependeriam de loops SQL executados antes de existirem | Cada complemento instala as proteções, sem presumir que M-12 as criará depois. |
| STATUS possui nomes falsos/estados financeiros divergentes | Inventário real na seção 2.3 e reconciliação D00/D14; sem DDL para ajustar a narrativa. |
| Gate poderia interromper todos os épicos | Núcleo/capacidade condicionada separados em cada entrega e tabela 3.1; checkpoint controla retomada. |
| Estratégia favoreceria casa ou SaaS isoladamente | Mesmo contexto/engine/quotas, tag e dados próprios; operação real preservada; ambos permanentes. |

Cobertura do plano: EP-00 D00/D13/D14; EP-01 D05; EP-02 D06; EP-03 D07; EP-04 D08; EP-05 D05/D08/D09/D10; EP-06 D08; EP-07 D08/D11; EP-08 D03/D09; EP-09 D10; EP-10 D01/D02/D13/D14, transversal; EP-11 D03/D04/D11; EP-12 D03/D04/D12. Nenhum dos treze épicos foi omitido. Esta auditoria é documental; não alega implementações ou novos testes executados.

### 7.3 Definição objetiva de conclusão

**Rodada local concluída:** todos os núcleos disponíveis D00–D12 implementados com consumidores, regressões corretas, persistência real isolada, checks relevantes e D14 concluída documentalmente; não há pendência técnica independente escondida como gate. Teste que não pôde ser executado é identificado, não contado como aprovado. Cada capacidade condicionada tem registro de entrada e condição de retomada.

**Versão homologada:** D13 aprovada sobre os mesmos hashes/versão da auditoria, incluindo jornadas de Auth/Storage/browser/concorrência/pooler; recuperação e compatibilidade comprovadas. Alteração material posterior reabre a verificação afetada.

**Capacidade ativável:** gates de evidência/programa/direitos/canal/plano/privacidade e segurança satisfeitos conforme capacidade, decisão humana registrada. Produção/envios/convites/cobranças não são consequência automática da conclusão local.

**Épico plenamente concluído:** todas as suas entregas e gates exigidos cumprem sua definição original, com evidências. Se apenas núcleo está pronto, registrar “núcleo implementado/verificado; capacidade X bloqueada por Y”, sem CONCLUÍDO integral. A implementação futura confirma pré-condições e estado atualizado; não precisa redesenhar esses fundamentos.
