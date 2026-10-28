# Aplicar migrations do Supabase

O projeto possui `.mcp.json` com o MCP Supabase escopado ao projeto `spbuwcwmxlycchuwhfir` e somente aos grupos `database`, `docs` e `debugging`. A migration M1-A já foi aplicada e registrada remotamente como `20260818213323_marketplace_evidence`.

Após recarregar a sessão do agente, use o MCP `execute_sql` com o conteúdo de:

`packages/persistence/supabase/migrations/20260818204528_marketplace_evidence.sql`

Depois valide com:

```sql
select column_name
from information_schema.columns
where table_schema = 'garimpa'
  and table_name = 'price_observation'
  and column_name in ('rating_star', 'sales_label', 'sales_count')
order by column_name;
```

O caminho CLI continua disponível para uma conexão owner:

```text
npx supabase db push --db-url <DATABASE_URL_OWNER_PERCENT_ENCODED>
```

Não use a `DATABASE_URL` da aplicação (`garimpa_app`) para DDL; ela não é proprietária da tabela.

## Histórico de aplicações remotas via MCP

- `20260818213323_marketplace_evidence` (M1-A)
- `garimpa_subscriber_repair` (19/08/2026) — cria `garimpa.subscriber`, que existia só como arquivo local desde 17/08; corresponde a `20260819180000_garimpa_subscriber_repair.sql`
- `garimpa_member_area` (19/08/2026) — `app_user`, `favorite`, `price_watch`, `buyer_profile`; corresponde a `20260819181000_garimpa_member_area.sql`

## Experiência do comprador — produção em 28/10/2026

Aplicadas pelo MCP no projeto `spbuwcwmxlycchuwhfir`, após conferir o histórico. O MCP atribuiu versões remotas diferentes dos timestamps dos arquivos locais:

| Arquivo local | Versão remota | Nome |
|---|---|---|
| `20261027030237_compose_homepage_editions.sql` | `20261027110848` | `compose_homepage_editions` (já instalada; não reaplicada) |
| `20261028041629_durable_product_presentation.sql` | `20261028230124` | `durable_product_presentation` |
| `20261028041849_watch_comparable_baseline.sql` | `20261028230135` | `watch_comparable_baseline` |
| `20261028042010_public_price_history_context.sql` | `20261028230150` | `public_price_history_context` |

As três aplicações usaram `lock_timeout=5s` e `statement_timeout=60s`. Foram conferidos campos de acompanhamento, funções públicas, triggers de invalidação e permissões; `anon` continua sem execução da projeção editorial e o runtime público não ganhou leitura direta das avaliações.

A aplicação do esquema não publica textos editoriais nem preenche moedas/configurações antigas por suposição. A simulação da primeira edição retornou zero produtos aptos, por isso ela não foi inicializada: o catálogo permanece disponível pelo caminho de transição. Antes de inicializar, publicar uma seleção válida e conferir `refresh-homepage.ts --tenant local --initialize` sem `--execute`.

Em futuras aplicações, conferir nomes e versões deste mapeamento; não reaplicar os arquivos só porque os timestamps locais diferem do histórico remoto.
