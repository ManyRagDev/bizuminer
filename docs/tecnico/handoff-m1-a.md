# Handoff M1-A — evidência do Mercado Livre

## Entrega

- `RawOffer` agora carrega `ratingStar`, `salesLabel` e `salesCount` aproximado quando o rótulo permite.
- O parser da página pública `/ofertas` lê o texto acessível da nota e o rótulo de vendas, preserva a faixa original e decodifica entidades HTML do título.
- `price_observation` ganhou colunas anuláveis por observação: `rating_star`, `sales_label`, `sales_count`.
- `PostgresStore`, `InMemoryStore`, ingestão e `DealRow` transportam a evidência até a vitrine.
- Cards exibem “Nota no Mercado Livre” e o rótulo de vendas apenas quando presentes.

## Estado de validação

- Captura: 72 testes passando.
- Persistência: 4 testes passando e typecheck passando.
- Web: typecheck passando.
- Migração criada em `packages/persistence/supabase/migrations/20260818204528_marketplace_evidence.sql`.
- Migração aplicada remotamente via Supabase MCP; registrada como `20260818213323_marketplace_evidence`.
- Limpeza de títulos aplicada como `decode_existing_titles`; varredura real de uma página persistiu evidência e o banco está sem entidades HTML cruas.

## Próximo passo obrigatório

Aplicar a migração com o papel owner do projeto Supabase e executar:

```text
node --env-file=../../.env bin/verify-marketplace-evidence.mjs
```

O script imprime as colunas e até cinco observações com `external_id`, nota, rótulo de vendas e `observed_at`.
