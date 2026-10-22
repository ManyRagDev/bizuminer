# Plano sequencial de correção e conclusão — CF-01 a CF-18

## Atualização operacional de16/10/2026 — OS10

A fila histórica permanece abaixo. O rollout direto33/36 foi executado com backup, versão compatível, C e retomada verificados. [Resultado10](contratos-finalizacao/resultados/10-fechamento.md). Fechamento do núcleo não conclui automaticamente entregas comerciais/externas.

| Entrega | Estado atual | Prova/ordem |
|---|---|---|
| R00 — Baseline/fixture | CONCLUIDO baseline/registro | OS01/02/10 |
| R01 — Conta/dispositivo | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R02 — Bootstrap/plano | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R03 — Suspensão/quotas | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R04 — Revisão/autoria | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R05 — Ratificação/calibração | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R06 — Radar/monitoramento | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R07 — Campanhas/materiais | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R08 — Importação/ledger | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R09 — Experimentos | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R10 — Worker/envio | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R11 — Onboarding | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R12 — Auditoria local | PARCIAL: base publicada/instalada e provas locais disponíveis; capacidade integral conforme registro pendente | OS01–08 + OS11 por capacidade |
| R13 — Homologação isolada | CONCLUIDO rollout direto do núcleo33/36; multicliente/Storage completos não certificados | OS01–09; staging pago não é pré-condição deste caminho |
| R14 — Fechamento | CONCLUIDO fechamento do núcleo; Blueprint integral permanece parcial | OS10; continuidade específica OS11 |

---

## Registro anterior preservado — não representa o estado atual


Data: 14/10/2026. Skill: codex-arquiteto. **Somente planejamento; implementação e migrations não executadas nesta rodada.**

Esta é a fila da próxima execução, baseada na [conferência 16](16-CONFERENCIA-D00-D14-PONTOS-A-CORRIGIR.md). Complementa e atualiza a ordem operacional do [plano 15](15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md); preserva blueprint, treze specs, contratos C-01–C-09 e decisões comerciais. Os identificadores **R00–R14** são entregas corretivas; não renomeiam D00–D14 nem EP-00–12.

## 1. Resultado esperado

Corrigir todos os 18 apontamentos e concluir as integrações locais ainda pendentes, com o mesmo motor atendendo permanentemente a operação própria e o SaaS. Preservar vendas, catálogo, links, identidade e histórico existentes.

O executor deverá percorrer a fila completa, entregar comportamentos observáveis e registrar provas por apontamento. Nenhuma entrega será encerrada por existir uma tabela, helper, action sem consumidor ou teste que espera o defeito. Os gates externos continuam explícitos e bloqueiam somente a capacidade dependente.

**Classificação da mudança:** estrutural e multicamadas, com reparos delimitados sobre componentes existentes. Não é uma reescrita do produto. Primeiro corrigir fronteiras e persistência; depois conectar jornadas; por último auditar a versão completa e homologar.

## 2. Evidências e estado atual

### Base reconfirmada nesta rodada

- HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, com alterações preexistentes. Os **501 arquivos** do manifesto da revisão 16 foram comparados novamente: **nenhuma mudança de conteúdo** desde a conferência. O estado do Git deve ser preservado e novamente confirmado pelo executor.
- Nenhum AGENTS.md encontrado na busca do repositório nesta rodada; verificar também instruções aplicáveis ao ambiente no começo da execução.
- A revisão 16 executou 23 checks, incluindo 557 testes de pacote, 14 suítes SQL, quatro typechecks e build, todos aprovados no ambiente preparado corretamente. Também reproduziu 16 contraexemplos. São fatos compatíveis: a cobertura atual não encerra os requisitos.
- `tools/editorial-tests/commercial-fixture.ts` concede DML amplo às tabelas do baseline; `app_user_role` tem SELECT-only nas migrations existentes. É necessário corrigir a fixture antes de usar seus resultados como prova de permissões.
- `tenant-db.ts::withAccountDb` já resolve a operação humana com membership; `withTenantDb` não autoriza uma conta. `account-context.ts` é a fonte do tipo canônico. Várias entradas ainda usam tenant/defaults sem esse contexto.
- `rubric-db.ts`, `opportunity-db.ts`, `experiment-db.ts`, `saas-onboarding-db.ts`, `dispatch-db.ts` e `dispatch-worker.ts` existem. Corrigir e integrar; não reconstruir os módulos do zero.
- `commercial-workflow.ts`, `/admin/campanhas` e `/admin/financeiro` têm consumidores reais. O financeiro já possui CSV colado→preview agregado→commit, mas ainda não a jornada completa de arquivo/linhas/ajustes.
- `editorial_assessment` já possui `assessment` e `snapshot` JSONB, `policy_version` e `evidence_fingerprint`; a migração original é `20261005235546_editorial_selection.sql`. C-03 determina reutilizá-la com payload v2 e decoder v1. M-10A1 já introduziu o padrão de autoria por membership para parte das entidades; estendê-lo às tabelas posteriores, sem duplicar app_user.
- O projeto consultado na revisão 16 não tinha as onze migrations V2 no histórico nem os três objetos V2 verificados. Isso não identifica staging nem o deployment atual. **Não houve nova consulta remota nesta rodada de planejamento.**

Fontes: [relatório 16](16-CONFERENCIA-D00-D14-PONTOS-A-CORRIGIR.md), [manifesto e hashes](evidencias/manifesto-revisao-16.json), [contraexemplos](evidencias/revisao-16-contraexemplos.json), [inventário de consumidores](evidencias/revisao-16-consumidores.json), [metadados remotos anteriores](evidencias/revisao-16-remoto.json), [contratos compartilhados](03-CONTRATOS-COMPARTILHADOS.md) e [rastreabilidade](08-RASTREABILIDADE.md).

Não tratar o relatório do executor/STATUS como autoridade de conclusão. Não transformar a revisão 16 em resultado de um deployment não inspecionado. Revalidar evidência e pré-condições, preservando os fundamentos já decididos.

## 3. Escopo e limites

**Incluído na próxima execução:** correções CF-01–18; migrations locais complementares; fixture fiel; regressões; serviços/actions/interfaces/worker executável; Storage privado; critérios de promoção; encerramento das jornadas locais de D06–D12; auditoria e documentação com rastreabilidade.

**Fora do efeito automático deste plano:** aplicar DDL/backfill remoto, deploy em produção, acionar captura ao vivo, enviar mensagens, convidar clientes reais, cobrar, escolher canal oficial ou aprovar valores comerciais. Criação/revisão de migration local é diferente de aplicação ao banco conectado.

Não inventar limites 5/10, concordância 80%, min_sample=30 como aprovação universal, labels humanas, calibração E3, direitos de imagem, relatório de fornecedor ou consentimento. Dados de teste devem ser sintéticos e identificados. A casa usa o mesmo serviço com política própria explícita; não terá bypass por `tenant=local`.

### Gates e continuidade

