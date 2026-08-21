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
