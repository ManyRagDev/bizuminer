# OS-18 — Onboarding Multicliente, Quotas Atômicas e Experimentos Pareados

```yaml
id: OS-18
estado: PREPARADA
origem: EP-09 / EP-12 / OPEN-07 / OPEN-11 / OPEN-12 / CAPACIDADES-PENDENTES linhas 14 e 15
baseline: "main 43700c59 + OS-17 concluída"
objetivo: "Concluir o fluxo ponta a ponta de onboarding de nova conta afiliada (convite -> ativação -> plano -> quotas atômicas), o enforcement imediato de suspensão em todos os subsistemas e o módulo de governança de experimentos de política com avaliação pareada e controle de versão transacional."
nao_objetivos:
  - "Não cobrar meios de pagamento reais ou emitir notas fiscais em ambiente de desenvolvimento."
  - "Não criar contas abertas ao público sem convite explícito."
  - "Não misturar dados entre contas de testes e a conta própria do operador."
dependencias:
  - "OS-17 concluída"
escopo_leitura:
  - "packages/web/lib/saas-onboarding-contract.ts"
  - "packages/web/lib/saas-onboarding-db.ts"
  - "packages/web/lib/saas-entitlement-db.ts"
  - "packages/web/lib/experiment-contract.ts"
  - "packages/web/lib/experiment-db.ts"
  - "tools/editorial-tests/saas-onboarding-flow.test.ts"
  - "tools/editorial-tests/metrics-experiment-flow.test.ts"
  - "tools/editorial-tests/entitlement-quota.test.ts"
escopo_escrita:
  - "packages/web/lib/saas-onboarding-db.ts" # Atualizar: transação atômica de criação de conta e associação de membership
  - "packages/web/lib/saas-entitlement-db.ts" # Atualizar: reserva atômica e liberação de quotas por plano
  - "packages/web/lib/experiment-db.ts" # Atualizar: avaliação pareada de experimentos e promoção transacional
  - "packages/web/test/onboarding-quota-experiment.test.mjs" # Novo teste com ciclo de vida completo de conta, quotas e experimento
arquivos_protegidos:
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/lib/auth-merge.ts"
contratos:
  - "C-01 (Identidade e contexto de conta)"
  - "C-08 (Experimentos de política e planos/quotas SaaS)"
autorizacoes_remotas: []
aceites:
  - id: AC-18.1
    dado: "Um usuário recebendo um token de convite válido emitido por platform_admin"
    quando: "O usuário aceita o convite na rota /convite"
    entao: "O sistema valida o token por hash, cria a affiliate_account, vincula a membership e inicializa o plano padrão de forma atômica sob RLS."
  - id: AC-18.2
    dado: "Uma conta ativa com limite de 10 campanhas mensais no plano contratado"
    quando: "A conta tenta criar a 11ª campanha"
    entao: "O sistema rejeita a operação com erro explícito de quota excedida ('quota_exceeded'), sem criar registros órfãos."
  - id: AC-18.3
    dado: "Uma conta suspensa administrativamente (status = 'suspended')"
    quando: "Qualquer comando privado ou tentativa de leitura for emitido"
    entao: "A autorização falha fechada imediatamente, revogando o acesso da sessão e impedindo novos disparos."
  - id: AC-18.4
    dado: "Um experimento de política com comparação pareada entre duas versões de política"
    quando: "A promoção da versão candidata for solicitada"
    entao: "O sistema valida que a metodologia estava congelada, que o número mínimo de pares foi atingido e que a promoção grava o evento de auditoria com capacidade de reversão (rollback)."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/onboarding-quota-experiment.test.mjs"
    resultado_esperado: "Testes de onboarding atômico, enforcement de quota, suspensão e experimentos passam."
  - comando_ou_cenario: "npm run test:onboarding --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de onboarding passa com sucesso."
  - comando_ou_cenario: "npm run test:entitlement --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de quotas e entitlements passa sem regressão."
  - comando_ou_cenario: "npm run test:experiment --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de governança de experimentos passa sem regressão."
risco_e_rollback: "Risco médio. O plano da conta própria da casa ('local') tem quota ilimitada permanente garantida por teste de regressão."
```