| Entrada externa | Capacidade condicionada | Trabalho local liberado |
|---|---|---|
| G-ENV: staging isolado, alvo/autorização, Auth/Storage/pooler e recuperação | R13 e certificação do ambiente | R00–R12 e fechamento documental dos bloqueios em R14 |
| G-PRICE: EXP-02 real e ratificação | Ativar nova política E3 | Registro de calibração, aprovação protegida, comparação e UI conservadora |
| G-RUBRIC: 30–50 labels reais e método/ratificação aprovados | Promoção para assistido e política homologada | Revisão humana, sombra, amostra, radar manual e gates funcionais |
| G-FIN/G-PROGRAM: relatório/programa/capabilities comprovados | Parser específico, identidade de eventos do fornecedor e subIDs externos | Importação interna, revisão humana, ledger e atribuição interna |
| G-RIGHTS: direito do asset por uso/canal | Arte com aquele material | Pipeline de arte com asset próprio autorizado/sintético de teste e copy factual |
| G-EXPERIMENT: método/coorte/janela/amostra/critério aprovados antes de medir | Promoção real/prova causal | Draft, relatórios descritivos, comparação e revisão em isolamento |
| G-CHANNEL: canal oficial, destino e envio autorizados | Adapter/teste de envio real | Core, agenda, worker local, painel, cancelamento e reconciliação com adapter de teste |
| G-PILOT/G-PRIVACY/G-SEC | Ativação de clientes e condições/saída dependentes de política | Onboarding fictício, limites no backend, export privado, suspensão e auditoria |

Ausência de uma dessas entradas não autoriza encerrar o núcleo incompleto, nem obriga parar toda a fila. Consultar decisões já fornecidas; consolidar dúvidas externas cedo e continuar o independente. Silêncio não aprova negócio ou efeito externo.

## 4. Decisões e contratos de correção

### 4.1 Autorização e bootstrap

**Preservado:** pessoa global por auth_user_id; conta escolhida entre memberships ativas; role afiliado não concede acesso geral; owner/operator distintos; platform_admin é capability separada, concedida administrativamente. Comprador mantém home/identidade pessoal. Conta/ator/fatos não vêm de autoridade do formulário.

**Decisão técnica proposta para CF-01/13/14:** substituir bootstrap por policies null/vazio por **rotinas internas mínimas**, com grants específicos, search_path fixo e retornos limitados. No backend SQL direto existente, identidade autenticada e e-mail confirmado são verificados pelo servidor antes da chamada; o e-mail digitado nunca comprova receptor. Aceite de convite resolve token hash, destinatário e app_user da identidade validada, verifica validade/conta/role/uso único e grava membership/role base atomicamente. Não depende de membership prévia na conta convidada.

O token bruto só existe na emissão/resposta autorizada e no portador; não é listado/logado. Acesso global a `account_invitation` não é necessário ao bootstrap. Não conceder INSERT genérico em app_user_role para contornar 42501: concessão de afiliado é limitada ao convite válido; platform_admin nunca é concedido por esse fluxo. Provisionar conta/plano exige capability comprovada, não GUC null ou owner de qualquer conta.

Serviços privados humanos passam AccountContext obrigatório e `withAccountDb`. Wrappers tenant-only ficam restritos a operações internas explicitamente autorizadas, nunca como fallback de uma requisição privada. Contexto de dispositivo deriva do token/registro servidor, define seu ator e revalida conta/role/membership/dispositivo na transação. Não atribuir owner fictício para atualizar last_used_at: se necessário, separar a operação mínima do próprio dispositivo com autorização específica.

### 4.2 Suspensão e quotas

**Decisão:** suspensão administrativa de conta atualiza o estado canônico `affiliate_account.status`, entitlement aplicável e evento auditável em operação controlada; novos comandos, segredo e jobs devem respeitá-la. Não realizar exclusão. Leitura geral privada não permanece ativa implicitamente. Export de saída pós-suspensão, se exigido pelo responsável, usa caminho de plataforma explícito/auditado até existir política de acesso residual aprovada; isso não bloqueia construir o export privado de owner enquanto ativo.

Expiração de plano impede capacidades contratadas mesmo se a conta ainda estiver active. Aprovação/limites/período/janela/fuso são configuração explícita. Resolver uso no servidor, reservar e criar recurso atomicamente, tratar replay e compensação sem apagar uso histórico. A política de transição da casa precisa preservar sua operação e ser aprovada antes de ativar enforcement no ambiente existente.

### 4.3 Revisão, autoria e gates

**Preservado C-03:** reutilizar `editorial_assessment.assessment` para RubricAssessment v2 completo, mantendo decoder das avaliações v1 e snapshots legados intactos. A nova escrita contém discriminador de versão; leitores da seleção pública não podem interpretar v2 como o antigo payload de publicRationale/dimensions. Uma avaliação v2 não publica/seleciona oferta automaticamente. Revisor global mais membership da conta dá autoria; não exigir home tenant igual à conta.

**Proposto:** comando humano persiste assessment, snapshot factual, versão/digest e evento antes de comparar com IA; comparação referencia a revisão humana e a análise compatível. Reutilizar o padrão idempotente do comando comercial baseado em domain_event, extraindo um serviço compartilhado quando necessário. Mesmo request/conteúdo recupera o resultado; conteúdo diferente conflita. Salvar sem IA continua sendo gravação real, não sucesso vazio.

Métricas de amostra não retornam ratified por atingir contagem. Ratificação é aprovação humana explícita, por responsável autorizado, sobre versão/método/coorte e conjunto de evidências congelado. Replays e múltiplas labels do mesmo caso não criam unidades distintas da amostra. G-PRICE registra referência **persistida e validada** à calibração aprovada, versão, aprovador e data; string não vazia não é homologação.

Experimento começa draft. Sem método aprovado, há somente descrição/rascunho; execução de medição experimental usa metodologia congelada previamente aprovada. No modo de comparação pareada do plano 15, a unidade possui outputs baseline/candidate sobre os mesmos fatos; tamanho de amostra conta unidades/pares elegíveis, não soma linhas. Assignment não é improvisado como A/B de exposição para chamar uma comparação pareada de experimento. Promoção exige reviewed, revisor server-side, amostra válida e versão candidata aprovada existente, com evento/ponteiro/reversão transacionais. Score/denominador ausente permanece null com motivo.

### 4.4 Identidade financeira e commit

**Preservado C-07:** obrigação financeira é diferente de evento/revisão; comissão e conversão têm estados próprios; confirmado não é recebido. Ledger append-only com predecessor, moeda e conta consistentes. Nenhuma atribuição por proximidade temporal/último clique; receita SaaS separada na conta operadora.

**Decisão proposta:** usar tuplas estruturais versionadas para identidade persistida, tanto no digest quanto em conversões/comissões. Identidade da conversão usa conta/programa/pedido/item e a semântica documental apropriada; identidade de evento inclui tipo e revisão/chave de origem. ID de lote/linha é proveniência e não identidade global do fato. Campos ausentes não colidem com strings vazias. Não continuar concatenando IDs com `:`.

O formato interno pode evoluir com versão explícita para suportar `eventKind`, `sourceRevision` e referência de predecessor quando demonstrados. Campos não disponíveis no formato atual ou fornecedor vão para revisão humana; não inventar revisão do provedor nem deduzi-la só de horário/valor. A confirmação dessa revisão registra decisão, fonte e autoria. Mesmo fato é duplicate; mudança legítima é novo evento/ajuste; divergência não resolvida é review_required, sem lançamento automático.

Preview preserva objeto bruto privado, parser/configuração, linhas normalizadas e digest/versão. Commit revalida identidade contra os fatos atuais, mesmo que o preview estivesse correto quando criado. Confirmação usa seleção explícita de linhas; `[]` significa nenhuma seleção, nunca “todas”. Request repetido com seleção diferente conflita. Rejeitadas/duplicatas não entram no ledger; revisão pendente exige resolução explícita. Contadores/eventos refletem inserts/ajustes reais e não tentativas com ON CONFLICT sem efeito.

