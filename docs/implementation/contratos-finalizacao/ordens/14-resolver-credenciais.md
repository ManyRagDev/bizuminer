# OS-14 — Resolver de Credenciais de Conta para Captura e Monitoramento

```yaml
id: OS-14
estado: PREPARADA
origem: EP-10 / OPEN-07 / OPEN-10 / CAPACIDADES-PENDENTES linha 11
baseline: "main 43700c59 + OS-13 concluída"
objetivo: "Implementar o AccountCredentialResolver para permitir que contas/tenants privados executem lotes de captura e rotinas de monitoramento utilizando suas próprias credenciais cifradas (AES-256-GCM), com isolamento estrito e fail-closed absoluto sem qualquer herança ou fallback para as credenciais da casa ('local')."
nao_objetivos:
  - "Não expor segredos decodificados em logs, respostas HTTP ou no bundle cliente."
  - "Não quebrar a execução padrão do monitoramento da conta da casa ('local')."
  - "Não alterar a chave mestre de criptografia do ambiente."
dependencias:
  - "OS-13 concluída"
escopo_leitura:
  - "packages/web/lib/affiliate-secret.ts"
  - "packages/web/lib/capture-dispatch.ts"
  - "packages/web/lib/capture-process.ts"
  - "packages/web/lib/capture-batch-worker.ts"
  - "packages/persistence/bin/monitor-prices.ts"
  - "packages/persistence/src/monitoring-db.ts"
  - "packages/web/test/affiliate-secret.test.mjs"
  - "packages/web/test/capture-process.test.mjs"
escopo_escrita:
  - "packages/web/lib/account-credential-resolver.ts" # Novo: serviço de resolução, validação e desacoplamento de credenciais por conta
  - "packages/web/lib/capture-dispatch.ts" # Atualizar: substituir trava fixa pela resolução segura de credencial da conta
  - "packages/persistence/bin/monitor-prices.ts" # Atualizar: suportar execução parametrizada por conta com credencial resolvida
  - "packages/web/test/account-credential-resolver.test.mjs" # Novo teste unitário e de fronteira de segurança
arquivos_protegidos:
  - "packages/web/lib/affiliate-secret.ts"
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/lib/account-context.ts"
contratos:
  - "C-01 (Identidade, membership e contexto de conta)"
  - "C-02 (Evidência canônica de preço e proveniência)"
  - "CF-01 (Compatibilidade e não vazamento de segredos)"
autorizacoes_remotas: []
aceites:
  - id: AC-14.1
    dado: "Uma conta com credenciais de marketplace cadastradas e cifradas em affiliate_secret"
    quando: "O AccountCredentialResolver for invocado para resolver as credenciais da conta para aquele marketplace"
    entao: "O segredo é carregado sob a RLS da conta, descriptografado com autenticação AAD e retornado em formato tipado pronto para o adapter."
  - id: AC-14.2
    dado: "Uma conta não-local que NÃO configurou credenciais para o marketplace solicitado"
    quando: "O despacho de captura ou monitoramento for solicitado"
    entao: "A operação é imediatamente rejeitada com erro 'account_credentials_missing', sem NUNCA utilizar as credenciais da conta 'local' como fallback."
  - id: AC-14.3
    dado: "Uma conta cujo status foi alterado para 'suspended'"
    quando: "A tentativa de resolução de credencial ocorrer"
    entao: "O resolver bloqueia imediatamente com erro 'account_suspended' e nenhum segredo é retornado."
  - id: AC-14.4
    dado: "Duas contas distintas A e B configuradas com credenciais diferentes"
    quando: "Capturas concorrentes ou sequenciais forem executadas"
    entao: "A execução de A utiliza estritamente as credenciais de A e a execução de B utiliza estritamente as credenciais de B, com isolamento comprovado em teste de regressão."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/account-credential-resolver.test.mjs"
    resultado_esperado: "Todos os testes de resolução, isolamento multicliente e fail-closed passam."
  - comando_ou_cenario: "node --test packages/web/test/affiliate-secret.test.mjs"
    resultado_esperado: "Testes de criptografia AES-256-GCM passam sem regressão."
  - comando_ou_cenario: "npm run test:capture-batch --prefix tools/editorial-tests"
    resultado_esperado: "Fluxo de lotes de captura passa com integridade."
risco_e_rollback: "Risco médio (lida com credenciais cifradas). Em caso de regressão, manter trava estrita de tenant 'local' e reverter capture-dispatch.ts e account-credential-resolver.ts."
```
