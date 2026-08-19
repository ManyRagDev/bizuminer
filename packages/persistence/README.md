# @ofertas/persistence

Persistência e ingestão da captura (Phase 2 do [roadmap](../../docs/tecnico/roadmap.md)).

**Banco: Supabase (Postgres) do projeto Brincar/PostSpark (`spbuwcwmxlycchuwhfir`), schema dedicado `garimpa`.** Sem Prisma — SQL puro versionado via `supabase db push`.

- `supabase/migrations/` — schema inicial: `garimpa.product`, `price_observation`, `capture_run`, `publication`, `click_event` (todas com `tenant_id`; as duas últimas existem desde já porque a página web da Phase 3 grava nelas). Stubs `*_remote_stub.sql` = histórico pré-existente do projeto, já aplicado.
- `src/store.ts` — interface `OfferStore` + `InMemoryStore` (testes/CLI). Implementação Postgres entra via connection string (`DATABASE_URL` / pooler do Supabase).
- `src/ingest.ts` — `sweep(adapter, cred, store, opts, ctx)`: consome `streamOffers`, faz upsert de produto, insere observação de preço, conta novos/mudanças e registra `capture_run`. **Zero itens = run de erro** (scraper quebra em silêncio).
- `bin/sweep.ts` — varredura ao vivo de `/ofertas` com resumo e Top 10.

```bash
npm test                                            # testes
npx supabase db push --linked --yes                 # aplicar migrations novas
node --experimental-strip-types bin/sweep.ts        # varredura ao vivo
```

## Pendências

- Implementação `PostgresStore` (connection string do Supabase; IDs: usar `gen_random_uuid()` do banco)
- Unescape de entidades HTML no título (`&#x27;` etc.) — detalhe do parser de Ofertas