### 4.5 Dispatch e limite da garantia

Agendar consome o mesmo kit/publicação/destino/link aprovado e quota/cooldown da configuração por conta/audiência/canal/janela. Modo assisted não envia pelo worker. Nada de preço 1000, prazo +24h, status active/approved, link fixo ou segredo/destino inventados em fallback.

**Decisão:** separar orquestrador que recebe factory/conexão de repositórios que recebem tx. O ciclo externo não aceita uma transação abrangendo a API:

1. Transação curta de claim/attempt com token único e commit.
2. Carregar/revalidar fatos/configuração/credencial com escopo verificado; transação curta de autorização e marker, condicionada a lease/status/prazo/revisão/reserva/kill switch atuais; commit antes do transporte.
3. Somente com marker confirmado, chamar adapter fora da transação, com conteúdo/link congelados e prazo de transporte limitado pela posse autorizada.
4. Transação de finalize com token vigente, prova/resultado e eventos; perda de posse ou resultado incerto exige reconciliação.

Cancelamento que vence a transição do marker impede o adapter. Depois do marker, cancelamento é pedido de interrupção/reconciliação e não promessa de ausência de efeito. Crash após marker/possível I/O vai unknown e não repete automaticamente. Não há garantia exactly-once externa sem suporte oficial do provedor. Revogação recebida depois de iniciado o transporte não pode desfazer uma mensagem já aceita; registrar o limite, não fingir que transação SQL cobre I/O remoto.

### 4.6 Provas de encerramento

Cada apontamento terá: comportamento incorreto antigo documentado; regressão nova esperando o correto; prova positiva e negativa; consumidor operacional quando aplicável; migration e recuperação se necessárias; ambiente/hash/log. A evidência histórica de `revisao-16-probes.mts` fica preservada: seu exit 0 não serve como aceite de reparo.

CF-17 só encerra quando **todas** as integrações nele listadas funcionarem. CF-18 exige rastreabilidade completa e documentação coerente; não é resolvido trocando PENDENTE por CONCLUÍDO.

## 5. Plano executável em sequência

### 5.1 Índice, dependências e saídas

PRONTA significa executável localmente após preflight, não implementada. CONDICIONAL distingue núcleo local de gate de ativação. BLOQUEADA refere-se ao resultado remoto/externo, sem paralisar o restante.

| Ordem | Entrega | Entrada mínima | Apontamentos | Saída funcional / de controle | Prontidão |
|---|---|---|---|---|---|
| R00 | Baseline e fixture fiel | Evidências/repo acessíveis | CF-14/18 | Regressões corretas e permissões reproduzíveis | PRONTA |
| R01 | Conta e dispositivo em todos os caminhos | R00 | CF-02/03 | Privado autorizado; captura positiva e negativa preservadas | PRONTA |
| R02 | Bootstrap de convites e gestão de planos | R01 | CF-01/13/14 | Sem contexto nega; convite legítimo funciona sem grants amplos | PRONTA |
| R03 | Suspensão e enforcement comum | R02 | CF-15; CF-17/D04/12 | Suspensão/expiração respeitadas em comandos/segredos/jobs | CONDICIONAL |
| R04 | Persistência humana, autoria e UI de revisão | R01–R03 | CF-04/05; CF-17/D06 | Salvar/reabrir v1/v2, inclusive sem IA e em duas contas | PRONTA |
| R05 | Ratificação e calibração auditáveis | R04 | CF-06; CF-07/E3; CF-17/D05/06 | Contagem não homologa; aprovação/evidência reais exigidas | CONDICIONAL |
| R06 | Políticas, radar e monitoramento conectados | R04/R05 | CF-02/17 D07 | Ações e fila reais por público/canal/conta | CONDICIONAL |
| R07 | Cockpit, arte e divulgação assistida | R06 | CF-17 D08 | Oportunidade→kit→arte permitida→aprovar→exportar→confirmar | CONDICIONAL |
| R08 | Importação, identidade e ledger | R02/R03/R07 | CF-08/09/10; CF-17 D09 | Arquivo→linhas→revisão→commit→ajuste, sem duplicação | CONDICIONAL |
| R09 | Experimentos e Resultados | R04–R08 | CF-07; CF-17 D10 | Coortes/revisão/promoção protegida/rollback na UI | CONDICIONAL |
| R10 | Agenda, worker e reconciliação | R03/R07 | CF-11/12; CF-17 D11 | Sem fallback; marker durável; cancelamento impede I/O | CONDICIONAL |
| R11 | Onboarding guiado e evidência das etapas | R02–R10 | CF-16; CF-17 D12 | Convite→conta própria→primeira campanha→suspensão/saída | CONDICIONAL |
| R12 | Auditoria local integral | R00–R11 | Todos, especialmente CF-17/18 | Matriz de prova e versão candidata sem pendência local disponível | PRONTA após entrada |
| R13 | Homologação isolada | R12 e G-ENV | Verificações remotas de todos | Auth/Storage/browser/pooler/duas sessões/recuperação | BLOQUEADA até pré-condições |
| R14 | Fechamento e registro fiel | R12; R13 para homologação | CF-18 e fechamento dos demais | Relatório por CF/R/D/épico e gates verdadeiros | CONDICIONAL |

A ordem é a fila padrão para um executor único. Uma fatia dependente não avança sobre contrato quebrado. Gate comercial pode permitir construir em fixture explícita, sem promover/ativar em operação real. R14 pode encerrar a rodada local com R13 bloqueada e capacidades externas nominadas; não pode certificar produto integralmente homologado nesse caso.

### R00 — Reconciliar fontes e corrigir a fixture

**Resultado:** banco isolado representa os privilégios reais; testes não mascaram falhas de autorização. **Áreas:** commercial-fixture, regressions-rv01-rv05 e demais runners em `tools/editorial-tests`; migrations históricas, manifesto 16, STATUS/CHECKPOINT. **Entrada:** revalidar instruções, snapshot, working tree e scripts.

**Passos:** preservar evidências; inventariar grants/revokes/roles/policies/views/FKs do baseline a partir de migrations e metadados de leitura disponíveis. Remover GRANT amplo substitutivo, reinstalando apenas privilégios demonstrados. Criar casos de aceite CF em regressões separadas, sem reescrever o diagnóstico antigo para “passar”. Registrar owner técnico por CF e por integração de CF-17. Sincronizar os estados atuais como parciais.

**Aceite/verificação:** app_user_role tem o grant real, sem contexto privado nega ou fica documentado como teste vermelho da falha existente; 16 contraexemplos têm regressões positivas/corretivas planejadas; cada falha de baseline tem causa/CF. Executar `test:commercial`, `test:regressions` e testes dos domínios afetados; separar resultado observado de aceite. É permitido sair de R00 com os testes corretivos ainda vermelhos **exclusivamente por CFs conhecidos**, para repará-los em R01–R11; isso não é aprovação do produto.

**Banco/recuperação/restrição:** somente fixture isolada e documentação neste passo; não alterar produção/grants remotos para ajustar ensaio. Falha inesperada de fixture deve ser resolvida antes de atribuí-la ao produto. Histórico e alterações preexistentes preservados.

### R01 — Concluir autorização de conta e contexto de dispositivo

**Resultado:** todas as fronteiras privadas autorizam a conta; dispositivo legítimo captura e revogação impede o próximo comando. **Áreas:** api-auth/auth/account-context/tenant-db, layout/page/actions/APIs administrativas, curation/admin/editorial-selection/affiliate/member/extension/browser-capture/capture-batch DB, workers/PgStore/CLIs. **Entrada:** R00.

