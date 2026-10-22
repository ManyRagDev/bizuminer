# OS-13 — Adapters de Importação de Comissões e Relatórios de Afiliados

```yaml
id: OS-13
estado: PREPARADA
origem: EP-08B / OPEN-05 / CAPACIDADES-PENDENTES linha 10
baseline: "main 43700c59 + alterações locais auditadas e build verde"
objetivo: "Implementar adapters para parsing e normalização de relatórios de comissões de múltiplos marketplaces (Shopee, AliExpress, Mercado Livre e formato Canônico interno), com detecção de headers, tratamento de moedas e integração ao ledger financeiro idempotente."
nao_objetivos:
  - "Não inventar vendas sintéticas no banco de produção."
  - "Não alterar a estrutura contábil da tabela commercial_financial_ledger."
  - "Não integrar APIs externas de ERP ou bancos bancários nesta etapa."
dependencias:
  - "OS-10 concluída (núcleo implantado e estável)"
escopo_leitura:
  - "packages/web/lib/commission-import-contract.ts"
  - "packages/web/lib/commercial-financial-contract.ts"
  - "packages/web/lib/commercial-financial-db.ts"
  - "packages/web/app/admin/financeiro/page.tsx"
  - "packages/web/test/commission-import-contract.test.mjs"
  - "tools/editorial-tests/commercial-financial-flow.test.ts"
escopo_escrita:
  - "packages/web/lib/commission-import-adapters.ts" # Novo: adapters especializados para Shopee, AliExpress e Mercado Livre
  - "packages/web/lib/commission-import-contract.ts" # Atualizar: expor interface de detecção e dispatch de adapters
  - "packages/web/test/commission-import-adapters.test.mjs" # Novo teste com fixtures sintéticas dos relatórios
  - "packages/web/app/admin/financeiro/page.tsx" # Atualizar: exibir marketplace detectado no preview e permitir seleção manual se necessário
arquivos_protegidos:
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/lib/commercial-financial-db.ts"
  - "packages/persistence/src/store.ts"
contratos:
  - "C-07 (Financeiro, ledger append-only e atribuição)"
  - "CF-03 (Integração funcional e invariância do digest)"
autorizacoes_remotas: []
aceites:
  - id: AC-13.1
    dado: "Um arquivo CSV ou texto colado correspondente a relatórios de afiliados da Shopee, AliExpress, Mercado Livre ou Canônico"
    quando: "O método parseMarketplaceReport for executado ou o usuário colar na tela /admin/financeiro"
    entao: "O sistema detecta automaticamente o formato através dos cabeçalhos, ou usa o formato explicitamente selecionado, mapeando para CanonicalImportRow[] sem falha."
  - id: AC-13.2
    dado: "Linhas com diferentes moedas (BRL, USD) ou valores com vírgula/ponto"
    quando: "A normalização de valores for realizada"
    entao: "Os valores são convertidos rigorosamente para centavos inteiros (orderValueCents e commissionCents), preservando o código ISO da moeda e o status de conversão (pending, confirmed, rejected)."
  - id: AC-13.3
    dado: "Um relatório contendo linhas com dados ausentes ou inválidos misturadas com linhas perfeitas"
    quando: "O processamento de importação for submetido"
    entao: "As linhas válidas geram preview de importação com digest invariante à ordem das linhas; as inválidas são categorizadas como review_required ou errors com linha e motivo descritos, sem descartar o lote."
  - id: AC-13.4
    dado: "A confirmação de commit do preview no painel /admin/financeiro"
    quando: "O usuário seleciona as linhas e confirma o commit"
    entao: "O ledger registra as conversões e eventos de comissão idempotentemente sem duplicar lançamentos prévios."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/commission-import-adapters.test.mjs"
    resultado_esperado: "100% dos testes de adapters (Shopee, AliExpress, Mercado Livre, Canônico) passam."
  - comando_ou_cenario: "node --test packages/web/test/commission-import-contract.test.mjs"
    resultado_esperado: "Testes contratuais existentes de digest e normalização passam sem regressão."
  - comando_ou_cenario: "npm run test:financial --prefix tools/editorial-tests"
    resultado_esperado: "Fluxo financeiro e ledger passam com sucesso."
risco_e_rollback: "Risco baixo (código em lib/web e UI). Em caso de falha, reverter alterações em commission-import-adapters.ts e nos arquivos de teste."
```
