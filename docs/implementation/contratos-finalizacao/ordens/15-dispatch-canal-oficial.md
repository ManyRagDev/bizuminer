# OS-15 — Adapter de Canal Oficial para Envio e Outbox Worker

```yaml
id: OS-15
estado: PREPARADA
origem: EP-11 / OPEN-04 / OPEN-06 / CAPACIDADES-PENDENTES linha 13
baseline: "main 43700c59 + OS-14 concluída"
objetivo: "Implementar os adapters de canal de distribuição oficial (TelegramDistributionAdapter e WebhookDistributionAdapter) integrados ao motor de outbox (dispatch-worker.ts). Garantir marker durável, execução HTTP estritamente fora da transação SQL, cancelamento seguro antes do transporte e backoff de rate-limit."
nao_objetivos:
  - "Não enviar mensagens reais para canais de terceiros sem autorização de produção."
  - "Não violar o contrato de marker durável para evitar disparos duplicados."
  - "Não tolerar fallback para canais não autenticados."
dependencias:
  - "OS-14 concluída"
escopo_leitura:
  - "packages/web/lib/dispatch-contract.ts"
  - "packages/web/lib/dispatch-db.ts"
  - "packages/web/lib/dispatch-worker.ts"
  - "packages/web/app/admin/dispatch-panel.tsx"
  - "packages/web/bin/run-dispatch.mts"
  - "tools/editorial-tests/dispatch-worker-flow.test.ts"
escopo_escrita:
  - "packages/web/lib/distribution-channel-adapters.ts" # Novo: TelegramDistributionAdapter e WebhookDistributionAdapter com sanitização e rate limit
  - "packages/web/lib/dispatch-worker.ts" # Atualizar: plugar factory de canais oficiais e tratar marker e status desconhecido
  - "packages/web/lib/dispatch-contract.ts" # Atualizar: tipagens de configuração de Telegram Bot e Webhook assinado
  - "packages/web/test/distribution-channel-adapters.test.mjs" # Novo teste com mock HTTP e cenários de falha
arquivos_protegidos:
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/app/p/[code]/route.ts"
  - "packages/web/app/go/[slug]/route.ts"
contratos:
  - "C-08 (Outbox de dispatch, lease e quotas)"
  - "CF-03 (Execução de adapter fora de transação SQL)"
autorizacoes_remotas: []
aceites:
  - id: AC-15.1
    dado: "Um job de dispatch agendado para o canal 'telegram' com bot token e chat_id válidos"
    quando: "O worker executar o processamento do job"
    entao: "O TelegramDistributionAdapter sanitiza o texto com escape estrito de caracteres especiais MarkdownV2, gera o link canônico do produto com tracking e envia a requisição HTTP com timeout seguro."
  - id: AC-15.2
    dado: "Um job de dispatch configurado para 'webhook'"
    quando: "O envio for executado"
    entao: "O WebhookDistributionAdapter envia o payload JSON contendo a oferta e campanha, assinando o corpo com HMAC-SHA256 no header 'X-BizuMiner-Signature'."
  - id: AC-15.3
    dado: "Uma resposta da API externa com código HTTP 429 (Too Many Requests)"
    quando: "O adapter processar a resposta"
    entao: "O erro é categorizado como retentável e o outbox worker reagenda o job aplicando backoff exponencial com jitter."
  - id: AC-15.4
    dado: "Uma ordem de cancelamento de um job que ainda está no estado 'queued' ou 'leased' antes da transição do marker"
    quando: "O worker tentar processar o job cancelado"
    entao: "O worker detecta o cancelamento na checagem atômica e aborta imediatamente sem efetuar nenhuma requisição HTTP externa."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/distribution-channel-adapters.test.mjs"
    resultado_esperado: "Todos os testes de formatação, sanitização, webhook e simulação de erros passam."
  - comando_ou_cenario: "npm run test:dispatch --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de teste do worker de dispatch e outbox passa sem regressão."
risco_e_rollback: "Risco baixo (chamadas remotas isoladas com mocks). Em caso de falha, manter apenas o adapter de teste habilitado no worker."
```