**Passos:** inventariar todos os callsites e remover contexto opcional/default house dos comandos humanos privados. Propagar contexto resolvido e fatos recarregados server-side, com revalidação na transação. Corrigir actions novas de rubrica/oportunidade que confiam no tenant/assessment/evidência do input. Separar identidade de comprador, pessoa e dispositivo; auditar pareamento/exchange e write do próprio dispositivo, incluindo a policy de last_used_at.

**Aceite/verificação:** não membro não lê resumo da casa nem cria política em B; owner/operator legítimos funcionam; mesma pessoa alterna A/B sem misturar dados; mesa editorial/lote vencido/captura continuam. Captura completa por dispositivo ativo seguida de revogação de membership/role/dispositivo/suspensão é exercitada. `test:regressions`, `test:capture-batch`, `test:commercial`, testes web/extension/persistence; action/API integrada em ambiente isolado e depois R13.

**Banco/recuperação/restrição:** ajustes mínimos de bootstrap/permissão do próprio dispositivo quando necessários, sem owner fictício, service_role no cliente ou using(true). Rollback mantém código compatível e acesso restrito; não reabre a casa a qualquer afiliado. Inventário deve terminar sem caminho privado não classificado.

### R02 — Fechar policies e entregar bootstrap seguro de convite/plano

**Resultado:** sessão sem contexto não lista/altera convites/planos; destinatário real de convite válido ingressa sem membership prévia e sem poder conceder privilégios de plataforma. **Áreas:** M-12 e complementos, saas-onboarding-db, auth/identidade, app_user_role, affiliate_membership, entitlement; actions/entrada de aceite e gestão de plataforma **propostas**. **Entrada:** R01.

**Passos:** retirar permissões por GUC null/vazio; criar rotinas mínimas da seção 4.1; validar sessão/receptor/token/validade/papel/conta/uso único e gravar membership + afiliado atomicamente. UI/handler recebe token e sessão, não autoridade de email/ator/role. Provisionamento e alteração de plano passam por platform_admin verificado, com termos/configuração draft quando não aprovados. Reusar assinatura/tipos existentes onde compatível, marcando mudança de contrato de aceite explicitamente.

**Aceite/verificação:** sem contexto, owner cliente e operator não alteram planos nem listam hashes; token válido para outro receptor/conta, inválido, expirado e usado nega; duas aceitações resultam em uma concessão; caminho legítimo funciona com fixture SELECT-only em app_user_role. Nenhum convite concede platform_admin. `test:onboarding`, `test:entitlement`, `test:regressions` e SQL negativo/positivo dos grants; teste concorrente real em R13.

**Banco/recuperação/restrição:** migration de policies/grants/rotinas com escopo e search_path fixos; nunca liberar DML genérico de role. Restabelecer segurança antes de avançar a UI externa. Revogar convite/trocar versão do serviço preserva membership e eventos históricos. Convites são somente sintéticos em isolamento; entrada de cliente real continua bloqueada.

### R03 — Tornar suspensão e limites efetivos em todo o motor

**Resultado:** suspender B impede suas operações dependentes, segredos/novos envios e saída pública afetada; A/casa continuam funcionando. **Áreas:** suspendAccountByPlatformAdmin, active_tenant/resolvers, affiliate-secret/destination/public-go, saas-entitlement-db, commercial-workflow e futuros comandos. **Entrada:** R02.

**Passos:** aplicar estado canônico e evento conforme seção 4.2; revalidar suspensão/expiração na autorização e antes de efeitos. Mapear arquivamento de campanha, queued/leased e pedido de cancelamento. Exigir plano inequívoco aprovado, limites tipados e janela/fuso explícitos; nenhum default comercial ou contagem do browser. Reusar reserva idempotente em campanha/kit; disponibilizar a mesma porta para R10. Preparar política própria da casa e sua transição sem ativá-la por suposição.

**Aceite/verificação:** leitura privada geral/segredo/comando/redirect dependente negados após suspensão; expiração impede uso contratado; worker não envia; duas contas não se afetam. Replay não gasta de novo, falha desfaz reserva, conta sem configuração não recebe limites inventados. Testes web/SQL `test:entitlement`, `test:onboarding`, `test:commercial`; disputa da última vaga e A/B/A com sessões independentes em R13.

**Banco/recuperação/restrição:** evolução aditiva de integridade/estado/reserva se necessária. Não apagar ledger/observações; reativação é comando autorizado/evento, sem desfazer histórico. Política comercial real/janela ainda não fornecida condiciona ativação; não impede testar configuração sintética explicitamente aprovada para o ensaio.

### R04 — Persistir revisão humana e corrigir autoria, com tela funcional

**Resultado:** curador salva e reabre avaliação completa sem IA, e a mesma pessoa pode avaliar em A/B. **Áreas:** rubric-db/contract, editorial_assessment/comparison_review/M-02, editorial-selection-db/decoders, curadoria/actions/spot-check/bússola e UI de rubrica **proposta**. **Entrada:** R01–R03.

**Passos:** implementar seção 4.3; gravar payload v2 em editorial_assessment com fatos/digest verificados, identidade global/membership e evento. Corrigir FK da comparação e ligar assessment humano; adaptar readers para distinguir v1/v2 sem tornar a avaliação v2 aprovação pública. Comparação com IA compatível é opcional e posterior; falha de provider não apaga/impede revisão. Comando idempotente/conflict, UI salvar/reabrir e histórico de revisões completos.

**Aceite/verificação:** sem Gemini/shadow, revisão persiste integral e reaparece; com shadow guarda refs/outputs corretos. User home B com membership A grava em A, não membro não; revogar membership impede novo write e preserva autoria antiga. V1/seleção/hero continuam válidos; labels e fatos não são convertidos silenciosamente. `test:rubric`, integração editorial, `test:commercial` e testes web, inclusive decoder e action→SQL→resposta.

**Banco/recuperação/restrição:** FK simples global + vínculo de membership da conta, não FK home-tenant. Novos campos/constraints de idempotência só onde necessários; linhas antigas mantêm payload/source. Recuperar versão de UI/decoder compatível e modo shadow; não excluir avaliações ou duplicar app_user.

### R05 — Separar métrica de ratificação e vincular calibração E3

**Resultado:** amostra/replay não homologa política; responsável aprova versão contra evidência auditável. **Áreas:** getRubricPromotionMetrics, actions/UI de amostra, price-evidence/approvePriceEvidencePolicy, políticas/rubrica/calibração e eventos; registro de aprovação **proposto**. **Entrada:** R04.

**Passos:** remover 80% hardcoded como autorização; deduplicar unidade/revisão e separar versão/coorte/fatos. Registrar método/limites e ratificação explícita com aprovador server-side, conjunto de evidências, versão, data e decisão. Persistir/validar referência de calibração de preço aprovada em vez de confiar em string; E3 sem ela permanece indisponível. UI permite draft/coleta/comparação/export privado e mostra gate pendente, sem aprovar por silêncio.

**Aceite/verificação:** trinta replays de um caso continuam uma unidade e status não ratificado; labels reais insuficientes não promovem; versões/coortes não misturam. Ref de calibração inexistente/não aprovada/outra conta e aprovador do input negam E3. Configuração sintética registrada no teste permite testar aprovação e reversão legítimas. `test:rubric`, `test:price-evidence`, `test:triage-price`, paridade TS/SQL e UI de aprovação.

