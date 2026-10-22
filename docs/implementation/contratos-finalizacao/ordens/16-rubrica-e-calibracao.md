# OS-16 — Rubrica Editorial V2, Ratificação de Política e Calibração E3

```yaml
id: OS-16
estado: PREPARADA
origem: EP-01 / EP-02 / EP-03 / OPEN-01 / OPEN-02 / OPEN-03 / CAPACIDADES-PENDENTES linhas 7, 8, 9
baseline: "main 43700c59 + OS-15 concluída"
objetivo: "Implementar a esteira editorial de Rubrica V2 e evidência canônica de preço, permitindo que a curadoria humana opere com ou sem IA (shadow mode), formalize a ratificação de versão de política editorial via registro auditável de aprovação, e opere evidência E3 com controle estrito de calibração sem inventar valores ou criar falsos positivos."
nao_objetivos:
  - "Não exigir 50 avaliadores humanos presenciais em ambiente de desenvolvimento."
  - "Não permitir promoção automática de política sem aprovação formal registrada."
  - "Não quebrar os decoders de avaliações históricas V1 da tabela editorial_assessment."
dependencias:
  - "OS-15 concluída"
escopo_leitura:
  - "packages/web/lib/rubric-contract.ts"
  - "packages/web/lib/rubric-db.ts"
  - "packages/web/lib/price-evidence.ts"
  - "packages/web/lib/opportunity-contract.ts"
  - "packages/web/lib/opportunity-db.ts"
  - "packages/web/app/admin/curadoria/actions.ts"
  - "packages/web/app/admin/curadoria/triage-control.tsx"
  - "tools/editorial-tests/canonical-price-evidence.test.ts"
  - "tools/editorial-tests/rubric-shadow-flow.test.ts"
escopo_escrita:
  - "packages/web/lib/rubric-db.ts" # Atualizar: implementar comando de ratificação de política com auditoria de versão e desacordo
  - "packages/web/lib/price-evidence.ts" # Atualizar: validar política E3 contra registro de calibração ativo
  - "packages/web/app/admin/curadoria/actions.ts" # Atualizar: actions de salvar avaliação humana V2 e ratificar política
  - "packages/web/test/rubric-policy-ratification.test.mjs" # Novo teste com cenários de ratificação, fallback E2 e shadow mode
arquivos_protegidos:
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/lib/curation-pipeline.ts"
contratos:
  - "C-02 (Evidência canônica de preço)"
  - "C-03 (Rubrica de qualidade, valor, oportunidade e apelo)"
autorizacoes_remotas: []
aceites:
  - id: AC-16.1
    dado: "Um curador humano avaliando uma oferta na interface administrativa"
    quando: "O curador salva a avaliação V2 sem acionar ou aguardar retorno da IA Gemini"
    entao: "A avaliação é persistida com dimensões estruturadas completas (Q, V, O, A), digest dos fatos observados e autoria vinculada à sua membership de conta."
  - id: AC-16.2
    dado: "Uma execução em modo sombra (shadow mode) onde a IA avalia a mesma oferta"
    quando: "A comparação entre humano e IA for gerada"
    entao: "As divergências dimensionais e scores são gravados para métricas de calibração sem que a sugestão da IA altere a decisão humana original."
  - id: AC-16.3
    dado: "Uma política editorial com histórico de avaliações prontas para ratificação"
    quando: "O responsável editorial aciona a ação de ratificar versão de política"
    entao: "O sistema exige identificação do aprovador, gera digest congelado dos critérios e registra o evento auditável, saindo de 'draft/shadow' para 'ratified'."
  - id: AC-16.4
    dado: "Uma oferta calculando projeção de preço canônico no nível E3"
    quando: "Não existe calibração ratificada vinculada para aquela janela e categoria"
    entao: "O cálculo degrada de forma segura e honesta para E2 ou E1, sem quebrar a renderização e sem inventar desconto inflado."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/rubric-policy-ratification.test.mjs"
    resultado_esperado: "Testes de ratificação, fallback gracioso de evidência e isolamento passam."
  - comando_ou_cenario: "npm run test:rubric --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de rubrica editorial passa sem regressão."
  - comando_ou_cenario: "npm run test:price-evidence --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de evidência canônica de preço passa com integridade."
risco_e_rollback: "Risco baixo. Em caso de problemas na avaliação V2, decoders preservam compatibilidade com V1."
```
