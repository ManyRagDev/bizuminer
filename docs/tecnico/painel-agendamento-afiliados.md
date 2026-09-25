# Painel de agendamento e controle por afiliado

## Estado em 24/09/2026

- `.github/workflows/monitor-prices.yml` roda quatro vezes por dia e aceita disparo manual. O cron é global e a matriz contém Shopee e AliExpress. `MONITORING_ENABLED` é uma variável única do repositório.
- `monitor-prices.ts` usa `MONITOR_TENANT_ID`, com padrão `local`, e credenciais globais de Shopee/AliExpress. Não consulta a configuração de contas de afiliados.
- `capture_run` contém o resultado por loja e tenant, mas uma falha de instalação do job acontece antes desse registro. O GitHub é a fonte para esse caso.
- `affiliate_account`, `affiliate_membership` e `affiliate_marketplace_config` existem. A configuração de marketplace guarda atribuição de links, não autorização do agendamento nem credenciais de API. A área `/admin` ainda é exclusiva do dono definido por `ADMIN_EMAIL`.
- O ML usa um scraper de `/ofertas`. O CLI exige dois gates de ambiente para executar em produção e fixa o tenant `local`. O checkbox de consentimento da rota web não configura o CLI nem cria uma execução durável na Vercel.

## Decisão de arquitetura

Manter **um agendador global** no GitHub. A cada disparo, o worker lê políticas de execução por `affiliate_id` e marketplace no banco, seleciona apenas contas ativas e vencidas, aplica os gates de plataforma e executa lotes com limite por conta e limite global. O afiliado liga ou pausa sua política no painel. Essa operação não altera YAML, secrets ou permissões do repositório.

Tabela proposta `affiliate_capture_policy`: `affiliate_id`, `marketplace`, `enabled` (padrão falso), `cadence_minutes`, `budget_per_run`, `next_due_at`, `activated_at`, `activated_by`, `paused_at`, `pause_reason`, `updated_at`. Chave única `(affiliate_id, marketplace)`. A API de escrita deve verificar `affiliate_membership` do usuário autenticado no servidor e limitar as faixas de cadência e orçamento.

Tabela proposta `capture_dispatch`: `id`, `affiliate_id`, `tenant_id`, `marketplace`, `source` (`schedule`/`manual`), `github_run_id`, `scheduled_for`, `claimed_at`, `started_at`, `finished_at`, `status` (`queued`/`running`/`ok`/`empty`/`partial`/`error`/`skipped`), `error_code`, `attempted`, `matched`, `missing`, `failed`, `price_changes`. Restrição única por `(affiliate_id, marketplace, scheduled_for)` para não duplicar trabalho em reexecuções. Claim atômico no Postgres; timeout e recuperação para claims abandonados.

O relatório deve mostrar separadamente:

1. **Agendamento GitHub**: previsto, iniciado, concluído, falhou, ignorado ou atrasado. Link do run e, se aplicável, do job.
2. **Captura da loja**: conta, loja, produtos elegíveis, tentados, preços confirmados, indisponíveis, erros e alterações de preço.
3. **Saúde da promessa de acompanhamento**: produtos com histórico atualizado dentro do prazo, produtos vencidos e motivo da ausência. `ok` do GitHub não implica preço confirmado; zero candidatos é `empty`, não falha de API.

Falta de disparo não aparece na API do GitHub como run. Detectar execução perdida comparando horário esperado e horário real, com tolerância para atraso do GitHub, e alertar ao operador. O histórico próprio no banco deve sobreviver à retenção de logs do GitHub.

## Sequência de entrega