**Banco/recuperação/restrição:** referência de evidência e aprovação imutáveis/versionadas, com FKs/ownership. Policy antiga aprovada não muda in-place; revogar/substituir muda versão e invalida derivação quando cabível. EXP-01/02 reais e critérios comerciais permanecem gates; não declarar calibrado usando benchmark sintético.

### R06 — Operar política, radar e monitoramento por audiência

**Resultado:** usuário escolhe política/público/canal, prioriza/monitora/retem e vê a fila real com motivos. **Áreas:** opportunity-db/contract/actions, direcionamento/curadoria, monitoring-policy/candidates/affiliate-monitoring/bin, commercial-workflow. **Entrada:** R04/R05; autorização R01.

**Passos:** ligar actions corrigidas à UI; carregar assessment/evidência no servidor; permitir classificação manual ou sombra enquanto gate pendente. Versionar transições com idempotência/conflict. Cooldown recebe e filtra audiência/política/tema/listing/canal/janela da configuração, usando postagem confirmada; remover 24h implícitas como regra universal. Integrar prioritizeMonitoringQueue ao consumidor real, com budget e reserva contra starvation. Reativação de arquivada cria nova oportunidade com predecessor, conforme C-03, sem reescrever o episódio encerrado.

**Aceite/verificação:** caro maker/generalista, barato útil, estável e marca desconhecida seguem razões contextuais; B não lê A; publicação em uma audiência não bloqueia outra; export não confirma social. Radar gera ação real de monitorar, respeita fonte autorizada e mostra coleta humana quando necessário. `test:opportunity`, web/persistence/SQL, replay/conflito e smoke de fila sem acionar coleta remota.

**Banco/recuperação/restrição:** unicidade ativa e predecessor/audit trail preservados; política pendente não produz gold automático. Reverter ponteiro de política não apaga oportunidades/decisões humanas. Nenhum cron/captura ML não autorizado é habilitado.

### R07 — Concluir cockpit e materiais com divulgação assistida

**Resultado:** Pauta/Radar/Resultados conduz oferta a kit revisado, material permitido, export e confirmação real. **Áreas:** cockpit-view-model/today-command-center/admin/direcionamento/campanhas/marketing, commercial-workflow/kit-validator, story/QR/OG, artifacts/Storage privado **propostos**, `/p`, `/bizu`, `/go`. **Entrada:** R06.

**Passos:** integrar os serviços existentes, preservando o fluxo manual. Arte/copy/template versionados por revisão; rights/proveniência por asset/canal, sem converter URL pública em licença. Download autorizado entrega a revisão congelada; fatos/preço/link revalidados antes de preparar/exportar. Estado/evento de cópia/export não vira confirmação de postagem; edição posterior respeita histórico de publicação/link. Resultados lê o ledger único, ampliado por R08/R09.

**Aceite/verificação:** selecionar→gerar copy/arte autorizada→validar→aprovar→exportar→confirmar funciona; falha de download/cópia cancelada não marca sucesso; revisão concorrente conflita; preço/variante/direito/link mudados bloqueiam material pronto. Render S-KIT 1080×1920/mobile, acentos/disclosure/contraste; CTA/banner/sticky/QR preservam c e dono; links antigos e analytics best effort preservados. `test:cockpit`, `test:commercial`, testes web e jornada visual/teclado.

**Banco/recuperação/restrição:** ownership tenant/revisão/objeto, download sensível autenticado e I/O Storage fora de transação SQL. Falha de upload registra órfão reconciliável; não cria política de retenção comercial/legal arbitrária. Desativar template defeituoso preserva revisões/links/postagens. G-RIGHTS condiciona asset real; não impede pipeline com asset próprio autorizado.

### R08 — Corrigir importação, identidade e ajustes e fechar sua interface

**Resultado:** arquivo privado/preview por linha/revisão/commit produz conversões e ledger corretos sob repetição, sobreposição e correção. **Áreas:** commercial-financial-db/contract, commission-import-contract, financeiro/actions/workspace, M-08, armazenamento de arquivos/importação **proposto**. **Entrada:** R02/R03/R07.

**Passos:** antes de DDL, inventariar chaves/colisões/dados e consumidores. Implementar seção 4.4 com tuple keys versionadas e compatibilidade; migrar referências só com reconciliação auditável. Criar upload privado e proveniência do bruto; preview congelado por versão/digest exibe cada erro/duplicata/revisão e totais por moeda. UI seleciona linhas e resolve eventos inseguros explicitamente. Commit com lock/constraints/transação reconsulta fatos globais, cria conversão uma vez e evento/predecessor corretos. Documentar versão interna; fornecedor só com relatório autorizado.

**Aceite/verificação:** confirmar 100→receber/corrigir 150 não descarta ajuste; dois pares de IDs com ':' coexistem; previews X e X+Y comitados em qualquer ordem geram uma conversão/fato X. Mesmo request com seleção diferente conflita; lista vazia não importa tudo; preview stale/adulterado/arquivo de B nega. Centavos/estados/moedas, recebido versus confirmado, estorno pós-caixa e receita SaaS separada mantidos. `test:financial`, `test:commercial`, web e provas de upload/action/SQL/UI; duas confirmações/overlap em sessões independentes em R13.

**Banco/recuperação/restrição:** expansão→auditoria/backfill validado→UNIQUE; sem apagar fatos ou escolher vencedor silenciosamente. Sem identidade legítima, review_required é resultado correto. Commit falho não deixa meia importação; correção histórica via novo lançamento/predecessor. Não fabricar primeira venda, metadata de fornecedor ou documentar como provider_confirmed um arquivo interno de teste.

### R09 — Fechar experimentos, promoção e painel de Resultados

**Resultado:** responsável consulta coortes e realiza draft→shadow→reviewed→promote/reject/rollback com metodologia e versão auditáveis. **Áreas:** experiment-db/contract/M-09, audience_policy_version, assessments/comparações/financeiro, painel de Resultados e actions **propostas**. **Entrada:** R04–R08.

**Passos:** remover promoção direta de shadow e autoria/contagem do input; aprovar método antes da medição; vincular assignment, fatos congelados e outputs pareados. Contar unidades elegíveis e mostrar incompletude/atraso/exposição. Criação de versão candidata e pointer da política devem ser consistentes; rollback não aponta versão inexistente nem altera outputs. Integrar UI/serviço real e export privado de método, sem construir segunda contabilidade.

**Aceite/verificação:** caso da revisão 16 com um output vazio, nenhuma atribuição, minSample escolhido no input e aprovador inventado é recusado; score ausente continua null. Inputs/revisões trocados não somem na média; mesmo par não amplia amostra. Versão candidata inexistente, insuficiência e falta de review/método negam; fixture de aprovação explícita promove e retorna ao baseline por rollback. `test:experiment`, `test:rubric`, `test:financial`, web e percurso de UI autorizado.

**Banco/recuperação/restrição:** constraints/FKs entre experimento/assignment/evaluation/política/versão, outputs e revisão imutáveis, evento/promoção atômicos. Sem minSample comercial default e sem causalidade/CTR/margem sem observações apropriadas. G-EXPERIMENT condiciona promoção real; painel descritivo pode funcionar antes.

### R10 — Corrigir worker e entregar agenda/painel/reconciliação

**Resultado:** agendamento autorizado é processado por runner local; sem fatos válidos ou após cancelamento vencedor não há chamada ao adapter. **Áreas:** dispatch-worker/db/contract/M-11, validação factual/kit/publicação/link/destination/secret, entitlement, actions/painel e CLI worker **propostos**. **Entrada:** R03/R07; R08/R09 disponíveis para Resultados, sem circularidade de envio.

