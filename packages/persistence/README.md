# @ofertas/persistence

Persistência e ingestão da captura (Phase 2 do [roadmap](../../docs/tecnico/roadmap.md)).

**Banco: Supabase (Postgres) do projeto Brincar/PostSpark (`spbuwcwmxlycchuwhfir`), schema dedicado `garimpa`.** Sem Prisma — SQL puro versionado via `supabase db push`.

- `supabase/migrations/` — schema inicial: `garimpa.product`, `price_observation`, `capture_run`, `publication`, `click_event` (todas com `tenant_id`; as duas últimas existem desde já porque a página web da Phase 3 grava nelas). Stubs `*_remote_stub.sql` = histórico pré-existente do projeto, já aplicado.
- `src/store.ts` — interface `OfferStore` + `InMemoryStore` (testes/CLI). Implementação Postgres entra via connection string (`DATABASE_URL` / pooler do Supabase).
- `src/ingest.ts` — `sweep(adapter, cred, store, opts, ctx)`: consome `streamOffers`, faz upsert de produto, insere observação de preço, conta novos/mudanças e registra `capture_run`. **Zero itens = run de erro** (scraper quebra em silêncio). Quando recebe uma política de descoberta, limita apenas candidatos novos de famílias saturadas; produtos já conhecidos sempre são reobservados.
- `src/capture-plan.ts` — plano category-first: 8 intenções dirigidas + 2 exploratórias, uma `capture_run` auditável por consulta e continuidade mesmo quando uma consulta falha.
- `src/product-family.ts` — classificador determinístico conservador usado pelo controle de saturação. Ausência de pista retorna `undefined`, nunca uma família genérica. É a **fonte única** da família: a captura persiste `family_key/label/method/version` no produto; nada de dicionário espelhado em SQL.
- `bin/sweep.ts` — varredura ao vivo de `/ofertas` com resumo e Top 10.
- `bin/sweep-aliexpress.ts` / `bin/sweep-shopee.ts` — sem `--keyword`, executam o plano category-first; `--dry-run` mostra as consultas sem tocar em API ou banco.
- `bin/verify-editorial-context.ts` — verificação derivada do contexto editorial (M4-D): integridade da família, snapshot obrigatório nas decisões humanas, grupos/lotes que nunca cruzam tenant e "Depois" que não decide nada.
- `bin/backfill-family.ts` — classifica o catálogo existente sem família (mesmo dicionário do TS); `--apply` escreve, sem `--apply` é modo sombra.

```bash
npm test                                            # testes
npx supabase db push --linked --yes                 # aplicar migrations novas
node --experimental-strip-types bin/sweep.ts        # varredura ao vivo
node --experimental-strip-types bin/sweep-aliexpress.ts --dry-run
node --experimental-strip-types bin/sweep-shopee.ts --mode directed
npm run verify:capture-plan                         # verifica rodadas reais persistidas
npm run verify:editorial-context                    # contexto editorial (migration M4-D aplicada)
npm run backfill:family                             # modo sombra; --apply para gravar
```

## Pendências

- Implementação `PostgresStore` (connection string do Supabase; IDs: usar `gen_random_uuid()` do banco)
- Unescape de entidades HTML no título (`&#x27;` etc.) — detalhe do parser de Ofertas