1. **Visibilidade da casa**: mostrar histórico do workflow na aba de rodagens e vincular novas linhas de `capture_run` pelo `GITHUB_RUN_ID`. Registrar também tentativas com fila vazia. Esta etapa já está implementada. Histórico anterior não tem vínculo retroativo.
2. **Disparo remoto da casa**: botão administrativo chama `workflow_dispatch` via rota autenticada. Requer `GITHUB_ACTIONS_WRITE_TOKEN` no ambiente Production da Vercel, com permissão de repositório `Actions: write`, restrito a `ManyRagDev/bizuminer`. A rota guarda o token no servidor e verifica Origin. Enquanto a credencial não existir, o botão fica desabilitado e o link para a página do workflow no GitHub continua disponível.
3. **Política por conta**: migration, autorização por membership, API de ligar/pausar, trilha de auditoria e tela de afiliado. Default desligado. Não expor token do GitHub ao navegador.
4. **Worker multi-tenant**: tirar `local` fixo dos CLIs, carregar configuração e credenciais adequadas a cada conta, aplicar orçamento global, claim idempotente, rechecagem da política antes da chamada externa e resultado durável mesmo se o job falhar.
5. **ML**: decidir um método de acesso autorizado e testado, então adicionar o adapter de acompanhamento por ID e os gates da plataforma. Opt-in do afiliado é necessário para a preferência dele, mas não substitui a habilitação técnica da plataforma. Até lá, o controle de ML deve aparecer como `indisponível para agendamento`, sem um toggle funcional.
6. **Alertas e relatório**: aviso de run perdido, falha recorrente, itens sem atualização e exportação por período/conta/loja.

## Entrega da conta da casa (25/09/2026)

- Migration `20260925040000_affiliate_monitoring_policy.sql`: política por afiliado e loja, trilha de mudanças e registro de jobs agendados pausados. As linhas da casa nascem com Shopee/AliExpress ligadas e ML desligado; novas contas não herdam ativação.
- Aba **Rodagens**: controles de Shopee/AliExpress para a próxima execução agendada, histórico das mudanças e indicação explícita de que ML ainda não tem cron. O disparo manual continua separado da escolha de agendamento.
- Worker: em `schedule`, consulta a política antes de selecionar produtos ou chamar APIs externas. Se a loja estiver pausada, grava a razão e termina sem consulta. Em `workflow_dispatch`, preserva o disparo manual do administrador. Enquanto a migration não tiver sido aplicada, a casa mantém temporariamente o cron anterior; outros tenants não recebem essa exceção.
- Esta entrega controla somente a casa. O banco está estruturado por afiliado, mas o worker continua selecionando `tenant_id=local` e usando credenciais globais; não habilitar terceiros antes de implementar credenciais, atribuição de links e orçamento por conta.
- Migration aplicada no Supabase do projeto `spbuwcwmxlycchuwhfir` via MCP com versão remota `20260925114255` (`affiliate_monitoring_policy`). Verificação: três linhas da casa (Shopee/AliExpress ligadas, ML desligado), RLS ligado nas três novas tabelas, sem `SELECT` para `anon`/`authenticated`, e leitura confirmada como `garimpa_app`.
- Teste controlado de pausa: Shopee ficou desligada por segundos; o CLI chamado como `schedule` registrou `policy_disabled` em `affiliate_monitoring_skip` e saiu antes da API. A configuração foi restaurada e o histórico tem os dois eventos do teste.

## Critérios de aceite

- Duas contas com escolhas diferentes: uma roda e a outra não; cada uma vê somente sua política, seus produtos e seu histórico.
- Pausar uma conta impede a próxima captura agendada, inclusive em reexecução do workflow; o histórico permanece. Disparo manual exige autorização separada e mostra explicitamente que não altera a escolha de agendamento.
- Falha antes da conexão com o banco aparece pelo GitHub; falha do adapter aparece no `capture_dispatch` e `capture_run`; preço confirmado é contado somente com observação persistida.
- `workflow_dispatch` duplicado e jobs concorrentes não duplicam consultas da mesma janela.
- A política de ML só pode ser ativada após gate técnico da plataforma e adapter de acompanhamento comprovados em produção.