**Passos:** implementar seção 4.5; retirar `https://garimpa.app/p/test` e todos os fatos fallback. Schedule valida revisão pronta, modo, link, reserva/quota/cooldown e chave/conteúdo. Orquestrador possui transações curtas; marker condicionado retorna autorização obrigatória e commit durável antes do adapter. Persistir kill switch/configuração e limites por destino. Runner exige escopo/ambiente explícitos; painel agenda/cancela/reconcilia/inspeciona prova. Sucesso/unknown/evento de publicação usam a semântica C-05/C-08, sem confirmar provider sintético como postagem real.

**Aceite/verificação:** snapshot vazio/link revogado/publicação planned/destino assisted/revisão superada/credencial inválida/plano expirado/conta suspensa não chamam adapter. Cancelamento entre precheck/marker e marker false resultam em zero chamadas; token expirado/alheio não autoriza. Marker é visível de outra conexão antes da chamada; crash depois dele vai unknown. Cobrir sucesso, rejeição retryable comprovada, fatal, timeout, exceção e reconciliação; retry não duplica reserva. `test:dispatch`, `test:commercial`, `test:entitlement` e testes de serviço; dois workers/sessões e crash após commit em R13.

**Banco/recuperação/restrição:** job/attempt/reserva consistentes por tenant e revisão/publicação/destino; indexes/claim e eventos atômicos. Kill switch bloqueia novos I/Os, preservando manual R07. Não envolver API em begin abrangente; não tratar finalize recusado como envio prevenido. Adapter real e envio somente após G-CHANNEL/G-PROGRAM e autorização específica. WhatsApp continua manual/assistido.

### R11 — Concluir onboarding por evidências e saída protegida

**Resultado:** afiliado sintético aceita convite, conecta configuração própria e completa primeira campanha guiada; progresso acompanha fatos reais. **Áreas:** saas-onboarding-db/contract, auth/affiliate/secret, R02/R03, política/campanha/kit/publicação/financeiro, actions/UI de onboarding/gestão/export **propostas**. **Entrada:** R02–R10 implementados em seus núcleos locais.

**Passos:** consumer real do provisionamento/convite já seguro; plano/termos/limites explícitos e G-PILOT pendente visível. Substituir complete recebido do caller por validadores de evidência por etapa ou evento do comando correspondente: conta existente; configuração própria; teste de link validado; política; campanha; revisão aprovada; publicação confirmada. Validar referências e versões, invalidar progresso derivado quando fato for revogado. Suporte/fricções/uso e export privado com escopo; suspensão/saída usam R03.

**Aceite/verificação:** sem credencial/link/campanha real de teste a etapa não completa; evidenceRef de B ou recurso revogado nega. User em duas contas percorre jornada com tag própria, sem clonar dados/segredos da casa. Convite, período, operator/owner e quotas no backend funcionam; publicação é confirmação explícita; resultados desconhecidos não viram venda/ROI. UI→action→SQL→UI e export autorizados; `test:onboarding`, `test:entitlement`, `test:commercial`, web e matriz A/B/casa. Repetir segurança incluindo onboarding antes de cliente externo.

**Banco/recuperação/restrição:** progresso referencia fatos auditáveis, sem destruir histórico ou inventar datas; suporte/retencão seguem política aprovada. Conta sintética não é piloto real; não enviar convite externo nem efetuar cobrança. Suspender/revogar acesso preserva ledger e revisão; export residual após suspensão só pelo caminho autorizado definido em R03.

### R12 — Auditoria local integral e candidata à homologação

**Resultado:** nenhum CF ou requisito disponível está escondido como gate; versão candidata é rastreável e revisável. **Áreas:** diff da rodada, testes/fixtures/migrations, contratos/specs, 62 requisitos, T01–18/S-*/J1–J3 e checklist corretivo. **Entrada:** R00–R11.

**Passos:** auditar cada consumidor/camada; conferir grants/policies/views/rotinas, autoria global/membership, FK composta, isolamento de objetos e novas tabelas após os loops antigos. Procurar dado fallback, controle só no frontend, casts de inputs e suposições de aprovação. Rodar checks finais da seção 6; corrigir falhas atribuíveis antes de fechar. Registrar os CFs com provas e as capacidades técnicas de CF-17 uma a uma.

**Aceite/verificação:** regressão correta de cada contraexemplo passa; positivos continuam funcionando; todos os novos serviços têm consumidor real e prova de fluxo. Fixture não tem grant inventado. Contratos de revisão/ledger/job/plano consistentes, nenhuma nova receita/postagem fictícia. Não usar build, grep ou contagem de testes como única evidência de conclusão. Auditoria local separa testes que exigem R13.

Para evitar dependência circular, R12 aprova somente a candidatura com provas locais: serviço/action com SQL isolado, consumidor implementado e verificações de interface disponíveis. A conexão completa browser+Auth+Storage+pooler é verificada em R13. Se faltar infraestrutura até para uma prova local, registrar a lacuna de verificação e seu impacto; pode-se preparar o ensaio de R13, mas não declarar aquele fluxo verificado nem CF integralmente encerrado. Nenhum código local implementável pode ser deixado pendente sob esse rótulo.

**Recuperação/restrição:** não reduzir assertions, ignorar teste falhado ou ocultar resultado para aprovar candidata. Ponto técnico disponível ainda aberto mantém entrega PARCIAL e retorna ao responsável. Nenhuma escrita em produção para verificar hipótese.

### R13 — Homologar em staging isolado e autorizado

**Resultado:** versão exata validada em Auth, Storage, navegador, pooler e PostgreSQL multi-sessão. **Entrada:** R12, ambiente/alvo/autorização de escrita comprovados, rollback/recuperação e dados sanitizados. MCP autenticado não é autorização nem prova de staging.

**Passos:** confirmar projeto/branch/schema/histórico/roles/isolamento; revisar migrations por dependência/hash, incluindo correções de grants e backfills. Aplicar somente ao staging autorizado com pós-verificação por bloco; instalar código correspondente com automações desligadas. Executar jornadas reais sintéticas autorizadas e ensaio de recuperação. Preservar consultas/resultado redigidos, sem segredos.

**Aceite/verificação:** browser autenticado→action/API→runtime→SQL/Storage→UI; A/B/A no pooler; sessões independentes disputando última vaga/importação/convite/lease/marker; interrupção antes/depois do I/O; continuidade comprador/extensão/casa/links antigos; arquivos privados e suspensão. Queries como postgres não provam RLS do usuário. Recuperação demonstrada com código/schema compatíveis e dados preservados.

**Restrição/retorno:** sem alvo/autorização fica BLOQUEADA e R14 registra essa limitação. Não aplicar migrações em produção, não disparar compra/mensagem/convite/cobrança reais. Não “recuperar” com policies permissivas ou DELETE de ledger. Mudança material posterior reabre a parte afetada da homologação.

### R14 — Encerrar com status coerente e impedimentos específicos

**Resultado:** relatório e checkpoint refletem implementação, verificação local, homologação e ativação de cada capacidade. **Áreas:** STATUS, CHECKPOINT D00–D14, [checklist desta rodada](17-CHECKLIST-DE-EXECUCAO.md), índice, matrizes/requisitos, manifestos/logs e relatório final **proposto**. **Entrada:** R12; R13 para declarar homologação.

**Passos:** sincronizar topo/detalhamentos/tabelas e nomes reais; manter IDs D originais e relacionar R/CF/EP. Para cada requisito, apontar consumidor, prova e ambiente. Separar núcleo pronto de promoção/canal/fornecedor/piloto condicionado; registrar próximo dado/decisão/ação. Não concluir épico inteiro pela existência de suas tabelas.

**Aceite/verificação:** todos CF-01–18 classificados com encerramento comprovado ou bloqueio externo exato; todos R/D/EP e os 62 requisitos têm estado consistente; nomes/links/migrations existem; logs/hashes correspondem à versão final. Documento final não diz “só gates” se falta integração técnica implementável.

**Restrição:** relatório de conferência e evidências antigas permanecem históricos. Não transformar intenção/plano/teste sintético em produto homologado ou resultado comercial. Nova conferência independente deve conseguir reproduzir o aceite a partir dos registros.

### 5.2 Cobertura dos apontamentos e dono do encerramento

| Apontamento | Entrega principal | Complemento/prova de fechamento |
|---|---|---|
| CF-01 | R02 | Sem contexto nega leitura/mutação; bootstrap positivo R13 |
| CF-02 | R01 | Entradas antigas/novas e consumidores R04/R06; matriz R12/R13 |
| CF-03 | R01 | Captura completa e revogação; extensão real em R13 |
| CF-04 | R04 | Sem IA salva/reabre payload completo e revisão |
| CF-05 | R04 | Mesma pessoa home B revisa A; não membro nega |
| CF-06 | R05 | Replay não amplia amostra; contagem não ratifica |
| CF-07 | R09 | Gate E3 complementar em R05; candidato/review/método/rollback protegidos |
| CF-08 | R08 | Importação evolui obrigação/recebimento/ajuste/predecessor |
| CF-09 | R08 | IDs com ':' distintos coexistem, representação versionada |
| CF-10 | R08 | Lotes sobrepostos e reordenados não duplicam conversão/fato |
| CF-11 | R10 | Fatos/link/modo/revisão/reserva corretos e transações curtas |
| CF-12 | R10 | Cancelamento/lease vence marker→zero chamadas |
| CF-13 | R02 | Sessão/receptor/token verificados e uso único |
| CF-14 | R00 | Correção funcional de concessão em R02; todos os SQL refeitos sem ALL artificial |
| CF-15 | R03 | Suspensão alcança estado canônico e consumidores; onboarding R11 |
| CF-16 | R11 | Etapa só conclui com fato próprio válido, nunca declaração do browser |
| CF-17 | R11 | Encerramento composto: R04/05 D06; R06 D07; R07 D08; R08 D09; R09 D10; R10 D11; R11 D12; certificado por R12 |
| CF-18 | R14 | Registro contínuo desde R00 e auditoria R12; homologação separada R13 |

### 5.3 Evolução de banco e recuperação

Os onze filenames reais V2 estão no plano 15 e continuam existentes. Não criar nomes para coincidir com descrições falsas do executor. Complementos abaixo são **propostos**, sem filename inventado; gerar pelo workflow do projeto/CLI verificado e registrar o nome real na execução.

| Grupo de evolução | Entrada / ordem | Conteúdo mínimo e recuperação |
|---|---|---|
| Auth/bootstrap/plano | R01/R02, após identidade/membership existentes | Grants mínimos, policies fail-closed, rotinas de token/plataforma limitadas; recuperação por versão restrita, sem abrir acesso |
| Estado/quota | R03, após bootstrap seguro | Estado canônico/evento/reservas/configuração aplicável; manter política compatível da casa e uso histórico |
| Avaliação/autoria/aprovação | R04/R05, após atores e assessments existentes | Decoder v1/v2; FK global+membership; deduplicação e evidência de ratificação/calibração; preservar snapshots e aprovações antigas |
| Radar/materiais | R06/R07, após políticas/oportunidades/kits | Predecessor/contexto de cooldown, direitos/artifact/ownership; conservar publicação/link/revisão original |
| Importação | R08, após ledger/preview existentes | Keys versionadas, proveniência privada, revisões/predecessores/uniques e consistência de contadores; auditar colisões antes de restrição |
| Experimento | R09, após políticas/avaliações aprováveis | Metodologia/aprovação/assignment/outputs/unidade/versão/rollback consistentes; sem atribuição histórica fictícia |
| Dispatch | R10, após kit/link/destino/quota | Marker/attempt/token/reserva/kill switch/FKs de vínculo e índices; incerteza preservada e sem retry cego |
| Onboarding | R11, após todos os fatos de etapa | Referências de evidência/autoria/progresso; suspensão/export sem apagar fatos |

Reconfirmar histórico em **cada alvo**: a consulta anterior não autoriza reescrever arquivo aplicado em outro ambiente. Evolução já aplicada é aditiva. Ensaio deve cobrir cadeia limpa e upgrade de estado já existente. Tabela nova não herda os loops de proteção executados antes dela: criar RLS/grants/active-account/immutabilidade/FKs/índices em seu próprio complemento.

Mudanças de dados: expansão→levantamento/backfill auditável e idempotente→validação→restrição. Se houver registro sem vínculo/identidade segura, preservar e registrar pendência em vez de descartar/deduplicar por aproximação. I/O de Storage/provedor fica fora da transação; objeto órfão tem estado de reconciliação. Recuperação prefere configuração/versão compatível/forward-fix e snapshot ensaiado; ledger/revisões não são removidos para resolver migration.

## 6. Verificação e protocolo do executor

### 6.1 Comandos reais e ambiente

Reconfirmar package.json antes de executar. Na raiz do repositório, comandos existentes:

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
npm run test:regressions --prefix tools/editorial-tests
npm run test:entitlement --prefix tools/editorial-tests
npm run test:price-evidence --prefix tools/editorial-tests
npm run test:rubric --prefix tools/editorial-tests
npm run test:opportunity --prefix tools/editorial-tests
npm run test:cockpit --prefix tools/editorial-tests
npm run test:financial --prefix tools/editorial-tests
npm run test:experiment --prefix tools/editorial-tests
npm run test:dispatch --prefix tools/editorial-tests
npm run test:onboarding --prefix tools/editorial-tests
npm run build --prefix packages/web
```

Rodar focados por entrega, e a bateria completa após a integração final. Regressões corretivas novas entram nos runners ou em script novo efetivamente registrado; não presumir que testes existentes já cobrem os aceites. Não há npm raiz para toda a aplicação.

Nos testes unitários web, remover DATABASE_URL/NODE_OPTIONS e credenciais que ativem integrações externas; a revisão 16 registrou ECONNREFUSED de preparação ao fornecer URL fictícia onde o teste opcional tentava acesso real. Ensaios SQL usam factory/URL isolados explícitos; build pode usar URL local não conectável quando necessário, sem carregar produção implicitamente. Inspecionar CLIs/verify:* antes de rodar: vários usam env-file e alguns escrevem.

PGlite com SQL real prova persistência e policies serializadas da fixture, não duas sessões, Auth/Storage, pooler ou browser. R13 exige o backend correspondente. Sem ambiente, registrar execução pendente e impacto; não trocar por mock para chamar o aceite concorrente de aprovado. A contagem de 557 é baseline histórico, não meta nem prova de requisito atendido.

### 6.2 Jornadas finais e falhas obrigatórias

| Jornada | Fluxo/prova |
|---|---|
| Operação própria | Captura→evidência→humano/radar→kit/material→aprovar→exportar→confirmar→clique→manual/importação→Resultados, com links/monetização da casa preservados |
| Conta A/B e identidade global | Mesma pessoa nas duas contas e owner/operator/não membro/revogado; segredo/arquivo/autor/tag corretos; suspender B preserva A/casa |
| Convite | Sem contexto não lista dados; destinatário autenticado aceita uma vez; e-mail digitado/ator falso/role privilegiada não autoriza |
| Editorial/calibração | Sem IA ainda salva; 30 replays não ratificam; versão/método/amostra/approver legítimos para promoção; E3 sem calibração aprovada nega |
| Importação | Dois IDs com ':'; X e X+Y; correção/recebimento/estorno; seleção vazia/diferente; preview stale; arquivo alheio; transação falhada; moeda/caixa/receita SaaS separados |
| Experimento | Draft/método→pares/fatos congelados→review→promote/reject→rollback; output ausente não vira zero; versão inexistente e amostra unilateral negam |
| Dispatch | Agenda→reserva→claim commit→marker commit→I/O→finalize; cancel entre precheck/marker; lease alheio/expirado; crash/timeout→unknown; zero fallback e nenhum retry cego |
| Onboarding/saída | Etapas correspondem a fatos; primeira campanha/tag própria; suspensão de operações/segredos/jobs; export privado e suporte com limites explícitos |
| Compatibilidade | Visitante/compra/`/p`/`/bizu`/`/go`/OG, comprador/salvos/preço, extensão/lotes/curadoria e versões compatíveis de código/schema; sem escritos sintéticos em produção |

### 6.3 Checkpoint, encerramento por CF e retomada

Usar o [checklist R00–R14 e CF-01–18](17-CHECKLIST-DE-EXECUCAO.md), criado como **PENDENTE** neste planejamento. A execução atualiza os campos abaixo, com links para evidências reais:

- Snapshot/hash; entrada reconfirmada e alterações preexistentes.
- Entrega/CF/requisito; arquivos/migrations reais; consumidor e resultado funcional.
- Regressão correta, resultado antes/depois, controles positivos/negativos e tipo de ambiente.
- Comando/exit code/log e inspeção manual reproduzível; teste omitido/falho com impacto.
- Migration criada/ensaiada/aplicada/confirmada por ambiente, em estados separados.
- Implementação local, verificação local, homologação e ativação em colunas distintas.
- Bloqueio exato, dependentes e dado/decisão/alvo/autorização necessários; próxima ação concreta.

Rotina: confirmar entrada→implementar fatia funcional→verificar→corrigir falha→revisar contratos/diff→registrar prova→avançar. Não pedir confirmação para cada reparo técnico já autorizado na sessão executora. Não avançar dependente sobre falha contratual aberta; fazer as partes independentes. Gates recebidos reabrem somente a capacidade correspondente na fila. Retomar checkpoint após compactação/interrupção, sem reiniciar ou encerrar no primeiro épico.

O relatório de execução deve incluir **por CF**: o que mudou, comportamento correto observado, prova, limite e estado. CF-17 tem subitens por D06–D12 e não fecha parcialmente. Um CF não é RESOLVIDO se falta código/consumidor necessário; uma verificação remota pendente não pode constar APROVADA.

### 6.4 Prompt para a próxima sessão executora

> Use sua skill de execução. Execute integralmente `docs/implementation/17-PLANO-SEQUENCIAL-DE-CORRECAO-CF01-CF18.md`, seguindo R00–R14, o relatório 16 e os contratos/specs do plano 15. Este pedido autoriza os reparos e integrações locais, migrations locais e testes isolados necessários, preservando alterações anteriores e a operação própria. Corrija todos CF-01–18 e complete os consumidores de CF-17; não reimplemente partes corretas nem redesenhe estratégia/rubrica/planos/canais. Atualize o checklist 17 e os registros existentes com provas por CF, incluindo negativos e positivos. O harness histórico confirma defeitos e não é aceite; crie regressões que esperem o correto. Fixture fiel vem primeiro; helpers/actions órfãos, mocks ou contagem de testes não são conclusão. Continue todo trabalho disponível em sequência, usando checkpoint para retomada. Gate externo bloqueia só a capacidade dependente; registre e continue os independentes. Não aplique migration/deploy em produção, envie mensagens, cobre ou convide clientes reais. Escrita em staging e teste externo exigem alvo e autorização específicos comprovados. Termine com auditoria integral, relatório por CF/R/D/épico e estados separados de implementação/verificação/homologação/ativação; não devolva só outro plano nem pare após a primeira entrega.

Esse prompt destina-se à próxima sessão de execução. A presente sessão permanece em planejamento e não concede uma ordem de implementar agora.

## 7. Riscos, auditoria cruzada e definição de conclusão

### Auditoria do plano

| Risco/conflito | Resolução |
|---|---|
| Corrigir fixture faz aparecer falhas antigas e executor reabre permissões | R00 registra testes vermelhos de CF conhecido; R02 entrega bootstrap legítimo com grants mínimos |
| Fechar policies impede aceitar primeiro convite | Aceite usa bootstrap restrito independente de membership prévia, não SELECT global/tenant null |
| Suspensão nega export de saída | R03 define canal de plataforma auditado quando necessário; não mantém acesso privado geral como fallback |
| Revisão humana v2 quebra reader/hero v1 | R04 preserva decoder/payload v1 e separa decisão pública de avaliação v2 |
| Gate editorial exige método mas política ainda não foi homologada | Draft/sombra/manual funcionam; R05 registra aprovação; promoção real aguarda entradas humanas |
| Relatório financeiro exige identidade que o fornecedor não forneceu | Variação interna versionada/revisão explícita, sem revision/provider ID inventados; integração específica condicionada |
| Worker tem marker, mas sua transação envolve I/O | R10 muda fronteira do orquestrador e prova marker visível após commit antes do adapter |
| Cancelamento depois do transporte é tratado como “não enviado” | Limite do marker explícito; depois dele, unknown/reconciliação em vez de promessa falsa |
| Onboarding dependeria de auditoria que depende do onboarding | Construção isolada em R11, auditoria completa em R12, externo somente após R13/G-SEC |
| Gates paralisam todas as entregas ou escondem código pendente | Núcleo/capacidade externa separados; R14 exige todos os pontos técnicos disponíveis encerrados |
| Nova tabela não recebe proteção dos loops SQL antigos | Proteções/FKs/grants específicas em cada complemento, matriz SQL e auditoria R12 |
| Casa vira exceção e SaaS fica com motor diferente | Mesmos serviços/contratos; configuração própria explícita, dados/tag isolados e continuidade comercial |

**Plano pronto para execução local:** todos os 18 CFs têm responsável, ordem, resultado e prova; decisões técnicas fundamentais estão registradas. Isso não certifica a implementação, nem resolve os gates de negócio/ambiente por documento.

**Rodada local concluída:** R00–R12 entregues com consumidores/provas e R14 coerente; CFs técnicos disponíveis resolvidos, sem pendência de código escondida como gate. Capacidade externa ou teste impossível de executar permanece explicitamente pendente, não aprovado.

**Versão homologada:** R13 aprovada na mesma versão/hash da auditoria, com duas sessões, Auth/Storage/browser/pooler e recuperação. Mudança material posterior reabre os testes afetados.

**Produto/capacidade ativável:** gates próprios satisfeitos e decisão humana registrada, com efeitos externos autorizados separadamente. Nenhum desses estados autoriza apagar a operação própria, modificar unilateralmente decisões comerciais ou alegar que teste sintético é receita, postagem, piloto ou calibração real.
